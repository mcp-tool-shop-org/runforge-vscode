// Regression for F-COORD-008 (Stage A iter #3): observability layer must read from
// the canonical `.ml/` paths that the workspace write-path produces.
//
// Iter #2's regression (test/regression-coord-003.test.ts) caught spawn-form drift
// but tested observability in isolation, not chained from the production write path.
// The backend wrote to `.ml/runs/<id>/` (per WORKSPACE_PATHS) while observability
// commands hardcoded `.runforge/`. The chain broke silently: train succeeded,
// view-runs returned empty.
//
// POST iter #5a UPDATE: Backend's `ec81781` deleted `appendToIndex` from the TS
// extension — Python ml_runner is now the single writer of `.ml/outputs/index.json`
// (see test/regression-iter-5a.test.ts for the full Python → TS chain). The path-
// canonicality contract this regression covers is unchanged: the observability read
// helpers must locate what the writer (whoever it is) produces under `.ml/`. Here
// we exercise the read chain against a workspace whose `.ml/` layout was
// materialised the same way Python materialises it (run dir + canonical index.json
// written via `fs.writeFile`, same on-disk shape).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { WORKSPACE_PATHS } from '../src/types.js';
import { createRunFolder, generateRunId } from '../src/workspace/run-folder.js';
import { createTimestamp } from '../src/workspace/index-manager.js';
import {
  getLatestRunDir,
  safeReadIndex,
  safeReadRunJson,
} from '../src/observability/fs-safe.js';

