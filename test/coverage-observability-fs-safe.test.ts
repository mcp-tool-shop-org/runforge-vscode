/**
 * fs-safe: the structured-result filesystem layer under every observability
 * command. Complements test/fs-safe.test.ts with the branches it leaves open:
 * latest-run selection by mtime, READ_ERROR (as opposed to NOT_FOUND), the
 * corrupt-index backup when the backup itself cannot be written, run.json
 * reads for hostile run_dir values, and every getActionableMessage branch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  exists,
  formatError,
  getActionableMessage,
  getLatestRunDir,
  readJsonFile,
  safeReadIndex,
  safeReadRunJson,
  type SafeError,
} from '../src/observability/fs-safe.js';

describe('fs-safe (coverage)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-fssafe-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('getLatestRunDir', () => {
    it('returns null when .ml/runs does not exist', () => {
      expect(getLatestRunDir(root)).toBeNull();
    });

    it('returns null when .ml/runs exists but holds no run directories', async () => {
      const runs = path.join(root, '.ml', 'runs');
      await fs.mkdir(runs, { recursive: true });
      // A stray file is not a run directory.
      await fs.writeFile(path.join(runs, 'notes.txt'), 'not a run');
      expect(getLatestRunDir(root)).toBeNull();
    });

    it('returns the most recently modified run directory, ignoring files', async () => {
      const runs = path.join(root, '.ml', 'runs');
      const dirs = ['run-old', 'run-new', 'run-mid'];
      for (const d of dirs) await fs.mkdir(path.join(runs, d), { recursive: true });
      await fs.writeFile(path.join(runs, 'newer-file.txt'), 'x');

      const t = (iso: string) => new Date(iso);
      await fs.utimes(path.join(runs, 'run-old'), t('2026-01-01T00:00:00Z'), t('2026-01-01T00:00:00Z'));
      await fs.utimes(path.join(runs, 'run-mid'), t('2026-02-01T00:00:00Z'), t('2026-02-01T00:00:00Z'));
      await fs.utimes(path.join(runs, 'run-new'), t('2026-03-01T00:00:00Z'), t('2026-03-01T00:00:00Z'));
      // A file with the newest mtime of all must not win.
      await fs.utimes(path.join(runs, 'newer-file.txt'), t('2026-04-01T00:00:00Z'), t('2026-04-01T00:00:00Z'));

      expect(getLatestRunDir(root)).toBe(path.join(runs, 'run-new'));
    });
  });

  describe('readJsonFile', () => {
    it('returns READ_ERROR (retryable, with the original error) when the path is a directory', async () => {
      const dirPath = path.join(root, 'a-directory.json');
      await fs.mkdir(dirPath);
      const result = await readJsonFile(dirPath);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('READ_ERROR');
      expect(result.error.message).toBe('Failed to read file');
      expect(result.error.path).toBe(dirPath);
      expect(result.error.retryable).toBe(true);
      expect(result.error.originalError).toBeInstanceOf(Error);
    });

    it('returns READ_ERROR (not a throw) for a path containing a NUL byte', async () => {
      const result = await readJsonFile(path.join(root, 'bad\u0000name.json'));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('READ_ERROR');
      expect(result.error.retryable).toBe(true);
    });

    it('keeps the parse error on CORRUPT_JSON and marks it non-retryable', async () => {
      const filePath = path.join(root, 'broken.json');
      await fs.writeFile(filePath, '{"half":');
      const result = await readJsonFile(filePath);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CORRUPT_JSON');
      expect(result.error.retryable).toBe(false);
      expect(result.error.originalError).toBeInstanceOf(SyntaxError);
      expect(result.error.recoveryHint).toMatch(/syntax errors|backup/i);
    });

    it('treats an empty file as corrupt JSON, not as an empty object', async () => {
      const filePath = path.join(root, 'empty.json');
      await fs.writeFile(filePath, '');
      const result = await readJsonFile(filePath);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CORRUPT_JSON');
    });
  });

  describe('safeReadIndex', () => {
    async function writeIndex(body: string): Promise<{ outputs: string; indexPath: string }> {
      const outputs = path.join(root, '.ml', 'outputs');
      await fs.mkdir(outputs, { recursive: true });
      const indexPath = path.join(outputs, 'index.json');
      await fs.writeFile(indexPath, body);
      return { outputs, indexPath };
    }

    it('names the backup file in the recovery hint when it renames a corrupt index', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1790000000000);
      const { outputs, indexPath } = await writeIndex('{ not json');

      const result = await safeReadIndex(root);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CORRUPT_JSON');
      expect(result.error.recoveryHint).toBe(
        'Corrupt index backed up to index.json.corrupt.1790000000000. Run a training to rebuild.'
      );
      // Original is gone, backup carries the corrupt bytes.
      expect(await exists(indexPath)).toBe(false);
      expect(await fs.readFile(path.join(outputs, 'index.json.corrupt.1790000000000'), 'utf-8')).toBe('{ not json');
    });

    it('falls back to a generic hint when the backup cannot be written', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1790000000001);
      const { outputs, indexPath } = await writeIndex('][');
      // A directory squatting on the backup name makes the rename fail.
      await fs.mkdir(path.join(outputs, 'index.json.corrupt.1790000000001'));

      const result = await safeReadIndex(root);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CORRUPT_JSON');
      expect(result.error.recoveryHint).toBe('Index is corrupt. Run a training to rebuild.');
      // The corrupt file is left in place when it could not be moved.
      expect(await fs.readFile(indexPath, 'utf-8')).toBe('][');
    });

    it('surfaces READ_ERROR unchanged (no backup attempted) when index.json is unreadable', async () => {
      const outputs = path.join(root, '.ml', 'outputs');
      await fs.mkdir(path.join(outputs, 'index.json'), { recursive: true });

      const result = await safeReadIndex(root);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('READ_ERROR');
      expect((await fs.readdir(outputs)).filter((f) => f.includes('.corrupt.'))).toEqual([]);
    });

    it('reports the missing .ml directory path and hint', async () => {
      const result = await safeReadIndex(root);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'No .ml directory found',
        path: path.join(root, '.ml'),
        recoveryHint: 'Run a training first to generate runs.',
        retryable: false,
      });
    });
  });

  describe('safeReadRunJson', () => {
    it('adds the "partially deleted" hint when run.json is missing', async () => {
      await fs.mkdir(path.join(root, '.ml', 'runs', 'r1'), { recursive: true });
      const result = await safeReadRunJson(root, '.ml/runs/r1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.recoveryHint).toBe('Run metadata is missing. The run may have been partially deleted.');
    });

    it('does not overwrite the hint on a CORRUPT_JSON run.json', async () => {
      await fs.mkdir(path.join(root, '.ml', 'runs', 'r2'), { recursive: true });
      await fs.writeFile(path.join(root, '.ml', 'runs', 'r2', 'run.json'), 'nope');
      const result = await safeReadRunJson(root, '.ml/runs/r2');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CORRUPT_JSON');
      expect(result.error.recoveryHint).toMatch(/syntax errors/i);
    });

    it('answers a parent-traversal run_dir with a structured NOT_FOUND, never a throw', async () => {
      const result = await safeReadRunJson(root, '../../does-not-exist-anywhere');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('NOT_FOUND');
      expect(path.basename(result.error.path)).toBe('run.json');
    });

    it('answers an empty run_dir by looking for run.json at the workspace root', async () => {
      await fs.writeFile(path.join(root, 'run.json'), JSON.stringify({ run_id: 'at-root' }));
      const result = await safeReadRunJson(root, '');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.run_id).toBe('at-root');
    });
  });

  describe('formatError', () => {
    it('shows only the basename of the offending path', () => {
      const err: SafeError = {
        code: 'READ_ERROR',
        message: 'Failed to read file',
        path: path.join('some', 'deep', 'dir', 'run.json'),
      };
      expect(formatError(err)).toBe('Failed to read file: run.json');
    });
  });

  describe('getActionableMessage', () => {
    it('says "No runs yet" for NOT_FOUND inside .ml', () => {
      const msg = getActionableMessage({
        code: 'NOT_FOUND',
        message: 'x',
        path: path.join(root, '.ml', 'outputs', 'index.json'),
      });
      expect(msg).toBe('No runs yet. Run a training to generate runs.');
    });

    it('names the file for NOT_FOUND outside .ml', () => {
      const msg = getActionableMessage({
        code: 'NOT_FOUND',
        message: 'x',
        path: path.join(root, 'elsewhere', 'model.pkl'),
      });
      expect(msg).toBe('File not found: model.pkl');
    });

    it('uses a restore-from-backup default for CORRUPT_JSON with no hint', () => {
      const msg = getActionableMessage({ code: 'CORRUPT_JSON', message: 'x', path: path.join(root, 'run.json') });
      expect(msg).toBe('run.json is corrupted. Try restoring from backup.');
    });

    it('prefers the recovery hint for CORRUPT_JSON when one is present', () => {
      const msg = getActionableMessage({
        code: 'CORRUPT_JSON',
        message: 'x',
        path: path.join(root, 'index.json'),
        recoveryHint: 'Custom hint.',
      });
      expect(msg).toBe('index.json is corrupted. Custom hint.');
    });

    it('points at permissions for READ_ERROR', () => {
      const msg = getActionableMessage({ code: 'READ_ERROR', message: 'x', path: path.join(root, 'run.json') });
      expect(msg).toBe('Could not read run.json. Check file permissions.');
    });

    it('reports invalid format for PARSE_ERROR', () => {
      const msg = getActionableMessage({ code: 'PARSE_ERROR', message: 'x', path: path.join(root, 'run.json') });
      expect(msg).toBe('Invalid format in run.json.');
    });

    it('returns the raw message for WORKSPACE_NOT_TRUSTED (default branch)', () => {
      const msg = getActionableMessage({
        code: 'WORKSPACE_NOT_TRUSTED',
        message: 'Workspace is not trusted.',
        path: root,
      });
      expect(msg).toBe('Workspace is not trusted.');
    });
  });
});
