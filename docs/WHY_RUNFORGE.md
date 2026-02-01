# Why RunForge

RunForge exists because ML training pipelines are often opaque, non-reproducible, and hard to audit.

This document explains what RunForge does differently—and why.

---

## The Problems

### 1. Reproducibility is Hard

Most ML workflows have hidden randomness:
- Data shuffling
- Train/test splits
- Model initialization
- Library version differences

**Result:** Run the same code twice, get different results.

### 2. Provenance is Missing

When a model is in production:
- What data was it trained on?
- What exact configuration?
- What version of the code?

**Result:** Debugging requires archaeology.

### 3. Interpretability is an Afterthought

Models ship, then someone asks "which features matter?"
- Retrofitting explanations is error-prone
- Different tools give different answers
- No single source of truth

**Result:** Explanations are unreliable or missing entirely.

---

## How RunForge Addresses These

### Determinism by Design

| Problem | RunForge Approach |
|---------|-------------------|
| Random splits | Seeded `train_test_split` with explicit seed |
| Initialization | All models use `random_state` |
| Output format | Canonical JSON (sorted keys, stable formatting) |

**Evidence:** Train twice with same seed → byte-identical artifacts.

Test: `test_determinism_phase32.py`

### Provenance by Default

| Problem | RunForge Approach |
|---------|-------------------|
| Unknown data | `dataset.fingerprint_sha256` in every run |
| Unknown config | Full config in `run.json` |
| Unknown version | `runforge_version` in every artifact |

**Evidence:** Every `run.json` contains traceable provenance.

Schema: [`run.schema.v0.3.6.json`](../python/ml_runner/contracts/)

### Interpretability Built-In

| Problem | RunForge Approach |
|---------|-------------------|
| Missing explanations | Extract during training, not after |
| Inconsistent formats | Versioned schemas for all artifacts |
| Multiple sources | Unified index links everything |

**Evidence:** Interpretability artifacts are emitted with every run.

Schemas:
- `metrics.schema.v1.json`
- `feature_importance.schema.v1.json`
- `linear_coefficients.schema.v1.json`
- `interpretability.index.schema.v1.json`

---

## What RunForge Is NOT

This is not:

| Not This | Because |
|----------|---------|
| Auto-ML | You choose the model explicitly |
| Experiment tracker | Single runs, not comparison dashboards |
| Deep learning framework | scikit-learn only |
| Cloud service | Local execution, your machine |

RunForge has a narrow scope by design. It does one thing well.

---

## The Trust Hierarchy

RunForge establishes trust through layered evidence:

```
Claim
  └── Documentation
        └── Schema
              └── Test
                    └── Artifact
```

Every marketing claim can be traced to:
1. A schema file that defines the structure
2. A test that enforces the behavior
3. An artifact that proves the output

If a claim can't be traced this way, it doesn't ship.

---

## Comparison: Before and After

### Before RunForge

```
$ python train.py --data customers.csv
Training...
Model saved to model.pkl
Accuracy: 0.87
```

Questions you can't answer:
- What exact data was used?
- Is 0.87 reproducible?
- Which features drove the prediction?

### After RunForge

```
$ runforge train --data customers.csv --seed 42

Run ID: 20240101-120000-abc12345
Dataset fingerprint: 7f83b1657ff1fc53...
Validation Accuracy: 0.8700

Artifacts:
  - run.json (provenance)
  - metrics.v1.json (detailed metrics)
  - linear_coefficients.v1.json (model weights)
  - interpretability.index.v1.json (unified view)
```

Questions you can now answer:
- **What data?** → Check `dataset.fingerprint_sha256`
- **Reproducible?** → Run again with `--seed 42`, compare
- **Which features?** → Open `linear_coefficients.v1.json`

---

## Summary

| Principle | Implementation | Evidence |
|-----------|----------------|----------|
| Determinism | Seeded operations, canonical output | Reproducibility tests |
| Provenance | Fingerprints, version tracking | `run.json` schema |
| Interpretability | Native extraction, versioned artifacts | Artifact schemas |

RunForge makes ML training auditable by default—not as an afterthought.

---

## Further Reading

- [TRUST_MODEL.md](TRUST_MODEL.md) — Full trust model
- [WHAT_RUNFORGE_IS.md](WHAT_RUNFORGE_IS.md) — Positioning summary
- [WALKTHROUGH.md](WALKTHROUGH.md) — Hands-on guide
