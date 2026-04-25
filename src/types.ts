/**
 * RunForge Types
 * Core type definitions for the ML training extension.
 *
 * ARCHITECTURAL CONSOLIDATION (iter #5a): Python is the single writer of
 * `.ml/outputs/index.json`. The canonical TS shapes for every artifact
 * Python emits live in this file — no parallel definitions in
 * `src/observability/**` or anywhere else. Drift between observability's
 * shadow types and the writer was the root cause of F-FS-003 and the
 * iter #1–#4 CRITICALs; consolidation collapses both sides onto these.
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

/**
 * Canonical index entry — one row of `.ml/outputs/index.json`.
 *
 * Written by the Python ml_runner (iter #5a consolidation) after a training
 * run completes. The 10 fields below are the union of run identity (passed
 * via CLI args from the TS extension) + outcome + provenance (computed by
 * Python from the trained model + dataset).
 *
 * Field-name reconciliation: `dataset_fingerprint_sha256` is the canonical
 * name (Python's name wins over the prior TS-side `dataset_fingerprint`).
 */
export interface IndexEntry {
  // Identity (passed via CLI args from TS to Python)
  /** Unique run identifier (YYYYMMDD-HHMMSS-<slug>-<rand4>) */
  run_id: string;
  /** ISO8601 timestamp with timezone */
  created_at: string;
  /** User-provided training name */
  name: string;
  /** Preset used */
  preset_id: PresetId;

  // Outcome (computed by Python after training)
  /** Run outcome */
  status: RunStatus;
  /** Summary metrics (duration, final metrics, device) */
  summary: RunSummary;

