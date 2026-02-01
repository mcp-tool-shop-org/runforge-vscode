# RunForge VS Code

Push-button ML training with deterministic, contract-driven behavior.

## Installation

```bash
npm install
npm run compile
```

## Commands

| Command | Description |
|---------|-------------|
| `RunForge: Train (Standard)` | Run training with std-train preset |
| `RunForge: Train (High Quality)` | Run training with hq-train preset |
| `RunForge: Open Runs` | View completed training runs |
| `RunForge: Inspect Dataset` | Validate dataset before training (v0.2.2.1+) |
| `RunForge: Open Latest Run Metadata` | View metadata for most recent run (v0.2.2.1+) |
| `RunForge: Inspect Model Artifact` | View pipeline structure of model.pkl (v0.2.2.2+) |

## Usage

1. Set `RUNFORGE_DATASET` environment variable to your CSV path
2. CSV must have a column named `label`
3. Run training via Command Palette

---

## Guarantees (v0.2.1+)

RunForge VS Code provides deterministic, contract-driven ML training. The guarantees below are intentional and enforced by tests.

### Determinism

Given the same dataset, configuration, and RunForge version:

- Train/validation splits are identical across runs
- Generated artifacts are reproducible
- Metrics outputs are stable

There is no randomness outside explicitly seeded behavior.

### Label Handling

- The label column is explicitly specified
- The label is never inferred by column position
- Misconfigured or missing labels fail early

### Metrics Contract

Training outputs exactly three metrics:

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

No additional fields are added implicitly.
Schema expansion requires a versioned contract change.

### Model Artifacts

- `model.pkl` is always a serialized `sklearn.Pipeline`
- All preprocessing (e.g. scaling) is embedded
- The artifact is self-contained and inference-ready

No external preprocessing steps are required.

### Missing Data

- Rows containing missing values are dropped deterministically
- The number of dropped rows is logged
- No silent imputation occurs

### Source of Truth

- All Python execution logic lives in `python/ml_runner/`
- There is no duplicated or shadow implementation
- Tests enforce parity between TypeScript and Python behavior

### Stability Policy

- Behavior at v0.2.1 is frozen
- Breaking changes require an explicit major version bump
- Silent behavior changes are considered bugs

---

## Non-Goals (Intentional)

RunForge does not currently attempt to:

- Auto-select models
- Tune hyperparameters
- Perform online or incremental training
- Hide training behavior behind heuristics

Correctness and transparency take priority over automation.

---

---

## Observability (v0.2.2.1+)

Phase 2.2.1 adds visibility into training runs without changing training behavior.

### Run Metadata

Each training run produces a `run.json` with:

- Run ID and timestamp
- Dataset fingerprint (SHA-256)
- Label column and feature count
- Dropped rows count
- Metrics snapshot
- Artifact paths

### Dataset Inspection

Inspect datasets before training:

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Returns column names, row count, feature count, and label validation.

### Provenance Tracking

All runs are indexed in `.runforge/index.json` for traceability:

- Given a `model.pkl`, trace back to run metadata
- Find all runs for a given dataset fingerprint
- Append-only index (never reorders or deletes)

---

## Artifact Introspection (v0.2.2.2+)

Phase 2.2.2 adds read-only inspection of trained artifacts.

### Pipeline Inspection

Inspect what's inside a `model.pkl` without retraining:

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Returns structured JSON with:

- Pipeline steps (in order)
- Step types and modules
- Preprocessing detection

Example output:

```json
{
  "schema_version": "0.2.2.2",
  "artifact_path": "model.pkl",
  "pipeline_steps": [
    {"name": "scaler", "type": "StandardScaler", "module": "sklearn.preprocessing._data"},
    {"name": "clf", "type": "LogisticRegression", "module": "sklearn.linear_model._logistic"}
  ],
  "has_preprocessing": true,
  "step_count": 2
}
```

### Diagnostics

Structured diagnostics explain why a run behaved the way it did:

| Code | Description |
|------|-------------|
| `MISSING_VALUES_DROPPED` | Rows dropped due to missing values |
| `LABEL_NOT_FOUND` | Label column not present in dataset |
| `LABEL_TYPE_INVALID` | Label column has invalid type |
| `ZERO_ROWS` | Dataset has zero rows after processing |
| `ZERO_FEATURES` | Dataset has no feature columns |
| `LABEL_ONLY_DATASET` | Dataset contains only the label column |

All diagnostics are machine-readable JSON (no log parsing needed).

---

## Contract

See [CONTRACT.md](CONTRACT.md) for the full behavioral contract.

See [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) for observability requirements.

See [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) for introspection requirements.

**Phase 2.1 is complete and frozen. All future phases must preserve the guarantees defined in CONTRACT.md.**

## License

MIT
