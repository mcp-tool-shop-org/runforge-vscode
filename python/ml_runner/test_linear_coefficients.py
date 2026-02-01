"""
Phase 3.5 Linear Coefficients Tests

Tests for:
- Coefficient extraction for supported models (LogisticRegression, LinearSVC)
- Diagnostics for unsupported models (RandomForest)
- Schema validation
- Deterministic output
- Stable sorting with tie-breakers
- Multiclass coefficient grouping
- Binary classification handling
"""

import pytest
import numpy as np
import json
from pathlib import Path

from ml_runner.linear_coefficients import (
    SCHEMA_VERSION,
    SUPPORTED_MODELS,
    supports_linear_coefficients,
    extract_linear_coefficients,
    write_linear_coefficients,
    LinearCoefficientsDiagnostic,
)


class TestSchemaVersion:
    """Tests for schema version constant."""

    def test_schema_version(self):
        """Schema version is linear_coefficients.v1."""
        assert SCHEMA_VERSION == "linear_coefficients.v1"


class TestSupportedModels:
    """Tests for supported models list."""

    def test_logistic_regression_supported(self):
        """LogisticRegression is supported."""
        assert "logistic_regression" in SUPPORTED_MODELS

    def test_linear_svc_supported(self):
        """LinearSVC is supported."""
        assert "linear_svc" in SUPPORTED_MODELS

    def test_random_forest_not_supported(self):
        """RandomForest is not supported."""
        assert "random_forest" not in SUPPORTED_MODELS


class TestSupportsLinearCoefficients:
    """Tests for supports_linear_coefficients function."""

    def test_logistic_regression_supported(self):
        """LogisticRegression supports linear coefficients."""
        assert supports_linear_coefficients("logistic_regression")

    def test_linear_svc_supported(self):
        """LinearSVC supports linear coefficients."""
        assert supports_linear_coefficients("linear_svc")

    def test_random_forest_not_supported(self):
        """RandomForest does not support linear coefficients."""
        assert not supports_linear_coefficients("random_forest")

    def test_unknown_model_not_supported(self):
        """Unknown models do not support linear coefficients."""
        assert not supports_linear_coefficients("unknown_model")


class TestExtractLogisticRegressionBinary:
    """Tests for LogisticRegression binary classification."""

    @pytest.fixture
    def trained_logistic_regression_binary(self):
        """Create a trained binary LogisticRegression pipeline."""
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

    def test_extraction_succeeds(self, trained_logistic_regression_binary):
        """Binary LogisticRegression extraction succeeds."""
        pipeline, feature_names = trained_logistic_regression_binary

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        assert result.success
        assert result.artifact is not None
        assert result.diagnostic is None

    def test_artifact_has_required_fields(self, trained_logistic_regression_binary):
        """Artifact has all required fields."""
        pipeline, feature_names = trained_logistic_regression_binary

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        artifact = result.artifact
        assert artifact["schema_version"] == "linear_coefficients.v1"
        assert artifact["model_family"] == "logistic_regression"
        assert artifact["coefficient_space"] == "standardized"
        assert artifact["num_features"] == 2
        assert artifact["num_classes"] == 2
        assert "classes" in artifact
        assert "intercepts" in artifact
        assert "coefficients_by_class" in artifact
        assert "top_k_by_class" in artifact

    def test_binary_has_two_classes(self, trained_logistic_regression_binary):
        """Binary classification has exactly 2 classes."""
        pipeline, feature_names = trained_logistic_regression_binary

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        assert result.artifact["num_classes"] == 2
        assert len(result.artifact["classes"]) == 2

    def test_binary_classes_are_sorted(self, trained_logistic_regression_binary):
        """Classes are sorted deterministically."""
        pipeline, feature_names = trained_logistic_regression_binary

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        classes = result.artifact["classes"]
        assert classes == sorted(classes)

    def test_binary_coefficients_for_positive_class(self, trained_logistic_regression_binary):
        """Binary classification reports coefficients for positive class."""
        pipeline, feature_names = trained_logistic_regression_binary

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        # Binary case: one coefficient entry for positive class
        coef_entries = result.artifact["coefficients_by_class"]
        assert len(coef_entries) == 1
        assert coef_entries[0]["class"] == 1  # positive class


