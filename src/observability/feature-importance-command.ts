/**
 * Feature importance view command for RunForge
 *
 * Phase 3.4: Open and display feature_importance.v1.json with formatted summary
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Feature with importance data
 */
interface FeatureImportance {
  name: string;
  importance: number;
  rank?: number;
  index?: number;
}

/**
 * Feature importance artifact structure
 */
interface FeatureImportanceArtifact {
  schema_version: string;
  model_family: string;
  importance_type: string;
  num_features: number;
  features_by_importance: FeatureImportance[];
  features_by_original_order: FeatureImportance[];
  top_k: string[];
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
 * Format importance as percentage bar
 */
function formatImportanceBar(importance: number, maxWidth: number = 20): string {
  const filledWidth = Math.round(importance * maxWidth);
  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(maxWidth - filledWidth);
  return filled + empty;
}

/**
 * Format feature importance for display
 */
export function formatFeatureImportance(artifact: FeatureImportanceArtifact): string {
  const lines: string[] = [];

  lines.push('RunForge Feature Importance');
  lines.push('='.repeat(50));
  lines.push('');

  // Schema and model info
  lines.push(`Schema Version:   ${artifact.schema_version}`);
  lines.push(`Model Family:     ${artifact.model_family}`);
  lines.push(`Importance Type:  ${artifact.importance_type}`);
  lines.push(`Total Features:   ${artifact.num_features}`);
  lines.push('');

  // Top features summary
  lines.push('Top Features');
  lines.push('-'.repeat(50));

  const maxImportance = artifact.features_by_importance[0]?.importance || 1;

  for (const feature of artifact.features_by_importance.slice(0, 10)) {
    const normalizedImportance = feature.importance / maxImportance;
    const bar = formatImportanceBar(normalizedImportance);
    const pct = (feature.importance * 100).toFixed(2);
    const rank = feature.rank?.toString().padStart(2) || '??';
    lines.push(`  ${rank}. ${feature.name.padEnd(20)} ${bar} ${pct}%`);
  }

  if (artifact.num_features > 10) {
    lines.push(`  ... and ${artifact.num_features - 10} more features`);
  }

  lines.push('');

  // Feature list by original order
  lines.push('Features by Original Order');
  lines.push('-'.repeat(50));

  for (const feature of artifact.features_by_original_order) {
    const idx = feature.index?.toString().padStart(2) || '??';
    const pct = (feature.importance * 100).toFixed(2);
    lines.push(`  [${idx}] ${feature.name.padEnd(20)} ${pct}%`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Open feature_importance.v1.json in editor with formatted preview
 */
export async function openFeatureImportanceInEditor(artifactPath: string): Promise<void> {
  // Read and parse the artifact
  const content = fs.readFileSync(artifactPath, 'utf-8');
  const artifact = JSON.parse(content) as FeatureImportanceArtifact;
  const formatted = formatFeatureImportance(artifact);

  // Show in output channel for nice formatting
  const channel = vscode.window.createOutputChannel('RunForge Feature Importance');
  channel.clear();
  channel.appendLine(formatted);
  channel.show();

  // Also open the raw JSON
  const uri = vscode.Uri.file(artifactPath);
  await vscode.window.showTextDocument(uri, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

/**
 * View feature importance for the latest run
 */
export async function viewLatestFeatureImportance(): Promise<void> {
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

  const artifactPath = path.join(latestRunDir, 'artifacts', 'feature_importance.v1.json');
  if (!fs.existsSync(artifactPath)) {
    // Check run.json to see if this run has feature importance
    const runJsonPath = path.join(latestRunDir, 'run.json');
    if (fs.existsSync(runJsonPath)) {
      const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
      if (!runJson.feature_importance_schema_version) {
        vscode.window.showInformationMessage(
          'Feature importance is not available for this run. ' +
          'Only RandomForest models support feature importance in v1.'
        );
        return;
      }
    }
    vscode.window.showWarningMessage('feature_importance.v1.json not found in latest run.');
    return;
  }

  await openFeatureImportanceInEditor(artifactPath);
}
