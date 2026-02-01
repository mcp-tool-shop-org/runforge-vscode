"""
Preset definitions for ml_runner

These mirror the TypeScript presets in the extension.
Phase 2: Logistic Regression presets with locked numbers.
"""

from typing import TypedDict, Dict


class PresetDefaults(TypedDict):
    epochs: int
    learning_rate: float
    regularization: float
    solver: str
    max_iter: int
    seed: int
    device: str


class Preset(TypedDict):
    id: str
    name: str
    defaults: PresetDefaults


# Preset definitions (Phase 2 - locked numbers for Logistic Regression)
PRESETS: Dict[str, Preset] = {
    "std-train": {
        "id": "std-train",
        "name": "Standard Training",
        "defaults": {
            "epochs": 50,
            "learning_rate": 0.01,
            "regularization": 1.0,
            "solver": "lbfgs",
            "max_iter": 200,
            "seed": 42,
            "device": "cpu",
        },
    },
    "hq-train": {
        "id": "hq-train",
        "name": "High Quality Training",
        "defaults": {
            "epochs": 200,
            "learning_rate": 0.005,
            "regularization": 0.5,
            "solver": "lbfgs",
            "max_iter": 500,
            "seed": 42,
            "device": "cpu",
        },
    },
}


def get_preset(preset_id: str) -> Preset:
    """Get a preset by ID."""
    if preset_id not in PRESETS:
        raise ValueError(f"Unknown preset: {preset_id}")
    return PRESETS[preset_id]


def get_all_presets() -> list[Preset]:
    """Get all available presets."""
    return list(PRESETS.values())
