/**
 * Gaps left by status-bar.test.ts and notifications.test.ts:
 *  - the success-flash timer's lifecycle across attach / re-finish / end / dispose
 *  - subscription teardown and which events paint
 *  - the no-action paths of notifyWarning / notifyInfo and dismissed prompts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const item = {
    name: '',
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    item,
    createStatusBarItem: vi.fn(() => item),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    executeCommand: vi.fn(),
  };
});

vi.mock('vscode', () => ({
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    createStatusBarItem: h.createStatusBarItem,
    showErrorMessage: h.showErrorMessage,
    showWarningMessage: h.showWarningMessage,
    showInformationMessage: h.showInformationMessage,
  },
  commands: { executeCommand: h.executeCommand },
}));

import { RunForgeStatusBar } from '../src/status-bar.js';
import { notifyError, notifyWarning, notifyInfo } from '../src/notifications.js';
import type { EventStreamConsumer, ParsedEvent } from '../src/observability/event-stream-consumer.js';

/** A consumer whose listener the test can drive directly, with a spyable unsubscribe. */
function fakeConsumer() {
  let listener: ((e: ParsedEvent) => void) | null = null;
  const unsubscribe = vi.fn();
  const consumer = {
    subscribe: vi.fn((fn: (e: ParsedEvent) => void) => {
      listener = fn;
      return unsubscribe;
    }),
  } as unknown as EventStreamConsumer;
  return {
    consumer,
    unsubscribe,
    emit: (e: unknown) => listener!(e as ParsedEvent),
  };
}

const progress = (epoch: number, total: number) => ({
  event: 'train_progress',
  timestamp: 't',
  epoch,
  total_epochs: total,
});

describe('RunForgeStatusBar - flash timer lifecycle', () => {
  let bar: RunForgeStatusBar;

  beforeEach(() => {
    vi.useFakeTimers();
    for (const m of [h.item.show, h.item.hide, h.item.dispose, h.createStatusBarItem]) m.mockClear();
    h.item.text = '';
    h.item.command = '';
    h.item.tooltip = '';
    bar = new RunForgeStatusBar();
  });

  afterEach(() => {
    bar.dispose();
    vi.useRealTimers();
  });

  it('names the item RunForge and wires it to the cancel command from the start', () => {
    expect(h.item.name).toBe('RunForge');
    expect(h.item.command).toBe('runforge.cancelActiveRun');
  });

  it('a new run cancels a pending success flash, so the old timer cannot hide the new run', () => {
    bar.markFinished('run-1');
    const f = fakeConsumer();
    bar.attachToRun(f.consumer);

    f.emit(progress(1, 4));
    vi.advanceTimersByTime(5000);

    expect(h.item.hide).not.toHaveBeenCalled();
    expect(h.item.text).toBe('$(loading~spin) RunForge: Epoch 1/4');
  });

  it('finishing a second run restarts the 2s flash window for the new run id', () => {
    bar.markFinished('run-a');
    vi.advanceTimersByTime(1500);
    bar.markFinished('run-b');
    expect(h.item.text).toBe('$(check) RunForge: run-b');
    expect(h.item.tooltip).toBe('Training run complete: run-b');

    vi.advanceTimersByTime(1000); // 2.5s after the first, 1s after the second
    expect(h.item.hide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1100);
    expect(h.item.hide).toHaveBeenCalledTimes(1);
  });

  it('markEnded during a flash hides once now and the stale timer never hides again', () => {
    bar.markFinished('run-1');
    bar.markEnded();
    expect(h.item.hide).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(h.item.hide).toHaveBeenCalledTimes(1);
  });

  it('dispose during a flash clears the timer and disposes the item', () => {
    bar.markFinished('run-1');
    bar.dispose();
    expect(h.item.dispose).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(h.item.hide).not.toHaveBeenCalled();
  });
});

