/**
 * Tests for observability formatter functions.
 *
 * Each observability command exports a pure format*() function that converts
 * structured data into human-readable text for the VS Code output channel.
 * These are critical for user experience and highly testable.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock vscode (all observability commands import it at module level)
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      dispose: () => {},
      clear: () => {},
    }),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
    showTextDocument: () => Promise.resolve(undefined),
  },
  workspace: {
    workspaceFolders: undefined,
    openTextDocument: () => Promise.resolve({}),
  },
  ViewColumn: { Active: 1, Beside: 2 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

import { formatInspectResult } from '../src/observability/inspect-command.js';
import { formatArtifactInspectResult } from '../src/observability/artifact-inspect-command.js';
import { formatMetricsV1 } from '../src/observability/metrics-v1-command.js';
import { formatFeatureImportance } from '../src/observability/feature-importance-command.js';
import { formatLinearCoefficients } from '../src/observability/linear-coefficients-command.js';
import { formatInterpretabilityIndex } from '../src/observability/interpretability-index-command.js';

// ── formatInspectResult ──────────────────────────────────────────────────────

describe('formatInspectResult', () => {
  const sampleResult = {
    dataset_path: '/data/iris.csv',
    fingerprint_sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    columns: ['sepal_length', 'sepal_width', 'petal_length', 'petal_width', 'label'],
    num_rows: 150,
    label_column: 'label',
    num_features_excluding_label: 4,
    label_present: true,
  };

  it('includes the dataset path', () => {
    const output = formatInspectResult(sampleResult);
    expect(output).toContain('/data/iris.csv');
  });

  it('truncates fingerprint to 16 chars', () => {
    const output = formatInspectResult(sampleResult);
    expect(output).toContain('abcdef1234567890...');
  });

  it('shows row and feature counts', () => {
    const output = formatInspectResult(sampleResult);
    expect(output).toContain('150');
    expect(output).toContain('4');
  });

  it('marks the label column as found', () => {
    const output = formatInspectResult(sampleResult);
    expect(output).toContain('label');
    expect(output).toContain('✓ found');
  });

  it('marks the label column as NOT FOUND when missing', () => {
    const result = { ...sampleResult, label_present: false };
    const output = formatInspectResult(result);
    expect(output).toContain('✗ NOT FOUND');
  });

  it('lists all columns', () => {
    const output = formatInspectResult(sampleResult);
    expect(output).toContain('sepal_length');
    expect(output).toContain('sepal_width');
    expect(output).toContain('petal_length');
    expect(output).toContain('petal_width');
  });

  it('marks the label column specially in column list', () => {
    const output = formatInspectResult(sampleResult);
    expect(output).toContain('label (label)');
  });
});

// ── formatArtifactInspectResult ──────────────────────────────────────────────

describe('formatArtifactInspectResult', () => {
  const sampleResult = {
    schema_version: '0.2.2.2',
    artifact_path: 'artifacts/model.pkl',
    pipeline_steps: [
      { name: 'StandardScaler', type: 'transformer', module: 'sklearn.preprocessing' },
      { name: 'LogisticRegression', type: 'estimator', module: 'sklearn.linear_model' },
    ],
    has_preprocessing: true,
    step_count: 2,
  };

  it('includes schema version', () => {
    const output = formatArtifactInspectResult(sampleResult);
    expect(output).toContain('0.2.2.2');
  });

  it('includes artifact path', () => {
    const output = formatArtifactInspectResult(sampleResult);
    expect(output).toContain('artifacts/model.pkl');
  });

  it('shows step count', () => {
    const output = formatArtifactInspectResult(sampleResult);
    expect(output).toContain('2');
  });

  it('shows preprocessing status as Yes', () => {
    const output = formatArtifactInspectResult(sampleResult);
    expect(output).toContain('Yes');
  });

  it('shows preprocessing status as No', () => {
    const result = { ...sampleResult, has_preprocessing: false };
    const output = formatArtifactInspectResult(result);
    expect(output).toContain('No');
  });

  it('lists pipeline steps with numbering', () => {
    const output = formatArtifactInspectResult(sampleResult);
    expect(output).toContain('1. StandardScaler');
    expect(output).toContain('2. LogisticRegression');
  });

  it('shows step type and module', () => {
    const output = formatArtifactInspectResult(sampleResult);
    expect(output).toContain('transformer');
    expect(output).toContain('sklearn.preprocessing');
    expect(output).toContain('estimator');
    expect(output).toContain('sklearn.linear_model');
  });

  it('handles empty pipeline', () => {
    const result = { ...sampleResult, pipeline_steps: [], step_count: 0 };
    const output = formatArtifactInspectResult(result);
    expect(output).toContain('0');
  });
});

// ── formatMetricsV1 ──────────────────────────────────────────────────────────

describe('formatMetricsV1', () => {
  const baseMetrics = {
    schema_version: '0.3.3',
    metrics_profile: 'classification.base.v1',
    num_classes: 3,
    accuracy: 0.9533,
    precision_macro: 0.9567,
    recall_macro: 0.9533,
    f1_macro: 0.9528,
  };

  it('shows profile display name', () => {
    const output = formatMetricsV1(baseMetrics);
    expect(output).toContain('Classification Base');
  });

  it('shows unknown profile as-is', () => {
    const output = formatMetricsV1({ ...baseMetrics, metrics_profile: 'custom.v2' });
    expect(output).toContain('custom.v2');
  });

  it('formats accuracy as percentage', () => {
    const output = formatMetricsV1(baseMetrics);
    expect(output).toContain('95.33%');
  });

  it('formats precision as percentage', () => {
    const output = formatMetricsV1(baseMetrics);
    expect(output).toContain('95.67%');
  });

  it('shows number of classes', () => {
    const output = formatMetricsV1(baseMetrics);
    expect(output).toContain('3');
  });

  it('shows confusion matrix when present', () => {
    const withCM = {
      ...baseMetrics,
      confusion_matrix: [[45, 2, 0], [1, 43, 3], [0, 1, 46]],
    };
    const output = formatMetricsV1(withCM);
    expect(output).toContain('Confusion Matrix');
    expect(output).toContain('45');
  });

  it('shows ROC-AUC when present', () => {
    const withProba = {
      ...baseMetrics,
      metrics_profile: 'classification.proba.v1',
      roc_auc: 0.9912,
      log_loss: 0.1234,
    };
    const output = formatMetricsV1(withProba);
    expect(output).toContain('99.12%');
    expect(output).toContain('0.1234');
  });

  it('shows per-class metrics when present', () => {
    const withPerClass = {
      ...baseMetrics,
      per_class_precision: [0.95, 0.96, 0.97],
      per_class_recall: [0.94, 0.93, 0.98],
      per_class_f1: [0.945, 0.945, 0.975],
      class_labels: [0, 1, 2],
    };
    const output = formatMetricsV1(withPerClass);
    expect(output).toContain('Per-Class Metrics');
  });
});

// ── formatFeatureImportance ──────────────────────────────────────────────────

describe('formatFeatureImportance', () => {
  const sampleArtifact = {
    schema_version: '0.3.4',
    model_family: 'random_forest',
    importance_type: 'gini',
    num_features: 4,
    features_by_importance: [
      { name: 'petal_width', importance: 0.45, rank: 1, index: 3 },
      { name: 'petal_length', importance: 0.40, rank: 2, index: 2 },
      { name: 'sepal_length', importance: 0.10, rank: 3, index: 0 },
      { name: 'sepal_width', importance: 0.05, rank: 4, index: 1 },
    ],
    features_by_original_order: [
      { name: 'sepal_length', importance: 0.10, rank: 3, index: 0 },
      { name: 'sepal_width', importance: 0.05, rank: 4, index: 1 },
      { name: 'petal_length', importance: 0.40, rank: 2, index: 2 },
      { name: 'petal_width', importance: 0.45, rank: 1, index: 3 },
    ],
    top_k: ['petal_width', 'petal_length'],
  };

  it('includes model family', () => {
    const output = formatFeatureImportance(sampleArtifact);
    expect(output).toContain('random_forest');
  });

  it('includes importance type', () => {
    const output = formatFeatureImportance(sampleArtifact);
    expect(output).toContain('gini');
  });

  it('includes feature count', () => {
    const output = formatFeatureImportance(sampleArtifact);
    expect(output).toContain('4');
  });

  it('lists features by importance', () => {
    const output = formatFeatureImportance(sampleArtifact);
    expect(output).toContain('petal_width');
    expect(output).toContain('45.00%');
  });

  it('lists features by original order', () => {
    const output = formatFeatureImportance(sampleArtifact);
    expect(output).toContain('Features by Original Order');
  });

  it('shows "and N more" when features exceed 10', () => {
    const manyFeatures = {
      ...sampleArtifact,
      num_features: 15,
      features_by_importance: Array.from({ length: 15 }, (_, i) => ({
        name: `feat_${i}`,
        importance: (15 - i) / 100,
        rank: i + 1,
        index: i,
      })),
    };
    const output = formatFeatureImportance(manyFeatures);
    expect(output).toContain('... and 5 more features');
  });
});

// ── formatLinearCoefficients ─────────────────────────────────────────────────

describe('formatLinearCoefficients', () => {
  const sampleArtifact = {
    schema_version: '0.3.5',
    model_family: 'logistic_regression',
    coefficient_space: 'standardized',
    num_features: 4,
    num_classes: 3,
    classes: [0, 1, 2],
    intercepts: [
      { class: 0, intercept: -0.5432 },
      { class: 1, intercept: 0.1234 },
      { class: 2, intercept: 0.4198 },
    ],
    coefficients_by_class: [
      {
        class: 0,
        features: [
          { name: 'petal_width', coefficient: -2.5, abs_coefficient: 2.5, rank: 1 },
          { name: 'sepal_length', coefficient: 0.8, abs_coefficient: 0.8, rank: 2 },
        ],
      },
    ],
    top_k_by_class: [
      { class: 0, top_features: ['petal_width', 'sepal_length'] },
    ],
  };

  it('includes standardized space disclaimer', () => {
    const output = formatLinearCoefficients(sampleArtifact);
    expect(output).toContain('STANDARDIZED');
  });

  it('includes model family', () => {
    const output = formatLinearCoefficients(sampleArtifact);
    expect(output).toContain('logistic_regression');
  });

  it('shows class count', () => {
    const output = formatLinearCoefficients(sampleArtifact);
    expect(output).toContain('3');
  });

  it('shows intercepts', () => {
    const output = formatLinearCoefficients(sampleArtifact);
    expect(output).toContain('Intercepts');
    expect(output).toContain('-0.5432');
  });

  it('shows coefficients per class', () => {
    const output = formatLinearCoefficients(sampleArtifact);
    expect(output).toContain('Coefficients for Class 0');
    expect(output).toContain('petal_width');
  });

  it('shows sign indicators', () => {
    const output = formatLinearCoefficients(sampleArtifact);
    expect(output).toContain('-'); // negative coefficient
    expect(output).toContain('+'); // positive coefficient
  });

  it('includes interpretation guide', () => {
    const output = formatLinearCoefficients(sampleArtifact);
    expect(output).toContain('Interpretation Guide');
    expect(output).toContain('log-odds');
  });
});

// ── formatInterpretabilityIndex ──────────────────────────────────────────────

describe('formatInterpretabilityIndex', () => {
  const sampleIndex = {
    schema_version: '0.3.6',
    run_id: '20260101-120000-test-abc1',
    runforge_version: '0.4.4',
    created_at: '2026-01-01T12:00:00+00:00',
    available_artifacts: {
      metrics_v1: {
        schema_version: '0.3.3',
        path: 'artifacts/metrics.v1.json',
        summary: {
          metrics_profile: 'classification.proba.v1',
          accuracy: 0.95,
        },
      },
      feature_importance_v1: {
        schema_version: '0.3.4',
        path: 'artifacts/feature_importance.v1.json',
        summary: {
          model_family: 'random_forest',
          top_k: ['petal_width', 'petal_length'],
        },
      },
    },
  };

  it('includes run ID', () => {
    const output = formatInterpretabilityIndex(sampleIndex, '/runs/test');
    expect(output).toContain('20260101-120000-test-abc1');
  });

  it('includes RunForge version', () => {
    const output = formatInterpretabilityIndex(sampleIndex, '/runs/test');
    expect(output).toContain('0.4.4');
  });

  it('shows available artifact count', () => {
    const output = formatInterpretabilityIndex(sampleIndex, '/runs/test');
    expect(output).toContain('Available Artifacts: 2');
  });

  it('shows metrics checkmark when present', () => {
    const output = formatInterpretabilityIndex(sampleIndex, '/runs/test');
    expect(output).toContain('✓ Metrics v1');
    expect(output).toContain('95.00%');
  });

  it('shows feature importance when present', () => {
    const output = formatInterpretabilityIndex(sampleIndex, '/runs/test');
    expect(output).toContain('✓ Feature Importance v1');
    expect(output).toContain('random_forest');
    expect(output).toContain('petal_width');
  });

  it('shows cross mark for missing linear coefficients', () => {
    const output = formatInterpretabilityIndex(sampleIndex, '/runs/test');
    expect(output).toContain('✗ Linear Coefficients v1');
  });

  it('shows all missing when no artifacts', () => {
    const emptyIndex = {
      ...sampleIndex,
      available_artifacts: {},
    };
    const output = formatInterpretabilityIndex(emptyIndex, '/runs/test');
    expect(output).toContain('Available Artifacts: 0');
    expect(output).toContain('✗ Metrics v1');
    expect(output).toContain('✗ Feature Importance v1');
    expect(output).toContain('✗ Linear Coefficients v1');
  });

  it('includes interpretation guide', () => {
    const output = formatInterpretabilityIndex(sampleIndex, '/runs/test');
    expect(output).toContain('Interpretation Guide');
  });
});
