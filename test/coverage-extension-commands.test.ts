/**
 * extension.ts command handlers, driven through the handlers `activate`
 * registers on a mocked `vscode` API. Each handler is asserted on what it
 * shows, what it asks for, and which collaborator it calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';

const h = vi.hoisted(() => {
  const handlers = new Map<string, () => Promise<unknown> | unknown>();
  const channel = { show: vi.fn(), appendLine: vi.fn() };
  const config = { get: vi.fn() };
  return {
    handlers,
    channel,
    config,
    workspace: { workspaceFolders: undefined as undefined | { uri: { fsPath: string } }[] },
    registerCommand: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showOpenDialog: vi.fn(),
    withProgress: vi.fn(),
    getConfiguration: vi.fn(),
    executeRun: vi.fn(),
    isRunning: vi.fn(),
    killActiveRun: vi.fn(),
    showRunsPicker: vi.fn(),
    inspectDataset: vi.fn(),
    formatInspectResult: vi.fn(),
    getLatestRunMetadataSafe: vi.fn(),
    openMetadataInEditor: vi.fn(),
    inspectArtifact: vi.fn(),
    formatArtifactInspectResult: vi.fn(),
    openInspectionInEditor: vi.fn(),
    browseRuns: vi.fn(),
    viewLatestMetricsV1: vi.fn(),
    viewLatestFeatureImportance: vi.fn(),
    viewLatestLinearCoefficients: vi.fn(),
    viewLatestInterpretabilityIndex: vi.fn(),
    exportLatestRunAsMarkdown: vi.fn(),
    recoverIndex: vi.fn(),
  };
});

vi.mock('vscode', () => ({
  commands: { registerCommand: h.registerCommand },
  window: {
    showErrorMessage: h.showErrorMessage,
    showWarningMessage: h.showWarningMessage,
    showInformationMessage: h.showInformationMessage,
    showInputBox: h.showInputBox,
    showOpenDialog: h.showOpenDialog,
    withProgress: h.withProgress,
  },
  workspace: {
    get workspaceFolders() {
      return h.workspace.workspaceFolders;
    },
    getConfiguration: h.getConfiguration,
  },
  ProgressLocation: { Notification: 15 },
  Uri: { file: (p: string) => ({ fsPath: p, scheme: 'file' }) },
}));
vi.mock('../src/runner/run-manager.js', () => ({
  executeRun: h.executeRun,
  getOutputChannel: () => h.channel,
  disposeOutputChannel: vi.fn(),
  isRunning: h.isRunning,
  setExtensionPath: vi.fn(),
  killActiveRun: h.killActiveRun,
}));
vi.mock('../src/views/runs-picker.js', () => ({ showRunsPicker: h.showRunsPicker }));
vi.mock('../src/observability/inspect-command.js', () => ({
  inspectDataset: h.inspectDataset,
  formatInspectResult: h.formatInspectResult,
}));
vi.mock('../src/observability/metadata-command.js', () => ({
  getLatestRunMetadataSafe: h.getLatestRunMetadataSafe,
  openMetadataInEditor: h.openMetadataInEditor,
}));
vi.mock('../src/observability/artifact-inspect-command.js', () => ({
  inspectArtifact: h.inspectArtifact,
  formatArtifactInspectResult: h.formatArtifactInspectResult,
  openInspectionInEditor: h.openInspectionInEditor,
}));
vi.mock('../src/observability/browse-runs-command.js', () => ({ browseRuns: h.browseRuns }));
vi.mock('../src/observability/metrics-v1-command.js', () => ({
  viewLatestMetricsV1: h.viewLatestMetricsV1,
}));
vi.mock('../src/observability/feature-importance-command.js', () => ({
  viewLatestFeatureImportance: h.viewLatestFeatureImportance,
}));
vi.mock('../src/observability/linear-coefficients-command.js', () => ({
  viewLatestLinearCoefficients: h.viewLatestLinearCoefficients,
}));
vi.mock('../src/observability/interpretability-index-command.js', () => ({
  viewLatestInterpretabilityIndex: h.viewLatestInterpretabilityIndex,
}));
vi.mock('../src/observability/export-markdown-command.js', () => ({
  exportLatestRunAsMarkdown: h.exportLatestRunAsMarkdown,
}));
vi.mock('../src/observability/recover-index-command.js', () => ({ recoverIndex: h.recoverIndex }));

const ROOT = path.join('C:', 'work', 'proj');
const EXT = path.join('C:', 'ext', 'runforge');
const NO_WORKSPACE_MSG = 'Please open a workspace folder first.';

/** Fresh copy of extension.ts so its module-level extensionPath starts unset. */
async function activated(extensionPath: string = EXT) {
  vi.resetModules();
  const ext = await import('../src/extension.js');
  ext.activate({ extensionPath, subscriptions: [] } as never);
  return ext;
}

