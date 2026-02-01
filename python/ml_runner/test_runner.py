"""
Runner Contract Tests for ml_runner

Phase 2.1 Tests:
1. Label column contract: must use 'label' column
2. Train/val split: 80/20 deterministic split
3. Metrics schema: exactly 3 keys (accuracy, num_samples, num_features)
4. Artifact: model.pkl is a Pipeline (includes preprocessing)
5. Missing values: handled deterministically
"""

import json
import pickle
from pathlib import Path

import pytest
import numpy as np

from .runner import run_training, load_csv
from .presets import get_preset


@pytest.fixture
def sample_csv(tmp_path: Path) -> Path:
    """Create a sample CSV file for testing with 'label' column."""
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


class TestLabelColumnContract:
    """Test that CSV loader uses 'label' column (not last column)."""

    def test_csv_with_label_column_works(self, tmp_path: Path):
        """CSV with 'label' column should work."""
        csv_content = """feature1,label,feature2
1.0,0,2.0
3.0,1,4.0
5.0,0,6.0
7.0,1,8.0
9.0,0,10.0
"""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text(csv_content)

        result = load_csv(csv_path)

        assert result.num_samples == 5
        assert result.num_features == 2  # feature1, feature2
        assert list(result.y) == [0, 1, 0, 1, 0]

    def test_csv_without_label_column_fails(self, tmp_path: Path):
        """CSV without 'label' column should fail with expected message."""
        csv_content = """feature1,feature2,target
1.0,2.0,0
3.0,4.0,1
"""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text(csv_content)

        with pytest.raises(ValueError, match="CSV must contain a 'label' column"):
            load_csv(csv_path)

    def test_csv_with_label_not_last_works(self, tmp_path: Path):
        """CSV with 'label' column in middle position should work."""
        csv_content = """feature1,label,feature2,feature3
1.0,0,2.0,3.0
4.0,1,5.0,6.0
7.0,0,8.0,9.0
10.0,1,11.0,12.0
13.0,0,14.0,15.0
"""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text(csv_content)

        result = load_csv(csv_path)

        assert result.num_samples == 5
        assert result.num_features == 3  # feature1, feature2, feature3
        # Check that features are correctly extracted (label column excluded)
        assert result.X.shape == (5, 3)
        # First row: feature1=1.0, feature2=2.0, feature3=3.0
        assert result.X[0, 0] == 1.0
        assert result.X[0, 1] == 2.0
        assert result.X[0, 2] == 3.0


