/**
 * Python Runner
 * Spawns Python process and handles streaming output
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { RunnerOptions, RunResult, RunStatus } from '../types.js';

/** Result of checking Python availability */
export interface PythonCheck {
  available: boolean;
  path: string;
  version?: string;
  error?: string;
}

/**
 * Check if Python is available on PATH
 */
export async function checkPython(pythonPath: string = 'python'): Promise<PythonCheck> {
  return new Promise((resolve) => {
    const proc = spawn(pythonPath, ['--version'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      resolve({
        available: false,
        path: pythonPath,
        error: `Python not found on PATH. Install Python 3.10+ and try again.\n${error.message}`,
      });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const version = (stdout || stderr).trim();
        resolve({
          available: true,
          path: pythonPath,
          version,
        });
      } else {
        resolve({
          available: false,
          path: pythonPath,
          error: `Python check failed with exit code ${code}`,
        });
      }
    });
  });
}

/** Callbacks for streaming output */
export interface RunnerCallbacks {
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
  onExit: (result: RunResult) => void;
}

/** Extract run_id from directory path */
function runIdFromDir(p: string): string {
  return p.split(/[\\/]/).pop() || 'unknown';
}

/**
 * Build environment with optional dataset path
 */
function buildEnv(datasetPath?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1', // Extra insurance for unbuffered output
  };

  // Pass dataset path via environment variable if provided
  if (datasetPath) {
    env.RUNFORGE_DATASET = datasetPath;
  }

  return env;
}

/**
 * Spawn the Python training runner
 * Runs: python -m ml_runner train --preset <id> --out <run_dir> --device <device> [--seed <n>]
 */
export function spawnRunner(
  pythonPath: string,
  moduleName: string,
  options: RunnerOptions,
  callbacks: RunnerCallbacks
): ChildProcess {
  const args = [
    '-u', // Unbuffered output
    '-m', moduleName,
    'train',
    '--preset', options.preset_id,
    '--out', options.run_dir,
    '--device', options.device, // Extension decides device, runner must respect
  ];

  if (options.seed !== undefined) {
    args.push('--seed', String(options.seed));
  }

  const startTime = Date.now();
  const runId = runIdFromDir(options.run_dir);

  const proc = spawn(pythonPath, args, {
    cwd: options.cwd,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: buildEnv(options.dataset_path),
  });

  // One-shot exit guard to prevent double onExit calls
  let exited = false;
  const exitOnce = (result: RunResult) => {
    if (exited) return;
    exited = true;
    callbacks.onExit(result);
  };

  // Handle stdout line by line
  let stdoutBuffer = '';
  proc.stdout?.on('data', (data: Buffer) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    for (const line of lines) {
      if (line) callbacks.onStdout(line);
    }
  });

  // Handle stderr line by line
  let stderrBuffer = '';
  proc.stderr?.on('data', (data: Buffer) => {
    stderrBuffer += data.toString();
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line) callbacks.onStderr(line);
    }
  });

  // Handle process exit
  proc.on('close', (code) => {
    // Flush any remaining buffered output
    if (stdoutBuffer) callbacks.onStdout(stdoutBuffer);
    if (stderrBuffer) callbacks.onStderr(stderrBuffer);

    const duration_ms = Date.now() - startTime;
    const status: RunStatus = code === 0 ? 'succeeded' : 'failed';

    exitOnce({
      run_id: runId,
      status,
      exit_code: code ?? -1,
      duration_ms,
      error: status === 'failed' ? `Process exited with code ${code}` : undefined,
    });
  });

  // Handle spawn errors
  proc.on('error', (error) => {
    const duration_ms = Date.now() - startTime;

    exitOnce({
      run_id: runId,
      status: 'failed',
      exit_code: -1,
      duration_ms,
      error: error.message,
    });
  });

  return proc;
}

/**
 * Spawn the Python training runner using bundled script path
 * Runs: python <script_path> train --preset <id> --out <run_dir> --device <device> [--seed <n>]
 *
 * This is the preferred method - uses the bundled ml_runner package
 * rather than relying on a global module.
 */
export function spawnRunnerScript(
  pythonPath: string,
  scriptPath: string,
  options: RunnerOptions,
  callbacks: RunnerCallbacks
): ChildProcess {
  const args = [
    '-u', // Unbuffered output
    scriptPath, // Run as script (directory with __main__.py)
    'train',
    '--preset', options.preset_id,
    '--out', options.run_dir,
    '--device', options.device, // Extension decides device, runner must respect
  ];

  if (options.seed !== undefined) {
    args.push('--seed', String(options.seed));
  }

  const startTime = Date.now();
  const runId = runIdFromDir(options.run_dir);

  const proc = spawn(pythonPath, args, {
    cwd: options.cwd,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: buildEnv(options.dataset_path),
  });

  // One-shot exit guard to prevent double onExit calls
  let exited = false;
  const exitOnce = (result: RunResult) => {
    if (exited) return;
    exited = true;
    callbacks.onExit(result);
  };

  // Handle stdout line by line
  let stdoutBuffer = '';
  proc.stdout?.on('data', (data: Buffer) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    for (const line of lines) {
      if (line) callbacks.onStdout(line);
    }
  });

  // Handle stderr line by line
  let stderrBuffer = '';
  proc.stderr?.on('data', (data: Buffer) => {
    stderrBuffer += data.toString();
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line) callbacks.onStderr(line);
    }
  });

  // Handle process exit
  proc.on('close', (code) => {
    // Flush any remaining buffered output
    if (stdoutBuffer) callbacks.onStdout(stdoutBuffer);
    if (stderrBuffer) callbacks.onStderr(stderrBuffer);

    const duration_ms = Date.now() - startTime;
    const status: RunStatus = code === 0 ? 'succeeded' : 'failed';

    exitOnce({
      run_id: runId,
      status,
      exit_code: code ?? -1,
      duration_ms,
      error: status === 'failed' ? `Process exited with code ${code}` : undefined,
    });
  });

  // Handle spawn errors
  proc.on('error', (error) => {
    const duration_ms = Date.now() - startTime;

    exitOnce({
      run_id: runId,
      status: 'failed',
      exit_code: -1,
      duration_ms,
      error: error.message,
    });
  });

  return proc;
}
