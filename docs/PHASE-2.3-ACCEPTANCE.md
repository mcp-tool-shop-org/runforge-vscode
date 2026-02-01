# Phase 2.3 Acceptance Criteria — Polish & UX Clarity

## Status: Complete

Phase 2.3 focuses on user experience polish without changing training behavior or output schemas.

---

## 1. Browse Runs Command

**Command:** `RunForge: Browse Runs`

**Behavior:**
- Lists all runs from `.runforge/index.json` (newest first)
- Two-level QuickPick navigation:
  1. Select a run (shows run_id, label column, fingerprint prefix, date)
  2. Select an action

**Actions:**
| Action | Description |
|--------|-------------|
| Open Run Summary | Renders run.json as readable markdown |
| View Diagnostics | Synthesizes diagnostics from run.json fields |
| Inspect Model Artifact | Opens pipeline inspection (Phase 2.2.2) |
| Copy Dataset Fingerprint | Copies SHA-256 to clipboard |

**Files:**
- `src/observability/browse-runs-command.ts`
- Command registered in `package.json` and `extension.ts`

---

## 2. Summary Renderers

Pure functions that render structured data as human-readable markdown.

| Renderer | Input | Output |
|----------|-------|--------|
| `renderRunSummary` | run.json | Markdown with key facts, dataset, metrics, artifacts |
| `renderDiagnosticsSummary` | run.json | Synthesized diagnostics with severity icons |
| `renderArtifactSummary` | inspection result | Pipeline steps table with preprocessing indicators |

**Files:**
- `src/observability/render/run-summary.ts`
- `src/observability/render/diagnostics-summary.ts`
- `src/observability/render/artifact-summary.ts`

---

## 3. Diagnostics Synthesis

Phase 2.3 **synthesizes** diagnostics from existing run.json fields rather than emitting new data.

**Currently synthesized:**
- `MISSING_VALUES_DROPPED` — from `dropped_rows_missing_values` field

**Rationale:**
- Polish phase should not change training output or schema
- Full structured diagnostics emission is deferred to Phase 2.4+
- See `DEFERRED_UX_ENHANCEMENTS.md` for future plans

---

## 4. Safe Filesystem Utilities

Structured error handling for file operations.

**Pattern:** `SafeResult<T>` — union type with `ok: true | ok: false`

**Error codes:**
| Code | Description | Recovery Hint |
|------|-------------|---------------|
| `NOT_FOUND` | File or directory missing | "Run a training first" |
| `CORRUPT_JSON` | Invalid JSON syntax | "Backed up, run training to rebuild" |
| `READ_ERROR` | Permission or IO error | "Check file permissions" |
| `PARSE_ERROR` | Invalid format | N/A |

**Files:**
- `src/observability/fs-safe.ts`

**Benefits:**
- Machine-readable error codes
- User-friendly recovery hints
- Consistent error handling across commands

---

## 5. Open Summary Helper

Centralized helper for opening rendered content in VS Code.

**Functions:**
- `openMarkdownSummary(content, options)` — opens markdown document
- `openJsonDocument(content, options)` — opens JSON document

**Files:**
- `src/observability/open-summary.ts`

---

## 6. Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `fs-safe.test.ts` | 17 | SafeResult pattern, error codes, index/runJson reading |
| `renderers.test.ts` | 11 | Run/diagnostics/artifact summary rendering |

**Total tests:** 77 → 105 (+28)

---

## 7. Non-Goals (Intentional Deferrals)

The following are explicitly out of scope for Phase 2.3:

- **WebView-based run browser** — deferred to Phase 2.4+
- **Structured diagnostics emission** — deferred (synthesize from existing fields)
- **Real-time log streaming UI** — deferred
- **Run comparison/diff** — deferred
- **Training output schema changes** — frozen per CONTRACT.md

See `DEFERRED_UX_ENHANCEMENTS.md` for the full deferral list.

---

## Acceptance Checklist

- [x] Browse Runs command appears in Command Palette
- [x] Run list shows newest first
- [x] All four actions work correctly
- [x] Summary renderers produce valid markdown
- [x] Diagnostics synthesized from dropped_rows_missing_values
- [x] fs-safe provides structured error handling
- [x] Error messages are actionable (not generic "failed")
- [x] All 105 tests pass
- [x] No changes to training behavior or output schema

---

## Files Changed

```
src/observability/
├── browse-runs-command.ts  (new)
├── fs-safe.ts              (new)
├── open-summary.ts         (new)
├── metadata-command.ts     (updated - fs-safe)
└── render/
    ├── run-summary.ts      (new)
    ├── diagnostics-summary.ts (new)
    └── artifact-summary.ts (new)

test/
├── fs-safe.test.ts         (new)
└── renderers.test.ts       (new)

docs/
├── PHASE-2.3-ACCEPTANCE.md (new)
└── DEFERRED_UX_ENHANCEMENTS.md (new)
```
