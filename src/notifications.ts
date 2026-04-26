/**
 * Notifications — centralized toast surface (Wave 3a — FE F-006 seed).
 *
 * Wraps `vscode.window.show{Error,Warning,Information}Message` with a
 * uniform action-object shape so command-layer call sites can declare
 * actions without restating the action-handler dispatch every time.
 *
 * Migration policy (Wave 3a):
 *  - This module ships the helper. Call-site migration of the 51+ existing
 *    `vscode.window.show*` callers is QUEUED for v1.2.1 — touching every
 *    site would balloon Wave 3a beyond the marketplace-ship budget.
 *  - New code SHOULD use these helpers instead of calling
 *    `vscode.window.show*Message` directly.
 *  - Trust-guard / dataset-not-found error paths in `run-manager.ts` are
 *    intentionally left on the raw API for now — they pre-date this module
 *    and have stable test assertions on the canonical message constants.
 *
 * Action-object shape:
 *   { label: 'Open Setting', command: 'workbench.action.openSettings', args: ['runforge.datasetPath'] }
 *
 * Each helper resolves to the picked action's label (or undefined if the
 * user dismissed) — same shape as the underlying VS Code API, so callers
 * don't lose information.
 */

import * as vscode from 'vscode';

/**
 * A toast action — label + command to invoke when the user clicks it.
 * `args` are forwarded to `vscode.commands.executeCommand`.
 */
export interface NotificationAction {
  /** Button label rendered in the toast. */
  label: string;
  /** VS Code command to execute when the user clicks the button. */
  command: string;
  /** Optional arguments for `commands.executeCommand`. */
  args?: unknown[];
}

async function dispatch(
  picked: string | undefined,
  actions: NotificationAction[]
): Promise<string | undefined> {
  if (picked === undefined) return undefined;
  const match = actions.find((a) => a.label === picked);
  if (!match) return picked;
  await vscode.commands.executeCommand(match.command, ...(match.args ?? []));
  return picked;
}

/** Show an error toast with optional action buttons. */
export async function notifyError(
  message: string,
  ...actions: NotificationAction[]
): Promise<string | undefined> {
  if (actions.length === 0) {
    return await Promise.resolve(
      vscode.window.showErrorMessage(message)
    ).then((v) => v ?? undefined);
  }
  const labels = actions.map((a) => a.label);
  const picked = await vscode.window.showErrorMessage(message, ...labels);
  return dispatch(picked, actions);
}

/** Show a warning toast with optional action buttons. */
export async function notifyWarning(
  message: string,
  ...actions: NotificationAction[]
): Promise<string | undefined> {
  if (actions.length === 0) {
    return await Promise.resolve(
      vscode.window.showWarningMessage(message)
    ).then((v) => v ?? undefined);
  }
  const labels = actions.map((a) => a.label);
  const picked = await vscode.window.showWarningMessage(message, ...labels);
  return dispatch(picked, actions);
}

/** Show an info toast with optional action buttons. */
export async function notifyInfo(
  message: string,
  ...actions: NotificationAction[]
): Promise<string | undefined> {
  if (actions.length === 0) {
    return await Promise.resolve(
      vscode.window.showInformationMessage(message)
    ).then((v) => v ?? undefined);
  }
  const labels = actions.map((a) => a.label);
  const picked = await vscode.window.showInformationMessage(
    message,
    ...labels
  );
  return dispatch(picked, actions);
}
