/**
 * Feature importance view command for RunForge
 *
 * Phase 3.4: Open and display feature_importance.v1.json with formatted summary
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLatestRunDir } from './fs-safe.js';
import { listOrphanedRuns } from './orphan-markers.js';
import { ARTIFACT_FILENAMES, type FeatureImportance } from '../types.js';

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
export function formatFeatureImportance(artifact: FeatureImportance): string {
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
  const artifact = JSON.parse(content) as FeatureImportance;
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
 *
 * FT-BRIDGE-004a: surfaces an orphan banner ("N run(s) saved but not indexed")
 * up-front so users see the diagnostic regardless of which observability
 * surface they invoke.
 */
export async function viewLatestFeatureImportance(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // FT-BRIDGE-004a: surface "saved but not indexed" banner. Informational —
  // command continues regardless of orphan presence.
  const orphanScan = await listOrphanedRuns(workspaceRoot);
  if (orphanScan.orphans.length > 0) {
    const count = orphanScan.orphans.length;
    const message =
      `${count} run(s) saved but not indexed. ` +
      `Run "RunForge: Recover Index" to add them to the run list, ` +
      `or use "RunForge: Browse Runs" to open them directly.`;
    vscode.window.showWarningMessage(message);
  }

  const latestRunDir = getLatestRunDir(workspaceRoot);

  if (!latestRunDir) {
    vscode.window.showInformationMessage('No training runs found. Run training first.');
    return;
  }

  const artifactPath = path.join(latestRunDir, 'artifacts', ARTIFACT_FILENAMES.FEATURE_IMPORTANCE_V1_JSON);
  if (!fs.existsSync(artifactPath)) {
    // Check run.json to see if this run has feature importance
    const runJsonPath = path.join(latestRunDir, ARTIFACT_FILENAMES.RUN_JSON);
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
