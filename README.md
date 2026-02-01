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
| `ML: Train (Standard)` | Run training with std-train preset |
| `ML: Train (High Quality)` | Run training with hq-train preset |
| `ML: Open Runs` | View completed training runs |

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

## Contract

See [CONTRACT.md](CONTRACT.md) for the full behavioral contract.

**Phase 2.1 is complete and frozen. All future phases must preserve the guarantees defined in CONTRACT.md.**

## License

MIT
