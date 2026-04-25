/**
 * Tests for `src/observability/event-stream-consumer.ts` (FT-BACK-001 / Phase 4 Wave 2).
 *
 * Doctrine notes (docs/CONTRACTS.md):
 *  - Rule 5: tests invoke the production parser (`parseEventLine` /
 *    `EventStreamConsumer.push`) directly. No stubbed mirror in test code.
 *  - Rule 4: every event type from events.schema.v1 is covered (9 happy paths).
 *  - Tolerance: invalid JSON / malformed events are surfaced as structured
 *    skips, not thrown.
 */

import { describe, it, expect } from 'vitest';
import {
  parseEventLine,
  EventStreamConsumer,
  EVENT_TYPES,
  type ParsedEvent,
  type RunCancelledEvent,
  type CancellingEvent,
  type ArtifactsWrittenEvent,
} from '../src/observability/event-stream-consumer.js';

const ts = '2026-04-25T12:00:00Z';

describe('parseEventLine — log lines (non-event stderr)', () => {
  it('treats empty string as log line', () => {
    const r = parseEventLine('');
    expect(r.kind).toBe('log');
  });

  it('treats whitespace-only line as log line', () => {
    const r = parseEventLine('   \t  ');
    expect(r.kind).toBe('log');
  });

  it('treats non-JSON line as log line (Python traceback)', () => {
    const r = parseEventLine('Traceback (most recent call last):');
    expect(r.kind).toBe('log');
  });

  it('treats invalid JSON object-start as log line', () => {
    const r = parseEventLine('{not valid json at all');
    expect(r.kind).toBe('log');
  });

  it('treats JSON array as log line (not an event object)', () => {
    const r = parseEventLine('[1, 2, 3]');
    expect(r.kind).toBe('log');
  });

  it('treats JSON object without event field as log line', () => {
    const r = parseEventLine('{"level": "info", "msg": "hello"}');
    expect(r.kind).toBe('log');
  });

  it('treats sklearn deprecation warning as log line', () => {
    const r = parseEventLine('FutureWarning: The default value of foo is deprecated');
    expect(r.kind).toBe('log');
  });
});

describe('parseEventLine — happy path for all 9 event types', () => {
  it('parses run_start', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'run_start',
      timestamp: ts,
      run_id: 'r1',
      preset_id: 'std-train',
      model_family: 'logistic_regression',
    }));
    expect(r.kind).toBe('event');
    if (r.kind !== 'event') return;
    expect(r.event.event).toBe(EVENT_TYPES.RUN_START);
  });

  it('parses dataset_loaded', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'dataset_loaded',
      timestamp: ts,
      run_id: 'r1',
      num_samples: 100,
      num_features: 4,
      rows_dropped: 0,
    }));
    expect(r.kind).toBe('event');
    if (r.kind !== 'event') return;
    expect(r.event.event).toBe(EVENT_TYPES.DATASET_LOADED);
  });

  it('parses train_started', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'train_started',
      timestamp: ts,
      run_id: 'r1',
      model_family: 'random_forest',
    }));
    expect(r.kind).toBe('event');
  });

  it('parses train_progress', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'train_progress',
      timestamp: ts,
      run_id: 'r1',
      epoch: 3,
      total_epochs: 10,
      loss: 0.42,
    }));
    expect(r.kind).toBe('event');
  });

  it('parses train_finished', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'train_finished',
      timestamp: ts,
      run_id: 'r1',
      duration_seconds: 1.25,
    }));
    expect(r.kind).toBe('event');
  });

  it('parses metrics_computed', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'metrics_computed',
      timestamp: ts,
      run_id: 'r1',
      metrics_profile: 'classification.base.v1',
      accuracy: 0.95,
    }));
    expect(r.kind).toBe('event');
  });

  it('parses artifacts_written', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'artifacts_written',
      timestamp: ts,
      run_id: 'r1',
      artifact_count: 5,
      run_dir: '.ml/runs/r1',
    }));
    expect(r.kind).toBe('event');
    if (r.kind !== 'event') return;
    const ev = r.event as ArtifactsWrittenEvent;
    expect(ev.artifact_count).toBe(5);
  });

  it('parses cancelling with countdown', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'cancelling',
      timestamp: ts,
      run_id: 'r1',
      seconds_remaining: 3,
      step: 'training',
    }));
    expect(r.kind).toBe('event');
    if (r.kind !== 'event') return;
    const ev = r.event as CancellingEvent;
    expect(ev.seconds_remaining).toBe(3);
  });

  it('parses run_cancelled', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'run_cancelled',
      timestamp: ts,
      run_id: 'r1',
      step: 'training',
      reason: 'user cancelled via VS Code progress UI',
      graceful: true,
    }));
    expect(r.kind).toBe('event');
    if (r.kind !== 'event') return;
    const ev = r.event as RunCancelledEvent;
    expect(ev.step).toBe('training');
  });
});

