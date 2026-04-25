---
title: Cancel and Recovery
description: Cancel an in-progress training run, recover orphaned runs into the index, and trust the workspace before subprocess spawn.
sidebar:
  order: 3
---

Phase 4 introduces three lifecycle controls: **cancel an active training run**, **recover a missing index**, and a **workspace-trust guard** on Python subprocess spawn. This page covers each end-to-end.

## Cancel Active Training

A long-running training session can be cancelled at any time using the **Cancel Active Training** command. RunForge propagates VS Code's native `CancellationToken` through to the Python subprocess, gives Python a 5-second window to flush partial state and write a durable cancel marker, and falls back to `SIGKILL` if the grace window expires.

### How to cancel

1. While a run is in progress, open the Command Palette (`Ctrl+Shift+P`)
2. Run **`RunForge: Cancel Active Training`**
3. Watch the progress notification — you'll see a "Cancelling… N s" countdown as Python winds down

You can also dismiss the in-progress notification's cancel affordance — both paths fire the same `CancellationToken`.

### What happens during cancel

```
running → user fires cancel → TS arms 5s SIGKILL timer + sends SIGTERM
  → Python receives SIGTERM
    → emits cancelling{seconds_remaining: 5..0} per second
    → flushes partial state, atomically writes .cancelled marker
    → emits run_cancelled (graceful: true)
    → exits non-zero
```

If Python has not exited five seconds after `SIGTERM`, RunForge sends `SIGKILL` regardless of whether cleanup is in flight. The five-second window is fixed in Phase 4.

### Terminal states after cancel

The cancel state is determined by **artifacts on disk and events observed during the run**, never by process-exit timing. After Python exits — whether gracefully or by `SIGKILL` — RunForge classifies the terminal state:

| State | Detector |
|---|---|
| **Cancelled (graceful)** | `.cancelled` marker present **OR** `run_cancelled` event was observed |
| **Cancelled (forced)** | Cancel intent fired, neither marker nor event landed, non-zero exit |
| **Completed** | `artifacts_written` event observed AND `run.json` exists (training finished before cancel could land) |

The `.cancelled` marker is written atomically (`os.replace()` on `.cancelled.tmp` → `.cancelled`), so partial markers cannot exist. Even if `SIGKILL` fires at t+5s, a marker that was atomically written before t+5s still wins — graceful state is durable.

### Partial artifacts

A graceful cancel may leave partial artifacts in the run directory (a flushed log, a partially-written metrics file). The `.cancelled` marker file is the canonical signal that the run was user-cancelled; observability commands surface it as a first-class run state alongside completed runs.

## Recover Index

When Python writes a run successfully but the index update fails, the run is "orphaned" — it exists on disk but is invisible to **`Browse Runs`** and other observability commands. The **Recover Index** command walks `.ml/runs/`, re-reads each `run.json`, and re-appends any missing run to `.ml/outputs/index.json`.

### How to recover

1. Open the Command Palette
2. Run **`RunForge: Recover Index`**
3. Review the structured **Recovery Report** that opens — it lists scanned run dirs, already-indexed counts, recovered runs, skipped runs, and explicitly-excluded cancelled runs

### Behaviour guarantees

- **Idempotent.** Repeated calls do not duplicate entries (keyed on `run_id`).
- **Read-only.** Recovery never modifies `run.json` or any other artifact — only `index.json` is rebuilt.
- **Cancelled runs stay out.** Runs with a `.cancelled` marker but no `run.json` are NOT added to the index. They appear under `RecoveryReport.cancelled_excluded` and remain visible in the orphan picker.
- **Stale orphan markers cleaned up.** A successful re-recovery deletes the `.index-orphan` marker (the run is now indexed; the orphan signal is stale).

### Recovery Report shape

The report is a canonical TS type (`RecoveryReport` in `src/types.ts`) consumed by both the command writer and the markdown render:

| Field | Description |
|---|---|
| `scanned_run_dirs` | Total run dirs walked |
| `already_indexed` | Count of runs present in `index.json` before recovery |
| `recovered` | Runs newly added to the index this call |
| `skipped` | Run dirs that could not be recovered (corrupt/missing `run.json`, read error) — each carries `{ run_dir, error: 'CORRUPT_RUN_JSON' \| 'MISSING_RUN_JSON' \| 'READ_ERROR', message }` |
| `cancelled_excluded` | Cancelled runs explicitly NOT indexed |
| `recovered_at` | ISO 8601 UTC timestamp |

Each `recovered` or `cancelled_excluded` entry carries a best-effort `reason` classification (`index_orphan_marker`, `cancelled`, or `pre_existing_orphan`).

### Orphan banner

Phase 4 extends the Stage C orphan banner across all 7 observability commands. Whenever an orphan run is detected, the banner offers **Recover Index** as a one-click remediation.

## Workspace Trust

Python subprocess spawn (training, version check, GPU probe, dataset inspect, artifact inspect) requires VS Code **workspace trust**. This guard exists because RunForge executes user-controlled Python code from `runforge.pythonPath` and `runforge.mlRunnerModule`, which are themselves workspace-settable.

### How to grant trust

When you open a workspace for the first time, VS Code prompts you to grant or deny trust. Granting trust enables RunForge to spawn Python.

If you are running RunForge in an untrusted workspace, training and other commands that require Python will fail with a structured error pointing you to the **Manage Workspace Trust** UI. Grant trust there, then retry the command.

### Why this exists

The workspace-trust guard sits between RunForge's command surface and any Python spawn. An untrusted workspace cannot induce RunForge to execute arbitrary Python — even if the workspace ships its own `runforge.pythonPath` setting in `.vscode/settings.json`. This is consistent with VS Code's broader workspace-trust contract.

For the full security model, see [TRUST_MODEL.md](https://github.com/mcp-tool-shop-org/runforge-vscode/blob/main/docs/TRUST_MODEL.md).

## See Also

- [Reference](../reference/) — full command list and settings, including `Cancel Active Training` and `Recover Index`
- [Getting Started](../getting-started/) — first-run setup and the standard training workflow
