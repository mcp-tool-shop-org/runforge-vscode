/**
 * Python runner with a faked child process: the arguments and environment the
 * spawned Python gets, how stdout/stderr are split into lines, and how each way
 * a process can end (success, non-zero, signal, spawn error) is reported.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';

interface FakeProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import {
  checkPython,
  spawnRunner,
  pythonSpawnEnv,
  type RunnerCallbacks,
} from '../src/runner/python-runner.js';
import type { RunnerOptions, RunResult } from '../src/types.js';

function newProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

let proc: FakeProc;

const saved = {
  PYTHONPATH: process.env.PYTHONPATH,
  RUNFORGE_DATASET: process.env.RUNFORGE_DATASET,
};

beforeEach(() => {
  spawnMock.mockReset();
  proc = newProc();
  spawnMock.mockImplementation(() => proc);
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.useRealTimers();
});

function collect() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: RunResult[] = [];
  const callbacks: RunnerCallbacks = {
    onStdout: (l) => out.push(l),
    onStderr: (l) => err.push(l),
    onExit: (r) => exits.push(r),
  };
  return { out, err, exits, callbacks };
}

const baseOptions: RunnerOptions = {
  preset_id: 'std-train',
  run_dir: path.join('ws', '.ml', 'runs', '20260101-000000-demo-abcd'),
  device: 'cpu',
  cwd: 'ws',
};

describe('pythonSpawnEnv', () => {
  it('forces unbuffered UTF-8 and keeps the parent environment', () => {
    process.env.RUNFORGE_TEST_MARKER = 'kept';
    const env = pythonSpawnEnv();
    delete process.env.RUNFORGE_TEST_MARKER;

    expect(env.PYTHONUNBUFFERED).toBe('1');
    expect(env.PYTHONIOENCODING).toBe('utf-8');
    expect(env.RUNFORGE_TEST_MARKER).toBe('kept');
  });

  it('sets RUNFORGE_DATASET only when a dataset path is given', () => {
    delete process.env.RUNFORGE_DATASET;
    expect(pythonSpawnEnv().RUNFORGE_DATASET).toBeUndefined();
    expect(pythonSpawnEnv({ datasetPath: 'data/iris.csv' }).RUNFORGE_DATASET).toBe('data/iris.csv');
  });

  it('uses runnerParent as PYTHONPATH when none is set', () => {
    delete process.env.PYTHONPATH;
    expect(pythonSpawnEnv({ runnerParent: '/ext/python' }).PYTHONPATH).toBe('/ext/python');
  });

  it('prepends runnerParent to an existing PYTHONPATH with the platform delimiter', () => {
    process.env.PYTHONPATH = '/user/libs';
    expect(pythonSpawnEnv({ runnerParent: '/ext/python' }).PYTHONPATH).toBe(
      `/ext/python${path.delimiter}/user/libs`
    );
  });

  it('does not mutate process.env', () => {
    delete process.env.RUNFORGE_DATASET;
    pythonSpawnEnv({ datasetPath: 'x.csv' });
    expect(process.env.RUNFORGE_DATASET).toBeUndefined();
  });
});

describe('checkPython', () => {
  it('reports the version printed on stdout and spawns `<python> --version` without a shell', async () => {
    const pending = checkPython('py-under-test');
    proc.stdout.emit('data', Buffer.from('Python 3.12.1\n'));
    proc.emit('close', 0);
    const check = await pending;

    expect(check).toEqual({ available: true, path: 'py-under-test', version: 'Python 3.12.1' });
    const [cmd, args, opts] = spawnMock.mock.calls[0];
    expect(cmd).toBe('py-under-test');
    expect(args).toEqual(['--version']);
    expect(opts.shell).toBe(false);
    expect(opts.env.PYTHONIOENCODING).toBe('utf-8');
  });

  it('defaults to the `python` command', async () => {
    const pending = checkPython();
    proc.stdout.emit('data', Buffer.from('Python 3.11.0'));
    proc.emit('close', 0);
    await pending;

    expect(spawnMock.mock.calls[0][0]).toBe('python');
  });

  it('reads the version from stderr for interpreters that print it there', async () => {
    const pending = checkPython('python2');
    proc.stderr.emit('data', Buffer.from('Python 2.7.18\n'));
    proc.emit('close', 0);

    expect((await pending).version).toBe('Python 2.7.18');
  });

  it('is unavailable with the exit code in the message when --version fails', async () => {
    const pending = checkPython('broken');
    proc.emit('close', 127);
    const check = await pending;

    expect(check.available).toBe(false);
    expect(check.path).toBe('broken');
    expect(check.error).toBe('Python check failed with exit code 127');
  });

  it('is unavailable with an install hint and the OS error when spawn fails', async () => {
    const pending = checkPython('nope');
    proc.emit('error', new Error('spawn nope ENOENT'));
    const check = await pending;

    expect(check.available).toBe(false);
    expect(check.error).toContain('Python not found on PATH. Install Python 3.10+');
    expect(check.error).toContain('spawn nope ENOENT');
    expect(check.version).toBeUndefined();
  });
});

describe('spawnRunner arguments and environment', () => {
  it('builds the minimal train command line with unbuffered -u and the explicit device', () => {
    const { callbacks } = collect();

    const returned = spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    expect(returned).toBe(proc);
    const [cmd, args, opts] = spawnMock.mock.calls[0];
    expect(cmd).toBe('python');
    expect(args).toEqual([
      '-u', '-m', 'ml_runner', 'train',
      '--preset', 'std-train',
      '--out', baseOptions.run_dir,
      '--device', 'cpu',
    ]);
    expect(opts.cwd).toBe('ws');
    expect(opts.shell).toBe(false);
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'pipe']);
  });

  it('appends --name, --seed, --model and --profile when provided, in that order', () => {
    const { callbacks } = collect();

    spawnRunner(
      'python', 'ml_runner',
      { ...baseOptions, preset_id: 'hq-train', device: 'cuda', name: 'my run', seed: 42, model_family: 'random_forest', profile: 'fast' },
      callbacks
    );

    expect(spawnMock.mock.calls[0][1]).toEqual([
      '-u', '-m', 'ml_runner', 'train',
      '--preset', 'hq-train',
      '--out', baseOptions.run_dir,
      '--device', 'cuda',
      '--name', 'my run',
      '--seed', '42',
      '--model', 'random_forest',
      '--profile', 'fast',
    ]);
  });

  it('passes seed 0 and an empty name (falsy but defined) rather than dropping them', () => {
    const { callbacks } = collect();

    spawnRunner('python', 'ml_runner', { ...baseOptions, seed: 0, name: '' }, callbacks);

    const args: string[] = spawnMock.mock.calls[0][1];
    expect(args.slice(args.indexOf('--name'))).toEqual(['--name', '', '--seed', '0']);
  });

  it('omits an empty profile', () => {
    const { callbacks } = collect();

    spawnRunner('python', 'ml_runner', { ...baseOptions, profile: '' }, callbacks);

    expect(spawnMock.mock.calls[0][1]).not.toContain('--profile');
  });

  it('exports the dataset path and bundled-runner PYTHONPATH to the child, not to the parent', () => {
    delete process.env.RUNFORGE_DATASET;
    delete process.env.PYTHONPATH;
    const { callbacks } = collect();

    spawnRunner(
      'python', 'ml_runner',
      { ...baseOptions, dataset_path: 'data/iris.csv' },
      callbacks,
      '/ext/python'
    );

    const env = spawnMock.mock.calls[0][2].env;
    expect(env.RUNFORGE_DATASET).toBe('data/iris.csv');
    expect(env.PYTHONPATH).toBe('/ext/python');
    expect(env.PYTHONUNBUFFERED).toBe('1');
    expect(process.env.RUNFORGE_DATASET).toBeUndefined();
  });
});

describe('spawnRunner output streaming', () => {
  it('delivers complete stdout lines and holds back a partial line until its newline arrives', () => {
    const { callbacks, out } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.stdout.emit('data', Buffer.from('epoch 1\nepoc'));
    expect(out).toEqual(['epoch 1']);

    proc.stdout.emit('data', Buffer.from('h 2\nepoch 3\n'));
    expect(out).toEqual(['epoch 1', 'epoch 2', 'epoch 3']);
  });

  it('skips blank lines', () => {
    const { callbacks, out, err } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.stdout.emit('data', Buffer.from('a\n\n\nb\n'));
    proc.stderr.emit('data', Buffer.from('\n\nwarn\n'));

    expect(out).toEqual(['a', 'b']);
    expect(err).toEqual(['warn']);
  });

  it('keeps stdout and stderr buffers independent', () => {
    const { callbacks, out, err } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.stdout.emit('data', Buffer.from('out-part'));
    proc.stderr.emit('data', Buffer.from('err-part'));
    proc.stdout.emit('data', Buffer.from('-done\n'));
    proc.stderr.emit('data', Buffer.from('-done\n'));

    expect(out).toEqual(['out-part-done']);
    expect(err).toEqual(['err-part-done']);
  });

  it('flushes an unterminated final line from both streams before reporting exit', () => {
    const calls: string[] = [];
    spawnRunner('python', 'ml_runner', baseOptions, {
      onStdout: (l) => calls.push(`out:${l}`),
      onStderr: (l) => calls.push(`err:${l}`),
      onExit: (r) => calls.push(`exit:${r.status}`),
    });

    proc.stdout.emit('data', Buffer.from('last stdout'));
    proc.stderr.emit('data', Buffer.from('last stderr'));
    proc.emit('close', 0);

    expect(calls).toEqual(['out:last stdout', 'err:last stderr', 'exit:succeeded']);
  });

  it('passes non-ASCII output through unchanged', () => {
    const { callbacks, out } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.stdout.emit('data', Buffer.from('accuracy ✓ ünïcode\n'));

    expect(out).toEqual(['accuracy ✓ ünïcode']);
  });
});

describe('spawnRunner exit reporting', () => {
  it('reports success with the run id taken from the run directory name', () => {
    const { callbacks, exits } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.emit('close', 0);

    expect(exits).toHaveLength(1);
    expect(exits[0]).toMatchObject({
      run_id: '20260101-000000-demo-abcd',
      status: 'succeeded',
      exit_code: 0,
      error: undefined,
    });
    expect(exits[0].duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('takes the run id from a Windows-style run directory too', () => {
    const { callbacks, exits } = collect();
    spawnRunner('python', 'ml_runner', { ...baseOptions, run_dir: 'C:\\ws\\.ml\\runs\\win-run-1234' }, callbacks);

    proc.emit('close', 0);

    expect(exits[0].run_id).toBe('win-run-1234');
  });

  it('falls back to "unknown" when the run directory has no final segment', () => {
    const { callbacks, exits } = collect();
    spawnRunner('python', 'ml_runner', { ...baseOptions, run_dir: 'ws/runs/' }, callbacks);

    proc.emit('close', 0);

    expect(exits[0].run_id).toBe('unknown');
  });

  it('reports a non-zero exit as failed with the exit code in the error', () => {
    const { callbacks, exits } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.emit('close', 2);

    expect(exits[0]).toMatchObject({
      status: 'failed',
      exit_code: 2,
      error: 'Process exited with code 2',
    });
  });

  it('reports a signal kill (null exit code) as failed with exit_code -1', () => {
    const { callbacks, exits } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.emit('close', null);

    expect(exits[0]).toMatchObject({
      status: 'failed',
      exit_code: -1,
      error: 'Process exited with code null',
    });
  });

  it('reports a spawn error as failed with exit_code -1 and the error message', () => {
    const { callbacks, exits } = collect();
    spawnRunner('missing-python', 'ml_runner', baseOptions, callbacks);

    proc.emit('error', new Error('spawn missing-python ENOENT'));

    expect(exits).toEqual([
      expect.objectContaining({
        status: 'failed',
        exit_code: -1,
        error: 'spawn missing-python ENOENT',
      }),
    ]);
  });

  it('calls onExit only once when an error is followed by close', () => {
    const { callbacks, exits } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.emit('error', new Error('boom'));
    proc.emit('close', 1);

    expect(exits).toHaveLength(1);
    expect(exits[0].error).toBe('boom');
  });

  it('calls onExit only once when close is followed by error', () => {
    const { callbacks, exits } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    proc.emit('close', 0);
    proc.emit('error', new Error('late'));

    expect(exits).toHaveLength(1);
    expect(exits[0].status).toBe('succeeded');
  });

  it('measures duration from spawn to exit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { callbacks, exits } = collect();
    spawnRunner('python', 'ml_runner', baseOptions, callbacks);

    vi.setSystemTime(new Date('2026-01-01T00:00:01.500Z'));
    proc.emit('close', 0);

    expect(exits[0].duration_ms).toBe(1500);
  });
});
