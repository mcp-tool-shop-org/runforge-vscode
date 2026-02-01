"""
Phase 3.3 Metrics v1 Tests

Tests for:
- Metrics profile selection logic
- Model capability detection
- Base, proba, and multiclass metrics computation
- Schema validation
"""

import pytest
import numpy as np
import json
from pathlib import Path

from ml_runner.metrics_v1 import (
    SCHEMA_VERSION,
    PROFILE_BASE,
    PROFILE_PROBA,
    PROFILE_MULTICLASS,
    has_predict_proba,
    has_decision_function,
    select_metrics_profile,
    compute_base_metrics,
    compute_proba_metrics,
    compute_multiclass_metrics,
    compute_metrics_v1,
    write_metrics_v1,
    get_classifier_from_pipeline,
)


class TestSchemaVersion:
    """Tests for schema version constant."""

    def test_schema_version_is_metrics_v1(self):
        """Schema version is metrics.v1."""
        assert SCHEMA_VERSION == "metrics.v1"


class TestProfileConstants:
    """Tests for profile constant values."""

    def test_base_profile(self):
        """Base profile is classification.base.v1."""
        assert PROFILE_BASE == "classification.base.v1"

    def test_proba_profile(self):
        """Proba profile is classification.proba.v1."""
        assert PROFILE_PROBA == "classification.proba.v1"

    def test_multiclass_profile(self):
        """Multiclass profile is classification.multiclass.v1."""
        assert PROFILE_MULTICLASS == "classification.multiclass.v1"


class TestCapabilityDetection:
    """Tests for model capability detection."""

    def test_logistic_regression_has_predict_proba(self):
        """LogisticRegression has predict_proba."""
        from sklearn.linear_model import LogisticRegression
        clf = LogisticRegression()
        assert has_predict_proba(clf)

    def test_logistic_regression_has_decision_function(self):
        """LogisticRegression has decision_function."""
        from sklearn.linear_model import LogisticRegression
        clf = LogisticRegression()
        assert has_decision_function(clf)

    def test_random_forest_has_predict_proba(self):
        """RandomForest has predict_proba."""
        from sklearn.ensemble import RandomForestClassifier
        clf = RandomForestClassifier()
        assert has_predict_proba(clf)

    def test_random_forest_no_decision_function(self):
        """RandomForest lacks decision_function."""
        from sklearn.ensemble import RandomForestClassifier
        clf = RandomForestClassifier()
        assert not has_decision_function(clf)

    def test_linear_svc_no_predict_proba(self):
        """LinearSVC lacks predict_proba."""
        from sklearn.svm import LinearSVC
        clf = LinearSVC()
        assert not has_predict_proba(clf)

    def test_linear_svc_has_decision_function(self):
        """LinearSVC has decision_function."""
        from sklearn.svm import LinearSVC
        clf = LinearSVC()
        assert has_decision_function(clf)


class TestProfileSelection:
    """Tests for metrics profile selection."""

    def test_binary_with_proba_gets_proba_profile(self):
        """Binary + predict_proba → proba.v1."""
        profile = select_metrics_profile(
            num_classes=2,
            has_proba=True,
            has_decision_func=True,
        )
        assert profile == PROFILE_PROBA

    def test_binary_without_proba_gets_base_profile(self):
        """Binary without predict_proba → base.v1."""
        profile = select_metrics_profile(
            num_classes=2,
            has_proba=False,
            has_decision_func=True,
        )
        assert profile == PROFILE_BASE

    def test_multiclass_gets_multiclass_profile(self):
        """Multiclass (3+) → multiclass.v1."""
        profile = select_metrics_profile(
            num_classes=3,
            has_proba=True,
            has_decision_func=True,
        )
        assert profile == PROFILE_MULTICLASS

    def test_multiclass_without_proba_gets_multiclass_profile(self):
        """Multiclass without predict_proba still gets multiclass.v1."""
        profile = select_metrics_profile(
            num_classes=5,
            has_proba=False,
            has_decision_func=True,
        )
        assert profile == PROFILE_MULTICLASS


