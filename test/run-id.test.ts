/**
 * Run ID Format Contract Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateRunId,
  parseRunId,
  isValidRunId,
  toSlug,
} from '../src/workspace/run-folder.js';

describe('Run ID Generation', () => {
  it('should generate valid run ID format', () => {
    const runId = generateRunId('test');
    expect(isValidRunId(runId)).toBe(true);
  });

  it('should match format YYYYMMDD-HHMMSS-<slug>-<rand4>', () => {
    const runId = generateRunId('my-run');
    const pattern = /^\d{8}-\d{6}-[a-z0-9-]+-[a-f0-9]{4}$/;
    expect(runId).toMatch(pattern);
  });

  it('should parse valid run ID', () => {
    const runId = '20260201-142355-run-a3f9';
    const components = parseRunId(runId);

    expect(components).not.toBeNull();
    expect(components!.date).toBe('20260201');
    expect(components!.time).toBe('142355');
    expect(components!.slug).toBe('run');
    expect(components!.rand).toBe('a3f9');
  });

  it('should return null for invalid run ID', () => {
    expect(parseRunId('invalid')).toBeNull();
    expect(parseRunId('20260201-run')).toBeNull();
    expect(parseRunId('20260201-142355-run')).toBeNull(); // Missing rand
    expect(parseRunId('20260201-142355-run-A3F9')).toBeNull(); // Uppercase not allowed
  });

  it('should generate unique run IDs (high probability)', () => {
    // With 4 hex chars (65536 possibilities), collisions are rare but possible
    // Test that at least 95% are unique (accounts for rare same-second collisions)
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRunId('test'));
    }
    expect(ids.size).toBeGreaterThanOrEqual(95);
  });

  it('should include slug from name', () => {
    const runId = generateRunId('my-experiment');
    expect(runId).toContain('my-experiment');
  });
});

describe('Slug Generation', () => {
  it('should convert to lowercase', () => {
    expect(toSlug('MyRun')).toBe('myrun');
  });

  it('should replace spaces with dashes', () => {
    expect(toSlug('my run')).toBe('my-run');
  });

  it('should replace special characters with dashes', () => {
    expect(toSlug('my_run@test!')).toBe('my-run-test');
  });

  it('should trim leading/trailing dashes', () => {
    expect(toSlug('--my-run--')).toBe('my-run');
  });

  it('should limit length to 32 characters', () => {
    const longName = 'a'.repeat(50);
    expect(toSlug(longName).length).toBeLessThanOrEqual(32);
  });

  it('should default to "run" for empty input', () => {
    expect(toSlug('')).toBe('run');
    expect(toSlug('   ')).toBe('run');
    expect(toSlug('!!!')).toBe('run');
  });
});
