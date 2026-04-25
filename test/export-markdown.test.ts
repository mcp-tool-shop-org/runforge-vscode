/**
 * Export-markdown escape verification (F-TESTS-003).
 *
 * Bridge amend 01b9b9f added escapeTableCell() at every interpolation site
 * in src/observability/export-markdown-command.ts. These tests feed inputs
 * with pipe characters and verify the rendered markdown contains the
 * escaped form (`\|`) and the table structure stays intact.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      dispose: () => {},
    }),
    showErrorMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
    showTextDocument: () => Promise.resolve(undefined),
  },
  workspace: { workspaceFolders: undefined },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

import { escapeTableCell } from '../src/observability/render/escape.js';
import { exportLatestRunAsMarkdown } from '../src/observability/export-markdown-command.js';

describe('escapeTableCell (unit)', () => {
  it('escapes a single pipe', () => {
    expect(escapeTableCell('class|A')).toBe('class\\|A');
  });

  it('escapes multiple pipes', () => {
    expect(escapeTableCell('a|b|c')).toBe('a\\|b\\|c');
  });

  it('passes through strings with no pipe unchanged', () => {
    expect(escapeTableCell('regular_label')).toBe('regular_label');
  });

  it('coerces non-strings to string', () => {
    expect(escapeTableCell(42)).toBe('42');
    expect(escapeTableCell(null)).toBe('null');
    expect(escapeTableCell(undefined)).toBe('undefined');
  });
});

describe('export-markdown end-to-end escape coverage', () => {
  let tmpDir: string;
  let workspaceRoot: string;
  let runDir: string;
  let summaryPath: string;
  let cwd: string;

  beforeEach(async () => {
    cwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runforge-md-'));
    workspaceRoot = tmpDir;
    runDir = path.join(workspaceRoot, '.runforge', 'runs', '20260424-120000-abc12345');
    fs.mkdirSync(path.join(runDir, 'artifacts'), { recursive: true });
    summaryPath = path.join(runDir, 'run-summary.md');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeRun(opts: {
    classLabels?: Array<string | number>;
    artifactName?: string;
    extraFile?: string;
  }): void {
    const runJson = {
      run_id: '20260424-120000-abc12345',
      runforge_version: '0.3.6.0',
      schema_version: 'run.v0.3.6',
      created_at: '2026-04-24T12:00:00+00:00',
      label_column: 'lbl|col',
      num_samples: 10,
      num_features: 2,
      dropped_rows_missing_values: 0,
      dataset: { path: '/data/x.csv', fingerprint_sha256: 'a'.repeat(64) },
      artifacts: { model_pkl: 'artifacts/model.pkl' },
      metrics: { accuracy: 0.95, num_samples: 10, num_features: 2 },
    };
    fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runJson));

    // Write .runforge/index.json so getLatestRunMetadataSafe finds it.
    const indexPath = path.join(workspaceRoot, '.runforge', 'index.json');
    const idx = {
      schema_version: 'index.v1',
      runs: [
        {
          run_id: '20260424-120000-abc12345',
          created_at: '2026-04-24T12:00:00+00:00',
          dataset_fingerprint: 'a'.repeat(64),
          label_column: 'lbl|col',
          run_dir: 'runs/20260424-120000-abc12345/run.json',
          model_pkl: 'runs/20260424-120000-abc12345/artifacts/model.pkl',
        },
      ],
    };
    fs.writeFileSync(indexPath, JSON.stringify(idx));

    if (opts.classLabels) {
      const metricsV1 = {
        metrics_profile: 'classification.base.v1',
        accuracy: 0.95,
        confusion_matrix: opts.classLabels.map((_, i) =>
          opts.classLabels!.map((__, j) => (i === j ? 5 : 0))
        ),
        class_labels: opts.classLabels,
      };
      fs.writeFileSync(path.join(runDir, 'metrics.v1.json'), JSON.stringify(metricsV1));
    }

    if (opts.artifactName) {
      const interpIndex = {
        artifacts: [{ name: opts.artifactName, type: 'feature_importance.v1', present: true }],
      };
      fs.writeFileSync(
        path.join(runDir, 'artifacts', 'interpretability.index.v1.json'),
        JSON.stringify(interpIndex)
      );
    }

    if (opts.extraFile) {
      fs.writeFileSync(path.join(runDir, opts.extraFile), 'placeholder');
    }
  }

  async function runExport(): Promise<string> {
    const vscode = await import('vscode');
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: { fsPath: workspaceRoot } },
    ];
    await exportLatestRunAsMarkdown();
    return fs.readFileSync(summaryPath, 'utf-8');
  }

  it('escapes pipe in class labels', async () => {
    writeRun({ classLabels: ['class|A', 'class|B'] });
    const md = await runExport();
    expect(md).toContain('class\\|A');
    expect(md).toContain('class\\|B');
    // Raw unescaped form must NOT appear in the cell text.
    expect(md).not.toContain('**class|A**');
  });

  it('escapes pipe in interpretability artifact names', async () => {
    writeRun({ classLabels: ['ok'], artifactName: 'art|name' });
    const md = await runExport();
    expect(md).toContain('art\\|name');
    expect(md).not.toMatch(/\| art\|name \|/);
  });

  it.skipIf(process.platform === 'win32')(
    'escapes pipe in filenames listed under Artifacts',
    async () => {
      writeRun({ classLabels: ['ok'], extraFile: 'weird|file.txt' });
      const md = await runExport();
      expect(md).toContain('weird\\|file.txt');
    }
  );

  it('escapes pipe in label_column field rendered into Overview table', async () => {
    writeRun({ classLabels: ['ok'] });
    const md = await runExport();
    // The label_column was set to 'lbl|col' in writeRun. It should appear
    // escaped in the Overview table.
    expect(md).toContain('lbl\\|col');
  });

  it('renders unchanged content when no pipes are present', async () => {
    writeRun({ classLabels: ['cat', 'dog'] });
    const md = await runExport();
    expect(md).toContain('**cat**');
    expect(md).toContain('**dog**');
    // No spurious backslash-pipes when input is clean.
    expect(md).not.toContain('cat\\|');
    expect(md).not.toContain('dog\\|');
  });
});
