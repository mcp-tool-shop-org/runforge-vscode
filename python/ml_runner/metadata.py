"""
Run metadata handling for RunForge

Phase 2.2.1:
- Metadata generation during training runs
- Metadata viewing/export via CLI
- Canonical JSON serialization for determinism

Phase 3.1:
- model_family field for model selection tracking

Phase 3.2:
- profile_name, profile_version, expanded_parameters_hash (only if profile used)
- hyperparameters dict with provenance tracking
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List

from .provenance import get_latest_run, get_run_by_id, load_index

# RunForge version - must match package version
RUNFORGE_VERSION = "0.3.4.0"

# Run schema version
RUN_SCHEMA_VERSION = "run.v0.3.4"


def generate_run_id(
    dataset_fingerprint: str,
    label_column: str,
    timestamp: Optional[datetime] = None
) -> str:
    """
    Generate a deterministic run ID.

    Format: YYYYMMDD-HHMMSS-<shortHash>

    The short hash is derived from dataset fingerprint + label column
    to make runs traceable while keeping IDs human-readable.

    Args:
        dataset_fingerprint: SHA-256 of dataset
        label_column: Label column name
        timestamp: Optional fixed timestamp (for testing determinism)
    """
    if timestamp is None:
        # Check for test override
        fixed_time = os.environ.get("RUNFORGE_TEST_FIXED_TIME")
        if fixed_time:
            timestamp = datetime.fromisoformat(fixed_time.replace("Z", "+00:00"))
        else:
            timestamp = datetime.now(timezone.utc)

    # Format timestamp
    time_str = timestamp.strftime("%Y%m%d-%H%M%S")

    # Short hash from fingerprint + label (first 8 chars)
    import hashlib
    hash_input = f"{dataset_fingerprint}:{label_column}"
    short_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:8]

    return f"{time_str}-{short_hash}"


def create_run_metadata(
    run_id: str,
    dataset_path: str,
    dataset_fingerprint: str,
    label_column: str,
    num_samples: int,
    num_features: int,
    dropped_rows: int,
    accuracy: float,
    model_pkl_path: str,
    model_family: str = "logistic_regression",
    created_at: Optional[datetime] = None,
    profile_name: Optional[str] = None,
    profile_version: Optional[str] = None,
    expanded_parameters_hash: Optional[str] = None,
    hyperparameters: Optional[List[Dict[str, Any]]] = None,
    metrics_v1_schema_version: Optional[str] = None,
    metrics_v1_profile: Optional[str] = None,
    metrics_v1_artifact_path: Optional[str] = None,
    feature_importance_schema_version: Optional[str] = None,
    feature_importance_artifact_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create run metadata dict.

    Phase 2.2.1 fields: run.schema.v0.2.2.1
    Phase 3.1 addition: model_family
    Phase 3.2 addition: profile info and hyperparameters (optional)
    Phase 3.3 addition: schema_version, metrics_v1 pointer
    Phase 3.4 addition: feature_importance pointer (optional)

    Args:
        run_id: Unique run identifier
        dataset_path: Path to the dataset file
        dataset_fingerprint: SHA-256 of dataset bytes
        label_column: Name of label column
        num_samples: Final sample count (after dropping missing)
        num_features: Feature count (excluding label)
        dropped_rows: Rows dropped due to missing values
        accuracy: Validation accuracy
        model_pkl_path: Relative path to model.pkl
        model_family: Model family used (Phase 3.1)
        created_at: Optional fixed timestamp (for determinism)
        profile_name: Training profile name (Phase 3.2, omit if None)
        profile_version: Training profile version (Phase 3.2, omit if None)
        expanded_parameters_hash: SHA-256 of expanded profile params (Phase 3.2, omit if None)
        hyperparameters: List of {name, value, source} dicts (Phase 3.2, omit if empty)
        metrics_v1_schema_version: Schema version from metrics.v1.json (Phase 3.3)
        metrics_v1_profile: Metrics profile from metrics.v1.json (Phase 3.3)
        metrics_v1_artifact_path: Relative path to metrics.v1.json (Phase 3.3)
        feature_importance_schema_version: Schema version from feature_importance.v1.json (Phase 3.4)
        feature_importance_artifact_path: Relative path to feature_importance.v1.json (Phase 3.4)

    Returns:
        Metadata dict conforming to schema
    """
    if created_at is None:
        fixed_time = os.environ.get("RUNFORGE_TEST_FIXED_TIME")
        if fixed_time:
            created_at = datetime.fromisoformat(fixed_time.replace("Z", "+00:00"))
        else:
            created_at = datetime.now(timezone.utc)

    metadata: Dict[str, Any] = {
        "run_id": run_id,
        "runforge_version": RUNFORGE_VERSION,
        "schema_version": RUN_SCHEMA_VERSION,  # Phase 3.3 addition
        "created_at": created_at.isoformat(),
        "dataset": {
            "path": dataset_path,
            "fingerprint_sha256": dataset_fingerprint,
        },
        "label_column": label_column,
        "model_family": model_family,  # Phase 3.1 addition
        "num_samples": num_samples,
        "num_features": num_features,
        "dropped_rows_missing_values": dropped_rows,
        "metrics": {
            "accuracy": accuracy,
            "num_samples": num_samples,
            "num_features": num_features,
        },
        "artifacts": {
            "model_pkl": model_pkl_path,
        },
    }

    # Phase 3.3: Add metrics_v1 pointer if provided
    if metrics_v1_schema_version and metrics_v1_profile and metrics_v1_artifact_path:
        metadata["metrics_v1"] = {
            "schema_version": metrics_v1_schema_version,
            "metrics_profile": metrics_v1_profile,
            "artifact_path": metrics_v1_artifact_path,
        }
        metadata["artifacts"]["metrics_v1_json"] = metrics_v1_artifact_path

    # Phase 3.4: Add feature importance pointer if available
    if feature_importance_schema_version and feature_importance_artifact_path:
        metadata["feature_importance_schema_version"] = feature_importance_schema_version
        metadata["feature_importance_artifact"] = feature_importance_artifact_path
        metadata["artifacts"]["feature_importance_json"] = feature_importance_artifact_path

    # Phase 3.2: Only include profile fields if profile was used
    # IMPORTANT: Fields are OMITTED when no profile is used, not set to null
    if profile_name is not None:
        metadata["profile_name"] = profile_name
        metadata["profile_version"] = profile_version
        metadata["expanded_parameters_hash"] = expanded_parameters_hash

    # Phase 3.2: Include hyperparameters if any were set
    if hyperparameters:
        metadata["hyperparameters"] = hyperparameters

    return metadata


