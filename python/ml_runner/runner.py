"""
Training runner for ml_runner

Phase 2.1: CSV-based supervised learning with Logistic Regression.
- Uses 'label' column (not last column)
- 80/20 deterministic train/val split
- Strict metrics schema (3 keys only)
- Pipeline artifact (includes preprocessing)
- Handles missing values

Phase 2.2.1: Observability layer (no training changes)
- Run metadata export (run.json)
- Dataset fingerprinting
- Provenance tracking

Phase 3.1: Model selection
- Explicit model family choice via --model flag
- Supported: logistic_regression, random_forest, linear_svc
- Default: logistic_regression (unchanged from Phase 2)

Phase 3.2: Hyperparameters and profiles
- CLI --param overrides (highest priority)
- Named training profiles with expansion
- Type validation and range checking
"""

import json
import os
import pickle
import random
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, List, NamedTuple

import numpy as np

from .presets import get_preset
from .inspect import compute_dataset_fingerprint
from .metadata import generate_run_id, create_run_metadata, write_run_metadata, RUNFORGE_VERSION
from .provenance import append_run_to_index
from .model_factory import create_estimator, get_model_display_name
from .resolver import resolve_config, ResolvedConfig
from .hyperparams import validate_and_convert, HyperparamError


class LoadResult(NamedTuple):
    """Result from load_csv with all observability data."""
    X: np.ndarray
    y: np.ndarray
    num_samples: int
    num_features: int
    rows_dropped: int


def _find_runforge_dir(start_path: Path) -> Optional[Path]:
    """
    Find the .runforge directory by walking up from start_path.

    Returns the .runforge directory if found, None otherwise.
    Handles the case where start_path is already inside .runforge.
    """
    current = start_path.resolve()

    # Check if we're already inside a .runforge directory
    for parent in [current] + list(current.parents):
        if parent.name == ".runforge":
            return parent

    # Otherwise look for .runforge as a sibling or in parent directories
    for parent in current.parents:
        runforge = parent / ".runforge"
        if runforge.exists() and runforge.is_dir():
            return runforge

    return None


