# Phase 2.2.2 — Artifact Introspection & Diagnostics Expansion

**Status:** Acceptance Criteria (pre-implementation)
**Prerequisite:** Phase 2.2.1 released (v0.2.2.1)
**Non-negotiable:** Phase 2.1 contract remains frozen

---

## Phase Goal

Enable read-only inspection of training artifacts and richer diagnostics so users can answer:

> "What exactly did this model contain, and why did this run behave the way it did?"

No training behavior, metrics, or artifacts may change.

---

## A. Contract Preservation Gate (Hard Block)

Phase 2.2.2 must **not**:

- Change training semantics
- Change train/validation split behavior
- Change stratification behavior
- Change missing-value handling
- Change metrics schema (must remain exactly 3 keys)
- Change artifact formats (`model.pkl` remains a serialized `sklearn.Pipeline`)
- Introduce non-determinism

### Acceptance

- All Phase 2.1 and Phase 2.2.1 tests pass unchanged
- No edits to `CONTRACT.md`

---

## B. Artifact / Pipeline Inspection (Primary Deliverable)

### Acceptance Criteria

Provide a read-only inspection capability for `model.pkl` that:

- Loads the artifact without retraining
- Does not mutate the artifact
- Does not require dataset access
- Does not depend on training logs

### Required Inspection Output (Structured)

Inspection must surface, at minimum:

- Ordered pipeline steps
- For each step:
  - `step name`
  - `class/type`
- Explicit indication of preprocessing steps (e.g. scaler present)

Example (conceptual):

```json
{
  "schema_version": "0.2.2.2",
  "artifact_path": "model.pkl",
  "pipeline_steps": [
    {"name": "scaler", "type": "StandardScaler"},
    {"name": "clf", "type": "LogisticRegression"}
  ]
}
```

### Acceptance Test

- Given a known `model.pkl`, inspection output matches a golden JSON file
- Output is deterministic and schema-validated

---

## C. Artifact Inspection Schema

### Acceptance Criteria

- Define and freeze a schema: `pipeline.inspect.schema.v0.2.2.2.json`
- Inspection output must validate against the schema
- Schema version must be embedded in the output

---

## D. Diagnostics Expansion (Structured, Deterministic)

### Acceptance Criteria

Expand diagnostics beyond 2.2.1 baseline, while remaining structured.

### Required Diagnostic Categories

| Category | Codes |
|----------|-------|
| Missing Data | `MISSING_VALUES_DROPPED` (existing, must remain stable) |
| Label Validation | `LABEL_NOT_FOUND`, `LABEL_TYPE_INVALID` |
| Dataset Shape | `ZERO_ROWS`, `ZERO_FEATURES`, `LABEL_ONLY_DATASET` |

Diagnostics must be:

- Structured JSON records
- Deterministic
- Included in or referenced by `run.json`

### Acceptance Test

- Each diagnostic type is exercised by a test fixture
- Diagnostics are machine-readable (no log parsing)

---

## E. Provenance Compatibility (No Schema Breaks)

### Acceptance Criteria

- Artifact inspection results must be linkable to:
  - run metadata
  - dataset fingerprint
- No changes to `.runforge/index.json` schema that break 2.2.1 readers
- Optional: add backward-compatible fields only

---

## F. UX Surface (Minimal, Read-Only)

### Acceptance Criteria

Add commands:

| Command | Description |
|---------|-------------|
| `RunForge: Inspect Model Artifact` | Opens structured inspection output |
| `RunForge: View Run Diagnostics` (optional) | View diagnostics from latest run |

### Constraints

- No dashboards
- No background services
- No automatic inspection on run (user-initiated only)

---

## G. Tests (2.2.2 Gate)

### Required Tests

| Test Type | Description |
|-----------|-------------|
| Golden artifact inspection | Same artifact → byte-identical inspection JSON |
| Schema enforcement | Inspection output validates against schema |
| Diagnostic coverage | Each diagnostic type has a test |
| Regression gate | Phase 2.1 + 2.2.1 tests pass unchanged |

---

## H. Documentation

### Acceptance Criteria

- Add `docs/PHASE-2.2.2-ACCEPTANCE.md` (this file)
- Update README:
  - Mention artifact inspection as available
  - Reiterate Phase 2.1 contract stability
- No marketing language added

---

## Explicit Non-Goals (Hard No)

Phase 2.2.2 does **not** include:

- Model parameter introspection
- Weight inspection
- Hyperparameter tuning visibility
- Feature importance
- Training replays
- Any form of mutation or "repair"

Those belong to Phase 3+.

---

## Phase 2.2.2 "Done" Definition

Phase 2.2.2 is complete when:

1. A user can inspect what is inside `model.pkl`
2. A user can programmatically understand why a run behaved the way it did
3. All observability is read-only
4. Phase 2.1 guarantees remain intact and enforceable

---

## Suggested Internal Milestones (Optional)

| Milestone | Scope |
|-----------|-------|
| 2.2.2.A | Artifact inspection + schema + golden tests |
| 2.2.2.B | Diagnostics expansion + tests |

---

## Closing Note

With 2.2.2, you'll have:

| Capability | Phase |
|------------|-------|
| Deterministic training | 2.1 |
| Deterministic observability | 2.2.1 |
| Deterministic introspection | 2.2.2 |

That's the full triangle. After this, Phase 3 can safely add power without sacrificing trust.
