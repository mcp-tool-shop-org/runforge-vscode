/**
 * Preset registry: module-load validation.
 *
 * The registry validates its bundled presets when the module is first
 * imported and throws on a malformed one, so a corrupt preset JSON fails the
 * extension at load rather than mid-training. Each case swaps one bundled
 * JSON for a bad one and asserts the specific load-time error.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const GOOD_STD = {
  id: 'std-train',
  name: 'Standard Training',
  defaults: {
    epochs: 50,
    learning_rate: 0.01,
    regularization: 1.0,
    solver: 'lbfgs',
    max_iter: 200,
    seed: 42,
    device: 'cpu',
  },
};
const GOOD_HQ = {
  id: 'hq-train',
  name: 'High Quality Training',
  defaults: { ...GOOD_STD.defaults, epochs: 200 },
};

async function loadWith(std: unknown, hq: unknown) {
  vi.resetModules();
  vi.doMock('../src/presets/std-train.json', () => ({ default: std }));
  vi.doMock('../src/presets/hq-train.json', () => ({ default: hq }));
  return await import('../src/presets/registry.js');
}

describe('preset registry load-time validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('../src/presets/std-train.json');
    vi.doUnmock('../src/presets/hq-train.json');
    vi.resetModules();
  });

  it('loads when both required presets are well formed', async () => {
    const reg = await loadWith(GOOD_STD, GOOD_HQ);
    expect(reg.getAllPresets().map((p) => p.id)).toEqual(['std-train', 'hq-train']);
    expect(() => reg.validateRegistry()).not.toThrow();
  });

  it('rejects a preset whose id does not match the slot it is registered under', async () => {
    await expect(loadWith({ ...GOOD_STD, id: 'hq-train' }, GOOD_HQ)).rejects.toThrow(
      'Preset ID mismatch: expected std-train, got hq-train'
    );
  });

  it('rejects a mismatch in the second slot too', async () => {
    await expect(loadWith(GOOD_STD, { ...GOOD_HQ, id: 'std-train' })).rejects.toThrow(
      'Preset ID mismatch: expected hq-train, got std-train'
    );
  });

  it.each([
    ['empty', ''],
    ['missing', undefined],
    ['not a string', 7],
  ])('rejects a preset whose name is %s', async (_label, name) => {
    await expect(loadWith({ ...GOOD_STD, name }, GOOD_HQ)).rejects.toThrow(
      'Preset std-train missing valid name'
    );
  });

  it.each([
    ['missing', undefined],
    ['a string', 'epochs=50'],
    ['null', null],
  ])('rejects a preset whose defaults are %s', async (_label, defaults) => {
    await expect(loadWith(GOOD_STD, { ...GOOD_HQ, defaults })).rejects.toThrow(
      'Preset hq-train missing defaults'
    );
  });
});
