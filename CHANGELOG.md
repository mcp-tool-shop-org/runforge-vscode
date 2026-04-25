# Changelog

All notable changes to the RunForge VS Code extension will be documented in this file.

## [1.0.2] - pending

### Architecture
- Consolidated `.ml/outputs/index.json` to a single writer (Python `provenance.py`).
  TS `index-manager.ts` write path removed. Same consolidation pattern as
  iter #2's `spawnRunnerScript` deletion.
- Canonical types now live exclusively in `src/types.ts` (`IndexEntry`, `RunIndex`,
  `MetricsV1`, `FeatureImportance`, `LinearCoefficients`, `RunMetadata`). Observability
  layer no longer defines shadow types.
- Field-name reconciliation: `dataset_fingerprint` → `dataset_fingerprint_sha256`
  (matches Python's existing schema field name).
- `INDEX_SCHEMA_VERSION` bumped `0.2.2.1` → `1.0.0` to mark the canonical 10-field
  consolidation; legacy on-disk shapes migrated transparently on read.
- New: [`docs/CONTRACTS.md`](docs/CONTRACTS.md) codifies the 6 doctrine rules
  surfaced by 5 iterations of architectural debt resolution.
- Subprocess env hygiene consolidated in `pythonSpawnEnv()` helper —
  `PYTHONIOENCODING='utf-8'` and `PYTHONUNBUFFERED='1'` now set on
  every Python spawn (training, version check, GPU probe, dataset
  inspect, artifact inspect).
- Canonical `InterpretabilityIndex` + supporting summary types in
  `src/types.ts`. Observability layer no longer defines local shadow.
- New `ARTIFACT_FILENAMES` constant in `src/types.ts` — single source
  of truth for artifact filenames (run.json, metrics.v1.json, etc.).
  11 literal-string sites replaced.

### Fixed
- `F-COORD-008` (CRITICAL, iter #3): observability hardcoded `.runforge/` paths;
  replaced with `WORKSPACE_PATHS` constants from `src/types.ts`.
- `F-COORD-010` (CRITICAL, iter #4): index.json write/read shape drift
  (bare-array vs `{runs:[]}`); now `{schema_version, runs:[]}` canonical.
- `F-COORD-011` + `F-FS-001/002/003` + `F-TS-001` (CRITICAL, iter #5a):
  shadow `IndexEntry` and `RunMetadata` in observability with diverging fields
  collapsed onto canonical imports from `src/types.ts`.
- `F-COORD-003` (CRITICAL, iter #2): broken `spawnRunnerScript` directory-form
  invocation; now uses `python -m ml_runner` via `spawnRunner`.
- F-COORD-004 (CRITICAL): Windows non-UTF-8 locales no longer corrupt
  Python subprocess output. PYTHONIOENCODING set natively.
- F-SP-002 (HIGH): success detection now requires `run.json` present
  at run dir after exit code 0 — not just exit-code success.
  Catches mid-write crashes that previously appeared as 'succeeded'.
- F-SP-003 (HIGH): GPU torch probe drops stderr at OS level via
  `stdio: ['ignore','pipe','ignore']`. Import warnings no longer
  fragile-break the JSON parse.
- F-SP-004 (HIGH): all 6 Python spawn sites now use `pythonSpawnEnv()`
  — `PYTHONUNBUFFERED='1'` consistently set.
- F-LD-001 (HIGH): `.ml`/`runs` literal at `src/workspace/run-folder.ts:97`
  replaced with `WORKSPACE_PATHS.RUNS_DIR` constant.

### Tests
- Added full-chain regression: production `appendToIndex` → `safeReadIndex`
  journey, no JSON stub-writes in setup (Rule 5 of `docs/CONTRACTS.md`).
- 18 new regression tests in `test/regression-iter-5b.test.ts`:
  9 for `pythonSpawnEnv` shape, 5 for success detection, 3 for
  GPU stderr isolation. Total test count 247 → 265.

### CI
- Removed redundant `PYTHONIOENCODING: utf-8` env from CI test step
  (now set natively in `pythonSpawnEnv`).
- `npm run verify` lint step is now blocking (was non-blocking shim
  during iter #5a's eslint cleanup phase).

## [1.0.1] - 2026-03-25

### Note (added 2026-04-25 — please upgrade to v1.0.2)

Marketplace v1.0.1 shipped with **5 production-CRITICAL bugs** that break the
core training and run-browsing flow. All five were discovered during the
2026-04-24/25 Dogfood Swarm Stage A audit and are fixed on the `swarm/dogfood`
branch; the fixes ship as part of the next release.

The five issues:

- **`F-COORD-003` (CRITICAL)** — `Train (Standard)` and `Train (High Quality)`
  fail with `ImportError` because `spawnRunnerScript` invoked the Python
  package as a directory path instead of `python -m ml_runner`. **Effect:** no
  training run ever completes on a fresh install.
- **`F-COORD-004` (CRITICAL)** — Python subprocess output corrupts on Windows
  hosts whose system locale is not UTF-8 (cp1252, cp936, etc.) because
  `PYTHONIOENCODING` and `PYTHONUNBUFFERED` were never set on spawn.
  **Effect:** garbled errors, broken JSON parsing of run output.
- **`F-COORD-008` (CRITICAL)** — Observability commands (`Open Latest Run
  Summary`, `Browse Runs`, `View Latest Metrics`, etc.) read from `.runforge/`
  while the Python writer writes to `.ml/`. **Effect:** every observability
  command sees zero runs even after a successful train.
- **`F-COORD-010` (CRITICAL)** — `index.json` shape diverged between writer
  (bare array `[…]`) and reader (`{ schema_version, runs: [] }`).
  **Effect:** index reads throw or silently return empty.
- **`F-COORD-011` (CRITICAL, with `F-FS-001/002/003` + `F-TS-001`)** —
  `IndexEntry` and `RunMetadata` shapes shadowed in observability with
  diverging field names (`dataset_fingerprint` vs `dataset_fingerprint_sha256`,
  etc.). **Effect:** silent field-undefined renders in run summaries.

All five are fixed on `swarm/dogfood` and queued for the next release (v1.0.2),
which also adds **cancel-in-progress** and **`runforge.recoverIndex`**
(see [`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) for the full Phase 4
contract). If you installed v1.0.1 from the Marketplace, please upgrade to
v1.0.2 as soon as it lands. Until then, training and run browsing will not
work.

Full context:
[GitHub Discussion](docs/GITHUB_DISCUSSION_v1.0.1.md) ·
[Marketplace note](docs/MARKETPLACE_NOTE_v1.0.1.md) ·
[`SCORECARD.md`](SCORECARD.md) post-Stage-A status.

### Added
- 5 version consistency tests (semver, CHANGELOG, engine constraint, publisher)

## [1.0.0] - 2026-02-27

### Added
- SECURITY.md with vulnerability reporting policy and data scope
- Threat model section in README (data touched, data NOT touched, permissions)
- Codecov badge in README
- MCP Tool Shop footer in README
- `verify` script — test + compile + VSIX package in one command
- Coverage reporting with @vitest/coverage-v8 and Codecov in CI
- Dependency audit job in CI
- Node 18 + 20 matrix in CI
- VSIX packaging verification in CI
- SHIP_GATE.md and SCORECARD.md for product standards tracking

### Changed
- SafeError now includes `retryable` field (Shipcheck Tier 1 compliance)
- Promoted to v1.0.0 — all Shipcheck hard gates pass

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
