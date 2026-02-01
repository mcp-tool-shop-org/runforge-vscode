# RunForge VS Code — Phase 3 Contract

**Title:** Controlled Capability Expansion

---

## Version

- **Contract Version:** 3.0.0
- **Effective From:** Phase 3 releases (post v0.2.3.0)
- **Relationship:** This contract **extends** `CONTRACT.md` (Phase 2).
  - `CONTRACT.md` remains authoritative for all Phase 2 behavior.
  - This document governs Phase 3 additions only.

---

## 1. Scope

This contract defines the rules for Phase 3 capability expansion, including:

- Model selection
- Hyperparameter declaration and recording
- Training profiles
- Expanded metrics
- Additional read-only artifacts

It does **not** govern:

- UI polish
- Performance optimizations
- Documentation layout
- Deployment or runtime environments

---

## 2. Inherited Phase 2 Guarantees (Frozen)

All guarantees from Phase 2 remain in force and unchanged, including:

- Deterministic training behavior
- Deterministic provenance
- Append-only run index
- Inspectability without retraining
- Stable meaning of `model.pkl` as a serialized `sklearn.Pipeline`
- Backward readability of all Phase 2 runs

**Breaking any Phase 2 guarantee is forbidden in Phase 3.**

---

## 3. Core Principle

> Phase 3 adds explicit user-directed power, not automation.

Nothing new happens unless the user asks for it.

---

## 4. Allowed Capability Expansions

### 4.1 Model Selection (Explicit)

**Phase 3.1 supported models (exhaustive):**

- `LogisticRegression` (default; unchanged from Phase 2)
- `RandomForestClassifier`
- `LinearSVC`

Additional models require a contract amendment.

**Allowed:**

- User explicitly selects a model family
- Default behavior remains `LogisticRegression` if no model is specified
- Model choice is recorded in run metadata

**Forbidden:**

- Automatic model selection
- Heuristic-based "best model" logic
- Silent model changes between versions

### 4.2 Hyperparameters (Declared and Recorded)

**Allowed:**

- User supplies hyperparameters explicitly
- Hyperparameters are:
  - validated
  - recorded in run metadata
  - inspectable post-run
  - part of provenance

**Forbidden:**

- Implicit tuning
- Auto-search (grid, random, Bayesian)
- Hyperparameters inferred from data
- Silent default changes without version bump

Invalid hyperparameters must fail fast with actionable errors.

### 4.3 Training Profiles (Named Aliases)

**Allowed:**

- Named profiles (e.g. `default`, `fast`, `thorough`)
- Profiles expand to explicit model + parameters
- Profiles are versioned and inspectable

**Profile versioning:**

- Explicit `profile_version` field (e.g. `"1.0"`)
- Optional integrity hash of expanded parameters

**Forbidden:**

- Profiles whose meaning changes silently
- Profiles that hide parameter choices

Profiles are aliases, not magic.

### 4.4 Expanded Metrics (Versioned)

**Allowed:**

- Introduction of a new metrics schema version (e.g. `v1`)
- Phase 2 metrics schema remains valid and unchanged
- Schema version explicitly recorded in metadata

**Forbidden:**

- Adding keys to the Phase 2 metrics schema
- Mixing schemas without version identifiers

Metrics are contracts.

### 4.5 Additional Artifacts (Read-only)

**Allowed:**

- Additional artifacts such as feature importance outputs
- Artifacts must be:
  - explicitly generated
  - stored as separate files
  - versioned with their own schemas
  - inspectable post-run

Example:

- `feature_importance.schema.v0.3.0.json`

**Forbidden:**

- Modifying the meaning of existing artifacts
- Overwriting `model.pkl` semantics

---

## 5. Determinism Rules

Given the same:

- Dataset
- Configuration
- RunForge version

Phase 3 runs must produce:

- Identical model artifacts
- Identical metrics
- Identical metadata and provenance

If determinism cannot be guaranteed, the feature is out of scope.

---

## 6. Provenance Requirements

All Phase 3 additions must:

- Appear in run metadata
- Be linked via `.runforge/index.json`
- Be traceable from artifact → run → dataset

Nothing may exist outside provenance.

---

## 7. Preprocessing Rules

- Preprocessing remains fixed and unchanged from Phase 2 (e.g. `StandardScaler`)
- Model-specific preprocessing is explicitly deferred to Phase 4

---

## 8. Task Scope Constraints

Phase 3 is limited to **classification only**.

**Out of scope for Phase 3:**

- Regression
- Online / incremental learning
- Distributed training
- AutoML
- Deployment
- Experiment dashboards

---

## 9. Backward Compatibility

- All Phase 2 runs remain readable and inspectable
- Phase 3 fields are optional when reading older runs
- No migration is required for Phase 2 data
- Backward-compatibility tests are mandatory

---

## 10. Schema Versioning Requirements

Phase 3 must introduce:

- A `run.json` schema version field for Phase 3 additions
- New artifact schemas (e.g. feature importance)
- Explicit schema version identifiers in outputs

Phase 2 schemas remain valid and untouched.

---

## 11. Enforcement

This contract is enforced by:

- Schema validation
- Golden tests
- Regression tests
- CI gating

Violations are regressions.

---

## 12. Phase 3 Entry Condition

No Phase 3 code may ship until:

- [ ] This contract is committed and finalized
- [ ] `PHASE-3.1-ACCEPTANCE.md` exists
- [ ] Schema versioning strategy is documented

---

## 13. Discipline Clause

> If a feature cannot be explained, reproduced, and inspected, it does not belong in Phase 3.

---

## Contract Status

This contract governs Phase 3 features only and does not replace Phase 2 contracts.
