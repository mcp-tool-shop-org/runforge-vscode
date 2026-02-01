"""
Tests for Artifact Inspection Module (Phase 2.2.2)

Tests cover:
- Read-only artifact loading
- Pipeline validation
- Structure extraction
- Preprocessing detection
- Canonical JSON output
- Error cases
"""

import json
import pickle
from pathlib import Path

import pytest
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

from .artifact_inspect import (
    load_artifact,
    validate_is_pipeline,
    extract_pipeline_structure,
    has_preprocessing_steps,
    inspect_artifact,
    write_inspection_json,
    ArtifactLoadError,
    NotAPipelineError,
    SCHEMA_VERSION,
)


@pytest.fixture
def simple_pipeline() -> Pipeline:
    """Create a simple trained pipeline for testing."""
    # Minimal training to get a valid pipeline
    X = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0], [7.0, 8.0]])
    y = np.array([0, 1, 0, 1])

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(random_state=42, max_iter=100)),
    ])
    pipeline.fit(X, y)
    return pipeline


@pytest.fixture
def model_pkl(tmp_path: Path, simple_pipeline: Pipeline) -> Path:
    """Create a model.pkl file for testing."""
    model_path = tmp_path / "model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(simple_pipeline, f)
    return model_path


class TestLoadArtifact:
    """Test read-only artifact loading."""

    def test_load_valid_artifact(self, model_pkl: Path, simple_pipeline: Pipeline):
        """Should load a valid model.pkl file."""
        loaded = load_artifact(model_pkl)
        assert isinstance(loaded, Pipeline)
        assert len(loaded.steps) == len(simple_pipeline.steps)

    def test_load_nonexistent_file(self, tmp_path: Path):
        """Should raise FileNotFoundError for missing file."""
        with pytest.raises(FileNotFoundError, match="Artifact not found"):
            load_artifact(tmp_path / "nonexistent.pkl")

    def test_load_corrupted_file(self, tmp_path: Path):
        """Should raise ArtifactLoadError for corrupted file."""
        corrupt_path = tmp_path / "corrupt.pkl"
        corrupt_path.write_bytes(b"not a valid pickle")

        with pytest.raises(ArtifactLoadError, match="Failed to load artifact"):
            load_artifact(corrupt_path)

    def test_load_empty_file(self, tmp_path: Path):
        """Should raise ArtifactLoadError for empty file."""
        empty_path = tmp_path / "empty.pkl"
        empty_path.write_bytes(b"")

        with pytest.raises(ArtifactLoadError, match="Failed to load artifact"):
            load_artifact(empty_path)


class TestValidateIsPipeline:
    """Test Pipeline validation."""

    def test_valid_pipeline(self, simple_pipeline: Pipeline):
        """Should not raise for valid sklearn Pipeline."""
        validate_is_pipeline(simple_pipeline)  # Should not raise

    def test_not_pipeline_wrong_class(self):
        """Should raise NotAPipelineError for wrong class."""
        with pytest.raises(NotAPipelineError, match="Expected sklearn Pipeline"):
            validate_is_pipeline(StandardScaler())

    def test_not_pipeline_dict(self):
        """Should raise NotAPipelineError for dict."""
        with pytest.raises(NotAPipelineError, match="Expected sklearn Pipeline"):
            validate_is_pipeline({"steps": []})

    def test_not_pipeline_list(self):
        """Should raise NotAPipelineError for list."""
        with pytest.raises(NotAPipelineError, match="Expected sklearn Pipeline"):
            validate_is_pipeline([("scaler", StandardScaler())])


class TestExtractPipelineStructure:
    """Test pipeline structure extraction."""

    def test_extract_steps(self, simple_pipeline: Pipeline):
        """Should extract step names, types, and modules."""
        steps = extract_pipeline_structure(simple_pipeline)

        assert len(steps) == 2

        # First step: scaler
        assert steps[0]["name"] == "scaler"
        assert steps[0]["type"] == "StandardScaler"
        assert steps[0]["module"] == "sklearn.preprocessing._data"

        # Second step: classifier
        assert steps[1]["name"] == "clf"
        assert steps[1]["type"] == "LogisticRegression"
        assert "sklearn" in steps[1]["module"]

    def test_extract_preserves_order(self):
        """Should preserve step order."""
        pipeline = Pipeline([
            ("step_a", StandardScaler()),
            ("step_b", StandardScaler()),
            ("step_c", LogisticRegression(max_iter=100)),
        ])

        steps = extract_pipeline_structure(pipeline)

        assert [s["name"] for s in steps] == ["step_a", "step_b", "step_c"]

    def test_no_learned_values_exposed(self, simple_pipeline: Pipeline):
        """Extracted steps should NOT contain learned values."""
        steps = extract_pipeline_structure(simple_pipeline)

        for step in steps:
            # Only allowed keys
            assert set(step.keys()) == {"name", "type", "module"}

            # No coefficients, weights, means, scales, etc.
            assert "coef_" not in step
            assert "intercept_" not in step
            assert "mean_" not in step
            assert "scale_" not in step
            assert "n_features_in_" not in step


