/**
 * Export Latest Run as Markdown
 *
 * Generates a formatted markdown summary of the latest training run,
 * writes it to the run directory, and opens it in the editor.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLatestRunMetadataSafe, surfaceOrphanBannerIfAny } from './metadata-command.js';
import { getLatestRunDir } from './fs-safe.js';
import { escapeTableCell } from './render/escape.js';
import { ARTIFACT_FILENAMES, type MetricsV1, type RunMetadata } from '../types.js';

/**
 * One entry in the interpretability.index.v1.json artifacts array.
 */
interface InterpIndexArtifact {
  name?: string;
  type?: string;
  present?: boolean;
}

/**
 * Narrow shape of interpretability.index.v1.json — only the fields we read.
 */
interface InterpIndex {
  artifacts?: InterpIndexArtifact[];
}

/**
 * Safely read and parse a JSON file as type T, returning null on any error.
 */
function readJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/**
 * Build the markdown content from run data.
 *
 * All user-controlled strings (class labels, artifact names, filenames) are
 * passed through {@link escapeTableCell} so that an embedded `|` cannot break
 * markdown table column alignment.
 */
function buildMarkdown(
  metadata: RunMetadata,
  metricsV1: MetricsV1 | null,
  interpIndex: InterpIndex | null,
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
  lines.push(`| Run ID | \`${escapeTableCell(metadata.run_id)}\` |`);
  lines.push(`| RunForge Version | ${escapeTableCell(metadata.runforge_version)} |`);
  lines.push(`| Created | ${escapeTableCell(metadata.created_at)} |`);
  lines.push(`| Label Column | \`${escapeTableCell(metadata.label_column)}\` |`);
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
  lines.push(`| Path | \`${escapeTableCell(metadata.dataset.path)}\` |`);
  lines.push(`| SHA-256 | \`${escapeTableCell(metadata.dataset.fingerprint_sha256.slice(0, 16))}...\` |`);
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
    const profile = metricsV1.metrics_profile ?? 'unknown';
    lines.push(`**Profile:** ${profile}`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    if (metricsV1.accuracy !== undefined) {
      lines.push(`| Accuracy | ${(metricsV1.accuracy * 100).toFixed(2)}% |`);
    }
    if (metricsV1.precision_macro !== undefined) {
      lines.push(`| Precision (macro) | ${(metricsV1.precision_macro * 100).toFixed(2)}% |`);
    }
    if (metricsV1.recall_macro !== undefined) {
      lines.push(`| Recall (macro) | ${(metricsV1.recall_macro * 100).toFixed(2)}% |`);
    }
    if (metricsV1.f1_macro !== undefined) {
      lines.push(`| F1 (macro) | ${(metricsV1.f1_macro * 100).toFixed(2)}% |`);
    }
    if (metricsV1.roc_auc !== undefined) {
      lines.push(`| ROC-AUC | ${(metricsV1.roc_auc * 100).toFixed(2)}% |`);
    }
    if (metricsV1.log_loss !== undefined) {
      lines.push(`| Log Loss | ${metricsV1.log_loss.toFixed(4)} |`);
    }
    lines.push('');

    // Confusion matrix
    const cm = metricsV1.confusion_matrix;
    if (cm) {
      lines.push('### Confusion Matrix');
      lines.push('');
      const labels = metricsV1.class_labels;
      if (labels) {
        lines.push('| | ' + labels.map(l => `**${escapeTableCell(l)}**`).join(' | ') + ' |');
        lines.push('|' + '---|'.repeat(labels.length + 1));
        for (let i = 0; i < cm.length; i++) {
          lines.push(`| **${escapeTableCell(labels[i])}** | ${cm[i].join(' | ')} |`);
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
    const artifacts = interpIndex.artifacts;
    if (artifacts && artifacts.length > 0) {
      lines.push(`| Artifact | Type | Status |`);
      lines.push(`|----------|------|--------|`);
      for (const artifact of artifacts) {
        const name = artifact.name ?? 'unknown';
        const type = artifact.type ?? 'unknown';
        const present = artifact.present === true;
        lines.push(`| ${escapeTableCell(name)} | ${escapeTableCell(type)} | ${present ? 'Available' : 'Not available'} |`);
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
    lines.push(`| Model | \`${escapeTableCell(metadata.artifacts.model_pkl)}\` |`);
  }

  // List files in the run directory.
  // If listing fails (permission, race, etc.), surface a note in the markdown
  // and log to the output channel rather than swallowing the error.
  try {
    const files = fs.readdirSync(runDir);
    for (const file of files) {
      if (file === ARTIFACT_FILENAMES.RUN_JSON || file === 'run-summary.md') {
        continue;
      }
      const stat = fs.statSync(path.join(runDir, file));
      if (stat.isFile()) {
        // path.posix.join: rendered output is OS-stable; path.join above is for IO.
        lines.push(`| ${escapeTableCell(file)} | \`${escapeTableCell(path.posix.join(runDir, file))}\` |`);
      }
    }
    // Check artifacts subdirectory
    const artifactsDir = path.join(runDir, 'artifacts');
    if (fs.existsSync(artifactsDir)) {
      const artifactFiles = fs.readdirSync(artifactsDir);
      for (const file of artifactFiles) {
        lines.push(`| artifacts/${escapeTableCell(file)} | \`${escapeTableCell(path.posix.join(runDir, 'artifacts', file))}\` |`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lines.push(`| _error_ | \`Could not list run artifacts: ${escapeTableCell(message)}\` |`);
    // Also surface to the output channel for diagnosability.
    const channel = vscode.window.createOutputChannel('RunForge Export Markdown');
    channel.appendLine(`[export-markdown] Failed to list ${runDir}: ${message}`);
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
 *
 * FT-BRIDGE-004a: surfaces the orphan banner up-front (before any work),
 * then suppresses the banner inside `getLatestRunMetadataSafe` so the user
 * only sees ONE warning per invocation.
 */
export async function exportLatestRunAsMarkdown(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // FT-BRIDGE-004a: surface "saved but not indexed" banner first.
  // Informational — command continues regardless.
  await surfaceOrphanBannerIfAny(workspaceRoot);

  // Get metadata via the safe path. We already surfaced the banner above, so
  // tell the helper to skip its own surfacing (avoids double-fire).
  const metaResult = await getLatestRunMetadataSafe(workspaceRoot, {
    surfaceOrphanBanner: false,
  });
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
  const metricsV1 = readJsonSafe<MetricsV1>(path.join(runDir, ARTIFACT_FILENAMES.METRICS_V1_JSON));
  const interpIndex = readJsonSafe<InterpIndex>(path.join(runDir, 'artifacts', ARTIFACT_FILENAMES.INTERPRETABILITY_INDEX_V1_JSON));

  // Build and write
  const markdown = buildMarkdown(metadata, metricsV1, interpIndex, runDir);
  const summaryPath = path.join(runDir, 'run-summary.md');
  fs.writeFileSync(summaryPath, markdown, 'utf-8');

  // Open in editor
  const uri = vscode.Uri.file(summaryPath);
  await vscode.window.showTextDocument(uri, { preview: false });

  vscode.window.showInformationMessage(`Run summary saved to ${path.basename(runDir)}/run-summary.md`);
}
