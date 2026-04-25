# Phase 3.4 — Acceptance Criteria

**Title:** Feature Importance Artifact (`feature_importance.v1`)
**Phase:** 3.4
**Prerequisite:** Phase 3.3 complete and released
**Status:** Pre-implementation acceptance criteria

---

## 1. Scope

Phase 3.4 introduces a **read-only, model-aware feature importance artifact** for models that expose native importance signals.

This phase is limited to:

- Extracting feature importance from supported models
- Writing a versioned artifact (`feature_importance.v1.json`)
- Recording the artifact path in run metadata
- Surfacing per-feature importance values in a deterministic order

It explicitly does **not** introduce:

- Permutation importance
- SHAP values
- Cross-model importance comparison
- Linear coefficient extraction (Phase 3.5)
- Interpretability index (Phase 3.6)

---

## 2. Regression Gate (Hard Requirement)

All of the following must pass **unchanged**:

- Phase 2.1, 2.2.1, 2.2.2, 2.3 tests
- Phase 3.1, 3.2, 3.3 tests

**No existing test may be modified to accommodate Phase 3.4.**

---

## 3. Supported Models (Exhaustive)

| Model                    | Importance Source         | Supported |
|--------------------------|---------------------------|-----------|
| `RandomForestClassifier` | `feature_importances_`    | YES       |
| `LogisticRegression`     | (use Phase 3.5 instead)   | NO        |
| `LinearSVC`              | (use Phase 3.5 instead)   | NO        |

**Phase 3.4 is RandomForest-only.** Other native-importance models require contract amendment.

---

## 4. Artifact: `feature_importance.v1.json`

```
.runforge/runs/<run-id>/artifacts/
    └── feature_importance.v1.json
```

### 4.1 Required Top-Level Fields

```json
{
  "schema_version": "feature_importance.v1",
  "model_family": "random_forest",
  "importance_type": "gini",
  "n_features": <int>,
  "features": [
    { "name": "<feature_name>", "importance": <float>, "rank": <int> }
  ]
}
```

### 4.2 Determinism Rules

- `features` array sorted by `importance` descending
- Ties broken by feature name ascending (stable ordering)
- Float precision documented and consistent
- `rank` is 1-indexed

---

## 5. Generation Rules

- Artifact is written **only** for supported models
- For unsupported models, no artifact is produced and no error is raised
- Reader code must treat the artifact as optional

---

## 6. Run Metadata Updates

When the artifact is produced, `run.json` must include:

```json
{
  "artifacts": {
    "feature_importance_v1_json": "artifacts/feature_importance.v1.json"
  }
}
```

When the artifact is **not** produced (unsupported model), the field is omitted entirely (not null, not "none").

---

## 7. Inspectability

The CLI / VS Code command surface must support reading the artifact:

- Command: `View Latest Feature Importance`
- Output: human-readable ranked list
- Behavior on unsupported model: clear message, no error

---

## 8. Tests (Mandatory)

Phase 3.4 must add tests covering:

- [ ] Artifact written for `random_forest` runs
- [ ] Artifact NOT written for `logistic_regression` / `linear_svc`
- [ ] Schema version correct
- [ ] Sort order deterministic (importance desc, name asc)
- [ ] `n_features` matches `features.length`
- [ ] `rank` is 1-indexed and contiguous
- [ ] Run metadata pointer present iff artifact exists
- [ ] Phase 2 + Phase 3.1/3.2/3.3 tests unchanged
- [ ] Regression gate enforcement

---

## 9. Documentation Updates

- README documents the artifact and the supported-model matrix
- No marketing language

---

## 10. Out-of-Scope (Explicit)

- Permutation importance
- SHAP / LIME / model-agnostic methods
- Feature interaction
- Per-class importance for multiclass

---

## 11. Phase 3.4 "Done" Definition

Phase 3.4 is complete when:

- [ ] RandomForest runs produce `feature_importance.v1.json`
- [ ] Other models do not produce the artifact and do not error
- [ ] Artifact is deterministic and inspectable
- [ ] All prior guarantees remain intact
- [ ] All tests pass

---

## Next Step After Phase 3.4

Define Phase 3.5 acceptance criteria (linear coefficient artifact).
