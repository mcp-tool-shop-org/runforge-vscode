"""
F-PY-B002 (iter #5b): index-orphan marker contract tests.

When `append_run_to_index` fails after `run.json` has been written, the
provenance module writes a `.index-orphan` marker under the run directory.
The TS Bridge reads it and surfaces the run as "saved but not indexed"
instead of silently dropping it from the workspace listing.

Schema authority: `python/ml_runner/contracts/index-orphan.schema.v1.0.0.json`.
TS-side type mirror: `IndexOrphanMarker` in `src/types.ts`.

These tests pin:
1. Marker payload conforms to schema (all 6 required fields, correct types,
   forward-slash paths).
2. Marker write is best-effort — a permission error inside the writer is
   logged and swallowed, never raised.
"""

import json
import logging
from pathlib import Path
from unittest.mock import patch

import pytest

from ml_runner.provenance import (
    INDEX_ORPHAN_FILENAME,
    INDEX_ORPHAN_SCHEMA_VERSION,
    write_index_orphan_marker,
)


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    """Create a fake .ml workspace layout."""
    ws = tmp_path / "workspace"
    ml = ws / ".ml"
    runs = ml / "runs"
    outputs = ml / "outputs"
    runs.mkdir(parents=True)
    outputs.mkdir(parents=True)
    return ws


@pytest.fixture
def run_dir(workspace: Path) -> Path:
    """A run dir matching the run-folder.ts pattern."""
    rd = workspace / ".ml" / "runs" / "20260201-142355-test-a3f9"
    rd.mkdir(parents=True)
    return rd


class TestMarkerSchemaConformance:
    """The marker payload must match index-orphan.schema.v1.0.0.json exactly."""

    def test_marker_written_with_all_required_fields(
        self, workspace: Path, run_dir: Path
    ):
        index_path = workspace / ".ml" / "outputs" / "index.json"
        try:
            raise PermissionError("simulated index lock")
        except PermissionError as e:
            err = e

        marker_path = write_index_orphan_marker(
            run_dir=run_dir,
            run_id="20260201-142355-test-a3f9",
            workspace_root=workspace,
            index_path=index_path,
            error=err,
        )

        assert marker_path is not None
        assert marker_path.name == INDEX_ORPHAN_FILENAME
        assert marker_path.exists()

        payload = json.loads(marker_path.read_text(encoding="utf-8"))

        # All 6 required top-level fields present.
        for field in (
            "schema_version",
            "run_id",
            "run_dir",
            "written_at",
            "error",
            "index_path",
        ):
            assert field in payload, f"missing required field: {field}"

        # schema_version is the literal const.
        assert payload["schema_version"] == INDEX_ORPHAN_SCHEMA_VERSION
        assert payload["schema_version"] == "index-orphan.v1.0.0"

        # run_id matches what we passed.
        assert payload["run_id"] == "20260201-142355-test-a3f9"

        # run_dir is workspace-relative with forward slashes.
        assert payload["run_dir"] == ".ml/runs/20260201-142355-test-a3f9"
        assert "\\" not in payload["run_dir"]

        # index_path is workspace-relative with forward slashes.
        assert payload["index_path"] == ".ml/outputs/index.json"
        assert "\\" not in payload["index_path"]

        # written_at is ISO-8601 with timezone.
        # (datetime.fromisoformat tolerates both naive and aware ISO-8601.)
        from datetime import datetime
        parsed = datetime.fromisoformat(payload["written_at"])
        assert parsed.tzinfo is not None, "written_at must be timezone-aware"

        # error has required shape.
        assert isinstance(payload["error"], dict)
        assert payload["error"]["type"] == "PermissionError"
        assert payload["error"]["message"] == "simulated index lock"
        assert isinstance(payload["error"].get("traceback"), str)
        assert len(payload["error"]["traceback"]) > 0

    def test_marker_filename_matches_canonical_constant(self):
        """The marker filename mirrors the TS ARTIFACT_FILENAMES constant."""
        # If this fails, src/types.ts ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER
        # likely changed without updating provenance.py.
        assert INDEX_ORPHAN_FILENAME == ".index-orphan"

    def test_marker_atomic_no_tmp_file_left_behind(
        self, workspace: Path, run_dir: Path
    ):
        index_path = workspace / ".ml" / "outputs" / "index.json"
        write_index_orphan_marker(
            run_dir=run_dir,
            run_id="20260201-142355-test-a3f9",
            workspace_root=workspace,
            index_path=index_path,
            error=ValueError("x"),
        )

        # No `.index-orphan.tmp` should remain.
        assert not (run_dir / (INDEX_ORPHAN_FILENAME + ".tmp")).exists()
        assert (run_dir / INDEX_ORPHAN_FILENAME).exists()

    def test_marker_supports_various_exception_types(
        self, workspace: Path, run_dir: Path
    ):
        """Exception class name flows through verbatim — Bridge keys on it."""
        index_path = workspace / ".ml" / "outputs" / "index.json"
        for exc in (
            OSError("disk full"),
            json.JSONDecodeError("bad", "doc", 0),
            FileNotFoundError("missing"),
        ):
            # Reset run_dir for each variant.
            for f in run_dir.iterdir():
                f.unlink()
            write_index_orphan_marker(
                run_dir=run_dir,
                run_id="20260201-142355-test-a3f9",
                workspace_root=workspace,
                index_path=index_path,
                error=exc,
            )
            payload = json.loads(
                (run_dir / INDEX_ORPHAN_FILENAME).read_text(encoding="utf-8")
            )
            assert payload["error"]["type"] == type(exc).__name__


class TestMarkerWriteRobustness:
    """The marker writer is best-effort — must not raise even when it can't write."""

    def test_marker_write_returns_none_on_failure_does_not_raise(
        self, workspace: Path, run_dir: Path, caplog: pytest.LogCaptureFixture
    ):
        """If the JSON serialization or replace fails, return None and log."""
        index_path = workspace / ".ml" / "outputs" / "index.json"

        # Patch `os.replace` (used internally for the atomic rename) to raise.
        # The writer must catch this and return None.
        with patch("ml_runner.provenance.os.replace", side_effect=PermissionError("locked")):
            with caplog.at_level(logging.WARNING, logger="ml_runner.provenance"):
                result = write_index_orphan_marker(
                    run_dir=run_dir,
                    run_id="20260201-142355-test-a3f9",
                    workspace_root=workspace,
                    index_path=index_path,
                    error=ValueError("original"),
                )

        assert result is None
        # The failure was logged (warning), not raised.
        assert any(
            "Failed to write index-orphan marker" in rec.message
            for rec in caplog.records
        )
