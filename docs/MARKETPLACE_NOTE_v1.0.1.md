# RunForge v1.0.1 — Known Issues + Upgrade Path

**Status (as of 2026-04-25):** v1.0.1 (published to the VS Code Marketplace
on 2026-03-25) shipped with five production-CRITICAL bugs that break the core
`Train (Standard)` and `Train (High Quality)` commands, run browsing, and the
observability views. The bugs were discovered during a structured audit of
the codebase on 2026-04-24 and 2026-04-25 and are fully fixed on the
`swarm/dogfood` development branch; the fixes ship in **v1.0.2**, the next
release. If you installed v1.0.1, please upgrade to v1.0.2 as soon as it is
published.

**What's broken in v1.0.1.** Training never completes on a fresh install
(Python subprocess fails with `ImportError`). Even if training somehow
succeeds, run browsing and the observability commands (`Open Latest Run
Summary`, `Browse Runs`, `View Latest Metrics`, `View Latest Feature
Importance`, `View Latest Linear Coefficients`, `View Latest Interpretability
Index`, `Export Latest Run as Markdown`) read from a stale path (`.runforge/`)
and from a stale `index.json` shape, so they show no runs. On Windows hosts
with a non-UTF-8 system locale (cp1252, cp936, etc.), Python output is
additionally corrupted because the spawn environment doesn't pin UTF-8. In
short: the v1.0.1 Marketplace build cannot be relied on as a working tool —
please treat it as a deprecated release.

**What to do.** Upgrade to **v1.0.2** when it lands (imminent). v1.0.2
includes all five CRITICAL fixes plus the start of Phase 4 (cancel-in-progress
training via VS Code's `CancellationToken`, structured event-stream
observability, and the `RunForge: Recover Index` command). Full release
notes will appear in [`CHANGELOG.md`](../CHANGELOG.md) and on the
[GitHub release page](https://github.com/mcp-tool-shop-org/runforge-vscode/releases).
For the longer technical write-up of what went wrong and how it was caught,
see the
[GitHub Discussion](GITHUB_DISCUSSION_v1.0.1.md). Apologies for the bumpy
v1.0.1 release — the next one will be solid.
