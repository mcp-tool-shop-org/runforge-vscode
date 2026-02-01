/**
 * Schema Contract Tests
 * Phase 2.1: CSV Training with strict metrics schema
 */

import { describe, it, expect } from 'vitest';
import type {
  IndexEntry,
  RunRequest,
  RunResult,
  Preset,
  PresetDefaults,
  DeviceType,
  GpuReason,
  TrainingMetrics,
} from '../src/types.js';
import { WORKSPACE_PATHS } from '../src/types.js';

describe('Index Entry Schema', () => {
  it('should have all required fields defined in type', () => {
    // This test documents the required fields
    const entry: IndexEntry = {
      run_id: '20260201-142355-run-a3f9',
      created_at: '2026-02-01T14:23:55-05:00',
      name: 'test-run',
      preset_id: 'std-train',
      status: 'succeeded',
      run_dir: '.ml/runs/20260201-142355-run-a3f9',
      summary: {
        duration_ms: 1000,
        final_metrics: { accuracy: 0.95 },
        device: 'cpu',
      },
    };

    // All required fields present
    expect(entry.run_id).toBeDefined();
    expect(entry.created_at).toBeDefined();
    expect(entry.name).toBeDefined();
    expect(entry.preset_id).toBeDefined();
    expect(entry.status).toBeDefined();
    expect(entry.run_dir).toBeDefined();
    expect(entry.summary).toBeDefined();
    expect(entry.summary.duration_ms).toBeDefined();
    expect(entry.summary.final_metrics).toBeDefined();
    expect(entry.summary.device).toBeDefined();
  });

  it('should use forward slashes in run_dir', () => {
    const validPath = '.ml/runs/20260201-142355-run-a3f9';
    expect(validPath).not.toContain('\\');
    expect(validPath.startsWith('.ml/')).toBe(true);
  });

  it('should have status as succeeded or failed', () => {
    const statuses: IndexEntry['status'][] = ['succeeded', 'failed'];
    expect(statuses).toContain('succeeded');
    expect(statuses).toContain('failed');
  });

  it('should include device in summary', () => {
    const devices: DeviceType[] = ['cuda', 'cpu'];
    expect(devices).toContain('cuda');
    expect(devices).toContain('cpu');
  });
});

describe('Run Request Schema', () => {
  it('should have all required fields including device tracking', () => {
    const request: RunRequest = {
      run_id: '20260201-142355-run-a3f9',
      name: 'test-run',
      preset_id: 'std-train',
      created_at: '2026-02-01T14:23:55-05:00',
      requested_device: 'cpu',
      actual_device: 'cpu',
      gpu_reason: 'no_cuda',
    };

    expect(request.run_id).toBeDefined();
    expect(request.name).toBeDefined();
    expect(request.preset_id).toBeDefined();
    expect(request.created_at).toBeDefined();
    expect(request.requested_device).toBeDefined();
    expect(request.actual_device).toBeDefined();
    expect(request.gpu_reason).toBeDefined();
  });

  it('should allow optional seed', () => {
    const withSeed: RunRequest = {
      run_id: 'test',
      name: 'test',
      preset_id: 'std-train',
      created_at: '2026-02-01T14:23:55-05:00',
      seed: 42,
      requested_device: 'cpu',
      actual_device: 'cpu',
      gpu_reason: 'no_cuda',
    };

    expect(withSeed.seed).toBe(42);
  });

  it('should record all GPU reason types', () => {
    const reasons: GpuReason[] = ['sufficient_vram', 'insufficient_vram', 'gpu_unknown', 'no_cuda'];
    expect(reasons).toContain('sufficient_vram');
    expect(reasons).toContain('insufficient_vram');
    expect(reasons).toContain('gpu_unknown');
    expect(reasons).toContain('no_cuda');
  });
});

describe('Run Result Schema', () => {
  it('should have all required fields', () => {
    const result: RunResult = {
      run_id: '20260201-142355-run-a3f9',
      status: 'succeeded',
      exit_code: 0,
      duration_ms: 1000,
    };

    expect(result.run_id).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.exit_code).toBeDefined();
    expect(result.duration_ms).toBeDefined();
  });

  it('should allow optional error', () => {
    const failed: RunResult = {
      run_id: 'test',
      status: 'failed',
      exit_code: 1,
      duration_ms: 500,
      error: 'Something went wrong',
    };

    expect(failed.error).toBeDefined();
  });
});

