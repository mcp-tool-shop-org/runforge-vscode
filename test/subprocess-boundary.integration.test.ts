/**
 * Subprocess-boundary integration tests (Wave 4 / FT-TEST-004).
 *
 * Mike's preload — pattern lesson #15 applied prospectively:
 * A subprocess spawn returning a PID does NOT prove the subprocess is ready
 * to receive signals. Python's `ml_runner` registers its SIGTERM handler at
 * `python/ml_runner/runner.py:604` (the `_register_sigterm_handler(cancel_ctx)`
 * call) — code that runs AFTER the import phase. Between spawn and
 * handler-registration, a SIGTERM is silently dropped. The reliable signal
 * that the handler is live is the `run_start` event landing on the JSONL
 * stderr stream (emitted on line 610, immediately after handler registration).
 *
 * Every test in this file that fires a signal FIRST waits for the
 * `run_start` event before firing. Tests that just check "process started"
 * miss the class of bug that bit Wave 2.
 *
 * Scope (CONTRACT-PHASE-4.md §3.1.1, §3.1.3, §3.2):
 *   - Real Python `ml_runner` subprocess spawned via `child_process.spawn`
 *   - Fixture CSV (test/fixtures/iris-tiny.csv + cancel-fixture.csv)
 *   - Real SIGTERM/SIGKILL signals
 *   - Production reader: `detectCancelTerminalState` from src/runner/run-manager.ts
 *   - Real `.cancelled` marker write + read
 *   - Real `events.schema.v1` event stream
 *
 * Doctrine (Rule 5 of docs/CONTRACTS.md): no mocks for the subprocess
 * boundary. Every test invokes the production code path end-to-end.
 *
 * Platform: Linux/macOS only. Windows os.kill(SIGTERM) maps to
 * TerminateProcess and bypasses Python's signal handler — see
 * CONTRACT-PHASE-4.md §3.1.1. Mirrors the Python-side
 * test_subprocess_sigterm_writes_marker_and_emits_run_cancelled skip in
 * python/ml_runner/test_cancellation_marker.py.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// run-manager imports `vscode` at module level. Mock it to a minimal stub
// so the production cancel-detector function is reachable from the test
// process. Same shape as test/cancel-state-machine.test.ts.
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      dispose: () => {},
      clear: () => {},
    }),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
  },
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
  },
  commands: {
    executeCommand: () => Promise.resolve(undefined),
  },
}));

import { detectCancelTerminalState, type CancelDetectorInputs } from '../src/runner/run-manager.js';
import {
  EventStreamConsumer,
  EVENT_TYPES,
  parseEventLine,
  type ParsedEvent,
} from '../src/observability/event-stream-consumer.js';
import { readCancelledMarker } from '../src/observability/cancelled-marker-reader.js';
import { ARTIFACT_FILENAMES } from '../src/types.js';

// vitest provides __dirname under the test runner; resolve the repo root
// from the current file's location.
const TEST_DIR = __dirname;
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const PYTHON_PKG_PARENT = path.join(REPO_ROOT, 'python');
const FIXTURE_TINY = path.join(REPO_ROOT, 'test', 'fixtures', 'iris-tiny.csv');
const FIXTURE_CANCEL = path.join(REPO_ROOT, 'test', 'fixtures', 'subprocess-boundary-cancel.csv');

const PYTHON_BIN = process.env.RUNFORGE_TEST_PYTHON || 'python';

// Skip the entire file on Windows — see header doc.
const SKIP_PLATFORM = process.platform === 'win32';

interface ProbeResult {
  available: boolean;
  reason?: string;
}

let envProbe: ProbeResult | undefined;

/**
 * One-time probe — check whether `python -m ml_runner --help` succeeds. If
 * Python isn't on PATH or the package can't be imported, we skip the suite
 * with a clear reason rather than fail noisily.
 */
async function probeEnvironment(): Promise<ProbeResult> {
  if (envProbe !== undefined) return envProbe;
  envProbe = await new Promise<ProbeResult>((resolve) => {
    const proc = spawn(PYTHON_BIN, ['-m', 'ml_runner', 'train', '--help'], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONPATH: process.env.PYTHONPATH
          ? `${PYTHON_PKG_PARENT}${path.delimiter}${process.env.PYTHONPATH}`
          : PYTHON_PKG_PARENT,
      },
    });
    proc.on('error', (e) => resolve({ available: false, reason: e.message }));
    proc.on('close', (code) => {
      if (code === 0) resolve({ available: true });
      else resolve({ available: false, reason: `python exited ${code}` });
    });
  });
  return envProbe!;
}

