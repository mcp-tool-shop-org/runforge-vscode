"""
F-PY-B004 (iter #5b) + Phase 4 (FT-PY-005): structured event-stream tests.

Contract (lives at the top of `runner.py`): structured events go to
**stderr** as JSONL. Each event is `{"event": <str>, "timestamp": <ISO8601
UTC>, ...payload}`. Human-readable progress remains on stdout. The TS
Bridge consumes stderr line-by-line; non-JSONL stderr is treated as
free-form log lines.

Phase 4 tests:
- emit_event runtime-validates against `events.schema.v1.json` (Preload 1).
- All 9 event types pass validation when their required fields are supplied.
- Invalid payloads (missing required, unknown property, wrong-typed field)
  are dropped with `logger.warning`; nothing lands on stderr; run continues.
- A full happy-path event sequence on `run_training()` lands the expected
  events in the expected order.
"""

import io
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import List

import pytest

from ml_runner.runner import emit_event, EVENTS_SCHEMA


# ---------------------------------------------------------------------------
# Foundation tests (preserved from Stage C, payloads updated to satisfy
# the FROZEN events.schema.v1.json now that emit_event validates).
# ---------------------------------------------------------------------------


class TestEmitEventShape:
    """The emit_event helper writes one JSONL record per call."""

    def test_event_is_valid_jsonl(self, capsys: pytest.CaptureFixture):
        emit_event(
            "run_start",
            run_id="r1",
            preset_id="std-train",
            model_family="logistic_regression",
        )
        captured = capsys.readouterr()
        # Stdout should be untouched.
        assert captured.out == ""
        # Stderr should have exactly one line that parses as JSON.
        line = captured.err.strip()
        assert "\n" not in line
        record = json.loads(line)

        assert isinstance(record, dict)

    def test_event_has_event_and_timestamp_keys(self, capsys: pytest.CaptureFixture):
        emit_event(
            "run_start",
            run_id="r1",
            preset_id="std-train",
            model_family="logistic_regression",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())

        assert "event" in record
        assert "timestamp" in record
        assert record["event"] == "run_start"

    def test_timestamp_is_iso_utc(self, capsys: pytest.CaptureFixture):
        emit_event(
            "run_start",
            run_id="r1",
            preset_id="std-train",
            model_family="logistic_regression",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())

        # Timezone-aware ISO-8601.
        parsed = datetime.fromisoformat(record["timestamp"])
        assert parsed.tzinfo is not None

    def test_payload_fields_flow_through(self, capsys: pytest.CaptureFixture):
        emit_event(
            "run_start",
            run_id="r1",
            preset_id="hq-train",
            model_family="random_forest",
            out_dir="/tmp/run",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())

        assert record["preset_id"] == "hq-train"
        assert record["model_family"] == "random_forest"
        assert record["out_dir"] == "/tmp/run"

    def test_emit_event_never_raises_on_unserializable(
        self, capsys: pytest.CaptureFixture
    ):
        """A non-JSON-serializable payload should NOT crash the run."""

        class NotSerializable:
            pass

        # Should not raise.
        emit_event("run_start", obj=NotSerializable())


# ---------------------------------------------------------------------------
# Phase 4 (FT-PY-005): each new event type round-trips against the schema.
# ---------------------------------------------------------------------------


