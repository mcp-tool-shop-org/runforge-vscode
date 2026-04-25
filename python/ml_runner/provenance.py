"""
Provenance tracking for RunForge

Provides append-only provenance index that links:
- Dataset fingerprint → Run metadata → Artifacts

All operations are:
- Local-only (no network)
- Deterministic
- Human-auditable

ARCHITECTURAL CONSOLIDATION (iter #5a):
Python is the SINGLE WRITER of `<workspace>/.ml/outputs/index.json`. The TS
extension only reads. The on-disk shape (canonical 10-field IndexEntry +
RunIndex container with `schema_version`) matches `src/types.ts:IndexEntry`
/ `RunIndex` exactly.

Migration shim (`load_index`) tolerates two legacy on-disk shapes that may
appear in the wild from earlier iterations:
- legacy bare-array (`[entry, entry, ...]`) — written by the TS extension
  before iter #5a deleted that writer
- legacy 6-field entries inside a `{schema_version, runs}` envelope — the
  pre-iter-#5a Python writer
Both are normalized to the canonical `{schema_version, runs}` shape on read.
New writes always emit the canonical 10-field entries.
"""

import json
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any

# Schema version for the index format.
# Bumped 0.2.2.1 -> 1.0.0 in iter #5a — first version with the canonical
# 10-field IndexEntry shape (run_id, created_at, name, preset_id, status,
# summary, run_dir, dataset_fingerprint_sha256, label_column, model_pkl).
INDEX_SCHEMA_VERSION = "1.0.0"

# Mirrors src/types.ts ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER. Must stay in sync.
INDEX_ORPHAN_FILENAME = ".index-orphan"

# Schema id for the orphan marker — must match the `const` in
# python/ml_runner/contracts/index-orphan.schema.v1.0.0.json.
INDEX_ORPHAN_SCHEMA_VERSION = "index-orphan.v1.0.0"


def _to_workspace_relative(path: Path, workspace_root: Path) -> str:
    """
    Convert an absolute path to a workspace-relative POSIX path.

    Falls back to the absolute path (POSIX-normalized) if the path is not
    under workspace_root — this should be vanishingly rare in production
    (the runner always lives under .ml/), but the marker writer must not
    raise on edge cases.
    """
    try:
        rel = path.resolve().relative_to(workspace_root.resolve())
        return str(rel).replace("\\", "/")
    except (ValueError, OSError):
        return str(path).replace("\\", "/")


def write_index_orphan_marker(
    run_dir: Path,
    run_id: str,
    workspace_root: Path,
    index_path: Path,
    error: BaseException,
) -> Optional[Path]:
    """
    Atomically write the `.index-orphan` marker under `run_dir`.

    Written when `run.json` was successfully created but the canonical index
    update (`<workspace>/.ml/outputs/index.json`) failed. Read by the TS
    Bridge to surface a "saved but not indexed" run in the UI rather than
    silently dropping it from the workspace listing.

    Schema authority: `python/ml_runner/contracts/index-orphan.schema.v1.0.0.json`.
    Required fields: schema_version, run_id, run_dir, written_at, error,
    index_path. The `error` object has required `type` and `message` plus
    optional `traceback`.

    Atomic write: the marker is first written to `<run_dir>/.index-orphan.tmp`
    and then `os.replace`-d into place. A crash mid-write therefore leaves
    either no marker or a complete marker — never a corrupted one.

    This function MUST NOT raise. The caller is already in an error path
    (the index update failed); a marker-write failure is logged and
    swallowed so it doesn't mask the original error.

    Args:
        run_dir: Absolute path to the run directory (where the marker lands).
        run_id: The run id whose index entry failed to land.
        workspace_root: The workspace root (parent of `.ml/`). Used to
            normalize `run_dir` and `index_path` to workspace-relative
            POSIX paths in the marker payload.
        index_path: Absolute path to the index file the writer was
            attempting to update.
        error: The exception raised by `append_run_to_index`.

    Returns:
        Path to the written marker, or None if the marker write itself
        failed (e.g., permission error on run_dir). The caller should not
        treat None as a hard error; it just means the orphan signal will
        not be visible to the Bridge.
    """
    try:
        # Build the payload conforming to the schema.
        payload: Dict[str, Any] = {
            "schema_version": INDEX_ORPHAN_SCHEMA_VERSION,
            "run_id": run_id,
            "run_dir": _to_workspace_relative(run_dir, workspace_root),
            "written_at": datetime.now(timezone.utc).isoformat(),
            "error": {
                "type": type(error).__name__,
                "message": str(error),
                "traceback": "".join(
                    traceback.format_exception(type(error), error, error.__traceback__)
                ),
            },
            "index_path": _to_workspace_relative(index_path, workspace_root),
        }

        marker_path = run_dir / INDEX_ORPHAN_FILENAME
        tmp_path = run_dir / (INDEX_ORPHAN_FILENAME + ".tmp")

        run_dir.mkdir(parents=True, exist_ok=True)

        # Write tmp + atomic replace.
        with open(tmp_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, indent=2, sort_keys=True, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, marker_path)

        return marker_path
    except Exception:
        # Marker writing is best-effort. The caller is already in an error
        # path; we must not raise and mask the original failure. Log via
        # the runtime logger that this function never owns.
        import logging
        logging.getLogger(__name__).warning(
            "Failed to write index-orphan marker for run_id=%s under %s",
            run_id,
            run_dir,
            exc_info=True,
        )
        return None


