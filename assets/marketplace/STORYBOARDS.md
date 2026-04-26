# Marketplace GIF storyboards

Four GIFs for the runforge marketplace listing. Each is a screen recording of VS Code with the runforge extension installed in a clean workspace.

**Recording specs (all 4):**
- Output format: animated GIF, **1280×720** (matches Marketplace gallery rendering at 2× retina pixel-density)
- Frame rate: 12-15 fps (smooth enough; keeps file size <1.5 MB each)
- Length: 8-12 seconds per GIF (covers the loop without dragging)
- VS Code theme: **Dark+ (default dark)** — matches `galleryBanner: { color: "#1E1E1E", theme: "dark" }`
- Cursor visible. No personal data in the file tree (use a clean `runforge-demo/` workspace).
- Caption rendered as a small dark overlay with white text in the lower-left corner during the action moments.

Drop final files at: `assets/marketplace/01-train-then-cancel.gif`, `02-browse-runs.gif`, `03-interpretability.gif`, `04-recover-index.gif`.

---

## GIF 1 — `01-train-then-cancel.gif` (the headline GIF)

**Beat:** User starts a training run, sees real-time progress in the status bar + notification, hits cancel, sees the graceful 5s SIGTERM countdown.

**Frames:**

1. (0:00–0:01) Open command palette (Cmd+Shift+P) — `RunForge: Train (Standard)` highlighted.
2. (0:01–0:02) Click. Notification appears: `RunForge: training "demo-run-001"` with the X cancel button. Status bar bottom-right shows `$(loading~spin) RunForge: starting…`.
3. (0:02–0:05) Status bar updates: `$(zap) RunForge: Epoch 1/10 — loss=0.42`, then `2/10 — loss=0.31`, `3/10 — loss=0.23`. The notification message updates in lockstep.
4. (0:05–0:06) Caption appears lower-left: `Per-epoch progress in the status bar and notification`.
5. (0:06–0:07) User clicks the X cancel button on the notification.
6. (0:07–0:11) Status bar shows `$(stop-circle) RunForge: cancelling… 5s`, counts down `4s`, `3s`, `2s`, `1s`. Caption updates: `5-second graceful cancel — SIGTERM, then SIGKILL`.
7. (0:11–0:12) Status bar clears. Output channel briefly visible: `[event] run_cancelled run_id=demo-run-001`.

**Why this is the headline:** the cancel UX is the trust differentiator — every other ML extension lets you fire-and-pray.

---

## GIF 2 — `02-browse-runs.gif`

**Beat:** Browse the run history TreeView, click a run, see the metadata.

**Frames:**

1. (0:00–0:02) Click activity-bar RunForge icon. Side panel opens with the runs TreeView. Three runs listed (demo-run-001 ✓, demo-run-002 ✓, demo-run-003 ✗ failed).
2. (0:02–0:04) Hover over demo-run-001 — tooltip shows model + finished-at. Caption: `Run history with provenance — every run is replayable`.
3. (0:04–0:06) Click. `metadata.json` opens in the editor with syntax highlighting. The `provenance` block is in view (git SHA, dataset hash, profile, hyperparameters).
4. (0:06–0:08) Scroll down to `metrics.v1` block. Caption: `Deterministic — same dataset + same profile = same model`.
5. (0:08–0:09) Cursor pauses on the dataset_hash field. End on a clean frame.

---

## GIF 3 — `03-interpretability.gif`

**Beat:** From a finished run, open the interpretability index. Show the feature importance table.

**Frames:**

1. (0:00–0:02) Command palette: `RunForge: View Latest Interpretability Index`. Click.
2. (0:02–0:04) A markdown file renders in the editor pane. Top-of-file is a per-feature contribution table. Caption: `Interpretability index — what the model actually learned`.
3. (0:04–0:06) Cursor scrolls down. Feature importance bar chart visible (rendered as ascii or markdown table — match what `viewInterpretabilityIndex` actually produces).
4. (0:06–0:08) Bottom of file — linear coefficients for the top features. Caption: `Open the recommendation file alongside metrics.json — same single-source-of-truth`.
5. (0:08–0:10) Cursor pauses on a coefficient. End frame.

---

## GIF 4 — `04-recover-index.gif`

**Beat:** Demonstrate orphan recovery. User has run dirs that aren't in the index; `recoverIndex` finds and reincorporates them.

**Frames:**

1. (0:00–0:02) File explorer shows `.ml/runs/` with three run directories. Caption: `Three runs on disk — only one in the index`.
2. (0:02–0:04) Open the runs TreeView — only one run visible.
3. (0:04–0:06) Command palette: `RunForge: Recover Index`. Click.
4. (0:06–0:08) Notification: `RunForge: recovered 2 run(s) (1 already indexed, 0 skipped, 0 cancelled-excluded).` A markdown report file opens with the recovery breakdown.
5. (0:08–0:10) TreeView refreshes — all three runs now visible. Caption: `Idempotent recovery — safe to run any time`.

---

## Recording workflow (recommended)

1. Set up a clean workspace at `~/runforge-demo/` with a small CSV (e.g., the iris.csv classic).
2. Install runforge from the `.vsix` (not the marketplace) so you control the version.
3. Use any decent screen recorder that exports GIF. Suggested: **ScreenToGif** (Windows) or **Kap** (macOS). Both let you trim, add captions in-app, and export at fixed FPS.
4. Add captions in-tool, not in post — saves a round trip.
5. Optimize each GIF with `gifsicle -O3` to cap file size around 1-1.5 MB. Marketplace serves the GIFs inline; oversized files hurt page load.
6. Drop final GIFs in `assets/marketplace/` — `package.json` doesn't reference them directly, but the marketplace listing pulls from `README.md` image refs (so README needs `![Train and cancel](assets/marketplace/01-train-then-cancel.gif)` style refs in the gallery section).

---

## Coord note

GIFs 1, 3, 4 work even if FE F-009 (activity-bar icon + viewsContainers) doesn't ship in v1.2.0. GIF 2 strictly needs the activity bar entry — record it last, after AM-FE Wave 3b lands the viewsContainers config. If timing is tight, ship 1+3+4 in v1.2.0 and queue GIF 2 for v1.2.1.
