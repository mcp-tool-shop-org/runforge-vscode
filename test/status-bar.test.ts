/**
 * Status-bar tests (Wave 3a — FE F-002).
 *
 * Throttle contract: bursts within the 200ms window AND the same epoch
 * collapse to a single update; epoch transitions and elapsed-window updates
 * always paint.
 *
 * State-machine: hidden by default, training during run, success-flash on
 * completion, hidden on cancel/failure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  createStatusBarItemMock,
  itemShowMock,
  itemHideMock,
  itemDisposeMock,
  itemTextRef,
  itemCommandRef,
  itemTooltipRef,
} = vi.hoisted(() => {
  const text = { current: '' };
  const cmd = { current: '' };
  const tooltip = { current: '' };
  const showMock = vi.fn(() => {});
  const hideMock = vi.fn(() => {});
  const disposeMock = vi.fn(() => {});
  const item = {
    name: '',
    set text(v: string) { text.current = v; },
    get text() { return text.current; },
    set command(v: string) { cmd.current = v; },
    get command() { return cmd.current; },
    set tooltip(v: string) { tooltip.current = v; },
    get tooltip() { return tooltip.current; },
    show: showMock,
    hide: hideMock,
    dispose: disposeMock,
  };
  return {
    createStatusBarItemMock: vi.fn(() => item),
    itemShowMock: showMock,
    itemHideMock: hideMock,
    itemDisposeMock: disposeMock,
    itemTextRef: text,
    itemCommandRef: cmd,
    itemTooltipRef: tooltip,
  };
});

vi.mock('vscode', () => ({
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    createStatusBarItem: createStatusBarItemMock,
  },
}));

import { RunForgeStatusBar } from '../src/status-bar.js';
import { EventStreamConsumer } from '../src/observability/event-stream-consumer.js';

const baseTrainProgress = (epoch: number, total = 10) =>
  JSON.stringify({
    event: 'train_progress',
    timestamp: '2026-04-25T00:00:00Z',
    run_id: 'r1',
    epoch,
    total_epochs: total,
  });

describe('RunForgeStatusBar — Wave 3a (FE F-002)', () => {
  let bar: RunForgeStatusBar;
  let consumer: EventStreamConsumer;

  beforeEach(() => {
    vi.useFakeTimers();
    createStatusBarItemMock.mockClear();
    itemShowMock.mockClear();
    itemHideMock.mockClear();
    itemDisposeMock.mockClear();
    itemTextRef.current = '';
    itemCommandRef.current = '';
    itemTooltipRef.current = '';

    bar = new RunForgeStatusBar();
    consumer = new EventStreamConsumer();
  });

  afterEach(() => {
    bar.dispose();
    vi.useRealTimers();
  });

  it('creates a right-aligned StatusBarItem with priority 100', () => {
    expect(createStatusBarItemMock).toHaveBeenCalledTimes(1);
    expect(createStatusBarItemMock).toHaveBeenCalledWith(2, 100);
  });

  it('is hidden until attached to a run + first event arrives', () => {
    expect(itemShowMock).not.toHaveBeenCalled();
  });

  it('paints "RunForge: Epoch N/M" on first train_progress event', () => {
    bar.attachToRun(consumer);
    consumer.push(baseTrainProgress(1, 10));

    expect(itemTextRef.current).toContain('RunForge: Epoch 1/10');
    expect(itemCommandRef.current).toBe('runforge.cancelActiveRun');
    expect(itemShowMock).toHaveBeenCalled();
  });

  it('throttles bursts within the 200ms window and same epoch (no repaint)', () => {
    bar.attachToRun(consumer);
    consumer.push(baseTrainProgress(1, 10)); // initial paint
    const showCount = itemShowMock.mock.calls.length;

    // 5 duplicate events in the same epoch within 50ms — all throttled.
    vi.setSystemTime(new Date('2026-04-25T00:00:00.050Z'));
    consumer.push(baseTrainProgress(1, 10));
    consumer.push(baseTrainProgress(1, 10));
    consumer.push(baseTrainProgress(1, 10));
    consumer.push(baseTrainProgress(1, 10));
    consumer.push(baseTrainProgress(1, 10));

    expect(itemShowMock.mock.calls.length).toBe(showCount);
  });

  it('repaints when epoch advances even within throttle window', () => {
    bar.attachToRun(consumer);
    consumer.push(baseTrainProgress(1, 10));
    const showCount = itemShowMock.mock.calls.length;

    vi.setSystemTime(new Date('2026-04-25T00:00:00.010Z')); // 10ms later
    consumer.push(baseTrainProgress(2, 10));

    expect(itemShowMock.mock.calls.length).toBeGreaterThan(showCount);
    expect(itemTextRef.current).toContain('Epoch 2/10');
  });

  it('repaints when throttle window elapses even on same epoch', () => {
    bar.attachToRun(consumer);
    vi.setSystemTime(new Date('2026-04-25T00:00:00.000Z'));
    consumer.push(baseTrainProgress(1, 10));
    const showCount = itemShowMock.mock.calls.length;

    vi.setSystemTime(new Date('2026-04-25T00:00:00.250Z')); // 250ms later
    consumer.push(baseTrainProgress(1, 10));

    expect(itemShowMock.mock.calls.length).toBeGreaterThan(showCount);
  });

  it('markFinished paints success flash and clears after ~2s', () => {
    bar.attachToRun(consumer);
    consumer.push(baseTrainProgress(1, 10));

    bar.markFinished('run-abc123');
    expect(itemTextRef.current).toContain('RunForge: run-abc123');
    expect(itemCommandRef.current).toBe('runforge.browseRuns');
    expect(itemHideMock).not.toHaveBeenCalled();

    // Advance timers past the success-flash window.
    vi.advanceTimersByTime(2100);
    expect(itemHideMock).toHaveBeenCalled();
  });

  it('markEnded hides immediately without a flash', () => {
    bar.attachToRun(consumer);
    consumer.push(baseTrainProgress(1, 10));

    bar.markEnded();
    expect(itemHideMock).toHaveBeenCalled();
  });

  it('detach + reattach resets per-run throttle state', () => {
    bar.attachToRun(consumer);
    vi.setSystemTime(new Date('2026-04-25T00:00:00.000Z'));
    consumer.push(baseTrainProgress(5, 10));

    bar.markEnded();

    // New run with a different consumer.
    const consumer2 = new EventStreamConsumer();
    bar.attachToRun(consumer2);
    const showCount = itemShowMock.mock.calls.length;

    // First event of new run paints even though wall-clock didn't advance,
    // because lastUpdateMs reset.
    consumer2.push(baseTrainProgress(1, 5));
    expect(itemShowMock.mock.calls.length).toBeGreaterThan(showCount);
    expect(itemTextRef.current).toContain('Epoch 1/5');
  });

  it('dispose releases the StatusBarItem', () => {
    bar.dispose();
    expect(itemDisposeMock).toHaveBeenCalled();
  });
});
