/**
 * Dataset Inspection Command (Phase 2.2.1)
 *
 * Runs dataset inspection via Python CLI and displays results.
 * Does not modify data or execute training.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

export interface InspectResult {
  dataset_path: string;
  fingerprint_sha256: string;
  columns: string[];
  num_rows: number;
  label_column: string;
  num_features_excluding_label: number;
  label_present: boolean;
}

/**
 * Execute dataset inspection command
 */
export async function inspectDataset(
  pythonPath: string,
  runnerPath: string,
  datasetPath: string,
  labelColumn: string = 'label'
): Promise<InspectResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, [
      '-m', 'ml_runner',
      'inspect',
      '--dataset', datasetPath,
      '--label', labelColumn,
    ], {
      cwd: path.dirname(runnerPath),
      env: {
        ...process.env,
        PYTHONPATH: runnerPath,
      },
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
          const result = JSON.parse(stdout) as InspectResult;
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
 * Format inspection result for display
 */
export function formatInspectResult(result: InspectResult): string {
  const lines = [
    '═'.repeat(60),
    'Dataset Inspection Results',
    '═'.repeat(60),
    '',
    `Path:        ${result.dataset_path}`,
    `Fingerprint: ${result.fingerprint_sha256.substring(0, 16)}...`,
    '',
    `Rows:        ${result.num_rows}`,
    `Features:    ${result.num_features_excluding_label}`,
    `Label:       ${result.label_column} (${result.label_present ? '✓ found' : '✗ NOT FOUND'})`,
    '',
    'Columns:',
    ...result.columns.map(col =>
      col === result.label_column ? `  • ${col} (label)` : `  • ${col}`
    ),
    '',
    '═'.repeat(60),
  ];

  return lines.join('\n');
}
