# Changelog

All notable changes to the RunForge VS Code extension will be documented in this file.

## [0.4.5] - 2026-02-27

### Added
- 82 new tests covering formatters, run-manager helpers, and metadata (187 total).
- Exported `isOomError` and `formatDuration` from run-manager for testability.

## [0.4.4] - 2026-02-27

### Changed
- Patch version bump.

## [0.4.3] - 2026-02-23

### Added
- New command: **Export Latest Run as Markdown** — generates a formatted summary with overview, dataset info, metrics (including v1 detailed metrics and confusion matrix), interpretability artifacts, and file listing. Saved to `run-summary.md` in the run directory.

## [0.4.2] - 2026-01-19

### Added
- CI workflow with esbuild compile verification and vitest test runner

## [0.4.1] - 2026-01-12

### Fixed
- Improved error handling in observability commands using fs-safe module

## [0.4.0] - 2025-12-29

### Added
- Phase 4 foundation: model family selection (logistic_regression, random_forest, linear_svc)
- Training profiles (default, fast, thorough)

## [0.3.6] - 2025-12-22

### Added
- Interpretability index command — unified view of all interpretability artifacts

## [0.3.5] - 2025-12-15

### Added
- Linear coefficients viewer for linear models (Logistic Regression, Linear SVC)

## [0.3.4] - 2025-12-08

### Added
- Feature importance viewer for RandomForest models

## [0.3.3] - 2025-12-01

### Added
- Detailed metrics viewer (metrics.v1.json) with confusion matrix and per-class metrics
