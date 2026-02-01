"""
Training Profile Registry for Phase 3.2

Profiles are named aliases that expand to:
- model_family
- hyperparameters

Profiles are versioned and inspectable.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    """
    A named training profile.

    Profiles are immutable and versioned.
    """
    name: str
    version: str
    model_family: str
    params: Dict[str, Any]
    description: str


class UnknownProfileError(ValueError):
    """Raised when a profile name is not found in the registry."""

    def __init__(self, profile_name: str, available: List[str]):
        self.profile_name = profile_name
        self.available = available
        available_str = ", ".join(sorted(available))
        super().__init__(
            f"Unknown profile: '{profile_name}'. "
            f"Available profiles: {available_str}"
        )


# Profile Registry (exhaustive list for Phase 3.2)
# Version format: major.minor (e.g., "1.0")
# Bump version when profile parameters change
PROFILES: Dict[str, Profile] = {
    "default": Profile(
        name="default",
        version="1.0",
        model_family="logistic_regression",
        params={
            # Uses model defaults (empty params)
        },
        description="Default settings, uses model defaults",
    ),
    "fast": Profile(
        name="fast",
        version="1.0",
        model_family="logistic_regression",
        params={
            "max_iter": 50,
        },
        description="Fast training with reduced iterations",
    ),
    "thorough": Profile(
        name="thorough",
        version="1.0",
        model_family="random_forest",
        params={
            "n_estimators": 200,
            "max_depth": 10,
        },
        description="Thorough training with Random Forest ensemble",
    ),
}


def get_profile(name: str) -> Profile:
    """
    Get a profile by name.

    Args:
        name: Profile name

    Returns:
        Profile instance

    Raises:
        UnknownProfileError: If profile name not found
    """
    if name not in PROFILES:
        raise UnknownProfileError(name, list(PROFILES.keys()))
    return PROFILES[name]


def list_profiles() -> List[str]:
    """
    List all available profile names.

    Returns:
        Sorted list of profile names
    """
    return sorted(PROFILES.keys())


def get_profile_info(name: str) -> Dict[str, Any]:
    """
    Get profile information as a dict.

    Useful for inspection and metadata recording.

    Args:
        name: Profile name

    Returns:
        Dict with profile details

    Raises:
        UnknownProfileError: If profile name not found
    """
    profile = get_profile(name)
    return {
        "name": profile.name,
        "version": profile.version,
        "model_family": profile.model_family,
        "params": dict(profile.params),
        "description": profile.description,
    }
