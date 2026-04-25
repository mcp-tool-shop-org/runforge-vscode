/**
 * Recovery Report Renderer (Phase 4 — FT-BRIDGE-009)
 *
 * Renders the canonical {@link RecoveryReport} (produced by
 * `runforge.recoverIndex` per FT-BACK-002) as user-facing markdown.
 *
 * Pure function: no I/O, no side effects, deterministic
 * (same input → identical output).
 *
 * SHAPE CONTRACT (per CONTRACT-PHASE-4.md §3.1.2):
 *   1. Header + recovered-at timestamp
 *   2. Summary table (5 outcome counters)
 *   3. Recovered runs table (or empty-state message)
 *   4. Skipped runs table (or empty-state message)
 *   5. Cancelled-excluded table (or empty-state message)
 *
 * SECURITY: All user-controlled strings (run_id, run_dir, free-form
 * `message` text) are passed through {@link escapeTableCell} so embedded
 * pipe characters cannot break markdown table column alignment. Enum-valued
 * fields (`reason`, `error`) are constants from the canonical type and need
 * no escaping.
 */

import type { RecoveryReport } from '../../types.js';
import { escapeTableCell } from './escape.js';

/**
 * Render a {@link RecoveryReport} as user-facing markdown.
 *
 * Pure / deterministic: no I/O, no side effects, identical input always
 * produces identical output (no Date.now(), no random ordering).
 *
 * @param report Canonical RecoveryReport, as produced by FT-BACK-002's
 *   `runforge.recoverIndex` command.
 * @returns Markdown string ready to open in a VS Code editor or write to
 *   disk.
 */
export function renderRecoveryReport(report: RecoveryReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# Recovery Report');
  lines.push('');
  lines.push(`**Recovered at:** ${escapeTableCell(report.recovered_at)}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Outcome | Count |');
  lines.push('|---|---|');
  lines.push(`| Run dirs scanned | ${escapeTableCell(report.scanned_run_dirs)} |`);
  lines.push(`| Already indexed | ${escapeTableCell(report.already_indexed)} |`);
  lines.push(`| Newly recovered | ${escapeTableCell(report.recovered.length)} |`);
  lines.push(`| Skipped (errors) | ${escapeTableCell(report.skipped.length)} |`);
  lines.push(
    `| Cancelled (excluded) | ${escapeTableCell(report.cancelled_excluded.length)} |`
  );
  lines.push('');

  // Recovered runs
  lines.push('## Recovered runs');
  lines.push('');
  if (report.recovered.length > 0) {
    lines.push('| Run ID | Path | Reason |');
    lines.push('|---|---|---|');
    for (const entry of report.recovered) {
      const reason = entry.reason ?? '';
      lines.push(
        `| ${escapeTableCell(entry.run_id)} | ${escapeTableCell(entry.run_dir)} | ${escapeTableCell(reason)} |`
      );
    }
  } else {
    lines.push('*No new runs were recovered.*');
  }
  lines.push('');

  // Skipped runs
  lines.push('## Skipped runs');
  lines.push('');
  if (report.skipped.length > 0) {
    lines.push('| Path | Error | Detail |');
    lines.push('|---|---|---|');
    for (const skip of report.skipped) {
      lines.push(
        `| ${escapeTableCell(skip.run_dir)} | ${escapeTableCell(skip.error)} | ${escapeTableCell(skip.message)} |`
      );
    }
  } else {
    lines.push('*No runs were skipped.*');
  }
  lines.push('');

  // Cancelled (excluded) runs
  lines.push('## Cancelled runs (not indexed)');
  lines.push('');
  lines.push(
    'These runs were cancelled mid-training (`.cancelled` marker present) and are'
  );
  lines.push(
    'intentionally excluded from the index per RunForge Phase 4 §3.1.2. Use'
  );
  lines.push(
    '"RunForge: Browse Runs" to inspect them directly.'
  );
  lines.push('');
  if (report.cancelled_excluded.length > 0) {
    lines.push('| Run ID | Path |');
    lines.push('|---|---|');
    for (const entry of report.cancelled_excluded) {
      lines.push(
        `| ${escapeTableCell(entry.run_id)} | ${escapeTableCell(entry.run_dir)} |`
      );
    }
  } else {
    lines.push('*No cancelled runs were excluded.*');
  }
  lines.push('');

  return lines.join('\n');
}
