/**
 * Safe filesystem utilities for RunForge Phase 2.3
 *
 * Provides structured error handling for file operations.
 * Commands decide how to present messages; this module only returns structured results.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Result type for safe operations
 */
export type SafeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SafeError };

/**
 * Structured error information
 */
export interface SafeError {
  code: 'NOT_FOUND' | 'CORRUPT_JSON' | 'READ_ERROR' | 'PARSE_ERROR';
  message: string;
  path: string;
  recoveryHint?: string;
  originalError?: Error;
}

/**
 * Index entry from .runforge/index.json
 */
export interface IndexEntry {
  run_id: string;
  created_at: string;
  dataset_fingerprint: string;
  label_column: string;
  run_dir: string;
  model_pkl: string;
}

/**
 * Index file structure
 */
export interface RunIndex {
  runs: IndexEntry[];
}

/**
 * Check if a path exists
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file safely
 *
 * Returns structured error info instead of throwing.
 */
export async function readJsonFile<T>(filePath: string): Promise<SafeResult<T>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    try {
      const parsed = JSON.parse(content) as T;
      return { ok: true, value: parsed };
    } catch (parseError) {
      return {
        ok: false,
        error: {
          code: 'CORRUPT_JSON',
          message: `Invalid JSON in file`,
          path: filePath,
          recoveryHint: 'Check the file for syntax errors or restore from backup.',
          originalError: parseError instanceof Error ? parseError : undefined,
        },
      };
    }
  } catch (readError) {
    if (readError instanceof Error && 'code' in readError && readError.code === 'ENOENT') {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `File not found`,
          path: filePath,
          recoveryHint: 'Run a training first to generate this file.',
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'READ_ERROR',
        message: `Failed to read file`,
        path: filePath,
        originalError: readError instanceof Error ? readError : undefined,
      },
    };
  }
}

/**
 * Read the .runforge/index.json file safely
 *
 * Special handling:
 * - Missing directory → returns empty runs with hint
 * - Missing file → returns empty runs with hint
 * - Corrupt JSON → backs up file, returns empty runs with warning
 */
export async function safeReadIndex(workspaceRoot: string): Promise<SafeResult<RunIndex>> {
  const runforgeDir = path.join(workspaceRoot, '.runforge');
  const indexPath = path.join(runforgeDir, 'index.json');

  // Check if .runforge directory exists
  if (!(await exists(runforgeDir))) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'No .runforge directory found',
        path: runforgeDir,
        recoveryHint: 'Run a training first to generate runs.',
      },
    };
  }

  // Check if index.json exists
  if (!(await exists(indexPath))) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'No index.json found',
        path: indexPath,
        recoveryHint: 'Run a training first to generate runs.',
      },
    };
  }

  // Try to read and parse
  const result = await readJsonFile<RunIndex>(indexPath);

  if (!result.ok && result.error.code === 'CORRUPT_JSON') {
    // Backup corrupt file
    const backupPath = `${indexPath}.corrupt.${Date.now()}`;
    try {
      await fs.rename(indexPath, backupPath);
      result.error.recoveryHint = `Corrupt index backed up to ${path.basename(backupPath)}. Run a training to rebuild.`;
    } catch {
      // If backup fails, just note it
      result.error.recoveryHint = 'Index is corrupt. Run a training to rebuild.';
    }
  }

  return result;
}

/**
 * Read run.json for a specific run
 */
export async function safeReadRunJson(
  workspaceRoot: string,
  runDir: string
): Promise<SafeResult<Record<string, unknown>>> {
  // runDir is relative to .runforge, and points to run.json path
  // e.g., "runs/20240201-123456-abc12345/run.json"
  const runJsonPath = path.join(workspaceRoot, '.runforge', runDir);

  const result = await readJsonFile<Record<string, unknown>>(runJsonPath);

  if (!result.ok && result.error.code === 'NOT_FOUND') {
    result.error.recoveryHint = 'Run metadata is missing. The run may have been partially deleted.';
  }

  return result;
}

/**
 * Format a SafeError into a user-friendly message
 */
export function formatError(error: SafeError): string {
  let message = `${error.message}: ${path.basename(error.path)}`;
  if (error.recoveryHint) {
    message += `\n${error.recoveryHint}`;
  }
  return message;
}

/**
 * Get actionable error message for common scenarios
 */
export function getActionableMessage(error: SafeError): string {
  switch (error.code) {
    case 'NOT_FOUND':
      if (error.path.includes('.runforge')) {
        return 'No runs yet. Run a training to generate runs.';
      }
      return `File not found: ${path.basename(error.path)}`;

    case 'CORRUPT_JSON':
      return `${path.basename(error.path)} is corrupted. ${error.recoveryHint || 'Try restoring from backup.'}`;

    case 'READ_ERROR':
      return `Could not read ${path.basename(error.path)}. Check file permissions.`;

    case 'PARSE_ERROR':
      return `Invalid format in ${path.basename(error.path)}.`;

    default:
      return error.message;
  }
}
