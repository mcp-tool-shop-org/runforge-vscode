/**
 * Markdown table-cell escaping helpers.
 *
 * Markdown tables use `|` as the column separator. When user-controlled
 * strings (class labels, artifact names, filenames, etc.) are interpolated
 * into table cells without escaping, an embedded `|` breaks column alignment
 * and can cause the renderer to interpret content as additional columns.
 *
 * Use {@link escapeTableCell} on every untrusted string written into a cell.
 */

/**
 * Escape pipe characters so markdown table cells render literally.
 *
 * Coerces non-string input via String() so callers can pass numbers,
 * booleans, etc. without an extra cast.
 */
export function escapeTableCell(s: unknown): string {
  return String(s).replace(/\|/g, '\\|');
}