class TestBaseMetrics:
    """Tests for base metrics computation."""

    def test_base_metrics_keys(self):
        """Base metrics has required keys."""
        y_true = np.array([0, 0, 1, 1])
        y_pred = np.array([0, 0, 1, 1])
        class_labels = [0, 1]

        metrics = compute_base_metrics(y_true, y_pred, class_labels)

        assert "accuracy" in metrics
        assert "precision_macro" in metrics
        assert "recall_macro" in metrics
        assert "f1_macro" in metrics
        assert "confusion_matrix" in metrics

    def test_perfect_accuracy(self):
        """Perfect predictions have accuracy 1.0."""
        y_true = np.array([0, 0, 1, 1])
        y_pred = np.array([0, 0, 1, 1])
        class_labels = [0, 1]

        metrics = compute_base_metrics(y_true, y_pred, class_labels)

        assert metrics["accuracy"] == 1.0

    def test_confusion_matrix_is_list(self):
        """Confusion matrix is a list (JSON serializable)."""
        y_true = np.array([0, 0, 1, 1])
        y_pred = np.array([0, 0, 1, 1])
        class_labels = [0, 1]

        metrics = compute_base_metrics(y_true, y_pred, class_labels)

        assert isinstance(metrics["confusion_matrix"], list)
        assert isinstance(metrics["confusion_matrix"][0], list)


class TestProbaMetrics:
    """Tests for probability-based metrics."""

    def test_proba_metrics_keys(self):
        """Proba metrics has roc_auc and log_loss."""
        y_true = np.array([0, 0, 1, 1])
        y_prob = np.array([0.1, 0.2, 0.8, 0.9])

        metrics = compute_proba_metrics(y_true, y_prob)

        assert "roc_auc" in metrics
        assert "log_loss" in metrics

    def test_roc_auc_range(self):
        """ROC-AUC is between 0 and 1."""
        y_true = np.array([0, 0, 1, 1])
        y_prob = np.array([0.1, 0.2, 0.8, 0.9])

        metrics = compute_proba_metrics(y_true, y_prob)

        assert 0 <= metrics["roc_auc"] <= 1

    def test_log_loss_non_negative(self):
        """Log loss is non-negative."""
        y_true = np.array([0, 0, 1, 1])
        y_prob = np.array([0.1, 0.2, 0.8, 0.9])

        metrics = compute_proba_metrics(y_true, y_prob)

        assert metrics["log_loss"] >= 0


class TestMulticlassMetrics:
    """Tests for multiclass-specific metrics."""

    def test_multiclass_metrics_keys(self):
        """Multiclass metrics has per-class arrays."""
        y_true = np.array([0, 1, 2, 0, 1, 2])
        y_pred = np.array([0, 1, 2, 0, 1, 2])
        class_labels = [0, 1, 2]

        metrics = compute_multiclass_metrics(y_true, y_pred, class_labels)

        assert "per_class_precision" in metrics
        assert "per_class_recall" in metrics
        assert "per_class_f1" in metrics
        assert "class_labels" in metrics

    def test_per_class_arrays_length(self):
        """Per-class arrays match number of classes."""
        y_true = np.array([0, 1, 2, 0, 1, 2])
        y_pred = np.array([0, 1, 2, 0, 1, 2])
        class_labels = [0, 1, 2]

        metrics = compute_multiclass_metrics(y_true, y_pred, class_labels)

        assert len(metrics["per_class_precision"]) == 3
        assert len(metrics["per_class_recall"]) == 3
        assert len(metrics["per_class_f1"]) == 3
        assert len(metrics["class_labels"]) == 3


