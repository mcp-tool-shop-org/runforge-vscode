# RunForge VS Code — Contract

**Version:** Phase 2.1
**Applies From:** v0.2.1
**Status:** Frozen
**Last Updated:** v0.2.1 release

This document defines the behavioral and artifact contract for RunForge VS Code starting at Phase 2.1.
Anything described here is considered stable and relied upon by users.

**Breaking any guarantee in this document requires a major version bump.**

---

## 1. Scope

This contract governs:

- Dataset handling
- Training execution semantics
- Metrics output
- Generated artifacts
- Determinism guarantees
- Source-of-truth boundaries

It does not define UI behavior or future feature intent.

---

## 2. Determinism

Given the same:

- Input dataset
- Configuration
- RunForge VS Code version

RunForge must produce:

- Identical train/validation splits
- Identical model artifacts
- Identical metrics outputs

No non-deterministic behavior is permitted outside explicitly seeded operations.

---

## 3. Label Semantics

- The label column must be explicitly specified
- The label column must not be inferred by position
- Training must fail early if the label column is missing or invalid

Implicit label inference is forbidden.

---

## 4. Train / Validation Split

- Split ratio: 80% train / 20% validation
- Split is deterministic
- Classification tasks must use stratified sampling

Any change to split behavior is a breaking change.

---

## 5. Metrics Contract

Training outputs exactly the following metrics:

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

Rules:

- No additional keys may be added implicitly
- No keys may be removed or renamed
- Schema expansion requires a versioned contract update

---

## 6. Model Artifact Contract

- `model.pkl` must be a serialized `sklearn.Pipeline`
- All preprocessing (e.g. `StandardScaler`) must be embedded
- The artifact must be inference-ready when loaded

External preprocessing dependencies are forbidden.

---

## 7. Missing Data Handling

- Rows containing missing values must be dropped
- Dropping behavior must be deterministic
- The number of dropped rows must be logged

Silent imputation is forbidden.

---

## 8. Source of Truth

- Python execution logic lives exclusively in `python/ml_runner/`
- No duplicated or shadow implementations are permitted
- Tests enforce parity between Python and TypeScript behavior

---

## 9. Stability Rules

- Behavior at v0.2.1 is frozen
- Silent behavioral changes are considered bugs
- Breaking changes require:
  - Explicit documentation
  - Major version bump
  - Contract update

---

## 10. Non-Goals (Explicit)

The following are out of scope for Phase 2.1:

- Automatic model selection
- Hyperparameter tuning
- Online or incremental training
- Heuristic-driven or opaque behavior

Correctness and transparency take priority over automation.

---

## 11. Enforcement

This contract is enforced by:

- TypeScript test suite
- Python test suite
- Artifact inspection

Failure to uphold this contract is considered a regression.

---

## Contract Status

Phase 2.1 is complete and frozen as of v0.2.1.

Future phases must not weaken or implicitly alter the guarantees defined here.
