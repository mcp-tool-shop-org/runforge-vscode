"""
Phase 3.1 Model Selection Tests

Tests for:
- CLI argument parsing (--model flag)
- Default model behavior
- Invalid model identifier handling
- Model factory
"""

import pytest
import sys
from unittest.mock import patch, MagicMock

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import LinearSVC


class TestCLIModelArgument:
    """Tests for --model CLI argument parsing."""

    def test_model_arg_accepts_logistic_regression(self):
        """--model logistic_regression is accepted."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/test",
            "--device", "cpu",
            "--model", "logistic_regression",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                main()
                mock_run.assert_called_once()
                _, kwargs = mock_run.call_args
                assert kwargs["model_family"] == "logistic_regression"

    def test_model_arg_accepts_random_forest(self):
        """--model random_forest is accepted."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/test",
            "--device", "cpu",
            "--model", "random_forest",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                main()
                mock_run.assert_called_once()
                _, kwargs = mock_run.call_args
                assert kwargs["model_family"] == "random_forest"

    def test_model_arg_accepts_linear_svc(self):
        """--model linear_svc is accepted."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/test",
            "--device", "cpu",
            "--model", "linear_svc",
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                main()
                mock_run.assert_called_once()
                _, kwargs = mock_run.call_args
                assert kwargs["model_family"] == "linear_svc"

    def test_model_arg_default_is_logistic_regression(self):
        """Default model is logistic_regression when --model not specified."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/test",
            "--device", "cpu",
            # No --model flag
        ]

        with patch.object(sys, "argv", test_args):
            with patch("ml_runner.cli.run_training") as mock_run:
                main()
                mock_run.assert_called_once()
                _, kwargs = mock_run.call_args
                assert kwargs["model_family"] == "logistic_regression"

    def test_model_arg_invalid_fails(self):
        """Invalid model identifier causes argument parsing to fail."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/test",
            "--device", "cpu",
            "--model", "invalid_model",
        ]

        with patch.object(sys, "argv", test_args):
            with pytest.raises(SystemExit) as exc_info:
                main()
            # argparse exits with code 2 for invalid arguments
            assert exc_info.value.code == 2

    def test_model_arg_case_sensitive(self):
        """Model identifiers are case-sensitive."""
        from ml_runner.cli import main

        test_args = [
            "ml_runner",
            "train",
            "--preset", "std-train",
            "--out", "/tmp/test",
            "--device", "cpu",
            "--model", "LOGISTIC_REGRESSION",  # Wrong case
        ]

        with patch.object(sys, "argv", test_args):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 2


class TestRunTrainingSignature:
    """Tests for run_training function signature."""

    def test_run_training_accepts_model_family(self):
        """run_training accepts model_family parameter."""
        from ml_runner.runner import run_training
        import inspect

        sig = inspect.signature(run_training)
        params = list(sig.parameters.keys())

        assert "model_family" in params

    def test_run_training_model_family_default(self):
        """run_training defaults model_family to logistic_regression."""
        from ml_runner.runner import run_training
        import inspect

        sig = inspect.signature(run_training)
        model_param = sig.parameters["model_family"]

        assert model_param.default == "logistic_regression"


class TestModelFactory:
    """Tests for model_factory.py."""

    def test_create_logistic_regression(self):
        """create_estimator returns LogisticRegression for logistic_regression."""
        from ml_runner.model_factory import create_estimator

        estimator = create_estimator("logistic_regression", random_state=42)
        assert isinstance(estimator, LogisticRegression)
        assert estimator.random_state == 42

    def test_create_random_forest(self):
        """create_estimator returns RandomForestClassifier for random_forest."""
        from ml_runner.model_factory import create_estimator

        estimator = create_estimator("random_forest", random_state=42)
        assert isinstance(estimator, RandomForestClassifier)
        assert estimator.random_state == 42

    def test_create_linear_svc(self):
        """create_estimator returns LinearSVC for linear_svc."""
        from ml_runner.model_factory import create_estimator

        estimator = create_estimator("linear_svc", random_state=42)
        assert isinstance(estimator, LinearSVC)
        assert estimator.random_state == 42

    def test_unsupported_model_raises(self):
        """create_estimator raises UnsupportedModelError for unknown models."""
        from ml_runner.model_factory import create_estimator, UnsupportedModelError

        with pytest.raises(UnsupportedModelError) as exc_info:
            create_estimator("unknown_model", random_state=42)

        assert "unknown_model" in str(exc_info.value)
        assert "logistic_regression" in str(exc_info.value)
        assert "random_forest" in str(exc_info.value)
        assert "linear_svc" in str(exc_info.value)

    def test_supported_models_list(self):
        """SUPPORTED_MODELS contains exactly the Phase 3.1 models."""
        from ml_runner.model_factory import SUPPORTED_MODELS

        assert set(SUPPORTED_MODELS) == {
            "logistic_regression",
            "random_forest",
            "linear_svc",
        }

    def test_logistic_regression_default_params(self):
        """LogisticRegression uses explicit defaults."""
        from ml_runner.model_factory import create_estimator

        estimator = create_estimator("logistic_regression", random_state=42)

        assert estimator.C == 1.0
        assert estimator.solver == "lbfgs"
        assert estimator.max_iter == 100

    def test_random_forest_single_threaded(self):
        """RandomForest uses n_jobs=1 for determinism."""
        from ml_runner.model_factory import create_estimator

        estimator = create_estimator("random_forest", random_state=42)

        assert estimator.n_jobs == 1

    def test_custom_params_passed_through(self):
        """Custom parameters are passed to estimator."""
        from ml_runner.model_factory import create_estimator

        estimator = create_estimator(
            "logistic_regression",
            random_state=42,
            C=0.5,
            max_iter=200,
        )

        assert estimator.C == 0.5
        assert estimator.max_iter == 200

    def test_get_model_display_name(self):
        """get_model_display_name returns human-readable names."""
        from ml_runner.model_factory import get_model_display_name

        assert get_model_display_name("logistic_regression") == "Logistic Regression"
        assert get_model_display_name("random_forest") == "Random Forest"
        assert get_model_display_name("linear_svc") == "Linear SVC"
        assert get_model_display_name("unknown") == "unknown"


class TestTrainModel:
    """Tests for train_model function with different model families."""

    def test_train_logistic_regression_produces_pipeline(self, tmp_path):
        """train_model with logistic_regression produces valid pipeline."""
        import numpy as np
        from sklearn.pipeline import Pipeline
        from ml_runner.runner import train_model

        # Simple test data
        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        pipeline, accuracy = train_model(
            X=X,
            y=y,
            model_family="logistic_regression",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
        )

        assert isinstance(pipeline, Pipeline)
        assert 0.0 <= accuracy <= 1.0
        assert hasattr(pipeline, "predict")

    def test_train_random_forest_produces_pipeline(self, tmp_path):
        """train_model with random_forest produces valid pipeline."""
        import numpy as np
        from sklearn.pipeline import Pipeline
        from ml_runner.runner import train_model

        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        pipeline, accuracy = train_model(
            X=X,
            y=y,
            model_family="random_forest",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
        )

        assert isinstance(pipeline, Pipeline)
        assert 0.0 <= accuracy <= 1.0
        assert hasattr(pipeline, "predict")

    def test_train_linear_svc_produces_pipeline(self, tmp_path):
        """train_model with linear_svc produces valid pipeline."""
        import numpy as np
        from sklearn.pipeline import Pipeline
        from ml_runner.runner import train_model

        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        pipeline, accuracy = train_model(
            X=X,
            y=y,
            model_family="linear_svc",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
        )

        assert isinstance(pipeline, Pipeline)
        assert 0.0 <= accuracy <= 1.0
        assert hasattr(pipeline, "predict")

    def test_pipeline_has_scaler_and_clf_steps(self):
        """All pipelines have scaler and clf steps (stable naming)."""
        import numpy as np
        from ml_runner.runner import train_model

        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        for model_family in ["logistic_regression", "random_forest", "linear_svc"]:
            pipeline, _ = train_model(
                X=X,
                y=y,
                model_family=model_family,
                regularization=1.0,
                solver="lbfgs",
                max_iter=100,
                epochs=1,
                seed=42,
            )

            step_names = [name for name, _ in pipeline.steps]
            assert "scaler" in step_names, f"{model_family} missing scaler step"
            assert "clf" in step_names, f"{model_family} missing clf step"

    def test_training_is_deterministic(self):
        """Training produces identical results with same seed."""
        import numpy as np
        from ml_runner.runner import train_model

        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        for model_family in ["logistic_regression", "random_forest", "linear_svc"]:
            _, acc1 = train_model(
                X=X, y=y, model_family=model_family,
                regularization=1.0, solver="lbfgs", max_iter=100, epochs=1, seed=42,
            )
            _, acc2 = train_model(
                X=X, y=y, model_family=model_family,
                regularization=1.0, solver="lbfgs", max_iter=100, epochs=1, seed=42,
            )

            assert acc1 == acc2, f"{model_family} not deterministic"


class TestMetadataModelFamily:
    """Tests for model_family field in run metadata."""

    def test_create_run_metadata_includes_model_family(self):
        """create_run_metadata includes model_family field."""
        from ml_runner.metadata import create_run_metadata

        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=0,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            model_family="random_forest",
        )

        assert "model_family" in metadata
        assert metadata["model_family"] == "random_forest"

    def test_create_run_metadata_default_model_family(self):
        """create_run_metadata defaults model_family to logistic_regression."""
        from ml_runner.metadata import create_run_metadata

        metadata = create_run_metadata(
            run_id="test-run",
            dataset_path="/path/to/data.csv",
            dataset_fingerprint="abc123",
            label_column="label",
            num_samples=100,
            num_features=10,
            dropped_rows=0,
            accuracy=0.95,
            model_pkl_path="artifacts/model.pkl",
            # No model_family specified
        )

        assert metadata["model_family"] == "logistic_regression"

    def test_model_family_for_each_supported_model(self):
        """model_family is correctly recorded for each model type."""
        from ml_runner.metadata import create_run_metadata

        for model in ["logistic_regression", "random_forest", "linear_svc"]:
            metadata = create_run_metadata(
                run_id="test-run",
                dataset_path="/path/to/data.csv",
                dataset_fingerprint="abc123",
                label_column="label",
                num_samples=100,
                num_features=10,
                dropped_rows=0,
                accuracy=0.95,
                model_pkl_path="artifacts/model.pkl",
                model_family=model,
            )

            assert metadata["model_family"] == model

    def test_version_updated_for_phase_31(self):
        """RUNFORGE_VERSION is updated for Phase 3.1+."""
        from ml_runner.metadata import RUNFORGE_VERSION

        # Should be 0.3.x for Phase 3.x
        assert RUNFORGE_VERSION.startswith("0.3.")


class TestArtifactInspection:
    """Tests for artifact inspection with different model families."""

    def test_inspect_logistic_regression_artifact(self, tmp_path):
        """Artifact inspection correctly identifies LogisticRegression."""
        import pickle
        import numpy as np
        from ml_runner.runner import train_model
        from ml_runner.artifact_inspect import inspect_artifact

        # Train and save a LogisticRegression model
        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        pipeline, _ = train_model(
            X=X, y=y, model_family="logistic_regression",
            regularization=1.0, solver="lbfgs", max_iter=100, epochs=1, seed=42,
        )

        model_path = tmp_path / "model.pkl"
        with open(model_path, "wb") as f:
            pickle.dump(pipeline, f)

        # Inspect the artifact (returns dict)
        result = inspect_artifact(model_path)

        # Find the clf step
        clf_step = next(s for s in result["pipeline_steps"] if s["name"] == "clf")
        assert "LogisticRegression" in clf_step["type"]

    def test_inspect_random_forest_artifact(self, tmp_path):
        """Artifact inspection correctly identifies RandomForestClassifier."""
        import pickle
        import numpy as np
        from ml_runner.runner import train_model
        from ml_runner.artifact_inspect import inspect_artifact

        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        pipeline, _ = train_model(
            X=X, y=y, model_family="random_forest",
            regularization=1.0, solver="lbfgs", max_iter=100, epochs=1, seed=42,
        )

        model_path = tmp_path / "model.pkl"
        with open(model_path, "wb") as f:
            pickle.dump(pipeline, f)

        result = inspect_artifact(model_path)

        clf_step = next(s for s in result["pipeline_steps"] if s["name"] == "clf")
        assert "RandomForestClassifier" in clf_step["type"]

    def test_inspect_linear_svc_artifact(self, tmp_path):
        """Artifact inspection correctly identifies LinearSVC."""
        import pickle
        import numpy as np
        from ml_runner.runner import train_model
        from ml_runner.artifact_inspect import inspect_artifact

        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        pipeline, _ = train_model(
            X=X, y=y, model_family="linear_svc",
            regularization=1.0, solver="lbfgs", max_iter=100, epochs=1, seed=42,
        )

        model_path = tmp_path / "model.pkl"
        with open(model_path, "wb") as f:
            pickle.dump(pipeline, f)

        result = inspect_artifact(model_path)

        clf_step = next(s for s in result["pipeline_steps"] if s["name"] == "clf")
        assert "LinearSVC" in clf_step["type"]

    def test_all_models_have_two_pipeline_steps(self, tmp_path):
        """All model pipelines have exactly 2 steps (scaler + clf)."""
        import pickle
        import numpy as np
        from ml_runner.runner import train_model
        from ml_runner.artifact_inspect import inspect_artifact

        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        for model_family in ["logistic_regression", "random_forest", "linear_svc"]:
            pipeline, _ = train_model(
                X=X, y=y, model_family=model_family,
                regularization=1.0, solver="lbfgs", max_iter=100, epochs=1, seed=42,
            )

            model_path = tmp_path / f"model_{model_family}.pkl"
            with open(model_path, "wb") as f:
                pickle.dump(pipeline, f)

            result = inspect_artifact(model_path)
            assert result["step_count"] == 2, f"{model_family} has {result['step_count']} steps"

    def test_inspection_is_read_only(self, tmp_path):
        """Artifact inspection does not modify the artifact."""
        import pickle
        import numpy as np
        from ml_runner.runner import train_model
        from ml_runner.artifact_inspect import inspect_artifact

        X = np.array([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]])
        y = np.array([0, 0, 0, 1, 1, 1])

        pipeline, _ = train_model(
            X=X, y=y, model_family="random_forest",
            regularization=1.0, solver="lbfgs", max_iter=100, epochs=1, seed=42,
        )

        model_path = tmp_path / "model.pkl"
        with open(model_path, "wb") as f:
            pickle.dump(pipeline, f)

        # Get file hash before inspection
        import hashlib
        with open(model_path, "rb") as f:
            hash_before = hashlib.sha256(f.read()).hexdigest()

        # Inspect
        inspect_artifact(model_path)

        # Get file hash after inspection
        with open(model_path, "rb") as f:
            hash_after = hashlib.sha256(f.read()).hexdigest()

        assert hash_before == hash_after
