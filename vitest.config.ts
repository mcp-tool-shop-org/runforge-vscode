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
      // Baseline floor, rounded down from measured. Re-baselined 2026-10-01 with the
      // move from vitest 1 to 5: the same tests measured lines/stmts 73 -> 61%,
      // functions 74 -> 59%, branches 77 -> 56%, because vitest 4+ counts every
      // included file and remaps V8 branch coverage more strictly. No test or
      // source changed; the floors still exist to stop a silent regression.
      thresholds: { lines: 60, functions: 58, branches: 55, statements: 60 }
    }
  }
});