describe('parseEventLine — invalid-shape skips', () => {
  it('skips run_start missing run_id', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'run_start',
      timestamp: ts,
      preset_id: 'std-train',
      model_family: 'logistic_regression',
    }));
    expect(r.kind).toBe('skipped');
    if (r.kind !== 'skipped') return;
    expect(r.reason).toBe('INVALID_SHAPE');
    expect(r.detail).toContain('run_start');
  });

  it('skips run_start with invalid preset_id enum', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'run_start',
      timestamp: ts,
      run_id: 'r1',
      preset_id: 'wat-train',
      model_family: 'logistic_regression',
    }));
    expect(r.kind).toBe('skipped');
  });

  it('skips cancelling with negative seconds_remaining', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'cancelling',
      timestamp: ts,
      run_id: 'r1',
      seconds_remaining: -1,
    }));
    expect(r.kind).toBe('skipped');
  });

  it('skips run_cancelled with invalid step enum', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'run_cancelled',
      timestamp: ts,
      run_id: 'r1',
      step: 'bogus_step',
    }));
    expect(r.kind).toBe('skipped');
  });

  it('skips event missing required timestamp', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'run_start',
      run_id: 'r1',
      preset_id: 'std-train',
      model_family: 'logistic_regression',
    }));
    expect(r.kind).toBe('skipped');
  });

  it('skips unknown event type with UNKNOWN_EVENT_TYPE reason', () => {
    const r = parseEventLine(JSON.stringify({
      event: 'future_event_type_v2',
      timestamp: ts,
      run_id: 'r1',
    }));
    expect(r.kind).toBe('skipped');
    if (r.kind !== 'skipped') return;
    expect(r.reason).toBe('UNKNOWN_EVENT_TYPE');
  });
});

describe('EventStreamConsumer', () => {
  it('accumulates events in the order they arrive', () => {
    const c = new EventStreamConsumer();
    c.push(JSON.stringify({ event: 'run_start', timestamp: ts, run_id: 'r1', preset_id: 'std-train', model_family: 'logistic_regression' }));
    c.push('Free-form Python warning that is not an event');
    c.push(JSON.stringify({ event: 'train_started', timestamp: ts, run_id: 'r1', model_family: 'logistic_regression' }));
    c.push(JSON.stringify({ event: 'train_finished', timestamp: ts, run_id: 'r1' }));

    const snap = c.snapshot();
    expect(snap.map((e) => e.event)).toEqual(['run_start', 'train_started', 'train_finished']);
  });

  it('wasObserved returns true once the event lands', () => {
    const c = new EventStreamConsumer();
    expect(c.wasObserved(EVENT_TYPES.RUN_CANCELLED)).toBe(false);

    c.push(JSON.stringify({
      event: 'run_cancelled',
      timestamp: ts,
      run_id: 'r1',
      step: 'training',
    }));
    expect(c.wasObserved(EVENT_TYPES.RUN_CANCELLED)).toBe(true);
    expect(c.wasObserved(EVENT_TYPES.ARTIFACTS_WRITTEN)).toBe(false);
  });

  it('subscriber callback fires for valid events only', () => {
    const c = new EventStreamConsumer();
    const seen: ParsedEvent[] = [];
    const unsub = c.subscribe((e) => seen.push(e));

    c.push(JSON.stringify({ event: 'run_start', timestamp: ts, run_id: 'r1', preset_id: 'std-train', model_family: 'logistic_regression' }));
    c.push('non-event log line'); // log — no callback
    c.push(JSON.stringify({ event: 'wat', timestamp: ts })); // skipped — no callback
    c.push(JSON.stringify({ event: 'train_finished', timestamp: ts, run_id: 'r1' }));

    expect(seen.map((e) => e.event)).toEqual(['run_start', 'train_finished']);

    unsub();
    c.push(JSON.stringify({ event: 'run_start', timestamp: ts, run_id: 'r2', preset_id: 'std-train', model_family: 'logistic_regression' }));
    expect(seen).toHaveLength(2); // unsub took effect
  });

  it('subscriber faults do not break the stream — Bridge contract', () => {
    const c = new EventStreamConsumer();
    c.subscribe(() => {
      throw new Error('subscriber-side bug');
    });
    // Must not throw
    expect(() =>
      c.push(JSON.stringify({ event: 'run_start', timestamp: ts, run_id: 'r1', preset_id: 'std-train', model_family: 'logistic_regression' }))
    ).not.toThrow();
    // Event still landed in the ledger.
    expect(c.snapshot()).toHaveLength(1);
  });

  it('skippedSnapshot captures invalid-shape events for diagnostic surfacing', () => {
    const c = new EventStreamConsumer();
    c.push(JSON.stringify({ event: 'run_start', timestamp: ts })); // missing required fields
    c.push('plain log line — not skipped, just log');
    c.push(JSON.stringify({ event: 'unknown_v9', timestamp: ts }));
    expect(c.skippedSnapshot()).toHaveLength(2);
    expect(c.skippedSnapshot()[0].reason).toBe('INVALID_SHAPE');
    expect(c.skippedSnapshot()[1].reason).toBe('UNKNOWN_EVENT_TYPE');
  });
});
