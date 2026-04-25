/**
 * Recover Index command (FT-BACK-002, Phase 4 Wave 3).
 *
 * Walks `.ml/runs/`, classifies each run dir, and re-appends any unindexed
 * runs to `.ml/outputs/index.json`. The literal antidote to the F-PY-B002
 * orphan-marker scenarios — Python's writer can fail to update the index
 * after run.json lands cleanly; this command rebuilds the index from
 * authoritative on-disk artifacts.
 *
 * Single canonical return shape: `RecoveryReport` from `src/types.ts`.
 * Both this writer and Bridge's `renderRecoveryReport()` (FT-BRIDGE-009,
 * parallel) consume that shape — prospective-contract pattern (lesson #11)
 * applied to multi-domain Wave 3 work.
 *
 * Doctrine notes (docs/CONTRACTS.md):
 *  - Rule 1/3: imports `RecoveryReport*`, `RunIndex`, `IndexEntry`,
 *    `RunMetadata` from `src/types.ts`. No shadow types declared here.
 *  - Rule 2: imports `WORKSPACE_PATHS.RUNS_DIR` /
 *    `ARTIFACT_FILENAMES.{RUN_JSON,INDEX_ORPHAN_MARKER,CANCELLED_MARKER}`.
 *    No string literals duplicating those values.
 *  - Rule 4: contract mirrors CONTRACT-PHASE-4.md §3.1.2.
 *
 * Idempotency (per §3.1.2): re-running on the same workspace state yields
 * identical results modulo `recovered_at`. Once a run is appended, the next
 * call observes its run_id in index.json and counts it under
 * `already_indexed`.
 *
 * Atomic write: index.json is rebuilt by writing to `index.json.tmp` and
 * then `fs.rename`-ing into place — same pattern Python uses for the
 * cancelled/orphan markers, no half-written index file ever visible.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  ARTIFACT_FILENAMES,
  WORKSPACE_PATHS,
  type IndexEntry,
  type RecoveryReport,
  type RecoveryReportEntry,
  type RecoveryReportSkip,
  type RunIndex,
  type RunMetadata,
} from '../types.js';
import { exists, readJsonFile, safeReadIndex } from './fs-safe.js';

/**
 * Schema version for newly-created `index.json` files. Matches the writer
 * (Python ml_runner) so re-rebuilt indexes carry the same marker as
 * previously-Python-written ones.
 */
const INDEX_SCHEMA_VERSION = '0.2.2.1';

/**
 * Walk the workspace, classify each run dir, append missing ones to
 * `.ml/outputs/index.json`, and return a `RecoveryReport`.
 *
 * Pure logic — no `vscode` UI calls. The caller is responsible for any
 * user-facing surface (the command wrapper at the bottom of this file
 * handles the information-message and optional markdown render).
 */
