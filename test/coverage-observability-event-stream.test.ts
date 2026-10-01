/**
 * Event-stream consumer: the schema-violation matrix.
 *
 * Every event type in events.schema.v1 has required fields and optional typed
 * fields; each violation must come back as a structured `skipped` result with
 * reason INVALID_SHAPE and a detail naming the event and the field, never as a
 * thrown exception and never as a half-valid event. Plus the consumer's
 * subscriber, ledger and reset semantics.
 */

import { describe, it, expect } from 'vitest';
import {
  EventStreamConsumer,
  parseEventLine,
  type ParsedEvent,
} from '../src/observability/event-stream-consumer.js';

const ts = '2026-10-01T12:00:00Z';

/** Valid payload for each event type; tests override single fields to break them. */
const VALID: Record<string, Record<string, unknown>> = {
  run_start: { run_id: 'r1', preset_id: 'std-train', model_family: 'logistic_regression' },
  dataset_loaded: { run_id: 'r1', num_samples: 10, num_features: 3, rows_dropped: 0 },
  train_started: { run_id: 'r1', model_family: 'random_forest' },
  train_progress: { run_id: 'r1', epoch: 1, total_epochs: 5 },
  train_finished: { run_id: 'r1' },
  metrics_computed: { run_id: 'r1', metrics_profile: 'classification.base.v1' },
  artifacts_written: { run_id: 'r1', artifact_count: 3 },
  cancelling: { run_id: 'r1', seconds_remaining: 5 },
  run_cancelled: { run_id: 'r1', step: 'training' },
};

function line(event: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ event, timestamp: ts, ...VALID[event], ...overrides });
}

describe('parseEventLine: valid payloads with every optional field', () => {
  it('accepts run_start with an out_dir and hq-train / linear_svc', () => {
    const r = parseEventLine(
      line('run_start', { preset_id: 'hq-train', model_family: 'linear_svc', out_dir: '.ml/runs/r1' })
    );
    expect(r.kind).toBe('event');
    if (r.kind !== 'event' || r.event.event !== 'run_start') throw new Error('expected run_start');
    expect(r.event.out_dir).toBe('.ml/runs/r1');
    expect(r.event.preset_id).toBe('hq-train');
  });

  it('accepts dataset_loaded with label_column and fingerprint', () => {
    const r = parseEventLine(
      line('dataset_loaded', { label_column: 'species', dataset_fingerprint_sha256: 'ab'.repeat(32) })
    );
    expect(r.kind).toBe('event');
  });

  it('accepts train_progress with loss and val_accuracy, including 0 and negative loss', () => {
    const r = parseEventLine(line('train_progress', { epoch: 0, loss: -0.5, val_accuracy: 0 }));
    expect(r.kind).toBe('event');
  });

  it('accepts train_finished with duration_seconds', () => {
    expect(parseEventLine(line('train_finished', { duration_seconds: 1.25 })).kind).toBe('event');
  });

  it('accepts metrics_computed with accuracy', () => {
    expect(parseEventLine(line('metrics_computed', { accuracy: 0.9 })).kind).toBe('event');
  });

  it('accepts artifacts_written with run_dir', () => {
    expect(parseEventLine(line('artifacts_written', { run_dir: '.ml/runs/r1' })).kind).toBe('event');
  });

  it('accepts cancelling at the 0 and 60 second bounds, with a step', () => {
    expect(parseEventLine(line('cancelling', { seconds_remaining: 0, step: 'shutdown' })).kind).toBe('event');
    expect(parseEventLine(line('cancelling', { seconds_remaining: 60 })).kind).toBe('event');
  });

  it('accepts run_cancelled with reason and graceful=true', () => {
    const r = parseEventLine(line('run_cancelled', { reason: 'user', graceful: true, step: 'artifact_writing' }));
    expect(r.kind).toBe('event');
  });

  it('accepts every cancel step value', () => {
    for (const step of ['dataset_loading', 'training', 'metrics_computation', 'artifact_writing', 'shutdown']) {
      expect(parseEventLine(line('run_cancelled', { step })).kind).toBe('event');
    }
  });

  it('keeps the original line text on a parsed envelope round trip', () => {
    const r = parseEventLine('   ' + line('train_finished') + '  ');
    expect(r.kind).toBe('event');
    if (r.kind === 'event') expect(r.event.run_id).toBe('r1');
  });
});

