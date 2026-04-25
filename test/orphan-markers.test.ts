/**
 * Tests for `src/observability/orphan-markers.ts` (Stage C Bridge amend).
 *
 * Covers the four required cases per the Stage C contract:
 *  1. Valid markers are enumerated and parsed against the canonical
 *     `IndexOrphanMarker` shape.
 *  2. A run dir with BOTH a valid `run.json` AND a `.index-orphan` is
 *     classified as an orphan (not as a normal indexed run).
 *  3. A run dir with `.index-orphan` but NO `run.json` is logged + skipped
 *     (defensive trip-wire — Python should always write run.json first).
 *  4. A corrupt `.index-orphan` (non-JSON / missing required fields) is
 *     logged + skipped, not thrown.
 *
 * The marker file shape is fabricated directly in test fixtures (per the
 * Stage C handoff: do NOT depend on the parallel Python agent's writer
 * matching the contract yet — both sides conform to the schema independently).
 *
 * No `vscode` module imports here — orphan-markers.ts is pure TS, no UI.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  listOrphanedRuns,
  humanizeOrphanRecovery,
} from '../src/observability/orphan-markers.js';
import {
  ARTIFACT_FILENAMES,
  WORKSPACE_PATHS,
  type IndexOrphanMarker,
} from '../src/types.js';

/** Build a valid `IndexOrphanMarker` payload conforming to the v1.0.0 contract. */
function makeMarker(overrides: Partial<IndexOrphanMarker> = {}): IndexOrphanMarker {
  return {
    schema_version: 'index-orphan.v1.0.0',
    run_id: '20260425-120000-fixture-abcd',
    run_dir: '.ml/runs/20260425-120000-fixture-abcd',
    written_at: '2026-04-25T12:00:00Z',
    error: {
      type: 'PermissionError',
      message: 'Permission denied',
    },
    index_path: '.ml/outputs/index.json',
    ...overrides,
  };
}

/**
 * Create a run directory with optional run.json and optional .index-orphan
 * marker.
 *
 * Mirrors what Python's provenance writer does on the disk surface — we
 * fabricate the artifacts directly because the parallel Python agent's
 * writer code may not be on this branch yet (Stage C contract: TS reader
 * conforms to the JSON schema, not to whatever Python is doing in flight).
 */
async function makeRunDir(
  workspaceRoot: string,
  runId: string,
  opts: {
    withRunJson?: boolean;
    markerContent?: IndexOrphanMarker | string | null;
  }
): Promise<string> {
  const runDir = path.join(workspaceRoot, WORKSPACE_PATHS.RUNS_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });

  if (opts.withRunJson) {
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON),
      JSON.stringify({ run_id: runId, name: 'fixture' }),
      'utf-8'
    );
  }

  if (opts.markerContent !== undefined && opts.markerContent !== null) {
    const body =
      typeof opts.markerContent === 'string'
        ? opts.markerContent
        : JSON.stringify(opts.markerContent);
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER),
      body,
      'utf-8'
    );
  }

  return runDir;
}

