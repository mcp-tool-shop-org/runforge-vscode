# Deferred UX Enhancements

This document tracks UX improvements that were considered but intentionally deferred from Phase 2.3. Each item includes rationale and suggested implementation phase.

---

## 1. Structured Diagnostics Emission

**Current State (Phase 2.3):**
Diagnostics are synthesized from existing run.json fields (e.g., `dropped_rows_missing_values`).

**Deferred Enhancement:**
Emit a dedicated `diagnostics.json` file during training with structured diagnostic records.

**Proposed Schema:**
```json
{
  "schema_version": "0.2.4.0",
  "run_id": "...",
  "diagnostics": [
    {
      "code": "MISSING_VALUES_DROPPED",
      "severity": "info",
      "message": "Dropped 15 rows with missing values",
      "timestamp": "2024-01-15T10:30:00Z",
      "details": { "rows_dropped": 15 }
    }
  ]
}
```

**Rationale for Deferral:**
- Phase 2.3 is a polish phase — no schema changes
- CONTRACT.md freezes training output behavior
- Synthesis from existing fields is sufficient for MVP

**Suggested Phase:** 2.4

---

## 2. WebView-Based Run Browser

**Current State (Phase 2.3):**
QuickPick-based two-level navigation (run → action).

**Deferred Enhancement:**
Full WebView panel with:
- Sortable/filterable table of runs
- Inline previews
- Side-by-side comparison
- Chart visualization of metrics over time

**Rationale for Deferral:**
- Requires significant WebView infrastructure
- QuickPick is functional and familiar to VS Code users
- Phase 2.3 scope is polish, not feature expansion

**Suggested Phase:** 2.5+

---

## 3. Real-Time Log Streaming UI

**Current State (Phase 2.3):**
Logs stream to Output Channel.

**Deferred Enhancement:**
- Progress bar with ETA
- Live metrics chart during training
- Terminal-style log viewer with filters

**Rationale for Deferral:**
- Requires WebView or custom editor
- Output Channel is functional
- Training duration is typically short

**Suggested Phase:** 3.0+

---

## 4. Run Comparison/Diff

**Current State (Phase 2.3):**
Single-run viewing only.

**Deferred Enhancement:**
- Compare two runs side-by-side
- Highlight metric differences
- Dataset fingerprint diff (detect dataset changes)

**Rationale for Deferral:**
- Requires multi-selection UI
- Diff visualization is complex
- Single-run viewing addresses core use case

**Suggested Phase:** 2.5+

---

## 5. Automatic Diagnostics Detection

**Current State (Phase 2.3):**
Manual "View Diagnostics" action.

**Deferred Enhancement:**
- Proactive notification when diagnostics are notable
- Status bar indicator for runs with warnings
- Auto-open diagnostics on completion if warnings exist

**Rationale for Deferral:**
- Notification UX is subjective (may be annoying)
- Users can manually check diagnostics
- Phase 2.3 focuses on discoverability, not automation

**Suggested Phase:** 2.6+

---

## 6. Keyboard Shortcuts for Commands

**Current State (Phase 2.3):**
All commands accessible via Command Palette only.

**Deferred Enhancement:**
- Default keybindings for common commands
- `Ctrl+Shift+R` for quick run selection

**Rationale for Deferral:**
- Keybinding conflicts are common
- Users can configure their own shortcuts
- Command Palette is accessible

**Suggested Phase:** 2.4

---

## 7. Custom Preset Editor

**Current State (Phase 2.3):**
Two locked presets (std-train, hq-train).

**Deferred Enhancement:**
- UI for creating/editing custom presets
- Preset validation
- Preset sharing/export

**Rationale for Deferral:**
- Locked presets are intentional (determinism)
- Custom presets require careful design
- Out of scope for polish phase

**Suggested Phase:** 3.0+

---

## 8. Internationalization (i18n)

**Current State (Phase 2.3):**
English only.

**Deferred Enhancement:**
- Localized command titles
- Localized error messages
- Localized markdown summaries

**Rationale for Deferral:**
- Small user base currently
- i18n infrastructure is significant
- English is sufficient for MVP

**Suggested Phase:** 3.0+

---

## Implementation Priority

When revisiting deferred enhancements, consider this priority order:

1. **Structured Diagnostics Emission** (Phase 2.4) — High value, moderate effort
2. **Keyboard Shortcuts** (Phase 2.4) — Low effort, quality of life
3. **Run Comparison** (Phase 2.5) — Medium value, significant effort
4. **WebView Browser** (Phase 2.5+) — High effort, nice to have
5. **Real-Time UI** (Phase 3.0+) — High effort, specialized use case

---

## Contributing

If implementing a deferred enhancement:

1. Update this document to mark the item as implemented
2. Add acceptance criteria to the relevant phase document
3. Ensure backward compatibility with existing runs
4. Add tests for new functionality
5. Update README.md if user-facing