async function ensureCancelFixture(): Promise<void> {
  // Slightly larger CSV than iris-tiny (40 rows, 4 features, balanced
  // 2-class) so random_forest training has measurable runtime — wide
  // enough to land SIGTERM mid-train deterministically. Determinism: the
  // file content is fixed; same bytes every run.
  try {
    await fs.access(FIXTURE_CANCEL);
    return;
  } catch {
    // build below
  }
  const lines = ['f1,f2,f3,f4,label'];
  for (let i = 0; i < 20; i++) {
    lines.push(`${1 + i * 0.05},${2 + i * 0.05},${1 + i * 0.04},${2 + i * 0.04},0`);
  }
  for (let i = 0; i < 20; i++) {
    lines.push(`${5 + i * 0.05},${3 + i * 0.05},${5 + i * 0.04},${3 + i * 0.04},1`);
  }
  await fs.writeFile(FIXTURE_CANCEL, lines.join('\n') + '\n', 'utf-8');
}

interface SpawnedRun {
  proc: ChildProcess;
  consumer: EventStreamConsumer;
  stderrLines: string[];
  stdoutLines: string[];
  exitInfo: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Resolves when the run_start event is observed on the stderr stream — pattern #15. */
  handlerReady: Promise<void>;
  runDir: string;
  workspaceRoot: string;
  runId: string;
}

/**
 * Spawn ml_runner against a fixture CSV. Returns the proc handle, an event
 * consumer fed live from stderr, and a `handlerReady` promise that resolves
 * ONLY when the `run_start` event lands on the JSONL stderr stream — i.e.,
 * after `_register_sigterm_handler` has installed the SIGTERM handler.
 *
 * Pattern #15: callers MUST `await handlerReady` before firing any signal.
 */
async function spawnRun(opts: {
  csv: string;
  modelFamily?: 'logistic_regression' | 'random_forest' | 'linear_svc';
  preset?: 'std-train' | 'hq-train';
}): Promise<SpawnedRun> {
  // Construct a fake `.ml` workspace so Python's _find_workspace_outputs_dir
  // walks correctly: <workspaceRoot>/.ml/runs/<run_id>/.
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-sb-int-'));
  const runId = `20260425-100000-sb-${Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0')}`;
  const runDir = path.join(workspaceRoot, '.ml', 'runs', runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, '.ml', 'outputs'), { recursive: true });

  const args = [
    '-u',
    '-m',
    'ml_runner',
    'train',
    '--preset',
    opts.preset ?? 'std-train',
    '--out',
    runDir,
    '--device',
    'cpu',
    '--seed',
    '42',
  ];
  if (opts.modelFamily) {
    args.push('--model', opts.modelFamily);
  }

  const proc = spawn(PYTHON_BIN, args, {
    cwd: PYTHON_PKG_PARENT,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      RUNFORGE_DATASET: opts.csv,
      PYTHONPATH: process.env.PYTHONPATH
        ? `${PYTHON_PKG_PARENT}${path.delimiter}${process.env.PYTHONPATH}`
        : PYTHON_PKG_PARENT,
    },
  });

  const consumer = new EventStreamConsumer();
  const stderrLines: string[] = [];
  const stdoutLines: string[] = [];

  let stdoutBuf = '';
  proc.stdout?.on('data', (data: Buffer) => {
    stdoutBuf += data.toString('utf-8');
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop() ?? '';
    for (const line of lines) if (line) stdoutLines.push(line);
  });

  // Pattern #15 — handlerReady resolves on the FIRST `run_start` event.
  let resolveHandlerReady: () => void;
  const handlerReady = new Promise<void>((r) => {
    resolveHandlerReady = r;
  });

  let stderrBuf = '';
  proc.stderr?.on('data', (data: Buffer) => {
    stderrBuf += data.toString('utf-8');
    const lines = stderrBuf.split('\n');
    stderrBuf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line) continue;
      stderrLines.push(line);
      consumer.push(line);
      // Resolve the gate the moment run_start parses cleanly.
      const parsed = parseEventLine(line);
      if (parsed.kind === 'event' && parsed.event.event === EVENT_TYPES.RUN_START) {
        resolveHandlerReady();
      }
    }
  });

  const exitInfo = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    proc.on('close', (code, signal) => {
      // Flush trailing partial buffers as final lines.
      if (stderrBuf) {
        stderrLines.push(stderrBuf);
        consumer.push(stderrBuf);
      }
      if (stdoutBuf) stdoutLines.push(stdoutBuf);
      resolve({ code, signal });
    });
    proc.on('error', () => resolve({ code: -1, signal: null }));
  });

  return {
    proc,
    consumer,
    stderrLines,
    stdoutLines,
    exitInfo,
    handlerReady,
    runDir,
    workspaceRoot,
    runId,
  };
}

