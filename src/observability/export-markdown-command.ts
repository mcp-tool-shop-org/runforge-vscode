/**
 * Export Latest Run as Markdown
 *
 * Generates a formatted markdown summary of the latest training run,
 * writes it to the run directory, and opens it in the editor.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLatestRunMetadataSafe, type RunMetadata } from './metadata-command.js';

/**
 * Get the latest run directory from .runforge/runs
 */
function getLatestRunDir(workspaceRoot: string): string | null {
  const runsDir = path.join(workspaceRoot, '.runforge', 'runs');
  if (!fs.existsSync(runsDir)) {
    return null;
  }

  const entries = fs.readdirSync(runsDir, { withFileTypes: true });
  const runDirs = entries
    .filter(e => e.isDirectory())
    .map(e => ({
      name: e.name,
      path: path.join(runsDir, e.name),
      mtime: fs.statSync(path.join(runsDir, e.name)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return runDirs.length > 0 ? runDirs[0].path : null;
}

/**
 * Safely read a JSON file, returning null on error
 */
function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Build the markdown content from run data
 */
function buildMarkdown(
  metadata: RunMetadata,
  metricsV1: Record<string, unknown> | null,
  interpIndex: Record<string, unknown> | null,
  runDir: string
): string {
  const lines: string[] = [];

  // Title
  lines.push(`# Run Summary: ${metadata.run_id}`);
  lines.push('');

  // Timestamps
  lines.push('## Overview');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Run ID | \`${metadata.run_id}\` |`);
  lines.push(`| RunForge Version | ${metadata.runforge_version} |`);
  lines.push(`| Created | ${metadata.created_at} |`);
  lines.push(`| Label Column | \`${metadata.label_column}\` |`);
  lines.push(`| Samples | ${metadata.num_samples} |`);
  lines.push(`| Features | ${metadata.num_features} |`);
  if (metadata.dropped_rows_missing_values > 0) {
    lines.push(`| Dropped Rows (missing) | ${metadata.dropped_rows_missing_values} |`);
  }
  lines.push('');

  // Dataset
  lines.push('## Dataset');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Path | \`${metadata.dataset.path}\` |`);
  lines.push(`| SHA-256 | \`${metadata.dataset.fingerprint_sha256.slice(0, 16)}...\` |`);
  lines.push('');

  // Base metrics from run.json
  lines.push('## Metrics');
  lines.push('');
  if (metadata.metrics) {
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Accuracy | ${(metadata.metrics.accuracy * 100).toFixed(2)}% |`);
    lines.push('');
  }

  // Detailed metrics from metrics.v1.json
  if (metricsV1) {
    lines.push('### Detailed Metrics (v1)');
    lines.push('');
    const profile = metricsV1['metrics_profile'] as string || 'unknown';
    lines.push(`**Profile:** ${profile}`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    if (metricsV1['accuracy'] !== undefined) {
      lines.push(`| Accuracy | ${((metricsV1['accuracy'] as number) * 100).toFixed(2)}% |`);
    }
    if (metricsV1['precision_macro'] !== undefined) {
      lines.push(`| Precision (macro) | ${((metricsV1['precision_macro'] as number) * 100).toFixed(2)}% |`);
    }
    if (metricsV1['recall_macro'] !== undefined) {
      lines.push(`| Recall (macro) | ${((metricsV1['recall_macro'] as number) * 100).toFixed(2)}% |`);
    }
    if (metricsV1['f1_macro'] !== undefined) {
      lines.push(`| F1 (macro) | ${((metricsV1['f1_macro'] as number) * 100).toFixed(2)}% |`);
    }
    if (metricsV1['roc_auc'] !== undefined) {
      lines.push(`| ROC-AUC | ${((metricsV1['roc_auc'] as number) * 100).toFixed(2)}% |`);
    }
    if (metricsV1['log_loss'] !== undefined) {
      lines.push(`| Log Loss | ${(metricsV1['log_loss'] as number).toFixed(4)} |`);
    }
    lines.push('');

    // Confusion matrix
    const cm = metricsV1['confusion_matrix'] as number[][] | undefined;
    if (cm) {
      lines.push('### Confusion Matrix');
      lines.push('');
      const labels = metricsV1['class_labels'] as (string | number)[] | undefined;
      if (labels) {
        lines.push('| | ' + labels.map(l => `**${l}**`).join(' | ') + ' |');
        lines.push('|' + '---|'.repeat(labels.length + 1));
        for (let i = 0; i < cm.length; i++) {
          lines.push(`| **${labels[i]}** | ${cm[i].join(' | ')} |`);
        }
      } else {
        for (const row of cm) {
          lines.push('| ' + row.join(' | ') + ' |');
        }
      }
      lines.push('');
    }
  }

  // Interpretability index
  if (interpIndex) {
    lines.push('## Interpretability');
    lines.push('');
    const artifacts = interpIndex['artifacts'] as Record<string, unknown>[] | undefined;
    if (artifacts && artifacts.length > 0) {
      lines.push(`| Artifact | Type | Status |`);
      lines.push(`|----------|------|--------|`);
      for (const artifact of artifacts) {
        const name = artifact['name'] as string || 'unknown';
        const type = artifact['type'] as string || 'unknown';
        const present = artifact['present'] as boolean;
        lines.push(`| ${name} | ${type} | ${present ? 'Available' : 'Not available'} |`);
      }
      lines.push('');
    }
  }

  // Artifacts
  lines.push('## Artifacts');
  lines.push('');
  lines.push(`| File | Path |`);
  lines.push(`|------|------|`);
  if (metadata.artifacts?.model_pkl) {
    lines.push(`| Model | \`${metadata.artifacts.model_pkl}\` |`);
  }

  // List files in the run directory
  try {
    const files = fs.readdirSync(runDir);
    for (const file of files) {
      if (file === 'run.json' || file === 'run-summary.md') {
        continue;
      }
      const stat = fs.statSync(path.join(runDir, file));
      if (stat.isFile()) {
        lines.push(`| ${file} | \`${path.join(runDir, file)}\` |`);
      }
    }
    // Check artifacts subdirectory
    const artifactsDir = path.join(runDir, 'artifacts');
    if (fs.existsSync(artifactsDir)) {
      const artifactFiles = fs.readdirSync(artifactsDir);
      for (const file of artifactFiles) {
        lines.push(`| artifacts/${file} | \`${path.join(artifactsDir, file)}\` |`);
      }
    }
  } catch {
    // Ignore errors listing files
  }
  lines.push('');

  // Footer
  lines.push('---');
  lines.push(`*Generated by RunForge at ${new Date().toISOString()}*`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Export the latest run as a markdown summary
 */
export async function exportLatestRunAsMarkdown(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Get metadata via the safe path
  const metaResult = await getLatestRunMetadataSafe(workspaceRoot);
  if (!metaResult.ok) {
    vscode.window.showInformationMessage(metaResult.message);
    return;
  }

  const metadata = metaResult.value;

  // Find the run directory
  const runDir = getLatestRunDir(workspaceRoot);
  if (!runDir) {
    vscode.window.showErrorMessage('Could not locate run directory.');
    return;
  }

  // Load optional detailed files
  const metricsV1 = readJsonSafe(path.join(runDir, 'metrics.v1.json'));
  const interpIndex = readJsonSafe(path.join(runDir, 'artifacts', 'interpretability.index.v1.json'));

  // Build and write
  const markdown = buildMarkdown(metadata, metricsV1, interpIndex, runDir);
  const summaryPath = path.join(runDir, 'run-summary.md');
  fs.writeFileSync(summaryPath, markdown, 'utf-8');

  // Open in editor
  const uri = vscode.Uri.file(summaryPath);
  await vscode.window.showTextDocument(uri, { preview: false });

  vscode.window.showInformationMessage(`Run summary saved to ${path.basename(runDir)}/run-summary.md`);
}
