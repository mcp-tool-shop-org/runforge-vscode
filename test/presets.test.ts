/**
 * Preset Registry Contract Tests
 * Phase 2: Logistic Regression presets with locked numbers
 */

import { describe, it, expect } from 'vitest';
import {
  getPreset,
  getAllPresets,
  hasPreset,
  REQUIRED_PRESET_IDS,
} from '../src/presets/registry.js';

describe('Preset Registry', () => {
  it('should contain std-train preset', () => {
    expect(hasPreset('std-train')).toBe(true);
    const preset = getPreset('std-train');
    expect(preset.id).toBe('std-train');
    expect(preset.name).toBe('Standard Training');
  });

  it('should contain hq-train preset', () => {
    expect(hasPreset('hq-train')).toBe(true);
    const preset = getPreset('hq-train');
    expect(preset.id).toBe('hq-train');
    expect(preset.name).toBe('High Quality Training');
  });

  it('should have exactly 2 required presets', () => {
    expect(REQUIRED_PRESET_IDS).toHaveLength(2);
    expect(REQUIRED_PRESET_IDS).toContain('std-train');
    expect(REQUIRED_PRESET_IDS).toContain('hq-train');
  });

  it('should return all presets', () => {
    const all = getAllPresets();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.id)).toContain('std-train');
    expect(all.map((p) => p.id)).toContain('hq-train');
  });

  it('should throw for unknown preset', () => {
    expect(() => getPreset('unknown' as any)).toThrow('Preset not found: unknown');
  });

  describe('std-train preset defaults (Phase 2 locked numbers)', () => {
    it('should have epochs = 50', () => {
      const preset = getPreset('std-train');
      expect(preset.defaults.epochs).toBe(50);
    });

    it('should have learning_rate = 0.01', () => {
      const preset = getPreset('std-train');
      expect(preset.defaults.learning_rate).toBe(0.01);
    });

    it('should have regularization = 1.0', () => {
      const preset = getPreset('std-train');
      expect(preset.defaults.regularization).toBe(1.0);
    });

    it('should have solver = lbfgs', () => {
      const preset = getPreset('std-train');
      expect(preset.defaults.solver).toBe('lbfgs');
    });

    it('should have max_iter = 200', () => {
      const preset = getPreset('std-train');
      expect(preset.defaults.max_iter).toBe(200);
    });

    it('should have seed = 42', () => {
      const preset = getPreset('std-train');
      expect(preset.defaults.seed).toBe(42);
    });

    it('should have device = cpu', () => {
      const preset = getPreset('std-train');
      expect(preset.defaults.device).toBe('cpu');
    });
  });

  describe('hq-train preset defaults (Phase 2 locked numbers)', () => {
    it('should have epochs = 200', () => {
      const preset = getPreset('hq-train');
      expect(preset.defaults.epochs).toBe(200);
    });

    it('should have learning_rate = 0.005', () => {
      const preset = getPreset('hq-train');
      expect(preset.defaults.learning_rate).toBe(0.005);
    });

    it('should have regularization = 0.5', () => {
      const preset = getPreset('hq-train');
      expect(preset.defaults.regularization).toBe(0.5);
    });

    it('should have solver = lbfgs', () => {
      const preset = getPreset('hq-train');
      expect(preset.defaults.solver).toBe('lbfgs');
    });

    it('should have max_iter = 500', () => {
      const preset = getPreset('hq-train');
      expect(preset.defaults.max_iter).toBe(500);
    });

    it('should have seed = 42', () => {
      const preset = getPreset('hq-train');
      expect(preset.defaults.seed).toBe(42);
    });

    it('should have device = cpu', () => {
      const preset = getPreset('hq-train');
      expect(preset.defaults.device).toBe('cpu');
    });
  });
});
