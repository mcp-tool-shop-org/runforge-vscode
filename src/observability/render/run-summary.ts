/**
 * Run Summary Renderer (Phase 2.3)
 *
 * Renders run.json as human-readable markdown.
 * Pure function: takes parsed JSON, returns markdown string.
 */

/**
 * Render run.json as markdown summary
 */
export function renderRunSummary(
  runJson: Record<string, unknown>,
  runId: string
): string {
  const lines: string[] = [];

  lines.push(`# Run Summary — ${runId}`);
  lines.push('');

  // Key facts section
  lines.push('## Key Facts');
  lines.push('');

  const version = runJson.runforge_version ?? 'unknown';
  const createdAt = runJson.created_at ?? 'unknown';
  const labelColumn = runJson.label_column ?? 'unknown';
  const numSamples = runJson.num_samples ?? 'unknown';
  const numFeatures = runJson.num_features ?? 'unknown';
  const droppedRows = runJson.dropped_rows_missing_values ?? 0;

  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| RunForge Version | ${version} |`);
  lines.push(`| Created | ${formatDate(createdAt)} |`);
  lines.push(`| Label Column | \`${labelColumn}\` |`);
  lines.push(`| Samples | ${numSamples} |`);
  lines.push(`| Features | ${numFeatures} |`);
  lines.push(`| Dropped Rows | ${droppedRows} |`);
  lines.push('');

  // Dataset section
  if (runJson.dataset && typeof runJson.dataset === 'object') {
    const dataset = runJson.dataset as Record<string, unknown>;
    lines.push('## Dataset');
    lines.push('');
    lines.push(`- **Path:** \`${dataset.path ?? 'unknown'}\``);
    lines.push(`- **Fingerprint:** \`${dataset.fingerprint_sha256 ?? 'unknown'}\``);
    lines.push('');
  }

  // Metrics section
  if (runJson.metrics && typeof runJson.metrics === 'object') {
    const metrics = runJson.metrics as Record<string, unknown>;
    lines.push('## Metrics');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);

    if (metrics.accuracy !== undefined) {
      const accuracy = typeof metrics.accuracy === 'number'
        ? (metrics.accuracy * 100).toFixed(2) + '%'
        : metrics.accuracy;
      lines.push(`| Accuracy | ${accuracy} |`);
    }
    if (metrics.num_samples !== undefined) {
      lines.push(`| Samples | ${metrics.num_samples} |`);
    }
    if (metrics.num_features !== undefined) {
      lines.push(`| Features | ${metrics.num_features} |`);
    }
    lines.push('');
  }

  // Artifacts section
  if (runJson.artifacts && typeof runJson.artifacts === 'object') {
    const artifacts = runJson.artifacts as Record<string, unknown>;
    lines.push('## Artifacts');
    lines.push('');
    if (artifacts.model_pkl) {
      lines.push(`- **Model:** \`${artifacts.model_pkl}\``);
    }
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
