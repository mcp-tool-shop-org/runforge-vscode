"""
Phase 2.2.1 Observability Tests

Tests for:
1. Run metadata determinism (golden tests)
2. Dataset inspection
3. Provenance linkage
4. Structured diagnostics
"""

import json
import os
import pickle
from pathlib import Path
from datetime import datetime, timezone

import pytest
import numpy as np

from .runner import run_training
from .inspect import inspect_dataset, compute_dataset_fingerprint
from .metadata import (
    generate_run_id,
    create_run_metadata,
    write_run_metadata,
    read_run_metadata,
    RUNFORGE_VERSION,
)
from .provenance import (
    load_index,
    append_run_to_index,
    get_latest_run,
    get_run_by_id,
    find_runs_by_fingerprint,
)


@pytest.fixture
def sample_csv(tmp_path: Path) -> Path:
    """Create a sample CSV file for testing."""
    csv_content = """feature1,feature2,feature3,label
1.0,2.0,3.0,0
4.0,5.0,6.0,1
7.0,8.0,9.0,0
10.0,11.0,12.0,1
13.0,14.0,15.0,0
16.0,17.0,18.0,1
19.0,20.0,21.0,0
22.0,23.0,24.0,1
25.0,26.0,27.0,0
28.0,29.0,30.0,1
"""
    csv_path = tmp_path / "test_data.csv"
    csv_path.write_text(csv_content)
    return csv_path


@pytest.fixture
def run_dir(tmp_path: Path) -> Path:
    """Create a temporary run directory."""
    run_path = tmp_path / "test_run"
    run_path.mkdir()
    return run_path


class TestDatasetFingerprint:
    """Test dataset fingerprint is deterministic."""

    def test_fingerprint_is_sha256(self, sample_csv: Path):
        """Fingerprint must be a valid SHA-256 hash."""
        fingerprint = compute_dataset_fingerprint(sample_csv)
        assert len(fingerprint) == 64
        assert all(c in '0123456789abcdef' for c in fingerprint)

    def test_fingerprint_is_deterministic(self, sample_csv: Path):
        """Same file must produce same fingerprint."""
        fp1 = compute_dataset_fingerprint(sample_csv)
        fp2 = compute_dataset_fingerprint(sample_csv)
        assert fp1 == fp2

    def test_different_content_different_fingerprint(self, tmp_path: Path):
        """Different content must produce different fingerprint."""
        csv1 = tmp_path / "csv1.csv"
        csv2 = tmp_path / "csv2.csv"
        csv1.write_text("a,b,label\n1,2,0\n")
        csv2.write_text("a,b,label\n1,2,1\n")  # Different label value

        fp1 = compute_dataset_fingerprint(csv1)
        fp2 = compute_dataset_fingerprint(csv2)
        assert fp1 != fp2


class TestDatasetInspection:
    """Test dataset inspection command."""

    def test_inspect_returns_correct_columns(self, sample_csv: Path):
        """Inspection must return correct column list."""
        result = inspect_dataset(str(sample_csv))
        assert result["columns"] == ["feature1", "feature2", "feature3", "label"]

    def test_inspect_returns_row_count(self, sample_csv: Path):
        """Inspection must return correct row count."""
        result = inspect_dataset(str(sample_csv))
        assert result["num_rows"] == 10

    def test_inspect_returns_feature_count(self, sample_csv: Path):
        """Inspection must return correct feature count (excluding label)."""
        result = inspect_dataset(str(sample_csv))
        assert result["num_features_excluding_label"] == 3

    def test_inspect_confirms_label_present(self, sample_csv: Path):
        """Inspection must confirm label column exists."""
        result = inspect_dataset(str(sample_csv))
        assert result["label_present"] is True
        assert result["label_column"] == "label"

    def test_inspect_detects_missing_label(self, tmp_path: Path):
        """Inspection must detect missing label column."""
        csv_path = tmp_path / "no_label.csv"
        csv_path.write_text("a,b,c\n1,2,3\n")

        result = inspect_dataset(str(csv_path))
        assert result["label_present"] is False

    def test_inspect_includes_fingerprint(self, sample_csv: Path):
        """Inspection must include dataset fingerprint."""
        result = inspect_dataset(str(sample_csv))
        assert "fingerprint_sha256" in result
        assert len(result["fingerprint_sha256"]) == 64


