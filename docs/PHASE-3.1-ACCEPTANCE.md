# Phase 3.1 — Acceptance Criteria

**Title:** Model Choice & Metadata
**Phase:** 3.1
**Prerequisite:** `CONTRACT-PHASE-3.md` finalized
**Status:** Pre-implementation acceptance criteria

---

## 1. Scope

Phase 3.1 introduces **explicit model selection** while preserving all Phase 2 and Phase 2.2 guarantees.

This phase is limited to:

- Selecting a model family
- Recording model choice in metadata

It explicitly does **not** introduce:

- Hyperparameter configuration
- Training profiles
- Expanded metrics
- Feature importance artifacts
- Regression tasks

---

## 2. Regression Gate (Hard Requirement)

All of the following must pass **unchanged**:

- Phase 2.1 tests (deterministic training)
- Phase 2.2.1 tests (metadata + provenance)
- Phase 2.2.2 tests (artifact inspection + diagnostics)
- Phase 2.3 tests (UX polish)

**No existing test may be modified to accommodate Phase 3.1.**

---

## 3. Supported Models (Exhaustive)

Phase 3.1 supports exactly three model families:

| Model Identifier      | sklearn Class            |
|-----------------------|--------------------------|
| `logistic_regression` | `LogisticRegression`     |
| `random_forest`       | `RandomForestClassifier` |
| `linear_svc`          | `LinearSVC`              |

No additional models may be introduced without a contract amendment.

---

## 4. Default Behavior (Backward Compatibility)

If the user does **not** specify a model:

- Training defaults to `logistic_regression`
- Behavior is identical to Phase 2 runs
- Output artifacts and metrics are unchanged

**Existing workflows must not break.**

---

## 5. Model Selection Interface

### 5.1 CLI Surface

Phase 3.1 introduces a single explicit selector:

```
--model <model_identifier>
```

Examples:

```
--model logistic_regression
--model random_forest
--model linear_svc
```

### Validation Rules

- Invalid identifiers fail fast
- Error messages list valid options
- Errors are actionable and non-generic

---

## 6. Preprocessing Rules

- Preprocessing remains fixed and unchanged from Phase 2
- All models are trained using the existing preprocessing pipeline
- Model-specific preprocessing is **forbidden** in Phase 3.1

---

## 7. Training Semantics (Unchanged)

The following must remain identical to Phase 2:

- Train/validation split (80/20 deterministic)
- Stratification behavior
- Missing-value handling
- Metrics calculation
- Artifact serialization (`model.pkl` as `sklearn.Pipeline`)

**Model choice must not alter these semantics.**

---

## 8. Metadata & Provenance

### 8.1 Required Metadata Additions

Run metadata must include:

```json
{
  "model_family": "logistic_regression | random_forest | linear_svc"
}
```

**Rules:**

- Field is mandatory for Phase 3.1 runs
- Field is optional when reading Phase 2 runs
- Field is included in provenance index entries (non-breaking)

---

## 9. Artifact Inspection Compatibility

Artifact inspection (`inspect-artifact`) must:

- Correctly identify the model step type
- Remain deterministic
- Require no changes to inspection schema

**Existing inspection tests must pass.**

---

## 10. Error Handling

Invalid model selection must:

- Fail **before** training starts
- Clearly state:
  - invalid value
  - list of valid identifiers
- Not produce partial artifacts or metadata

---

## 11. Tests (Mandatory)

Phase 3.1 must add tests covering:

- [ ] Default model behavior (no `--model` flag)
- [ ] Explicit selection of each supported model
- [ ] Invalid model identifier handling
- [ ] Metadata correctness (`model_family` recorded)
- [ ] Artifact inspection reflects selected model
- [ ] Regression gate enforcement (Phase 2 tests unchanged)

---

## 12. Documentation Updates

**Required updates:**

- README:
  - Document `--model` flag
  - List supported models
  - Reiterate default behavior
- No marketing language added

---

## 13. Out-of-Scope (Explicit)

Phase 3.1 does **not** include:

- Hyperparameter tuning
- Profiles
- Feature importance
- Regression
- Metrics expansion
- Model auto-selection

These are deferred to later Phase 3 subphases.

---

## 14. Phase 3.1 "Done" Definition

Phase 3.1 is complete when:

- [ ] Users can explicitly choose a model
- [ ] Existing workflows remain unchanged
- [ ] Model choice is recorded and inspectable
- [ ] All prior guarantees remain intact
- [ ] All tests pass
