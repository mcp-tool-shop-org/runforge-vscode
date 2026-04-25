"""
Training runner for ml_runner

Phase 2.1: CSV-based supervised learning with Logistic Regression.
- Uses 'label' column (not last column)
- 80/20 deterministic train/val split
- Strict metrics schema (3 keys only)
- Pipeline artifact (includes preprocessing)
- Handles missing values

Phase 2.2.1: Observability layer (no training changes)
- Run metadata export (run.json)
- Dataset fingerprinting
- Provenance tracking

Phase 3.1: Model selection
- Explicit model family choice via --model flag
- Supported: logistic_regression, random_forest, linear_svc
- Default: logistic_regression (unchanged from Phase 2)

Phase 3.2: Hyperparameters and profiles
- CLI --param overrides (highest priority)
- Named training profiles with expansion
- Type validation and range checking
"""

import json
import logging
import os
import pickle
import random
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, List, NamedTuple

import numpy as np

# jsonschema is an optional runtime dep. If unavailable (e.g., user installed
# v1.0.2 without it), we soft-fall-back to bypassing the emit_event runtime
# validation gate. Schema drift is still caught in CI + dev (where jsonschema
# IS installed); end users without jsonschema still get all events emitted —
# just unvalidated. README documents jsonschema as a recommended dep.
try:
    import jsonschema  # type: ignore[import-not-found]
except ImportError:
    jsonschema = None  # type: ignore[assignment]

from .presets import get_preset
from .inspect import compute_dataset_fingerprint
from .metadata import generate_run_id, create_run_metadata, write_run_metadata, RUNFORGE_VERSION
from .provenance import (
    append_run_to_index,
    write_index_orphan_marker,
    write_cancelled_marker,
    get_index_path,
    CANCEL_STEPS,
)
from .contracts import load_schema

logger = logging.getLogger(__name__)


# F-PY-B004 (iter #5b): Structured event-stream foundation.
#
# Contract: structured events go to **stderr** as JSONL. Each event is
# `{"event": <str>, "timestamp": <ISO-8601 UTC>, ...payload}`. Human-readable
# progress remains on **stdout** unchanged. The TS Bridge reads stderr line
# by line; any line that does not parse as a JSON object with an `event`
# key is treated as a free-form log line.
#
# Phase 4 (FT-PY-005): full progress event emission — 9 event types covering
# the run lifecycle (run_start → dataset_loaded → train_started →
# train_progress → train_finished → metrics_computed → artifacts_written for
# the happy path; cancelling + run_cancelled for the cancel path).
#
# Phase 4 (Preload 1 — runtime schema validation): every event emitted via
# `emit_event()` is validated against `events.schema.v1.json` BEFORE the
# JSONL line is written to stderr. Catches schema drift in CI / unit tests
# rather than only at smoke time. Validation failures are logged + dropped
# (NEVER raised — events are best-effort and must not break a run).

# Cache the events schema validator at module import. Loading once amortizes
# the JSON parse + Draft7 compile across hundreds of emissions per run.
try:
    if jsonschema is None:
        raise ImportError("jsonschema not installed; emit_event runtime validation disabled")
    EVENTS_SCHEMA = load_schema("events.schema.v1")
    _EVENTS_VALIDATOR = jsonschema.Draft7Validator(EVENTS_SCHEMA)
except Exception:
    # If the schema itself is missing or unparseable, log + leave the
    # validator None. emit_event then bypasses validation (better to ship a
    # potentially-malformed event than to silence the entire stream during
    # development of a new schema).
    EVENTS_SCHEMA = None
    _EVENTS_VALIDATOR = None
    logger.warning(
        "events.schema.v1 unavailable; emit_event will bypass schema validation",
        exc_info=True,
    )


