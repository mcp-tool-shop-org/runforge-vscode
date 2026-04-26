---
title: Reference
description: Commands, settings, models, training profiles, artifacts, interpretability, and security model.
---

## Commands

All commands are available via the VS Code Command Palette (`Ctrl+Shift+P`).

| Command | Description |
|---------|-------------|
| `RunForge: Train (Standard)` | Run training with the std-train preset |
| `RunForge: Train (High Quality)` | Run training with the hq-train preset |
| `RunForge: Open Runs` | View completed training runs |
| `RunForge: Inspect Dataset` | Validate a dataset before training |
| `RunForge: Open Latest Run Metadata` | View metadata for the most recent run |
| `RunForge: Inspect Model Artifact` | View pipeline structure of a trained model.pkl |
| `RunForge: Browse Runs` | Browse all runs with quick actions (summary, diagnostics, artifact inspection) |
| `RunForge: View Latest Metrics` | View detailed metrics from metrics.v1.json |
| `RunForge: View Latest Feature Importance` | View feature importance for RandomForest models |
| `RunForge: View Latest Linear Coefficients` | View coefficients for linear models |
| `RunForge: View Latest Interpretability Index` | View unified index of all interpretability artifacts |
| `RunForge: Export Latest Run as Markdown` | Save a formatted markdown summary of the latest run |
| `RunForge: Cancel Active Training` | Cancel the currently in-progress training run (5s SIGTERM grace, then SIGKILL) |
| `RunForge: Recover Index` | Walk `.ml/runs/` and re-append missing entries to `index.json`; returns a structured `RecoveryReport` |

For the full lifecycle behaviour — state machine, source-of-truth detector, partial artifacts, and the recovery report shape — see [Cancel and Recovery](../cancel-and-recovery/).

## Settings

Configure RunForge through VS Code settings (`Ctrl+,`).

| Setting | Default | Description |
|---------|---------|-------------|
| `runforge.pythonPath` | `python` | Path to the Python executable |
| `runforge.mlRunnerModule` | `ml_runner` | Python module to run for training |
| `runforge.modelFamily` | `logistic_regression` | Model family: `logistic_regression`, `random_forest`, or `linear_svc` |
| `runforge.profile` | (empty) | Training profile: `default`, `fast`, or `thorough` |

## Supported Models

| Model | CLI Value | Description | Interpretability |
|-------|-----------|-------------|------------------|
| Logistic Regression | `logistic_regression` | Default, fast, interpretable | Linear coefficients |
| Random Forest | `random_forest` | Ensemble, handles non-linear patterns | Feature importance (Gini) |
| Linear SVC | `linear_svc` | Support vector classifier, margin-based | Linear coefficients |

All models use `StandardScaler` as the first pipeline step. Preprocessing is embedded in the trained artifact.

## Training Profiles

Profiles provide pre-configured hyperparameter overrides.

| Profile | Description | Model Family |
|---------|-------------|--------------|
| `default` | No hyperparameter overrides | (uses setting) |
| `fast` | Reduced iterations for quick runs | logistic_regression |
| `thorough` | More trees/iterations for better quality | random_forest |

### Hyperparameter Precedence

1. **CLI `--param`** (highest priority)
2. **Profile-expanded parameters**
3. **Model defaults** (lowest priority)

### Supported Hyperparameters

**Logistic Regression:** `C` (float), `max_iter` (int), `solver` (string), `warm_start` (bool)

**Random Forest:** `n_estimators` (int), `max_depth` (int or None), `min_samples_split` (int, >= 2), `min_samples_leaf` (int)

**Linear SVC:** `C` (float), `max_iter` (int)

## Run Lifecycle

```text
dataset.csv
    |
    v
  Validate (label column, numeric values)
    |
    v
  Fingerprint (SHA-256 of dataset)
    |
    v
  Split (80/20, deterministic, stratified)
    |
    v
  Fit pipeline (StandardScaler + model)
    |
    v
  Compute metrics
    |
    v
  Extract interpretability
    |
    v
  .ml/runs/<run-id>/
```

Every step is deterministic given the same seed, dataset, and configuration.

## Artifacts

All run artifacts are saved under `.ml/runs/<run-id>/`:

