# v1.0.1 known issues + upgrade path to v1.1.0

> **Suggested category:** Announcements
> **Suggested labels:** `release`, `known-issue`, `v1.0.1`, `v1.1.0`
> **Posting URL:** https://github.com/mcp-tool-shop-org/runforge-vscode/discussions

## TL;DR

RunForge **v1.0.1** (published to the VS Code Marketplace on 2026-03-25)
shipped with five production-CRITICAL bugs that break the `Train` commands,
run browsing, and the observability views. All five are fixed on
`swarm/dogfood` and ship in **v1.1.0**, the next release.

If you have v1.0.1 installed: please upgrade to v1.1.0 as soon as it lands.
Until then, the `Train` commands and most observability views will not work
as intended.

This post explains what went wrong, how it was caught, what's in v1.1.0, and
how to verify which version you have.

---

## What's broken in v1.0.1

Five issues, all CRITICAL because each one independently breaks a core
user-facing command:

1. **Training never completes on a fresh install.** The Python subprocess is
   invoked as a directory path instead of `python -m ml_runner`, so it fails
   immediately with an `ImportError`. Both `RunForge: Train (Standard)` and
   `RunForge: Train (High Quality)` are affected.

2. **Subprocess output corrupts on non-UTF-8 Windows locales.** On Windows
   hosts whose system locale is cp1252, cp936, or similar (i.e. anything not
   UTF-8), the Python child process emits output in the system encoding while
   RunForge tries to parse it as UTF-8. JSON parsing breaks; error messages
   become unreadable. The fix is to pin `PYTHONIOENCODING=utf-8` and
   `PYTHONUNBUFFERED=1` on every Python spawn.

3. **Observability commands read the wrong path.** Commands like `Browse
   Runs`, `Open Latest Run Summary`, `View Latest Metrics`, `View Latest
   Feature Importance`, `View Latest Linear Coefficients`, `View Latest
   Interpretability Index`, and `Export Latest Run as Markdown` look in
   `.runforge/`, but Python actually writes runs to `.ml/`. Result: every
   observability view shows zero runs even after a successful train.

4. **`index.json` shape diverges between writer and reader.** The Python
   writer wrote a bare array (`[…]`) while the TypeScript reader expected
   `{ schema_version, runs: [] }`. Index reads either threw or silently
   returned empty.

5. **`IndexEntry` and `RunMetadata` shapes diverge.** The TypeScript side
   carried local "shadow" copies of these types in the observability layer
   with diverging field names (e.g. `dataset_fingerprint` instead of
   `dataset_fingerprint_sha256`). Run summaries silently rendered
   `undefined` for several fields.

Internally these are tracked as `F-COORD-003`, `F-COORD-004`, `F-COORD-008`,
`F-COORD-010`, and `F-COORD-011` (with `F-FS-001/002/003` and `F-TS-001`
folded into `F-COORD-011`). The full bug list is in
[`CHANGELOG.md`](../CHANGELOG.md).

## How they were caught

A 5-domain audit of the codebase on 2026-04-24/25 surfaced all five.
Specifically, three of them showed up because the audit ran the production
write/read paths end-to-end on a fixture workspace — exactly what an
extension-host smoke test would have caught at CI time. v1.0.1 had no
extension-host smoke coverage; the test surface was unit-only, so a writer
and a reader that disagreed on shape never ran in the same process during CI.

The lesson taken from this — and the work landing in v1.1.0 — is that
Phase 4 introduces an `@vscode/test-cli` + `@vscode/test-electron` extension
host smoke harness that exercises the full call chain (activation → command
dispatch → Python subprocess → run.json → observability read → markdown
export) on every CI run. See
[`CONTRACT-PHASE-4.md` §3.4](../CONTRACT-PHASE-4.md) for the contract.

## What's in v1.1.0

v1.1.0 closes all five CRITICAL items above and starts the Phase 4 surface:

**Critical fixes (the v1.0.1 regression set):**
- `spawnRunnerScript` rewritten to use `python -m ml_runner` via the canonical
  `spawnRunner` helper.
- `pythonSpawnEnv()` helper consolidates `PYTHONIOENCODING=utf-8` and
  `PYTHONUNBUFFERED=1` on every Python spawn site.
- Observability commands now read from `WORKSPACE_PATHS` constants in
  `src/types.ts` — the `.runforge/` literals are gone.
- `index.json` shape unified at `{ schema_version, runs: [] }`; legacy
  on-disk shapes migrate transparently on read.
- `IndexEntry`, `RunMetadata`, `MetricsV1`, `FeatureImportance`,
  `LinearCoefficients`, and `InterpretabilityIndex` now live exclusively in
  `src/types.ts`. The observability shadow types are deleted.

**New in v1.1.0 (Phase 4 start):**
- `RunForge: Cancel Run` — user-initiated cancel of an in-progress training
  run via VS Code's `CancellationToken`, with a 5-second graceful shutdown
  window before SIGKILL. A `.cancelled` marker lands on disk so cancelled
  runs are queryable in the run picker.
- `RunForge: Recover Index` — walks `.ml/runs/` and re-appends any run that
  is missing from `.ml/outputs/index.json`. Idempotent. Useful if a Python
  run wrote successfully but the index update raced or failed.
- Full structured event stream from Python (9 event types, JSONL on stderr,
  validated against `events.schema.v1.json`).
- Hardened CSV ingestion errors: non-comma delimiters, non-UTF-8 encodings,
  all-NaN labels, single-column CSVs, and header-only CSVs each raise
  specific actionable messages.
- Extension host smoke harness (so this class of regression cannot ship
  again).

Full Phase 4 contract:
[`CONTRACT-PHASE-4.md`](../CONTRACT-PHASE-4.md). Score and gate status:
[`SCORECARD.md`](../SCORECARD.md) (post-Stage-A note at the top).

## When does v1.1.0 ship?

Imminent — v1.1.0 is queued behind the Phase 4 implementation waves landing
on `swarm/dogfood` over the next few sessions. We're not promising a date
because the gate is the SHIP_GATE checklist passing, not the calendar. Watch
the [Releases page](https://github.com/mcp-tool-shop-org/runforge-vscode/releases)
or this Discussion for the announcement.

## Verifying which version you have

In VS Code:

1. Open the Extensions view (`Ctrl+Shift+X`).
2. Search for "RunForge".
3. The version is printed under the extension name.

Or from the command line (paths are typical defaults; adjust if you use a
custom `--extensions-dir`):

```bash
# Linux / macOS
cat ~/.vscode/extensions/mcp-tool-shop.runforge-*/package.json | grep '"version"'

# Windows (PowerShell)
Get-Content "$env:USERPROFILE\.vscode\extensions\mcp-tool-shop.runforge-*\package.json" | Select-String '"version"'
```

If the output shows `"version": "1.0.1"`, you are on the affected build and
should upgrade to v1.1.0 once it is published. If you are on v1.0.0 or
earlier, none of the five regressions above apply to you (they were
introduced as part of v1.0.1's packaging/refactor pass), but you'll still
want v1.1.0 for the Phase 4 features.

## Apologies + thanks

The v1.0.1 release went out without an extension-host smoke test surface
that would have caught these. That was a process gap on our end, not a user
problem; we're sorry for the rough first impression.

Thanks to anyone who hit one of these and didn't have a way to report it
yet — please use this Discussion or open an issue if you see anything else
amiss in v1.1.0. The Phase 4 smoke harness is specifically designed so this
class of regression cannot ship again.

— The RunForge team @ MCP Tool Shop