/**
 * Manual `events.schema.v1` shape validator for `.cancelled` marker payloads.
 * Mirrors the schema's required fields + `const`-typed `schema_version`. We
 * roll a minimal validator instead of pulling Ajv to avoid a transitive
 * format-deps surface (the schema uses `format: date-time`).
 */
function validateCancelledMarker(payload: unknown): { ok: true } | { ok: false; reason: string } {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'not an object' };
  const m = payload as Record<string, unknown>;
  if (m.schema_version !== 'cancelled.v1.0.0') return { ok: false, reason: 'schema_version mismatch' };
  for (const k of ['run_id', 'run_dir', 'cancelled_at', 'step'] as const) {
    if (typeof m[k] !== 'string' || (m[k] as string).length === 0) {
      return { ok: false, reason: `missing/empty required field: ${k}` };
    }
  }
  const allowedSteps = [
    'dataset_loading',
    'training',
    'metrics_computation',
    'artifact_writing',
    'shutdown',
  ];
  if (!allowedSteps.includes(m.step as string)) return { ok: false, reason: 'step not in enum' };
  // ISO 8601 sanity check.
  if (Number.isNaN(Date.parse(m.cancelled_at as string))) {
    return { ok: false, reason: 'cancelled_at not parseable as date-time' };
  }
  return { ok: true };
}

async function safeKill(proc: ChildProcess, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
  if (proc.exitCode === null && !proc.killed) {
    try {
      proc.kill(signal);
    } catch {
      // ignore
    }
  }
}

async function cleanupRun(run: SpawnedRun): Promise<void> {
  await safeKill(run.proc, 'SIGKILL');
  // Give the OS a moment to reap.
  await new Promise((r) => setTimeout(r, 50));
  await fs.rm(run.workspaceRoot, { recursive: true, force: true }).catch(() => {});
}

