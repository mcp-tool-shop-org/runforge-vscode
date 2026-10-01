/**
 * Run manager end to end, at the process boundary.
 *
 * Mocked: the `vscode` module (config, messages, status bar, output channel)
 * and `node:child_process.spawn`. Everything between them is production code:
 * checkPython, detectGpu, selectDevice, the run folder writers, the event
 * consumer, the status bar, the cancel detector. The filesystem is real
 * (a temp workspace per test).
 *
 * Asserted: the state transitions of a run (started, succeeded, failed,
 * cancelled, OOM-killed, aborted), the arguments and environment the Python
 * process receives, what lands in request.json / result.json / logs.txt, and
 * what the user is told.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// ── Fakes ────────────────────────────────────────────────────────────────────

interface Script {
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: Error;
  throws?: unknown;
}

interface FakeProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  exitCode: number | null;
  signalCode: string | null;
  kill: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => {
  const noop = () => undefined;
  return {
    trusted: { current: true },
    config: {} as Record<string, unknown>,
    configUpdate: vi.fn(),
    errorMsg: vi.fn(),
    warnMsg: vi.fn(),
    infoMsg: vi.fn(),
    openDialog: vi.fn(),
    exec: vi.fn(),
    lines: [] as string[],
    channelDispose: vi.fn(),
    statusItems: [] as Array<Record<string, any>>,
    spawn: vi.fn(),
    runners: [] as unknown[],
    presetDevice: { current: 'cpu' },
    noop,
  };
});

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: (l: string) => { h.lines.push(l); },
      show: () => {},
      dispose: h.channelDispose,
      clear: () => {},
    }),
    createStatusBarItem: () => {
      const item = { text: '', tooltip: '', command: '', name: '', show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
      h.statusItems.push(item);
      return item;
    },
    showErrorMessage: h.errorMsg,
    showWarningMessage: h.warnMsg,
    showInformationMessage: h.infoMsg,
    showOpenDialog: h.openDialog,
  },
  workspace: {
    get isTrusted() { return h.trusted.current; },
    getConfiguration: () => ({
      get: <T,>(key: string, def?: T) => (key in h.config ? (h.config[key] as T) : def),
      update: h.configUpdate,
    }),
  },
  commands: { executeCommand: h.exec },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2 },
}));

vi.mock('node:child_process', () => ({ spawn: h.spawn }));

vi.mock('../src/presets/registry.js', () => ({
  getPreset: (id: string) => ({ id, name: id, defaults: { device: h.presetDevice.current } }),
}));

// Captured before any test installs fake timers, so polling keeps working under them.
const realSetTimeout = globalThis.setTimeout;

const GiB = 1024 ** 3;
const RUN_ID_RE = /^\d{8}-\d{6}-[a-z0-9-]+-[a-f0-9]{4}$/;

const beh: { python: Script; torch: Script; smi: Script; runner: Script } = {
  python: {}, torch: {}, smi: {}, runner: {},
};

function resetBehaviour(): void {
  beh.python = { stdout: 'Python 3.12.1\n' };
  beh.torch = { stdout: JSON.stringify({ cuda_available: false, total_vram: 0, free_vram: 0, detection_method: 'torch', status: 'CUDA not available (torch installed but no GPU)' }) };
  beh.smi = { error: new Error('spawn nvidia-smi ENOENT') };
  beh.runner = {};
}

function newProc(): FakeProc {
  const p = new EventEmitter() as FakeProc;
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  p.killed = false;
  p.exitCode = null;
  p.signalCode = null;
  // Node semantics: `killed` flips true as soon as a signal was delivered.
  p.kill = vi.fn(() => { p.killed = true; return true; });
  return p;
}

function installSpawn(): void {
  h.spawn.mockImplementation((_cmd: string, args: string[]) => {
    const isRunner = args.includes('-m');
    if (isRunner) {
      if (beh.runner.throws !== undefined) throw beh.runner.throws;
      const p = newProc();
      h.runners.push(p);
      return p;
    }
    const script = args[0] === '--version' ? beh.python : args[0] === '-c' ? beh.torch : beh.smi;
    if (script.throws !== undefined) throw script.throws;
    const p = newProc();
    queueMicrotask(() => {
      if (script.error) { p.emit('error', script.error); return; }
      if (script.stdout) p.stdout.emit('data', Buffer.from(script.stdout));
      if (script.stderr) p.stderr.emit('data', Buffer.from(script.stderr));
      p.emit('close', script.code ?? 0);
    });
    return p;
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type RM = typeof import('../src/runner/run-manager.js');

let ws: string;
let ext: string;

async function loadRM(): Promise<RM> {
  vi.resetModules();
  return import('../src/runner/run-manager.js');
}

async function until(cond: () => boolean, label = 'condition'): Promise<void> {
  for (let i = 0; i < 3000; i++) {
    if (cond()) return;
    await new Promise((r) => realSetTimeout(r, 2));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function untilFileHas(file: string, needle: string): Promise<void> {
  for (let i = 0; i < 3000; i++) {
    try {
      if ((await fs.readFile(file, 'utf-8')).includes(needle)) return;
    } catch { /* not there yet */ }
    await new Promise((r) => realSetTimeout(r, 2));
  }
  throw new Error('timed out waiting for ' + file);
}

const ev = (o: Record<string, unknown>) =>
  JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', run_id: 'r', ...o });

function torchCuda(freeGiB: number, totalGiB = 24): void {
  beh.torch = {
    stdout: JSON.stringify({
      cuda_available: true,
      total_vram: totalGiB * GiB,
      free_vram: freeGiB * GiB,
      detection_method: 'torch',
      status: `CUDA available: ${freeGiB}GB free / ${totalGiB}GB total`,
    }),
  };
}

