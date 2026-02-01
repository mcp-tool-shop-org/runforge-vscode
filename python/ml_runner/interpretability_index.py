"""
Interpretability index builder for RunForge Phase 3.6.

Creates a unified index artifact that references existing Phase 3 artifacts:
- metrics.v1.json (Phase 3.3)
- feature_importance.v1.json (Phase 3.4, conditional)
- linear_coefficients.v1.json (Phase 3.5, conditional)

Read-only linking and summarization only - no new computation.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .metadata import RUNFORGE_VERSION


# Schema version
SCHEMA_VERSION = "interpretability.index.v1"


def build_interpretability_index(
    run_json: Dict[str, Any],
    run_dir: Path,
    created_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Build the interpretability index artifact from run metadata.

    This function inspects the run.json and filesystem to discover
    available interpretability artifacts, then creates a unified index.

    Args:
        run_json: Parsed run.json metadata
        run_dir: Path to the run directory (containing artifacts/)
        created_at: Optional timestamp override (for determinism in tests)

    Returns:
        Interpretability index dict matching schema
    """
    if created_at is None:
        created_at = datetime.now(timezone.utc)

    # Build the index
    index: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_json["run_id"],
        "runforge_version": RUNFORGE_VERSION,
        "created_at": created_at.isoformat(),
        "available_artifacts": {},
    }

    # Check for metrics_v1
    metrics_entry = _build_metrics_v1_entry(run_json, run_dir)
    if metrics_entry:
        index["available_artifacts"]["metrics_v1"] = metrics_entry

    # Check for feature_importance_v1
    fi_entry = _build_feature_importance_entry(run_json, run_dir)
    if fi_entry:
        index["available_artifacts"]["feature_importance_v1"] = fi_entry

    # Check for linear_coefficients_v1
    lc_entry = _build_linear_coefficients_entry(run_json, run_dir)
    if lc_entry:
        index["available_artifacts"]["linear_coefficients_v1"] = lc_entry

    return index


def _build_metrics_v1_entry(
    run_json: Dict[str, Any],
    run_dir: Path,
) -> Optional[Dict[str, Any]]:
    """
    Build metrics_v1 entry if the artifact exists.

    Summary uses data from run.json, not from metrics.v1.json,
    to avoid duplication.
    """
    # Check if metrics_v1 is referenced in run.json
    metrics_v1 = run_json.get("metrics_v1")
    if not metrics_v1:
        return None

    # Verify file exists
    artifact_path = run_dir / metrics_v1.get("artifact_path", "metrics.v1.json")
    if not artifact_path.exists():
        return None

    # Build summary from run.json (not from the artifact itself)
    summary: Dict[str, Any] = {
        "metrics_profile": metrics_v1.get("metrics_profile", "unknown"),
    }

    # Include accuracy from run.json.metrics if available
    metrics = run_json.get("metrics", {})
    if "accuracy" in metrics:
        summary["accuracy"] = metrics["accuracy"]

    return {
        "schema_version": metrics_v1.get("schema_version", "metrics.v1"),
        "path": metrics_v1.get("artifact_path", "metrics.v1.json"),
        "summary": summary,
    }


def _build_feature_importance_entry(
    run_json: Dict[str, Any],
    run_dir: Path,
) -> Optional[Dict[str, Any]]:
    """
    Build feature_importance_v1 entry if the artifact exists.

    Summary includes top-k feature names only (no numeric importances).
    """
    # Check if feature importance is referenced in run.json
    schema_version = run_json.get("feature_importance_schema_version")
    artifact_path_str = run_json.get("feature_importance_artifact")

    if not schema_version or not artifact_path_str:
        return None

    # Verify file exists
    artifact_path = run_dir / artifact_path_str
    if not artifact_path.exists():
        return None

    # Load artifact to get top_k (names only)
    try:
        with open(artifact_path, "r", encoding="utf-8") as f:
            artifact = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None

    # Build summary
    top_k = artifact.get("top_k", [])[:5]  # Max 5 for summary
    model_family = artifact.get("model_family", "unknown")

    return {
        "schema_version": schema_version,
        "path": artifact_path_str,
        "summary": {
            "model_family": model_family,
            "top_k": top_k,
        },
    }


def _build_linear_coefficients_entry(
    run_json: Dict[str, Any],
    run_dir: Path,
) -> Optional[Dict[str, Any]]:
    """
    Build linear_coefficients_v1 entry if the artifact exists.

    Summary includes top-k feature names per class only (no coefficients).
    """
    # Check if linear coefficients is referenced in run.json
    schema_version = run_json.get("linear_coefficients_schema_version")
    artifact_path_str = run_json.get("linear_coefficients_artifact")

    if not schema_version or not artifact_path_str:
        return None

    # Verify file exists
    artifact_path = run_dir / artifact_path_str
    if not artifact_path.exists():
        return None

    # Load artifact to get summary data
    try:
        with open(artifact_path, "r", encoding="utf-8") as f:
            artifact = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None

    # Build summary
    model_family = artifact.get("model_family", "unknown")
    num_classes = artifact.get("num_classes", 2)

    # Extract top-k per class (names only, max 5 per class)
    top_k_by_class: List[Dict[str, Any]] = []
    for class_entry in artifact.get("top_k_by_class", []):
        class_label = class_entry.get("class")
        top_features = class_entry.get("top_features", [])[:5]
        top_k_by_class.append({
            "class": class_label,
            "top_features": top_features,
        })

    return {
        "schema_version": schema_version,
        "path": artifact_path_str,
        "summary": {
            "model_family": model_family,
            "num_classes": num_classes,
            "top_k_by_class": top_k_by_class,
        },
    }


def write_interpretability_index(
    index: Dict[str, Any],
    run_dir: Path,
) -> Path:
    """
    Write interpretability.index.v1.json to the run directory.

    Uses canonical JSON formatting for determinism.

    Args:
        index: Interpretability index dict
        run_dir: Run output directory

    Returns:
        Path to the written file
    """
    # Write to artifacts subdirectory
    artifacts_dir = run_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    output_path = artifacts_dir / "interpretability.index.v1.json"

    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(index, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    return output_path
