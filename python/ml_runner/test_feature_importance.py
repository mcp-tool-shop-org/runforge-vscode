"""
Phase 3.4 Feature Importance Tests

Tests for:
- Feature importance extraction for supported models (RandomForest)
- Diagnostics for unsupported models (LogisticRegression, LinearSVC)
- Schema validation
- Deterministic output
- Stable sorting with tie-breakers
"""

import pytest
import numpy as np
import json
from pathlib import Path

from ml_runner.feature_importance import (
    SCHEMA_VERSION,
    SUPPORTED_MODELS,
    supports_feature_importance,
    extract_feature_importance,
    write_feature_importance,
    get_feature_names_from_csv_header,
    FeatureImportanceDiagnostic,
)


class TestSchemaVersion:
    """Tests for schema version constant."""

    def test_schema_version(self):
        """Schema version is feature_importance.v1."""
        assert SCHEMA_VERSION == "feature_importance.v1"


class TestSupportedModels:
    """Tests for supported models list."""

    def test_random_forest_supported(self):
        """RandomForest is supported."""
        assert "random_forest" in SUPPORTED_MODELS

    def test_logistic_regression_not_supported(self):
        """LogisticRegression is not supported."""
        assert "logistic_regression" not in SUPPORTED_MODELS

    def test_linear_svc_not_supported(self):
        """LinearSVC is not supported."""
        assert "linear_svc" not in SUPPORTED_MODELS


class TestSupportsFeatureImportance:
    """Tests for supports_feature_importance function."""

    def test_random_forest_supported(self):
        """RandomForest supports feature importance."""
        assert supports_feature_importance("random_forest")

    def test_logistic_regression_not_supported(self):
        """LogisticRegression does not support feature importance."""
        assert not supports_feature_importance("logistic_regression")

    def test_linear_svc_not_supported(self):
        """LinearSVC does not support feature importance."""
        assert not supports_feature_importance("linear_svc")

    def test_unknown_model_not_supported(self):
        """Unknown models do not support feature importance."""
        assert not supports_feature_importance("unknown_model")


