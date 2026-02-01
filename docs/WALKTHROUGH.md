# RunForge Walkthrough

A 2-3 minute path through RunForge's core workflow.

---

## Prerequisites

- VS Code with RunForge extension installed
- Python 3.8+ with scikit-learn
- A CSV dataset with a `label` column

---

## Step 1: Set Your Dataset

Set the `RUNFORGE_DATASET` environment variable to your CSV path:

```bash
# Terminal
export RUNFORGE_DATASET=/path/to/your/data.csv
```

Or in VS Code settings for the workspace.

---

## Step 2: Inspect Dataset

**Command:** `RunForge: Inspect Dataset`

This validates your dataset before training:

```
Dataset Inspection
==================
File: /path/to/your/data.csv
Rows: 1000
Columns: 11

Label column: label ✓
Label present: yes

Columns:
  - feature_a (numeric)
  - feature_b (numeric)
  - feature_c (numeric)
  ...
  - label (target)

Features (excluding label): 10
Missing values: 0 rows will be dropped
```

**What to check:**
- `Label present: yes` - Your CSV has a `label` column
- Feature count matches your expectations
- Missing values are acceptable (will be dropped)

---

## Step 3: Train with Profile

**Command:** `RunForge: Train (Standard)` or `RunForge: Train (High Quality)`

When prompted:
1. Enter a run name (e.g., `baseline`)
2. Enter a seed (e.g., `42`) or leave blank for auto

Output shows training progress:

```
RunForge Training Runner v0.3.6.0
==================================================
Preset:         Standard Training (std-train)
Model:          Logistic Regression (logistic_regression)
Profile:        default (v1.0)
...

Training Logistic Regression (80/20 split)...
  Train samples: 800, Val samples: 200
  Epoch 1/3 - val_accuracy: 0.8900
  Epoch 2/3 - val_accuracy: 0.9100
  Epoch 3/3 - val_accuracy: 0.9200

Model saved: .runforge/runs/.../artifacts/model.pkl
Metrics v1 saved: .runforge/runs/.../metrics.v1.json
  Profile: Probability-based (binary with predict_proba)
Linear coefficients saved: .runforge/runs/.../artifacts/linear_coefficients.v1.json
  Top features (class 1): feature_a, feature_b, feature_c
Interpretability index saved: .runforge/runs/.../artifacts/interpretability.index.v1.json
  Available artifacts: 2

==================================================
Training complete!
Run ID:              20240101-120000-abc12345
Validation Accuracy: 0.9200
```

---

## Step 4: Browse Runs

**Command:** `RunForge: Browse Runs`

Select a run to see available actions:

```
Available Runs
==============
1. 20240101-120000-abc12345 (0.92 accuracy) - logistic_regression

Select a run...

Actions:
  > Summary
  > Diagnostics
  > Inspect Artifact
```

**Summary** shows quick stats. **Diagnostics** shows any warnings. **Inspect Artifact** opens the model structure.

---

## Step 5: View Interpretability Index

**Command:** `RunForge: View Latest Interpretability Index`

This shows what interpretability outputs exist:

```
RunForge Interpretability Index
============================================================

Run ID:           20240101-120000-abc12345
RunForge Version: 0.3.6.0
Created:          2024-01-01T12:00:00+00:00

Available Artifacts: 2
------------------------------------------------------------

✓ Metrics v1
    Path:    metrics.v1.json
    Profile: classification.proba.v1
    Accuracy: 92.00%

✗ Feature Importance v1 (not available for this model)

✓ Linear Coefficients v1
    Path:    artifacts/linear_coefficients.v1.json
    Model:   logistic_regression
    Classes: 2
    Class 1: feature_a, feature_b, feature_c, feature_d, feature_e
```

This tells you:
- **Metrics v1** is always available
- **Feature Importance** is only for RandomForest
- **Linear Coefficients** is only for linear models

---

## Step 6: Drill into Details

### View Metrics

**Command:** `RunForge: View Latest Metrics`

```
RunForge Metrics v1
==================================================

Schema Version:   metrics.v1
Metrics Profile:  classification.proba.v1

Classification Metrics
--------------------------------------------------
  Accuracy:        0.9200
  ROC-AUC:         0.9650
  Log Loss:        0.2341

Class Distribution
--------------------------------------------------
  Class 0: 450 samples (45.0%)
  Class 1: 550 samples (55.0%)
```

### View Coefficients (Linear Models)

**Command:** `RunForge: View Latest Linear Coefficients`

```
RunForge Linear Coefficients
============================================================

IMPORTANT: Coefficients are in STANDARDIZED feature space
Values represent influence per 1 STANDARD DEVIATION of each feature

Model Family:       logistic_regression
Coefficient Space:  standardized
Classes:            0, 1

Coefficients for Class 1
------------------------------------------------------------
   1. feature_a            + ████████████████████    2.3500
   2. feature_b            - ████████████            1.2500
   3. feature_c            + ████████                0.8900
   ...
```

### View Feature Importance (RandomForest)

**Command:** `RunForge: View Latest Feature Importance`

(Only available if you trained with `--model random_forest` or the `thorough` profile)

```
RunForge Feature Importance
==================================================

Model Family:     random_forest
Importance Type:  gini_importance

Top Features
--------------------------------------------------
   1. feature_a              ████████████████████ 35.00%
   2. feature_b              ████████████         25.00%
   3. feature_c              ████████              20.00%
   ...
```

---

## What's Next?

- **Change model:** Set `runforge.modelFamily` in settings to `random_forest` or `linear_svc`
- **Use profiles:** Set `runforge.profile` to `fast` or `thorough`
- **Compare runs:** Use `Browse Runs` to compare accuracy across experiments
- **Verify provenance:** Check `run.json` for dataset fingerprint and exact configuration

---

## Quick Reference

| Task | Command |
|------|---------|
| Validate data | `RunForge: Inspect Dataset` |
| Train model | `RunForge: Train (Standard)` |
| See all runs | `RunForge: Browse Runs` |
| What's available? | `RunForge: View Latest Interpretability Index` |
| Metrics detail | `RunForge: View Latest Metrics` |
| Feature ranking | `RunForge: View Latest Feature Importance` |
| Model weights | `RunForge: View Latest Linear Coefficients` |
| Run metadata | `RunForge: Open Latest Run Metadata` |
| Model structure | `RunForge: Inspect Model Artifact` |
