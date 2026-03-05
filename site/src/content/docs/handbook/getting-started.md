---
title: Getting Started
description: Install RunForge, prepare a dataset, and run your first ML training session.
sidebar:
  order: 1
---

This page walks you through installing RunForge, preparing a dataset, and running your first deterministic training session.

## Prerequisites

- **VS Code** 1.80 or later
- **Python 3.8+** with `scikit-learn`, `joblib`, and `numpy`
- A CSV dataset with a label column

## Installation

### From the Marketplace

Search for "RunForge" in the VS Code Extensions panel, or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.runforge).

### From source

```bash
git clone https://github.com/mcp-tool-shop-org/runforge-vscode.git
cd runforge-vscode
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Your first run

1. **Open a workspace** that contains a CSV file (e.g., `dataset.csv`)
2. **Open the Command Palette** (`Ctrl+Shift+P`) and run `RunForge: Train Model`
3. **Select your dataset** — RunForge scans the workspace for CSV files
4. **Pick a preset** — start with `RandomForest` for classification or `LinearRegression` for regression
5. **Choose the label column** — the column your model will predict
6. **Run** — training starts immediately

### What happens during a run

1. The dataset is validated (label column must exist, values must be numeric)
2. A SHA-256 fingerprint of the dataset is computed
3. Data is split 80/20 train/validation (deterministic, stratified for classification)
4. The pipeline is fit (StandardScaler + classifier/regressor)
5. Metrics are computed against the validation set
6. Interpretability features are extracted (feature importance, coefficients)

### Where artifacts go

All run artifacts are saved under `.runforge/runs/<run-id>/`:

| File | Contents |
|------|----------|
| `run.json` | Metadata — preset, seed, git SHA, Python path, extension version |
| `metrics.json` | Accuracy, precision, recall (classification) or MSE, R2 (regression) |
| `metrics.v1.json` | Detailed per-profile metrics |
| `artifacts/model.pkl` | Trained scikit-learn pipeline |
| `artifacts/feature_importance.v1.json` | Feature importance (tree models) |
| `artifacts/linear_coefficients.v1.json` | Coefficients (linear models) |
| `artifacts/interpretability.index.v1.json` | Unified interpretability index |

## Next steps

See [Reference](/runforge-vscode/handbook/reference/) for the full list of presets, configuration options, and the interpretability framework.
