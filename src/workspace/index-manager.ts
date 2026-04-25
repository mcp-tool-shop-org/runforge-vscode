/**
 * Index Manager — read-side only (iter #5a).
 *
 * Python ml_runner is now the single writer of `.ml/outputs/index.json`
 * (architectural consolidation; same pattern as F-COORD-003). The TS
 * extension only reads this file to surface past runs in the picker.
 *
 * Writers (`appendToIndex`, `ensureIndex`, `validateIndexEntry`) were
 * removed in this iteration; the `readIndex` migration shim still tolerates
 * the legacy bare-array shape from v1.0.1.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IndexEntry, RunIndex } from '../types.js';
import { WORKSPACE_PATHS } from '../types.js';

/**
 * Read all index entries.
 *
 * Accepts three on-disk shapes and normalizes to `IndexEntry[]`:
 * 1. Canonical `{schema_version, runs: IndexEntry[]}` — Python ml_runner output.
 * 2. Pre-iter#5a `{runs: IndexEntry[]}` (no schema_version) — TS-side legacy.
 * 3. Legacy bare-array `[entry, ...]` — v1.0.1 only; tolerated for read,
 *    NOT rewritten on disk (Python owns writes now).
 */
export async function readIndex(workspaceRoot: string): Promise<IndexEntry[]> {
  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);

  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Legacy bare-array shape (v1.0.1). Tolerate on read; do not rewrite —
    // Python is now the sole writer and will rewrite to canonical shape on
    // its next append.
    if (Array.isArray(parsed)) {
      return parsed as IndexEntry[];
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as RunIndex).runs)) {
      throw new Error('Index file is not a valid RunIndex ({schema_version, runs: IndexEntry[]})');
    }

    return (parsed as RunIndex).runs;
  } catch (error) {
    // If file doesn't exist, return empty array
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Create an ISO8601 timestamp with timezone offset (not Z)
 * Example: 2026-02-01T14:23:55-05:00
 */
export function createTimestamp(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const minutes = String(absOffset % 60).padStart(2, '0');

  // Format: YYYY-MM-DDTHH:mm:ss±HH:MM
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${hours}:${minutes}`;
}

/**
 * Get recent runs from index (newest first)
 */
export async function getRecentRuns(
  workspaceRoot: string,
  limit: number = 20
): Promise<IndexEntry[]> {
  const entries = await readIndex(workspaceRoot);
  // Return newest first (assumes entries are appended chronologically)
  return entries.slice(-limit).reverse();
}

/**
 * Find a run by ID
 */
export async function findRunById(
  workspaceRoot: string,
  runId: string
): Promise<IndexEntry | undefined> {
  const entries = await readIndex(workspaceRoot);
  return entries.find((e) => e.run_id === runId);
}
