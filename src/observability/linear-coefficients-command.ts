/**
 * Linear coefficients view command for RunForge
 *
 * Phase 3.5: Open and display linear_coefficients.v1.json with formatted summary
 *
 * IMPORTANT: Coefficients are in STANDARDIZED feature space.
 * They represent influence per 1 standard deviation of each feature.
 */

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLatestRunDir } from './fs-safe.js';
import { listOrphanedRuns } from './orphan-markers.js';
import { ARTIFACT_FILENAMES, type LinearCoefficients } from '../types.js';

/**
 * Format coefficient as a visual bar
 */
function formatCoefficientBar(absCoef: number, maxAbs: number, maxWidth: number = 20): string {
  const normalizedWidth = Math.round((absCoef / maxAbs) * maxWidth);
  const filled = '\u2588'.repeat(normalizedWidth);
  const empty = '\u2591'.repeat(maxWidth - normalizedWidth);
  return filled + empty;
}

/**
 * Format sign indicator
 */
function formatSign(coefficient: number): string {
  return coefficient >= 0 ? '+' : '-';
}

/**
 * Format linear coefficients for display
 */
export function formatLinearCoefficients(artifact: LinearCoefficients): string {
  const lines: string[] = [];

  lines.push('RunForge Linear Coefficients');
  lines.push('='.repeat(60));
  lines.push('');

  // Important disclaimer
  lines.push('IMPORTANT: Coefficients are in STANDARDIZED feature space');
  lines.push('Values represent influence per 1 STANDARD DEVIATION of each feature');
  lines.push('Higher absolute value = stronger influence on prediction');
  lines.push('');

  // Schema and model info
  lines.push(`Schema Version:     ${artifact.schema_version}`);
  lines.push(`Model Family:       ${artifact.model_family}`);
  lines.push(`Coefficient Space:  ${artifact.coefficient_space}`);
  lines.push(`Total Features:     ${artifact.num_features}`);
  lines.push(`Number of Classes:  ${artifact.num_classes}`);
  lines.push(`Classes:            ${artifact.classes.join(', ')}`);
  lines.push('');

  // Intercepts
  if (artifact.intercepts.length > 0) {
    lines.push('Intercepts (Bias Terms)');
    lines.push('-'.repeat(60));
    for (const entry of artifact.intercepts) {
      lines.push(`  Class ${entry.class}: ${entry.intercept.toFixed(4)}`);
    }
    lines.push('');
  }

  // Coefficients per class
  for (const classEntry of artifact.coefficients_by_class) {
    lines.push(`Coefficients for Class ${classEntry.class}`);
    lines.push('-'.repeat(60));

    // Find max absolute coefficient for scaling the bar
    const maxAbs = classEntry.features.length > 0
      ? classEntry.features[0].abs_coefficient
      : 1;

    // Show top 10 features
    for (const feature of classEntry.features.slice(0, 10)) {
      const sign = formatSign(feature.coefficient);
      const bar = formatCoefficientBar(feature.abs_coefficient, maxAbs);
      const coefStr = feature.coefficient.toFixed(4).padStart(10);
      const rank = feature.rank.toString().padStart(2);
      lines.push(`  ${rank}. ${feature.name.padEnd(20)} ${sign} ${bar} ${coefStr}`);
    }

    if (classEntry.features.length > 10) {
      lines.push(`  ... and ${classEntry.features.length - 10} more features`);
    }

    lines.push('');
  }

  // Interpretation guide
  lines.push('Interpretation Guide');
  lines.push('-'.repeat(60));
  lines.push('  + coefficient: Feature increase -> Higher probability for this class');
  lines.push('  - coefficient: Feature increase -> Lower probability for this class');
  lines.push('  Magnitude: Larger absolute value = Stronger influence');
  lines.push('');
  lines.push('  Example: coefficient = 2.0 means:');
  lines.push('    +1 std dev in feature -> +2.0 to log-odds for this class');
  lines.push('');

  return lines.join('\n');
}

/**
 * Open linear_coefficients.v1.json in editor with formatted preview
 */
export async function openLinearCoefficientsInEditor(artifactPath: string): Promise<void> {
  // Read and parse the artifact
  const content = fs.readFileSync(artifactPath, 'utf-8');
  const artifact = JSON.parse(content) as LinearCoefficients;
  const formatted = formatLinearCoefficients(artifact);

  // Show in output channel for nice formatting
  const channel = vscode.window.createOutputChannel('RunForge Linear Coefficients');
  channel.clear();
  channel.appendLine(formatted);
  channel.show();

  // Also open the raw JSON
  const uri = vscode.Uri.file(artifactPath);
  await vscode.window.showTextDocument(uri, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

/**
 * View linear coefficients for the latest run
 *
 * FT-BRIDGE-004a: surfaces an orphan banner ("N run(s) saved but not indexed")
 * up-front so users see the diagnostic regardless of which observability
 * surface they invoke.
 */
export async function viewLatestLinearCoefficients(): Promise<void> {
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

  const artifactPath = path.join(latestRunDir, 'artifacts', ARTIFACT_FILENAMES.LINEAR_COEFFICIENTS_V1_JSON);
  if (!fs.existsSync(artifactPath)) {
    // Check run.json to see if this run has linear coefficients
    const runJsonPath = path.join(latestRunDir, ARTIFACT_FILENAMES.RUN_JSON);
    if (fs.existsSync(runJsonPath)) {
      const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
      if (!runJson.linear_coefficients_schema_version) {
        vscode.window.showInformationMessage(
          'Linear coefficients are not available for this run. ' +
          'Only LogisticRegression and LinearSVC models support coefficient extraction.'
        );
        return;
      }
    }
    vscode.window.showWarningMessage('linear_coefficients.v1.json not found in latest run.');
    return;
  }

  await openLinearCoefficientsInEditor(artifactPath);
}
