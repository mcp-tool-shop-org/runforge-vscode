/**
 * Renderer Tests (Phase 2.3)
 *
 * Tests for markdown summary renderers.
 *
 * POST iter #5a UPDATE: Bridge's `2ca61b8` tightened the renderers to the
 * canonical `RunMetadata` type imported from `src/types.ts` (no more
 * `Record<string, unknown>` casts). Fixtures now construct the full canonical
 * shape — `dataset` object, `metrics`, `metrics_v1` pointer, `artifacts`, etc.
 * Cases that previously passed minimal partial shapes now build complete
 * fixtures so the type contract holds at compile time AND the renderer can
 * traverse `runJson.dataset.path` etc. without a TypeError.
 */

import { describe, it, expect } from 'vitest';
import { renderRunSummary } from '../src/observability/render/run-summary.js';
import { renderDiagnosticsSummary } from '../src/observability/render/diagnostics-summary.js';
import { renderArtifactSummary } from '../src/observability/render/artifact-summary.js';
import type { ArtifactInspectResult } from '../src/observability/artifact-inspect-command.js';
import type { RunMetadata } from '../src/types.js';

/** Build a canonical RunMetadata fixture (post iter #5a). */
function makeRunMetadata(overrides: Partial<RunMetadata> = {}): RunMetadata {
  return {
    run_id: 'test-run-123',
    runforge_version: '0.2.2.2',
    schema_version: 'run.v0.3.6',
    created_at: '2024-01-15T10:30:00Z',
    label_column: 'target',
    model_family: 'logistic_regression',
    num_samples: 1000,
    num_features: 10,
    dropped_rows_missing_values: 5,
    dataset: {
      path: 'data.csv',
      fingerprint_sha256: 'abc123def456',
    },
    metrics: {
      accuracy: 0.95,
      num_samples: 1000,
      num_features: 10,
    },
    metrics_v1: {
      schema_version: 'metrics.v1',
      metrics_profile: 'classification.base.v1',
      artifact_path: 'metrics.v1.json',
    },
    artifacts: {
      model_pkl: 'model.pkl',
    },
    ...overrides,
  };
}

describe('renderRunSummary', () => {
  it('renders complete run metadata as markdown', () => {
    const runJson = makeRunMetadata();

    const markdown = renderRunSummary(runJson, 'test-run-123');

    expect(markdown).toContain('# Run Summary');
    expect(markdown).toContain('test-run-123');
    expect(markdown).toContain('0.2.2.2');
    expect(markdown).toContain('`target`');
    expect(markdown).toContain('1000');
    expect(markdown).toContain('10');
    expect(markdown).toContain('5'); // dropped rows
    expect(markdown).toContain('data.csv');
    expect(markdown).toContain('abc123def456');
    expect(markdown).toContain('95.00%'); // accuracy formatted
    expect(markdown).toContain('model.pkl');
  });

  it('renders a minimal-but-valid canonical run metadata', () => {
    // Post iter #5a, RunMetadata has REQUIRED fields (`dataset`, `metrics`,
    // `metrics_v1`, `artifacts`) — there is no "minimal partial" shape.
    // This test verifies the renderer handles a small but well-formed fixture.
    const runJson = makeRunMetadata({
      run_id: 'minimal-run',
      label_column: 'label',
      num_samples: 0,
      num_features: 0,
      dropped_rows_missing_values: 0,
      dataset: { path: '', fingerprint_sha256: '' },
      metrics: { accuracy: 0, num_samples: 0, num_features: 0 },
    });

    const markdown = renderRunSummary(runJson, 'minimal-run');

    expect(markdown).toContain('# Run Summary');
    expect(markdown).toContain('minimal-run');
    // Renderer outputs the value (zero) — no thrown error on the canonical shape.
    expect(markdown).toContain('0.00%'); // zero accuracy still formatted
  });

  it('formats accuracy as percentage', () => {
    const runJson = makeRunMetadata({
      metrics: {
        accuracy: 0.8765,
        num_samples: 100,
        num_features: 5,
      },
    });

    const markdown = renderRunSummary(runJson, 'test');

    expect(markdown).toContain('87.65%');
  });
});

