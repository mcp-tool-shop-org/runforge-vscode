/**
 * Browse Runs Command (Phase 2.3)
 *
 * Lists runs from .ml/outputs/index.json and provides actions:
 * - Open Run Summary
 * - View Diagnostics
 * - Inspect Model Artifact
 * - Copy Dataset Fingerprint
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { safeReadIndex, safeReadRunJson, getActionableMessage } from './fs-safe.js';
import { openMarkdownSummary } from './open-summary.js';
import {
  humanizeOrphanRecovery,
  listOrphanedRuns,
  type OrphanSkip,
} from './orphan-markers.js';
import { WORKSPACE_PATHS, type IndexEntry, type IndexOrphanMarker } from '../types.js';

/**
 * QuickPick item for a run.
 *
 * Indexed runs carry an `IndexEntry` (full canonical metadata). Orphaned runs
 * — runs whose run.json landed but whose index update failed — carry an
 * `IndexOrphanMarker` instead. The two flow through different downstream
 * paths because an orphan has no canonical `dataset_fingerprint_sha256` /
 * `model_pkl` / `label_column` to feed the indexed-action picker.
 */
interface RunQuickPickItem extends vscode.QuickPickItem {
  /** Indexed-run metadata, present iff `runKind === 'indexed'`. */
  entry: IndexEntry | null;
  /** Orphan marker, present iff `runKind === 'orphan'`. */
  orphan: IndexOrphanMarker | null;
  /**
   * Discriminator for the post-pick branch.
   *
   * Named `runKind` (not `kind`) on purpose — `vscode.QuickPickItem` already
   * declares an optional `kind: QuickPickItemKind` for separator/default
   * styling, and shadowing it with a string union breaks structural assignment.
   */
  runKind: 'indexed' | 'orphan';
}

/**
 * Action available for an indexed run
 */
type RunAction = 'summary' | 'diagnostics' | 'artifact' | 'copy-fingerprint';

interface ActionQuickPickItem extends vscode.QuickPickItem {
  action: RunAction;
}

/**
 * Action available for an orphaned run.
 *
 * `recover` is intentionally NOT here for Stage C — Recover Index is Phase 4.
 * Until then, the user gets the humanized situation copy + ways to inspect
 * the run that's actually on disk.
 */
type OrphanAction = 'open-folder' | 'copy-run-id' | 'view-error';

interface OrphanActionQuickPickItem extends vscode.QuickPickItem {
  action: OrphanAction;
}

/**
 * Format a run entry for QuickPick display
 */
function formatRunItem(entry: IndexEntry): RunQuickPickItem {
  // Parse created_at for display
  let dateStr = entry.created_at;
  try {
    const date = new Date(entry.created_at);
    dateStr = date.toLocaleString();
  } catch {
    // Use raw string if parsing fails
  }

  // Fingerprint prefix (first 8 chars)
  const fingerprintPrefix = entry.dataset_fingerprint_sha256.substring(0, 8);

  return {
    label: entry.run_id,
    description: `${entry.label_column} | ${fingerprintPrefix}...`,
    detail: dateStr,
    entry,
    orphan: null,
    runKind: 'indexed',
  };
}

/**
 * Format an orphan marker for QuickPick display.
 *
 * Distinct prefix + description tag so the user can spot orphans at a glance.
 * The run is still navigable — the orphan branch surfaces humanized recovery
 * copy + lets the user open the run folder to inspect artifacts.
 */
function formatOrphanItem(marker: IndexOrphanMarker): RunQuickPickItem {
  let dateStr = marker.written_at;
  try {
    const date = new Date(marker.written_at);
    dateStr = date.toLocaleString();
  } catch {
    // Use raw string if parsing fails
  }

  return {
    // `$(warning)` codicon makes orphans visually distinct in the picker.
    label: `$(warning) ${marker.run_id}`,
    description: `(saved but not indexed) | ${marker.error.type}`,
    detail: dateStr,
    entry: null,
    orphan: marker,
    runKind: 'orphan',
  };
}

/**
 * Get available actions for a run
 */
function getRunActions(): ActionQuickPickItem[] {
  return [
    {
      label: '$(file-text) Open Run Summary',
      description: 'View run metadata',
      action: 'summary',
    },
    {
      label: '$(warning) View Diagnostics',
      description: 'See what happened during the run',
      action: 'diagnostics',
    },
    {
      label: '$(file-binary) Inspect Model Artifact',
      description: 'View pipeline structure',
      action: 'artifact',
    },
    {
      label: '$(clippy) Copy Dataset Fingerprint',
      description: 'Copy SHA-256 to clipboard',
      action: 'copy-fingerprint',
    },
  ];
}

/**
 * Execute a run action
 */
