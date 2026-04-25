# Phase 3.6 — Acceptance Criteria

**Title:** Interpretability Index (`interpretability.index.v1`)
**Phase:** 3.6
**Prerequisite:** Phase 3.5 complete and released
**Status:** Pre-implementation acceptance criteria

---

## 1. Scope

Phase 3.6 introduces a **unified, read-only index** that points at every interpretability artifact produced by a run, so consumers can discover what is available without scanning the run directory.

This phase is limited to:

- Writing `interpretability.index.v1.json` per run
- Listing the model family
- Listing each interpretability artifact produced (Phase 3.4 / 3.5) with its schema version and path
- Recording an explicit "no interpretability available" state when no artifacts apply

It explicitly does **not** introduce:

- New interpretability methods
- Cross-artifact normalization
- Aggregated importance rankings
- Visualizations

---

## 2. Regression Gate (Hard Requirement)

All of the following must pass **unchanged**:

- Phase 2.1, 2.2.1, 2.2.2, 2.3 tests
- Phase 3.1, 3.2, 3.3, 3.4, 3.5 tests

**No existing test may be modified to accommodate Phase 3.6.**

---

## 3. Artifact: `interpretability.index.v1.json`

```
.runforge/runs/<run-id>/artifacts/
    └── interpretability.index.v1.json
```

### 3.1 Required Top-Level Fields

```json
{
  "schema_version": "interpretability.index.v1",
  "model_family": "logistic_regression | random_forest | linear_svc",
  "available": true,
  "artifacts": [
    {
      "kind": "feature_importance | linear_coefficients",
      "schema_version": "feature_importance.v1 | linear_coefficients.v1",
      "path": "artifacts/<filename>"
    }
  ]
}
```

### 3.2 No-Interpretability Case

When the model family supports no Phase 3.4 / 3.5 artifact, the index must still be written:

```json
{
  "schema_version": "interpretability.index.v1",
  "model_family": "<model>",
  "available": false,
  "artifacts": []
}
```

This ensures consumers always find the index file and never need to probe by file existence.

---

## 4. Per-Model Expected Contents

| Model Family          | `available` | Artifacts in Index                          |
|-----------------------|-------------|---------------------------------------------|
| `random_forest`       | `true`      | `feature_importance.v1`                     |
| `logistic_regression` | `true`      | `linear_coefficients.v1`                    |
| `linear_svc`          | `true`      | `linear_coefficients.v1`                    |

If a future model family is added without an interpretability artifact, `available: false` is the contract-correct response — not an error.

---

## 5. Determinism Rules

- `artifacts` array ordered by `kind` ascending
- Index is regenerated from scratch each run (never appended)
- File path uses forward slashes regardless of OS

---

## 6. Run Metadata Updates

`run.json` must include:

```json
{
  "artifacts": {
    "interpretability_index_v1_json": "artifacts/interpretability.index.v1.json"
  }
}
```

The pointer is **always** present in Phase 3.6+ runs (the index is mandatory, even when empty).

---

## 7. Inspectability

The CLI / VS Code command surface must support reading the index:

- Command: `View Latest Interpretability Index`
- Output: human-readable summary listing each linked artifact
- Behavior on `available: false`: clear message stating no interpretability artifacts apply for the chosen model

---

## 8. Tests (Mandatory)

Phase 3.6 must add tests covering:

- [ ] Index file written for every Phase 3.6+ run
- [ ] Schema version correct
- [ ] `available: true` when at least one artifact exists
- [ ] `available: false` when no artifact applies (must still write file)
- [ ] Per-model expected artifacts (table in §4)
- [ ] `artifacts` paths exist on disk and load without error
- [ ] Run metadata pointer always present
- [ ] Sort order deterministic
- [ ] Regression gate enforcement

---

## 9. Documentation Updates

- README documents the unified index and the `available` flag
- `docs/TRUST_MODEL.md` references the index as the canonical entry point for interpretability
- No marketing language

---

## 10. Out-of-Scope (Explicit)

- Combining importance and coefficients into a single ranked view
- New interpretability methods
- Time-series of importance across runs
- UI visualization of artifacts

---

## 11. Phase 3.6 "Done" Definition

Phase 3.6 is complete when:

- [ ] Every Phase 3.6+ run writes `interpretability.index.v1.json`
- [ ] Index correctly reflects the artifacts produced
- [ ] No-interpretability case writes `available: false` and an empty array
- [ ] Run metadata always points at the index
- [ ] All prior guarantees remain intact
- [ ] All tests pass

---

## Phase 3 Complete

Phase 3.6 closes the Phase 3 contract. Future capability expansion (e.g. regression, model-specific preprocessing, calibration) requires a new contract document under Phase 4.