function run(id: string): Promise<unknown> {
  const fn = h.handlers.get(id);
  if (!fn) throw new Error(`no handler registered for ${id}`);
  return Promise.resolve(fn());
}

function openWorkspace(...roots: string[]) {
  h.workspace.workspaceFolders = roots.map((fsPath) => ({ uri: { fsPath } }));
}

const savedDatasetEnv = process.env.RUNFORGE_DATASET;

beforeEach(() => {
  for (const v of Object.values(h)) {
    if (typeof v === 'function' && 'mockReset' in v) (v as ReturnType<typeof vi.fn>).mockReset();
  }
  h.handlers.clear();
  h.channel.show.mockReset();
  h.channel.appendLine.mockReset();
  h.config.get.mockReset();
  h.registerCommand.mockImplementation((id: string, fn: () => unknown) => {
    h.handlers.set(id, fn);
    return { dispose: vi.fn() };
  });
  h.getConfiguration.mockReturnValue(h.config);
  h.config.get.mockImplementation((_k: string, dflt: unknown) => dflt);
  h.workspace.workspaceFolders = undefined;
  delete process.env.RUNFORGE_DATASET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  if (savedDatasetEnv === undefined) delete process.env.RUNFORGE_DATASET;
  else process.env.RUNFORGE_DATASET = savedDatasetEnv;
});

describe('every workspace-bound command refuses politely with no folder open', () => {
  const ids = [
    'runforge.trainStandard',
    'runforge.trainHighQuality',
    'runforge.openRuns',
    'runforge.inspectDataset',
    'runforge.openLatestMetadata',
    'runforge.inspectArtifact',
    'runforge.browseRuns',
  ];

  it.each(ids)('%s shows the open-a-folder error and does no work', async (id) => {
    await activated();
    await run(id);

    expect(h.showErrorMessage).toHaveBeenCalledTimes(1);
    expect(h.showErrorMessage).toHaveBeenCalledWith(NO_WORKSPACE_MSG);
    expect(h.showInputBox).not.toHaveBeenCalled();
    expect(h.showOpenDialog).not.toHaveBeenCalled();
    expect(h.executeRun).not.toHaveBeenCalled();
    expect(h.showRunsPicker).not.toHaveBeenCalled();
    expect(h.browseRuns).not.toHaveBeenCalled();
    expect(h.getLatestRunMetadataSafe).not.toHaveBeenCalled();
  });

  it('treats an empty workspaceFolders array like no workspace', async () => {
    await activated();
    h.workspace.workspaceFolders = [];
    await run('runforge.openRuns');
    expect(h.showErrorMessage).toHaveBeenCalledWith(NO_WORKSPACE_MSG);
    expect(h.showRunsPicker).not.toHaveBeenCalled();
  });
});

