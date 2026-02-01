# RunForge v0.3.6.0 Release Notes

**Release Date:** February 2025
**Phase:** 3 (Capabilities & Interpretability)
**Status:** Frozen

---

## What's New in v0.3.6.0

This release completes Phase 3 with the **Unified Interpretability Index**.

### Interpretability Index

Every run now produces `artifacts/interpretability.index.v1.json`:

```json
{
  "schema_version": "interpretability.index.v1",
  "run_id": "20240101-120000-abc12345",
  "available_artifacts": {
    "metrics_v1": { "path": "metrics.v1.json", ... },
    "linear_coefficients_v1": { "path": "artifacts/linear_coefficients.v1.json", ... }
  }
}
```

This answers: *"What interpretability outputs exist for this run?"*

### VS Code Command

**`RunForge: View Latest Interpretability Index`**

Shows a formatted summary with:
- Available artifacts (✓/✗)
- Quick links to open each artifact
- Interpretation guide

---

## What's in Phase 3 (Now Frozen)

| Version | Feature | Artifact |
|---------|---------|----------|
| v0.3.1 | Model Selection | `model_family` in run.json |
| v0.3.2 | Hyperparameters & Profiles | Profile expansion, CLI params |
| v0.3.3 | Model-Aware Metrics | `metrics.v1.json` |
| v0.3.4 | Feature Importance | `feature_importance.v1.json` |
| v0.3.5 | Linear Coefficients | `linear_coefficients.v1.json` |
| v0.3.6 | Interpretability Index | `interpretability.index.v1.json` |

All Phase 3 guarantees are now locked. Changes require Phase 4 contracts.

---

## What's Frozen

These behaviors will not change:

| Guarantee | Since |
|-----------|-------|
| 80/20 train/val split | Phase 2 |
| `label` column detection | Phase 2 |
| StandardScaler in all pipelines | Phase 2 |
| Deterministic random seeds | Phase 2 |
| Versioned artifact schemas | Phase 3 |
| Native-only interpretability | Phase 3 |

---

## Test Coverage

| Metric | Value |
|--------|-------|
| Total tests | 417 |
| Phase 3.6 tests | 29 |
| All tests passing | ✓ |

Run: `pytest python/ml_runner/ -q`

---

## Upgrade Path

**From v0.3.5:**
- No breaking changes
- New `interpretability.index.v1.json` artifact appears automatically
- New VS Code command available

**From v0.3.x (earlier):**
- All artifacts remain compatible
- New features are additive only

**From v0.2.x:**
- Phase 2 artifacts unchanged
- New Phase 3 artifacts appear alongside existing ones

---

## Documentation

New in this release:

| Document | Purpose |
|----------|---------|
| [TRUST_MODEL.md](TRUST_MODEL.md) | How RunForge establishes trust |
| [WALKTHROUGH.md](WALKTHROUGH.md) | Guided 2-3 minute tour |
| [WHAT_RUNFORGE_IS.md](WHAT_RUNFORGE_IS.md) | Plain-language positioning |

---

## What's Next

Phase 3 is complete. Future development requires Phase 4 contracts.

Potential Phase 4 topics (not committed):
- Additional model families
- Regression tasks
- Advanced visualizations
- Export formats

None of these are planned—they are possibilities that would require explicit contracts.

---

## Verification

To verify this release:

```bash
# Check version
grep '"version"' package.json
# → "version": "0.3.6.0"

# Run tests
cd python && pytest ml_runner/ -q
# → 417 passed

# Check tag
git tag --list 'v0.3.6*'
# → v0.3.6.0
```

---

## Credits

Built with:
- scikit-learn (ML)
- VS Code Extension API (UI)
- pytest (testing)
- JSON Schema (contracts)

Co-Authored-By: Claude Opus 4.5
