/**
 * The four "view latest ..." commands (metrics.v1, feature importance, linear
 * coefficients, interpretability index) and their text formatters.
 *
 * Every command resolves the newest run folder under `.ml/runs`, looks for one
 * artifact file, and either opens it (formatted into an output channel plus the
 * raw JSON in the editor) or tells the user exactly why it cannot. Fixtures are
 * real run folders in a temp workspace; vscode is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const h = vi.hoisted(() => {
  const channel = {
    clear: vi.fn(),
    appendLine: vi.fn(),
    show: vi.fn(),
  };
  return {
    channel,
    showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
    showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
    showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
    showTextDocument: vi.fn(() => Promise.resolve(undefined)),
    createOutputChannel: vi.fn(() => channel),
    workspace: { workspaceFolders: undefined as unknown },
  };
});

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: h.showErrorMessage,
    showInformationMessage: h.showInformationMessage,
    showWarningMessage: h.showWarningMessage,
    showTextDocument: h.showTextDocument,
    createOutputChannel: h.createOutputChannel,
  },
  workspace: h.workspace,
  Uri: { file: (p: string) => ({ fsPath: p }) },
  ViewColumn: { Beside: -2 },
}));

import {
  formatFeatureImportance,
  viewLatestFeatureImportance,
} from '../src/observability/feature-importance-command.js';
import {
  formatLinearCoefficients,
  viewLatestLinearCoefficients,
} from '../src/observability/linear-coefficients-command.js';
import {
  formatInterpretabilityIndex,
  viewLatestInterpretabilityIndex,
} from '../src/observability/interpretability-index-command.js';
import { formatMetricsV1, viewLatestMetricsV1 } from '../src/observability/metrics-v1-command.js';
import type {
  FeatureImportance,
  InterpretabilityIndex,
  LinearCoefficients,
  MetricsV1,
} from '../src/types.js';

// ── fixtures ────────────────────────────────────────────────────────────────

function metricsFixture(overrides: Partial<MetricsV1> = {}): MetricsV1 {
  return {
    schema_version: 'metrics.v1',
    metrics_profile: 'classification.base.v1',
    num_classes: 2,
    accuracy: 0.9,
    precision_macro: 0.8,
    recall_macro: 0.7,
    f1_macro: 0.75,
    confusion_matrix: [[8, 2], [1, 9]],
    ...overrides,
  };
}

function importanceFixture(n = 3): FeatureImportance {
  const names = Array.from({ length: n }, (_, i) => `feat_${i}`);
  const raw = names.map((_, i) => (n - i) / ((n * (n + 1)) / 2));
  return {
    schema_version: 'feature_importance.v1',
    model_family: 'random_forest',
    importance_type: 'gini_importance',
    num_features: n,
    features_by_importance: names.map((name, i) => ({ name, importance: raw[i], rank: i + 1 })),
    features_by_original_order: names.map((name, i) => ({ name, importance: raw[i], index: i })),
    top_k: names.slice(0, 10),
  };
}

function coefficientsFixture(nFeatures = 3): LinearCoefficients {
  const features = Array.from({ length: nFeatures }, (_, i) => ({
    name: `feat_${i}`,
    coefficient: (i % 2 === 0 ? 1 : -1) * (nFeatures - i) * 0.5,
    abs_coefficient: (nFeatures - i) * 0.5,
    rank: i + 1,
  }));
  return {
    schema_version: 'linear_coefficients.v1',
    model_family: 'logistic_regression',
    coefficient_space: 'standardized',
    num_features: nFeatures,
    num_classes: 2,
    classes: ['neg', 'pos'],
    intercepts: [{ class: 'pos', intercept: 0.1234 }],
    coefficients_by_class: [{ class: 'pos', features }],
    top_k_by_class: [{ class: 'pos', top_features: features.slice(0, 10).map((f) => f.name) }],
  };
}

function indexFixture(parts: Array<'metrics' | 'fi' | 'lc'>): InterpretabilityIndex {
  const available: InterpretabilityIndex['available_artifacts'] = {};
  if (parts.includes('metrics')) {
    available.metrics_v1 = {
      schema_version: 'metrics.v1',
      path: 'metrics.v1.json',
      summary: { metrics_profile: 'classification.base.v1', accuracy: 0.9123 },
    };
  }
  if (parts.includes('fi')) {
    available.feature_importance_v1 = {
      schema_version: 'feature_importance.v1',
      path: 'artifacts/feature_importance.v1.json',
      summary: { model_family: 'random_forest', top_k: ['petal', 'sepal'] },
    };
  }
  if (parts.includes('lc')) {
    available.linear_coefficients_v1 = {
      schema_version: 'linear_coefficients.v1',
      path: 'artifacts/linear_coefficients.v1.json',
      summary: {
        model_family: 'logistic_regression',
        num_classes: 3,
        top_k_by_class: [
          { class: 'a', top_features: ['f1', 'f2'] },
          { class: 'b', top_features: ['f3'] },
        ],
      },
    };
  }
  return {
    schema_version: 'interpretability.index.v1',
    run_id: 'run-x',
    runforge_version: '1.0.1',
    created_at: '2026-10-01T09:00:00+00:00',
    available_artifacts: available,
  };
}

// ── view-command spec table ────────────────────────────────────────────────

interface ViewSpec {
  name: string;
  run: () => Promise<void>;
  /** Directory of the artifact relative to the run dir ('' = run dir itself). */
  subdir: string;
  file: string;
  channelName: string;
  fixture: () => unknown;
  /** Heading the formatted output starts with. */
  heading: string;
  /** Message when the artifact is absent and run.json gives no reason (no run.json). */
  missingWarning: string;
  /** Whether the command consults run.json to explain a missing artifact. */
  consultsRunJson: null | { schemaKey: string; notAvailable: string };
}

