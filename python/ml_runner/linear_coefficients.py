"""
Linear model coefficient extraction for RunForge Phase 3.5.

Read-only extraction of coefficients from trained linear classifiers.
Supports LogisticRegression and LinearSVC only in v1.

IMPORTANT: Coefficients are in STANDARDIZED feature space.
==========================================================
All coefficients correspond to features AFTER StandardScaler.
Values represent influence per 1 standard deviation increase.
No attempt is made to "invert" scaling back to raw feature units.

This is intentional and documented. Users must understand that:
- A coefficient of 2.0 means: +1 std dev in this feature → +2.0 to log-odds
- Comparing coefficients across features is meaningful (same scale)
- Comparing coefficients to raw feature values is NOT meaningful

No approximations - if the model doesn't support native coefficients,
we emit a diagnostic instead.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass
from enum import Enum

import numpy as np


# Schema version
SCHEMA_VERSION = "linear_coefficients.v1"

# Supported model families for coefficient extraction
SUPPORTED_MODELS = {"logistic_regression", "linear_svc"}


class LinearCoefficientsDiagnostic(Enum):
    """Diagnostics for linear coefficient extraction."""
    LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL = "LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL"
    COEFFICIENTS_MISSING_ON_ARTIFACT = "COEFFICIENTS_MISSING_ON_ARTIFACT"
    FEATURE_NAMES_UNAVAILABLE = "FEATURE_NAMES_UNAVAILABLE"


@dataclass
class LinearCoefficientsResult:
    """Result of linear coefficient extraction."""
    success: bool
    artifact: Optional[Dict[str, Any]] = None
    diagnostic: Optional[LinearCoefficientsDiagnostic] = None
    diagnostic_message: Optional[str] = None


def supports_linear_coefficients(model_family: str) -> bool:
    """Check if a model family supports native linear coefficients."""
    return model_family in SUPPORTED_MODELS


def get_classifier_from_pipeline(pipeline: Any) -> Any:
    """Extract classifier from sklearn Pipeline."""
    if hasattr(pipeline, "named_steps"):
        return pipeline.named_steps.get("clf", pipeline)
    return pipeline


def extract_linear_coefficients(
    pipeline: Any,
    model_family: str,
    feature_names: List[str],
) -> LinearCoefficientsResult:
    """
    Extract coefficients from a trained linear classifier pipeline.

    IMPORTANT: Coefficients are in STANDARDIZED feature space (post-StandardScaler).
    They represent influence per 1 standard deviation of each feature.

    Args:
        pipeline: Trained sklearn Pipeline
        model_family: Model family identifier
        feature_names: List of feature column names in original order

    Returns:
        LinearCoefficientsResult with either artifact data or diagnostic
    """
    # Check if model supports coefficient extraction
    if not supports_linear_coefficients(model_family):
        return LinearCoefficientsResult(
            success=False,
            diagnostic=LinearCoefficientsDiagnostic.LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL,
            diagnostic_message=f"Model family '{model_family}' does not support coefficient extraction in v1. "
                             f"Supported models: {', '.join(sorted(SUPPORTED_MODELS))}",
        )

    # Validate feature names
    if not feature_names:
        return LinearCoefficientsResult(
            success=False,
            diagnostic=LinearCoefficientsDiagnostic.FEATURE_NAMES_UNAVAILABLE,
            diagnostic_message="Feature names are required but not available",
        )

    # Get classifier from pipeline
    clf = get_classifier_from_pipeline(pipeline)

    # Extract coefficients
    return _extract_coefficients(clf, model_family, feature_names)


def _extract_coefficients(
    clf: Any,
    model_family: str,
    feature_names: List[str],
) -> LinearCoefficientsResult:
    """
    Extract coefficients from a linear classifier.

    Handles both binary and multiclass cases.
    """
    # Verify classifier has coef_ attribute
    if not hasattr(clf, "coef_"):
        return LinearCoefficientsResult(
            success=False,
            diagnostic=LinearCoefficientsDiagnostic.COEFFICIENTS_MISSING_ON_ARTIFACT,
            diagnostic_message="Classifier does not have coef_ attribute",
        )

    # Get raw coefficients (shape: [n_classes, n_features] or [1, n_features] for binary)
    coef = clf.coef_

    # Get intercepts if available
    intercept = clf.intercept_ if hasattr(clf, "intercept_") else None

    # Get class labels
    classes = clf.classes_ if hasattr(clf, "classes_") else None
    if classes is None:
        return LinearCoefficientsResult(
            success=False,
            diagnostic=LinearCoefficientsDiagnostic.COEFFICIENTS_MISSING_ON_ARTIFACT,
            diagnostic_message="Classifier does not have classes_ attribute",
        )

    # Convert classes to a deterministic list
    classes_list = sorted([_to_serializable(c) for c in classes])

    # Validate feature count
    n_features = coef.shape[1]
    if n_features != len(feature_names):
        return LinearCoefficientsResult(
            success=False,
            diagnostic=LinearCoefficientsDiagnostic.FEATURE_NAMES_UNAVAILABLE,
            diagnostic_message=f"Feature count mismatch: {n_features} coefficients vs {len(feature_names)} names",
        )

    # Number of classes
    num_classes = len(classes_list)

    # Handle binary vs multiclass
    # For binary classification, coef_ shape is (1, n_features)
    # The single row represents the coefficients for the positive class
    if coef.shape[0] == 1 and num_classes == 2:
        # Binary case: duplicate coefficients for both classes (with opposite sign for class 0)
        # Actually, we'll report for both classes to be explicit
        coef_by_class = _build_binary_coefficients(coef[0], classes_list, feature_names, intercept)
    else:
        # Multiclass case: one row per class
        coef_by_class = _build_multiclass_coefficients(coef, classes_list, feature_names, intercept)

    # Build intercepts list
    intercepts = _build_intercepts(intercept, classes_list, coef.shape[0], num_classes)

    # Build top-k per class
    top_k_by_class = _build_top_k_by_class(coef_by_class, classes_list)

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "model_family": model_family,
        "coefficient_space": "standardized",
        "num_features": len(feature_names),
        "num_classes": num_classes,
        "classes": classes_list,
        "intercepts": intercepts,
        "coefficients_by_class": coef_by_class,
        "top_k_by_class": top_k_by_class,
    }

    return LinearCoefficientsResult(success=True, artifact=artifact)


def _to_serializable(value: Any) -> Union[int, str]:
    """Convert numpy types to JSON-serializable Python types."""
    if isinstance(value, (np.integer, np.int32, np.int64)):
        return int(value)
    if isinstance(value, (np.floating, np.float32, np.float64)):
        return float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def _build_binary_coefficients(
    coef_row: np.ndarray,
    classes: List[Union[int, str]],
    feature_names: List[str],
    intercept: Optional[np.ndarray],
) -> List[Dict[str, Any]]:
    """
    Build coefficient structure for binary classification.

    For binary classification, sklearn stores only one set of coefficients.
    We report them for the positive class (classes[1]).
    The coefficients for the negative class would be the negation.
    """
    result = []

    # Report for positive class (class index 1)
    positive_class = classes[1]  # classes are already sorted
    features = _build_sorted_features(coef_row, feature_names)
    result.append({
        "class": positive_class,
        "features": features,
    })

    return result


def _build_multiclass_coefficients(
    coef: np.ndarray,
    classes: List[Union[int, str]],
    feature_names: List[str],
    intercept: Optional[np.ndarray],
) -> List[Dict[str, Any]]:
    """
    Build coefficient structure for multiclass classification.

    Each class has its own set of coefficients.
    """
    result = []

    # Map from original class to sorted index
    # sklearn stores coef_ in the order of classes_, which may not be sorted
    # We need to output in sorted class order
    original_classes = list(classes)  # already sorted

    for class_idx, class_label in enumerate(original_classes):
        # Find the row in coef corresponding to this class
        coef_row = coef[class_idx]
        features = _build_sorted_features(coef_row, feature_names)
        result.append({
            "class": class_label,
            "features": features,
        })

    return result


def _build_sorted_features(
    coefficients: np.ndarray,
    feature_names: List[str],
) -> List[Dict[str, Any]]:
    """
    Build sorted feature list with coefficients and ranks.

    Sorting: primary by absolute coefficient (descending), secondary by name (ascending).
    """
    # Create list of (original_index, name, coefficient, abs_coefficient)
    feature_data = [
        (i, name, float(coefficients[i]), abs(float(coefficients[i])))
        for i, name in enumerate(feature_names)
    ]

    # Sort by abs_coefficient descending, then by name ascending
    sorted_features = sorted(
        feature_data,
        key=lambda x: (-x[3], x[1]),  # (-abs_coef, name)
    )

    # Build result with ranks
    result = [
        {
            "name": name,
            "coefficient": coef,
            "abs_coefficient": abs_coef,
            "rank": rank + 1,
        }
        for rank, (orig_idx, name, coef, abs_coef) in enumerate(sorted_features)
    ]

    return result


def _build_intercepts(
    intercept: Optional[np.ndarray],
    classes: List[Union[int, str]],
    coef_rows: int,
    num_classes: int,
) -> List[Dict[str, Any]]:
    """Build intercepts list per class."""
    result = []

    if intercept is None:
        # No intercept - return zeros
        for class_label in classes:
            result.append({
                "class": class_label,
                "intercept": 0.0,
            })
        return result

    if coef_rows == 1 and num_classes == 2:
        # Binary case: single intercept for positive class
        positive_class = classes[1]
        result.append({
            "class": positive_class,
            "intercept": float(intercept[0]),
        })
    else:
        # Multiclass case: one intercept per class
        for class_idx, class_label in enumerate(classes):
            result.append({
                "class": class_label,
                "intercept": float(intercept[class_idx]),
            })

    return result


def _build_top_k_by_class(
    coefficients_by_class: List[Dict[str, Any]],
    classes: List[Union[int, str]],
) -> List[Dict[str, Any]]:
    """Build top-k feature names per class (max 10)."""
    result = []

    for class_entry in coefficients_by_class:
        class_label = class_entry["class"]
        features = class_entry["features"]
        top_features = [f["name"] for f in features[:10]]
        result.append({
            "class": class_label,
            "top_features": top_features,
        })

    return result


def write_linear_coefficients(
    artifact: Dict[str, Any],
    run_dir: Path,
) -> Path:
    """
    Write linear_coefficients.v1.json to the run directory.

    Uses canonical JSON formatting for determinism.

    Args:
        artifact: Linear coefficients artifact dict
        run_dir: Run output directory

    Returns:
        Path to the written file
    """
    # Write to artifacts subdirectory
    artifacts_dir = run_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    output_path = artifacts_dir / "linear_coefficients.v1.json"

    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(artifact, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    return output_path