class TestExtractLogisticRegressionMulticlass:
    """Tests for LogisticRegression multiclass classification."""

    @pytest.fixture
    def trained_logistic_regression_multiclass(self):
        """Create a trained multiclass LogisticRegression pipeline."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5],
                      [5, 6], [6, 7], [7, 8], [8, 9],
                      [9, 10], [10, 11], [11, 12], [12, 13]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2])

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42, max_iter=200))
        ])
        pipeline.fit(X, y)

        feature_names = ["feature_a", "feature_b"]

        return pipeline, feature_names

    def test_multiclass_extraction_succeeds(self, trained_logistic_regression_multiclass):
        """Multiclass LogisticRegression extraction succeeds."""
        pipeline, feature_names = trained_logistic_regression_multiclass

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        assert result.success
        assert result.artifact is not None

    def test_multiclass_has_three_classes(self, trained_logistic_regression_multiclass):
        """Multiclass has 3 classes."""
        pipeline, feature_names = trained_logistic_regression_multiclass

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        assert result.artifact["num_classes"] == 3
        assert len(result.artifact["classes"]) == 3

    def test_multiclass_coefficients_per_class(self, trained_logistic_regression_multiclass):
        """Multiclass has coefficients for each class."""
        pipeline, feature_names = trained_logistic_regression_multiclass

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        coef_entries = result.artifact["coefficients_by_class"]
        assert len(coef_entries) == 3

        classes_with_coef = [entry["class"] for entry in coef_entries]
        assert set(classes_with_coef) == {0, 1, 2}

    def test_multiclass_each_class_has_all_features(self, trained_logistic_regression_multiclass):
        """Each class has coefficients for all features."""
        pipeline, feature_names = trained_logistic_regression_multiclass

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        for entry in result.artifact["coefficients_by_class"]:
            assert len(entry["features"]) == 2

    def test_multiclass_intercepts_per_class(self, trained_logistic_regression_multiclass):
        """Multiclass has intercepts for each class."""
        pipeline, feature_names = trained_logistic_regression_multiclass

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        intercepts = result.artifact["intercepts"]
        assert len(intercepts) == 3


class TestExtractLinearSVC:
    """Tests for LinearSVC coefficient extraction."""

    @pytest.fixture
    def trained_linear_svc_binary(self):
        """Create a trained binary LinearSVC pipeline."""
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

        feature_names = ["feature_a", "feature_b"]

        return pipeline, feature_names

    def test_linear_svc_extraction_succeeds(self, trained_linear_svc_binary):
        """LinearSVC extraction succeeds."""
        pipeline, feature_names = trained_linear_svc_binary

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="linear_svc",
            feature_names=feature_names,
        )

        assert result.success
        assert result.artifact is not None

    def test_linear_svc_artifact_has_correct_model_family(self, trained_linear_svc_binary):
        """Artifact has correct model_family."""
        pipeline, feature_names = trained_linear_svc_binary

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="linear_svc",
            feature_names=feature_names,
        )

        assert result.artifact["model_family"] == "linear_svc"


class TestUnsupportedModels:
    """Tests for unsupported model diagnostics."""

    def test_random_forest_returns_diagnostic(self):
        """RandomForest returns unsupported model diagnostic."""
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

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="random_forest",
            feature_names=["a", "b", "c"],
        )

        assert not result.success
        assert result.artifact is None
        assert result.diagnostic == LinearCoefficientsDiagnostic.LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL


class TestSortingAndRanking:
    """Tests for deterministic sorting and ranking."""

    def test_features_sorted_by_abs_coefficient_descending(self):
        """Features are sorted by absolute coefficient descending."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        # Create data where feature_a clearly has larger coefficient
        np.random.seed(42)
        X = np.random.randn(100, 3)
        y = (X[:, 0] * 5 + X[:, 1] * 2 + X[:, 2] * 0.1 > 0).astype(int)

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline.fit(X, y)

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=["feature_a", "feature_b", "feature_c"],
        )

        features = result.artifact["coefficients_by_class"][0]["features"]
        abs_coefs = [f["abs_coefficient"] for f in features]

        # Check descending order
        for i in range(len(abs_coefs) - 1):
            assert abs_coefs[i] >= abs_coefs[i + 1]

    def test_features_have_correct_ranks(self):
        """Features have correct 1-based ranks."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.array([[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6],
                      [5, 6, 7], [6, 7, 8], [7, 8, 9], [8, 9, 10]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline.fit(X, y)

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=["a", "b", "c"],
        )

        features = result.artifact["coefficients_by_class"][0]["features"]
        ranks = [f["rank"] for f in features]

        assert ranks == [1, 2, 3]

    def test_tie_breaker_uses_name_ascending(self):
        """Ties in absolute coefficient are broken by name ascending."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        # Create data where features have very similar coefficients
        X = np.array([[1, 1], [2, 2], [3, 3], [4, 4],
                      [5, 5], [6, 6], [7, 7], [8, 8]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42, max_iter=200))
        ])
        pipeline.fit(X, y)

        # Use names that would test alphabetic sorting
        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=["zebra", "apple"],
        )

        features = result.artifact["coefficients_by_class"][0]["features"]

        # When abs_coefficients are equal, names should be in ascending order
        for i in range(len(features) - 1):
            if features[i]["abs_coefficient"] == features[i + 1]["abs_coefficient"]:
                assert features[i]["name"] < features[i + 1]["name"]


