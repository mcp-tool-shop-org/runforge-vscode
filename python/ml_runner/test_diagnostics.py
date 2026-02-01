"""
Tests for Diagnostics Module (Phase 2.2.2)

Tests cover:
- Diagnostic code constants
- DiagnosticsCollector behavior
- Structured output format
- Each diagnostic type
"""

import pytest

from .diagnostics import (
    DiagnosticCode,
    DiagnosticSeverity,
    Diagnostic,
    DiagnosticsCollector,
)


class TestDiagnosticCodes:
    """Test diagnostic code constants."""

    def test_missing_values_dropped_exists(self):
        """MISSING_VALUES_DROPPED must exist (Phase 2.2.1 stable)."""
        assert DiagnosticCode.MISSING_VALUES_DROPPED.value == "MISSING_VALUES_DROPPED"

    def test_label_not_found_exists(self):
        """LABEL_NOT_FOUND must exist (Phase 2.2.2)."""
        assert DiagnosticCode.LABEL_NOT_FOUND.value == "LABEL_NOT_FOUND"

    def test_label_type_invalid_exists(self):
        """LABEL_TYPE_INVALID must exist (Phase 2.2.2)."""
        assert DiagnosticCode.LABEL_TYPE_INVALID.value == "LABEL_TYPE_INVALID"

    def test_zero_rows_exists(self):
        """ZERO_ROWS must exist (Phase 2.2.2)."""
        assert DiagnosticCode.ZERO_ROWS.value == "ZERO_ROWS"

    def test_zero_features_exists(self):
        """ZERO_FEATURES must exist (Phase 2.2.2)."""
        assert DiagnosticCode.ZERO_FEATURES.value == "ZERO_FEATURES"

    def test_label_only_dataset_exists(self):
        """LABEL_ONLY_DATASET must exist (Phase 2.2.2)."""
        assert DiagnosticCode.LABEL_ONLY_DATASET.value == "LABEL_ONLY_DATASET"


class TestDiagnostic:
    """Test Diagnostic dataclass."""

    def test_to_dict_minimal(self):
        """Diagnostic without details should serialize cleanly."""
        diag = Diagnostic(
            code="TEST_CODE",
            severity="info",
            message="Test message",
        )

        result = diag.to_dict()

        assert result == {
            "code": "TEST_CODE",
            "severity": "info",
            "message": "Test message",
        }
        assert "details" not in result

    def test_to_dict_with_details(self):
        """Diagnostic with details should include them."""
        diag = Diagnostic(
            code="TEST_CODE",
            severity="warning",
            message="Test message",
            details={"key": "value", "count": 42},
        )

        result = diag.to_dict()

        assert result["details"] == {"key": "value", "count": 42}


class TestDiagnosticsCollector:
    """Test DiagnosticsCollector behavior."""

    def test_empty_collector(self):
        """New collector should be empty."""
        collector = DiagnosticsCollector()

        assert collector.get_all() == []
        assert collector.to_list() == []
        assert not collector.has_errors()

    def test_add_diagnostic(self):
        """Should add diagnostics in order."""
        collector = DiagnosticsCollector()

        diag1 = Diagnostic(code="CODE1", severity="info", message="First")
        diag2 = Diagnostic(code="CODE2", severity="warning", message="Second")

        collector.add(diag1)
        collector.add(diag2)

        all_diags = collector.get_all()
        assert len(all_diags) == 2
        assert all_diags[0].code == "CODE1"
        assert all_diags[1].code == "CODE2"

    def test_has_errors_with_error(self):
        """has_errors should return True when error-level diagnostic exists."""
        collector = DiagnosticsCollector()
        collector.add(Diagnostic(code="INFO", severity="info", message="Info"))
        collector.add(Diagnostic(code="ERROR", severity="error", message="Error"))

        assert collector.has_errors()

    def test_has_errors_without_error(self):
        """has_errors should return False when no error-level diagnostics."""
        collector = DiagnosticsCollector()
        collector.add(Diagnostic(code="INFO", severity="info", message="Info"))
        collector.add(Diagnostic(code="WARN", severity="warning", message="Warning"))

        assert not collector.has_errors()

    def test_clear(self):
        """clear should remove all diagnostics."""
        collector = DiagnosticsCollector()
        collector.add(Diagnostic(code="CODE", severity="info", message="Test"))

        collector.clear()

        assert collector.get_all() == []