class TestComputeMetricsV1:
    """Tests for the main compute_metrics_v1 function."""

    @pytest.fixture
    def binary_data(self):
        """Binary classification dataset."""
        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
                      [6, 7], [7, 8], [8, 9], [9, 10], [10, 11]])
        y = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
        return X, y

    @pytest.fixture
    def multiclass_data(self):
        """Multiclass classification dataset."""
        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
                      [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
                      [11, 12], [12, 13], [13, 14], [14, 15]])
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2])
        return X, y

    def test_logistic_regression_binary_gets_proba_profile(self, binary_data):
        """LogisticRegression binary → proba.v1."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import train_test_split

        X, y = binary_data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline.fit(X_train, y_train)

        metrics = compute_metrics_v1(pipeline, X_val, y_val, "logistic_regression")

        assert metrics["metrics_profile"] == PROFILE_PROBA
        assert "roc_auc" in metrics
        assert "log_loss" in metrics

    def test_random_forest_binary_gets_proba_profile(self, binary_data):
        """RandomForest binary → proba.v1."""
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import train_test_split

        X, y = binary_data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', RandomForestClassifier(n_estimators=10, random_state=42))
        ])
        pipeline.fit(X_train, y_train)

        metrics = compute_metrics_v1(pipeline, X_val, y_val, "random_forest")

        assert metrics["metrics_profile"] == PROFILE_PROBA
        assert "roc_auc" in metrics
        assert "log_loss" in metrics

    def test_linear_svc_binary_gets_base_profile(self, binary_data):
        """LinearSVC binary → base.v1 (no predict_proba)."""
        from sklearn.svm import LinearSVC
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import train_test_split

        X, y = binary_data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LinearSVC(random_state=42, max_iter=1000))
        ])
        pipeline.fit(X_train, y_train)

        metrics = compute_metrics_v1(pipeline, X_val, y_val, "linear_svc")

        assert metrics["metrics_profile"] == PROFILE_BASE
        # Should still have ROC-AUC from decision_function
        assert "roc_auc" in metrics
        # Should NOT have log_loss (requires probabilities)
        assert "log_loss" not in metrics

    def test_multiclass_gets_multiclass_profile(self, multiclass_data):
        """Multiclass (3+ classes) → multiclass.v1."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import train_test_split

        X, y = multiclass_data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.3, random_state=42
        )

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42, max_iter=1000))
        ])
        pipeline.fit(X_train, y_train)

        metrics = compute_metrics_v1(pipeline, X_val, y_val, "logistic_regression")

        assert metrics["metrics_profile"] == PROFILE_MULTICLASS
        assert "per_class_precision" in metrics
        assert "per_class_recall" in metrics
        assert "per_class_f1" in metrics
        assert "class_labels" in metrics

    def test_metrics_has_required_fields(self, binary_data):
        """All metrics have schema_version, metrics_profile, num_classes."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import train_test_split

        X, y = binary_data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', LogisticRegression(random_state=42))
        ])
        pipeline.fit(X_train, y_train)

        metrics = compute_metrics_v1(pipeline, X_val, y_val, "logistic_regression")

        assert metrics["schema_version"] == "metrics.v1"
        assert "metrics_profile" in metrics
        assert "num_classes" in metrics
        assert metrics["num_classes"] == 2


class TestWriteMetricsV1:
    """Tests for metrics.v1.json file writing."""

    def test_writes_to_correct_path(self, tmp_path):
        """Writes to metrics.v1.json in run directory."""
        metrics = {
            "schema_version": "metrics.v1",
            "metrics_profile": "classification.base.v1",
            "num_classes": 2,
            "accuracy": 0.95,
            "precision_macro": 0.94,
            "recall_macro": 0.93,
            "f1_macro": 0.935,
            "confusion_matrix": [[5, 1], [0, 4]],
        }

        path = write_metrics_v1(metrics, tmp_path)

        assert path == tmp_path / "metrics.v1.json"
        assert path.exists()

    def test_canonical_format(self, tmp_path):
        """File has sorted keys and ends with newline."""
        metrics = {
            "schema_version": "metrics.v1",
            "metrics_profile": "classification.base.v1",
            "num_classes": 2,
            "accuracy": 0.95,
            "precision_macro": 0.94,
            "recall_macro": 0.93,
            "f1_macro": 0.935,
            "confusion_matrix": [[5, 1], [0, 4]],
        }

        path = write_metrics_v1(metrics, tmp_path)
        content = path.read_text()

        # Ends with newline
        assert content.endswith("\n")

        # Keys are sorted (accuracy comes before confusion_matrix)
        lines = content.split("\n")
        key_lines = [l.strip() for l in lines if l.strip().startswith('"')]
        first_key = key_lines[0].split('"')[1]
        assert first_key == "accuracy"  # First alphabetically

    def test_json_parseable(self, tmp_path):
        """File is valid JSON."""
        metrics = {
            "schema_version": "metrics.v1",
            "metrics_profile": "classification.base.v1",
            "num_classes": 2,
            "accuracy": 0.95,
            "precision_macro": 0.94,
            "recall_macro": 0.93,
            "f1_macro": 0.935,
            "confusion_matrix": [[5, 1], [0, 4]],
        }

        path = write_metrics_v1(metrics, tmp_path)

        with open(path) as f:
            loaded = json.load(f)

        assert loaded == metrics


class TestGetClassifierFromPipeline:
    """Tests for classifier extraction from pipeline."""

    def test_extracts_clf_step(self):
        """Extracts classifier from 'clf' step."""
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        clf = LogisticRegression()
        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('clf', clf)
        ])

        extracted = get_classifier_from_pipeline(pipeline)

        assert extracted is clf

    def test_returns_input_if_not_pipeline(self):
        """Returns input directly if not a pipeline."""
        from sklearn.linear_model import LogisticRegression

        clf = LogisticRegression()
        extracted = get_classifier_from_pipeline(clf)

        assert extracted is clf