  // Provenance (computed by Python)
  /** Workspace-relative path to the run directory (forward slashes) */
  run_dir: string;
  /** SHA-256 hash of the dataset file bytes (64 lowercase hex chars) */
  dataset_fingerprint_sha256: string;
  /** Name of the label column used during training */
  label_column: string;
  /** Workspace-relative path to the serialized model artifact */
  model_pkl: string;
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

/**
 * Canonical on-disk shape of `.ml/outputs/index.json`.
 *
 * SINGLE WRITER: Python ml_runner (iter #5a). The TS extension only reads
 * this file (via `readIndex` / `safeReadIndex`).
 *
 * `schema_version` lets future format changes carry an explicit marker
 * (current value: matches Python's `index.schema.v0.2.2.1.json`).
 */
export interface RunIndex {
  /** Schema version identifier (e.g. "0.2.2.1") */
  schema_version: string;
  /** All runs, in append order (oldest first) */
  runs: IndexEntry[];
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
  /** User-facing run name; passed to Python via `--name` so it lands in index.json */
  name?: string;
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

/**
 * Canonical metrics.v1.json shape — matches
 * `python/ml_runner/contracts/metrics.schema.v1.json`.
 *
 * Model-aware metrics artifact (Phase 3.3+). Distinct from the Phase 2.1
 * `TrainingMetrics` summary — this is the full classification report.
 */
export interface MetricsV1 {
  /** Schema version identifier (always "metrics.v1") */
  schema_version: 'metrics.v1';
  /** Profile selected based on model capabilities + class count */
  metrics_profile: 'classification.base.v1' | 'classification.proba.v1' | 'classification.multiclass.v1';
  /** Number of unique classes in the dataset */
  num_classes: number;
  /** Classification accuracy (0–1) */
  accuracy: number;
  /** Macro-averaged precision (0–1) */
  precision_macro: number;
  /** Macro-averaged recall (0–1) */
  recall_macro: number;
  /** Macro-averaged F1 score (0–1) */
  f1_macro: number;
  /** Confusion matrix [true_label][predicted_label] */
  confusion_matrix: number[][];
  /** ROC-AUC score (binary + proba/decision_function only) */
  roc_auc?: number;
  /** Log loss (binary + proba only) */
  log_loss?: number;
  /** Per-class precision (multiclass only) */
  per_class_precision?: number[];
  /** Per-class recall (multiclass only) */
  per_class_recall?: number[];
  /** Per-class F1 (multiclass only) */
  per_class_f1?: number[];
  /** Ordered class labels matching per_class_* arrays */
  class_labels?: Array<string | number>;
}

/**
 * Canonical feature_importance.v1.json shape — matches
 * `python/ml_runner/contracts/feature_importance.schema.v1.json`.
 *
 * Read-only extraction from trained models (Phase 3.4+). RandomForest only
 * in v1 (gini importance).
 */
export interface FeatureImportance {
  /** Schema version identifier (always "feature_importance.v1") */
  schema_version: 'feature_importance.v1';
  /** Model family that produced this importance */
  model_family: 'random_forest';
  /** Type of importance metric used */
  importance_type: 'gini_importance';
  /** Total number of features */
  num_features: number;
  /** Features sorted by importance (descending), tie-broken by name */
  features_by_importance: Array<{
    name: string;
    importance: number;
    rank: number;
  }>;
  /** Features in original dataset column order */
  features_by_original_order: Array<{
    name: string;
    importance: number;
    index: number;
  }>;
  /** Top-k feature names by importance (max 10) */
  top_k: string[];
}

/**
 * Canonical linear_coefficients.v1.json shape — matches
 * `python/ml_runner/contracts/linear_coefficients.schema.v1.json`.
 *
 * Read-only extraction from trained linear classifiers (Phase 3.5+).
 * IMPORTANT: coefficients are in STANDARDIZED feature space (post-StandardScaler).
 *
 * ASYMMETRY CONTRACT: For binary classification (`num_classes == 2`)
 * `coefficients_by_class` contains exactly ONE entry — the positive class —
 * because sklearn stores a single coefficient row for binary linear
 * classifiers. Consumers must NOT assume
 * `coefficients_by_class.length === num_classes`.
 */
export interface LinearCoefficients {
  /** Schema version identifier (always "linear_coefficients.v1") */
  schema_version: 'linear_coefficients.v1';
  /** Model family that produced these coefficients */
  model_family: 'logistic_regression' | 'linear_svc';
  /** Coefficient space (always "standardized" — post-StandardScaler) */
  coefficient_space: 'standardized';
  /** Total number of features */
  num_features: number;
  /** Number of classes in the classification problem */
  num_classes: number;
  /** Class labels in deterministic (sorted) order */
  classes: Array<string | number>;
  /** Intercept terms per class */
  intercepts: Array<{
    class: string | number;
    intercept: number;
  }>;
  /**
   * Coefficients grouped by class. See ASYMMETRY CONTRACT in the type doc:
   * length is 1 for binary, `num_classes` for multiclass.
   */
  coefficients_by_class: Array<{
    class: string | number;
    features: Array<{
      name: string;
      coefficient: number;
      abs_coefficient: number;
      rank: number;
    }>;
  }>;
  /** Top-k features per class by absolute coefficient (max 10) */
  top_k_by_class: Array<{
    class: string | number;
    top_features: string[];
  }>;
}

/**
 * Canonical run.json shape — matches
 * `python/ml_runner/contracts/run.schema.v0.3.6.json`.
 *
 * Per-run metadata file produced by Python ml_runner. Replaces the shadow
 * `RunMetadata` that lived in `src/observability/metadata-command.ts`,
 * which was missing the REQUIRED `metrics_v1` pointer (F-FS-003).
 */
export interface RunMetadata {
  /** Stable identifier: YYYYMMDD-HHMMSS-<shortHash> */
  run_id: string;
  /** Version of RunForge that produced this run */
  runforge_version: string;
  /** Schema version (always "run.v0.3.6") */
  schema_version: 'run.v0.3.6';
  /** ISO-8601 timestamp of run creation */
  created_at: string;
  /** Dataset path + content hash */
  dataset: {
    path: string;
    /** SHA-256 hash of dataset file bytes (64 lowercase hex chars) */
    fingerprint_sha256: string;
  };
  /** Name of the label column used */
  label_column: string;
  /** Model family used for training */
  model_family: ModelFamily;
  /** Number of samples after dropping missing values */
  num_samples: number;
  /** Number of feature columns (excluding label) */
  num_features: number;
  /** Count of rows dropped due to missing values */
  dropped_rows_missing_values: number;
  /** Phase 2.1 metrics summary (frozen, backward compatible) */
  metrics: {
    accuracy: number;
    num_samples: number;
    num_features: number;
  };
  /**
   * Pointer to detailed metrics artifact (Phase 3.3+).
   * REQUIRED per the schema — F-FS-003 fix; the prior shadow type omitted it.
   */
  metrics_v1: {
    schema_version: 'metrics.v1';
    metrics_profile: 'classification.base.v1' | 'classification.proba.v1' | 'classification.multiclass.v1';
    /** Relative path to metrics.v1.json from run directory */
    artifact_path: string;
  };
  /** Schema version of feature_importance artifact (Phase 3.4+, omitted when absent) */
  feature_importance_schema_version?: 'feature_importance.v1';
  /** Relative path to feature_importance.v1.json (Phase 3.4+, omitted when absent) */
  feature_importance_artifact?: string;
  /** Schema version of linear_coefficients artifact (Phase 3.5+, omitted when absent) */
  linear_coefficients_schema_version?: 'linear_coefficients.v1';
  /** Relative path to linear_coefficients.v1.json (Phase 3.5+, omitted when absent) */
  linear_coefficients_artifact?: string;
  /** Artifact pointers (relative to run directory) */
  artifacts: {
    /** Relative path to model.pkl (always present) */
    model_pkl: string;
    /** Relative path to metrics.v1.json (Phase 3.3+) */
    metrics_v1_json?: string;
    /** Relative path to feature_importance.v1.json (Phase 3.4+) */
    feature_importance_json?: string;
    /** Relative path to linear_coefficients.v1.json (Phase 3.5+) */
    linear_coefficients_json?: string;
  };
  /** Training profile name (Phase 3.2+, omit if no profile) */
  profile_name?: 'default' | 'fast' | 'thorough';
  /** Training profile version (Phase 3.2+, omit if no profile) */
  profile_version?: string;
  /** SHA-256 of expanded profile parameters (Phase 3.2+, omit if no profile) */
  expanded_parameters_hash?: string;
  /** Hyperparameters with provenance (Phase 3.2+) */
  hyperparameters?: Array<{
    name: string;
    value: unknown;
    source: 'cli' | 'profile' | 'model_default';
  }>;
}

/**
 * Canonical interpretability.index.v1.json shape — matches
 * `python/ml_runner/contracts/interpretability.index.schema.v1.json`.
 *
 * Phase 3.6+. Read-only linking and summarization of available
 * interpretability artifacts for a single run. Replaces the local shadow
 * type previously in `src/observability/interpretability-index-command.ts`.
 */
export interface InterpretabilityIndex {
  /** Schema version identifier (always "interpretability.index.v1") */
  schema_version: 'interpretability.index.v1';
  /** Run identifier from run.json */
  run_id: string;
  /** RunForge version that produced this index */
  runforge_version: string;
  /** ISO 8601 timestamp when index was created */
  created_at: string;
  /** Map of available interpretability artifacts. Absent entries mean artifact not available for this run. */
  available_artifacts: {
    metrics_v1?: InterpretabilityArtifactEntry<InterpretabilityMetricsV1Summary>;
    feature_importance_v1?: InterpretabilityArtifactEntry<InterpretabilityFeatureImportanceSummary>;
    linear_coefficients_v1?: InterpretabilityArtifactEntry<InterpretabilityLinearCoefficientsSummary>;
  };
}

/** Generic artifact entry inside `InterpretabilityIndex.available_artifacts` */
export interface InterpretabilityArtifactEntry<TSummary> {
  /** Schema version from the underlying artifact */
  schema_version: string;
  /** Relative path to artifact */
  path: string;
  /** Compact summary suitable for index views */
  summary: TSummary;
}

/** Summary block for metrics_v1 inside the interpretability index */
export interface InterpretabilityMetricsV1Summary {
  /** Metrics profile used */
  metrics_profile: string;
  /** Accuracy from run.json (not duplicated from metrics.v1.json) */
  accuracy?: number;
}

/** Summary block for feature_importance_v1 inside the interpretability index */
export interface InterpretabilityFeatureImportanceSummary {
  /** Model family that produced importance */
  model_family: string;
  /** Top feature names by importance (max 5, no values) */
  top_k: string[];
}

/** Summary block for linear_coefficients_v1 inside the interpretability index */
export interface InterpretabilityLinearCoefficientsSummary {
  /** Model family that produced coefficients */
  model_family: string;
  /** Number of classes */
  num_classes: number;
  /** Top features per class (names only, no coefficients) */
  top_k_by_class: Array<{
    class: number | string;
    top_features: string[];
  }>;
}

/** Workspace paths */
export const WORKSPACE_PATHS = {
  ML_ROOT: '.ml',
  OUTPUTS_DIR: '.ml/outputs',
  RUNS_DIR: '.ml/runs',
  INDEX_FILE: '.ml/outputs/index.json',
} as const;

/** Canonical artifact filenames written under a run directory */
export const ARTIFACT_FILENAMES = {
  RUN_JSON: 'run.json',
  REQUEST_JSON: 'request.json',
  RESULT_JSON: 'result.json',
  LOGS_TXT: 'logs.txt',
  METRICS_JSON: 'metrics.json',
  METRICS_V1_JSON: 'metrics.v1.json',
  FEATURE_IMPORTANCE_V1_JSON: 'feature_importance.v1.json',
  LINEAR_COEFFICIENTS_V1_JSON: 'linear_coefficients.v1.json',
  INTERPRETABILITY_INDEX_V1_JSON: 'interpretability.index.v1.json',
  MODEL_PKL: 'model.pkl',
  INDEX_ORPHAN_MARKER: '.index-orphan',
  /**
   * Phase 4 (FT-PY-004 + FT-BACK-001): cancellation marker.
   * Written by Python provenance after a SIGTERM-handled graceful shutdown.
   * Read by TS Bridge (`src/observability/cancelled-marker-reader.ts`) +
   * `run-manager.detectCancelTerminalState()`.
   * Mirrors `python/ml_runner/contracts/cancelled.schema.v1.0.0.json`.
   */
  CANCELLED_MARKER: '.cancelled',
} as const;

/**
 * Marker written by Python provenance when run.json succeeds but the canonical
 * index update fails. Read by TS Bridge to surface "saved but not indexed"
 * state in UI. Schema lives at python/ml_runner/contracts/index-orphan.schema.v1.0.0.json
 * — both writers (Python) and readers (TS) must conform to that source-of-truth.
 */
export interface IndexOrphanMarker {
  schema_version: 'index-orphan.v1.0.0';
  run_id: string;
  run_dir: string;
  written_at: string;
  error: {
    type: string;
    message: string;
    traceback?: string;
  };
  index_path: string;
}

/**
 * Cancellation marker — written by Python provenance under a run directory
 * after Python catches SIGTERM and completes graceful cleanup before exit.
 *
 * Mirrors `python/ml_runner/contracts/cancelled.schema.v1.0.0.json` (FROZEN
 * at v1.0.0 in Phase 4 Wave 0). Single writer = Python ml_runner. Single
 * reader = TS Bridge (`src/observability/cancelled-marker-reader.ts`,
 * consumed by `src/runner/run-manager.detectCancelTerminalState`).
 *
 * Per CONTRACT-PHASE-4.md §3.1.3 (source-of-truth doctrine): the presence of
 * this marker — atomically written by Python via `os.replace()` — is the
 * authoritative graceful-cancel signal alongside the `run_cancelled` event.
 * Process-exit timing is NEVER consulted for state classification.
 *
 * Pairs with `RunCancelledEvent` (events.schema.v1) — either signal alone is
 * sufficient to classify a run as `cancelled-graceful`.
 */
export interface IndexCancelledMarker {
  schema_version: 'cancelled.v1.0.0';
  /** Permissive identifier (matches both TS 4-segment and Python 3-segment per F-COORD-012). */
  run_id: string;
  /** Workspace-relative path to the run dir. Forward slashes only. */
  run_dir: string;
  /** ISO 8601 UTC timestamp when graceful cleanup completed and marker was atomically written. */
  cancelled_at: string;
  /** Which phase the cancel was caught during. */
  step:
    | 'dataset_loading'
    | 'training'
    | 'metrics_computation'
    | 'artifact_writing'
    | 'shutdown';
  /** Optional human-readable trigger. */
  reason?: string;
  /** Workspace-relative paths to artifacts partially or fully written before cancellation. */
  partial_artifacts?: string[];
}