interface Started {
  proc: FakeProc;
  args: string[];
  opts: any;
  runDir: string;
  runId: string;
}

async function startRun(
  rm: RM,
  o: {
    preset?: 'std-train' | 'hq-train';
    name?: string;
    seed?: number;
    dataset?: string;
    token?: any;
    progress?: any;
    skipExtPath?: boolean;
  } = {}
): Promise<Started> {
  if (!o.skipExtPath) rm.setExtensionPath(ext);
  const before = h.runners.length;
  await rm.executeRun(ws, o.preset ?? 'std-train', o.name ?? 'demo run', o.seed, o.dataset, o.token, o.progress);
  expect(h.runners.length).toBe(before + 1);
  const proc = h.runners[before] as FakeProc;
  const call = h.spawn.mock.calls.filter((c) => (c[1] as string[]).includes('-m'))[before];
  const args = call[1] as string[];
  const runDir = args[args.indexOf('--out') + 1];
  return { proc, args, opts: call[2], runDir, runId: path.basename(runDir) };
}

async function finish(rm: RM, s: Started, code: number | null): Promise<void> {
  s.proc.exitCode = code;
  s.proc.emit('close', code);
  await until(() => !rm.isRunning(), 'run to finish');
}

async function readJson(file: string): Promise<any> {
  return JSON.parse(await fs.readFile(file, 'utf-8'));
}

const text = () => h.lines.join('\n');

function fakeToken() {
  const listeners = new Set<() => void>();
  const disposables: Array<ReturnType<typeof vi.fn>> = [];
  return {
    token: {
      isCancellationRequested: false,
      onCancellationRequested: (l: () => void) => {
        listeners.add(l);
        const dispose = vi.fn(() => { listeners.delete(l); });
        disposables.push(dispose);
        return { dispose };
      },
    },
    fire: () => { for (const l of [...listeners]) l(); },
    disposables,
  };
}

beforeEach(async () => {
  ws = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-rm-'));
  ext = path.join(ws, 'ext');
  h.trusted.current = true;
  h.config = {};
  h.lines.length = 0;
  h.runners.length = 0;
  h.statusItems.length = 0;
  h.presetDevice.current = 'cpu';
  for (const m of [h.configUpdate, h.errorMsg, h.warnMsg, h.infoMsg, h.openDialog, h.exec, h.channelDispose, h.spawn]) m.mockReset();
  h.errorMsg.mockImplementation(() => Promise.resolve(undefined));
  h.warnMsg.mockImplementation(() => Promise.resolve(undefined));
  h.infoMsg.mockImplementation(() => Promise.resolve(undefined));
  h.exec.mockImplementation(() => Promise.resolve(undefined));
  resetBehaviour();
  installSpawn();
});

afterEach(async () => {
  vi.useRealTimers();
  await new Promise((r) => setTimeout(r, 15)); // let fire-and-forget log appends settle
  await fs.rm(ws, { recursive: true, force: true });
});

// ── Guards before any process is spawned ─────────────────────────────────────

describe('executeRun guards', () => {
  it('untrusted workspace: error toast with a trust action, nothing spawned or created', async () => {
    const rm = await loadRM();
    h.trusted.current = false;

    await rm.executeRun(ws, 'std-train', 'x');

    expect(h.errorMsg).toHaveBeenCalledWith(rm.WORKSPACE_NOT_TRUSTED_MESSAGE, 'Open Trust Settings');
    expect(h.spawn).not.toHaveBeenCalled();
    expect(text()).toContain(`ERROR: ${rm.WORKSPACE_NOT_TRUSTED_MESSAGE}`);
    await expect(fs.stat(path.join(ws, '.ml'))).rejects.toThrow();
    expect(rm.isRunning()).toBe(false);
  });

  it('untrusted workspace: choosing "Open Trust Settings" opens the trust editor', async () => {
    const rm = await loadRM();
    h.trusted.current = false;
    h.errorMsg.mockImplementation(() => Promise.resolve('Open Trust Settings'));

    await rm.executeRun(ws, 'std-train', 'x');
    await until(() => h.exec.mock.calls.length > 0);

    expect(h.exec).toHaveBeenCalledWith('workbench.trust.manage');
  });

  it('untrusted workspace: dismissing the toast does nothing further', async () => {
    const rm = await loadRM();
    h.trusted.current = false;

    await rm.executeRun(ws, 'std-train', 'x');
    await new Promise((r) => setImmediate(r));

    expect(h.exec).not.toHaveBeenCalled();
  });

  it('a second run while one is active is refused with a warning and spawns nothing', async () => {
    const rm = await loadRM();
    const first = await startRun(rm);

    await rm.executeRun(ws, 'std-train', 'second');

    expect(h.warnMsg).toHaveBeenCalledWith('A training run is already in progress.');
    expect(h.runners).toHaveLength(1);
    expect(rm.isRunning()).toBe(true);

    await finish(rm, first, 0);
    expect(rm.isRunning()).toBe(false);
  });

  it('python missing: error toast, no run folder, no GPU probe, no runner', async () => {
    const rm = await loadRM();
    beh.python = { error: new Error('spawn python ENOENT') };

    await rm.executeRun(ws, 'std-train', 'x');

    expect(h.errorMsg).toHaveBeenCalledWith(
      'Python not found on PATH. Install Python 3.10+ and try again.',
      'Open Settings'
    );
    expect(text()).toContain('ERROR: Python not found on PATH');
    expect(h.spawn.mock.calls.every((c) => (c[1] as string[])[0] === '--version')).toBe(true);
    await expect(fs.stat(path.join(ws, '.ml'))).rejects.toThrow();
    expect(rm.isRunning()).toBe(false);
  });

  it('python missing: "Open Settings" jumps to runforge.pythonPath', async () => {
    const rm = await loadRM();
    beh.python = { code: 1 };
    h.errorMsg.mockImplementation(() => Promise.resolve('Open Settings'));

    await rm.executeRun(ws, 'std-train', 'x');
    await until(() => h.exec.mock.calls.length > 0);

    expect(h.exec).toHaveBeenCalledWith('workbench.action.openSettings', 'runforge.pythonPath');
  });

  it('uses the configured runforge.pythonPath for every Python spawn', async () => {
    const rm = await loadRM();
    h.config.pythonPath = 'C:/tools/py/python.exe';

    const s = await startRun(rm);

    const pythonCalls = h.spawn.mock.calls.filter((c) => c[0] === 'C:/tools/py/python.exe');
    expect(pythonCalls.map((c) => (c[1] as string[])[0])).toEqual(['--version', '-c', '-u']);
    expect(h.spawn.mock.calls.some((c) => c[0] === 'python')).toBe(false);
    await finish(rm, s, 0);
  });

  it('extension path never set: reports the missing bundled runner and does not spawn', async () => {
    const rm = await loadRM();

    await rm.executeRun(ws, 'std-train', 'x');

    expect(h.errorMsg).toHaveBeenCalledWith('RunForge extension error: bundled runner not found.');
    expect(text()).toContain('ERROR: Extension path not set. Cannot find bundled runner.');
    expect(h.runners).toHaveLength(0);
    expect(rm.isRunning()).toBe(false);
  });
});

