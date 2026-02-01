# Phase 2.2 — Observability & Provenance (Whiteboard)

**Status:** Planning
**Prerequisite:** Phase 2.1 frozen at v0.2.1

---

## Phase Goal

Make Phase 2.1 visible, inspectable, and explainable
→ without changing training behavior, schemas, or artifacts.

## Core Principle

**Phase 2.2 adds information, not capability.**

No new ML power. No new magic.

---

## 1. Run Metadata Export

- Structured JSON output describing a completed run
- Separate from logs
- Deterministic, machine-readable

Possible contents (non-exhaustive, non-binding):

- Run ID
- Run timestamp
- Dataset fingerprint (hash)
- Label column name
- Feature count
- Sample count
- Dropped-row count
- Model artifact path
- Metrics snapshot

---

## 2. Artifact Inspection Commands

- Ability to inspect `model.pkl` without executing training
- Surface:
  - Pipeline steps
  - Preprocessing components
  - Model type
- Read-only by design

---

## 3. Dataset Schema Introspection

- Pre-run or dry-run inspection
- Identify:
  - Column names
  - Inferred feature types
  - Label column confirmation
- No mutation
- No auto-fixing

---

## 4. Provenance Chain (Local Only)

- Explicit mapping:
  - Input dataset → run → artifacts → metrics
- Human-readable and machine-readable
- No remote calls
- No signing (yet)

---

## 5. Diagnostics (Structured, Not Logs)

- Deterministic diagnostic records
- Examples:
  - Rows dropped (count + reason)
  - Label validation failures
  - Schema mismatches
- Diagnostics are data, not text blobs

---

## 6. CLI / VS Code Surface (Minimal)

Commands to:

- View last run summary
- Inspect artifacts
- Export metadata

No dashboards. No background services.

---

## 7. Contract Preservation Rules

Phase 2.2 must not:

- Change training semantics
- Change metrics schema
- Change artifact formats
- Introduce non-determinism
- Implicitly expand the Phase 2.1 contract

**Any violation = Phase 3, not 2.2.**

---

## 8. Explicit Non-Goals

- New model families
- Hyperparameter tuning
- Distributed or online training
- Auto-repair of datasets
- Cloud integration
- ML "recommendations"

---

## Phase 2.2 Success Criteria

Phase 2.2 is successful if a user can:

1. Explain what happened in a run
2. Prove where artifacts came from
3. Inspect outputs without rerunning training

…and nothing else changes.

---

## Phase Boundary Check

If Phase 2.2 starts to:

- Modify behavior → stop
- Add intelligence → stop
- Reduce transparency → stop

That's Phase 3 work.
