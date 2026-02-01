"""
Training runner for ml_runner

Phase 2.1: CSV-based supervised learning with Logistic Regression.
- Uses 'label' column (not last column)
- 80/20 deterministic train/val split
- Strict metrics schema (3 keys only)
- Pipeline artifact (includes preprocessing)
- Handles missing values
"""

import json
import os
import pickle
import random
from pathlib import Path
from typing import Optional, Tuple, List

import numpy as np

from .presets import get_preset


def run_training(
    preset_id: str,
    out_dir: str,
    seed: Optional[int] = None,
    device: str = "cpu",
) -> None:
    """
    Execute a training run on CSV data.

    Trains a Logistic Regression classifier on the dataset specified
    by RUNFORGE_DATASET environment variable.

    Args:
        preset_id: The preset ID to use (std-train or hq-train)
        out_dir: Output directory for artifacts
        seed: Random seed (optional)
        device: Device to use (cpu for Phase 2)
    """
    # Get preset configuration
    preset = get_preset(preset_id)
    defaults = preset["defaults"]

    # Set seed for reproducibility
    actual_seed = seed if seed is not None else defaults["seed"]
    random.seed(actual_seed)
    np.random.seed(actual_seed)

    # Ensure output directory exists
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    # Create artifacts directory
    artifacts_path = out_path / "artifacts"
    artifacts_path.mkdir(parents=True, exist_ok=True)

    # Get dataset path from environment
    dataset_path = os.environ.get("RUNFORGE_DATASET")
    if not dataset_path:
        raise ValueError(
            "RUNFORGE_DATASET environment variable not set. "
            "Please set it to the path of your CSV file."
        )

    dataset_file = Path(dataset_path)
    if not dataset_file.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    print(f"RunForge Training Runner v0.2.1")
    print(f"=" * 50)
    print(f"Preset:         {preset['name']} ({preset_id})")
    print(f"Epochs:         {defaults['epochs']}")
    print(f"Learning Rate:  {defaults['learning_rate']}")
    print(f"Regularization: {defaults['regularization']}")
    print(f"Solver:         {defaults['solver']}")
    print(f"Max Iter:       {defaults['max_iter']}")
    print(f"Seed:           {actual_seed}")
    print(f"Device:         {device}")
    print(f"Dataset:        {dataset_path}")
    print(f"Output:         {out_dir}")
    print(f"=" * 50)
    print()

    # Load and parse CSV
    print("Loading dataset...")
    X, y, num_samples, num_features = load_csv(dataset_file)
    print(f"  Samples:  {num_samples}")
    print(f"  Features: {num_features}")
    print()

    # Train model with 80/20 split
    print("Training Logistic Regression (80/20 split)...")
    pipeline, accuracy = train_logistic_regression(
        X=X,
        y=y,
        regularization=defaults["regularization"],
        solver=defaults["solver"],
        max_iter=defaults["max_iter"],
        epochs=defaults["epochs"],
        seed=actual_seed,
    )

    # Save pipeline artifact
    model_path = artifacts_path / "model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(pipeline, f)
    print(f"Model saved: {model_path}")

    # Write metrics.json (STRICT: exactly 3 keys)
    metrics = {
        "accuracy": round(accuracy, 4),
        "num_samples": num_samples,
        "num_features": num_features,
    }

    metrics_path = out_path / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)

    print()
    print(f"=" * 50)
    print(f"Training complete!")
    print(f"Validation Accuracy: {accuracy:.4f}")
    print(f"Total Samples:       {num_samples}")
    print(f"Features:            {num_features}")
    print(f"Model saved:         {model_path}")
    print(f"Metrics saved:       {metrics_path}")
    print(f"=" * 50)