describe('dataset path resolution', () => {
  it('a configured dataset that does not exist aborts with the NOT_FOUND message before any run folder', async () => {
    const rm = await loadRM();
    const missing = path.join(ws, 'nope.csv');
    h.config.datasetPath = missing;

    await rm.executeRun(ws, 'std-train', 'x');

    expect(h.errorMsg).toHaveBeenCalledWith(rm.buildDatasetNotFoundMessage(missing), 'Open Setting', 'Pick File');
    expect(text()).toContain(`ERROR: Dataset not found at ${missing}. Update runforge.datasetPath or pick a file.`);
    expect(h.spawn).not.toHaveBeenCalled();
    await expect(fs.stat(path.join(ws, '.ml'))).rejects.toThrow();
  });

  it('"Open Setting" jumps to runforge.datasetPath', async () => {
    const rm = await loadRM();
    h.config.datasetPath = path.join(ws, 'nope.csv');
    h.errorMsg.mockImplementation(() => Promise.resolve('Open Setting'));

    await rm.executeRun(ws, 'std-train', 'x');
    await until(() => h.exec.mock.calls.length > 0);

    expect(h.exec).toHaveBeenCalledWith('workbench.action.openSettings', 'runforge.datasetPath');
  });

  it('"Pick File" opens a CSV picker and stores the chosen path globally', async () => {
    const rm = await loadRM();
    h.config.datasetPath = path.join(ws, 'nope.csv');
    h.errorMsg.mockImplementation(() => Promise.resolve('Pick File'));
    h.openDialog.mockImplementation(() => Promise.resolve([{ fsPath: path.join(ws, 'picked.csv') }]));

    await rm.executeRun(ws, 'std-train', 'x');
    await until(() => h.configUpdate.mock.calls.length > 0);

    expect(h.openDialog).toHaveBeenCalledWith({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'CSV Files': ['csv'], 'All Files': ['*'] },
      title: 'Select Dataset CSV',
    });
    expect(h.configUpdate).toHaveBeenCalledWith('datasetPath', path.join(ws, 'picked.csv'), 1);
  });

  it('"Pick File" then cancelling the picker leaves the setting alone', async () => {
    const rm = await loadRM();
    h.config.datasetPath = path.join(ws, 'nope.csv');
    h.errorMsg.mockImplementation(() => Promise.resolve('Pick File'));
    h.openDialog.mockImplementation(() => Promise.resolve(undefined));

    await rm.executeRun(ws, 'std-train', 'x');
    await until(() => h.openDialog.mock.calls.length > 0);
    await new Promise((r) => setImmediate(r));

    expect(h.configUpdate).not.toHaveBeenCalled();
  });

  it('a configured dataset that exists is handed to the runner through RUNFORGE_DATASET', async () => {
    const rm = await loadRM();
    const csv = path.join(ws, 'data.csv');
    await fs.writeFile(csv, 'a,b\n1,2\n');
    h.config.datasetPath = csv;

    const s = await startRun(rm);

    expect(s.opts.env.RUNFORGE_DATASET).toBe(csv);
    await finish(rm, s, 0);
  });

  it('an explicit dataset argument wins over the setting and is not existence-checked', async () => {
    const rm = await loadRM();
    h.config.datasetPath = path.join(ws, 'nope.csv');

    const s = await startRun(rm, { dataset: 'explicit/path.csv' });

    expect(s.opts.env.RUNFORGE_DATASET).toBe('explicit/path.csv');
    expect(h.errorMsg).not.toHaveBeenCalled();
    await finish(rm, s, 0);
  });

  it('an empty setting means "no dataset": the runner gets no RUNFORGE_DATASET', async () => {
    const rm = await loadRM();
    h.config.datasetPath = '';
    const prior = process.env.RUNFORGE_DATASET;
    delete process.env.RUNFORGE_DATASET;

    const s = await startRun(rm);

    expect(s.opts.env.RUNFORGE_DATASET).toBeUndefined();
    if (prior !== undefined) process.env.RUNFORGE_DATASET = prior;
    await finish(rm, s, 0);
  });
});