describe('training commands', () => {
  beforeEach(() => {
    openWorkspace(ROOT, path.join('C:', 'other'));
    h.isRunning.mockReturnValue(false);
    h.showInputBox.mockResolvedValueOnce('my run').mockResolvedValueOnce('');
    h.withProgress.mockImplementation(
      async (_opts: unknown, cb: (p: unknown, t: unknown) => unknown) =>
        cb({ report: vi.fn() }, { isCancellationRequested: false })
    );
    h.executeRun.mockResolvedValue(undefined);
  });

  it('refuses to start while a run is in progress, before prompting for anything', async () => {
    h.isRunning.mockReturnValue(true);
    await activated();
    await run('runforge.trainStandard');

    expect(h.showWarningMessage).toHaveBeenCalledWith('A training run is already in progress.');
    expect(h.showInputBox).not.toHaveBeenCalled();
    expect(h.executeRun).not.toHaveBeenCalled();
  });

  it('trainStandard runs the std-train preset against the first workspace folder', async () => {
    await activated();
    await run('runforge.trainStandard');

    expect(h.executeRun).toHaveBeenCalledTimes(1);
    const [root, preset, name, seed, dataset] = h.executeRun.mock.calls[0];
    expect(root).toBe(ROOT);
    expect(preset).toBe('std-train');
    expect(name).toBe('my run');
    expect(seed).toBeUndefined(); // blank seed means "auto"
    expect(dataset).toBeUndefined();
  });

  it('trainHighQuality runs the hq-train preset', async () => {
    await activated();
    await run('runforge.trainHighQuality');
    expect(h.executeRun.mock.calls[0][1]).toBe('hq-train');
  });

  it('trims the name and parses the seed as a base-10 integer', async () => {
    h.showInputBox.mockReset();
    h.showInputBox.mockResolvedValueOnce('  spaced  ').mockResolvedValueOnce('0042');
    await activated();
    await run('runforge.trainStandard');

    const [, , name, seed] = h.executeRun.mock.calls[0];
    expect(name).toBe('spaced');
    expect(seed).toBe(42);
  });

  it('wraps the run in a cancellable notification progress titled with the trimmed name', async () => {
    h.showInputBox.mockReset();
    h.showInputBox.mockResolvedValueOnce('  titled  ').mockResolvedValueOnce('');
    await activated();
    await run('runforge.trainStandard');

    expect(h.withProgress).toHaveBeenCalledTimes(1);
    expect(h.withProgress.mock.calls[0][0]).toEqual({
      location: 15,
      title: 'RunForge: training "titled"',
      cancellable: true,
    });
  });

  it('forwards the progress reporter and cancellation token into executeRun', async () => {
    const progress = { report: vi.fn() };
    const token = { isCancellationRequested: false };
    h.withProgress.mockImplementation(
      async (_o: unknown, cb: (p: unknown, t: unknown) => unknown) => cb(progress, token)
    );
    await activated();
    await run('runforge.trainStandard');

    const args = h.executeRun.mock.calls[0];
    expect(args[5]).toBe(token);
    expect(args[6]).toBe(progress);
  });

  it('stops without a seed prompt or a run when the name prompt is cancelled', async () => {
    h.showInputBox.mockReset();
    h.showInputBox.mockResolvedValueOnce(undefined);
    await activated();
    await run('runforge.trainStandard');

    expect(h.showInputBox).toHaveBeenCalledTimes(1);
    expect(h.withProgress).not.toHaveBeenCalled();
    expect(h.executeRun).not.toHaveBeenCalled();
  });

  it('stops without a run when the seed prompt is cancelled', async () => {
    h.showInputBox.mockReset();
    h.showInputBox.mockResolvedValueOnce('named').mockResolvedValueOnce(undefined);
    await activated();
    await run('runforge.trainStandard');

    expect(h.showInputBox).toHaveBeenCalledTimes(2);
    expect(h.withProgress).not.toHaveBeenCalled();
    expect(h.executeRun).not.toHaveBeenCalled();
  });

  it('name prompt rejects blank names and accepts real ones', async () => {
    await activated();
    await run('runforge.trainStandard');

    const opts = h.showInputBox.mock.calls[0][0] as {
      prompt: string;
      value: string;
      validateInput: (v: string) => string | null;
    };
    expect(opts.prompt).toBe('Training run name');
    expect(opts.value).toBe('run');
    expect(opts.validateInput('')).toBe('Name cannot be empty');
    expect(opts.validateInput('   ')).toBe('Name cannot be empty');
    expect(opts.validateInput('fine')).toBeNull();
  });

  it('seed prompt allows blank or digits only and rejects everything else', async () => {
    await activated();
    await run('runforge.trainStandard');

    const opts = h.showInputBox.mock.calls[1][0] as {
      validateInput: (v: string) => string | null;
    };
    const msg = 'Seed must be a positive integer';
    expect(opts.validateInput('')).toBeNull();
    expect(opts.validateInput('42')).toBeNull();
    expect(opts.validateInput('-1')).toBe(msg);
    expect(opts.validateInput('4.2')).toBe(msg);
    expect(opts.validateInput('abc')).toBe(msg);
    expect(opts.validateInput('12a')).toBe(msg);
  });
});

