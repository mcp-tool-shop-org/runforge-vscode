/**
 * Schema validation tests against contracts/run.schema.v0.3.6.json
 * and contracts/linear_coefficients.schema.v1.json (per F-TESTS-007).
 *
 * Uses a small hand-rolled validator that handles `type`, `required`,
 * `enum`, `properties`, `pattern`, `minimum`/`maximum`, and
 * `dependentRequired`. Sufficient for our schemas and avoids adding deps.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Schema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  items?: Schema;
  dependentRequired?: Record<string, string[]>;
  additionalProperties?: boolean | Schema;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function validate(schema: Schema, value: unknown, path = '$'): ValidationResult {
  const errors: string[] = [];

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const numericMatch =
      actual === 'integer' && (types.includes('integer') || types.includes('number'));
    if (!types.includes(actual) && !numericMatch) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${actual}`);
      return { valid: false, errors };
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (schema.enum && !schema.enum.includes(value as never)) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
    }
  }

  if (typeof value === 'string' && schema.pattern) {
    if (!new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: '${value}' does not match pattern /${schema.pattern}/`);
    }
  }

  if (typeOf(value) === 'object' && schema.properties) {
    const obj = value as Record<string, unknown>;
    if (schema.required) {
      for (const k of schema.required) {
        if (!(k in obj)) errors.push(`${path}: missing required field '${k}'`);
      }
    }
    if (schema.dependentRequired) {
      for (const [k, deps] of Object.entries(schema.dependentRequired)) {
        if (k in obj) {
          for (const dep of deps) {
            if (!(dep in obj)) errors.push(`${path}: '${k}' present but dependent '${dep}' missing`);
          }
        }
      }
    }
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (k in obj) {
        const r = validate(sub, obj[k], `${path}.${k}`);
        errors.push(...r.errors);
      }
    }
  }

  if (typeOf(value) === 'array' && schema.items) {
    const arr = value as unknown[];
    if (schema.minItems !== undefined && arr.length < schema.minItems) {
      errors.push(`${path}: array length ${arr.length} < minItems ${schema.minItems}`);
    }
    arr.forEach((v, i) => {
      const r = validate(schema.items!, v, `${path}[${i}]`);
      errors.push(...r.errors);
    });
  }

  return { valid: errors.length === 0, errors };
}

const RUN_SCHEMA: Schema = JSON.parse(
  readFileSync(
    resolve(__dirname, '..', 'python', 'ml_runner', 'contracts', 'run.schema.v0.3.6.json'),
    'utf-8'
  )
);
const LIN_COEF_SCHEMA: Schema = JSON.parse(
  readFileSync(
    resolve(__dirname, '..', 'python', 'ml_runner', 'contracts', 'linear_coefficients.schema.v1.json'),
    'utf-8'
  )
);

function minimalRunJson(): Record<string, unknown> {
  return {
    run_id: '20260424-120000-abc12345',
    runforge_version: '0.3.6.0',
    schema_version: 'run.v0.3.6',
    created_at: '2026-04-24T12:00:00+00:00',
    dataset: {
      path: '/tmp/data.csv',
      fingerprint_sha256: 'a'.repeat(64),
    },
    label_column: 'label',
    model_family: 'logistic_regression',
    num_samples: 100,
    num_features: 4,
    dropped_rows_missing_values: 0,
    metrics: { accuracy: 0.95, num_samples: 100, num_features: 4 },
    metrics_v1: {
      schema_version: 'metrics.v1',
      metrics_profile: 'classification.base.v1',
      artifact_path: 'metrics.v1.json',
    },
    artifacts: { model_pkl: 'artifacts/model.pkl' },
  };
}

describe('schema validation', () => {
  describe('run.schema.v0.3.6.json', () => {
    it('schema_version enum is exactly ["run.v0.3.6"]', () => {
      const enumDef = RUN_SCHEMA.properties?.schema_version?.enum;
      expect(enumDef).toEqual(['run.v0.3.6']);
    });

    it('validates a minimal run.json with all required fields', () => {
      const result = validate(RUN_SCHEMA, minimalRunJson());
      expect(result.valid, result.errors.join('\n')).toBe(true);
    });

    it('rejects run.json missing required schema_version', () => {
      const sample = minimalRunJson();
      delete (sample as Record<string, unknown>).schema_version;
      const result = validate(RUN_SCHEMA, sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('schema_version'))).toBe(true);
    });

    it('rejects run.json missing required metrics', () => {
      const sample = minimalRunJson();
      delete (sample as Record<string, unknown>).metrics;
      const result = validate(RUN_SCHEMA, sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('metrics'))).toBe(true);
    });

    it('rejects run.json with wrong schema_version constant', () => {
      const sample = minimalRunJson();
      (sample as Record<string, unknown>).schema_version = 'run.v0.3.5';
      const result = validate(RUN_SCHEMA, sample);
      expect(result.valid).toBe(false);
    });

    it('rejects malformed dataset fingerprint', () => {
      const sample = minimalRunJson();
      (sample.dataset as Record<string, unknown>).fingerprint_sha256 = 'not-a-hex-hash';
      const result = validate(RUN_SCHEMA, sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('pattern'))).toBe(true);
    });

    it('enforces dependent: profile_name implies profile_version + expanded_parameters_hash', () => {
      const sample = minimalRunJson();
      (sample as Record<string, unknown>).profile_name = 'fast';
      const result = validate(RUN_SCHEMA, sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('profile_version'))).toBe(true);
    });
  });

  describe('linear_coefficients.schema.v1.json', () => {
    it('validates a binary case (coefficients_by_class has one entry per asymmetry contract)', () => {
      const sample = {
        schema_version: 'linear_coefficients.v1',
        model_family: 'logistic_regression',
        coefficient_space: 'standardized',
        num_features: 2,
        num_classes: 2,
        classes: [0, 1],
        intercepts: [{ class: 1, intercept: -0.5 }],
        coefficients_by_class: [
          {
            class: 1,
            features: [
              { name: 'f1', coefficient: 1.2, abs_coefficient: 1.2, rank: 1 },
              { name: 'f2', coefficient: -0.3, abs_coefficient: 0.3, rank: 2 },
            ],
          },
        ],
        top_k_by_class: [{ class: 1, top_features: ['f1', 'f2'] }],
      };
      const result = validate(LIN_COEF_SCHEMA, sample);
      expect(result.valid, result.errors.join('\n')).toBe(true);
      // Asymmetry contract: binary → exactly ONE entry, NOT num_classes (2).
      expect(sample.coefficients_by_class).toHaveLength(1);
    });

    it('validates a 3-class case (one entry per class)', () => {
      const features = [
        { name: 'f1', coefficient: 1.0, abs_coefficient: 1.0, rank: 1 },
        { name: 'f2', coefficient: -0.5, abs_coefficient: 0.5, rank: 2 },
      ];
      const sample = {
        schema_version: 'linear_coefficients.v1',
        model_family: 'logistic_regression',
        coefficient_space: 'standardized',
        num_features: 2,
        num_classes: 3,
        classes: [0, 1, 2],
        intercepts: [
          { class: 0, intercept: 0.1 },
          { class: 1, intercept: 0.2 },
          { class: 2, intercept: 0.3 },
        ],
        coefficients_by_class: [
          { class: 0, features },
          { class: 1, features },
          { class: 2, features },
        ],
        top_k_by_class: [
          { class: 0, top_features: ['f1', 'f2'] },
          { class: 1, top_features: ['f1', 'f2'] },
          { class: 2, top_features: ['f1', 'f2'] },
        ],
      };
      const result = validate(LIN_COEF_SCHEMA, sample);
      expect(result.valid, result.errors.join('\n')).toBe(true);
      expect(sample.coefficients_by_class).toHaveLength(sample.num_classes);
    });

    it('rejects when required schema_version is missing', () => {
      const sample = {
        model_family: 'logistic_regression',
        coefficient_space: 'standardized',
        num_features: 2,
        num_classes: 2,
        classes: [0, 1],
        intercepts: [],
        coefficients_by_class: [],
        top_k_by_class: [],
      };
      const result = validate(LIN_COEF_SCHEMA, sample);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('schema_version'))).toBe(true);
    });
  });
});
