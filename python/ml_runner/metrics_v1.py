"""
Model-aware metrics computation for RunForge Phase 3.3.

Computes detailed metrics based on model capabilities:
- classification.base.v1: accuracy, precision, recall, f1, confusion matrix
- classification.proba.v1: adds roc_auc, log_loss (binary only, requires predict_proba)
- classification.multiclass.v1: adds per-class precision/recall/f1

Profile selection logic:
- Binary + predict_proba → proba.v1
- Multiclass (3+) → multiclass.v1
- Otherwise → base.v1

LinearSVC uses decision_function for ROC-AUC when available (binary only).
"""

from typing import Any, Dict, List, Tuple, Optional
import json
from pathlib import Path

import numpy as np

# Metrics profile identifiers
PROFILE_BASE = "classification.base.v1"
PROFILE_PROBA = "classification.proba.v1"
PROFILE_MULTICLASS = "classification.multiclass.v1"

# Schema version
SCHEMA_VERSION = "metrics.v1"


def has_predict_proba(estimator: Any) -> bool:
    """Check if estimator supports predict_proba."""
    return callable(getattr(estimator, "predict_proba", None))


def has_decision_function(estimator: Any) -> bool:
    """Check if estimator supports decision_function."""
    return callable(getattr(estimator, "decision_function", None))


def get_classifier_from_pipeline(pipeline: Any) -> Any:
    """Extract classifier from sklearn Pipeline."""
    if hasattr(pipeline, "named_steps"):
        return pipeline.named_steps.get("clf", pipeline)
    return pipeline


def select_metrics_profile(
    num_classes: int,
    has_proba: bool,
    has_decision_func: bool,
) -> str:
    """
    Select the appropriate metrics profile based on model capabilities.

    Args:
        num_classes: Number of unique classes
        has_proba: Whether model supports predict_proba
        has_decision_func: Whether model supports decision_function

    Returns:
        Profile identifier string
    """
    # Binary classification with probability support → proba.v1
    if num_classes == 2 and has_proba:
        return PROFILE_PROBA

    # Multiclass → multiclass.v1
    if num_classes > 2:
        return PROFILE_MULTICLASS

    # Default → base.v1
    return PROFILE_BASE


def compute_base_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    class_labels: List,
) -> Dict[str, Any]:
    """
    Compute base classification metrics.

    Args:
        y_true: True labels
        y_pred: Predicted labels
        class_labels: Ordered list of class labels

    Returns:
        Dict with accuracy, precision_macro, recall_macro, f1_macro, confusion_matrix
    """
    from sklearn.metrics import (
        accuracy_score,
        precision_score,
        recall_score,
        f1_score,
        confusion_matrix,
    )

    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1_macro": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=class_labels).tolist(),
    }


def compute_proba_metrics(
    y_true: np.ndarray,
    y_prob: np.ndarray,
) -> Dict[str, Any]:
    """
    Compute probability-based metrics (binary classification only).

    Args:
        y_true: True labels (binary: 0/1)
        y_prob: Predicted probabilities for positive class

    Returns:
        Dict with roc_auc, log_loss
    """
    from sklearn.metrics import roc_auc_score, log_loss

    return {
        "roc_auc": float(roc_auc_score(y_true, y_prob)),
        "log_loss": float(log_loss(y_true, y_prob)),
    }


def compute_decision_function_auc(
    y_true: np.ndarray,
    decision_scores: np.ndarray,
) -> Dict[str, Any]:
    """
    Compute ROC-AUC from decision function scores (binary only).

    Used for LinearSVC which lacks predict_proba.

    Args:
        y_true: True labels (binary)
        decision_scores: Decision function scores

    Returns:
        Dict with roc_auc only (no log_loss without probabilities)
    """
    from sklearn.metrics import roc_auc_score

    return {
        "roc_auc": float(roc_auc_score(y_true, decision_scores)),
    }


