/**
 * Preset Registry
 * Loads and validates bundled training presets
 */

import type { Preset, PresetId } from '../types.js';
import stdTrain from './std-train.json' with { type: 'json' };
import hqTrain from './hq-train.json' with { type: 'json' };

/** All available presets (locked for Phase 1) */
const PRESETS: Map<PresetId, Preset> = new Map([
  ['std-train', stdTrain as Preset],
  ['hq-train', hqTrain as Preset],
]);

/** Required preset IDs (contract) */
export const REQUIRED_PRESET_IDS: readonly PresetId[] = ['std-train', 'hq-train'] as const;

/**
 * Get a preset by ID
 * @throws Error if preset not found
 */
export function getPreset(id: PresetId): Preset {
  const preset = PRESETS.get(id);
  if (!preset) {
    throw new Error(`Preset not found: ${id}`);
  }
  return preset;
}

/**
 * Get all available presets
 */
export function getAllPresets(): Preset[] {
  return Array.from(PRESETS.values());
}

/**
 * Check if a preset exists
 */
export function hasPreset(id: string): id is PresetId {
  return PRESETS.has(id as PresetId);
}

/**
 * Validate that all required presets are loaded
 * @throws Error if any required preset is missing
 */
export function validateRegistry(): void {
  for (const id of REQUIRED_PRESET_IDS) {
    if (!PRESETS.has(id)) {
      throw new Error(`Required preset missing: ${id}`);
    }
    const preset = PRESETS.get(id)!;
    if (preset.id !== id) {
      throw new Error(`Preset ID mismatch: expected ${id}, got ${preset.id}`);
    }
    if (!preset.name || typeof preset.name !== 'string') {
      throw new Error(`Preset ${id} missing valid name`);
    }
    if (!preset.defaults || typeof preset.defaults !== 'object') {
      throw new Error(`Preset ${id} missing defaults`);
    }
  }
}

// Validate on module load
validateRegistry();
