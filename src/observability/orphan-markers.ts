/**
 * Orphan-marker reader (Stage C Bridge amend).
 *
 * Surfaces "saved but not indexed" runs to the TS Bridge UI. Python's provenance
 * module writes a `.index-orphan` marker under a run directory when the run.json
 * landed cleanly but `append_run_to_index()` failed (disk full, permission
 * denied, corrupted index, etc.). This module is the canonical reader.
 *
 * Doctrine notes (docs/CONTRACTS.md):
 *  - Rule 1/3: imports `IndexOrphanMarker` from `src/types.ts`. No shadow type.
 *  - Rule 2: imports `ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER` /
 *    `WORKSPACE_PATHS.RUNS_DIR`. No literal `.index-orphan` or `.ml/runs` here.
 *  - Rule 4: contract mirrors `python/ml_runner/contracts/index-orphan.schema.v1.0.0.json`.
 *
 * Tolerance: corrupt or partial markers are logged into the SafeError-style
 * `skipped` channel and skipped, not thrown. Filesystem walk failures (no
 * `.ml/runs` directory) yield an empty list — same shape consumers already
 * handle for "no runs yet."
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ARTIFACT_FILENAMES,
  WORKSPACE_PATHS,
  type IndexOrphanMarker,
} from '../types.js';
import { exists, readJsonFile } from './fs-safe.js';

/** Reason a discovered marker was rejected during validation. */
export type OrphanSkipReason =
  | 'CORRUPT_JSON'
  | 'INVALID_SHAPE'
  | 'MISSING_RUN_JSON'
  | 'READ_ERROR';

/** Diagnostic for a marker the reader rejected. Surfaced for logging only. */
export interface OrphanSkip {
  /** Absolute path to the rejected marker. */
  markerPath: string;
  /** Run directory that contained the marker (workspace-relative-ish). */
  runDirName: string;
  /** Why it was rejected. */
  reason: OrphanSkipReason;
  /** Human-readable detail for logs. */
  detail: string;
}

/** Result of `listOrphanedRuns`: parsed markers + skip diagnostics. */
export interface OrphanScan {
  orphans: IndexOrphanMarker[];
  skipped: OrphanSkip[];
}

/**
 * Validate the parsed JSON against the canonical `IndexOrphanMarker` shape.
 *
 * Mirrors the JSON Schema at
 * python/ml_runner/contracts/index-orphan.schema.v1.0.0.json. Defensive — any
 * future drift between Python and TS shows up as INVALID_SHAPE in `skipped`,
 * not as a thrown exception in production.
 */
function isValidOrphanMarker(value: unknown): value is IndexOrphanMarker {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (v.schema_version !== 'index-orphan.v1.0.0') return false;
  if (typeof v.run_id !== 'string' || v.run_id.length === 0) return false;
  if (typeof v.run_dir !== 'string' || v.run_dir.length === 0) return false;
  if (typeof v.written_at !== 'string' || v.written_at.length === 0) return false;
  if (typeof v.index_path !== 'string' || v.index_path.length === 0) return false;

  const error = v.error;
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  if (typeof e.type !== 'string' || e.type.length === 0) return false;
  if (typeof e.message !== 'string') return false;
  if (e.traceback !== undefined && typeof e.traceback !== 'string') return false;

  return true;
}

/**
 * Walk `<workspaceRoot>/.ml/runs/` and read every `.index-orphan` marker.
 *
 * Returns parsed markers (passing shape validation) and a skip list for
 * markers that failed validation. The skip list lets callers log rejections
 * without polluting the user-visible orphan listing.
 *
 * Does NOT throw on:
 *  - missing `.ml/runs` directory (returns empty result)
 *  - missing `run.json` next to a marker (logs and skips — Python should always
 *    write run.json before the marker, so this is a defensive trip-wire)
 *  - corrupt/non-JSON marker (logs and skips)
 *  - marker missing required fields (logs and skips)
 */
export async function listOrphanedRuns(workspaceRoot: string): Promise<OrphanScan> {
  const runsDir = path.join(workspaceRoot, WORKSPACE_PATHS.RUNS_DIR);
  const result: OrphanScan = { orphans: [], skipped: [] };

  if (!(await exists(runsDir))) {
    return result;
  }

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch {
    // Directory present but unreadable — surface as empty scan rather than throw.
    return result;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const runDirAbs = path.join(runsDir, entry.name);
    const markerPath = path.join(runDirAbs, ARTIFACT_FILENAMES.INDEX_ORPHAN_MARKER);

    if (!(await exists(markerPath))) {
      // Normal indexed run — no marker, nothing to do.
      continue;
    }

    // Defensive: a marker without a sibling run.json is an inconsistent state
    // (Python writes run.json BEFORE attempting the index update). Skip + log.
    const runJsonPath = path.join(runDirAbs, ARTIFACT_FILENAMES.RUN_JSON);
    if (!(await exists(runJsonPath))) {
      result.skipped.push({
        markerPath,
        runDirName: entry.name,
        reason: 'MISSING_RUN_JSON',
        detail: `marker found but run.json missing under ${entry.name}`,
      });
      continue;
    }

    const parsed = await readJsonFile<unknown>(markerPath);
    if (!parsed.ok) {
      result.skipped.push({
        markerPath,
        runDirName: entry.name,
        reason: parsed.error.code === 'CORRUPT_JSON' ? 'CORRUPT_JSON' : 'READ_ERROR',
        detail: parsed.error.message,
      });
      continue;
    }

    if (!isValidOrphanMarker(parsed.value)) {
      result.skipped.push({
        markerPath,
        runDirName: entry.name,
        reason: 'INVALID_SHAPE',
        detail: 'marker JSON did not match IndexOrphanMarker shape',
      });
      continue;
    }

    result.orphans.push(parsed.value);
  }

  return result;
}

/**
 * Humanization-grade recovery copy keyed by `error.type`.
 *
 * Copy is deliberately non-stubby per the Stage C contract — each branch tells
 * the user (a) what happened, (b) why their run is still safe (run.json on
 * disk), and (c) what to do next. The Recover Index command itself is Phase 4
 * — until then, copy points at the manual recovery path.
 */
export function humanizeOrphanRecovery(marker: IndexOrphanMarker): string {
  const t = marker.error.type;
  const msg = marker.error.message;

  switch (t) {
    case 'PermissionError':
      return (
        'Run was saved but the workspace index could not be updated due to ' +
        'permission errors. Check that the .ml/outputs directory is writable.'
      );
    case 'OSError':
    case 'IOError':
      // OSError most commonly surfaces here as ENOSPC (disk full) on Linux/Mac
      // and as a generic OS error on Windows. Disk-full is the load-bearing
      // case to mention by name.
      return (
        'Run was saved but the workspace index could not be updated. Disk may ' +
        'be full — free space and try the Recover Index command (or re-run ' +
        'the training).'
      );
    case 'JSONDecodeError':
      return (
        'Run was saved but the workspace index appears corrupted. Use the ' +
        'Recover Index command to rebuild the index from existing run ' +
        'directories.'
      );
    case 'FileNotFoundError':
      return (
        'Run was saved but the workspace index file is missing. Use the ' +
        'Recover Index command to rebuild the index from existing run ' +
        'directories.'
      );
    default:
      return (
        'Run was saved but the workspace index could not be updated: ' +
        `${msg}. Open the run folder to verify artifacts.`
      );
  }
}
