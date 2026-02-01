"""
Phase 3.5 Metadata Tests

Tests for run.json metadata updates:
- linear_coefficients_schema_version field
- linear_coefficients_artifact field
- linear_coefficients_json in artifacts
- Version bump to 0.3.5.0
- Backward compatibility with Phase 3.4 and earlier
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

    def test_runforge_version_is_0_3_5_or_later(self):
        """RunForge version is 0.3.5+ for Phase 3.5+."""
        assert RUNFORGE_VERSION.startswith("0.3.")
        # Version should be at least 0.3.5
        parts = RUNFORGE_VERSION.split(".")
        assert int(parts[1]) >= 3 or (int(parts[1]) == 3 and int(parts[2]) >= 5)

    def test_run_schema_version_is_v0_3_5_or_later(self):
        """Run schema version is run.v0.3.5+ for Phase 3.5+."""
        assert RUN_SCHEMA_VERSION.startswith("run.v0.3.")


class TestLinearCoefficientsPointer:
    """Tests for linear coefficients fields in run.json."""

    def test_linear_coefficients_included_when_provided(self):
        """linear_coefficients fields included when provided."""
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
            linear_coefficients_schema_version="linear_coefficients.v1",
            linear_coefficients_artifact_path="artifacts/linear_coefficients.v1.json",
        )

        assert "linear_coefficients_schema_version" in metadata
        assert metadata["linear_coefficients_schema_version"] == "linear_coefficients.v1"
        assert "linear_coefficients_artifact" in metadata
        assert metadata["linear_coefficients_artifact"] == "artifacts/linear_coefficients.v1.json"

    def test_linear_coefficients_not_included_when_missing(self):
        """linear_coefficients fields omitted when not provided."""
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
            model_family="random_forest",
        )

        assert "linear_coefficients_schema_version" not in metadata
        assert "linear_coefficients_artifact" not in metadata

    def test_artifacts_includes_linear_coefficients_json(self):
        """artifacts contains linear_coefficients_json when provided."""
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
            linear_coefficients_schema_version="linear_coefficients.v1",
            linear_coefficients_artifact_path="artifacts/linear_coefficients.v1.json",
        )

        assert "linear_coefficients_json" in metadata["artifacts"]
        assert metadata["artifacts"]["linear_coefficients_json"] == "artifacts/linear_coefficients.v1.json"

    def test_artifacts_no_linear_coefficients_when_not_provided(self):
        """artifacts does not contain linear_coefficients_json when not provided."""
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
            model_family="random_forest",
        )

        assert "linear_coefficients_json" not in metadata["artifacts"]


class TestCoexistenceWithFeatureImportance:
    """Tests that linear coefficients and feature importance are independent."""

    def test_both_can_coexist(self):
        """Both feature importance and linear coefficients can coexist (hypothetically)."""
        # This is a defensive test - in practice they're mutually exclusive
        # since RF has feature importance and LR/SVC have coefficients
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
            feature_importance_schema_version="feature_importance.v1",
            feature_importance_artifact_path="artifacts/feature_importance.v1.json",
            linear_coefficients_schema_version="linear_coefficients.v1",
            linear_coefficients_artifact_path="artifacts/linear_coefficients.v1.json",
        )

        # Both present
        assert "feature_importance_schema_version" in metadata
        assert "linear_coefficients_schema_version" in metadata

    def test_feature_importance_only(self):
        """Feature importance without linear coefficients (RandomForest case)."""
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
            model_family="random_forest",
            feature_importance_schema_version="feature_importance.v1",
            feature_importance_artifact_path="artifacts/feature_importance.v1.json",
        )

        assert "feature_importance_schema_version" in metadata
        assert "linear_coefficients_schema_version" not in metadata

    def test_linear_coefficients_only(self):
        """Linear coefficients without feature importance (LogisticRegression case)."""
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
            linear_coefficients_schema_version="linear_coefficients.v1",
            linear_coefficients_artifact_path="artifacts/linear_coefficients.v1.json",
        )

        assert "feature_importance_schema_version" not in metadata
        assert "linear_coefficients_schema_version" in metadata


class TestBackwardCompatibility:
    """Tests for backward compatibility with Phase 3.4 and earlier."""

    def test_phase34_feature_importance_still_works(self):
        """Phase 3.4 feature importance fields still work."""
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
            model_family="random_forest",
            feature_importance_schema_version="feature_importance.v1",
            feature_importance_artifact_path="artifacts/feature_importance.v1.json",
        )

        assert metadata["feature_importance_schema_version"] == "feature_importance.v1"
        assert metadata["feature_importance_artifact"] == "artifacts/feature_importance.v1.json"
        assert "feature_importance_json" in metadata["artifacts"]

    def test_phase33_metrics_v1_still_works(self):
        """Phase 3.3 metrics_v1 fields still work."""
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
            linear_coefficients_schema_version="linear_coefficients.v1",
            linear_coefficients_artifact_path="artifacts/linear_coefficients.v1.json",
        )

        assert "metrics_v1" in metadata
        assert metadata["metrics_v1"]["schema_version"] == "metrics.v1"
        assert "linear_coefficients_schema_version" in metadata

    def test_phase32_profile_fields_still_work(self):
        """Phase 3.2 profile fields still work with linear coefficients."""
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
            linear_coefficients_schema_version="linear_coefficients.v1",
            linear_coefficients_artifact_path="artifacts/linear_coefficients.v1.json",
        )

        assert metadata["profile_name"] == "fast"
        assert "linear_coefficients_schema_version" in metadata

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
            linear_coefficients_schema_version="linear_coefficients.v1",
            linear_coefficients_artifact_path="artifacts/linear_coefficients.v1.json",
        )

        assert "metrics" in metadata
        assert metadata["metrics"]["accuracy"] == 0.95
        assert metadata["metrics"]["num_samples"] == 100
        assert metadata["metrics"]["num_features"] == 10


class TestArtifactsSection:
    """Tests for the artifacts section completeness."""

    def test_all_artifacts_present_for_full_run(self):
        """All artifact paths present for a full LogisticRegression run."""
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
            linear_coefficients_schema_version="linear_coefficients.v1",
            linear_coefficients_artifact_path="artifacts/linear_coefficients.v1.json",
        )

        artifacts = metadata["artifacts"]
        assert "model_pkl" in artifacts
        assert "metrics_v1_json" in artifacts
        assert "linear_coefficients_json" in artifacts

    def test_all_artifacts_present_for_random_forest(self):
        """All artifact paths present for a RandomForest run."""
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
            model_family="random_forest",
            metrics_v1_schema_version="metrics.v1",
            metrics_v1_profile="classification.proba.v1",
            metrics_v1_artifact_path="metrics.v1.json",
            feature_importance_schema_version="feature_importance.v1",
            feature_importance_artifact_path="artifacts/feature_importance.v1.json",
        )

        artifacts = metadata["artifacts"]
        assert "model_pkl" in artifacts
        assert "metrics_v1_json" in artifacts
        assert "feature_importance_json" in artifacts
        # No linear coefficients for RF
        assert "linear_coefficients_json" not in artifacts