def write_run_metadata(metadata: Dict[str, Any], run_dir: Path) -> Path:
    """
    Write run metadata to run.json in canonical format.

    Uses sorted keys and consistent formatting for determinism.

    Returns:
        Path to the written run.json file
    """
    run_dir.mkdir(parents=True, exist_ok=True)
    run_json_path = run_dir / "run.json"

    with open(run_json_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(metadata, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    return run_json_path


def read_run_metadata(run_dir: Path) -> Dict[str, Any]:
    """
    Read run metadata from run.json.

    Args:
        run_dir: Path to the run directory

    Returns:
        Metadata dict

    Raises:
        FileNotFoundError: If run.json doesn't exist
    """
    run_json_path = run_dir / "run.json"
    if not run_json_path.exists():
        raise FileNotFoundError(f"run.json not found in {run_dir}")

    with open(run_json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def format_metadata_for_display(metadata: Dict[str, Any]) -> str:
    """
    Format metadata as pretty-printed JSON for display.
    """
    return json.dumps(metadata, indent=2, sort_keys=True, ensure_ascii=False)


def run_metadata_command(args: List[str]) -> int:
    """
    CLI entrypoint for metadata subcommand.

    Usage:
        python -m ml_runner metadata --latest
        python -m ml_runner metadata --run-id <id>

    Returns:
        Exit code (0 = success, 1 = error)
    """
    import argparse

    parser = argparse.ArgumentParser(
        prog="ml_runner metadata",
        description="View or export run metadata"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--latest",
        action="store_true",
        help="Show metadata for the latest run"
    )
    group.add_argument(
        "--run-id",
        help="Show metadata for a specific run ID"
    )
    parser.add_argument(
        "--runforge-dir",
        default=".runforge",
        help="Path to .runforge directory"
    )

    parsed = parser.parse_args(args)
    runforge_dir = Path(parsed.runforge_dir)

    try:
        if parsed.latest:
            run_entry = get_latest_run(runforge_dir)
            if not run_entry:
                print("No runs found.", file=sys.stderr)
                return 1
        else:
            run_entry = get_run_by_id(runforge_dir, parsed.run_id)
            if not run_entry:
                print(f"Run not found: {parsed.run_id}", file=sys.stderr)
                return 1

        # Load full metadata from run.json
        run_dir = runforge_dir / run_entry["run_dir"]
        if run_dir.exists():
            metadata = read_run_metadata(run_dir.parent)
            print(format_metadata_for_display(metadata))
        else:
            # Fall back to index entry if run.json missing
            print(json.dumps(run_entry, indent=2, sort_keys=True))

        return 0

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
