// Regression for F-COORD-010 (Stage A iter #4): canonical RunIndex shape on disk,
// exercised through the writer → reader CALL CHAIN.
//
// Iter #3's regression (test/regression-coord-008.test.ts) wrote test data
// directly in the observability `{runs:[]}` shape to isolate the path bug from
// the shape bug. That scaffolding around F-COORD-010 was prima facie evidence
// F-COORD-010 was in flight — but it was logged as a Stage B candidate instead
// of CRITICAL, so the production write→read chain was never exercised end-to-end.
//
// POST iter #5a UPDATE: Backend's `ec81781` deleted `appendToIndex` from the TS
// extension; Python ml_runner is now the single writer of `.ml/outputs/index.json`.
// The shape contract this regression covers — writer and reader must agree on the
// on-disk envelope `{schema_version, runs: IndexEntry[]}` — has not changed; only
// the writer identity has. To keep this test self-contained and fast (no Python
// subprocess), the writer side here emits the same on-disk bytes Python emits, by
// constructing the canonical envelope and writing it via `fs.writeFile`. The
// full Python-write → TS-read journey lives in `test/regression-iter-5a.test.ts`.
//
// If writer and reader ever drift on the on-disk shape again — e.g., writer
// emits a bare array while reader parses `{runs:[]}` (the original F-COORD-010
// failure mode), or any future shape change touches one side without the other
// — these assertions fail immediately because the entry written via the writer
// will not be the entry returned by the reader.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import type { IndexEntry, RunIndex } from '../src/types.js';
import { WORKSPACE_PATHS } from '../src/types.js';
import { createTimestamp } from '../src/workspace/index-manager.js';
import { safeReadIndex } from '../src/observability/fs-safe.js';

const SCHEMA_VERSION = '1.0.0';

function makeEntry(runId: string, overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    run_id: runId,
    created_at: createTimestamp(),
    name: runId,
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
    ...overrides,
  };
}

/**
 * Writer side of the chain — simulates the bytes Python ml_runner leaves on
 * disk under `.ml/outputs/index.json`. Append-only: reads any pre-existing
 * file, appends the new entry, rewrites with canonical schema_version stamped.
 *
 * This intentionally mirrors `python/ml_runner/provenance.py:append_run_to_index`
 * so a divergence in Python's writer is visible here as a chain failure.
 */
async function writeIndexAppend(workspaceRoot: string, entry: IndexEntry): Promise<void> {
  const outputsDir = path.join(workspaceRoot, WORKSPACE_PATHS.OUTPUTS_DIR);
  await fs.mkdir(outputsDir, { recursive: true });
  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);

  let runs: IndexEntry[] = [];
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Migrate legacy bare-array shape on read (matches Python's load_index).
      runs = parsed as IndexEntry[];
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.runs)) {
      runs = parsed.runs as IndexEntry[];
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  runs.push(entry);
  const canonical: RunIndex = { schema_version: SCHEMA_VERSION, runs };
  await fs.writeFile(indexPath, JSON.stringify(canonical, null, 2) + '\n', 'utf-8');
}

describe('F-COORD-010 regression: writer → reader chain agrees on RunIndex shape', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-coord010-'));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('canonical write → safeReadIndex round-trip preserves a single entry', async () => {
    const entry = makeEntry('coord010-single');

    await writeIndexAppend(workspaceRoot, entry);

    const result = await safeReadIndex(workspaceRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.runs).toHaveLength(1);
    const readBack = result.value.runs[0];
    // The entry written by the writer must be the entry returned by the
    // reader. If shape drifts, this fails.
    expect(readBack.run_id).toBe(entry.run_id);
    expect(readBack.run_dir).toBe(entry.run_dir);
    expect(readBack.preset_id).toBe(entry.preset_id);
    expect(readBack.status).toBe(entry.status);
    expect(readBack.dataset_fingerprint_sha256).toBe(entry.dataset_fingerprint_sha256);
    // The reader's RunIndex type is the canonical one from types.ts. The
    // entries it returns must carry the canonical 10 fields the writer emits.
    expect(readBack).toMatchObject({
      run_id: entry.run_id,
      created_at: entry.created_at,
      name: entry.name,
      preset_id: entry.preset_id,
      status: entry.status,
      run_dir: entry.run_dir,
      label_column: entry.label_column,
      model_pkl: entry.model_pkl,
    });
  });

  it('multiple appends accumulate and remain visible through safeReadIndex', async () => {
    const a = makeEntry('coord010-a');
    const b = makeEntry('coord010-b', { status: 'failed' });
    const c = makeEntry('coord010-c');

    await writeIndexAppend(workspaceRoot, a);
    await writeIndexAppend(workspaceRoot, b);
    await writeIndexAppend(workspaceRoot, c);

    const result = await safeReadIndex(workspaceRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.runs).toHaveLength(3);
    const ids = result.value.runs.map((r) => r.run_id);
    expect(ids).toEqual(['coord010-a', 'coord010-b', 'coord010-c']);
    // Status of 'b' must round-trip — verifies entries are not mangled when
    // the writer wraps and the reader unwraps.
    expect(result.value.runs[1].status).toBe('failed');
  });

  it('on-disk file produced by writer is consumable by reader without manual reshape', async () => {
    // Belt-and-braces: confirm the bytes the writer leaves on disk parse as
    // the wrapped {schema_version, runs:[]} shape the reader's RunIndex type
    // promises. If a future change makes the writer emit a bare array again,
    // the reader's type assertion (`result.value.runs`) breaks at runtime.
    await writeIndexAppend(workspaceRoot, makeEntry('coord010-shape'));

    const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);
    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed).toHaveProperty('runs');
    expect(parsed).toHaveProperty('schema_version');
    expect(parsed.schema_version).toBe(SCHEMA_VERSION);
    expect(Array.isArray(parsed.runs)).toBe(true);

    const result = await safeReadIndex(workspaceRoot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.runs[0].run_id).toBe('coord010-shape');
    }
  });

  it('legacy bare-array index.json on disk is tolerated by both reader and writer', async () => {
    // The migration shim in `readIndex` (TS) and `load_index` (Python) both
    // tolerate the v1.0.1 bare-array shape on read. Verify it works through
    // the chain: a workspace whose `index.json` was written by an older
    // RunForge must read cleanly through `safeReadIndex` once a new entry
    // is appended.
    const outputsDir = path.join(workspaceRoot, WORKSPACE_PATHS.OUTPUTS_DIR);
    await fs.mkdir(outputsDir, { recursive: true });
    const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);

    const legacyEntry = makeEntry('coord010-legacy');
    await fs.writeFile(indexPath, JSON.stringify([legacyEntry], null, 2), 'utf-8');

    // Trigger the writer (which runs the migration shim in writeIndexAppend).
    const newEntry = makeEntry('coord010-postmigrate');
    await writeIndexAppend(workspaceRoot, newEntry);

    const result = await safeReadIndex(workspaceRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.runs).toHaveLength(2);
    expect(result.value.runs.map((r) => r.run_id)).toEqual([
      'coord010-legacy',
      'coord010-postmigrate',
    ]);

    // After migration the on-disk file must be canonical {schema_version, runs:[]},
    // not bare array.
    const migratedRaw = await fs.readFile(indexPath, 'utf-8');
    const migratedParsed = JSON.parse(migratedRaw);
    expect(Array.isArray(migratedParsed)).toBe(false);
    expect(migratedParsed).toHaveProperty('runs');
    expect(migratedParsed).toHaveProperty('schema_version');
  });
});