def emit_event(event_name: str, **payload: Any) -> None:
    """
    Write a structured event line to stderr as JSONL.

    Never raises — best-effort. A failure to emit must not break a training
    run. Each event includes a UTC ISO-8601 timestamp under `timestamp`.

    Phase 4: validates the constructed event against `events.schema.v1.json`
    before the stderr write. On validation failure, the event is dropped
    and the failure is logged via `logger.warning` (NOT stderr — that
    would corrupt the JSONL event stream). The training run continues.

    Args:
        event_name: Stable event name (e.g., 'run_start'). Must match a
            discriminator in `events.schema.v1.json` (`run_start`,
            `dataset_loaded`, `train_started`, `train_progress`,
            `train_finished`, `metrics_computed`, `artifacts_written`,
            `cancelling`, `run_cancelled`).
        **payload: Additional JSON-serializable fields for the event.
            Must conform to the matching event-type definition's required
            + optional properties (additionalProperties: false).
    """
    try:
        record: Dict[str, Any] = {
            "event": event_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        record.update(payload)

        # Preload 1: validate against events.schema.v1 BEFORE stderr write.
        # This catches schema drift at unit-test / CI time, not only at
        # smoke time. On validation failure: log + drop. The run must not
        # break — events are best-effort signals, not control flow.
        if _EVENTS_VALIDATOR is not None:
            errors = list(_EVENTS_VALIDATOR.iter_errors(record))
            if errors:
                # Build a concise reason string. Don't dump the full record
                # (it might be large) — first error path + message is enough
                # for an operator to find the offending emit site.
                first = errors[0]
                logger.warning(
                    "Dropping event %r: failed schema validation at %s: %s",
                    event_name,
                    list(first.absolute_path) or ["<root>"],
                    first.message,
                )
                return

        line = json.dumps(record, ensure_ascii=False, sort_keys=True)
        # Use stderr.write + flush so we don't pull in extra logging plumbing
        # for the contract-bearing channel.
        sys.stderr.write(line + "\n")
        sys.stderr.flush()
    except Exception:
        # Best-effort: emission must never break the run. Log via standard
        # logger (which goes to stderr too, but as free-form text — Bridge
        # ignores non-JSONL stderr lines).
        logger.warning("Failed to emit structured event %r", event_name, exc_info=True)
from .model_factory import create_estimator, get_model_display_name
from .resolver import resolve_config, ResolvedConfig, get_param_provenance
from .hyperparams import validate_and_convert, HyperparamError
from .metrics_v1 import compute_metrics_v1, write_metrics_v1, get_metrics_profile_display_name
from .feature_importance import (
    extract_feature_importance,
    write_feature_importance,
    supports_feature_importance,
    get_feature_names_from_csv_header,
)
from .linear_coefficients import (
    extract_linear_coefficients,
    write_linear_coefficients,
    supports_linear_coefficients,
)
from .interpretability_index import (
    build_interpretability_index,
    write_interpretability_index,
)


class LoadResult(NamedTuple):
    """Result from load_csv with all observability data."""
    X: np.ndarray
    y: np.ndarray
    num_samples: int
    num_features: int
    rows_dropped: int


class TrainResult(NamedTuple):
    """Result from train_model with pipeline and validation data."""
    pipeline: Any
    accuracy: float
    X_val: np.ndarray
    y_val: np.ndarray


def _find_workspace_outputs_dir(start_path: Path) -> Optional[Path]:
    """
    Find the workspace `.ml/outputs/` directory by walking up from start_path.

    The TS extension uses `<workspace>/.ml/` as the workspace dir and writes
    runs into `<workspace>/.ml/runs/<run-id>/`. The provenance index lives
    at `<workspace>/.ml/outputs/index.json` (matching
    `WORKSPACE_PATHS.INDEX_FILE` in `src/types.ts`).

    Strategy: walk up from `start_path` (the run output directory) looking
    for an ancestor named `.ml`. Returns `<found>/outputs/`, ensuring it
    exists.

    Pre-iter-#5a, this looked for `.runforge/` and silently returned None
    in production because TS uses `.ml/`, not `.runforge/`. As a result the
    `index.json` was never written by Python. iter #5a fixes that and
    consolidates Python as the single writer.

    Returns:
        Path to `<workspace>/.ml/outputs/`, or None if no `.ml` ancestor
        was found.
    """
    current = start_path.resolve()

    # Walk current + parents looking for `.ml`
    for ancestor in [current] + list(current.parents):
        if ancestor.name == ".ml":
            outputs = ancestor / "outputs"
            outputs.mkdir(parents=True, exist_ok=True)
            return outputs
        # Also accept `.ml` as a sibling-dir at this level
        candidate = ancestor / ".ml"
        if candidate.exists() and candidate.is_dir():
            outputs = candidate / "outputs"
            outputs.mkdir(parents=True, exist_ok=True)
            return outputs

    return None


# Backward-compat alias for any in-repo callers we may have missed.
# Production code uses `_find_workspace_outputs_dir` directly.
_find_runforge_dir = _find_workspace_outputs_dir


# ---------------------------------------------------------------------------
# Phase 4 (FT-PY-004): SIGTERM handler + cancel state machine.
#
# Contract (CONTRACT-PHASE-4.md §3.1.1, §3.1.3):
# - On SIGTERM, emit `cancelling{seconds_remaining: 5}` immediately, then
#   one `cancelling` per second of grace as a daemon thread ticks down.
# - Perform synchronous cleanup (flush stdout/stderr; record partial state).
# - Atomically write `.cancelled` marker via `write_cancelled_marker()`.
# - Emit `run_cancelled{graceful: true, step}` as the FINAL event.
# - Exit non-zero (exit code 1).
#
# The TS side runs an independent 5-second SIGKILL trigger — that is a
# control-flow trigger only, NOT a graceful detector. Whether or not
# SIGKILL fires, `.cancelled` (or `run_cancelled`) is what tells the Bridge
# the cleanup was graceful (§3.1.3).
#
# Both signals (marker on disk, event on stderr) are redundant by design.
# Either is sufficient for graceful detection. If marker write fails the
# event still lands; if event emission fails the marker still lands. If
# both fail: TS falls back to "Cancelled (forced)" via no-marker-no-event
# detection — acceptable degradation, exactly the design.
# ---------------------------------------------------------------------------


class _CancelContext:
    """
    Mutable shared state between `run_training()` and the SIGTERM handler.

    Single instance per run; lives on the module as `_cancel_context` while
    the handler is registered, cleared on normal exit. The handler reads
    `step`, `run_id`, `run_dir`, `workspace_root`, `partial_artifacts`.
    `run_training` updates `step` (and `run_id` once it is generated) as
    the run progresses.

    Why a single mutable object instead of separate globals: the signal
    handler runs in the main thread interrupting whatever I/O was active.
    It needs ONE pointer, not five — fewer races on partially-updated
    state. The handler does not lock; it accepts that any field may be
    None or stale, since the cancel path is best-effort.
    """

    def __init__(self) -> None:
        # The current run phase. One of CANCEL_STEPS. Updated by run_training
        # as it progresses through phases.
        self.step: str = "dataset_loading"
        # The run id. Initially a placeholder (the schema requires a
        # non-empty string matching ^[A-Za-z0-9._-]+$); replaced with the
        # real run_id after dataset fingerprint is computed.
        self.run_id: str = ""
        # Absolute path to the run dir (where the .cancelled marker lands).
        self.run_dir: Optional[Path] = None
        # Workspace root (parent of `.ml/`). Used by write_cancelled_marker
        # to normalize run_dir to a workspace-relative path. May be None
        # if run is outside a `.ml` workspace; that's fine, the marker
        # writer falls back to absolute path normalization.
        self.workspace_root: Optional[Path] = None
        # Tracked partial artifacts as they are written. Listed in the
        # `.cancelled` marker so the UI can surface "Open partial artifacts".
        self.partial_artifacts: List[str] = []
        # Set on SIGTERM to short-circuit the run loop if reachable. Phase
        # 4 doesn't yet poll this — sklearn.fit() can't be interrupted
        # cooperatively without rebuilding training. The signal handler
        # does its work and exits; the flag is a hook for future phases.
        self.cancel_requested: bool = False
        # Previous SIGTERM handler so we can restore on normal exit
        # (test isolation matters — without restore, pytest's own SIGTERM
        # handling could be replaced).
        self._previous_handler: Any = None
        # Whether the handler is currently registered. Lets unregister be idempotent.
        self._registered: bool = False
        # Set once handler has fired, so a double-SIGTERM (rare) doesn't
        # re-enter the cleanup path.
        self._cleanup_started: bool = False


# Module-level slot for the active cancel context. Single training run per
# Python process is the contract today (the CLI invokes `run_training` then
# exits); concurrent runs would need refactoring.
_cancel_context: Optional[_CancelContext] = None


def _cancelling_ticker(ctx: _CancelContext, total_seconds: int) -> None:
    """
    Daemon thread: emit one `cancelling` event per second as the grace
    window counts down. Runs concurrently with the synchronous cleanup
    happening in the main thread (the SIGTERM handler).

    Stops when `cleanup_started` flips to False on normal exit OR when
    the countdown reaches zero. Each emission is best-effort — if stderr
    is closed or schema validation drops the event, the next tick still
    fires.
    """
    # Initial event already emitted by the handler at seconds_remaining=N.
    # This thread emits the descending ticks.
    for remaining in range(total_seconds - 1, -1, -1):
        time.sleep(1.0)
        if not ctx._cleanup_started:
            # Cleanup completed and handler exited; stop ticking.
            return
        try:
            emit_event(
                "cancelling",
                run_id=ctx.run_id or "pending",
                seconds_remaining=remaining,
                step=ctx.step,
            )
        except Exception:
            # Best-effort. Keep ticking.
            pass


def _sigterm_handler(signum: int, frame: Any) -> None:
    """
    SIGTERM handler. Runs in the main thread, interrupting whatever I/O
    was active.

    Sequence (CONTRACT-PHASE-4.md §3.1.1):
      1. Emit `cancelling{seconds_remaining: 5}` immediately.
      2. Spawn daemon thread for 1Hz countdown ticks.
      3. Flush stdout/stderr so any in-flight prints land.
      4. Atomically write `.cancelled` marker.
      5. Emit `run_cancelled{graceful: true, step}`.
      6. sys.exit(1).

    Both the marker and the event are redundant signals — either is
    sufficient for graceful detection on the TS side (§3.1.3).
    """
    ctx = _cancel_context
    if ctx is None or ctx._cleanup_started:
        # No active run, or already cleaning up — let the default handler
        # do its job (which here means terminate).
        sys.exit(1)
        return

    ctx._cleanup_started = True
    ctx.cancel_requested = True

    # Step 1: emit cancelling{seconds_remaining: 5} IMMEDIATELY, before any
    # cleanup work. Per Preload 2 doctrine — the user-facing UI count starts
    # ticking right now.
    grace_seconds = 5
    try:
        emit_event(
            "cancelling",
            run_id=ctx.run_id or "pending",
            seconds_remaining=grace_seconds,
            step=ctx.step,
        )
    except Exception:
        pass

    # Step 2: kick off countdown ticker in a daemon thread so the user
    # sees the "Cancelling… N s" affordance even while cleanup is busy.
    ticker = threading.Thread(
        target=_cancelling_ticker,
        args=(ctx, grace_seconds),
        daemon=True,
        name="runforge-cancel-ticker",
    )
    ticker.start()

    # Step 3: flush in-flight output. Best-effort.
    try:
        sys.stdout.flush()
    except Exception:
        pass
    try:
        sys.stderr.flush()
    except Exception:
        pass

    # Step 4: atomically write the .cancelled marker. This is the canonical
    # on-disk graceful signal — it MUST be attempted before the
    # run_cancelled event so the on-disk side wins races where stderr is
    # closed or piped to a dead reader.
    marker_written = False
    if ctx.run_dir is not None and ctx.workspace_root is not None and ctx.run_id:
        marker_path = write_cancelled_marker(
            run_dir=ctx.run_dir,
            run_id=ctx.run_id,
            workspace_root=ctx.workspace_root,
            step=ctx.step,
            reason="user cancelled via SIGTERM",
            partial_artifacts=ctx.partial_artifacts or None,
        )
        marker_written = marker_path is not None

    # Step 5: emit run_cancelled as the final event. Even if marker write
    # failed, the event still provides redundant graceful signal per §3.1.3.
    try:
        emit_event(
            "run_cancelled",
            run_id=ctx.run_id or "pending",
            step=ctx.step,
            graceful=True,
            reason="user cancelled via SIGTERM",
        )
    except Exception:
        pass

    # Stop the ticker by clearing the cleanup flag (the daemon polls it).
    # Setting False here is safe: we've already emitted run_cancelled, and
    # the ticker would otherwise keep racing the exit.
    ctx._cleanup_started = False

    # Step 6: non-zero exit. Use sys.exit (raises SystemExit) so any
    # finally-blocks in caller stacks still get a chance to clean up.
    # If we're already in a finally / nested signal, fall back to os._exit.
    try:
        sys.exit(1)
    except SystemExit:
        raise
    except BaseException:
        os._exit(1)


def _register_sigterm_handler(ctx: _CancelContext) -> None:
    """
    Register the SIGTERM handler for the active run.

    On Windows, signal.signal() with SIGTERM works for graceful shutdown
    triggered by Ctrl+C in some shells, but actual taskkill / TerminateProcess
    bypasses Python entirely. This is acceptable: the TS-side 5-second
    SIGKILL trigger covers the bypass case. The handler is a best-effort
    cooperative cleanup path; SIGKILL is the hard backstop.
    """
    global _cancel_context
    _cancel_context = ctx
    try:
        ctx._previous_handler = signal.signal(signal.SIGTERM, _sigterm_handler)
        ctx._registered = True
    except (ValueError, OSError) as e:
        # signal.signal can raise ValueError if called outside the main
        # thread, or OSError on platforms where SIGTERM cannot be installed.
        # We log and proceed — the run still works; cancel is just not
        # cooperative on this platform.
        logger.warning(
            "Could not install SIGTERM handler (cancel will be non-graceful): %s",
            e,
        )


def _unregister_sigterm_handler(ctx: _CancelContext) -> None:
    """Restore the previous SIGTERM handler. Idempotent."""
    global _cancel_context
    if not ctx._registered:
        _cancel_context = None
        return
    try:
        signal.signal(signal.SIGTERM, ctx._previous_handler or signal.SIG_DFL)
    except (ValueError, OSError):
        pass
    ctx._registered = False
    if _cancel_context is ctx:
        _cancel_context = None


def run_training(
    preset_id: str,
    out_dir: str,
    seed: Optional[int] = None,
    device: str = "cpu",
    model_family: str = "logistic_regression",
    cli_params: Optional[Dict[str, str]] = None,
    profile_name: Optional[str] = None,
    name: str = "",
) -> None:
    """
    Execute a training run on CSV data.

    Trains a classifier on the dataset specified by RUNFORGE_DATASET
    environment variable.

    Args:
        preset_id: The preset ID to use (std-train or hq-train)
        out_dir: Output directory for artifacts
        seed: Random seed (optional)
        device: Device to use (cpu for Phase 2)
        model_family: Model family to use (Phase 3.1)
            - logistic_regression (default)
            - random_forest
            - linear_svc
        cli_params: Hyperparameters from --param CLI args (Phase 3.2)
        profile_name: Training profile name (Phase 3.2)
        name: User-facing run name (iter #5a) — passed via `--name` CLI
            arg from the TS extension, threaded through to the index entry.
            Empty string falls back to `run_id` at index-write time.
    """
    # Capture training start for `summary.duration_ms` (iter #5a).
    training_start_ms = int(time.monotonic() * 1000)

    # Get preset configuration
    preset = get_preset(preset_id)
    defaults = preset["defaults"]

    # Phase 3.2: Resolve hyperparameters from profile + CLI
    resolved = resolve_config(
        model_family=model_family,
        cli_params=cli_params,
        profile_name=profile_name,
    )

    # Profile can override model_family
    actual_model_family = resolved.model_family

    # Set seed for reproducibility (moved before fingerprint so any RNG-using
    # validation paths see the configured seed too).
    actual_seed = seed if seed is not None else defaults["seed"]
    random.seed(actual_seed)
    np.random.seed(actual_seed)

    # Ensure output directory exists
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    # Create artifacts directory
    artifacts_path = out_path / "artifacts"
    artifacts_path.mkdir(parents=True, exist_ok=True)

    # Get dataset path from environment
    dataset_path = os.environ.get("RUNFORGE_DATASET")
    if not dataset_path:
        raise ValueError(
            "RUNFORGE_DATASET environment variable not set. "
            "Please set it to the path of your CSV file."
        )

    dataset_file = Path(dataset_path)
    if not dataset_file.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_path}")

    # Phase 2.2.1: compute dataset fingerprint and generate run_id EARLY so:
    #   1. The run_start event carries the canonical run_id (schema requires it).
    #   2. The SIGTERM handler can reference run_id in cancel events even if
    #      cancellation arrives during dataset_loading.
    # Pre-Phase-4 this happened mid-run, but the schema-validated event stream
    # forces the move forward. Determinism is unchanged — run_id is still a
    # pure function of (dataset fingerprint, label column).
    dataset_fingerprint = compute_dataset_fingerprint(dataset_file)
    run_id = generate_run_id(dataset_fingerprint, "label")

    # Phase 4 (FT-PY-004): cancel context + SIGTERM handler.
    # Initialize BEFORE the run_start emission so a cancel arriving during
    # the very first event still has somewhere to land. Step starts as
    # "dataset_loading" — what we're about to do.
    cancel_ctx = _CancelContext()
    cancel_ctx.run_id = run_id
    cancel_ctx.run_dir = out_path
    cancel_ctx.step = "dataset_loading"
    workspace_outputs_dir_pre = _find_workspace_outputs_dir(out_path)
    if workspace_outputs_dir_pre is not None:
        cancel_ctx.workspace_root = workspace_outputs_dir_pre.parent.parent
    else:
        # Outside a `.ml` workspace: marker writer falls back to absolute
        # path normalization; still useful as a graceful signal.
        cancel_ctx.workspace_root = out_path.parent

    _register_sigterm_handler(cancel_ctx)

    try:
        # F-PY-B004 (iter #5b) + Phase 4 (FT-PY-005): emit structured
        # `run_start` event to stderr. With Phase 4 the schema requires
        # run_id, which is now available since we generated it above.
        emit_event(
            "run_start",
            run_id=run_id,
            preset_id=preset_id,
            model_family=actual_model_family,
            out_dir=str(out_dir),
        )

        # Validate and convert hyperparameters to proper types
        typed_hyperparams: Dict[str, Any] = {}
        if resolved.hyperparameters:
            # Separate string params (from CLI) from already-typed params (from profile)
            string_params = {
                k: v for k, v in resolved.hyperparameters.items()
                if isinstance(v, str)
            }
            typed_params = {
                k: v for k, v in resolved.hyperparameters.items()
                if not isinstance(v, str)
            }

            # Validate and convert string params
            if string_params:
                typed_hyperparams.update(validate_and_convert(actual_model_family, string_params))

            # Add already-typed params directly
            typed_hyperparams.update(typed_params)

        print(f"RunForge Training Runner v{RUNFORGE_VERSION}")
        print(f"=" * 50)
        print(f"Preset:         {preset['name']} ({preset_id})")
        print(f"Model:          {get_model_display_name(actual_model_family)} ({actual_model_family})")
        if resolved.has_profile():
            print(f"Profile:        {resolved.profile_name} (v{resolved.profile_version})")
        print(f"Epochs:         {defaults['epochs']}")
        print(f"Learning Rate:  {defaults['learning_rate']}")
        print(f"Regularization: {defaults['regularization']}")
        print(f"Solver:         {defaults['solver']}")
        print(f"Max Iter:       {defaults['max_iter']}")
        if typed_hyperparams:
            print(f"Hyperparams:    {typed_hyperparams}")
        print(f"Seed:           {actual_seed}")
        print(f"Device:         {device}")
        print(f"Dataset:        {dataset_path}")
        print(f"Output:         {out_dir}")
        print(f"=" * 50)
        print()

        print(f"Dataset fingerprint: {dataset_fingerprint[:16]}...")

        # Load and parse CSV
        print("Loading dataset...")
        load_result = load_csv(dataset_file)
        X, y = load_result.X, load_result.y
        num_samples = load_result.num_samples
        num_features = load_result.num_features
        rows_dropped = load_result.rows_dropped
        print(f"  Samples:  {num_samples}")
        print(f"  Features: {num_features}")
        if rows_dropped > 0:
            print(f"  Dropped:  {rows_dropped} rows with missing values")
        print()

        # FT-PY-005: dataset_loaded event. Includes the dataset fingerprint
        # so the TS Bridge can correlate the event stream with the on-disk
        # run.json without parsing the file.
        emit_event(
            "dataset_loaded",
            run_id=run_id,
            num_samples=num_samples,
            num_features=num_features,
            rows_dropped=rows_dropped,
            label_column="label",
            dataset_fingerprint_sha256=dataset_fingerprint,
        )

        # Phase advance: dataset is loaded, training is next.
        cancel_ctx.step = "training"

        # Train model with 80/20 split
        model_name = get_model_display_name(actual_model_family)
        print(f"Training {model_name} (80/20 split)...")

        # FT-PY-005: train_started event before model.fit().
        emit_event(
            "train_started",
            run_id=run_id,
            model_family=actual_model_family,
        )

        # FT-PY-005: per-epoch progress callback. Captures run_id; emits
        # train_progress events at each epoch boundary inside train_model.
        def _emit_progress(
            epoch: int, total_epochs: int, val_accuracy: float
        ) -> None:
            payload: Dict[str, Any] = {
                "run_id": run_id,
                "epoch": epoch,
                "total_epochs": total_epochs,
            }
            # val_accuracy is in [0,1] for classifiers; the schema allows
            # the optional field — include it when present.
            if val_accuracy is not None and 0.0 <= val_accuracy <= 1.0:
                payload["val_accuracy"] = round(float(val_accuracy), 6)
            emit_event("train_progress", **payload)

        train_start_seconds = time.monotonic()
        train_result = train_model(
            X=X,
            y=y,
            model_family=actual_model_family,
            regularization=defaults["regularization"],
            solver=defaults["solver"],
            max_iter=defaults["max_iter"],
            epochs=defaults["epochs"],
            seed=actual_seed,
            hyperparams=typed_hyperparams,
            progress_callback=_emit_progress,
        )
        pipeline = train_result.pipeline
        accuracy = train_result.accuracy
        train_duration_seconds = time.monotonic() - train_start_seconds

        # FT-PY-005: train_finished event after model.fit() returns.
        emit_event(
            "train_finished",
            run_id=run_id,
            duration_seconds=round(train_duration_seconds, 6),
        )

        # Phase advance: training done, artifacts begin.
        cancel_ctx.step = "artifact_writing"

        # Save pipeline artifact
        model_path = artifacts_path / "model.pkl"
        with open(model_path, "wb") as f:
            pickle.dump(pipeline, f)
        cancel_ctx.partial_artifacts.append("artifacts/model.pkl")
        print(f"Model saved: {model_path}")

        # Write metrics.json (STRICT: exactly 3 keys)
        metrics = {
            "accuracy": round(accuracy, 4),
            "num_samples": num_samples,
            "num_features": num_features,
        }

        metrics_path = out_path / "metrics.json"
        with open(metrics_path, "w") as f:
            json.dump(metrics, f, indent=2)
        cancel_ctx.partial_artifacts.append("metrics.json")

        # Phase advance: metrics computation distinct from artifact writing
        # so the cancel marker can pinpoint where in the post-train flow
        # we were when the cancel landed.
        cancel_ctx.step = "metrics_computation"

        # Phase 3.3: Compute and write metrics.v1.json
        metrics_v1 = compute_metrics_v1(
            pipeline=pipeline,
            X_val=train_result.X_val,
            y_val=train_result.y_val,
            model_family=actual_model_family,
        )
        metrics_v1_path = write_metrics_v1(metrics_v1, out_path)
        cancel_ctx.partial_artifacts.append("metrics.v1.json")
        print(f"Metrics v1 saved: {metrics_v1_path}")
        print(f"  Profile: {get_metrics_profile_display_name(metrics_v1['metrics_profile'])}")

        # FT-PY-005: metrics_computed event after metrics.v1.json is written.
        # Schema requires `metrics_profile`; accuracy is optional but
        # informative — include it.
        metrics_event_payload: Dict[str, Any] = {
            "run_id": run_id,
            "metrics_profile": metrics_v1["metrics_profile"],
        }
        if 0.0 <= float(accuracy) <= 1.0:
            metrics_event_payload["accuracy"] = round(float(accuracy), 6)
        emit_event("metrics_computed", **metrics_event_payload)

        # Phase advance: artifact writing (interpretability + run.json + index).
        cancel_ctx.step = "artifact_writing"

        # Phase 3.4: Extract and write feature importance (if supported)
        feature_importance_artifact_path: Optional[str] = None
        feature_importance_schema_version: Optional[str] = None

        feature_names = get_feature_names_from_csv_header(dataset_file, "label")
        fi_result = extract_feature_importance(
            pipeline=pipeline,
            model_family=actual_model_family,
            feature_names=feature_names,
        )

        if fi_result.success and fi_result.artifact:
            fi_path = write_feature_importance(fi_result.artifact, out_path)
            feature_importance_artifact_path = "artifacts/feature_importance.v1.json"
            feature_importance_schema_version = fi_result.artifact["schema_version"]
            cancel_ctx.partial_artifacts.append(feature_importance_artifact_path)
            print(f"Feature importance saved: {fi_path}")
            print(f"  Top features: {', '.join(fi_result.artifact['top_k'][:5])}")
        else:
            # Emit diagnostic (not an error - just means feature importance unavailable)
            if fi_result.diagnostic:
                print(f"Feature importance: {fi_result.diagnostic.value}")
                if fi_result.diagnostic_message:
                    print(f"  {fi_result.diagnostic_message}")

        # Phase 3.5: Extract and write linear coefficients (if supported)
        linear_coefficients_artifact_path: Optional[str] = None
        linear_coefficients_schema_version: Optional[str] = None

        lc_result = extract_linear_coefficients(
            pipeline=pipeline,
            model_family=actual_model_family,
            feature_names=feature_names,
        )

        if lc_result.success and lc_result.artifact:
            lc_path = write_linear_coefficients(lc_result.artifact, out_path)
            linear_coefficients_artifact_path = "artifacts/linear_coefficients.v1.json"
            linear_coefficients_schema_version = lc_result.artifact["schema_version"]
            cancel_ctx.partial_artifacts.append(linear_coefficients_artifact_path)
            print(f"Linear coefficients saved: {lc_path}")
            # Show top features for first class
            if lc_result.artifact["top_k_by_class"]:
                top_entry = lc_result.artifact["top_k_by_class"][0]
                top_features = top_entry["top_features"][:5]
                print(f"  Top features (class {top_entry['class']}): {', '.join(top_features)}")
        else:
            # Emit diagnostic (not an error - just means coefficients unavailable)
            if lc_result.diagnostic:
                print(f"Linear coefficients: {lc_result.diagnostic.value}")
                if lc_result.diagnostic_message:
                    print(f"  {lc_result.diagnostic_message}")

        # Phase 2.2.1: Build run metadata. (run_id was generated earlier so the
        # run_start event could carry it — see top of run_training.)
        # Phase 3.2: Get hyperparameter provenance for metadata
        hyperparam_provenance = get_param_provenance(resolved) if resolved.hyperparameters else None

        metadata = create_run_metadata(
            run_id=run_id,
            dataset_path=str(dataset_file.resolve()),
            dataset_fingerprint=dataset_fingerprint,
            label_column="label",
            num_samples=num_samples,
            num_features=num_features,
            dropped_rows=rows_dropped,
            accuracy=round(accuracy, 4),
            model_pkl_path="artifacts/model.pkl",
            model_family=actual_model_family,
            # Phase 3.2: Profile info (only if profile was used)
            profile_name=resolved.profile_name,
            profile_version=resolved.profile_version,
            expanded_parameters_hash=resolved.expanded_parameters_hash,
            hyperparameters=hyperparam_provenance,
            # Phase 3.3: Metrics v1 pointer
            metrics_v1_schema_version=metrics_v1["schema_version"],
            metrics_v1_profile=metrics_v1["metrics_profile"],
            metrics_v1_artifact_path="metrics.v1.json",
            # Phase 3.4: Feature importance (only if available)
            feature_importance_schema_version=feature_importance_schema_version,
            feature_importance_artifact_path=feature_importance_artifact_path,
            # Phase 3.5: Linear coefficients (only if available)
            linear_coefficients_schema_version=linear_coefficients_schema_version,
            linear_coefficients_artifact_path=linear_coefficients_artifact_path,
        )

        # Write run.json to output directory
        run_json_path = write_run_metadata(metadata, out_path)
        cancel_ctx.partial_artifacts.append("run.json")
        print(f"Metadata saved: {run_json_path}")

        # Phase 3.6: Build and write interpretability index
        interp_index = build_interpretability_index(
            run_json=metadata,
            run_dir=out_path,
        )
        interp_index_path = write_interpretability_index(interp_index, out_path)
        cancel_ctx.partial_artifacts.append("interpretability.index.v1.json")
        print(f"Interpretability index saved: {interp_index_path}")
        available_count = len(interp_index.get("available_artifacts", {}))
        print(f"  Available artifacts: {available_count}")

        # iter #5a: Update provenance index (Python is the single writer of
        # `<workspace>/.ml/outputs/index.json`).
        workspace_outputs_dir = _find_workspace_outputs_dir(out_path)
        if workspace_outputs_dir:
            # Workspace root is the parent of `.ml/`. All paths in the
            # index entry are workspace-relative with forward slashes.
            workspace_root = workspace_outputs_dir.parent.parent
            try:
                run_rel_path = out_path.resolve().relative_to(workspace_root.resolve())

                duration_ms = int(time.monotonic() * 1000) - training_start_ms
                run_summary = {
                    "duration_ms": duration_ms,
                    "final_metrics": {
                        "accuracy": round(accuracy, 4),
                    },
                    "device": device,
                }

                append_run_to_index(
                    workspace_outputs_dir=workspace_outputs_dir,
                    run_id=run_id,
                    created_at=metadata["created_at"],
                    name=name or run_id,
                    preset_id=preset_id,
                    status="succeeded",
                    summary=run_summary,
                    run_dir=str(run_rel_path).replace("\\", "/"),
                    dataset_fingerprint_sha256=dataset_fingerprint,
                    label_column="label",
                    model_pkl=str(run_rel_path / "artifacts" / "model.pkl").replace("\\", "/"),
                )
                print(f"Provenance index updated: {workspace_outputs_dir / 'index.json'}")
            except Exception as e:
                # F-PY-B002 (iter #5b): Don't fail training if provenance update
                # fails — but DO leave a structured `.index-orphan` marker under
                # the run directory so the TS Bridge can surface the run as
                # "saved but not indexed" rather than silently dropping it.
                #
                # The marker shape conforms to
                # `python/ml_runner/contracts/index-orphan.schema.v1.0.0.json`
                # and `IndexOrphanMarker` in `src/types.ts`.
                logger.warning(
                    "Could not update provenance index: %s",
                    e,
                    exc_info=True,
                )
                marker_path = write_index_orphan_marker(
                    run_dir=out_path,
                    run_id=run_id,
                    workspace_root=workspace_root,
                    index_path=get_index_path(workspace_outputs_dir),
                    error=e,
                )
                if marker_path is not None:
                    print(
                        f"Warning: provenance index update failed; orphan marker "
                        f"written at {marker_path}"
                    )
                else:
                    print(
                        f"Warning: provenance index update failed: {e}"
                    )
        else:
            print("Note: Not in a .ml workspace, skipping provenance index")

        # FT-PY-005: artifacts_written is the LAST successful event before
        # exit code 0. Pairs with run.json existence on disk for §3.1.3
        # source-of-truth detection.
        artifact_count = len(cancel_ctx.partial_artifacts)
        try:
            run_rel = out_path.resolve().relative_to(
                cancel_ctx.workspace_root.resolve()
            )
            run_dir_rel = str(run_rel).replace("\\", "/")
        except (ValueError, OSError, AttributeError):
            run_dir_rel = str(out_path).replace("\\", "/")
        emit_event(
            "artifacts_written",
            run_id=run_id,
            artifact_count=max(1, artifact_count),
            run_dir=run_dir_rel,
        )

        print()
        print(f"=" * 50)
        print(f"Training complete!")
        print(f"Run ID:              {run_id}")
        print(f"Validation Accuracy: {accuracy:.4f}")
        print(f"Total Samples:       {num_samples}")
        print(f"Features:            {num_features}")
        print(f"Dropped Rows:        {rows_dropped}")
        print(f"Model saved:         {model_path}")
        print(f"Metrics saved:       {metrics_path}")
        print(f"=" * 50)
    finally:
        # Always restore the previous SIGTERM handler. Critical for test
        # isolation (otherwise pytest's SIGTERM handling stays clobbered)
        # and clean library use (a caller of run_training shouldn't get
        # their signal handlers permanently rebound).
        _unregister_sigterm_handler(cancel_ctx)


