"""
Artifact Inspection Module for RunForge Phase 2.2.2

Read-only inspection of trained model artifacts (model.pkl).
Extracts structural information only - no learned values, no mutations.

This module:
- Loads model.pkl safely (read-only)
- Validates it is an sklearn Pipeline
- Extracts pipeline structure (step names, types, modules)
- Outputs schema-compliant inspection JSON
"""

import json
import pickle
from pathlib import Path
from typing import Any, Dict, List

# Known preprocessing step types (class names)
PREPROCESSING_TYPES = frozenset([
    "StandardScaler",
    "MinMaxScaler",
    "MaxAbsScaler",
    "RobustScaler",
    "Normalizer",
    "Binarizer",
    "PolynomialFeatures",
    "OneHotEncoder",
    "OrdinalEncoder",
    "LabelEncoder",
    "LabelBinarizer",
    "MultiLabelBinarizer",
    "KBinsDiscretizer",
    "FunctionTransformer",
    "PowerTransformer",
    "QuantileTransformer",
    "SplineTransformer",
    "SimpleImputer",
    "KNNImputer",
    "IterativeImputer",
    "MissingIndicator",
    "PCA",
    "TruncatedSVD",
    "SelectKBest",
    "SelectPercentile",
    "VarianceThreshold",
    "RFE",
    "RFECV",
    "SelectFromModel",
    "ColumnTransformer",
    "FeatureUnion",
])

SCHEMA_VERSION = "0.2.2.2"


class ArtifactLoadError(Exception):
    """Raised when artifact cannot be loaded or is invalid."""
    pass


class NotAPipelineError(ArtifactLoadError):
    """Raised when loaded artifact is not an sklearn Pipeline."""
    pass


def load_artifact(artifact_path: Path) -> Any:
    """
    Load a model artifact from disk (read-only).

    Args:
        artifact_path: Path to the model.pkl file

    Returns:
        The loaded Python object (expected to be an sklearn Pipeline)

    Raises:
        ArtifactLoadError: If file cannot be read
        FileNotFoundError: If file does not exist
    """
    if not artifact_path.exists():
        raise FileNotFoundError(f"Artifact not found: {artifact_path}")

    try:
        with open(artifact_path, "rb") as f:
            return pickle.load(f)
    except Exception as e:
        raise ArtifactLoadError(f"Failed to load artifact: {e}") from e


def validate_is_pipeline(obj: Any) -> None:
    """
    Validate that an object is an sklearn Pipeline.

    Args:
        obj: The loaded artifact

    Raises:
        NotAPipelineError: If object is not a Pipeline
    """
    # Check class name and module to avoid import dependency
    class_name = obj.__class__.__name__
    module_name = obj.__class__.__module__

    if class_name != "Pipeline":
        raise NotAPipelineError(
            f"Expected sklearn Pipeline, got {class_name} "
            f"from module {module_name}"
        )

    if not module_name.startswith("sklearn"):
        raise NotAPipelineError(
            f"Expected sklearn Pipeline, got {class_name} "
            f"from non-sklearn module {module_name}"
        )


def extract_pipeline_structure(pipeline: Any) -> List[Dict[str, str]]:
    """
    Extract structural information from a pipeline.

    Returns ordered list of steps with name, type, and module.
    Does NOT extract learned values (coefficients, weights, etc.).

    Args:
        pipeline: An sklearn Pipeline object

    Returns:
        List of step dictionaries with keys: name, type, module
    """
    steps = []

    # Pipeline.steps is a list of (name, estimator) tuples
    for step_name, estimator in pipeline.steps:
        step_info = {
            "name": step_name,
            "type": estimator.__class__.__name__,
            "module": estimator.__class__.__module__,
        }
        steps.append(step_info)

    return steps


def has_preprocessing_steps(steps: List[Dict[str, str]]) -> bool:
    """
    Check if any pipeline step is a preprocessing step.

    Args:
        steps: List of step dictionaries from extract_pipeline_structure

    Returns:
        True if at least one step is a known preprocessing type
    """
    for step in steps:
        if step["type"] in PREPROCESSING_TYPES:
            return True
    return False


def inspect_artifact(artifact_path: Path, base_path: Path = None) -> Dict[str, Any]:
    """
    Perform read-only inspection of a model artifact.

    Args:
        artifact_path: Path to the model.pkl file
        base_path: Optional base path for computing relative artifact_path.
                   If not provided, uses artifact_path.name only.

    Returns:
        Schema-compliant inspection dictionary

    Raises:
        ArtifactLoadError: If artifact cannot be loaded
        NotAPipelineError: If artifact is not an sklearn Pipeline
    """
    # Load artifact
    obj = load_artifact(artifact_path)

    # Validate type
    validate_is_pipeline(obj)

    # Extract structure
    steps = extract_pipeline_structure(obj)

    # Compute relative path
    if base_path is not None:
        try:
            rel_path = artifact_path.relative_to(base_path)
            artifact_rel = str(rel_path).replace("\\", "/")
        except ValueError:
            # Not relative, use name only
            artifact_rel = artifact_path.name
    else:
        artifact_rel = artifact_path.name

    # Build inspection result
    result = {
        "schema_version": SCHEMA_VERSION,
        "artifact_path": artifact_rel,
        "pipeline_steps": steps,
        "has_preprocessing": has_preprocessing_steps(steps),
        "step_count": len(steps),
    }

    return result


def write_inspection_json(result: Dict[str, Any], output_path: Path = None) -> str:
    """
    Serialize inspection result to canonical JSON.

    Deterministic output:
    - Sorted keys
    - Stable separators (", " and ": ")
    - 2-space indentation
    - Trailing newline

    Args:
        result: Inspection dictionary from inspect_artifact
        output_path: Optional path to write JSON file. If None, returns string only.

    Returns:
        JSON string representation
    """
    json_str = json.dumps(
        result,
        indent=2,
        sort_keys=True,
        separators=(", ", ": "),
        ensure_ascii=False,
    ) + "\n"

    if output_path is not None:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(json_str)

    return json_str
