"""
Create golden artifact for testing Phase 2.2.2 artifact inspection.

This script creates a deterministic pipeline that can be used for
byte-identical golden tests. Run once to generate the fixture.

Usage:
    python -m ml_runner.fixtures.create_golden_artifact
"""

import pickle
from pathlib import Path

import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression


def create_golden_pipeline() -> Pipeline:
    """
    Create a deterministic pipeline for golden tests.

    Uses fixed seed and minimal data to ensure reproducibility.
    """
    # Fixed training data
    X = np.array([
        [1.0, 2.0, 3.0],
        [4.0, 5.0, 6.0],
        [7.0, 8.0, 9.0],
        [10.0, 11.0, 12.0],
    ])
    y = np.array([0, 1, 0, 1])

    # Create pipeline with fixed parameters
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(random_state=42, max_iter=100, solver="lbfgs")),
    ])

    # Fit the pipeline
    pipeline.fit(X, y)

    return pipeline


def main():
    """Generate golden artifact file."""
    fixtures_dir = Path(__file__).parent
    artifact_path = fixtures_dir / "golden_pipeline.pkl"

    pipeline = create_golden_pipeline()

    with open(artifact_path, "wb") as f:
        pickle.dump(pipeline, f)

    print(f"Golden artifact created: {artifact_path}")
    print(f"Pipeline steps: {[name for name, _ in pipeline.steps]}")


if __name__ == "__main__":
    main()
