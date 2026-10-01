/**
 * Orphan / cancelled marker readers and the two pure markdown renderers.
 *
 * Markers are written by Python (index-orphan.v1.0.0, cancelled.v1.0.0). The
 * readers must classify every on-disk shape without throwing: valid markers are
 * returned, everything else lands in `skipped` with a reason a maintainer can
 * act on. Fixtures are real run folders under a temp workspace.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  humanizeOrphanRecovery,
  listOrphanedRuns,
} from '../src/observability/orphan-markers.js';
import {
  isValidCancelledMarker,
  listCancelledRuns,
  readCancelledMarker,
} from '../src/observability/cancelled-marker-reader.js';
import { renderDiagnosticsSummary } from '../src/observability/render/diagnostics-summary.js';
import { renderRunSummary } from '../src/observability/render/run-summary.js';
import type { IndexOrphanMarker, RunMetadata } from '../src/types.js';

function orphanMarker(overrides: Partial<IndexOrphanMarker> = {}): IndexOrphanMarker {
  return {
    schema_version: 'index-orphan.v1.0.0',
    run_id: 'run-a',
    run_dir: '.ml/runs/run-a',
    written_at: '2026-10-01T10:00:00Z',
    error: { type: 'PermissionError', message: 'denied' },
    index_path: '.ml/outputs/index.json',
    ...overrides,
  };
}

function runJson(overrides: Partial<RunMetadata> = {}): RunMetadata {
  return {
    run_id: 'run-a',
    runforge_version: '1.0.1',
    schema_version: 'run.v0.3.6',
    created_at: '2026-10-01T10:00:00Z',
    dataset: { path: 'data/sample.csv', fingerprint_sha256: 'f'.repeat(64) },
    label_column: 'label',
    model_family: 'logistic_regression',
    num_samples: 120,
    num_features: 4,
    dropped_rows_missing_values: 0,
    metrics: { accuracy: 0.9123, num_samples: 120, num_features: 4 },
    metrics_v1: {
      schema_version: 'metrics.v1',
      metrics_profile: 'classification.base.v1',
      artifact_path: 'metrics.v1.json',
    },
    artifacts: { model_pkl: 'model.pkl', metrics_v1_json: 'metrics.v1.json' },
    ...overrides,
  } as RunMetadata;
}

describe('marker readers and renderers (coverage)', () => {
  let root: string;
  let runsDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-markers-'));
    runsDir = path.join(root, '.ml', 'runs');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function makeRun(name: string, files: Record<string, string>): Promise<string> {
    const dir = path.join(runsDir, name);
    await fs.mkdir(dir, { recursive: true });
    for (const [file, body] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, file), body);
    }
    return dir;
  }

  describe('listOrphanedRuns', () => {
    it('returns an empty scan for an empty workspace (no .ml/runs)', async () => {
      expect(await listOrphanedRuns(root)).toEqual({ orphans: [], skipped: [] });
    });

    it('returns an empty scan, not a throw, when .ml/runs is a file rather than a directory', async () => {
      await fs.mkdir(path.join(root, '.ml'), { recursive: true });
      await fs.writeFile(runsDir, 'not a directory');
      expect(await listOrphanedRuns(root)).toEqual({ orphans: [], skipped: [] });
    });

    it('ignores plain files in .ml/runs and run dirs with no marker', async () => {
      await fs.mkdir(runsDir, { recursive: true });
      await fs.writeFile(path.join(runsDir, 'stray.txt'), 'x');
      await makeRun('indexed-run', { 'run.json': '{}' });
      expect(await listOrphanedRuns(root)).toEqual({ orphans: [], skipped: [] });
    });

    it('returns a valid marker (with traceback) next to its run.json', async () => {
      const marker = orphanMarker({ error: { type: 'OSError', message: 'disk full', traceback: 'line1\nline2' } });
      await makeRun('run-a', { 'run.json': '{}', '.index-orphan': JSON.stringify(marker) });
      const scan = await listOrphanedRuns(root);
      expect(scan.skipped).toEqual([]);
      expect(scan.orphans).toEqual([marker]);
    });

    it('skips a marker whose run.json is missing as MISSING_RUN_JSON', async () => {
      await makeRun('run-b', { '.index-orphan': JSON.stringify(orphanMarker({ run_id: 'run-b' })) });
      const scan = await listOrphanedRuns(root);
      expect(scan.orphans).toEqual([]);
      expect(scan.skipped).toHaveLength(1);
      expect(scan.skipped[0]).toMatchObject({
        runDirName: 'run-b',
        reason: 'MISSING_RUN_JSON',
        detail: 'marker found but run.json missing under run-b',
      });
      expect(path.basename(scan.skipped[0].markerPath)).toBe('.index-orphan');
    });

    it('skips a non-JSON marker as CORRUPT_JSON', async () => {
      await makeRun('run-c', { 'run.json': '{}', '.index-orphan': '{"partial":' });
      const scan = await listOrphanedRuns(root);
      expect(scan.orphans).toEqual([]);
      expect(scan.skipped).toMatchObject([{ runDirName: 'run-c', reason: 'CORRUPT_JSON' }]);
    });

    it('skips an unreadable marker (a directory in its place) as READ_ERROR', async () => {
      const dir = await makeRun('run-d', { 'run.json': '{}' });
      await fs.mkdir(path.join(dir, '.index-orphan'));
      const scan = await listOrphanedRuns(root);
      expect(scan.orphans).toEqual([]);
      expect(scan.skipped).toMatchObject([{ runDirName: 'run-d', reason: 'READ_ERROR' }]);
    });

    const invalidShapes: Array<[string, unknown]> = [
      ['a JSON null', null],
      ['a JSON array', []],
      ['a wrong schema_version', orphanMarker({ schema_version: 'index-orphan.v9' as never })],
      ['an empty run_id', orphanMarker({ run_id: '' })],
      ['a non-string run_id', { ...orphanMarker(), run_id: 5 }],
      ['an empty run_dir', orphanMarker({ run_dir: '' })],
      ['an empty written_at', orphanMarker({ written_at: '' })],
      ['an empty index_path', orphanMarker({ index_path: '' })],
      ['a missing error object', { ...orphanMarker(), error: undefined }],
      ['a null error', { ...orphanMarker(), error: null }],
      ['an empty error.type', orphanMarker({ error: { type: '', message: 'm' } })],
      ['a non-string error.message', { ...orphanMarker(), error: { type: 'OSError', message: 3 } }],
      ['a non-string traceback', { ...orphanMarker(), error: { type: 'OSError', message: 'm', traceback: 9 } }],
    ];

    it.each(invalidShapes)('skips a marker with %s as INVALID_SHAPE', async (_label, body) => {
      await makeRun('run-e', { 'run.json': '{}', '.index-orphan': JSON.stringify(body) });
      const scan = await listOrphanedRuns(root);
      expect(scan.orphans).toEqual([]);
      expect(scan.skipped).toMatchObject([
        {
          runDirName: 'run-e',
          reason: 'INVALID_SHAPE',
          detail: 'marker JSON did not match IndexOrphanMarker shape',
        },
      ]);
    });

    it('accepts an empty error.message (the schema only requires a string)', async () => {
      const marker = orphanMarker({ error: { type: 'OSError', message: '' } });
      await makeRun('run-f', { 'run.json': '{}', '.index-orphan': JSON.stringify(marker) });
      expect((await listOrphanedRuns(root)).orphans).toEqual([marker]);
    });

    it('classifies a mixed workspace run by run', async () => {
      const good = orphanMarker({ run_id: 'good' });
      await makeRun('good', { 'run.json': '{}', '.index-orphan': JSON.stringify(good) });
      await makeRun('broken', { 'run.json': '{}', '.index-orphan': 'garbage' });
      await makeRun('plain', { 'run.json': '{}' });
      const scan = await listOrphanedRuns(root);
      expect(scan.orphans.map((o) => o.run_id)).toEqual(['good']);
      expect(scan.skipped.map((s) => s.runDirName)).toEqual(['broken']);
    });
  });

  describe('humanizeOrphanRecovery', () => {
    it('explains permission errors and names the outputs directory', () => {
      const msg = humanizeOrphanRecovery(orphanMarker({ error: { type: 'PermissionError', message: 'x' } }));
      expect(msg).toContain('permission errors');
      expect(msg).toContain('.ml/outputs');
    });

    it.each(['OSError', 'IOError'])('explains %s as a possibly full disk', (type) => {
      const msg = humanizeOrphanRecovery(orphanMarker({ error: { type, message: 'x' } }));
      expect(msg).toContain('Disk may be full');
      expect(msg).toContain('Recover Index');
    });

    it('explains a JSONDecodeError as a corrupted index', () => {
      const msg = humanizeOrphanRecovery(orphanMarker({ error: { type: 'JSONDecodeError', message: 'x' } }));
      expect(msg).toContain('index appears corrupted');
      expect(msg).toContain('Recover Index');
    });

    it('explains a FileNotFoundError as a missing index file', () => {
      const msg = humanizeOrphanRecovery(orphanMarker({ error: { type: 'FileNotFoundError', message: 'x' } }));
      expect(msg).toContain('index file is missing');
    });

    it('echoes the underlying message for an unknown error type', () => {
      const msg = humanizeOrphanRecovery(orphanMarker({ error: { type: 'WeirdError', message: 'quota exceeded' } }));
      expect(msg).toBe(
        'Run was saved but the workspace index could not be updated: quota exceeded. Open the run folder to verify artifacts.'
      );
    });
  });

  describe('cancelled markers', () => {
    const valid = {
      schema_version: 'cancelled.v1.0.0',
      run_id: 'run-x',
      run_dir: '.ml/runs/run-x',
      cancelled_at: '2026-10-01T11:00:00Z',
      step: 'training',
      reason: 'user request',
      partial_artifacts: ['.ml/runs/run-x/logs.txt'],
    };

    it('validates every legal step', () => {
      for (const step of ['dataset_loading', 'training', 'metrics_computation', 'artifact_writing', 'shutdown']) {
        expect(isValidCancelledMarker({ ...valid, step })).toBe(true);
      }
    });

    it.each([
      ['null', null],
      ['a string', 'cancelled'],
      ['a wrong schema_version', { ...valid, schema_version: 'cancelled.v2' }],
      ['an empty run_id', { ...valid, run_id: '' }],
      ['an empty run_dir', { ...valid, run_dir: '' }],
      ['an empty cancelled_at', { ...valid, cancelled_at: '' }],
      ['an unknown step', { ...valid, step: 'coffee' }],
      ['a non-string step', { ...valid, step: 1 }],
      ['a non-string reason', { ...valid, reason: 4 }],
      ['non-array partial_artifacts', { ...valid, partial_artifacts: 'a.txt' }],
      ['partial_artifacts with a non-string entry', { ...valid, partial_artifacts: ['ok', 2] }],
    ])('rejects %s', (_label, value) => {
      expect(isValidCancelledMarker(value)).toBe(false);
    });

    it('accepts a marker with only the required fields', () => {
      const { reason: _r, partial_artifacts: _p, ...minimal } = valid;
      expect(isValidCancelledMarker(minimal)).toBe(true);
    });

    it('readCancelledMarker returns null when there is no marker', async () => {
      const dir = await makeRun('run-x', { 'run.json': '{}' });
      expect(await readCancelledMarker(dir)).toBeNull();
    });

    it('readCancelledMarker returns the parsed marker when valid', async () => {
      const dir = await makeRun('run-x', { '.cancelled': JSON.stringify(valid) });
      expect(await readCancelledMarker(dir)).toEqual(valid);
    });

    it('readCancelledMarker treats corrupt JSON as marker-absent (null)', async () => {
      const dir = await makeRun('run-x', { '.cancelled': '{"oops"' });
      expect(await readCancelledMarker(dir)).toBeNull();
    });

    it('readCancelledMarker treats an invalid shape as marker-absent (null)', async () => {
      const dir = await makeRun('run-x', { '.cancelled': JSON.stringify({ ...valid, step: 'coffee' }) });
      expect(await readCancelledMarker(dir)).toBeNull();
    });

    it('listCancelledRuns returns an empty scan for an empty workspace', async () => {
      expect(await listCancelledRuns(root)).toEqual({ cancelled: [], skipped: [] });
    });

    it('listCancelledRuns returns an empty scan when .ml/runs is a file', async () => {
      await fs.mkdir(path.join(root, '.ml'), { recursive: true });
      await fs.writeFile(runsDir, 'not a directory');
      expect(await listCancelledRuns(root)).toEqual({ cancelled: [], skipped: [] });
    });

    it('listCancelledRuns separates valid, corrupt, unreadable and invalid markers', async () => {
      await fs.mkdir(runsDir, { recursive: true });
      await fs.writeFile(path.join(runsDir, 'stray.txt'), 'x');
      await makeRun('ok', { '.cancelled': JSON.stringify({ ...valid, run_id: 'ok' }) });
      await makeRun('no-marker', { 'run.json': '{}' });
      await makeRun('corrupt', { '.cancelled': 'nope' });
      await makeRun('invalid', { '.cancelled': JSON.stringify({ ...valid, step: 'coffee' }) });
      const unreadable = await makeRun('unreadable', {});
      await fs.mkdir(path.join(unreadable, '.cancelled'));

      const scan = await listCancelledRuns(root);

      expect(scan.cancelled.map((c) => c.run_id)).toEqual(['ok']);
      const bySkipReason = Object.fromEntries(scan.skipped.map((s) => [s.runDirName, s.reason]));
      expect(bySkipReason).toEqual({
        corrupt: 'CORRUPT_JSON',
        invalid: 'INVALID_SHAPE',
        unreadable: 'READ_ERROR',
      });
    });
  });

  describe('renderDiagnosticsSummary', () => {
    it('reports no diagnostics when no rows were dropped', () => {
      const md = renderDiagnosticsSummary(runJson(), 'run-a');
      expect(md).toContain('# Diagnostics — run-a');
      expect(md).toContain('**No diagnostics recorded for this run.**');
      expect(md).not.toContain('MISSING_VALUES_DROPPED');
    });

    it('synthesizes MISSING_VALUES_DROPPED with details when rows were dropped', () => {
      const md = renderDiagnosticsSummary(runJson({ dropped_rows_missing_values: 7 }), 'run-a');
      expect(md).toContain('### ℹ️ MISSING_VALUES_DROPPED');
      expect(md).toContain('**Severity:** info');
      expect(md).toContain('Dropped 7 rows with missing values');
      expect(md).toContain('- `rows_dropped`: 7');
      expect(md).not.toContain('No diagnostics recorded');
    });

    it('always ends with the deferred-emission footer', () => {
      const md = renderDiagnosticsSummary(runJson(), 'run-a');
      expect(md).toContain('*Note: Full structured diagnostics emission is deferred.*');
    });
  });

  describe('renderRunSummary', () => {
    it('renders every section for a complete run', () => {
      const md = renderRunSummary(runJson(), 'run-a', { deterministic: true });
      expect(md).toContain('# Run Summary — run-a');
      expect(md).toContain('| Created | 2026-10-01T10:00:00Z |');
      expect(md).toContain('| Label Column | `label` |');
      expect(md).toContain('| Samples | 120 |');
      expect(md).toContain('- **Fingerprint:** `' + 'f'.repeat(64) + '`');
      expect(md).toContain('| Accuracy | 91.23% |');
      expect(md).toContain('- **Model:** `model.pkl`');
    });

    it('omits the Metrics section when run.json has no metrics', () => {
      const md = renderRunSummary(runJson({ metrics: undefined } as Partial<RunMetadata>), 'run-a', { deterministic: true });
      expect(md).not.toContain('## Metrics');
      expect(md).toContain('## Dataset');
    });

    it('omits the Artifacts section when there is no model_pkl', () => {
      const md = renderRunSummary(runJson({ artifacts: {} } as Partial<RunMetadata>), 'run-a', { deterministic: true });
      expect(md).not.toContain('## Artifacts');
    });

    it('omits the Artifacts section when artifacts is absent altogether', () => {
      const md = renderRunSummary(runJson({ artifacts: undefined } as Partial<RunMetadata>), 'run-a', { deterministic: true });
      expect(md).not.toContain('## Artifacts');
    });

    it('formats a locale date by default and stringifies a non-string created_at', () => {
      const expected = new Date('2026-10-01T10:00:00Z').toLocaleString();
      expect(renderRunSummary(runJson(), 'run-a')).toContain(`| Created | ${expected} |`);

      const odd = renderRunSummary(runJson({ created_at: 1790000000 } as unknown as Partial<RunMetadata>), 'run-a');
      expect(odd).toContain('| Created | 1790000000 |');
    });

    it('escapes pipes in table cells so a hostile label cannot break the table', () => {
      const md = renderRunSummary(runJson({ label_column: 'a|b' }), 'run-a', { deterministic: true });
      expect(md).toContain('| Label Column | `a\\|b` |');
    });
  });
});