export async function recoverIndexForWorkspace(
  workspaceRoot: string
): Promise<RecoveryReport> {
  const recoveredAt = new Date().toISOString();
  const runsDir = path.join(workspaceRoot, WORKSPACE_PATHS.RUNS_DIR);

  const report: RecoveryReport = {
    scanned_run_dirs: 0,
    already_indexed: 0,
    recovered: [],
    skipped: [],
    cancelled_excluded: [],
    recovered_at: recoveredAt,
  };

  // Read existing index. Per CONTRACT-PHASE-4 §3.1.2 recovery is the literal
  // use case for missing/corrupt index — `safeReadIndex` already backs up a
  // corrupt file. Treat any non-ok read as starting from an empty index.
  const indexResult = await safeReadIndex(workspaceRoot);
  const baseIndex: RunIndex = indexResult.ok
    ? indexResult.value
    : { schema_version: INDEX_SCHEMA_VERSION, runs: [] };

  const existingRunIds = new Set<string>(baseIndex.runs.map((r) => r.run_id));

  // No .ml/runs at all → nothing to scan; report reflects the (possibly
  // empty) existing index.
  if (!(await exists(runsDir))) {
    report.already_indexed = baseIndex.runs.length;
    return report;
  }

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch {
    // Runs dir present but unreadable — surface empty scan rather than throw.
    report.already_indexed = baseIndex.runs.length;
    return report;
  }

  const runDirEntries = entries.filter((e) => e.isDirectory());
  report.scanned_run_dirs = runDirEntries.length;

  // Mutable working copy of the index runs list — we mutate then atomically
  // write back exactly once at the end.
  const updatedRuns: IndexEntry[] = [...baseIndex.runs];
  const newlyAddedMarkerPaths: string[] = [];

  for (const entry of runDirEntries) {
    const runDirAbs = path.join(runsDir, entry.name);
    const runJsonPath = path.join(runDirAbs, ARTIFACT_FILENAMES.RUN_JSON);
    const orphanMarkerPath = path.join(
      runDirAbs,
      ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER
    );
    const cancelledMarkerPath = path.join(
      runDirAbs,
      ARTIFACT_FILENAMES.CANCELLED_MARKER
    );
    const workspaceRelRunDir = toForwardSlashRelative(workspaceRoot, runDirAbs);

    const hasRunJson = await exists(runJsonPath);
    const hasOrphanMarker = await exists(orphanMarkerPath);
    const hasCancelledMarker = await exists(cancelledMarkerPath);

    // Already-indexed branch: requires run.json so we can read its run_id;
    // for a run dir that's already in the index, the run_id appears in
    // existingRunIds.
    let runMetadata: RunMetadata | null = null;
    if (hasRunJson) {
      const parsed = await readJsonFile<RunMetadata>(runJsonPath);
      if (parsed.ok) {
        runMetadata = parsed.value;
      } else {
        report.skipped.push(skipForReadResult(workspaceRelRunDir, parsed.error));
        continue;
      }

      if (
        typeof runMetadata.run_id !== 'string' ||
        runMetadata.run_id.length === 0
      ) {
        report.skipped.push({
          run_dir: workspaceRelRunDir,
          error: 'CORRUPT_RUN_JSON',
          message: 'run.json missing required string run_id field',
        });
        continue;
      }

      if (existingRunIds.has(runMetadata.run_id)) {
        report.already_indexed += 1;
        continue;
      }
    }

    // Cancelled-excluded branch: `.cancelled` marker + no run.json. Cancelled
    // runs (per §3.1.2) are NOT added to the index — they remain visible in
    // the orphan picker but can't appear in the canonical index because they
    // have no run.json to source canonical IndexEntry fields from.
    if (!hasRunJson && hasCancelledMarker) {
      report.cancelled_excluded.push({
        run_id: deriveRunIdFromDirName(entry.name),
        run_dir: workspaceRelRunDir,
        reason: 'cancelled',
      });
      continue;
    }

    // No run.json and no cancelled marker → MISSING_RUN_JSON skip. We can't
    // recover a run that has no canonical metadata file.
    if (!hasRunJson) {
      report.skipped.push({
        run_dir: workspaceRelRunDir,
        error: 'MISSING_RUN_JSON',
        message: `run.json not found under ${entry.name}`,
      });
      continue;
    }

    // At this point: hasRunJson === true, runMetadata is parsed + has run_id,
    // and run_id is NOT already in the index. Build the IndexEntry from the
    // run.json contents and append.
    if (runMetadata === null) {
      // Defensive — should be impossible given the early-continue branches
      // above, but keeps the type narrowing honest.
      report.skipped.push({
        run_dir: workspaceRelRunDir,
        error: 'CORRUPT_RUN_JSON',
        message: 'unexpected null run metadata after read',
      });
      continue;
    }

    const indexEntry = buildIndexEntryFromRunJson(
      runMetadata,
      workspaceRelRunDir
    );
    if (indexEntry === null) {
      report.skipped.push({
        run_dir: workspaceRelRunDir,
        error: 'CORRUPT_RUN_JSON',
        message:
          'run.json missing one or more fields required to construct an index entry (created_at / dataset.fingerprint_sha256 / label_column / artifacts.model_pkl)',
      });
      continue;
    }

    updatedRuns.push(indexEntry);
    existingRunIds.add(indexEntry.run_id);

    const reason: RecoveryReportEntry['reason'] = hasOrphanMarker
      ? 'index_orphan_marker'
      : 'pre_existing_orphan';

    report.recovered.push({
      run_id: indexEntry.run_id,
      run_dir: workspaceRelRunDir,
      reason,
    });

    if (hasOrphanMarker) {
      newlyAddedMarkerPaths.push(orphanMarkerPath);
    }
  }

  // Atomically persist the updated index iff we recovered anything.
  if (report.recovered.length > 0) {
    const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);
    await writeIndexAtomically(indexPath, {
      schema_version: baseIndex.schema_version || INDEX_SCHEMA_VERSION,
      runs: updatedRuns,
    });

    // After the index has been durably updated, the orphan markers for the
    // newly-recovered runs are stale and should be removed (their signal —
    // "index update failed" — is no longer true). Best-effort: a marker we
    // can't remove doesn't fail recovery, it'll just be ignored next pass
    // because its run_id is now indexed.
    for (const markerPath of newlyAddedMarkerPaths) {
      try {
        await fs.unlink(markerPath);
      } catch {
        // Swallow — see comment above.
      }
    }
  }

  return report;
}