// ── Device selection ─────────────────────────────────────────────────────────

describe('GPU gating inside executeRun', () => {
  it('enough free VRAM: runs on cuda and records why', async () => {
    const rm = await loadRM();
    torchCuda(16);

    const s = await startRun(rm);

    expect(s.args.slice(s.args.indexOf('--device'), s.args.indexOf('--device') + 2)).toEqual(['--device', 'cuda']);
    expect(text()).toContain('  ✓ Using GPU (16.0 GB free VRAM)');
    expect(text()).toContain('  Device:  cuda (sufficient_vram)');
    const req = await readJson(path.join(s.runDir, 'request.json'));
    expect(req).toMatchObject({ actual_device: 'cuda', gpu_reason: 'sufficient_vram', requested_device: 'cpu' });
    await finish(rm, s, 0);
  });

  it('not enough VRAM for hq-train on a preset that wants a GPU: cpu, warning, reason recorded', async () => {
    const rm = await loadRM();
    h.presetDevice.current = 'auto';
    torchCuda(6);

    const s = await startRun(rm, { preset: 'hq-train' });

    expect(s.args).toContain('cpu');
    const msg = 'GPU VRAM insufficient for hq-train (6.0 GB free, 12.0 GB required). Training will run on CPU.';
    expect(h.warnMsg).toHaveBeenCalledWith(msg);
    expect(text()).toContain(`  ⚠ ${msg}`);
    const req = await readJson(path.join(s.runDir, 'request.json'));
    expect(req).toMatchObject({ requested_device: 'auto', actual_device: 'cpu', gpu_reason: 'insufficient_vram' });
    await finish(rm, s, 0);
  });

  it('no GPU at all on a preset that asks for cuda: cpu with the "could not be detected" warning', async () => {
    const rm = await loadRM();
    h.presetDevice.current = 'cuda';
    beh.torch = { code: 1 }; // torch probe fails; nvidia-smi is absent by default -> detection_method none

    const s = await startRun(rm);

    expect(h.warnMsg).toHaveBeenCalledWith(
      'GPU could not be detected. Training will run on CPU to prevent system instability.'
    );
    const req = await readJson(path.join(s.runDir, 'request.json'));
    expect(req).toMatchObject({ actual_device: 'cpu', gpu_reason: 'gpu_unknown' });
    await finish(rm, s, 0);
  });

  it('preset that asks for cpu and a machine without CUDA: no warning, says it is as requested', async () => {
    const rm = await loadRM();
    h.presetDevice.current = 'cpu';

    const s = await startRun(rm);

    expect(h.warnMsg).not.toHaveBeenCalled();
    expect(text()).toContain('  ✓ Using CPU (as requested by preset)');
    expect(text()).toContain('  Device:  cpu (no_cuda)');
    await finish(rm, s, 0);
  });

  it('GPU probe blowing up (Error) falls back to CPU and says so', async () => {
    const rm = await loadRM();
    h.presetDevice.current = 'auto';
    beh.torch = { throws: new Error('spawn EPERM') };

    const s = await startRun(rm);

    expect(text()).toContain('  GPU detection failed: spawn EPERM');
    expect(text()).toContain('  GPU detection failed; falling back to CPU.');
    expect(text()).toContain('  GPU detection failed'); // the status line
    const req = await readJson(path.join(s.runDir, 'request.json'));
    expect(req).toMatchObject({ actual_device: 'cpu', gpu_reason: 'gpu_unknown' });
    await finish(rm, s, 0);
  });

  it('GPU probe throwing a non-Error value is stringified', async () => {
    const rm = await loadRM();
    beh.torch = { throws: 'plain string failure' };

    const s = await startRun(rm);

    expect(text()).toContain('  GPU detection failed: plain string failure');
    await finish(rm, s, 0);
  });
});

// ── A run that starts ────────────────────────────────────────────────────────

