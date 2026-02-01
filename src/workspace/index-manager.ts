/**
 * Index Manager
 * Handles append-only index.json operations
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IndexEntry } from '../types.js';
import { WORKSPACE_PATHS } from '../types.js';

/**
 * Ensure the outputs directory and index file exist
 */
export async function ensureIndex(workspaceRoot: string): Promise<void> {
  const outputsDir = path.join(workspaceRoot, WORKSPACE_PATHS.OUTPUTS_DIR);
  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);

  // Create outputs directory
  await fs.mkdir(outputsDir, { recursive: true });

  // Create index file if missing
  try {
    await fs.access(indexPath);
  } catch {
    await fs.writeFile(indexPath, '[]', 'utf-8');
  }
}

/**
 * Read all index entries
 */
export async function readIndex(workspaceRoot: string): Promise<IndexEntry[]> {
  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);

  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    const entries = JSON.parse(content);

    if (!Array.isArray(entries)) {
      throw new Error('Index file is not an array');
    }

    return entries as IndexEntry[];
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Append a new entry to the index (append-only)
 * IMPORTANT: Never reorders or deletes existing entries
 */
export async function appendToIndex(workspaceRoot: string, entry: IndexEntry): Promise<void> {
  await ensureIndex(workspaceRoot);

  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);

  // Read existing entries
  const entries = await readIndex(workspaceRoot);

  // Validate entry has required fields
  validateIndexEntry(entry);

  // Append new entry
  entries.push(entry);

  // Write back (pretty-printed)
  await fs.writeFile(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Validate that an index entry has all required fields
 */
export function validateIndexEntry(entry: IndexEntry): void {
  const required: (keyof IndexEntry)[] = [
    'run_id',
    'created_at',
    'name',
    'preset_id',
    'status',
    'run_dir',
    'summary',
  ];

  for (const field of required) {
    if (entry[field] === undefined) {
      throw new Error(`Index entry missing required field: ${field}`);
    }
  }

  // Validate run_dir uses forward slashes
  if (entry.run_dir.includes('\\')) {
    throw new Error('Index entry run_dir must use forward slashes');
  }

  // Validate run_dir is relative (not absolute)
  if (path.isAbsolute(entry.run_dir)) {
    throw new Error('Index entry run_dir must be workspace-relative');
  }

  // Validate created_at is ISO8601
  if (!isValidISO8601(entry.created_at)) {
    throw new Error('Index entry created_at must be ISO8601 format');
  }

  // Validate status
  if (entry.status !== 'succeeded' && entry.status !== 'failed') {
    throw new Error('Index entry status must be "succeeded" or "failed"');
  }

  // Validate summary has required fields
  if (typeof entry.summary.duration_ms !== 'number') {
    throw new Error('Index entry summary.duration_ms must be a number');
  }

  if (typeof entry.summary.final_metrics !== 'object') {
    throw new Error('Index entry summary.final_metrics must be an object');
  }
}

/**
 * Check if a string is valid ISO8601 format
 */
function isValidISO8601(str: string): boolean {
  const date = new Date(str);
  return !isNaN(date.getTime());
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
