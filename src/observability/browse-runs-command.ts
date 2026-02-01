/**
 * Browse Runs Command (Phase 2.3)
 *
 * Lists runs from .runforge/index.json and provides actions:
 * - Open Run Summary
 * - View Diagnostics
 * - Inspect Model Artifact
 * - Copy Dataset Fingerprint
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { safeReadIndex, safeReadRunJson, getActionableMessage, type IndexEntry } from './fs-safe.js';

/**
 * QuickPick item for a run
 */
interface RunQuickPickItem extends vscode.QuickPickItem {
  entry: IndexEntry;
}

/**
 * Action available for a selected run
 */
type RunAction = 'summary' | 'diagnostics' | 'artifact' | 'copy-fingerprint';

interface ActionQuickPickItem extends vscode.QuickPickItem {
  action: RunAction;
}

/**
 * Format a run entry for QuickPick display
 */
function formatRunItem(entry: IndexEntry): RunQuickPickItem {
  // Parse created_at for display
  let dateStr = entry.created_at;
  try {
    const date = new Date(entry.created_at);
    dateStr = date.toLocaleString();
  } catch {
    // Use raw string if parsing fails
  }

  // Fingerprint prefix (first 8 chars)
  const fingerprintPrefix = entry.dataset_fingerprint.substring(0, 8);

  return {
    label: entry.run_id,
    description: `${entry.label_column} | ${fingerprintPrefix}...`,
    detail: dateStr,
    entry,
  };
}

/**
 * Get available actions for a run
 */
function getRunActions(): ActionQuickPickItem[] {
  return [
    {
      label: '$(file-text) Open Run Summary',
      description: 'View run metadata',
      action: 'summary',
    },
    {
      label: '$(warning) View Diagnostics',
      description: 'See what happened during the run',
      action: 'diagnostics',
    },
    {
      label: '$(file-binary) Inspect Model Artifact',
      description: 'View pipeline structure',
      action: 'artifact',
    },
    {
      label: '$(clippy) Copy Dataset Fingerprint',
      description: 'Copy SHA-256 to clipboard',
      action: 'copy-fingerprint',
    },
  ];
}

/**
 * Execute a run action
 */
async function executeRunAction(
  action: RunAction,
  entry: IndexEntry,
  workspaceRoot: string,
  context: {
    pythonPath: string;
    runnerPath: string;
    channel: vscode.OutputChannel;
  }
): Promise<void> {
  switch (action) {
    case 'summary':
      await openRunSummary(entry, workspaceRoot);
      break;

    case 'diagnostics':
      await viewDiagnostics(entry, workspaceRoot, context.channel);
      break;

    case 'artifact':
      await inspectArtifact(entry, workspaceRoot, context);
      break;

    case 'copy-fingerprint':
      await vscode.env.clipboard.writeText(entry.dataset_fingerprint);
      vscode.window.showInformationMessage('Dataset fingerprint copied to clipboard.');
      break;
  }
}

/**
 * Open run summary (run.json as markdown)
 */
async function openRunSummary(entry: IndexEntry, workspaceRoot: string): Promise<void> {
  const result = await safeReadRunJson(workspaceRoot, entry.run_dir);

  if (!result.ok) {
    vscode.window.showErrorMessage(getActionableMessage(result.error));
    return;
  }

  const runJson = result.value;

  // Import renderer dynamically to avoid circular deps
  const { renderRunSummary } = await import('./render/run-summary.js');
  const markdown = renderRunSummary(runJson, entry.run_id);

  // Open as untitled markdown document
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });

  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

/**
 * View diagnostics (synthesized from run.json)
 */
async function viewDiagnostics(
  entry: IndexEntry,
  workspaceRoot: string,
  channel: vscode.OutputChannel
): Promise<void> {
  const result = await safeReadRunJson(workspaceRoot, entry.run_dir);

  if (!result.ok) {
    vscode.window.showErrorMessage(getActionableMessage(result.error));
    return;
  }

  const runJson = result.value;

  // Import renderer dynamically
  const { renderDiagnosticsSummary } = await import('./render/diagnostics-summary.js');
  const markdown = renderDiagnosticsSummary(runJson, entry.run_id);

  // Show in output channel
  channel.show(true);
  channel.appendLine('');
  channel.appendLine(markdown);

  // Also open as markdown doc for better reading
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });

  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

/**
 * Inspect model artifact for a run
 */
async function inspectArtifact(
  entry: IndexEntry,
  workspaceRoot: string,
  context: { pythonPath: string; runnerPath: string; channel: vscode.OutputChannel }
): Promise<void> {
  // model_pkl is relative to .runforge
  const artifactPath = path.join(workspaceRoot, '.runforge', entry.model_pkl);

  // Import the artifact inspection function
  const { inspectArtifact: doInspect, formatArtifactInspectResult, openInspectionInEditor } =
    await import('./artifact-inspect-command.js');

  context.channel.show(true);
  context.channel.appendLine('');
  context.channel.appendLine('Inspecting model artifact...');

  try {
    const result = await doInspect(
      context.pythonPath,
      context.runnerPath,
      artifactPath,
      workspaceRoot
    );

    context.channel.appendLine(formatArtifactInspectResult(result));
    await openInspectionInEditor(result);

    vscode.window.showInformationMessage(
      `Pipeline: ${result.step_count} steps, preprocessing: ${result.has_preprocessing ? 'yes' : 'no'}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.channel.appendLine(`ERROR: ${message}`);
    vscode.window.showErrorMessage(`Artifact inspection failed: ${message}`);
  }
}

/**
 * Main browse runs command
 */
export async function browseRuns(
  workspaceRoot: string,
  pythonPath: string,
  runnerPath: string,
  channel: vscode.OutputChannel
): Promise<void> {
  // Read index
  const indexResult = await safeReadIndex(workspaceRoot);

  if (!indexResult.ok) {
    vscode.window.showInformationMessage(getActionableMessage(indexResult.error));
    return;
  }

  const index = indexResult.value;

  if (!index.runs || index.runs.length === 0) {
    vscode.window.showInformationMessage('No runs found. Run a training first.');
    return;
  }

  // Reverse for display (newest first) - does NOT modify the index
  const runsForDisplay = [...index.runs].reverse();

  // Build QuickPick items
  const items = runsForDisplay.map(formatRunItem);

  // Show run picker
  const selectedRun = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a run to view',
    title: 'RunForge: Browse Runs',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selectedRun) {
    return; // User cancelled
  }

  // Show action picker
  const actions = getRunActions();
  const selectedAction = await vscode.window.showQuickPick(actions, {
    placeHolder: `Action for ${selectedRun.entry.run_id}`,
    title: 'Select Action',
  });

  if (!selectedAction) {
    return; // User cancelled
  }

  // Execute action
  await executeRunAction(selectedAction.action, selectedRun.entry, workspaceRoot, {
    pythonPath,
    runnerPath,
    channel,
  });
}
