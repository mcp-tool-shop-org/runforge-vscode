/**
 * Tests for `src/observability/recover-index-command.ts` (FT-BACK-002,
 * Phase 4 Wave 3).
 *
 * Covers the seven required cases per the FT-BACK-002 contract:
 *  1. Empty workspace (no `.ml/runs/`) → empty report.
 *  2. All runs already indexed → all in `already_indexed`, nothing recovered.
 *  3. Run dir with `.index-orphan` marker + run.json → recovered with
 *     `reason: 'index_orphan_marker'`, marker deleted, index updated.
 *  4. Run dir with `.cancelled` marker + no run.json → in
 *     `cancelled_excluded` with `reason: 'cancelled'`, NOT in index.
 *  5. Run dir with corrupt run.json → in `skipped` with
 *     `error: 'CORRUPT_RUN_JSON'`.
 *  6. Idempotent: second call returns empty `recovered[]`, all in
 *     `already_indexed`.
 *  7. Mixed scenario: one of each — report classifies all correctly.
 *
 * Tests exercise the pure `recoverIndexForWorkspace` function — no `vscode`
 * module touched here. The command wrapper that drives the
 * `vscode.window.showInformationMessage` surface is exercised via the
 * extension-host smoke test (FT-TEST-001 scenario 5).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock vscode (recover-index-command.ts imports it at module level for the
// command wrapper; the tests target the pure recoverIndexForWorkspace
// function and never call into the vscode-bound surface).
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showTextDocument: () => Promise.resolve(undefined),
  },
  workspace: {
    workspaceFolders: undefined,
    openTextDocument: () => Promise.resolve(undefined),
  },
}));

import { recoverIndexForWorkspace } from '../src/observability/recover-index-command.js';
import {
  ARTIFACT_FILENAMES,
  WORKSPACE_PATHS,
  type IndexCancelledMarker,
  type IndexEntry,
  type IndexOrphanMarker,
  type RunIndex,
  type RunMetadata,
} from '../src/types.js';

/**
 * Build a minimal-but-valid `RunMetadata` payload that conforms to
 * run.schema.v0.3.6 — every field consulted by
 * `buildIndexEntryFromRunJson` is populated so the recovery flow can
 * synthesize a canonical IndexEntry.
 */
function makeRunJson(overrides: Partial<RunMetadata> = {}): RunMetadata {
  const runId = overrides.run_id ?? '20260425-120000-fixture-abcd';
  return {
    run_id: runId,
    runforge_version: '1.0.1',
    schema_version: 'run.v0.3.6',
    created_at: '2026-04-25T12:00:00Z',
    dataset: {
      path: 'data/fixture.csv',
      fingerprint_sha256:
        '0000000000000000000000000000000000000000000000000000000000000000',
    },
    label_column: 'label',
    model_family: 'logistic_regression',
    num_samples: 100,
    num_features: 4,
    dropped_rows_missing_values: 0,
    metrics: {
      accuracy: 0.95,
      num_samples: 100,
      num_features: 4,
    },
    metrics_v1: {
      schema_version: 'metrics.v1',
      metrics_profile: 'classification.base.v1',
      artifact_path: 'metrics.v1.json',
    },
    artifacts: {
      model_pkl: 'model.pkl',
      metrics_v1_json: 'metrics.v1.json',
    },
    ...overrides,
  };
}

function makeOrphanMarker(runId: string, runDir: string): IndexOrphanMarker {
  return {
    schema_version: 'index-orphan.v1.0.0',
    run_id: runId,
    run_dir: runDir,
    written_at: '2026-04-25T12:00:00Z',
    error: { type: 'PermissionError', message: 'Permission denied' },
    index_path: '.ml/outputs/index.json',
  };
}

function makeCancelledMarker(
  runId: string,
  runDir: string
): IndexCancelledMarker {
  return {
    schema_version: 'cancelled.v1.0.0',
    run_id: runId,
    run_dir: runDir,
    cancelled_at: '2026-04-25T12:00:00Z',
    step: 'training',
  };
}

/**
 * Create a run dir with optional run.json + optional orphan/cancelled
 * markers. Mirrors the fixture-builder shape used in
 * `test/orphan-markers.test.ts`.
 */