class TestAllEventTypesValidate:
    """Each of the 9 event types lands on stderr when fed valid payloads."""

    def test_run_start(self, capsys: pytest.CaptureFixture):
        emit_event(
            "run_start",
            run_id="r1",
            preset_id="std-train",
            model_family="logistic_regression",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "run_start"

    def test_dataset_loaded(self, capsys: pytest.CaptureFixture):
        emit_event(
            "dataset_loaded",
            run_id="r1",
            num_samples=100,
            num_features=5,
            rows_dropped=2,
            label_column="label",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "dataset_loaded"
        assert record["num_samples"] == 100

    def test_dataset_loaded_with_fingerprint(self, capsys: pytest.CaptureFixture):
        emit_event(
            "dataset_loaded",
            run_id="r1",
            num_samples=50,
            num_features=4,
            rows_dropped=0,
            dataset_fingerprint_sha256="a" * 64,
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "dataset_loaded"
        assert record["dataset_fingerprint_sha256"] == "a" * 64

    def test_train_started(self, capsys: pytest.CaptureFixture):
        emit_event(
            "train_started",
            run_id="r1",
            model_family="logistic_regression",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "train_started"

    def test_train_progress_per_epoch(self, capsys: pytest.CaptureFixture):
        emit_event(
            "train_progress",
            run_id="r1",
            epoch=2,
            total_epochs=5,
            val_accuracy=0.85,
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "train_progress"
        assert record["epoch"] == 2
        assert record["total_epochs"] == 5

    def test_train_progress_non_iterative_single_event(
        self, capsys: pytest.CaptureFixture
    ):
        """Non-iterative models emit ONE train_progress with epoch=0, total=1."""
        emit_event(
            "train_progress",
            run_id="r1",
            epoch=0,
            total_epochs=1,
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["epoch"] == 0
        assert record["total_epochs"] == 1

    def test_train_finished(self, capsys: pytest.CaptureFixture):
        emit_event(
            "train_finished",
            run_id="r1",
            duration_seconds=3.14,
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "train_finished"

    def test_metrics_computed(self, capsys: pytest.CaptureFixture):
        emit_event(
            "metrics_computed",
            run_id="r1",
            metrics_profile="classification.base.v1",
            accuracy=0.92,
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "metrics_computed"

    def test_artifacts_written(self, capsys: pytest.CaptureFixture):
        emit_event(
            "artifacts_written",
            run_id="r1",
            artifact_count=4,
            run_dir=".ml/runs/r1",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "artifacts_written"
        assert record["artifact_count"] == 4

    def test_cancelling(self, capsys: pytest.CaptureFixture):
        emit_event(
            "cancelling",
            run_id="r1",
            seconds_remaining=4,
            step="training",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "cancelling"
        assert record["seconds_remaining"] == 4

    def test_run_cancelled(self, capsys: pytest.CaptureFixture):
        emit_event(
            "run_cancelled",
            run_id="r1",
            step="training",
            graceful=True,
            reason="user cancelled via SIGTERM",
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())
        assert record["event"] == "run_cancelled"
        assert record["graceful"] is True


# ---------------------------------------------------------------------------
# Preload 1: schema-validation gate drops invalid events.
# ---------------------------------------------------------------------------


class TestSchemaValidationGate:
    """Invalid event payloads are dropped (logger.warning) with empty stderr."""

    def test_missing_required_field_drops_event(
        self, capsys: pytest.CaptureFixture, caplog: pytest.LogCaptureFixture
    ):
        """run_start requires run_id; absent it the event must be dropped."""
        with caplog.at_level(logging.WARNING, logger="ml_runner.runner"):
            emit_event(
                "run_start",
                # No run_id — required by schema.
                preset_id="std-train",
                model_family="logistic_regression",
            )
        captured = capsys.readouterr()
        # Nothing on stderr — the malformed event was dropped.
        assert captured.err == ""
        # Failure was logged.
        assert any(
            "Dropping event" in rec.message and "run_start" in rec.message
            for rec in caplog.records
        )

    def test_unknown_property_drops_event(
        self, capsys: pytest.CaptureFixture, caplog: pytest.LogCaptureFixture
    ):
        """additionalProperties: false — extra keys must be rejected."""
        with caplog.at_level(logging.WARNING, logger="ml_runner.runner"):
            emit_event(
                "run_start",
                run_id="r1",
                preset_id="std-train",
                model_family="logistic_regression",
                bogus_field="not in schema",
            )
        captured = capsys.readouterr()
        assert captured.err == ""
        assert any(
            "Dropping event" in rec.message for rec in caplog.records
        )

    def test_wrong_event_name_drops_event(
        self, capsys: pytest.CaptureFixture, caplog: pytest.LogCaptureFixture
    ):
        """Unknown event names don't match any oneOf branch."""
        with caplog.at_level(logging.WARNING, logger="ml_runner.runner"):
            emit_event(
                "not_an_event",
                run_id="r1",
            )
        captured = capsys.readouterr()
        assert captured.err == ""
        assert any(
            "Dropping event" in rec.message for rec in caplog.records
        )

    def test_invalid_event_does_not_break_run(
        self, capsys: pytest.CaptureFixture
    ):
        """After a bad emit, a subsequent VALID emit still lands."""
        emit_event("nope", x=1)  # invalid, dropped
        emit_event(
            "run_start",
            run_id="r1",
            preset_id="std-train",
            model_family="logistic_regression",
        )  # valid
        captured = capsys.readouterr()
        # Exactly one line — the second emit landed; the first did not.
        lines = [l for l in captured.err.splitlines() if l.strip()]
        assert len(lines) == 1
        record = json.loads(lines[0])
        assert record["event"] == "run_start"


# ---------------------------------------------------------------------------
# Phase 4 (FT-PY-005): full happy-path event sequence on a real run.
# ---------------------------------------------------------------------------


@pytest.fixture
def iris_csv(tmp_path: Path) -> Path:
    """Iris-like fixture CSV with `label` column (numeric) — 30 samples."""
    rows = ["feature1,feature2,feature3,feature4,label"]
    for i in range(30):
        # 3-class repeating pattern.
        cls = i % 3
        rows.append(f"{i * 0.1},{i * 0.2},{i * 0.3},{i * 0.4},{cls}")
    csv = tmp_path / "iris.csv"
    csv.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return csv


@pytest.fixture
def workspace_run_dir(tmp_path: Path) -> Path:
    """Create a fake .ml workspace + run dir for run_training."""
    ws = tmp_path / "ws"
    rd = ws / ".ml" / "runs" / "20260425-000000-test-aaaa"
    rd.mkdir(parents=True)
    (ws / ".ml" / "outputs").mkdir(parents=True)
    return rd


class TestHappyPathEventSequence:
    """Run training end-to-end and assert the expected event sequence."""

    def _parse_events_from_stderr(self, stderr: str) -> List[dict]:
        """Pull out only JSONL event lines (skip free-form log lines)."""
        events: List[dict] = []
        for raw in stderr.splitlines():
            raw = raw.strip()
            if not raw or not raw.startswith("{"):
                continue
            try:
                rec = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(rec, dict) and "event" in rec:
                events.append(rec)
        return events

    def test_full_event_sequence_on_iris(
        self,
        iris_csv: Path,
        workspace_run_dir: Path,
        capsys: pytest.CaptureFixture,
        monkeypatch: pytest.MonkeyPatch,
    ):
        """Train on an iris-like fixture and assert all 7 happy-path events."""
        from ml_runner.runner import run_training

        monkeypatch.setenv("RUNFORGE_DATASET", str(iris_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(workspace_run_dir),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
        )

        captured = capsys.readouterr()
        events = self._parse_events_from_stderr(captured.err)
        names = [e["event"] for e in events]

        # Required ordering: run_start FIRST, artifacts_written LAST.
        assert names[0] == "run_start"
        assert names[-1] == "artifacts_written"

        # Required event types all appear.
        required = {
            "run_start",
            "dataset_loaded",
            "train_started",
            "train_progress",
            "train_finished",
            "metrics_computed",
            "artifacts_written",
        }
        assert required.issubset(set(names)), (
            f"missing events: {required - set(names)}; got {names}"
        )

        # train_progress count: logistic_regression iterates per epoch.
        # std-train preset specifies multiple epochs; expect >= 1.
        progress_events = [e for e in events if e["event"] == "train_progress"]
        assert len(progress_events) >= 1
        for e in progress_events:
            assert e["total_epochs"] >= 1
            assert 0 <= e["epoch"] <= e["total_epochs"]

        # No cancel events on the happy path.
        assert "cancelling" not in names
        assert "run_cancelled" not in names

    def test_non_iterative_model_emits_single_progress(
        self,
        iris_csv: Path,
        workspace_run_dir: Path,
        capsys: pytest.CaptureFixture,
        monkeypatch: pytest.MonkeyPatch,
    ):
        """random_forest is non-iterative — emits exactly one train_progress."""
        from ml_runner.runner import run_training

        monkeypatch.setenv("RUNFORGE_DATASET", str(iris_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(workspace_run_dir),
            seed=42,
            device="cpu",
            model_family="random_forest",
        )

        captured = capsys.readouterr()
        events = self._parse_events_from_stderr(captured.err)
        progress_events = [e for e in events if e["event"] == "train_progress"]

        # Non-iterative: exactly one progress event with total_epochs=1.
        assert len(progress_events) == 1
        assert progress_events[0]["epoch"] == 0
        assert progress_events[0]["total_epochs"] == 1


class TestSchemaLoaded:
    """Sanity: the events schema loaded at module import."""

    def test_events_schema_has_oneof(self):
        assert EVENTS_SCHEMA is not None
        assert "oneOf" in EVENTS_SCHEMA
        assert len(EVENTS_SCHEMA["oneOf"]) == 9