describe.skipIf(SKIP_PLATFORM)('subprocess-boundary integration (Wave 4 FT-TEST-004)', () => {
  let envOk = true;
  let envReason = '';

  beforeEach(async () => {
    const probe = await probeEnvironment();
    envOk = probe.available;
    envReason = probe.reason ?? '';
    await ensureCancelFixture();
  });

  afterEach(async () => {
    // Clean up the on-disk cancel fixture between tests so determinism is
    // re-asserted on the next run. Fixture is regenerated at the next
    // beforeEach via ensureCancelFixture.
    await fs.rm(FIXTURE_CANCEL, { force: true }).catch(() => {});
  });

  /**
   * Test 1 — Happy path: real subprocess emits the documented event order.
   *
   * Boundary covered (NEW): the actual stderr-side event stream from a real
   * spawn against a fixture CSV. Existing event-stream-consumer.test.ts
   * unit-tests the parser; this test proves the parser+spawn boundary is
   * wired and that the Python side emits the right events in the right
   * order on a clean run.
   */
  it('happy path: real spawn against iris-tiny emits run_start → train_started → train_finished → artifacts_written in order, run.json on disk', async () => {
    if (!envOk) {
      console.warn(`Skipping: env probe failed: ${envReason}`);
      return;
    }
    const run = await spawnRun({ csv: FIXTURE_TINY });
    try {
      // Pattern #15 — wait for handler-registration evidence first.
      await run.handlerReady;

      const exit = await run.exitInfo;
      expect(exit.code).toBe(0);

      // Validate event ORDER (deterministic per CONTRACT-PHASE-4.md §6).
      const events = run.consumer.snapshot().map((e: ParsedEvent) => e.event);
      // Required prefix: run_start must come first; subsequent core events
      // appear in the order the Python pipeline runs them.
      expect(events[0]).toBe(EVENT_TYPES.RUN_START);
      expect(events).toContain(EVENT_TYPES.DATASET_LOADED);
      expect(events).toContain(EVENT_TYPES.TRAIN_STARTED);
      expect(events).toContain(EVENT_TYPES.TRAIN_FINISHED);
      expect(events).toContain(EVENT_TYPES.ARTIFACTS_WRITTEN);
      // train_started must precede train_finished.
      expect(events.indexOf(EVENT_TYPES.TRAIN_STARTED)).toBeLessThan(
        events.indexOf(EVENT_TYPES.TRAIN_FINISHED)
      );
      // artifacts_written is the last successful event before exit.
      expect(events.indexOf(EVENT_TYPES.ARTIFACTS_WRITTEN)).toBeGreaterThan(
        events.indexOf(EVENT_TYPES.TRAIN_FINISHED)
      );

      // run.json on disk at the canonical path.
      const runJsonPath = path.join(run.runDir, ARTIFACT_FILENAMES.RUN_JSON);
      const exists = await fs
        .access(runJsonPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Production detector classifies as 'completed' on this evidence.
      const inputs: CancelDetectorInputs = {
        runDir: run.runDir,
        observedEvents: run.consumer.snapshot(),
        exitCode: exit.code ?? -1,
        cancelIntentFired: false,
      };
      const state = await detectCancelTerminalState(inputs);
      expect(state).toBe('completed');
    } finally {
      await cleanupRun(run);
    }
  }, 30_000);

  /**
   * Test 2 — Cancel after handler-registration: full graceful path.
   *
   * Boundary covered (NEW): real SIGTERM into a real subprocess →
   * Python signal handler fires → marker is atomically written → event is
   * emitted → TS production reader (`detectCancelTerminalState`) classifies
   * as 'cancelled-graceful'.
   *
   * This is the path Wave 2 added unit/EH coverage for; this test runs the
   * full subprocess boundary on every CI build (not just smoke).
   */
  it('cancel after handler-registration: SIGTERM produces .cancelled marker + run_cancelled event, production reader returns cancelled-graceful', async () => {
    if (!envOk) {
      console.warn(`Skipping: env probe failed: ${envReason}`);
      return;
    }
    const run = await spawnRun({ csv: FIXTURE_CANCEL, modelFamily: 'random_forest' });
    try {
      // Pattern #15 — gate signal-firing on handler-registration evidence.
      await run.handlerReady;

      // Fire SIGTERM AFTER the handler is registered. Python's handler must
      // catch this, write the marker, emit run_cancelled, exit non-zero.
      run.proc.kill('SIGTERM');

      const exit = await run.exitInfo;
      expect(exit.code).not.toBe(0);

      // Marker on disk + parseable + schema-valid.
      const markerPath = path.join(run.runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER);
      const markerExists = await fs
        .access(markerPath)
        .then(() => true)
        .catch(() => false);
      expect(markerExists).toBe(true);
      const markerRaw = await fs.readFile(markerPath, 'utf-8');
      const markerPayload = JSON.parse(markerRaw);
      const validation = validateCancelledMarker(markerPayload);
      expect(validation.ok).toBe(true);

      // Production marker reader returns the same payload.
      const readerResult = await readCancelledMarker(run.runDir);
      expect(readerResult).not.toBeNull();
      expect(readerResult?.run_id).toBe(markerPayload.run_id);

      // run_cancelled event observed on the live event stream.
      const events = run.consumer.snapshot();
      expect(events.some((e: ParsedEvent) => e.event === EVENT_TYPES.RUN_CANCELLED)).toBe(true);

      // PRODUCTION READER classifies as 'cancelled-graceful' per §3.1.3.
      const state = await detectCancelTerminalState({
        runDir: run.runDir,
        observedEvents: events,
        exitCode: exit.code ?? -1,
        cancelIntentFired: true,
      });
      expect(state).toBe('cancelled-graceful');
    } finally {
      await cleanupRun(run);
    }
  }, 30_000);

  /**
   * Test 3 — Pattern lesson #15 demonstrator.
   *
   * Boundary covered (NEW): explicit assertion that `run_start` lands on
   * stderr BEFORE the SIGTERM-handler-dependent path completes successfully.
   * This is the gate-shape Wave 4 wants to enforce prospectively.
   *
   * If this test ever times out at the handlerReady await, it means Python
   * is failing to register the SIGTERM handler before emitting events — a
   * regression of the bug Wave 2 hit.
   */
  it('pattern #15: run_start event on stderr proves handler-registration BEFORE any signal is fired', async () => {
    if (!envOk) {
      console.warn(`Skipping: env probe failed: ${envReason}`);
      return;
    }
    const run = await spawnRun({ csv: FIXTURE_CANCEL, modelFamily: 'random_forest' });
    try {
      // Block on handlerReady — if Python doesn't emit run_start within
      // the per-test timeout, vitest fails this test, which IS the signal
      // that the contract regressed.
      await run.handlerReady;

      // Now firing SIGTERM is safe per the contract; observe full graceful path.
      run.proc.kill('SIGTERM');
      const exit = await run.exitInfo;

      // The success criterion of this gate is BOTH (a) run_start landed and
      // (b) the cancel completed gracefully — proving the handler was live.
      const markerPath = path.join(run.runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER);
      const markerExists = await fs
        .access(markerPath)
        .then(() => true)
        .catch(() => false);
      expect(markerExists).toBe(true);
      expect(exit.code).not.toBe(0);
      // run_start MUST be the first event observed (the gate's primary claim).
      const firstEvent = run.consumer.snapshot()[0];
      expect(firstEvent?.event).toBe(EVENT_TYPES.RUN_START);
    } finally {
      await cleanupRun(run);
    }
  }, 30_000);

  /**
   * Test 4 — SIGKILL bypass: cleanup never runs.
   *
   * Boundary covered (NEW): real SIGKILL into a real subprocess BEFORE
   * graceful cleanup → marker NOT written → run_cancelled event NOT emitted
   * → TS production reader classifies as 'cancelled-forced'.
   *
   * This verifies that the production detector correctly distinguishes the
   * forced-kill path from the graceful path — a property the unit-scope
   * cancel-state-machine test covers via fabricated inputs but never
   * exercises against a real OS-level SIGKILL.
   */
  it('SIGKILL bypass: real SIGKILL leaves no marker, no run_cancelled event, production reader returns cancelled-forced', async () => {
    if (!envOk) {
      console.warn(`Skipping: env probe failed: ${envReason}`);
      return;
    }
    const run = await spawnRun({ csv: FIXTURE_CANCEL, modelFamily: 'random_forest' });
    try {
      // Pattern #15 — wait for handler-registration evidence even though
      // SIGKILL bypasses the handler. We want to be deterministic about
      // WHERE in the pipeline the kill lands (i.e., training, not bootstrap).
      await run.handlerReady;

      // SIGKILL — the OS reaps the process; Python never runs cleanup.
      run.proc.kill('SIGKILL');
      const exit = await run.exitInfo;
      expect(exit.code).not.toBe(0);

      // Marker absent.
      const markerPath = path.join(run.runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER);
      const markerExists = await fs
        .access(markerPath)
        .then(() => true)
        .catch(() => false);
      expect(markerExists).toBe(false);

      // run_cancelled event absent (Python never reached the emit_event call).
      const events = run.consumer.snapshot();
      expect(events.some((e: ParsedEvent) => e.event === EVENT_TYPES.RUN_CANCELLED)).toBe(false);

      // PRODUCTION READER classifies as 'cancelled-forced' per §3.1.3 rule 3.
      const state = await detectCancelTerminalState({
        runDir: run.runDir,
        observedEvents: events,
        exitCode: exit.code ?? -1,
        cancelIntentFired: true,
      });
      expect(state).toBe('cancelled-forced');
    } finally {
      await cleanupRun(run);
    }
  }, 30_000);

  /**
   * Test 5 — `.cancelled` marker schema validation against the real Python
   * write.
   *
   * Boundary covered (NEW): the marker that Python's `write_cancelled_marker`
   * actually writes conforms to `cancelled.schema.v1.0.0.json`. The Python-side
   * unit test (`test_cancellation_marker.py`) checks the marker shape from
   * Python's perspective; this test asserts schema conformance from the TS
   * boundary side, defending against Python/TS schema drift.
   */
  it('cancelled marker schema: real Python-written marker validates against cancelled.schema.v1.0.0', async () => {
    if (!envOk) {
      console.warn(`Skipping: env probe failed: ${envReason}`);
      return;
    }
    const run = await spawnRun({ csv: FIXTURE_CANCEL, modelFamily: 'random_forest' });
    try {
      await run.handlerReady;
      run.proc.kill('SIGTERM');
      await run.exitInfo;

      const markerPath = path.join(run.runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER);
      const markerExists = await fs
        .access(markerPath)
        .then(() => true)
        .catch(() => false);
      expect(markerExists).toBe(true);

      const payload = JSON.parse(await fs.readFile(markerPath, 'utf-8'));
      const v = validateCancelledMarker(payload);
      expect(v.ok).toBe(true);
      // Spot check known invariants directly (defense-in-depth — if the
      // generic validator regresses, the explicit checks still flag drift).
      expect(payload.schema_version).toBe('cancelled.v1.0.0');
      expect(typeof payload.run_id).toBe('string');
      expect(payload.run_id.length).toBeGreaterThan(0);
      expect(typeof payload.run_dir).toBe('string');
      expect(typeof payload.cancelled_at).toBe('string');
      expect(['dataset_loading', 'training', 'metrics_computation', 'artifact_writing', 'shutdown']).toContain(
        payload.step
      );
    } finally {
      await cleanupRun(run);
    }
  }, 30_000);
});
