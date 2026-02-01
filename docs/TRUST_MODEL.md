# RunForge Trust Model

This document explains how RunForge establishes and maintains trust in training runs.

---

## Core Principles

### 1. Determinism

**Same inputs → Same outputs**

- Fixed random seeds produce identical models
- Identical datasets produce identical fingerprints
- Canonical JSON formatting ensures byte-identical artifacts
- Sorting rules (keys, features, classes) are explicit and stable

### 2. Provenance

**Every run is traceable**

- `run_id` encodes timestamp + dataset hash
- `dataset.fingerprint_sha256` links run to exact input data
- `runforge_version` and `schema_version` identify the producing code
- `index.json` maintains a global ledger of all runs

### 3. Honesty

**Artifacts say what they mean**

- Coefficients are labeled "standardized" because they are
- Unsupported operations emit diagnostics, not silent failures
- Optional fields are omitted, not set to null or placeholder values
- Summaries reference names, not duplicate numeric values

---

## What Is Frozen vs Versioned

| Category | Policy |
|----------|--------|
| **Phase 2 guarantees** | Frozen. No changes allowed. |
| **Phase 3 guarantees** | Frozen as of v0.3.6.0. |
| **Schema structures** | Versioned. New versions extend, never break. |
| **Default behavior** | Stable. Changes require new profiles or flags. |

### Frozen Guarantees (Never Change)

- `label` column detection (case-sensitive, exact match)
- 80/20 train/val split ratio
- StandardScaler in all pipelines
- `metrics.json` structure (3 keys exactly)
- Provenance index format

### Versioned Artifacts

Each artifact has an explicit schema version:

```
run.json           → run.v0.3.6
metrics.v1.json    → metrics.v1
feature_importance.v1.json → feature_importance.v1
linear_coefficients.v1.json → linear_coefficients.v1
interpretability.index.v1.json → interpretability.index.v1
```

New versions (v2, v3) will coexist with old versions, not replace them.

---

## Why Artifacts Are Separate

RunForge produces multiple JSON files per run instead of one monolithic file:

| Artifact | Purpose | When Present |
|----------|---------|--------------|
| `run.json` | Run metadata, pointers to artifacts | Always |
| `metrics.json` | Phase 2 compatibility (3 keys) | Always |
| `metrics.v1.json` | Detailed metrics by profile | Always (v0.3.3+) |
| `feature_importance.v1.json` | Feature rankings | RandomForest only |
| `linear_coefficients.v1.json` | Model coefficients | Linear models only |
| `interpretability.index.v1.json` | Unified index | Always (v0.3.6+) |

**Benefits:**

1. **Selective loading** - Tools can read only what they need
2. **Independent versioning** - Metrics schema can evolve without touching coefficients
3. **Clear availability** - Missing file = feature not available (no null checks)
4. **Smaller diffs** - Schema changes affect one file, not everything

---

## Read-Only Interpretability

Phase 3.4–3.6 artifacts are **read-only extractions**:

- No retraining or re-fitting
- No approximations (SHAP, LIME, permutation importance)
- No modification of existing artifacts
- Only native model attributes (`feature_importances_`, `coef_`)

This means:

| What You See | What It Is |
|--------------|------------|
| Feature importance | Native Gini importance from RandomForest |
| Coefficients | Native `coef_` from LogisticRegression/LinearSVC |
| Interpretability index | Links to existing artifacts |

If a model doesn't support native extraction, no artifact is produced. This is intentional—we don't guess or approximate.

---

## Coefficient Space Semantics

Linear coefficients are in **standardized feature space**:

```
coefficient = influence per 1 standard deviation of the feature
```

This is explicit in:
- The schema (`coefficient_space: "standardized"`)
- The VS Code output (interpretation guide)
- The documentation

We do **not** de-standardize coefficients because:
- It would require storing scaler parameters
- Raw-space coefficients are misleading when features have different scales
- Standardized coefficients are directly comparable

---

## Diagnostic Philosophy

When something can't be done, RunForge emits a structured diagnostic:

```
FEATURE_IMPORTANCE_UNSUPPORTED_MODEL
LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL
COEFFICIENTS_MISSING_ON_ARTIFACT
FEATURE_NAMES_UNAVAILABLE
```

**Not:**
- Silent omission
- Null values
- Placeholder data
- Approximations

This makes failures visible and actionable.

---

## Trust Verification

Users can verify trust by:

1. **Reproducibility test**: Same dataset + seed → same `run_id`
2. **Fingerprint check**: `dataset.fingerprint_sha256` matches file hash
3. **Schema validation**: Artifacts conform to published schemas
4. **Provenance audit**: `index.json` lists all runs with timestamps

---

## Phase Boundaries

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 2 | Core training, observability | Frozen |
| Phase 3 | Model selection, interpretability | Frozen (v0.3.6.0) |
| Phase 4 | TBD (requires new contract) | Not started |

Phase boundaries are explicit. Work does not cross boundaries without a signed contract.

---

## Summary

RunForge earns trust through:

- **Determinism**: Reproducible results
- **Provenance**: Traceable origins
- **Honesty**: Artifacts mean what they say
- **Stability**: Frozen guarantees, versioned extensions
- **Transparency**: Diagnostics over silence

This is the foundation everything else builds on.
