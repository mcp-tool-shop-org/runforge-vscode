import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      // Baseline floor (Stage A swarm 2026-04-24): rounded down from measured
      // lines/stmts ~48%, functions ~54%, branches ~80%. Prevents silent regression.
      thresholds: { lines: 45, functions: 50, branches: 75, statements: 45 }
    }
  }
});
