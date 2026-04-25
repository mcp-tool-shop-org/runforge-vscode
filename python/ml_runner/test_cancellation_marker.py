"""
FT-PY-004 (Phase 4): cancellation marker + SIGTERM handler tests.

Schema authority: `python/ml_runner/contracts/cancelled.schema.v1.0.0.json`.
TS-side mirror: `ARTIFACT_FILENAMES.CANCELLED_MARKER` (Backend Wave 2 commit).

Covered:
1. write_cancelled_marker() schema conformance — payload validates against
   cancelled.schema.v1.0.0.json, all 5 required fields present, optional
   fields appear when supplied.
2. Atomicity — no `.cancelled.tmp` left behind after a successful write,
   no partial marker possible (os.replace contract).
3. Robustness — best-effort writer logs + returns None on failure, never
   raises; the SIGTERM handler keeps emitting `run_cancelled` even if the
   marker write is lost.
4. SIGTERM handler — registers + restores; on SIGTERM emits `cancelling`,
   writes marker, emits `run_cancelled`, exits 1. Subprocess integration
   test exercises the full graceful-cancel path against a fixture CSV.

Per CONTRACT-PHASE-4.md §3.1.3, the marker AND the run_cancelled event are
redundant graceful-detection signals — either is sufficient. These tests
pin both signals individually and assert their presence on the cancel path.
"""

import json
import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest
import jsonschema

