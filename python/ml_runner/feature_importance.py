"""
Feature importance extraction for RunForge Phase 3.4.

Read-only extraction of feature importance from trained models.
Only RandomForest is supported in v1 (native feature_importances_).

No approximations or surrogate models - if the model doesn't
support native importance, we emit a diagnostic instead.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

import numpy as np


# Schema version
SCHEMA_VERSION = "feature_importance.v1"

# Supported model families for feature importance
SUPPORTED_MODELS = {"random_forest"}


class FeatureImportanceDiagnostic(Enum):
    """Diagnostics for feature importance extraction."""
    FEATURE_IMPORTANCE_UNSUPPORTED_MODEL = "FEATURE_IMPORTANCE_UNSUPPORTED_MODEL"
    FEATURE_NAMES_UNAVAILABLE = "FEATURE_NAMES_UNAVAILABLE"


@dataclass
class FeatureImportanceResult:
    """Result of feature importance extraction."""
    success: bool
    artifact: Optional[Dict[str, Any]] = None
    diagnostic: Optional[FeatureImportanceDiagnostic] = None
    diagnostic_message: Optional[str] = None


def supports_feature_importance(model_family: str) -> bool:
    """Check if a model family supports native feature importance."""
    return model_family in SUPPORTED_MODELS


def get_classifier_from_pipeline(pipeline: Any) -> Any:
    """Extract classifier from sklearn Pipeline."""
    if hasattr(pipeline, "named_steps"):
        return pipeline.named_steps.get("clf", pipeline)
    return pipeline


def extract_feature_importance(
    pipeline: Any,
    model_family: str,
    feature_names: List[str],
) -> FeatureImportanceResult:
    """
    Extract feature importance from a trained pipeline.

    Args:
        pipeline: Trained sklearn Pipeline
        model_family: Model family identifier
        feature_names: List of feature column names in original order

    Returns:
        FeatureImportanceResult with either artifact data or diagnostic
    """
    # Check if model supports feature importance
    if not supports_feature_importance(model_family):
        return FeatureImportanceResult(
            success=False,
            diagnostic=FeatureImportanceDiagnostic.FEATURE_IMPORTANCE_UNSUPPORTED_MODEL,
            diagnostic_message=f"Model family '{model_family}' does not support native feature importance in v1. "
                             f"Supported models: {', '.join(sorted(SUPPORTED_MODELS))}",
        )

    # Validate feature names
    if not feature_names:
        return FeatureImportanceResult(
            success=False,
            diagnostic=FeatureImportanceDiagnostic.FEATURE_NAMES_UNAVAILABLE,
            diagnostic_message="Feature names are required but not available",
        )

    # Get classifier from pipeline
    clf = get_classifier_from_pipeline(pipeline)

    # Extract importance based on model type
    if model_family == "random_forest":
        return _extract_random_forest_importance(clf, feature_names)

    # Should not reach here due to earlier check, but be defensive
    return FeatureImportanceResult(
        success=False,
        diagnostic=FeatureImportanceDiagnostic.FEATURE_IMPORTANCE_UNSUPPORTED_MODEL,
        diagnostic_message=f"No extraction logic for model family '{model_family}'",
    )


def _extract_random_forest_importance(
    clf: Any,
    feature_names: List[str],
) -> FeatureImportanceResult:
    """
    Extract Gini importance from RandomForestClassifier.

    Args:
        clf: Trained RandomForestClassifier
        feature_names: Feature column names

    Returns:
        FeatureImportanceResult with artifact data
    """
    # Get raw importances
    if not hasattr(clf, "feature_importances_"):
        return FeatureImportanceResult(
            success=False,
            diagnostic=FeatureImportanceDiagnostic.FEATURE_IMPORTANCE_UNSUPPORTED_MODEL,
            diagnostic_message="Classifier does not have feature_importances_ attribute",
        )

    importances = clf.feature_importances_

    # Validate length matches
    if len(importances) != len(feature_names):
        return FeatureImportanceResult(
            success=False,
            diagnostic=FeatureImportanceDiagnostic.FEATURE_NAMES_UNAVAILABLE,
            diagnostic_message=f"Feature count mismatch: {len(importances)} importances vs {len(feature_names)} names",
        )

    # Build features in original order
    features_by_original_order = [
        {
            "name": name,
            "importance": float(importances[i]),
            "index": i,
        }
        for i, name in enumerate(feature_names)
    ]

    # Build features sorted by importance (descending)
    # Tie-breaker: sort by feature name (ascending) for determinism
    sorted_features = sorted(
        enumerate(zip(feature_names, importances)),
        key=lambda x: (-x[1][1], x[1][0]),  # (-importance, name)
    )

    features_by_importance = [
        {
            "name": name,
            "importance": float(importance),
            "rank": rank + 1,
        }
        for rank, (original_idx, (name, importance)) in enumerate(sorted_features)
    ]

    # Top-k (max 10)
    top_k = [f["name"] for f in features_by_importance[:10]]

    artifact = {
        "schema_version": SCHEMA_VERSION,
        "model_family": "random_forest",
        "importance_type": "gini_importance",
        "num_features": len(feature_names),
        "features_by_importance": features_by_importance,
        "features_by_original_order": features_by_original_order,
        "top_k": top_k,
    }

    return FeatureImportanceResult(success=True, artifact=artifact)


def write_feature_importance(
    artifact: Dict[str, Any],
    run_dir: Path,
) -> Path:
    """
    Write feature_importance.v1.json to the run directory.

    Uses canonical JSON formatting for determinism.

    Args:
        artifact: Feature importance artifact dict
        run_dir: Run output directory

    Returns:
        Path to the written file
    """
    # Write to artifacts subdirectory
    artifacts_dir = run_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    output_path = artifacts_dir / "feature_importance.v1.json"

    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(artifact, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    return output_path


def get_feature_names_from_csv_header(csv_path: Path, label_column: str = "label") -> List[str]:
    """
    Extract feature names from CSV header.

    Args:
        csv_path: Path to CSV file
        label_column: Name of label column to exclude

    Returns:
        List of feature column names in original order
    """
    with open(csv_path, "r", encoding="utf-8") as f:
        header_line = f.readline().strip()

    columns = [col.strip() for col in header_line.split(",")]
    feature_names = [col for col in columns if col != label_column]

    return feature_names
