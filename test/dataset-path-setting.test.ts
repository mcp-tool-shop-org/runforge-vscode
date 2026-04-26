/**
 * Dataset path setting tests (Wave 3a — Bridge F-001 path (a)).
 *
 * Per the D1 implementation contract for AM-FE:
 *  - `runforge.datasetPath` set + non-empty + file does NOT exist →
 *    abort with the canonical actionable error, no spawn.
 *  - set + non-empty + file exists → setting flows into spawn as
 *    `dataset_path` (mirror of caller-passed datasetPath param).
 *  - unset / empty string → fall through to existing behavior (no abort,
 *    spawn proceeds with undefined dataset_path so the file picker / env
 *    var fallback still works).
 *
 * Loss-of-fallback is the failure mode being guarded against.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  isTrustedRef,
  configRef,
  showErrorMessageMock,
  showWarningMessageMock,
  showInformationMessageMock,
  appendLineMock,
  spawnRunnerMock,
  checkPythonMock,
  detectGpuMock,
} = vi.hoisted(() => {
  const trusted = { current: true };
  // Mutable holder for getConfiguration().get(key, default) responses.
  const config = {
    pythonPath: 'python',
    modelFamily: 'logistic_regression',
    profile: '',
    datasetPath: '',
    mlRunnerModule: 'ml_runner',
  } as Record<string, string>;
  return {
    isTrustedRef: trusted,
    configRef: config,
    showErrorMessageMock: vi.fn(() => Promise.resolve(undefined)),
    showWarningMessageMock: vi.fn(() => Promise.resolve(undefined)),
    showInformationMessageMock: vi.fn(() => Promise.resolve(undefined)),
    appendLineMock: vi.fn(() => {}),
    spawnRunnerMock: vi.fn(),
    checkPythonMock: vi.fn(() =>
      // Fail fast after the dataset gate so we don't actually spawn Python
      // in the worker. Gate behavior is what's under test.
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
    createStatusBarItem: () => ({
      name: '',
      text: '',
      command: '',
      tooltip: '',
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    showOpenDialog: () => Promise.resolve(undefined),
    showWarningMessage: showWarningMessageMock,
    showErrorMessage: showErrorMessageMock,
    showInformationMessage: showInformationMessageMock,
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    get isTrusted() {
      return isTrustedRef.current;
    },
    getConfiguration: () => ({
      get: <T,>(key: string, defaultValue?: T) => {
        const v = configRef[key];
        return v !== undefined ? (v as unknown as T) : defaultValue;
      },
      update: () => Promise.resolve(undefined),
    }),
  },
  commands: {
    executeCommand: () => Promise.resolve(undefined),
  },
}));

vi.mock('../src/runner/python-runner.js', () => ({
  checkPython: checkPythonMock,
  spawnRunner: spawnRunnerMock,
}));

vi.mock('../src/runner/gpu-probe.js', () => ({
  detectGpu: detectGpuMock,
  selectDevice: () => ({ device: 'cpu', reason: 'CPU only (test stub)' }),
  getCpuFallbackMessage: () => 'CPU only (test stub)',
  formatBytes: (b: number) => `${b} B`,
}));

import {
  executeRun,
  buildDatasetNotFoundMessage,
} from '../src/runner/run-manager.js';

describe('Wave 3a — runforge.datasetPath setting (Bridge F-001 path (a))', () => {
  beforeEach(() => {
    showErrorMessageMock.mockClear();
    showWarningMessageMock.mockClear();
    showInformationMessageMock.mockClear();
    appendLineMock.mockClear();
    spawnRunnerMock.mockClear();
    checkPythonMock.mockClear();
    detectGpuMock.mockClear();
    isTrustedRef.current = true;
    configRef.datasetPath = '';
  });

  afterEach(() => {
    isTrustedRef.current = true;
    configRef.datasetPath = '';
  });

  it('canonical error message names both action surfaces', () => {
    const msg = buildDatasetNotFoundMessage('/missing/data.csv');
    expect(msg).toContain('Dataset not found at /missing/data.csv');
    expect(msg).toContain('Update runforge.datasetPath');
    expect(msg).toContain('pick a file');
  });

  it('aborts with actionable error when setting points at non-existent file', async () => {
    configRef.datasetPath = '/does/not/exist/data.csv';

    await executeRun('/fake/workspace', 'std-train', 'missing-file-test');

    // Gate fired — checkPython never reached, no spawn.
    expect(checkPythonMock).not.toHaveBeenCalled();
    expect(spawnRunnerMock).not.toHaveBeenCalled();

    expect(showErrorMessageMock).toHaveBeenCalledTimes(1);
    const surfaced = showErrorMessageMock.mock.calls[0][0] as string;
    expect(surfaced).toBe(
      buildDatasetNotFoundMessage('/does/not/exist/data.csv')
    );
  });

  it('empty string falls through (no abort, no error toast)', async () => {
    configRef.datasetPath = '';

    await executeRun('/fake/workspace', 'std-train', 'empty-setting-test');

    // No dataset-not-found toast — fall-through preserved.
    const allShown = showErrorMessageMock.mock.calls.map((c) => c[0]);
    expect(
      allShown.some(
        (m) => typeof m === 'string' && m.startsWith('Dataset not found at')
      )
    ).toBe(false);

    // checkPython was reached (gate passed, fall-through to existing flow).
    expect(checkPythonMock).toHaveBeenCalled();
  });

  it('unset (returns undefined from getConfiguration) falls through', async () => {
    delete configRef.datasetPath;

    await executeRun('/fake/workspace', 'std-train', 'unset-setting-test');

    const allShown = showErrorMessageMock.mock.calls.map((c) => c[0]);
    expect(
      allShown.some(
        (m) => typeof m === 'string' && m.startsWith('Dataset not found at')
      )
    ).toBe(false);

    expect(checkPythonMock).toHaveBeenCalled();
  });

  it('uses caller-provided dataset path even when setting is configured (param wins)', async () => {
    // Setting points at non-existent file; caller passes a different one.
    // Caller-provided path takes precedence per the explicit-precedence
    // ladder in run-manager.
    configRef.datasetPath = '/does/not/exist/data.csv';

    await executeRun(
      '/fake/workspace',
      'std-train',
      'param-wins-test',
      undefined,
      '/explicit/from/caller.csv'
    );

    // Should NOT have surfaced the dataset-not-found error — the caller's
    // path bypassed the setting entirely.
    const allShown = showErrorMessageMock.mock.calls.map((c) => c[0]);
    expect(
      allShown.some(
        (m) => typeof m === 'string' && m.startsWith('Dataset not found at')
      )
    ).toBe(false);
    expect(checkPythonMock).toHaveBeenCalled();
  });
});
