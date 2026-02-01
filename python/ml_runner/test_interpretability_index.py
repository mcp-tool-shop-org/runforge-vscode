"""
Phase 3.6 Interpretability Index Tests

Tests for:
- Schema validation
- Deterministic output
- Conditional artifact presence (metrics only, +FI, +LC, all three)
- Summary content (no numeric duplication)
- Absent artifacts omitted from available_artifacts
"""

import pytest
import json
from datetime import datetime, timezone
from pathlib import Path

from ml_runner.interpretability_index import (
    SCHEMA_VERSION,
    build_interpretability_index,
    write_interpretability_index,
)


class TestSchemaVersion:
    """Tests for schema version constant."""

    def test_schema_version(self):
        """Schema version is interpretability.index.v1."""
        assert SCHEMA_VERSION == "interpretability.index.v1"


class TestBuildInterpretabilityIndex:
    """Tests for build_interpretability_index function."""

    @pytest.fixture
    def base_run_json(self):
        """Minimal run.json with metrics_v1 only."""
        return {
            "run_id": "20240101-120000-abc12345",
            "runforge_version": "0.3.6.0",
            "metrics": {
                "accuracy": 0.95,
                "num_samples": 100,
                "num_features": 10,
            },
            "metrics_v1": {
                "schema_version": "metrics.v1",
                "metrics_profile": "classification.proba.v1",
                "artifact_path": "metrics.v1.json",
            },
        }

    @pytest.fixture
    def run_dir_with_metrics(self, tmp_path, base_run_json):
        """Create a run directory with only metrics.v1.json."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        (run_dir / "metrics.v1.json").write_text('{"schema_version": "metrics.v1"}')
        return run_dir

    def test_includes_schema_version(self, base_run_json, run_dir_with_metrics):
        """Index includes correct schema_version."""
        index = build_interpretability_index(base_run_json, run_dir_with_metrics)
        assert index["schema_version"] == "interpretability.index.v1"

    def test_includes_run_id(self, base_run_json, run_dir_with_metrics):
        """Index includes run_id from run.json."""
        index = build_interpretability_index(base_run_json, run_dir_with_metrics)
        assert index["run_id"] == "20240101-120000-abc12345"

    def test_includes_runforge_version(self, base_run_json, run_dir_with_metrics):
        """Index includes current runforge_version."""
        index = build_interpretability_index(base_run_json, run_dir_with_metrics)
        assert index["runforge_version"].startswith("0.3.")

    def test_includes_created_at(self, base_run_json, run_dir_with_metrics):
        """Index includes created_at timestamp."""
        index = build_interpretability_index(base_run_json, run_dir_with_metrics)
        assert "created_at" in index
        # Should be ISO format
        datetime.fromisoformat(index["created_at"].replace("Z", "+00:00"))

    def test_available_artifacts_is_dict(self, base_run_json, run_dir_with_metrics):
        """available_artifacts is a dict."""
        index = build_interpretability_index(base_run_json, run_dir_with_metrics)
        assert isinstance(index["available_artifacts"], dict)


class TestMetricsV1Entry:
    """Tests for metrics_v1 entry in available_artifacts."""

    @pytest.fixture
    def run_json_with_metrics(self):
        """run.json with metrics_v1."""
        return {
            "run_id": "test-run",
            "runforge_version": "0.3.6.0",
            "metrics": {
                "accuracy": 0.92,
            },
            "metrics_v1": {
                "schema_version": "metrics.v1",
                "metrics_profile": "classification.base.v1",
                "artifact_path": "metrics.v1.json",
            },
        }

    @pytest.fixture
    def run_dir_metrics(self, tmp_path, run_json_with_metrics):
        """Run directory with metrics.v1.json."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        (run_dir / "metrics.v1.json").write_text('{}')
        return run_dir

    def test_metrics_v1_included_when_exists(self, run_json_with_metrics, run_dir_metrics):
        """metrics_v1 is included when artifact exists."""
        index = build_interpretability_index(run_json_with_metrics, run_dir_metrics)
        assert "metrics_v1" in index["available_artifacts"]

    def test_metrics_v1_has_schema_version(self, run_json_with_metrics, run_dir_metrics):
        """metrics_v1 entry has schema_version."""
        index = build_interpretability_index(run_json_with_metrics, run_dir_metrics)
        entry = index["available_artifacts"]["metrics_v1"]
        assert entry["schema_version"] == "metrics.v1"

    def test_metrics_v1_has_path(self, run_json_with_metrics, run_dir_metrics):
        """metrics_v1 entry has path."""
        index = build_interpretability_index(run_json_with_metrics, run_dir_metrics)
        entry = index["available_artifacts"]["metrics_v1"]
        assert entry["path"] == "metrics.v1.json"

    def test_metrics_v1_summary_has_profile(self, run_json_with_metrics, run_dir_metrics):
        """metrics_v1 summary has metrics_profile."""
        index = build_interpretability_index(run_json_with_metrics, run_dir_metrics)
        summary = index["available_artifacts"]["metrics_v1"]["summary"]
        assert summary["metrics_profile"] == "classification.base.v1"

    def test_metrics_v1_summary_has_accuracy_from_run_json(self, run_json_with_metrics, run_dir_metrics):
        """metrics_v1 summary has accuracy from run.json (not artifact)."""
        index = build_interpretability_index(run_json_with_metrics, run_dir_metrics)
        summary = index["available_artifacts"]["metrics_v1"]["summary"]
        assert summary["accuracy"] == 0.92


