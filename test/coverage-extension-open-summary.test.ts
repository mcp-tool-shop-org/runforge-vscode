/**
 * open-summary: opens rendered markdown / JSON in an untitled editor.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  openTextDocument: vi.fn(),
  showTextDocument: vi.fn(),
}));

vi.mock('vscode', () => ({
  ViewColumn: { Active: -1, Beside: -2, One: 1 },
  workspace: { openTextDocument: h.openTextDocument },
  window: { showTextDocument: h.showTextDocument },
}));

import { openMarkdownSummary, openJsonDocument } from '../src/observability/open-summary.js';

const doc = { uri: 'untitled:1' };
const editor = { document: doc };

beforeEach(() => {
  h.openTextDocument.mockReset().mockResolvedValue(doc);
  h.showTextDocument.mockReset().mockResolvedValue(editor);
});

describe('openMarkdownSummary', () => {
  it('opens an untitled markdown document beside the active editor, as a preview, by default', async () => {
    const result = await openMarkdownSummary('# Title\n\nbody');

    expect(h.openTextDocument).toHaveBeenCalledWith({
      content: '# Title\n\nbody',
      language: 'markdown',
    });
    expect(h.showTextDocument).toHaveBeenCalledWith(doc, { preview: true, viewColumn: -2 });
    expect(result).toBe(editor);
  });

  it('honours an explicit view column and preview=false', async () => {
    await openMarkdownSummary('x', { viewColumn: 1, preview: false });
    expect(h.showTextDocument).toHaveBeenCalledWith(doc, { preview: false, viewColumn: 1 });
  });

  it('keeps the default for an option that is left out', async () => {
    await openMarkdownSummary('x', { preview: false });
    expect(h.showTextDocument).toHaveBeenCalledWith(doc, { preview: false, viewColumn: -2 });
  });

  it('propagates a failure to open the document and never shows an editor', async () => {
    h.openTextDocument.mockRejectedValue(new Error('cannot open'));
    await expect(openMarkdownSummary('x')).rejects.toThrow('cannot open');
    expect(h.showTextDocument).not.toHaveBeenCalled();
  });
});

describe('openJsonDocument', () => {
  it('pretty-prints the value with two-space indent into a json document', async () => {
    const value = { a: 1, nested: { b: [1, 2] } };
    const result = await openJsonDocument(value);

    expect(h.openTextDocument).toHaveBeenCalledWith({
      content: JSON.stringify(value, null, 2),
      language: 'json',
    });
    expect(h.openTextDocument.mock.calls[0][0].content).toContain('\n  "a": 1,');
    expect(h.showTextDocument).toHaveBeenCalledWith(doc, { preview: true, viewColumn: -2 });
    expect(result).toBe(editor);
  });

  it('honours explicit options', async () => {
    await openJsonDocument([1], { viewColumn: -1, preview: false });
    expect(h.showTextDocument).toHaveBeenCalledWith(doc, { preview: false, viewColumn: -1 });
  });

  it('serialises primitives and null', async () => {
    await openJsonDocument(null);
    expect(h.openTextDocument.mock.calls[0][0].content).toBe('null');
  });
});