describe('listOrphanedRuns', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-orphan-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns empty result when .ml/runs does not exist', async () => {
    const result = await listOrphanedRuns(tmp);
    expect(result.orphans).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('enumerates valid orphan markers + does not surface clean indexed runs', async () => {
    // Run A: orphaned (run.json present + valid marker)
    const orphanA = makeMarker({
      run_id: '20260425-120000-orphan-a001',
      run_dir: '.ml/runs/20260425-120000-orphan-a001',
      error: { type: 'OSError', message: 'No space left on device' },
    });
    await makeRunDir(tmp, '20260425-120000-orphan-a001', {
      withRunJson: true,
      markerContent: orphanA,
    });

    // Run B: clean indexed run (run.json only, no marker) — must NOT appear in
    // the orphan listing.
    await makeRunDir(tmp, '20260425-120100-clean-b002', {
      withRunJson: true,
      markerContent: null,
    });

    // Run C: another orphan (different error.type to exercise the listing).
    const orphanC = makeMarker({
      run_id: '20260425-120200-orphan-c003',
      run_dir: '.ml/runs/20260425-120200-orphan-c003',
      error: { type: 'JSONDecodeError', message: 'Expecting value' },
    });
    await makeRunDir(tmp, '20260425-120200-orphan-c003', {
      withRunJson: true,
      markerContent: orphanC,
    });

    const result = await listOrphanedRuns(tmp);

    expect(result.skipped).toHaveLength(0);
    expect(result.orphans).toHaveLength(2);
    const ids = result.orphans.map((m) => m.run_id).sort();
    expect(ids).toEqual([
      '20260425-120000-orphan-a001',
      '20260425-120200-orphan-c003',
    ]);

    // Shape-conformance spot-check on the parsed marker.
    const a = result.orphans.find((m) => m.run_id === '20260425-120000-orphan-a001');
    expect(a?.schema_version).toBe('index-orphan.v1.0.0');
    expect(a?.error.type).toBe('OSError');
    expect(a?.index_path).toBe('.ml/outputs/index.json');
  });

  it('classifies a run dir with run.json AND .index-orphan as orphan, not as normal', async () => {
    // This is the load-bearing case: Python always writes run.json before
    // attempting the index update. The marker is the signal that the index
    // step failed — the presence of run.json must NOT mask the orphan state.
    const marker = makeMarker({
      run_id: '20260425-130000-both-d004',
      run_dir: '.ml/runs/20260425-130000-both-d004',
    });
    await makeRunDir(tmp, '20260425-130000-both-d004', {
      withRunJson: true,
      markerContent: marker,
    });

    const result = await listOrphanedRuns(tmp);

    expect(result.skipped).toHaveLength(0);
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0].run_id).toBe('20260425-130000-both-d004');
  });

  it('skips + logs a marker without a sibling run.json (MISSING_RUN_JSON)', async () => {
    // Defensive: Python should always write run.json first. If we ever see a
    // marker with no run.json, the workspace is in a worse state than orphan
    // and shouldn't be surfaced as a navigable run.
    const marker = makeMarker({
      run_id: '20260425-140000-no-runjson-e005',
      run_dir: '.ml/runs/20260425-140000-no-runjson-e005',
    });
    await makeRunDir(tmp, '20260425-140000-no-runjson-e005', {
      withRunJson: false,
      markerContent: marker,
    });

    const result = await listOrphanedRuns(tmp);

    expect(result.orphans).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('MISSING_RUN_JSON');
    expect(result.skipped[0].runDirName).toBe('20260425-140000-no-runjson-e005');
  });

  it('skips + logs a corrupt non-JSON marker (CORRUPT_JSON)', async () => {
    await makeRunDir(tmp, '20260425-150000-corrupt-f006', {
      withRunJson: true,
      markerContent: '{not valid json',
    });

    const result = await listOrphanedRuns(tmp);

    expect(result.orphans).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('CORRUPT_JSON');
  });

  it('skips + logs a marker with missing required fields (INVALID_SHAPE)', async () => {
    // Shape-broken marker: missing `error.type` (required by the schema).
    // Stored as raw JSON string so we can omit a required field that the
    // typed `makeMarker` helper would otherwise inject.
    const broken = JSON.stringify({
      schema_version: 'index-orphan.v1.0.0',
      run_id: '20260425-160000-broken-g007',
      run_dir: '.ml/runs/20260425-160000-broken-g007',
      written_at: '2026-04-25T16:00:00Z',
      error: { message: 'no type field' }, // missing `type`
      index_path: '.ml/outputs/index.json',
    });
    await makeRunDir(tmp, '20260425-160000-broken-g007', {
      withRunJson: true,
      markerContent: broken,
    });

    const result = await listOrphanedRuns(tmp);

    expect(result.orphans).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('INVALID_SHAPE');
  });

  it('rejects markers carrying the wrong schema_version (INVALID_SHAPE)', async () => {
    // Future-proofing: if Python ever bumps to v2.0.0 without TS coordinating,
    // we want a clear skip + log path, not a silent misparse.
    const bad = JSON.stringify({
      ...makeMarker(),
      schema_version: 'index-orphan.v2.0.0',
    });
    await makeRunDir(tmp, '20260425-170000-future-h008', {
      withRunJson: true,
      markerContent: bad,
    });

    const result = await listOrphanedRuns(tmp);

    expect(result.orphans).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('INVALID_SHAPE');
  });
});

describe('humanizeOrphanRecovery', () => {
  it('returns permission-aware copy for PermissionError', () => {
    const copy = humanizeOrphanRecovery(
      makeMarker({ error: { type: 'PermissionError', message: 'denied' } })
    );
    expect(copy).toMatch(/permission/i);
    expect(copy).toMatch(/\.ml\/outputs/);
  });

  it('returns disk-full-aware copy for OSError', () => {
    const copy = humanizeOrphanRecovery(
      makeMarker({ error: { type: 'OSError', message: 'No space left' } })
    );
    expect(copy).toMatch(/disk.*full/i);
    expect(copy).toMatch(/Recover Index|re-run/i);
  });

  it('returns rebuild-aware copy for JSONDecodeError', () => {
    const copy = humanizeOrphanRecovery(
      makeMarker({
        error: { type: 'JSONDecodeError', message: 'Expecting value' },
      })
    );
    expect(copy).toMatch(/corrupted/i);
    expect(copy).toMatch(/Recover Index/);
  });

  it('returns generic copy that includes the underlying message for unknown error.type', () => {
    const copy = humanizeOrphanRecovery(
      makeMarker({
        error: { type: 'WeirdNewError', message: 'something off' },
      })
    );
    expect(copy).toMatch(/something off/);
    expect(copy).toMatch(/Open the run folder/i);
  });
});
