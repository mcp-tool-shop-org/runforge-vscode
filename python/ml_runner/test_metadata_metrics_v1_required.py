"""
F-PY-B001 (iter #5b): metrics_v1 contract enforcement tests.

`metrics_v1` is REQUIRED by `python/ml_runner/contracts/run.schema.v0.3.6.json`
(see `required` array, lines 183-197). Pre-iter-#5b, `create_run_metadata`
silently omitted `metrics_v1` when any of the three pointer params was None
or empty — a latent contract violation that was unreachable in the production
runner but would have shipped a malformed run.json the moment any caller
forgot a kwarg.

This file pins the new behavior: passing None/"" for any of the three
metrics_v1 params raises ValueError with a clear, actionable message.
"""

import pytest

from ml_runner.metadata import create_run_metadata


_BASE_KWARGS = dict(
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


class TestMetricsV1Required:
    """All three metrics_v1_* params must be non-empty."""

    def test_schema_version_none_raises(self):
        with pytest.raises(ValueError, match="metrics_v1_schema_version"):
            create_run_metadata(
                **_BASE_KWARGS,
                metrics_v1_schema_version=None,  # type: ignore[arg-type]
                metrics_v1_profile="classification.base.v1",
                metrics_v1_artifact_path="metrics.v1.json",
            )

    def test_schema_version_empty_raises(self):
        with pytest.raises(ValueError, match="metrics_v1_schema_version"):
            create_run_metadata(
                **_BASE_KWARGS,
                metrics_v1_schema_version="",
                metrics_v1_profile="classification.base.v1",
                metrics_v1_artifact_path="metrics.v1.json",
            )

    def test_profile_none_raises(self):
        with pytest.raises(ValueError, match="metrics_v1_profile"):
            create_run_metadata(
                **_BASE_KWARGS,
                metrics_v1_schema_version="metrics.v1",
                metrics_v1_profile=None,  # type: ignore[arg-type]
                metrics_v1_artifact_path="metrics.v1.json",
            )

    def test_artifact_path_none_raises(self):
        with pytest.raises(ValueError, match="metrics_v1_artifact_path"):
            create_run_metadata(
                **_BASE_KWARGS,
                metrics_v1_schema_version="metrics.v1",
                metrics_v1_profile="classification.base.v1",
                metrics_v1_artifact_path=None,  # type: ignore[arg-type]
            )

    def test_error_message_references_schema(self):
        """Error mentions the schema for actionability."""
        with pytest.raises(ValueError) as exc_info:
            create_run_metadata(
                **_BASE_KWARGS,
                metrics_v1_schema_version=None,  # type: ignore[arg-type]
                metrics_v1_profile="classification.base.v1",
                metrics_v1_artifact_path="metrics.v1.json",
            )
        assert "run.schema" in str(exc_info.value)

    def test_all_provided_succeeds(self):
        """Sanity: passing all three required params succeeds and writes metrics_v1."""
        metadata = create_run_metadata(
            **_BASE_KWARGS,
            metrics_v1_schema_version="metrics.v1",
            metrics_v1_profile="classification.base.v1",
            metrics_v1_artifact_path="metrics.v1.json",
        )
        assert metadata["metrics_v1"]["schema_version"] == "metrics.v1"
        assert metadata["metrics_v1"]["metrics_profile"] == "classification.base.v1"
        assert metadata["metrics_v1"]["artifact_path"] == "metrics.v1.json"
        assert metadata["artifacts"]["metrics_v1_json"] == "metrics.v1.json"
