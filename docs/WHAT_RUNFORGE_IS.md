# What RunForge Is

RunForge is a VS Code extension for supervised classification that produces deterministic, inspectable training runs.

---

## In One Sentence

RunForge trains scikit-learn classifiers on CSV data with full provenance tracking, versioned artifacts, and native interpretability extraction.

---

## What It Does

1. **Trains classifiers** on tabular CSV data
2. **Tracks provenance** of every run (dataset fingerprint, exact configuration)
3. **Emits versioned artifacts** (metrics, importance, coefficients)
4. **Provides VS Code commands** to inspect everything

---

## What It Produces

Every training run creates:

| Artifact | Content | Schema |
|----------|---------|--------|
| `run.json` | Metadata, pointers to all artifacts | `run.v0.3.6` |
| `metrics.json` | Accuracy, sample count, feature count | Phase 2 (frozen) |
| `metrics.v1.json` | Detailed metrics by profile | `metrics.v1` |
| `model.pkl` | Trained scikit-learn Pipeline | N/A (pickle) |
| `feature_importance.v1.json` | Gini importance (RandomForest only) | `feature_importance.v1` |
| `linear_coefficients.v1.json` | Coefficients (linear models only) | `linear_coefficients.v1` |
| `interpretability.index.v1.json` | Unified index of above | `interpretability.index.v1` |

All JSON artifacts have explicit schemas in [`python/ml_runner/contracts/`](../python/ml_runner/contracts/).

---

## What Models It Supports

| Model | Family Key | Interpretability |
|-------|------------|------------------|
| Logistic Regression | `logistic_regression` | Coefficients |
| Random Forest | `random_forest` | Feature Importance |
| Linear SVC | `linear_svc` | Coefficients |

No other models in v0.3.6. Extensions require Phase 4 contracts.

---

## What It Guarantees

These guarantees are enforced by tests and frozen:

| Guarantee | Evidence |
|-----------|----------|
| Deterministic splits | Same seed → same train/val split |
| Reproducible artifacts | Same inputs → byte-identical outputs |
| Provenance tracking | `dataset.fingerprint_sha256` in every `run.json` |
| Schema compliance | All artifacts validate against versioned schemas |
| No silent failures | Unsupported operations emit structured diagnostics |

See [`docs/TRUST_MODEL.md`](TRUST_MODEL.md) for the full trust model.

---

## What It Does NOT Do

RunForge explicitly excludes:

| Not Supported | Reason |
|---------------|--------|
| Deep learning | Out of scope (scikit-learn only) |
| Regression tasks | Classification only in v0.3.6 |
| SHAP/LIME | No approximations—native extraction only |
| Auto-ML | Explicit model choice required |
| Cloud training | Local execution only |
| GPU acceleration | CPU-based scikit-learn |

These are not bugs or missing features. They are explicit non-goals.

---

## How to Verify

Every claim above can be verified:

1. **Schemas exist**: Check [`python/ml_runner/contracts/`](../python/ml_runner/contracts/)
2. **Tests pass**: Run `pytest python/ml_runner/` (417 tests)
3. **Determinism holds**: Train twice with same seed, compare outputs
4. **Artifacts validate**: Load any JSON, check `schema_version` field

---

## Version

This document describes RunForge **v0.3.6.0** (Phase 3 frozen).

Future versions will extend, not break, these guarantees.
