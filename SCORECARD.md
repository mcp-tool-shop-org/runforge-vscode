# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** runforge-vscode
**Date:** 2026-02-27
**Type tags:** `[all]` `[npm]` `[vsix]`

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
