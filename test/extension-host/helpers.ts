/**
 * Shared helpers for Extension Host smoke tests.
 *
 * Doctrine notes:
 *  - Per CONTRACT-PHASE-4.md §3.1.3, terminal run state MUST be detected from
 *    artifacts on disk + events observed during the run lifetime — never from
 *    process-exit timing. Helpers here expose marker/event readers, not exit
 *    reapers.
 *  - The fixture workspace is read-only canon; per-test scratch workspaces are
 *    cloned under the OS tmpdir so runs do not contaminate each other.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

/** Return path to the canonical Iris fixture inside the repo. */
export function fixtureWorkspacePath(): string {
  // The repo root is two levels up from out/test/extension-host/<file>.js
  // (out/test/extension-host -> out/test -> out -> repo root). Resolved at
  // runtime from __dirname after compilation.
  // Use a marker approach: walk upward looking for package.json with "name":"runforge".
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as { name?: string };
        if (pkg.name === 'runforge') {
          return path.join(dir, 'test', 'fixtures', 'extension-host-workspace');
        }
      } catch {
        // ignore and keep walking
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not locate runforge repo root from test runner');
}

/**
 * Clone the fixture workspace into a per-test scratch dir under the OS tmpdir.
 * Returns the absolute path; caller is responsible for cleanup.
 */
export function makeScratchWorkspace(label: string): string {
  const fixture = fixtureWorkspacePath();
  const stamp = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const scratch = path.join(os.tmpdir(), `runforge-smoke-${label}-${stamp}`);
  fs.mkdirSync(scratch, { recursive: true });
  // Copy iris.csv (the only fixture file we care about). Use copyFileSync for
  // simplicity — fixture is < 2KB.
  for (const entry of fs.readdirSync(fixture)) {
    const src = path.join(fixture, entry);
    const dst = path.join(scratch, entry);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
  return scratch;
}

/** Best-effort recursive cleanup of a scratch dir. */
export function cleanupScratch(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Cleanup is best-effort — don't fail tests on Windows lock contention.
  }
}

/**
 * Switch the active VS Code workspace to the given dir. Uses
 * `vscode.workspace.updateWorkspaceFolders` so we don't have to relaunch the
 * Extension Host between tests.
 */
export async function setWorkspaceFolder(dir: string): Promise<void> {
  const uri = vscode.Uri.file(dir);
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0 && folders[0].uri.fsPath === dir) {
    return; // already active
  }
  // Replace whatever folder(s) the host opened with the scratch dir. Note:
  // updateWorkspaceFolders triggers an async folder-change cascade — wait one
  // tick before returning so subsequent commands see the new folder.
  vscode.workspace.updateWorkspaceFolders(
    0,
    folders?.length ?? 0,
    { uri, name: path.basename(dir) }
  );
  await new Promise((r) => setTimeout(r, 250));
}

/** Wait for a predicate to return true; polls every `intervalMs` up to `timeoutMs`. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  opts: { timeoutMs?: number; intervalMs?: number; description?: string } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 250;
  const description = opts.description ?? 'condition';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for ${description} after ${timeoutMs}ms`);
}

/**
 * Return all `run.json` paths under `<workspaceRoot>/.ml/runs/<id>/run.json`.
 * Empty array if `.ml/runs/` does not exist yet.
 */
