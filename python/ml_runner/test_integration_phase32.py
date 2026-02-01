"""
Phase 3.2 Integration Tests

Tests for end-to-end hyperparameter and profile integration:
- CLI --param values flow through to model
- Profile expansion flows through to model
- CLI > profile precedence works
- Hyperparameter validation catches errors early
"""

import pytest
import tempfile
import os
import json
import pickle
from pathlib import Path

from ml_runner.runner import run_training, train_model
from ml_runner.model_factory import create_estimator


class TestHyperparameterIntegration:
    """Tests for hyperparameter flow through the system."""

    @pytest.fixture
    def temp_csv(self, tmp_path):
        """Create a valid CSV dataset."""
        csv_content = """feature1,feature2,label
1.0,2.0,0
2.0,3.0,1
3.0,4.0,0
4.0,5.0,1
5.0,6.0,0
6.0,7.0,1
7.0,8.0,0
8.0,9.0,1
9.0,10.0,0
10.0,11.0,1
"""
        csv_path = tmp_path / "data.csv"
        csv_path.write_text(csv_content)
        return csv_path

    def test_cli_params_applied_to_logistic_regression(self, temp_csv, tmp_path):
        """CLI params are applied to LogisticRegression."""
        import numpy as np

        # Create test data
        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])
        y = np.array([0, 1, 0, 1, 0])

        # Train with custom C value
        pipeline, accuracy = train_model(
            X=X,
            y=y,
            model_family="logistic_regression",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams={"C": 0.5, "max_iter": 200},
        )

        # Verify the params were applied
        clf = pipeline.named_steps["clf"]
        assert clf.C == 0.5
        assert clf.max_iter == 200

    def test_cli_params_applied_to_random_forest(self, temp_csv, tmp_path):
        """CLI params are applied to RandomForest."""
        import numpy as np

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])
        y = np.array([0, 1, 0, 1, 0])

        pipeline, accuracy = train_model(
            X=X,
            y=y,
            model_family="random_forest",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams={"n_estimators": 50, "max_depth": 3},
        )

        clf = pipeline.named_steps["clf"]
        assert clf.n_estimators == 50
        assert clf.max_depth == 3

    def test_cli_params_applied_to_linear_svc(self, temp_csv, tmp_path):
        """CLI params are applied to LinearSVC."""
        import numpy as np

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])
        y = np.array([0, 1, 0, 1, 0])

        pipeline, accuracy = train_model(
            X=X,
            y=y,
            model_family="linear_svc",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams={"C": 2.0, "max_iter": 500},
        )

        clf = pipeline.named_steps["clf"]
        assert clf.C == 2.0
        assert clf.max_iter == 500

    def test_empty_hyperparams_uses_defaults(self, temp_csv, tmp_path):
        """Empty hyperparams uses preset defaults."""
        import numpy as np

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])
        y = np.array([0, 1, 0, 1, 0])

        pipeline, accuracy = train_model(
            X=X,
            y=y,
            model_family="logistic_regression",
            regularization=1.0,  # C = 1.0
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams={},
        )

        clf = pipeline.named_steps["clf"]
        assert clf.C == 1.0  # From regularization default
        assert clf.max_iter == 100  # From max_iter default

    def test_none_hyperparams_uses_defaults(self, temp_csv, tmp_path):
        """None hyperparams uses preset defaults."""
        import numpy as np

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6]])
        y = np.array([0, 1, 0, 1, 0])

        pipeline, accuracy = train_model(
            X=X,
            y=y,
            model_family="random_forest",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams=None,
        )

        clf = pipeline.named_steps["clf"]
        assert clf.n_estimators == 100  # Default


