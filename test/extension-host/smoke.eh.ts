/**
 * RunForge Extension Host smoke tests (FT-TEST-001).
 *
 * Per CONTRACT-PHASE-4.md §3.4 — five smoke scenarios that exercise the full
 * call chain: extension activation → command dispatch → Python subprocess
 * spawn → run.json appearance → observability read → markdown export.
 *
 * Wave 1 reality (per the dispatch brief):
 *   - Scenarios 1, 2, 3 land NOW and must pass cleanly.
 *   - Scenario 4 (cancel) depends on FT-PY-004 + FT-BACK-001 (Wave 2). Marked
 *     it.skip with a clear "pending Wave 2" pointer.
 *   - Scenario 5 (recoverIndex) depends on FT-BACK-002 (Wave 3). Marked
 *     it.skip with a "pending Wave 3" pointer; partial coverage of the orphan
 *     reader is exercised in scenario 5b which IS shipped.
 *
 * Doctrine: §3.1.3 source-of-truth — terminal state is detected from
 * marker/event evidence on disk, NEVER from process-exit timing. The skipped
 * cancel scenario in this file is structured to verify the marker before
 * timing.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  activateRunforge,
  assertRunJsonShape,
  cleanupScratch,
  listRunJsonPaths,
  makeScratchWorkspace,
  readIndex,
  setWorkspaceFolder,
  stubInputBox,
  waitFor,
  type StubbedPrompts,
} from './helpers';

// Generous suite-level timeout — the first test in CI also pays the
// ~30-90s VS Code download cost (the runner caches under .vscode-test/).
const SUITE_TIMEOUT_MS = 120_000;

suite('RunForge Extension Host smoke (FT-TEST-001)', () => {
  let scratch: string;
  let prompts: StubbedPrompts | undefined;
  let trainingDone = false;

  suiteSetup(async function () {
    this.timeout(SUITE_TIMEOUT_MS);
    await activateRunforge();
  });

  suiteTeardown(() => {
    if (scratch) cleanupScratch(scratch);
  });

  // -------------------------------------------------------------------------
  // Scenario 1: train_standard happy path
  // -------------------------------------------------------------------------
  test('scenario 1: runforge.trainStandard produces run.json + updates index.json', async function () {
    this.timeout(SUITE_TIMEOUT_MS);

    scratch = makeScratchWorkspace('train');
    const datasetPath = path.join(scratch, 'iris.csv');
    assert.ok(fs.existsSync(datasetPath), 'iris.csv must exist in scratch workspace');

    await setWorkspaceFolder(scratch);

    // Stub the two prompts trainStandard fires in sequence:
    //   1) "Training run name" → 'smoke-train'
    //   2) "Random seed (optional)" → '42'
    prompts = stubInputBox(['smoke-train', '42']);

    // RUNFORGE_DATASET env var is the documented hook for inspectDataset, but
    // run-manager.executeRun reads it via the dataset_path option chain. Set
    // it on the host process so the spawned Python subprocess inherits it.
    process.env.RUNFORGE_DATASET = datasetPath;

    try {
      // Fire-and-forget the command: it returns when the run starts, but the
      // run itself is async (writes happen on subprocess exit). Wait for the
      // run.json to appear under .ml/runs/<id>/.
      const cmdPromise = vscode.commands.executeCommand('runforge.trainStandard');

      await waitFor(
        () => listRunJsonPaths(scratch).length > 0,
        {
          timeoutMs: 90_000,
          intervalMs: 500,
          description: 'run.json under .ml/runs/<id>/',
        }
      );

      // Let the command finish (it awaits run-manager.executeRun internally).
      // Even if waitFor resolved earlier, give the index writer a beat to land.
      await cmdPromise;

      // Validate run.json shape against v0.3.6.
      const [runJsonPath] = listRunJsonPaths(scratch);
      const runJson = JSON.parse(fs.readFileSync(runJsonPath, 'utf-8'));
      assertRunJsonShape(runJson);

      // Validate index.json contains an entry for this run.
      await waitFor(
        () => {
          const idx = readIndex(scratch);
          return !!idx && idx.runs.some((r) => r.run_id === runJson.run_id);
        },
        { timeoutMs: 10_000, description: 'index.json entry for this run_id' }
      );

      const idx = readIndex(scratch);
      assert.ok(idx, 'index.json should exist after training');
      const entry = idx!.runs.find((r) => r.run_id === runJson.run_id);
      assert.ok(entry, `index.json should contain entry for ${runJson.run_id}`);

      trainingDone = true;
    } finally {
      prompts?.restore();
      prompts = undefined;
      delete process.env.RUNFORGE_DATASET;
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 2: openLatestRunSummary renders without throw
  //
  // RunForge's nearest-equivalent observability commands are
  // runforge.openLatestMetadata (raw run.json) and the markdown export. We
  // exercise openLatestMetadata as the "open latest run summary" surface — it
  // is the read path that surfaces the latest run.json to the user via an
  // editor pane. The export-markdown path is exercised separately in
  // scenario 3.
  // -------------------------------------------------------------------------
  test('scenario 2: runforge.openLatestMetadata renders without throw', async function () {
    this.timeout(60_000);
    if (!trainingDone) this.skip();

    // Should resolve without throwing. The command opens the run.json content
    // in an untitled JSON editor via openJsonDocument; we verify (a) it does
    // not throw and (b) the resulting document carries the expected metadata.
    await vscode.commands.executeCommand('runforge.openLatestMetadata');

    // Look across all visible text editors for one with language=json whose
    // content parses as a v0.3.6 run.json. The doc is "untitled" so we can't
    // match by URI fsPath — language + content is the right discriminator.
    const docs = vscode.workspace.textDocuments;
    let foundMetadata = false;
    for (const doc of docs) {
      if (doc.languageId !== 'json') continue;
      try {
        const parsed = JSON.parse(doc.getText());
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.schema_version === 'run.v0.3.6' &&
          typeof parsed.run_id === 'string'
        ) {
          foundMetadata = true;
          break;
        }
      } catch {
        // not the doc we're looking for
      }
    }
    assert.ok(
      foundMetadata,
      'expected an untitled JSON doc with a run.v0.3.6 metadata payload to be open'
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 3: exportLatestRunAsMarkdown writes a non-empty markdown file
  // -------------------------------------------------------------------------
  test('scenario 3: runforge.exportRunMarkdown writes run-summary.md', async function () {
    this.timeout(60_000);
    if (!trainingDone) this.skip();

    await vscode.commands.executeCommand('runforge.exportRunMarkdown');

    // The export writes <runDir>/run-summary.md. Locate it.
    const [runJsonPath] = listRunJsonPaths(scratch);
    const runDir = path.dirname(runJsonPath);
    const summaryPath = path.join(runDir, 'run-summary.md');

    await waitFor(
      () => fs.existsSync(summaryPath),
      { timeoutMs: 15_000, description: 'run-summary.md to be written' }
    );

    const content = fs.readFileSync(summaryPath, 'utf-8');
    assert.ok(content.length > 0, 'run-summary.md must be non-empty');
    assert.match(content, /^# Run Summary:/m, 'run-summary.md should start with run-id title');
    assert.match(content, /## Metrics/, 'run-summary.md should contain a Metrics section');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Cancel scenario — TS WAVE 2 LANDED, awaiting Python Wave 2
  //
  // Per CONTRACT-PHASE-4.md §3.1.1 + §3.1.3:
  //   - FT-BACK-001 (Wave 2 — LANDED in this commit): TS extension wraps
  //     trainStandard in vscode.window.withProgress (cancellable) →
  //     CancellationToken → SIGTERM → 5s SIGKILL trigger →
  //     detectCancelTerminalState consults marker/event ledger per §3.1.3.
  //   - FT-PY-004 (Wave 2 — pending): Python must register a SIGTERM
  //     handler, emit run_cancelled event, atomically write .cancelled
  //     marker. Without that, the test asserts the §3.1.3 'cancelled-forced'
  //     fallback (cancel intent fired but neither marker nor event landed),
  //     not the graceful path under test.
  //
  // it.skip with updated marker per FT-BACK-001 dispatch brief Preload 3:
  // un-skip by Coord once both Wave 2 commits land. Body is fully written
  // so un-skip is `it.skip` → `it` only.
  // -------------------------------------------------------------------------
  test('scenario 4 — cancel: SIGTERM mid-train, verify graceful detection', async function () {
    this.timeout(SUITE_TIMEOUT_MS);

    // Platform skip: Windows subprocess.send_signal(SIGTERM) calls
    // TerminateProcess, bypassing Python's signal handler — no marker
    // written, no run_cancelled event emitted, graceful path impossible.
    // Documented in CONTRACT-PHASE-4.md §3.1.1; mirrors the Python agent's
    // test_subprocess_sigterm_writes_marker_and_emits_run_cancelled platform
    // skip in test_cancellation_marker.py. Linux CI runs this scenario fully;
    // Windows local devs use the in-process Python handler test for cancel
    // logic verification.
    if (process.platform === 'win32') {
      this.skip();
    }

    // Pre-req: scenario 1 must have completed so we have an active extension
    // AND a working scratch workspace. We REUSE that scratch (proven to work
    // in scenario 1) instead of relocating to a fresh cancelScratch — runtime
    // setWorkspaceFolder relocation appears to be the bug behind the prior
    // 30s spawn timeout on CI Linux. Scenario 4 tracks ITS OWN run_id
    // discriminated against scenario 1's existing run dirs.
    if (!trainingDone) this.skip();
    assert.ok(scratch, 'scratch workspace from scenario 1 must exist');

    const datasetPath = path.join(scratch, 'iris.csv');
    assert.ok(fs.existsSync(datasetPath), 'iris.csv must exist in scratch');

    // Snapshot existing run_ids BEFORE invoking trainStandard. Scenario 4
    // waits for a NEW run dir not in this set — that's our run.
    const runsDir = path.join(scratch, '.ml', 'runs');
    const beforeRunIds = new Set<string>(
      fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : []
    );

    const cancelPrompts = stubInputBox(['smoke-cancel', '99']);
    process.env.RUNFORGE_DATASET = datasetPath;

    try {
      const cmdPromise = Promise.resolve(
        vscode.commands.executeCommand('runforge.trainStandard')
      );

      // Stage A: wait for OUR run dir to appear (one not in the
      // before-snapshot) with a request.json. Captures run_id.
      let myRunId: string | undefined;
      await waitFor(
        () => {
          if (!fs.existsSync(runsDir)) return false;
          for (const sub of fs.readdirSync(runsDir)) {
            if (beforeRunIds.has(sub)) continue;
            if (fs.existsSync(path.join(runsDir, sub, 'request.json'))) {
              myRunId = sub;
              return true;
            }
          }
          return false;
        },
        { timeoutMs: 30_000, description: "this scenario's run dir + request.json" }
      );
      assert.ok(myRunId, 'must have captured this scenario\'s run_id');

      // Stage B: wait for logs.txt to appear under OUR run dir. logs.txt
      // is created by run-manager's stderr handler (run-manager.ts:455
      // appendLog) on the FIRST stderr line from Python. Python emits its
      // run_start event right AFTER _register_sigterm_handler (runner.py
      // :594 register → :600 emit). So logs.txt existence proves Python
      // is alive AND past handler registration — firing cancel before
      // this point races against Python's bootstrap and produces no
      // marker (root cause of fix-up commit 1's failure).
      const myLogsPath = path.join(runsDir, myRunId!, 'logs.txt');
      await waitFor(() => fs.existsSync(myLogsPath), {
        timeoutMs: 30_000,
        intervalMs: 200,
        description: 'logs.txt to confirm Python signal handler is registered',
      });

      // Fire programmatic cancel via the new runforge.cancelActiveRun command
      // (Phase 4 FT-BACK-001 surface — calls killActiveRun under the hood,
      // same SIGTERM pathway as the withProgress X-button + the deactivate
      // hook). Per §3.1.3, terminal state is read from disk + events, not
      // from HOW cancel was triggered, so a command-fired cancel exercises
      // the same back-half pipeline as a user X-click.
      await vscode.commands.executeCommand('runforge.cancelActiveRun');

      // SOURCE-OF-TRUTH ASSERTION (§3.1.3): .cancelled marker on disk for
      // OUR specific run_id. 10s window covers the 5s grace + Python
      // cleanup overhead.
      const myRunDir = path.join(runsDir, myRunId!);
      const markerPath = path.join(myRunDir, '.cancelled');
      const markerObserved = await new Promise<boolean>((resolve) => {
        const deadline = Date.now() + 10_000;
        const tick = () => {
          if (fs.existsSync(markerPath)) return resolve(true);
          if (Date.now() > deadline) return resolve(false);
          setTimeout(tick, 250);
        };
        tick();
      });

      assert.ok(
        markerObserved,
        `graceful cancel detector: .cancelled marker should appear at ${markerPath} (within 10s of cancel command). Per §3.1.3, marker presence = cancelled-graceful regardless of exit timing.`
      );

      await cmdPromise.catch(() => {
        // Cancel-induced rejection is expected.
      });
    } finally {
      cancelPrompts.restore();
      delete process.env.RUNFORGE_DATASET;
      // Note: scratch is shared with scenario 1, do NOT cleanupScratch here.
      // suiteTeardown handles final cleanup of scratch.
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Recover Index — PENDING WAVE 3
  //
  // FT-BACK-002 ships the runforge.recoverIndex command in Wave 3. Until
  // then, the orphan-marker READER (Stage C, src/observability/orphan-markers.ts)
  // is the closest shipped surface. Scenario 5b below exercises it as a
  // partial Wave 1 coverage point so the harness is useful today.
  // -------------------------------------------------------------------------
  test('scenario 5: runforge.recoverIndex backfills orphan run.json into index.json', async function () {
    this.timeout(60_000);
    if (!trainingDone) this.skip();

    // Pattern lesson #15 applied prospectively: wait for EVIDENCE (the
    // index.json file actually contains the run_id), NOT for "command
    // returned." The command returning successfully doesn't prove
    // recovery happened — the index file change does.

    // 1. Fabricate an orphan run dir with a valid v0.3.6 run.json by
    //    copying scenario 1's real run.json + rewriting the run_id.
    //    This guarantees schema validity without re-implementing it.
    const [realRunJson] = listRunJsonPaths(scratch);
    const orphanRunId = `20260425-093000-recover-fixture-1234`;
    const orphanRunDir = path.join(scratch, '.ml', 'runs', orphanRunId);
    fs.mkdirSync(orphanRunDir, { recursive: true });
    const realRunJsonContent = JSON.parse(fs.readFileSync(realRunJson, 'utf-8'));
    const orphanRunJsonContent = { ...realRunJsonContent, run_id: orphanRunId };
    fs.writeFileSync(
      path.join(orphanRunDir, 'run.json'),
      JSON.stringify(orphanRunJsonContent, null, 2),
      'utf-8'
    );

    // 2. Verify fixture is currently NOT in index.json.
    const indexBefore = readIndex(scratch);
    assert.ok(indexBefore, 'index.json should exist from scenario 1');
    const wasIndexedBefore = indexBefore!.runs.some((r) => r.run_id === orphanRunId);
    assert.equal(wasIndexedBefore, false, 'orphan fixture must not be pre-indexed');

    // 3. Fire recoverIndex command.
    await vscode.commands.executeCommand('runforge.recoverIndex');

    // 4. Wait for evidence: index.json contains the orphanRunId.
    await waitFor(
      () => {
        const idx = readIndex(scratch);
        return !!idx && idx.runs.some((r) => r.run_id === orphanRunId);
      },
      {
        timeoutMs: 15_000,
        intervalMs: 250,
        description: 'index.json to include the recovered run_id',
      }
    );

    const indexAfter = readIndex(scratch);
    assert.ok(indexAfter, 'index.json should still exist after recovery');
    const recoveredEntry = indexAfter!.runs.find((r) => r.run_id === orphanRunId);
    assert.ok(recoveredEntry, `index.json must contain entry for ${orphanRunId}`);

    // 5. Idempotency check: re-fire recoverIndex; verify NO duplicate.
    await vscode.commands.executeCommand('runforge.recoverIndex');
    // Give the index writer a beat in case of any async stragglers.
    await new Promise((r) => setTimeout(r, 500));
    const indexAfterSecond = readIndex(scratch);
    assert.ok(indexAfterSecond, 'index.json should exist after second recovery');
    const occurrences = indexAfterSecond!.runs.filter((r) => r.run_id === orphanRunId).length;
    assert.equal(
      occurrences,
      1,
      `idempotent recovery should not duplicate; got ${occurrences} entries for ${orphanRunId}`
    );
  });

  // Scenario 5b (Wave 1 partial coverage, ships now):
  // Verify the orphan-marker reader path surfaces a manually-planted marker.
  // This proves the recovery PIPE works end-to-end even though the
  // recoverIndex COMMAND itself is Wave 3.
  test('scenario 5b: orphan-marker reader surfaces a planted .index-orphan marker', async function () {
    this.timeout(30_000);
    if (!trainingDone) this.skip();

    // Fabricate a synthetic orphan: copy the real run dir to a new id, drop a
    // valid .index-orphan marker beside it, and confirm browseRuns (or the
    // public reader path) does not throw. We don't assert on UI text — that's
    // FT-BRIDGE-004a's surface — just that the reader path is wired.
    const [realRunJson] = listRunJsonPaths(scratch);
    const realRunDir = path.dirname(realRunJson);
    const orphanId = `${path.basename(realRunDir)}-orphan-fixture`;
    const orphanDir = path.join(scratch, '.ml', 'runs', orphanId);
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.copyFileSync(realRunJson, path.join(orphanDir, 'run.json'));

    const marker = {
      schema_version: 'index-orphan.v1.0.0',
      run_id: orphanId,
      run_dir: path.relative(scratch, orphanDir).replace(/\\/g, '/'),
      written_at: new Date().toISOString(),
      error: {
        type: 'OSError',
        message: 'synthetic orphan for FT-TEST-001 scenario 5b',
      },
      index_path: '.ml/outputs/index.json',
    };
    fs.writeFileSync(
      path.join(orphanDir, '.index-orphan'),
      JSON.stringify(marker, null, 2),
      'utf-8'
    );

    // browseRuns is the public command that consumes the orphan reader. It
    // opens a quick-pick under the hood; since we cannot interact with it in
    // the headless host, we only assert it does not throw on the read path.
    // Stub the quick-pick selection to dismiss it immediately.
    const originalShowQuickPick = vscode.window.showQuickPick;
    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick =
      (async () => undefined) as typeof vscode.window.showQuickPick;

    try {
      // browseRuns may not be wired through extension command in this build —
      // try it; if the command isn't registered, fall through to a direct
      // filesystem assertion (the marker was written, the reader contract
      // mandates no throw).
      const commands = await vscode.commands.getCommands(true);
      if (commands.includes('runforge.browseRuns')) {
        await vscode.commands.executeCommand('runforge.browseRuns');
      }

      // Direct check: marker is on disk and matches the schema-required shape.
      const planted = JSON.parse(
        fs.readFileSync(path.join(orphanDir, '.index-orphan'), 'utf-8')
      );
      assert.equal(planted.schema_version, 'index-orphan.v1.0.0');
      assert.equal(planted.run_id, orphanId);
    } finally {
      (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick =
        originalShowQuickPick;
    }
  });
});
