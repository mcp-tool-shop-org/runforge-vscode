# RunForge VS Code — Agent Orientation

## Frozen contracts (do not edit without amendment)

- [`CONTRACT.md`](CONTRACT.md) — Phase 2.1 frozen guarantees
- [`CONTRACT-PHASE-3.md`](CONTRACT-PHASE-3.md) — Phase 3 capability expansion (frozen)
- [`docs/TRUST_MODEL.md`](docs/TRUST_MODEL.md) — determinism + provenance trust surface

## Ship gates

- [`SHIP_GATE.md`](SHIP_GATE.md) — release checklist (A–E)
- [`SCORECARD.md`](SCORECARD.md) — pre/post remediation scoring

## Phase 3 acceptance docs

- [`docs/PHASE-3.1-ACCEPTANCE.md`](docs/PHASE-3.1-ACCEPTANCE.md) — model selection
- [`docs/PHASE-3.2-ACCEPTANCE.md`](docs/PHASE-3.2-ACCEPTANCE.md) — hyperparameters + profiles
- [`docs/PHASE-3.3-ACCEPTANCE.md`](docs/PHASE-3.3-ACCEPTANCE.md) — model-aware metrics (`metrics.v1`)
- [`docs/PHASE-3.4-ACCEPTANCE.md`](docs/PHASE-3.4-ACCEPTANCE.md) — feature importance
- [`docs/PHASE-3.5-ACCEPTANCE.md`](docs/PHASE-3.5-ACCEPTANCE.md) — linear coefficients
- [`docs/PHASE-3.6-ACCEPTANCE.md`](docs/PHASE-3.6-ACCEPTANCE.md) — interpretability index

## Domain map

- **Extension Core** — `src/extension.ts`, command registration
- **Observability** — `src/observability/`, structured errors (SafeError), VS Code notifications
- **Bridge** — `src/bridge/`, TS ↔ Python subprocess plumbing
- **Python ml_runner** — `python/ml_runner/`, training, metrics, interpretability artifacts
- **Tests** — `test/` (vitest, TS) + `python/tests/` (pytest)
- **CI / Docs / Handbook** — `.github/workflows/`, `docs/`, `site/` (Astro + Starlight)

## Verification

- `npm run verify` — test + compile + VSIX package
- `npm test` — vitest only
- `npm run lint` — eslint over `src/`
- Python: `pytest python/tests/`