def get_index_path(workspace_outputs_dir: Path) -> Path:
    """Get path to the provenance index file (`.ml/outputs/index.json`)."""
    return workspace_outputs_dir / "index.json"


def load_index(workspace_outputs_dir: Path) -> Dict[str, Any]:
    """
    Load the provenance index, creating empty index if not exists.

    Migration shim: two legacy on-disk shapes are normalized into the
    canonical `{schema_version, runs}` envelope on read:
      1. Bare array `[entry, entry, ...]` — written by the TS extension
         before iter #5a deleted that writer.
      2. Pre-iter-#5a `{schema_version, runs}` with 6-field entries that
         lack `name` / `preset_id` / `status` / `summary`. These are passed
         through unchanged; consumers must tolerate missing fields on old
         entries (callers already do).

    If the file is structurally corrupt (not JSON, or not list/dict), it is
    backed up and a fresh empty index is returned.

    Returns:
        Index dict with `schema_version` and `runs` list.
    """
    index_path = get_index_path(workspace_outputs_dir)

    if not index_path.exists():
        return {
            "schema_version": INDEX_SCHEMA_VERSION,
            "runs": []
        }

    try:
        with open(index_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Migration #1: bare-array legacy shape (TS pre-iter-#5a writer).
        if isinstance(data, list):
            return {
                "schema_version": INDEX_SCHEMA_VERSION,
                "runs": data,
            }

        # Canonical / pre-iter-#5a-Python shape: dict with `runs`.
        if isinstance(data, dict) and "runs" in data and isinstance(data["runs"], list):
            # Pass through. Old 6-field entries coexist with new 10-field
            # entries; consumers tolerate missing fields.
            return data

        # Anything else is structurally invalid.
        raise ValueError("Invalid index structure")
    except (json.JSONDecodeError, ValueError):
        # Backup corrupt file and start fresh
        backup_path = index_path.with_suffix(f".json.corrupt.{int(datetime.now(timezone.utc).timestamp())}")
        index_path.rename(backup_path)
        print(f"Warning: Corrupt index backed up to {backup_path}, starting fresh")
        return {
            "schema_version": INDEX_SCHEMA_VERSION,
            "runs": []
        }


def save_index(workspace_outputs_dir: Path, index: Dict[str, Any]) -> None:
    """
    Save the provenance index atomically.

    Uses temp file + rename pattern for crash safety.
    Uses canonical JSON (sorted keys, consistent whitespace).
    """
    workspace_outputs_dir.mkdir(parents=True, exist_ok=True)
    index_path = get_index_path(workspace_outputs_dir)
    temp_path = index_path.with_suffix(".json.tmp")

    # Write to temp file first
    with open(temp_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(index, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    # Atomic rename (on POSIX; best-effort on Windows)
    temp_path.replace(index_path)


def append_run_to_index(
    workspace_outputs_dir: Path,
    run_id: str,
    created_at: str,
    name: str,
    preset_id: str,
    status: str,
    summary: Dict[str, Any],
    run_dir: str,
    dataset_fingerprint_sha256: str,
    label_column: str,
    model_pkl: str,
) -> None:
    """
    Append a canonical 10-field run entry to the provenance index.

    This is the single writer of `<workspace>/.ml/outputs/index.json`
    (iter #5a). The entry shape matches `src/types.ts:IndexEntry` exactly:

      Identity (passed via CLI from TS):
        run_id, created_at, name, preset_id

      Outcome (computed by Python after training):
        status, summary
          summary = {duration_ms, final_metrics, device}

      Provenance:
        run_dir, dataset_fingerprint_sha256, label_column, model_pkl

    Append-only: entries are never removed or reordered. Newest last.

    Args:
        workspace_outputs_dir: Path to `<workspace>/.ml/outputs/` — the
            directory that contains `index.json`.
        run_id: Unique run identifier.
        created_at: ISO-8601 timestamp.
        name: User-facing run name (passed via `--name` CLI arg). May be
            empty; callers pass `run_id` as a fallback in that case.
        preset_id: 'std-train' | 'hq-train'.
        status: 'succeeded' | 'failed' (this code path only runs after
            training success, so always 'succeeded').
        summary: Dict with `duration_ms` (int), `final_metrics` (dict, e.g.
            accuracy), and `device` (`cpu` | `cuda`).
        run_dir: Workspace-relative path to the run directory (forward
            slashes).
        dataset_fingerprint_sha256: SHA-256 of dataset bytes (lowercase
            64-char hex).
        label_column: Name of the label column.
        model_pkl: Workspace-relative path to the serialized model.
    """
    index = load_index(workspace_outputs_dir)

    entry = {
        # Identity
        "run_id": run_id,
        "created_at": created_at,
        "name": name,
        "preset_id": preset_id,
        # Outcome
        "status": status,
        "summary": summary,
        # Provenance
        "run_dir": run_dir,
        "dataset_fingerprint_sha256": dataset_fingerprint_sha256,
        "label_column": label_column,
        "model_pkl": model_pkl,
    }

    index["runs"].append(entry)
    # Always stamp the canonical version on write — even when migrating
    # from a legacy shape, the file is now canonical.
    index["schema_version"] = INDEX_SCHEMA_VERSION
    save_index(workspace_outputs_dir, index)


def get_latest_run(workspace_outputs_dir: Path) -> Optional[Dict[str, Any]]:
    """
    Get the most recent run entry from the index.

    Returns:
        Run entry dict, or None if no runs exist
    """
    index = load_index(workspace_outputs_dir)
    runs = index.get("runs", [])
    return runs[-1] if runs else None


def get_run_by_id(workspace_outputs_dir: Path, run_id: str) -> Optional[Dict[str, Any]]:
    """
    Find a run by its ID.

    Returns:
        Run entry dict, or None if not found
    """
    index = load_index(workspace_outputs_dir)
    for run in index.get("runs", []):
        if run.get("run_id") == run_id:
            return run
    return None


def list_runs(workspace_outputs_dir: Path) -> List[Dict[str, Any]]:
    """
    List all runs in the index.

    Returns:
        List of run entries (oldest first, newest last)
    """
    index = load_index(workspace_outputs_dir)
    return index.get("runs", [])


def find_runs_by_fingerprint(
    workspace_outputs_dir: Path,
    fingerprint: str
) -> List[Dict[str, Any]]:
    """
    Find all runs that used a specific dataset fingerprint.

    Returns:
        List of matching run entries
    """
    index = load_index(workspace_outputs_dir)
    return [
        run for run in index.get("runs", [])
        if run.get("dataset_fingerprint_sha256") == fingerprint
    ]
