/**
 * Event-stream consumer (FT-BACK-001 / Phase 4 Wave 2).
 *
 * Parses the Python ml_runner's structured stderr JSONL stream into typed
 * events. Mirrors `python/ml_runner/contracts/events.schema.v1.json` (FROZEN
 * at v1.0.0). Non-JSONL stderr lines (free-form logs, tracebacks) are
 * preserved as `LogLine`-shaped values rather than thrown away — this lets
 * the run-manager continue to mirror them to the OutputChannel.
 *
 * Doctrine notes (docs/CONTRACTS.md):
 *  - Rule 1/3: every event type imports its discriminator constant via
 *    `EVENT_TYPES`. No literal duplication of `'run_cancelled'` etc.
 *  - Rule 4: shapes mirror events.schema.v1 exactly. Drift between Python
 *    and TS shows up at runtime as `'unrecognized'` events in the skip
 *    channel, not as silent corruption.
 *  - Rule 5: tests invoke the production parser (`parseEventLine`) directly,
 *    not a stubbed mirror.
 *
 * Source-of-truth doctrine (CONTRACT-PHASE-4.md §3.1.3): the consumer
 * exposes a `wasObserved(eventType)` query so the cancel state-machine can
 * consult the event ledger as evidence — separate from process-exit timing.
 */

