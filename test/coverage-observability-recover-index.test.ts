/**
 * Recover Index: the branches of the recovery walk that the main suite leaves
 * open (missing run.json, unreadable run.json, runs whose run.json cannot
 * yield an index entry, pre-existing orphans without a marker, an index that is
 * corrupt, a runs directory that cannot be listed) and the `runforge.recoverIndex`
 * command wrapper that turns a RecoveryReport into the messages the user sees.
 *
 * Fixtures are real `.ml` trees in a temp workspace; only vscode is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const h = vi.hoisted(() => ({
  showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
  showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  showTextDocument: vi.fn(() => Promise.resolve(undefined)),
  openTextDocument: vi.fn((opts: unknown) => Promise.resolve({ opts })),
  workspace: { workspaceFolders: undefined as unknown, openTextDocument: undefined as unknown },
}));
h.workspace.openTextDocument = h.openTextDocument;

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: h.showErrorMessage,
    showInformationMessage: h.showInformationMessage,
    showTextDocument: h.showTextDocument,
  },
  workspace: h.workspace,
}));

import { recoverIndex, recoverIndexForWorkspace } from '../src/observability/recover-index-command.js';

const FP = 'c0ffee00'.repeat(8);

function runJson(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: id,
    runforge_version: '1.0.1',
    schema_version: 'run.v0.3.6',
    created_at: '2026-10-01T08:00:00Z',
    dataset: { path: 'data/sample.csv', fingerprint_sha256: FP },
    label_column: 'species',
    model_family: 'logistic_regression',
    num_samples: 100,
    num_features: 4,
    dropped_rows_missing_values: 0,
    metrics: { accuracy: 0.8765, num_samples: 100, num_features: 4 },
    artifacts: { model_pkl: 'artifacts/model.pkl' },
    ...overrides,
  };
}

describe('recover index (coverage)', () => {
  let root: string;
  let runsDir: string;
  let indexPath: string;

  async function makeRun(name: string, files: Record<string, unknown | string>): Promise<string> {
    const dir = path.join(runsDir, name);
    await fs.mkdir(dir, { recursive: true });
    for (const [file, body] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, file), typeof body === 'string' ? body : JSON.stringify(body));
    }
    return dir;
  }

  async function readIndex(): Promise<{ schema_version: string; runs: Array<Record<string, any>> }> {
    return JSON.parse(await fs.readFile(indexPath, 'utf-8'));
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-recover-cov-'));
    runsDir = path.join(root, '.ml', 'runs');
    indexPath = path.join(root, '.ml', 'outputs', 'index.json');
    h.workspace.workspaceFolders = [{ uri: { fsPath: root } }];
    for (const fn of [h.showErrorMessage, h.showInformationMessage, h.showTextDocument, h.openTextDocument]) {
      fn.mockClear();
    }
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('recoverIndexForWorkspace', () => {
    it('reports an existing index as already indexed when there is no runs directory, and writes nothing', async () => {
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      const body = JSON.stringify({ schema_version: '0.2.2.1', runs: [{ run_id: 'old-1' }, { run_id: 'old-2' }] });
      await fs.writeFile(indexPath, body);

      const report = await recoverIndexForWorkspace(root);

      expect(report).toMatchObject({ scanned_run_dirs: 0, already_indexed: 2, recovered: [], skipped: [], cancelled_excluded: [] });
      expect(await fs.readFile(indexPath, 'utf-8')).toBe(body);
    });

    it('returns an empty-scan report (no throw) when .ml/runs is a file', async () => {
      await fs.mkdir(path.join(root, '.ml'), { recursive: true });
      await fs.writeFile(runsDir, 'not a directory');
      const report = await recoverIndexForWorkspace(root);
      expect(report).toMatchObject({ scanned_run_dirs: 0, already_indexed: 0, recovered: [] });
    });

    it('skips a run directory with neither run.json nor a cancelled marker as MISSING_RUN_JSON', async () => {
      await makeRun('run-empty', {});
      const report = await recoverIndexForWorkspace(root);
      expect(report.scanned_run_dirs).toBe(1);
      expect(report.skipped).toEqual([
        { run_dir: '.ml/runs/run-empty', error: 'MISSING_RUN_JSON', message: 'run.json not found under run-empty' },
      ]);
      expect(report.recovered).toEqual([]);
    });

    it('ignores files in .ml/runs: only directories count as runs', async () => {
      await makeRun('run-1', { 'run.json': runJson('run-1') });
      await fs.writeFile(path.join(runsDir, 'README.txt'), 'notes');
      const report = await recoverIndexForWorkspace(root);
      expect(report.scanned_run_dirs).toBe(1);
      expect(report.recovered.map((r) => r.run_id)).toEqual(['run-1']);
    });

    it('skips an unreadable run.json (a directory in its place) as READ_ERROR', async () => {
      const dir = await makeRun('run-weird', {});
      await fs.mkdir(path.join(dir, 'run.json'));
      const report = await recoverIndexForWorkspace(root);
      expect(report.skipped).toHaveLength(1);
      expect(report.skipped[0]).toMatchObject({
        run_dir: '.ml/runs/run-weird',
        error: 'READ_ERROR',
        message: 'Failed to read file',
      });
    });

    it.each([
      ['a missing run_id', { run_id: undefined }],
      ['an empty run_id', { run_id: '' }],
      ['a numeric run_id', { run_id: 42 }],
    ])('skips a run.json with %s as CORRUPT_RUN_JSON', async (_label, overrides) => {
      await makeRun('run-x', { 'run.json': runJson('run-x', overrides) });
      const report = await recoverIndexForWorkspace(root);
      expect(report.skipped).toEqual([
        { run_dir: '.ml/runs/run-x', error: 'CORRUPT_RUN_JSON', message: 'run.json missing required string run_id field' },
      ]);
      expect(report.recovered).toEqual([]);
    });

    it.each([
      ['created_at', { created_at: undefined }],
      ['an empty created_at', { created_at: '' }],
      ['dataset.fingerprint_sha256', { dataset: { path: 'data/sample.csv' } }],
      ['an empty fingerprint', { dataset: { path: 'data/sample.csv', fingerprint_sha256: '' } }],
      ['the dataset block', { dataset: undefined }],
      ['label_column', { label_column: undefined }],
      ['an empty label_column', { label_column: '' }],
      ['artifacts.model_pkl', { artifacts: {} }],
      ['the artifacts block', { artifacts: undefined }],
      ['an empty model_pkl', { artifacts: { model_pkl: '' } }],
    ])('skips a run.json lacking %s because no index entry can be built', async (_label, overrides) => {
      await makeRun('run-partial', { 'run.json': runJson('run-partial', overrides) });
      const report = await recoverIndexForWorkspace(root);
      expect(report.recovered).toEqual([]);
      expect(report.skipped).toHaveLength(1);
      expect(report.skipped[0].error).toBe('CORRUPT_RUN_JSON');
      expect(report.skipped[0].message).toContain('missing one or more fields required to construct an index entry');
      // Nothing was recovered, so no index file is written.
      await expect(fs.access(indexPath)).rejects.toThrow();
    });

    it('recovers a run with no marker as pre_existing_orphan and builds a conservative index entry', async () => {
      await makeRun('run-plain', { 'run.json': runJson('run-plain') });

      const report = await recoverIndexForWorkspace(root);

      expect(report.recovered).toEqual([
        { run_id: 'run-plain', run_dir: '.ml/runs/run-plain', reason: 'pre_existing_orphan' },
      ]);
      const index = await readIndex();
      expect(index.schema_version).toBe('0.2.2.1');
      expect(index.runs).toHaveLength(1);
      expect(index.runs[0]).toEqual({
        run_id: 'run-plain',
        created_at: '2026-10-01T08:00:00Z',
        name: 'recovered run',
        preset_id: 'std-train',
        status: 'succeeded',
        summary: { duration_ms: 0, final_metrics: { accuracy: 0.8765 }, device: 'cpu' },
        run_dir: '.ml/runs/run-plain',
        dataset_fingerprint_sha256: FP,
        label_column: 'species',
        model_pkl: '.ml/runs/run-plain/artifacts/model.pkl',
      });
    });

    it('defaults accuracy to 0 when run.json has no numeric accuracy', async () => {
      await makeRun('run-noacc', { 'run.json': runJson('run-noacc', { metrics: undefined }) });
      await makeRun('run-badacc', { 'run.json': runJson('run-badacc', { metrics: { accuracy: 'high' } }) });
      await recoverIndexForWorkspace(root);
      const index = await readIndex();
      const byId = Object.fromEntries(index.runs.map((r) => [r.run_id, r]));
      expect(byId['run-noacc'].summary.final_metrics).toEqual({ accuracy: 0 });
      expect(byId['run-badacc'].summary.final_metrics).toEqual({ accuracy: 0 });
    });

    it('normalizes a Windows-style model path from run.json to forward slashes', async () => {
      await makeRun('run-win', { 'run.json': runJson('run-win', { artifacts: { model_pkl: 'artifacts\\model.pkl' } }) });
      await recoverIndexForWorkspace(root);
      expect((await readIndex()).runs[0].model_pkl).toBe('.ml/runs/run-win/artifacts/model.pkl');
    });

    it('appends recovered runs after existing ones and keeps the existing index schema_version', async () => {
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      await fs.writeFile(
        indexPath,
        JSON.stringify({ schema_version: '0.9.9', runs: [{ run_id: 'run-old', run_dir: '.ml/runs/run-old' }] })
      );
      await makeRun('run-old', { 'run.json': runJson('run-old') });
      await makeRun('run-new', { 'run.json': runJson('run-new') });

      const report = await recoverIndexForWorkspace(root);

      expect(report.already_indexed).toBe(1);
      expect(report.recovered.map((r) => r.run_id)).toEqual(['run-new']);
      const index = await readIndex();
      expect(index.schema_version).toBe('0.9.9');
      expect(index.runs.map((r) => r.run_id)).toEqual(['run-old', 'run-new']);
      // The atomic-write temp file is gone.
      expect((await fs.readdir(path.dirname(indexPath))).sort()).toEqual(['index.json']);
    });

    it('falls back to the default schema_version when the existing index has none', async () => {
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      await fs.writeFile(indexPath, JSON.stringify({ runs: [] }));
      await makeRun('run-1', { 'run.json': runJson('run-1') });
      await recoverIndexForWorkspace(root);
      expect((await readIndex()).schema_version).toBe('0.2.2.1');
    });

    it('rebuilds from an empty index when the existing one is corrupt, keeping a backup of it', async () => {
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      await fs.writeFile(indexPath, '{ this is not json');
      await makeRun('run-1', { 'run.json': runJson('run-1') });

      const report = await recoverIndexForWorkspace(root);

      expect(report.recovered.map((r) => r.run_id)).toEqual(['run-1']);
      expect((await readIndex()).runs.map((r) => r.run_id)).toEqual(['run-1']);
      const files = await fs.readdir(path.dirname(indexPath));
      expect(files.some((f) => f.startsWith('index.json.corrupt.'))).toBe(true);
    });

    it('removes the orphan marker of a recovered run and leaves a cancelled run alone', async () => {
      const marker = {
        schema_version: 'index-orphan.v1.0.0',
        run_id: 'run-orph',
        run_dir: '.ml/runs/run-orph',
        written_at: '2026-10-01T09:00:00Z',
        error: { type: 'OSError', message: 'disk full' },
        index_path: '.ml/outputs/index.json',
      };
      const orphDir = await makeRun('run-orph', { 'run.json': runJson('run-orph'), '.index-orphan': marker });
      const cancelledDir = await makeRun('run-cancelled', { '.cancelled': '{}' });

      const report = await recoverIndexForWorkspace(root);

      expect(report.recovered).toEqual([
        { run_id: 'run-orph', run_dir: '.ml/runs/run-orph', reason: 'index_orphan_marker' },
      ]);
      expect(report.cancelled_excluded).toEqual([
        { run_id: 'run-cancelled', run_dir: '.ml/runs/run-cancelled', reason: 'cancelled' },
      ]);
      await expect(fs.access(path.join(orphDir, '.index-orphan'))).rejects.toThrow();
      await expect(fs.access(path.join(cancelledDir, '.cancelled'))).resolves.toBeUndefined();
    });

    it('does not remove a marker when nothing was recovered (index not rewritten)', async () => {
      const dir = await makeRun('run-1', { 'run.json': runJson('run-1'), '.index-orphan': '{}' });
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      await fs.writeFile(indexPath, JSON.stringify({ schema_version: '0.2.2.1', runs: [{ run_id: 'run-1' }] }));

      const report = await recoverIndexForWorkspace(root);

      expect(report.recovered).toEqual([]);
      expect(report.already_indexed).toBe(1);
      await expect(fs.access(path.join(dir, '.index-orphan'))).resolves.toBeUndefined();
    });

    it('treats a run with run.json AND a cancelled marker as a normal run (run.json wins)', async () => {
      await makeRun('run-both', { 'run.json': runJson('run-both'), '.cancelled': '{}' });
      const report = await recoverIndexForWorkspace(root);
      expect(report.cancelled_excluded).toEqual([]);
      expect(report.recovered.map((r) => r.run_id)).toEqual(['run-both']);
    });

    it('is idempotent over a mixed workspace: the second pass recovers nothing new', async () => {
      await makeRun('run-a', { 'run.json': runJson('run-a') });
      await makeRun('run-b', { 'run.json': runJson('run-b') });
      await makeRun('run-bad', { 'run.json': '{' });

      const first = await recoverIndexForWorkspace(root);
      const second = await recoverIndexForWorkspace(root);

      expect(first.recovered.map((r) => r.run_id).sort()).toEqual(['run-a', 'run-b']);
      expect(second.recovered).toEqual([]);
      expect(second.already_indexed).toBe(2);
      expect(second.skipped).toEqual(first.skipped);
    });

    it('does not let one run.json that points at a duplicate run_id be added twice', async () => {
      await makeRun('run-1', { 'run.json': runJson('shared-id') });
      await makeRun('run-2', { 'run.json': runJson('shared-id') });
      const report = await recoverIndexForWorkspace(root);
      expect(report.recovered).toHaveLength(1);
      expect(report.already_indexed).toBe(1);
      expect((await readIndex()).runs).toHaveLength(1);
    });
  });

  describe('recoverIndex command', () => {
    it('asks for a folder when no workspace is open and returns null', async () => {
      h.workspace.workspaceFolders = undefined;
      expect(await recoverIndex()).toBeNull();
      expect(h.showErrorMessage).toHaveBeenCalledWith('Please open a workspace folder first.');
      expect(h.showInformationMessage).not.toHaveBeenCalled();
    });

    it('asks for a folder when the folder list is empty', async () => {
      h.workspace.workspaceFolders = [];
      expect(await recoverIndex()).toBeNull();
      expect(h.showErrorMessage).toHaveBeenCalledWith('Please open a workspace folder first.');
    });

    it('summarizes an empty workspace in one information message', async () => {
      const report = await recoverIndex();
      expect(report).toMatchObject({ scanned_run_dirs: 0, recovered: [] });
      expect(h.showInformationMessage).toHaveBeenCalledWith(
        'RunForge: recovered 0 run(s) (0 already indexed, 0 skipped, 0 cancelled-excluded).'
      );
      expect(h.showErrorMessage).not.toHaveBeenCalled();
    });

    it('recovers runs on disk and reports every category in the summary', async () => {
      await makeRun('run-ok', { 'run.json': runJson('run-ok') });
      await makeRun('run-corrupt', { 'run.json': '{' });
      await makeRun('run-cancelled', { '.cancelled': '{}' });

      const report = await recoverIndex();

      expect(report?.recovered.map((r) => r.run_id)).toEqual(['run-ok']);
      expect(h.showInformationMessage).toHaveBeenCalledWith(
        'RunForge: recovered 1 run(s) (0 already indexed, 1 skipped, 1 cancelled-excluded).'
      );
      expect((await readIndex()).runs.map((r) => r.run_id)).toEqual(['run-ok']);
    });

    it('reports a failure to write the index as an error and returns null', async () => {
      await makeRun('run-ok', { 'run.json': runJson('run-ok') });
      // A file where the .ml/outputs directory should be makes the index unwritable.
      await fs.writeFile(path.join(root, '.ml', 'outputs'), 'in the way');

      const report = await recoverIndex();

      expect(report).toBeNull();
      expect(h.showErrorMessage).toHaveBeenCalledTimes(1);
      expect(h.showErrorMessage.mock.calls[0][0]).toMatch(/^Recover Index failed: /);
      expect(h.showInformationMessage).not.toHaveBeenCalled();
    });

    it('never lets the optional markdown render break recovery', async () => {
      await makeRun('run-ok', { 'run.json': runJson('run-ok') });
      h.openTextDocument.mockRejectedValueOnce(new Error('editor unavailable'));
      const report = await recoverIndex();
      expect(report?.recovered).toHaveLength(1);
      expect(h.showErrorMessage).not.toHaveBeenCalled();
    });
  });
});
