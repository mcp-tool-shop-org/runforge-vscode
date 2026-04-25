/**
 * Cancel state-machine fixture matrix (FT-BACK-001 / Phase 4 Wave 2).
 *
 * Per CONTRACT-PHASE-4.md §3.1.3 (source-of-truth doctrine):
 * Terminal cancel state is determined by ARTIFACTS ON DISK + EVENTS
 * OBSERVED, never by process-exit timing. Process-exit timing is a
 * control-flow trigger (the 5s SIGKILL window in §3.1.1); it is NOT a
 * state detector.
 *
 * Preload 3 (production call chain): every test invokes the production
 * `detectCancelTerminalState` function exported from
 * `src/runner/run-manager.ts`. There is no test-side mirror — if the
 * production function changes shape, these tests fail.
 *
 * Preload 2 (fixture matrix): the 7 scenarios below cover state-machine
 * corners — happy path + race-resilience (marker wins / event wins) +
 * SIGKILL races + corruption tolerance + completion-race-vs-cancel.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock vscode (run-manager imports it at module level — same pattern as
// run-manager-pure.test.ts).
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

import {
  detectCancelTerminalState,
  type CancelDetectorInputs,
} from '../src/runner/run-manager.js';
import { ARTIFACT_FILENAMES, type IndexCancelledMarker } from '../src/types.js';
import type { ParsedEvent } from '../src/observability/event-stream-consumer.js';

const ts = '2026-04-25T12:00:00Z';

/** Build a valid `IndexCancelledMarker` payload conforming to v1.0.0. */
function makeMarker(overrides: Partial<IndexCancelledMarker> = {}): IndexCancelledMarker {
  return {
    schema_version: 'cancelled.v1.0.0',
    run_id: 'r-test',
    run_dir: '.ml/runs/r-test',
    cancelled_at: ts,
    step: 'training',
    ...overrides,
  };
}

/** Build a valid run.json shape sufficient for the detector's run.json check. */
function makeRunJson(runId: string): Record<string, unknown> {
  return {
    run_id: runId,
    schema_version: 'run.v0.3.6',
    created_at: ts,
    runforge_version: '1.0.0',
    dataset: { path: 'iris.csv', fingerprint_sha256: 'a'.repeat(64) },
    label_column: 'species',
    model_family: 'logistic_regression',
    num_samples: 100,
    num_features: 4,
    dropped_rows_missing_values: 0,
    metrics: { accuracy: 0.95, num_samples: 100, num_features: 4 },
    metrics_v1: {
      schema_version: 'metrics.v1',
      metrics_profile: 'classification.base.v1',
      artifact_path: 'metrics.v1.json',
    },
    artifacts: { model_pkl: 'model.pkl' },
  };
}

function runCancelledEvent(): ParsedEvent {
  return {
    event: 'run_cancelled',
    timestamp: ts,
    run_id: 'r-test',
    step: 'training',
    graceful: true,
  };
}

function artifactsWrittenEvent(): ParsedEvent {
  return {
    event: 'artifacts_written',
    timestamp: ts,
    run_id: 'r-test',
    artifact_count: 4,
    run_dir: '.ml/runs/r-test',
  };
}