describe('RunForgeStatusBar - subscription', () => {
  let bar: RunForgeStatusBar;

  beforeEach(() => {
    vi.useFakeTimers();
    h.item.show.mockClear();
    h.item.hide.mockClear();
    h.item.text = '';
    bar = new RunForgeStatusBar();
  });
  afterEach(() => {
    bar.dispose();
    vi.useRealTimers();
  });

  it('ignores events other than train_progress', () => {
    const f = fakeConsumer();
    bar.attachToRun(f.consumer);
    f.emit({ event: 'run_start', timestamp: 't', run_id: 'r1' });
    f.emit({ event: 'train_finished', timestamp: 't' });
    f.emit({ event: 'artifacts_written', timestamp: 't' });

    expect(h.item.show).not.toHaveBeenCalled();
    expect(h.item.text).toBe('');
  });

  it('re-attaching unsubscribes from the previous consumer first', () => {
    const first = fakeConsumer();
    const second = fakeConsumer();
    bar.attachToRun(first.consumer);
    bar.attachToRun(second.consumer);

    expect(first.unsubscribe).toHaveBeenCalledTimes(1);
    expect(second.unsubscribe).not.toHaveBeenCalled();
  });

  it('markFinished, markEnded and dispose each tear the subscription down', () => {
    const ends: Array<(b: RunForgeStatusBar) => void> = [
      (b) => b.markFinished('r'),
      (b) => b.markEnded(),
      (b) => b.dispose(),
    ];
    for (const end of ends) {
      const local = new RunForgeStatusBar();
      const f = fakeConsumer();
      local.attachToRun(f.consumer);
      end(local);
      expect(f.unsubscribe).toHaveBeenCalledTimes(1);
      local.dispose();
    }
  });

  it('a second detach is a no-op (unsubscribe runs once)', () => {
    const f = fakeConsumer();
    bar.attachToRun(f.consumer);
    bar.detach();
    bar.detach();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('restores the cancel command and tooltip when training resumes after a flash', () => {
    bar.markFinished('r1');
    expect(h.item.command).toBe('runforge.browseRuns');

    const f = fakeConsumer();
    bar.attachToRun(f.consumer);
    f.emit(progress(2, 3));

    expect(h.item.command).toBe('runforge.cancelActiveRun');
    expect(h.item.tooltip).toBe('Click to cancel training');
  });
});

describe('notifications - no-action and dismissed paths', () => {
  beforeEach(() => {
    h.showErrorMessage.mockReset();
    h.showWarningMessage.mockReset();
    h.showInformationMessage.mockReset();
    h.executeCommand.mockReset().mockResolvedValue(undefined);
  });

  it('notifyWarning without actions shows a bare toast and resolves undefined for a dismissal', async () => {
    h.showWarningMessage.mockResolvedValue(undefined);
    await expect(notifyWarning('careful')).resolves.toBeUndefined();
    expect(h.showWarningMessage).toHaveBeenCalledWith('careful');
    expect(h.executeCommand).not.toHaveBeenCalled();
  });

  it('notifyInfo without actions shows a bare toast and resolves undefined for a dismissal', async () => {
    h.showInformationMessage.mockResolvedValue(undefined);
    await expect(notifyInfo('fyi')).resolves.toBeUndefined();
    expect(h.showInformationMessage).toHaveBeenCalledWith('fyi');
    expect(h.executeCommand).not.toHaveBeenCalled();
  });

  it('a null result (VS Code can return null) is normalised to undefined', async () => {
    h.showErrorMessage.mockReturnValue(null);
    h.showWarningMessage.mockReturnValue(null);
    h.showInformationMessage.mockReturnValue(null);
    await expect(notifyError('e')).resolves.toBeUndefined();
    await expect(notifyWarning('w')).resolves.toBeUndefined();
    await expect(notifyInfo('i')).resolves.toBeUndefined();
  });

  it('accepts a synchronous (non-promise) return from the underlying API', async () => {
    h.showWarningMessage.mockReturnValue('sync-value');
    await expect(notifyWarning('w')).resolves.toBe('sync-value');
  });

  it('notifyWarning and notifyInfo pass labels through and dispatch the picked action with args', async () => {
    h.showWarningMessage.mockResolvedValue('Open');
    const warned = await notifyWarning(
      'w',
      { label: 'Open', command: 'workbench.action.openSettings', args: ['runforge'] },
      { label: 'Ignore', command: 'noop' }
    );
    expect(warned).toBe('Open');
    expect(h.showWarningMessage).toHaveBeenCalledWith('w', 'Open', 'Ignore');
    expect(h.executeCommand).toHaveBeenCalledWith('workbench.action.openSettings', 'runforge');

    h.executeCommand.mockClear();
    h.showInformationMessage.mockResolvedValue('Go');
    const informed = await notifyInfo('i', { label: 'Go', command: 'runforge.browseRuns' });
    expect(informed).toBe('Go');
    expect(h.showInformationMessage).toHaveBeenCalledWith('i', 'Go');
    expect(h.executeCommand).toHaveBeenCalledWith('runforge.browseRuns');
  });

  it('notifyError with actions returns undefined and runs nothing when dismissed', async () => {
    h.showErrorMessage.mockResolvedValue(undefined);
    await expect(notifyError('e', { label: 'Fix', command: 'fix' })).resolves.toBeUndefined();
    expect(h.executeCommand).not.toHaveBeenCalled();
  });

  it('runs only the action whose label was picked', async () => {
    h.showErrorMessage.mockResolvedValue('B');
    await notifyError('e', { label: 'A', command: 'cmd.a' }, { label: 'B', command: 'cmd.b' });
    expect(h.executeCommand).toHaveBeenCalledTimes(1);
    expect(h.executeCommand).toHaveBeenCalledWith('cmd.b');
  });
});