class TestHasPreprocessingSteps:
    """Test preprocessing detection."""

    def test_pipeline_with_scaler(self):
        """Should detect StandardScaler as preprocessing."""
        steps = [
            {"name": "scaler", "type": "StandardScaler", "module": "sklearn.preprocessing._data"},
            {"name": "clf", "type": "LogisticRegression", "module": "sklearn.linear_model"},
        ]
        assert has_preprocessing_steps(steps) is True

    def test_pipeline_classifier_only(self):
        """Should return False for classifier-only pipeline."""
        steps = [
            {"name": "clf", "type": "LogisticRegression", "module": "sklearn.linear_model"},
        ]
        assert has_preprocessing_steps(steps) is False

    def test_pipeline_with_pca(self):
        """Should detect PCA as preprocessing."""
        steps = [
            {"name": "reduce", "type": "PCA", "module": "sklearn.decomposition"},
            {"name": "clf", "type": "SVC", "module": "sklearn.svm"},
        ]
        assert has_preprocessing_steps(steps) is True

    def test_pipeline_with_encoder(self):
        """Should detect OneHotEncoder as preprocessing."""
        steps = [
            {"name": "encode", "type": "OneHotEncoder", "module": "sklearn.preprocessing"},
        ]
        assert has_preprocessing_steps(steps) is True


class TestInspectArtifact:
    """Test full artifact inspection."""

    def test_inspect_valid_artifact(self, model_pkl: Path):
        """Should return schema-compliant inspection result."""
        result = inspect_artifact(model_pkl)

        # Check required fields
        assert result["schema_version"] == SCHEMA_VERSION
        assert result["artifact_path"] == "model.pkl"
        assert isinstance(result["pipeline_steps"], list)
        assert len(result["pipeline_steps"]) == 2
        assert result["has_preprocessing"] is True
        assert result["step_count"] == 2

    def test_inspect_with_base_path(self, model_pkl: Path, tmp_path: Path):
        """Should compute relative path from base."""
        # Create nested structure
        nested = tmp_path / "runs" / "run1" / "artifacts"
        nested.mkdir(parents=True)
        nested_pkl = nested / "model.pkl"

        with open(model_pkl, "rb") as src:
            with open(nested_pkl, "wb") as dst:
                dst.write(src.read())

        result = inspect_artifact(nested_pkl, base_path=tmp_path)

        assert result["artifact_path"] == "runs/run1/artifacts/model.pkl"

    def test_inspect_nonexistent_raises(self, tmp_path: Path):
        """Should raise for nonexistent file."""
        with pytest.raises(FileNotFoundError):
            inspect_artifact(tmp_path / "nonexistent.pkl")

    def test_inspect_non_pipeline_raises(self, tmp_path: Path):
        """Should raise for non-Pipeline artifact."""
        bad_pkl = tmp_path / "bad.pkl"
        with open(bad_pkl, "wb") as f:
            pickle.dump({"not": "a pipeline"}, f)

        with pytest.raises(NotAPipelineError):
            inspect_artifact(bad_pkl)