async function makeRunDir(
  workspaceRoot: string,
  runId: string,
  opts: {
    runJson?: RunMetadata | string | null;
    orphanMarker?: IndexOrphanMarker | string | null;
    cancelledMarker?: IndexCancelledMarker | string | null;
  }
): Promise<string> {
  const runDir = path.join(workspaceRoot, WORKSPACE_PATHS.RUNS_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });

  if (opts.runJson !== undefined && opts.runJson !== null) {
    const body =
      typeof opts.runJson === 'string'
        ? opts.runJson
        : JSON.stringify(opts.runJson);
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON),
      body,
      'utf-8'
    );
  }

  if (opts.orphanMarker !== undefined && opts.orphanMarker !== null) {
    const body =
      typeof opts.orphanMarker === 'string'
        ? opts.orphanMarker
        : JSON.stringify(opts.orphanMarker);
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER),
      body,
      'utf-8'
    );
  }

  if (opts.cancelledMarker !== undefined && opts.cancelledMarker !== null) {
    const body =
      typeof opts.cancelledMarker === 'string'
        ? opts.cancelledMarker
        : JSON.stringify(opts.cancelledMarker);
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER),
      body,
      'utf-8'
    );
  }

  return runDir;
}

/** Build an `IndexEntry` matching the fixture run.json so we can pre-seed the index. */
function makeIndexEntry(runId: string): IndexEntry {
  return {
    run_id: runId,
    created_at: '2026-04-25T12:00:00Z',
    name: 'fixture',
    preset_id: 'std-train',
    status: 'succeeded',
    summary: {
      duration_ms: 1234,
      final_metrics: { accuracy: 0.95 },
      device: 'cpu',
    },
    run_dir: `.ml/runs/${runId}`,
    dataset_fingerprint_sha256:
      '0000000000000000000000000000000000000000000000000000000000000000',
    label_column: 'label',
    model_pkl: `.ml/runs/${runId}/model.pkl`,
  };
}

