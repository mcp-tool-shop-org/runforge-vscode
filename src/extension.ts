/**
 * RunForge Extension
 * Push-button ML training with presets and indexed outputs
 *
 * Phase 2.2.1: Observability commands (inspect, metadata)
 * Phase 2.2.2: Artifact inspection
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { executeRun, getOutputChannel, disposeOutputChannel, isRunning, setExtensionPath } from './runner/run-manager.js';
import { showRunsPicker } from './views/runs-picker.js';
import { inspectDataset, formatInspectResult } from './observability/inspect-command.js';
import { getLatestRunMetadataSafe, openMetadataInEditor } from './observability/metadata-command.js';
import { inspectArtifact, formatArtifactInspectResult, openInspectionInEditor } from './observability/artifact-inspect-command.js';
import { browseRuns } from './observability/browse-runs-command.js';
import type { PresetId } from './types.js';

/** Extension path for bundled runner */
let extensionPath: string | undefined;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('RunForge extension activated');

  // Set extension path for bundled runner
  extensionPath = context.extensionPath;
  setExtensionPath(context.extensionPath);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('runforge.trainStandard', () => startTraining('std-train')),
    vscode.commands.registerCommand('runforge.trainHighQuality', () => startTraining('hq-train')),
    vscode.commands.registerCommand('runforge.openRuns', () => openRuns()),
    // Phase 2.2.1: Observability commands
    vscode.commands.registerCommand('runforge.inspectDataset', () => runInspectDataset()),
    vscode.commands.registerCommand('runforge.openLatestMetadata', () => runOpenLatestMetadata()),
    // Phase 2.2.2: Artifact inspection
    vscode.commands.registerCommand('runforge.inspectArtifact', () => runInspectArtifact()),
    // Phase 2.3: Browse runs
    vscode.commands.registerCommand('runforge.browseRuns', () => runBrowseRuns())
  );
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  disposeOutputChannel();
}

/**
 * Start a training run with the given preset
 */
async function startTraining(presetId: PresetId): Promise<void> {
  // Check for workspace
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  // Check if already running
  if (isRunning()) {
    vscode.window.showWarningMessage('A training run is already in progress.');
    return;
  }

  // Prompt for training name
  const name = await vscode.window.showInputBox({
    prompt: 'Training run name',
    placeHolder: 'run',
    value: 'run',
    validateInput: (value) => {
      if (!value.trim()) {
        return 'Name cannot be empty';
      }
      return null;
    },
  });

  if (name === undefined) {
    return; // User cancelled
  }

  // Prompt for seed (optional)
  const seedInput = await vscode.window.showInputBox({
    prompt: 'Random seed (optional, leave blank for auto)',
    placeHolder: '42',
    validateInput: (value) => {
      if (value && !/^\d+$/.test(value)) {
        return 'Seed must be a positive integer';
      }
      return null;
    },
  });

  if (seedInput === undefined) {
    return; // User cancelled
  }

  const seed = seedInput ? parseInt(seedInput, 10) : undefined;

  // Execute the run
  await executeRun(workspaceRoot, presetId, name.trim(), seed);
}

/**
 * Open the runs picker
 */
async function openRuns(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  await showRunsPicker(workspaceRoot);
}

/**
 * Get the workspace root folder
 */
function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

/**
 * Phase 2.2.1: Inspect dataset command
 */
async function runInspectDataset(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  // Get dataset path from environment or prompt
  let datasetPath = process.env.RUNFORGE_DATASET;

  if (!datasetPath) {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'CSV Files': ['csv'],
        'All Files': ['*'],
      },
      title: 'Select Dataset to Inspect',
    });

    if (!fileUri || fileUri.length === 0) {
      return; // User cancelled
    }

    datasetPath = fileUri[0].fsPath;
  }

  // Get Python path from config
  const config = vscode.workspace.getConfiguration('runforge');
  const pythonPath = config.get<string>('pythonPath', 'python');

  // Get runner path
  if (!extensionPath) {
    vscode.window.showErrorMessage('Extension path not available.');
    return;
  }
  const runnerPath = path.join(extensionPath, 'python', 'ml_runner');

  const channel = getOutputChannel();
  channel.show(true);
  channel.appendLine('');
  channel.appendLine('Inspecting dataset...');

  try {
    const result = await inspectDataset(pythonPath, runnerPath, datasetPath);

    channel.appendLine(formatInspectResult(result));

    if (!result.label_present) {
      vscode.window.showWarningMessage(
        `Label column '${result.label_column}' not found in dataset. Available columns: ${result.columns.join(', ')}`
      );
    } else {
      vscode.window.showInformationMessage(
        `Dataset: ${result.num_rows} rows, ${result.num_features_excluding_label} features`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    channel.appendLine(`ERROR: ${message}`);
    vscode.window.showErrorMessage(`Dataset inspection failed: ${message}`);
  }
}

/**
 * Phase 2.2.1: Open latest run metadata command
 *
 * Phase 2.3: Updated to use fs-safe for consistent error handling.
 */
async function runOpenLatestMetadata(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  const result = await getLatestRunMetadataSafe(workspaceRoot);

  if (!result.ok) {
    vscode.window.showInformationMessage(result.message);
    return;
  }

  await openMetadataInEditor(result.value);
}

/**
 * Phase 2.2.2: Inspect model artifact command
 */
async function runInspectArtifact(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  // Prompt user to select model.pkl file
  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'Model Files': ['pkl'],
      'All Files': ['*'],
    },
    title: 'Select Model Artifact to Inspect',
    defaultUri: vscode.Uri.file(path.join(workspaceRoot, '.runforge')),
  });

  if (!fileUri || fileUri.length === 0) {
    return; // User cancelled
  }

  const artifactPath = fileUri[0].fsPath;

  // Get Python path from config
  const config = vscode.workspace.getConfiguration('runforge');
  const pythonPath = config.get<string>('pythonPath', 'python');

  // Get runner path
  if (!extensionPath) {
    vscode.window.showErrorMessage('Extension path not available.');
    return;
  }
  const runnerPath = path.join(extensionPath, 'python', 'ml_runner');

  const channel = getOutputChannel();
  channel.show(true);
  channel.appendLine('');
  channel.appendLine('Inspecting model artifact...');

  try {
    const result = await inspectArtifact(pythonPath, runnerPath, artifactPath, workspaceRoot);

    channel.appendLine(formatArtifactInspectResult(result));

    // Open JSON in editor
    await openInspectionInEditor(result);

    vscode.window.showInformationMessage(
      `Pipeline: ${result.step_count} steps, preprocessing: ${result.has_preprocessing ? 'yes' : 'no'}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    channel.appendLine(`ERROR: ${message}`);
    vscode.window.showErrorMessage(`Artifact inspection failed: ${message}`);
  }
}

/**
 * Phase 2.3: Browse runs command
 */
async function runBrowseRuns(): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  // Get Python path from config
  const config = vscode.workspace.getConfiguration('runforge');
  const pythonPath = config.get<string>('pythonPath', 'python');

  // Get runner path
  if (!extensionPath) {
    vscode.window.showErrorMessage('Extension path not available.');
    return;
  }
  const runnerPath = path.join(extensionPath, 'python', 'ml_runner');

  const channel = getOutputChannel();

  await browseRuns(workspaceRoot, pythonPath, runnerPath, channel);
}
