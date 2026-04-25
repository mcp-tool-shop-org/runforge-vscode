# RunForge Phase 4 Contract

**Status:** DRAFT (Wave 0 — pending coordinator + user review).
**Frozen on:** TBD (date when Mike signs off and Wave 1 dispatches).
**Authority:** This document plus `CONTRACT.md` (Phase 2.1) and `CONTRACT-PHASE-3.md` (Phase 3) define the immutable behavior surface RunForge promises to users and downstream consumers.

## 1. Scope

Phase 4 extends Phase 3 with **run lifecycle management** (cancel + recover), **structured event-stream observability**, **CSV ingestion error-message hardening**, **Extension Host smoke testing**, and **doctrine enforcement via ESLint**. All Phase 2 + Phase 3 frozen surfaces remain unchanged; Phase 4 is purely additive.

## 2. Inherited frozen guarantees (DO NOT amend)

Phase 4 inherits and DOES NOT modify:

- **Determinism** (`CONTRACT.md` §2): same code + data + seed → identical run_id, identical model.pkl, identical metrics
- **Label semantics** (`CONTRACT.md` §3): label column required; numeric only
- **Train/validation split** (`CONTRACT.md` §4): stratified deterministic 80/20
- **Phase 2 metrics contract** (`CONTRACT.md` §5): `metrics.json` carries `accuracy`, `num_samples`, `num_features` exactly
- **Model artifact** (`CONTRACT.md` §6): single `model.pkl` containing sklearn Pipeline
- **Missing-data handling** (`CONTRACT.md` §7): rows with NaN are dropped; count logged
- **Source of truth** (`CONTRACT.md` §8): Python ml_runner is authoritative; TS extension is renderer + orchestrator only
- **Phase 3 model selection** (`CONTRACT-PHASE-3.md`): three families locked — `logistic_regression`, `random_forest`, `linear_svc`
- **Phase 3 hyperparameters + profiles** (`CONTRACT-PHASE-3.md`): three profiles `default`, `fast`, `thorough`
- **Phase 3 metrics expansion** (`CONTRACT-PHASE-3.md`): `metrics.v1.json` profiles frozen
- **Phase 3 interpretability artifacts** (`CONTRACT-PHASE-3.md`): `feature_importance.v1.json`, `linear_coefficients.v1.json`, `interpretability.index.v1.json` shapes frozen
- **Phase 3 read-only doctrine** (`docs/TRUST_MODEL.md`): no retraining, no SHAP/LIME approximations, no in-place mutation of artifacts

## 3. Phase 4 capability additions

### 3.1 Run lifecycle: cancel and recover

#### 3.1.1 Cancellation
Phase 4 introduces user-initiated cancel of an in-progress training run via VS Code's `CancellationToken` API.

**Contract:**
- TS extension propagates `vscode.window.withProgress` `CancellationToken` through `run-manager.executeRun()` to the Python subprocess.
- On token fire, TS sends `SIGTERM` to the Python process group.
- Python `ml_runner.runner` registers a `signal.SIGTERM` handler at the start of `run_training()`. The handler emits `cancelling` events (per second of grace window), performs graceful cleanup (flush partial logs, mark partial artifacts), writes a `.cancelled` marker file matching `cancelled.schema.v1.0.0.json`, emits one final `run_cancelled` event, and exits with non-zero status.
- TS waits up to **5 seconds** for graceful exit. If Python has not exited within 5s, TS sends `SIGKILL`. The 5s grace window is fixed in Phase 4; configurable in Phase 5+.
- During the grace window, the TS Bridge surfaces a "Cancelling… N s" affordance to the user using the `cancelling` event countdown (Q6 Mike refinement).

**State machine (cancel):**
```
running → user clicks cancel → TS fires CancellationToken
  → Python receives SIGTERM
    → emits cancelling{seconds_remaining: 5} immediately
    → emits cancelling{seconds_remaining: 4..0} per second
    → flushes partial state, writes .cancelled marker
    → emits run_cancelled{graceful: true}
    → exits non-zero
  TS reads .cancelled marker → UI status: "Cancelled (graceful)"

If Python has not emitted run_cancelled within 5s:
  TS sends SIGKILL → Python dies hard, no marker
  TS records cancel intent in run-manager state
  UI status: "Cancelled (forced)" — partial artifacts may exist on disk
```

#### 3.1.2 Recovery
Phase 4 introduces a `runforge.recoverIndex` command that walks `.ml/runs/`, re-reads each `run.json`, and re-appends to `.ml/outputs/index.json` any run that is missing from the index. Handles the case where Python wrote a run successfully but the index update failed (`.index-orphan` marker present from Stage C work).

