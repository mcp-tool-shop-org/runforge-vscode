/**
 * Runs Picker
 * QuickPick interface for opening past runs
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { getRecentRuns } from '../workspace/index-manager.js';
import type { IndexEntry } from '../types.js';

/** QuickPick item for a run */
interface RunQuickPickItem extends vscode.QuickPickItem {
  entry: IndexEntry;
}

/**
 * Show the runs picker and open selected run folder
 */
export async function showRunsPicker(workspaceRoot: string): Promise<void> {
  // Get recent runs
  const runs = await getRecentRuns(workspaceRoot, 50);

  if (runs.length === 0) {
    vscode.window.showInformationMessage('No training runs found. Run a training first!');
    return;
  }

  // Create QuickPick items
  const items: RunQuickPickItem[] = runs.map((entry) => ({
    label: `${getStatusIcon(entry.status)} ${entry.run_id}`,
    description: entry.name,
    detail: formatDetail(entry),
    entry,
  }));

  // Show picker
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a run to open',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (selected) {
    // Open the run folder
    const runPath = path.join(workspaceRoot, selected.entry.run_dir);
    const uri = vscode.Uri.file(runPath);

    // Reveal in Explorer
    await vscode.commands.executeCommand('revealInExplorer', uri);
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status: string): string {
  return status === 'succeeded' ? '✓' : '✗';
}

/**
 * Format detail line for QuickPick
 */
function formatDetail(entry: IndexEntry): string {
  const parts: string[] = [];

  // Add preset
  parts.push(`Preset: ${entry.preset_id}`);

  // Add duration
  parts.push(`Duration: ${formatDuration(entry.summary.duration_ms)}`);

  // Add key metrics if available
  const metrics = entry.summary.final_metrics;
  if (metrics.loss !== undefined) {
    parts.push(`Loss: ${metrics.loss.toFixed(4)}`);
  }
  if (metrics.accuracy !== undefined) {
    parts.push(`Acc: ${(metrics.accuracy * 100).toFixed(1)}%`);
  }

  return parts.join(' | ');
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