describe('run start', () => {
  it('spawns the bundled ml_runner with preset, run dir, device, name and seed', async () => {
    const rm = await loadRM();

    const s = await startRun(rm, { preset: 'hq-train', name: 'My Run', seed: 7 });

    expect(s.args).toEqual([
      '-u', '-m', 'ml_runner', 'train',
      '--preset', 'hq-train',
      '--out', s.runDir,
      '--device', 'cpu',
      '--name', 'My Run',
      '--seed', '7',
      '--model', 'logistic_regression',
    ]);
    expect(s.opts.cwd).toBe(ws);
    expect(s.opts.env.PYTHONPATH.startsWith(path.join(ext, 'python'))).toBe(true);
    expect(s.runDir).toBe(path.join(ws, '.ml', 'runs', s.runId));
    expect(s.runId).toMatch(RUN_ID_RE);
    expect(s.runId).toContain('-my-run-');
    await finish(rm, s, 0);
  });

  it('passes the configured model family and profile and prints them in the banner', async () => {
    const rm = await loadRM();
    h.config.modelFamily = 'random_forest';
    h.config.profile = 'fast';

    const s = await startRun(rm, { seed: 3 });

    expect(s.args.slice(-4)).toEqual(['--model', 'random_forest', '--profile', 'fast']);
    expect(text()).toContain('  Model:   random_forest');
    expect(text()).toContain('  Profile: fast');
    expect(text()).toContain('  Seed:    3');
    expect(text()).toContain(`  Run ID:  ${s.runId}`);
    await finish(rm, s, 0);
  });

  it('with no profile and no seed, neither flag is passed and neither line is printed', async () => {
    const rm = await loadRM();

    const s = await startRun(rm);

    expect(s.args).not.toContain('--profile');
    expect(s.args).not.toContain('--seed');
    expect(text()).not.toContain('Profile:');
    expect(text()).not.toContain('Seed:');
    await finish(rm, s, 0);
  });

  it('writes request.json before the process finishes', async () => {
    const rm = await loadRM();

    const s = await startRun(rm, { name: 'demo run', seed: 11 });

    const req = await readJson(path.join(s.runDir, 'request.json'));
    expect(req).toMatchObject({
      run_id: s.runId,
      name: 'demo run',
      preset_id: 'std-train',
      seed: 11,
      requested_device: 'cpu',
      actual_device: 'cpu',
      gpu_reason: 'no_cuda',
    });
    expect(req.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await expect(fs.stat(path.join(s.runDir, 'result.json'))).rejects.toThrow();
    await finish(rm, s, 0);
  });

  it('marks a run active and publishes the runforge:hasActiveRun context key both ways', async () => {
    const rm = await loadRM();

    const s = await startRun(rm);
    expect(rm.isRunning()).toBe(true);
    expect(h.exec).toHaveBeenCalledWith('setContext', 'runforge:hasActiveRun', true);
    expect(h.exec).not.toHaveBeenCalledWith('setContext', 'runforge:hasActiveRun', false);

    await finish(rm, s, 0);
    expect(rm.isRunning()).toBe(false);
    expect(h.exec).toHaveBeenLastCalledWith('setContext', 'runforge:hasActiveRun', false);
  });

  it('spawn throwing synchronously: failed result.json is written, run is cleared', async () => {
    const rm = await loadRM();
    rm.setExtensionPath(ext);
    beh.runner = { throws: new Error('spawn EACCES') };

    await rm.executeRun(ws, 'std-train', 'x');

    expect(text()).toContain('ERROR: Failed to start training: spawn EACCES');
    const runsDir = path.join(ws, '.ml', 'runs');
    const [only] = await fs.readdir(runsDir);
    const result = await readJson(path.join(runsDir, only, 'result.json'));
    expect(result).toEqual({
      run_id: only,
      status: 'failed',
      exit_code: -1,
      duration_ms: 0,
      error: 'spawn EACCES',
    });
    expect(h.errorMsg).toHaveBeenCalledWith(`Training failed: ${only}`);
    expect(rm.isRunning()).toBe(false);
    expect(h.exec).toHaveBeenLastCalledWith('setContext', 'runforge:hasActiveRun', false);
  });

  it('spawn throwing a non-Error value is stringified into the failed result', async () => {
    const rm = await loadRM();
    rm.setExtensionPath(ext);
    beh.runner = { throws: 'weird' };

    await rm.executeRun(ws, 'std-train', 'x');

    const runsDir = path.join(ws, '.ml', 'runs');
    const [only] = await fs.readdir(runsDir);
    expect((await readJson(path.join(runsDir, only, 'result.json'))).error).toBe('weird');
  });
});

// ── Output streaming ─────────────────────────────────────────────────────────

describe('output streaming', () => {
  it('stdout goes to the channel and to logs.txt', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);

    s.proc.stdout.emit('data', Buffer.from('loading data\nfitting model\n'));
    await untilFileHas(path.join(s.runDir, 'logs.txt'), 'fitting model');

    expect(text()).toContain('loading data');
    const logged = (await fs.readFile(path.join(s.runDir, 'logs.txt'), 'utf-8')).split('\n').filter(Boolean);
    expect([...logged].sort()).toEqual(['fitting model', 'loading data']);
    await finish(rm, s, 0);
  });

  it('stderr is classified: JSONL events, skipped events, and plain log lines', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    const plain = 'UserWarning: something harmless';
    const badShape = ev({ event: 'train_progress' }); // missing epoch / total_epochs
    const unknown = ev({ event: 'mystery' });

    s.proc.stderr.emit('data', Buffer.from([
      ev({ event: 'train_started', model_family: 'logistic_regression' }),
      plain,
      badShape,
      unknown,
      '',
    ].join('\n')));

    expect(h.lines).toContain('[event] train_started');
    expect(h.lines).toContain(`[stderr] ${plain}`);
    expect(h.lines).toContain(`[stderr-skip] ${badShape}`);
    expect(h.lines).toContain(`[stderr-skip] ${unknown}`);
    await until(() => h.lines.length > 0);
    await finish(rm, s, 0);
    const logs = await fs.readFile(path.join(s.runDir, 'logs.txt'), 'utf-8');
    expect(logs).toContain(`[stderr] ${plain}`);
  });

  it('drives the progress notification from train_progress and cancelling events', async () => {
    const rm = await loadRM();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const progress = { report: vi.fn() };
    const s = await startRun(rm, { progress });

    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'train_progress', epoch: 1, total_epochs: 10, loss: 0.123456, val_accuracy: 0.9123 }) + '\n'));
    expect(progress.report).toHaveBeenLastCalledWith({ message: 'Epoch 1/10 — loss=0.1235 val_acc=0.912' });

    // same epoch inside the 200 ms window: throttled
    vi.setSystemTime(1_000_100);
    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'train_progress', epoch: 1, total_epochs: 10, loss: 0.1 }) + '\n'));
    expect(progress.report).toHaveBeenCalledTimes(1);

    // epoch advanced inside the window: reported (no loss / accuracy parts)
    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'train_progress', epoch: 2, total_epochs: 10 }) + '\n'));
    expect(progress.report).toHaveBeenLastCalledWith({ message: 'Epoch 2/10' });
    expect(progress.report).toHaveBeenCalledTimes(2);

    // same epoch, window elapsed: reported
    vi.setSystemTime(1_000_400);
    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'train_progress', epoch: 2, total_epochs: 10, loss: 0.5 }) + '\n'));
    expect(progress.report).toHaveBeenLastCalledWith({ message: 'Epoch 2/10 — loss=0.5000' });
    expect(progress.report).toHaveBeenCalledTimes(3);

    // cancelling countdown
    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'cancelling', seconds_remaining: 4 }) + '\n'));
    expect(progress.report).toHaveBeenLastCalledWith({ message: 'Cancelling… 4s' });

    // the status bar surface saw the same epochs
    expect(h.statusItems[0].text).toBe('$(loading~spin) RunForge: Epoch 2/10');
    expect(h.statusItems[0].show).toHaveBeenCalled();

    vi.useRealTimers();
    await finish(rm, s, 0);
  });

  it('without a progress reporter, events are still mirrored and nothing throws', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);

    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'train_progress', epoch: 1, total_epochs: 2 }) + '\n'));
    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'cancelling', seconds_remaining: 2 }) + '\n'));

    expect(h.lines.filter((l) => l === '[event] train_progress')).toHaveLength(1);
    expect(h.lines).toContain('[event] cancelling');
    await finish(rm, s, 0);
  });

  it('callbacks from a finished run are ignored once another run is active', async () => {
    const rm = await loadRM();
    const first = await startRun(rm);
    await finish(rm, first, 0);
    const second = await startRun(rm);

    first.proc.stdout.emit('data', Buffer.from('stale stdout\n'));
    first.proc.stderr.emit('data', Buffer.from('stale stderr\n'));
    first.proc.emit('close', 1);
    await new Promise((r) => setImmediate(r));

    expect(text()).not.toContain('stale stdout');
    expect(text()).not.toContain('stale stderr');
    expect(rm.isRunning()).toBe(true);
    await expect(fs.stat(path.join(second.runDir, 'result.json'))).rejects.toThrow();
    await finish(rm, second, 0);
  });
});

