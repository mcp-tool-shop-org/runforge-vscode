"""
Run metadata handling for RunForge Phase 2.2.1

Provides:
- Metadata generation during training runs
- Metadata viewing/export via CLI
- Canonical JSON serialization for determinism
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List

from .provenance import get_latest_run, get_run_by_id, load_index

# RunForge version - must match package version
RUNFORGE_VERSION = "0.2.2.2"


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
    created_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Create run metadata dict matching run.schema.v0.2.2.1.

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
        created_at: Optional fixed timestamp (for determinism)

    Returns:
        Metadata dict conforming to schema
    """
    if created_at is None:
        fixed_time = os.environ.get("RUNFORGE_TEST_FIXED_TIME")
        if fixed_time:
            created_at = datetime.fromisoformat(fixed_time.replace("Z", "+00:00"))
        else:
            created_at = datetime.now(timezone.utc)

    return {
        "run_id": run_id,
        "runforge_version": RUNFORGE_VERSION,
        "created_at": created_at.isoformat(),
        "dataset": {
            "path": dataset_path,
            "fingerprint_sha256": dataset_fingerprint,
        },
        "label_column": label_column,
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
