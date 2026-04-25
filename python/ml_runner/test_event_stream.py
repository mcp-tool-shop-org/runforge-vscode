"""
F-PY-B004 (iter #5b): structured event-stream foundation test.

Contract (lives at the top of `runner.py`): structured events go to
**stderr** as JSONL. Each event is `{"event": <str>, "timestamp": <ISO8601
UTC>, ...payload}`. Human-readable progress remains on stdout. The TS
Bridge consumes stderr line-by-line; non-JSONL stderr is treated as
free-form log lines.

This file tests the FOUNDATION (helper shape + the single proof-of-concept
`run_start` event emitted at the start of `run_training`). Phase 4 will
build full progress emission on top.
"""

import io
import json
import sys
from datetime import datetime

import pytest

from ml_runner.runner import emit_event


class TestEmitEventShape:
    """The emit_event helper writes one JSONL record per call."""

    def test_event_is_valid_jsonl(self, capsys: pytest.CaptureFixture):
        emit_event("run_start", run_id="abc", preset_id="std-train", model_family="logistic_regression")
        captured = capsys.readouterr()
        # Stdout should be untouched.
        assert captured.out == ""
        # Stderr should have exactly one line that parses as JSON.
        line = captured.err.strip()
        assert "\n" not in line
        record = json.loads(line)

        assert isinstance(record, dict)

    def test_event_has_event_and_timestamp_keys(self, capsys: pytest.CaptureFixture):
        emit_event("run_start", preset_id="std-train", model_family="logistic_regression")
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())

        assert "event" in record
        assert "timestamp" in record
        assert record["event"] == "run_start"

    def test_timestamp_is_iso_utc(self, capsys: pytest.CaptureFixture):
        emit_event("run_start", preset_id="std-train", model_family="logistic_regression")
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())

        # Timezone-aware ISO-8601.
        parsed = datetime.fromisoformat(record["timestamp"])
        assert parsed.tzinfo is not None

    def test_payload_fields_flow_through(self, capsys: pytest.CaptureFixture):
        emit_event(
            "run_start",
            preset_id="hq-train",
            model_family="random_forest",
            extra_count=42,
        )
        captured = capsys.readouterr()
        record = json.loads(captured.err.strip())

        assert record["preset_id"] == "hq-train"
        assert record["model_family"] == "random_forest"
        assert record["extra_count"] == 42

    def test_emit_event_never_raises_on_unserializable(
        self, capsys: pytest.CaptureFixture
    ):
        """A non-JSON-serializable payload should NOT crash the run."""

        class NotSerializable:
            pass

        # Should not raise.
        emit_event("run_start", obj=NotSerializable())