class TestFeatureImportanceEntry:
    """Tests for feature_importance_v1 entry in available_artifacts."""

    @pytest.fixture
    def run_json_with_fi(self):
        """run.json with feature_importance."""
        return {
            "run_id": "test-run",
            "runforge_version": "0.3.6.0",
            "metrics": {"accuracy": 0.88},
            "metrics_v1": {
                "schema_version": "metrics.v1",
                "metrics_profile": "classification.proba.v1",
                "artifact_path": "metrics.v1.json",
            },
            "feature_importance_schema_version": "feature_importance.v1",
            "feature_importance_artifact": "artifacts/feature_importance.v1.json",
        }

    @pytest.fixture
    def run_dir_with_fi(self, tmp_path, run_json_with_fi):
        """Run directory with feature_importance.v1.json."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        (run_dir / "metrics.v1.json").write_text('{}')
        artifacts_dir = run_dir / "artifacts"
        artifacts_dir.mkdir()
        fi_artifact = {
            "model_family": "random_forest",
            "top_k": ["feature_a", "feature_b", "feature_c", "feature_d", "feature_e", "feature_f"],
        }
        (artifacts_dir / "feature_importance.v1.json").write_text(json.dumps(fi_artifact))
        return run_dir

    def test_fi_included_when_exists(self, run_json_with_fi, run_dir_with_fi):
        """feature_importance_v1 is included when artifact exists."""
        index = build_interpretability_index(run_json_with_fi, run_dir_with_fi)
        assert "feature_importance_v1" in index["available_artifacts"]

    def test_fi_has_schema_version(self, run_json_with_fi, run_dir_with_fi):
        """feature_importance_v1 entry has schema_version."""
        index = build_interpretability_index(run_json_with_fi, run_dir_with_fi)
        entry = index["available_artifacts"]["feature_importance_v1"]
        assert entry["schema_version"] == "feature_importance.v1"

    def test_fi_summary_has_model_family(self, run_json_with_fi, run_dir_with_fi):
        """feature_importance_v1 summary has model_family."""
        index = build_interpretability_index(run_json_with_fi, run_dir_with_fi)
        summary = index["available_artifacts"]["feature_importance_v1"]["summary"]
        assert summary["model_family"] == "random_forest"

    def test_fi_summary_top_k_max_5(self, run_json_with_fi, run_dir_with_fi):
        """feature_importance_v1 summary top_k is max 5."""
        index = build_interpretability_index(run_json_with_fi, run_dir_with_fi)
        summary = index["available_artifacts"]["feature_importance_v1"]["summary"]
        assert len(summary["top_k"]) == 5


class TestLinearCoefficientsEntry:
    """Tests for linear_coefficients_v1 entry in available_artifacts."""

    @pytest.fixture
    def run_json_with_lc(self):
        """run.json with linear_coefficients."""
        return {
            "run_id": "test-run",
            "runforge_version": "0.3.6.0",
            "metrics": {"accuracy": 0.91},
            "metrics_v1": {
                "schema_version": "metrics.v1",
                "metrics_profile": "classification.proba.v1",
                "artifact_path": "metrics.v1.json",
            },
            "linear_coefficients_schema_version": "linear_coefficients.v1",
            "linear_coefficients_artifact": "artifacts/linear_coefficients.v1.json",
        }

    @pytest.fixture
    def run_dir_with_lc(self, tmp_path, run_json_with_lc):
        """Run directory with linear_coefficients.v1.json."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        (run_dir / "metrics.v1.json").write_text('{}')
        artifacts_dir = run_dir / "artifacts"
        artifacts_dir.mkdir()
        lc_artifact = {
            "model_family": "logistic_regression",
            "num_classes": 2,
            "top_k_by_class": [
                {"class": 1, "top_features": ["feat_a", "feat_b", "feat_c"]},
            ],
        }
        (artifacts_dir / "linear_coefficients.v1.json").write_text(json.dumps(lc_artifact))
        return run_dir

    def test_lc_included_when_exists(self, run_json_with_lc, run_dir_with_lc):
        """linear_coefficients_v1 is included when artifact exists."""
        index = build_interpretability_index(run_json_with_lc, run_dir_with_lc)
        assert "linear_coefficients_v1" in index["available_artifacts"]

    def test_lc_summary_has_model_family(self, run_json_with_lc, run_dir_with_lc):
        """linear_coefficients_v1 summary has model_family."""
        index = build_interpretability_index(run_json_with_lc, run_dir_with_lc)
        summary = index["available_artifacts"]["linear_coefficients_v1"]["summary"]
        assert summary["model_family"] == "logistic_regression"

    def test_lc_summary_has_num_classes(self, run_json_with_lc, run_dir_with_lc):
        """linear_coefficients_v1 summary has num_classes."""
        index = build_interpretability_index(run_json_with_lc, run_dir_with_lc)
        summary = index["available_artifacts"]["linear_coefficients_v1"]["summary"]
        assert summary["num_classes"] == 2

    def test_lc_summary_has_top_k_by_class(self, run_json_with_lc, run_dir_with_lc):
        """linear_coefficients_v1 summary has top_k_by_class."""
        index = build_interpretability_index(run_json_with_lc, run_dir_with_lc)
        summary = index["available_artifacts"]["linear_coefficients_v1"]["summary"]
        assert len(summary["top_k_by_class"]) == 1
        assert summary["top_k_by_class"][0]["class"] == 1