from ml_runner.contracts import load_schema
from ml_runner.provenance import (
    CANCELLED_FILENAME,
    CANCELLED_SCHEMA_VERSION,
    CANCEL_STEPS,
    write_cancelled_marker,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
    """A run dir matching the canonical run-folder pattern."""
    rd = workspace / ".ml" / "runs" / "20260425-100000-test-aaaa"
    rd.mkdir(parents=True)
    return rd


@pytest.fixture(scope="module")
def cancelled_schema() -> dict:
    """Load the FROZEN cancelled.schema.v1.0.0 schema once per module."""
    return load_schema("cancelled.schema.v1.0.0")


# ---------------------------------------------------------------------------
# Marker schema conformance + atomicity (mirrors test_index_orphan_marker).
# ---------------------------------------------------------------------------


class TestMarkerSchemaConformance:
    """The marker payload must match cancelled.schema.v1.0.0.json exactly."""

    def test_marker_written_with_all_required_fields(
        self, workspace: Path, run_dir: Path, cancelled_schema: dict
    ):
        marker_path = write_cancelled_marker(
            run_dir=run_dir,
            run_id="20260425-100000-aaaa1234",
            workspace_root=workspace,
            step="training",
            reason="user cancelled via SIGTERM",
        )

        assert marker_path is not None
        assert marker_path.name == CANCELLED_FILENAME
        assert marker_path.exists()

        payload = json.loads(marker_path.read_text(encoding="utf-8"))

        # All 5 required fields present.
        for field in (
            "schema_version",
            "run_id",
            "run_dir",
            "cancelled_at",
            "step",
        ):
            assert field in payload, f"missing required field: {field}"

        # schema_version is the literal const.
        assert payload["schema_version"] == CANCELLED_SCHEMA_VERSION
        assert payload["schema_version"] == "cancelled.v1.0.0"

        # run_id matches what we passed.
        assert payload["run_id"] == "20260425-100000-aaaa1234"

        # run_dir is workspace-relative with forward slashes.
        assert payload["run_dir"] == ".ml/runs/20260425-100000-test-aaaa"
        assert "\\" not in payload["run_dir"]

        # cancelled_at is ISO-8601 with timezone.
        parsed = datetime.fromisoformat(payload["cancelled_at"])
        assert parsed.tzinfo is not None, "cancelled_at must be timezone-aware"

        # step is one of the enum values.
        assert payload["step"] in CANCEL_STEPS
        assert payload["step"] == "training"

        # reason flows through.
        assert payload["reason"] == "user cancelled via SIGTERM"

        # Validate the payload against the FROZEN schema authoritatively.
        jsonschema.validate(payload, cancelled_schema)

    def test_marker_optional_fields_omitted_when_not_provided(
        self, workspace: Path, run_dir: Path, cancelled_schema: dict
    ):
        """If reason / partial_artifacts are None, they must not appear."""
        marker_path = write_cancelled_marker(
            run_dir=run_dir,
            run_id="r1",
            workspace_root=workspace,
            step="dataset_loading",
        )
        payload = json.loads(marker_path.read_text(encoding="utf-8"))
        assert "reason" not in payload
        assert "partial_artifacts" not in payload

        # Still valid against the schema.
        jsonschema.validate(payload, cancelled_schema)

    def test_marker_partial_artifacts_listed_with_forward_slashes(
        self, workspace: Path, run_dir: Path, cancelled_schema: dict
    ):
        """partial_artifacts entries are normalized to POSIX paths."""
        marker_path = write_cancelled_marker(
            run_dir=run_dir,
            run_id="r1",
            workspace_root=workspace,
            step="artifact_writing",
            partial_artifacts=[
                "artifacts/model.pkl",
                "metrics.json",
                # Already-POSIX should pass through.
                "metrics.v1.json",
            ],
        )
        payload = json.loads(marker_path.read_text(encoding="utf-8"))
        assert payload["partial_artifacts"] == [
            "artifacts/model.pkl",
            "metrics.json",
            "metrics.v1.json",
        ]
        for p in payload["partial_artifacts"]:
            assert "\\" not in p
        jsonschema.validate(payload, cancelled_schema)

    def test_marker_filename_matches_canonical_constant(self):
        """The marker filename mirrors the TS ARTIFACT_FILENAMES constant."""
        # If this fails, src/types.ts ARTIFACT_FILENAMES.CANCELLED_MARKER
        # likely changed without updating provenance.py — coordinator must
        # resync the two constants.
        assert CANCELLED_FILENAME == ".cancelled"

    def test_marker_atomic_no_tmp_file_left_behind(
        self, workspace: Path, run_dir: Path
    ):
        """Successful write leaves the marker but not the .tmp scratch."""
        write_cancelled_marker(
            run_dir=run_dir,
            run_id="r1",
            workspace_root=workspace,
            step="training",
        )
        # No `.cancelled.tmp` should remain after os.replace.
        assert not (run_dir / (CANCELLED_FILENAME + ".tmp")).exists()
        assert (run_dir / CANCELLED_FILENAME).exists()

    def test_marker_validates_against_each_step_enum(
        self, workspace: Path, run_dir: Path, cancelled_schema: dict
    ):
        """Each of the 5 step values produces a schema-valid marker."""
        for step in CANCEL_STEPS:
            # Reset run_dir between iterations.
            for f in run_dir.iterdir():
                f.unlink()
            write_cancelled_marker(
                run_dir=run_dir,
                run_id="r1",
                workspace_root=workspace,
                step=step,
            )
            payload = json.loads(
                (run_dir / CANCELLED_FILENAME).read_text(encoding="utf-8")
            )
            assert payload["step"] == step
            jsonschema.validate(payload, cancelled_schema)


class TestMarkerWriteRobustness:
    """Marker writer is best-effort — must not raise even when it can't write."""

    def test_marker_write_returns_none_on_failure_does_not_raise(
        self, workspace: Path, run_dir: Path, caplog: pytest.LogCaptureFixture
    ):
        """If os.replace fails (locked / disk full), return None and log."""
        with patch(
            "ml_runner.provenance.os.replace",
            side_effect=PermissionError("locked"),
        ):
            with caplog.at_level(logging.WARNING, logger="ml_runner.provenance"):
                result = write_cancelled_marker(
                    run_dir=run_dir,
                    run_id="r1",
                    workspace_root=workspace,
                    step="training",
                )

        assert result is None
        assert any(
            "Failed to write cancelled marker" in rec.message
            for rec in caplog.records
        )

    def test_marker_write_handles_unwritable_run_dir(
        self, tmp_path: Path, caplog: pytest.LogCaptureFixture
    ):
        """If run_dir can't be created (e.g., parent missing on a non-mkdir
        path), return None and log."""

        # Patch mkdir to raise so we can simulate disk failure across
        # platforms (Windows file ACLs are too messy to set in CI).
        unwritable_run_dir = tmp_path / "noexist" / "runs" / "r1"
        with patch.object(
            Path,
            "mkdir",
            side_effect=PermissionError("read-only filesystem"),
        ):
            with caplog.at_level(logging.WARNING, logger="ml_runner.provenance"):
                result = write_cancelled_marker(
                    run_dir=unwritable_run_dir,
                    run_id="r1",
                    workspace_root=tmp_path,
                    step="training",
                )

        assert result is None


# ---------------------------------------------------------------------------
# In-process SIGTERM handler tests.
#
# These exercise the runner._sigterm_handler path WITHOUT spawning a
# subprocess, so they're cheap + deterministic. A separate subprocess
# integration test below confirms the full external SIGTERM-and-cleanup loop.
# ---------------------------------------------------------------------------


class TestSigtermHandlerInProcess:
    """Direct invocation of the handler against a synthesized cancel context."""

    def test_handler_emits_cancelling_then_run_cancelled_then_writes_marker(
        self,
        workspace: Path,
        run_dir: Path,
        capsys: pytest.CaptureFixture,
    ):
        """Calling the handler directly should emit both events + marker."""
        from ml_runner import runner as r

        ctx = r._CancelContext()
        ctx.run_id = "r1-handler"
        ctx.run_dir = run_dir
        ctx.workspace_root = workspace
        ctx.step = "training"
        ctx.partial_artifacts = ["artifacts/model.pkl"]

        # Install ctx into the module slot so the handler picks it up,
        # then invoke directly. We expect SystemExit(1).
        prev = r._cancel_context
        r._cancel_context = ctx
        try:
            with pytest.raises(SystemExit) as excinfo:
                r._sigterm_handler(signal.SIGTERM, None)
            assert excinfo.value.code == 1
        finally:
            r._cancel_context = prev

        captured = capsys.readouterr()

        # Marker landed.
        marker = run_dir / CANCELLED_FILENAME
        assert marker.exists(), "expected .cancelled marker on disk"

        # Both events landed (cancelling + run_cancelled). Parse JSONL events.
        events = []
        for line in captured.err.splitlines():
            line = line.strip()
            if not line or not line.startswith("{"):
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(rec, dict) and "event" in rec:
                events.append(rec)

        names = [e["event"] for e in events]
        assert "cancelling" in names, f"events: {names}"
        assert "run_cancelled" in names, f"events: {names}"

        # Final event is run_cancelled (last successful signal before exit).
        assert names[-1] == "run_cancelled"

        # cancelling event has correct shape.
        cancelling = next(e for e in events if e["event"] == "cancelling")
        assert cancelling["seconds_remaining"] == 5
        assert cancelling["step"] == "training"
        assert cancelling["run_id"] == "r1-handler"

        # run_cancelled event has graceful: true.
        run_cancelled = next(e for e in events if e["event"] == "run_cancelled")
        assert run_cancelled["graceful"] is True
        assert run_cancelled["step"] == "training"
        assert run_cancelled["run_id"] == "r1-handler"

    def test_handler_works_even_if_marker_write_fails(
        self,
        workspace: Path,
        run_dir: Path,
        capsys: pytest.CaptureFixture,
    ):
        """Preload 2: redundant signals — event still emits if marker fails."""
        from ml_runner import runner as r

        ctx = r._CancelContext()
        ctx.run_id = "r1-redundant"
        ctx.run_dir = run_dir
        ctx.workspace_root = workspace
        ctx.step = "metrics_computation"

        prev = r._cancel_context
        r._cancel_context = ctx
        try:
            with patch(
                "ml_runner.provenance.os.replace",
                side_effect=PermissionError("disk locked"),
            ):
                with pytest.raises(SystemExit):
                    r._sigterm_handler(signal.SIGTERM, None)
        finally:
            r._cancel_context = prev

        captured = capsys.readouterr()

        # Marker did NOT land (its write was patched to raise).
        marker = run_dir / CANCELLED_FILENAME
        assert not marker.exists()

        # But the run_cancelled event STILL landed — redundant signal carries.
        events = [
            json.loads(line.strip())
            for line in captured.err.splitlines()
            if line.strip().startswith('{')
        ]
        names = [e["event"] for e in events]
        assert "run_cancelled" in names

    def test_handler_works_even_if_event_emit_fails(
        self,
        workspace: Path,
        run_dir: Path,
    ):
        """Preload 2 mirror: marker still lands if stderr writes are patched."""
        from ml_runner import runner as r

        ctx = r._CancelContext()
        ctx.run_id = "r1-redundant2"
        ctx.run_dir = run_dir
        ctx.workspace_root = workspace
        ctx.step = "training"

        prev = r._cancel_context
        r._cancel_context = ctx
        try:
            # Patch stderr write to crash on every attempt — handler must
            # still complete the marker write.
            with patch.object(
                sys.stderr,
                "write",
                side_effect=BrokenPipeError("stderr closed"),
            ):
                with pytest.raises(SystemExit):
                    r._sigterm_handler(signal.SIGTERM, None)
        finally:
            r._cancel_context = prev

        # Marker landed despite stderr being unusable.
        marker = run_dir / CANCELLED_FILENAME
        assert marker.exists()
        payload = json.loads(marker.read_text(encoding="utf-8"))
        assert payload["run_id"] == "r1-redundant2"

    def test_handler_no_active_run_just_exits(self, capsys: pytest.CaptureFixture):
        """SIGTERM with no active run context must exit cleanly without crash."""
        from ml_runner import runner as r

        prev = r._cancel_context
        r._cancel_context = None
        try:
            with pytest.raises(SystemExit) as excinfo:
                r._sigterm_handler(signal.SIGTERM, None)
            assert excinfo.value.code == 1
        finally:
            r._cancel_context = prev


class TestSigtermHandlerLifecycle:
    """The handler is registered + restored around each run."""

    def test_register_unregister_restores_previous_handler(self):
        from ml_runner import runner as r

        sentinel_called = {"hit": False}

        def sentinel_handler(signum, frame):
            sentinel_called["hit"] = True

        # Install a sentinel so we can detect restoration.
        prev = signal.signal(signal.SIGTERM, sentinel_handler)
        try:
            ctx = r._CancelContext()
            ctx.run_id = "r1"
            r._register_sigterm_handler(ctx)

            # Active handler is the runner's, not the sentinel.
            current = signal.getsignal(signal.SIGTERM)
            assert current is r._sigterm_handler

            r._unregister_sigterm_handler(ctx)

            # Restored to sentinel.
            current = signal.getsignal(signal.SIGTERM)
            assert current is sentinel_handler
        finally:
            signal.signal(signal.SIGTERM, prev)

    def test_unregister_idempotent(self):
        from ml_runner import runner as r

        ctx = r._CancelContext()
        # Never registered; unregister must not raise.
        r._unregister_sigterm_handler(ctx)
        # Second call also fine.
        r._unregister_sigterm_handler(ctx)


# ---------------------------------------------------------------------------
# Subprocess integration test — full SIGTERM + graceful cleanup loop.
#
# Skipped on Windows because os.kill(pid, SIGTERM) maps to TerminateProcess
# which bypasses Python's signal handler. The TS-side 5-second SIGKILL is
# the documented fallback for that platform; this test pins the POSIX path.
# Preload 3 explicitly calls out the platform constraint.
# ---------------------------------------------------------------------------


def _write_iris_csv(path: Path) -> None:
    """Tiny iris-like CSV with `label` column for subprocess fixtures."""
    rows = ["feature1,feature2,feature3,feature4,label"]
    for i in range(60):
        rows.append(f"{i * 0.1},{i * 0.2},{i * 0.3},{i * 0.4},{i % 3}")
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")


@pytest.mark.skipif(
    sys.platform == "win32",
    reason=(
        "Windows os.kill(SIGTERM) maps to TerminateProcess and bypasses "
        "Python's signal handler. The graceful path is exercised in-process "
        "above; the TS-side 5s SIGKILL is the documented Windows fallback."
    ),
)
def test_subprocess_sigterm_writes_marker_and_emits_run_cancelled(
    tmp_path: Path,
):
    """Spawn ml_runner train, send SIGTERM, assert marker + event + ~5s exit."""
    # Construct a fake .ml workspace so the runner can locate outputs.
    ws = tmp_path / "ws"
    out = ws / ".ml" / "runs" / "20260425-110000-smoke-aaaa"
    out.mkdir(parents=True)
    (ws / ".ml" / "outputs").mkdir(parents=True)

    csv = tmp_path / "iris.csv"
    _write_iris_csv(csv)

    env = os.environ.copy()
    env["RUNFORGE_DATASET"] = str(csv)
    # Make sure the ml_runner package is importable.
    repo_root = Path(__file__).resolve().parents[2]
    python_dir = repo_root / "python"
    env["PYTHONPATH"] = (
        str(python_dir) + os.pathsep + env.get("PYTHONPATH", "")
    )

    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "ml_runner",
            "train",
            "--preset",
            "std-train",
            "--out",
            str(out),
            "--device",
            "cpu",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )

    # Give the run a moment to install the SIGTERM handler + start training.
    # The fixture is small, so we send SIGTERM almost immediately; the
    # handler is registered before any heavy work begins.
    time.sleep(0.5)

    cancel_sent_at = time.monotonic()
    proc.send_signal(signal.SIGTERM)

    # Wait up to 8s (5s grace + 3s cushion).
    try:
        stdout, stderr = proc.communicate(timeout=8)
    except subprocess.TimeoutExpired:
        proc.kill()
        stdout, stderr = proc.communicate()
        pytest.fail(
            f"runner did not exit within graceful window; "
            f"stdout={stdout!r}, stderr={stderr!r}"
        )

    elapsed = time.monotonic() - cancel_sent_at
    # Should exit well within ~6 seconds (5s grace + tolerance).
    assert elapsed < 7.0, f"graceful exit took {elapsed:.2f}s"

    # Process exited non-zero (cancel exit code).
    assert proc.returncode != 0

    # Marker landed.
    marker = out / CANCELLED_FILENAME
    assert marker.exists(), (
        f".cancelled marker missing; stderr={stderr!r}"
    )
    payload = json.loads(marker.read_text(encoding="utf-8"))
    assert payload["schema_version"] == CANCELLED_SCHEMA_VERSION
    assert payload["step"] in CANCEL_STEPS

    # run_cancelled event appears in stderr stream.
    stderr_text = stderr.decode("utf-8", errors="replace")
    seen_run_cancelled = False
    for line in stderr_text.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("event") == "run_cancelled":
            seen_run_cancelled = True
            assert rec.get("graceful") is True
            break
    assert seen_run_cancelled, (
        f"run_cancelled event not found in stderr: {stderr_text!r}"
    )
