/**
 * extension.ts activate/deactivate against a mocked `vscode` API.
 *
 * The contract under test: the set of command ids registered by `activate`
 * is exactly the set declared in package.json `contributes.commands` (a
 * contribution with no handler, or a handler with no contribution, fails),
 * every registration is pushed to `context.subscriptions`, and the bundled
 * runner path is handed to the run-manager.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const h = vi.hoisted(() => {
  const handlers = new Map<string, () => unknown>();
  return {
    handlers,
    registerCommand: vi.fn((id: string, fn: () => unknown) => {
      handlers.set(id, fn);
      return { dispose: vi.fn(), id };
    }),
    createStatusBarItem: vi.fn(),
    setExtensionPath: vi.fn(),
    killActiveRun: vi.fn(),
    disposeOutputChannel: vi.fn(),
  };
});

vi.mock('vscode', () => ({
  commands: { registerCommand: h.registerCommand },
  window: { createStatusBarItem: h.createStatusBarItem },
  workspace: { workspaceFolders: undefined },
}));
vi.mock('../src/runner/run-manager.js', () => ({
  executeRun: vi.fn(),
  getOutputChannel: vi.fn(),
  disposeOutputChannel: h.disposeOutputChannel,
  isRunning: vi.fn(),
  setExtensionPath: h.setExtensionPath,
  killActiveRun: h.killActiveRun,
}));
vi.mock('../src/views/runs-picker.js', () => ({ showRunsPicker: vi.fn() }));
vi.mock('../src/observability/inspect-command.js', () => ({
  inspectDataset: vi.fn(),
  formatInspectResult: vi.fn(),
}));
vi.mock('../src/observability/metadata-command.js', () => ({
  getLatestRunMetadataSafe: vi.fn(),
  openMetadataInEditor: vi.fn(),
}));
vi.mock('../src/observability/artifact-inspect-command.js', () => ({
  inspectArtifact: vi.fn(),
  formatArtifactInspectResult: vi.fn(),
  openInspectionInEditor: vi.fn(),
}));
vi.mock('../src/observability/browse-runs-command.js', () => ({ browseRuns: vi.fn() }));
vi.mock('../src/observability/metrics-v1-command.js', () => ({ viewLatestMetricsV1: vi.fn() }));
vi.mock('../src/observability/feature-importance-command.js', () => ({
  viewLatestFeatureImportance: vi.fn(),
}));
vi.mock('../src/observability/linear-coefficients-command.js', () => ({
  viewLatestLinearCoefficients: vi.fn(),
}));
vi.mock('../src/observability/interpretability-index-command.js', () => ({
  viewLatestInterpretabilityIndex: vi.fn(),
}));
vi.mock('../src/observability/export-markdown-command.js', () => ({
  exportLatestRunAsMarkdown: vi.fn(),
}));
vi.mock('../src/observability/recover-index-command.js', () => ({ recoverIndex: vi.fn() }));

import { activate, deactivate } from '../src/extension.js';

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8')
) as { contributes: { commands: { command: string }[] } };

const declaredIds = pkg.contributes.commands.map((c) => c.command);

function makeContext(extensionPath = 'C:/ext/runforge') {
  return { extensionPath, subscriptions: [] as { dispose(): void }[] };
}

describe('activate — command contributions', () => {
  beforeEach(() => {
    h.handlers.clear();
    h.registerCommand.mockClear();
    h.setExtensionPath.mockClear();
    h.createStatusBarItem.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('registers exactly the commands declared in package.json (no more, no fewer)', () => {
    activate(makeContext() as never);
    const registered = h.registerCommand.mock.calls.map((c) => c[0] as string);

    expect([...registered].sort()).toEqual([...declaredIds].sort());
    // and none registered twice
    expect(new Set(registered).size).toBe(registered.length);
  });

  it('declares every command in the runforge.* namespace', () => {
    for (const id of declaredIds) {
      expect(id).toMatch(/^runforge\.[A-Za-z0-9]+$/);
    }
  });

  it('pushes one disposable per command onto context.subscriptions', () => {
    const ctx = makeContext();
    activate(ctx as never);

    expect(ctx.subscriptions).toHaveLength(declaredIds.length);
    const subscribed = ctx.subscriptions.map((d) => (d as unknown as { id: string }).id);
    expect([...subscribed].sort()).toEqual([...declaredIds].sort());
    for (const d of ctx.subscriptions) {
      expect(typeof d.dispose).toBe('function');
    }
  });

  it('hands the extension path to the run-manager so the bundled runner resolves', () => {
    activate(makeContext('C:/somewhere/runforge-0.1.0') as never);
    expect(h.setExtensionPath).toHaveBeenCalledTimes(1);
    expect(h.setExtensionPath).toHaveBeenCalledWith('C:/somewhere/runforge-0.1.0');
  });

  it('does not create a status bar item at activation (it is created lazily by the run-manager)', () => {
    activate(makeContext() as never);
    expect(h.createStatusBarItem).not.toHaveBeenCalled();
  });

  it('registers a callable handler for each command', () => {
    activate(makeContext() as never);
    for (const id of declaredIds) {
      expect(typeof h.handlers.get(id)).toBe('function');
    }
  });
});

describe('deactivate', () => {
  beforeEach(() => {
    h.killActiveRun.mockReset();
    h.disposeOutputChannel.mockReset();
  });

  it('kills any active run with the deactivation reason, then disposes the output channel', () => {
    const order: string[] = [];
    h.killActiveRun.mockImplementation(() => void order.push('kill'));
    h.disposeOutputChannel.mockImplementation(() => void order.push('dispose'));

    deactivate();

    expect(h.killActiveRun).toHaveBeenCalledWith('extension deactivated');
    expect(h.disposeOutputChannel).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['kill', 'dispose']);
  });

  it('is synchronous (VS Code requires a non-promise return)', () => {
    expect(deactivate()).toBeUndefined();
  });
});