export function listRunJsonPaths(workspaceRoot: string): string[] {
  const runsDir = path.join(workspaceRoot, '.ml', 'runs');
  if (!fs.existsSync(runsDir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(runsDir, entry.name, 'run.json');
    if (fs.existsSync(candidate)) out.push(candidate);
  }
  return out;
}

/** Read + parse the canonical workspace index.json. Returns null if absent. */
export function readIndex(workspaceRoot: string): {
  schema_version?: string;
  runs: Array<{ run_id: string; [k: string]: unknown }>;
} | null {
  const indexPath = path.join(workspaceRoot, '.ml', 'outputs', 'index.json');
  if (!fs.existsSync(indexPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { runs?: unknown }).runs)) {
      return parsed as { schema_version?: string; runs: Array<{ run_id: string }> };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify that a parsed run.json matches the v0.3.6 shape minimally — i.e. the
 * REQUIRED fields per python/ml_runner/contracts/run.schema.v0.3.6.json. We
 * do not pull a full Ajv validator into the smoke harness; this is a shape
 * check sufficient to catch the v1.0.1-class bugs (missing run_id, missing
 * metrics_v1 pointer, etc.).
 */
export function assertRunJsonShape(runJson: unknown): asserts runJson is {
  run_id: string;
  schema_version: 'run.v0.3.6';
  created_at: string;
  dataset: { path: string; fingerprint_sha256: string };
  label_column: string;
  model_family: string;
  num_samples: number;
  num_features: number;
  metrics: { accuracy: number; num_samples: number; num_features: number };
  metrics_v1: { schema_version: 'metrics.v1'; artifact_path: string };
  artifacts: { model_pkl: string };
} {
  if (!runJson || typeof runJson !== 'object') {
    throw new Error('run.json is not an object');
  }
  const r = runJson as Record<string, unknown>;
  const required = [
    'run_id',
    'runforge_version',
    'schema_version',
    'created_at',
    'dataset',
    'label_column',
    'model_family',
    'num_samples',
    'num_features',
    'dropped_rows_missing_values',
    'metrics',
    'metrics_v1',
    'artifacts',
  ] as const;
  for (const key of required) {
    if (!(key in r)) {
      throw new Error(`run.json missing required field: ${key}`);
    }
  }
  if (r.schema_version !== 'run.v0.3.6') {
    throw new Error(`run.json schema_version must be 'run.v0.3.6', got ${String(r.schema_version)}`);
  }
  const dataset = r.dataset as Record<string, unknown>;
  if (typeof dataset.fingerprint_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(dataset.fingerprint_sha256)) {
    throw new Error('run.json dataset.fingerprint_sha256 must be a 64-char hex string');
  }
  const metricsV1 = r.metrics_v1 as Record<string, unknown>;
  if (metricsV1.schema_version !== 'metrics.v1') {
    throw new Error(`run.json metrics_v1.schema_version must be 'metrics.v1', got ${String(metricsV1.schema_version)}`);
  }
  if (typeof metricsV1.artifact_path !== 'string') {
    throw new Error('run.json metrics_v1.artifact_path must be a string');
  }
}

/**
 * Activate the RunForge extension and return its public API (if any). For
 * RunForge today, activation only registers commands — the API is implicit
 * via `vscode.commands.executeCommand`.
 */
export async function activateRunforge(): Promise<void> {
  const ext = vscode.extensions.getExtension('mcp-tool-shop.runforge');
  if (!ext) {
    throw new Error('RunForge extension (mcp-tool-shop.runforge) not found in test host');
  }
  if (!ext.isActive) {
    await ext.activate();
  }
}

/** Convenience: stub VS Code input prompts to return preset values for one test. */
export interface StubbedPrompts {
  /** Restore original behavior. Always call in afterEach. */
  restore: () => void;
}

export function stubInputBox(values: string[]): StubbedPrompts {
  const original = vscode.window.showInputBox;
  let i = 0;
  // Cast: VS Code typings overload showInputBox; we replace with a permissive
  // shim that returns the next preset value.
  (vscode.window as unknown as { showInputBox: typeof vscode.window.showInputBox }).showInputBox =
    (async () => {
      const v = values[i] ?? '';
      i += 1;
      return v;
    }) as typeof vscode.window.showInputBox;
  return {
    restore() {
      (vscode.window as unknown as { showInputBox: typeof vscode.window.showInputBox }).showInputBox =
        original;
    },
  };
}

/** Stub showOpenDialog to return a single-file pick. */
export function stubOpenDialog(filePath: string): StubbedPrompts {
  const original = vscode.window.showOpenDialog;
  (vscode.window as unknown as { showOpenDialog: typeof vscode.window.showOpenDialog }).showOpenDialog =
    (async () => [vscode.Uri.file(filePath)]) as typeof vscode.window.showOpenDialog;
  return {
    restore() {
      (vscode.window as unknown as { showOpenDialog: typeof vscode.window.showOpenDialog }).showOpenDialog =
        original;
    },
  };
}
