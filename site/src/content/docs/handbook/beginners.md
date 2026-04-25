---
title: For Beginners
description: New to RunForge? Start here for a gentle introduction.
sidebar:
  order: 99
---

## What Is This Tool?

RunForge is a VS Code extension that lets you train machine learning models without leaving your editor. You point it at a CSV file, pick a model type, and hit a command — it handles the rest: data splitting, training, metrics, and saving everything in a structured, traceable format.

The key difference from other ML tools: RunForge is **deterministic**. Run the same training twice with the same data and settings, and you get the exact same model. Every run records exactly what code, data, and configuration produced it, so you can always trace back from a model to its origins.

## Who Is This For?

- **Data scientists** who want reproducible training runs without setting up MLflow or similar infrastructure
- **ML engineers** who need provenance tracking for model artifacts
- **Developers** exploring ML who want a simple, local-first workflow with no cloud dependencies
- **Teams** that need auditable ML workflows where every model can be traced to its inputs

## Prerequisites

Before starting, you need:

1. **VS Code 1.85+** — Download from [code.visualstudio.com](https://code.visualstudio.com/) if needed
2. **Python 3.8+** — Check with `python --version`. Install from [python.org](https://www.python.org/downloads/)
3. **scikit-learn, joblib, numpy** — Install with `pip install scikit-learn joblib numpy`
4. **A CSV file** — Any classification dataset with a column named `label`. If you don't have one, the classic Iris dataset works: `from sklearn.datasets import load_iris`

No API keys, no cloud accounts, no Docker. Everything runs locally.

## Your First 5 Minutes

**Minute 1: Install the extension**
Open VS Code, go to Extensions (`Ctrl+Shift+X`), search for "RunForge", and install it.

**Minute 2: Open a workspace with a CSV**
Open a folder in VS Code that contains your CSV file. The CSV needs a column called `label`.

**Minute 3: Run training**
Open the Command Palette (`Ctrl+Shift+P`), type "RunForge", and select `RunForge: Train (Standard)`.

**Minute 4: Check results**
Open the Command Palette again and run `RunForge: View Latest Metrics`. You'll see accuracy, precision, recall, and F1 scores.

**Minute 5: Explore artifacts**
Look in your workspace's `.ml/runs/` folder. Each run has a `run.json` (metadata), `metrics.v1.json` (detailed scores), and `artifacts/model.pkl` (the trained model). Try `RunForge: Browse Runs` for a guided tour.

## Common Mistakes

1. **No `label` column in the CSV** — RunForge requires a column named exactly `label`. If your target column is named something else, rename it before training
2. **Non-numeric features** — RunForge expects all feature columns to be numeric. Encode categorical variables (one-hot, label encoding) before training
3. **Python not found** — If RunForge can't find Python, set `runforge.pythonPath` in VS Code settings to the full path of your Python executable
4. **Missing scikit-learn** — RunForge runs scikit-learn under the hood. If you get import errors, install it: `pip install scikit-learn`
5. **Expecting regression** — RunForge currently focuses on classification tasks (Logistic Regression, Random Forest, Linear SVC). It does not support regression models like Linear Regression or Ridge

## Next Steps

- Read the [Getting Started](../getting-started/) guide for detailed setup and model selection
- See the [Reference](../reference/) for all commands, settings, hyperparameters, and artifact schemas
- Explore the [Trust Model](https://github.com/mcp-tool-shop-org/runforge-vscode/blob/main/docs/TRUST_MODEL.md) for RunForge's security and provenance guarantees

## Glossary

- **Deterministic** — Given the same inputs and configuration, the output is always identical. RunForge seeds all random operations so training is repeatable
- **Provenance** — The ability to trace a model back to the exact code, data, and settings that produced it. RunForge records git SHA, Python path, extension version, and dataset fingerprint in every run
- **Pipeline** — A scikit-learn Pipeline that chains preprocessing (StandardScaler) with a classifier. The pipeline is saved as a single artifact that includes all steps needed for inference
- **StandardScaler** — A preprocessing step that normalizes features to have zero mean and unit variance. Every RunForge model includes this automatically
- **Preset** — A pre-configured training configuration (std-train for quick runs, hq-train for thorough runs)
- **Profile** — A named set of hyperparameter overrides (`default`, `fast`, `thorough`). Profiles can change model family and tuning parameters
- **Run** — A single training execution. Each run produces a `run.json` metadata file and a set of artifacts under `.ml/runs/<run-id>/`
- **Feature importance** — A measure of how much each input feature contributes to model predictions. Available for Random Forest (Gini importance)
- **Linear coefficients** — The weights a linear model assigns to each feature. Available for Logistic Regression and Linear SVC. Reported in standardized (scaled) feature space
- **Interpretability index** — A unified artifact that lists all interpretability outputs for a run, their schema versions, and file paths
- **Fingerprint** — A SHA-256 hash of the dataset, used to detect changes and ensure reproducibility