// ── Ways a run ends ──────────────────────────────────────────────────────────

describe('run completion', () => {
  it('success: result.json succeeded, metrics logged, success toast, status-bar flash', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    await fs.writeFile(path.join(s.runDir, 'run.json'), '{}');
    await fs.writeFile(path.join(s.runDir, 'metrics.json'), JSON.stringify({ accuracy: 0.95, note: 'ignored' }));

    await finish(rm, s, 0);

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result).toMatchObject({ run_id: s.runId, status: 'succeeded', exit_code: 0 });
    expect(result.error).toBeUndefined();
    expect(text()).toContain(`✓ Training complete: ${s.runId}`);
    expect(text()).toMatch(/ {2}Duration: (\d+ms|\d+\.\ds|\d+m \d+s)/);
    expect(text()).toContain('  Device:   cpu');
    expect(text()).toContain('  Metrics:');
    expect(text()).toContain('    accuracy: 0.95');
    expect(text()).not.toContain('note');
    expect(h.infoMsg).toHaveBeenCalledWith(`Training complete: ${s.runId}`);
    expect(h.errorMsg).not.toHaveBeenCalled();
    expect(h.statusItems[0].text).toBe(`$(check) RunForge: ${s.runId}`);
    expect(h.statusItems[0].command).toBe('runforge.browseRuns');
  });

  it('success without a metrics file omits the Metrics block', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    await fs.writeFile(path.join(s.runDir, 'run.json'), '{}');

    await finish(rm, s, 0);

    expect(text()).toContain('✓ Training complete');
    expect(text()).not.toContain('Metrics:');
  });

  it('exit 0 but no run.json is a failed run (training-incomplete), not a success', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);

    await finish(rm, s, 0);

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result.status).toBe('failed');
    expect(result.exit_code).toBe(0);
    expect(result.error).toBe('training-incomplete: run.json missing despite exit code 0');
    expect(text()).toContain(`✗ Training failed: ${s.runId}`);
    expect(text()).toContain('  Error: training-incomplete: run.json missing despite exit code 0');
    expect(h.errorMsg).toHaveBeenCalledWith(`Training failed: ${s.runId}`);
    expect(h.infoMsg).not.toHaveBeenCalled();
  });

  it('non-zero exit: failed result with the exit code, failure toast, status bar hidden', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    s.proc.stderr.emit('data', Buffer.from('ValueError: bad column\n'));

    await finish(rm, s, 3);

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result).toMatchObject({ status: 'failed', exit_code: 3, error: 'Process exited with code 3' });
    expect(text()).toContain('  Exit code: 3');
    expect(text()).toContain('  Error: Process exited with code 3');
    expect(h.errorMsg).toHaveBeenCalledWith(`Training failed: ${s.runId}`);
    expect(h.statusItems[0].hide).toHaveBeenCalled();
    expect(rm.isRunning()).toBe(false);
  });

  it('process error event (e.g. ENOENT after spawn) is a failed run with exit_code -1', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);

    s.proc.emit('error', new Error('spawn python ENOENT'));
    await until(() => !rm.isRunning(), 'run to finish');

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result).toMatchObject({ status: 'failed', exit_code: -1, error: 'spawn python ENOENT' });
  });

  it('a failure to write result.json is reported as a WARN and the run is still cleared', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    // Replace the run folder with a file so writeResult cannot succeed.
    await fs.rm(s.runDir, { recursive: true, force: true });
    await fs.writeFile(s.runDir, 'not a directory');

    await finish(rm, s, 1);

    expect(text()).toContain('WARN: Failed to write result.json:');
    expect(text()).toContain(`✗ Training failed: ${s.runId}`);
    expect(rm.isRunning()).toBe(false);
  });

  it('a new run can start after a failed one', async () => {
    const rm = await loadRM();
    const first = await startRun(rm);
    await finish(rm, first, 1);

    const second = await startRun(rm);

    expect(second.runId).not.toBe(first.runId);
    expect(rm.isRunning()).toBe(true);
    await finish(rm, second, 0);
  });
});