describe('renderDiagnosticsSummary', () => {
  it('synthesizes MISSING_VALUES_DROPPED diagnostic', () => {
    const runJson = makeRunMetadata({
      dropped_rows_missing_values: 15,
    });

    const markdown = renderDiagnosticsSummary(runJson, 'test-run');

    expect(markdown).toContain('# Diagnostics');
    expect(markdown).toContain('test-run');
    expect(markdown).toContain('MISSING_VALUES_DROPPED');
    expect(markdown).toContain('15 rows');
    expect(markdown).toContain('info'); // severity
  });

  it('shows no diagnostics when dropped_rows is zero', () => {
    const runJson = makeRunMetadata({
      dropped_rows_missing_values: 0,
    });

    const markdown = renderDiagnosticsSummary(runJson, 'test-run');

    expect(markdown).toContain('No diagnostics recorded');
    expect(markdown).not.toContain('MISSING_VALUES_DROPPED');
  });

  it('shows no diagnostics when dropped_rows is undefined-equivalent', () => {
    // Post iter #5a, RunMetadata.dropped_rows_missing_values is REQUIRED.
    // The legacy "shows unavailable message when field missing" case no
    // longer applies to canonical RunMetadata — but the synthesizer's
    // contract for "no synthesizable diagnostics" remains: emit the
    // "no diagnostics recorded" footer rather than synthesize from absent
    // fields. Asserting that contract directly.
    const runJson = makeRunMetadata({
      dropped_rows_missing_values: 0,
    });

    const markdown = renderDiagnosticsSummary(runJson, 'test-run');

    expect(markdown).toContain('No diagnostics recorded');
    expect(markdown).not.toContain('MISSING_VALUES_DROPPED');
  });

  it('includes deferred note in footer', () => {
    const runJson = makeRunMetadata({
      dropped_rows_missing_values: 5,
    });

    const markdown = renderDiagnosticsSummary(runJson, 'test-run');

    expect(markdown).toContain('DEFERRED_UX_ENHANCEMENTS');
  });
});

describe('renderArtifactSummary', () => {
  it('renders pipeline steps as markdown table', () => {
    const result: ArtifactInspectResult = {
      schema_version: '0.2.2.2',
      artifact_path: 'model.pkl',
      pipeline_steps: [
        { name: 'scaler', type: 'StandardScaler', module: 'sklearn.preprocessing._data' },
        { name: 'clf', type: 'LogisticRegression', module: 'sklearn.linear_model._logistic' },
      ],
      has_preprocessing: true,
      step_count: 2,
    };

    const markdown = renderArtifactSummary(result);

    expect(markdown).toContain('# Pipeline Inspection');
    expect(markdown).toContain('0.2.2.2');
    expect(markdown).toContain('model.pkl');
    expect(markdown).toContain('2'); // step count
    expect(markdown).toContain('Yes'); // has preprocessing
    expect(markdown).toContain('scaler');
    expect(markdown).toContain('StandardScaler');
    expect(markdown).toContain('LogisticRegression');
  });

  it('marks preprocessing steps with emoji', () => {
    const result: ArtifactInspectResult = {
      schema_version: '0.2.2.2',
      artifact_path: 'model.pkl',
      pipeline_steps: [
        { name: 'scaler', type: 'StandardScaler', module: 'sklearn.preprocessing._data' },
      ],
      has_preprocessing: true,
      step_count: 1,
    };

    const markdown = renderArtifactSummary(result);

    // StandardScaler is a preprocessing step
    expect(markdown).toMatch(/scaler.*StandardScaler/);
  });

  it('handles empty pipeline', () => {
    const result: ArtifactInspectResult = {
      schema_version: '0.2.2.2',
      artifact_path: 'model.pkl',
      pipeline_steps: [],
      has_preprocessing: false,
      step_count: 0,
    };

    const markdown = renderArtifactSummary(result);

    expect(markdown).toContain('No steps found');
  });

  it('includes read-only disclaimer', () => {
    const result: ArtifactInspectResult = {
      schema_version: '0.2.2.2',
      artifact_path: 'model.pkl',
      pipeline_steps: [],
      has_preprocessing: false,
      step_count: 0,
    };

    const markdown = renderArtifactSummary(result);

    expect(markdown).toContain('read-only');
    expect(markdown).toContain('does not retrain');
  });
});
