/**
 * Version consistency tests for RunForge VS Code extension.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
const RUN_SCHEMA = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '..',
      'python',
      'ml_runner',
      'contracts',
      'run.schema.v0.3.6.json'
    ),
    'utf-8'
  )
);

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

  it('run.schema.v0.3.6.json schema_version enum is exactly ["run.v0.3.6"]', () => {
    const enumDef = RUN_SCHEMA.properties?.schema_version?.enum;
    expect(enumDef).toEqual(['run.v0.3.6']);
  });

  it('schema $id and title agree on version v0.3.6', () => {
    expect(RUN_SCHEMA.$id).toContain('v0.3.6');
    expect(RUN_SCHEMA.title).toContain('v0.3.6');
  });

  it('runforge_version is required in run.json schema', () => {
    expect(RUN_SCHEMA.required).toContain('runforge_version');
  });
});