| File | Contents |
|------|----------|
| `run.json` | Metadata: run ID, timestamp, dataset fingerprint, label column, model family, profile, git SHA, Python path, extension version |
| `metrics.json` | Phase 2 metrics: accuracy, num_samples, num_features |
| `metrics.v1.json` | Detailed metrics by profile (accuracy, precision, recall, F1, confusion matrix, ROC-AUC, log loss) |
| `artifacts/model.pkl` | Trained scikit-learn pipeline (StandardScaler + classifier) |
| `artifacts/feature_importance.v1.json` | Gini importance scores (RandomForest only) |
| `artifacts/linear_coefficients.v1.json` | Model coefficients in standardized feature space (LogisticRegression, LinearSVC) |
| `artifacts/interpretability.index.v1.json` | Unified index linking all interpretability outputs |

### Metrics Profiles

Metrics profile is auto-selected based on model capabilities:

| Profile | Trigger | Metrics |
|---------|---------|---------|
| `classification.base.v1` | All classifiers | accuracy, precision, recall, F1, confusion matrix |
| `classification.proba.v1` | Binary + predict_proba | base + ROC-AUC, log loss |
| `classification.multiclass.v1` | 3+ classes | base + per-class precision/recall/F1 |

## Interpretability

### Feature Importance (Tree Models)

RandomForest runs extract Gini importance scores and save them as `feature_importance.v1.json`. Features are ranked by importance and listed in both importance order and original column order.

No approximations — if the model doesn't support native importance, no artifact is emitted.

### Linear Coefficients

LogisticRegression and LinearSVC runs extract model coefficients into `linear_coefficients.v1.json`. All coefficients are in **standardized feature space** (after StandardScaler), so comparing coefficients across features is meaningful.

For multiclass classification (3+ classes), coefficients are grouped per class with deterministic ordering.

### Unified Index

Every run produces `interpretability.index.v1.json`, which lists all available interpretability artifacts, their schema versions, and paths. Absent artifacts are omitted (not set to null).

## Diagnostics

Structured diagnostics explain run behavior as machine-readable codes:

| Code | Description |
|------|-------------|
| `MISSING_VALUES_DROPPED` | Rows dropped due to missing values |
| `LABEL_NOT_FOUND` | Label column not present in dataset |
| `LABEL_TYPE_INVALID` | Label column has invalid type |
| `ZERO_ROWS` | Dataset has zero rows after processing |
| `ZERO_FEATURES` | Dataset has no feature columns |
| `LABEL_ONLY_DATASET` | Dataset contains only the label column |
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | Model doesn't support native feature importance |
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | Model doesn't support coefficient extraction |

## Event Stream

Phase 4 ships a structured event stream (`events.schema.v1.json`) that Python emits as JSONL on stderr, one event per line. The schema is frozen at v1.0.0 and covers nine event types:

| Event | When emitted |
|---|---|
| `run_start` | Run begins |
| `dataset_loaded` | CSV parsed and validated |
| `train_started` | Pipeline fit begins |
| `train_progress` | Per epoch (Phase 4 cardinality) |
| `train_finished` | Pipeline fit complete |
| `metrics_computed` | Validation metrics computed |
| `artifacts_written` | All artifacts flushed to disk |
| `cancelling` | SIGTERM received; emits per-second `seconds_remaining` countdown |
| `run_cancelled` | Graceful cancel cleanup complete |

Event emission **order** is deterministic across re-runs of the same configuration; **timestamps** naturally vary. Non-JSONL stderr is treated as free-form log lines. The TS Bridge validates each event against the schema and drops malformed events without throwing.

## Workspace Trust

Python subprocess spawn (training, version check, GPU probe, dataset inspect, artifact inspect) is gated by VS Code **workspace trust**. RunForge runs user-controlled Python from a workspace-settable path; the trust guard prevents an untrusted workspace from inducing arbitrary Python execution. Untrusted workspaces receive a structured error pointing to the **Manage Workspace Trust** UI.

## Security and Data Scope

**Data touched:** workspace CSV files (read-only for training), `.ml/` directory (run metadata, model artifacts, metrics). Python subprocess stdout/stderr.

**Data NOT touched:** no files outside the open workspace, no browser data, no OS credentials.

**Permissions:** filesystem read/write within workspace only, Python subprocess execution (gated by workspace trust).

**No network egress.** All operations are local. **No telemetry** is collected or sent.

For the full trust model, see [TRUST_MODEL.md](https://github.com/mcp-tool-shop-org/runforge-vscode/blob/main/docs/TRUST_MODEL.md).