/** The 9 event types discriminated by the `event` field. */
export const EVENT_TYPES = {
  RUN_START: 'run_start',
  DATASET_LOADED: 'dataset_loaded',
  TRAIN_STARTED: 'train_started',
  TRAIN_PROGRESS: 'train_progress',
  TRAIN_FINISHED: 'train_finished',
  METRICS_COMPUTED: 'metrics_computed',
  ARTIFACTS_WRITTEN: 'artifacts_written',
  CANCELLING: 'cancelling',
  RUN_CANCELLED: 'run_cancelled',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

/** Step values that pair across cancelling/run_cancelled and IndexCancelledMarker. */
export type CancelStep =
  | 'dataset_loading'
  | 'training'
  | 'metrics_computation'
  | 'artifact_writing'
  | 'shutdown';

/** Base shape — every event carries `event` + `timestamp`. */
interface BaseEvent {
  event: EventType;
  timestamp: string;
  run_id?: string;
}

export interface RunStartEvent extends BaseEvent {
  event: 'run_start';
  run_id: string;
  preset_id: 'std-train' | 'hq-train';
  model_family: 'logistic_regression' | 'random_forest' | 'linear_svc';
  out_dir?: string;
}

export interface DatasetLoadedEvent extends BaseEvent {
  event: 'dataset_loaded';
  run_id: string;
  num_samples: number;
  num_features: number;
  rows_dropped: number;
  label_column?: string;
  dataset_fingerprint_sha256?: string;
}

export interface TrainStartedEvent extends BaseEvent {
  event: 'train_started';
  run_id: string;
  model_family: string;
}

export interface TrainProgressEvent extends BaseEvent {
  event: 'train_progress';
  run_id: string;
  epoch: number;
  total_epochs: number;
  loss?: number;
  val_accuracy?: number;
}

export interface TrainFinishedEvent extends BaseEvent {
  event: 'train_finished';
  run_id: string;
  duration_seconds?: number;
}

export interface MetricsComputedEvent extends BaseEvent {
  event: 'metrics_computed';
  run_id: string;
  metrics_profile: string;
  accuracy?: number;
}

export interface ArtifactsWrittenEvent extends BaseEvent {
  event: 'artifacts_written';
  run_id: string;
  artifact_count: number;
  run_dir?: string;
}

export interface CancellingEvent extends BaseEvent {
  event: 'cancelling';
  run_id: string;
  seconds_remaining: number;
  step?: CancelStep;
}

export interface RunCancelledEvent extends BaseEvent {
  event: 'run_cancelled';
  run_id: string;
  step: CancelStep;
  reason?: string;
  graceful?: true;
}

/** Discriminated union of every parsed event. */
export type ParsedEvent =
  | RunStartEvent
  | DatasetLoadedEvent
  | TrainStartedEvent
  | TrainProgressEvent
  | TrainFinishedEvent
  | MetricsComputedEvent
  | ArtifactsWrittenEvent
  | CancellingEvent
  | RunCancelledEvent;

/** A non-event stderr line — keep for OutputChannel mirroring. */
export interface LogLine {
  kind: 'log';
  text: string;
}

/** An event-shaped line that failed schema validation. */
export interface SkippedEvent {
  kind: 'skipped';
  text: string;
  reason: 'INVALID_JSON' | 'INVALID_SHAPE' | 'UNKNOWN_EVENT_TYPE';
  detail: string;
}

/** Wrapper for a successfully-parsed event. */
export interface ParsedEventEnvelope {
  kind: 'event';
  event: ParsedEvent;
}

export type LineParseResult = ParsedEventEnvelope | LogLine | SkippedEvent;

const CANCEL_STEPS: ReadonlySet<string> = new Set([
  'dataset_loading',
  'training',
  'metrics_computation',
  'artifact_writing',
  'shutdown',
]);

const PRESET_IDS: ReadonlySet<string> = new Set(['std-train', 'hq-train']);
const MODEL_FAMILIES: ReadonlySet<string> = new Set([
  'logistic_regression',
  'random_forest',
  'linear_svc',
]);

function hasShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Internal sentinel type for validation failures — distinct from any event shape. */
interface ValidationFailure {
  __failed: true;
  reason: SkippedEvent['reason'];
  detail: string;
}

function fail(reason: SkippedEvent['reason'], detail: string): ValidationFailure {
  return { __failed: true, reason, detail };
}

/**
 * Type-guard each of the 9 events against events.schema.v1.
 *
 * Defensive: any future drift between Python and TS shows up as a structured
 * skip with `reason: 'INVALID_SHAPE'` rather than a thrown exception.
 */
function validate(value: Record<string, unknown>): ParsedEvent | ValidationFailure {
  if (!isStr(value.event)) {
    return fail('INVALID_SHAPE', 'missing or non-string `event`');
  }
  if (!isStr(value.timestamp)) {
    return fail('INVALID_SHAPE', 'missing or non-string `timestamp`');
  }

  const eventType = value.event;

  switch (eventType) {
    case EVENT_TYPES.RUN_START: {
      if (!isStr(value.run_id) || value.run_id.length === 0)
        return fail('INVALID_SHAPE', 'run_start: missing run_id');
      if (!isStr(value.preset_id) || !PRESET_IDS.has(value.preset_id))
        return fail('INVALID_SHAPE', 'run_start: invalid preset_id');
      if (!isStr(value.model_family) || !MODEL_FAMILIES.has(value.model_family))
        return fail('INVALID_SHAPE', 'run_start: invalid model_family');
      if (value.out_dir !== undefined && !isStr(value.out_dir))
        return fail('INVALID_SHAPE', 'run_start: out_dir must be string');
      return value as unknown as RunStartEvent;
    }
    case EVENT_TYPES.DATASET_LOADED: {
      if (!isStr(value.run_id))
        return fail('INVALID_SHAPE', 'dataset_loaded: missing run_id');
      if (!isInt(value.num_samples) || (value.num_samples as number) < 0)
        return fail('INVALID_SHAPE', 'dataset_loaded: invalid num_samples');
      if (!isInt(value.num_features) || (value.num_features as number) < 0)
        return fail('INVALID_SHAPE', 'dataset_loaded: invalid num_features');
      if (!isInt(value.rows_dropped) || (value.rows_dropped as number) < 0)
        return fail('INVALID_SHAPE', 'dataset_loaded: invalid rows_dropped');
      if (value.label_column !== undefined && !isStr(value.label_column))
        return fail('INVALID_SHAPE', 'dataset_loaded: label_column must be string');
      if (value.dataset_fingerprint_sha256 !== undefined && !isStr(value.dataset_fingerprint_sha256))
        return fail('INVALID_SHAPE', 'dataset_loaded: dataset_fingerprint_sha256 must be string');
      return value as unknown as DatasetLoadedEvent;
    }
    case EVENT_TYPES.TRAIN_STARTED: {
      if (!isStr(value.run_id))
        return fail('INVALID_SHAPE', 'train_started: missing run_id');
      if (!isStr(value.model_family))
        return fail('INVALID_SHAPE', 'train_started: missing model_family');
      return value as unknown as TrainStartedEvent;
    }
    case EVENT_TYPES.TRAIN_PROGRESS: {
      if (!isStr(value.run_id))
        return fail('INVALID_SHAPE', 'train_progress: missing run_id');
      if (!isInt(value.epoch) || (value.epoch as number) < 0)
        return fail('INVALID_SHAPE', 'train_progress: invalid epoch');
      if (!isInt(value.total_epochs) || (value.total_epochs as number) < 1)
        return fail('INVALID_SHAPE', 'train_progress: invalid total_epochs');
      if (value.loss !== undefined && !isNum(value.loss))
        return fail('INVALID_SHAPE', 'train_progress: loss must be number');
      if (value.val_accuracy !== undefined && !isNum(value.val_accuracy))
        return fail('INVALID_SHAPE', 'train_progress: val_accuracy must be number');
      return value as unknown as TrainProgressEvent;
    }
    case EVENT_TYPES.TRAIN_FINISHED: {
      if (!isStr(value.run_id))
        return fail('INVALID_SHAPE', 'train_finished: missing run_id');
      if (value.duration_seconds !== undefined && !isNum(value.duration_seconds))
        return fail('INVALID_SHAPE', 'train_finished: duration_seconds must be number');
      return value as unknown as TrainFinishedEvent;
    }
    case EVENT_TYPES.METRICS_COMPUTED: {
      if (!isStr(value.run_id))
        return fail('INVALID_SHAPE', 'metrics_computed: missing run_id');
      if (!isStr(value.metrics_profile))
        return fail('INVALID_SHAPE', 'metrics_computed: missing metrics_profile');
      if (value.accuracy !== undefined && !isNum(value.accuracy))
        return fail('INVALID_SHAPE', 'metrics_computed: accuracy must be number');
      return value as unknown as MetricsComputedEvent;
    }
    case EVENT_TYPES.ARTIFACTS_WRITTEN: {
      if (!isStr(value.run_id))
        return fail('INVALID_SHAPE', 'artifacts_written: missing run_id');
      if (!isInt(value.artifact_count) || (value.artifact_count as number) < 1)
        return fail('INVALID_SHAPE', 'artifacts_written: invalid artifact_count');
      if (value.run_dir !== undefined && !isStr(value.run_dir))
        return fail('INVALID_SHAPE', 'artifacts_written: run_dir must be string');
      return value as unknown as ArtifactsWrittenEvent;
    }
    case EVENT_TYPES.CANCELLING: {
      if (!isStr(value.run_id))
        return fail('INVALID_SHAPE', 'cancelling: missing run_id');
      if (!isInt(value.seconds_remaining) || (value.seconds_remaining as number) < 0 || (value.seconds_remaining as number) > 60)
        return fail('INVALID_SHAPE', 'cancelling: invalid seconds_remaining');
      if (value.step !== undefined && (!isStr(value.step) || !CANCEL_STEPS.has(value.step)))
        return fail('INVALID_SHAPE', 'cancelling: invalid step');
      return value as unknown as CancellingEvent;
    }
    case EVENT_TYPES.RUN_CANCELLED: {
      if (!isStr(value.run_id))
        return fail('INVALID_SHAPE', 'run_cancelled: missing run_id');
      if (!isStr(value.step) || !CANCEL_STEPS.has(value.step))
        return fail('INVALID_SHAPE', 'run_cancelled: invalid step');
      if (value.reason !== undefined && !isStr(value.reason))
        return fail('INVALID_SHAPE', 'run_cancelled: reason must be string');
      if (value.graceful !== undefined && value.graceful !== true)
        return fail('INVALID_SHAPE', 'run_cancelled: graceful must be true if present');
      return value as unknown as RunCancelledEvent;
    }
    default:
      return fail('UNKNOWN_EVENT_TYPE', `unrecognized event type: ${eventType}`);
  }
}

/**
 * Parse a single stderr line.
 *
 * Strategy:
 *  - non-JSON or non-object content → `LogLine` (preserve for OutputChannel).
 *  - JSON object with no `event` field → `LogLine` (e.g. structured log shim).
 *  - JSON object with `event` field → validate against schema; pass on ok,
 *    skip with `INVALID_SHAPE` / `UNKNOWN_EVENT_TYPE` on fail.
 *
 * Single-line input only — caller (run-manager) is responsible for split
 * buffering on '\n', mirroring python-runner.ts:180.
 */
export function parseEventLine(line: string): LineParseResult {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { kind: 'log', text: line };
  }

  // Cheap pre-filter: only attempt JSON.parse when line plausibly starts an
  // object. Free-form tracebacks ("Traceback (most recent call last):") and
  // sklearn deprecation warnings should never enter the JSON path.
  if (trimmed[0] !== '{') {
    return { kind: 'log', text: line };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: 'log', text: line };
  }

  if (!hasShape(parsed)) {
    return { kind: 'log', text: line };
  }

  // Object that lacks an `event` discriminator → structured log line, not
  // an event. Preserve so the OutputChannel can render it.
  if (!isStr((parsed as Record<string, unknown>).event)) {
    return { kind: 'log', text: line };
  }

  const validated = validate(parsed as Record<string, unknown>);
  if ('__failed' in validated && validated.__failed === true) {
    return { kind: 'skipped', text: line, reason: validated.reason, detail: validated.detail };
  }

  return { kind: 'event', event: validated as ParsedEvent };
}