**Contract:**
- Recovery is idempotent: repeated calls do NOT duplicate index entries (keyed on `run_id`).
- Recovery does NOT modify run.json or other artifacts; only the index is rebuilt.
- Recovery surfaces a structured report (count of orphans recovered, count already indexed, count skipped due to corrupt run.json).
- Cancelled runs (with `.cancelled` marker but no run.json) are NOT added to the index; they remain visible in the orphan picker.

### 3.2 Event stream

Phase 4 expands the F-PY-B004 foundation (single `run_start` event shipped in Stage C) to a full structured event stream.

**Contract:**
- Schema: `python/ml_runner/contracts/events.schema.v1.json` (FROZEN at v1.0.0 in Wave 0).
- Emission: Python emits one event per line as JSONL on stderr. Non-JSONL stderr is treated by TS Bridge as free-form log lines.
- Event types (9): `run_start`, `dataset_loaded`, `train_started`, `train_progress`, `train_finished`, `metrics_computed`, `artifacts_written`, `cancelling`, `run_cancelled`.
- Cardinality: `train_progress` is emitted **per epoch only** (Q4 Mike decision). Per-batch granularity is reserved for Phase 5+ streaming UI.
- Determinism: same run → same event sequence (timestamps may differ; event order is deterministic).
- Reader: TS Bridge validates each event against the schema. Malformed events are logged + dropped; never throw.

**Non-goals for Phase 4:** the event stream is consumed by VS Code progress notifications and the cancellation UI surface; it is NOT yet wired to a real-time chart/streaming-log UI (those require webview surfaces, Phase 5+).

### 3.3 CSV ingestion: error message hardening

Phase 4 extends F-PY-B003 (BOM strip, all-NaN-label, single-column validation) with **conservative explicit-error handling** for additional edge cases.

**Contract (Q5 Mike decision — conservative path):**
- Default delimiter: `,` (comma). Non-comma delimiters raise `ValueError` with actionable message (e.g., "CSV uses ';' delimiter; only ',' is supported. Convert with: pandas.read_csv(file, sep=';').to_csv(out, sep=',')").
- Default encoding: UTF-8. Non-UTF-8 encodings raise `UnicodeDecodeError` wrapped with actionable message ("CSV is not UTF-8. Re-save with UTF-8 encoding (Excel: Save As → CSV UTF-8).").
- BOM (UTF-8 with BOM) is stripped silently per F-PY-B003.
- All-NaN-label, single-column, non-numeric label, header-only CSV all raise specific actionable messages.
- **Phase 4 does NOT auto-detect delimiter or encoding.** Auto-detection is reserved for Phase 5+ if user demand emerges. Explicit error surface preserves the determinism doctrine and avoids silent corrections that mask data misalignment.

### 3.4 Extension Host smoke testing

Phase 4 introduces an Extension Host smoke test harness — the testing infrastructure that would have caught Marketplace v1.0.1's five production-CRITICAL bugs (F-COORD-003/004/008/010/011).

**Contract:**
- Tooling: `@vscode/test-cli` + `@vscode/test-electron` + Mocha.
- Configuration: `.vscode-test.js` at repo root, glob over `out/test/extension-host/**/*.test.js`.
- Fixture workspace: `test/fixtures/extension-host-workspace/` containing a minimal labeled CSV (Iris-style, 50 samples, 4 features, 1 label).
- Coverage gate: smoke MUST exercise the full call chain — extension activation → command dispatch → Python subprocess spawn → run.json appearance → observability read → markdown export. No mocking of subprocess or filesystem.
- Required smoke scenarios:
  1. `runforge.trainStandard` against fixture CSV produces valid run.json conforming to `run.schema.v0.3.6`.
  2. `runforge.openLatestRunSummary` renders markdown without throw.
  3. `runforge.exportLatestRunAsMarkdown` writes a readable markdown file.
  4. Cancel scenario: trigger trainStandard, fire cancel during training, verify `.cancelled` marker appears + `run_cancelled` event observed.
  5. Recover index scenario: pre-populate a `.ml/runs/<id>/run.json` without an index entry, fire `runforge.recoverIndex`, verify index now contains the entry.
- CI integration: smoke runs as a separate job in `ci.yml` (parallel to existing quality-gates), Linux only initially (Xvfb for headless), 120s timeout per test.

### 3.5 Doctrine enforcement (ESLint)

Phase 4 lands custom ESLint rules enforcing two of the seven `docs/CONTRACTS.md` doctrine rules:

