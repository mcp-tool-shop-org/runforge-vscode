/**
 * Workspace-trust guard for Python subprocess spawn (FT-BACK-005, Phase 4 Wave 3).
 *
 * Per docs/TRUST_MODEL.md, RunForge spawns a Python subprocess that loads a
 * dataset and writes artifacts under `.ml/`. Both surfaces are gated on
 * VS Code's workspace-trust state — untrusted workspaces never reach
 * `spawnRunner`, and the user gets an actionable error pointing at the
 * standard "Trust this Workspace" affordances.
 *
 * Preload 3 (production call chain): tests invoke the production
 * `executeRun` directly. The trust check + early-return + error surfacing
 * lives in production code; tests mock only the boundary
 * (`vscode.workspace.isTrusted`) plus the spawn boundary (`spawnRunner`)
 * so they don't actually launch Python in a vitest worker.
 *
 * Per CLAUDE.md verification doctrine: vscode.workspace.isTrusted is the
 * single boundary that determines whether the trust check fires.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted stubs: declared via vi.hoisted so they're initialized before the
// vi.mock factories below run (vi.mock is hoisted above imports).
const {
  isTrustedRef,
  showErrorMessageMock,
  showWarningMessageMock,
  showInformationMessageMock,
  appendLineMock,
  spawnRunnerMock,
  checkPythonMock,
  detectGpuMock,
} = vi.hoisted(() => {
  // Mutable holder so individual tests can flip isTrusted before invoking
  // executeRun without re-mocking the whole module.
  const ref = { current: true };
  return {
    isTrustedRef: ref,
    showErrorMessageMock: vi.fn(() => Promise.resolve(undefined)),
    showWarningMessageMock: vi.fn(() => Promise.resolve(undefined)),
    showInformationMessageMock: vi.fn(() => Promise.resolve(undefined)),
    appendLineMock: vi.fn(() => {}),
    spawnRunnerMock: vi.fn(),
    checkPythonMock: vi.fn(() =>
      Promise.resolve({ available: false, error: 'Python not found (test stub)' })
    ),
    detectGpuMock: vi.fn(() =>
      Promise.resolve({
        cuda_available: false,
        total_vram: 0,
        free_vram: 0,
        detection_method: 'none' as const,
        status: 'CPU only (test stub)',
      })
    ),
  };
});

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: appendLineMock,
      show: () => {},
      dispose: () => {},
      clear: () => {},
    }),
    showWarningMessage: showWarningMessageMock,
    showErrorMessage: showErrorMessageMock,
    showInformationMessage: showInformationMessageMock,
  },
  workspace: {
    // Property descriptor so `vscode.workspace.isTrusted` reads the live
    // value of `isTrustedRef.current` rather than capturing a snapshot at
    // mock-construction time. This is the pattern recommended in the
    // FT-BACK-005 brief for flipping the boundary between tests.
    get isTrusted() {
      return isTrustedRef.current;
    },
    getConfiguration: () => ({
      get: <T,>(_key: string, defaultValue?: T) => defaultValue,
    }),
  },
  commands: {
    executeCommand: () => Promise.resolve(undefined),
  },
}));

// Mock the python-runner boundary so a `trust=true` test can verify
// spawnRunner is reached without actually launching Python in the worker.
// We let `checkPython` fail fast (Python not found) so the run aborts
// AFTER the trust check passes but before spawnRunner is invoked — that
// asymmetry is fine for the Wave-3 acceptance: trust gate behavior is
// what's under test, not the downstream pipeline.
vi.mock('../src/runner/python-runner.js', () => ({
  checkPython: checkPythonMock,
  spawnRunner: spawnRunnerMock,
}));

// Mock GPU probe so we don't shell out during the "trusted" path.
vi.mock('../src/runner/gpu-probe.js', () => ({
  detectGpu: detectGpuMock,
  selectDevice: () => ({ device: 'cpu', reason: 'CPU only (test stub)' }),
  getCpuFallbackMessage: () => 'CPU only (test stub)',
  formatBytes: (b: number) => `${b} B`,
}));

import {
  executeRun,
  WORKSPACE_NOT_TRUSTED_MESSAGE,
  WORKSPACE_NOT_TRUSTED_RECOVERY_HINT,
} from '../src/runner/run-manager.js';

describe('FT-BACK-005 — workspace-trust guard for Python subprocess spawn', () => {
  beforeEach(() => {
    showErrorMessageMock.mockClear();
    showWarningMessageMock.mockClear();
    showInformationMessageMock.mockClear();
    appendLineMock.mockClear();
    spawnRunnerMock.mockClear();
    checkPythonMock.mockClear();
    detectGpuMock.mockClear();
    // Reset to trusted by default — each test that needs untrusted flips it.
    isTrustedRef.current = true;
  });

  afterEach(() => {
    // Belt-and-suspenders: leave the world trusted for the next test file.
    isTrustedRef.current = true;
  });

  describe('isTrusted=false (untrusted workspace)', () => {
    it('does NOT call spawnRunner', async () => {
      isTrustedRef.current = false;

      await executeRun('/fake/workspace', 'std-train', 'untrusted-test');

      expect(spawnRunnerMock).not.toHaveBeenCalled();
    });

    it('does NOT call checkPython (gate fires before any pipeline work)', async () => {
      isTrustedRef.current = false;

      await executeRun('/fake/workspace', 'std-train', 'untrusted-test');

      // Trust gate is the FIRST thing — no python check, no GPU probe.
      expect(checkPythonMock).not.toHaveBeenCalled();
      expect(detectGpuMock).not.toHaveBeenCalled();
    });

    it('surfaces the canonical actionable error message via showErrorMessage', async () => {
      isTrustedRef.current = false;

      await executeRun('/fake/workspace', 'std-train', 'untrusted-test');

      expect(showErrorMessageMock).toHaveBeenCalledTimes(1);
      const surfacedMessage = showErrorMessageMock.mock.calls[0][0];
      expect(surfacedMessage).toBe(WORKSPACE_NOT_TRUSTED_MESSAGE);
    });

    it('actionable text contains the canonical humanization-lens phrases', async () => {
      isTrustedRef.current = false;

      await executeRun('/fake/workspace', 'std-train', 'untrusted-test');

      const surfacedMessage = showErrorMessageMock.mock.calls[0][0] as string;
      // Per FT-BACK-005 Preload 1 — copy must point users at VS Code's
      // standard workspace-trust affordances, not raise a raw permission
      // error.
      expect(surfacedMessage).toContain('This workspace is restricted');
      expect(surfacedMessage).toContain("Trust this Workspace");
      expect(surfacedMessage).toContain('workspace trust banner');
      expect(surfacedMessage).toContain('trust badge in the status bar');
    });

    it('canonical recovery hint is exported and references VS Code trust UI', () => {
      // Recovery hint is a separate constant so command-layer error
      // formatters can render hint and message independently. Verify the
      // exported constant carries the expected guidance.
      expect(WORKSPACE_NOT_TRUSTED_RECOVERY_HINT).toContain(
        "VS Code's workspace trust UI"
      );
      expect(WORKSPACE_NOT_TRUSTED_RECOVERY_HINT).toContain('re-run training');
    });

    it('returns early without throwing (executeRun is void; reject not used)', async () => {
      isTrustedRef.current = false;

      // Should resolve, not reject. If the trust gate threw instead of
      // returning, this `await` would throw.
      await expect(
        executeRun('/fake/workspace', 'std-train', 'untrusted-test')
      ).resolves.toBeUndefined();
    });
  });

  describe('isTrusted=true (trusted workspace)', () => {
    it('passes the trust gate and reaches checkPython', async () => {
      isTrustedRef.current = true;

      await executeRun('/fake/workspace', 'std-train', 'trusted-test');

      // Gate passed → pipeline began. We stub checkPython to fail fast so
      // we don't actually spawn Python; the contract verified here is
      // purely: gate did not block.
      expect(checkPythonMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT surface the workspace-not-trusted error', async () => {
      isTrustedRef.current = true;

      await executeRun('/fake/workspace', 'std-train', 'trusted-test');

      // showErrorMessage may fire later (we stub checkPython to fail) but
      // the canonical untrusted message must NEVER be the surfaced text.
      const allShownMessages = showErrorMessageMock.mock.calls.map(
        (call) => call[0]
      );
      expect(allShownMessages).not.toContain(WORKSPACE_NOT_TRUSTED_MESSAGE);
    });
  });
});