class TestRunTrainingWithParams:
    """Tests for run_training with hyperparams and profiles."""

    @pytest.fixture
    def temp_workspace(self, tmp_path):
        """Create a workspace with CSV."""
        csv_content = """feature1,feature2,label
1.0,2.0,0
2.0,3.0,1
3.0,4.0,0
4.0,5.0,1
5.0,6.0,0
6.0,7.0,1
7.0,8.0,0
8.0,9.0,1
9.0,10.0,0
10.0,11.0,1
"""
        csv_path = tmp_path / "data.csv"
        csv_path.write_text(csv_content)
        return tmp_path, csv_path

    def test_run_training_with_cli_params(self, temp_workspace, monkeypatch):
        """run_training accepts and uses cli_params."""
        workspace, csv_path = temp_workspace
        out_dir = workspace / "output"

        monkeypatch.setenv("RUNFORGE_DATASET", str(csv_path))

        run_training(
            preset_id="std-train",
            out_dir=str(out_dir),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            cli_params={"C": "0.5", "max_iter": "50"},
        )

        # Verify model was trained
        model_path = out_dir / "artifacts" / "model.pkl"
        assert model_path.exists()

        with open(model_path, "rb") as f:
            pipeline = pickle.load(f)

        clf = pipeline.named_steps["clf"]
        assert clf.C == 0.5
        assert clf.max_iter == 50

    def test_run_training_with_profile(self, temp_workspace, monkeypatch):
        """run_training accepts and uses profile_name."""
        workspace, csv_path = temp_workspace
        out_dir = workspace / "output"

        monkeypatch.setenv("RUNFORGE_DATASET", str(csv_path))

        # "fast" profile sets max_iter=50
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            profile_name="fast",
        )

        model_path = out_dir / "artifacts" / "model.pkl"
        with open(model_path, "rb") as f:
            pipeline = pickle.load(f)

        clf = pipeline.named_steps["clf"]
        assert clf.max_iter == 50  # From "fast" profile

    def test_run_training_profile_overrides_model_family(self, temp_workspace, monkeypatch):
        """Profile can override model_family."""
        workspace, csv_path = temp_workspace
        out_dir = workspace / "output"

        monkeypatch.setenv("RUNFORGE_DATASET", str(csv_path))

        # "thorough" profile uses random_forest
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir),
            seed=42,
            device="cpu",
            model_family="logistic_regression",  # Will be overridden
            profile_name="thorough",
        )

        model_path = out_dir / "artifacts" / "model.pkl"
        with open(model_path, "rb") as f:
            pipeline = pickle.load(f)

        # Should be RandomForest, not LogisticRegression
        clf = pipeline.named_steps["clf"]
        assert clf.__class__.__name__ == "RandomForestClassifier"

    def test_run_training_cli_overrides_profile(self, temp_workspace, monkeypatch):
        """CLI params override profile params."""
        workspace, csv_path = temp_workspace
        out_dir = workspace / "output"

        monkeypatch.setenv("RUNFORGE_DATASET", str(csv_path))

        # "fast" profile sets max_iter=50, but CLI overrides to 75
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            profile_name="fast",
            cli_params={"max_iter": "75"},
        )

        model_path = out_dir / "artifacts" / "model.pkl"
        with open(model_path, "rb") as f:
            pipeline = pickle.load(f)

        clf = pipeline.named_steps["clf"]
        assert clf.max_iter == 75  # CLI wins


class TestValidationErrors:
    """Tests for hyperparameter validation errors."""

    def test_invalid_param_raises_early(self):
        """Invalid hyperparameter is caught during validation."""
        from ml_runner.hyperparams import validate_and_convert, UnknownParamError

        with pytest.raises(UnknownParamError) as exc_info:
            validate_and_convert("logistic_regression", {"bad_param": "value"})

        assert "bad_param" in str(exc_info.value)
        assert "logistic_regression" in str(exc_info.value)

    def test_invalid_type_raises_early(self):
        """Invalid type is caught during validation."""
        from ml_runner.hyperparams import validate_and_convert, TypeParseError

        with pytest.raises(TypeParseError) as exc_info:
            validate_and_convert("logistic_regression", {"max_iter": "not_an_int"})

        assert "max_iter" in str(exc_info.value)
        assert "int" in str(exc_info.value)

    def test_invalid_range_raises_early(self):
        """Invalid range is caught during validation."""
        from ml_runner.hyperparams import validate_and_convert, RangeError

        with pytest.raises(RangeError) as exc_info:
            validate_and_convert("logistic_regression", {"C": "-1.0"})

        assert "C" in str(exc_info.value)
        assert "> 0" in str(exc_info.value)
