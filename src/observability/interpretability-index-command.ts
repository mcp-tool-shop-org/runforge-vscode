/**
 * Interpretability index view command for RunForge
 *
 * Phase 3.6: Open and display interpretability.index.v1.json with formatted summary
 *
 * Provides a unified view of all interpretability artifacts for a run.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Metrics v1 entry summary
 */
interface MetricsV1Summary {
  metrics_profile: string;
  accuracy?: number;
}

/**
 * Feature importance entry summary
 */
interface FeatureImportanceSummary {
  model_family: string;
  top_k: string[];
}

/**
 * Linear coefficients entry summary
 */
interface LinearCoefficientsSummary {
  model_family: string;
  num_classes: number;
  top_k_by_class: Array<{
    class: number | string;
    top_features: string[];
  }>;
}

/**
 * Available artifact entry
 */
interface ArtifactEntry<T> {
  schema_version: string;
  path: string;
  summary: T;
}

/**
 * Interpretability index structure
 */
interface InterpretabilityIndex {
  schema_version: string;
  run_id: string;
  runforge_version: string;
  created_at: string;
  available_artifacts: {
    metrics_v1?: ArtifactEntry<MetricsV1Summary>;
    feature_importance_v1?: ArtifactEntry<FeatureImportanceSummary>;
    linear_coefficients_v1?: ArtifactEntry<LinearCoefficientsSummary>;
  };
}

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
 * Format the interpretability index for display
 */
export function formatInterpretabilityIndex(index: InterpretabilityIndex, runDir: string): string {
  const lines: string[] = [];

  lines.push('RunForge Interpretability Index');
  lines.push('='.repeat(60));
  lines.push('');

  // Basic info
  lines.push(`Run ID:           ${index.run_id}`);
  lines.push(`RunForge Version: ${index.runforge_version}`);
  lines.push(`Created:          ${index.created_at}`);
  lines.push(`Schema Version:   ${index.schema_version}`);
  lines.push('');

  // Available artifacts summary
  const artifacts = index.available_artifacts;
  const count = Object.keys(artifacts).length;
  lines.push(`Available Artifacts: ${count}`);
  lines.push('-'.repeat(60));
  lines.push('');

  // Metrics v1
  if (artifacts.metrics_v1) {
    const m = artifacts.metrics_v1;
    lines.push('\u2713 Metrics v1');
    lines.push(`    Path:    ${m.path}`);
    lines.push(`    Profile: ${m.summary.metrics_profile}`);
    if (m.summary.accuracy !== undefined) {
      lines.push(`    Accuracy: ${(m.summary.accuracy * 100).toFixed(2)}%`);
    }
    lines.push('');
  } else {
    lines.push('\u2717 Metrics v1 (not available)');
    lines.push('');
  }

  // Feature importance
  if (artifacts.feature_importance_v1) {
    const fi = artifacts.feature_importance_v1;
    lines.push('\u2713 Feature Importance v1');
    lines.push(`    Path:   ${fi.path}`);
    lines.push(`    Model:  ${fi.summary.model_family}`);
    lines.push(`    Top features: ${fi.summary.top_k.join(', ')}`);
    lines.push('');
  } else {
    lines.push('\u2717 Feature Importance v1 (not available for this model)');
    lines.push('');
  }

  // Linear coefficients
  if (artifacts.linear_coefficients_v1) {
    const lc = artifacts.linear_coefficients_v1;
    lines.push('\u2713 Linear Coefficients v1');
    lines.push(`    Path:    ${lc.path}`);
    lines.push(`    Model:   ${lc.summary.model_family}`);
    lines.push(`    Classes: ${lc.summary.num_classes}`);
    for (const classEntry of lc.summary.top_k_by_class) {
      lines.push(`    Class ${classEntry.class}: ${classEntry.top_features.join(', ')}`);
    }
    lines.push('');
  } else {
    lines.push('\u2717 Linear Coefficients v1 (not available for this model)');
    lines.push('');
  }

  // Quick links
  lines.push('Quick Links');
  lines.push('-'.repeat(60));
  lines.push('');

  if (artifacts.metrics_v1) {
    const metricsPath = path.join(runDir, artifacts.metrics_v1.path);
    lines.push(`  Metrics:           ${metricsPath}`);
  }
  if (artifacts.feature_importance_v1) {
    const fiPath = path.join(runDir, artifacts.feature_importance_v1.path);
    lines.push(`  Feature Importance: ${fiPath}`);
  }
  if (artifacts.linear_coefficients_v1) {
    const lcPath = path.join(runDir, artifacts.linear_coefficients_v1.path);
    lines.push(`  Linear Coefficients: ${lcPath}`);
  }
  lines.push('');

  // Interpretation guide
  lines.push('Interpretation Guide');
  lines.push('-'.repeat(60));
  lines.push('  - Metrics: Classification performance (accuracy, ROC-AUC, etc.)');
  lines.push('  - Feature Importance: Which features matter (RandomForest only)');
  lines.push('  - Linear Coefficients: Model weights (LogisticRegression, LinearSVC)');
  lines.push('');
  lines.push('Use the View Latest commands for detailed artifact views.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Open interpretability.index.v1.json in editor with formatted preview
 */
export async function openInterpretabilityIndexInEditor(artifactPath: string, runDir: string): Promise<void> {
  // Read and parse the index
  const content = fs.readFileSync(artifactPath, 'utf-8');
  const index = JSON.parse(content) as InterpretabilityIndex;
  const formatted = formatInterpretabilityIndex(index, runDir);

  // Show in output channel for nice formatting
  const channel = vscode.window.createOutputChannel('RunForge Interpretability Index');
  channel.clear();
  channel.appendLine(formatted);
  channel.show();

  // Also open the raw JSON
  const uri = vscode.Uri.file(artifactPath);
  await vscode.window.showTextDocument(uri, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

/**
 * View interpretability index for the latest run
 */
export async function viewLatestInterpretabilityIndex(): Promise<void> {
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

  const artifactPath = path.join(latestRunDir, 'artifacts', 'interpretability.index.v1.json');
  if (!fs.existsSync(artifactPath)) {
    vscode.window.showWarningMessage(
      'interpretability.index.v1.json not found. This run may have been created before Phase 3.6.'
    );
    return;
  }

  await openInterpretabilityIndexInEditor(artifactPath, latestRunDir);
}
