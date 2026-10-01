/**
 * Three observability commands that do not do what they were written to do.
 *
 * 1. "Inspect Model Artifact" opens the inspection result as JSON, but the
 *    pipeline steps (the thing being inspected) come out as empty objects.
 * 2. "Export Run as Markdown" reads `interpretability.index.v1.json` as an
 *    `artifacts[]` array, but the real writer (python/ml_runner/
 *    interpretability_index.py, schema interpretability.index.schema.v1.json)
 *    emits an `available_artifacts` object, so a real run gets an empty
 *    "Interpretability" section.
 *
 * 3. "Recover Index" is meant to open its structured report as markdown, but it
 *    loads the renderer through `new Function('return import(p)')` with a
 *    relative path. That resolves to nothing, the failure is swallowed, and the
 *    report never opens (the esbuild bundle does not contain the renderer
 *    either: dist/extension.js has no 'Recovery Report' text).
 *
 * The interpretability test uses the shape the Python writer actually produces.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const h = vi.hoisted(() => ({
  showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
  showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
  showTextDocument: vi.fn(() => Promise.resolve(undefined)),
  openTextDocument: vi.fn((opts: unknown) => Promise.resolve({ opts })),
  workspace: { workspaceFolders: undefined as unknown, openTextDocument: undefined as unknown },
}));
h.workspace.openTextDocument = h.openTextDocument;

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: h.showErrorMessage,
    showInformationMessage: h.showInformationMessage,
    showWarningMessage: h.showWarningMessage,
    showTextDocument: h.showTextDocument,
    createOutputChannel: () => ({ appendLine: () => {}, show: () => {} }),
  },
  workspace: h.workspace,
  Uri: { file: (p: string) => ({ fsPath: p }) },
  ViewColumn: { Beside: -2, Active: -1 },
}));

import { openInspectionInEditor, type ArtifactInspectResult } from '../src/observability/artifact-inspect-command.js';
import { exportLatestRunAsMarkdown } from '../src/observability/export-markdown-command.js';
import { recoverIndex } from '../src/observability/recover-index-command.js';

beforeEach(() => {
  h.openTextDocument.mockClear();
  h.showTextDocument.mockClear();
});

describe('Inspect Model Artifact: JSON view keeps the pipeline steps', () => {
  it('writes every step field into the opened document, with top-level keys sorted', async () => {
    const result: ArtifactInspectResult = {
      schema_version: '0.2.2.2',
      artifact_path: 'runs/r1/artifacts/model.pkl',
      pipeline_steps: [
        { name: 'scaler', type: 'StandardScaler', module: 'sklearn.preprocessing' },
        { name: 'clf', type: 'LogisticRegression', module: 'sklearn.linear_model' },
      ],
      has_preprocessing: true,
      step_count: 2,
    };

    await openInspectionInEditor(result);

    const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string; language: string };
    expect(opened.language).toBe('json');
    const parsed = JSON.parse(opened.content);
    expect(parsed.pipeline_steps).toEqual(result.pipeline_steps);
    expect(Object.keys(parsed)).toEqual([
      'artifact_path',
      'has_preprocessing',
      'pipeline_steps',
      'schema_version',
      'step_count',
    ]);
  });
});

describe('Export Run as Markdown: interpretability section from a real index', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-drift-'));
    h.workspace.workspaceFolders = [{ uri: { fsPath: root } }];
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('lists the artifacts named in `available_artifacts`', async () => {
    const dir = path.join(root, '.ml', 'runs', 'run-1');
    await fs.mkdir(path.join(dir, 'artifacts'), { recursive: true });
    await fs.mkdir(path.join(root, '.ml', 'outputs'), { recursive: true });
    await fs.writeFile(
      path.join(root, '.ml', 'outputs', 'index.json'),
      JSON.stringify({
        schema_version: '0.2.2.1',
        runs: [
          {
            run_id: 'run-1',
            created_at: '2026-10-01T08:00:00Z',
            name: 'sample',
            preset_id: 'std-train',
            status: 'succeeded',
            summary: { duration_ms: 1, final_metrics: {}, device: 'cpu' },
            run_dir: '.ml/runs/run-1',
            dataset_fingerprint_sha256: 'a'.repeat(64),
            label_column: 'species',
            model_pkl: 'runs/run-1/artifacts/model.pkl',
          },
        ],
      })
    );
    await fs.writeFile(
      path.join(dir, 'run.json'),
      JSON.stringify({
        run_id: 'run-1',
        runforge_version: '1.0.1',
        schema_version: 'run.v0.3.6',
        created_at: '2026-10-01T08:00:00Z',
        dataset: { path: 'data/sample.csv', fingerprint_sha256: 'a'.repeat(64) },
        label_column: 'species',
        num_samples: 10,
        num_features: 2,
        dropped_rows_missing_values: 0,
        artifacts: { model_pkl: 'artifacts/model.pkl' },
      })
    );
    // Exactly what python/ml_runner/interpretability_index.py writes.
    await fs.writeFile(
      path.join(dir, 'artifacts', 'interpretability.index.v1.json'),
      JSON.stringify({
        schema_version: 'interpretability.index.v1',
        run_id: 'run-1',
        runforge_version: '1.0.1',
        created_at: '2026-10-01T08:00:01+00:00',
        available_artifacts: {
          metrics_v1: {
            schema_version: 'metrics.v1',
            path: 'metrics.v1.json',
            summary: { metrics_profile: 'classification.base.v1', accuracy: 0.9 },
          },
          feature_importance_v1: {
            schema_version: 'feature_importance.v1',
            path: 'artifacts/feature_importance.v1.json',
            summary: { model_family: 'random_forest', top_k: ['petal'] },
          },
        },
      })
    );

    await exportLatestRunAsMarkdown();

    const md = await fs.readFile(path.join(dir, 'run-summary.md'), 'utf-8');
    expect(md).toContain('## Interpretability');
    expect(md).toContain('| metrics_v1 | metrics.v1 | Available |');
    expect(md).toContain('| feature_importance_v1 | feature_importance.v1 | Available |');
  });
});

describe('Recover Index: the structured report is opened as markdown', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-drift-recover-'));
    h.workspace.workspaceFolders = [{ uri: { fsPath: root } }];
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('opens a "Recovery Report" document listing the recovered run', async () => {
    const dir = path.join(root, '.ml', 'runs', 'run-1');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'run.json'),
      JSON.stringify({
        run_id: 'run-1',
        runforge_version: '1.0.1',
        schema_version: 'run.v0.3.6',
        created_at: '2026-10-01T08:00:00Z',
        dataset: { path: 'data/sample.csv', fingerprint_sha256: 'a'.repeat(64) },
        label_column: 'species',
        num_samples: 10,
        num_features: 2,
        dropped_rows_missing_values: 0,
        artifacts: { model_pkl: 'artifacts/model.pkl' },
      })
    );

    const report = await recoverIndex();

    expect(report?.recovered.map((r) => r.run_id)).toEqual(['run-1']);
    expect(h.openTextDocument).toHaveBeenCalledTimes(1);
    const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string; language: string };
    expect(opened.language).toBe('markdown');
    expect(opened.content).toContain('# Recovery Report');
    expect(opened.content).toContain('run-1');
    expect(h.showTextDocument).toHaveBeenCalledWith(expect.anything(), { preview: true });
  });
});
