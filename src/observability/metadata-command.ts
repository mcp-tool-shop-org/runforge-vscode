/**
 * Metadata Commands (Phase 2.2.1)
 *
 * View and export run metadata.
 *
 * Phase 2.3: Updated to use fs-safe for consistent error handling.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { safeReadIndex, safeReadRunJson, getActionableMessage, type IndexEntry } from './fs-safe.js';
import { openJsonDocument } from './open-summary.js';

export interface RunMetadata {
  run_id: string;
  runforge_version: string;
  created_at: string;
  dataset: {
    path: string;
    fingerprint_sha256: string;
  };
  label_column: string;
  num_samples: number;
  num_features: number;
  dropped_rows_missing_values: number;
  metrics: {
    accuracy: number;
    num_samples: number;
    num_features: number;
  };
  artifacts: {
    model_pkl: string;
  };
}

export interface ProvenanceIndexEntry {
  run_id: string;
  created_at: string;
  dataset_fingerprint_sha256: string;
  label_column: string;
  run_dir: string;
  model_pkl: string;
}

export interface ProvenanceIndex {
  schema_version: string;
  runs: ProvenanceIndexEntry[];
}

/**
 * Get the .runforge directory path for a workspace
 */
export function getRunforgeDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.runforge');
}

/**
 * Load the provenance index
 */
export async function loadProvenanceIndex(workspaceRoot: string): Promise<ProvenanceIndex | null> {
  const indexPath = path.join(getRunforgeDir(workspaceRoot), 'index.json');

  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(content) as ProvenanceIndex;
  } catch {
    return null;
  }
}

/**
 * Get the latest run entry from the index
 */
export async function getLatestRunEntry(workspaceRoot: string): Promise<ProvenanceIndexEntry | null> {
  const index = await loadProvenanceIndex(workspaceRoot);
  if (!index || index.runs.length === 0) {
    return null;
  }
  return index.runs[index.runs.length - 1];
}

/**
 * Load run metadata from a run directory
 */
export async function loadRunMetadata(runDir: string): Promise<RunMetadata | null> {
  const runJsonPath = path.join(runDir, 'run.json');

  try {
    const content = await fs.readFile(runJsonPath, 'utf-8');
    return JSON.parse(content) as RunMetadata;
  } catch {
    return null;
  }
}

/**
 * Get the latest run metadata
 */
export async function getLatestRunMetadata(workspaceRoot: string): Promise<RunMetadata | null> {
  const latestEntry = await getLatestRunEntry(workspaceRoot);
  if (!latestEntry) {
    return null;
  }

  // The run_dir in the index points to runs/<run_id>/run.json
  // We need the directory containing run.json
  const runforgeDir = getRunforgeDir(workspaceRoot);
  const runJsonPath = path.join(runforgeDir, latestEntry.run_dir);
  const runDir = path.dirname(runJsonPath);

  return loadRunMetadata(runDir);
}

/**
 * Format metadata for display
 */
export function formatMetadata(metadata: RunMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

/**
 * Open run metadata in a new editor
 */
export async function openMetadataInEditor(metadata: RunMetadata): Promise<void> {
  await openJsonDocument(metadata, { viewColumn: vscode.ViewColumn.Active, preview: false });
}

/**
 * Phase 2.3: Get latest run metadata with structured error handling
 *
 * Returns a result object with actionable error messages.
 */
export async function getLatestRunMetadataSafe(
  workspaceRoot: string
): Promise<{ ok: true; value: RunMetadata } | { ok: false; message: string }> {
  const indexResult = await safeReadIndex(workspaceRoot);

  if (!indexResult.ok) {
    return { ok: false, message: getActionableMessage(indexResult.error) };
  }

  const index = indexResult.value;
  if (!index.runs || index.runs.length === 0) {
    return { ok: false, message: 'No runs found. Run a training first.' };
  }

  // Get the latest run
  const latestEntry = index.runs[index.runs.length - 1];
  const runJsonResult = await safeReadRunJson(workspaceRoot, latestEntry.run_dir);

  if (!runJsonResult.ok) {
    return { ok: false, message: getActionableMessage(runJsonResult.error) };
  }

  return { ok: true, value: runJsonResult.value as RunMetadata };
}