/**
 * Stateful consumer wrapping `parseEventLine`. Used by the run-manager to:
 *   1. Mirror events to subscribers (callback pattern).
 *   2. Accumulate the observed-events ledger for the §3.1.3 detector.
 *   3. Report invalid-shape skips to the SafeError-style sink (debug log).
 *
 * Single-instance per run; reset between runs.
 */
export class EventStreamConsumer {
  private observed: ParsedEvent[] = [];
  private skipped: SkippedEvent[] = [];
  private subscribers: Array<(e: ParsedEvent) => void> = [];

  /** Feed a stderr line. Returns the parse outcome for caller-side handling. */
  push(line: string): LineParseResult {
    const result = parseEventLine(line);
    if (result.kind === 'event') {
      this.observed.push(result.event);
      for (const cb of this.subscribers) {
        try {
          cb(result.event);
        } catch {
          // Subscriber faults must not break the stream — Bridge contract.
        }
      }
    } else if (result.kind === 'skipped') {
      this.skipped.push(result);
    }
    return result;
  }

  /** Subscribe to events. Returns an unsubscribe function. */
  subscribe(cb: (e: ParsedEvent) => void): () => void {
    this.subscribers.push(cb);
    return () => {
      const idx = this.subscribers.indexOf(cb);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  /** Snapshot of all events observed so far (in order). */
  snapshot(): ReadonlyArray<ParsedEvent> {
    return this.observed.slice();
  }

  /** Snapshot of all skip diagnostics so far (in order). */
  skippedSnapshot(): ReadonlyArray<SkippedEvent> {
    return this.skipped.slice();
  }

  /**
   * §3.1.3 query: "was an event of this type observed during the run?"
   * The state-machine detector calls this for `run_cancelled` and
   * `artifacts_written` to determine terminal state alongside marker
   * presence on disk.
   */
  wasObserved(eventType: EventType): boolean {
    return this.observed.some((e) => e.event === eventType);
  }

  /** Clear all state — call between reuses (rarely needed). */
  reset(): void {
    this.observed = [];
    this.skipped = [];
    // Subscribers persist intentionally: a long-lived UI surface may want to
    // listen across runs. Caller must explicitly remove subscribers if
    // needed.
  }
}