def run_training(
    preset_id: str,
    out_dir: str,
    seed: Optional[int] = None,
    device: str = "cpu",
    model_family: str = "logistic_regression",
    cli_params: Optional[Dict[str, str]] = None,
    profile_name: Optional[str] = None,
) -> None:
    """
    Execute a training run on CSV data.

    Trains a classifier on the dataset specified by RUNFORGE_DATASET
    environment variable.

    Args:
        preset_id: The preset ID to use (std-train or hq-train)
        out_dir: Output directory for artifacts
        seed: Random seed (optional)
        device: Device to use (cpu for Phase 2)
        model_family: Model family to use (Phase 3.1)
            - logistic_regression (default)
            - random_forest
            - linear_svc
        cli_params: Hyperparameters from --param CLI args (Phase 3.2)
        profile_name: Training profile name (Phase 3.2)
    """
    # Get preset configuration
    preset = get_preset(preset_id)
    defaults = preset["defaults"]

    # Phase 3.2: Resolve hyperparameters from profile + CLI
    resolved = resolve_config(
        model_family=model_family,
        cli_params=cli_params,
        profile_name=profile_name,
    )

    # Profile can override model_family
    actual_model_family = resolved.model_family

    # Validate and convert hyperparameters to proper types
    typed_hyperparams: Dict[str, Any] = {}
    if resolved.hyperparameters:
        # Separate string params (from CLI) from already-typed params (from profile)
        string_params = {
            k: v for k, v in resolved.hyperparameters.items()
            if isinstance(v, str)
        }
        typed_params = {
            k: v for k, v in resolved.hyperparameters.items()
            if not isinstance(v, str)
        }

        # Validate and convert string params
        if string_params:
            typed_hyperparams.update(validate_and_convert(actual_model_family, string_params))

        # Add already-typed params directly
        typed_hyperparams.update(typed_params)

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

    print(f"RunForge Training Runner v{RUNFORGE_VERSION}")
    print(f"=" * 50)
    print(f"Preset:         {preset['name']} ({preset_id})")
    print(f"Model:          {get_model_display_name(actual_model_family)} ({actual_model_family})")
    if resolved.has_profile():
        print(f"Profile:        {resolved.profile_name} (v{resolved.profile_version})")
    print(f"Epochs:         {defaults['epochs']}")
    print(f"Learning Rate:  {defaults['learning_rate']}")
    print(f"Regularization: {defaults['regularization']}")
    print(f"Solver:         {defaults['solver']}")
    print(f"Max Iter:       {defaults['max_iter']}")
    if typed_hyperparams:
        print(f"Hyperparams:    {typed_hyperparams}")
    print(f"Seed:           {actual_seed}")
    print(f"Device:         {device}")
    print(f"Dataset:        {dataset_path}")
    print(f"Output:         {out_dir}")
    print(f"=" * 50)
    print()

    # Phase 2.2.1: Compute dataset fingerprint before loading
    dataset_fingerprint = compute_dataset_fingerprint(dataset_file)
    print(f"Dataset fingerprint: {dataset_fingerprint[:16]}...")

    # Load and parse CSV
    print("Loading dataset...")
    load_result = load_csv(dataset_file)
    X, y = load_result.X, load_result.y
    num_samples = load_result.num_samples
    num_features = load_result.num_features
    rows_dropped = load_result.rows_dropped
    print(f"  Samples:  {num_samples}")
    print(f"  Features: {num_features}")
    if rows_dropped > 0:
        print(f"  Dropped:  {rows_dropped} rows with missing values")
    print()

    # Train model with 80/20 split
    model_name = get_model_display_name(actual_model_family)
    print(f"Training {model_name} (80/20 split)...")
    pipeline, accuracy = train_model(
        X=X,
        y=y,
        model_family=actual_model_family,
        regularization=defaults["regularization"],
        solver=defaults["solver"],
        max_iter=defaults["max_iter"],
        epochs=defaults["epochs"],
        seed=actual_seed,
        hyperparams=typed_hyperparams,
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

    # Phase 2.2.1: Generate run metadata
    run_id = generate_run_id(dataset_fingerprint, "label")
    metadata = create_run_metadata(
        run_id=run_id,
        dataset_path=str(dataset_file.resolve()),
        dataset_fingerprint=dataset_fingerprint,
        label_column="label",
        num_samples=num_samples,
        num_features=num_features,
        dropped_rows=rows_dropped,
        accuracy=round(accuracy, 4),
        model_pkl_path="artifacts/model.pkl",
        model_family=actual_model_family,
    )

    # Write run.json to output directory
    run_json_path = write_run_metadata(metadata, out_path)
    print(f"Metadata saved: {run_json_path}")

    # Phase 2.2.1: Update provenance index
    # Find the .runforge directory by walking up from output directory
    runforge_dir = _find_runforge_dir(out_path)
    if runforge_dir:
        try:
            # Calculate relative path from .runforge to the run
            run_rel_path = out_path.relative_to(runforge_dir)
            append_run_to_index(
                runforge_dir=runforge_dir,
                run_id=run_id,
                created_at=metadata["created_at"],
                dataset_fingerprint=dataset_fingerprint,
                label_column="label",
                run_dir=str(run_rel_path / "run.json").replace("\\", "/"),
                model_pkl=str(run_rel_path / "artifacts" / "model.pkl").replace("\\", "/"),
            )
            print(f"Provenance index updated: {runforge_dir / 'index.json'}")
        except Exception as e:
            # Don't fail training if provenance update fails
            print(f"Warning: Could not update provenance index: {e}")
    else:
        print("Note: Not in a .runforge workspace, skipping provenance index")

    print()
    print(f"=" * 50)
    print(f"Training complete!")
    print(f"Run ID:              {run_id}")
    print(f"Validation Accuracy: {accuracy:.4f}")
    print(f"Total Samples:       {num_samples}")
    print(f"Features:            {num_features}")
    print(f"Dropped Rows:        {rows_dropped}")
    print(f"Model saved:         {model_path}")
    print(f"Metrics saved:       {metrics_path}")
    print(f"=" * 50)


def load_csv(path: Path) -> LoadResult:
    """
    Load CSV file into numpy arrays.

    CSV format requirements:
    - First row is header
    - Must have a column named 'label' (case-sensitive)
    - All other columns are features
    - All values must be numeric
    - Rows with missing values are dropped

    Returns:
        LoadResult with:
        - X: Feature matrix (n_samples, n_features)
        - y: Label vector (n_samples,)
        - num_samples: Number of samples (after dropping missing)
        - num_features: Number of features
        - rows_dropped: Count of rows dropped due to missing values
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

    return LoadResult(X, y, num_samples, num_features, rows_dropped)


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


def train_model(
    X: np.ndarray,
    y: np.ndarray,
    model_family: str,
    regularization: float,
    solver: str,
    max_iter: int,
    epochs: int,
    seed: int,
    hyperparams: Optional[Dict[str, Any]] = None,
) -> Tuple[object, float]:
    """
    Train a classifier using sklearn Pipeline with model selection.

    Phase 3.1: Supports multiple model families via model_factory.
    Phase 3.2: Accepts hyperparameter overrides from profiles/CLI.
    Uses deterministic 80/20 train/val split.
    Accuracy is computed on validation set only.

    Args:
        X: Feature matrix
        y: Labels
        model_family: Model identifier (logistic_regression, random_forest, linear_svc)
        regularization: Regularization strength (C = 1/regularization for applicable models)
        solver: Solver to use (for logistic_regression)
        max_iter: Maximum iterations
        epochs: Number of training epochs (for progress output)
        seed: Random seed
        hyperparams: Optional dict of hyperparameter overrides (Phase 3.2)

    Returns:
        pipeline: Trained sklearn Pipeline (scaler + classifier)
        accuracy: Validation accuracy
    """
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

    # Phase 3.2: Merge hyperparams with defaults
    # Precedence: hyperparams > preset defaults
    hp = hyperparams or {}

    # C is inverse of regularization strength (for applicable models)
    # Can be overridden by hyperparams
    C = hp.get("C", 1.0 / regularization if regularization > 0 else 1e6)

    # Create estimator using model factory
    # Build model-specific kwargs based on what each model accepts
    # Phase 3.2: hyperparams override preset defaults
    if model_family == "logistic_regression":
        estimator = create_estimator(
            model_family,
            random_state=seed,
            C=C,
            solver=hp.get("solver", solver),
            max_iter=hp.get("max_iter", max_iter),
            warm_start=hp.get("warm_start", True),
        )
    elif model_family == "random_forest":
        estimator = create_estimator(
            model_family,
            random_state=seed,
            n_estimators=hp.get("n_estimators", 100),
            max_depth=hp.get("max_depth", None),
        )
    elif model_family == "linear_svc":
        estimator = create_estimator(
            model_family,
            random_state=seed,
            C=C,
            max_iter=hp.get("max_iter", max_iter),
        )
    else:
        # Fallback (should not reach here due to CLI validation)
        estimator = create_estimator(model_family, random_state=seed)

    # Create pipeline with scaler and classifier
    # Note: Step name is 'clf' for backward compatibility with artifact inspection
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', estimator)
    ])

    # Training loop
    # Note: epochs are only meaningful for models with warm_start (LogisticRegression)
    # For other models, we train once but show progress
    if model_family == "logistic_regression":
        # Use epochs with warm_start for Logistic Regression
        # Use hyperparam max_iter if provided, else preset default
        effective_max_iter = hp.get("max_iter", max_iter)
        for epoch in range(1, epochs + 1):
            clf = pipeline.named_steps['clf']
            if epoch == epochs:
                clf.max_iter = effective_max_iter
            else:
                clf.max_iter = max(1, effective_max_iter // epochs)

            pipeline.fit(X_train, y_train)
            val_accuracy = pipeline.score(X_val, y_val)
            print(f"  Epoch {epoch}/{epochs} - val_accuracy: {val_accuracy:.4f}")
    else:
        # Single training pass for other models
        pipeline.fit(X_train, y_train)
        val_accuracy = pipeline.score(X_val, y_val)
        print(f"  Training complete - val_accuracy: {val_accuracy:.4f}")

    # Final validation accuracy
    accuracy = pipeline.score(X_val, y_val)

    return pipeline, accuracy
