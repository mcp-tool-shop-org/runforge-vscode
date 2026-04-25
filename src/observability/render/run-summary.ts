/**
 * Run Summary Renderer (Phase 2.3)
 *
 * Renders run.json as human-readable markdown.
 * Pure function: takes parsed JSON, returns markdown string.
 */

import type { RunMetadata } from '../../types.js';
import { escapeTableCell } from './escape.js';

/**
 * Options for {@link renderRunSummary}.
 *
 * `deterministic`: when `true`, the `Created` row emits the raw ISO-8601
 * timestamp from `runJson.created_at` instead of the locale-formatted form
 * produced by {@link formatDate} (which calls `Date#toLocaleString()` and
 * therefore varies by host timezone / locale). Used by snapshot tests so
 * fixtures don't churn on machine differences. Default behavior (omitted /
 * `false`) is unchanged for backward compatibility.
 */
export interface RenderRunSummaryOptions {
  deterministic?: boolean;
}

/**
 * Render run.json as markdown summary
 */
export function renderRunSummary(
  runJson: RunMetadata,
  runId: string,
  options: RenderRunSummaryOptions = {}
): string {
  const lines: string[] = [];

  lines.push(`# Run Summary — ${runId}`);
  lines.push('');

  // Key facts section
  lines.push('## Key Facts');
  lines.push('');

  const createdDisplay = options.deterministic
    ? String(runJson.created_at)
    : formatDate(runJson.created_at);

  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| RunForge Version | ${escapeTableCell(runJson.runforge_version)} |`);
  lines.push(`| Created | ${escapeTableCell(createdDisplay)} |`);
  lines.push(`| Label Column | \`${escapeTableCell(runJson.label_column)}\` |`);
  lines.push(`| Samples | ${escapeTableCell(runJson.num_samples)} |`);
  lines.push(`| Features | ${escapeTableCell(runJson.num_features)} |`);
  lines.push(`| Dropped Rows | ${escapeTableCell(runJson.dropped_rows_missing_values)} |`);
  lines.push('');

  // Dataset section
  lines.push('## Dataset');
  lines.push('');
  lines.push(`- **Path:** \`${runJson.dataset.path}\``);
  lines.push(`- **Fingerprint:** \`${runJson.dataset.fingerprint_sha256}\``);
  lines.push('');

  // Metrics section
  if (runJson.metrics) {
    lines.push('## Metrics');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Accuracy | ${escapeTableCell((runJson.metrics.accuracy * 100).toFixed(2) + '%')} |`);
    lines.push(`| Samples | ${escapeTableCell(runJson.metrics.num_samples)} |`);
    lines.push(`| Features | ${escapeTableCell(runJson.metrics.num_features)} |`);
    lines.push('');
  }

  // Artifacts section
  if (runJson.artifacts && runJson.artifacts.model_pkl) {
    lines.push('## Artifacts');
    lines.push('');
    lines.push(`- **Model:** \`${runJson.artifacts.model_pkl}\``);
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*To view raw JSON, use "RunForge: Open Latest Run Metadata" or open run.json directly.*');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format date for display
 */
function formatDate(value: unknown): string {
  if (typeof value !== 'string') {
    return String(value);
  }

  try {
    const date = new Date(value);
    return date.toLocaleString();
  } catch {
    return value;
  }
}