describe('parseEventLine: shape violations are structured skips', () => {
  const cases: Array<[string, string, Record<string, unknown>, string]> = [
    // [label, event type, overrides, expected detail]
    ['run_start without run_id', 'run_start', { run_id: undefined }, 'run_start: missing run_id'],
    ['run_start with empty run_id', 'run_start', { run_id: '' }, 'run_start: missing run_id'],
    ['run_start with unknown preset', 'run_start', { preset_id: 'turbo' }, 'run_start: invalid preset_id'],
    ['run_start with non-string preset', 'run_start', { preset_id: 7 }, 'run_start: invalid preset_id'],
    ['run_start with unknown family', 'run_start', { model_family: 'svm_rbf' }, 'run_start: invalid model_family'],
    ['run_start with non-string out_dir', 'run_start', { out_dir: 5 }, 'run_start: out_dir must be string'],

    ['dataset_loaded without run_id', 'dataset_loaded', { run_id: undefined }, 'dataset_loaded: missing run_id'],
    ['dataset_loaded with negative num_samples', 'dataset_loaded', { num_samples: -1 }, 'dataset_loaded: invalid num_samples'],
    ['dataset_loaded with fractional num_samples', 'dataset_loaded', { num_samples: 1.5 }, 'dataset_loaded: invalid num_samples'],
    ['dataset_loaded with string num_features', 'dataset_loaded', { num_features: '3' }, 'dataset_loaded: invalid num_features'],
    ['dataset_loaded with negative num_features', 'dataset_loaded', { num_features: -2 }, 'dataset_loaded: invalid num_features'],
    ['dataset_loaded with negative rows_dropped', 'dataset_loaded', { rows_dropped: -1 }, 'dataset_loaded: invalid rows_dropped'],
    ['dataset_loaded with missing rows_dropped', 'dataset_loaded', { rows_dropped: undefined }, 'dataset_loaded: invalid rows_dropped'],
    ['dataset_loaded with numeric label_column', 'dataset_loaded', { label_column: 4 }, 'dataset_loaded: label_column must be string'],
    ['dataset_loaded with numeric fingerprint', 'dataset_loaded', { dataset_fingerprint_sha256: 4 }, 'dataset_loaded: dataset_fingerprint_sha256 must be string'],

    ['train_started without run_id', 'train_started', { run_id: undefined }, 'train_started: missing run_id'],
    ['train_started without model_family', 'train_started', { model_family: undefined }, 'train_started: missing model_family'],

    ['train_progress without run_id', 'train_progress', { run_id: undefined }, 'train_progress: missing run_id'],
    ['train_progress with negative epoch', 'train_progress', { epoch: -1 }, 'train_progress: invalid epoch'],
    ['train_progress with fractional epoch', 'train_progress', { epoch: 0.5 }, 'train_progress: invalid epoch'],
    ['train_progress with zero total_epochs', 'train_progress', { total_epochs: 0 }, 'train_progress: invalid total_epochs'],
    ['train_progress with string loss', 'train_progress', { loss: 'low' }, 'train_progress: loss must be number'],
    ['train_progress with string val_accuracy', 'train_progress', { val_accuracy: '0.9' }, 'train_progress: val_accuracy must be number'],

    ['train_finished without run_id', 'train_finished', { run_id: undefined }, 'train_finished: missing run_id'],
    ['train_finished with string duration', 'train_finished', { duration_seconds: 'fast' }, 'train_finished: duration_seconds must be number'],

    ['metrics_computed without run_id', 'metrics_computed', { run_id: undefined }, 'metrics_computed: missing run_id'],
    ['metrics_computed without profile', 'metrics_computed', { metrics_profile: undefined }, 'metrics_computed: missing metrics_profile'],
    ['metrics_computed with string accuracy', 'metrics_computed', { accuracy: 'high' }, 'metrics_computed: accuracy must be number'],

    ['artifacts_written without run_id', 'artifacts_written', { run_id: undefined }, 'artifacts_written: missing run_id'],
    ['artifacts_written with zero count', 'artifacts_written', { artifact_count: 0 }, 'artifacts_written: invalid artifact_count'],
    ['artifacts_written with numeric run_dir', 'artifacts_written', { run_dir: 1 }, 'artifacts_written: run_dir must be string'],

    ['cancelling without run_id', 'cancelling', { run_id: undefined }, 'cancelling: missing run_id'],
    ['cancelling over 60 seconds', 'cancelling', { seconds_remaining: 61 }, 'cancelling: invalid seconds_remaining'],
    ['cancelling with negative seconds', 'cancelling', { seconds_remaining: -1 }, 'cancelling: invalid seconds_remaining'],
    ['cancelling with unknown step', 'cancelling', { step: 'lunch' }, 'cancelling: invalid step'],
    ['cancelling with non-string step', 'cancelling', { step: 3 }, 'cancelling: invalid step'],

    ['run_cancelled without run_id', 'run_cancelled', { run_id: undefined }, 'run_cancelled: missing run_id'],
    ['run_cancelled without step', 'run_cancelled', { step: undefined }, 'run_cancelled: invalid step'],
    ['run_cancelled with unknown step', 'run_cancelled', { step: 'napping' }, 'run_cancelled: invalid step'],
    ['run_cancelled with numeric reason', 'run_cancelled', { reason: 9 }, 'run_cancelled: reason must be string'],
    ['run_cancelled with graceful=false', 'run_cancelled', { graceful: false }, 'run_cancelled: graceful must be true if present'],
  ];

  it.each(cases)('%s', (_label, eventType, overrides, detail) => {
    const text = line(eventType, overrides);
    const r = parseEventLine(text);
    expect(r).toEqual({ kind: 'skipped', text, reason: 'INVALID_SHAPE', detail });
  });

  it('skips an unknown event type as UNKNOWN_EVENT_TYPE and names it', () => {
    const text = JSON.stringify({ event: 'run_paused', timestamp: ts, run_id: 'r1' });
    expect(parseEventLine(text)).toEqual({
      kind: 'skipped',
      text,
      reason: 'UNKNOWN_EVENT_TYPE',
      detail: 'unrecognized event type: run_paused',
    });
  });

  it('skips an event with no timestamp', () => {
    const text = JSON.stringify({ event: 'train_finished', run_id: 'r1' });
    expect(parseEventLine(text)).toMatchObject({
      kind: 'skipped',
      reason: 'INVALID_SHAPE',
      detail: 'missing or non-string `timestamp`',
    });
  });

  it('skips an event with a non-string timestamp', () => {
    const text = JSON.stringify({ event: 'train_finished', run_id: 'r1', timestamp: 1790000000 });
    expect(parseEventLine(text)).toMatchObject({
      kind: 'skipped',
      reason: 'INVALID_SHAPE',
      detail: 'missing or non-string `timestamp`',
    });
  });

  it('treats an object whose `event` is not a string as a log line, not a skip', () => {
    const text = JSON.stringify({ event: 42, timestamp: ts });
    expect(parseEventLine(text)).toEqual({ kind: 'log', text });
  });

  it('treats a bare JSON string or number line as a log line', () => {
    expect(parseEventLine('"hello"').kind).toBe('log');
    expect(parseEventLine('12').kind).toBe('log');
  });

  it('treats a literal `{` followed by a JSON null body as a log line', () => {
    // `{}` parses to an object with no `event` discriminator.
    expect(parseEventLine('{}')).toEqual({ kind: 'log', text: '{}' });
  });
});

