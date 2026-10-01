/**
 * runs-picker: QuickPick of recent runs; selecting one reveals its folder.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'node:path';

const h = vi.hoisted(() => ({
  getRecentRuns: vi.fn(),
  showInformationMessage: vi.fn(),
  showQuickPick: vi.fn(),
  executeCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: h.showInformationMessage,
    showQuickPick: h.showQuickPick,
  },
  commands: { executeCommand: h.executeCommand },
  Uri: { file: (p: string) => ({ fsPath: p, scheme: 'file' }) },
}));
vi.mock('../src/workspace/index-manager.js', () => ({ getRecentRuns: h.getRecentRuns }));

import { showRunsPicker } from '../src/views/runs-picker.js';

const ROOT = path.join('C:', 'work', 'proj');
const TICK = '✓';
const CROSS = '✗';

function entry(over: Record<string, unknown> = {}) {
  return {
    run_id: '20260401-101500-demo-ab12',
    created_at: '2026-04-01T10:15:00Z',
    name: 'demo',
    preset_id: 'std-train',
    status: 'succeeded',
    summary: { duration_ms: 2500, final_metrics: { loss: 0.123456, accuracy: 0.9 }, device: 'cpu' },
    run_dir: '.ml/runs/20260401-101500-demo-ab12',
    dataset_fingerprint_sha256: 'x',
    label_column: 'y',
    model_pkl: 'm.pkl',
    ...over,
  };
}

type Item = { label: string; description: string; detail: string; entry: unknown };

beforeEach(() => {
  for (const m of Object.values(h)) m.mockReset();
  h.executeCommand.mockResolvedValue(undefined);
});

describe('showRunsPicker', () => {
  it('asks for the 50 most recent runs of the workspace', async () => {
    h.getRecentRuns.mockResolvedValue([]);
    await showRunsPicker(ROOT);
    expect(h.getRecentRuns).toHaveBeenCalledWith(ROOT, 50);
  });

  it('tells the user to run a training when there are no runs, and shows no picker', async () => {
    h.getRecentRuns.mockResolvedValue([]);
    await showRunsPicker(ROOT);

    expect(h.showInformationMessage).toHaveBeenCalledWith(
      'No training runs found. Run a training first!'
    );
    expect(h.showQuickPick).not.toHaveBeenCalled();
    expect(h.executeCommand).not.toHaveBeenCalled();
  });

  it('builds one item per run: status icon + id, name, and a detail line', async () => {
    h.getRecentRuns.mockResolvedValue([entry()]);
    h.showQuickPick.mockResolvedValue(undefined);
    await showRunsPicker(ROOT);

    const [items, options] = h.showQuickPick.mock.calls[0] as [Item[], Record<string, unknown>];
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe(`${TICK} 20260401-101500-demo-ab12`);
    expect(items[0].description).toBe('demo');
    expect(items[0].detail).toBe('Preset: std-train | Duration: 2.5s | Loss: 0.1235 | Acc: 90.0%');
    expect(options).toEqual({
      placeHolder: 'Select a run to open',
      matchOnDescription: true,
      matchOnDetail: true,
    });
  });

  it('marks every non-succeeded run with a cross', async () => {
    h.getRecentRuns.mockResolvedValue([
      entry({ run_id: 'r-fail', status: 'failed' }),
      entry({ run_id: 'r-cancel', status: 'cancelled' }),
      entry({ run_id: 'r-ok', status: 'succeeded' }),
    ]);
    h.showQuickPick.mockResolvedValue(undefined);
    await showRunsPicker(ROOT);

    const items = h.showQuickPick.mock.calls[0][0] as Item[];
    expect(items.map((i) => i.label)).toEqual([
      `${CROSS} r-fail`,
      `${CROSS} r-cancel`,
      `${TICK} r-ok`,
    ]);
  });

  it('keeps the order getRecentRuns returned (newest first)', async () => {
    h.getRecentRuns.mockResolvedValue([entry({ run_id: 'new' }), entry({ run_id: 'old' })]);
    h.showQuickPick.mockResolvedValue(undefined);
    await showRunsPicker(ROOT);

    const items = h.showQuickPick.mock.calls[0][0] as Item[];
    expect(items.map((i) => i.label.slice(2))).toEqual(['new', 'old']);
  });

  it('omits metrics that are absent and formats duration in ms, s and m', async () => {
    h.getRecentRuns.mockResolvedValue([
      entry({ summary: { duration_ms: 420, final_metrics: {}, device: 'cpu' } }),
      entry({
        preset_id: 'hq-train',
        summary: { duration_ms: 125000, final_metrics: { loss: 1 }, device: 'cuda' },
      }),
      entry({ summary: { duration_ms: 1000, final_metrics: { accuracy: 0.5 }, device: 'cpu' } }),
    ]);
    h.showQuickPick.mockResolvedValue(undefined);
    await showRunsPicker(ROOT);

    const items = h.showQuickPick.mock.calls[0][0] as Item[];
    expect(items[0].detail).toBe('Preset: std-train | Duration: 420ms');
    expect(items[1].detail).toBe('Preset: hq-train | Duration: 2m 5s | Loss: 1.0000');
    expect(items[2].detail).toBe('Preset: std-train | Duration: 1.0s | Acc: 50.0%');
  });

  it('shows zero-valued metrics rather than treating them as missing', async () => {
    h.getRecentRuns.mockResolvedValue([
      entry({
        summary: { duration_ms: 5, final_metrics: { loss: 0, accuracy: 0 }, device: 'cpu' },
      }),
    ]);
    h.showQuickPick.mockResolvedValue(undefined);
    await showRunsPicker(ROOT);

    const items = h.showQuickPick.mock.calls[0][0] as Item[];
    expect(items[0].detail).toBe('Preset: std-train | Duration: 5ms | Loss: 0.0000 | Acc: 0.0%');
  });

  it('reveals the selected run folder, resolved against the workspace root, in the Explorer', async () => {
    const chosen = entry({ run_dir: '.ml/runs/picked' });
    h.getRecentRuns.mockResolvedValue([entry(), chosen]);
    h.showQuickPick.mockImplementation(async (items: Item[]) => items[1]);
    await showRunsPicker(ROOT);

    expect(h.executeCommand).toHaveBeenCalledTimes(1);
    const [cmd, uri] = h.executeCommand.mock.calls[0];
    expect(cmd).toBe('revealInExplorer');
    expect(uri).toEqual({ fsPath: path.join(ROOT, '.ml/runs/picked'), scheme: 'file' });
  });

  it('does nothing further when the picker is dismissed', async () => {
    h.getRecentRuns.mockResolvedValue([entry()]);
    h.showQuickPick.mockResolvedValue(undefined);
    await showRunsPicker(ROOT);

    expect(h.executeCommand).not.toHaveBeenCalled();
  });

  it('propagates an index read failure instead of swallowing it', async () => {
    h.getRecentRuns.mockRejectedValue(new Error('index unreadable'));
    await expect(showRunsPicker(ROOT)).rejects.toThrow('index unreadable');
    expect(h.showQuickPick).not.toHaveBeenCalled();
  });
});
