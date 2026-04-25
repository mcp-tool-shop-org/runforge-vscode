/**
 * FT-BRIDGE-004a: Orphan banner extension across observability commands.
 *
 * Stage C (browse-runs) shipped the picker overlay + per-orphan humanized
 * recovery copy. FT-BRIDGE-004a extends a count-shaped pre-action banner to
 * the SEVEN observability commands that did NOT have it yet:
 *
 *   - runforge.openLatestMetadata        → getLatestRunMetadataSafe()
 *   - runforge.inspectArtifact           → inspectArtifact()
 *   - runforge.exportRunMarkdown         → exportLatestRunAsMarkdown()
 *   - runforge.viewInterpretabilityIndex → viewLatestInterpretabilityIndex()
 *   - runforge.viewLinearCoefficients    → viewLatestLinearCoefficients()
 *   - runforge.viewFeatureImportance     → viewLatestFeatureImportance()
 *   - runforge.viewMetricsV1             → viewLatestMetricsV1()
 *
 * For each command we verify two cases:
 *   (a) orphans absent  → showWarningMessage NOT called with the FT banner
 *   (b) orphans present → showWarningMessage called once with the banner copy
 *
 * Strategy: mock `listOrphanedRuns` (the canonical Stage C reader) so each
 * test controls the orphan list directly without touching the filesystem.
 * Mock `vscode.window.showWarningMessage` to assert call shape.
 *
 * NOTE: browse-runs-command.ts is NOT in scope here — it shipped its own
 * orphan overlay in Stage C and is verified by its own test file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IndexOrphanMarker } from '../src/types.js';
import type { OrphanScan } from '../src/observability/orphan-markers.js';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
  showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
  showTextDocument: vi.fn(() => Promise.resolve(undefined)),
  listOrphanedRuns: vi.fn<(workspaceRoot: string) => Promise<OrphanScan>>(),
}));

vi.mock('vscode', () => ({
  window: {
    showWarningMessage: mocks.showWarningMessage,
    showInformationMessage: mocks.showInformationMessage,
    showErrorMessage: mocks.showErrorMessage,
    showTextDocument: mocks.showTextDocument,
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      clear: () => {},
      dispose: () => {},
    }),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/fake/workspace' } }],
    openTextDocument: () => Promise.resolve({}),
  },
  ViewColumn: { Active: 1, Beside: 2 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

vi.mock('../src/observability/orphan-markers.js', () => ({
  listOrphanedRuns: mocks.listOrphanedRuns,
}));

// open-summary is imported by metadata-command — keep its side effects out of
// these unit tests.
vi.mock('../src/observability/open-summary.js', () => ({
  openJsonDocument: () => Promise.resolve(undefined),
  openMarkdownSummary: () => Promise.resolve(undefined),
}));

// fs-safe.getLatestRunDir is used by all five "view latest *" commands and by
// export-markdown. Default to "no run dir" so the commands short-circuit
// AFTER the orphan check (which is what we're asserting anyway).
vi.mock('../src/observability/fs-safe.js', () => ({
  getLatestRunDir: () => null,
  safeReadIndex: () => Promise.resolve({ ok: false, error: { code: 'INDEX_NOT_FOUND', message: 'no index' } }),
  safeReadRunJson: () => Promise.resolve({ ok: false, error: { code: 'RUN_JSON_NOT_FOUND', message: 'no run.json' } }),
  getActionableMessage: (_e: unknown) => 'no index',
}));

// python-runner is imported transitively via artifact-inspect-command. Stub
// pythonSpawnEnv so importing the module doesn't pull in the real runner.
vi.mock('../src/runner/python-runner.js', () => ({
  pythonSpawnEnv: () => ({}),
}));

// ── Imports under test ───────────────────────────────────────────────────────

import {
  getLatestRunMetadataSafe,
  surfaceOrphanBannerIfAny,
} from '../src/observability/metadata-command.js';
import {
  inspectArtifact,
  surfaceArtifactInspectOrphanBanner,
} from '../src/observability/artifact-inspect-command.js';
import { exportLatestRunAsMarkdown } from '../src/observability/export-markdown-command.js';
import { viewLatestInterpretabilityIndex } from '../src/observability/interpretability-index-command.js';
import { viewLatestLinearCoefficients } from '../src/observability/linear-coefficients-command.js';
import { viewLatestFeatureImportance } from '../src/observability/feature-importance-command.js';
import { viewLatestMetricsV1 } from '../src/observability/metrics-v1-command.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a valid `IndexOrphanMarker` payload conforming to the v1.0.0 contract. */
function makeMarker(runId = 'run-orphan-001'): IndexOrphanMarker {
  return {
    schema_version: 'index-orphan.v1.0.0',
    run_id: runId,
    run_dir: `.ml/runs/${runId}`,
    written_at: '2026-04-25T12:00:00Z',
    error: { type: 'PermissionError', message: 'Permission denied' },
    index_path: '.ml/outputs/index.json',
  };
}