def load_csv(path: Path) -> Tuple[np.ndarray, np.ndarray, int, int]:
    """
    Load CSV file into numpy arrays.

    CSV format requirements:
    - First row is header
    - Must have a column named 'label' (case-sensitive)
    - All other columns are features
    - All values must be numeric
    - Rows with missing values are dropped

    Returns:
        X: Feature matrix (n_samples, n_features)
        y: Label vector (n_samples,)
        num_samples: Number of samples (after dropping missing)
        num_features: Number of features
    """
    # Read CSV manually (stdlib only)
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    if len(lines) < 2:
        raise ValueError("CSV must have header row and at least one data row")

    # Parse header
    header = [h.strip() for h in lines[0].strip().split(",")]

    # Find label column (case-sensitive: must be exactly 'label')
    if "label" not in header:
        raise ValueError("CSV must contain a 'label' column.")

    label_idx = header.index("label")
    feature_names = [h for i, h in enumerate(header) if i != label_idx]
    num_features = len(feature_names)

    # Parse data rows
    data_rows: List[List[float]] = []
    labels: List[float] = []
    rows_dropped = 0

    for i, line in enumerate(lines[1:], start=2):
        line = line.strip()
        if not line:
            continue

        parts = [p.strip() for p in line.split(",")]
        if len(parts) != len(header):
            raise ValueError(f"Row {i}: expected {len(header)} columns, got {len(parts)}")

        # Check for missing values (empty strings)
        has_missing = any(p == "" for p in parts)
        if has_missing:
            rows_dropped += 1
            continue

        # Parse numeric values
        try:
            row_values = []
            label_value = None
            for j, p in enumerate(parts):
                val = float(p)
                if j == label_idx:
                    label_value = val
                else:
                    row_values.append(val)

            data_rows.append(row_values)
            labels.append(label_value)
        except ValueError:
            # Find which column caused the error
            for j, p in enumerate(parts):
                try:
                    float(p)
                except ValueError:
                    col_name = header[j]
                    raise ValueError(f"Non-numeric value in column '{col_name}' at row {i}")

    if rows_dropped > 0:
        print(f"Dropped {rows_dropped} rows with missing values")

    if not data_rows:
        raise ValueError("CSV has no valid data rows after dropping missing values")

    # Convert to numpy
    X = np.array(data_rows)
    y = np.array(labels)
    num_samples = X.shape[0]

    return X, y, num_samples, num_features


def train_logistic_regression(
    X: np.ndarray,
    y: np.ndarray,
    regularization: float,
    solver: str,
    max_iter: int,
    epochs: int,
    seed: int,
) -> Tuple[object, float]:
    """
    Train a Logistic Regression classifier using sklearn Pipeline.

    Uses deterministic 80/20 train/val split.
    Accuracy is computed on validation set only.

    Args:
        X: Feature matrix
        y: Labels
        regularization: Regularization strength (C = 1/regularization)
        solver: Solver to use (lbfgs, etc.)
        max_iter: Maximum iterations per solver call
        epochs: Number of training epochs (for progress output)
        seed: Random seed

    Returns:
        pipeline: Trained sklearn Pipeline (scaler + classifier)
        accuracy: Validation accuracy
    """
    # Import sklearn here to defer import until needed
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    # Deterministic 80/20 train/val split
    try:
        # Try stratified split first
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=seed, stratify=y
        )
    except ValueError:
        # Fall back to non-stratified if stratify fails (e.g., too few samples per class)
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=seed
        )

    print(f"  Train samples: {len(X_train)}, Val samples: {len(X_val)}")

    # C is inverse of regularization strength
    C = 1.0 / regularization if regularization > 0 else 1e6

    # Create pipeline with scaler and classifier
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', LogisticRegression(
            C=C,
            solver=solver,
            max_iter=max_iter,
            random_state=seed,
            warm_start=True,
        ))
    ])

    # Simulate epochs for progress output
    for epoch in range(1, epochs + 1):
        # Adjust max_iter for intermediate epochs
        clf = pipeline.named_steps['clf']
        if epoch == epochs:
            clf.max_iter = max_iter
        else:
            clf.max_iter = max(1, max_iter // epochs)

        pipeline.fit(X_train, y_train)

        # Compute validation accuracy for progress
        val_accuracy = pipeline.score(X_val, y_val)
        print(f"  Epoch {epoch}/{epochs} - val_accuracy: {val_accuracy:.4f}")

    # Final validation accuracy
    accuracy = pipeline.score(X_val, y_val)

    return pipeline, accuracy
