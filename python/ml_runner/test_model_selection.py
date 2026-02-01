"""
Phase 3.1 Model Selection Tests

Tests for:
- CLI argument parsing (--model flag)
- Default model behavior
- Invalid model identifier handling
"""

import pytest
import sys
from unittest.mock import patch, MagicMock


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
