/**
 * Markdown Snapshot Tests (Phase 4 — Wave 4 / FT-TEST-002)
 *
 * Locks down the exact wire-format of every user-facing markdown renderer.
 * Snapshots COMPLEMENT the existing structural assertions in
 * `renderers.test.ts`, `recovery-report-render.test.ts`, and
 * `formatters.test.ts` — they catch unintended whitespace / column /
 * pluralization drift that a `toContain()` check would miss.
 *
 * DETERMINISM CONTRACT (per Wave 4 brief):
 *   - All fixtures use frozen, hand-authored timestamps and run_ids.
 *   - `renderRunSummary` is invoked with `{ deterministic: true }` so the
 *     `Created` cell emits the raw ISO string (locale-independent), not
 *     `Date#toLocaleString()` (which varies by TZ).
 *   - Other renderers in scope are already pure (no Date.now(), no random,
 *     no env reads).
 *
 * CONTRACT RULE 5 — these tests call the real exported render functions
 * with realistic typed inputs. No mocks, no hand-built expected strings.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock vscode — observability command modules import it at module load time,
// even though the format*() functions themselves are pure. Same pattern as
// test/formatters.test.ts.
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

import { renderRunSummary } from '../src/observability/render/run-summary.js';
import { renderDiagnosticsSummary } from '../src/observability/render/diagnostics-summary.js';
import { renderArtifactSummary } from '../src/observability/render/artifact-summary.js';
import { renderRecoveryReport } from '../src/observability/render/recovery-report-summary.js';
import { formatMetricsV1 } from '../src/observability/metrics-v1-command.js';
import { formatFeatureImportance } from '../src/observability/feature-importance-command.js';
import { formatLinearCoefficients } from '../src/observability/linear-coefficients-command.js';
import { formatInterpretabilityIndex } from '../src/observability/interpretability-index-command.js';

import type { ArtifactInspectResult } from '../src/observability/artifact-inspect-command.js';
import type {
  FeatureImportance,
  InterpretabilityIndex,
  LinearCoefficients,
  MetricsV1,
  RecoveryReport,
  RunMetadata,
} from '../src/types.js';

// ── Frozen fixtures ──────────────────────────────────────────────────────────

const FIXTURE_RUN_ID = 'run-2026-04-25-fixture';
const FIXTURE_CREATED_AT = '2026-04-25T07:30:00Z';

function makeRunMetadata(overrides: Partial<RunMetadata> = {}): RunMetadata {
  return {
    run_id: FIXTURE_RUN_ID,
    runforge_version: '0.4.0.0',
    schema_version: 'run.v0.3.6',
    created_at: FIXTURE_CREATED_AT,
    label_column: 'target',
    model_family: 'logistic_regression',
    num_samples: 1000,
    num_features: 10,
    dropped_rows_missing_values: 5,
    dataset: {
      path: 'data/train.csv',
      fingerprint_sha256: 'a'.repeat(64),
    },
    metrics: {
      accuracy: 0.9542,
      num_samples: 1000,
      num_features: 10,
    },
    metrics_v1: {
      schema_version: 'metrics.v1',
      metrics_profile: 'classification.base.v1',
      artifact_path: 'metrics.v1.json',
    },
    artifacts: {
      model_pkl: 'artifacts/model.pkl',
    },
    ...overrides,
  };
}

// ── renderRunSummary ─────────────────────────────────────────────────────────

describe('renderRunSummary — snapshot', () => {
  it('matches snapshot for a populated canonical run (deterministic mode)', () => {
    const md = renderRunSummary(makeRunMetadata(), FIXTURE_RUN_ID, {
      deterministic: true,
    });
    expect(md).toMatchInlineSnapshot(`
      "# Run Summary — run-2026-04-25-fixture

      ## Key Facts

      | Field | Value |
      |-------|-------|
      | RunForge Version | 0.4.0.0 |
      | Created | 2026-04-25T07:30:00Z |
      | Label Column | \`target\` |
      | Samples | 1000 |
      | Features | 10 |
      | Dropped Rows | 5 |

      ## Dataset

      - **Path:** \`data/train.csv\`
      - **Fingerprint:** \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\`

      ## Metrics

      | Metric | Value |
      |--------|-------|
      | Accuracy | 95.42% |
      | Samples | 1000 |
      | Features | 10 |

      ## Artifacts

      - **Model:** \`artifacts/model.pkl\`

      ---

      *To view raw JSON, use "RunForge: Open Latest Run Metadata" or open run.json directly.*
      "
    `);
  });

  it('matches snapshot for a minimal-zero run (deterministic mode)', () => {
    const md = renderRunSummary(
      makeRunMetadata({
        run_id: 'run-empty',
        label_column: 'lbl',
        num_samples: 0,
        num_features: 0,
        dropped_rows_missing_values: 0,
        dataset: { path: '', fingerprint_sha256: '' },
        metrics: { accuracy: 0, num_samples: 0, num_features: 0 },
      }),
      'run-empty',
      { deterministic: true }
    );
    expect(md).toMatchInlineSnapshot(`
      "# Run Summary — run-empty

      ## Key Facts

      | Field | Value |
      |-------|-------|
      | RunForge Version | 0.4.0.0 |
      | Created | 2026-04-25T07:30:00Z |
      | Label Column | \`lbl\` |
      | Samples | 0 |
      | Features | 0 |
      | Dropped Rows | 0 |

      ## Dataset

      - **Path:** \`\`
      - **Fingerprint:** \`\`

      ## Metrics

      | Metric | Value |
      |--------|-------|
      | Accuracy | 0.00% |
      | Samples | 0 |
      | Features | 0 |

      ## Artifacts

      - **Model:** \`artifacts/model.pkl\`

      ---

      *To view raw JSON, use "RunForge: Open Latest Run Metadata" or open run.json directly.*
      "
    `);
  });

  it('matches snapshot when label_column contains a pipe (escape coverage)', () => {
    const md = renderRunSummary(
      makeRunMetadata({ label_column: 'lbl|col' }),
      FIXTURE_RUN_ID,
      { deterministic: true }
    );
    expect(md).toMatchInlineSnapshot(`
      "# Run Summary — run-2026-04-25-fixture

      ## Key Facts

      | Field | Value |
      |-------|-------|
      | RunForge Version | 0.4.0.0 |
      | Created | 2026-04-25T07:30:00Z |
      | Label Column | \`lbl\\|col\` |
      | Samples | 1000 |
      | Features | 10 |
      | Dropped Rows | 5 |

      ## Dataset

      - **Path:** \`data/train.csv\`
      - **Fingerprint:** \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\`

      ## Metrics

      | Metric | Value |
      |--------|-------|
      | Accuracy | 95.42% |
      | Samples | 1000 |
      | Features | 10 |

      ## Artifacts

      - **Model:** \`artifacts/model.pkl\`

      ---

      *To view raw JSON, use "RunForge: Open Latest Run Metadata" or open run.json directly.*
      "
    `);
  });
});

// ── renderDiagnosticsSummary ─────────────────────────────────────────────────

describe('renderDiagnosticsSummary — snapshot', () => {
  it('matches snapshot when MISSING_VALUES_DROPPED is synthesized', () => {
    const md = renderDiagnosticsSummary(
      makeRunMetadata({ dropped_rows_missing_values: 15 }),
      FIXTURE_RUN_ID
    );
    expect(md).toMatchInlineSnapshot(`
      "# Diagnostics — run-2026-04-25-fixture

      ## Derived Diagnostics

      *These diagnostics are synthesized from run.json fields (v0.2.2.x metadata).*

      ### ℹ️ MISSING_VALUES_DROPPED

      **Severity:** info

      Dropped 15 rows with missing values

      **Details:**

      - \`rows_dropped\`: 15

      ---

      *Note: Full structured diagnostics emission is deferred.*
      *See docs/DEFERRED_UX_ENHANCEMENTS.md for future plans.*
      "
    `);
  });

  it('matches snapshot when no diagnostics are synthesized (zero dropped rows)', () => {
    const md = renderDiagnosticsSummary(
      makeRunMetadata({ dropped_rows_missing_values: 0 }),
      FIXTURE_RUN_ID
    );
    expect(md).toMatchInlineSnapshot(`
      "# Diagnostics — run-2026-04-25-fixture

      ## Derived Diagnostics

      *These diagnostics are synthesized from run.json fields (v0.2.2.x metadata).*

      **No diagnostics recorded for this run.**

      The run completed without any notable conditions.

      ---

      *Note: Full structured diagnostics emission is deferred.*
      *See docs/DEFERRED_UX_ENHANCEMENTS.md for future plans.*
      "
    `);
  });
});

// ── renderArtifactSummary ────────────────────────────────────────────────────

describe('renderArtifactSummary — snapshot', () => {
  it('matches snapshot for a typical scaler+classifier pipeline', () => {
    const result: ArtifactInspectResult = {
      schema_version: '0.4.0.0',
      artifact_path: 'artifacts/model.pkl',
      pipeline_steps: [
        {
          name: 'scaler',
          type: 'StandardScaler',
          module: 'sklearn.preprocessing._data',
        },
        {
          name: 'clf',
          type: 'LogisticRegression',
          module: 'sklearn.linear_model._logistic',
        },
      ],
      has_preprocessing: true,
      step_count: 2,
    };
    const md = renderArtifactSummary(result);
    expect(md).toMatchInlineSnapshot(`
      "# Pipeline Inspection

      ## Overview

      | Property | Value |
      |----------|-------|
      | Schema Version | 0.4.0.0 |
      | Artifact | \`artifacts/model.pkl\` |
      | Step Count | 2 |
      | Has Preprocessing | Yes |

      ## Pipeline Steps

      | # | Name | Type | Module |
      |---|------|------|--------|
      | 1 | 🔧 scaler | \`StandardScaler\` | \`sklearn.preprocessing._data\` |
      | 2 | clf | \`LogisticRegression\` | \`sklearn.linear_model._logistic\` |

      *🔧 = Preprocessing step*

      ---

      *Inspection is read-only and does not retrain or modify artifacts.*
      "
    `);
  });

  it('matches snapshot for an empty pipeline', () => {
    const result: ArtifactInspectResult = {
      schema_version: '0.4.0.0',
      artifact_path: 'artifacts/model.pkl',
      pipeline_steps: [],
      has_preprocessing: false,
      step_count: 0,
    };
    const md = renderArtifactSummary(result);
    expect(md).toMatchInlineSnapshot(`
      "# Pipeline Inspection

      ## Overview

      | Property | Value |
      |----------|-------|
      | Schema Version | 0.4.0.0 |
      | Artifact | \`artifacts/model.pkl\` |
      | Step Count | 0 |
      | Has Preprocessing | No |

      ## Pipeline Steps

      *No steps found in pipeline.*

      ---

      *Inspection is read-only and does not retrain or modify artifacts.*
      "
    `);
  });
});

// ── renderRecoveryReport ─────────────────────────────────────────────────────

describe('renderRecoveryReport — snapshot', () => {
  it('matches snapshot for an empty report', () => {
    const report: RecoveryReport = {
      scanned_run_dirs: 0,
      already_indexed: 0,
      recovered: [],
      skipped: [],
      cancelled_excluded: [],
      recovered_at: FIXTURE_CREATED_AT,
    };
    const md = renderRecoveryReport(report);
    expect(md).toMatchInlineSnapshot(`
      "# Recovery Report

      **Recovered at:** 2026-04-25T07:30:00Z

      ## Summary

      | Outcome | Count |
      |---|---|
      | Run dirs scanned | 0 |
      | Already indexed | 0 |
      | Newly recovered | 0 |
      | Skipped (errors) | 0 |
      | Cancelled (excluded) | 0 |

      ## Recovered runs

      *No new runs were recovered.*

      ## Skipped runs

      *No runs were skipped.*

      ## Cancelled runs (not indexed)

      These runs were cancelled mid-training (\`.cancelled\` marker present) and are
      intentionally excluded from the index per RunForge Phase 4 §3.1.2. Use
      "RunForge: Browse Runs" to inspect them directly.

      *No cancelled runs were excluded.*
      "
    `);
  });

  it('matches snapshot for a fully populated report', () => {
    const report: RecoveryReport = {
      scanned_run_dirs: 4,
      already_indexed: 1,
      recovered: [
        {
          run_id: '20260425-073000-myrun-abcd',
          run_dir: '.ml/runs/20260425-073000-myrun-abcd',
          reason: 'index_orphan_marker',
        },
        {
          run_id: '20260425-080000-other-ef01',
          run_dir: '.ml/runs/20260425-080000-other-ef01',
          reason: 'pre_existing_orphan',
        },
      ],
      skipped: [
        {
          run_dir: '.ml/runs/broken-1',
          error: 'CORRUPT_RUN_JSON',
          message: 'Unexpected token at position 42',
        },
      ],
      cancelled_excluded: [
        {
          run_id: '20260425-090000-cxl-9999',
          run_dir: '.ml/runs/20260425-090000-cxl-9999',
          reason: 'cancelled',
        },
      ],
      recovered_at: FIXTURE_CREATED_AT,
    };
    const md = renderRecoveryReport(report);
    expect(md).toMatchInlineSnapshot(`
      "# Recovery Report

      **Recovered at:** 2026-04-25T07:30:00Z

      ## Summary

      | Outcome | Count |
      |---|---|
      | Run dirs scanned | 4 |
      | Already indexed | 1 |
      | Newly recovered | 2 |
      | Skipped (errors) | 1 |
      | Cancelled (excluded) | 1 |

      ## Recovered runs

      | Run ID | Path | Reason |
      |---|---|---|
      | 20260425-073000-myrun-abcd | .ml/runs/20260425-073000-myrun-abcd | index_orphan_marker |
      | 20260425-080000-other-ef01 | .ml/runs/20260425-080000-other-ef01 | pre_existing_orphan |

      ## Skipped runs

      | Path | Error | Detail |
      |---|---|---|
      | .ml/runs/broken-1 | CORRUPT_RUN_JSON | Unexpected token at position 42 |

      ## Cancelled runs (not indexed)

      These runs were cancelled mid-training (\`.cancelled\` marker present) and are
      intentionally excluded from the index per RunForge Phase 4 §3.1.2. Use
      "RunForge: Browse Runs" to inspect them directly.

      | Run ID | Path |
      |---|---|
      | 20260425-090000-cxl-9999 | .ml/runs/20260425-090000-cxl-9999 |
      "
    `);
  });
});

// ── formatMetricsV1 ──────────────────────────────────────────────────────────

describe('formatMetricsV1 — snapshot', () => {
  it('matches snapshot for binary classification.base.v1 with confusion matrix', () => {
    const metrics: MetricsV1 = {
      schema_version: 'metrics.v1',
      metrics_profile: 'classification.base.v1',
      num_classes: 2,
      accuracy: 0.95,
      precision_macro: 0.94,
      recall_macro: 0.93,
      f1_macro: 0.935,
      confusion_matrix: [
        [50, 2],
        [3, 45],
      ],
    };
    const out = formatMetricsV1(metrics);
    expect(out).toMatchInlineSnapshot(`
      "RunForge Metrics v1
      ========================================

      Schema Version:  metrics.v1
      Metrics Profile: Classification Base
      Number of Classes: 2

      Base Metrics
      ----------------------------------------
      Accuracy:        95.00%
      Precision:       94.00%
      Recall:          93.00%
      F1 Score:        93.50%

      Confusion Matrix
      ----------------------------------------
           50     2
            3    45
      "
    `);
  });

  it('matches snapshot for multiclass with proba + per-class metrics', () => {
    const metrics: MetricsV1 = {
      schema_version: 'metrics.v1',
      metrics_profile: 'classification.multiclass.v1',
      num_classes: 3,
      accuracy: 0.88,
      precision_macro: 0.87,
      recall_macro: 0.86,
      f1_macro: 0.865,
      confusion_matrix: [
        [40, 1, 2],
        [3, 38, 1],
        [2, 0, 39],
      ],
      roc_auc: 0.92,
      log_loss: 0.3142,
      per_class_precision: [0.91, 0.85, 0.89],
      per_class_recall: [0.93, 0.82, 0.88],
      per_class_f1: [0.92, 0.835, 0.885],
      class_labels: ['cat', 'dog', 'bird'],
    };
    const out = formatMetricsV1(metrics);
    expect(out).toMatchInlineSnapshot(`
      "RunForge Metrics v1
      ========================================

      Schema Version:  metrics.v1
      Metrics Profile: Multiclass Classification
      Number of Classes: 3

      Base Metrics
      ----------------------------------------
      Accuracy:        88.00%
      Precision:       87.00%
      Recall:          86.00%
      F1 Score:        86.50%

      Confusion Matrix
      ----------------------------------------
           40     1     2
            3    38     1
            2     0    39

      Probability Metrics
      ----------------------------------------
      ROC-AUC:         92.00%
      Log Loss:        0.3142

      Per-Class Metrics
      ----------------------------------------
        Class     Precision  Recall     F1
        cat        91.00%      93.00%      92.00%
        dog        85.00%      82.00%      83.50%
        bird       89.00%      88.00%      88.50%
      "
    `);
  });
});

// ── formatFeatureImportance ──────────────────────────────────────────────────

describe('formatFeatureImportance — snapshot', () => {
  it('matches snapshot for a small RandomForest importance artifact', () => {
    const artifact: FeatureImportance = {
      schema_version: 'feature_importance.v1',
      model_family: 'random_forest',
      importance_type: 'gini_importance',
      num_features: 3,
      features_by_importance: [
        { name: 'age', importance: 0.5, rank: 1 },
        { name: 'income', importance: 0.3, rank: 2 },
        { name: 'height', importance: 0.2, rank: 3 },
      ],
      features_by_original_order: [
        { name: 'age', importance: 0.5, index: 0 },
        { name: 'income', importance: 0.3, index: 1 },
        { name: 'height', importance: 0.2, index: 2 },
      ],
      top_k: ['age', 'income', 'height'],
    };
    const out = formatFeatureImportance(artifact);
    expect(out).toMatchInlineSnapshot(`
      "RunForge Feature Importance
      ==================================================

      Schema Version:   feature_importance.v1
      Model Family:     random_forest
      Importance Type:  gini_importance
      Total Features:   3

      Top Features
      --------------------------------------------------
         1. age                  ████████████████████ 50.00%
         2. income               ████████████░░░░░░░░ 30.00%
         3. height               ████████░░░░░░░░░░░░ 20.00%

      Features by Original Order
      --------------------------------------------------
        [ 0] age                  50.00%
        [ 1] income               30.00%
        [ 2] height               20.00%
      "
    `);
  });

  it('matches snapshot when there are more than 10 features (truncation banner)', () => {
    const features = Array.from({ length: 12 }, (_, i) => ({
      name: `feat_${String(i + 1).padStart(2, '0')}`,
      importance: (12 - i) / 78,
      rank: i + 1,
    }));
    const artifact: FeatureImportance = {
      schema_version: 'feature_importance.v1',
      model_family: 'random_forest',
      importance_type: 'gini_importance',
      num_features: 12,
      features_by_importance: features,
      features_by_original_order: features.map((f, i) => ({
        name: f.name,
        importance: f.importance,
        index: i,
      })),
      top_k: features.slice(0, 10).map((f) => f.name),
    };
    const out = formatFeatureImportance(artifact);
    expect(out).toMatchInlineSnapshot(`
      "RunForge Feature Importance
      ==================================================

      Schema Version:   feature_importance.v1
      Model Family:     random_forest
      Importance Type:  gini_importance
      Total Features:   12

      Top Features
      --------------------------------------------------
         1. feat_01              ████████████████████ 15.38%
         2. feat_02              ██████████████████░░ 14.10%
         3. feat_03              █████████████████░░░ 12.82%
         4. feat_04              ███████████████░░░░░ 11.54%
         5. feat_05              █████████████░░░░░░░ 10.26%
         6. feat_06              ████████████░░░░░░░░ 8.97%
         7. feat_07              ██████████░░░░░░░░░░ 7.69%
         8. feat_08              ████████░░░░░░░░░░░░ 6.41%
         9. feat_09              ███████░░░░░░░░░░░░░ 5.13%
        10. feat_10              █████░░░░░░░░░░░░░░░ 3.85%
        ... and 2 more features

      Features by Original Order
      --------------------------------------------------
        [ 0] feat_01              15.38%
        [ 1] feat_02              14.10%
        [ 2] feat_03              12.82%
        [ 3] feat_04              11.54%
        [ 4] feat_05              10.26%
        [ 5] feat_06              8.97%
        [ 6] feat_07              7.69%
        [ 7] feat_08              6.41%
        [ 8] feat_09              5.13%
        [ 9] feat_10              3.85%
        [10] feat_11              2.56%
        [11] feat_12              1.28%
      "
    `);
  });
});

// ── formatLinearCoefficients ─────────────────────────────────────────────────

describe('formatLinearCoefficients — snapshot', () => {
  it('matches snapshot for a binary logistic regression with one class entry', () => {
    const artifact: LinearCoefficients = {
      schema_version: 'linear_coefficients.v1',
      model_family: 'logistic_regression',
      coefficient_space: 'standardized',
      num_features: 3,
      num_classes: 2,
      classes: [0, 1],
      intercepts: [{ class: 1, intercept: 0.1234 }],
      coefficients_by_class: [
        {
          class: 1,
          features: [
            {
              name: 'age',
              coefficient: 1.5,
              abs_coefficient: 1.5,
              rank: 1,
            },
            {
              name: 'income',
              coefficient: -0.8,
              abs_coefficient: 0.8,
              rank: 2,
            },
            {
              name: 'height',
              coefficient: 0.2,
              abs_coefficient: 0.2,
              rank: 3,
            },
          ],
        },
      ],
      top_k_by_class: [{ class: 1, top_features: ['age', 'income', 'height'] }],
    };
    const out = formatLinearCoefficients(artifact);
    expect(out).toMatchInlineSnapshot(`
      "RunForge Linear Coefficients
      ============================================================

      IMPORTANT: Coefficients are in STANDARDIZED feature space
      Values represent influence per 1 STANDARD DEVIATION of each feature
      Higher absolute value = stronger influence on prediction

      Schema Version:     linear_coefficients.v1
      Model Family:       logistic_regression
      Coefficient Space:  standardized
      Total Features:     3
      Number of Classes:  2
      Classes:            0, 1

      Intercepts (Bias Terms)
      ------------------------------------------------------------
        Class 1: 0.1234

      Coefficients for Class 1
      ------------------------------------------------------------
         1. age                  + ████████████████████     1.5000
         2. income               - ███████████░░░░░░░░░    -0.8000
         3. height               + ███░░░░░░░░░░░░░░░░░     0.2000

      Interpretation Guide
      ------------------------------------------------------------
        + coefficient: Feature increase -> Higher probability for this class
        - coefficient: Feature increase -> Lower probability for this class
        Magnitude: Larger absolute value = Stronger influence

        Example: coefficient = 2.0 means:
          +1 std dev in feature -> +2.0 to log-odds for this class
      "
    `);
  });
});

// ── formatInterpretabilityIndex ──────────────────────────────────────────────

describe('formatInterpretabilityIndex — snapshot', () => {
  it('matches snapshot when all three artifacts are available', () => {
    const index: InterpretabilityIndex = {
      schema_version: 'interpretability.index.v1',
      run_id: FIXTURE_RUN_ID,
      runforge_version: '0.4.0.0',
      created_at: FIXTURE_CREATED_AT,
      available_artifacts: {
        metrics_v1: {
          schema_version: 'metrics.v1',
          path: 'metrics.v1.json',
          summary: {
            metrics_profile: 'classification.base.v1',
            accuracy: 0.95,
          },
        },
        feature_importance_v1: {
          schema_version: 'feature_importance.v1',
          path: 'artifacts/feature_importance.v1.json',
          summary: {
            model_family: 'random_forest',
            top_k: ['age', 'income', 'height'],
          },
        },
        linear_coefficients_v1: {
          schema_version: 'linear_coefficients.v1',
          path: 'artifacts/linear_coefficients.v1.json',
          summary: {
            model_family: 'logistic_regression',
            num_classes: 2,
            top_k_by_class: [
              { class: 1, top_features: ['age', 'income'] },
            ],
          },
        },
      },
    };
    const out = formatInterpretabilityIndex(index, '/runs/test');
    expect(out).toMatchInlineSnapshot(`
      "RunForge Interpretability Index
      ============================================================

      Run ID:           run-2026-04-25-fixture
      RunForge Version: 0.4.0.0
      Created:          2026-04-25T07:30:00Z
      Schema Version:   interpretability.index.v1

      Available Artifacts: 3
      ------------------------------------------------------------

      ✓ Metrics v1
          Path:    metrics.v1.json
          Profile: classification.base.v1
          Accuracy: 95.00%

      ✓ Feature Importance v1
          Path:   artifacts/feature_importance.v1.json
          Model:  random_forest
          Top features: age, income, height

      ✓ Linear Coefficients v1
          Path:    artifacts/linear_coefficients.v1.json
          Model:   logistic_regression
          Classes: 2
          Class 1: age, income

      Quick Links
      ------------------------------------------------------------

        Metrics:           /runs/test/metrics.v1.json
        Feature Importance: /runs/test/artifacts/feature_importance.v1.json
        Linear Coefficients: /runs/test/artifacts/linear_coefficients.v1.json

      Interpretation Guide
      ------------------------------------------------------------
        - Metrics: Classification performance (accuracy, ROC-AUC, etc.)
        - Feature Importance: Which features matter (RandomForest only)
        - Linear Coefficients: Model weights (LogisticRegression, LinearSVC)

      Use the View Latest commands for detailed artifact views.
      "
    `);
  });

  it('matches snapshot when only metrics_v1 is available', () => {
    const index: InterpretabilityIndex = {
      schema_version: 'interpretability.index.v1',
      run_id: FIXTURE_RUN_ID,
      runforge_version: '0.4.0.0',
      created_at: FIXTURE_CREATED_AT,
      available_artifacts: {
        metrics_v1: {
          schema_version: 'metrics.v1',
          path: 'metrics.v1.json',
          summary: {
            metrics_profile: 'classification.base.v1',
            accuracy: 0.88,
          },
        },
      },
    };
    const out = formatInterpretabilityIndex(index, '/runs/test');
    expect(out).toMatchInlineSnapshot(`
      "RunForge Interpretability Index
      ============================================================

      Run ID:           run-2026-04-25-fixture
      RunForge Version: 0.4.0.0
      Created:          2026-04-25T07:30:00Z
      Schema Version:   interpretability.index.v1

      Available Artifacts: 1
      ------------------------------------------------------------

      ✓ Metrics v1
          Path:    metrics.v1.json
          Profile: classification.base.v1
          Accuracy: 88.00%

      ✗ Feature Importance v1 (not available for this model)

      ✗ Linear Coefficients v1 (not available for this model)

      Quick Links
      ------------------------------------------------------------

        Metrics:           /runs/test/metrics.v1.json

      Interpretation Guide
      ------------------------------------------------------------
        - Metrics: Classification performance (accuracy, ROC-AUC, etc.)
        - Feature Importance: Which features matter (RandomForest only)
        - Linear Coefficients: Model weights (LogisticRegression, LinearSVC)

      Use the View Latest commands for detailed artifact views.
      "
    `);
  });
});
