/**
 * CSV edge-case tests (F-TESTS-006).
 *
 * Runs `python -m ml_runner train` against deliberately tricky fixtures
 * and asserts the run.json artifact still validates and preserves data.
 * Skipped when `python` is not on PATH.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkPython, spawnRunner, type RunnerCallbacks } from '../src/runner/python-runner.js';
import type { RunResult } from '../src/types.js';

const PYTHON_BIN = process.env.RUNFORGE_TEST_PYTHON || 'python';
const REPO_ROOT = path.resolve(__dirname, '..');
const PYTHON_PKG_DIR = path.join(REPO_ROOT, 'python');
const FIXTURES_DIR = path.join(REPO_ROOT, 'test', 'fixtures');

let pythonProbe = { available: false, checked: false };

async function pythonAvailable(): Promise<boolean> {
  if (!pythonProbe.checked) {
    const c = await checkPython(PYTHON_BIN);
    pythonProbe = { available: c.available, checked: true };
  }
  return pythonProbe.available;
}

function runOn(csvPath: string, outDir: string): Promise<RunResult> {
  // Force UTF-8 stdout in the child so Windows cp1252 cannot blow up on
  // non-ASCII column names in print() calls.
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
        dataset_path: csvPath,
      },
      cb
    );
  });
}

describe('CSV edge cases via real python subprocess', () => {
  it('utf8-columns.csv: training succeeds and column names round-trip', async () => {
    if (!(await pythonAvailable())) return;
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-utf8-'));
    try {
      const result = await runOn(path.join(FIXTURES_DIR, 'utf8-columns.csv'), outDir);
      expect(result.status).toBe('succeeded');
      const runJson = JSON.parse(await fs.readFile(path.join(outDir, 'run.json'), 'utf-8'));
      expect(runJson.label_column).toBe('label');
      expect(runJson.num_features).toBe(2);
      expect(runJson.dataset.path).toContain('utf8-columns.csv');
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('single-class.csv: training does not crash, run.json is produced', async () => {
    if (!(await pythonAvailable())) return;
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rf-single-'));
    try {
      const result = await runOn(path.join(FIXTURES_DIR, 'single-class.csv'), outDir);
      // Single-class is a degenerate case; the runner may either succeed
      // with a valid (degenerate) run.json or fail with a clean exit code.
      // What matters: it does not hang or crash, and behavior is observable.
      expect(typeof result.exit_code).toBe('number');
      if (result.status === 'succeeded') {
        const runJson = JSON.parse(
          await fs.readFile(path.join(outDir, 'run.json'), 'utf-8')
        );
        expect(runJson.schema_version).toBe('run.v0.3.6');
        expect(runJson.num_samples).toBeGreaterThan(0);
      } else {
        // Failure must be reported via the structured RunResult, not a hang.
        expect(result.error).toBeDefined();
      }
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  }, 30_000);
});
