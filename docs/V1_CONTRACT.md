# RunForge v1 Contract (Run Request + Run Store)

This document is the shared contract between RunForge clients (VS Code extension, Desktop app, CLI).
If behavior deviates from this contract, update this doc and add an ADR.

---

## 1) Canonical Run Store Layout

Workspace contains a hidden RunForge store:

```
<workspace>/
  .runforge/
    index.json                    # Append-only provenance index
    runs/
      <run-id>/
        request.json              # What the run was configured to do (v1)
        run.json                  # What actually happened (result metadata)
        metrics.json              # Phase 2 metrics (3 keys)
        metrics.v1.json           # Phase 3 detailed metrics
        artifacts/
          model.pkl               # Trained pipeline
          feature_importance.v1.json
          linear_coefficients.v1.json
          interpretability.index.v1.json
        logs/                     # (future) training logs
```

Notes:
- `<run-id>` is a unique, immutable identifier (format: `YYYYMMDD-HHMMSS-<shortHash>`).
- `index.json` is append-only and may be rebuilt by scanning `.runforge/runs/`.
- `request.json` is written BEFORE training starts.
- `run.json` is written AFTER training completes.

---

## 2) Run Request File

**Location:** `.runforge/runs/<run-id>/request.json`

**Purpose:** Single source of truth for what a run was configured to do.
Written before training starts. Immutable after creation (except for user edits before rerun).

### Schema identity
- `version` is the schema major version (integer).
- New optional fields MAY be added without bumping `version`.
- Breaking changes require bumping `version`.

### Required forward compatibility rules
- Clients MUST ignore unknown fields when reading.
- Clients MUST preserve unknown fields when loading and re-saving `request.json`.
- This enables newer VS Code to write fields that older Desktop can still display.

---

## 3) Run Request Schema (version = 1)

```json
{
  "$schema": "https://runforge.dev/schemas/request.v1.json",
  "version": 1,

  "preset": "balanced",

  "dataset": {
    "path": "data/iris.csv",
    "label_column": "species"
  },

  "model": {
    "family": "logistic_regression",
    "hyperparameters": {}
  },

  "device": {
    "type": "cpu",
    "gpu_reason": null
  },

  "created_at": "2026-02-01T12:00:00Z",
  "created_by": "runforge-vscode@0.3.6",

  "rerun_from": null,
  "name": null,
  "tags": [],
  "notes": null
}
```

### Field definitions (v1)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | optional | Schema URL for validation |
| `version` | int | **required** | Schema major version (currently 1) |
| `preset` | string | **required** | `fast` \| `balanced` \| `thorough` \| `custom` |
| `dataset.path` | string | **required** | Workspace-relative path to dataset |
| `dataset.label_column` | string | **required** | Name of label column |
| `model.family` | string | **required** | `logistic_regression` \| `random_forest` \| `linear_svc` |
| `model.hyperparameters` | object | optional | Free-form JSON object (empty `{}` if none) |
| `device.type` | string | **required** | `cpu` \| `gpu` |
| `device.gpu_reason` | string\|null | optional | Explanation when GPU blocked/unavailable |
| `created_at` | string | **required** | ISO-8601 UTC timestamp |
| `created_by` | string | **required** | Format: `<client>@<version>` |
| `rerun_from` | string\|null | optional | Parent run ID if this is a rerun |
| `name` | string\|null | optional | User-facing label |
| `tags` | array[string] | optional | User tags for organization |
| `notes` | string\|null | optional | Free-form user notes |

### Preset values

| Preset | Description |
|--------|-------------|
| `fast` | Quick iteration, reduced quality |
| `balanced` | Default, good tradeoff |
| `thorough` | Higher quality, longer training |
| `custom` | User-specified hyperparameters |

---

## 4) Run Result File (run.json)

**Location:** `.runforge/runs/<run-id>/run.json`

**Purpose:** What actually happened during training.
Written after training completes. Immutable.

This file already exists in VS Code v0.3.6 (schema: `run.v0.3.6`).
Desktop reads this file to display run results.

Key fields (not exhaustive):
- `run_id` - matches folder name
- `runforge_version` - client version that produced this
- `schema_version` - e.g., `run.v0.3.6`
- `created_at` - when training completed
- `dataset.path`, `dataset.fingerprint_sha256`
- `model_family`
- `metrics` - Phase 2 metrics snapshot
- `artifacts` - paths to model, metrics files, etc.

---

## 5) Interoperability Guarantee

A run created by VS Code extension is viewable in Desktop, and vice versa.

This means:
- Desktop can load any `request.json` + `run.json` produced by VS Code
- VS Code can load any `request.json` edited by Desktop
- Unknown fields are preserved, not dropped

---

## 6) Test Vectors (required)

Each client repo must include:
- `docs/test-vectors/request.v1.min.json` - minimal valid request
- `docs/test-vectors/request.v1.full.json` - all fields populated
- `docs/test-vectors/request.v1.unknown-fields.json` - includes future unknown fields

And tests that verify:
- Can parse all test vector files
- Unknown fields are preserved on round-trip save

---

## 7) Version History

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-02-01 | Initial schema |

---

## 8) Related Documents

- [PRODUCT_MAP.md](PRODUCT_MAP.md) - Which repo is which product
- [RELEASE_PROCESS.md](RELEASE_PROCESS.md) - How to release
- VS Code: `CONTRACT.md`, `CONTRACT-PHASE-3.md`
