"""
Hyperparameter Validation for Phase 3.2

Provides:
- Allowed parameters per model
- Type parsing and validation
- Range validation
- Actionable error messages
"""

from typing import Dict, Any, List, Optional, Union, Callable
from dataclasses import dataclass


class HyperparamError(ValueError):
    """Base class for hyperparameter errors."""
    pass


class UnknownParamError(HyperparamError):
    """Raised when a parameter is not known for the model."""

    def __init__(self, param_name: str, model_family: str, valid_params: List[str]):
        self.param_name = param_name
        self.model_family = model_family
        self.valid_params = valid_params
        valid_str = ", ".join(sorted(valid_params))
        super().__init__(
            f"Unknown parameter '{param_name}' for model '{model_family}'. "
            f"Valid parameters: {valid_str}"
        )


class TypeParseError(HyperparamError):
    """Raised when a parameter value cannot be parsed to expected type."""

    def __init__(self, param_name: str, value: str, expected_type: str):
        self.param_name = param_name
        self.value = value
        self.expected_type = expected_type
        super().__init__(
            f"Cannot parse '{param_name}={value}': expected {expected_type}"
        )


class RangeError(HyperparamError):
    """Raised when a parameter value is out of valid range."""

    def __init__(self, param_name: str, value: Any, constraint: str):
        self.param_name = param_name
        self.value = value
        self.constraint = constraint
        super().__init__(
            f"Invalid value for '{param_name}': {value}. {constraint}"
        )


@dataclass
class ParamSpec:
    """Specification for a hyperparameter."""
    name: str
    type_name: str  # "int", "float", "bool", "str"
    parser: Callable[[str], Any]
    validator: Optional[Callable[[Any], Optional[str]]] = None  # Returns error msg or None
    description: str = ""


def _parse_int(value: str) -> int:
    """Parse string to int."""
    try:
        return int(value)
    except ValueError:
        raise ValueError(f"Cannot convert '{value}' to int")


def _parse_float(value: str) -> float:
    """Parse string to float."""
    try:
        return float(value)
    except ValueError:
        raise ValueError(f"Cannot convert '{value}' to float")


def _parse_bool(value: str) -> bool:
    """Parse string to bool."""
    lower = value.lower()
    if lower in ("true", "1", "yes"):
        return True
    elif lower in ("false", "0", "no"):
        return False
    else:
        raise ValueError(f"Cannot convert '{value}' to bool (use true/false)")


def _parse_str(value: str) -> str:
    """Parse string (identity)."""
    return value


def _parse_int_or_none(value: str) -> Optional[int]:
    """Parse string to int or None."""
    if value.lower() == "none":
        return None
    return _parse_int(value)


# Validators
def _positive_int(value: int) -> Optional[str]:
    """Validate positive integer."""
    if value <= 0:
        return "must be > 0"
    return None


def _positive_float(value: float) -> Optional[str]:
    """Validate positive float."""
    if value <= 0:
        return "must be > 0"
    return None


def _nonnegative_int(value: int) -> Optional[str]:
    """Validate non-negative integer."""
    if value < 0:
        return "must be >= 0"
    return None


def _positive_int_or_none(value: Optional[int]) -> Optional[str]:
    """Validate positive int or None."""
    if value is not None and value < 1:
        return "must be >= 1 or None"
    return None


# Model-specific parameter specifications
LOGISTIC_REGRESSION_PARAMS: Dict[str, ParamSpec] = {
    "C": ParamSpec("C", "float", _parse_float, _positive_float, "Regularization strength (inverse)"),
    "max_iter": ParamSpec("max_iter", "int", _parse_int, _positive_int, "Maximum iterations"),
    "solver": ParamSpec("solver", "str", _parse_str, None, "Optimization solver"),
    "warm_start": ParamSpec("warm_start", "bool", _parse_bool, None, "Reuse previous solution"),
}

RANDOM_FOREST_PARAMS: Dict[str, ParamSpec] = {
    "n_estimators": ParamSpec("n_estimators", "int", _parse_int, _positive_int, "Number of trees"),
    "max_depth": ParamSpec("max_depth", "int or None", _parse_int_or_none, _positive_int_or_none, "Maximum tree depth"),
    "min_samples_split": ParamSpec("min_samples_split", "int", _parse_int, lambda v: "must be >= 2" if v < 2 else None, "Min samples to split"),
    "min_samples_leaf": ParamSpec("min_samples_leaf", "int", _parse_int, _positive_int, "Min samples per leaf"),
}

LINEAR_SVC_PARAMS: Dict[str, ParamSpec] = {
    "C": ParamSpec("C", "float", _parse_float, _positive_float, "Regularization strength (inverse)"),
    "max_iter": ParamSpec("max_iter", "int", _parse_int, _positive_int, "Maximum iterations"),
}


# Model family to params mapping
MODEL_PARAMS: Dict[str, Dict[str, ParamSpec]] = {
    "logistic_regression": LOGISTIC_REGRESSION_PARAMS,
    "random_forest": RANDOM_FOREST_PARAMS,
    "linear_svc": LINEAR_SVC_PARAMS,
}


def get_valid_params(model_family: str) -> List[str]:
    """
    Get list of valid parameter names for a model.

    Args:
        model_family: Model family identifier

    Returns:
        Sorted list of valid parameter names

    Raises:
        ValueError: If model_family is unknown
    """
    if model_family not in MODEL_PARAMS:
        raise ValueError(f"Unknown model family: {model_family}")
    return sorted(MODEL_PARAMS[model_family].keys())


def validate_and_convert(
    model_family: str,
    params: Dict[str, str],
) -> Dict[str, Any]:
    """
    Validate and convert hyperparameters for a model.

    Takes string values (from CLI) and converts to proper types.
    Validates that:
    - Parameter names are known for the model
    - Values can be parsed to expected types
    - Values are in valid ranges

    Args:
        model_family: Model family identifier
        params: Dict of param_name -> string_value

    Returns:
        Dict of param_name -> typed_value

    Raises:
        UnknownParamError: If parameter is not valid for model
        TypeParseError: If value cannot be parsed
        RangeError: If value is out of range
    """
    if model_family not in MODEL_PARAMS:
        raise ValueError(f"Unknown model family: {model_family}")

    model_specs = MODEL_PARAMS[model_family]
    result: Dict[str, Any] = {}

    for name, value_str in params.items():
        # Check if param is known
        if name not in model_specs:
            raise UnknownParamError(name, model_family, list(model_specs.keys()))

        spec = model_specs[name]

        # Parse to type
        try:
            typed_value = spec.parser(value_str)
        except ValueError:
            raise TypeParseError(name, value_str, spec.type_name)

        # Validate range
        if spec.validator:
            error_msg = spec.validator(typed_value)
            if error_msg:
                raise RangeError(name, typed_value, error_msg)

        result[name] = typed_value

    return result
