/**
 * RunForge Types
 * Core type definitions for the ML training extension
 */

/** Preset IDs (locked for Phase 1) */
export type PresetId = 'std-train' | 'hq-train';

/** Training preset definition */
export interface Preset {
  /** Unique preset identifier */
  id: PresetId;
  /** Human-readable name */
  name: string;
  /** Default hyperparameters */
  defaults: PresetDefaults;
}

/** Preset default values (Phase 2: Logistic Regression) */
export interface PresetDefaults {
  epochs: number;
  learning_rate: number;
  regularization: number;
  solver: string;
  max_iter: number;
  seed: number;
  device: 'auto' | 'cuda' | 'cpu';
}

/** Device type */
export type DeviceType = 'cuda' | 'cpu';

/** GPU fallback reason */
export type GpuReason = 'sufficient_vram' | 'insufficient_vram' | 'gpu_unknown' | 'no_cuda';

/** Training run request (written to request.json) */
export interface RunRequest {
  /** Unique run identifier */
  run_id: string;
  /** User-provided training name */
  name: string;
  /** Preset used for this run */
  preset_id: PresetId;
  /** Random seed (if provided) */
  seed?: number;
  /** ISO8601 timestamp with timezone offset */
  created_at: string;
  /** Device requested by preset (before gating) */
  requested_device: DeviceType | 'auto';
  /** Device actually used (after GPU gating) */
  actual_device: DeviceType;
  /** Reason for device selection */
  gpu_reason: GpuReason;
}

/** Training run result (written to result.json) */
export interface RunResult {
  /** Unique run identifier */
  run_id: string;
  /** Run outcome */
  status: RunStatus;
  /** Process exit code */
  exit_code: number;
  /** Total duration in milliseconds */
  duration_ms: number;
  /** Error message if failed */
  error?: string;
}

/** Run status */
export type RunStatus = 'succeeded' | 'failed';

/** Index entry (appended to index.json) */
export interface IndexEntry {
  /** Unique run identifier */
  run_id: string;
  /** ISO8601 timestamp with timezone */
  created_at: string;
  /** User-provided training name */
  name: string;
  /** Preset used */
  preset_id: PresetId;
  /** Run outcome */
  status: RunStatus;
  /** Workspace-relative path (forward slashes) */
  run_dir: string;
  /** Summary metrics */
  summary: RunSummary;
}

/** Run summary for index */
export interface RunSummary {
  /** Total duration in milliseconds */
  duration_ms: number;
  /** Final metrics from training (may be empty) */
  final_metrics: Record<string, number>;
  /** Device used for training */
  device: DeviceType;
}

/** Metrics output from trainer (written to metrics.json) - Phase 2.1: Strict Schema */
export interface TrainingMetrics {
  /** Classification accuracy (0.0 - 1.0) on validation set */
  accuracy: number;
  /** Total number of samples (train + val) */
  num_samples: number;
  /** Number of features in dataset */
  num_features: number;
}

/** Run ID format: YYYYMMDD-HHMMSS-<slug>-<rand4> */
export interface RunIdComponents {
  date: string;      // YYYYMMDD
  time: string;      // HHMMSS
  slug: string;      // alphanumeric-dashes
  rand: string;      // 4 hex chars
}

/** Model family type (Phase 3.1) */
export type ModelFamily = 'logistic_regression' | 'random_forest' | 'linear_svc';

/** Training profile type (Phase 3.2) */
export type TrainingProfile = '' | 'default' | 'fast' | 'thorough';

/** Python runner spawn options */
export interface RunnerOptions {
  preset_id: PresetId;
  run_dir: string;
  seed?: number;
  device: DeviceType;
  cwd: string;
  /** Path to dataset CSV file (passed via RUNFORGE_DATASET env var) */
  dataset_path?: string;
  /** Model family to use (Phase 3.1, default: logistic_regression) */
  model_family?: ModelFamily;
  /** Training profile to use (Phase 3.2, empty = no profile) */
  profile?: TrainingProfile;
}

/** Workspace paths */
export const WORKSPACE_PATHS = {
  ML_ROOT: '.ml',
  OUTPUTS_DIR: '.ml/outputs',
  RUNS_DIR: '.ml/runs',
  INDEX_FILE: '.ml/outputs/index.json',
} as const;