// ── OOM ──────────────────────────────────────────────────────────────────────

describe('GPU out-of-memory handling', () => {
  it('on cuda, an OOM stderr line terminates the process once and the result carries the OOM reason', async () => {
    const rm = await loadRM();
    torchCuda(16);
    const s = await startRun(rm);

    s.proc.stderr.emit('data', Buffer.from('torch.cuda.OutOfMemoryError: CUDA out of memory\n'));
    s.proc.stderr.emit('data', Buffer.from('RuntimeError: CUDA out of memory again\n'));

    expect(s.proc.kill).toHaveBeenCalledTimes(1);
    expect(s.proc.kill).toHaveBeenCalledWith();
    expect(h.errorMsg).toHaveBeenCalledWith('Training stopped due to memory limits. See logs for details.');
    expect(text()).toContain('⚠ Detected GPU memory error - stopping run to prevent system instability');

    await finish(rm, s, 1);

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Stopped due to GPU memory limits (OOM detected)');
  });

  it('on cpu, the same stderr line is just logged', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);

    s.proc.stderr.emit('data', Buffer.from('MemoryError: out of memory\n'));

    expect(s.proc.kill).not.toHaveBeenCalled();
    expect(h.lines).toContain('[stderr] MemoryError: out of memory');
    await finish(rm, s, 1);
    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result.error).toBe('Process exited with code 1');
  });
});

// ── Cancellation ─────────────────────────────────────────────────────────────

describe('cancellation via the VS Code token', () => {
  it('fires SIGTERM once, however many times the token fires, and logs the request', async () => {
    const rm = await loadRM();
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });

    t.fire();
    t.fire();

    expect(s.proc.kill).toHaveBeenCalledTimes(1);
    expect(s.proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(text()).toContain('Cancel requested: user cancelled via VS Code progress UI');
    await finish(rm, s, 143);
  });

  it('graceful: run_cancelled event seen -> failed result, "Cancelled (graceful)"', async () => {
    const rm = await loadRM();
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });

    t.fire();
    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'run_cancelled', step: 'training', graceful: true }) + '\n'));
    await finish(rm, s, 143);

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Cancelled (graceful) — partial cleanup completed');
    expect(text()).toContain('[cancel-detector] terminal state: cancelled-graceful');
  });

  it('graceful: a .cancelled marker on disk is enough even without the event', async () => {
    const rm = await loadRM();
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });
    await fs.writeFile(
      path.join(s.runDir, '.cancelled'),
      JSON.stringify({
        schema_version: 'cancelled.v1.0.0',
        run_id: s.runId,
        run_dir: `.ml/runs/${s.runId}`,
        cancelled_at: '2026-01-01T00:00:00Z',
        step: 'training',
      })
    );

    t.fire();
    await finish(rm, s, 143);

    expect(text()).toContain('[cancel-detector] terminal state: cancelled-graceful');
    expect((await readJson(path.join(s.runDir, 'result.json'))).error).toBe(
      'Cancelled (graceful) — partial cleanup completed'
    );
  });

  it('forced: no marker, no event, non-zero exit -> "Cancelled (forced)"', async () => {
    const rm = await loadRM();
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });

    t.fire();
    await finish(rm, s, 137);

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result).toMatchObject({
      status: 'failed',
      exit_code: 137,
      error: 'Cancelled (forced) — SIGKILL fired before cleanup completed',
    });
    expect(text()).toContain('[cancel-detector] terminal state: cancelled-forced');
  });

  it('race: training finished (artifacts_written + run.json) before the cancel landed -> still succeeded', async () => {
    const rm = await loadRM();
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });
    await fs.writeFile(path.join(s.runDir, 'run.json'), '{}');

    t.fire();
    s.proc.stderr.emit('data', Buffer.from(ev({ event: 'artifacts_written', artifact_count: 4 }) + '\n'));
    await finish(rm, s, 0);

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result.status).toBe('succeeded');
    expect(text()).toContain('[cancel-detector] terminal state: completed');
    expect(text()).toContain(`✓ Training complete: ${s.runId}`);
  });

  it('crashed during cancel: exit 0 with nothing written is a failure with a generic message', async () => {
    const rm = await loadRM();
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });

    t.fire();
    await finish(rm, s, 0);

    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Crashed during cancel handling');
    expect(text()).toContain('[cancel-detector] terminal state: crashed');
  });

  it('drops the token listener when the process closes, so a late cancel does nothing', async () => {
    const rm = await loadRM();
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });

    await finish(rm, s, 0);
    expect(t.disposables).toHaveLength(1);
    expect(t.disposables[0]).toHaveBeenCalledTimes(1);

    t.fire();
    expect(s.proc.kill).not.toHaveBeenCalled();
  });

  it('a cancel with no token never marks the run cancelled: a plain failure stays a plain failure', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);

    await finish(rm, s, 1);

    expect(text()).not.toContain('[cancel-detector]');
    expect((await readJson(path.join(s.runDir, 'result.json'))).error).toBe('Process exited with code 1');
  });
});

// ── killActiveRun / deactivate ───────────────────────────────────────────────

