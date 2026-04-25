/**
 * Run Manager
 * Orchestrates training runs with output channel, GPU gating, and file writing
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ChildProcess } from 'node:child_process';
import type { PresetId, RunRequest, RunResult, DeviceType, ModelFamily, TrainingProfile } from '../types.js';
import { ARTIFACT_FILENAMES } from '../types.js';
import { checkPython, spawnRunner, type RunnerCallbacks } from './python-runner.js';
import { detectGpu, selectDevice, getCpuFallbackMessage, formatBytes } from './gpu-probe.js';
import {
  generateRunId,
  createRunFolder,
  writeRequest,
  writeResult,
  appendLog,
  readMetrics,
} from '../workspace/run-folder.js';
import { createTimestamp } from '../workspace/index-manager.js';
import { getPreset } from '../presets/registry.js';
import { formatDuration } from '../utils/format.js';
import {
  EventStreamConsumer,
  EVENT_TYPES,
  type ParsedEvent,
} from '../observability/event-stream-consumer.js';
import { readCancelledMarker } from '../observability/cancelled-marker-reader.js';
import type { SafeError } from '../observability/fs-safe.js';

/**
 * Phase 4 (FT-BACK-005): canonical workspace-trust-guard error message.
 *
 * Surfaced verbatim via `vscode.window.showErrorMessage` when
 * `vscode.workspace.isTrusted` is false at the start of `executeRun`. The
 * humanization-lens copy points users at the standard VS Code "Trust this
 * Workspace" affordances (banner + status-bar badge) instead of leaving them
 * staring at a raw permission failure.
 *
 * Exported so tests can assert on the verbatim text without duplicating the
 * literal — same canonical-constant pattern as `ARTIFACT_FILENAMES` /
 * `WORKSPACE_PATHS` in `src/types.ts`.
 */
export const WORKSPACE_NOT_TRUSTED_MESSAGE =
  "This workspace is restricted. RunForge cannot spawn the Python subprocess to train models in untrusted workspaces. Click 'Trust this Workspace' in the workspace trust banner (or the trust badge in the status bar) to enable training.";

export const WORKSPACE_NOT_TRUSTED_RECOVERY_HINT =
  "Trust the workspace via VS Code's workspace trust UI, then re-run training.";

/** Output channel for training logs */
let outputChannel: vscode.OutputChannel | undefined;

/** Extension path (for bundled runner) */
let extensionPath: string | undefined;

/**
 * Set the extension path (called from extension.ts activate)
 */
export function setExtensionPath(extPath: string): void {
  extensionPath = extPath;
}

/** Bundled module name (the ml_runner Python package) */
const BUNDLED_RUNNER_MODULE = 'ml_runner';

/**
 * Get the parent directory of the bundled runner package, used as PYTHONPATH
 * so `python -m ml_runner` resolves the bundled package.
 */
function getBundledRunnerParent(): string | undefined {
  if (!extensionPath) return undefined;
  return path.join(extensionPath, 'python');
}

/**
 * Get or create the RunForge output channel
 */
export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('RunForge');
  }
  return outputChannel;
}

/**
 * Dispose the output channel
 */
export function disposeOutputChannel(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}

/** Active run state with token for callback safety */
interface ActiveRun {
  token: symbol;           // Unique token to guard against late callbacks
  runId: string;
  runDir: string;
  startTime: number;
  device: DeviceType;
  process: ChildProcess | null;
  aborted: boolean;
  abortReason?: string;
  /**
   * Phase 4 (FT-BACK-001): cancel-intent flag.
   * Set when the user fires the CancellationToken (or `killActiveRun` is
   * called). Distinct from `aborted` — `aborted` covers any abnormal end
   * (OOM kill, deactivate, cancel), while `cancelIntentFired` is specific
   * to user-initiated SIGTERM and is the input signal to
   * `detectCancelTerminalState`.
   */
  cancelIntentFired: boolean;
  /**
   * Phase 4: structured event ledger from Python stderr. Consulted by
   * `detectCancelTerminalState` per CONTRACT-PHASE-4.md §3.1.3 — marker on
   * disk OR `run_cancelled` event observed → graceful.
   */
  events: EventStreamConsumer;
  /** Phase 4: armed when SIGTERM is sent. Cleared on exit / cancel-rescind. */
  sigkillTimer: NodeJS.Timeout | null;
}