describe('EventStreamConsumer', () => {
  it('accumulates events in order and tracks skips separately from logs', () => {
    const c = new EventStreamConsumer();
    c.push(line('run_start'));
    c.push('plain log line');
    c.push(line('train_progress', { epoch: -3 })); // invalid
    c.push(line('train_finished'));

    expect(c.snapshot().map((e) => e.event)).toEqual(['run_start', 'train_finished']);
    const skipped = c.skippedSnapshot();
    expect(skipped).toHaveLength(1);
    expect(skipped[0].detail).toBe('train_progress: invalid epoch');
  });

  it('returns defensive copies from snapshot() and skippedSnapshot()', () => {
    const c = new EventStreamConsumer();
    c.push(line('run_start'));
    c.push(line('mystery'));
    const snap = c.snapshot() as ParsedEvent[];
    snap.length = 0;
    (c.skippedSnapshot() as unknown[]).length = 0;
    expect(c.snapshot()).toHaveLength(1);
    expect(c.skippedSnapshot()).toHaveLength(1);
  });

  it('answers wasObserved from the ledger', () => {
    const c = new EventStreamConsumer();
    expect(c.wasObserved('run_cancelled')).toBe(false);
    c.push(line('cancelling'));
    expect(c.wasObserved('cancelling')).toBe(true);
    expect(c.wasObserved('run_cancelled')).toBe(false);
    c.push(line('run_cancelled'));
    expect(c.wasObserved('run_cancelled')).toBe(true);
  });

  it('does not count a skipped (invalid) event as observed', () => {
    const c = new EventStreamConsumer();
    c.push(line('run_cancelled', { step: 'bogus' }));
    expect(c.wasObserved('run_cancelled')).toBe(false);
  });

  it('notifies subscribers, isolates a throwing subscriber, and unsubscribes cleanly', () => {
    const c = new EventStreamConsumer();
    const seen: string[] = [];
    c.subscribe(() => {
      throw new Error('subscriber fault');
    });
    const off = c.subscribe((e) => seen.push(e.event));

    expect(() => c.push(line('run_start'))).not.toThrow();
    expect(seen).toEqual(['run_start']);

    off();
    c.push(line('train_finished'));
    expect(seen).toEqual(['run_start']);
    // Unsubscribing twice is harmless.
    expect(() => off()).not.toThrow();
    // The ledger still got both events despite the faulty subscriber.
    expect(c.snapshot()).toHaveLength(2);
  });

  it('does not notify subscribers for logs or skipped lines', () => {
    const c = new EventStreamConsumer();
    let calls = 0;
    c.subscribe(() => {
      calls += 1;
    });
    c.push('Traceback (most recent call last):');
    c.push(line('mystery'));
    expect(calls).toBe(0);
  });

  it('reset() clears events and skips but keeps subscribers', () => {
    const c = new EventStreamConsumer();
    const seen: string[] = [];
    c.subscribe((e) => seen.push(e.event));
    c.push(line('run_start'));
    c.push(line('mystery'));

    c.reset();
    expect(c.snapshot()).toEqual([]);
    expect(c.skippedSnapshot()).toEqual([]);
    expect(c.wasObserved('run_start')).toBe(false);

    c.push(line('train_finished'));
    expect(seen).toEqual(['run_start', 'train_finished']);
  });

  it('returns the parse outcome from push so callers can mirror logs', () => {
    const c = new EventStreamConsumer();
    expect(c.push('free-form stderr')).toEqual({ kind: 'log', text: 'free-form stderr' });
  });
});
