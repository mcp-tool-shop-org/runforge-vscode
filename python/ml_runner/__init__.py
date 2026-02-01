"""
ml_runner - RunForge Training Runner

A training runner for the RunForge VS Code extension.
Phase 2.1: CSV-based classification with Logistic Regression.
- Uses 'label' column (not last column)
- 80/20 deterministic train/val split
- Strict metrics schema (3 keys only)
- Pipeline artifact (includes preprocessing)
"""

__version__ = "0.2.1"
