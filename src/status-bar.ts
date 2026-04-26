/**
 * Status-bar surface for RunForge training runs (FE F-002, Wave 3a).
 *
 * Subscribes to the `EventStreamConsumer` ledger that the run-manager already
 * feeds from the Python ml_runner stderr stream. Surfaces ambient training
 * progress in the right-aligned status bar so the user can switch files
 * during a run and still see what RunForge is doing.
 *
 * Throttling contract (per the D1 implementation contract for Wave 3a):
 * `train_progress` fires per-epoch already, but the surface MUST NOT flicker
 * if events arrive in bursts during fast training. Updates are gated behind:
 *
 *   if (!lastUpdate || now - lastUpdate > 200ms || newEpoch !== lastEpoch) update()
 *
 * State machine:
 *  - hidden → no active run, no surface visible
 *  - training → "$(loading~spin) RunForge: Epoch N/M"; click cancels
 *  - done → "$(check) RunForge: <run-id>" for ~2s, then hides
 *
 * No background-color paint — VS Code UX guidelines reserve error-kind
 * background "as a last resort" (prior-art §6).
 */

import * as vscode from 'vscode';
import {
  EVENT_TYPES,
  type EventStreamConsumer,
  type ParsedEvent,
} from './observability/event-stream-consumer.js';

/** Once-per-burst throttle window. Bursts under this collapse to one update. */
const THROTTLE_MS = 200;

/** Success-flash duration before the surface hides. */
const SUCCESS_FLASH_MS = 2000;

/**
 * Status-bar controller.
 *
 * One instance per extension lifetime. The run-manager calls
 * `attachToRun(consumer)` at run start and `markFinished(runId)` at run
 * complete. Non-active state hides the surface entirely so we don't
 * permanently park a "RunForge" badge in users' status bars.
 */
export class RunForgeStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private unsubscribe: (() => void) | null = null;
  private lastEpoch: number | null = null;
  private lastUpdateMs = 0;
  private successFlashTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Right-aligned with priority 100 — sits near other ML/run indicators
    // (Jupyter kernel, Python interpreter) which conventionally use 90-110.
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = 'RunForge';
    this.item.command = 'runforge.cancelActiveRun';
    // Hidden until a run begins.
  }

  /**
   * Subscribe to a run's event stream. Called by run-manager at run start.
   * Returns void; the controller manages its own lifecycle.
   */
  attachToRun(consumer: EventStreamConsumer): void {
    // Defensive: if a previous attach didn't tear down, do it now.
    this.detach();

    this.lastEpoch = null;
    this.lastUpdateMs = 0;

    // Cancel any in-flight success flash from a prior run.
    if (this.successFlashTimer) {
      clearTimeout(this.successFlashTimer);
      this.successFlashTimer = null;
    }

    this.unsubscribe = consumer.subscribe((event) => this.onEvent(event));
  }

  /**
   * Drop the event subscription. Called by run-manager at run complete (after
   * `markFinished`/`markCancelled`/`markFailed` paint the terminal state) and
   * defensively from `attachToRun`.
   */
  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Paint the brief success flash. Auto-clears after SUCCESS_FLASH_MS.
   * Called by run-manager after a 'completed' run.
   */
  markFinished(runId: string): void {
    this.detach();
    this.item.text = `$(check) RunForge: ${runId}`;
    this.item.tooltip = `Training run complete: ${runId}`;
    this.item.command = 'runforge.browseRuns';
    this.item.show();

    if (this.successFlashTimer) {
      clearTimeout(this.successFlashTimer);
    }
    this.successFlashTimer = setTimeout(() => {
      this.successFlashTimer = null;
      this.hide();
    }, SUCCESS_FLASH_MS);
  }

  /**
   * Hide on cancel / failure. No flash — the failure toast already informs
   * the user; the status-bar should clear silently.
   */
  markEnded(): void {
    this.detach();
    if (this.successFlashTimer) {
      clearTimeout(this.successFlashTimer);
      this.successFlashTimer = null;
    }
    this.hide();
  }

  /** Hide the surface. */
  private hide(): void {
    this.item.hide();
  }

  /**
   * Event handler for the EventStreamConsumer subscription.
   * Throttled per the Wave 3a contract.
   */
  private onEvent(event: ParsedEvent): void {
    if (event.event === EVENT_TYPES.TRAIN_PROGRESS) {
      this.maybeUpdate(event.epoch, event.total_epochs);
    }
    // train_finished / artifacts_written are handled by run-manager via
    // markFinished/markEnded — the consumer fires for whatever the python
    // emits, but the run-manager owns the terminal-state classification
    // (cancelled vs completed vs crashed).
  }

  private maybeUpdate(epoch: number, total: number): void {
    const now = Date.now();
    const epochChanged = epoch !== this.lastEpoch;
    const elapsed = now - this.lastUpdateMs;

    // Throttle: skip the update unless we've never updated yet, OR the
    // throttle window elapsed, OR the epoch advanced. Bursts within the
    // same epoch collapse to a single repaint.
    if (this.lastUpdateMs !== 0 && !epochChanged && elapsed <= THROTTLE_MS) {
      return;
    }

    this.lastEpoch = epoch;
    this.lastUpdateMs = now;

    this.item.text = `$(loading~spin) RunForge: Epoch ${epoch}/${total}`;
    this.item.tooltip = 'Click to cancel training';
    this.item.command = 'runforge.cancelActiveRun';
    this.item.show();
  }

  dispose(): void {
    this.detach();
    if (this.successFlashTimer) {
      clearTimeout(this.successFlashTimer);
      this.successFlashTimer = null;
    }
    this.item.dispose();
  }
}
