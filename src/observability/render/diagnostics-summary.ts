/**
 * Diagnostics Summary Renderer (Phase 2.3)
 *
 * Renders SYNTHESIZED diagnostics from run.json fields.
 * Does NOT read emitted diagnostics (that's Phase 2.4+).
 *
 * Pure function: takes parsed run.json, returns markdown string.
 */

/**
 * Synthesized diagnostic record
 */
interface SynthesizedDiagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Synthesize diagnostics from run.json fields
 *
 * Currently synthesizes:
 * - MISSING_VALUES_DROPPED (from dropped_rows_missing_values)
 */
function synthesizeDiagnostics(runJson: Record<string, unknown>): SynthesizedDiagnostic[] {
  const diagnostics: SynthesizedDiagnostic[] = [];

  // Check dropped_rows_missing_values
  const droppedRows = runJson.dropped_rows_missing_values;
  if (typeof droppedRows === 'number' && droppedRows > 0) {
    diagnostics.push({
      code: 'MISSING_VALUES_DROPPED',
      severity: 'info',
      message: `Dropped ${droppedRows} rows with missing values`,
      details: { rows_dropped: droppedRows },
    });
  }

  return diagnostics;
}

/**
 * Render diagnostics summary as markdown
 */
export function renderDiagnosticsSummary(
  runJson: Record<string, unknown>,
  runId: string
): string {
  const lines: string[] = [];

  lines.push(`# Diagnostics — ${runId}`);
  lines.push('');

  // Check if we can synthesize diagnostics
  if (!('dropped_rows_missing_values' in runJson)) {
    lines.push('## Diagnostics Unavailable');
    lines.push('');
    lines.push('Run metadata is missing required fields for diagnostic synthesis.');
    lines.push('This may be an older run or corrupted metadata.');
    lines.push('');
    return lines.join('\n');
  }

  // Synthesize diagnostics
  const diagnostics = synthesizeDiagnostics(runJson);

  lines.push('## Derived Diagnostics');
  lines.push('');
  lines.push('*These diagnostics are synthesized from run.json fields (v0.2.2.x metadata).*');
  lines.push('');

  if (diagnostics.length === 0) {
    lines.push('**No diagnostics recorded for this run.**');
    lines.push('');
    lines.push('The run completed without any notable conditions.');
    lines.push('');
  } else {
    // Render each diagnostic
    for (const diag of diagnostics) {
      const icon = getSeverityIcon(diag.severity);
      lines.push(`### ${icon} ${diag.code}`);
      lines.push('');
      lines.push(`**Severity:** ${diag.severity}`);
      lines.push('');
      lines.push(diag.message);
      lines.push('');

      if (diag.details) {
        lines.push('**Details:**');
        lines.push('');
        for (const [key, value] of Object.entries(diag.details)) {
          lines.push(`- \`${key}\`: ${value}`);
        }
        lines.push('');
      }
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Note: Full structured diagnostics emission is deferred.*');
  lines.push('*See docs/DEFERRED_UX_ENHANCEMENTS.md for future plans.*');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get icon for severity level
 */
function getSeverityIcon(severity: 'info' | 'warning' | 'error'): string {
  switch (severity) {
    case 'info':
      return 'ℹ️';
    case 'warning':
      return '⚠️';
    case 'error':
      return '❌';
    default:
      return '•';
  }
}
