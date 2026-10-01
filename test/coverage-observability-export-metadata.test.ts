/**
 * Export Latest Run as Markdown, plus the metadata helpers and editor-opening
 * helpers it is built on (loadProvenanceIndex, getLatestRunMetadataSafe,
 * openMarkdownSummary, openJsonDocument ...).
 *
 * Fixtures are real `.ml` trees in a temp workspace; vscode is mocked. The only
 * node:fs interception is a switch that makes one directory listing fail, to
 * reach the "could not list run artifacts" path that a healthy disk never hits.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const h = vi.hoisted(() => {
  const channel = { appendLine: vi.fn(), show: vi.fn() };
  return {
    channel,
    failListingOf: null as string | null,
    showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
    showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
    showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
    showTextDocument: vi.fn(() => Promise.resolve({ id: 'editor' })),
    openTextDocument: vi.fn((opts: unknown) => Promise.resolve({ opts })),
    createOutputChannel: vi.fn(() => channel),
    workspace: { workspaceFolders: undefined as unknown, openTextDocument: undefined as unknown },
  };
});
h.workspace.openTextDocument = h.openTextDocument;

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: h.showErrorMessage,
    showInformationMessage: h.showInformationMessage,
    showWarningMessage: h.showWarningMessage,
    showTextDocument: h.showTextDocument,
    createOutputChannel: h.createOutputChannel,
  },
  workspace: h.workspace,
  Uri: { file: (p: string) => ({ fsPath: p }) },
  ViewColumn: { Beside: -2, Active: -1 },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const readdirSync = ((p: string, ...rest: unknown[]) => {
    if (h.failListingOf !== null && path.resolve(String(p)) === path.resolve(h.failListingOf)) {
      throw new Error('EACCES: permission denied, scandir');
    }
    return (actual.readdirSync as (...a: unknown[]) => unknown)(p, ...rest);
  }) as typeof actual.readdirSync;
  return { ...actual, readdirSync, default: { ...actual, readdirSync } };
});

import { exportLatestRunAsMarkdown } from '../src/observability/export-markdown-command.js';
import {
  formatMetadata,
  getLatestRunEntry,
  getLatestRunMetadata,
  getLatestRunMetadataSafe,
  getRunforgeDir,
  loadProvenanceIndex,
  loadRunMetadata,
  openMetadataInEditor,
  surfaceOrphanBannerIfAny,
} from '../src/observability/metadata-command.js';
import { openJsonDocument, openMarkdownSummary } from '../src/observability/open-summary.js';
import type { RunMetadata } from '../src/types.js';

const FP = 'beef1234'.repeat(8);

function runJson(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: id,
    runforge_version: '1.0.1',
    schema_version: 'run.v0.3.6',
    created_at: '2026-10-01T08:00:00Z',
    dataset: { path: 'data/sample.csv', fingerprint_sha256: FP },
    label_column: 'species',
    model_family: 'logistic_regression',
    num_samples: 120,
    num_features: 4,
    dropped_rows_missing_values: 0,
    metrics: { accuracy: 0.9, num_samples: 120, num_features: 4 },
    artifacts: { model_pkl: 'artifacts/model.pkl' },
    ...overrides,
  };
}

function indexEntry(id: string): Record<string, unknown> {
  return {
    run_id: id,
    created_at: '2026-10-01T08:00:00Z',
    name: 'sample training',
    preset_id: 'std-train',
    status: 'succeeded',
    summary: { duration_ms: 1, final_metrics: { accuracy: 0.9 }, device: 'cpu' },
    run_dir: `.ml/runs/${id}`,
    dataset_fingerprint_sha256: FP,
    label_column: 'species',
    model_pkl: `runs/${id}/artifacts/model.pkl`,
  };
}

describe('export markdown and metadata (coverage)', () => {
  let root: string;

  const runDir = (id: string) => path.join(root, '.ml', 'runs', id);

  async function writeIndex(ids: string[]): Promise<void> {
    const outputs = path.join(root, '.ml', 'outputs');
    await fsp.mkdir(outputs, { recursive: true });
    await fsp.writeFile(
      path.join(outputs, 'index.json'),
      JSON.stringify({ schema_version: '0.2.2.1', runs: ids.map(indexEntry) })
    );
  }

  async function writeRun(id: string, files: Record<string, unknown | string> = {}, artifacts: Record<string, unknown | string> = {}): Promise<void> {
    const dir = runDir(id);
    await fsp.mkdir(path.join(dir, 'artifacts'), { recursive: true });
    const put = async (base: string, entries: Record<string, unknown | string>) => {
      for (const [name, body] of Object.entries(entries)) {
        await fsp.writeFile(path.join(base, name), typeof body === 'string' ? body : JSON.stringify(body));
      }
    };
    await put(dir, { 'run.json': runJson(id), ...files });
    await put(path.join(dir, 'artifacts'), artifacts);
  }

  async function exportAndRead(id: string): Promise<string> {
    await exportLatestRunAsMarkdown();
    return fsp.readFile(path.join(runDir(id), 'run-summary.md'), 'utf-8');
  }

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'runforge-export-cov-'));
    h.workspace.workspaceFolders = [{ uri: { fsPath: root } }];
    h.failListingOf = null;
    for (const fn of [
      h.showErrorMessage, h.showInformationMessage, h.showWarningMessage, h.showTextDocument,
      h.openTextDocument, h.createOutputChannel, h.channel.appendLine, h.channel.show,
    ]) {
      fn.mockClear();
    }
  });

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  describe('exportLatestRunAsMarkdown: failure paths', () => {
    it.each([
      ['no workspace folder is open', undefined],
      ['the folder list is empty', []],
    ])('asks for a folder when %s', async (_label, folders) => {
      h.workspace.workspaceFolders = folders;
      await exportLatestRunAsMarkdown();
      expect(h.showErrorMessage).toHaveBeenCalledWith('Please open a workspace folder first.');
      expect(h.showTextDocument).not.toHaveBeenCalled();
    });

    it('says "No runs yet" for an empty workspace and writes nothing', async () => {
      await exportLatestRunAsMarkdown();
      expect(h.showInformationMessage).toHaveBeenCalledWith('No runs yet. Run a training to generate runs.');
      expect(h.showTextDocument).not.toHaveBeenCalled();
    });

    it('says "No runs found" for an index with no runs', async () => {
      await writeIndex([]);
      await exportLatestRunAsMarkdown();
      expect(h.showInformationMessage).toHaveBeenCalledWith('No runs found. Run a training first.');
    });

    it('explains a corrupted run.json for the latest indexed run', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', { 'run.json': '{ nope' });
      await exportLatestRunAsMarkdown();
      expect(h.showInformationMessage.mock.calls[0][0]).toMatch(/^run\.json is corrupted\./);
      await expect(fsp.access(path.join(runDir('run-1'), 'run-summary.md'))).rejects.toThrow();
    });

    it('reports "Could not locate run directory" when the index points at a run outside .ml/runs', async () => {
      // Index entry resolves to a readable run.json, but .ml/runs has no run directories.
      const outputs = path.join(root, '.ml', 'outputs');
      await fsp.mkdir(outputs, { recursive: true });
      const entry = { ...indexEntry('elsewhere-1'), run_dir: 'archive/elsewhere-1' };
      await fsp.writeFile(path.join(outputs, 'index.json'), JSON.stringify({ schema_version: '0.2.2.1', runs: [entry] }));
      await fsp.mkdir(path.join(root, 'archive', 'elsewhere-1'), { recursive: true });
      await fsp.writeFile(path.join(root, 'archive', 'elsewhere-1', 'run.json'), JSON.stringify(runJson('elsewhere-1')));

      await exportLatestRunAsMarkdown();

      expect(h.showErrorMessage).toHaveBeenCalledWith('Could not locate run directory.');
      expect(h.showTextDocument).not.toHaveBeenCalled();
    });
  });

  describe('exportLatestRunAsMarkdown: output', () => {
    it('writes run-summary.md, opens it (not as a preview) and confirms with the folder name', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1');

      await exportLatestRunAsMarkdown();

      const summaryPath = path.join(runDir('run-1'), 'run-summary.md');
      await expect(fsp.access(summaryPath)).resolves.toBeUndefined();
      const [uri, options] = h.showTextDocument.mock.calls[0] as unknown as [{ fsPath: string }, unknown];
      expect(uri.fsPath).toBe(summaryPath);
      expect(options).toEqual({ preview: false });
      expect(h.showInformationMessage).toHaveBeenCalledWith('Run summary saved to run-1/run-summary.md');
    });

    it('renders overview, dataset, base metrics and the model artifact for a minimal run', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1');

      const md = await exportAndRead('run-1');

      expect(md).toContain('# Run Summary: run-1');
      expect(md).toContain('| Run ID | `run-1` |');
      expect(md).toContain('| RunForge Version | 1.0.1 |');
      expect(md).toContain('| Label Column | `species` |');
      expect(md).toContain('| Samples | 120 |');
      expect(md).toContain('| Features | 4 |');
      expect(md).not.toContain('Dropped Rows (missing)');
      expect(md).toContain('| Path | `data/sample.csv` |');
      expect(md).toContain('| SHA-256 | `beef1234beef1234...` |');
      expect(md).toContain('| Accuracy | 90.00% |');
      expect(md).toContain('| Model | `artifacts/model.pkl` |');
      expect(md).not.toContain('Detailed Metrics');
      expect(md).not.toContain('## Interpretability');
      expect(md).toMatch(/\*Generated by RunForge at \d{4}-\d{2}-\d{2}T[\d:.]+Z\*/);
    });

    it('adds a Dropped Rows row only when rows were dropped', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', { 'run.json': runJson('run-1', { dropped_rows_missing_values: 5 }) });
      expect(await exportAndRead('run-1')).toContain('| Dropped Rows (missing) | 5 |');
    });

    it('omits the base metrics table and the model row when run.json has neither', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', { 'run.json': runJson('run-1', { metrics: undefined, artifacts: {} }) });
      const md = await exportAndRead('run-1');
      expect(md).toContain('## Metrics');
      expect(md).not.toContain('| Accuracy |');
      expect(md).not.toContain('| Model |');
    });

    it('renders every detailed v1 metric and a labelled confusion matrix', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', {
        'metrics.v1.json': {
          schema_version: 'metrics.v1',
          metrics_profile: 'classification.proba.v1',
          num_classes: 2,
          accuracy: 0.95,
          precision_macro: 0.9,
          recall_macro: 0.85,
          f1_macro: 0.875,
          roc_auc: 0.99,
          log_loss: 0.123456,
          confusion_matrix: [[8, 2], [1, 9]],
          class_labels: ['no', 'yes'],
        },
      });

      const md = await exportAndRead('run-1');

      expect(md).toContain('### Detailed Metrics (v1)');
      expect(md).toContain('**Profile:** classification.proba.v1');
      expect(md).toContain('| Accuracy | 95.00% |');
      expect(md).toContain('| Precision (macro) | 90.00% |');
      expect(md).toContain('| Recall (macro) | 85.00% |');
      expect(md).toContain('| F1 (macro) | 87.50% |');
      expect(md).toContain('| ROC-AUC | 99.00% |');
      expect(md).toContain('| Log Loss | 0.1235 |');
      expect(md).toContain('### Confusion Matrix');
      expect(md).toContain('| | **no** | **yes** |');
      expect(md).toContain('|---|---|---|');
      expect(md).toContain('| **no** | 8 | 2 |');
      expect(md).toContain('| **yes** | 1 | 9 |');
    });

    it('renders an unlabelled confusion matrix as plain rows, and tolerates a metrics file with few fields', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', {
        'metrics.v1.json': { confusion_matrix: [[3, 0], [1, 4]] },
      });

      const md = await exportAndRead('run-1');

      expect(md).toContain('**Profile:** unknown');
      expect(md).toContain('### Confusion Matrix');
      expect(md).toContain('| 3 | 0 |');
      expect(md).toContain('| 1 | 4 |');
      // No v1 accuracy / precision rows were invented.
      expect(md).not.toContain('Precision (macro)');
      expect(md).not.toContain('ROC-AUC');
    });

    it('ignores a corrupt metrics.v1.json instead of failing the export', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', { 'metrics.v1.json': '{ broken' });
      const md = await exportAndRead('run-1');
      expect(md).not.toContain('Detailed Metrics');
      expect(md).toContain('## Artifacts');
    });

    it('renders interpretability rows with Available / Not available and "unknown" fallbacks', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', {}, {
        'interpretability.index.v1.json': {
          artifacts: [
            { name: 'feature_importance', type: 'feature_importance.v1', present: true },
            { name: 'linear_coefficients', type: 'linear_coefficients.v1', present: false },
            {},
          ],
        },
      });

      const md = await exportAndRead('run-1');

      expect(md).toContain('## Interpretability');
      expect(md).toContain('| feature_importance | feature_importance.v1 | Available |');
      expect(md).toContain('| linear_coefficients | linear_coefficients.v1 | Not available |');
      expect(md).toContain('| unknown | unknown | Not available |');
    });

    it('prints the Interpretability heading but no table for an index with an empty artifact list', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', {}, { 'interpretability.index.v1.json': { artifacts: [] } });
      const md = await exportAndRead('run-1');
      expect(md).toContain('## Interpretability');
      expect(md).not.toContain('| Artifact | Type | Status |');
    });

    it('lists run-folder files and artifacts/ files, but not run.json or an earlier run-summary.md', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', { 'logs.txt': 'training log', 'run-summary.md': 'stale summary' }, { 'model.pkl': 'bytes' });
      await fsp.mkdir(path.join(runDir('run-1'), 'scratch-dir'));

      const md = await exportAndRead('run-1');

      expect(md).toMatch(/\| logs\.txt \| `[^`]*logs\.txt` \|/);
      expect(md).toMatch(/\| artifacts\/model\.pkl \| `[^`]*artifacts\/model\.pkl` \|/);
      expect(md).not.toMatch(/\| run\.json \|/);
      expect(md).not.toMatch(/\| run-summary\.md \|/);
      // Directories other than artifacts/ are not listed as files.
      expect(md).not.toContain('scratch-dir');
      // The stale summary was overwritten with the fresh one.
      expect(md).not.toContain('stale summary');
    });

    it('re-exporting does not list the previous summary as an artifact', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1');
      await exportAndRead('run-1');
      const second = await exportAndRead('run-1');
      expect(second).not.toMatch(/\| run-summary\.md \|/);
    });

    it('notes the failure in the markdown and the output channel when the run folder cannot be listed', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1');
      h.failListingOf = runDir('run-1');

      const md = await exportAndRead('run-1');

      expect(md).toContain('| _error_ | `Could not list run artifacts: EACCES: permission denied, scandir` |');
      expect(h.createOutputChannel).toHaveBeenCalledWith('RunForge Export Markdown');
      const logged = h.channel.appendLine.mock.calls.map((c) => c[0] as string);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain('[export-markdown] Failed to list');
      expect(logged[0]).toContain('EACCES: permission denied, scandir');
    });

    it('shows the orphan banner exactly once per export', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1');
      await writeRun('run-orph', {
        '.index-orphan': {
          schema_version: 'index-orphan.v1.0.0',
          run_id: 'run-orph',
          run_dir: '.ml/runs/run-orph',
          written_at: '2026-10-01T10:00:00Z',
          error: { type: 'OSError', message: 'disk full' },
          index_path: '.ml/outputs/index.json',
        },
      });

      await exportLatestRunAsMarkdown();

      const banners = h.showWarningMessage.mock.calls.filter((c) => String(c[0]).includes('saved but not indexed'));
      expect(banners).toHaveLength(1);
      expect(banners[0][0]).toBe(
        '1 run(s) saved but not indexed. Run "RunForge: Recover Index" to add them to the run list, or use "RunForge: Browse Runs" to open them directly.'
      );
    });
  });

  describe('metadata helpers', () => {
    it('getRunforgeDir joins the .ml root onto the workspace', () => {
      expect(getRunforgeDir(root)).toBe(path.join(root, '.ml'));
    });

    it('loadProvenanceIndex returns null for a missing or corrupt index, and the index when valid', async () => {
      expect(await loadProvenanceIndex(root)).toBeNull();
      const outputs = path.join(root, '.ml', 'outputs');
      await fsp.mkdir(outputs, { recursive: true });
      await fsp.writeFile(path.join(outputs, 'index.json'), '{ nope');
      expect(await loadProvenanceIndex(root)).toBeNull();
      await writeIndex(['run-1']);
      expect((await loadProvenanceIndex(root))?.runs.map((r) => r.run_id)).toEqual(['run-1']);
    });

    it('getLatestRunEntry returns null with no index or no runs, and the LAST run otherwise', async () => {
      expect(await getLatestRunEntry(root)).toBeNull();
      await writeIndex([]);
      expect(await getLatestRunEntry(root)).toBeNull();
      await writeIndex(['run-1', 'run-2', 'run-3']);
      expect((await getLatestRunEntry(root))?.run_id).toBe('run-3');
    });

    it('loadRunMetadata returns null for a missing or corrupt run.json', async () => {
      await fsp.mkdir(runDir('run-1'), { recursive: true });
      expect(await loadRunMetadata(runDir('run-1'))).toBeNull();
      await fsp.writeFile(path.join(runDir('run-1'), 'run.json'), '[');
      expect(await loadRunMetadata(runDir('run-1'))).toBeNull();
      await fsp.writeFile(path.join(runDir('run-1'), 'run.json'), JSON.stringify(runJson('run-1')));
      expect((await loadRunMetadata(runDir('run-1')))?.run_id).toBe('run-1');
    });

    it('getLatestRunMetadata follows the latest index entry to its run.json, or returns null', async () => {
      expect(await getLatestRunMetadata(root)).toBeNull();
      await writeIndex(['run-1', 'run-2']);
      expect(await getLatestRunMetadata(root)).toBeNull(); // index points at runs with no run.json yet
      await writeRun('run-2');
      expect((await getLatestRunMetadata(root))?.run_id).toBe('run-2');
    });

    it('formatMetadata pretty-prints with two-space indentation', () => {
      expect(formatMetadata({ run_id: 'r' } as RunMetadata)).toBe('{\n  "run_id": "r"\n}');
    });

    it('openMetadataInEditor opens indented JSON in the active column, not as a preview', async () => {
      await openMetadataInEditor({ run_id: 'r', num_samples: 3 } as RunMetadata);
      const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string; language: string };
      expect(opened.language).toBe('json');
      expect(JSON.parse(opened.content)).toEqual({ run_id: 'r', num_samples: 3 });
      expect(h.showTextDocument).toHaveBeenCalledWith(expect.anything(), { preview: false, viewColumn: -1 });
    });

    it('surfaceOrphanBannerIfAny stays silent without orphans', async () => {
      await surfaceOrphanBannerIfAny(root);
      expect(h.showWarningMessage).not.toHaveBeenCalled();
    });
  });

  describe('getLatestRunMetadataSafe', () => {
    it('returns an actionable message when there is no index', async () => {
      const result = await getLatestRunMetadataSafe(root);
      expect(result).toEqual({ ok: false, message: 'No runs yet. Run a training to generate runs.' });
    });

    it('returns "No runs found" for an index with no runs, and also when `runs` is missing', async () => {
      await writeIndex([]);
      expect(await getLatestRunMetadataSafe(root)).toEqual({ ok: false, message: 'No runs found. Run a training first.' });

      await fsp.writeFile(path.join(root, '.ml', 'outputs', 'index.json'), JSON.stringify({ schema_version: '0.2.2.1' }));
      expect(await getLatestRunMetadataSafe(root)).toEqual({ ok: false, message: 'No runs found. Run a training first.' });
    });

    it('returns the corrupted-file message for a bad latest run.json', async () => {
      await writeIndex(['run-1']);
      await writeRun('run-1', { 'run.json': 'garbage' });
      const result = await getLatestRunMetadataSafe(root);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/^run\.json is corrupted\./);
    });

    it('returns the latest run metadata when everything is intact', async () => {
      await writeIndex(['run-1', 'run-2']);
      await writeRun('run-2');
      const result = await getLatestRunMetadataSafe(root);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.run_id).toBe('run-2');
    });

    it('shows the orphan banner by default and not when asked to suppress it', async () => {
      await writeRun('run-orph', {
        '.index-orphan': {
          schema_version: 'index-orphan.v1.0.0',
          run_id: 'run-orph',
          run_dir: '.ml/runs/run-orph',
          written_at: '2026-10-01T10:00:00Z',
          error: { type: 'OSError', message: 'disk full' },
          index_path: '.ml/outputs/index.json',
        },
      });
      await getLatestRunMetadataSafe(root, { surfaceOrphanBanner: false });
      expect(h.showWarningMessage).not.toHaveBeenCalled();
      await getLatestRunMetadataSafe(root);
      expect(h.showWarningMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('open-summary helpers', () => {
    it('openMarkdownSummary defaults to a preview beside the active editor', async () => {
      const editor = await openMarkdownSummary('# hello');
      expect(editor).toEqual({ id: 'editor' });
      expect((h.openTextDocument.mock.calls[0] as unknown[])[0]).toEqual({ content: '# hello', language: 'markdown' });
      expect(h.showTextDocument).toHaveBeenCalledWith(expect.anything(), { preview: true, viewColumn: -2 });
    });

    it('openMarkdownSummary honours explicit options', async () => {
      await openMarkdownSummary('# hello', { preview: false, viewColumn: -1 as never });
      expect(h.showTextDocument).toHaveBeenCalledWith(expect.anything(), { preview: false, viewColumn: -1 });
    });

    it('openJsonDocument serializes with two-space indentation and the json language', async () => {
      await openJsonDocument({ a: [1, 2] });
      expect((h.openTextDocument.mock.calls[0] as unknown[])[0]).toEqual({
        content: '{\n  "a": [\n    1,\n    2\n  ]\n}',
        language: 'json',
      });
      expect(h.showTextDocument).toHaveBeenCalledWith(expect.anything(), { preview: true, viewColumn: -2 });
    });
  });
});
