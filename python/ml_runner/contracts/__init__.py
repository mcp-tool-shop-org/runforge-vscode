"""
RunForge contract schemas for Phase 2.2.1+

This module provides access to JSON schemas that define the structure
of RunForge metadata, inspection, and provenance files.
"""

import json
from pathlib import Path

_CONTRACTS_DIR = Path(__file__).parent


def load_schema(name: str) -> dict:
    """Load a JSON schema by name (without .json extension)."""
    schema_path = _CONTRACTS_DIR / f"{name}.json"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema not found: {name}")
    with open(schema_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_run_schema() -> dict:
    """Get the run.json metadata schema."""
    return load_schema("run.schema.v0.2.2.1")


def get_inspect_schema() -> dict:
    """Get the dataset inspection output schema."""
    return load_schema("inspect.schema.v0.2.2.1")


def get_index_schema() -> dict:
    """Get the provenance index schema."""
    return load_schema("index.schema.v0.2.2.1")