describe('detectCancelTerminalState — Preload 2 fixture matrix', () => {
  let runDir: string;

  beforeEach(async () => {
    runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-cancel-state-'));
  });

  afterEach(async () => {
    await fs.rm(runDir, { recursive: true, force: true });
  });

  /**
   * Scenario 1 — Happy path (graceful within grace window).
   *
   * Python emits run_cancelled + writes marker before t+5s.
   * TS detects 'cancelled-graceful'.
   */
  it('Scenario 1 (happy path): marker present + run_cancelled event observed → cancelled-graceful', async () => {
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER),
      JSON.stringify(makeMarker()),
      'utf-8'
    );

    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [runCancelledEvent()],
      exitCode: 1,
      cancelIntentFired: true,
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('cancelled-graceful');
  });

  /**
   * Scenario 2 — Race path 1: marker wins, event drops.
   *
   * Marker present, run_cancelled event NOT observed (e.g., schema
   * validation dropped it on Python side, or stderr was truncated). TS
   * must still detect 'cancelled-graceful' via marker alone.
   */
  it('Scenario 2 (marker wins): .cancelled marker present, event missing → cancelled-graceful', async () => {
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER),
      JSON.stringify(makeMarker()),
      'utf-8'
    );

    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [], // event was lost
      exitCode: 1,
      cancelIntentFired: true,
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('cancelled-graceful');
  });

  /**
   * Scenario 3 — Race path 2: event wins, marker drops.
   *
   * run_cancelled event observed, marker NOT written (e.g., write failed,
   * or SIGKILL landed after the event was emitted but before os.replace).
   * TS must still detect 'cancelled-graceful' via event alone.
   */
  it('Scenario 3 (event wins): run_cancelled observed, marker missing → cancelled-graceful', async () => {
    // Marker file deliberately not created.
    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [runCancelledEvent()],
      exitCode: 1,
      cancelIntentFired: true,
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('cancelled-graceful');
  });

  /**
   * Scenario 4 — SIGKILL hits cleanly.
   *
   * Marker present + run_cancelled event observed BUT exit took >5s
   * (SIGKILL fired anyway). TS still detects 'cancelled-graceful' — the
   * marker/event win, SIGKILL is just the trigger. This is the §3.1.3
   * doctrine in action: process-exit timing does NOT determine state.
   */
  it('Scenario 4 (SIGKILL clean): marker + event landed before SIGKILL → cancelled-graceful (doctrine)', async () => {
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER),
      JSON.stringify(makeMarker()),
      'utf-8'
    );

    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [runCancelledEvent()],
      exitCode: 137, // SIGKILL exit code on Unix; cosmetic — detector ignores exit-timing
      cancelIntentFired: true,
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('cancelled-graceful');
  });

  /**
   * Scenario 5 — SIGKILL hits before cleanup.
   *
   * cancelIntentFired, neither marker nor event landed, non-zero exit.
   * TS detects 'cancelled-forced'. SIGKILL won the race or Python crashed
   * mid-cleanup.
   */
  it('Scenario 5 (SIGKILL forced): cancel fired, no marker, no event → cancelled-forced', async () => {
    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [],
      exitCode: 137,
      cancelIntentFired: true,
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('cancelled-forced');
  });

  /**
   * Scenario 6 — Partial marker (defensive).
   *
   * The .cancelled file exists but is corrupt/partial JSON. Reader skips
   * with logged diagnostic, treats as no-marker. Combined with no event →
   * 'cancelled-forced'. This guards against the (unlikely but possible)
   * case where atomic os.replace was interrupted mid-way through, or where
   * disk corruption leaves a partial file.
   */
  it('Scenario 6 (corrupt marker): partial .cancelled JSON, no event → cancelled-forced', async () => {
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER),
      '{not valid json',
      'utf-8'
    );

    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [],
      exitCode: 1,
      cancelIntentFired: true,
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('cancelled-forced');
  });

  /**
   * Scenario 7 — Race with completion.
   *
   * Cancel fired AT t=4.99s but training completed AT t=5.0s with
   * artifacts_written event + run.json. TS detects 'completed' — the race
   * landed on the success side. Cancel intent is recorded but supersedes
   * nothing (per §3.1.3 detection rules table).
   */
  it('Scenario 7 (race with completion): artifacts_written + run.json present → completed', async () => {
    // run.json on disk at canonical path
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON),
      JSON.stringify(makeRunJson('r-test')),
      'utf-8'
    );

    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [artifactsWrittenEvent()],
      exitCode: 0, // training completed cleanly
      cancelIntentFired: true, // cancel intent fired but lost the race
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('completed');
  });

  // ---------------------------------------------------------------------
  // Additional crash-path coverage (§3.1.3 detection rules table row 4)
  // ---------------------------------------------------------------------

  it('crash path: no cancel intent, no artifacts_written, non-zero exit → crashed', async () => {
    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [],
      exitCode: 1,
      cancelIntentFired: false,
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('crashed');
  });

  it('artifacts_written observed but run.json absent → not "completed" (artifact-on-disk doctrine)', async () => {
    // Race-resilience trip-wire: an artifacts_written event without the
    // run.json on disk MUST NOT classify as completed. This mirrors the
    // F-SP-002 success-path principle generalized to §3.1.3.
    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [artifactsWrittenEvent()],
      exitCode: 1,
      cancelIntentFired: true,
    };
    const state = await detectCancelTerminalState(inputs);
    // Without marker, without event, with cancel intent + non-zero exit
    // → cancelled-forced (the §3.1.3 detector falls through Rule 1 because
    // run.json is absent).
    expect(state).toBe('cancelled-forced');
  });

  it('artifacts_written observed AND run.json present, but no cancel intent → completed', async () => {
    // Sanity check: no cancel was fired, training succeeded normally.
    await fs.writeFile(
      path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON),
      JSON.stringify(makeRunJson('r-test')),
      'utf-8'
    );
    const inputs: CancelDetectorInputs = {
      runDir,
      observedEvents: [artifactsWrittenEvent()],
      exitCode: 0,
      cancelIntentFired: false,
    };
    const state = await detectCancelTerminalState(inputs);
    expect(state).toBe('completed');
  });
});