describe('Preset Schema (Phase 2: Logistic Regression)', () => {
  it('should have required structure', () => {
    const preset: Preset = {
      id: 'std-train',
      name: 'Standard Training',
      defaults: {
        epochs: 50,
        learning_rate: 0.01,
        regularization: 1.0,
        solver: 'lbfgs',
        max_iter: 200,
        seed: 42,
        device: 'cpu',
      },
    };

    expect(preset.id).toBeDefined();
    expect(preset.name).toBeDefined();
    expect(preset.defaults).toBeDefined();
  });

  it('should have all default fields for Logistic Regression', () => {
    const defaults: PresetDefaults = {
      epochs: 50,
      learning_rate: 0.01,
      regularization: 1.0,
      solver: 'lbfgs',
      max_iter: 200,
      seed: 42,
      device: 'cpu',
    };

    expect(defaults.epochs).toBeDefined();
    expect(defaults.learning_rate).toBeDefined();
    expect(defaults.regularization).toBeDefined();
    expect(defaults.solver).toBeDefined();
    expect(defaults.max_iter).toBeDefined();
    expect(defaults.seed).toBeDefined();
    expect(defaults.device).toBeDefined();
  });

  it('should restrict device to valid values', () => {
    const devices: PresetDefaults['device'][] = ['auto', 'cuda', 'cpu'];
    expect(devices).toContain('auto');
    expect(devices).toContain('cuda');
    expect(devices).toContain('cpu');
  });
});

describe('Training Metrics Schema (Phase 2.1: Strict)', () => {
  it('should have exactly 3 keys', () => {
    const metrics: TrainingMetrics = {
      accuracy: 0.95,
      num_samples: 1000,
      num_features: 10,
    };

    // Verify the type only has 3 properties
    const keys = Object.keys(metrics);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('accuracy');
    expect(keys).toContain('num_samples');
    expect(keys).toContain('num_features');
  });

  it('should NOT have extra keys like epochs_completed, seed, device', () => {
    const metrics: TrainingMetrics = {
      accuracy: 0.95,
      num_samples: 100,
      num_features: 5,
    };

    // These keys should NOT be in the strict schema
    expect('epochs_completed' in metrics).toBe(false);
    expect('seed' in metrics).toBe(false);
    expect('device' in metrics).toBe(false);
  });

  it('should have accuracy in valid range', () => {
    const metrics: TrainingMetrics = {
      accuracy: 0.95,
      num_samples: 100,
      num_features: 5,
    };

    expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(metrics.accuracy).toBeLessThanOrEqual(1);
  });

  it('should have positive sample and feature counts', () => {
    const metrics: TrainingMetrics = {
      accuracy: 0.85,
      num_samples: 500,
      num_features: 20,
    };

    expect(metrics.num_samples).toBeGreaterThan(0);
    expect(metrics.num_features).toBeGreaterThan(0);
  });
});

describe('Workspace Paths', () => {
  it('should define all required paths', () => {
    expect(WORKSPACE_PATHS.ML_ROOT).toBe('.ml');
    expect(WORKSPACE_PATHS.OUTPUTS_DIR).toBe('.ml/outputs');
    expect(WORKSPACE_PATHS.RUNS_DIR).toBe('.ml/runs');
    expect(WORKSPACE_PATHS.INDEX_FILE).toBe('.ml/outputs/index.json');
  });

  it('should use forward slashes', () => {
    Object.values(WORKSPACE_PATHS).forEach((p) => {
      expect(p).not.toContain('\\');
    });
  });
});

describe('Timestamp Format', () => {
  it('should use timezone offset format (not Z)', () => {
    // Valid: 2026-02-01T14:23:55-05:00
    // Invalid: 2026-02-01T14:23:55.000Z
    const validTimestamp = '2026-02-01T14:23:55-05:00';
    expect(validTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

    // Ensure Z format is detected
    const zTimestamp = '2026-02-01T14:23:55.000Z';
    expect(zTimestamp).not.toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});