class TestDeterminism:
    """Tests for deterministic output."""

    def test_same_input_produces_same_output(self):
        """Same input produces identical output."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.array([[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6],
                      [5, 6, 7], [6, 7, 8], [7, 8, 9], [8, 9, 10]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])
        feature_names = ["feature_a", "feature_b", "feature_c"]

        # Train twice with same seed
        pipeline1 = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline1.fit(X, y)

        pipeline2 = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline2.fit(X, y)

        result1 = extract_linear_coefficients(pipeline1, "logistic_regression", feature_names)
        result2 = extract_linear_coefficients(pipeline2, "logistic_regression", feature_names)

        assert result1.artifact == result2.artifact


class TestEmptyFeatureNames:
    """Tests for empty feature names validation."""

    def test_empty_feature_names_returns_diagnostic(self):
        """Empty feature names returns diagnostic."""
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

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=[],
        )

        assert not result.success
        assert result.diagnostic == LinearCoefficientsDiagnostic.FEATURE_NAMES_UNAVAILABLE


class TestWriteLinearCoefficients:
    """Tests for writing coefficient artifact to file."""

    def test_writes_to_correct_path(self, tmp_path):
        """Writes to artifacts/linear_coefficients.v1.json."""
        artifact = {
            "schema_version": "linear_coefficients.v1",
            "model_family": "logistic_regression",
            "coefficient_space": "standardized",
            "num_features": 2,
            "num_classes": 2,
            "classes": [0, 1],
            "intercepts": [{"class": 1, "intercept": 0.5}],
            "coefficients_by_class": [
                {
                    "class": 1,
                    "features": [
                        {"name": "a", "coefficient": 0.6, "abs_coefficient": 0.6, "rank": 1},
                        {"name": "b", "coefficient": -0.4, "abs_coefficient": 0.4, "rank": 2},
                    ],
                }
            ],
            "top_k_by_class": [{"class": 1, "top_features": ["a", "b"]}],
        }

        path = write_linear_coefficients(artifact, tmp_path)

        assert path == tmp_path / "artifacts" / "linear_coefficients.v1.json"
        assert path.exists()

    def test_canonical_format(self, tmp_path):
        """File has sorted keys and ends with newline."""
        artifact = {
            "schema_version": "linear_coefficients.v1",
            "model_family": "logistic_regression",
            "coefficient_space": "standardized",
            "num_features": 1,
            "num_classes": 2,
            "classes": [0, 1],
            "intercepts": [{"class": 1, "intercept": 0.5}],
            "coefficients_by_class": [
                {"class": 1, "features": [{"name": "a", "coefficient": 0.6, "abs_coefficient": 0.6, "rank": 1}]},
            ],
            "top_k_by_class": [{"class": 1, "top_features": ["a"]}],
        }

        path = write_linear_coefficients(artifact, tmp_path)
        content = path.read_text()

        # Ends with newline
        assert content.endswith("\n")

        # Keys are sorted
        data = json.loads(content)
        assert list(data.keys()) == sorted(data.keys())

    def test_json_parseable(self, tmp_path):
        """File is valid JSON."""
        artifact = {
            "schema_version": "linear_coefficients.v1",
            "model_family": "logistic_regression",
            "coefficient_space": "standardized",
            "num_features": 2,
            "num_classes": 2,
            "classes": [0, 1],
            "intercepts": [],
            "coefficients_by_class": [],
            "top_k_by_class": [],
        }

        path = write_linear_coefficients(artifact, tmp_path)

        with open(path) as f:
            loaded = json.load(f)

        assert loaded["schema_version"] == "linear_coefficients.v1"


class TestCoefficientSpace:
    """Tests for coefficient space semantics."""

    def test_coefficient_space_is_standardized(self):
        """Coefficient space is always 'standardized'."""
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

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=["a", "b"],
        )

        assert result.artifact["coefficient_space"] == "standardized"


class TestTopKByClass:
    """Tests for top-k features per class."""

    def test_top_k_limited_to_10(self):
        """Top-k is limited to 10 features."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        # Create dataset with 15 features
        X = np.random.rand(50, 15)
        y = np.array([0] * 25 + [1] * 25)

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline.fit(X, y)

        feature_names = [f"feature_{i}" for i in range(15)]

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=feature_names,
        )

        for entry in result.artifact["top_k_by_class"]:
            assert len(entry["top_features"]) <= 10

    def test_top_k_matches_coefficient_order(self):
        """Top-k features match coefficient sorting order."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        X = np.array([[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6],
                      [5, 6, 7], [6, 7, 8], [7, 8, 9], [8, 9, 10]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline.fit(X, y)

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=["a", "b", "c"],
        )

        coef_entry = result.artifact["coefficients_by_class"][0]
        top_k_entry = result.artifact["top_k_by_class"][0]

        expected_top = [f["name"] for f in coef_entry["features"][:3]]
        assert top_k_entry["top_features"] == expected_top


class TestIntercepts:
    """Tests for intercept handling."""

    def test_intercepts_present_for_logistic_regression(self):
        """LogisticRegression has intercepts."""
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

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="logistic_regression",
            feature_names=["a", "b"],
        )

        assert len(result.artifact["intercepts"]) > 0
        assert "intercept" in result.artifact["intercepts"][0]

    def test_intercepts_present_for_linear_svc(self):
        """LinearSVC has intercepts."""
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

        result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family="linear_svc",
            feature_names=["a", "b"],
        )

        assert len(result.artifact["intercepts"]) > 0
