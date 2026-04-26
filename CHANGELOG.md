# Changelog

All notable changes to the RunForge VS Code extension will be documented in this file.

## [Unreleased]

## [1.2.0] - 2026-04-26

Stage D dogfood polish — full Wave 3a (Frontend + Branding + CI/Docs) plus
the painterly hero asset suite.

### Added

**Frontend / in-extension UX**
- New `src/status-bar.ts` — VS Code status-bar item subscribed to
  `EventStreamConsumer.train_progress`, debounced once per epoch. Shows
  `RunForge: Epoch N/M` while training, brief success-flash on completion,
  hidden when idle.
- New `src/notifications.ts` — centralized helper module seeded for the 51
  inline `vscode.window.show*Message` sites (FE F-006 prep). Eliminates
  ad-hoc toast plumbing across the runner.
- New `runforge.datasetPath` workspace setting — explicit dataset path
  configuration replacing implicit env-var fallback. Surfaces in Settings UI
  with `markdownDescription`.
- Settings UI grouping — `markdownDescription`, `scope`, and `order` on all
  4 settings; settings now group under "RunForge" with a coherent ordering.
- `runforge:hasActiveRun` context key — wired through the run lifecycle so
  command palette items can gate visibility on training state.
- Trust-guard error toast now exposes a "Manage Workspace Trust" action
  button that opens the Trust panel directly instead of just naming it.

**Branding / brand assets**
- New `assets/glyph.svg` — primary brand mark (faceted ingot, 2.1 KB,
  256x256 viewBox). Strategic positioning per the 2026 brand-language
  doctrine: faceted-solid replaces the generic 4-point-sparkle that the
  AI-tool cohort has saturated.
- New `assets/glyph-spark.svg` — accent companion for hover-state /
  feature-badge use (single-arm spark, 732 B, 64x64).
- New `assets/glyph-256.png` — raster fallback for SVG-incompatible
  surfaces.
- New `assets/hero-spark.{webp,png,master.png}` — painterly hero
  illustration (forge spark, captured-moment idiom, atmospheric-
  impressionist subgenre). Generated via non-Turbo DreamShaperXL +
  ClassipeintXL @ 0.4 + Scribble ControlNet @ 0.75 strength on a procedural
  SVG seed. Recipe codified at
  `F:/AI-Models/registry/examples/hero-painterly-spark.md`.
- Replaced `assets/icon.png` with the new faceted-anvil marketplace icon
  (1.6 MB → 6.6 KB, 99.6% smaller; same visual identity, marketplace-spec
  128x128).
- New `assets/marketplace/` and `assets/walkthrough/` directories scaffolded
  for future marketplace listing visuals + walkthrough media.
- New `assets/activity-icon.svg` — 24x24 monochrome activity-bar icon
  contribution candidate.
- `package.json` marketplace meta tightened — leads with determinism in
  the description, version + installs + rating badges added to README.

**CI / Docs**
- `.github/ISSUE_TEMPLATE/` — `bug_report.yml`, `feature_request.yml`,
  `question.yml`, plus `config.yml` routing to handbook / Discussions /
  SECURITY.md.
- `.github/PULL_REQUEST_TEMPLATE.md` — contract-impact + verification
  checklist.
- `.github/CODEOWNERS` — frozen-contract surfaces gated for review.
- Starlight `:::caution` / `:::tip` / `:::note` asides on the Cancel &
  Recovery handbook page (5s SIGKILL, atomic marker, partial artifacts,
  workspace-trust guard).

### Changed
- Handbook sidebar: explicit grouping (Start here / Operations / Reference /
  Contracts) replacing `autogenerate`. Frontmatter `sidebar.order` removed
  from each handbook page (now redundant).
- Tagged plain-text state-machine and lifecycle code blocks with the `text`
  language hint so they render with monospace + horizontal scroll instead
  of soft-wrap (`cancel-and-recovery.md`, `reference.md`).
- README: deduplicated horizontal rule between Non-Goals and Observability.
- README badge row: added VS Code Marketplace rating badge alongside the
  existing auto-tracking version + installs badges.

### Notes

The painterly hero asset suite ships in `assets/` for marketplace + brand
use. The Astro landing page (`site/`) still uses the existing site-theme
hero shape; porting the painterly hero to the Astro site is tracked as a
separate roadmap (`F:/AI/runforge-vscode/.stage-d/SITE_THEME_ROADMAP.md`)
and not part of this release.

## [1.1.0] - 2026-04-25

