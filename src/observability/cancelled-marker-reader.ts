/**
 * Cancelled-marker reader (FT-BACK-001 / Phase 4 Wave 2).
 *
 * Sibling to `orphan-markers.ts` — surfaces ".cancelled" markers written by
 * Python provenance after a SIGTERM-handled graceful shutdown. The presence
 * of this marker, atomically written via `os.replace()`, is one half of the
 * §3.1.3 source-of-truth detector for cancelled-graceful (the other half is
 * the `run_cancelled` event observed in stderr).
 *
 * Doctrine notes (docs/CONTRACTS.md):
 *  - Rule 1/3: imports `IndexCancelledMarker` from `src/types.ts`. No shadow
 *    type lives here.
 *  - Rule 2: imports `ARTIFACT_FILENAMES.CANCELLED_MARKER` /
 *    `WORKSPACE_PATHS.RUNS_DIR`. No literal `.cancelled` or `.ml/runs`.
 *  - Rule 4: contract mirrors `python/ml_runner/contracts/cancelled.schema.v1.0.0.json`.
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
  type IndexCancelledMarker,
} from '../types.js';
import { exists, readJsonFile } from './fs-safe.js';

/** Reason a discovered marker was rejected during validation. */
export type CancelledSkipReason = 'CORRUPT_JSON' | 'INVALID_SHAPE' | 'READ_ERROR';

/** Diagnostic for a marker the reader rejected. Surfaced for logging only. */
export interface CancelledSkip {
  /** Absolute path to the rejected marker. */
  markerPath: string;
  /** Run directory that contained the marker. */
  runDirName: string;
  /** Why it was rejected. */
  reason: CancelledSkipReason;
  /** Human-readable detail for logs. */
  detail: string;
}

/** Result of `listCancelledRuns`: parsed markers + skip diagnostics. */
export interface CancelledScan {
  cancelled: IndexCancelledMarker[];
  skipped: CancelledSkip[];
}

const VALID_STEPS: ReadonlySet<string> = new Set([
  'dataset_loading',
  'training',
  'metrics_computation',
  'artifact_writing',
  'shutdown',
]);

/**
 * Validate parsed JSON against the canonical `IndexCancelledMarker` shape.
 *
 * Mirrors python/ml_runner/contracts/cancelled.schema.v1.0.0.json. Any drift
 * between Python and TS shows up as `INVALID_SHAPE` in `skipped`, not as a
 * thrown exception in production.
 */
export function isValidCancelledMarker(value: unknown): value is IndexCancelledMarker {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (v.schema_version !== 'cancelled.v1.0.0') return false;
  if (typeof v.run_id !== 'string' || v.run_id.length === 0) return false;
  if (typeof v.run_dir !== 'string' || v.run_dir.length === 0) return false;
  if (typeof v.cancelled_at !== 'string' || v.cancelled_at.length === 0) return false;
  if (typeof v.step !== 'string' || !VALID_STEPS.has(v.step)) return false;

  if (v.reason !== undefined && typeof v.reason !== 'string') return false;
  if (v.partial_artifacts !== undefined) {
    if (!Array.isArray(v.partial_artifacts)) return false;
    if (!v.partial_artifacts.every((entry): entry is string => typeof entry === 'string')) {
      return false;
    }
  }

  return true;
}

/**
 * Read a `.cancelled` marker for a single run directory.
 *
 * Returns:
 *  - `null` if the marker file is absent (the common case for a non-cancelled
 *    or SIGKILL-forced run).
 *  - A parsed `IndexCancelledMarker` if present and valid.
 *  - Throws nothing on corrupt/invalid markers — those return `null` so the
 *    state-machine detector can fall through to "cancelled-forced". Use
 *    `listCancelledRuns` if you need the structured skip diagnostics.
 *
 * @param runDir Absolute path to the run directory.
 */
export async function readCancelledMarker(runDir: string): Promise<IndexCancelledMarker | null> {
  const markerPath = path.join(runDir, ARTIFACT_FILENAMES.CANCELLED_MARKER);
  if (!(await exists(markerPath))) {
    return null;
  }

  const parsed = await readJsonFile<unknown>(markerPath);
  if (!parsed.ok) {
    // Corrupt/partial marker — the §3.1.3 detector treats this as marker-absent
    // (defensive: an in-flight write could leave a partial file even though
    // Python uses os.replace() for atomicity; preserve safety).
    return null;
  }

  if (!isValidCancelledMarker(parsed.value)) {
    return null;
  }

  return parsed.value;
}

/**
 * Walk `<workspaceRoot>/.ml/runs/` and read every `.cancelled` marker.
 *
 * Mirrors `listOrphanedRuns` shape — parsed markers + skip diagnostics for
 * markers that failed validation. Used by future UI surfaces (Phase 5+
 * cancelled-runs picker) and by tests that assert reader-level behavior.
 *
 * Does NOT throw on:
 *  - missing `.ml/runs` directory (returns empty result)
 *  - corrupt/non-JSON marker (logs and skips)
 *  - marker missing required fields (logs and skips)
 */
export async function listCancelledRuns(workspaceRoot: string): Promise<CancelledScan> {
  const runsDir = path.join(workspaceRoot, WORKSPACE_PATHS.RUNS_DIR);
  const result: CancelledScan = { cancelled: [], skipped: [] };

  if (!(await exists(runsDir))) {
    return result;
  }

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const runDirAbs = path.join(runsDir, entry.name);
    const markerPath = path.join(runDirAbs, ARTIFACT_FILENAMES.CANCELLED_MARKER);

    if (!(await exists(markerPath))) {
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

    if (!isValidCancelledMarker(parsed.value)) {
      result.skipped.push({
        markerPath,
        runDirName: entry.name,
        reason: 'INVALID_SHAPE',
        detail: 'marker JSON did not match IndexCancelledMarker shape',
      });
      continue;
    }

    result.cancelled.push(parsed.value);
  }

  return result;
}
