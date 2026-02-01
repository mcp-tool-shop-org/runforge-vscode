/**
 * Run Folder Manager
 * Handles run ID generation and folder structure
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RunIdComponents, RunRequest, RunResult, WORKSPACE_PATHS } from '../types.js';

/**
 * Generate a unique run ID
 * Format: YYYYMMDD-HHMMSS-<slug>-<rand4>
 * Example: 20260201-142355-run-a3f9
 */
export function generateRunId(name: string): string {
  const now = new Date();
  const date = formatDate(now);
  const time = formatTime(now);
  const slug = toSlug(name);
  const rand = randomHex(4);

  return `${date}-${time}-${slug}-${rand}`;
}

/**
 * Parse a run ID into components
 */
export function parseRunId(runId: string): RunIdComponents | null {
  const match = runId.match(/^(\d{8})-(\d{6})-([a-z0-9-]+)-([a-f0-9]{4})$/);
  if (!match) return null;

  return {
    date: match[1],
    time: match[2],
    slug: match[3],
    rand: match[4],
  };
}

/**
 * Validate run ID format
 */
export function isValidRunId(runId: string): boolean {
  return parseRunId(runId) !== null;
}

/**
 * Convert name to slug (alphanumeric + dashes only)
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing dashes
    .substring(0, 32)              // Limit length
    || 'run';                      // Default if empty
}

/**
 * Format date as YYYYMMDD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format time as HHMMSS
 */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}${minutes}${seconds}`;
}

/**
 * Generate random hex string
 */
function randomHex(length: number): string {
  const chars = 'abcdef0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Create the run folder structure
 * Creates: .ml/runs/<run_id>/
 *          .ml/runs/<run_id>/artifacts/
 */
export async function createRunFolder(workspaceRoot: string, runId: string): Promise<string> {
  const runDir = path.join(workspaceRoot, '.ml', 'runs', runId);
  const artifactsDir = path.join(runDir, 'artifacts');

  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  return runDir;
}

/**
 * Write request.json to run folder
 */
export async function writeRequest(runDir: string, request: RunRequest): Promise<void> {
  const filePath = path.join(runDir, 'request.json');
  await fs.writeFile(filePath, JSON.stringify(request, null, 2), 'utf-8');
}

/**
 * Write result.json to run folder
 */
export async function writeResult(runDir: string, result: RunResult): Promise<void> {
  const filePath = path.join(runDir, 'result.json');
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
}

/**
 * Append to logs.txt in run folder
 */
export async function appendLog(runDir: string, line: string): Promise<void> {
  const filePath = path.join(runDir, 'logs.txt');
  await fs.appendFile(filePath, line + '\n', 'utf-8');
}

/**
 * Read metrics.json from run folder (if exists)
 */
export async function readMetrics(runDir: string): Promise<Record<string, number>> {
  const filePath = path.join(runDir, 'metrics.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const metrics = JSON.parse(content);
    // Filter to only numeric values
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {}; // No metrics file or invalid JSON
  }
}

/**
 * Get workspace-relative path with forward slashes
 */
export function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string {
  const relative = path.relative(workspaceRoot, absolutePath);
  return relative.replace(/\\/g, '/'); // Windows backslashes → forward slashes
}