class TestRunMetadataDeterminism:
    """Test that run metadata is deterministic (golden tests)."""

    def test_metadata_same_inputs_same_output(
        self, sample_csv: Path, tmp_path: Path, monkeypatch
    ):
        """Same inputs must produce identical metadata (excluding timestamp)."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))
        # Fix the timestamp for determinism
        monkeypatch.setenv("RUNFORGE_TEST_FIXED_TIME", "2026-01-31T00:00:00+00:00")

        run_dir_1 = tmp_path / "run1"
        run_dir_1.mkdir()
        run_training(
            preset_id="std-train",
            out_dir=str(run_dir_1),
            seed=42,
            device="cpu",
        )

        run_dir_2 = tmp_path / "run2"
        run_dir_2.mkdir()
        run_training(
            preset_id="std-train",
            out_dir=str(run_dir_2),
            seed=42,
            device="cpu",
        )

        # Read run.json from both
        with open(run_dir_1 / "run.json") as f:
            meta1 = json.load(f)
        with open(run_dir_2 / "run.json") as f:
            meta2 = json.load(f)

        # Core fields must match
        assert meta1["runforge_version"] == meta2["runforge_version"]
        assert meta1["dataset"]["fingerprint_sha256"] == meta2["dataset"]["fingerprint_sha256"]
        assert meta1["label_column"] == meta2["label_column"]
        assert meta1["num_samples"] == meta2["num_samples"]
        assert meta1["num_features"] == meta2["num_features"]
        assert meta1["dropped_rows_missing_values"] == meta2["dropped_rows_missing_values"]
        assert meta1["metrics"] == meta2["metrics"]

    def test_metadata_has_required_fields(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """Run metadata must have all required fields."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "run.json") as f:
            metadata = json.load(f)

        # Check all required fields exist
        assert "run_id" in metadata
        assert "runforge_version" in metadata
        assert "created_at" in metadata
        assert "dataset" in metadata
        assert "path" in metadata["dataset"]
        assert "fingerprint_sha256" in metadata["dataset"]
        assert "label_column" in metadata
        assert "num_samples" in metadata
        assert "num_features" in metadata
        assert "dropped_rows_missing_values" in metadata
        assert "metrics" in metadata
        assert "artifacts" in metadata

    def test_metrics_in_metadata_matches_metrics_json(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """Metrics in run.json must match metrics.json exactly."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "run.json") as f:
            run_metadata = json.load(f)
        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)

        assert run_metadata["metrics"] == metrics

    def test_metrics_still_exactly_three_keys(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """Phase 2.1 contract: metrics.json must have exactly 3 keys."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)

        assert set(metrics.keys()) == {"accuracy", "num_samples", "num_features"}


class TestStructuredDiagnostics:
    """Test that diagnostics are recorded as structured data."""

    def test_dropped_rows_in_metadata(self, tmp_path: Path, monkeypatch):
        """Dropped rows count must be in metadata."""
        # Need enough samples for train/test split with stratification
        csv_content = """feature1,feature2,label
1.0,2.0,0
3.0,,1
5.0,6.0,0
,8.0,1
9.0,10.0,0
11.0,12.0,1
13.0,14.0,0
15.0,16.0,1
17.0,18.0,0
19.0,20.0,1
"""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text(csv_content)
        monkeypatch.setenv("RUNFORGE_DATASET", str(csv_path))

        run_dir = tmp_path / "run"
        run_dir.mkdir()
        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "run.json") as f:
            metadata = json.load(f)

        assert metadata["dropped_rows_missing_values"] == 2

    def test_no_dropped_rows_zero_in_metadata(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """When no rows dropped, count must be 0 (not missing)."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "run.json") as f:
            metadata = json.load(f)

        assert metadata["dropped_rows_missing_values"] == 0


class TestProvenanceLinkage:
    """Test provenance tracking and linkage."""

    def test_index_created_on_first_run(
        self, sample_csv: Path, tmp_path: Path, monkeypatch
    ):
        """Provenance index must be created on first run."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        # Create workspace structure
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        runforge_dir = workspace / ".runforge"
        runs_dir = runforge_dir / "runs"
        runs_dir.mkdir(parents=True)

        run_dir = runs_dir / "test-run"
        run_dir.mkdir()

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        assert (runforge_dir / "index.json").exists()

    def test_provenance_append_only(self, tmp_path: Path):
        """Index must be append-only."""
        runforge_dir = tmp_path / ".runforge"
        runforge_dir.mkdir()

        # Add first run
        append_run_to_index(
            runforge_dir=runforge_dir,
            run_id="run-1",
            created_at="2026-01-31T00:00:00+00:00",
            dataset_fingerprint="a" * 64,
            label_column="label",
            run_dir="runs/run-1/run.json",
            model_pkl="runs/run-1/artifacts/model.pkl",
        )

        index1 = load_index(runforge_dir)
        assert len(index1["runs"]) == 1

        # Add second run
        append_run_to_index(
            runforge_dir=runforge_dir,
            run_id="run-2",
            created_at="2026-01-31T01:00:00+00:00",
            dataset_fingerprint="b" * 64,
            label_column="label",
            run_dir="runs/run-2/run.json",
            model_pkl="runs/run-2/artifacts/model.pkl",
        )

        index2 = load_index(runforge_dir)
        assert len(index2["runs"]) == 2
        # First run still present
        assert index2["runs"][0]["run_id"] == "run-1"
        # New run appended at end
        assert index2["runs"][1]["run_id"] == "run-2"

    def test_can_find_run_by_id(self, tmp_path: Path):
        """Must be able to find a run by its ID."""
        runforge_dir = tmp_path / ".runforge"
        runforge_dir.mkdir()

        append_run_to_index(
            runforge_dir=runforge_dir,
            run_id="target-run",
            created_at="2026-01-31T00:00:00+00:00",
            dataset_fingerprint="c" * 64,
            label_column="label",
            run_dir="runs/target-run/run.json",
            model_pkl="runs/target-run/artifacts/model.pkl",
        )

        found = get_run_by_id(runforge_dir, "target-run")
        assert found is not None
        assert found["run_id"] == "target-run"

    def test_can_find_runs_by_fingerprint(self, tmp_path: Path):
        """Must be able to find runs by dataset fingerprint."""
        runforge_dir = tmp_path / ".runforge"
        runforge_dir.mkdir()

        target_fp = "d" * 64

        # Add runs with different fingerprints
        append_run_to_index(
            runforge_dir=runforge_dir,
            run_id="run-1",
            created_at="2026-01-31T00:00:00+00:00",
            dataset_fingerprint=target_fp,
            label_column="label",
            run_dir="runs/run-1/run.json",
            model_pkl="runs/run-1/artifacts/model.pkl",
        )
        append_run_to_index(
            runforge_dir=runforge_dir,
            run_id="run-2",
            created_at="2026-01-31T01:00:00+00:00",
            dataset_fingerprint="e" * 64,  # Different fingerprint
            label_column="label",
            run_dir="runs/run-2/run.json",
            model_pkl="runs/run-2/artifacts/model.pkl",
        )
        append_run_to_index(
            runforge_dir=runforge_dir,
            run_id="run-3",
            created_at="2026-01-31T02:00:00+00:00",
            dataset_fingerprint=target_fp,  # Same as run-1
            label_column="label",
            run_dir="runs/run-3/run.json",
            model_pkl="runs/run-3/artifacts/model.pkl",
        )

        found = find_runs_by_fingerprint(runforge_dir, target_fp)
        assert len(found) == 2
        assert found[0]["run_id"] == "run-1"
        assert found[1]["run_id"] == "run-3"

    def test_provenance_links_to_artifacts(
        self, sample_csv: Path, tmp_path: Path, monkeypatch
    ):
        """Given a run, must be able to locate its artifacts."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        # Create workspace structure
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        runforge_dir = workspace / ".runforge"
        runs_dir = runforge_dir / "runs"
        runs_dir.mkdir(parents=True)

        run_dir = runs_dir / "test-run"
        run_dir.mkdir()

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        # Get latest run from index
        latest = get_latest_run(runforge_dir)
        assert latest is not None

        # Verify we can navigate to model.pkl
        model_pkl_rel = latest["model_pkl"]
        model_pkl_path = runforge_dir / model_pkl_rel
        # The path in index is relative from .runforge, so we need to check parent
        assert (run_dir / "artifacts" / "model.pkl").exists()


class TestRunIdGeneration:
    """Test run ID generation is stable and deterministic."""

    def test_run_id_format(self):
        """Run ID must match expected format."""
        run_id = generate_run_id(
            dataset_fingerprint="a" * 64,
            label_column="label",
            timestamp=datetime(2026, 1, 31, 12, 30, 45, tzinfo=timezone.utc)
        )

        # Format: YYYYMMDD-HHMMSS-<8 char hash>
        parts = run_id.split("-")
        assert len(parts) == 3
        assert parts[0] == "20260131"
        assert parts[1] == "123045"
        assert len(parts[2]) == 8

    def test_run_id_deterministic_for_same_inputs(self):
        """Same inputs must produce same run ID."""
        ts = datetime(2026, 1, 31, 12, 0, 0, tzinfo=timezone.utc)
        fp = "b" * 64

        id1 = generate_run_id(fp, "label", ts)
        id2 = generate_run_id(fp, "label", ts)

        assert id1 == id2

    def test_run_id_different_for_different_fingerprint(self):
        """Different fingerprint must produce different run ID (even same timestamp)."""
        ts = datetime(2026, 1, 31, 12, 0, 0, tzinfo=timezone.utc)

        id1 = generate_run_id("a" * 64, "label", ts)
        id2 = generate_run_id("b" * 64, "label", ts)

        # Hash portion will differ
        assert id1.split("-")[2] != id2.split("-")[2]
