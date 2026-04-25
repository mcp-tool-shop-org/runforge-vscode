# Phase 3.5 — Acceptance Criteria

**Title:** Linear Coefficients Artifact (`linear_coefficients.v1`)
**Phase:** 3.5
**Prerequisite:** Phase 3.4 complete and released
**Status:** Pre-implementation acceptance criteria

---

## 1. Scope

Phase 3.5 introduces a **read-only, model-aware linear coefficients artifact** for linear models, complementing Phase 3.4's RandomForest-only feature importance.

This phase is limited to:

- Extracting fitted coefficients and intercept from linear models
- Writing a versioned artifact (`linear_coefficients.v1.json`)
- Recording the artifact path in run metadata
- Surfacing per-feature coefficients in a deterministic order

It explicitly does **not** introduce:

- Standardized / normalized coefficients
- Confidence intervals
- p-values or significance tests
- Feature ranking semantics shared with Phase 3.4

---

## 2. Regression Gate (Hard Requirement)

All of the following must pass **unchanged**:

- Phase 2.1, 2.2.1, 2.2.2, 2.3 tests
- Phase 3.1, 3.2, 3.3, 3.4 tests

**No existing test may be modified to accommodate Phase 3.5.**

---

## 3. Supported Models (Exhaustive)

| Model                    | Coefficient Source | Supported |
|--------------------------|--------------------|-----------|
| `LogisticRegression`     | `coef_`, `intercept_` | YES   |
| `LinearSVC`              | `coef_`, `intercept_` | YES   |
| `RandomForestClassifier` | (use Phase 3.4 instead) | NO  |

---

## 4. Artifact: `linear_coefficients.v1.json`

```
.runforge/runs/<run-id>/artifacts/
    └── linear_coefficients.v1.json
```

### 4.1 Required Top-Level Fields

```json
{
  "schema_version": "linear_coefficients.v1",
  "model_family": "logistic_regression | linear_svc",
  "n_features": <int>,
  "n_classes": <int>,
  "intercept": [<float>, ...],
  "classes": ["<class_label>", ...],
  "coefficients": [
    {
      "name": "<feature_name>",
      "values": [<float per class>, ...]
    }
  ]
}
```

### 4.2 Binary vs Multiclass

- Binary classification: `intercept.length == 1`, each `coefficients[i].values.length == 1`
- Multiclass (one-vs-rest): `intercept.length == n_classes`, each row has `n_classes` values
- Class label ordering is sorted ascending and matches `classes`

### 4.3 Determinism Rules

- `coefficients` array ordered by feature index (matches preprocessing pipeline output)
- Class label ordering is stable across runs
- Float precision consistent

---

## 5. Generation Rules

- Artifact is written **only** for supported linear models
- For unsupported models, no artifact is produced and no error is raised
- Reader code must treat the artifact as optional

---

## 6. Run Metadata Updates

When produced, `run.json` must include:

```json
{
  "artifacts": {
    "linear_coefficients_v1_json": "artifacts/linear_coefficients.v1.json"
  }
}
```

Field is omitted entirely when artifact is not produced.

---

## 7. Interpretation Notes (Documentation Only)

The artifact preserves raw `coef_` values from the underlying sklearn estimator. Because Phase 2/3 preprocessing applies `StandardScaler`, coefficients are on the standardized feature scale. Documentation must state this explicitly to avoid misinterpretation.

**No standardization metadata transformation is performed by RunForge.** Interpretation is the consumer's responsibility.

---

## 8. Tests (Mandatory)

Phase 3.5 must add tests covering:

- [ ] Artifact written for `logistic_regression` and `linear_svc` runs
- [ ] Artifact NOT written for `random_forest`
- [ ] Schema version correct
- [ ] Binary vs multiclass shape correctness
- [ ] Class label ordering sorted and consistent with `coefficients` rows
- [ ] `n_features` and `n_classes` match shapes
- [ ] Run metadata pointer present iff artifact exists
- [ ] Determinism across re-runs
- [ ] Regression gate enforcement

---

## 9. Documentation Updates

- README documents the artifact and the supported-model matrix
- README documents the standardized-feature-scale caveat
- No marketing language

---

## 10. Out-of-Scope (Explicit)

- Standardized / unstandardized transforms
- p-values, t-stats, confidence intervals
- Coefficient stability across resamples
- Regularization-path visualization

---

## 11. Phase 3.5 "Done" Definition

Phase 3.5 is complete when:

- [ ] Linear-model runs produce `linear_coefficients.v1.json`
- [ ] Non-linear runs do not produce the artifact and do not error
- [ ] Binary and multiclass shapes are correct and tested
- [ ] All prior guarantees remain intact
- [ ] All tests pass

---

## Next Step After Phase 3.5

Define Phase 3.6 acceptance criteria (interpretability index — unified pointer).
