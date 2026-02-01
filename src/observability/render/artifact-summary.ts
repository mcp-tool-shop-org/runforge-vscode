/**
 * Artifact Summary Renderer (Phase 2.3)
 *
 * Renders pipeline inspection result as human-readable markdown.
 * Pure function: takes inspection JSON, returns markdown string.
 */

import type { ArtifactInspectResult } from '../artifact-inspect-command.js';

/**
 * Render artifact inspection result as markdown summary
 */
export function renderArtifactSummary(result: ArtifactInspectResult): string {
  const lines: string[] = [];

  lines.push(`# Pipeline Inspection`);
  lines.push('');

  // Key facts
  lines.push('## Overview');
  lines.push('');
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Schema Version | ${result.schema_version} |`);
  lines.push(`| Artifact | \`${result.artifact_path}\` |`);
  lines.push(`| Step Count | ${result.step_count} |`);
  lines.push(`| Has Preprocessing | ${result.has_preprocessing ? 'Yes' : 'No'} |`);
  lines.push('');

  // Pipeline steps
  lines.push('## Pipeline Steps');
  lines.push('');

  if (result.pipeline_steps.length === 0) {
    lines.push('*No steps found in pipeline.*');
    lines.push('');
  } else {
    lines.push('| # | Name | Type | Module |');
    lines.push('|---|------|------|--------|');

    for (let i = 0; i < result.pipeline_steps.length; i++) {
      const step = result.pipeline_steps[i];
      const isPreprocessing = isPreprocessingStep(step.type);
      const prefix = isPreprocessing ? '🔧 ' : '';
      lines.push(`| ${i + 1} | ${prefix}${step.name} | \`${step.type}\` | \`${step.module}\` |`);
    }
    lines.push('');

    if (result.has_preprocessing) {
      lines.push('*🔧 = Preprocessing step*');
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Inspection is read-only and does not retrain or modify artifacts.*');
  lines.push('');

  return lines.join('\n');
}

/**
 * Check if a step type is a preprocessing step
 */
function isPreprocessingStep(typeName: string): boolean {
  const preprocessingTypes = new Set([
    'StandardScaler',
    'MinMaxScaler',
    'MaxAbsScaler',
    'RobustScaler',
    'Normalizer',
    'Binarizer',
    'PolynomialFeatures',
    'OneHotEncoder',
    'OrdinalEncoder',
    'LabelEncoder',
    'LabelBinarizer',
    'KBinsDiscretizer',
    'FunctionTransformer',
    'PowerTransformer',
    'QuantileTransformer',
    'SplineTransformer',
    'SimpleImputer',
    'KNNImputer',
    'PCA',
    'TruncatedSVD',
    'SelectKBest',
    'SelectPercentile',
    'VarianceThreshold',
    'ColumnTransformer',
    'FeatureUnion',
  ]);

  return preprocessingTypes.has(typeName);
}