const SPECS: ViewSpec[] = [
  {
    name: 'viewLatestMetricsV1',
    run: viewLatestMetricsV1,
    subdir: '',
    file: 'metrics.v1.json',
    channelName: 'RunForge Metrics',
    fixture: () => metricsFixture(),
    heading: 'RunForge Metrics v1',
    missingWarning: 'metrics.v1.json not found in latest run. This run may be from an older version.',
    consultsRunJson: null,
  },
  {
    name: 'viewLatestFeatureImportance',
    run: viewLatestFeatureImportance,
    subdir: 'artifacts',
    file: 'feature_importance.v1.json',
    channelName: 'RunForge Feature Importance',
    fixture: () => importanceFixture(),
    heading: 'RunForge Feature Importance',
    missingWarning: 'feature_importance.v1.json not found in latest run.',
    consultsRunJson: {
      schemaKey: 'feature_importance_schema_version',
      notAvailable:
        'Feature importance is not available for this run. Only RandomForest models support feature importance in v1.',
    },
  },
  {
    name: 'viewLatestLinearCoefficients',
    run: viewLatestLinearCoefficients,
    subdir: 'artifacts',
    file: 'linear_coefficients.v1.json',
    channelName: 'RunForge Linear Coefficients',
    fixture: () => coefficientsFixture(),
    heading: 'RunForge Linear Coefficients',
    missingWarning: 'linear_coefficients.v1.json not found in latest run.',
    consultsRunJson: {
      schemaKey: 'linear_coefficients_schema_version',
      notAvailable:
        'Linear coefficients are not available for this run. Only LogisticRegression and LinearSVC models support coefficient extraction.',
    },
  },
  {
    name: 'viewLatestInterpretabilityIndex',
    run: viewLatestInterpretabilityIndex,
    subdir: 'artifacts',
    file: 'interpretability.index.v1.json',
    channelName: 'RunForge Interpretability Index',
    fixture: () => indexFixture(['metrics', 'fi']),
    heading: 'RunForge Interpretability Index',
    missingWarning:
      'interpretability.index.v1.json not found. This run may have been created before Phase 3.6.',
    consultsRunJson: null,
  },
];