/**
 * Best-effort run_id for a cancelled run with no run.json. The dir name is
 * Python's run_id by construction (Python writes runs under
 * `.ml/runs/<run_id>/`), so we surface it directly.
 */
function deriveRunIdFromDirName(dirName: string): string {
  return dirName;
}

/**
 * Build an `IndexEntry` from a parsed `run.json` (RunMetadata).
 *
 * `RunMetadata` and `IndexEntry` overlap structurally but not field-for-field:
 *  - `IndexEntry.summary.duration_ms` / `final_metrics` / `device` are NOT
 *    present in run.json (they come from result.json + outcome plumbing).
 *    For a recovered entry we synthesize a conservative summary: zero
 *    duration, empty final_metrics, device defaulted from any artifacts we
 *    can read off the run.json `hyperparameters` array (else 'cpu').
 *  - `IndexEntry.preset_id` and `name` are not stored in run.json directly
 *    in v0.3.6. We synthesize defaults — these recovered entries are
 *    rebuilt from run.json which is canonical for everything except the
 *    UI-display fields. The display fields will say "recovered run" so the
 *    user can tell the entry came from recovery, not from a live training.
 *  - `IndexEntry.status` is set to `succeeded` because run.json only lands
 *    after Python finishes successfully (cancelled runs have a `.cancelled`
 *    marker and no run.json — handled in `cancelled_excluded`).
 *
 * Returns `null` if the run.json is missing fields we can't synthesize.
 */
function buildIndexEntryFromRunJson(
  meta: RunMetadata,
  workspaceRelRunDir: string
): IndexEntry | null {
  if (
    typeof meta.created_at !== 'string' ||
    meta.created_at.length === 0
  ) {
    return null;
  }
  const datasetFp = meta.dataset?.fingerprint_sha256;
  if (typeof datasetFp !== 'string' || datasetFp.length === 0) {
    return null;
  }
  const labelColumn = meta.label_column;
  if (typeof labelColumn !== 'string' || labelColumn.length === 0) {
    return null;
  }
  const modelPklRel = meta.artifacts?.model_pkl;
  if (typeof modelPklRel !== 'string' || modelPklRel.length === 0) {
    return null;
  }

  // Workspace-relative model pkl path: run.json stores the path relative to
  // its run dir. Compose with the workspace-relative run dir to get the
  // canonical workspace-relative model pkl path.
  const modelPklWorkspaceRel = `${workspaceRelRunDir}/${modelPklRel}`.replace(
    /\\/g,
    '/'
  );

  return {
    run_id: meta.run_id,
    created_at: meta.created_at,
    name: 'recovered run',
    preset_id: 'std-train',
    status: 'succeeded',
    summary: {
      duration_ms: 0,
      final_metrics: {
        accuracy: typeof meta.metrics?.accuracy === 'number' ? meta.metrics.accuracy : 0,
      },
      // Phase 4 has no canonical device field in run.json. Default to cpu;
      // this only affects the index summary (run.json + result.json remain
      // authoritative for any consumer that needs the real device).
      device: 'cpu',
    },
    run_dir: workspaceRelRunDir,
    dataset_fingerprint_sha256: datasetFp,
    label_column: labelColumn,
    model_pkl: modelPklWorkspaceRel,
  };
}

