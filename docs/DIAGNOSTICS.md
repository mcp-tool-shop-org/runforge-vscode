# RunForge Diagnostics Reference

Structured diagnostic codes for explaining run behavior. All diagnostics are machine-readable JSON.

## Diagnostic Codes

| Code | Meaning | Emitted By | Severity |
|------|---------|------------|----------|
| `MISSING_VALUES_DROPPED` | Rows dropped due to missing values | run metadata | info |
| `LABEL_NOT_FOUND` | Label column not present in dataset | dataset inspection | error |
| `LABEL_TYPE_INVALID` | Label column has non-numeric type | dataset inspection | error |
| `ZERO_ROWS` | Dataset has zero rows after processing | run metadata | error |
| `ZERO_FEATURES` | Dataset has no feature columns | dataset inspection | error |
| `LABEL_ONLY_DATASET` | Dataset contains only the label column | dataset inspection | error |

## Schema

Diagnostics conform to `contracts/diagnostics.schema.v0.2.2.2.json`.

## Example

```json
[
  {
    "code": "MISSING_VALUES_DROPPED",
    "severity": "info",
    "message": "Dropped 5 rows with missing values",
    "details": {
      "rows_dropped": 5
    }
  }
]
```

## Severity Levels

| Level | Meaning |
|-------|---------|
| `info` | Informational, run continues normally |
| `warning` | Potential issue, run may continue |
| `error` | Run cannot proceed |

## Usage

Diagnostics are included in run metadata (`run.json`) and returned by dataset inspection.

No log parsing required — diagnostics are structured JSON by design.
