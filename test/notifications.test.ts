/**
 * Notifications helper tests (Wave 3a — FE F-006 seed).
 *
 * Exercise notifyError/notifyWarning/notifyInfo with and without actions,
 * and verify the dispatch-on-pick behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  showErrorMessageMock,
  showWarningMessageMock,
  showInformationMessageMock,
  executeCommandMock,
} = vi.hoisted(() => ({
  showErrorMessageMock: vi.fn(),
  showWarningMessageMock: vi.fn(),
  showInformationMessageMock: vi.fn(),
  executeCommandMock: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: showErrorMessageMock,
    showWarningMessage: showWarningMessageMock,
    showInformationMessage: showInformationMessageMock,
  },
  commands: {
    executeCommand: executeCommandMock,
  },
}));

import {
  notifyError,
  notifyWarning,
  notifyInfo,
} from '../src/notifications.js';

describe('notifications helpers — Wave 3a', () => {
  beforeEach(() => {
    showErrorMessageMock.mockReset();
    showWarningMessageMock.mockReset();
    showInformationMessageMock.mockReset();
    executeCommandMock.mockReset();
    executeCommandMock.mockReturnValue(Promise.resolve(undefined));
  });

  it('notifyError with no actions just shows the toast', async () => {
    showErrorMessageMock.mockReturnValue(Promise.resolve(undefined));
    await notifyError('boom');
    expect(showErrorMessageMock).toHaveBeenCalledWith('boom');
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('notifyError dispatches the picked action', async () => {
    showErrorMessageMock.mockReturnValue(Promise.resolve('Open Setting'));

    const picked = await notifyError(
      'Dataset not found',
      {
        label: 'Open Setting',
        command: 'workbench.action.openSettings',
        args: ['runforge.datasetPath'],
      },
      { label: 'Pick File', command: 'runforge.inspectDataset' }
    );

    expect(picked).toBe('Open Setting');
    expect(showErrorMessageMock).toHaveBeenCalledWith(
      'Dataset not found',
      'Open Setting',
      'Pick File'
    );
    expect(executeCommandMock).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      'runforge.datasetPath'
    );
  });

  it('notifyWarning with actions returns dismiss as undefined', async () => {
    showWarningMessageMock.mockReturnValue(Promise.resolve(undefined));
    const picked = await notifyWarning('careful', {
      label: 'OK',
      command: 'noop',
    });
    expect(picked).toBeUndefined();
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('notifyInfo forwards the picked label even when action is missing', async () => {
    showInformationMessageMock.mockReturnValue(Promise.resolve('UnknownPick'));
    const picked = await notifyInfo('hi', {
      label: 'OK',
      command: 'noop',
    });
    // We picked something the helper didn't register — return label, no dispatch.
    expect(picked).toBe('UnknownPick');
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it('action without args calls executeCommand with just the command name', async () => {
    showErrorMessageMock.mockReturnValue(Promise.resolve('Trust'));
    await notifyError('untrusted', {
      label: 'Trust',
      command: 'workbench.trust.manage',
    });
    expect(executeCommandMock).toHaveBeenCalledWith('workbench.trust.manage');
  });
});
