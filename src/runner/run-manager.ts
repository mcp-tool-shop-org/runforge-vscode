/**
 * Run Manager
 * Orchestrates training runs with output channel, GPU gating, and file writing
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { PresetId, RunRequest, RunResult, IndexEntry, DeviceType } from '../types.js';
import { checkPython, spawnRunnerScript, type RunnerCallbacks } from './python-runner.js';
import { detectGpu, selectDevice, getCpuFallbackMessage, formatBytes } from './gpu-probe.js';
import {
  generateRunId,
  createRunFolder,
  writeRequest,
  writeResult,
  appendLog,
  readMetrics,
  toWorkspaceRelativePath,
} from '../workspace/run-folder.js';
import { appendToIndex, createTimestamp } from '../workspace/index-manager.js';
import { getPreset } from '../presets/registry.js';

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

/**
 * Get the bundled runner script path
 */
function getBundledRunnerPath(): string | undefined {
  if (!extensionPath) return undefined;
  return path.join(extensionPath, 'python', 'ml_runner');
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
}

let activeRun: ActiveRun | null = null;

/**
 * Check if a run is currently active
 */
export function isRunning(): boolean {
  return activeRun !== null;
}

/**
 * Execute a training run with GPU gating
 */
export async function executeRun(
  workspaceRoot: string,
  presetId: PresetId,
  name: string,
  seed?: number,
  datasetPath?: string
): Promise<void> {
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
  const bundledRunnerPath = getBundledRunnerPath();
  if (!bundledRunnerPath) {
    channel.appendLine('ERROR: Extension path not set. Cannot find bundled runner.');
    void vscode.window.showErrorMessage('RunForge extension error: bundled runner not found.');
    return;
  }

  // GPU Preflight Check (must happen before run starts)
  channel.appendLine('');
  channel.appendLine('Detecting GPU capabilities...');
  const gpuInfo = await detectGpu(pythonPath);
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

  // Set active run (process will be set after spawn)
  activeRun = {
    token: runToken,
    runId,
    runDir,
    startTime: Date.now(),
    device: actualDevice,
    process: null,
    aborted: false,
  };

  // Create callbacks for streaming
  const callbacks: RunnerCallbacks = {
    onStdout: (line) => {
      // Guard against late callbacks from a different run
      if (!activeRun || activeRun.token !== runToken) return;

      channel.appendLine(line);
      appendLog(runDir, line).catch(() => {}); // Fire and forget
    },
    onStderr: (line) => {
      // Guard against late callbacks from a different run
      if (!activeRun || activeRun.token !== runToken) return;

      channel.appendLine(`[stderr] ${line}`);
      appendLog(runDir, `[stderr] ${line}`).catch(() => {});

      // Check for OOM-like patterns (only when using GPU)
      if (actualDevice === 'cuda' && isOomError(line)) {
        killRunOnOom(runToken, channel);
      }
    },
    onExit: async (result) => {
      // Guard against late callbacks from a different run
      if (!activeRun || activeRun.token !== runToken) return;

      // If aborted, override the result
      if (activeRun.aborted) {
        result = {
          ...result,
          status: 'failed',
          error: activeRun.abortReason || 'Run aborted',
        };
      }

      await handleRunComplete(workspaceRoot, runDir, request, result, actualDevice, runToken);
    },
  };

  // Spawn the runner with explicit device using bundled script
  try {
    const proc = spawnRunnerScript(pythonPath, bundledRunnerPath, {
      preset_id: presetId,
      run_dir: runDir,
      seed,
      device: actualDevice,
      cwd: workspaceRoot,
      dataset_path: datasetPath,
    }, callbacks);

    // Store process handle for potential kill
    if (activeRun && activeRun.token === runToken) {
      activeRun.process = proc;
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

/** Force kill timeout in ms */
const FORCE_KILL_TIMEOUT_MS = 2000;

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
function isOomError(line: string): boolean {
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
 * Handle run completion with proper cleanup
 */
async function handleRunComplete(
  workspaceRoot: string,
  runDir: string,
  request: RunRequest,
  result: RunResult,
  device: DeviceType,
  runToken: symbol
): Promise<void> {
  const channel = getOutputChannel();

  try {
    // Write result.json
    try {
      await writeResult(runDir, result);
    } catch (e) {
      channel.appendLine(`WARN: Failed to write result.json: ${e}`);
    }

    // Read metrics if available
    let finalMetrics: Record<string, number> = {};
    try {
      finalMetrics = await readMetrics(runDir);
    } catch {
      // No metrics file or invalid JSON - that's OK
    }

    // Create index entry with device tracking
    const indexEntry: IndexEntry = {
      run_id: request.run_id,
      created_at: request.created_at,
      name: request.name,
      preset_id: request.preset_id,
      status: result.status,
      run_dir: toWorkspaceRelativePath(workspaceRoot, runDir),
      summary: {
        duration_ms: result.duration_ms,
        final_metrics: finalMetrics,
        device: device,
      },
    };

    // Append to index
    try {
      await appendToIndex(workspaceRoot, indexEntry);
    } catch (e) {
      channel.appendLine(`WARN: Failed to append to index.json: ${e}`);
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

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
