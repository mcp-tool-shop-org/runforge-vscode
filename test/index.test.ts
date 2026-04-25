/**
 * Index Manager Contract Tests — read-side only (post iter #5a).
 *
 * Backend's iter #5a (`ec81781`) deleted `appendToIndex`, `ensureIndex`, and
 * `validateIndexEntry`. Python ml_runner is now the single writer of
 * `.ml/outputs/index.json`; the TS extension only reads.
 *
 * The test cases that exercised the deleted writers are gone — keeping them
 * would test functions that no longer exist. Equivalent reader-side coverage
 * has been added for the surviving helpers (`readIndex`, `getRecentRuns`,
 * `findRunById`) using fixture data that simulates Python's canonical
 * `{schema_version, runs: IndexEntry[]}` on-disk shape.
 *
 * The journey-shape coverage for the full Python-writer → TS-reader chain
 * lives in `test/regression-iter-5a.test.ts` (uses a real Python subprocess
 * when available).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readIndex,
  getRecentRuns,
  findRunById,
  createTimestamp,
} from '../src/workspace/index-manager.js';
import type { IndexEntry, RunIndex } from '../src/types.js';
import { WORKSPACE_PATHS } from '../src/types.js';

describe('Index Manager (read-side, iter #5a)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /** Build a canonical 10-field IndexEntry for fixtures. */
  function makeEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
    return {
      run_id: '20260201-142355-run-a3f9',
      created_at: createTimestamp(),
      name: 'test-run',
      preset_id: 'std-train',
      status: 'succeeded',
      summary: {
        duration_ms: 1000,
        final_metrics: { accuracy: 0.95 },
        device: 'cpu',
      },
      run_dir: '.ml/runs/20260201-142355-run-a3f9',
      dataset_fingerprint_sha256: 'a'.repeat(64),
      label_column: 'label',
      model_pkl: '.ml/runs/20260201-142355-run-a3f9/artifacts/model.pkl',
      ...overrides,
    };
  }

  /** Write a canonical RunIndex to <tempDir>/.ml/outputs/index.json. */
  async function writeCanonicalIndex(entries: IndexEntry[]): Promise<void> {
    const outputsDir = path.join(tempDir, WORKSPACE_PATHS.OUTPUTS_DIR);
    await fs.mkdir(outputsDir, { recursive: true });
    const index: RunIndex = {
      schema_version: '1.0.0',
      runs: entries,
    };
    await fs.writeFile(
      path.join(outputsDir, 'index.json'),
      JSON.stringify(index, null, 2),
      'utf-8'
    );
  }

  /** Write a legacy bare-array index.json (v1.0.1 shape) to disk. */
  async function writeLegacyBareArrayIndex(entries: IndexEntry[]): Promise<void> {
    const outputsDir = path.join(tempDir, WORKSPACE_PATHS.OUTPUTS_DIR);
    await fs.mkdir(outputsDir, { recursive: true });
    await fs.writeFile(
      path.join(outputsDir, 'index.json'),
      JSON.stringify(entries, null, 2),
      'utf-8'
    );
  }

  /** Write a pre-iter-#5a TS shape ({runs: [...]} no schema_version). */
  async function writeUnversionedIndex(entries: IndexEntry[]): Promise<void> {
    const outputsDir = path.join(tempDir, WORKSPACE_PATHS.OUTPUTS_DIR);
    await fs.mkdir(outputsDir, { recursive: true });
    await fs.writeFile(
      path.join(outputsDir, 'index.json'),
      JSON.stringify({ runs: entries }, null, 2),
      'utf-8'
    );
  }

  describe('readIndex', () => {
    it('returns empty array when index file does not exist', async () => {
      const entries = await readIndex(tempDir);
      expect(entries).toEqual([]);
    });

    it('returns empty array when index has no runs', async () => {
      await writeCanonicalIndex([]);
      const entries = await readIndex(tempDir);
      expect(entries).toEqual([]);
    });

    it('reads canonical {schema_version, runs} shape (Python ml_runner output)', async () => {
      const entry = makeEntry();
      await writeCanonicalIndex([entry]);

      const entries = await readIndex(tempDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].run_id).toBe(entry.run_id);
      expect(entries[0].dataset_fingerprint_sha256).toBe(entry.dataset_fingerprint_sha256);
    });

    it('returns multiple entries in append order (oldest first)', async () => {
      const a = makeEntry({ run_id: 'run-a' });
      const b = makeEntry({ run_id: 'run-b' });
      const c = makeEntry({ run_id: 'run-c' });
      await writeCanonicalIndex([a, b, c]);

      const entries = await readIndex(tempDir);
      expect(entries.map((e) => e.run_id)).toEqual(['run-a', 'run-b', 'run-c']);
    });

    it('preserves all 10 canonical fields on read', async () => {
      const entry = makeEntry({
        run_id: 'full-shape',
        name: 'my-run',
        preset_id: 'hq-train',
        status: 'succeeded',
        summary: {
          duration_ms: 4321,
          final_metrics: { accuracy: 0.92, loss: 0.18 },
          device: 'cuda',
        },
        run_dir: '.ml/runs/full-shape',
        dataset_fingerprint_sha256: 'b'.repeat(64),
        label_column: 'species',
        model_pkl: '.ml/runs/full-shape/artifacts/model.pkl',
      });
      await writeCanonicalIndex([entry]);

      const [readBack] = await readIndex(tempDir);
      expect(readBack).toMatchObject({
        run_id: 'full-shape',
        name: 'my-run',
        preset_id: 'hq-train',
        status: 'succeeded',
        run_dir: '.ml/runs/full-shape',
        dataset_fingerprint_sha256: 'b'.repeat(64),
        label_column: 'species',
        model_pkl: '.ml/runs/full-shape/artifacts/model.pkl',
      });
      expect(readBack.summary.duration_ms).toBe(4321);
      expect(readBack.summary.final_metrics).toEqual({ accuracy: 0.92, loss: 0.18 });
      expect(readBack.summary.device).toBe('cuda');
    });

    it('tolerates pre-iter-#5a unversioned {runs: []} shape (no schema_version)', async () => {
      // The pre-iter-#5a TS-side writer produced this shape.
      const entry = makeEntry({ run_id: 'unversioned' });
      await writeUnversionedIndex([entry]);

      const entries = await readIndex(tempDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].run_id).toBe('unversioned');
    });

    it('tolerates legacy bare-array shape (v1.0.1 read-only migration shim)', async () => {
      const entry = makeEntry({ run_id: 'bare-array' });
      await writeLegacyBareArrayIndex([entry]);

      const entries = await readIndex(tempDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].run_id).toBe('bare-array');
    });

    it('throws on structurally invalid index (not array, not {runs})', async () => {
      const outputsDir = path.join(tempDir, WORKSPACE_PATHS.OUTPUTS_DIR);
      await fs.mkdir(outputsDir, { recursive: true });
      await fs.writeFile(
        path.join(outputsDir, 'index.json'),
        JSON.stringify({ foo: 'bar' }),
        'utf-8'
      );

      await expect(readIndex(tempDir)).rejects.toThrow(/RunIndex|runs/);
    });
  });

  describe('getRecentRuns', () => {
    it('returns empty array when no index exists', async () => {
      const runs = await getRecentRuns(tempDir);
      expect(runs).toEqual([]);
    });

    it('returns runs newest-first (reverse of append order)', async () => {
      const a = makeEntry({ run_id: 'run-a' });
      const b = makeEntry({ run_id: 'run-b' });
      const c = makeEntry({ run_id: 'run-c' });
      await writeCanonicalIndex([a, b, c]);

      const runs = await getRecentRuns(tempDir);
      expect(runs.map((r) => r.run_id)).toEqual(['run-c', 'run-b', 'run-a']);
    });

    it('respects the limit parameter (newest-N first)', async () => {
      const entries = Array.from({ length: 25 }, (_, i) =>
        makeEntry({ run_id: `run-${String(i).padStart(2, '0')}` })
      );
      await writeCanonicalIndex(entries);

      const runs = await getRecentRuns(tempDir, 5);
      expect(runs).toHaveLength(5);
      expect(runs[0].run_id).toBe('run-24');
      expect(runs[4].run_id).toBe('run-20');
    });

    it('default limit is 20', async () => {
      const entries = Array.from({ length: 30 }, (_, i) =>
        makeEntry({ run_id: `run-${String(i).padStart(2, '0')}` })
      );
      await writeCanonicalIndex(entries);

      const runs = await getRecentRuns(tempDir);
      expect(runs).toHaveLength(20);
    });
  });

  describe('findRunById', () => {
    it('returns undefined when index does not exist', async () => {
      const found = await findRunById(tempDir, 'anything');
      expect(found).toBeUndefined();
    });

    it('returns undefined for a run that is not present', async () => {
      await writeCanonicalIndex([makeEntry({ run_id: 'present' })]);
      const found = await findRunById(tempDir, 'absent');
      expect(found).toBeUndefined();
    });

    it('returns the matching entry when present', async () => {
      const target = makeEntry({ run_id: 'target', name: 'target-name' });
      await writeCanonicalIndex([
        makeEntry({ run_id: 'other-1' }),
        target,
        makeEntry({ run_id: 'other-2' }),
      ]);

      const found = await findRunById(tempDir, 'target');
      expect(found).toBeDefined();
      expect(found!.run_id).toBe('target');
      expect(found!.name).toBe('target-name');
    });
  });

  describe('createTimestamp', () => {
    it('should return ISO8601 format with timezone offset', () => {
      const ts = createTimestamp();
      // Should be parseable as a valid date
      expect(new Date(ts).getTime()).not.toBeNaN();
      // Should have timezone offset format (not Z)
      expect(ts).toMatch(/[+-]\d{2}:\d{2}$/);
      expect(ts).not.toContain('Z');
    });

    it('produces a string with the expected YYYY-MM-DDTHH:mm:ss±HH:MM shape', () => {
      const ts = createTimestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    });
  });
});