describe('openRuns', () => {
  it('opens the runs picker for the first workspace folder', async () => {
    openWorkspace(ROOT, path.join('C:', 'other'));
    await activated();
    await run('runforge.openRuns');
    expect(h.showRunsPicker).toHaveBeenCalledWith(ROOT);
    expect(h.showErrorMessage).not.toHaveBeenCalled();
  });
});

describe('inspectDataset', () => {
  const dataset = path.join('C:', 'data', 'train.csv');
  const runnerPath = path.join(EXT, 'python', 'ml_runner');

  beforeEach(() => {
    openWorkspace(ROOT);
    h.formatInspectResult.mockReturnValue('FORMATTED');
  });

  it('uses RUNFORGE_DATASET without prompting, and the configured python path', async () => {
    process.env.RUNFORGE_DATASET = dataset;
    h.config.get.mockImplementation((k: string, d: unknown) =>
      k === 'pythonPath' ? 'C:/py/python.exe' : d
    );
    h.inspectDataset.mockResolvedValue({
      label_present: true,
      label_column: 'y',
      columns: ['a', 'y'],
      num_rows: 100,
      num_features_excluding_label: 7,
    });
    await activated();
    await run('runforge.inspectDataset');

    expect(h.showOpenDialog).not.toHaveBeenCalled();
    expect(h.getConfiguration).toHaveBeenCalledWith('runforge');
    expect(h.config.get).toHaveBeenCalledWith('pythonPath', 'python');
    expect(h.inspectDataset).toHaveBeenCalledWith('C:/py/python.exe', runnerPath, dataset);
    expect(h.channel.show).toHaveBeenCalledWith(true);
    expect(h.channel.appendLine).toHaveBeenCalledWith('Inspecting dataset...');
    expect(h.channel.appendLine).toHaveBeenCalledWith('FORMATTED');
    expect(h.showInformationMessage).toHaveBeenCalledWith('Dataset: 100 rows, 7 features');
    expect(h.showWarningMessage).not.toHaveBeenCalled();
  });

  it('prompts with a single-file CSV picker when the env var is unset, then inspects the pick', async () => {
    h.showOpenDialog.mockResolvedValue([{ fsPath: dataset }]);
    h.inspectDataset.mockResolvedValue({
      label_present: true,
      label_column: 'y',
      columns: [],
      num_rows: 1,
      num_features_excluding_label: 2,
    });
    await activated();
    await run('runforge.inspectDataset');

    expect(h.showOpenDialog).toHaveBeenCalledWith({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'CSV Files': ['csv'], 'All Files': ['*'] },
      title: 'Select Dataset to Inspect',
    });
    expect(h.inspectDataset).toHaveBeenCalledWith('python', runnerPath, dataset);
  });

  it.each([[undefined], [[]]])('does nothing when the picker is dismissed (%j)', async (picked) => {
    h.showOpenDialog.mockResolvedValue(picked);
    await activated();
    await run('runforge.inspectDataset');

    expect(h.inspectDataset).not.toHaveBeenCalled();
    expect(h.channel.show).not.toHaveBeenCalled();
    expect(h.showInformationMessage).not.toHaveBeenCalled();
    expect(h.showErrorMessage).not.toHaveBeenCalled();
  });

  it('warns with the available columns when the label column is missing', async () => {
    process.env.RUNFORGE_DATASET = dataset;
    h.inspectDataset.mockResolvedValue({
      label_present: false,
      label_column: 'target',
      columns: ['a', 'b', 'c'],
      num_rows: 3,
      num_features_excluding_label: 3,
    });
    await activated();
    await run('runforge.inspectDataset');

    expect(h.showWarningMessage).toHaveBeenCalledWith(
      "Label column 'target' not found in dataset. Available columns: a, b, c"
    );
    expect(h.showInformationMessage).not.toHaveBeenCalled();
  });

  it('reports an Error failure to the channel and as an error toast', async () => {
    process.env.RUNFORGE_DATASET = dataset;
    h.inspectDataset.mockRejectedValue(new Error('python exploded'));
    await activated();
    await run('runforge.inspectDataset');

    expect(h.channel.appendLine).toHaveBeenCalledWith('ERROR: python exploded');
    expect(h.showErrorMessage).toHaveBeenCalledWith('Dataset inspection failed: python exploded');
    expect(h.showInformationMessage).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error rejection', async () => {
    process.env.RUNFORGE_DATASET = dataset;
    h.inspectDataset.mockRejectedValue('plain string failure');
    await activated();
    await run('runforge.inspectDataset');

    expect(h.showErrorMessage).toHaveBeenCalledWith(
      'Dataset inspection failed: plain string failure'
    );
  });

  it('errors instead of guessing a runner path when the extension path is unavailable', async () => {
    process.env.RUNFORGE_DATASET = dataset;
    await activated('');
    await run('runforge.inspectDataset');

    expect(h.showErrorMessage).toHaveBeenCalledWith('Extension path not available.');
    expect(h.inspectDataset).not.toHaveBeenCalled();
    expect(h.channel.show).not.toHaveBeenCalled();
  });
});

