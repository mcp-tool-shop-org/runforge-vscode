"""
Provenance tracking for RunForge Phase 2.2.1

Provides append-only provenance index that links:
- Dataset fingerprint → Run metadata → Artifacts

All operations are:
- Local-only (no network)
- Deterministic
- Human-auditable
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

# Schema version for the index format
INDEX_SCHEMA_VERSION = "0.2.2.1"


def get_index_path(runforge_dir: Path) -> Path:
    """Get path to the provenance index file."""
    return runforge_dir / "index.json"


def load_index(runforge_dir: Path) -> Dict[str, Any]:
    """
    Load the provenance index, creating empty index if not exists.

    If index is corrupt, backs up the corrupt file and starts fresh.

    Returns:
        Index dict with schema_version and runs list
    """
    index_path = get_index_path(runforge_dir)

    if not index_path.exists():
        return {
            "schema_version": INDEX_SCHEMA_VERSION,
            "runs": []
        }

    try:
        with open(index_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Validate basic structure
            if not isinstance(data, dict) or "runs" not in data:
                raise ValueError("Invalid index structure")
            return data
    except (json.JSONDecodeError, ValueError) as e:
        # Backup corrupt file and start fresh
        backup_path = index_path.with_suffix(f".json.corrupt.{int(datetime.now(timezone.utc).timestamp())}")
        index_path.rename(backup_path)
        print(f"Warning: Corrupt index backed up to {backup_path}, starting fresh")
        return {
            "schema_version": INDEX_SCHEMA_VERSION,
            "runs": []
        }


def save_index(runforge_dir: Path, index: Dict[str, Any]) -> None:
    """
    Save the provenance index atomically.

    Uses temp file + rename pattern for crash safety.
    Uses canonical JSON (sorted keys, consistent whitespace).
    """
    runforge_dir.mkdir(parents=True, exist_ok=True)
    index_path = get_index_path(runforge_dir)
    temp_path = index_path.with_suffix(".json.tmp")

    # Write to temp file first
    with open(temp_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(index, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    # Atomic rename (on POSIX; best-effort on Windows)
    temp_path.replace(index_path)


def append_run_to_index(
    runforge_dir: Path,
    run_id: str,
    created_at: str,
    dataset_fingerprint: str,
    label_column: str,
    run_dir: str,
    model_pkl: str,
) -> None:
    """
    Append a run entry to the provenance index.

    This is append-only: entries are never removed or reordered.
    Newest entries go last.
    """
    index = load_index(runforge_dir)

    entry = {
        "run_id": run_id,
        "created_at": created_at,
        "dataset_fingerprint_sha256": dataset_fingerprint,
        "label_column": label_column,
        "run_dir": run_dir,
        "model_pkl": model_pkl,
    }

    index["runs"].append(entry)
    save_index(runforge_dir, index)


def get_latest_run(runforge_dir: Path) -> Optional[Dict[str, Any]]:
    """
    Get the most recent run entry from the index.

    Returns:
        Run entry dict, or None if no runs exist
    """
    index = load_index(runforge_dir)
    runs = index.get("runs", [])
    return runs[-1] if runs else None


def get_run_by_id(runforge_dir: Path, run_id: str) -> Optional[Dict[str, Any]]:
    """
    Find a run by its ID.

    Returns:
        Run entry dict, or None if not found
    """
    index = load_index(runforge_dir)
    for run in index.get("runs", []):
        if run.get("run_id") == run_id:
            return run
    return None


def list_runs(runforge_dir: Path) -> List[Dict[str, Any]]:
    """
    List all runs in the index.

    Returns:
        List of run entries (oldest first, newest last)
    """
    index = load_index(runforge_dir)
    return index.get("runs", [])


def find_runs_by_fingerprint(
    runforge_dir: Path,
    fingerprint: str
) -> List[Dict[str, Any]]:
    """
    Find all runs that used a specific dataset fingerprint.

    Returns:
        List of matching run entries
    """
    index = load_index(runforge_dir)
    return [
        run for run in index.get("runs", [])
        if run.get("dataset_fingerprint_sha256") == fingerprint
    ]
