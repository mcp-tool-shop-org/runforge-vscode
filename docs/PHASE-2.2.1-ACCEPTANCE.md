# Phase 2.2.1 — Observability Baseline (Acceptance Definition)

**Theme:** Make Phase 2.1 runs explainable after the fact
**Rule:** Zero changes to training behavior, artifacts, or metrics

---

## 1. Run Metadata (Primary Deliverable)

### Acceptance Criteria

A completed training run must produce a structured metadata record that:

- Is machine-readable (JSON)
- Is deterministic given identical inputs
- Exists independently of logs
- Is written locally alongside other run outputs

### Required Fields (Minimum Set)

The metadata must include:

| Field | Description |
|-------|-------------|
| `run_id` | Stable identifier or timestamp-based ID |
| `runforge_version` | Version of RunForge that produced this run |
| `dataset_fingerprint` | Documented deterministic hash |
| `label_column` | Name of the label column used |
| `num_samples` | Number of samples after dropping missing |
| `num_features` | Number of feature columns |
| `dropped_rows_missing_values` | Count of rows dropped |
| `metrics` | Must embed exactly `{accuracy, num_samples, num_features}` |
| `artifacts` | Reference to `model.pkl` (path or logical ID) |

### Acceptance Test

Same dataset + config + version → byte-identical metadata JSON (or canonical JSON equivalent)

---

## 2. Dataset Inspection (Pre-run)

### Acceptance Criteria

Provide a dataset inspection capability that:

- Runs without training
- Does not modify data
- Does not guess or infer labels

### Required Outputs

Inspection must surface:

- Column names
- Total row count
- Feature count (excluding label)
- Confirmation that the specified label column exists

### Failure Behavior

Missing label column → hard failure with:

- Expected label name
- List of available columns

---

## 3. Provenance Linkage (Local, Minimal)

### Acceptance Criteria

For each run, the system must record a traceable linkage between:

- Dataset fingerprint
- Run metadata
- Generated artifacts

This linkage must be:

- Local-only
- Deterministic
- Human-auditable (single file or obvious file grouping)

### Acceptance Test

Given a `model.pkl`, a user can:

1. Locate the run metadata
2. See the dataset fingerprint that produced it

No cryptographic signing required in 2.2.1.

---

## 4. Structured Diagnostics (Baseline)

### Acceptance Criteria

Certain behaviors must be recorded as structured data, not just logs.

### Required Diagnostics

- Number of rows dropped due to missing values
- Label validation failures (when applicable)

Diagnostics must be:

- Machine-readable
- Deterministic
- Included in or referenced by run metadata

---

## 5. Minimal UX Surface (Just Enough)

### Acceptance Criteria

Expose the following actions via CLI and/or VS Code commands:

- Inspect dataset
- Run training
- Open or export run metadata

### Constraints

- No dashboards
- No background services
- No persistent daemons

---

## 6. Tests (2.2.1 Gate)

### Required Tests

- Golden test proving metadata determinism
- Test asserting metrics schema remains unchanged
- Test asserting dropped-row count matches metadata
- Test asserting provenance linkage exists and is navigable

### Non-negotiable

All Phase 2.1 tests must pass unchanged.

---

## 7. Explicit Non-Goals (Reinforced)

Phase 2.2.1 does **not** include:

- Artifact inspection (pipeline introspection)
- Model internals exposure
- Dataset auto-fixing
- Any UI beyond commands
- Any schema changes

Those belong to 2.2.2+.

---

## Phase 2.2.1 "Done" Definition

Phase 2.2.1 is complete when:

1. A user can explain what happened in a run without rerunning it
2. A user can trace where artifacts came from
3. Phase 2.1 guarantees remain untouched
4. No new ML capability has been added

---

## Checklist

- [ ] Run metadata JSON produced with all required fields
- [ ] Metadata is deterministic (golden test passes)
- [ ] Dataset inspection command works
- [ ] Provenance linkage is traceable
- [ ] Structured diagnostics recorded
- [ ] VS Code/CLI commands exposed
- [ ] All Phase 2.1 tests pass unchanged
- [ ] All Phase 2.2.1 tests pass