/**
 * Convert a `readJsonFile` SafeError into a `RecoveryReportSkip` with the
 * categorized error enum from `src/types.ts`.
 */
function skipForReadResult(
  runDir: string,
  err: { code: string; message: string }
): RecoveryReportSkip {
  let error: RecoveryReportSkip['error'];
  switch (err.code) {
    case 'CORRUPT_JSON':
      error = 'CORRUPT_RUN_JSON';
      break;
    case 'NOT_FOUND':
      error = 'MISSING_RUN_JSON';
      break;
    default:
      error = 'READ_ERROR';
  }
  return { run_dir: runDir, error, message: err.message };
}

/**
 * Workspace-relative path with forward slashes (match the rest of the
 * codebase — IndexEntry.run_dir is forward-slash-only per types.ts).
 */
function toForwardSlashRelative(
  workspaceRoot: string,
  absolutePath: string
): string {
  const rel = path.relative(workspaceRoot, absolutePath);
  return rel.replace(/\\/g, '/');
}

/**
 * Atomic write of `.ml/outputs/index.json`: write to a sibling `.tmp` file,
 * then `fs.rename` into place. Mirrors Python's `os.replace()` pattern for
 * the cancelled/orphan markers. Ensures observers never see a half-written
 * index file.
 */
async function writeIndexAtomically(
  indexPath: string,
  index: RunIndex
): Promise<void> {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  const tmpPath = `${indexPath}.tmp`;
  const body = JSON.stringify(index, null, 2);
  await fs.writeFile(tmpPath, body, 'utf-8');
  await fs.rename(tmpPath, indexPath);
}

/**
 * Command handler for `runforge.recoverIndex`.
 *
 * Wraps `recoverIndexForWorkspace` with VS Code UI: surfaces a one-line
 * information message summarizing the report. Markdown rendering is
 * delegated to FT-BRIDGE-009's `renderRecoveryReport()` (parallel work) and
 * is wired up via dynamic import so this command does not hard-depend on
 * Bridge having shipped yet — if `renderRecoveryReport` is not available,
 * the information message is the user surface.
 *
 * Returns the RecoveryReport for any caller that wants to consume it
 * programmatically (the smoke test in particular).
 */
export async function recoverIndex(): Promise<RecoveryReport | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('Please open a workspace folder first.');
    return null;
  }
  const workspaceRoot = folders[0].uri.fsPath;

  let report: RecoveryReport;
  try {
    report = await recoverIndexForWorkspace(workspaceRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Recover Index failed: ${message}`);
    return null;
  }

  // Inline summary surface — Bridge owns the markdown render (FT-BRIDGE-009).
  const summary =
    `RunForge: recovered ${report.recovered.length} run(s) ` +
    `(${report.already_indexed} already indexed, ` +
    `${report.skipped.length} skipped, ` +
    `${report.cancelled_excluded.length} cancelled-excluded).`;
  vscode.window.showInformationMessage(summary);

  // Best-effort: if Bridge's render is on the codebase, open a markdown doc
  // with the structured report. Failure here must not break recovery.
  //
  // The module path is computed dynamically (string variable) so the TS
  // type checker doesn't try to resolve it statically — Bridge's
  // FT-BRIDGE-009 work is in parallel and the file may not exist yet.
  // Using `Function('return import(...)')` ensures the import is resolved
  // at runtime, not at compile time.
  try {
    const renderModulePath = './render/recovery-report-summary.js';
    const dynamicImport = new Function(
      'p',
      'return import(p);'
    ) as (p: string) => Promise<unknown>;
    const renderModule: unknown = await dynamicImport(renderModulePath).catch(
      () => null
    );
    const renderFn =
      renderModule &&
      typeof renderModule === 'object' &&
      'renderRecoveryReport' in renderModule
        ? (renderModule as { renderRecoveryReport: (r: RecoveryReport) => string })
            .renderRecoveryReport
        : null;
    if (renderFn) {
      const markdown = renderFn(report);
      const doc = await vscode.workspace.openTextDocument({
        content: markdown,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    }
  } catch {
    // Bridge render not yet shipped or threw — info message above is the
    // sufficient user surface.
  }

  return report;
}
