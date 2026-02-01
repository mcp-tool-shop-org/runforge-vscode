# RunForge VS Code

Push-button ML training with deterministic, contract-driven behavior.

## Installation

```bash
npm install
npm run compile
```

## Commands

| Command | Description |
|---------|-------------|
| `RunForge: Train (Standard)` | Run training with std-train preset |
| `RunForge: Train (High Quality)` | Run training with hq-train preset |
| `RunForge: Open Runs` | View completed training runs |
| `RunForge: Inspect Dataset` | Validate dataset before training (v0.2.2.1+) |
| `RunForge: Open Latest Run Metadata` | View metadata for most recent run (v0.2.2.1+) |
| `RunForge: Inspect Model Artifact` | View pipeline structure of model.pkl (v0.2.2.2+) |
| `RunForge: Browse Runs` | Browse all runs with actions (summary, diagnostics, artifact) (v0.2.3+) |
| `RunForge: View Latest Metrics` | View detailed metrics from metrics.v1.json (v0.3.3+) |
| `RunForge: View Latest Feature Importance` | View feature importance for RandomForest models (v0.3.4+) |
| `RunForge: View Latest Linear Coefficients` | View coefficients for linear models (v0.3.5+) |

## Usage

1. Set `RUNFORGE_DATASET` environment variable to your CSV path
2. CSV must have a column named `label`
3. Run training via Command Palette

---

## Guarantees (v0.2.1+)

RunForge VS Code provides deterministic, contract-driven ML training. The guarantees below are intentional and enforced by tests.

### Determinism

Given the same dataset, configuration, and RunForge version:

- Train/validation splits are identical across runs
- Generated artifacts are reproducible
- Metrics outputs are stable

There is no randomness outside explicitly seeded behavior.

### Label Handling

- The label column is explicitly specified
- The label is never inferred by column position
- Misconfigured or missing labels fail early

### Metrics Contract

Training outputs exactly three metrics:

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

No additional fields are added implicitly.
Schema expansion requires a versioned contract change.

### Model Artifacts

- `model.pkl` is always a serialized `sklearn.Pipeline`
- All preprocessing (e.g. scaling) is embedded
- The artifact is self-contained and inference-ready

No external preprocessing steps are required.

### Missing Data

- Rows containing missing values are dropped deterministically
- The number of dropped rows is logged
- No silent imputation occurs

### Source of Truth

- All Python execution logic lives in `python/ml_runner/`
- There is no duplicated or shadow implementation
- Tests enforce parity between TypeScript and Python behavior

### Stability Policy

- Behavior at v0.2.1 is frozen
- Breaking changes require an explicit major version bump
- Silent behavior changes are considered bugs

---

## Non-Goals (Intentional)

RunForge does not currently attempt to:

- Auto-select models (user must choose explicitly)
- Tune hyperparameters (defaults are fixed per preset)
- Perform online or incremental training
- Hide training behavior behind heuristics

Correctness and transparency take priority over automation.

---

---

## Observability (v0.2.2.1+)

Phase 2.2.1 adds visibility into training runs without changing training behavior.

### Run Metadata

Each training run produces a `run.json` with:

- Run ID and timestamp
- Dataset fingerprint (SHA-256)
- Label column and feature count
- Dropped rows count
- Metrics snapshot
- Artifact paths

### Dataset Inspection

Inspect datasets before training:

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Returns column names, row count, feature count, and label validation.

### Provenance Tracking

All runs are indexed in `.runforge/index.json` for traceability:

- Given a `model.pkl`, trace back to run metadata
- Find all runs for a given dataset fingerprint
- Append-only index (never reorders or deletes)

---

## Artifact Introspection (v0.2.2.2+)

Phase 2.2.2 adds read-only inspection of trained artifacts.

**Inspection is read-only and does not retrain or modify artifacts.**

### Pipeline Inspection

Inspect what's inside a `model.pkl` without retraining:

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Returns structured JSON with:

- Pipeline steps (in order)
- Step types and modules
- Preprocessing detection

Example output:

```json
{
  "schema_version": "0.2.2.2",
  "artifact_path": "model.pkl",
  "pipeline_steps": [
    {"name": "scaler", "type": "StandardScaler", "module": "sklearn.preprocessing._data"},
    {"name": "clf", "type": "LogisticRegression", "module": "sklearn.linear_model._logistic"}
  ],
  "has_preprocessing": true,
  "step_count": 2
}
```

### Diagnostics

Structured diagnostics explain why a run behaved the way it did:

| Code | Description |
|------|-------------|
| `MISSING_VALUES_DROPPED` | Rows dropped due to missing values |
| `LABEL_NOT_FOUND` | Label column not present in dataset |
| `LABEL_TYPE_INVALID` | Label column has invalid type |
| `ZERO_ROWS` | Dataset has zero rows after processing |
| `ZERO_FEATURES` | Dataset has no feature columns |
| `LABEL_ONLY_DATASET` | Dataset contains only the label column |

All diagnostics are machine-readable JSON (no log parsing needed).

---

## Browse Runs (v0.2.3+)

Phase 2.3 adds a unified run browser with quick actions.

### Using Browse Runs

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `RunForge: Browse Runs`
3. Select a run from the list (newest first)
4. Choose an action:
   - **Open Run Summary** — View run metadata as readable markdown
   - **View Diagnostics** — See what happened during the run
   - **Inspect Model Artifact** — View pipeline structure
   - **Copy Dataset Fingerprint** — Copy SHA-256 to clipboard

### Synthesized Diagnostics

Diagnostics are derived from run.json fields:

| Condition | Diagnostic |
|-----------|------------|
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

Full structured diagnostics emission is planned for future phases.

---

## Model Selection (v0.3.1+)

Phase 3.1 adds explicit model selection while preserving all Phase 2 guarantees.

### Supported Models

| Model | CLI Value | Description |
|-------|-----------|-------------|
| Logistic Regression | `logistic_regression` | Default, fast, interpretable |
| Random Forest | `random_forest` | Ensemble, handles non-linear patterns |
| Linear SVC | `linear_svc` | Support vector classifier, margin-based |

### Configuration

Set the model family in VS Code settings:

```json
{
  "runforge.modelFamily": "random_forest"
}
```

Or use the Settings UI: Search for "RunForge Model Family" and select from the dropdown.

### CLI Usage

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

The `--model` argument is optional. Default: `logistic_regression`.

### Provenance

The selected model family is recorded in `run.json`:

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Backward Compatibility

- All Phase 2 runs remain readable
- Default behavior unchanged (logistic regression)
- No migration required
- Preprocessing remains fixed (StandardScaler for all models)

---

## Hyperparameters & Training Profiles (v0.3.2+)

Phase 3.2 adds explicit hyperparameter control and training profiles.

### Training Profiles

Named profiles provide pre-configured hyperparameters:

| Profile | Description | Model Family |
|---------|-------------|--------------|
| `default` | No hyperparameter overrides | (uses setting) |
| `fast` | Reduced iterations for quick runs | logistic_regression |
| `thorough` | More trees/iterations for better quality | random_forest |

Configure in VS Code settings:
```json
{
  "runforge.profile": "fast"
}
```

### CLI Hyperparameters

Override individual hyperparameters via CLI:

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Precedence Rules

When both profile and CLI params are set:

1. **CLI `--param`** (highest priority)
2. **Profile-expanded parameters**
3. **Model defaults** (lowest priority)

### Provenance

Hyperparameters and profiles are recorded in `run.json`:

```json
{
  "model_family": "random_forest",
  "profile_name": "thorough",
  "profile_version": "1.0",
  "expanded_parameters_hash": "abc123...",
  "hyperparameters": [
    {"name": "n_estimators", "value": 200, "source": "profile"},
    {"name": "max_depth", "value": 5, "source": "cli"}
  ]
}
```

When no profile is used, profile fields are omitted entirely (not null).

---

## Model-Aware Metrics (v0.3.3+)

Phase 3.3 adds detailed, model-aware metrics with capability-based profile selection.

### Metrics Profiles

Metrics profiles are automatically selected based on model capabilities:

| Profile | Description | Metrics |
|---------|-------------|---------|
| `classification.base.v1` | All classifiers | accuracy, precision, recall, f1, confusion matrix |
| `classification.proba.v1` | Binary + predict_proba | base + ROC-AUC, log loss |
| `classification.multiclass.v1` | 3+ classes | base + per-class precision/recall/f1 |

