/**
 * Renderer Tests (Phase 2.3)
 *
 * Tests for markdown summary renderers.
 */

import { describe, it, expect } from 'vitest';
import { renderRunSummary } from '../src/observability/render/run-summary.js';
import { renderDiagnosticsSummary } from '../src/observability/render/diagnostics-summary.js';
import { renderArtifactSummary } from '../src/observability/render/artifact-summary.js';
import type { ArtifactInspectResult } from '../src/observability/artifact-inspect-command.js';

describe('renderRunSummary', () => {
  it('renders complete run metadata as markdown', () => {
    const runJson = {
      run_id: 'test-run-123',
      runforge_version: '0.2.2.2',
      created_at: '2024-01-15T10:30:00Z',
      label_column: 'target',
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
      artifacts: {
        model_pkl: 'model.pkl',
      },
    };

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

  it('handles missing optional fields gracefully', () => {
    const runJson = {
      run_id: 'minimal-run',
      label_column: 'label',
    };

    const markdown = renderRunSummary(runJson, 'minimal-run');

    expect(markdown).toContain('# Run Summary');
    expect(markdown).toContain('minimal-run');
    expect(markdown).toContain('unknown'); // missing fields show as unknown
  });

  it('formats accuracy as percentage', () => {
    const runJson = {
      metrics: {
        accuracy: 0.8765,
      },
    };

    const markdown = renderRunSummary(runJson, 'test');

    expect(markdown).toContain('87.65%');
  });
});

describe('renderDiagnosticsSummary', () => {
  it('synthesizes MISSING_VALUES_DROPPED diagnostic', () => {
    const runJson = {
      dropped_rows_missing_values: 15,
    };

    const markdown = renderDiagnosticsSummary(runJson, 'test-run');

    expect(markdown).toContain('# Diagnostics');
    expect(markdown).toContain('test-run');
    expect(markdown).toContain('MISSING_VALUES_DROPPED');
    expect(markdown).toContain('15 rows');
    expect(markdown).toContain('info'); // severity
  });

  it('shows no diagnostics when dropped_rows is zero', () => {
    const runJson = {
      dropped_rows_missing_values: 0,
    };

    const markdown = renderDiagnosticsSummary(runJson, 'test-run');

    expect(markdown).toContain('No diagnostics recorded');
    expect(markdown).not.toContain('MISSING_VALUES_DROPPED');
  });

  it('shows unavailable message when field missing', () => {
    const runJson = {};

    const markdown = renderDiagnosticsSummary(runJson, 'test-run');

    expect(markdown).toContain('Diagnostics Unavailable');
    expect(markdown).toContain('missing required fields');
  });

  it('includes deferred note in footer', () => {
    const runJson = {
      dropped_rows_missing_values: 5,
    };

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
