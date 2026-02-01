"""
Phase 3.3 Metadata Tests

Tests for run.json metadata updates:
- schema_version field
- metrics_v1 pointer object
- metrics_v1_json in artifacts
- Version bump to 0.3.3.0
"""

import pytest
from datetime import datetime, timezone

from ml_runner.metadata import (
    create_run_metadata,
    RUNFORGE_VERSION,
    RUN_SCHEMA_VERSION,
)


class TestMetadataVersion:
    """Tests for version constants."""

    def test_runforge_version_is_phase_3_x(self):
        """RunForge version is 0.3.x for Phase 3."""
        assert RUNFORGE_VERSION.startswith("0.3.")

    def test_run_schema_version_is_v0_3_x(self):
        """Run schema version is run.v0.3.x for Phase 3."""
        assert RUN_SCHEMA_VERSION.startswith("run.v0.3.")


class TestSchemaVersionField:
    """Tests for schema_version in run.json."""

    def test_schema_version_included(self):
        """schema_version is always included."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123" + "0" * 58,
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
        )

        assert "schema_version" in metadata
        assert metadata["schema_version"].startswith("run.v0.3.")


class TestMetricsV1Pointer:
    """Tests for metrics_v1 object in run.json."""

    def test_metrics_v1_included_when_provided(self):
        """metrics_v1 is included when all three params provided."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123" + "0" * 58,
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            metrics_v1_schema_version="metrics.v1",
            metrics_v1_profile="classification.proba.v1",
            metrics_v1_artifact_path="metrics.v1.json",
        )

        assert "metrics_v1" in metadata
        assert metadata["metrics_v1"]["schema_version"] == "metrics.v1"
        assert metadata["metrics_v1"]["metrics_profile"] == "classification.proba.v1"
        assert metadata["metrics_v1"]["artifact_path"] == "metrics.v1.json"

    def test_metrics_v1_not_included_when_missing(self):
        """metrics_v1 is omitted when params not provided."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123" + "0" * 58,
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
        )

        assert "metrics_v1" not in metadata

    def test_artifacts_includes_metrics_v1_json(self):
        """artifacts contains metrics_v1_json when provided."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123" + "0" * 58,
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            metrics_v1_schema_version="metrics.v1",
            metrics_v1_profile="classification.base.v1",
            metrics_v1_artifact_path="metrics.v1.json",
        )

        assert "metrics_v1_json" in metadata["artifacts"]
        assert metadata["artifacts"]["metrics_v1_json"] == "metrics.v1.json"

    def test_artifacts_model_pkl_still_present(self):
        """artifacts still contains model_pkl."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123" + "0" * 58,
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            metrics_v1_schema_version="metrics.v1",
            metrics_v1_profile="classification.base.v1",
            metrics_v1_artifact_path="metrics.v1.json",
        )

        assert "model_pkl" in metadata["artifacts"]
        assert metadata["artifacts"]["model_pkl"] == "artifacts/model.pkl"


class TestMetricsV1ProfileValues:
    """Tests for valid metrics_profile values."""

    @pytest.mark.parametrize("profile", [
        "classification.base.v1",
        "classification.proba.v1",
        "classification.multiclass.v1",
    ])
    def test_valid_profiles(self, profile):
        """All valid profiles are accepted."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123" + "0" * 58,
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            metrics_v1_schema_version="metrics.v1",
            metrics_v1_profile=profile,
            metrics_v1_artifact_path="metrics.v1.json",
        )

        assert metadata["metrics_v1"]["metrics_profile"] == profile


class TestBackwardCompatibility:
    """Tests for backward compatibility with Phase 2/3.2 fields."""

    def test_phase2_metrics_still_present(self):
        """Phase 2 metrics object is still present."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123" + "0" * 58,
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            metrics_v1_schema_version="metrics.v1",
            metrics_v1_profile="classification.base.v1",
            metrics_v1_artifact_path="metrics.v1.json",
        )

        assert "metrics" in metadata
        assert metadata["metrics"]["accuracy"] == 0.95
        assert metadata["metrics"]["num_samples"] == 100
        assert metadata["metrics"]["num_features"] == 10

    def test_phase32_profile_fields_coexist(self):
        """Phase 3.2 profile fields coexist with metrics_v1."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123" + "0" * 58,
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            profile_name="fast",
            profile_version="1.0",
            expanded_parameters_hash="def456" + "0" * 58,
            metrics_v1_schema_version="metrics.v1",
            metrics_v1_profile="classification.base.v1",
            metrics_v1_artifact_path="metrics.v1.json",
        )

        # Phase 3.2 fields
        assert metadata["profile_name"] == "fast"
        assert metadata["profile_version"] == "1.0"
        assert "expanded_parameters_hash" in metadata

        # Phase 3.3 fields
        assert "metrics_v1" in metadata
        assert "schema_version" in metadata
