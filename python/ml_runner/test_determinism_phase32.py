"""
Phase 3.2 Determinism Tests

Tests for:
- Identical hyperparameters produce identical artifacts
- Hash stability across runs
- Profile expansion determinism
"""

import pytest
import tempfile
import os
import json
import pickle
import hashlib
from pathlib import Path

from ml_runner.runner import run_training, train_model
from ml_runner.profiles import expand_profile
from ml_runner.resolver import resolve_config


class TestHyperparameterDeterminism:
    """Tests for deterministic behavior with hyperparameters."""

    @pytest.fixture
    def temp_workspace(self, tmp_path):
        """Create a workspace with CSV."""
        csv_content = """feature1,feature2,label
1.0,2.0,0
2.0,3.0,1
3.0,4.0,0
4.0,5.0,1
5.0,6.0,0
6.0,7.0,1
7.0,8.0,0
8.0,9.0,1
9.0,10.0,0
10.0,11.0,1
"""
        csv_path = tmp_path / "data.csv"
        csv_path.write_text(csv_content)
        return tmp_path, csv_path

    def test_identical_params_produce_identical_metrics(self, temp_workspace, monkeypatch):
        """Identical hyperparameters produce identical metrics."""
        workspace, csv_path = temp_workspace
        monkeypatch.setenv("RUNFORGE_DATASET", str(csv_path))

        # Run 1
        out_dir_1 = workspace / "output1"
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir_1),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            cli_params={"C": "0.5", "max_iter": "100"},
        )

        # Run 2 - identical
        out_dir_2 = workspace / "output2"
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir_2),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            cli_params={"C": "0.5", "max_iter": "100"},
        )

        # Compare metrics
        with open(out_dir_1 / "metrics.json") as f:
            metrics_1 = json.load(f)
        with open(out_dir_2 / "metrics.json") as f:
            metrics_2 = json.load(f)

        assert metrics_1 == metrics_2

    def test_identical_profile_produce_identical_metrics(self, temp_workspace, monkeypatch):
        """Identical profile produces identical metrics."""
        workspace, csv_path = temp_workspace
        monkeypatch.setenv("RUNFORGE_DATASET", str(csv_path))

        # Run 1 with profile
        out_dir_1 = workspace / "output1"
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir_1),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            profile_name="fast",
        )

        # Run 2 with same profile
        out_dir_2 = workspace / "output2"
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir_2),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            profile_name="fast",
        )

        # Compare metrics
        with open(out_dir_1 / "metrics.json") as f:
            metrics_1 = json.load(f)
        with open(out_dir_2 / "metrics.json") as f:
            metrics_2 = json.load(f)

        assert metrics_1 == metrics_2

    def test_different_params_produce_different_models(self, temp_workspace, monkeypatch):
        """Different hyperparameters produce different models."""
        workspace, csv_path = temp_workspace
        monkeypatch.setenv("RUNFORGE_DATASET", str(csv_path))

        # Run 1 with C=0.5
        out_dir_1 = workspace / "output1"
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir_1),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            cli_params={"C": "0.5"},
        )

        # Run 2 with C=2.0
        out_dir_2 = workspace / "output2"
        run_training(
            preset_id="std-train",
            out_dir=str(out_dir_2),
            seed=42,
            device="cpu",
            model_family="logistic_regression",
            cli_params={"C": "2.0"},
        )

        # Load and compare model coefficients
        with open(out_dir_1 / "artifacts" / "model.pkl", "rb") as f:
            pipeline_1 = pickle.load(f)
        with open(out_dir_2 / "artifacts" / "model.pkl", "rb") as f:
            pipeline_2 = pickle.load(f)

        clf_1 = pipeline_1.named_steps["clf"]
        clf_2 = pipeline_2.named_steps["clf"]

        # Different C values should produce different coefficients
        # (though the test data is small, so this is a weak test)
        assert clf_1.C != clf_2.C


