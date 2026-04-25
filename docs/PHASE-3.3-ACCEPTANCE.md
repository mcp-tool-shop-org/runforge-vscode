# Phase 3.3 — Acceptance Criteria

**Title:** Model-Aware Metrics (metrics.v1)
**Phase:** 3.3
**Prerequisite:** Phase 3.2 complete and released
**Status:** Pre-implementation acceptance criteria

---

## 1. Scope

Phase 3.3 introduces a **versioned, expanded metrics schema (`metrics.v1.json`)** for classification while preserving Phase 2 metrics output unchanged.

This phase is limited to:

- Defining a new metrics schema version (`metrics.v1`)
- Recording per-class metrics
- Recording confusion matrix
- Recording probability-aware metrics where supported
- Surfacing `metrics_profile` in run metadata

It explicitly does **not** introduce:

- Feature importance artifacts (Phase 3.4)
- Linear coefficient artifacts (Phase 3.5)
- Interpretability index (Phase 3.6)
- Regression metrics
- New model families

---

## 2. Regression Gate (Hard Requirement)

All of the following must pass **unchanged**:

- Phase 2.1 tests (deterministic training)
- Phase 2.2.1 tests (metadata + provenance)
- Phase 2.2.2 tests (artifact inspection + diagnostics)
- Phase 2.3 tests (UX polish)
- Phase 3.1 tests (model choice + metadata)
- Phase 3.2 tests (hyperparameters + profiles)

**No existing test may be modified to accommodate Phase 3.3.**
**Phase 2 `metrics.json` schema is frozen and may not change.**

---

## 3. New Artifact: `metrics.v1.json`

Phase 3.3 introduces a new metrics artifact alongside the existing Phase 2 `metrics.json`:

```
.runforge/runs/<run-id>/
    ├── metrics.json          ← Phase 2 (UNCHANGED)
    └── metrics.v1.json       ← Phase 3.3 (NEW, schema-versioned)
```

**Rules:**

- `metrics.json` continues to contain Phase 2 keys exactly as before
- `metrics.v1.json` is additive, never replacing
- Both files coexist for every Phase 3.3+ run

---

## 4. Schema: `metrics.v1`

### 4.1 Required Top-Level Fields

```json
{
  "schema_version": "metrics.v1",
  "metrics_profile": "<profile_identifier>",
  "metrics": { ... }
}
```

### 4.2 Profile: `classification.proba.v1`

For models that produce calibrated probabilities (e.g. `LogisticRegression`, `RandomForestClassifier`), `metrics.v1` must include:

- `accuracy`
- `precision_macro`, `recall_macro`, `f1_macro`
- `precision_per_class`, `recall_per_class`, `f1_per_class`
- `confusion_matrix` (row-major, label order documented)
- `support_per_class`
- `roc_auc` (binary or one-vs-rest where applicable)
- `log_loss`

### 4.3 Profile: `classification.margin.v1`

For models without probability outputs (e.g. `LinearSVC`), `metrics.v1` must include the same per-class block **except**:

- `roc_auc` may be omitted or computed from decision function
- `log_loss` is omitted

**Profile choice is determined by model capability, not user input.**

---

## 5. Run Metadata Updates

`run.json` must include a pointer to the new metrics artifact:

```json
{
  "metrics_v1": {
    "schema_version": "metrics.v1",
    "metrics_profile": "classification.proba.v1",
    "artifact_path": "metrics.v1.json"
  },
  "artifacts": {
    "model_pkl": "artifacts/model.pkl",
    "metrics_v1_json": "metrics.v1.json"
  }
}
```

---

## 6. Determinism Rules

- All metrics must be deterministic given identical dataset + config + version
- Confusion matrix label ordering must be stable (sorted ascending)
- Floating point values rounded consistently across runs

---

## 7. Backward Compatibility

- Phase 2 runs (no `metrics.v1.json`) remain readable
- Reader code must treat `metrics.v1.json` as optional
- No migration of older runs is required

---

## 8. Tests (Mandatory)

Phase 3.3 must add tests covering:

- [ ] `metrics.v1.json` file written for every Phase 3.3+ run
- [ ] Schema version present and correct
- [ ] `classification.proba.v1` profile selection for probability models
- [ ] `classification.margin.v1` profile selection for margin-only models
- [ ] Confusion matrix row/column ordering
- [ ] Per-class fields present and correct
- [ ] Phase 2 `metrics.json` unchanged
- [ ] Reader handles missing `metrics.v1.json` (Phase 2 runs)
- [ ] Regression gate enforcement

---

## 9. Documentation Updates

- README documents the new artifact and its location
- `docs/TRUST_MODEL.md` notes the additive metrics file
- No marketing language

---

## 10. Out-of-Scope (Explicit)

- Regression metrics
- Calibration plots
- ROC curve serialization
- Per-fold cross-validation metrics
- Feature-level metrics (deferred to 3.4+)

---

## 11. Phase 3.3 "Done" Definition

Phase 3.3 is complete when:

- [ ] Every classification run produces `metrics.v1.json`
- [ ] Schema version and profile are recorded
- [ ] Phase 2 metrics output is unchanged
- [ ] All prior guarantees remain intact
- [ ] All tests pass

---

## Next Step After Phase 3.3

Define Phase 3.4 acceptance criteria (feature importance artifact).
