/**
 * Index Manager Contract Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ensureIndex,
  readIndex,
  appendToIndex,
  validateIndexEntry,
  createTimestamp,
} from '../src/workspace/index-manager.js';
import type { IndexEntry } from '../src/types.js';

describe('Index Manager', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createValidEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
    return {
      run_id: '20260201-142355-run-a3f9',
      created_at: createTimestamp(),
      name: 'test-run',
      preset_id: 'std-train',
      status: 'succeeded',
      run_dir: '.ml/runs/20260201-142355-run-a3f9',
      summary: {
        duration_ms: 1000,
        final_metrics: { loss: 0.5 },
        device: 'cuda',
      },
      ...overrides,
    };
  }

  describe('ensureIndex', () => {
    it('should create index file if missing', async () => {
      await ensureIndex(tempDir);

      const indexPath = path.join(tempDir, '.ml', 'outputs', 'index.json');
      const exists = await fs.access(indexPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should create empty array in new index', async () => {
      await ensureIndex(tempDir);

      const entries = await readIndex(tempDir);
      expect(entries).toEqual([]);
    });

    it('should not overwrite existing index', async () => {
      // Create index with an entry
      await ensureIndex(tempDir);
      const entry = createValidEntry();
      await appendToIndex(tempDir, entry);

      // Ensure again
      await ensureIndex(tempDir);

      // Entry should still be there
      const entries = await readIndex(tempDir);
      expect(entries).toHaveLength(1);
    });
  });

  describe('appendToIndex', () => {
    it('should append entry to empty index', async () => {
      const entry = createValidEntry();
      await appendToIndex(tempDir, entry);

      const entries = await readIndex(tempDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].run_id).toBe(entry.run_id);
    });

    it('should append multiple entries in order', async () => {
      const entry1 = createValidEntry({ run_id: 'run-1-a3f9' });
      const entry2 = createValidEntry({ run_id: 'run-2-b4e8' });
      const entry3 = createValidEntry({ run_id: 'run-3-c5d7' });

      await appendToIndex(tempDir, entry1);
      await appendToIndex(tempDir, entry2);
      await appendToIndex(tempDir, entry3);

      const entries = await readIndex(tempDir);
      expect(entries).toHaveLength(3);
      expect(entries[0].run_id).toBe('run-1-a3f9');
      expect(entries[1].run_id).toBe('run-2-b4e8');
      expect(entries[2].run_id).toBe('run-3-c5d7');
    });

    it('should preserve existing entries (append-only)', async () => {
      const entry1 = createValidEntry({ run_id: 'first-run' });
      await appendToIndex(tempDir, entry1);

      // Read and verify
      let entries = await readIndex(tempDir);
      expect(entries[0].run_id).toBe('first-run');

      // Append another
      const entry2 = createValidEntry({ run_id: 'second-run' });
      await appendToIndex(tempDir, entry2);

      // First entry should still be there
      entries = await readIndex(tempDir);
      expect(entries[0].run_id).toBe('first-run');
      expect(entries[1].run_id).toBe('second-run');
    });
  });

  describe('validateIndexEntry', () => {
    it('should accept valid entry', () => {
      const entry = createValidEntry();
      expect(() => validateIndexEntry(entry)).not.toThrow();
    });

    it('should reject entry with backslashes in run_dir', () => {
      const entry = createValidEntry({
        run_dir: '.ml\\runs\\test',
      });
      expect(() => validateIndexEntry(entry)).toThrow('forward slashes');
    });

    it('should reject entry with absolute run_dir', () => {
      const entry = createValidEntry({
        run_dir: '/absolute/path/to/run',
      });
      expect(() => validateIndexEntry(entry)).toThrow('workspace-relative');
    });

    it('should reject entry with invalid created_at', () => {
      const entry = createValidEntry({
        created_at: 'not-a-date',
      });
      expect(() => validateIndexEntry(entry)).toThrow('ISO8601');
    });

    it('should reject entry with invalid status', () => {
      const entry = createValidEntry({
        status: 'unknown' as any,
      });
      expect(() => validateIndexEntry(entry)).toThrow('status');
    });

    it('should reject entry missing required fields', () => {
      const entry = { run_id: 'test' } as any;
      expect(() => validateIndexEntry(entry)).toThrow('missing required field');
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
  });
});
