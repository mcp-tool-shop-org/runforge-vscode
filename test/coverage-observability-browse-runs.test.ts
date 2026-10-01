/**
 * runforge.browseRuns: the two-step picker (run, then action) over a real
 * `.ml` workspace on disk.
 *
 * vscode is mocked; the filesystem is not. Each test builds a run folder tree
 * in a temp dir (index.json, run.json, `.index-orphan` markers) and drives the
 * picker by choosing items out of what `showQuickPick` was actually offered, so
 * what the user would see (labels, ordering, tags) is asserted alongside what
 * each action then does. The Python subprocess behind "Inspect Model Artifact"
 * is replaced by a fake child process whose arguments are recorded.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

type Pick = (items: Array<{ label: string; action?: string }>) => unknown;

const h = vi.hoisted(() => {
  const state = {
    picks: [] as unknown[],
    spawnCalls: [] as Array<{ command: string; args: string[]; options: { cwd?: string; env?: NodeJS.ProcessEnv } }>,
    spawnScript: { stdout: '', stderr: '', code: 0, error: null as Error | null },
  };
  return {
    state,
    showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
    showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
    showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
    showQuickPick: vi.fn(),
    showTextDocument: vi.fn(() => Promise.resolve({ id: 'editor' })),
    openTextDocument: vi.fn((opts: unknown) => Promise.resolve({ opts })),
    writeText: vi.fn(() => Promise.resolve()),
    executeCommand: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: h.showInformationMessage,
    showWarningMessage: h.showWarningMessage,
    showErrorMessage: h.showErrorMessage,
    showQuickPick: h.showQuickPick,
    showTextDocument: h.showTextDocument,
  },
  workspace: { openTextDocument: h.openTextDocument },
  commands: { executeCommand: h.executeCommand },
  env: { clipboard: { writeText: h.writeText } },
  Uri: { file: (p: string) => ({ fsPath: p, scheme: 'file' }) },
  ViewColumn: { Beside: -2, Active: -1 },
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: (command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
      h.state.spawnCalls.push({ command, args, options });
      const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      const script = h.state.spawnScript;
      setImmediate(() => {
        if (script.error) {
          proc.emit('error', script.error);
          return;
        }
        if (script.stdout) proc.stdout.emit('data', Buffer.from(script.stdout));
        if (script.stderr) proc.stderr.emit('data', Buffer.from(script.stderr));
        proc.emit('close', script.code);
      });
      return proc;
    },
  };
});

import { browseRuns } from '../src/observability/browse-runs-command.js';

const FP_A = 'a1b2c3d4'.repeat(8);
const FP_B = 'e5f6a7b8'.repeat(8);

function indexEntry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    run_id: id,
    created_at: '2026-10-01T09:00:00Z',
    name: 'sample training',
    preset_id: 'std-train',
    status: 'succeeded',
    summary: { duration_ms: 1200, final_metrics: { accuracy: 0.9 }, device: 'cpu' },
    run_dir: `.ml/runs/${id}`,
    dataset_fingerprint_sha256: FP_A,
    label_column: 'species',
    model_pkl: `runs/${id}/artifacts/model.pkl`,
    ...overrides,
  };
}

function runJson(id: string, overrides: Record<string, unknown> = {}) {
  return {
    run_id: id,
    runforge_version: '1.0.1',
    schema_version: 'run.v0.3.6',
    created_at: '2026-10-01T09:00:00Z',
    dataset: { path: 'data/sample.csv', fingerprint_sha256: FP_A },
    label_column: 'species',
    model_family: 'logistic_regression',
    num_samples: 150,
    num_features: 4,
    dropped_rows_missing_values: 3,
    metrics: { accuracy: 0.9333, num_samples: 150, num_features: 4 },
    metrics_v1: { schema_version: 'metrics.v1', metrics_profile: 'classification.base.v1', artifact_path: 'metrics.v1.json' },
    artifacts: { model_pkl: 'artifacts/model.pkl' },
    ...overrides,
  };
}

function orphanMarker(id: string, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 'index-orphan.v1.0.0',
    run_id: id,
    run_dir: `.ml/runs/${id}`,
    written_at: '2026-10-01T10:30:00Z',
    error: { type: 'PermissionError', message: 'index.json is read-only' },
    index_path: '.ml/outputs/index.json',
    ...overrides,
  };
}

describe('browseRuns (coverage)', () => {
  let root: string;
  const channel = { appendLine: vi.fn(), show: vi.fn() };

  async function writeIndex(runs: unknown[]): Promise<void> {
    const outputs = path.join(root, '.ml', 'outputs');
    await fs.mkdir(outputs, { recursive: true });
    await fs.writeFile(path.join(outputs, 'index.json'), JSON.stringify({ schema_version: '0.2.2.1', runs }));
  }

  async function writeRunDir(id: string, files: Record<string, unknown | string>): Promise<void> {
    const dir = path.join(root, '.ml', 'runs', id);
    await fs.mkdir(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
    }
  }

  /** Queue what the user "picks" at each successive picker, as functions of the offered items. */
  function queuePicks(...picks: Array<Pick | undefined>): void {
    h.state.picks = picks;
  }

  const byLabel = (needle: string): Pick => (items) => items.find((i) => i.label.includes(needle));

  async function run(): Promise<void> {
    await browseRuns(root, 'python-bin', path.join(root, 'runner', 'ml_runner'), channel as never);
  }

  function offeredAt(call: number): Array<{ label: string; description?: string; detail?: string; action?: string }> {
    return (h.showQuickPick.mock.calls[call] as unknown[])[0] as never;
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-browse-cov-'));
    for (const fn of [
      h.showInformationMessage, h.showWarningMessage, h.showErrorMessage, h.showQuickPick,
      h.showTextDocument, h.openTextDocument, h.writeText, h.executeCommand,
      channel.appendLine, channel.show,
    ]) {
      fn.mockClear();
    }
    h.state.spawnCalls = [];
    h.state.spawnScript = { stdout: '', stderr: '', code: 0, error: null };
    h.state.picks = [];
    h.showQuickPick.mockImplementation((items: Array<{ label: string }>) => {
      const next = h.state.picks.shift() as Pick | undefined;
      return Promise.resolve(next ? next(items) : undefined);
    });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('nothing to show', () => {
    it('says "No runs yet" and opens no picker for an empty workspace', async () => {
      await run();
      expect(h.showQuickPick).not.toHaveBeenCalled();
      expect(h.showInformationMessage).toHaveBeenCalledWith('No runs yet. Run a training to generate runs.');
    });

    it('explains a corrupt index (and backs it up) when there are no orphans to fall back on', async () => {
      const outputs = path.join(root, '.ml', 'outputs');
      await fs.mkdir(outputs, { recursive: true });
      await fs.writeFile(path.join(outputs, 'index.json'), '{ definitely not json');

      await run();

      expect(h.showQuickPick).not.toHaveBeenCalled();
      const msg = h.showInformationMessage.mock.calls[0][0] as string;
      expect(msg).toMatch(/^index\.json is corrupted\. Corrupt index backed up to index\.json\.corrupt\.\d+\./);
      const files = await fs.readdir(outputs);
      expect(files.some((f) => f.startsWith('index.json.corrupt.'))).toBe(true);
    });

    it('says "No runs found" for a readable index with an empty runs list', async () => {
      await writeIndex([]);
      await run();
      expect(h.showQuickPick).not.toHaveBeenCalled();
      expect(h.showInformationMessage).toHaveBeenCalledWith('No runs found. Run a training first.');
    });
  });

  describe('the run picker', () => {
    it('lists indexed runs newest-first with label column, fingerprint prefix and date', async () => {
      await writeIndex([
        indexEntry('run-1', { dataset_fingerprint_sha256: FP_A, label_column: 'species' }),
        indexEntry('run-2', { dataset_fingerprint_sha256: FP_B, label_column: 'quality', created_at: '2026-10-02T09:00:00Z' }),
      ]);
      queuePicks(undefined);

      await run();

      expect(h.showQuickPick).toHaveBeenCalledTimes(1);
      const items = offeredAt(0);
      expect(items.map((i) => i.label)).toEqual(['run-2', 'run-1']);
      expect(items[0].description).toBe(`quality | ${FP_B.slice(0, 8)}...`);
      expect(items[0].detail).toBe(new Date('2026-10-02T09:00:00Z').toLocaleString());
      const opts = (h.showQuickPick.mock.calls[0] as unknown[])[1];
      expect(opts).toMatchObject({
        placeHolder: 'Select a run to view',
        title: 'RunForge: Browse Runs',
        matchOnDescription: true,
        matchOnDetail: true,
      });
    });

    it('puts orphaned runs above indexed ones, tagged "(saved but not indexed)"', async () => {
      await writeIndex([indexEntry('run-1')]);
      await writeRunDir('run-1', { 'run.json': runJson('run-1') });
      await writeRunDir('run-orph', { 'run.json': runJson('run-orph'), '.index-orphan': orphanMarker('run-orph') });
      queuePicks(undefined);

      await run();

      const items = offeredAt(0);
      expect(items.map((i) => i.label)).toEqual(['$(warning) run-orph', 'run-1']);
      expect(items[0].description).toBe('(saved but not indexed) | PermissionError');
      expect(items[0].detail).toBe(new Date('2026-10-01T10:30:00Z').toLocaleString());
    });

    it('still offers orphans when the index is unreadable (the headline recovery scenario)', async () => {
      await writeRunDir('run-orph', { 'run.json': runJson('run-orph'), '.index-orphan': orphanMarker('run-orph') });
      queuePicks(undefined);

      await run();

      expect(h.showQuickPick).toHaveBeenCalledTimes(1);
      expect(offeredAt(0).map((i) => i.label)).toEqual(['$(warning) run-orph']);
      expect(h.showInformationMessage).not.toHaveBeenCalled();
    });

    it('logs unreadable orphan markers to the output channel instead of listing them', async () => {
      await writeIndex([indexEntry('run-1')]);
      await writeRunDir('run-bad', { 'run.json': runJson('run-bad'), '.index-orphan': '{"half"' });
      await writeRunDir('run-nojson', { '.index-orphan': orphanMarker('run-nojson') });
      queuePicks(undefined);

      await run();

      expect(offeredAt(0).map((i) => i.label)).toEqual(['run-1']);
      const logged = channel.appendLine.mock.calls.map((c) => c[0] as string);
      expect(logged).toContain('RunForge: skipped 2 unreadable orphan marker(s):');
      expect(logged.some((l) => l.startsWith('  - [CORRUPT_JSON] run-bad:'))).toBe(true);
      expect(logged).toContain('  - [MISSING_RUN_JSON] run-nojson: marker found but run.json missing under run-nojson');
    });

    it('writes nothing to the channel when no marker was skipped', async () => {
      await writeIndex([indexEntry('run-1')]);
      queuePicks(undefined);
      await run();
      expect(channel.appendLine).not.toHaveBeenCalled();
    });

    it('does nothing further when the user dismisses the run picker', async () => {
      await writeIndex([indexEntry('run-1')]);
      queuePicks(undefined);
      await run();
      expect(h.showQuickPick).toHaveBeenCalledTimes(1);
      expect(h.showInformationMessage).not.toHaveBeenCalled();
      expect(h.showErrorMessage).not.toHaveBeenCalled();
    });
  });

  describe('indexed-run actions', () => {
    beforeEach(async () => {
      await writeIndex([indexEntry('run-1')]);
    });

    it('offers the four actions in order, titled for the chosen run', async () => {
      queuePicks(byLabel('run-1'), undefined);
      await run();

      expect(h.showQuickPick).toHaveBeenCalledTimes(2);
      expect(offeredAt(1).map((a) => a.action)).toEqual(['summary', 'diagnostics', 'artifact', 'copy-fingerprint']);
      expect(offeredAt(1).map((a) => a.label)).toEqual([
        '$(file-text) Open Run Summary',
        '$(warning) View Diagnostics',
        '$(file-binary) Inspect Model Artifact',
        '$(clippy) Copy Dataset Fingerprint',
      ]);
      expect((h.showQuickPick.mock.calls[1] as unknown[])[1]).toMatchObject({
        placeHolder: 'Action for run-1',
        title: 'Select Action',
      });
      // Dismissing the action picker performs no action.
      expect(h.writeText).not.toHaveBeenCalled();
      expect(h.openTextDocument).not.toHaveBeenCalled();
    });

    it('copy-fingerprint puts the full SHA-256 on the clipboard and confirms', async () => {
      queuePicks(byLabel('run-1'), byLabel('Copy Dataset Fingerprint'));
      await run();
      expect(h.writeText).toHaveBeenCalledWith(FP_A);
      expect(h.showInformationMessage).toHaveBeenCalledWith('Dataset fingerprint copied to clipboard.');
    });

    it('summary opens run.json rendered as markdown beside the editor', async () => {
      await writeRunDir('run-1', { 'run.json': runJson('run-1') });
      queuePicks(byLabel('run-1'), byLabel('Open Run Summary'));

      await run();

      expect(h.openTextDocument).toHaveBeenCalledTimes(1);
      const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string; language: string };
      expect(opened.language).toBe('markdown');
      expect(opened.content).toContain('# Run Summary — run-1');
      expect(opened.content).toContain('| Samples | 150 |');
      expect(opened.content).toContain('| Accuracy | 93.33% |');
      expect(h.showTextDocument).toHaveBeenCalledWith(expect.anything(), { preview: true, viewColumn: -2 });
      expect(h.showErrorMessage).not.toHaveBeenCalled();
    });

    it('summary reports a corrupted run.json and opens nothing', async () => {
      await writeRunDir('run-1', { 'run.json': '{ broken' });
      queuePicks(byLabel('run-1'), byLabel('Open Run Summary'));

      await run();

      expect(h.openTextDocument).not.toHaveBeenCalled();
      expect(h.showErrorMessage).toHaveBeenCalledTimes(1);
      expect(h.showErrorMessage.mock.calls[0][0]).toMatch(/^run\.json is corrupted\./);
    });

    it('diagnostics mirrors the synthesized report to the channel and opens it as markdown', async () => {
      await writeRunDir('run-1', { 'run.json': runJson('run-1', { dropped_rows_missing_values: 3 }) });
      queuePicks(byLabel('run-1'), byLabel('View Diagnostics'));

      await run();

      expect(channel.show).toHaveBeenCalledWith(true);
      const logged = channel.appendLine.mock.calls.map((c) => c[0] as string);
      expect(logged[0]).toBe('');
      expect(logged[1]).toContain('# Diagnostics — run-1');
      expect(logged[1]).toContain('MISSING_VALUES_DROPPED');
      expect(logged[1]).toContain('Dropped 3 rows with missing values');
      const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string; language: string };
      expect(opened.language).toBe('markdown');
      expect(opened.content).toBe(logged[1]);
    });

    it('diagnostics for a run with nothing notable says so', async () => {
      await writeRunDir('run-1', { 'run.json': runJson('run-1', { dropped_rows_missing_values: 0 }) });
      queuePicks(byLabel('run-1'), byLabel('View Diagnostics'));
      await run();
      const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string };
      expect(opened.content).toContain('No diagnostics recorded for this run.');
    });

    it('diagnostics reports a corrupted run.json and touches neither channel nor editor', async () => {
      await writeRunDir('run-1', { 'run.json': 'nope' });
      queuePicks(byLabel('run-1'), byLabel('View Diagnostics'));

      await run();

      expect(h.showErrorMessage.mock.calls[0][0]).toMatch(/^run\.json is corrupted\./);
      expect(channel.show).not.toHaveBeenCalled();
      expect(h.openTextDocument).not.toHaveBeenCalled();
    });

    it('inspect-artifact runs the Python CLI on the indexed model path and reports the pipeline', async () => {
      h.state.spawnScript.stdout = JSON.stringify({
        schema_version: '0.2.2.2',
        artifact_path: 'runs/run-1/artifacts/model.pkl',
        pipeline_steps: [
          { name: 'scaler', type: 'StandardScaler', module: 'sklearn.preprocessing' },
          { name: 'clf', type: 'LogisticRegression', module: 'sklearn.linear_model' },
        ],
        has_preprocessing: true,
        step_count: 2,
      });
      queuePicks(byLabel('run-1'), byLabel('Inspect Model Artifact'));

      await run();

      expect(h.state.spawnCalls).toHaveLength(1);
      const call = h.state.spawnCalls[0];
      expect(call.command).toBe('python-bin');
      expect(call.args).toEqual([
        '-m', 'ml_runner', 'inspect-artifact',
        '--artifact', path.join(root, '.ml', 'runs/run-1/artifacts/model.pkl'),
        '--base-path', root,
      ]);
      expect(call.options.cwd).toBe(path.join(root, 'runner'));
      expect(call.options.env?.PYTHONIOENCODING).toBe('utf-8');

      const logged = channel.appendLine.mock.calls.map((c) => c[0] as string);
      expect(logged).toContain('Inspecting model artifact...');
      expect(logged.some((l) => l.includes('1. scaler') && l.includes('2. clf'))).toBe(true);
      const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string; language: string };
      expect(opened.language).toBe('json');
      expect(JSON.parse(opened.content).step_count).toBe(2);
      expect(h.showInformationMessage).toHaveBeenCalledWith('Pipeline: 2 steps, preprocessing: yes');
    });

    it('inspect-artifact reports preprocessing: no for a bare estimator', async () => {
      h.state.spawnScript.stdout = JSON.stringify({
        schema_version: '0.2.2.2', artifact_path: 'x', pipeline_steps: [], has_preprocessing: false, step_count: 1,
      });
      queuePicks(byLabel('run-1'), byLabel('Inspect Model Artifact'));
      await run();
      expect(h.showInformationMessage).toHaveBeenCalledWith('Pipeline: 1 steps, preprocessing: no');
    });

    it('inspect-artifact surfaces the Python stderr as the failure message', async () => {
      h.state.spawnScript.code = 2;
      h.state.spawnScript.stderr = 'ModuleNotFoundError: No module named sklearn';
      queuePicks(byLabel('run-1'), byLabel('Inspect Model Artifact'));

      await run();

      const logged = channel.appendLine.mock.calls.map((c) => c[0] as string);
      expect(logged).toContain('ERROR: ModuleNotFoundError: No module named sklearn');
      expect(h.showErrorMessage).toHaveBeenCalledWith(
        'Artifact inspection failed: ModuleNotFoundError: No module named sklearn'
      );
      expect(h.openTextDocument).not.toHaveBeenCalled();
    });

    it('inspect-artifact reports a spawn failure (Python not found)', async () => {
      h.state.spawnScript.error = new Error('spawn python-bin ENOENT');
      queuePicks(byLabel('run-1'), byLabel('Inspect Model Artifact'));
      await run();
      expect(h.showErrorMessage).toHaveBeenCalledWith('Artifact inspection failed: spawn python-bin ENOENT');
    });
  });

  describe('orphaned-run actions', () => {
    beforeEach(async () => {
      await writeRunDir('run-orph', { 'run.json': runJson('run-orph'), '.index-orphan': orphanMarker('run-orph') });
    });

    it('warns with the humanized recovery copy before offering actions', async () => {
      queuePicks(byLabel('run-orph'), undefined);

      await run();

      expect(h.showWarningMessage).toHaveBeenCalledTimes(1);
      expect(h.showWarningMessage.mock.calls[0][0]).toContain('permission errors');
      expect(offeredAt(1).map((a) => a.action)).toEqual(['open-folder', 'copy-run-id', 'view-error']);
      expect((h.showQuickPick.mock.calls[1] as unknown[])[1]).toMatchObject({
        placeHolder: 'Action for run-orph (saved but not indexed)',
        title: 'Select Action',
      });
      // Orphans never enter the indexed-action path.
      expect(h.state.spawnCalls).toEqual([]);
      expect(h.writeText).not.toHaveBeenCalled();
    });

    it('open-folder reveals the run directory in the explorer', async () => {
      queuePicks(byLabel('run-orph'), byLabel('Open Run Folder'));
      await run();
      expect(h.executeCommand).toHaveBeenCalledTimes(1);
      const [cmd, uri] = h.executeCommand.mock.calls[0] as unknown as [string, { fsPath: string }];
      expect(cmd).toBe('revealInExplorer');
      expect(uri.fsPath).toBe(path.join(root, '.ml/runs/run-orph'));
    });

    it('copy-run-id copies the id and confirms', async () => {
      queuePicks(byLabel('run-orph'), byLabel('Copy Run ID'));
      await run();
      expect(h.writeText).toHaveBeenCalledWith('run-orph');
      expect(h.showInformationMessage).toHaveBeenCalledWith('Run ID copied to clipboard.');
    });

    it('view-error prints the marker, including the traceback line by line', async () => {
      await writeRunDir('run-tb', {
        'run.json': runJson('run-tb'),
        '.index-orphan': orphanMarker('run-tb', {
          error: { type: 'OSError', message: 'No space left on device', traceback: 'Traceback:\n  File "x.py", line 3\nOSError: ENOSPC' },
        }),
      });
      queuePicks(byLabel('run-tb'), byLabel('View Error Details'));

      await run();

      expect(channel.show).toHaveBeenCalledWith(true);
      const logged = channel.appendLine.mock.calls.map((c) => c[0] as string);
      expect(logged).toEqual([
        '',
        'Orphan marker: run-tb',
        '  written_at: 2026-10-01T10:30:00Z',
        '  index_path: .ml/outputs/index.json',
        '  error.type: OSError',
        '  error.message: No space left on device',
        '  traceback:',
        '    Traceback:',
        '      File "x.py", line 3',
        '    OSError: ENOSPC',
      ]);
    });

    it('view-error omits the traceback block when the marker has none', async () => {
      queuePicks(byLabel('run-orph'), byLabel('View Error Details'));
      await run();
      const logged = channel.appendLine.mock.calls.map((c) => c[0] as string);
      expect(logged).toContain('  error.message: index.json is read-only');
      expect(logged).not.toContain('  traceback:');
    });
  });
});
