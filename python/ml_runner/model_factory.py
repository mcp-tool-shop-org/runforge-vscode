"""
Model Factory for Phase 3.1

Provides explicit mapping from model identifiers to sklearn estimator classes.
No hyperparameter tuning - uses explicit defaults only.

Supported models:
- logistic_regression: LogisticRegression
- random_forest: RandomForestClassifier
- linear_svc: LinearSVC
"""

from typing import Any, Dict, List


# Phase 3.1 supported models (exhaustive list per CONTRACT-PHASE-3.md)
SUPPORTED_MODELS: List[str] = [
    "logistic_regression",
    "random_forest",
    "linear_svc",
]


class UnsupportedModelError(ValueError):
    """Raised when an unsupported model identifier is requested."""

    def __init__(self, model_family: str):
        self.model_family = model_family
        valid_models = ", ".join(SUPPORTED_MODELS)
        super().__init__(
            f"Unsupported model: '{model_family}'. "
            f"Valid options: {valid_models}"
        )


def create_estimator(
    model_family: str,
    random_state: int,
    **kwargs: Any,
) -> Any:
    """
    Create an sklearn estimator for the given model family.

    This is the single source of truth for model instantiation.
    All models use explicit, documented defaults.

    Args:
        model_family: Model identifier (logistic_regression, random_forest, linear_svc)
        random_state: Random seed for reproducibility
        **kwargs: Additional parameters passed to the estimator
            For logistic_regression: C, solver, max_iter, warm_start
            For random_forest: n_estimators, max_depth
            For linear_svc: C, max_iter

    Returns:
        Configured sklearn estimator instance

    Raises:
        UnsupportedModelError: If model_family is not in SUPPORTED_MODELS
    """
    if model_family not in SUPPORTED_MODELS:
        raise UnsupportedModelError(model_family)

    if model_family == "logistic_regression":
        return _create_logistic_regression(random_state, **kwargs)
    elif model_family == "random_forest":
        return _create_random_forest(random_state, **kwargs)
    elif model_family == "linear_svc":
        return _create_linear_svc(random_state, **kwargs)

    # Should never reach here due to validation above
    raise UnsupportedModelError(model_family)


def _create_logistic_regression(random_state: int, **kwargs: Any) -> Any:
    """Create LogisticRegression with explicit defaults."""
    from sklearn.linear_model import LogisticRegression

    # Defaults match Phase 2 behavior
    params: Dict[str, Any] = {
        "C": kwargs.get("C", 1.0),
        "solver": kwargs.get("solver", "lbfgs"),
        "max_iter": kwargs.get("max_iter", 100),
        "random_state": random_state,
        "warm_start": kwargs.get("warm_start", False),
    }

    return LogisticRegression(**params)


def _create_random_forest(random_state: int, **kwargs: Any) -> Any:
    """Create RandomForestClassifier with explicit defaults."""
    from sklearn.ensemble import RandomForestClassifier

    # Explicit defaults for Phase 3.1
    params: Dict[str, Any] = {
        "n_estimators": kwargs.get("n_estimators", 100),
        "max_depth": kwargs.get("max_depth", None),
        "random_state": random_state,
        "n_jobs": 1,  # Single-threaded for determinism
    }

    return RandomForestClassifier(**params)


def _create_linear_svc(random_state: int, **kwargs: Any) -> Any:
    """Create LinearSVC with explicit defaults."""
    from sklearn.svm import LinearSVC

    # Explicit defaults for Phase 3.1
    params: Dict[str, Any] = {
        "C": kwargs.get("C", 1.0),
        "max_iter": kwargs.get("max_iter", 1000),
        "random_state": random_state,
        "dual": "auto",  # sklearn 1.3+ default
    }

    return LinearSVC(**params)


def get_model_display_name(model_family: str) -> str:
    """
    Get human-readable display name for a model family.

    Used in logging and UI display.

    Args:
        model_family: Model identifier

    Returns:
        Human-readable name (e.g., "Logistic Regression")
    """
    names = {
        "logistic_regression": "Logistic Regression",
        "random_forest": "Random Forest",
        "linear_svc": "Linear SVC",
    }
    return names.get(model_family, model_family)