describe('killActiveRun', () => {
  it('is a silent no-op when nothing is running', async () => {
    const rm = await loadRM();

    rm.killActiveRun('deactivate');

    expect(h.lines).toEqual([]);
    expect(rm.isRunning()).toBe(false);
  });

  it('sends SIGTERM, logs the reason, and the aborted run reports that reason', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);

    rm.killActiveRun('extension deactivating');

    expect(s.proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(text()).toContain('Stopping active run: extension deactivating');

    await finish(rm, s, 143);
    const result = await readJson(path.join(s.runDir, 'result.json'));
    expect(result.status).toBe('failed');
    expect(result.error).toBe('extension deactivating');
  });

  it('even an exit code 0 after an abort is reported as failed', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    await fs.writeFile(path.join(s.runDir, 'run.json'), '{}');

    rm.killActiveRun('stop');
    await finish(rm, s, 0);

    expect((await readJson(path.join(s.runDir, 'result.json'))).status).toBe('failed');
  });

  it('tolerates the process refusing the signal', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    s.proc.kill.mockImplementation(() => { throw new Error('ESRCH'); });

    expect(() => rm.killActiveRun('x')).not.toThrow();
    await finish(rm, s, 1);
  });
});

// ── Singletons ───────────────────────────────────────────────────────────────

describe('output channel and status bar lifecycle', () => {
  it('getOutputChannel returns one channel until disposed, then a fresh one', async () => {
    const rm = await loadRM();

    const a = rm.getOutputChannel();
    expect(rm.getOutputChannel()).toBe(a);

    rm.disposeOutputChannel();
    expect(h.channelDispose).toHaveBeenCalledTimes(1);
    expect(rm.getOutputChannel()).not.toBe(a);
  });

  it('disposeOutputChannel also disposes the status-bar item created by a run', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    await finish(rm, s, 0);
    expect(h.statusItems).toHaveLength(1);

    rm.disposeOutputChannel();

    expect(h.statusItems[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('disposeOutputChannel is safe to call with nothing created', async () => {
    const rm = await loadRM();

    expect(() => { rm.disposeOutputChannel(); rm.disposeOutputChannel(); }).not.toThrow();
    expect(h.channelDispose).not.toHaveBeenCalled();
  });

  it('the status-bar item is created lazily and reused across runs', async () => {
    const rm = await loadRM();
    expect(h.statusItems).toHaveLength(0);

    const a = await startRun(rm);
    await finish(rm, a, 0);
    const b = await startRun(rm);
    await finish(rm, b, 0);

    expect(h.statusItems).toHaveLength(1);
  });
});

// ── SIGKILL escalation (CONTRACT-PHASE-4.md §3.1.1) ──────────────────────────
//
// The fake process follows Node: `proc.killed` becomes true as soon as a signal
// was delivered, and says nothing about whether the process has exited. A
// process that ignores SIGTERM therefore still has exitCode === null.

describe('SIGKILL escalation for a process that ignores SIGTERM', () => {
  const sigkillCalls = (p: FakeProc) => p.kill.mock.calls.filter((c) => c[0] === 'SIGKILL');

  it('cancel: SIGKILL follows 5 s after SIGTERM if the process is still running', async () => {
    const rm = await loadRM();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });

    t.fire();
    expect(s.proc.kill).toHaveBeenCalledWith('SIGTERM');

    await vi.advanceTimersByTimeAsync(4999);
    expect(sigkillCalls(s.proc)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(sigkillCalls(s.proc)).toHaveLength(1);
    expect(text()).toContain('[cancel] grace window elapsed — sending SIGKILL');

    vi.useRealTimers();
    await finish(rm, s, 137);
  });

  it('cancel: a process that exited inside the window is never SIGKILLed', async () => {
    const rm = await loadRM();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = fakeToken();
    const s = await startRun(rm, { token: t.token });

    t.fire();
    await vi.advanceTimersByTimeAsync(2000);
    await finish(rm, s, 143);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(sigkillCalls(s.proc)).toHaveLength(0);
    expect(text()).not.toContain('grace window elapsed');
  });

  it('killActiveRun: SIGKILL follows 2 s after SIGTERM if the process is still running', async () => {
    const rm = await loadRM();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = await startRun(rm);

    rm.killActiveRun('deactivate');
    await vi.advanceTimersByTimeAsync(1999);
    expect(sigkillCalls(s.proc)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(sigkillCalls(s.proc)).toHaveLength(1);

    vi.useRealTimers();
    await finish(rm, s, 137);
  });

  it('killActiveRun: no SIGKILL for a process that already exited', async () => {
    const rm = await loadRM();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = await startRun(rm);

    rm.killActiveRun('deactivate');
    await finish(rm, s, 143);
    await vi.advanceTimersByTimeAsync(5000);

    expect(sigkillCalls(s.proc)).toHaveLength(0);
  });

  it('OOM: SIGKILL follows 2 s after the graceful kill if the process is still running', async () => {
    const rm = await loadRM();
    torchCuda(16);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = await startRun(rm);

    s.proc.stderr.emit('data', Buffer.from('CUDA out of memory\n'));
    expect(s.proc.kill).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);

    expect(sigkillCalls(s.proc)).toHaveLength(1);

    vi.useRealTimers();
    await finish(rm, s, 137);
  });
});

// ── logs.txt ordering ────────────────────────────────────────────────────────

describe('logs.txt', () => {
  it('keeps lines in the order the runner printed them', async () => {
    const rm = await loadRM();
    const s = await startRun(rm);
    const expected = Array.from({ length: 200 }, (_, i) => `line-${i}`);

    s.proc.stdout.emit('data', Buffer.from(expected.join('\n') + '\n'));
    await finish(rm, s, 1);
    await untilFileHas(path.join(s.runDir, 'logs.txt'), 'line-199');
    await new Promise((r) => realSetTimeout(r, 50)); // let every queued append land

    const logged = (await fs.readFile(path.join(s.runDir, 'logs.txt'), 'utf-8')).split('\n').filter(Boolean);
    expect(logged).toEqual(expected);
  });
});
