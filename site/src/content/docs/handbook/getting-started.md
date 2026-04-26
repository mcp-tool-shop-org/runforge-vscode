---
title: Getting Started
description: Install RunForge, prepare a dataset, and run your first ML training session.
---

This page walks you through installing RunForge, preparing a dataset, and running your first deterministic training session.

## Prerequisites

- **VS Code** 1.85 or later
- **Python 3.8+** with `scikit-learn`, `joblib`, and `numpy`
- A CSV dataset with a column named `label`

## Installation

### From the Marketplace

Search for "RunForge" in the VS Code Extensions panel, or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.runforge).

### From Source

```bash
git clone https://github.com/mcp-tool-shop-org/runforge-vscode.git
cd runforge-vscode
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host with RunForge loaded.

## Prepare Your Dataset

RunForge expects a CSV file with:

- A column named `label` — this is what the model will predict
- All other columns as numeric features
- No header-less data

Rows with missing values are dropped automatically (the count is logged).

## Your First Run

1. **Open a workspace** containing your CSV file
2. **Open the Command Palette** (`Ctrl+Shift+P`)
3. **Run `RunForge: Train (Standard)`** for a quick run, or `RunForge: Train (High Quality)` for a more thorough session
4. Training runs in a Python subprocess — you'll see progress in the VS Code output panel

### What Happens During a Run

1. The dataset is validated (label column must exist, values must be numeric)
2. A SHA-256 fingerprint of the dataset is computed
3. Data is split 80/20 train/validation (deterministic, stratified)
4. The pipeline is fit (StandardScaler + selected classifier)
5. Metrics are computed against the validation set
6. Interpretability features are extracted (feature importance or coefficients, depending on model)

### Where Artifacts Go

All run artifacts are saved under `.ml/runs/<run-id>/`:

| File | Contents |
|------|----------|
| `run.json` | Metadata — run ID, dataset fingerprint, git SHA, Python path, extension version, model family, profile |
| `metrics.json` | Core metrics: accuracy, num_samples, num_features |
| `metrics.v1.json` | Detailed per-profile metrics |
| `artifacts/model.pkl` | Trained scikit-learn pipeline |
| `artifacts/feature_importance.v1.json` | Feature importance (RandomForest only) |
| `artifacts/linear_coefficients.v1.json` | Coefficients (LogisticRegression, LinearSVC) |
| `artifacts/interpretability.index.v1.json` | Unified interpretability index |

## Choose a Model

Configure the model family in VS Code settings:

```json
{
  "runforge.modelFamily": "random_forest"
}
```

Available models: `logistic_regression` (default), `random_forest`, `linear_svc`.

## Choose a Training Profile

Profiles provide pre-configured hyperparameter overrides:

```json
{
  "runforge.profile": "thorough"
}
```

Available profiles: `default`, `fast`, `thorough`. See [Reference](../reference/) for details.

## Workspace Trust

RunForge spawns Python from `runforge.pythonPath` (a workspace-settable path). To prevent an untrusted workspace from inducing RunForge to execute arbitrary Python, every spawn goes through VS Code's **workspace trust** guard. Grant trust via the **Manage Workspace Trust** UI when prompted; without it, training and other Python-spawning commands return a structured error.

## Cancel a Run

While training is running, fire **`RunForge: Cancel Active Training`** from the Command Palette. RunForge sends `SIGTERM` to Python and gives it a 5-second window to write a durable `.cancelled` marker before falling back to `SIGKILL`. See [Cancel and Recovery](../cancel-and-recovery/) for the full state machine.

## Inspect Results

After training, use these commands from the Command Palette:

- **`RunForge: Browse Runs`** — browse all runs with quick actions
- **`RunForge: View Latest Metrics`** — see detailed accuracy, precision, recall, F1
- **`RunForge: View Latest Feature Importance`** — see which features matter (RandomForest)
- **`RunForge: View Latest Linear Coefficients`** — see model coefficients (linear models)
- **`RunForge: Inspect Model Artifact`** — see pipeline structure
- **`RunForge: Export Latest Run as Markdown`** — save a formatted summary
- **`RunForge: Recover Index`** — re-append orphaned runs into `index.json` if a write failed (see [Cancel and Recovery](../cancel-and-recovery/))

## Next Steps

See the [Reference](../reference/) for the full list of commands, settings, and the interpretability framework. For lifecycle controls (cancel, recovery, workspace trust), see [Cancel and Recovery](../cancel-and-recovery/).
