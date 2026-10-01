/**
 * Dataset inspection and model-artifact inspection: the two commands that shell
 * out to `python -m ml_runner ...` and parse its JSON stdout.
 *
 * The child process is a fake EventEmitter so every outcome is deterministic
 * (exit 0 with JSON, exit 0 with garbage, non-zero exit with and without
 * stderr, spawn error). What is asserted: the exact argv / cwd / env handed to
 * Python, the parsed result, the rejection message the UI will show, and the
 * text the formatters print.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const h = vi.hoisted(() => ({
  spawnCalls: [] as Array<{ command: string; args: string[]; options: { cwd?: string; env?: NodeJS.ProcessEnv } }>,
  script: { stdout: [] as string[], stderr: '', code: 0 as number | null, error: null as Error | null },
  showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
  openTextDocument: vi.fn((opts: unknown) => Promise.resolve({ opts })),
  showTextDocument: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('vscode', () => ({
  window: { showWarningMessage: h.showWarningMessage, showTextDocument: h.showTextDocument },
  workspace: { openTextDocument: h.openTextDocument },
  ViewColumn: { Beside: -2 },
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: (command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
      h.spawnCalls.push({ command, args, options });
      const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      setImmediate(() => {
        if (h.script.error) {
          proc.emit('error', h.script.error);
          return;
        }
        // Deliver stdout in the chunks the test asked for (JSON may arrive split).
        for (const chunk of h.script.stdout) proc.stdout.emit('data', Buffer.from(chunk));
        if (h.script.stderr) proc.stderr.emit('data', Buffer.from(h.script.stderr));
        proc.emit('close', h.script.code);
      });
      return proc;
    },
  };
});

import {
  formatInspectResult,
  inspectDataset,
  type InspectResult,
} from '../src/observability/inspect-command.js';
import {
  formatArtifactInspectResult,
  inspectArtifact,
  openInspectionInEditor,
  surfaceArtifactInspectOrphanBanner,
  type ArtifactInspectResult,
} from '../src/observability/artifact-inspect-command.js';

const datasetResult: InspectResult = {
  dataset_path: 'data/sample.csv',
  fingerprint_sha256: '0123456789abcdef'.repeat(4),
  columns: ['sepal', 'petal', 'species'],
  num_rows: 150,
  label_column: 'species',
  num_features_excluding_label: 2,
  label_present: true,
};

const artifactResult: ArtifactInspectResult = {
  schema_version: '0.2.2.2',
  artifact_path: 'runs/r1/artifacts/model.pkl',
  pipeline_steps: [
    { name: 'scaler', type: 'StandardScaler', module: 'sklearn.preprocessing' },
    { name: 'clf', type: 'LogisticRegression', module: 'sklearn.linear_model' },
  ],
  has_preprocessing: true,
  step_count: 2,
};

beforeEach(() => {
  h.spawnCalls = [];
  h.script = { stdout: [], stderr: '', code: 0, error: null };
  h.showWarningMessage.mockClear();
  h.openTextDocument.mockClear();
  h.showTextDocument.mockClear();
});

describe('inspectDataset', () => {
  it('invokes `python -m ml_runner inspect` with the dataset and label, from the runner directory', async () => {
    h.script.stdout = [JSON.stringify(datasetResult)];
    const runnerPath = path.join('tools', 'runner', 'ml_runner');

    const result = await inspectDataset('py-exe', runnerPath, 'data/sample.csv', 'species');

    expect(result).toEqual(datasetResult);
    expect(h.spawnCalls).toHaveLength(1);
    const call = h.spawnCalls[0];
    expect(call.command).toBe('py-exe');
    expect(call.args).toEqual(['-m', 'ml_runner', 'inspect', '--dataset', 'data/sample.csv', '--label', 'species']);
    expect(call.options.cwd).toBe(path.dirname(runnerPath));
    // Python is launched with UTF-8 stdio and the runner on PYTHONPATH.
    expect(call.options.env?.PYTHONIOENCODING).toBe('utf-8');
    expect(call.options.env?.PYTHONUNBUFFERED).toBe('1');
    expect(call.options.env?.PYTHONPATH?.startsWith(runnerPath)).toBe(true);
  });

  it('defaults the label column to "label"', async () => {
    h.script.stdout = [JSON.stringify(datasetResult)];
    await inspectDataset('py', 'runner', 'd.csv');
    expect(h.spawnCalls[0].args.slice(-2)).toEqual(['--label', 'label']);
  });

  it('reassembles JSON delivered across several stdout chunks', async () => {
    const text = JSON.stringify(datasetResult);
    h.script.stdout = [text.slice(0, 20), text.slice(20, 55), text.slice(55)];
    expect(await inspectDataset('py', 'runner', 'd.csv')).toEqual(datasetResult);
  });

  it('rejects with the Python stderr when the process exits non-zero', async () => {
    h.script.code = 1;
    h.script.stderr = 'FileNotFoundError: d.csv';
    await expect(inspectDataset('py', 'runner', 'd.csv')).rejects.toThrow('FileNotFoundError: d.csv');
  });

  it('rejects with the exit code when the process fails silently', async () => {
    h.script.code = 3;
    await expect(inspectDataset('py', 'runner', 'd.csv')).rejects.toThrow('Inspection failed with exit code 3');
  });

  it('rejects with a parse error when exit 0 produced non-JSON stdout', async () => {
    h.script.stdout = ['not json at all'];
    await expect(inspectDataset('py', 'runner', 'd.csv')).rejects.toThrow(/^Failed to parse inspection result: /);
  });

  it('rejects with the spawn error when Python cannot be started', async () => {
    h.script.error = new Error('spawn py ENOENT');
    await expect(inspectDataset('py', 'runner', 'd.csv')).rejects.toThrow('spawn py ENOENT');
  });
});

describe('formatInspectResult', () => {
  it('prints path, truncated fingerprint, counts, label status and the column list', () => {
    const text = formatInspectResult(datasetResult);
    const lines = text.split('\n');
    expect(lines[0]).toBe('═'.repeat(60));
    expect(lines[1]).toBe('Dataset Inspection Results');
    expect(text).toContain('Path:        data/sample.csv');
    expect(text).toContain('Fingerprint: 0123456789abcdef...');
    expect(text).not.toContain(datasetResult.fingerprint_sha256);
    expect(text).toContain('Rows:        150');
    expect(text).toContain('Features:    2');
    expect(text).toContain('Label:       species (✓ found)');
    expect(text).toContain('  • sepal\n  • petal\n  • species (label)');
    expect(lines[lines.length - 1]).toBe('═'.repeat(60));
  });

  it('flags a label column that is not present in the dataset', () => {
    const text = formatInspectResult({ ...datasetResult, label_column: 'target', label_present: false });
    expect(text).toContain('Label:       target (✗ NOT FOUND)');
    // No column matches the label, so none is tagged "(label)".
    expect(text).not.toContain('(label)');
  });
});

describe('inspectArtifact', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-inspect-art-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function addOrphans(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      const dir = path.join(root, '.ml', 'runs', `orphan-${i}`);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'run.json'), '{}');
      await fs.writeFile(
        path.join(dir, '.index-orphan'),
        JSON.stringify({
          schema_version: 'index-orphan.v1.0.0',
          run_id: `orphan-${i}`,
          run_dir: `.ml/runs/orphan-${i}`,
          written_at: '2026-10-01T10:00:00Z',
          error: { type: 'OSError', message: 'disk full' },
          index_path: '.ml/outputs/index.json',
        })
      );
    }
  }

  it('passes --artifact only (no --base-path) when no base path is given, and skips the orphan scan', async () => {
    h.script.stdout = [JSON.stringify(artifactResult)];
    const result = await inspectArtifact('py', path.join('r', 'ml_runner'), 'model.pkl');
    expect(result).toEqual(artifactResult);
    expect(h.spawnCalls[0].args).toEqual(['-m', 'ml_runner', 'inspect-artifact', '--artifact', 'model.pkl']);
    expect(h.showWarningMessage).not.toHaveBeenCalled();
  });

  it('adds --base-path when one is given', async () => {
    h.script.stdout = [JSON.stringify(artifactResult)];
    await inspectArtifact('py', 'runner', 'model.pkl', root);
    expect(h.spawnCalls[0].args).toEqual([
      '-m', 'ml_runner', 'inspect-artifact', '--artifact', 'model.pkl', '--base-path', root,
    ]);
  });

  it('warns about orphaned runs before shelling out, once, without blocking the inspection', async () => {
    await addOrphans(2);
    h.script.stdout = [JSON.stringify(artifactResult)];

    const result = await inspectArtifact('py', 'runner', 'model.pkl', root);

    expect(result.step_count).toBe(2);
    expect(h.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(h.showWarningMessage).toHaveBeenCalledWith(
      '2 run(s) saved but not indexed. ' +
        'Run "RunForge: Recover Index" to add them to the run list, ' +
        'or use "RunForge: Browse Runs" to open them directly.'
    );
  });

  it('suppresses the orphan warning when the caller opts out', async () => {
    await addOrphans(1);
    h.script.stdout = [JSON.stringify(artifactResult)];
    await inspectArtifact('py', 'runner', 'model.pkl', root, { surfaceOrphanBanner: false });
    expect(h.showWarningMessage).not.toHaveBeenCalled();
  });

  it('stays silent when the workspace has no orphans', async () => {
    h.script.stdout = [JSON.stringify(artifactResult)];
    await inspectArtifact('py', 'runner', 'model.pkl', root);
    expect(h.showWarningMessage).not.toHaveBeenCalled();
  });

  it('rejects with stderr on a non-zero exit', async () => {
    h.script.code = 1;
    h.script.stderr = 'pickle.UnpicklingError: invalid load key';
    await expect(inspectArtifact('py', 'runner', 'model.pkl')).rejects.toThrow('pickle.UnpicklingError: invalid load key');
  });

  it('rejects with the exit code when stderr is empty', async () => {
    h.script.code = 9;
    await expect(inspectArtifact('py', 'runner', 'model.pkl')).rejects.toThrow('Inspection failed with exit code 9');
  });

  it('rejects with a parse error on non-JSON stdout', async () => {
    h.script.stdout = ['<html>'];
    await expect(inspectArtifact('py', 'runner', 'model.pkl')).rejects.toThrow(/^Failed to parse inspection result: /);
  });

  it('rejects with the spawn error when Python is missing', async () => {
    h.script.error = new Error('spawn py ENOENT');
    await expect(inspectArtifact('py', 'runner', 'model.pkl')).rejects.toThrow('spawn py ENOENT');
  });
});

describe('surfaceArtifactInspectOrphanBanner', () => {
  it('does nothing for a workspace with no .ml directory', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-inspect-empty-'));
    try {
      await surfaceArtifactInspectOrphanBanner(empty);
      expect(h.showWarningMessage).not.toHaveBeenCalled();
    } finally {
      await fs.rm(empty, { recursive: true, force: true });
    }
  });
});

describe('formatArtifactInspectResult', () => {
  it('lists every pipeline step numbered, with type and module', () => {
    const text = formatArtifactInspectResult(artifactResult);
    expect(text).toContain('Pipeline Artifact Inspection (Phase 2.2.2)');
    expect(text).toContain('Schema Version:    0.2.2.2');
    expect(text).toContain('Artifact:          runs/r1/artifacts/model.pkl');
    expect(text).toContain('Step Count:        2');
    expect(text).toContain('Has Preprocessing: Yes');
    expect(text).toContain('  1. scaler\n     Type:   StandardScaler\n     Module: sklearn.preprocessing');
    expect(text).toContain('  2. clf\n     Type:   LogisticRegression\n     Module: sklearn.linear_model');
  });

  it('says "No" for preprocessing and prints no steps for an empty pipeline', () => {
    const text = formatArtifactInspectResult({ ...artifactResult, has_preprocessing: false, pipeline_steps: [], step_count: 0 });
    expect(text).toContain('Has Preprocessing: No');
    expect(text).not.toMatch(/^\s+1\. /m);
  });
});

describe('openInspectionInEditor', () => {
  it('opens the result as indented JSON in a preview beside the active editor', async () => {
    await openInspectionInEditor(artifactResult);

    expect(h.openTextDocument).toHaveBeenCalledTimes(1);
    const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string; language: string };
    expect(opened.language).toBe('json');
    // Indented with two spaces.
    expect(opened.content.split('\n')[1]).toMatch(/^ {2}"/);
    expect(h.showTextDocument).toHaveBeenCalledWith(expect.anything(), { preview: true, viewColumn: -2 });
  });

  it('writes the top-level keys in sorted order and keeps every one', async () => {
    await openInspectionInEditor(artifactResult);
    const opened = (h.openTextDocument.mock.calls[0] as unknown[])[0] as { content: string };
    const topLevelKeys = [...opened.content.matchAll(/^ {2}"([a-z_]+)":/gm)].map((m) => m[1]);
    expect(topLevelKeys).toEqual([...topLevelKeys].sort());
    expect(topLevelKeys).toEqual(
      expect.arrayContaining(['schema_version', 'artifact_path', 'pipeline_steps', 'has_preprocessing', 'step_count'])
    );
  });
});
