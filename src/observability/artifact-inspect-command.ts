/**
 * Artifact Inspection Command (Phase 2.2.2)
 *
 * Runs artifact inspection via Python CLI and displays results.
 * Read-only: does not modify artifacts or execute training.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { pythonSpawnEnv } from '../runner/python-runner.js';
import { listOrphanedRuns } from './orphan-markers.js';

/**
 * Pipeline step information from inspection
 */
export interface PipelineStep {
  name: string;
  type: string;
  module: string;
}

/**
 * Artifact inspection result matching schema v0.2.2.2
 */
export interface ArtifactInspectResult {
  schema_version: string;
  artifact_path: string;
  pipeline_steps: PipelineStep[];
  has_preprocessing: boolean;
  step_count: number;
}

/**
 * FT-BRIDGE-004a: Surface a "saved but not indexed" warning if any orphaned
 * runs exist under the workspace.
 *
 * Informational — does NOT block the calling command. Single warning per
 * invocation regardless of orphan count. Detailed per-orphan diagnostics live
 * in `runforge.browseRuns` per Stage C.
 *
 * Exported so command paths that bypass `inspectArtifact()` (or run before it)
 * can surface the same banner.
 */
export async function surfaceArtifactInspectOrphanBanner(
  workspaceRoot: string
): Promise<void> {
  const orphanScan = await listOrphanedRuns(workspaceRoot);
  if (orphanScan.orphans.length > 0) {
    const count = orphanScan.orphans.length;
    const message =
      `${count} run(s) saved but not indexed. ` +
      `Run "RunForge: Recover Index" to add them to the run list, ` +
      `or use "RunForge: Browse Runs" to open them directly.`;
    vscode.window.showWarningMessage(message);
  }
}

/**
 * Execute artifact inspection command via Python CLI
 *
 * @param pythonPath Path to Python interpreter
 * @param runnerPath Path to ml_runner module
 * @param artifactPath Path to model.pkl file
 * @param basePath Optional base path for relative path computation. When
 *   provided AND `options.surfaceOrphanBanner` is not explicitly false, this
 *   path is treated as the workspace root for FT-BRIDGE-004a's orphan banner
 *   pre-check.
 * @param options Flags. `surfaceOrphanBanner` defaults to true when basePath
 *   is provided; pass `false` to suppress (e.g. when the caller already
 *   surfaced its own banner).
 * @returns Inspection result
 */
export async function inspectArtifact(
  pythonPath: string,
  runnerPath: string,
  artifactPath: string,
  basePath?: string,
  options?: { surfaceOrphanBanner?: boolean }
): Promise<ArtifactInspectResult> {
  // FT-BRIDGE-004a: surface the orphan banner BEFORE shelling out to Python.
  // Only when we have a workspace root (basePath) — without it we have no
  // anchor for the orphan scan. Caller can opt out via the options flag.
  if (basePath && options?.surfaceOrphanBanner !== false) {
    await surfaceArtifactInspectOrphanBanner(basePath);
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-m', 'ml_runner',
      'inspect-artifact',
      '--artifact', artifactPath,
    ];

    if (basePath) {
      args.push('--base-path', basePath);
    }

    const proc = spawn(pythonPath, args, {
      cwd: path.dirname(runnerPath),
      env: pythonSpawnEnv({ runnerParent: runnerPath }),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout) as ArtifactInspectResult;
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse inspection result: ${e}`));
        }
      } else {
        reject(new Error(stderr || `Inspection failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Format inspection result for display in output channel
 */
export function formatArtifactInspectResult(result: ArtifactInspectResult): string {
  const lines = [
    '═'.repeat(60),
    'Pipeline Artifact Inspection (Phase 2.2.2)',
    '═'.repeat(60),
    '',
    `Schema Version:    ${result.schema_version}`,
    `Artifact:          ${result.artifact_path}`,
    `Step Count:        ${result.step_count}`,
    `Has Preprocessing: ${result.has_preprocessing ? 'Yes' : 'No'}`,
    '',
    'Pipeline Steps:',
  ];

  for (let i = 0; i < result.pipeline_steps.length; i++) {
    const step = result.pipeline_steps[i];
    lines.push(`  ${i + 1}. ${step.name}`);
    lines.push(`     Type:   ${step.type}`);
    lines.push(`     Module: ${step.module}`);
    lines.push('');
  }

  lines.push('═'.repeat(60));

  return lines.join('\n');
}

/**
 * Open inspection result as JSON in a new editor tab
 */
export async function openInspectionInEditor(result: ArtifactInspectResult): Promise<void> {
  // Format with stable JSON (sorted keys, indented)
  const json = JSON.stringify(result, Object.keys(result).sort(), 2);

  // Create untitled document
  const doc = await vscode.workspace.openTextDocument({
    content: json,
    language: 'json',
  });

  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
}