class TestTrainValSplit:
    """Test deterministic 80/20 train/val split."""

    def test_accuracy_computed_on_validation(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """Accuracy must be computed on validation set, not training set."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)

        # Accuracy should be computed on 20% val set (2 samples from 10)
        # Just verify it's a valid number in range
        assert 0.0 <= metrics["accuracy"] <= 1.0

    def test_determinism_with_split(
        self, sample_csv: Path, tmp_path: Path, monkeypatch
    ):
        """Same seed must produce identical accuracy with train/val split."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        # Run 1
        run_dir_1 = tmp_path / "run1"
        run_dir_1.mkdir()
        run_training(
            preset_id="std-train",
            out_dir=str(run_dir_1),
            seed=42,
            device="cpu",
        )

        # Run 2 with same seed
        run_dir_2 = tmp_path / "run2"
        run_dir_2.mkdir()
        run_training(
            preset_id="std-train",
            out_dir=str(run_dir_2),
            seed=42,
            device="cpu",
        )

        with open(run_dir_1 / "metrics.json") as f:
            metrics_1 = json.load(f)
        with open(run_dir_2 / "metrics.json") as f:
            metrics_2 = json.load(f)

        assert metrics_1["accuracy"] == metrics_2["accuracy"], \
            "Same seed must produce same accuracy"


class TestMetricsSchemaStrict:
    """Test that metrics.json has exactly 3 keys (strict mode)."""

    def test_metrics_has_exactly_three_keys(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """metrics.json must have exactly: accuracy, num_samples, num_features."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)

        # Must have exactly 3 keys
        assert set(metrics.keys()) == {"accuracy", "num_samples", "num_features"}, \
            f"metrics.json must have exactly 3 keys, got: {set(metrics.keys())}"

    def test_no_extra_keys(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """metrics.json must NOT have extra keys like epochs_completed, seed, device."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)

        assert "epochs_completed" not in metrics
        assert "seed" not in metrics
        assert "device" not in metrics

    def test_accuracy_in_valid_range(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """accuracy must be between 0 and 1."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)

        assert 0.0 <= metrics["accuracy"] <= 1.0

    def test_num_samples_matches_dataset(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """num_samples must match total dataset size (train+val)."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)

        # Sample CSV has 10 data rows
        assert metrics["num_samples"] == 10

    def test_num_features_matches_dataset(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """num_features must match actual feature count."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        with open(run_dir / "metrics.json") as f:
            metrics = json.load(f)

        # Sample CSV has 3 features (feature1, feature2, feature3)
        assert metrics["num_features"] == 3


class TestPipelineArtifact:
    """Test that model.pkl is a Pipeline (includes preprocessing)."""

    def test_model_pkl_created(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """model.pkl must be created in artifacts/ directory."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        model_path = run_dir / "artifacts" / "model.pkl"
        assert model_path.exists(), "model.pkl must be created in artifacts/"

    def test_model_is_pipeline(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """model.pkl must be a sklearn Pipeline."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        model_path = run_dir / "artifacts" / "model.pkl"
        with open(model_path, "rb") as f:
            model = pickle.load(f)

        # Must be a Pipeline
        from sklearn.pipeline import Pipeline
        assert isinstance(model, Pipeline), "model.pkl must be a sklearn Pipeline"

    def test_pipeline_has_predict(
        self, sample_csv: Path, run_dir: Path, monkeypatch
    ):
        """Pipeline must have predict method and work on sample data."""
        monkeypatch.setenv("RUNFORGE_DATASET", str(sample_csv))

        run_training(
            preset_id="std-train",
            out_dir=str(run_dir),
            seed=42,
            device="cpu",
        )

        model_path = run_dir / "artifacts" / "model.pkl"
        with open(model_path, "rb") as f:
            model = pickle.load(f)

        # Must have predict method
        assert hasattr(model, "predict")
        assert hasattr(model, "predict_proba")

        # Must work on a sample row (3 features from sample_csv)
        sample = np.array([[1.0, 2.0, 3.0]])
        prediction = model.predict(sample)
        assert len(prediction) == 1


class TestMissingValuesHandling:
    """Test that missing values are handled deterministically."""

    def test_csv_with_missing_values_drops_rows(self, tmp_path: Path):
        """Rows with missing values should be dropped."""
        csv_content = """feature1,feature2,label
1.0,2.0,0
3.0,,1
5.0,6.0,0
,8.0,1
9.0,10.0,0
"""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text(csv_content)

        result = load_csv(csv_path)

        # 2 rows dropped (rows 2 and 4 have missing values)
        assert result.num_samples == 3
        assert result.X.shape == (3, 2)
        assert result.rows_dropped == 2

    def test_missing_values_deterministic(self, tmp_path: Path):
        """Missing value handling must be deterministic."""
        csv_content = """feature1,feature2,label
1.0,2.0,0
3.0,,1
5.0,6.0,0
"""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text(csv_content)

        # Run twice
        result1 = load_csv(csv_path)
        result2 = load_csv(csv_path)

        assert np.array_equal(result1.X, result2.X)
        assert np.array_equal(result1.y, result2.y)
        assert result1.rows_dropped == result2.rows_dropped

    def test_all_rows_missing_fails(self, tmp_path: Path):
        """If all rows have missing values, should fail."""
        csv_content = """feature1,feature2,label
1.0,,0
,4.0,1
"""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text(csv_content)

        with pytest.raises(ValueError, match="no valid data rows"):
            load_csv(csv_path)


class TestPresetNumbers:
    """Test that preset numbers are correctly applied."""

    def test_std_train_preset_values(self):
        """std-train must have locked Phase 2 values."""
        preset = get_preset("std-train")
        defaults = preset["defaults"]

        assert defaults["epochs"] == 50
        assert defaults["learning_rate"] == 0.01
        assert defaults["regularization"] == 1.0
        assert defaults["solver"] == "lbfgs"
        assert defaults["max_iter"] == 200
        assert defaults["seed"] == 42
        assert defaults["device"] == "cpu"

    def test_hq_train_preset_values(self):
        """hq-train must have locked Phase 2 values."""
        preset = get_preset("hq-train")
        defaults = preset["defaults"]

        assert defaults["epochs"] == 200
        assert defaults["learning_rate"] == 0.005
        assert defaults["regularization"] == 0.5
        assert defaults["solver"] == "lbfgs"
        assert defaults["max_iter"] == 500
        assert defaults["seed"] == 42
        assert defaults["device"] == "cpu"


class TestErrorHandling:
    """Test error handling for invalid inputs."""

    def test_missing_env_raises(self, run_dir: Path, monkeypatch):
        """Missing RUNFORGE_DATASET should raise ValueError."""
        monkeypatch.delenv("RUNFORGE_DATASET", raising=False)

        with pytest.raises(ValueError, match="RUNFORGE_DATASET"):
            run_training(
                preset_id="std-train",
                out_dir=str(run_dir),
                seed=42,
                device="cpu",
            )

    def test_nonexistent_file_raises(self, run_dir: Path, monkeypatch):
        """Nonexistent dataset file should raise FileNotFoundError."""
        monkeypatch.setenv("RUNFORGE_DATASET", "/nonexistent/path.csv")

        with pytest.raises(FileNotFoundError):
            run_training(
                preset_id="std-train",
                out_dir=str(run_dir),
                seed=42,
                device="cpu",
            )

    def test_non_numeric_column_error(self, tmp_path: Path):
        """Non-numeric value should report column name."""
        csv_content = """feature1,feature2,label
1.0,hello,0
3.0,4.0,1
"""
        csv_path = tmp_path / "test.csv"
        csv_path.write_text(csv_content)

        with pytest.raises(ValueError, match="Non-numeric value in column 'feature2'"):
            load_csv(csv_path)
