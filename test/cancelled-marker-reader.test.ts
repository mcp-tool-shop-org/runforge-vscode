/**
 * Tests for `src/observability/cancelled-marker-reader.ts` (FT-BACK-001 / Phase 4 Wave 2).
 *
 * Mirrors the orphan-markers.test.ts shape — fixture-fabricated markers
 * conforming to cancelled.schema.v1.0.0 + corrupt/missing-field defensive
 * cases. Per docs/CONTRACTS.md rule 5, tests invoke the production reader
 * (`readCancelledMarker`, `listCancelledRuns`) directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readCancelledMarker,
  listCancelledRuns,
  isValidCancelledMarker,
} from '../src/observability/cancelled-marker-reader.js';
import {
  ARTIFACT_FILENAMES,
  WORKSPACE_PATHS,
  type IndexCancelledMarker,
} from '../src/types.js';

function makeMarker(overrides: Partial<IndexCancelledMarker> = {}): IndexCancelledMarker {
  return {
    schema_version: 'cancelled.v1.0.0',
    run_id: '20260425-120000-cancel-abcd',
    run_dir: '.ml/runs/20260425-120000-cancel-abcd',
    cancelled_at: '2026-04-25T12:00:00Z',
    step: 'training',
    reason: 'user cancelled via VS Code progress UI',
    ...overrides,
  };
}

async function makeRunDirWithMarker(
  workspaceRoot: string,
  runId: string,
  markerContent: IndexCancelledMarker | string | null
): Promise<string> {
  const runDir = path.join(workspaceRoot, WORKSPACE_PATHS.RUNS_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });
  if (markerContent !== null) {
    const body = typeof markerContent === 'string' ? markerContent : JSON.stringify(markerContent);
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER),
      body,
      'utf-8'
    );
  }
  return runDir;
}

describe('isValidCancelledMarker', () => {
  it('accepts a fully-formed marker', () => {
    expect(isValidCancelledMarker(makeMarker())).toBe(true);
  });

  it('rejects when schema_version is wrong', () => {
    expect(
      isValidCancelledMarker({
        ...makeMarker(),
        schema_version: 'cancelled.v2.0.0',
      })
    ).toBe(false);
  });

  it('rejects when step is not in the enum', () => {
    expect(
      isValidCancelledMarker({
        ...makeMarker(),
        step: 'whenever',
      })
    ).toBe(false);
  });

  it('rejects when run_id is empty string', () => {
    expect(isValidCancelledMarker({ ...makeMarker(), run_id: '' })).toBe(false);
  });

  it('rejects when partial_artifacts contains a non-string', () => {
    expect(
      isValidCancelledMarker({
        ...makeMarker(),
        partial_artifacts: ['ok.txt', 42 as unknown as string],
      })
    ).toBe(false);
  });

  it('accepts marker without optional fields (reason, partial_artifacts)', () => {
    const m: IndexCancelledMarker = {
      schema_version: 'cancelled.v1.0.0',
      run_id: 'r1',
      run_dir: '.ml/runs/r1',
      cancelled_at: '2026-04-25T12:00:00Z',
      step: 'shutdown',
    };
    expect(isValidCancelledMarker(m)).toBe(true);
  });
});

describe('readCancelledMarker', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-cancelled-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns null when run dir has no .cancelled marker', async () => {
    const runDir = path.join(tmp, 'norun');
    await fs.mkdir(runDir, { recursive: true });
    const result = await readCancelledMarker(runDir);
    expect(result).toBeNull();
  });

  it('returns parsed marker when present and valid', async () => {
    const runId = 'r1';
    const runDir = await makeRunDirWithMarker(tmp, runId, makeMarker({ run_id: runId }));
    const result = await readCancelledMarker(runDir);
    expect(result).not.toBeNull();
    expect(result?.run_id).toBe(runId);
    expect(result?.step).toBe('training');
  });

  it('returns null when marker is corrupt JSON (defensive — no throw)', async () => {
    const runDir = await makeRunDirWithMarker(tmp, 'r2', '{not valid json');
    const result = await readCancelledMarker(runDir);
    expect(result).toBeNull();
  });

  it('returns null when marker is missing required field (INVALID_SHAPE)', async () => {
    const broken = JSON.stringify({
      schema_version: 'cancelled.v1.0.0',
      // run_id missing
      run_dir: '.ml/runs/r3',
      cancelled_at: '2026-04-25T12:00:00Z',
      step: 'training',
    });
    const runDir = await makeRunDirWithMarker(tmp, 'r3', broken);
    const result = await readCancelledMarker(runDir);
    expect(result).toBeNull();
  });

  it('returns null when schema_version is bumped (defensive future-proofing)', async () => {
    const future = JSON.stringify({
      ...makeMarker(),
      schema_version: 'cancelled.v2.0.0',
    });
    const runDir = await makeRunDirWithMarker(tmp, 'r4', future);
    const result = await readCancelledMarker(runDir);
    expect(result).toBeNull();
  });
});

describe('listCancelledRuns', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-cancelled-list-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns empty result when .ml/runs does not exist', async () => {
    const result = await listCancelledRuns(tmp);
    expect(result.cancelled).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('enumerates valid cancelled markers and skips clean runs', async () => {
    // Cancelled run.
    const cancelled = makeMarker({
      run_id: 'r-cancelled-1',
      run_dir: '.ml/runs/r-cancelled-1',
    });
    await makeRunDirWithMarker(tmp, 'r-cancelled-1', cancelled);

    // Clean indexed run — no .cancelled marker.
    await fs.mkdir(path.join(tmp, WORKSPACE_PATHS.RUNS_DIR, 'r-clean-2'), { recursive: true });

    // Another cancelled run.
    await makeRunDirWithMarker(tmp, 'r-cancelled-3', makeMarker({
      run_id: 'r-cancelled-3',
      run_dir: '.ml/runs/r-cancelled-3',
      step: 'metrics_computation',
    }));

    const result = await listCancelledRuns(tmp);
    expect(result.skipped).toHaveLength(0);
    expect(result.cancelled).toHaveLength(2);
    const ids = result.cancelled.map((m) => m.run_id).sort();
    expect(ids).toEqual(['r-cancelled-1', 'r-cancelled-3']);
  });

  it('skips + logs corrupt marker (CORRUPT_JSON)', async () => {
    await makeRunDirWithMarker(tmp, 'r-corrupt', '{not valid');
    const result = await listCancelledRuns(tmp);
    expect(result.cancelled).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('CORRUPT_JSON');
  });

  it('skips + logs marker missing required field (INVALID_SHAPE)', async () => {
    const broken = JSON.stringify({
      schema_version: 'cancelled.v1.0.0',
      run_id: 'r-broken',
      run_dir: '.ml/runs/r-broken',
      // cancelled_at missing
      step: 'training',
    });
    await makeRunDirWithMarker(tmp, 'r-broken', broken);
    const result = await listCancelledRuns(tmp);
    expect(result.cancelled).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('INVALID_SHAPE');
  });
});
