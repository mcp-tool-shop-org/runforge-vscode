# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** runforge-vscode
**Date:** 2026-02-27
**Type tags:** `[all]` `[npm]` `[vsix]`

## 2026-04-25 Post-Phase-4 Re-score

A full Phase 10 re-score, **not inherited** from the 2026-02-27 50/50 figure
in this document. The 2026-02-27 score was assessed at v1.0.0 release and
predates the discovery of 5 production-CRITICAL bugs that shipped in
Marketplace v1.0.1 (`F-COORD-003`, `F-COORD-004`, `F-COORD-008`,
`F-COORD-010`, `F-COORD-011`). All five are closed in v1.1.0; the Phase 4
contract surface is frozen; pattern lessons #11–#17 are codified in
[`docs/CONTRACTS.md`](docs/CONTRACTS.md).

**Source of record:** `npx @mcptoolshop/shipcheck audit` run at commit
`f480aef` on branch `swarm/dogfood`, version `1.1.0`.

| Result | Count |
|--------|-------|
| Checked | 19 |
| Unchecked | 0 |
| Skipped (N/A) | 16 |
| **Pass rate** | **100%** |

**Verdict:** All hard gates pass. Ship.

| Category | Score | Evidence |
|----------|-------|----------|
| A. Security | 10/10 | SECURITY.md current; threat-model paragraph in README; **NEW**: workspace-trust guard for Python subprocess spawn (Phase 4); no telemetry; no network egress |
| B. Error Handling | 10/10 | SafeError shape (`code`, `message`, `hint`, `retryable`); VS Code notifications used; **NEW**: hardened CSV error actionability (5 specific failure modes) |
| C. Operator Docs | 10/10 | README current with v1.1.0 features; CHANGELOG (Keep a Changelog format); 8 translations; landing page; Starlight handbook (5 pages incl. Cancel & Recovery); 7 contract surfaces documented |
| D. Shipping Hygiene | 10/10 | `verify` script (test + lint + compile + vsce package); package.json @ 1.1.0; dep-audit job in CI; matrix CI (Node 20 + 22); EH smoke harness on Linux Xvfb; **NEW**: custom ESLint rules enforce CONTRACTS.md doctrines 2 + 3 |
| E. Identity (soft) | 10/10 | Logo, 8 translations, landing page, GitHub metadata, repo-knowledge DB |
| **Overall** | **50/50** | **All hard gates pass** |

**Phase 4 evidence carried forward:**

- 871+ total tests (388 vitest passing on Linux + 483 pytest + 6 EH smoke scenarios)
- 0 CRITICALs surfaced during Phase 4 (validates pattern #11 — pre-defined contract eliminates F-COORD-011 drift class)
- 35/35 contract guarantees hold across [`CONTRACT.md`](CONTRACT.md), [`CONTRACT-PHASE-3.md`](CONTRACT-PHASE-3.md), [`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) per Phase 9 audit ([Phase 9 receipts](../dogfood-labs/swarms/mcp-tool-shop-org--runforge-vscode/phase-9/phase-9-receipts.json))
- VSIX `runforge-1.1.0.vsix` at 126 files / 2.95 MB

The 50/50 result below ("Post-Remediation" — historical, 2026-02-27) is
preserved for audit trail; the Phase 4 re-score above is the current state.

---

## Pre-Remediation Assessment

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 4/10 | SECURITY.md template only, no threat model in README |
| B. Error Handling | 8/10 | Excellent SafeResult pattern, VS Code notifications used, missing retryable field |
| C. Operator Docs | 8/10 | README comprehensive, CHANGELOG good, 8 translations, landing page |
| D. Shipping Hygiene | 5/10 | CI exists but no coverage, no dep audit, no verify script |
| E. Identity (soft) | 10/10 | Logo, translations, landing page, GitHub metadata all present |
| **Overall** | **35/50** | |

## Key Gaps

1. SECURITY.md is template with placeholder data (Section A)
2. No threat model paragraph in README (Section A)
3. No coverage reporting or Codecov in CI (Section D)
4. No verify script (Section D)
5. No dependency scanning in CI (Section D)

## Post-Remediation

| Category | Before | After |
|----------|--------|-------|
| A. Security | 4/10 | 10/10 |
| B. Error Handling | 8/10 | 10/10 |
| C. Operator Docs | 8/10 | 10/10 |
| D. Shipping Hygiene | 5/10 | 10/10 |
| E. Identity (soft) | 10/10 | 10/10 |
| **Overall** | 35/50 | **50/50** |
