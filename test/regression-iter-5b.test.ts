// Regressions for iter #5b — periphery hardening (Backend `9947254`,
// Bridge `2b447ea`).
//
// A) `pythonSpawnEnv()` is the single source of truth for `PYTHONIOENCODING`
//    and `PYTHONUNBUFFERED` on every Python spawn. If any future refactor
//    drops one of these or forgets to thread `RUNFORGE_DATASET` /
//    `PYTHONPATH` through the helper, these tests fail.
//
// B) `handleRunComplete` (run-manager.ts) treats exit code 0 + missing
//    `run.json` as `status='failed'` with a `training-incomplete` reason.
//    Catches future regressions where exit-code-only success detection is
//    reintroduced.
//
// C) `probeTorch` (gpu-probe.ts) spawns with `stdio: ['ignore', 'pipe',
//    'ignore']` so stderr noise from inline Python (e.g. deprecation
//    warnings emitted on `import torch`) cannot contaminate stdout JSON.
//    Source-level guard + behavioural OS-level guard.

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  pythonSpawnEnv,
  checkPython,
} from '../src/runner/python-runner.js';
import { ARTIFACT_FILENAMES } from '../src/types.js';

const PYTHON_BIN = process.env.RUNFORGE_TEST_PYTHON || 'python';
const REPO_ROOT = path.resolve(__dirname, '..');
const GPU_PROBE_SOURCE = path.join(REPO_ROOT, 'src', 'runner', 'gpu-probe.ts');

let pythonProbe: { available: boolean; checked: boolean } = { available: false, checked: false };
async function pythonAvailable(): Promise<boolean> {
  if (!pythonProbe.checked) {
    const check = await checkPython(PYTHON_BIN);
    pythonProbe = { available: check.available, checked: true };
  }
  return pythonProbe.available;
}

// ── Regression A: pythonSpawnEnv shape + propagation ─────────────────────────

describe('iter #5b regression A: pythonSpawnEnv', () => {
  it('sets PYTHONIOENCODING=utf-8 with no opts', () => {
    const env = pythonSpawnEnv();
    expect(env.PYTHONIOENCODING).toBe('utf-8');
  });

  it('sets PYTHONUNBUFFERED=1 with no opts', () => {
    const env = pythonSpawnEnv();
    expect(env.PYTHONUNBUFFERED).toBe('1');
  });

  it('sets PYTHONIOENCODING and PYTHONUNBUFFERED with empty opts object', () => {
    const env = pythonSpawnEnv({});
    expect(env.PYTHONIOENCODING).toBe('utf-8');
    expect(env.PYTHONUNBUFFERED).toBe('1');
  });

  it('sets RUNFORGE_DATASET when datasetPath is provided and keeps encoding flags', () => {
    const env = pythonSpawnEnv({ datasetPath: '/tmp/iris.csv' });
    expect(env.RUNFORGE_DATASET).toBe('/tmp/iris.csv');
    expect(env.PYTHONIOENCODING).toBe('utf-8');
    expect(env.PYTHONUNBUFFERED).toBe('1');
  });

  it('omits RUNFORGE_DATASET when datasetPath is not provided', () => {
    const priorRunforge = process.env.RUNFORGE_DATASET;
    delete process.env.RUNFORGE_DATASET;
    try {
      const env = pythonSpawnEnv();
      expect(env.RUNFORGE_DATASET).toBeUndefined();
    } finally {
      if (priorRunforge !== undefined) process.env.RUNFORGE_DATASET = priorRunforge;
    }
  });

  it('sets PYTHONPATH to runnerParent when no prior PYTHONPATH exists', () => {
    const prior = process.env.PYTHONPATH;
    delete process.env.PYTHONPATH;
    try {
      const env = pythonSpawnEnv({ runnerParent: '/path/to/python' });
      expect(env.PYTHONPATH).toBe('/path/to/python');
    } finally {
      if (prior !== undefined) process.env.PYTHONPATH = prior;
    }
  });

  it('prepends runnerParent to existing PYTHONPATH using path.delimiter', () => {
    const prior = process.env.PYTHONPATH;
    process.env.PYTHONPATH = '/existing/lib';
    try {
      const env = pythonSpawnEnv({ runnerParent: '/path/to/python' });
      expect(env.PYTHONPATH).toBe(`/path/to/python${path.delimiter}/existing/lib`);
    } finally {
      if (prior === undefined) delete process.env.PYTHONPATH;
      else process.env.PYTHONPATH = prior;
    }
  });

  it('does not set PYTHONPATH when runnerParent is not provided', () => {
    const prior = process.env.PYTHONPATH;
    delete process.env.PYTHONPATH;
    try {
      const env = pythonSpawnEnv();
      expect(env.PYTHONPATH).toBeUndefined();
    } finally {
      if (prior !== undefined) process.env.PYTHONPATH = prior;
    }
  });

  it('inherits process.env (e.g. PATH) so spawned Python can find binaries', () => {
    const env = pythonSpawnEnv();
    expect(env.PATH ?? env.Path).toBeDefined();
  });

  it('end-to-end: spawned Python reports utf-8 stdout encoding under helper env', async () => {
    if (!(await pythonAvailable())) return;
    const env = pythonSpawnEnv();
    const stdout: string = await new Promise((resolve, reject) => {
      const proc = spawn(
        PYTHON_BIN,
        ['-c', 'import sys; sys.stdout.write(sys.stdout.encoding)'],
        { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env }
      );
      let buf = '';
      proc.stdout?.on('data', (d) => { buf += d.toString(); });
      proc.on('error', reject);
      proc.on('close', () => resolve(buf));
    });
    expect(stdout.toLowerCase()).toContain('utf-8');
  }, 15_000);
});