class TestWriteInspectionJson:
    """Test canonical JSON serialization."""

    def test_json_has_trailing_newline(self, model_pkl: Path):
        """JSON output must end with newline."""
        result = inspect_artifact(model_pkl)
        json_str = write_inspection_json(result)

        assert json_str.endswith("\n")

    def test_json_is_deterministic(self, model_pkl: Path):
        """Same input must produce identical output."""
        result = inspect_artifact(model_pkl)

        json_str1 = write_inspection_json(result)
        json_str2 = write_inspection_json(result)

        assert json_str1 == json_str2

    def test_json_sorted_keys(self, model_pkl: Path):
        """JSON keys must be sorted."""
        result = inspect_artifact(model_pkl)
        json_str = write_inspection_json(result)

        # Parse back and check key order
        parsed = json.loads(json_str)

        # Top-level keys should be sorted
        keys = list(parsed.keys())
        assert keys == sorted(keys)

    def test_json_write_to_file(self, model_pkl: Path, tmp_path: Path):
        """Should write to file when path provided."""
        result = inspect_artifact(model_pkl)
        output_path = tmp_path / "inspection.json"

        json_str = write_inspection_json(result, output_path)

        assert output_path.exists()
        assert output_path.read_text(encoding="utf-8") == json_str

    def test_json_validates_against_schema_structure(self, model_pkl: Path):
        """Output must have all required schema fields."""
        result = inspect_artifact(model_pkl)
        json_str = write_inspection_json(result)
        parsed = json.loads(json_str)

        # Required fields per schema
        required = [
            "schema_version",
            "artifact_path",
            "pipeline_steps",
            "has_preprocessing",
            "step_count",
        ]

        for field in required:
            assert field in parsed, f"Missing required field: {field}"

        # No extra fields
        assert set(parsed.keys()) == set(required)


class TestGoldenArtifact:
    """Golden test: same artifact always produces byte-identical JSON."""

    @pytest.fixture
    def golden_artifact_path(self) -> Path:
        """Path to the golden pipeline artifact."""
        return Path(__file__).parent / "fixtures" / "golden_pipeline.pkl"

    @pytest.fixture
    def golden_json_path(self) -> Path:
        """Path to the expected golden JSON output."""
        return Path(__file__).parent / "fixtures" / "golden_inspection.json"

    def test_golden_artifact_exists(self, golden_artifact_path: Path):
        """Golden artifact fixture must exist."""
        assert golden_artifact_path.exists(), (
            f"Golden artifact not found: {golden_artifact_path}. "
            "Run: python -m ml_runner.fixtures.create_golden_artifact"
        )

    def test_golden_json_exists(self, golden_json_path: Path):
        """Golden JSON fixture must exist."""
        assert golden_json_path.exists(), f"Golden JSON not found: {golden_json_path}"

    def test_byte_identical_output(
        self, golden_artifact_path: Path, golden_json_path: Path
    ):
        """Inspection output must be byte-identical to golden file."""
        # Skip if fixtures don't exist
        if not golden_artifact_path.exists() or not golden_json_path.exists():
            pytest.skip("Golden fixtures not available")

        # Inspect the artifact
        result = inspect_artifact(golden_artifact_path)
        actual_json = write_inspection_json(result)

        # Read expected
        expected_json = golden_json_path.read_text(encoding="utf-8")

        # Must be byte-identical
        assert actual_json == expected_json, (
            "Inspection output differs from golden file.\n"
            f"Expected:\n{expected_json}\n"
            f"Actual:\n{actual_json}"
        )

    def test_golden_validates_schema(self, golden_json_path: Path):
        """Golden JSON must have all required schema fields."""
        if not golden_json_path.exists():
            pytest.skip("Golden JSON not available")

        content = golden_json_path.read_text(encoding="utf-8")
        parsed = json.loads(content)

        # Required fields per schema
        required = [
            "schema_version",
            "artifact_path",
            "pipeline_steps",
            "has_preprocessing",
            "step_count",
        ]

        for field in required:
            assert field in parsed, f"Golden file missing required field: {field}"

        # Schema version must match
        assert parsed["schema_version"] == SCHEMA_VERSION


class TestReadOnlyBehavior:
    """Test that inspection is truly read-only."""

    def test_artifact_not_modified(self, model_pkl: Path):
        """Inspection must not modify the artifact file."""
        # Get original file contents
        original_bytes = model_pkl.read_bytes()
        original_mtime = model_pkl.stat().st_mtime

        # Perform inspection
        inspect_artifact(model_pkl)

        # Verify unchanged
        assert model_pkl.read_bytes() == original_bytes
        assert model_pkl.stat().st_mtime == original_mtime

    def test_no_side_effects(self, model_pkl: Path, tmp_path: Path):
        """Inspection must not create any files."""
        # List files before
        files_before = set(tmp_path.rglob("*"))

        # Perform inspection (without writing output)
        inspect_artifact(model_pkl)

        # List files after
        files_after = set(tmp_path.rglob("*"))

        # Only the model.pkl should exist (from fixture)
        assert files_before == files_after
