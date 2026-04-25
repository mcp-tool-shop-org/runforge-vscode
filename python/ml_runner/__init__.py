"""
ml_runner - RunForge Training Runner

A training runner for the RunForge VS Code extension.
Phase 2.1: CSV-based classification with Logistic Regression.
- Uses 'label' column (not last column)
- 80/20 deterministic train/val split
- Strict metrics schema (3 keys only)
- Pipeline artifact (includes preprocessing)

Note: Canonical version lives in `metadata.RUNFORGE_VERSION`. The legacy
`__version__` attribute that lived here was removed in iter #5b — it had
no consumers and was drifting from the canonical value.
"""
