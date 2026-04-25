/**
 * Safe filesystem utilities for RunForge Phase 2.3
 *
 * Provides structured error handling for file operations.
 * Commands decide how to present messages; this module only returns structured results.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { ARTIFACT_FILENAMES, WORKSPACE_PATHS, type RunIndex, type RunMetadata } from '../types.js';

/**
 * Result type for safe operations
 */
export type SafeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SafeError };

/**
 * Structured error information
 *
 * Phase 4 (FT-BACK-005): `WORKSPACE_NOT_TRUSTED` is the workspace-trust-guard
 * code surfaced by `executeRun` when `vscode.workspace.isTrusted` is false.
 * Per docs/TRUST_MODEL.md, RunForge spawns a Python subprocess that loads a
 * dataset and writes artifacts under `.ml/`; both surfaces are gated on the
 * workspace being trusted by VS Code.
 */
export interface SafeError {
  code: 'NOT_FOUND' | 'CORRUPT_JSON' | 'READ_ERROR' | 'PARSE_ERROR' | 'WORKSPACE_NOT_TRUSTED';
  message: string;
  path: string;
  recoveryHint?: string;
  retryable?: boolean;
  originalError?: Error;
}

/**
 * Get the latest run directory under `<workspaceRoot>/.ml/runs` by mtime.
 *
 * Returns the absolute path to the most recently modified run directory,
 * or `null` if `.ml/runs` does not exist or is empty.
 *
 * Synchronous: callers in observability commands consume this directly without await.
 */
export function getLatestRunDir(workspaceRoot: string): string | null {
  const runsDir = path.join(workspaceRoot, WORKSPACE_PATHS.RUNS_DIR);
  if (!fsSync.existsSync(runsDir)) {
    return null;
  }

  const entries = fsSync.readdirSync(runsDir, { withFileTypes: true });
  const runDirs = entries
    .filter(e => e.isDirectory())
    .map(e => ({
      name: e.name,
      path: path.join(runsDir, e.name),
      mtime: fsSync.statSync(path.join(runsDir, e.name)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return runDirs.length > 0 ? runDirs[0].path : null;
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
          retryable: false,
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
          retryable: false,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'READ_ERROR',
        message: `Failed to read file`,
        path: filePath,
        retryable: true,
        originalError: readError instanceof Error ? readError : undefined,
      },
    };
  }
}

/**
 * Read the .ml/outputs/index.json file safely
 *
 * Special handling:
 * - Missing directory → returns empty runs with hint
 * - Missing file → returns empty runs with hint
 * - Corrupt JSON → backs up file, returns empty runs with warning
 */
export async function safeReadIndex(workspaceRoot: string): Promise<SafeResult<RunIndex>> {
  const mlRoot = path.join(workspaceRoot, WORKSPACE_PATHS.ML_ROOT);
  const indexPath = path.join(workspaceRoot, WORKSPACE_PATHS.INDEX_FILE);

  // Check if .ml directory exists
  if (!(await exists(mlRoot))) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'No .ml directory found',
        path: mlRoot,
        recoveryHint: 'Run a training first to generate runs.',
        retryable: false,
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
        retryable: false,
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
): Promise<SafeResult<RunMetadata>> {
  // runDir is workspace-relative and points to the run directory.
  // e.g., ".ml/runs/20240201-123456-abc12345" — append run.json to read metadata.
  const runJsonPath = path.join(workspaceRoot, runDir, ARTIFACT_FILENAMES.RUN_JSON);

  const result = await readJsonFile<RunMetadata>(runJsonPath);

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
      if (error.path.includes(WORKSPACE_PATHS.ML_ROOT)) {
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
