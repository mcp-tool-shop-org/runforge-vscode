/**
 * Browse Runs command tests (F-TESTS-004).
 *
 * Verifies the pre-QuickPick branches in src/observability/browse-runs-command.ts:
 *   - empty .runforge directory → informational message, no picker shown
 *   - empty runs array → "No runs found." message
 *   - newest-first reversal of index.runs (does NOT mutate the index)
 *   - malformed index.json → graceful actionable message
 *
 * vscode is mocked. We assert via the spy chain (informationMessage / quickPick).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const mocks = vi.hoisted(() => ({
  showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
  showQuickPick: vi.fn(() => Promise.resolve(undefined)),
}));
const { showInformationMessage, showErrorMessage, showQuickPick } = mocks;

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: mocks.showInformationMessage,
    showErrorMessage: mocks.showErrorMessage,
    showQuickPick: mocks.showQuickPick,
    showTextDocument: () => Promise.resolve(undefined),
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      dispose: () => {},
    }),
  },
  workspace: { workspaceFolders: undefined },
  Uri: { file: (p: string) => ({ fsPath: p }) },
  env: { clipboard: { writeText: () => Promise.resolve() } },
}));

import { browseRuns } from '../src/observability/browse-runs-command.js';

describe('browseRuns', () => {
  let tmpDir: string;
  const channel = {
    appendLine: vi.fn(),
    show: vi.fn(),
  } as unknown as import('vscode').OutputChannel;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-browse-'));
    showInformationMessage.mockClear();
    showErrorMessage.mockClear();
    showQuickPick.mockClear();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('shows actionable message and does not open picker when .runforge is missing', async () => {
    await browseRuns(tmpDir, 'python', '/runner', channel);
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledTimes(1);
    const msg = showInformationMessage.mock.calls[0][0] as string;
    expect(msg).toMatch(/No runs/i);
  });

  it('shows "No runs found" message when index has empty runs array', async () => {
    await fs.mkdir(path.join(tmpDir, '.runforge'));
    await fs.writeFile(
      path.join(tmpDir, '.runforge', 'index.json'),
      JSON.stringify({ runs: [] })
    );

    await browseRuns(tmpDir, 'python', '/runner', channel);
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledWith(
      expect.stringMatching(/No runs found/i)
    );
  });

  it('shows runs newest-first in QuickPick (entries reversed)', async () => {
    await fs.mkdir(path.join(tmpDir, '.runforge'));
    const runs = [
      {
        run_id: 'run-oldest',
        created_at: '2026-04-01T00:00:00Z',
        dataset_fingerprint: 'a'.repeat(64),
        label_column: 'label',
        run_dir: 'runs/run-oldest/run.json',
        model_pkl: 'runs/run-oldest/model.pkl',
      },
      {
        run_id: 'run-middle',
        created_at: '2026-04-02T00:00:00Z',
        dataset_fingerprint: 'b'.repeat(64),
        label_column: 'label',
        run_dir: 'runs/run-middle/run.json',
        model_pkl: 'runs/run-middle/model.pkl',
      },
      {
        run_id: 'run-newest',
        created_at: '2026-04-03T00:00:00Z',
        dataset_fingerprint: 'c'.repeat(64),
        label_column: 'label',
        run_dir: 'runs/run-newest/run.json',
        model_pkl: 'runs/run-newest/model.pkl',
      },
    ];
    await fs.writeFile(
      path.join(tmpDir, '.runforge', 'index.json'),
      JSON.stringify({ runs })
    );

    // Cancel at the first picker.
    showQuickPick.mockResolvedValueOnce(undefined);

    await browseRuns(tmpDir, 'python', '/runner', channel);

    expect(showQuickPick).toHaveBeenCalledTimes(1);
    const items = showQuickPick.mock.calls[0][0] as Array<{ label: string }>;
    expect(items).toHaveLength(3);
    expect(items[0].label).toBe('run-newest');
    expect(items[1].label).toBe('run-middle');
    expect(items[2].label).toBe('run-oldest');
  });

  it('does not mutate the index.runs array (display-only reversal)', async () => {
    await fs.mkdir(path.join(tmpDir, '.runforge'));
    const runs = [
      {
        run_id: 'r1',
        created_at: '2026-04-01T00:00:00Z',
        dataset_fingerprint: 'a'.repeat(64),
        label_column: 'l',
        run_dir: 'runs/r1/run.json',
        model_pkl: 'runs/r1/model.pkl',
      },
      {
        run_id: 'r2',
        created_at: '2026-04-02T00:00:00Z',
        dataset_fingerprint: 'b'.repeat(64),
        label_column: 'l',
        run_dir: 'runs/r2/run.json',
        model_pkl: 'runs/r2/model.pkl',
      },
    ];
    await fs.writeFile(
      path.join(tmpDir, '.runforge', 'index.json'),
      JSON.stringify({ runs })
    );

    showQuickPick.mockResolvedValueOnce(undefined);
    await browseRuns(tmpDir, 'python', '/runner', channel);

    // Re-read the on-disk index — order must still be r1, r2 (chronological).
    const after = JSON.parse(
      await fs.readFile(path.join(tmpDir, '.runforge', 'index.json'), 'utf-8')
    );
    expect(after.runs[0].run_id).toBe('r1');
    expect(after.runs[1].run_id).toBe('r2');
  });

  it('handles malformed index.json gracefully (CORRUPT_JSON path)', async () => {
    await fs.mkdir(path.join(tmpDir, '.runforge'));
    await fs.writeFile(path.join(tmpDir, '.runforge', 'index.json'), 'not valid json{{');

    await browseRuns(tmpDir, 'python', '/runner', channel);

    expect(showQuickPick).not.toHaveBeenCalled();
    expect(showInformationMessage).toHaveBeenCalledTimes(1);
    const msg = showInformationMessage.mock.calls[0][0] as string;
    expect(msg).toMatch(/corrupted|backup|restore/i);
  });

  it('returns early when user cancels the second picker (action selection)', async () => {
    await fs.mkdir(path.join(tmpDir, '.runforge'));
    const runs = [
      {
        run_id: 'only-run',
        created_at: '2026-04-01T00:00:00Z',
        dataset_fingerprint: 'a'.repeat(64),
        label_column: 'label',
        run_dir: 'runs/only-run/run.json',
        model_pkl: 'runs/only-run/model.pkl',
      },
    ];
    await fs.writeFile(
      path.join(tmpDir, '.runforge', 'index.json'),
      JSON.stringify({ runs })
    );

    // First picker selects the only run; second picker is cancelled.
    showQuickPick.mockImplementationOnce(() =>
      Promise.resolve({ entry: runs[0], label: runs[0].run_id })
    );
    showQuickPick.mockImplementationOnce(() => Promise.resolve(undefined));

    await browseRuns(tmpDir, 'python', '/runner', channel);

    expect(showQuickPick).toHaveBeenCalledTimes(2);
    // No further side effects — no error/info message expected after the
    // cancellation path.
    expect(showErrorMessage).not.toHaveBeenCalled();
  });
});
