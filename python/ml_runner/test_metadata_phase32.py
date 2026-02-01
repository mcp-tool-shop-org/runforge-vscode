"""
Phase 3.2 Metadata Tests

Tests for run.json metadata recording:
- Profile fields present when profile used
- Profile fields OMITTED when no profile used
- Hyperparameters with provenance recorded
"""

import pytest
from datetime import datetime, timezone

from ml_runner.metadata import create_run_metadata


class TestMetadataWithProfile:
    """Tests for metadata when profile IS used."""

    def test_profile_name_included(self):
        """profile_name is included when profile used."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            profile_name="fast",
            profile_version="1.0",
            expanded_parameters_hash="def456",
        )

        assert "profile_name" in metadata
        assert metadata["profile_name"] == "fast"

    def test_profile_version_included(self):
        """profile_version is included when profile used."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            profile_name="fast",
            profile_version="1.0",
            expanded_parameters_hash="def456",
        )

        assert "profile_version" in metadata
        assert metadata["profile_version"] == "1.0"

    def test_expanded_parameters_hash_included(self):
        """expanded_parameters_hash is included when profile used."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            profile_name="fast",
            profile_version="1.0",
            expanded_parameters_hash="def456789abc",
        )

        assert "expanded_parameters_hash" in metadata
        assert metadata["expanded_parameters_hash"] == "def456789abc"


class TestMetadataWithoutProfile:
    """Tests for metadata when NO profile is used."""

    def test_profile_name_omitted(self):
        """profile_name is OMITTED when no profile used."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            # No profile_name provided
        )

        assert "profile_name" not in metadata

    def test_profile_version_omitted(self):
        """profile_version is OMITTED when no profile used."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
        )

        assert "profile_version" not in metadata

    def test_expanded_parameters_hash_omitted(self):
        """expanded_parameters_hash is OMITTED when no profile used."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
        )

        assert "expanded_parameters_hash" not in metadata

    def test_no_null_profile_fields(self):
        """Profile fields are not set to null - they are omitted entirely."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
        )

        # Fields should not exist at all
        for field in ["profile_name", "profile_version", "expanded_parameters_hash"]:
            assert field not in metadata, f"{field} should not be in metadata"


class TestMetadataWithHyperparameters:
    """Tests for hyperparameter recording in metadata."""

    def test_hyperparameters_included_when_present(self):
        """hyperparameters list is included when params provided."""
        hyperparams = [
            {"name": "C", "value": 1.0, "source": "cli"},
            {"name": "max_iter", "value": 200, "source": "profile"},
        ]

        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            hyperparameters=hyperparams,
        )

        assert "hyperparameters" in metadata
        assert len(metadata["hyperparameters"]) == 2
        assert metadata["hyperparameters"][0]["name"] == "C"
        assert metadata["hyperparameters"][0]["source"] == "cli"

    def test_hyperparameters_omitted_when_empty(self):
        """hyperparameters is OMITTED when no params provided."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            hyperparameters=[],  # Empty list
        )

        assert "hyperparameters" not in metadata

    def test_hyperparameters_omitted_when_none(self):
        """hyperparameters is OMITTED when None."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
            hyperparameters=None,
        )

        assert "hyperparameters" not in metadata


class TestMetadataVersion:
    """Tests for version tracking."""

    def test_version_is_phase_3_x(self):
        """Version is 0.3.x for Phase 3."""
        from ml_runner.metadata import RUNFORGE_VERSION

        assert RUNFORGE_VERSION.startswith("0.3.")

    def test_runforge_version_in_metadata(self):
        """Metadata includes runforge_version."""
        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=5,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="logistic_regression",
        )

        assert "runforge_version" in metadata
        assert metadata["runforge_version"].startswith("0.3.")
