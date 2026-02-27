/**
 * Tests for pure helper functions in run-manager.
 *
 * isOomError — critical safety function that triggers GPU OOM kill.
 * formatDuration — human-readable time formatting for output channel.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock vscode (run-manager imports it at module level)
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      dispose: () => {},
      clear: () => {},
    }),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
  },
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
    }),
  },
  commands: {
    executeCommand: () => Promise.resolve(undefined),
  },
}));

import { isOomError, formatDuration, isRunning } from '../src/runner/run-manager.js';

// ── isOomError ───────────────────────────────────────────────────────────────

describe('isOomError', () => {
  describe('detects GPU memory errors', () => {
    it('matches "out of memory"', () => {
      expect(isOomError('RuntimeError: CUDA out of memory')).toBe(true);
    });

    it('matches "cuda error"', () => {
      expect(isOomError('CUDA error: an illegal memory access was encountered')).toBe(true);
    });

    it('matches "cudnn error"', () => {
      expect(isOomError('cuDNN error: CUDNN_STATUS_ALLOC_FAILED')).toBe(true);
    });

    it('matches "cublas error"', () => {
      expect(isOomError('CUBLAS error: CUBLAS_STATUS_ALLOC_FAILED')).toBe(true);
    });

    it('matches "alloc" keyword', () => {
      expect(isOomError('Failed to alloc 2GB on GPU')).toBe(true);
    });

    it('matches "outofmemoryerror" (Java/PyTorch style)', () => {
      expect(isOomError('torch.cuda.OutOfMemoryError')).toBe(true);
    });

    it('matches "memory limit"', () => {
      expect(isOomError('Exceeded GPU memory limit')).toBe(true);
    });

    it('matches "failed to allocate"', () => {
      expect(isOomError('Failed to allocate 1024 bytes')).toBe(true);
    });

    it('matches "insufficient memory"', () => {
      expect(isOomError('Insufficient memory for operation')).toBe(true);
    });
  });

  describe('case insensitivity', () => {
    it('matches uppercase', () => {
      expect(isOomError('OUT OF MEMORY')).toBe(true);
    });

    it('matches mixed case', () => {
      expect(isOomError('Cuda Error: out of memory')).toBe(true);
    });
  });

  describe('does not false-positive', () => {
    it('rejects normal training output', () => {
      expect(isOomError('Epoch 1/10 - loss: 0.543')).toBe(false);
    });

    it('rejects normal log lines', () => {
      expect(isOomError('Training completed in 45.2s')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isOomError('')).toBe(false);
    });

    it('rejects unrelated error messages', () => {
      expect(isOomError('FileNotFoundError: dataset.csv not found')).toBe(false);
    });

    it('rejects metric output', () => {
      expect(isOomError('accuracy: 0.95, precision: 0.93')).toBe(false);
    });
  });
});

// ── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats sub-second as milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats exactly 0ms', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formats 999ms as milliseconds', () => {
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds with one decimal', () => {
    expect(formatDuration(1000)).toBe('1.0s');
  });

  it('formats 30.5 seconds', () => {
    expect(formatDuration(30500)).toBe('30.5s');
  });

  it('formats 59.9 seconds', () => {
    expect(formatDuration(59900)).toBe('59.9s');
  });

  it('formats exactly 1 minute', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
  });

  it('formats 1m 30s', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });

  it('formats 5m 15s', () => {
    expect(formatDuration(315000)).toBe('5m 15s');
  });

  it('formats large durations', () => {
    expect(formatDuration(600000)).toBe('10m 0s');
  });
});

// ── isRunning ────────────────────────────────────────────────────────────────

describe('isRunning', () => {
  it('returns false when no run is active', () => {
    expect(isRunning()).toBe(false);
  });
});