/** Canonical FT-BRIDGE-004a banner copy. Single source of truth for asserts. */
function expectedBanner(count: number): string {
  return (
    `${count} run(s) saved but not indexed. ` +
    `Run "RunForge: Recover Index" to add them to the run list, ` +
    `or use "RunForge: Browse Runs" to open them directly.`
  );
}

/**
 * Count calls to showWarningMessage that match the FT-BRIDGE-004a banner
 * shape (starts with "<n> run(s) saved but not indexed.").
 *
 * Other warning surfaces (browse-runs's per-orphan humanization, missing-
 * artifact warnings, etc.) emit different text and must not affect this count.
 */
function ftBannerCalls(): string[] {
  return mocks.showWarningMessage.mock.calls
    .map((c) => c[0] as string)
    .filter((s) => /^\d+ run\(s\) saved but not indexed\./.test(s));
}

beforeEach(() => {
  mocks.showWarningMessage.mockClear();
  mocks.showInformationMessage.mockClear();
  mocks.showErrorMessage.mockClear();
  mocks.showTextDocument.mockClear();
  mocks.listOrphanedRuns.mockReset();
});

// ── viewLatestMetricsV1 (runforge.viewMetricsV1) ────────────────────────────

describe('viewLatestMetricsV1 — orphan banner', () => {
  it('does NOT surface the FT banner when no orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({ orphans: [], skipped: [] });
    await viewLatestMetricsV1();
    expect(ftBannerCalls()).toHaveLength(0);
  });

  it('surfaces the FT banner exactly once when orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('m1'), makeMarker('m2')],
      skipped: [],
    });
    await viewLatestMetricsV1();
    const calls = ftBannerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedBanner(2));
  });
});

// ── viewLatestFeatureImportance (runforge.viewFeatureImportance) ────────────

describe('viewLatestFeatureImportance — orphan banner', () => {
  it('does NOT surface the FT banner when no orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({ orphans: [], skipped: [] });
    await viewLatestFeatureImportance();
    expect(ftBannerCalls()).toHaveLength(0);
  });

  it('surfaces the FT banner exactly once when orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('fi1')],
      skipped: [],
    });
    await viewLatestFeatureImportance();
    const calls = ftBannerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedBanner(1));
  });
});

// ── viewLatestLinearCoefficients (runforge.viewLinearCoefficients) ──────────

describe('viewLatestLinearCoefficients — orphan banner', () => {
  it('does NOT surface the FT banner when no orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({ orphans: [], skipped: [] });
    await viewLatestLinearCoefficients();
    expect(ftBannerCalls()).toHaveLength(0);
  });

  it('surfaces the FT banner exactly once when orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('lc1'), makeMarker('lc2'), makeMarker('lc3')],
      skipped: [],
    });
    await viewLatestLinearCoefficients();
    const calls = ftBannerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedBanner(3));
  });
});

// ── viewLatestInterpretabilityIndex (runforge.viewInterpretabilityIndex) ────

describe('viewLatestInterpretabilityIndex — orphan banner', () => {
  it('does NOT surface the FT banner when no orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({ orphans: [], skipped: [] });
    await viewLatestInterpretabilityIndex();
    expect(ftBannerCalls()).toHaveLength(0);
  });

  it('surfaces the FT banner exactly once when orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('ii1')],
      skipped: [],
    });
    await viewLatestInterpretabilityIndex();
    const calls = ftBannerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedBanner(1));
  });
});

// ── exportLatestRunAsMarkdown (runforge.exportRunMarkdown) ──────────────────