async function writeIndex(
  workspaceRoot: string,
  index: RunIndex
): Promise<void> {
  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

async function readIndex(workspaceRoot: string): Promise<RunIndex> {
  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);
  const body = await fs.readFile(indexPath, 'utf-8');
  return JSON.parse(body) as RunIndex;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe('recoverIndexForWorkspace', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-recover-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('empty workspace → zero counts, empty arrays, ISO timestamp', async () => {
    const report = await recoverIndexForWorkspace(tmp);
    expect(report.scanned_run_dirs).toBe(0);
    expect(report.already_indexed).toBe(0);
    expect(report.recovered).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.cancelled_excluded).toEqual([]);
    expect(typeof report.recovered_at).toBe('string');
    // ISO 8601 UTC sanity: includes "T" and ends with "Z".
    expect(report.recovered_at).toMatch(/T.*Z$/);
  });

  it('all runs already indexed → only already_indexed counter increments', async () => {
    const runIdA = '20260425-120000-already-a001';
    const runIdB = '20260425-120100-already-b002';

    await makeRunDir(tmp, runIdA, { runJson: makeRunJson({ run_id: runIdA }) });
    await makeRunDir(tmp, runIdB, { runJson: makeRunJson({ run_id: runIdB }) });

    await writeIndex(tmp, {
      schema_version: '0.2.2.1',
      runs: [makeIndexEntry(runIdA), makeIndexEntry(runIdB)],
    });

    const report = await recoverIndexForWorkspace(tmp);

    expect(report.scanned_run_dirs).toBe(2);
    expect(report.already_indexed).toBe(2);
    expect(report.recovered).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.cancelled_excluded).toEqual([]);

    // Index file must remain at length 2 (no duplicates appended).
    const after = await readIndex(tmp);
    expect(after.runs).toHaveLength(2);
  });

  it('orphan-marker run is recovered, marker deleted, index updated', async () => {
    const runId = '20260425-130000-orphan-c003';
    const runDirRel = `.ml/runs/${runId}`;
    await makeRunDir(tmp, runId, {
      runJson: makeRunJson({ run_id: runId }),
      orphanMarker: makeOrphanMarker(runId, runDirRel),
    });

    // Empty existing index — recovery is the literal use case for missing
    // index, so absence here exercises the "treat as empty" branch.
    const report = await recoverIndexForWorkspace(tmp);

    expect(report.scanned_run_dirs).toBe(1);
    expect(report.already_indexed).toBe(0);
    expect(report.recovered).toHaveLength(1);
    expect(report.recovered[0]).toMatchObject({
      run_id: runId,
      run_dir: runDirRel,
      reason: 'index_orphan_marker',
    });
    expect(report.skipped).toEqual([]);
    expect(report.cancelled_excluded).toEqual([]);

    // Marker must be deleted (signal is stale post-recovery).
    const markerPath = path.join(
      tmp,
      WORKSPACE_PATHS.RUNS_DIR,
      runId,
      ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER
    );
    expect(await exists(markerPath)).toBe(false);

    // Index must contain the recovered run.
    const after = await readIndex(tmp);
    expect(after.runs).toHaveLength(1);
    expect(after.runs[0].run_id).toBe(runId);
    expect(after.runs[0].run_dir).toBe(runDirRel);
    expect(after.runs[0].dataset_fingerprint_sha256).toBe(
      '0000000000000000000000000000000000000000000000000000000000000000'
    );
    expect(after.runs[0].model_pkl).toBe(`${runDirRel}/model.pkl`);
  });

  it('cancelled marker without run.json → cancelled_excluded, NOT indexed', async () => {
    const runId = '20260425-140000-cancelled-d004';
    const runDirRel = `.ml/runs/${runId}`;
    await makeRunDir(tmp, runId, {
      runJson: null,
      cancelledMarker: makeCancelledMarker(runId, runDirRel),
    });

    const report = await recoverIndexForWorkspace(tmp);

    expect(report.scanned_run_dirs).toBe(1);
    expect(report.already_indexed).toBe(0);
    expect(report.recovered).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.cancelled_excluded).toHaveLength(1);
    expect(report.cancelled_excluded[0]).toMatchObject({
      run_id: runId,
      run_dir: runDirRel,
      reason: 'cancelled',
    });

    // No index should have been written (recovered.length === 0 means we
    // skip the atomic write; for the empty workspace that means the file
    // never appears).
    const indexPath = path.join(tmp, WORKSPACE_PATHS.INDEX_FILE);
    expect(await exists(indexPath)).toBe(false);
  });

  it('corrupt run.json → skipped with CORRUPT_RUN_JSON error', async () => {
    const runId = '20260425-150000-corrupt-e005';
    await makeRunDir(tmp, runId, {
      runJson: '{this is not valid json',
    });

    const report = await recoverIndexForWorkspace(tmp);

    expect(report.scanned_run_dirs).toBe(1);
    expect(report.recovered).toEqual([]);
    expect(report.cancelled_excluded).toEqual([]);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].error).toBe('CORRUPT_RUN_JSON');
    expect(report.skipped[0].run_dir).toBe(`.ml/runs/${runId}`);
  });

  it('idempotent: second call returns empty recovered[], all in already_indexed', async () => {
    const runId = '20260425-160000-idempotent-f006';
    const runDirRel = `.ml/runs/${runId}`;
    await makeRunDir(tmp, runId, {
      runJson: makeRunJson({ run_id: runId }),
      orphanMarker: makeOrphanMarker(runId, runDirRel),
    });

    const first = await recoverIndexForWorkspace(tmp);
    expect(first.recovered).toHaveLength(1);
    expect(first.already_indexed).toBe(0);

    const second = await recoverIndexForWorkspace(tmp);
    expect(second.scanned_run_dirs).toBe(1);
    expect(second.recovered).toEqual([]);
    expect(second.already_indexed).toBe(1);
    expect(second.skipped).toEqual([]);
    expect(second.cancelled_excluded).toEqual([]);

    // Index still has exactly one entry (no duplication).
    const after = await readIndex(tmp);
    expect(after.runs).toHaveLength(1);
    expect(after.runs[0].run_id).toBe(runId);
  });

  it('mixed scenario: one of each (already-indexed + orphan + cancelled + corrupt) classified correctly', async () => {
    // Already-indexed
    const runIdAlready = '20260425-120000-already-a001';
    await makeRunDir(tmp, runIdAlready, {
      runJson: makeRunJson({ run_id: runIdAlready }),
    });

    // Orphan with marker
    const runIdOrphan = '20260425-130000-orphan-b002';
    const orphanRunDirRel = `.ml/runs/${runIdOrphan}`;
    await makeRunDir(tmp, runIdOrphan, {
      runJson: makeRunJson({ run_id: runIdOrphan }),
      orphanMarker: makeOrphanMarker(runIdOrphan, orphanRunDirRel),
    });

    // Pre-existing orphan (no marker, just unindexed run.json — covers the
    // 'pre_existing_orphan' branch)
    const runIdPreOrphan = '20260425-130500-preorphan-x999';
    await makeRunDir(tmp, runIdPreOrphan, {
      runJson: makeRunJson({ run_id: runIdPreOrphan }),
    });

    // Cancelled (no run.json)
    const runIdCancelled = '20260425-140000-cancelled-c003';
    await makeRunDir(tmp, runIdCancelled, {
      runJson: null,
      cancelledMarker: makeCancelledMarker(
        runIdCancelled,
        `.ml/runs/${runIdCancelled}`
      ),
    });

    // Corrupt run.json
    const runIdCorrupt = '20260425-150000-corrupt-d004';
    await makeRunDir(tmp, runIdCorrupt, {
      runJson: '{not json',
    });

    await writeIndex(tmp, {
      schema_version: '0.2.2.1',
      runs: [makeIndexEntry(runIdAlready)],
    });

    const report = await recoverIndexForWorkspace(tmp);

    expect(report.scanned_run_dirs).toBe(5);
    expect(report.already_indexed).toBe(1);

    expect(report.recovered).toHaveLength(2);
    const recoveredById = new Map(
      report.recovered.map((entry) => [entry.run_id, entry])
    );
    expect(recoveredById.get(runIdOrphan)?.reason).toBe('index_orphan_marker');
    expect(recoveredById.get(runIdPreOrphan)?.reason).toBe('pre_existing_orphan');

    expect(report.cancelled_excluded).toHaveLength(1);
    expect(report.cancelled_excluded[0].run_id).toBe(runIdCancelled);
    expect(report.cancelled_excluded[0].reason).toBe('cancelled');

    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].error).toBe('CORRUPT_RUN_JSON');

    // Index should now contain 1 (already) + 2 (recovered) = 3 entries.
    const after = await readIndex(tmp);
    expect(after.runs).toHaveLength(3);
    const finalIds = after.runs.map((r) => r.run_id).sort();
    expect(finalIds).toEqual(
      [runIdAlready, runIdOrphan, runIdPreOrphan].sort()
    );

    // Cancelled run must NOT appear in the index (per §3.1.2).
    expect(finalIds).not.toContain(runIdCancelled);
    // Corrupt run must NOT appear in the index either.
    expect(finalIds).not.toContain(runIdCorrupt);

    // Orphan marker for the recovered orphan must be deleted; cancelled
    // marker stays where it is (still surfaced via the orphan/cancelled
    // picker — recovery doesn't touch cancelled markers).
    const orphanMarkerPath = path.join(
      tmp,
      WORKSPACE_PATHS.RUNS_DIR,
      runIdOrphan,
      ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER
    );
    expect(await exists(orphanMarkerPath)).toBe(false);

    const cancelledMarkerPath = path.join(
      tmp,
      WORKSPACE_PATHS.RUNS_DIR,
      runIdCancelled,
      ARTIFACT_FILENAMES.CANCELLED_MARKER
    );
    expect(await exists(cancelledMarkerPath)).toBe(true);
  });

  it('treats a missing index.json as empty index (the literal recovery use case)', async () => {
    // Workspace with a run.json but no index.json at all — recovery should
    // treat this as starting from an empty index, not throw.
    const runId = '20260425-170000-noindex-g007';
    await makeRunDir(tmp, runId, {
      runJson: makeRunJson({ run_id: runId }),
    });

    const report = await recoverIndexForWorkspace(tmp);

    expect(report.recovered).toHaveLength(1);
    expect(report.recovered[0].reason).toBe('pre_existing_orphan');
    expect(report.already_indexed).toBe(0);

    const after = await readIndex(tmp);
    expect(after.runs).toHaveLength(1);
    expect(after.schema_version).toBe('0.2.2.1');
  });
});