class TestAbsentArtifacts:
    """Tests that absent artifacts are omitted from available_artifacts."""

    @pytest.fixture
    def run_json_metrics_only(self):
        """run.json with only metrics_v1."""
        return {
            "run_id": "test-run",
            "runforge_version": "0.3.6.0",
            "metrics": {"accuracy": 0.85},
            "metrics_v1": {
                "schema_version": "metrics.v1",
                "metrics_profile": "classification.base.v1",
                "artifact_path": "metrics.v1.json",
            },
            # No feature_importance or linear_coefficients
        }

    @pytest.fixture
    def run_dir_metrics_only(self, tmp_path, run_json_metrics_only):
        """Run directory with only metrics.v1.json."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        (run_dir / "metrics.v1.json").write_text('{}')
        return run_dir

    def test_fi_omitted_when_not_in_run_json(self, run_json_metrics_only, run_dir_metrics_only):
        """feature_importance_v1 is omitted when not in run.json."""
        index = build_interpretability_index(run_json_metrics_only, run_dir_metrics_only)
        assert "feature_importance_v1" not in index["available_artifacts"]

    def test_lc_omitted_when_not_in_run_json(self, run_json_metrics_only, run_dir_metrics_only):
        """linear_coefficients_v1 is omitted when not in run.json."""
        index = build_interpretability_index(run_json_metrics_only, run_dir_metrics_only)
        assert "linear_coefficients_v1" not in index["available_artifacts"]

    def test_fi_omitted_when_file_missing(self, tmp_path):
        """feature_importance_v1 is omitted when file doesn't exist."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        (run_dir / "metrics.v1.json").write_text('{}')
        # Reference artifact but don't create file
        run_json = {
            "run_id": "test-run",
            "runforge_version": "0.3.6.0",
            "metrics": {"accuracy": 0.85},
            "metrics_v1": {
                "schema_version": "metrics.v1",
                "metrics_profile": "classification.base.v1",
                "artifact_path": "metrics.v1.json",
            },
            "feature_importance_schema_version": "feature_importance.v1",
            "feature_importance_artifact": "artifacts/feature_importance.v1.json",
        }
        index = build_interpretability_index(run_json, run_dir)
        assert "feature_importance_v1" not in index["available_artifacts"]


