// Regression for iter #5a (architectural consolidation): full Python-writer →
// TS-reader CALL CHAIN via real subprocess, no stubbing.
//
// iter #5a deleted the TS-side index writer (`appendToIndex` /
// `ensureIndex` / `validateIndexEntry`) and made Python ml_runner the SINGLE
// writer of `<workspace>/.ml/outputs/index.json` (Backend's `ec81781`,
// Python's `3fcf8ec`). Bridge's `2ca61b8` collapsed the observability shadow
// types onto the canonical types in `src/types.ts` and renamed
// `dataset_fingerprint` → `dataset_fingerprint_sha256` at every consumer.
//
// `test/regression-coord-008.test.ts` and `test/regression-coord-010.test.ts`
// exercise canonical PATHS and the on-disk SHAPE — but they synthesize the
// writer side in TS to stay fast. The point of THIS regression is to exercise
// the full chain end-to-end through a real Python subprocess: spawn `python -m
// ml_runner train`, let it write `index.json`, then read it back through the
// TS production reader (`safeReadIndex`) and assert all 10 canonical
// `IndexEntry` fields land where the canonical type says they land.
//
// If iter #6 (or any future change) drifts the writer field names, the TS
// reader's tightened canonical types, or the migration shim, this test fails
// at the chain boundary — not deep inside one side.
//
// Skipped automatically when `python` is not on PATH (matches the boundary
// test pattern).

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  checkPython,
  spawnRunner,
  type RunnerCallbacks,
} from '../src/runner/python-runner.js';
import { safeReadIndex } from '../src/observability/fs-safe.js';
import type { RunResult } from '../src/types.js';
import { WORKSPACE_PATHS } from '../src/types.js';

const PYTHON_BIN = process.env.RUNFORGE_TEST_PYTHON || 'python';
const REPO_ROOT = path.resolve(__dirname, '..');
const PYTHON_PKG_DIR = path.join(REPO_ROOT, 'python');
const FIXTURE_CSV = path.join(REPO_ROOT, 'test', 'fixtures', 'iris-tiny.csv');

let pythonProbe: { available: boolean; checked: boolean } = { available: false, checked: false };

async function pythonAvailable(): Promise<boolean> {
  if (!pythonProbe.checked) {
    const check = await checkPython(PYTHON_BIN);
    pythonProbe = { available: check.available, checked: true };
  }
  return pythonProbe.available;
}

/**
 * Spawn the production Python runner against the canonical .ml workspace
 * layout. Mirrors the args the TS extension assembles in `python-runner.ts`,
 * including `--name` (the iter #5a CLI arg) so the canonical IndexEntry's
 * `name` field is exercised through the chain.
 */
function spawnTrain(opts: {
  workspaceRoot: string;
  runDir: string;
  name: string;
  seed: number;
}): Promise<RunResult> {
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
        run_dir: opts.runDir,
        name: opts.name,
        seed: opts.seed,
        device: 'cpu',
        cwd: PYTHON_PKG_DIR,
        dataset_path: FIXTURE_CSV,
      },
      cb
    );
  });
}

describe('iter #5a regression: Python writer → TS reader full chain', () => {
  it('python -m ml_runner train writes canonical index.json that safeReadIndex consumes', async () => {
    if (!(await pythonAvailable())) return;

    // Materialise a workspace with the canonical `.ml/runs/<runId>/` layout.
    // The runner walks up from `--out` looking for an `.ml` ancestor; the
    // `_find_workspace_outputs_dir` helper is what writes index.json under
    // `<ws>/.ml/outputs/`.
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-iter5a-'));
    try {
      // NOTE: Python ml_runner generates its OWN run_id internally based on a
      // dataset/label hash (see `metadata.generate_run_id`); the `--out`
      // directory name is just where artifacts land. We pre-create the dir
      // but don't assume run_id matches its leaf name. The chain assertion
      // below verifies whatever run_id Python emits round-trips through the
      // index entry.
      const outDirLeaf = `iter5a-out-${Date.now().toString(36)}`;
      const runDir = path.join(workspaceRoot, '.ml', 'runs', outDirLeaf);
      const outputsDir = path.join(workspaceRoot, '.ml', 'outputs');
      await fs.mkdir(runDir, { recursive: true });
      await fs.mkdir(outputsDir, { recursive: true });

      // PHASE 1 — Python is the writer.
      const result = await spawnTrain({
        workspaceRoot,
        runDir,
        name: 'test-run',
        seed: 42,
      });
      expect(result.status).toBe('succeeded');
      expect(result.exit_code).toBe(0);

      // Sanity — Python materialised index.json at the canonical path.
      const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);
      const indexStat = await fs.stat(indexPath);
      expect(indexStat.isFile()).toBe(true);

      // PHASE 2 — TS is the reader. Production path: `safeReadIndex`.
      const readResult = await safeReadIndex(workspaceRoot);
      expect(readResult.ok).toBe(true);
      if (!readResult.ok) return;

      // Schema version stamped by Python (post iter #5a Python bumped to 1.0.0).
      expect(readResult.value.schema_version).toBe('1.0.0');

      // Exactly one entry — the run we just trained.
      expect(readResult.value.runs).toHaveLength(1);
      const entry = readResult.value.runs[0];

      // ALL 10 CANONICAL FIELDS must be present and well-typed.
      // (1) run_id — generated by Python (`generate_run_id` from
      // dataset+label). Format: YYYYMMDD-HHMMSS-<shortHash>.
      expect(typeof entry.run_id).toBe('string');
      expect(entry.run_id).toMatch(/^\d{8}-\d{6}-[a-f0-9]+$/);

      // (2) created_at — ISO-8601 timestamp emitted by Python.
      expect(typeof entry.created_at).toBe('string');
      expect(new Date(entry.created_at).getTime()).not.toBeNaN();

      // (3) name — passed via `--name` CLI arg (iter #5a feature).
      expect(entry.name).toBe('test-run');

      // (4) preset_id — passed via `--preset`.
      expect(entry.preset_id).toBe('std-train');

      // (5) status — Python writes 'succeeded' on the success path.
      expect(entry.status).toBe('succeeded');

      // (6) summary — object with duration_ms / final_metrics / device.
      expect(typeof entry.summary).toBe('object');
      expect(entry.summary).not.toBeNull();
      expect(typeof entry.summary.duration_ms).toBe('number');
      expect(entry.summary.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof entry.summary.final_metrics).toBe('object');
      expect(entry.summary.device).toBe('cpu');

      // (7) run_dir — workspace-relative with forward slashes. Points at the
      // `--out` directory we created (the leaf name we pre-materialised).
      expect(typeof entry.run_dir).toBe('string');
      expect(entry.run_dir.startsWith('.ml/runs/')).toBe(true);
      expect(entry.run_dir).not.toContain('\\');
      expect(entry.run_dir).toContain(outDirLeaf);

      // (8) dataset_fingerprint_sha256 — 64 lowercase hex chars (the canonical
      // field name post Bridge's 2ca61b8 rename).
      expect(typeof entry.dataset_fingerprint_sha256).toBe('string');
      expect(entry.dataset_fingerprint_sha256).toMatch(/^[a-f0-9]{64}$/);

      // (9) label_column — "label" for the iris-tiny fixture.
      expect(typeof entry.label_column).toBe('string');
      expect(entry.label_column.length).toBeGreaterThan(0);

      // (10) model_pkl — workspace-relative path to the trained model.
      expect(typeof entry.model_pkl).toBe('string');
      expect(entry.model_pkl.endsWith('model.pkl')).toBe(true);
      expect(entry.model_pkl).not.toContain('\\');
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