def compute_multiclass_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    class_labels: List,
) -> Dict[str, Any]:
    """
    Compute per-class metrics for multiclass classification.

    Args:
        y_true: True labels
        y_pred: Predicted labels
        class_labels: Ordered list of class labels

    Returns:
        Dict with per_class_precision, per_class_recall, per_class_f1, class_labels
    """
    from sklearn.metrics import precision_score, recall_score, f1_score

    return {
        "per_class_precision": [
            float(x) for x in precision_score(
                y_true, y_pred, labels=class_labels, average=None, zero_division=0
            )
        ],
        "per_class_recall": [
            float(x) for x in recall_score(
                y_true, y_pred, labels=class_labels, average=None, zero_division=0
            )
        ],
        "per_class_f1": [
            float(x) for x in f1_score(
                y_true, y_pred, labels=class_labels, average=None, zero_division=0
            )
        ],
        "class_labels": [int(x) if isinstance(x, (int, np.integer)) else x for x in class_labels],
    }


def compute_metrics_v1(
    pipeline: Any,
    X_val: np.ndarray,
    y_val: np.ndarray,
    model_family: str,
) -> Dict[str, Any]:
    """
    Compute model-aware metrics for Phase 3.3.

    Automatically selects the appropriate metrics profile based on:
    - Number of classes (binary vs multiclass)
    - Model capabilities (predict_proba, decision_function)

    Args:
        pipeline: Trained sklearn Pipeline
        X_val: Validation features
        y_val: Validation labels
        model_family: Model family identifier

    Returns:
        Complete metrics dict conforming to metrics.v1 schema
    """
    # Get classifier from pipeline
    clf = get_classifier_from_pipeline(pipeline)

    # Determine capabilities
    has_proba = has_predict_proba(clf)
    has_decision_func = has_decision_function(clf)

    # Get class labels and count
    if hasattr(clf, "classes_"):
        class_labels = list(clf.classes_)
    else:
        class_labels = sorted(list(set(y_val)))
    num_classes = len(class_labels)

    # Select profile
    profile = select_metrics_profile(num_classes, has_proba, has_decision_func)

    # Get predictions
    y_pred = pipeline.predict(X_val)

    # Start with base metrics (always computed)
    metrics: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "metrics_profile": profile,
        "num_classes": num_classes,
    }
    metrics.update(compute_base_metrics(y_val, y_pred, class_labels))

    # Add profile-specific metrics
    if profile == PROFILE_PROBA:
        # Binary classification with predict_proba
        y_prob = pipeline.predict_proba(X_val)[:, 1]  # Probability of positive class
        metrics.update(compute_proba_metrics(y_val, y_prob))

    elif profile == PROFILE_MULTICLASS:
        # Multiclass - add per-class metrics
        metrics.update(compute_multiclass_metrics(y_val, y_pred, class_labels))

    elif profile == PROFILE_BASE:
        # Check if we can add ROC-AUC via decision_function (LinearSVC binary case)
        if num_classes == 2 and has_decision_func and not has_proba:
            try:
                decision_scores = clf.decision_function(
                    pipeline.named_steps["scaler"].transform(X_val)
                )
                metrics.update(compute_decision_function_auc(y_val, decision_scores))
            except Exception:
                # Silently skip if decision_function fails
                pass

    return metrics


def write_metrics_v1(metrics: Dict[str, Any], run_dir: Path) -> Path:
    """
    Write metrics.v1.json to the run directory in canonical format.

    Uses sorted keys and consistent formatting for determinism.

    Args:
        metrics: Metrics dict conforming to metrics.v1 schema
        run_dir: Run output directory

    Returns:
        Path to the written metrics.v1.json file
    """
    metrics_path = run_dir / "metrics.v1.json"

    with open(metrics_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(metrics, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    return metrics_path


def get_metrics_profile_display_name(profile: str) -> str:
    """Get human-readable name for a metrics profile."""
    names = {
        PROFILE_BASE: "Classification Base",
        PROFILE_PROBA: "Classification with Probabilities",
        PROFILE_MULTICLASS: "Multiclass Classification",
    }
    return names.get(profile, profile)
