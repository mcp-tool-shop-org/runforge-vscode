---
title: Reference
description: Presets, run lifecycle, interpretability, commands, settings, and security model.
sidebar:
  order: 2
---

## Presets

RunForge ships with deterministic training presets. Each preset defines a scikit-learn pipeline with fixed hyperparameters.

| Preset | Task | Algorithm | Key parameters |
|--------|------|-----------|----------------|
| `RandomForest` | Classification | RandomForestClassifier | 100 trees, seeded |
| `GradientBoosting` | Classification | GradientBoostingClassifier | 100 estimators, lr=0.1 |
| `LogisticRegression` | Classification | LogisticRegression | L2 penalty, max 1000 iter |
| `LinearRegression` | Regression | LinearRegression | OLS, no regularization |
| `Ridge` | Regression | Ridge | L2, alpha=1.0 |
| `Lasso` | Regression | Lasso | L1, alpha=1.0 |
| `SVM` | Classification | SVC | RBF kernel, seeded |

All presets include `StandardScaler` as the first pipeline step.

## Run lifecycle

```
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
  .runforge/runs/<run-id>/
```

Every step is deterministic given the same seed. The seed defaults to 42 and can be changed in settings.

## Interpretability

RunForge extracts interpretability artifacts automatically after training.

### Feature importance (tree models)

For `RandomForest` and `GradientBoosting`, the extension extracts Gini importance scores for each feature and saves them as `feature_importance.v1.json`.

### Linear coefficients

For `LogisticRegression`, `LinearRegression`, `Ridge`, and `Lasso`, the extension extracts model coefficients and saves them as `linear_coefficients.v1.json`.

### Unified index

All interpretability artifacts are indexed in `interpretability.index.v1.json`, which lists what was extracted, for which model type, and where each artifact is stored.

## Commands

| Command | Description |
|---------|-------------|
| `RunForge: Train Model` | Start a new training run |
| `RunForge: Show Runs` | List all runs in the current workspace |
| `RunForge: Show Run Details` | View metrics and artifacts for a specific run |
| `RunForge: Compare Runs` | Side-by-side comparison of two runs |
| `RunForge: Export Model` | Export a trained model for deployment |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `runforge.pythonPath` | Auto-detect | Path to the Python interpreter |
| `runforge.seed` | `42` | Random seed for deterministic runs |
| `runforge.autoOpen` | `true` | Auto-open results after training |

## Security and data scope

**Data touched:** workspace CSV files (read-only for training), `.runforge/` directory (run metadata, model artifacts, metrics). Python subprocess stdout/stderr.

**Data NOT touched:** no files outside the open workspace, no browser data, no OS credentials.

**Permissions:** filesystem read/write within workspace only, Python subprocess execution.

**No network egress.** All operations are local. **No telemetry** is collected or sent.

For the full trust model, see [TRUST_MODEL.md](https://github.com/mcp-tool-shop-org/runforge-vscode/blob/main/docs/TRUST_MODEL.md).