describe('openLatestMetadata', () => {
  beforeEach(() => openWorkspace(ROOT));

  it('shows the actionable message as information when no metadata can be read', async () => {
    h.getLatestRunMetadataSafe.mockResolvedValue({
      ok: false,
      message: 'No runs found. Run a training first.',
    });
    await activated();
    await run('runforge.openLatestMetadata');

    expect(h.getLatestRunMetadataSafe).toHaveBeenCalledWith(ROOT);
    expect(h.showInformationMessage).toHaveBeenCalledWith('No runs found. Run a training first.');
    expect(h.openMetadataInEditor).not.toHaveBeenCalled();
  });

  it('opens the metadata in the editor when it reads', async () => {
    const value = { run_id: 'run-1' };
    h.getLatestRunMetadataSafe.mockResolvedValue({ ok: true, value });
    await activated();
    await run('runforge.openLatestMetadata');

    expect(h.openMetadataInEditor).toHaveBeenCalledWith(value);
    expect(h.showInformationMessage).not.toHaveBeenCalled();
  });
});

describe('inspectArtifact', () => {
  const pkl = path.join(ROOT, '.ml', 'runs', 'r1', 'model.pkl');
  const runnerPath = path.join(EXT, 'python', 'ml_runner');
  const okResult = { step_count: 3, has_preprocessing: true };

  beforeEach(() => {
    openWorkspace(ROOT);
    h.formatArtifactInspectResult.mockReturnValue('ARTIFACT-TEXT');
  });

  it('asks for a .pkl starting in <workspace>/.ml', async () => {
    h.showOpenDialog.mockResolvedValue(undefined);
    await activated();
    await run('runforge.inspectArtifact');

    expect(h.showOpenDialog).toHaveBeenCalledWith({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'Model Files': ['pkl'], 'All Files': ['*'] },
      title: 'Select Model Artifact to Inspect',
      defaultUri: { fsPath: path.join(ROOT, '.ml'), scheme: 'file' },
    });
  });

  it.each([[undefined], [[]]])('does nothing when the picker is dismissed (%j)', async (picked) => {
    h.showOpenDialog.mockResolvedValue(picked);
    await activated();
    await run('runforge.inspectArtifact');

    expect(h.inspectArtifact).not.toHaveBeenCalled();
    expect(h.channel.show).not.toHaveBeenCalled();
  });

  it('inspects the pick, opens the JSON, and summarises the pipeline', async () => {
    h.showOpenDialog.mockResolvedValue([{ fsPath: pkl }]);
    h.inspectArtifact.mockResolvedValue(okResult);
    h.config.get.mockImplementation((k: string, d: unknown) => (k === 'pythonPath' ? 'py3' : d));
    await activated();
    await run('runforge.inspectArtifact');

    expect(h.inspectArtifact).toHaveBeenCalledWith('py3', runnerPath, pkl, ROOT);
    expect(h.channel.appendLine).toHaveBeenCalledWith('Inspecting model artifact...');
    expect(h.channel.appendLine).toHaveBeenCalledWith('ARTIFACT-TEXT');
    expect(h.openInspectionInEditor).toHaveBeenCalledWith(okResult);
    expect(h.showInformationMessage).toHaveBeenCalledWith('Pipeline: 3 steps, preprocessing: yes');
  });

  it('says "preprocessing: no" when the pipeline has none', async () => {
    h.showOpenDialog.mockResolvedValue([{ fsPath: pkl }]);
    h.inspectArtifact.mockResolvedValue({ step_count: 1, has_preprocessing: false });
    await activated();
    await run('runforge.inspectArtifact');

    expect(h.showInformationMessage).toHaveBeenCalledWith('Pipeline: 1 steps, preprocessing: no');
  });

  it('reports an Error failure and does not open an editor', async () => {
    h.showOpenDialog.mockResolvedValue([{ fsPath: pkl }]);
    h.inspectArtifact.mockRejectedValue(new Error('bad pickle'));
    await activated();
    await run('runforge.inspectArtifact');

    expect(h.channel.appendLine).toHaveBeenCalledWith('ERROR: bad pickle');
    expect(h.showErrorMessage).toHaveBeenCalledWith('Artifact inspection failed: bad pickle');
    expect(h.openInspectionInEditor).not.toHaveBeenCalled();
    expect(h.showInformationMessage).not.toHaveBeenCalled();
  });

  it('stringifies a non-Error rejection', async () => {
    h.showOpenDialog.mockResolvedValue([{ fsPath: pkl }]);
    h.inspectArtifact.mockRejectedValue(404);
    await activated();
    await run('runforge.inspectArtifact');

    expect(h.showErrorMessage).toHaveBeenCalledWith('Artifact inspection failed: 404');
  });

  it('errors when the extension path is unavailable', async () => {
    h.showOpenDialog.mockResolvedValue([{ fsPath: pkl }]);
    await activated('');
    await run('runforge.inspectArtifact');

    expect(h.showErrorMessage).toHaveBeenCalledWith('Extension path not available.');
    expect(h.inspectArtifact).not.toHaveBeenCalled();
  });
});