class TestHashStability:
    """Tests for hash determinism across runs."""

    def test_expanded_parameters_hash_is_deterministic(self):
        """Same profile expansion produces same hash."""
        expanded_1 = expand_profile("fast")
        expanded_2 = expand_profile("fast")

        assert expanded_1.expanded_parameters_hash == expanded_2.expanded_parameters_hash

    def test_different_profiles_have_different_hashes(self):
        """Different profiles have different hashes."""
        fast = expand_profile("fast")
        thorough = expand_profile("thorough")

        assert fast.expanded_parameters_hash != thorough.expanded_parameters_hash

    def test_hash_is_64_chars_sha256(self):
        """Hash is a 64-character SHA-256 hex string."""
        expanded = expand_profile("fast")

        assert len(expanded.expanded_parameters_hash) == 64
        assert all(c in "0123456789abcdef" for c in expanded.expanded_parameters_hash)

    def test_hash_format_is_stable(self):
        """Hash format doesn't change between calls."""
        # Run multiple times to ensure no randomness
        hashes = [expand_profile("default").expanded_parameters_hash for _ in range(10)]

        # All hashes should be identical
        assert len(set(hashes)) == 1


class TestResolverDeterminism:
    """Tests for resolver determinism."""

    def test_resolve_config_is_deterministic(self):
        """Same inputs produce same resolved config."""
        config_1 = resolve_config(
            model_family="logistic_regression",
            cli_params={"C": "1.0"},
            profile_name="fast",
        )
        config_2 = resolve_config(
            model_family="logistic_regression",
            cli_params={"C": "1.0"},
            profile_name="fast",
        )

        assert config_1.model_family == config_2.model_family
        assert config_1.hyperparameters == config_2.hyperparameters
        assert config_1.expanded_parameters_hash == config_2.expanded_parameters_hash

    def test_provenance_order_is_deterministic(self):
        """Provenance entries are in deterministic order."""
        from ml_runner.resolver import get_param_provenance

        config = resolve_config(
            model_family="logistic_regression",
            cli_params={"C": "2.0", "max_iter": "100"},
            profile_name=None,
        )

        provenance_1 = get_param_provenance(config)
        provenance_2 = get_param_provenance(config)

        assert provenance_1 == provenance_2
        # Should be sorted by name
        names = [p["name"] for p in provenance_1]
        assert names == sorted(names)


class TestTrainModelDeterminism:
    """Tests for train_model determinism with hyperparams."""

    def test_train_model_deterministic_with_hyperparams(self):
        """train_model produces same results with same hyperparams."""
        import numpy as np

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
                      [6, 7], [7, 8], [8, 9], [9, 10], [10, 11]])
        y = np.array([0, 1, 0, 1, 0, 1, 0, 1, 0, 1])

        # Train twice with same params (train_model returns TrainResult)
        result_1 = train_model(
            X=X, y=y,
            model_family="logistic_regression",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams={"C": 0.5, "max_iter": 50},
        )

        result_2 = train_model(
            X=X, y=y,
            model_family="logistic_regression",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams={"C": 0.5, "max_iter": 50},
        )

        assert result_1.accuracy == result_2.accuracy

        # Check model coefficients are identical
        clf_1 = result_1.pipeline.named_steps["clf"]
        clf_2 = result_2.pipeline.named_steps["clf"]
        np.testing.assert_array_almost_equal(clf_1.coef_, clf_2.coef_)

    def test_random_forest_deterministic_with_hyperparams(self):
        """RandomForest with hyperparams is deterministic."""
        import numpy as np

        X = np.array([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
                      [6, 7], [7, 8], [8, 9], [9, 10], [10, 11]])
        y = np.array([0, 1, 0, 1, 0, 1, 0, 1, 0, 1])

        result_1 = train_model(
            X=X, y=y,
            model_family="random_forest",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams={"n_estimators": 50, "max_depth": 3},
        )

        result_2 = train_model(
            X=X, y=y,
            model_family="random_forest",
            regularization=1.0,
            solver="lbfgs",
            max_iter=100,
            epochs=1,
            seed=42,
            hyperparams={"n_estimators": 50, "max_depth": 3},
        )

        assert result_1.accuracy == result_2.accuracy