describe('exportLatestRunAsMarkdown — orphan banner', () => {
  it('does NOT surface the FT banner when no orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({ orphans: [], skipped: [] });
    await exportLatestRunAsMarkdown();
    expect(ftBannerCalls()).toHaveLength(0);
  });

  it('surfaces the FT banner exactly once even though it calls getLatestRunMetadataSafe internally', async () => {
    // The internal getLatestRunMetadataSafe call is invoked with
    // { surfaceOrphanBanner: false } so the user only sees ONE banner per
    // invocation — that's the load-bearing behavior under test here.
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('em1'), makeMarker('em2')],
      skipped: [],
    });
    await exportLatestRunAsMarkdown();
    const calls = ftBannerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedBanner(2));
  });
});

// ── getLatestRunMetadataSafe (runforge.openLatestMetadata) ──────────────────

describe('getLatestRunMetadataSafe — orphan banner', () => {
  it('does NOT surface the FT banner when no orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({ orphans: [], skipped: [] });
    await getLatestRunMetadataSafe('/fake/workspace');
    expect(ftBannerCalls()).toHaveLength(0);
  });

  it('surfaces the FT banner exactly once when orphans exist (default surface=on)', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('mt1')],
      skipped: [],
    });
    await getLatestRunMetadataSafe('/fake/workspace');
    const calls = ftBannerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedBanner(1));
  });

  it('honors surfaceOrphanBanner=false (caller already showed it)', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('mt-suppressed')],
      skipped: [],
    });
    await getLatestRunMetadataSafe('/fake/workspace', { surfaceOrphanBanner: false });
    expect(ftBannerCalls()).toHaveLength(0);
  });
});

// ── inspectArtifact (runforge.inspectArtifact) ──────────────────────────────
//
// We do NOT spawn Python in these tests — the orphan-banner pre-check runs
// BEFORE the `new Promise` body that shells out, so we can race a rejection
// from the spawn (or stub it) and still observe the banner. The simplest
// approach: assert against `surfaceArtifactInspectOrphanBanner` directly
// (helper exposed for exactly this reason) AND against the gate inside
// `inspectArtifact()` via a never-awaited promise.

describe('inspectArtifact — orphan banner (helper)', () => {
  it('surfaceArtifactInspectOrphanBanner does NOT fire when no orphans', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({ orphans: [], skipped: [] });
    await surfaceArtifactInspectOrphanBanner('/fake/workspace');
    expect(ftBannerCalls()).toHaveLength(0);
  });

  it('surfaceArtifactInspectOrphanBanner fires once when orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('ia1'), makeMarker('ia2')],
      skipped: [],
    });
    await surfaceArtifactInspectOrphanBanner('/fake/workspace');
    const calls = ftBannerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedBanner(2));
  });
});

describe('inspectArtifact — orphan banner (integrated, basePath provided)', () => {
  it('does NOT surface the FT banner when no orphans exist', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({ orphans: [], skipped: [] });
    // Don't await the full call — the inner spawn would try to run python.
    // We only need the synchronous portion BEFORE the `new Promise` to run,
    // which it does because of the awaited orphan-check at the top.
    const promise = inspectArtifact('python', '/runner', '/fake/workspace/model.pkl', '/fake/workspace');
    // Allow the orphan check to complete (microtask drain).
    await new Promise((r) => setImmediate(r));
    expect(ftBannerCalls()).toHaveLength(0);
    // Don't wait for the spawn to settle; the test process tolerates orphaned promises.
    promise.catch(() => {});
  });

  it('surfaces the FT banner exactly once when orphans exist (basePath provided)', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('ia-int-1')],
      skipped: [],
    });
    const promise = inspectArtifact('python', '/runner', '/fake/workspace/model.pkl', '/fake/workspace');
    await new Promise((r) => setImmediate(r));
    const calls = ftBannerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(expectedBanner(1));
    promise.catch(() => {});
  });

  it('honors surfaceOrphanBanner=false even when basePath is provided', async () => {
    mocks.listOrphanedRuns.mockResolvedValue({
      orphans: [makeMarker('ia-int-suppressed')],
      skipped: [],
    });
    const promise = inspectArtifact(
      'python',
      '/runner',
      '/fake/workspace/model.pkl',
      '/fake/workspace',
      { surfaceOrphanBanner: false }
    );
    await new Promise((r) => setImmediate(r));
    expect(ftBannerCalls()).toHaveLength(0);
    promise.catch(() => {});
  });
});
