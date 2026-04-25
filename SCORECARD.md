# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** runforge-vscode
**Date:** 2026-02-27
**Type tags:** `[all]` `[npm]` `[vsix]`

## 2026-04-25 Status — Post-Stage-A

The 50/50 score in this document was assessed at v1.0.1 release (2026-02-27). It predates the discovery of 5 production-CRITICAL bugs that shipped in Marketplace v1.0.1 and were surfaced + fixed during the 2026-04-24/25 Dogfood Swarm Stage A:

- F-COORD-003 — Python subprocess `spawnRunnerScript` ImportError
- F-COORD-004 — PYTHONIOENCODING/PYTHONUNBUFFERED unset
- F-COORD-008 — Observability path mismatch (`.runforge/` vs `.ml/`)
- F-COORD-010 — index.json shape divergence (bare-array writer vs `{runs:[]}` reader)
- F-COORD-011 — IndexEntry shape divergence (TS shadow type vs Python writer)

All five are closed on `swarm/dogfood`. A full SCORECARD re-score will land as part of Phase 10 (Full Treatment). Until that re-score, treat the 50/50 figure above as historical context, not current state.

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