class TestDeterminism:
    """Tests for deterministic output."""

    def test_same_input_produces_same_output(self, tmp_path):
        """Same input produces identical output."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        (run_dir / "metrics.v1.json").write_text('{}')

        run_json = {
            "run_id": "test-run",
            "runforge_version": "0.3.6.0",
            "metrics": {"accuracy": 0.95},
            "metrics_v1": {
                "schema_version": "metrics.v1",
                "metrics_profile": "classification.proba.v1",
                "artifact_path": "metrics.v1.json",
            },
        }

        fixed_time = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

        index1 = build_interpretability_index(run_json, run_dir, created_at=fixed_time)
        index2 = build_interpretability_index(run_json, run_dir, created_at=fixed_time)

        assert index1 == index2


class TestWriteInterpretabilityIndex:
    """Tests for writing index to file."""

    def test_writes_to_correct_path(self, tmp_path):
        """Writes to artifacts/interpretability.index.v1.json."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()

        index = {
            "schema_version": "interpretability.index.v1",
            "run_id": "test-run",
            "runforge_version": "0.3.6.0",
            "created_at": "2024-01-01T12:00:00+00:00",
            "available_artifacts": {},
        }

        path = write_interpretability_index(index, run_dir)

        assert path == run_dir / "artifacts" / "interpretability.index.v1.json"
        assert path.exists()

    def test_canonical_json_format(self, tmp_path):
        """File has sorted keys and ends with newline."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()

        index = {
            "schema_version": "interpretability.index.v1",
            "run_id": "test-run",
            "runforge_version": "0.3.6.0",
            "created_at": "2024-01-01T12:00:00+00:00",
            "available_artifacts": {},
        }

        path = write_interpretability_index(index, run_dir)
        content = path.read_text()

        # Ends with newline
        assert content.endswith("\n")

        # Keys are sorted
        data = json.loads(content)
        assert list(data.keys()) == sorted(data.keys())


class TestAllThreeArtifacts:
    """Tests for runs with all three interpretability artifacts."""

    @pytest.fixture
    def run_json_all_three(self):
        """run.json with all three artifacts."""
        return {
            "run_id": "full-run",
            "runforge_version": "0.3.6.0",
            "metrics": {"accuracy": 0.93},
            "metrics_v1": {
                "schema_version": "metrics.v1",
                "metrics_profile": "classification.multiclass.v1",
                "artifact_path": "metrics.v1.json",
            },
            "feature_importance_schema_version": "feature_importance.v1",
            "feature_importance_artifact": "artifacts/feature_importance.v1.json",
            "linear_coefficients_schema_version": "linear_coefficients.v1",
            "linear_coefficients_artifact": "artifacts/linear_coefficients.v1.json",
        }

    @pytest.fixture
    def run_dir_all_three(self, tmp_path, run_json_all_three):
        """Run directory with all three artifacts."""
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        (run_dir / "metrics.v1.json").write_text('{}')
        artifacts_dir = run_dir / "artifacts"
        artifacts_dir.mkdir()
        fi = {"model_family": "random_forest", "top_k": ["a", "b", "c"]}
        (artifacts_dir / "feature_importance.v1.json").write_text(json.dumps(fi))
        lc = {"model_family": "logistic_regression", "num_classes": 3, "top_k_by_class": []}
        (artifacts_dir / "linear_coefficients.v1.json").write_text(json.dumps(lc))
        return run_dir

    def test_all_three_present(self, run_json_all_three, run_dir_all_three):
        """All three artifacts are in available_artifacts."""
        index = build_interpretability_index(run_json_all_three, run_dir_all_three)
        artifacts = index["available_artifacts"]
        assert "metrics_v1" in artifacts
        assert "feature_importance_v1" in artifacts
        assert "linear_coefficients_v1" in artifacts

    def test_all_three_count(self, run_json_all_three, run_dir_all_three):
        """available_artifacts has exactly 3 entries."""
        index = build_interpretability_index(run_json_all_three, run_dir_all_three)
        assert len(index["available_artifacts"]) == 3


class TestMetadataVersionPhase36:
    """Tests for version constants in Phase 3.6."""

    def test_runforge_version_is_0_3_6(self):
        """RunForge version is 0.3.6.0 for Phase 3.6."""
        from ml_runner.metadata import RUNFORGE_VERSION
        assert RUNFORGE_VERSION == "0.3.6.0"

    def test_run_schema_version_is_v0_3_6(self):
        """Run schema version is run.v0.3.6 for Phase 3.6."""
        from ml_runner.metadata import RUN_SCHEMA_VERSION
        assert RUN_SCHEMA_VERSION == "run.v0.3.6"
