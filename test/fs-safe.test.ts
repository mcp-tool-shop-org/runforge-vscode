/**
 * fs-safe.ts Tests (Phase 2.3)
 *
 * Tests for safe filesystem utilities with structured error handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readJsonFile,
  safeReadIndex,
  safeReadRunJson,
  formatError,
  getActionableMessage,
  exists,
  type SafeError,
  type RunIndex,
} from '../src/observability/fs-safe.js';

describe('fs-safe', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test');

      expect(await exists(filePath)).toBe(true);
    });

    it('returns false for non-existing file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt');

      expect(await exists(filePath)).toBe(false);
    });

    it('returns true for existing directory', async () => {
      expect(await exists(testDir)).toBe(true);
    });
  });

  describe('readJsonFile', () => {
    it('returns ok result for valid JSON', async () => {
      const filePath = path.join(testDir, 'valid.json');
      await fs.writeFile(filePath, '{"key": "value"}');

      const result = await readJsonFile<{ key: string }>(filePath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ key: 'value' });
      }
    });

    it('returns NOT_FOUND error for missing file', async () => {
      const filePath = path.join(testDir, 'missing.json');

      const result = await readJsonFile(filePath);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.path).toBe(filePath);
      }
    });

    it('returns CORRUPT_JSON error for invalid JSON', async () => {
      const filePath = path.join(testDir, 'invalid.json');
      await fs.writeFile(filePath, 'not valid json {{{');

      const result = await readJsonFile(filePath);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CORRUPT_JSON');
        expect(result.error.recoveryHint).toContain('syntax errors');
      }
    });
  });

  describe('safeReadIndex', () => {
    it('returns NOT_FOUND when .runforge directory missing', async () => {
      const result = await safeReadIndex(testDir);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('.runforge');
        expect(result.error.recoveryHint).toContain('training');
      }
    });

    it('returns NOT_FOUND when index.json missing', async () => {
      await fs.mkdir(path.join(testDir, '.runforge'));

      const result = await safeReadIndex(testDir);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('index.json');
      }
    });

    it('returns ok result for valid index.json', async () => {
      const runforgeDir = path.join(testDir, '.runforge');
      await fs.mkdir(runforgeDir);

      const index: RunIndex = {
        runs: [
          {
            run_id: 'test-run-1',
            created_at: '2024-01-01T00:00:00Z',
            dataset_fingerprint: 'abc123',
            label_column: 'label',
            run_dir: 'runs/test-run-1/run.json',
            model_pkl: 'runs/test-run-1/model.pkl',
          },
        ],
      };
      await fs.writeFile(
        path.join(runforgeDir, 'index.json'),
        JSON.stringify(index)
      );

      const result = await safeReadIndex(testDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.runs).toHaveLength(1);
        expect(result.value.runs[0].run_id).toBe('test-run-1');
      }
    });

    it('backs up corrupt index.json and returns error', async () => {
      const runforgeDir = path.join(testDir, '.runforge');
      await fs.mkdir(runforgeDir);
      await fs.writeFile(
        path.join(runforgeDir, 'index.json'),
        'not valid json'
      );

      const result = await safeReadIndex(testDir);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CORRUPT_JSON');
        expect(result.error.recoveryHint).toContain('backed up');
      }

      // Check backup was created
      const files = await fs.readdir(runforgeDir);
      const backupFile = files.find((f) => f.startsWith('index.json.corrupt.'));
      expect(backupFile).toBeDefined();
    });
  });

  describe('safeReadRunJson', () => {
    it('returns ok result for valid run.json', async () => {
      const runforgeDir = path.join(testDir, '.runforge');
      const runDir = path.join(runforgeDir, 'runs', 'test-run');
      await fs.mkdir(runDir, { recursive: true });

      const runJson = {
        run_id: 'test-run',
        label_column: 'label',
        num_samples: 100,
        dropped_rows_missing_values: 5,
      };
      await fs.writeFile(
        path.join(runDir, 'run.json'),
        JSON.stringify(runJson)
      );

      const result = await safeReadRunJson(testDir, 'runs/test-run/run.json');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.run_id).toBe('test-run');
        expect(result.value.dropped_rows_missing_values).toBe(5);
      }
    });

    it('returns NOT_FOUND for missing run.json', async () => {
      const runforgeDir = path.join(testDir, '.runforge');
      await fs.mkdir(runforgeDir);

      const result = await safeReadRunJson(testDir, 'runs/missing/run.json');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.recoveryHint).toContain('partially deleted');
      }
    });
  });

  describe('formatError', () => {
    it('formats error with recovery hint', () => {
      const error: SafeError = {
        code: 'NOT_FOUND',
        message: 'File not found',
        path: '/path/to/file.json',
        recoveryHint: 'Run a training first.',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('file.json');
      expect(formatted).toContain('Run a training first.');
    });

    it('formats error without recovery hint', () => {
      const error: SafeError = {
        code: 'READ_ERROR',
        message: 'Failed to read file',
        path: '/path/to/file.json',
      };

      const formatted = formatError(error);

      expect(formatted).toContain('file.json');
      expect(formatted).not.toContain('undefined');
    });
  });

  describe('getActionableMessage', () => {
    it('returns actionable message for NOT_FOUND in .runforge', () => {
      const error: SafeError = {
        code: 'NOT_FOUND',
        message: 'Not found',
        path: '/workspace/.runforge/index.json',
      };

      const message = getActionableMessage(error);

      expect(message).toContain('No runs yet');
      expect(message).toContain('training');
    });

    it('returns actionable message for CORRUPT_JSON', () => {
      const error: SafeError = {
        code: 'CORRUPT_JSON',
        message: 'Invalid JSON',
        path: '/path/to/file.json',
        recoveryHint: 'Try restoring from backup.',
      };

      const message = getActionableMessage(error);

      expect(message).toContain('corrupted');
      expect(message).toContain('backup');
    });

    it('returns actionable message for READ_ERROR', () => {
      const error: SafeError = {
        code: 'READ_ERROR',
        message: 'Read failed',
        path: '/path/to/file.json',
      };

      const message = getActionableMessage(error);

      expect(message).toContain('permissions');
    });
  });
});