def load_csv(path: Path) -> LoadResult:
    """
    Load CSV file into numpy arrays.

    CSV format requirements:
    - First row is header
    - Must have a column named 'label' (case-sensitive)
    - All other columns are features
    - All values must be numeric
    - Rows with missing values are dropped

    Returns:
        LoadResult with:
        - X: Feature matrix (n_samples, n_features)
        - y: Label vector (n_samples,)
        - num_samples: Number of samples (after dropping missing)
        - num_features: Number of features
        - rows_dropped: Count of rows dropped due to missing values
    """
    # F-PY-B003 (iter #5b): read raw text first so we can strip a UTF-8 BOM
    # from the first column name. UTF-8-with-BOM CSVs (Excel default on
    # Windows) inject `﻿` into header[0]; the result was an opaque
    # "CSV must contain a 'label' column" failure even when the file
    # clearly had one. Strip silently — Excel users hit this constantly
    # and the BOM is information-free for our purposes.
    #
    # FT-PY-008 (Phase 4 §3.3): wrap UnicodeDecodeError with an actionable
    # message instead of letting the cryptic codec error reach the user.
    # Phase 4 does NOT auto-detect encoding (Q5 conservative path); the
    # user is told exactly how to fix it.
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError as e:
        raise ValueError(
            "CSV is not UTF-8. Re-save with UTF-8 encoding "
            "(Excel: Save As → CSV UTF-8)."
        ) from e
    if content.startswith("﻿"):
        content = content.lstrip("﻿")
    lines = content.splitlines(keepends=True)

    if len(lines) < 2:
        raise ValueError(
            "CSV has no data rows (only header). "
            "Add at least one data row to train."
        )

    # FT-PY-008 (Phase 4 §3.3): non-comma delimiter detection.
    # Conservative explicit-error path per Q5 — Phase 4 does NOT auto-detect.
    # Inspect the header line: if it contains zero commas but has at least
    # one ';' or tab, the file is using a non-comma delimiter. Raise an
    # actionable message before pandas/sklearn turns it into a cryptic
    # "expected N columns, got 1" error.
    header_line = lines[0].rstrip("\r\n")
    if header_line and "," not in header_line:
        for delim, label in ((";", ";"), ("\t", "\\t")):
            if delim in header_line:
                raise ValueError(
                    f"CSV uses '{label}' delimiter; only ',' is supported. "
                    f"Convert with: pandas.read_csv(file, sep='{label}')"
                    f".to_csv(out, sep=',')"
                )

    # Parse header
    header = [h.strip() for h in lines[0].strip().split(",")]

    # Find label column (case-sensitive: must be exactly 'label')
    if "label" not in header:
        raise ValueError("CSV must contain a 'label' column.")

    label_idx = header.index("label")
    feature_names = [h for i, h in enumerate(header) if i != label_idx]
    num_features = len(feature_names)

    # F-PY-B003 (iter #5b): single-column CSV (only 'label', no features)
    # used to silently produce num_features=0 and downstream sklearn
    # warnings. Catch up-front with a specific actionable message.
    if num_features == 0:
        raise ValueError(
            "CSV must have at least one feature column in addition to 'label'."
        )

    # Parse data rows
    data_rows: List[List[float]] = []
    labels: List[float] = []
    rows_dropped = 0

    # F-PY-B003 (iter #5b): track non-empty label values to detect the
    # all-NaN-label case before the row-drop step swallows it into a
    # generic "no valid data rows" error.
    label_has_value = False

    # FT-PY-008 (Phase 4 §3.3): track whether ANY non-blank data line
    # existed, to distinguish header-only CSV from "all rows dropped due
    # to missing values". The latter already has a specific error
    # downstream; the former gets its own message.
    saw_non_blank_data_line = False

    for i, line in enumerate(lines[1:], start=2):
        line = line.strip()
        if not line:
            continue
        saw_non_blank_data_line = True

        parts = [p.strip() for p in line.split(",")]
        if len(parts) != len(header):
            raise ValueError(f"Row {i}: expected {len(header)} columns, got {len(parts)}")

        # Track whether any row carries a non-empty label cell, regardless
        # of feature emptiness — feeds the all-NaN-label diagnostic.
        if parts[label_idx] != "":
            label_has_value = True

        # Check for missing values (empty strings)
        has_missing = any(p == "" for p in parts)
        if has_missing:
            rows_dropped += 1
            continue

        # Parse numeric values
        try:
            row_values = []
            label_value = None
            for j, p in enumerate(parts):
                val = float(p)
                if j == label_idx:
                    label_value = val
                else:
                    row_values.append(val)

            data_rows.append(row_values)
            labels.append(label_value)
        except ValueError:
            # Find which column caused the error
            for j, p in enumerate(parts):
                try:
                    float(p)
                except ValueError:
                    col_name = header[j]
                    # FT-PY-008 (Phase 4 §3.3): when the offending column
                    # is the label, surface the LabelEncoder hint instead
                    # of the generic non-numeric message. Classification
                    # requires integer/float labels — categorical labels
                    # like "yes"/"no" need encoding before training.
                    if j == label_idx:
                        raise ValueError(
                            f"Label column 'label' contains non-numeric "
                            f"values (row {i}: '{p}'). RunForge "
                            f"classification requires integer or float "
                            f"labels. Convert categorical labels with "
                            f"sklearn.preprocessing.LabelEncoder before "
                            f"training."
                        )
                    raise ValueError(f"Non-numeric value in column '{col_name}' at row {i}")

    if rows_dropped > 0:
        print(f"Dropped {rows_dropped} rows with missing values")

    # FT-PY-008 (Phase 4 §3.3): header-only CSV (no non-blank data lines).
    # The `len(lines) < 2` check at the top catches the literal one-line
    # case; this catches CSVs with trailing blank lines after the header.
    if not saw_non_blank_data_line:
        raise ValueError(
            "CSV has no data rows (only header). "
            "Add at least one data row to train."
        )

    # F-PY-B003 (iter #5b): if no data rows had a label value at all, that's
    # an all-NaN-label dataset — surface a specific message rather than the
    # downstream "no valid data rows" generic error.
    if not label_has_value:
        raise ValueError(
            "Label column 'label' is empty or all NaN. "
            "Add at least one numeric label value."
        )

    if not data_rows:
        raise ValueError("CSV has no valid data rows after dropping missing values")

    # Convert to numpy
    X = np.array(data_rows)
    y = np.array(labels)
    num_samples = X.shape[0]

    return LoadResult(X, y, num_samples, num_features, rows_dropped)