describe('browseRuns', () => {
  it('passes workspace, configured python, bundled runner and the shared channel', async () => {
    openWorkspace(ROOT);
    h.config.get.mockImplementation((k: string, d: unknown) => (k === 'pythonPath' ? 'py311' : d));
    h.browseRuns.mockResolvedValue(undefined);
    await activated();
    await run('runforge.browseRuns');

    expect(h.browseRuns).toHaveBeenCalledWith(
      ROOT,
      'py311',
      path.join(EXT, 'python', 'ml_runner'),
      h.channel
    );
  });

  it('errors when the extension path is unavailable', async () => {
    openWorkspace(ROOT);
    await activated('');
    await run('runforge.browseRuns');

    expect(h.showErrorMessage).toHaveBeenCalledWith('Extension path not available.');
    expect(h.browseRuns).not.toHaveBeenCalled();
  });
});

describe('commands that delegate to their observability module', () => {
  it.each([
    ['runforge.viewMetricsV1', () => h.viewLatestMetricsV1],
    ['runforge.viewFeatureImportance', () => h.viewLatestFeatureImportance],
    ['runforge.viewLinearCoefficients', () => h.viewLatestLinearCoefficients],
    ['runforge.viewInterpretabilityIndex', () => h.viewLatestInterpretabilityIndex],
    ['runforge.exportRunMarkdown', () => h.exportLatestRunAsMarkdown],
    ['runforge.recoverIndex', () => h.recoverIndex],
  ])('%s calls exactly its own implementation, once', async (id, impl) => {
    await activated();
    await run(id);

    expect(impl()).toHaveBeenCalledTimes(1);
    const all = [
      h.viewLatestMetricsV1,
      h.viewLatestFeatureImportance,
      h.viewLatestLinearCoefficients,
      h.viewLatestInterpretabilityIndex,
      h.exportLatestRunAsMarkdown,
      h.recoverIndex,
    ];
    for (const other of all) {
      if (other !== impl()) expect(other).not.toHaveBeenCalled();
    }
  });
});

describe('cancelActiveRun', () => {
  it('kills the active run with a user-cancel reason naming the command', async () => {
    await activated();
    await run('runforge.cancelActiveRun');

    expect(h.killActiveRun).toHaveBeenCalledTimes(1);
    expect(h.killActiveRun).toHaveBeenCalledWith(
      'user cancelled via runforge.cancelActiveRun command'
    );
  });
});
