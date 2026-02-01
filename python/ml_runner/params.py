"""
Hyperparameter parsing for Phase 3.2

Handles:
- Parsing --param name=value arguments
- Basic validation (format only, not type/range)
"""

from typing import Dict, List, Tuple


class ParamParseError(ValueError):
    """Raised when a --param argument is malformed."""

    def __init__(self, param_str: str, reason: str):
        self.param_str = param_str
        self.reason = reason
        super().__init__(f"Invalid --param '{param_str}': {reason}")


def parse_param(param_str: str) -> Tuple[str, str]:
    """
    Parse a single --param argument.

    Format: name=value

    Args:
        param_str: Raw parameter string (e.g., "C=1.0")

    Returns:
        Tuple of (name, value) as strings

    Raises:
        ParamParseError: If format is invalid
    """
    if "=" not in param_str:
        raise ParamParseError(param_str, "must contain exactly one '=' (format: name=value)")

    # Split on first = only (value may contain =)
    parts = param_str.split("=", 1)
    name = parts[0].strip()
    value = parts[1].strip()

    if not name:
        raise ParamParseError(param_str, "parameter name cannot be empty")

    if not value:
        raise ParamParseError(param_str, "parameter value cannot be empty")

    # Validate name is a valid identifier
    if not name.replace("_", "").isalnum():
        raise ParamParseError(
            param_str,
            f"parameter name '{name}' must be alphanumeric with underscores"
        )

    return name, value


def parse_params(param_list: List[str]) -> Dict[str, str]:
    """
    Parse a list of --param arguments.

    Later values override earlier ones for the same key.

    Args:
        param_list: List of raw parameter strings

    Returns:
        Dict mapping parameter names to values (as strings)

    Raises:
        ParamParseError: If any parameter is malformed
    """
    result: Dict[str, str] = {}

    for param_str in param_list:
        name, value = parse_param(param_str)
        result[name] = value

    return result