let activeRun: ActiveRun | null = null;

/**
 * Phase 4 (FT-BACK-001): SIGKILL trigger window after SIGTERM.
 *
 * Per CONTRACT-PHASE-4.md §3.1.1: "TS arms a 5-second SIGKILL trigger the
 * moment SIGTERM is sent. If Python has not exited by t+5s, TS sends SIGKILL
 * regardless of whether cleanup is in flight." This timer is a control-flow
 * mechanism ONLY — it does NOT determine terminal state. State detection
 * runs after exit and consults the marker/event ledger via
 * `detectCancelTerminalState`.
 */
const CANCEL_SIGKILL_WINDOW_MS = 5000;

/**
 * Phase 4 terminal state classification per CONTRACT-PHASE-4.md §3.1.3.
 *
 * Source-of-truth doctrine: terminal state is determined by ARTIFACTS ON
 * DISK + EVENTS OBSERVED, never by process-exit timing. Process-exit timing
 * is a control-flow trigger (the 5s SIGKILL window above); it is NOT a
 * state detector.
 *
 * Detection order (per §3.1.3 table):
 *   1. `artifacts_written` event observed AND `run.json` exists at canonical
 *      path → 'completed'. Race case: training finished before cancel
 *      signal could land. Cancel intent is recorded but supersedes nothing.
 *   2. `.cancelled` marker present OR `run_cancelled` event was observed →
 *      'cancelled-graceful'. Even if SIGKILL fired, if Python managed to
 *      atomically write the marker (or emit the event) before SIGKILL
 *      landed, the cleanup is durable.
 *   3. Cancel intent fired AND neither marker nor event AND non-zero exit →
 *      'cancelled-forced'. SIGKILL won the race or Python crashed
 *      mid-cleanup. Partial artifacts may exist; UI surfaces accordingly.
 *   4. Cancel intent NOT fired AND no `artifacts_written` event AND non-zero
 *      exit → 'crashed'.
 *
 * Exported for direct invocation by `test/cancel-state-machine.test.ts` per
 * docs/CONTRACTS.md rule 5 — tests exercise the production call chain.
 */
export type CancelTerminalState =
  | 'completed'
  | 'cancelled-graceful'
  | 'cancelled-forced'
  | 'crashed';

/**
 * Inputs for the §3.1.3 detector. Pure-data shape — no I/O on the args. The
 * marker check is the only filesystem touch performed by the detector
 * itself, so it remains async.
 */
export interface CancelDetectorInputs {
  /** Absolute path to the run directory. Used to read .cancelled marker + check run.json. */
  runDir: string;
  /** Event ledger snapshot from EventStreamConsumer.snapshot(). */
  observedEvents: ReadonlyArray<ParsedEvent>;
  /** Process exit code from the Python subprocess. */
  exitCode: number;
  /** True iff the user (or `killActiveRun`) fired the CancellationToken. */
  cancelIntentFired: boolean;
}

/**
 * Production call chain entry point — the single source of truth for cancel
 * terminal-state classification. Runs AFTER the Python process has exited
 * (graceful or via SIGKILL). Consults disk + observed events ONLY.
 *
 * Per Preload 3 in the FT-BACK-001 brief: tests invoke THIS function
 * directly; no mirror lives in test code.
 */
