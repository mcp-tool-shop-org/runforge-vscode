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
import { safeReadIndex, safeReadRunJson, getActionableMessage } from './fs-safe.js';
import { openJsonDocument } from './open-summary.js';
import { listOrphanedRuns } from './orphan-markers.js';
import { ARTIFACT_FILENAMES, WORKSPACE_PATHS, type IndexEntry, type RunIndex, type RunMetadata } from '../types.js';

export type { RunMetadata } from '../types.js';

/**
 * Get the .ml workspace root path for a workspace
 */
export function getRunforgeDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, WORKSPACE_PATHS.ML_ROOT);
}

/**
 * Load the provenance index from .ml/outputs/index.json
 */
export async function loadProvenanceIndex(workspaceRoot: string): Promise<RunIndex | null> {
  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);

  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(content) as RunIndex;
  } catch {
    return null;
  }
}

/**
 * Get the latest run entry from the index
 */
export async function getLatestRunEntry(workspaceRoot: string): Promise<IndexEntry | null> {
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
  const runJsonPath = path.join(runDir, ARTIFACT_FILENAMES.RUN_JSON);

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

  // The run_dir in the index is workspace-relative (e.g., .ml/runs/<run_id>)
  // and points to the run directory containing run.json.
  const runDir = path.join(workspaceRoot, latestEntry.run_dir);

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
 * FT-BRIDGE-004a: Surface a "saved but not indexed" warning if any orphaned
 * runs exist under the workspace.
 *
 * Informational — does NOT block the calling command. The user gets a single
 * warning per invocation regardless of how many orphans exist (one count, one
 * banner). Detailed per-orphan diagnostics live in `runforge.browseRuns` per
 * Stage C.
 *
 * Exported so extension-level command handlers can call it directly, even
 * when the underlying load helpers are bypassed (or when a command has no
 * single load helper to hook into).
 */
export async function surfaceOrphanBannerIfAny(workspaceRoot: string): Promise<void> {
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
 * Phase 2.3: Get latest run metadata with structured error handling
 *
 * Returns a result object with actionable error messages.
 *
 * FT-BRIDGE-004a: surfaces an orphan banner ("N run(s) saved but not indexed")
 * before doing the index read, so users hitting `runforge.openLatestMetadata`
 * see the same diagnostic that `runforge.browseRuns` already shows. Pass
 * `{ surfaceOrphanBanner: false }` from callers that have already surfaced
 * the banner themselves (e.g. `exportLatestRunAsMarkdown`) to avoid double-fire.
 */
export async function getLatestRunMetadataSafe(
  workspaceRoot: string,
  options?: { surfaceOrphanBanner?: boolean }
): Promise<{ ok: true; value: RunMetadata } | { ok: false; message: string }> {
  // Default: surface the banner. Wrappers that already did so opt out.
  if (options?.surfaceOrphanBanner !== false) {
    await surfaceOrphanBannerIfAny(workspaceRoot);
  }

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

  return { ok: true, value: runJsonResult.value };
}