async function executeRunAction(
  action: RunAction,
  entry: IndexEntry,
  workspaceRoot: string,
  context: {
    pythonPath: string;
    runnerPath: string;
    channel: vscode.OutputChannel;
  }
): Promise<void> {
  switch (action) {
    case 'summary':
      await openRunSummary(entry, workspaceRoot);
      break;

    case 'diagnostics':
      await viewDiagnostics(entry, workspaceRoot, context.channel);
      break;

    case 'artifact':
      await inspectArtifact(entry, workspaceRoot, context);
      break;

    case 'copy-fingerprint':
      await vscode.env.clipboard.writeText(entry.dataset_fingerprint_sha256);
      vscode.window.showInformationMessage('Dataset fingerprint copied to clipboard.');
      break;
  }
}

/**
 * Open run summary (run.json as markdown)
 */
async function openRunSummary(entry: IndexEntry, workspaceRoot: string): Promise<void> {
  const result = await safeReadRunJson(workspaceRoot, entry.run_dir);

  if (!result.ok) {
    vscode.window.showErrorMessage(getActionableMessage(result.error));
    return;
  }

  const runJson = result.value;

  // Import renderer dynamically to avoid circular deps
  const { renderRunSummary } = await import('./render/run-summary.js');
  const markdown = renderRunSummary(runJson, entry.run_id);

  await openMarkdownSummary(markdown);
}

/**
 * View diagnostics (synthesized from run.json)
 */
async function viewDiagnostics(
  entry: IndexEntry,
  workspaceRoot: string,
  channel: vscode.OutputChannel
): Promise<void> {
  const result = await safeReadRunJson(workspaceRoot, entry.run_dir);

  if (!result.ok) {
    vscode.window.showErrorMessage(getActionableMessage(result.error));
    return;
  }

  const runJson = result.value;

  // Import renderer dynamically
  const { renderDiagnosticsSummary } = await import('./render/diagnostics-summary.js');
  const markdown = renderDiagnosticsSummary(runJson, entry.run_id);

  // Show in output channel
  channel.show(true);
  channel.appendLine('');
  channel.appendLine(markdown);

  // Also open as markdown doc for better reading
  await openMarkdownSummary(markdown);
}

/**
 * Inspect model artifact for a run
 */