### Added
- **Cancel in-progress training** — new `runforge.cancelActiveRun` command
  cancels an in-flight run via VS Code's `CancellationToken` API. TS arms a
  5s SIGKILL trigger the moment SIGTERM is sent; if Python has not exited by
  t+5s, SIGKILL fires regardless of cleanup state. The 5s timer is a SIGKILL
  trigger only — it is NOT a graceful detector. Terminal cancel state is
  determined by ARTIFACTS ON DISK + EVENTS OBSERVED (`.cancelled` marker
  present OR `run_cancelled` event observed → "Cancelled (graceful)"; else
  → "Cancelled (forced)"). See `CONTRACT-PHASE-4.md` §3.1.1.
- **Recover Index** — new `runforge.recoverIndex` command walks `.ml/runs/`,
  re-reads each `run.json`, and re-appends missing runs to
  `.ml/outputs/index.json`. Idempotent (keyed on `run_id`), read-only with
  respect to artifacts, excludes cancelled runs explicitly. Returns a
  canonical `RecoveryReport` (single TS type in `src/types.ts` consumed by
  both writer and markdown render — prospective-contract pattern, lesson
  #11). See §3.1.2.
- **Workspace trust guard** for Python subprocess spawn. Training, version
  check, GPU probe, dataset inspect, and artifact inspect now require
  `vscode.workspace.isTrusted`. Untrusted workspaces receive a structured
  SafeError pointing to the Manage Workspace Trust UI.
- **Per-epoch progress notifications** — training is wrapped in
  `vscode.window.withProgress({cancellable: true})`. Progress notifications
  surface live `train_progress` events from the Python event stream and
  expose VS Code's built-in cancel button (wired through to
  `runforge.cancelActiveRun`).
- **CSV error actionability** — non-comma delimiters, non-UTF-8 encodings,
  all-NaN labels, single-column CSVs, and header-only CSVs each raise
  specific actionable diagnostics with file path + reason + remediation
  hint. Replaces opaque pandas tracebacks.
- **Custom ESLint rules** enforcing the architectural doctrines in
  [`docs/CONTRACTS.md`](docs/CONTRACTS.md) — Rule 2 (no literal duplicating a
  named constant) via `no-restricted-syntax` selectors, and Rule 3 (no
  shadow types in consumer modules) via a custom rule in `eslint-rules/`.
  Both run as part of `npm run lint`.
- **Doctrine documentation** — [`docs/CONTRACTS.md`](docs/CONTRACTS.md)
  gained a new "Operational patterns from swarm retros" section codifying
  patterns #11–#17 alongside the original 6 architectural rules.

### Infrastructure
- **`.cancelled` marker contract** (`cancelled.schema.v1.0.0.json`) —
  Python writes the marker atomically (`os.replace()` on `.cancelled.tmp`
  → `.cancelled`) so partial markers cannot exist. Even if SIGKILL fires
  at t+5s, a marker that was atomically written before t+5s still wins.
- **Structured event stream** (`events.schema.v1.json`, FROZEN at v1.0.0).
  Python emits JSONL on stderr, one event per line. Nine event types:
  `run_start`, `dataset_loaded`, `train_started`, `train_progress`,
  `train_finished`, `metrics_computed`, `artifacts_written`, `cancelling`,
  `run_cancelled`. Emission order is deterministic; timestamps naturally
  vary. TS Bridge validates each event; malformed events are dropped
  without throwing. See §3.2.
- Orphan banner extended to all 7 observability commands (Stage C banner
  was a single command). Banner offers `Recover Index` as one-click
  remediation.
- Source-of-truth doctrine generalized to crash + success paths
  (§3.1.3): every terminal run state is determined by artifacts on disk
  + events observed during the run lifetime, never by process-exit
  timing alone. Process-exit timing is a control-flow trigger, NOT a
  state detector.
- New handbook page **Cancel and Recovery** documenting the cancel state
  machine, recovery report shape, and workspace trust guard.
- Phase 4 produced 0 CRITICALs, validating pattern #11 (pre-defined
  contract eliminates the F-COORD-011 drift class for parallel dispatch).

### Dependencies
- **Optional new Python dep:** `jsonschema` enables runtime validation of
  the structured event stream emitted by `ml_runner` to stderr (Phase 4
  FT-PY-005). If `jsonschema` is not installed, events are still emitted
  but bypass schema validation — runs still complete; CI / dev environments
  with jsonschema catch schema drift earlier. Install with: `pip install jsonschema`.
  See `python/ml_runner/contracts/events.schema.v1.json` for the schema.

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

### Note (added 2026-04-25 — please upgrade to v1.1.0)

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

All five are fixed in **v1.1.0**, which also delivers the full Phase 4
feature surface (cancel-in-progress, `runforge.recoverIndex`, workspace-trust
guard, structured event stream, hardened CSV errors). See
[`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) for the full Phase 4 contract.
If you installed v1.0.1 from the Marketplace, please upgrade to v1.1.0.
Until then, training and run browsing will not work.

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