describe('F-COORD-008 regression: observability read-chain resolves canonical .ml/ paths', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-coord008-'));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('canonical WORKSPACE_PATHS still points at .ml/', () => {
    // Sanity gate — if this constant drifts, every assertion below is moot.
    expect(WORKSPACE_PATHS.ML_ROOT).toBe('.ml');
    expect(WORKSPACE_PATHS.RUNS_DIR).toBe('.ml/runs');
    expect(WORKSPACE_PATHS.OUTPUTS_DIR).toBe('.ml/outputs');
    expect(WORKSPACE_PATHS.INDEX_FILE).toBe('.ml/outputs/index.json');
  });

  it('write chain (createRunFolder + canonical index emit) materialises .ml/ layout on disk', async () => {
    const runId = generateRunId('coord008');
    const runDir = await createRunFolder(workspaceRoot, runId);

    // Physical path assertion — run dir must land under `.ml/runs/`, not anywhere else.
    const expectedRunDir = path.join(workspaceRoot, '.ml', 'runs', runId);
    expect(runDir).toBe(expectedRunDir);
    const runDirStat = await fs.stat(runDir);
    expect(runDirStat.isDirectory()).toBe(true);

    const artifactsStat = await fs.stat(path.join(runDir, 'artifacts'));
    expect(artifactsStat.isDirectory()).toBe(true);

    // Simulate Python ml_runner emitting the canonical index entry to
    // `.ml/outputs/index.json`. The writer is no longer in TS (iter #5a
    // consolidation); we materialise the same on-disk shape the writer
    // produces so the read chain has something to find.
    const outputsDir = path.join(workspaceRoot, '.ml', 'outputs');
    await fs.mkdir(outputsDir, { recursive: true });
    const canonicalIndex = {
      schema_version: '1.0.0',
      runs: [
        {
          run_id: runId,
          created_at: createTimestamp(),
          name: 'coord008',
          preset_id: 'std-train',
          status: 'succeeded',
          summary: {
            duration_ms: 1234,
            final_metrics: { accuracy: 0.95 },
            device: 'cpu',
          },
          run_dir: `.ml/runs/${runId}`,
          dataset_fingerprint_sha256: 'a'.repeat(64),
          label_column: 'label',
          model_pkl: `.ml/runs/${runId}/artifacts/model.pkl`,
        },
      ],
    };
    await fs.writeFile(
      path.join(outputsDir, 'index.json'),
      JSON.stringify(canonicalIndex, null, 2),
      'utf-8'
    );

    const indexPath = path.join(workspaceRoot, '.ml', 'outputs', 'index.json');
    const indexStat = await fs.stat(indexPath);
    expect(indexStat.isFile()).toBe(true);

    // Negative assertion — no `.runforge/` directory was produced by any layer.
    const runforgeExists = await fs
      .access(path.join(workspaceRoot, '.runforge'))
      .then(() => true)
      .catch(() => false);
    expect(runforgeExists).toBe(false);
  });

  it('read chain (getLatestRunDir + safeReadIndex + safeReadRunJson) resolves the same .ml/ layout', async () => {
    const runId = generateRunId('coord008');
    const runDir = await createRunFolder(workspaceRoot, runId);

    // Drop a minimal valid run.json that matches run.schema.v0.3.x for safeReadRunJson.
    const runJson = {
      run_id: runId,
      runforge_version: '1.0.0-test',
      schema_version: 'run.v0.3.6',
      created_at: createTimestamp(),
      dataset: {
        path: 'test/fixtures/iris-tiny.csv',
        fingerprint_sha256: 'a'.repeat(64),
      },
      label_column: 'species',
      model_family: 'logistic_regression',
      num_samples: 15,
      num_features: 4,
    };
    await fs.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify(runJson, null, 2),
      'utf-8'
    );

    // Write the canonical index.json shape ({schema_version, runs: [...]})
    // — the on-disk shape Python ml_runner emits since iter #5a. The
    // canonical IndexEntry uses `dataset_fingerprint_sha256` (not the
    // pre-iter-#5a `dataset_fingerprint`).
    const outputsDir = path.join(workspaceRoot, '.ml', 'outputs');
    await fs.mkdir(outputsDir, { recursive: true });
    const canonicalIndex = {
      schema_version: '1.0.0',
      runs: [
        {
          run_id: runId,
          created_at: runJson.created_at,
          name: 'coord008',
          preset_id: 'std-train',
          status: 'succeeded',
          summary: {
            duration_ms: 1234,
            final_metrics: { accuracy: 0.95 },
            device: 'cpu',
          },
          run_dir: `.ml/runs/${runId}`,
          dataset_fingerprint_sha256: 'a'.repeat(64),
          label_column: 'species',
          model_pkl: `.ml/runs/${runId}/artifacts/model.pkl`,
        },
      ],
    };
    await fs.writeFile(
      path.join(outputsDir, 'index.json'),
      JSON.stringify(canonicalIndex, null, 2),
      'utf-8'
    );

    // READ CHAIN — exercise all three observability helpers.
    const latest = getLatestRunDir(workspaceRoot);
    expect(latest).not.toBeNull();
    expect(latest).toBe(runDir);
    // Defensive: path must start under `.ml/runs/`, never under `.runforge/`.
    const relFromRoot = path.relative(workspaceRoot, latest!).replace(/\\/g, '/');
    expect(relFromRoot.startsWith('.ml/runs/')).toBe(true);
    expect(relFromRoot.startsWith('.runforge/')).toBe(false);

    const indexResult = await safeReadIndex(workspaceRoot);
    expect(indexResult.ok).toBe(true);
    if (indexResult.ok) {
      expect(indexResult.value.runs).toHaveLength(1);
      expect(indexResult.value.runs[0].run_id).toBe(runId);
      expect(indexResult.value.runs[0].run_dir).toBe(`.ml/runs/${runId}`);
      // Canonical field name (post iter #5a) — Bridge's 2ca61b8 enforces
      // `dataset_fingerprint_sha256` everywhere downstream.
      expect(indexResult.value.runs[0].dataset_fingerprint_sha256).toMatch(/^[a-f0-9]{64}$/);
    }

    const runJsonResult = await safeReadRunJson(workspaceRoot, `.ml/runs/${runId}`);
    expect(runJsonResult.ok).toBe(true);
    if (runJsonResult.ok) {
      const schemaVersion = runJsonResult.value.schema_version;
      expect(typeof schemaVersion).toBe('string');
      expect((schemaVersion as string).startsWith('run.v0.3')).toBe(true);
      expect(runJsonResult.value.run_id).toBe(runId);
    }
  });
});