def train_model(
    X: np.ndarray,
    y: np.ndarray,
    model_family: str,
    regularization: float,
    solver: str,
    max_iter: int,
    epochs: int,
    seed: int,
    hyperparams: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Any] = None,
) -> TrainResult:
    """
    Train a classifier using sklearn Pipeline with model selection.

    Phase 3.1: Supports multiple model families via model_factory.
    Phase 3.2: Accepts hyperparameter overrides from profiles/CLI.
    Phase 3.3: Returns validation data for metrics_v1 computation.
    Phase 4 (FT-PY-005): Optional progress_callback for per-epoch event
    emission. Cardinality is per-epoch only (Q4 Mike decision).

    Uses deterministic 80/20 train/val split.
    Accuracy is computed on validation set only.

    Args:
        X: Feature matrix
        y: Labels
        model_family: Model identifier (logistic_regression, random_forest, linear_svc)
        regularization: Regularization strength (C = 1/regularization for applicable models)
        solver: Solver to use (for logistic_regression)
        max_iter: Maximum iterations
        epochs: Number of training epochs (for progress output)
        seed: Random seed
        hyperparams: Optional dict of hyperparameter overrides (Phase 3.2)
        progress_callback: Optional callable invoked per epoch with kwargs
            (epoch: int, total_epochs: int, val_accuracy: float). For
            non-iterative models, called once with epoch=0, total_epochs=1.
            Best-effort — exceptions in the callback are swallowed.

    Returns:
        TrainResult with pipeline, accuracy, X_val, y_val
    """
    from sklearn.model_selection import train_test_split
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    def _safe_progress(**kwargs: Any) -> None:
        if progress_callback is None:
            return
        try:
            progress_callback(**kwargs)
        except Exception:
            # Progress callback errors must not break training. Log via the
            # module logger; the run continues regardless.
            logger.warning(
                "progress_callback raised; suppressing", exc_info=True
            )

    # Deterministic 80/20 train/val split
    try:
        # Try stratified split first
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=seed, stratify=y
        )
    except ValueError:
        # Fall back to non-stratified if stratify fails (e.g., too few samples per class)
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=seed
        )

    print(f"  Train samples: {len(X_train)}, Val samples: {len(X_val)}")

    # Phase 3.2: Merge hyperparams with defaults
    # Precedence: hyperparams > preset defaults
    hp = hyperparams or {}

    # C is inverse of regularization strength (for applicable models)
    # Can be overridden by hyperparams
    C = hp.get("C", 1.0 / regularization if regularization > 0 else 1e6)

    # Create estimator using model factory
    # Build model-specific kwargs based on what each model accepts
    # Phase 3.2: hyperparams override preset defaults
    if model_family == "logistic_regression":
        estimator = create_estimator(
            model_family,
            random_state=seed,
            C=C,
            solver=hp.get("solver", solver),
            max_iter=hp.get("max_iter", max_iter),
            warm_start=hp.get("warm_start", True),
        )
    elif model_family == "random_forest":
        estimator = create_estimator(
            model_family,
            random_state=seed,
            n_estimators=hp.get("n_estimators", 100),
            max_depth=hp.get("max_depth", None),
        )
    elif model_family == "linear_svc":
        estimator = create_estimator(
            model_family,
            random_state=seed,
            C=C,
            max_iter=hp.get("max_iter", max_iter),
        )
    else:
        # Fallback (should not reach here due to CLI validation)
        estimator = create_estimator(model_family, random_state=seed)

    # Create pipeline with scaler and classifier
    # Note: Step name is 'clf' for backward compatibility with artifact inspection
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', estimator)
    ])

    # Training loop
    # Note: epochs are only meaningful for models with warm_start (LogisticRegression)
    # For other models, we train once but show progress
    if model_family == "logistic_regression":
        # Use epochs with warm_start for Logistic Regression
        # Use hyperparam max_iter if provided, else preset default
        effective_max_iter = hp.get("max_iter", max_iter)
        for epoch in range(1, epochs + 1):
            clf = pipeline.named_steps['clf']
            if epoch == epochs:
                clf.max_iter = effective_max_iter
            else:
                clf.max_iter = max(1, effective_max_iter // epochs)

            pipeline.fit(X_train, y_train)
            val_accuracy = pipeline.score(X_val, y_val)
            print(f"  Epoch {epoch}/{epochs} - val_accuracy: {val_accuracy:.4f}")

            # FT-PY-005: per-epoch train_progress event.
            _safe_progress(
                epoch=epoch,
                total_epochs=epochs,
                val_accuracy=float(val_accuracy),
            )
    else:
        # Single training pass for other models
        pipeline.fit(X_train, y_train)
        val_accuracy = pipeline.score(X_val, y_val)
        print(f"  Training complete - val_accuracy: {val_accuracy:.4f}")

        # FT-PY-005: non-iterative models emit ONE train_progress event for
        # cardinality consistency. epoch=0, total_epochs=1.
        _safe_progress(
            epoch=0,
            total_epochs=1,
            val_accuracy=float(val_accuracy),
        )

    # Final validation accuracy
    accuracy = pipeline.score(X_val, y_val)

    return TrainResult(pipeline, accuracy, X_val, y_val)