describe('view-latest commands (coverage)', () => {
  let root: string;

  async function makeRun(id: string, files: Record<string, unknown | string> = {}, subdirFiles: Record<string, unknown | string> = {}): Promise<string> {
    const dir = path.join(root, '.ml', 'runs', id);
    await fs.mkdir(path.join(dir, 'artifacts'), { recursive: true });
    const write = async (base: string, entries: Record<string, unknown | string>) => {
      for (const [name, body] of Object.entries(entries)) {
        await fs.writeFile(path.join(base, name), typeof body === 'string' ? body : JSON.stringify(body));
      }
    };
    await write(dir, files);
    await write(path.join(dir, 'artifacts'), subdirFiles);
    return dir;
  }

  async function addOrphanMarker(id: string): Promise<void> {
    await makeRun(id, {
      'run.json': '{}',
      '.index-orphan': {
        schema_version: 'index-orphan.v1.0.0',
        run_id: id,
        run_dir: `.ml/runs/${id}`,
        written_at: '2026-10-01T10:00:00Z',
        error: { type: 'OSError', message: 'disk full' },
        index_path: '.ml/outputs/index.json',
      },
    });
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'runforge-views-'));
    h.workspace.workspaceFolders = [{ uri: { fsPath: root } }];
    for (const fn of [
      h.showErrorMessage, h.showInformationMessage, h.showWarningMessage, h.showTextDocument,
      h.createOutputChannel, h.channel.clear, h.channel.appendLine, h.channel.show,
    ]) {
      fn.mockClear();
    }
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe.each(SPECS)('$name', (spec) => {
    const artifactDir = () => path.join(root, '.ml', 'runs', 'run-1', spec.subdir);

    it.each([
      ['no workspace folder is open', undefined],
      ['the workspace folder list is empty', []],
    ])('asks the user to open a folder when %s', async (_label, folders) => {
      h.workspace.workspaceFolders = folders;
      await spec.run();
      expect(h.showErrorMessage).toHaveBeenCalledWith('Please open a workspace folder first.');
      expect(h.createOutputChannel).not.toHaveBeenCalled();
      expect(h.showTextDocument).not.toHaveBeenCalled();
    });

    it('says there are no runs for an empty workspace', async () => {
      await spec.run();
      expect(h.showInformationMessage).toHaveBeenCalledWith('No training runs found. Run training first.');
      expect(h.showWarningMessage).not.toHaveBeenCalled();
    });

    it('warns that the artifact is missing when the newest run has none and no run.json', async () => {
      await makeRun('run-1');
      await spec.run();
      expect(h.showWarningMessage).toHaveBeenCalledWith(spec.missingWarning);
      expect(h.showTextDocument).not.toHaveBeenCalled();
    });

    if (spec.consultsRunJson) {
      const { schemaKey, notAvailable } = spec.consultsRunJson;

      it('explains the model does not support it when run.json has no schema-version key', async () => {
        await makeRun('run-1', { 'run.json': { run_id: 'run-1' } });
        await spec.run();
        expect(h.showInformationMessage).toHaveBeenCalledWith(notAvailable);
        expect(h.showWarningMessage).not.toHaveBeenCalled();
      });

      it('warns the file is missing when run.json says it should exist', async () => {
        await makeRun('run-1', { 'run.json': { run_id: 'run-1', [schemaKey]: '1' } });
        await spec.run();
        expect(h.showWarningMessage).toHaveBeenCalledWith(spec.missingWarning);
        expect(h.showInformationMessage).not.toHaveBeenCalled();
      });

      it('rejects (nothing is opened) when run.json is corrupt: no friendly message exists for this case', async () => {
        await makeRun('run-1', { 'run.json': '{ not json' });
        await expect(spec.run()).rejects.toThrow(SyntaxError);
        expect(h.showTextDocument).not.toHaveBeenCalled();
      });
    }

    it('shows the formatted artifact in an output channel and opens the raw JSON beside the editor', async () => {
      const files = spec.subdir === '' ? { [spec.file]: spec.fixture() } : {};
      const sub = spec.subdir === '' ? {} : { [spec.file]: spec.fixture() };
      await makeRun('run-1', files, sub);

      await spec.run();

      expect(h.createOutputChannel).toHaveBeenCalledWith(spec.channelName);
      expect(h.channel.clear).toHaveBeenCalledTimes(1);
      expect(h.channel.show).toHaveBeenCalledTimes(1);
      const printed = h.channel.appendLine.mock.calls[0][0] as string;
      expect(printed.startsWith(spec.heading)).toBe(true);
      const [uri, options] = h.showTextDocument.mock.calls[0] as unknown as [{ fsPath: string }, unknown];
      expect(uri.fsPath).toBe(path.join(artifactDir(), spec.file));
      expect(options).toEqual({ preview: true, viewColumn: -2 });
      expect(h.showWarningMessage).not.toHaveBeenCalled();
    });

    it('rejects without opening anything when the artifact itself is corrupt JSON', async () => {
      // Known gap, recorded rather than endorsed: the command has no try/catch,
      // so VS Code shows its generic command-failed toast instead of a message.
      const files = spec.subdir === '' ? { [spec.file]: '{ broken' } : {};
      const sub = spec.subdir === '' ? {} : { [spec.file]: '{ broken' };
      await makeRun('run-1', files, sub);
      await expect(spec.run()).rejects.toThrow(SyntaxError);
      expect(h.showTextDocument).not.toHaveBeenCalled();
      expect(h.channel.appendLine).not.toHaveBeenCalled();
    });

    it('warns once about orphaned runs and still carries on', async () => {
      await addOrphanMarker('run-orphan');
      await addOrphanMarker('run-orphan-2');
      await spec.run();
      const orphanWarnings = h.showWarningMessage.mock.calls
        .map((c) => c[0] as string)
        .filter((m) => m.includes('saved but not indexed'));
      expect(orphanWarnings).toEqual([
        '2 run(s) saved but not indexed. Run "RunForge: Recover Index" to add them to the run list, or use "RunForge: Browse Runs" to open them directly.',
      ]);
      // The command did not stop at the banner: it went on to explain the missing artifact.
      if (spec.consultsRunJson) {
        expect(h.showInformationMessage).toHaveBeenCalledWith(spec.consultsRunJson.notAvailable);
      } else {
        expect(h.showWarningMessage.mock.calls.map((c) => c[0])).toContain(spec.missingWarning);
      }
    });

    it('picks the most recently modified run when several exist', async () => {
      const old = await makeRun('run-old');
      const files = spec.subdir === '' ? { [spec.file]: spec.fixture() } : {};
      const sub = spec.subdir === '' ? {} : { [spec.file]: spec.fixture() };
      const fresh = await makeRun('run-fresh', files, sub);
      await fs.utimes(old, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
      await fs.utimes(fresh, new Date('2026-02-01T00:00:00Z'), new Date('2026-02-01T00:00:00Z'));

      await spec.run();

      const [uri] = h.showTextDocument.mock.calls[0] as unknown as [{ fsPath: string }];
      expect(uri.fsPath).toBe(path.join(fresh, spec.subdir, spec.file));
    });
  });

  describe('formatMetricsV1', () => {
    it('prints profile display name, base metrics as percentages and the confusion matrix', () => {
      const text = formatMetricsV1(metricsFixture());
      expect(text).toContain('Metrics Profile: Classification Base');
      expect(text).toContain('Number of Classes: 2');
      expect(text).toContain('Accuracy:        90.00%');
      expect(text).toContain('Precision:       80.00%');
      expect(text).toContain('Recall:          70.00%');
      expect(text).toContain('F1 Score:        75.00%');
      expect(text).toContain('Confusion Matrix');
      expect(text).toContain('      8     2');
      expect(text).not.toContain('Probability Metrics');
      expect(text).not.toContain('Per-Class Metrics');
    });

    it('falls back to the raw profile id for a profile it does not know', () => {
      const text = formatMetricsV1(metricsFixture({ metrics_profile: 'classification.future.v9' as never }));
      expect(text).toContain('Metrics Profile: classification.future.v9');
    });

    it('omits the confusion matrix section when the artifact has none', () => {
      const text = formatMetricsV1(metricsFixture({ confusion_matrix: undefined as never }));
      expect(text).not.toContain('Confusion Matrix');
    });

    it('prints ROC-AUC with log loss when both are present', () => {
      const text = formatMetricsV1(metricsFixture({ metrics_profile: 'classification.proba.v1', roc_auc: 0.97, log_loss: 0.12345 }));
      expect(text).toContain('Metrics Profile: Classification with Probabilities');
      expect(text).toContain('ROC-AUC:         97.00%');
      expect(text).toContain('Log Loss:        0.1235');
    });

    it('prints ROC-AUC without a Log Loss line when log loss is absent', () => {
      const text = formatMetricsV1(metricsFixture({ roc_auc: 0.5 }));
      expect(text).toContain('ROC-AUC:         50.00%');
      expect(text).not.toContain('Log Loss');
    });

    it('prints a per-class table for multiclass profiles', () => {
      const text = formatMetricsV1(
        metricsFixture({
          metrics_profile: 'classification.multiclass.v1',
          num_classes: 3,
          class_labels: ['setosa', 'versicolor', 7],
          per_class_precision: [1, 0.9, 0.8],
          per_class_recall: [1, 0.85, 0.75],
          per_class_f1: [1, 0.875, 0.775],
        })
      );
      expect(text).toContain('Metrics Profile: Multiclass Classification');
      expect(text).toContain('Per-Class Metrics');
      expect(text).toContain('  Class     Precision  Recall     F1');
      expect(text).toMatch(/setosa\s+100\.00%\s+100\.00%\s+100\.00%/);
      expect(text).toMatch(/versicolor\s+90\.00%\s+85\.00%\s+87\.50%/);
      expect(text).toMatch(/\n {2}7\s+80\.00%\s+75\.00%\s+77\.50%/);
    });

    it('skips the per-class table when any of its four arrays is missing', () => {
      const text = formatMetricsV1(
        metricsFixture({ class_labels: ['a', 'b'], per_class_precision: [1, 1], per_class_recall: [1, 1] })
      );
      expect(text).not.toContain('Per-Class Metrics');
    });
  });

  describe('formatFeatureImportance', () => {
    it('lists features with rank, bar and percentage, scaled to the top feature', () => {
      const text = formatFeatureImportance(importanceFixture(3));
      expect(text).toContain('Model Family:     random_forest');
      expect(text).toContain('Importance Type:  gini_importance');
      expect(text).toContain('Total Features:   3');
      // The top feature fills the whole 20-char bar.
      expect(text).toMatch(/ 1\. feat_0 +█{20} 50\.00%/);
      // feat_2 is 1/3 of the top feature, so 7 of 20 cells fill.
      expect(text).toMatch(/ 3\. feat_2 +█{7}░{13} 16\.67%/);
      expect(text).toContain('[ 0] feat_0');
      expect(text).not.toContain('more features');
    });

    it('shows only the top 10 and counts the rest', () => {
      const text = formatFeatureImportance(importanceFixture(14));
      expect(text).toContain('... and 4 more features');
      const topSection = text.split('Features by Original Order')[0];
      expect(topSection).toContain('10. feat_9');
      expect(topSection).not.toContain('feat_10');
      // The original-order list is complete.
      expect(text).toContain('[13] feat_13');
    });

    it('prints ?? for a feature with no rank or index, and survives an empty feature list', () => {
      const artifact = importanceFixture(1);
      delete (artifact.features_by_importance[0] as { rank?: number }).rank;
      delete (artifact.features_by_original_order[0] as { index?: number }).index;
      const text = formatFeatureImportance(artifact);
      expect(text).toContain('??. feat_0');
      expect(text).toContain('[??] feat_0');

      const empty = formatFeatureImportance({ ...importanceFixture(0), features_by_importance: [], features_by_original_order: [] });
      expect(empty).toContain('Total Features:   0');
    });
  });

  describe('formatLinearCoefficients', () => {
    it('always prints the standardized-space disclaimer and the interpretation guide', () => {
      const text = formatLinearCoefficients(coefficientsFixture(2));
      expect(text).toContain('IMPORTANT: Coefficients are in STANDARDIZED feature space');
      expect(text).toContain('Interpretation Guide');
      expect(text).toContain('Classes:            neg, pos');
    });

    it('prints intercepts and signed, ranked coefficients with bars scaled to the strongest', () => {
      const text = formatLinearCoefficients(coefficientsFixture(3));
      expect(text).toContain('Intercepts (Bias Terms)');
      expect(text).toContain('  Class pos: 0.1234');
      expect(text).toContain('Coefficients for Class pos');
      expect(text).toMatch(/ 1\. feat_0 +\+ █{20} +1\.5000/);
      expect(text).toMatch(/ 2\. feat_1 +- █{13}░{7} +-1\.0000/);
    });

    it('omits the intercept section when there are none', () => {
      const artifact = { ...coefficientsFixture(2), intercepts: [] };
      expect(formatLinearCoefficients(artifact)).not.toContain('Intercepts (Bias Terms)');
    });

    it('shows only 10 features per class and counts the rest', () => {
      const text = formatLinearCoefficients(coefficientsFixture(13));
      expect(text).toContain('... and 3 more features');
      expect(text).toContain('10. feat_9');
      expect(text).not.toMatch(/11\. feat_10/);
    });

    it('prints one block per class for a multiclass artifact, and tolerates a class with no features', () => {
      const base = coefficientsFixture(2);
      const artifact: LinearCoefficients = {
        ...base,
        num_classes: 3,
        classes: ['a', 'b', 'c'],
        coefficients_by_class: [
          { class: 'a', features: base.coefficients_by_class[0].features },
          { class: 'b', features: [] },
        ],
      };
      const text = formatLinearCoefficients(artifact);
      expect(text).toContain('Coefficients for Class a');
      expect(text).toContain('Coefficients for Class b');
    });
  });

  describe('formatInterpretabilityIndex', () => {
    it('marks all three artifacts unavailable for an empty index and prints no quick links', () => {
      const text = formatInterpretabilityIndex(indexFixture([]), '.ml/runs/run-x');
      expect(text).toContain('Available Artifacts: 0');
      expect(text).toContain('✗ Metrics v1 (not available)');
      expect(text).toContain('✗ Feature Importance v1 (not available for this model)');
      expect(text).toContain('✗ Linear Coefficients v1 (not available for this model)');
      expect(text).not.toContain('  Metrics:  ');
    });

    it('describes each present artifact and links it from the run directory with forward slashes', () => {
      const text = formatInterpretabilityIndex(indexFixture(['metrics', 'fi', 'lc']), '.ml/runs/run-x');
      expect(text).toContain('Run ID:           run-x');
      expect(text).toContain('Available Artifacts: 3');
      expect(text).toContain('✓ Metrics v1');
      expect(text).toContain('    Accuracy: 91.23%');
      expect(text).toContain('    Top features: petal, sepal');
      expect(text).toContain('    Classes: 3');
      expect(text).toContain('    Class a: f1, f2');
      expect(text).toContain('    Class b: f3');
      expect(text).toContain('  Metrics:           .ml/runs/run-x/metrics.v1.json');
      expect(text).toContain('  Feature Importance: .ml/runs/run-x/artifacts/feature_importance.v1.json');
      expect(text).toContain('  Linear Coefficients: .ml/runs/run-x/artifacts/linear_coefficients.v1.json');
    });

    it('omits the accuracy line when the index has no accuracy', () => {
      const index = indexFixture(['metrics']);
      delete (index.available_artifacts.metrics_v1!.summary as { accuracy?: number }).accuracy;
      expect(formatInterpretabilityIndex(index, 'r')).not.toContain('Accuracy:');
    });
  });
});
