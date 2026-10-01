/**
 * Run folder: what is created and written on disk (real filesystem, temp dir).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createRunFolder,
  writeRequest,
  writeResult,
  appendLog,
  readMetrics,
  toWorkspaceRelativePath,
  generateRunId,
  parseRunId,
  isValidRunId,
  toSlug,
} from '../src/workspace/run-folder.js';
import { ARTIFACT_FILENAMES, WORKSPACE_PATHS } from '../src/types.js';
import type { RunRequest, RunResult } from '../src/types.js';

let ws: string;

beforeEach(async () => {
  ws = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-runfolder-'));
});

afterEach(async () => {
  await fs.rm(ws, { recursive: true, force: true });
});

const request: RunRequest = {
  run_id: '20260101-000000-demo-abcd',
  name: 'demo',
  preset_id: 'std-train',
  seed: 7,
  created_at: '2026-01-01T00:00:00+00:00',
  requested_device: 'cpu',
  actual_device: 'cpu',
  gpu_reason: 'no_cuda',
};

describe('createRunFolder', () => {
  it('creates .ml/runs/<id>/ and its artifacts/ subfolder and returns the run dir', async () => {
    const runDir = await createRunFolder(ws, 'run-1');

    expect(runDir).toBe(path.join(ws, WORKSPACE_PATHS.RUNS_DIR, 'run-1'));
    expect((await fs.stat(runDir)).isDirectory()).toBe(true);
    expect((await fs.stat(path.join(runDir, 'artifacts'))).isDirectory()).toBe(true);
  });

  it('creates missing parent folders (a workspace with no .ml yet)', async () => {
    await expect(fs.stat(path.join(ws, '.ml'))).rejects.toThrow();

    await createRunFolder(ws, 'first');

    expect((await fs.stat(path.join(ws, '.ml', 'runs'))).isDirectory()).toBe(true);
  });

  it('is idempotent and leaves existing files in the run folder alone', async () => {
    const runDir = await createRunFolder(ws, 'again');
    await fs.writeFile(path.join(runDir, 'keep.txt'), 'x');

    const second = await createRunFolder(ws, 'again');

    expect(second).toBe(runDir);
    expect(await fs.readFile(path.join(runDir, 'keep.txt'), 'utf-8')).toBe('x');
  });

  it('keeps sibling runs separate', async () => {
    const a = await createRunFolder(ws, 'a');
    const b = await createRunFolder(ws, 'b');
    expect(a).not.toBe(b);
    expect((await fs.readdir(path.join(ws, WORKSPACE_PATHS.RUNS_DIR))).sort()).toEqual(['a', 'b']);
  });
});

describe('writeRequest / writeResult', () => {
  it('writes request.json as 2-space-indented JSON that round-trips', async () => {
    const runDir = await createRunFolder(ws, 'req');

    await writeRequest(runDir, request);

    const text = await fs.readFile(path.join(runDir, ARTIFACT_FILENAMES.REQUEST_JSON), 'utf-8');
    expect(JSON.parse(text)).toEqual(request);
    expect(text).toContain('\n  "run_id": "20260101-000000-demo-abcd"');
  });

  it('omits an undefined seed from request.json', async () => {
    const runDir = await createRunFolder(ws, 'noseed');

    await writeRequest(runDir, { ...request, seed: undefined });

    const written = JSON.parse(
      await fs.readFile(path.join(runDir, ARTIFACT_FILENAMES.REQUEST_JSON), 'utf-8')
    );
    expect('seed' in written).toBe(false);
  });

  it('writes result.json for a failed run including the error text', async () => {
    const runDir = await createRunFolder(ws, 'res');
    const result: RunResult = {
      run_id: request.run_id,
      status: 'failed',
      exit_code: 3,
      duration_ms: 1234,
      error: 'Process exited with code 3',
    };

    await writeResult(runDir, result);

    const written = JSON.parse(
      await fs.readFile(path.join(runDir, ARTIFACT_FILENAMES.RESULT_JSON), 'utf-8')
    );
    expect(written).toEqual(result);
  });

  it('overwrites a previous result.json rather than appending', async () => {
    const runDir = await createRunFolder(ws, 'res2');
    await writeResult(runDir, { run_id: 'r', status: 'failed', exit_code: 1, duration_ms: 1 });
    await writeResult(runDir, { run_id: 'r', status: 'succeeded', exit_code: 0, duration_ms: 2 });

    const written = JSON.parse(
      await fs.readFile(path.join(runDir, ARTIFACT_FILENAMES.RESULT_JSON), 'utf-8')
    );
    expect(written.status).toBe('succeeded');
  });

  it('rejects when the run folder does not exist (callers must create it first)', async () => {
    await expect(writeRequest(path.join(ws, 'missing'), request)).rejects.toThrow();
    await expect(
      writeResult(path.join(ws, 'missing'), { run_id: 'r', status: 'failed', exit_code: 1, duration_ms: 1 })
    ).rejects.toThrow();
  });
});

describe('appendLog', () => {
  it('creates logs.txt on first append and terminates each line with a newline', async () => {
    const runDir = await createRunFolder(ws, 'log');

    await appendLog(runDir, 'first line');

    expect(await fs.readFile(path.join(runDir, ARTIFACT_FILENAMES.LOGS_TXT), 'utf-8')).toBe('first line\n');
  });

  it('appends in order without clobbering earlier lines', async () => {
    const runDir = await createRunFolder(ws, 'log2');

    await appendLog(runDir, 'one');
    await appendLog(runDir, '[stderr] two');
    await appendLog(runDir, 'três — ünïcode');

    expect(await fs.readFile(path.join(runDir, ARTIFACT_FILENAMES.LOGS_TXT), 'utf-8')).toBe(
      'one\n[stderr] two\ntrês — ünïcode\n'
    );
  });
});

describe('readMetrics', () => {
  it('returns numeric metrics from metrics.json', async () => {
    const runDir = await createRunFolder(ws, 'm1');
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.METRICS_JSON),
      JSON.stringify({ accuracy: 0.95, loss: 0.12, n: 150 })
    );

    expect(await readMetrics(runDir)).toEqual({ accuracy: 0.95, loss: 0.12, n: 150 });
  });

  it('drops non-numeric values (strings, null, booleans, nested objects, arrays)', async () => {
    const runDir = await createRunFolder(ws, 'm2');
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.METRICS_JSON),
      JSON.stringify({
        accuracy: 0.9,
        label: 'iris',
        missing: null,
        flag: true,
        nested: { a: 1 },
        list: [1, 2],
        zero: 0,
        negative: -1.5,
      })
    );

    expect(await readMetrics(runDir)).toEqual({ accuracy: 0.9, zero: 0, negative: -1.5 });
  });

  it('returns {} when metrics.json does not exist', async () => {
    const runDir = await createRunFolder(ws, 'm3');
    expect(await readMetrics(runDir)).toEqual({});
  });

  it('returns {} when metrics.json is not valid JSON', async () => {
    const runDir = await createRunFolder(ws, 'm4');
    await fs.writeFile(path.join(runDir, ARTIFACT_FILENAMES.METRICS_JSON), '{"accuracy": 0.9,');
    expect(await readMetrics(runDir)).toEqual({});
  });

  it('returns {} when metrics.json holds JSON null', async () => {
    const runDir = await createRunFolder(ws, 'm5');
    await fs.writeFile(path.join(runDir, ARTIFACT_FILENAMES.METRICS_JSON), 'null');
    expect(await readMetrics(runDir)).toEqual({});
  });
});

describe('toWorkspaceRelativePath', () => {
  it('returns a forward-slash path relative to the workspace', () => {
    const abs = path.join(ws, '.ml', 'runs', 'r1', 'run.json');
    expect(toWorkspaceRelativePath(ws, abs)).toBe('.ml/runs/r1/run.json');
  });

  it('returns an empty string for the workspace root itself', () => {
    expect(toWorkspaceRelativePath(ws, ws)).toBe('');
  });

  it('uses .. segments for a path outside the workspace', () => {
    const outside = path.join(path.dirname(ws), 'elsewhere', 'file.txt');
    expect(toWorkspaceRelativePath(ws, outside)).toBe('../elsewhere/file.txt');
  });

});

describe('run id helpers feeding the folder name', () => {
  it('generateRunId produces an id that parseRunId accepts, with a slug from the name', () => {
    const id = generateRunId('My Experiment #1!');
    expect(isValidRunId(id)).toBe(true);
    expect(parseRunId(id)?.slug).toBe('my-experiment-1');
  });

  it('toSlug falls back to "run" for names with no alphanumerics and caps length at 32', () => {
    expect(toSlug('***')).toBe('run');
    expect(toSlug('x'.repeat(100))).toHaveLength(32);
  });
});
