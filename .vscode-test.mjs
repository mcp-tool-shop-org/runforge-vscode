/**
 * @vscode/test-cli configuration for RunForge Extension Host smoke harness.
 *
 * Per CONTRACT-PHASE-4.md §3.4: Mocha test glob over compiled JS in
 * out/test/extension-host/ (TS sources live in test/extension-host/).
 *
 * The fixture workspace is opened by the host so commands like
 * runforge.trainStandard see `vscode.workspace.workspaceFolders[0]` as the
 * Iris CSV directory. Each test still creates a per-test temp workspace under
 * the OS tmp dir to keep runs hermetic — the fixture workspace is the
 * activation default only.
 */
import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  label: 'extension-host-smoke',
  // Use `.eh.js` suffix instead of `.test.js` so vitest's `test/**/*.test.ts`
  // glob does not pick up the source TS files (which import from `vscode` —
  // only resolvable inside the Extension Host runtime).
  files: 'out/test/extension-host/**/*.eh.js',
  workspaceFolder: resolve(__dirname, 'test/fixtures/extension-host-workspace'),
  // Use stable VS Code; test-electron downloads + caches under .vscode-test/.
  version: 'stable',
  mocha: {
    // Use TDD UI (suite/test/suiteSetup) — matches the canonical VS Code
    // extension test sample style.
    ui: 'tdd',
    // Per-test 120s ceiling per §3.4. Activation + Python subprocess can be slow
    // on first CI run.
    timeout: 120_000,
    color: true,
    reporter: 'spec',
  },
  // Minimal launch args — keep workspace trust nag out of headless run.
  launchArgs: [
    '--disable-extensions', // suppress unrelated extensions
    '--disable-workspace-trust',
  ],
});