- **Rule 2** (no literal duplicating named constant): rejects string literals that match exported constants in `src/types.ts` (`WORKSPACE_PATHS`, `ARTIFACT_FILENAMES` values). Implementation: post-build grep + AST check (vendor `@typescript-eslint/utils` or simple regex linter).
- **Rule 3** (no shadow types in consumer modules): rejects re-declared `interface` / `type` names that exist in `src/types.ts` and are imported but redeclared.

**Contract:**
- Rules ship as project-local ESLint plugin under `eslint-rules/` (or inline in `.eslintrc.json` with custom rule definitions).
- CI gates `npm run lint` to enforce; both rules error-level (not warn).
- Rules 1, 4, 5, 6, 7 of `docs/CONTRACTS.md` are NOT enforced by ESLint in Phase 4 (rule 4 is compiler-enforced; rules 1, 5, 6, 7 are non-trivial feasibility — Phase 5+ work).

## 4. Phase 4 explicit non-goals

These are NOT in Phase 4 scope. Each is explicitly Phase 5+ or backlog:

- New model families (XGBoost, LightGBM) — requires `run.schema.v0.4.0` enum amendment (Phase 5+, contract CON-PY-005)
- Regression training — requires preprocessing + new loss semantics + schema work (Phase 5+)
- Preprocessing extensions (one-hot, imputation, feature selection) — requires registry refactor + schema work (Phase 5+)
- Webview surfaces (interactive charts, filters, lineage views) — requires `TRUST_MODEL.md` amendment for new trust surface (Phase 5+, contract CON-BRIDGE-001)
- Run comparison view (multi-run summary) — requires multi-run-artifact contract (Phase 5+, contract CON-BRIDGE-002)
- Hyperparameter tuning / sweep — requires new spawn semantics + result aggregation (Phase 5+)
- SHAP / permutation importance — requires `feature_importance.v2` schema (Phase 5+, contract CON-PY-004)
- Resume from checkpoint — requires `run.schema.v0.4.0` checkpoints array (Phase 5+)
- run_id format unification (TS 4-segment vs Python 3-segment) — Phase 5+ hygiene per F-COORD-012
- model_factory registry refactor — current `if/elif` dispatch is canonical (Lens 2 prior-art finding); demoted from P0 to P2 backlog (Q2 Mike decision)
- Auto-detection of CSV delimiter or encoding — explicit errors preferred for Phase 4 (Q5 Mike decision)

## 5. Schema versions introduced or extended

Phase 4 introduces or extends the following schemas:

| Schema | Version | Status | Authoring wave |
|---|---|---|---|
| `events.schema.v1.json` | v1.0.0 | NEW (additive) | Wave 0 |
| `cancelled.schema.v1.0.0.json` | v1.0.0 | NEW (additive) | Wave 0 |
| `index-orphan.schema.v1.0.0.json` | v1.0.0 | shipped Stage C | (no change) |
| `run.schema.v0.3.6.json` | v0.3.6 | FROZEN | (no change) |
| `index.schema.v1.0.0.json` | v1.0.0 | FROZEN | (no change) |
| `metrics.schema.v1.json` | v1 | FROZEN | (no change) |
| `feature_importance.schema.v1.json` | v1 | FROZEN | (no change) |
| `linear_coefficients.schema.v1.json` | v1 | FROZEN | (no change) |
| `interpretability.index.schema.v1.json` | v1 | FROZEN | (no change) |

**No frozen schemas are amended in Phase 4.** All additions are new files conforming to the additive-only doctrine.

## 6. Determinism extension (Phase 4)

- Event emission ORDER is deterministic (same run → same event sequence). Event TIMESTAMPS naturally vary across re-runs.
- Cancellation does NOT affect re-run determinism: re-running an identical configuration after a cancel produces identical artifacts to a re-run after a successful run.
- CSV BOM stripping is deterministic (same file → same parsed shape every time).
- Recovery is deterministic: re-running `recoverIndex` against the same workspace state yields identical index.

## 7. Provenance extension (Phase 4)

- `.cancelled` marker file is appended to the run dir alongside any partial artifacts. The marker file is treated as a first-class provenance record (queryable via `runforge.browseRuns` orphan-and-cancelled overlay).
- `.events.jsonl` may optionally be persisted by Python alongside the live stderr stream (Phase 4 does not require persistence; Phase 5+ may add for offline replay).
- Recovery report is logged to the VS Code Output Channel for audit trail.

## 8. Backward compatibility

