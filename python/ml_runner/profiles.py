"""
Training Profile Registry for Phase 3.2

Profiles are named aliases that expand to:
- model_family
- hyperparameters

Profiles are versioned and inspectable.
"""

import hashlib
import json
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


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


@dataclass(frozen=True)
class ExpandedProfile:
    """
    Result of expanding a profile.

    Contains all fields needed for metadata recording.
    """
    profile_name: str
    profile_version: str
    model_family: str
    params: Dict[str, Any]
    expanded_parameters_hash: str


def _compute_expansion_hash(
    profile_name: str,
    profile_version: str,
    model_family: str,
    params: Dict[str, Any],
) -> str:
    """
    Compute SHA-256 hash of expanded profile parameters.

    Uses canonical JSON for determinism:
    - sorted keys
    - no whitespace
    - consistent separators

    Args:
        profile_name: Name of the profile
        profile_version: Version of the profile
        model_family: Model family from the profile
        params: Expanded parameters

    Returns:
        SHA-256 hex digest
    """
    # Build canonical dict with sorted keys
    canonical = {
        "model_family": model_family,
        "params": dict(sorted(params.items())) if params else {},
        "profile_name": profile_name,
        "profile_version": profile_version,
    }

    # Canonical JSON: sorted keys, no whitespace, consistent separators
    json_bytes = json.dumps(
        canonical,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    return hashlib.sha256(json_bytes).hexdigest()


def expand_profile(name: str) -> ExpandedProfile:
    """
    Expand a profile to its full specification.

    Returns an ExpandedProfile with:
    - profile_name
    - profile_version
    - model_family
    - params
    - expanded_parameters_hash (SHA-256)

    The hash is computed from the canonical JSON of
    {profile_name, profile_version, model_family, params}.

    Args:
        name: Profile name

    Returns:
        ExpandedProfile instance

    Raises:
        UnknownProfileError: If profile name not found
    """
    profile = get_profile(name)

    # Make a copy of params to avoid mutation
    params = dict(profile.params)

    # Compute integrity hash
    hash_value = _compute_expansion_hash(
        profile_name=profile.name,
        profile_version=profile.version,
        model_family=profile.model_family,
        params=params,
    )

    return ExpandedProfile(
        profile_name=profile.name,
        profile_version=profile.version,
        model_family=profile.model_family,
        params=params,
        expanded_parameters_hash=hash_value,
    )