export async function detectCancelTerminalState(
  inputs: CancelDetectorInputs
): Promise<CancelTerminalState> {
  const { runDir, observedEvents, exitCode, cancelIntentFired } = inputs;

  const artifactsWrittenObserved = observedEvents.some(
    (e) => e.event === EVENT_TYPES.ARTIFACTS_WRITTEN
  );
  const runCancelledObserved = observedEvents.some(
    (e) => e.event === EVENT_TYPES.RUN_CANCELLED
  );

  const runJsonPath = path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON);
  const runJsonExists = await fileExists(runJsonPath);

  // Rule 1 — Completed: race case where training finished before cancel
  // landed. Even if cancel intent fired at t=4.99s, if artifacts were
  // written at t=5.0s with run.json present, we honor the success.
  if (artifactsWrittenObserved && runJsonExists) {
    return 'completed';
  }

  // Rule 2 — Cancelled (graceful): marker on disk OR run_cancelled event
  // observed. Either alone is sufficient (race-resilient: marker write may
  // succeed while event drops, or vice versa).
  const marker = await readCancelledMarker(runDir);
  if (marker !== null || runCancelledObserved) {
    return 'cancelled-graceful';
  }

  // Rule 3 — Cancelled (forced): cancel intent fired but neither marker
  // nor event landed AND exit was non-zero. SIGKILL won the race.
  if (cancelIntentFired && exitCode !== 0) {
    return 'cancelled-forced';
  }

  // Rule 4 — Crashed: no cancel intent, no artifacts_written, non-zero exit.
  // (Zero-exit-but-no-artifacts also lands here — F-SP-002 already classifies
  // that as failure via the run.json existence check upstream; we mirror
  // the doctrine: artifact-on-disk is the truth.)
  return 'crashed';
}

/** Internal helper — fs.access wrapped to a boolean. */
async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a run is currently active
 */
export function isRunning(): boolean {
  return activeRun !== null;
}

/**
 * Execute a training run with GPU gating.
 *
 * Phase 4 (FT-BACK-001): accepts an optional `vscode.CancellationToken`.
 * When the token fires, the runner sends SIGTERM to the Python subprocess
 * and arms a 5-second SIGKILL trigger per CONTRACT-PHASE-4.md §3.1.1. The
 * 5s timer is a SIGKILL trigger ONLY — terminal state classification runs
 * after exit and consults the §3.1.3 marker/event ledger via
 * `detectCancelTerminalState`.
 *
 * Backward-compatible: callers that don't pass a token (legacy command
 * surface) retain the prior shape.
 *
 * @param workspaceRoot Absolute path to the workspace folder (run dir + index live under .ml/).
 * @param presetId Which preset to load (std-train | hq-train).
 * @param name Human-friendly run label, used in run-id slug and surfaced in pickers.
 * @param seed Optional seed; runner gets `--seed` flag iff defined.
 * @param datasetPath Optional dataset CSV path; passed via RUNFORGE_DATASET env var.
 * @param cancellationToken Optional VS Code CancellationToken — when fired, sends SIGTERM with 5s SIGKILL trigger.
 * @param progress Optional progress reporter (typically the one passed in by `vscode.window.withProgress`) — receives the "Cancelling… Ns" countdown updates per Q6.
 */
