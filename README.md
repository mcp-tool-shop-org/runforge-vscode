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
| `RunForge: Browse Runs` | Browse all runs with actions (summary, diagnostics, artifact) (v0.2.3+) |

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

- Auto-select models (user must choose explicitly)
- Tune hyperparameters (defaults are fixed per preset)
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

**Inspection is read-only and does not retrain or modify artifacts.**

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

## Browse Runs (v0.2.3+)

Phase 2.3 adds a unified run browser with quick actions.

### Using Browse Runs

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `RunForge: Browse Runs`
3. Select a run from the list (newest first)
4. Choose an action:
   - **Open Run Summary** — View run metadata as readable markdown
   - **View Diagnostics** — See what happened during the run
   - **Inspect Model Artifact** — View pipeline structure
   - **Copy Dataset Fingerprint** — Copy SHA-256 to clipboard

### Synthesized Diagnostics

Diagnostics are derived from run.json fields:

| Condition | Diagnostic |
|-----------|------------|
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

Full structured diagnostics emission is planned for future phases.

---

## Model Selection (v0.3.1+)

Phase 3.1 adds explicit model selection while preserving all Phase 2 guarantees.

### Supported Models

| Model | CLI Value | Description |
|-------|-----------|-------------|
| Logistic Regression | `logistic_regression` | Default, fast, interpretable |
| Random Forest | `random_forest` | Ensemble, handles non-linear patterns |
| Linear SVC | `linear_svc` | Support vector classifier, margin-based |

### Configuration

Set the model family in VS Code settings:

```json
{
  "runforge.modelFamily": "random_forest"
}
```

Or use the Settings UI: Search for "RunForge Model Family" and select from the dropdown.

### CLI Usage

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

The `--model` argument is optional. Default: `logistic_regression`.

### Provenance

The selected model family is recorded in `run.json`:

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Backward Compatibility

- All Phase 2 runs remain readable
- Default behavior unchanged (logistic regression)
- No migration required
- Preprocessing remains fixed (StandardScaler for all models)

---

## Hyperparameters & Training Profiles (v0.3.2+)

Phase 3.2 adds explicit hyperparameter control and training profiles.

### Training Profiles

Named profiles provide pre-configured hyperparameters:

| Profile | Description | Model Family |
|---------|-------------|--------------|
| `default` | No hyperparameter overrides | (uses setting) |
| `fast` | Reduced iterations for quick runs | logistic_regression |
| `thorough` | More trees/iterations for better quality | random_forest |

Configure in VS Code settings:
```json
{
  "runforge.profile": "fast"
}
```

### CLI Hyperparameters

Override individual hyperparameters via CLI:

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Precedence Rules

When both profile and CLI params are set:

1. **CLI `--param`** (highest priority)
2. **Profile-expanded parameters**
3. **Model defaults** (lowest priority)

### Provenance

Hyperparameters and profiles are recorded in `run.json`:

```json
{
  "model_family": "random_forest",
  "profile_name": "thorough",
  "profile_version": "1.0",
  "expanded_parameters_hash": "abc123...",
  "hyperparameters": [
    {"name": "n_estimators", "value": 200, "source": "profile"},
    {"name": "max_depth", "value": 5, "source": "cli"}
  ]
}
```

When no profile is used, profile fields are omitted entirely (not null).

### Supported Hyperparameters

**Logistic Regression:**
- `C` (float, > 0): Regularization strength
- `max_iter` (int, > 0): Maximum iterations
- `solver` (str): Optimization solver
- `warm_start` (bool): Reuse previous solution

**Random Forest:**
- `n_estimators` (int, > 0): Number of trees
- `max_depth` (int or None): Maximum tree depth
- `min_samples_split` (int, >= 2): Min samples to split
- `min_samples_leaf` (int, > 0): Min samples per leaf

**Linear SVC:**
- `C` (float, > 0): Regularization strength
- `max_iter` (int, > 0): Maximum iterations

---

## Contract

See [CONTRACT.md](CONTRACT.md) for the full behavioral contract.

See [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) for observability requirements.

See [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) for introspection requirements.

See [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) for UX polish requirements.

See [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) for Phase 3 capability expansion rules.

See [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) for model selection requirements.

See [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) for hyperparameter and profile requirements.

See [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) for planned future improvements.

**Phase 2 is complete and frozen. Phase 3 extends Phase 2 without breaking any existing guarantees. See CONTRACT-PHASE-3.md for rules.**

## License

MIT
