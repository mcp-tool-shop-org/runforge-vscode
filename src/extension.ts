/**
 * RunForge Extension
 * Push-button ML training with presets and indexed outputs
 */

import * as vscode from 'vscode';
import { executeRun, getOutputChannel, disposeOutputChannel, isRunning, setExtensionPath } from './runner/run-manager.js';
import { showRunsPicker } from './views/runs-picker.js';
import type { PresetId } from './types.js';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('RunForge extension activated');

  // Set extension path for bundled runner
  setExtensionPath(context.extensionPath);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('runforge.trainStandard', () => startTraining('std-train')),
    vscode.commands.registerCommand('runforge.trainHighQuality', () => startTraining('hq-train')),
    vscode.commands.registerCommand('runforge.openRuns', () => openRuns())
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
