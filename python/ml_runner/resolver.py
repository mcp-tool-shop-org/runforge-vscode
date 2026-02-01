"""
Parameter Resolution Engine for Phase 3.2

Implements precedence rules for hyperparameter resolution:
1. CLI --param (highest priority)
2. Profile-expanded parameters
3. Model defaults (implicit, not resolved here)

Resolution is deterministic and traceable.
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field

from .profiles import expand_profile, ExpandedProfile, UnknownProfileError


@dataclass(frozen=True)
class ParamSource:
    """
    Tracks the source of a resolved parameter.

    Used for provenance and debugging.
    """
    name: str
    value: Any
    source: str  # "cli", "profile", or "default"


@dataclass
class ResolvedConfig:
    """
    Result of resolving configuration from all sources.

    Contains the final resolved values and their provenance.
    """
    model_family: str
    hyperparameters: Dict[str, Any]
    param_sources: Dict[str, ParamSource]

    # Profile info (only present if profile was used)
    profile_name: Optional[str] = None
    profile_version: Optional[str] = None
    expanded_parameters_hash: Optional[str] = None

    def has_profile(self) -> bool:
        """Check if a profile was used."""
        return self.profile_name is not None


def resolve_config(
    model_family: str,
    cli_params: Optional[Dict[str, str]] = None,
    profile_name: Optional[str] = None,
) -> ResolvedConfig:
    """
    Resolve final configuration from all sources.

    Precedence (highest to lowest):
    1. CLI --param values
    2. Profile-expanded parameters
    3. Model defaults (not applied here - left to model factory)

    Args:
        model_family: Model family from CLI/settings (may be overridden by profile)
        cli_params: Raw CLI parameters as strings (name=value parsed)
        profile_name: Optional profile name to expand

    Returns:
        ResolvedConfig with merged hyperparameters and provenance

    Raises:
        UnknownProfileError: If profile_name is not found
    """
    final_params: Dict[str, Any] = {}
    param_sources: Dict[str, ParamSource] = {}
    final_model_family = model_family

    # Profile expansion info (None if no profile)
    resolved_profile_name: Optional[str] = None
    resolved_profile_version: Optional[str] = None
    resolved_hash: Optional[str] = None

    # Step 1: Expand profile if provided
    if profile_name:
        expanded = expand_profile(profile_name)

        # Profile can override model_family
        final_model_family = expanded.model_family

        # Add profile params to final
        for name, value in expanded.params.items():
            final_params[name] = value
            param_sources[name] = ParamSource(
                name=name,
                value=value,
                source="profile",
            )

        # Record profile info
        resolved_profile_name = expanded.profile_name
        resolved_profile_version = expanded.profile_version
        resolved_hash = expanded.expanded_parameters_hash

    # Step 2: Apply CLI params (override profile)
    if cli_params:
        for name, value in cli_params.items():
            # CLI values are strings - keep as strings for now
            # Type conversion happens in hyperparams.py (Commit 5)
            final_params[name] = value
            param_sources[name] = ParamSource(
                name=name,
                value=value,
                source="cli",
            )

    return ResolvedConfig(
        model_family=final_model_family,
        hyperparameters=final_params,
        param_sources=param_sources,
        profile_name=resolved_profile_name,
        profile_version=resolved_profile_version,
        expanded_parameters_hash=resolved_hash,
    )


def get_param_provenance(config: ResolvedConfig) -> List[Dict[str, Any]]:
    """
    Get provenance info for all resolved parameters.

    Useful for debugging and metadata recording.

    Args:
        config: ResolvedConfig from resolve_config

    Returns:
        List of dicts with name, value, source for each param
    """
    return [
        {"name": ps.name, "value": ps.value, "source": ps.source}
        for ps in sorted(config.param_sources.values(), key=lambda x: x.name)
    ]