### Profile Selection Logic

- Binary classification + `predict_proba` → `classification.proba.v1`
- Multiclass (3+ classes) → `classification.multiclass.v1`
- Otherwise → `classification.base.v1`

### Model Capabilities

| Model | predict_proba | decision_function |
|-------|---------------|-------------------|
| LogisticRegression | ✅ | ✅ |
| RandomForest | ✅ | ❌ |
| LinearSVC | ❌ | ✅ (ROC-AUC only) |

### Metrics Artifact

Training now produces `metrics.v1.json` alongside `metrics.json`:

```json
{
  "schema_version": "metrics.v1",
  "metrics_profile": "classification.proba.v1",
  "num_classes": 2,
  "accuracy": 0.95,
  "precision_macro": 0.94,
  "recall_macro": 0.93,
  "f1_macro": 0.94,
  "confusion_matrix": [[45, 5], [3, 47]],
  "roc_auc": 0.97,
  "log_loss": 0.15
}
```

### Run Metadata

`run.json` now includes metrics_v1 pointer:

```json
{
  "schema_version": "run.v0.3.3",
  "metrics_v1": {
    "schema_version": "metrics.v1",
    "metrics_profile": "classification.proba.v1",
    "artifact_path": "metrics.v1.json"
  },
  "artifacts": {
    "model_pkl": "artifacts/model.pkl",
    "metrics_v1_json": "metrics.v1.json"
  }
}
```

### Backward Compatibility

- `metrics.json` (Phase 2) remains unchanged
- All existing tools continue to work
- Profile fields in `run.json` appear together or not at all

---

## Feature Importance (v0.3.4+)

Phase 3.4 adds read-only feature importance extraction for supported models.

### Supported Models

Feature importance is only available for models with native importance signals:

| Model | Supported | Importance Type |
|-------|-----------|-----------------|
| RandomForest | ✅ | Gini importance |
| LogisticRegression | ❌ | Not in v1 |
| LinearSVC | ❌ | Not in v1 |

**No approximations**: If the model doesn't support native importance, no artifact is emitted.

### Feature Importance Artifact

RandomForest runs produce `artifacts/feature_importance.v1.json`:

```json
{
  "schema_version": "feature_importance.v1",
  "model_family": "random_forest",
  "importance_type": "gini_importance",
  "num_features": 10,
  "features_by_importance": [
    {"name": "feature_a", "importance": 0.35, "rank": 1},
    {"name": "feature_b", "importance": 0.25, "rank": 2}
  ],
  "features_by_original_order": [
    {"name": "feature_a", "importance": 0.35, "index": 0},
    {"name": "feature_b", "importance": 0.25, "index": 1}
  ],
  "top_k": ["feature_a", "feature_b"]
}
```

### Run Metadata

`run.json` includes feature importance reference when available:

```json
{
  "feature_importance_schema_version": "feature_importance.v1",
  "feature_importance_artifact": "artifacts/feature_importance.v1.json",
  "artifacts": {
    "model_pkl": "artifacts/model.pkl",
    "feature_importance_json": "artifacts/feature_importance.v1.json"
  }
}
```

When feature importance is not available, these fields are omitted entirely (not null).

### Diagnostics

Unsupported models emit structured diagnostics:

| Code | Description |
|------|-------------|
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | Model doesn't support native feature importance |
| `FEATURE_NAMES_UNAVAILABLE` | Feature names could not be resolved |

### Not Supported in v1

The following are explicitly out of scope for v1:

- Coefficient-based importance for linear models
- SHAP/LIME explanations
- Permutation importance
- Partial dependence plots

### Supported Hyperparameters

**Logistic Regression:**
- `C` (float, > 0): Regularization strength
- `max_iter` (int, > 0): Maximum iterations
- `solver` (str): Optimization solver
- `warm_start` (bool): Reuse previous solution

**Random Forest:**
- `n_estimators` (int, > 0): Number of trees
- `max_depth` (int or None): Maximum tree depth
- `min_samples_split` (int, >= 2): Min samples to split
- `min_samples_leaf` (int, > 0): Min samples per leaf

