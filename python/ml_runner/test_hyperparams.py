"""
Phase 3.2 Hyperparameter Validation Tests

Tests for:
- Unknown parameter detection
- Type parsing
- Range validation
- Error messages
"""

import pytest

from ml_runner.hyperparams import (
    validate_and_convert,
    get_valid_params,
    UnknownParamError,
    TypeParseError,
    RangeError,
    MODEL_PARAMS,
)


class TestGetValidParams:
    """Tests for get_valid_params."""

    def test_logistic_regression_params(self):
        """LogisticRegression has expected params."""
        params = get_valid_params("logistic_regression")
        assert "C" in params
        assert "max_iter" in params
        assert "solver" in params

    def test_random_forest_params(self):
        """RandomForest has expected params."""
        params = get_valid_params("random_forest")
        assert "n_estimators" in params
        assert "max_depth" in params

    def test_linear_svc_params(self):
        """LinearSVC has expected params."""
        params = get_valid_params("linear_svc")
        assert "C" in params
        assert "max_iter" in params

    def test_unknown_model_raises(self):
        """Unknown model raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            get_valid_params("unknown_model")
        assert "unknown_model" in str(exc_info.value)


class TestValidateAndConvertLogisticRegression:
    """Tests for LogisticRegression hyperparameters."""

    def test_valid_C(self):
        """Valid C value is converted."""
        result = validate_and_convert("logistic_regression", {"C": "1.5"})
        assert result["C"] == 1.5
        assert isinstance(result["C"], float)

    def test_valid_max_iter(self):
        """Valid max_iter is converted."""
        result = validate_and_convert("logistic_regression", {"max_iter": "200"})
        assert result["max_iter"] == 200
        assert isinstance(result["max_iter"], int)

    def test_valid_solver(self):
        """Valid solver is kept as string."""
        result = validate_and_convert("logistic_regression", {"solver": "lbfgs"})
        assert result["solver"] == "lbfgs"

    def test_valid_warm_start_true(self):
        """warm_start=true is converted to True."""
        result = validate_and_convert("logistic_regression", {"warm_start": "true"})
        assert result["warm_start"] is True

    def test_valid_warm_start_false(self):
        """warm_start=false is converted to False."""
        result = validate_and_convert("logistic_regression", {"warm_start": "false"})
        assert result["warm_start"] is False

    def test_invalid_C_negative(self):
        """Negative C raises RangeError."""
        with pytest.raises(RangeError) as exc_info:
            validate_and_convert("logistic_regression", {"C": "-1.0"})
        assert "must be > 0" in str(exc_info.value)

    def test_invalid_C_zero(self):
        """Zero C raises RangeError."""
        with pytest.raises(RangeError) as exc_info:
            validate_and_convert("logistic_regression", {"C": "0"})
        assert "must be > 0" in str(exc_info.value)

    def test_invalid_max_iter_type(self):
        """Non-int max_iter raises TypeParseError."""
        with pytest.raises(TypeParseError) as exc_info:
            validate_and_convert("logistic_regression", {"max_iter": "abc"})
        assert "expected int" in str(exc_info.value)


class TestValidateAndConvertRandomForest:
    """Tests for RandomForest hyperparameters."""

    def test_valid_n_estimators(self):
        """Valid n_estimators is converted."""
        result = validate_and_convert("random_forest", {"n_estimators": "100"})
        assert result["n_estimators"] == 100

    def test_valid_max_depth_int(self):
        """max_depth as int is converted."""
        result = validate_and_convert("random_forest", {"max_depth": "10"})
        assert result["max_depth"] == 10

    def test_valid_max_depth_none(self):
        """max_depth as None is converted."""
        result = validate_and_convert("random_forest", {"max_depth": "None"})
        assert result["max_depth"] is None

    def test_invalid_n_estimators_zero(self):
        """Zero n_estimators raises RangeError."""
        with pytest.raises(RangeError) as exc_info:
            validate_and_convert("random_forest", {"n_estimators": "0"})
        assert "must be > 0" in str(exc_info.value)

    def test_invalid_min_samples_split(self):
        """min_samples_split < 2 raises RangeError."""
        with pytest.raises(RangeError) as exc_info:
            validate_and_convert("random_forest", {"min_samples_split": "1"})
        assert "must be >= 2" in str(exc_info.value)


class TestValidateAndConvertLinearSVC:
    """Tests for LinearSVC hyperparameters."""

    def test_valid_C(self):
        """Valid C is converted."""
        result = validate_and_convert("linear_svc", {"C": "0.5"})
        assert result["C"] == 0.5

    def test_valid_max_iter(self):
        """Valid max_iter is converted."""
        result = validate_and_convert("linear_svc", {"max_iter": "2000"})
        assert result["max_iter"] == 2000


class TestUnknownParams:
    """Tests for unknown parameter handling."""

    def test_unknown_param_logistic_regression(self):
        """Unknown param for LogisticRegression raises."""
        with pytest.raises(UnknownParamError) as exc_info:
            validate_and_convert("logistic_regression", {"n_estimators": "100"})

        assert exc_info.value.param_name == "n_estimators"
        assert exc_info.value.model_family == "logistic_regression"
        assert "C" in exc_info.value.valid_params

    def test_unknown_param_random_forest(self):
        """Unknown param for RandomForest raises."""
        with pytest.raises(UnknownParamError) as exc_info:
            validate_and_convert("random_forest", {"solver": "lbfgs"})

        assert exc_info.value.param_name == "solver"

    def test_error_message_lists_valid_params(self):
        """Error message includes valid parameters."""
        with pytest.raises(UnknownParamError) as exc_info:
            validate_and_convert("logistic_regression", {"bad_param": "value"})

        error_msg = str(exc_info.value)
        assert "C" in error_msg
        assert "max_iter" in error_msg


class TestMultipleParams:
    """Tests for validating multiple parameters."""

    def test_multiple_valid_params(self):
        """Multiple valid params are all converted."""
        result = validate_and_convert(
            "logistic_regression",
            {"C": "2.0", "max_iter": "500", "solver": "saga"},
        )

        assert result == {"C": 2.0, "max_iter": 500, "solver": "saga"}

    def test_first_invalid_raises(self):
        """First invalid param in sequence raises."""
        with pytest.raises(UnknownParamError):
            validate_and_convert(
                "logistic_regression",
                {"C": "1.0", "bad_param": "value"},
            )


class TestEmptyParams:
    """Tests for empty parameter handling."""

    def test_empty_params_returns_empty(self):
        """Empty params dict returns empty result."""
        result = validate_and_convert("logistic_regression", {})
        assert result == {}

    def test_empty_params_all_models(self):
        """Empty params works for all models."""
        for model in ["logistic_regression", "random_forest", "linear_svc"]:
            result = validate_and_convert(model, {})
            assert result == {}
