// Regression for F-COORD-003 (Stage A): production spawn must use `python -m ml_runner` form, not `python <dir>`.

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as realChildProcess from 'node:child_process';
import type { RunResult } from '../src/types.js';

const PYTHON_BIN = process.env.RUNFORGE_TEST_PYTHON || 'python';
const REPO_ROOT = path.resolve(__dirname, '..');
const PYTHON_PKG_PARENT = path.join(REPO_ROOT, 'python');
const FIXTURE_CSV = path.join(REPO_ROOT, 'test', 'fixtures', 'iris-tiny.csv');

// Capture spawn invocations from the runner module while delegating to the real implementation.
// Mocked at module scope so the runner's ESM `spawn` import is bound to our wrapper.
const spawnCalls: Array<{ command: string; args: readonly string[]; env?: NodeJS.ProcessEnv }> = [];
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof realChildProcess>('node:child_process');
  return {
    ...actual,
    spawn: ((command: string, args: readonly string[], options: realChildProcess.SpawnOptions) => {
      spawnCalls.push({ command, args, env: options?.env });
      return actual.spawn(command, args as string[], options);
    }) as typeof realChildProcess.spawn,
  };
});

// Imported AFTER the mock so the runner's spawn binding resolves to the wrapper.
const { checkPython, spawnRunner } = await import('../src/runner/python-runner.js');
type RunnerCallbacks = import('../src/runner/python-runner.js').RunnerCallbacks;

let pythonProbe: { available: boolean; checked: boolean } = { available: false, checked: false };

async function pythonAvailable(): Promise<boolean> {
  if (!pythonProbe.checked) {
    const check = await checkPython(PYTHON_BIN);
    pythonProbe = { available: check.available, checked: true };
  }
  return pythonProbe.available;
}

async function makeTmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('F-COORD-003 regression: production spawn path uses -m ml_runner', () => {
  it('spawnRunner invocation includes -m and ml_runner in argv (not directory form)', async () => {
    if (!(await pythonAvailable())) return;

    const outDir = await makeTmpDir('runforge-coord003-args-');
    const prior = process.env.PYTHONIOENCODING;
    process.env.PYTHONIOENCODING = 'utf-8';
    spawnCalls.length = 0;

    try {
      const result: RunResult = await new Promise((resolve) => {
        const cb: RunnerCallbacks = {
          onStdout: () => {},
          onStderr: () => {},
          onExit: (r) => resolve(r),
        };
        // Production-shaped args: cwd is workspaceRoot (NOT the python package parent),
        // runnerParent is the bundled python/ dir — this matches run-manager.executeRun.
        spawnRunner(
          PYTHON_BIN,
          'ml_runner',
          {
            preset_id: 'std-train',
            run_dir: outDir,
            device: 'cpu',
            seed: 42,
            model_family: 'logistic_regression',
            profile: '',
            dataset_path: FIXTURE_CSV,
            cwd: process.cwd(),
          },
          cb,
          PYTHON_PKG_PARENT
        );
      });

      // Locate the spawn call that launched the runner.
      const runnerCall = spawnCalls.find(
        (c) => c.command === PYTHON_BIN && c.args.includes('ml_runner')
      );
      expect(runnerCall, 'expected a spawn call for the runner').toBeDefined();

      const args = runnerCall!.args;

      // Hard-fail on regressions to directory-form invocation.
      expect(args).toContain('-m');
      expect(args).toContain('ml_runner');
      expect(args.indexOf('-m')).toBeLessThan(args.indexOf('ml_runner'));
      expect(args.some((a) => a === PYTHON_PKG_PARENT || a.endsWith(path.sep + 'ml_runner'))).toBe(false);

      // PYTHONPATH must include the bundled package parent so `-m ml_runner` resolves.
      expect(runnerCall!.env?.PYTHONPATH).toBeDefined();
      expect(runnerCall!.env!.PYTHONPATH!.split(path.delimiter)).toContain(PYTHON_PKG_PARENT);

      // End-to-end: run succeeded and run.json was produced with the expected schema.
      expect(result.status).toBe('succeeded');
      expect(result.exit_code).toBe(0);

      const runJsonPath = path.join(outDir, 'run.json');
      const raw = await fs.readFile(runJsonPath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(typeof parsed.schema_version).toBe('string');
      expect(parsed.schema_version.startsWith('run.v0.3')).toBe(true);
    } finally {
      if (prior === undefined) delete process.env.PYTHONIOENCODING;
      else process.env.PYTHONIOENCODING = prior;
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 30_000);
});