**Linear SVC:**
- `C` (float, > 0): Regularization strength
- `max_iter` (int, > 0): Maximum iterations

---

## Linear Coefficients (v0.3.5+)

Phase 3.5 adds read-only coefficient extraction for linear classifiers.

### Supported Models

Linear coefficients are available for models with native `coef_` attribute:

| Model | Supported | Coefficient Type |
|-------|-----------|------------------|
| LogisticRegression | ✅ | Log-odds coefficients |
| LinearSVC | ✅ | SVM coefficients |
| RandomForest | ❌ | Use Feature Importance instead |

**No approximations**: If the model doesn't support native coefficients, no artifact is emitted.

### Coefficient Space (IMPORTANT)

**All coefficients are in STANDARDIZED feature space.**

This means:
- Coefficients correspond to features AFTER StandardScaler
- Values represent influence per 1 standard deviation increase
- No attempt is made to "invert" scaling back to raw feature units
- Comparing coefficients across features is meaningful (same scale)
- Comparing coefficients to raw feature values is NOT meaningful

### Linear Coefficients Artifact

Linear model runs produce `artifacts/linear_coefficients.v1.json`:

```json
{
  "schema_version": "linear_coefficients.v1",
  "model_family": "logistic_regression",
  "coefficient_space": "standardized",
  "num_features": 10,
  "num_classes": 2,
  "classes": [0, 1],
  "intercepts": [
    {"class": 1, "intercept": 0.5}
  ],
  "coefficients_by_class": [
    {
      "class": 1,
      "features": [
        {"name": "feature_a", "coefficient": 2.35, "abs_coefficient": 2.35, "rank": 1},
        {"name": "feature_b", "coefficient": -1.25, "abs_coefficient": 1.25, "rank": 2}
      ]
    }
  ],
  "top_k_by_class": [
    {"class": 1, "top_features": ["feature_a", "feature_b"]}
  ]
}
```

### Multiclass Support

For multiclass classification (3+ classes), coefficients are grouped per class:

- Each class has its own set of coefficients
- Class labels are sorted deterministically
- No aggregation across classes in v1

### Run Metadata

`run.json` includes linear coefficients reference when available:

```json
{
  "linear_coefficients_schema_version": "linear_coefficients.v1",
  "linear_coefficients_artifact": "artifacts/linear_coefficients.v1.json",
  "artifacts": {
    "model_pkl": "artifacts/model.pkl",
    "linear_coefficients_json": "artifacts/linear_coefficients.v1.json"
  }
}
```

When coefficients are not available, these fields are omitted entirely (not null).

### Diagnostics

Unsupported models emit structured diagnostics:

| Code | Description |
|------|-------------|
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | Model doesn't support coefficient extraction |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | Classifier doesn't have coef_ attribute |
| `FEATURE_NAMES_UNAVAILABLE` | Feature names could not be resolved |

### Feature Importance vs Linear Coefficients

| Artifact | Supported Models | What It Shows |
|----------|------------------|---------------|
| Feature Importance (v0.3.4) | RandomForest | Gini importance (tree-based) |
| Linear Coefficients (v0.3.5) | LogisticRegression, LinearSVC | Model coefficients |

These are complementary:
- Use Feature Importance for ensemble models
- Use Linear Coefficients for interpretable linear models

### Interpretation Guide

For LogisticRegression (binary):
- Positive coefficient: Feature increase → Higher probability of positive class
- Negative coefficient: Feature increase → Lower probability of positive class
- Magnitude: Larger absolute value = Stronger influence

Example: `coefficient = 2.0` means +1 std dev in this feature → +2.0 to log-odds

---

## Contract

See [CONTRACT.md](CONTRACT.md) for the full behavioral contract.

See [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) for observability requirements.

See [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) for introspection requirements.

See [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) for UX polish requirements.

See [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) for Phase 3 capability expansion rules.

See [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) for model selection requirements.

See [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) for hyperparameter and profile requirements.

See [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) for model-aware metrics requirements.

See [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) for feature importance requirements.

See [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) for linear coefficients requirements.

See [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) for planned future improvements.

**Phase 2 is complete and frozen. Phase 3 extends Phase 2 without breaking any existing guarantees. See CONTRACT-PHASE-3.md for rules.**

## License

MIT
