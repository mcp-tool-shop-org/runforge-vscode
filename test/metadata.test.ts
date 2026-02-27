/**
 * Tests for metadata-command pure helpers.
 *
 * Tests getRunforgeDir, loadRunMetadata, loadProvenanceIndex, getLatestRunEntry,
 * and formatMetadata — all pure or file-based with no vscode dependency.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock vscode (metadata-command imports it)
vi.mock('vscode', () => ({
  window: {
    showTextDocument: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
  },
  workspace: {
    openTextDocument: () => Promise.resolve({}),
  },
  ViewColumn: { Active: 1, Beside: 2 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

// Also mock open-summary which metadata-command imports
vi.mock('../src/observability/open-summary.js', () => ({
  openJsonDocument: () => Promise.resolve(undefined),
}));

import {
  getRunforgeDir,
  loadRunMetadata,
  loadProvenanceIndex,
  getLatestRunEntry,
  formatMetadata,
} from '../src/observability/metadata-command.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-meta-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ── getRunforgeDir ───────────────────────────────────────────────────────────

describe('getRunforgeDir', () => {
  it('returns .runforge under workspace root', () => {
    const result = getRunforgeDir('/my/workspace');
    expect(result).toBe(path.join('/my/workspace', '.runforge'));
  });

  it('handles trailing slash', () => {
    // path.join normalizes this
    const result = getRunforgeDir('/my/workspace/');
    expect(result).toContain('.runforge');
  });
});

// ── loadRunMetadata ──────────────────────────────────────────────────────────

describe('loadRunMetadata', () => {
  it('returns parsed metadata from run.json', async () => {
    const runDir = path.join(tempDir, 'run1');
    await fs.mkdir(runDir, { recursive: true });

    const metadata = {
      run_id: 'run1',
      runforge_version: '0.4.0',
      created_at: '2026-01-01T00:00:00+00:00',
      dataset: { path: 'data.csv', fingerprint_sha256: 'abc' },
      label_column: 'label',
      num_samples: 100,
      num_features: 5,
      dropped_rows_missing_values: 0,
      metrics: { accuracy: 0.95, num_samples: 100, num_features: 5 },
      artifacts: { model_pkl: 'model.pkl' },
    };
    await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify(metadata));

    const result = await loadRunMetadata(runDir);
    expect(result).not.toBeNull();
    expect(result!.run_id).toBe('run1');
    expect(result!.metrics.accuracy).toBe(0.95);
  });

  it('returns null when run.json does not exist', async () => {
    const result = await loadRunMetadata(path.join(tempDir, 'nonexistent'));
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    const runDir = path.join(tempDir, 'bad-run');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'run.json'), '{ invalid json');

    const result = await loadRunMetadata(runDir);
    expect(result).toBeNull();
  });
});

// ── loadProvenanceIndex ──────────────────────────────────────────────────────

describe('loadProvenanceIndex', () => {
  it('returns parsed index from index.json', async () => {
    const runforgeDir = path.join(tempDir, '.runforge');
    await fs.mkdir(runforgeDir, { recursive: true });

    const index = {
      schema_version: '0.2.0',
      runs: [
        {
          run_id: 'r1',
          created_at: '2026-01-01T00:00:00+00:00',
          dataset_fingerprint_sha256: 'abc',
          label_column: 'label',
          run_dir: 'runs/r1/run.json',
          model_pkl: 'runs/r1/model.pkl',
        },
      ],
    };
    await fs.writeFile(path.join(runforgeDir, 'index.json'), JSON.stringify(index));

    const result = await loadProvenanceIndex(tempDir);
    expect(result).not.toBeNull();
    expect(result!.runs).toHaveLength(1);
    expect(result!.runs[0].run_id).toBe('r1');
  });

  it('returns null when index.json does not exist', async () => {
    const result = await loadProvenanceIndex(tempDir);
    expect(result).toBeNull();
  });
});

// ── getLatestRunEntry ────────────────────────────────────────────────────────

describe('getLatestRunEntry', () => {
  it('returns the last entry in the index', async () => {
    const runforgeDir = path.join(tempDir, '.runforge');
    await fs.mkdir(runforgeDir, { recursive: true });

    const index = {
      schema_version: '0.2.0',
      runs: [
        { run_id: 'r1', created_at: '2026-01-01', dataset_fingerprint_sha256: 'a', label_column: 'l', run_dir: 'd1', model_pkl: 'm1' },
        { run_id: 'r2', created_at: '2026-01-02', dataset_fingerprint_sha256: 'b', label_column: 'l', run_dir: 'd2', model_pkl: 'm2' },
      ],
    };
    await fs.writeFile(path.join(runforgeDir, 'index.json'), JSON.stringify(index));

    const result = await getLatestRunEntry(tempDir);
    expect(result).not.toBeNull();
    expect(result!.run_id).toBe('r2');
  });

  it('returns null when no index exists', async () => {
    const result = await getLatestRunEntry(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when index has empty runs array', async () => {
    const runforgeDir = path.join(tempDir, '.runforge');
    await fs.mkdir(runforgeDir, { recursive: true });

    await fs.writeFile(
      path.join(runforgeDir, 'index.json'),
      JSON.stringify({ schema_version: '0.2.0', runs: [] })
    );

    const result = await getLatestRunEntry(tempDir);
    expect(result).toBeNull();
  });
});

// ── formatMetadata ───────────────────────────────────────────────────────────

describe('formatMetadata', () => {
  it('returns pretty-printed JSON', () => {
    const metadata = {
      run_id: 'test',
      runforge_version: '0.4.0',
      created_at: '2026-01-01',
      dataset: { path: 'data.csv', fingerprint_sha256: 'abc' },
      label_column: 'label',
      num_samples: 100,
      num_features: 5,
      dropped_rows_missing_values: 0,
      metrics: { accuracy: 0.95, num_samples: 100, num_features: 5 },
      artifacts: { model_pkl: 'model.pkl' },
    };

    const output = formatMetadata(metadata as any);
    expect(output).toContain('"run_id": "test"');
    expect(output).toContain('"accuracy": 0.95');
    // Should be indented (pretty-printed)
    expect(output).toContain('  ');
  });
});