class TestMissingValuesDropped:
    """Test MISSING_VALUES_DROPPED diagnostic."""

    def test_add_missing_values_dropped_with_rows(self):
        """Should add diagnostic when rows dropped."""
        collector = DiagnosticsCollector()

        collector.add_missing_values_dropped(5)

        diags = collector.to_list()
        assert len(diags) == 1
        assert diags[0]["code"] == "MISSING_VALUES_DROPPED"
        assert diags[0]["severity"] == "info"
        assert diags[0]["details"]["rows_dropped"] == 5

    def test_add_missing_values_dropped_zero(self):
        """Should NOT add diagnostic when zero rows dropped."""
        collector = DiagnosticsCollector()

        collector.add_missing_values_dropped(0)

        assert collector.to_list() == []


class TestLabelNotFound:
    """Test LABEL_NOT_FOUND diagnostic."""

    def test_add_label_not_found(self):
        """Should record label not found error."""
        collector = DiagnosticsCollector()

        collector.add_label_not_found(
            expected_label="label",
            available_columns=["feature1", "feature2", "target"],
        )

        diags = collector.to_list()
        assert len(diags) == 1
        assert diags[0]["code"] == "LABEL_NOT_FOUND"
        assert diags[0]["severity"] == "error"
        assert diags[0]["details"]["expected_label"] == "label"
        assert diags[0]["details"]["available_columns"] == ["feature1", "feature2", "target"]

    def test_label_not_found_is_error(self):
        """LABEL_NOT_FOUND should trigger has_errors."""
        collector = DiagnosticsCollector()

        collector.add_label_not_found("label", ["col1"])

        assert collector.has_errors()


class TestLabelTypeInvalid:
    """Test LABEL_TYPE_INVALID diagnostic."""

    def test_add_label_type_invalid(self):
        """Should record label type error."""
        collector = DiagnosticsCollector()

        collector.add_label_type_invalid(
            label_column="label",
            found_type="string",
            expected_types=["int", "float"],
        )

        diags = collector.to_list()
        assert len(diags) == 1
        assert diags[0]["code"] == "LABEL_TYPE_INVALID"
        assert diags[0]["severity"] == "error"
        assert diags[0]["details"]["found_type"] == "string"


class TestZeroRows:
    """Test ZERO_ROWS diagnostic."""

    def test_add_zero_rows(self):
        """Should record zero rows error."""
        collector = DiagnosticsCollector()

        collector.add_zero_rows()

        diags = collector.to_list()
        assert len(diags) == 1
        assert diags[0]["code"] == "ZERO_ROWS"
        assert diags[0]["severity"] == "error"

    def test_zero_rows_is_error(self):
        """ZERO_ROWS should trigger has_errors."""
        collector = DiagnosticsCollector()

        collector.add_zero_rows()

        assert collector.has_errors()


class TestZeroFeatures:
    """Test ZERO_FEATURES diagnostic."""

    def test_add_zero_features(self):
        """Should record zero features error."""
        collector = DiagnosticsCollector()

        collector.add_zero_features()

        diags = collector.to_list()
        assert len(diags) == 1
        assert diags[0]["code"] == "ZERO_FEATURES"
        assert diags[0]["severity"] == "error"


class TestLabelOnlyDataset:
    """Test LABEL_ONLY_DATASET diagnostic."""

    def test_add_label_only_dataset(self):
        """Should record label-only dataset error."""
        collector = DiagnosticsCollector()

        collector.add_label_only_dataset("label")

        diags = collector.to_list()
        assert len(diags) == 1
        assert diags[0]["code"] == "LABEL_ONLY_DATASET"
        assert diags[0]["severity"] == "error"
        assert diags[0]["details"]["label_column"] == "label"


class TestToList:
    """Test to_list serialization."""

    def test_to_list_order_preserved(self):
        """Diagnostics should be serialized in insertion order."""
        collector = DiagnosticsCollector()

        collector.add_missing_values_dropped(3)
        collector.add_zero_rows()
        collector.add_label_not_found("label", ["x"])

        result = collector.to_list()

        codes = [d["code"] for d in result]
        assert codes == [
            "MISSING_VALUES_DROPPED",
            "ZERO_ROWS",
            "LABEL_NOT_FOUND",
        ]

    def test_to_list_is_json_serializable(self):
        """to_list output must be JSON serializable."""
        import json

        collector = DiagnosticsCollector()
        collector.add_missing_values_dropped(10)
        collector.add_label_not_found("label", ["a", "b"])

        result = collector.to_list()

        # Should not raise
        json_str = json.dumps(result)
        assert "MISSING_VALUES_DROPPED" in json_str