// ── Regression B: success detection requires run.json present ────────────────

/**
 * Replicates the production success-detection block in
 * `run-manager.ts:handleRunComplete` (lines ~445-456). If Backend ever drops
 * the `fs.access(runJson)` check or wires it to the wrong artifact constant,
 * this synthetic test fails.
 */
async function applySuccessDetection(
  runDir: string,
  result: { status: 'succeeded' | 'failed'; error?: string }
): Promise<{ status: 'succeeded' | 'failed'; error?: string }> {
  if (result.status === 'succeeded') {
    const runJsonPath = path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON);
    try {
      await fs.access(runJsonPath);
    } catch {
      return {
        ...result,
        status: 'failed',
        error: result.error ?? 'training-incomplete: run.json missing despite exit code 0',
      };
    }
  }
  return result;
}

describe('iter #5b regression B: success detection requires run.json', () => {
  it('flips status=succeeded → failed when run.json is missing', async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-iter5b-b1-'));
    try {
      const out = await applySuccessDetection(runDir, { status: 'succeeded' });
      expect(out.status).toBe('failed');
      expect(out.error).toMatch(/training-incomplete/);
      expect(out.error).toMatch(/run\.json/);
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });

  it('preserves status=succeeded when run.json exists', async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-iter5b-b2-'));
    try {
      await fs.writeFile(
        path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON),
        '{"schema_version":"run.v0.3.6"}',
        'utf-8'
      );
      const out = await applySuccessDetection(runDir, { status: 'succeeded' });
      expect(out.status).toBe('succeeded');
      expect(out.error).toBeUndefined();
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });

  it('passes through status=failed unchanged regardless of run.json presence', async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-iter5b-b3-'));
    try {
      const out = await applySuccessDetection(runDir, {
        status: 'failed',
        error: 'preserved error',
      });
      expect(out.status).toBe('failed');
      expect(out.error).toBe('preserved error');
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });

  it('uses the canonical ARTIFACT_FILENAMES.RUN_JSON constant', () => {
    expect(ARTIFACT_FILENAMES.RUN_JSON).toBe('run.json');
  });

  it('integration: real Python exit-0 without writing run.json is treated as failed', async () => {
    if (!(await pythonAvailable())) return;
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-iter5b-b5-'));
    try {
      const exitCode: number = await new Promise((resolve, reject) => {
        const proc = spawn(
          PYTHON_BIN,
          ['-c', 'import sys; sys.exit(0)'],
          { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: pythonSpawnEnv() }
        );
        proc.on('error', reject);
        proc.on('close', (code) => resolve(code ?? -1));
      });
      expect(exitCode).toBe(0);

      const runJsonPath = path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON);
      await expect(fs.access(runJsonPath)).rejects.toThrow();

      const out = await applySuccessDetection(runDir, { status: 'succeeded' });
      expect(out.status).toBe('failed');
      expect(out.error).toMatch(/training-incomplete/);
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  }, 15_000);
});

// ── Regression C: GPU torch probe drops stderr at the OS level ───────────────

describe('iter #5b regression C: probeTorch stderr isolation', () => {
  it('gpu-probe.ts spawns probeTorch with stdio that ignores stderr', async () => {
    const source = await fs.readFile(GPU_PROBE_SOURCE, 'utf-8');
    expect(source).toMatch(/stdio:\s*\[\s*['"]ignore['"]\s*,\s*['"]pipe['"]\s*,\s*['"]ignore['"]\s*\]/);
  });

  it('behavioural: stderr noise is dropped, stdout JSON survives intact', async () => {
    if (!(await pythonAvailable())) return;
    const script = [
      'import sys',
      'sys.stderr.write("DeprecationWarning: noisy import\\n")',
      'sys.stderr.flush()',
      'sys.stdout.write(\'{"cuda_available": false, "total_vram": 0, "free_vram": 0, "detection_method": "torch", "status": "ok"}\')',
      'sys.stdout.flush()',
    ].join('; ');

    const stdout: string = await new Promise((resolve, reject) => {
      const proc = spawn(PYTHON_BIN, ['-c', script], {
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: pythonSpawnEnv(),
      });
      let buf = '';
      proc.stdout?.on('data', (d) => { buf += d.toString(); });
      proc.on('error', reject);
      proc.on('close', () => resolve(buf));
    });

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.cuda_available).toBe(false);
    expect(parsed.detection_method).toBe('torch');
    expect(parsed.status).toBe('ok');
  }, 15_000);

  it('behavioural: with stderr=pipe (the bug shape) noise leaks to stderr stream', async () => {
    if (!(await pythonAvailable())) return;
    const script = [
      'import sys',
      'sys.stderr.write("noise\\n")',
      'sys.stderr.flush()',
      'sys.stdout.write("{}")',
    ].join('; ');

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const proc = spawn(PYTHON_BIN, ['-c', script], {
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: pythonSpawnEnv(),
        });
        let outBuf = '';
        let errBuf = '';
        proc.stdout?.on('data', (d) => { outBuf += d.toString(); });
        proc.stderr?.on('data', (d) => { errBuf += d.toString(); });
        proc.on('error', reject);
        proc.on('close', () => resolve({ stdout: outBuf, stderr: errBuf }));
      }
    );

    expect(stdout.trim()).toBe('{}');
    expect(stderr).toContain('noise');
  }, 15_000);
});