export async function executeRun(
  workspaceRoot: string,
  presetId: PresetId,
  name: string,
  seed?: number,
  datasetPath?: string,
  cancellationToken?: vscode.CancellationToken,
  progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  // Phase 4 (FT-BACK-005): workspace-trust guard — gate Python subprocess
  // spawn on `vscode.workspace.isTrusted`. Untrusted workspaces never reach
  // `spawnRunner`; the user gets an actionable error pointing at VS Code's
  // standard trust affordances. We deliberately do NOT auto-call
  // `requestWorkspaceTrust()` — that pops a modal and yanks the user out of
  // their flow. Instead the user clicks the workspace-trust banner or the
  // trust badge in the status bar, then re-invokes the command.
  if (!vscode.workspace.isTrusted) {
    const safeError: SafeError = {
      code: 'WORKSPACE_NOT_TRUSTED',
      message: WORKSPACE_NOT_TRUSTED_MESSAGE,
      path: workspaceRoot,
      recoveryHint: WORKSPACE_NOT_TRUSTED_RECOVERY_HINT,
      retryable: true,
    };
    void vscode.window.showErrorMessage(safeError.message);
    const channel = getOutputChannel();
    channel.appendLine('');
    channel.appendLine(`ERROR: ${safeError.message}`);
    return;
  }

  // Check if already running
  if (activeRun) {
    vscode.window.showWarningMessage('A training run is already in progress.');
    return;
  }

  const channel = getOutputChannel();
  channel.show(true); // Reveal the output channel

  // Get configuration
  const config = vscode.workspace.getConfiguration('runforge');
  const pythonPath = config.get<string>('pythonPath', 'python');
  // Phase 3.1: Model selection from settings
  const modelFamily = config.get<ModelFamily>('modelFamily', 'logistic_regression');
  // Phase 3.2: Training profile from settings
  const profile = config.get<TrainingProfile>('profile', '');

  // Check Python availability
  channel.appendLine('Checking Python installation...');
  const pythonCheck = await checkPython(pythonPath);

  if (!pythonCheck.available) {
    channel.appendLine(`ERROR: ${pythonCheck.error}`);
    void vscode.window.showErrorMessage(
      'Python not found on PATH. Install Python 3.10+ and try again.',
      'Open Settings'
    ).then((action) => {
      if (action === 'Open Settings') {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'runforge.pythonPath');
      }
    });
    return;
  }

  channel.appendLine(`Found: ${pythonCheck.version}`);

  // Check for bundled runner
  const bundledRunnerParent = getBundledRunnerParent();
  if (!bundledRunnerParent) {
    channel.appendLine('ERROR: Extension path not set. Cannot find bundled runner.');
    void vscode.window.showErrorMessage('RunForge extension error: bundled runner not found.');
    return;
  }

  // GPU Preflight Check (must happen before run starts)
  channel.appendLine('');
  channel.appendLine('Detecting GPU capabilities...');
  let gpuInfo;
  try {
    gpuInfo = await detectGpu(pythonPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    channel.appendLine(`  GPU detection failed: ${message}`);
    channel.appendLine('  GPU detection failed; falling back to CPU.');
    gpuInfo = {
      cuda_available: false,
      total_vram: 0,
      free_vram: 0,
      detection_method: 'none' as const,
      status: 'GPU detection failed',
    };
  }
  channel.appendLine(`  ${gpuInfo.status}`);

  // Select device based on GPU info and preset requirements
  const deviceSelection = selectDevice(gpuInfo, presetId);
  const actualDevice = deviceSelection.device;
  const gpuReason = deviceSelection.reason;

  // Get preset for requested device
  const preset = getPreset(presetId);
  const requestedDevice = preset.defaults.device;

  // Determine if user wanted GPU (auto prefers GPU, or explicit cuda)
  const wantedGpu = requestedDevice === 'cuda' || requestedDevice === 'auto';

  // Show CPU fallback warning only when we wanted GPU but got CPU
  if (actualDevice === 'cpu' && wantedGpu) {
    const fallbackMsg = getCpuFallbackMessage(deviceSelection, presetId);
    channel.appendLine(`  ⚠ ${fallbackMsg}`);
    void vscode.window.showWarningMessage(fallbackMsg);
  } else if (actualDevice === 'cuda') {
    channel.appendLine(`  ✓ Using GPU (${formatBytes(gpuInfo.free_vram)} free VRAM)`);
  } else if (actualDevice === 'cpu' && requestedDevice === 'cpu') {
    channel.appendLine(`  ✓ Using CPU (as requested by preset)`);
  }

  // Generate run ID and create folder
  const runId = generateRunId(name);
  const runDir = await createRunFolder(workspaceRoot, runId);
  const createdAt = createTimestamp();

  channel.appendLine('');
  channel.appendLine('═'.repeat(60));
  channel.appendLine(`RunForge: Starting training run`);
  channel.appendLine(`  Run ID:  ${runId}`);
  channel.appendLine(`  Preset:  ${presetId}`);
  channel.appendLine(`  Name:    ${name}`);
  channel.appendLine(`  Model:   ${modelFamily}`);
  if (profile) {
    channel.appendLine(`  Profile: ${profile}`);
  }
  channel.appendLine(`  Device:  ${actualDevice} (${gpuReason})`);
  if (seed !== undefined) {
    channel.appendLine(`  Seed:    ${seed}`);
  }
  channel.appendLine('═'.repeat(60));
  channel.appendLine('');

  // Write request.json with device tracking
  const request: RunRequest = {
    run_id: runId,
    name,
    preset_id: presetId,
    seed,
    created_at: createdAt,
    requested_device: requestedDevice,
    actual_device: actualDevice,
    gpu_reason: gpuReason,
  };
  await writeRequest(runDir, request);

  // Create run token for callback safety
  const runToken = Symbol(runId);

  // Phase 4: structured event consumer for stderr JSONL.
  const eventConsumer = new EventStreamConsumer();

  // Set active run (process will be set after spawn)
  activeRun = {
    token: runToken,
    runId,
    runDir,
    startTime: Date.now(),
    device: actualDevice,
    process: null,
    aborted: false,
    cancelIntentFired: false,
    events: eventConsumer,
    sigkillTimer: null,
  };

  // Create callbacks for streaming.
  // Contract: each callback guards on activeRun.token === runToken — late callbacks from a
  // prior run are dropped silently. onExit is the sole authority for handleRunComplete.
  const callbacks: RunnerCallbacks = {
    /** Stdout line from runner; written to channel + appended to log file. */
    onStdout: (line) => {
      // Guard against late callbacks from a different run
      if (!activeRun || activeRun.token !== runToken) return;

      channel.appendLine(line);
      appendLog(runDir, line).catch(() => {}); // Fire and forget
    },
    /**
     * Stderr line from runner.
     *
     * Phase 4 wiring (FT-BACK-001):
     *  1. Feed every line to the EventStreamConsumer. JSONL events land in
     *     the §3.1.3 ledger; non-JSONL lines come back as `LogLine` and
     *     mirror to the OutputChannel as before.
     *  2. OOM detection still runs on the raw line (covers tracebacks too).
     *  3. `cancelling` events drive the "Cancelling… Ns" progress UI per
     *     Q6 — this is the surface the user sees while SIGTERM is in
     *     flight, before the 5s SIGKILL timer fires.
     */
    onStderr: (line) => {
      // Guard against late callbacks from a different run
      if (!activeRun || activeRun.token !== runToken) return;

      // Feed the event consumer first so the §3.1.3 ledger captures
      // run_cancelled / artifacts_written even if the OutputChannel append
      // path throws.
      const parsed = activeRun.events.push(line);

      // Mirror to OutputChannel for the user. Skipped (invalid-shape)
      // events are surfaced under a `[stderr-skip]` prefix so they don't
      // pretend to be the underlying message.
      if (parsed.kind === 'event') {
        channel.appendLine(`[event] ${parsed.event.event}`);
        // Drive the Cancelling-countdown UI from the cancelling event
        // stream — Q6 requires "Cancelling… Ns" rather than apparent freeze.
        if (parsed.event.event === EVENT_TYPES.CANCELLING && progress) {
          progress.report({
            message: `Cancelling… ${parsed.event.seconds_remaining}s`,
          });
        }
      } else if (parsed.kind === 'skipped') {
        channel.appendLine(`[stderr-skip] ${line}`);
      } else {
        channel.appendLine(`[stderr] ${line}`);
      }
      appendLog(runDir, `[stderr] ${line}`).catch(() => {});

      // Check for OOM-like patterns (only when using GPU)
      if (actualDevice === 'cuda' && isOomError(line)) {
        killRunOnOom(runToken, channel);
      }
    },
    /**
     * Process exit; aborted state overrides result before handleRunComplete.
     *
     * Phase 4 (FT-BACK-001) — terminal-state detection per §3.1.3:
     * After exit (graceful or via SIGKILL), invoke
     * `detectCancelTerminalState` with the §3.1.3 inputs (marker on disk +
     * events observed + exit code + cancel intent). The detector NEVER
     * consults exit-timing; it only consults the marker/event ledger. The
     * result is logged + surfaced; downstream `handleRunComplete` keeps
     * its existing F-SP-002 run.json check (which is the same source-of-
     * truth principle applied to the success path — see §3.1.3 antecedent).
     */
    onExit: async (result) => {
      // Guard against late callbacks from a different run
      if (!activeRun || activeRun.token !== runToken) return;

      // Snapshot detector inputs before clearing state.
      const cancelIntentFired = activeRun.cancelIntentFired;
      const observedEvents = activeRun.events.snapshot();

      // Clear any pending SIGKILL timer — process has already exited.
      if (activeRun.sigkillTimer) {
        clearTimeout(activeRun.sigkillTimer);
        activeRun.sigkillTimer = null;
      }

      // §3.1.3 detector: marker/event ledger first, exit-timing last.
      // Run only when cancel intent was actually fired — avoids a marker
      // walk on every successful run.
      if (cancelIntentFired) {
        try {
          const terminalState = await detectCancelTerminalState({
            runDir,
            observedEvents,
            exitCode: result.exit_code,
            cancelIntentFired,
          });
          channel.appendLine(`[cancel-detector] terminal state: ${terminalState}`);

          // Re-classify the result based on the §3.1.3 detector. Successful
          // races (training finished before cancel landed) keep their
          // 'succeeded' status; cancelled-graceful/forced both surface as
          // failed with a specific abortReason.
          if (terminalState === 'completed') {
            // Race case: leave result as-is — training succeeded.
          } else if (terminalState === 'cancelled-graceful') {
            result = {
              ...result,
              status: 'failed',
              error: 'Cancelled (graceful) — partial cleanup completed',
            };
          } else if (terminalState === 'cancelled-forced') {
            result = {
              ...result,
              status: 'failed',
              error: 'Cancelled (forced) — SIGKILL fired before cleanup completed',
            };
          } else if (terminalState === 'crashed') {
            result = {
              ...result,
              status: 'failed',
              error: result.error ?? 'Crashed during cancel handling',
            };
          }
        } catch (err) {
          // Detector should never throw — defensive log only.
          const msg = err instanceof Error ? err.message : String(err);
          channel.appendLine(`[cancel-detector] error: ${msg}`);
        }
      }

      // Legacy abort path for non-cancel aborts (OOM, deactivate). The
      // cancel-intent path above already overrides the result; only
      // non-cancel aborts use the prior abortReason fallback.
      if (activeRun.aborted && !cancelIntentFired) {
        result = {
          ...result,
          status: 'failed',
          error: activeRun.abortReason || 'Run aborted',
        };
      }

      await handleRunComplete(workspaceRoot, runDir, request, result, actualDevice, runToken);
    },
  };

  // Spawn the runner with explicit device using bundled module
  try {
    const proc = spawnRunner(pythonPath, BUNDLED_RUNNER_MODULE, {
      preset_id: presetId,
      run_dir: runDir,
      name,
      seed,
      device: actualDevice,
      cwd: workspaceRoot,
      dataset_path: datasetPath,
      model_family: modelFamily,
      profile: profile || undefined,
    }, callbacks, bundledRunnerParent);

    // Store process handle for potential kill
    if (activeRun && activeRun.token === runToken) {
      activeRun.process = proc;
    }

    // Phase 4 (FT-BACK-001): wire the CancellationToken to SIGTERM + 5s
    // SIGKILL trigger per CONTRACT-PHASE-4.md §3.1.1. The token comes from
    // `vscode.window.withProgress`; clicking the X on the progress
    // notification fires it. The progress reporter (also from withProgress)
    // is captured in the onStderr handler above to render the
    // "Cancelling… Ns" countdown driven by Python's `cancelling` events.
    if (cancellationToken) {
      const tokenDisposable = cancellationToken.onCancellationRequested(() => {
        cancelActiveRun(runToken, 'user cancelled via VS Code progress UI', channel);
      });
      // Best-effort cleanup: if the token disposes (e.g. progress closes
      // without firing cancel), drop the listener.
      proc.on('close', () => {
        tokenDisposable.dispose();
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    channel.appendLine(`ERROR: Failed to start training: ${errorMessage}`);

    // Still write a failed result
    const failedResult: RunResult = {
      run_id: runId,
      status: 'failed',
      exit_code: -1,
      duration_ms: 0,
      error: errorMessage,
    };
    await handleRunComplete(workspaceRoot, runDir, request, failedResult, actualDevice, runToken);
  }
}

/** Force kill timeout in ms (legacy / non-cancel paths) */
const FORCE_KILL_TIMEOUT_MS = 2000;

/**
 * Phase 4 (FT-BACK-001) cancel pathway — distinct from `killActiveRun`.
 *
 * Sends SIGTERM and arms the 5-second SIGKILL trigger per
 * CONTRACT-PHASE-4.md §3.1.1. Sets `cancelIntentFired` on the active run
 * so the §3.1.3 detector knows to consult the marker/event ledger.
 *
 * Token-guarded: callers pass the run's symbol so a stale token from a
 * prior run can't fire SIGTERM at the next run.
 */
function cancelActiveRun(
  runToken: symbol,
  reason: string,
  channel: vscode.OutputChannel
): void {
  if (!activeRun || activeRun.token !== runToken) return;
  if (activeRun.cancelIntentFired) return; // idempotent — multiple cancel clicks

  channel.appendLine('');
  channel.appendLine(`Cancel requested: ${reason}`);

  activeRun.cancelIntentFired = true;
  activeRun.aborted = true; // legacy flag — kept consistent for downstream guards
  activeRun.abortReason = reason;

  const proc = activeRun.process;
  if (!proc) return;

  try {
    proc.kill('SIGTERM');
  } catch {
    // Already exited.
  }

  // 5s SIGKILL trigger per §3.1.1. Control-flow only — does NOT determine
  // terminal state. The §3.1.3 detector runs after exit and consults the
  // marker/event ledger.
  if (activeRun.sigkillTimer) {
    clearTimeout(activeRun.sigkillTimer);
  }
  activeRun.sigkillTimer = setTimeout(() => {
    try {
      if (!proc.killed) {
        channel.appendLine('[cancel] grace window elapsed — sending SIGKILL');
        proc.kill('SIGKILL');
      }
    } catch {
      // Already exited.
    }
  }, CANCEL_SIGKILL_WINDOW_MS);
}

/**
 * Kill the active run (if any) for the given reason.
 * Safe to call when no run is active — returns silently.
 *
 * Used by the legacy `deactivate()` and OOM paths. For user-initiated
 * cancel via CancellationToken, the run-manager's internal `cancelActiveRun`
 * fires instead — that path uses the §3.1.1 5-second window and §3.1.3
 * detector.
 *
 * SIGTERM first; SIGKILL fallback after FORCE_KILL_TIMEOUT_MS.
 * Does not await process exit (callers in sync contexts like deactivate
 * cannot block); cleanup of activeRun state happens via the existing onExit
 * callback chain in handleRunComplete.
 */
export function killActiveRun(reason: string): void {
  if (!activeRun) return;

  const channel = getOutputChannel();
  channel.appendLine('');
  channel.appendLine(`Stopping active run: ${reason}`);

  activeRun.aborted = true;
  activeRun.abortReason = reason;

  const proc = activeRun.process;
  if (proc) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // Process may have already exited; ignore.
    }

    setTimeout(() => {
      try {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      } catch {
        // Already exited; ignore.
      }
    }, FORCE_KILL_TIMEOUT_MS);
  }
}

/**
 * Kill the running process on OOM detection
 * Uses graceful kill first, then force kill after timeout
 */
function killRunOnOom(runToken: symbol, channel: vscode.OutputChannel): void {
  if (!activeRun || activeRun.token !== runToken || activeRun.aborted) return;

  channel.appendLine('');
  channel.appendLine('⚠ Detected GPU memory error - stopping run to prevent system instability');

  activeRun.aborted = true;
  activeRun.abortReason = 'Stopped due to GPU memory limits (OOM detected)';

  const proc = activeRun.process;
  if (proc) {
    // Graceful kill first
    proc.kill();

    // Force kill fallback after timeout (belt-and-suspenders for stuck processes)
    setTimeout(() => {
      try {
        // Check if process is still alive (killed will be false if it exited)
        if (!proc.killed) {
          proc.kill('SIGKILL'); // Force kill
        }
      } catch {
        // Process already exited, ignore
      }
    }, FORCE_KILL_TIMEOUT_MS);
  }

  void vscode.window.showErrorMessage('Training stopped due to memory limits. See logs for details.');
}

/**
 * Check if stderr line indicates OOM or memory-related GPU error
 * Case-insensitive matching with broad patterns for reliability
 */
export function isOomError(line: string): boolean {
  const lower = line.toLowerCase();

  // Broad patterns that indicate GPU memory issues
  const oomPatterns = [
    'out of memory',           // Generic OOM
    'cuda error',              // CUDA errors (often memory-related)
    'cudnn error',             // cuDNN errors
    'cublas error',            // cuBLAS errors
    'alloc',                   // Allocation failures
    'outofmemoryerror',        // Java/PyTorch style
    'memory limit',            // Memory limit exceeded
    'failed to allocate',      // Allocation failure
    'insufficient memory',     // Insufficient memory
  ];

  return oomPatterns.some(pattern => lower.includes(pattern));
}

/**
 * Handle run completion with proper cleanup.
 *
 * Iter #5a: This function no longer writes index.json — Python ml_runner is
 * the single writer (consolidation; same pattern as F-COORD-003). TS only
 * writes result.json (per-run) and reads metrics for the completion log.
 *
 * @param _workspaceRoot Workspace folder. Retained for signature stability;
 *   unused after the index-writer move to Python.
 * @param runDir Absolute path to this run's folder.
 * @param request Original run request (already written to request.json).
 * @param result Final result from runner; may be overridden upstream when aborted.
 * @param device Device that was actually used (post-gating).
 * @param runToken Token guarding against state mutation by a stale callback.
 */
async function handleRunComplete(
  _workspaceRoot: string,
  runDir: string,
  request: RunRequest,
  result: RunResult,
  device: DeviceType,
  runToken: symbol
): Promise<void> {
  const channel = getOutputChannel();

  try {
    // F-SP-002: even with exit code 0, the Python runner might have crashed
    // after printing a success line but before writing run.json. Treat a
    // missing run.json as a failed run so the user sees the truth.
    if (result.status === 'succeeded') {
      const runJsonPath = path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON);
      try {
        await fs.access(runJsonPath);
      } catch {
        result = {
          ...result,
          status: 'failed',
          error: result.error ?? 'training-incomplete: run.json missing despite exit code 0',
        };
      }
    }

    // Write result.json
    try {
      await writeResult(runDir, result);
    } catch (e) {
      channel.appendLine(`WARN: Failed to write result.json: ${e}`);
    }

    // Read metrics if available (for completion-log display only — index.json
    // is now written by Python ml_runner; iter #5a consolidation).
    let finalMetrics: Record<string, number> = {};
    try {
      finalMetrics = await readMetrics(runDir);
    } catch {
      // No metrics file or invalid JSON - that's OK
    }

    // Log completion
    channel.appendLine('');
    channel.appendLine('═'.repeat(60));
    if (result.status === 'succeeded') {
      channel.appendLine(`✓ Training complete: ${request.run_id}`);
      channel.appendLine(`  Duration: ${formatDuration(result.duration_ms)}`);
      channel.appendLine(`  Device:   ${device}`);
      if (Object.keys(finalMetrics).length > 0) {
        channel.appendLine(`  Metrics:`);
        for (const [key, value] of Object.entries(finalMetrics)) {
          channel.appendLine(`    ${key}: ${value}`);
        }
      }
      void vscode.window.showInformationMessage(`Training complete: ${request.run_id}`);
    } else {
      channel.appendLine(`✗ Training failed: ${request.run_id}`);
      channel.appendLine(`  Exit code: ${result.exit_code}`);
      if (result.error) {
        channel.appendLine(`  Error: ${result.error}`);
      }
      void vscode.window.showErrorMessage(`Training failed: ${request.run_id}`);
    }
    channel.appendLine('═'.repeat(60));

  } finally {
    // Always clear active run if this is still our run
    if (activeRun && activeRun.token === runToken) {
      activeRun = null;
    }
  }
}

export { formatDuration };
