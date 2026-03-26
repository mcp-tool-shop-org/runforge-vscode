/**
 * Version consistency tests for RunForge VS Code extension.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));

describe('version consistency', () => {
  it('package.json version is semver', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('version is >= 1.0.0', () => {
    const major = parseInt(pkg.version.split('.')[0], 10);
    expect(major).toBeGreaterThanOrEqual(1);
  });

  it('CHANGELOG.md contains current version', () => {
    const changelog = readFileSync(resolve(__dirname, '..', 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toContain(`[${pkg.version}]`);
  });

  it('has VS Code engine constraint', () => {
    expect(pkg.engines.vscode).toBeDefined();
    expect(pkg.engines.vscode).toMatch(/^\^?\d+\.\d+\.\d+/);
  });

  it('has publisher field', () => {
    expect(pkg.publisher).toBe('mcp-tool-shop');
  });
});
