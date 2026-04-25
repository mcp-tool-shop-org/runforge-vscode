/**
 * Metrics v1 view command for RunForge
 *
 * Phase 3.3: Open and display metrics.v1.json with formatted summary
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ARTIFACT_FILENAMES, type MetricsV1 } from '../types.js';
import { getLatestRunDir } from './fs-safe.js';

/**
 * Metrics v1 profile display names
 */
const PROFILE_NAMES: Record<string, string> = {
  'classification.base.v1': 'Classification Base',
  'classification.proba.v1': 'Classification with Probabilities',
  'classification.multiclass.v1': 'Multiclass Classification',
};

/**
 * Format metrics v1 for display
 */
export function formatMetricsV1(metrics: MetricsV1): string {
  const lines: string[] = [];

  lines.push('RunForge Metrics v1');
  lines.push('='.repeat(40));
  lines.push('');

  // Schema and profile
  const profileName = PROFILE_NAMES[metrics.metrics_profile] || metrics.metrics_profile;

  lines.push(`Schema Version:  ${metrics.schema_version}`);
  lines.push(`Metrics Profile: ${profileName}`);
  lines.push(`Number of Classes: ${metrics.num_classes}`);
  lines.push('');

  // Base metrics
  lines.push('Base Metrics');
  lines.push('-'.repeat(40));
  lines.push(`Accuracy:        ${formatPercent(metrics.accuracy)}`);
  lines.push(`Precision:       ${formatPercent(metrics.precision_macro)}`);
  lines.push(`Recall:          ${formatPercent(metrics.recall_macro)}`);
  lines.push(`F1 Score:        ${formatPercent(metrics.f1_macro)}`);
  lines.push('');

  // Confusion matrix
  const cm = metrics.confusion_matrix;
  if (cm) {
    lines.push('Confusion Matrix');
    lines.push('-'.repeat(40));
    for (const row of cm) {
      lines.push('  ' + row.map(v => v.toString().padStart(5)).join(' '));
    }
    lines.push('');
  }

  // Proba metrics (if present)
  if (metrics.roc_auc !== undefined) {
    lines.push('Probability Metrics');
    lines.push('-'.repeat(40));
    lines.push(`ROC-AUC:         ${formatPercent(metrics.roc_auc)}`);
    if (metrics.log_loss !== undefined) {
      lines.push(`Log Loss:        ${metrics.log_loss.toFixed(4)}`);
    }
    lines.push('');
  }

  // Per-class metrics (if present)
  if (metrics.per_class_precision && metrics.per_class_recall && metrics.per_class_f1 && metrics.class_labels) {
    const { per_class_precision: precision, per_class_recall: recall, per_class_f1: f1, class_labels: labels } = metrics;

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
  const metrics = JSON.parse(content) as MetricsV1;
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
  const latestRunDir = getLatestRunDir(workspaceRoot);

  if (!latestRunDir) {
    vscode.window.showInformationMessage('No training runs found. Run training first.');
    return;
  }

  const metricsPath = path.join(latestRunDir, ARTIFACT_FILENAMES.METRICS_V1_JSON);
  if (!fs.existsSync(metricsPath)) {
    vscode.window.showWarningMessage('metrics.v1.json not found in latest run. This run may be from an older version.');
    return;
  }

  await openMetricsV1InEditor(metricsPath);
}
