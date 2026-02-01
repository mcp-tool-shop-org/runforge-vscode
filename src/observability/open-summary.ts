/**
 * Open Summary Helper (Phase 2.3)
 *
 * Centralized helper for opening rendered summaries in VS Code.
 * Handles the markdown document creation and display.
 */

import * as vscode from 'vscode';

/**
 * Options for opening a summary
 */
export interface OpenSummaryOptions {
  /** View column to open in (default: Beside) */
  viewColumn?: vscode.ViewColumn;
  /** Whether to open as preview (default: true) */
  preview?: boolean;
}

/**
 * Open a markdown summary in the editor
 *
 * Creates an untitled markdown document and displays it.
 */
export async function openMarkdownSummary(
  content: string,
  options: OpenSummaryOptions = {}
): Promise<vscode.TextEditor> {
  const { viewColumn = vscode.ViewColumn.Beside, preview = true } = options;

  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown',
  });

  return await vscode.window.showTextDocument(doc, {
    preview,
    viewColumn,
  });
}

/**
 * Open JSON in the editor (for raw metadata viewing)
 */
export async function openJsonDocument(
  content: unknown,
  options: OpenSummaryOptions = {}
): Promise<vscode.TextEditor> {
  const { viewColumn = vscode.ViewColumn.Beside, preview = true } = options;

  const jsonString = JSON.stringify(content, null, 2);

  const doc = await vscode.workspace.openTextDocument({
    content: jsonString,
    language: 'json',
  });

  return await vscode.window.showTextDocument(doc, {
    preview,
    viewColumn,
  });
}