async function inspectArtifact(
  entry: IndexEntry,
  workspaceRoot: string,
  context: { pythonPath: string; runnerPath: string; channel: vscode.OutputChannel }
): Promise<void> {
  // model_pkl is relative to the .ml workspace root
  const artifactPath = path.join(workspaceRoot, WORKSPACE_PATHS.ML_ROOT, entry.model_pkl);

  // Import the artifact inspection function
  const { inspectArtifact: doInspect, formatArtifactInspectResult, openInspectionInEditor } =
    await import('./artifact-inspect-command.js');

  context.channel.show(true);
  context.channel.appendLine('');
  context.channel.appendLine('Inspecting model artifact...');

  try {
    const result = await doInspect(
      context.pythonPath,
      context.runnerPath,
      artifactPath,
      workspaceRoot
    );

    context.channel.appendLine(formatArtifactInspectResult(result));
    await openInspectionInEditor(result);

    vscode.window.showInformationMessage(
      `Pipeline: ${result.step_count} steps, preprocessing: ${result.has_preprocessing ? 'yes' : 'no'}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.channel.appendLine(`ERROR: ${message}`);
    vscode.window.showErrorMessage(`Artifact inspection failed: ${message}`);
  }
}

/**
 * Log orphan-marker rejection diagnostics to the output channel.
 *
 * Corrupt or shape-broken markers are skipped from the picker rather than
 * thrown — but they MUST be visible somewhere so the user / a maintainer can
 * notice the inconsistency. The channel is the right surface (already used
 * for diagnostics + artifact inspection).
 */
function logOrphanSkips(
  channel: vscode.OutputChannel,
  skipped: ReadonlyArray<OrphanSkip>
): void {
  if (skipped.length === 0) return;
  channel.appendLine('');
  channel.appendLine(`RunForge: skipped ${skipped.length} unreadable orphan marker(s):`);
  for (const skip of skipped) {
    channel.appendLine(`  - [${skip.reason}] ${skip.runDirName}: ${skip.detail}`);
  }
}

/**
 * Branch for an orphaned-run pick: surface humanization copy + offer the
 * non-Recover-Index actions (open folder, copy run id, view raw error).
 *
 * Why this is its own branch (not folded into `executeRunAction`): an orphan
 * has no canonical `IndexEntry`, so the indexed actions (Open Run Summary,
 * View Diagnostics, Inspect Model Artifact, Copy Dataset Fingerprint) all
 * dereference fields the marker doesn't carry. Sticking to a separate flow
 * keeps the indexed-action contract intact.
 */
async function handleOrphanPick(
  marker: IndexOrphanMarker,
  workspaceRoot: string,
  channel: vscode.OutputChannel
): Promise<void> {
  // Humanized situation copy first — this is the load-bearing UX moment per
  // the Stage C contract. Without this, the user only sees "(saved but not
  // indexed)" and has no idea what to do.
  vscode.window.showWarningMessage(humanizeOrphanRecovery(marker));

  const orphanActions: OrphanActionQuickPickItem[] = [
    {
      label: '$(folder-opened) Open Run Folder',
      description: 'Inspect run.json + artifacts on disk',
      action: 'open-folder',
    },
    {
      label: '$(clippy) Copy Run ID',
      description: 'Copy run id to clipboard',
      action: 'copy-run-id',
    },
    {
      label: '$(output) View Error Details',
      description: 'Show the underlying error in the output channel',
      action: 'view-error',
    },
  ];

  const selected = await vscode.window.showQuickPick(orphanActions, {
    placeHolder: `Action for ${marker.run_id} (saved but not indexed)`,
    title: 'Select Action',
  });

  if (!selected) {
    return; // User cancelled
  }

  switch (selected.action) {
    case 'open-folder': {
      const runDirAbs = path.join(workspaceRoot, marker.run_dir);
      const uri = vscode.Uri.file(runDirAbs);
      await vscode.commands.executeCommand('revealInExplorer', uri);
      break;
    }
    case 'copy-run-id': {
      await vscode.env.clipboard.writeText(marker.run_id);
      vscode.window.showInformationMessage('Run ID copied to clipboard.');
      break;
    }
    case 'view-error': {
      channel.show(true);
      channel.appendLine('');
      channel.appendLine(`Orphan marker: ${marker.run_id}`);
      channel.appendLine(`  written_at: ${marker.written_at}`);
      channel.appendLine(`  index_path: ${marker.index_path}`);
      channel.appendLine(`  error.type: ${marker.error.type}`);
      channel.appendLine(`  error.message: ${marker.error.message}`);
      if (marker.error.traceback) {
        channel.appendLine('  traceback:');
        for (const line of marker.error.traceback.split('\n')) {
          channel.appendLine(`    ${line}`);
        }
      }
      break;
    }
  }
}

/**
 * Main browse runs command.
 *
 * Stage C amend (F-PY-B002): the picker now overlays orphaned runs (runs
 * whose `.index-orphan` marker exists but whose index entry is missing).
 * Orphans appear above indexed runs with a `(saved but not indexed)` tag
 * and route through `handleOrphanPick` instead of the indexed-action path.
 */
export async function browseRuns(
  workspaceRoot: string,
  pythonPath: string,
  runnerPath: string,
  channel: vscode.OutputChannel
): Promise<void> {
  // Read index AND scan for orphan markers in parallel — they're independent
  // filesystem reads and the user wants both surfaces in one picker.
  const [indexResult, orphanScan] = await Promise.all([
    safeReadIndex(workspaceRoot),
    listOrphanedRuns(workspaceRoot),
  ]);

  // Always log skipped markers (no-op if list is empty).
  logOrphanSkips(channel, orphanScan.skipped);

  // Build the indexed half of the picker. If the index is unreadable we keep
  // going as long as we have orphans — that's actually the headline scenario
  // (Python failed to write the index, runs are stranded on disk).
  const indexedItems: RunQuickPickItem[] = indexResult.ok
    ? [...indexResult.value.runs].reverse().map(formatRunItem)
    : [];

  const orphanItems: RunQuickPickItem[] = orphanScan.orphans.map(formatOrphanItem);

  const items = [...orphanItems, ...indexedItems];

  if (items.length === 0) {
    // Nothing to show — preserve the prior single-message UX so existing tests
    // and users see the same actionable copy when the workspace is empty.
    if (!indexResult.ok) {
      vscode.window.showInformationMessage(getActionableMessage(indexResult.error));
    } else {
      vscode.window.showInformationMessage('No runs found. Run a training first.');
    }
    return;
  }

  // Show run picker
  const selectedRun = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a run to view',
    title: 'RunForge: Browse Runs',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selectedRun) {
    return; // User cancelled
  }

  if (selectedRun.runKind === 'orphan') {
    // Type-narrowing: kind === 'orphan' guarantees `orphan` is non-null.
    if (selectedRun.orphan) {
      await handleOrphanPick(selectedRun.orphan, workspaceRoot, channel);
    }
    return;
  }

  // Indexed-run branch — entry is non-null when runKind === 'indexed'.
  if (!selectedRun.entry) {
    return;
  }
  const entry = selectedRun.entry;

  // Show action picker
  const actions = getRunActions();
  const selectedAction = await vscode.window.showQuickPick(actions, {
    placeHolder: `Action for ${entry.run_id}`,
    title: 'Select Action',
  });

  if (!selectedAction) {
    return; // User cancelled
  }

  // Execute action
  await executeRunAction(selectedAction.action, entry, workspaceRoot, {
    pythonPath,
    runnerPath,
    channel,
  });
}
