/**
 * Metrics v1 view command for RunForge
 *
 * Phase 3.3: Open and display metrics.v1.json with formatted summary
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WORKSPACE_PATHS } from '../types.js';

/**
 * Metrics v1 profile display names
 */
const PROFILE_NAMES: Record<string, string> = {
  'classification.base.v1': 'Classification Base',
  'classification.proba.v1': 'Classification with Probabilities',
  'classification.multiclass.v1': 'Multiclass Classification',
};

/**
 * Get the latest run directory from .runforge
 */
async function getLatestRunDir(workspaceRoot: string): Promise<string | null> {
  const runforgeDir = path.join(workspaceRoot, '.runforge');
  const runsDir = path.join(runforgeDir, 'runs');

  if (!fs.existsSync(runsDir)) {
    return null;
  }

  // Find most recent run directory
  const entries = fs.readdirSync(runsDir, { withFileTypes: true });
  const runDirs = entries
    .filter(e => e.isDirectory())
    .map(e => ({
      name: e.name,
      path: path.join(runsDir, e.name),
      mtime: fs.statSync(path.join(runsDir, e.name)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (runDirs.length === 0) {
    return null;
  }

  return runDirs[0].path;
}

/**
 * Format metrics v1 for display
 */
export function formatMetricsV1(metrics: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push('RunForge Metrics v1');
  lines.push('='.repeat(40));
  lines.push('');

  // Schema and profile
  const schemaVersion = metrics['schema_version'] as string || 'unknown';
  const profile = metrics['metrics_profile'] as string || 'unknown';
  const profileName = PROFILE_NAMES[profile] || profile;
  const numClasses = metrics['num_classes'] as number;

  lines.push(`Schema Version:  ${schemaVersion}`);
  lines.push(`Metrics Profile: ${profileName}`);
  lines.push(`Number of Classes: ${numClasses}`);
  lines.push('');

  // Base metrics
  lines.push('Base Metrics');
  lines.push('-'.repeat(40));
  lines.push(`Accuracy:        ${formatPercent(metrics['accuracy'] as number)}`);
  lines.push(`Precision:       ${formatPercent(metrics['precision_macro'] as number)}`);
  lines.push(`Recall:          ${formatPercent(metrics['recall_macro'] as number)}`);
  lines.push(`F1 Score:        ${formatPercent(metrics['f1_macro'] as number)}`);
  lines.push('');

  // Confusion matrix
  const cm = metrics['confusion_matrix'] as number[][] | undefined;
  if (cm) {
    lines.push('Confusion Matrix');
    lines.push('-'.repeat(40));
    for (const row of cm) {
      lines.push('  ' + row.map(v => v.toString().padStart(5)).join(' '));
    }
    lines.push('');
  }

  // Proba metrics (if present)
  if ('roc_auc' in metrics) {
    lines.push('Probability Metrics');
    lines.push('-'.repeat(40));
    lines.push(`ROC-AUC:         ${formatPercent(metrics['roc_auc'] as number)}`);
    if ('log_loss' in metrics) {
      lines.push(`Log Loss:        ${(metrics['log_loss'] as number).toFixed(4)}`);
    }
    lines.push('');
  }

  // Per-class metrics (if present)
  if ('per_class_precision' in metrics) {
    const precision = metrics['per_class_precision'] as number[];
    const recall = metrics['per_class_recall'] as number[];
    const f1 = metrics['per_class_f1'] as number[];
    const labels = metrics['class_labels'] as (string | number)[];

    lines.push('Per-Class Metrics');
    lines.push('-'.repeat(40));
    lines.push('  Class     Precision  Recall     F1');
    for (let i = 0; i < labels.length; i++) {
      const label = String(labels[i]).padEnd(8);
      const p = formatPercent(precision[i]).padStart(8);
      const r = formatPercent(recall[i]).padStart(8);
      const f = formatPercent(f1[i]).padStart(8);
      lines.push(`  ${label} ${p}    ${r}    ${f}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a number as percentage
 */
function formatPercent(value: number): string {
  return (value * 100).toFixed(2) + '%';
}

/**
 * Open metrics.v1.json in editor with formatted preview
 */
export async function openMetricsV1InEditor(metricsPath: string): Promise<void> {
  // Create a virtual document with formatted content
  const content = fs.readFileSync(metricsPath, 'utf-8');
  const metrics = JSON.parse(content);
  const formatted = formatMetricsV1(metrics);

  // Show in output channel for nice formatting
  const channel = vscode.window.createOutputChannel('RunForge Metrics');
  channel.clear();
  channel.appendLine(formatted);
  channel.show();

  // Also open the raw JSON
  const uri = vscode.Uri.file(metricsPath);
  await vscode.window.showTextDocument(uri, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

/**
 * View metrics v1 for the latest run
 */
export async function viewLatestMetricsV1(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const latestRunDir = await getLatestRunDir(workspaceRoot);

  if (!latestRunDir) {
    vscode.window.showInformationMessage('No training runs found. Run training first.');
    return;
  }

  const metricsPath = path.join(latestRunDir, 'metrics.v1.json');
  if (!fs.existsSync(metricsPath)) {
    vscode.window.showWarningMessage('metrics.v1.json not found in latest run. This run may be from an older version.');
    return;
  }

  await openMetricsV1InEditor(metricsPath);
}