class TestExtractFeatureImportance:
    """Tests for feature importance extraction."""

    @pytest.fixture
    def trained_random_forest(self):
        """Create a trained RandomForest pipeline."""
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.array([[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6],
                      [5, 6, 7], [6, 7, 8], [7, 8, 9], [8, 9, 10]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', RandomForestClassifier(n_estimators=10, random_state=42))
        ])
        pipeline.fit(X, y)

        feature_names = ["feature_a", "feature_b", "feature_c"]

        return pipeline, feature_names

    @pytest.fixture
    def trained_logistic_regression(self):
        """Create a trained LogisticRegression pipeline."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5],
                      [5, 6], [6, 7], [7, 8], [8, 9]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline.fit(X, y)

        feature_names = ["feature_a", "feature_b"]

        return pipeline, feature_names

    def test_random_forest_extraction_succeeds(self, trained_random_forest):
        """RandomForest extraction returns success."""
        pipeline, feature_names = trained_random_forest

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="random_forest",
            feature_names=feature_names,
        )

        assert result.success
        assert result.artifact is not None
        assert result.diagnostic is None

    def test_random_forest_artifact_has_required_fields(self, trained_random_forest):
        """RandomForest artifact has all required fields."""
        pipeline, feature_names = trained_random_forest

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="random_forest",
            feature_names=feature_names,
        )

        artifact = result.artifact
        assert artifact["schema_version"] == "feature_importance.v1"
        assert artifact["model_family"] == "random_forest"
        assert artifact["importance_type"] == "gini_importance"
        assert artifact["num_features"] == 3
        assert "features_by_importance" in artifact
        assert "features_by_original_order" in artifact
        assert "top_k" in artifact

    def test_random_forest_features_by_importance_sorted(self, trained_random_forest):
        """Features by importance are sorted descending."""
        pipeline, feature_names = trained_random_forest

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="random_forest",
            feature_names=feature_names,
        )

        features = result.artifact["features_by_importance"]
        importances = [f["importance"] for f in features]

        # Check descending order
        for i in range(len(importances) - 1):
            assert importances[i] >= importances[i + 1]

    def test_random_forest_features_have_ranks(self, trained_random_forest):
        """Features have correct ranks."""
        pipeline, feature_names = trained_random_forest

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="random_forest",
            feature_names=feature_names,
        )

        features = result.artifact["features_by_importance"]
        ranks = [f["rank"] for f in features]

        assert ranks == [1, 2, 3]

    def test_random_forest_original_order_has_indices(self, trained_random_forest):
        """Features by original order have correct indices."""
        pipeline, feature_names = trained_random_forest

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="random_forest",
            feature_names=feature_names,
        )

        features = result.artifact["features_by_original_order"]
        indices = [f["index"] for f in features]

        assert indices == [0, 1, 2]

    def test_random_forest_top_k_limited_to_10(self):
        """Top-k is limited to 10 features."""
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        # Create dataset with 15 features
        X = np.random.rand(50, 15)
        y = np.array([0] * 25 + [1] * 25)

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', RandomForestClassifier(n_estimators=10, random_state=42))
        ])
        pipeline.fit(X, y)

        feature_names = [f"feature_{i}" for i in range(15)]

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="random_forest",
            feature_names=feature_names,
        )

        assert len(result.artifact["top_k"]) == 10

    def test_logistic_regression_returns_diagnostic(self, trained_logistic_regression):
        """LogisticRegression returns unsupported model diagnostic."""
        pipeline, feature_names = trained_logistic_regression

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        assert not result.success
        assert result.artifact is None
        assert result.diagnostic == FeatureImportanceDiagnostic.FEATURE_IMPORTANCE_UNSUPPORTED_MODEL

    def test_linear_svc_returns_diagnostic(self):
        """LinearSVC returns unsupported model diagnostic."""
        from sklearn.svm import LinearSVC
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5],
                      [5, 6], [6, 7], [7, 8], [8, 9]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LinearSVC(random_state=42, max_iter=1000))
        ])
        pipeline.fit(X, y)

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="linear_svc",
            feature_names=["feature_a", "feature_b"],
        )

        assert not result.success
        assert result.diagnostic == FeatureImportanceDiagnostic.FEATURE_IMPORTANCE_UNSUPPORTED_MODEL

    def test_empty_feature_names_returns_diagnostic(self, trained_random_forest):
        """Empty feature names returns diagnostic."""
        pipeline, _ = trained_random_forest

        result = extract_feature_importance(
            pipeline=pipeline,
            model_family="random_forest",
            feature_names=[],
        )

        assert not result.success
        assert result.diagnostic == FeatureImportanceDiagnostic.FEATURE_NAMES_UNAVAILABLE


class TestDeterminism:
    """Tests for deterministic output."""

    def test_same_input_produces_same_output(self):
        """Same input produces identical output."""
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.array([[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6],
                      [5, 6, 7], [6, 7, 8], [7, 8, 9], [8, 9, 10]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])
        feature_names = ["feature_a", "feature_b", "feature_c"]

        # Train twice with same seed
        pipeline1 = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', RandomForestClassifier(n_estimators=10, random_state=42))
        ])
        pipeline1.fit(X, y)

        pipeline2 = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', RandomForestClassifier(n_estimators=10, random_state=42))
        ])
        pipeline2.fit(X, y)

        result1 = extract_feature_importance(pipeline1, "random_forest", feature_names)
        result2 = extract_feature_importance(pipeline2, "random_forest", feature_names)

        assert result1.artifact == result2.artifact

    def test_stable_sorting_with_ties(self):
        """Ties are broken by feature name (ascending)."""
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        # Create a situation where importances might be very close
        X = np.array([[1, 1], [2, 2], [3, 3], [4, 4],
                      [5, 5], [6, 6], [7, 7], [8, 8]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', RandomForestClassifier(n_estimators=100, random_state=42))
        ])
        pipeline.fit(X, y)

        # Use names that would test alphabetic sorting
        feature_names = ["zebra", "apple"]

        result = extract_feature_importance(pipeline, "random_forest", feature_names)

        # Check that when importances are equal, names are sorted alphabetically
        features = result.artifact["features_by_importance"]

        # If importances are equal, "apple" should come before "zebra"
        for i in range(len(features) - 1):
            if features[i]["importance"] == features[i + 1]["importance"]:
                assert features[i]["name"] < features[i + 1]["name"]


class TestWriteFeatureImportance:
    """Tests for writing feature importance to file."""

    def test_writes_to_correct_path(self, tmp_path):
        """Writes to artifacts/feature_importance.v1.json."""
        artifact = {
            "schema_version": "feature_importance.v1",
            "model_family": "random_forest",
            "importance_type": "gini_importance",
            "num_features": 2,
            "features_by_importance": [
                {"name": "a", "importance": 0.6, "rank": 1},
                {"name": "b", "importance": 0.4, "rank": 2},
            ],
            "features_by_original_order": [
                {"name": "a", "importance": 0.6, "index": 0},
                {"name": "b", "importance": 0.4, "index": 1},
            ],
            "top_k": ["a", "b"],
        }

        path = write_feature_importance(artifact, tmp_path)

        assert path == tmp_path / "artifacts" / "feature_importance.v1.json"
        assert path.exists()

    def test_canonical_format(self, tmp_path):
        """File has sorted keys and ends with newline."""
        artifact = {
            "schema_version": "feature_importance.v1",
            "model_family": "random_forest",
            "importance_type": "gini_importance",
            "num_features": 2,
            "features_by_importance": [
                {"name": "a", "importance": 0.6, "rank": 1},
            ],
            "features_by_original_order": [
                {"name": "a", "importance": 0.6, "index": 0},
            ],
            "top_k": ["a"],
        }

        path = write_feature_importance(artifact, tmp_path)
        content = path.read_text()

        # Ends with newline
        assert content.endswith("\n")

        # Keys are sorted
        data = json.loads(content)
        assert list(data.keys()) == sorted(data.keys())

    def test_json_parseable(self, tmp_path):
        """File is valid JSON."""
        artifact = {
            "schema_version": "feature_importance.v1",
            "model_family": "random_forest",
            "importance_type": "gini_importance",
            "num_features": 2,
            "features_by_importance": [],
            "features_by_original_order": [],
            "top_k": [],
        }

        path = write_feature_importance(artifact, tmp_path)

        with open(path) as f:
            loaded = json.load(f)

        # Basic structure check
        assert loaded["schema_version"] == "feature_importance.v1"


class TestGetFeatureNamesFromCSV:
    """Tests for extracting feature names from CSV header."""

    def test_extracts_feature_names(self, tmp_path):
        """Extracts feature names excluding label column."""
        csv_path = tmp_path / "data.csv"
        csv_path.write_text("feature_a,label,feature_b\n1,0,2\n3,1,4\n")

        names = get_feature_names_from_csv_header(csv_path, "label")

        assert names == ["feature_a", "feature_b"]

    def test_preserves_order(self, tmp_path):
        """Preserves original column order."""
        csv_path = tmp_path / "data.csv"
        csv_path.write_text("c,b,label,a\n1,2,0,3\n")

        names = get_feature_names_from_csv_header(csv_path, "label")

        assert names == ["c", "b", "a"]

    def test_handles_spaces(self, tmp_path):
        """Strips whitespace from column names."""
        csv_path = tmp_path / "data.csv"
        csv_path.write_text(" feature_a , label , feature_b \n1,0,2\n")

        names = get_feature_names_from_csv_header(csv_path, "label")

        assert names == ["feature_a", "feature_b"]


class TestMetadataIntegration:
    """Tests for feature importance in run.json metadata."""

    def test_feature_importance_fields_present_for_random_forest(self):
        """Feature importance fields present when using RandomForest."""
        from ml_runner.metadata import create_run_metadata

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
        assert metadata["feature_importance_schema_version"] == "feature_importance.v1"
        assert "feature_importance_artifact" in metadata
        assert metadata["feature_importance_artifact"] == "artifacts/feature_importance.v1.json"
        assert "feature_importance_json" in metadata["artifacts"]

    def test_feature_importance_fields_absent_when_not_provided(self):
        """Feature importance fields absent when not provided."""
        from ml_runner.metadata import create_run_metadata

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

        assert "feature_importance_schema_version" not in metadata
        assert "feature_importance_artifact" not in metadata
        assert "feature_importance_json" not in metadata.get("artifacts", {})
