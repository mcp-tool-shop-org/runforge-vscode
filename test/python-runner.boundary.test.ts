/**
 * Real-subprocess boundary tests for src/runner/python-runner.ts.
 *
 * Per F-TESTS-002: no mocks for the Python boundary. Spawns the real
 * ml_runner Python process against tiny fixture CSVs.
 * Skipped automatically when no `python` binary is on PATH.
 * `RUNFORGE_TEST_PYTHON` env var overrides the python binary.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  checkPython,
  spawnRunner,
  spawnRunnerScript,
  type RunnerCallbacks,
} from '../src/runner/python-runner.js';
import type { RunResult } from '../src/types.js';

const PYTHON_BIN = process.env.RUNFORGE_TEST_PYTHON || 'python';
const REPO_ROOT = path.resolve(__dirname, '..');
const PYTHON_PKG_DIR = path.join(REPO_ROOT, 'python');
const RUNNER_SCRIPT = path.join(PYTHON_PKG_DIR, 'ml_runner');
const FIXTURE_CSV = path.join(REPO_ROOT, 'test', 'fixtures', 'iris-tiny.csv');

let pythonProbe: { available: boolean; checked: boolean } = { available: false, checked: false };

async function pythonAvailable(): Promise<boolean> {
  if (!pythonProbe.checked) {
    const check = await checkPython(PYTHON_BIN);
    pythonProbe = { available: check.available, checked: true };
  }
  return pythonProbe.available;
}

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'runforge-boundary-'));
}

function runModule(outDir: string): Promise<RunResult> {
  // Force UTF-8 stdout in the child for cross-locale safety.
  const prior = process.env.PYTHONIOENCODING;
  process.env.PYTHONIOENCODING = 'utf-8';
  return new Promise<RunResult>((resolve) => {
    const cb: RunnerCallbacks = {
      onStdout: () => {},
      onStderr: () => {},
      onExit: (r) => {
        if (prior === undefined) delete process.env.PYTHONIOENCODING;
        else process.env.PYTHONIOENCODING = prior;
        resolve(r);
      },
    };
    spawnRunner(
      PYTHON_BIN,
      'ml_runner',
      {
        preset_id: 'std-train',
        run_dir: outDir,
        seed: 42,
        device: 'cpu',
        cwd: PYTHON_PKG_DIR,
        dataset_path: FIXTURE_CSV,
      },
      cb
    );
  });
}

describe('python-runner boundary (real subprocess)', () => {
  it('checkPython succeeds on a valid python on PATH', async () => {
    if (!(await pythonAvailable())) return;
    const result = await checkPython(PYTHON_BIN);
    expect(result.available).toBe(true);
    expect(result.path).toBe(PYTHON_BIN);
    expect(result.version).toMatch(/Python\s+\d+\.\d+\.\d+/);
  }, 15_000);

  it('checkPython fails gracefully with a bogus path', async () => {
    const bogus = path.join(os.tmpdir(), 'definitely-not-python-' + Date.now());
    const result = await checkPython(bogus);
    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.path).toBe(bogus);
  }, 10_000);

  it('checkPython returns a structured error (does not throw)', async () => {
    const result = await checkPython('/nonexistent/python');
    expect(result.available).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  }, 10_000);

  it('spawnRunner runs end-to-end on fixture CSV and produces run.json', async () => {
    if (!(await pythonAvailable())) return;
    const outDir = await makeTmpDir();
    try {
      const result = await runModule(outDir);
      expect(result.status).toBe('succeeded');
      expect(result.exit_code).toBe(0);
      expect(result.duration_ms).toBeGreaterThan(0);

      const runJsonPath = path.join(outDir, 'run.json');
      const raw = await fs.readFile(runJsonPath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.schema_version).toBe('run.v0.3.6');
      expect(parsed.dataset.path).toContain('iris-tiny.csv');
      expect(parsed.label_column).toBe('label');
      expect(parsed.num_features).toBe(2);
      expect(parsed.num_samples).toBe(8);
      expect(parsed.dataset.fingerprint_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(parsed.artifacts.model_pkl).toBeDefined();
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('spawnRunner reports failure when python binary is bogus', async () => {
    const bogus = path.join(os.tmpdir(), 'no-python-' + Date.now());
    const outDir = await makeTmpDir();
    try {
      const result: RunResult = await new Promise((resolve) => {
        spawnRunner(
          bogus,
          'ml_runner',
          {
            preset_id: 'std-train',
            run_dir: outDir,
            device: 'cpu',
            cwd: PYTHON_PKG_DIR,
            dataset_path: FIXTURE_CSV,
          },
          {
            onStdout: () => {},
            onStderr: () => {},
            onExit: (r) => resolve(r),
          }
        );
      });
      expect(result.status).toBe('failed');
      expect(result.exit_code).toBe(-1);
      expect(result.error).toBeDefined();
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 10_000);

  it('spawnRunnerScript reports failure when python binary is bogus', async () => {
    const bogus = path.join(os.tmpdir(), 'no-python-script-' + Date.now());
    const outDir = await makeTmpDir();
    try {
      const result: RunResult = await new Promise((resolve) => {
        spawnRunnerScript(
          bogus,
          RUNNER_SCRIPT,
          {
            preset_id: 'std-train',
            run_dir: outDir,
            device: 'cpu',
            cwd: REPO_ROOT,
            dataset_path: FIXTURE_CSV,
          },
          {
            onStdout: () => {},
            onStderr: () => {},
            onExit: (r) => resolve(r),
          }
        );
      });
      expect(result.status).toBe('failed');
      expect(result.exit_code).toBe(-1);
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 10_000);
});