- All Phase 2 + Phase 3 runs remain readable and inspectable without migration.
- Phase 4 fields (cancellation marker, events file) are OPTIONAL when reading older runs.
- TS Bridge readers tolerate missing Phase 4 artifacts gracefully (no breakage).
- The `index-orphan` marker schema regex was relaxed in Stage C to accept both TS-style and Python-style run_ids; that backward compat carries forward.

## 9. Enforcement

- Extension Host smoke tests (§3.4) gate every Phase 4 release on full-journey correctness.
- Schema validation (Python `jsonschema.validate` + TS-side type guards) gates every artifact write.
- Custom ESLint rules (§3.5) gate every `npm run lint` (CI blocking).
- `npm run verify` continues to gate every commit (`npm test && npm run lint && npm run compile && vsce package`).
- Manual checks documented in `SHIP_GATE.md`.

## 10. Phase 4 entry condition (Wave 0 deliverables)

No Phase 4 feature code may ship until ALL of the following are true:

- [x] `CONTRACT-PHASE-4.md` (this document) authored, reviewed by Mike, and frozen.
- [x] `python/ml_runner/contracts/events.schema.v1.json` authored.
- [x] `python/ml_runner/contracts/cancelled.schema.v1.0.0.json` authored.
- [ ] Coordinator + Mike sign-off (Phase 6 review).
- [ ] Stage C completion debt cleared (commit `60b0cd0` on `swarm/dogfood`).
- [ ] CI green on `swarm/dogfood` after this commit.

After sign-off, Wave 1 dispatches: `FT-TEST-001` (Extension Host smoke), `FT-PY-008` (CSV error hardening), `FT-PY-010` (verify multi-class metrics), `FT-CIDOCS-004` (v1.0.1 deprecation comms).

## 11. Phase 4 deliverable checklist (post-Wave-0)

- [ ] **Wave 1** (4 parallel agents):
  - [ ] FT-TEST-001 Extension Host smoke harness with 5 smoke scenarios + CI integration
  - [ ] FT-PY-008 CSV error hardening (delimiter + encoding explicit errors per Q5)
  - [ ] FT-PY-010 Verify per-class multi-class metrics (likely no-op verify)
  - [ ] FT-CIDOCS-004 v1.0.1 deprecation: GitHub Discussion + Marketplace description note
- [ ] **Wave 2** (sequenced):
  - [ ] FT-PY-005 Full progress event emission (against `events.schema.v1.json`)
  - [ ] FT-PY-004 Python SIGTERM handler + `.cancelled` marker writer (against `cancelled.schema.v1.0.0.json`)
  - [ ] FT-BACK-001 TS cancel plumb (CancellationToken → SIGTERM → 5s grace → SIGKILL)
- [ ] **Wave 3** (4 parallel agents):
  - [ ] FT-BACK-002 `runforge.recoverIndex` command
  - [ ] FT-BACK-005 Workspace-trust guard for subprocess spawn
  - [ ] FT-BRIDGE-004a Extend orphan banner to all observability commands
  - [ ] FT-BRIDGE-009 Recover Index UI rendering
- [ ] **Wave 4** (4 parallel agents, gated on Wave 1 FT-TEST-001 landing):
  - [ ] FT-TEST-002 Snapshot tests for markdown render
  - [ ] FT-TEST-004 Subprocess boundary tests (orphan + artifact paths)
  - [ ] FT-CIDOCS-001 Custom ESLint rules (rules 2 + 3)
  - [ ] FT-CIDOCS-002 Handbook expansion for Phase 4 features
- [ ] **Phase 9 final test** — full `npm run verify` + pytest + Extension Host smoke + manual ship-gate audit
- [ ] **Phase 10 Full Treatment** — version bump v1.1.0 (or v1.0.2 if scope shrinks), shipcheck audit, translations resync (USER ONLY), repo-knowledge sync, Marketplace publish (USER ONLY)

## 12. Authority + change control

- This document is FROZEN once Phase 6 sign-off lands. Amendments require explicit Phase amendment doc (`CONTRACT-PHASE-4.X-AMENDMENT.md`) reviewed by Mike.
- The two schema files (`events.schema.v1.json`, `cancelled.schema.v1.0.0.json`) are FROZEN at v1.0.0 once this contract freezes. Bump to v1.1.x for additive payload fields; bump to v2 for breaking changes.
- The 4-wave sequencing is the recommended order; coordinator may parallelize within a wave but must not start a wave before the previous wave's gate (verify + smoke + per-wave critical/high triage) passes.
- Mike's 7 Phase 6 decisions (Q1–Q7) are authoritative and reflected throughout this document.
