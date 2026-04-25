/**
 * Recovery Report Renderer Tests (Phase 4 — FT-BRIDGE-009)
 *
 * Validates `renderRecoveryReport()` against the canonical RecoveryReport
 * contract (frozen Wave 3 prospective per CONTRACT-PHASE-4.md §3.1.2).
 *
 * Coverage:
 *   - Empty report (all counts 0, all arrays empty) → empty-state messages,
 *     no broken tables
 *   - All sections populated → all 3 tables rendered
 *   - escapeTableCell coverage → embedded pipes are escaped
 *   - Determinism → same input → identical output
 *   - Canonical type compliance → fixtures use the real type, no shadows
 */

import { describe, it, expect } from 'vitest';
import { renderRecoveryReport } from '../src/observability/render/recovery-report-summary.js';
import type {
  RecoveryReport,
  RecoveryReportEntry,
  RecoveryReportSkip,
} from '../src/types.js';

/** Build a canonical empty RecoveryReport fixture. */
function makeEmptyReport(
  overrides: Partial<RecoveryReport> = {}
): RecoveryReport {
  return {
    scanned_run_dirs: 0,
    already_indexed: 0,
    recovered: [],
    skipped: [],
    cancelled_excluded: [],
    recovered_at: '2026-04-25T07:30:00Z',
    ...overrides,
  };
}

describe('renderRecoveryReport — empty report', () => {
  it('renders cleanly when nothing was scanned and every array is empty', () => {
    const report = makeEmptyReport();

    const md = renderRecoveryReport(report);

    // Header + timestamp
    expect(md).toContain('# Recovery Report');
    expect(md).toContain('**Recovered at:** 2026-04-25T07:30:00Z');

    // Summary section with zero counts
    expect(md).toContain('## Summary');
    expect(md).toContain('| Run dirs scanned | 0 |');
    expect(md).toContain('| Already indexed | 0 |');
    expect(md).toContain('| Newly recovered | 0 |');
    expect(md).toContain('| Skipped (errors) | 0 |');
    expect(md).toContain('| Cancelled (excluded) | 0 |');

    // All three sections present, each with empty-state message
    expect(md).toContain('## Recovered runs');
    expect(md).toContain('*No new runs were recovered.*');
    expect(md).toContain('## Skipped runs');
    expect(md).toContain('*No runs were skipped.*');
    expect(md).toContain('## Cancelled runs (not indexed)');
    expect(md).toContain('*No cancelled runs were excluded.*');

    // No header rows for unused tables (i.e. no orphan "| Run ID | Path | Reason |"
    // table header without rows).
    expect(md).not.toContain('| Run ID | Path | Reason |');
    expect(md).not.toContain('| Path | Error | Detail |');
  });
});

describe('renderRecoveryReport — populated report', () => {
  it('renders all three tables when each section has entries', () => {
    const recovered: RecoveryReportEntry[] = [
      {
        run_id: '20260425-073000-myrun-abcd',
        run_dir: '.ml/runs/20260425-073000-myrun-abcd',
        reason: 'index_orphan_marker',
      },
      {
        run_id: '20260425-080000-other-ef01',
        run_dir: '.ml/runs/20260425-080000-other-ef01',
        reason: 'pre_existing_orphan',
      },
    ];
    const skipped: RecoveryReportSkip[] = [
      {
        run_dir: '.ml/runs/broken-1',
        error: 'CORRUPT_RUN_JSON',
        message: 'Unexpected token at position 42',
      },
    ];
    const cancelled_excluded: RecoveryReportEntry[] = [
      {
        run_id: '20260425-090000-cxl-9999',
        run_dir: '.ml/runs/20260425-090000-cxl-9999',
        reason: 'cancelled',
      },
    ];

    const report = makeEmptyReport({
      scanned_run_dirs: 4,
      already_indexed: 0,
      recovered,
      skipped,
      cancelled_excluded,
    });

    const md = renderRecoveryReport(report);

    // Recovered table: header + both rows
    expect(md).toContain('| Run ID | Path | Reason |');
    expect(md).toContain(
      '| 20260425-073000-myrun-abcd | .ml/runs/20260425-073000-myrun-abcd | index_orphan_marker |'
    );
    expect(md).toContain(
      '| 20260425-080000-other-ef01 | .ml/runs/20260425-080000-other-ef01 | pre_existing_orphan |'
    );

    // Skipped table: header + row
    expect(md).toContain('| Path | Error | Detail |');
    expect(md).toContain(
      '| .ml/runs/broken-1 | CORRUPT_RUN_JSON | Unexpected token at position 42 |'
    );

    // Cancelled table: header + row
    expect(md).toContain('| Run ID | Path |');
    expect(md).toContain(
      '| 20260425-090000-cxl-9999 | .ml/runs/20260425-090000-cxl-9999 |'
    );

    // None of the empty-state messages should appear when populated
    expect(md).not.toContain('*No new runs were recovered.*');
    expect(md).not.toContain('*No runs were skipped.*');
    expect(md).not.toContain('*No cancelled runs were excluded.*');

    // Summary counts reflect array lengths
    expect(md).toContain('| Run dirs scanned | 4 |');
    expect(md).toContain('| Newly recovered | 2 |');
    expect(md).toContain('| Skipped (errors) | 1 |');
    expect(md).toContain('| Cancelled (excluded) | 1 |');
  });

  it('omits reason cell content when an entry has no reason', () => {
    const report = makeEmptyReport({
      scanned_run_dirs: 1,
      recovered: [
        {
          run_id: 'no-reason-run',
          run_dir: '.ml/runs/no-reason-run',
          // reason is optional in the canonical type — exercise that branch
        },
      ],
    });

    const md = renderRecoveryReport(report);

    expect(md).toContain('| Run ID | Path | Reason |');
    expect(md).toContain('| no-reason-run | .ml/runs/no-reason-run |  |');
  });
});

describe('renderRecoveryReport — escapeTableCell coverage', () => {
  it('escapes pipe characters in user-controlled run_dir / message / run_id', () => {
    const report = makeEmptyReport({
      scanned_run_dirs: 2,
      recovered: [
        {
          run_id: 'evil|run|id',
          run_dir: '.ml/runs/path|with|pipes',
          reason: 'pre_existing_orphan',
        },
      ],
      skipped: [
        {
          run_dir: '.ml/runs/skip|here',
          error: 'CORRUPT_RUN_JSON',
          message: 'parse failed at | column 9',
        },
      ],
    });

    const md = renderRecoveryReport(report);

    // Pipes inside cells must be backslash-escaped so the markdown table
    // renderer treats them as literal content rather than column separators.
    expect(md).toContain('evil\\|run\\|id');
    expect(md).toContain('.ml/runs/path\\|with\\|pipes');
    expect(md).toContain('.ml/runs/skip\\|here');
    expect(md).toContain('parse failed at \\| column 9');

    // And no UNESCAPED user-supplied pipe should leak (quick sanity check
    // for the literal multi-pipe sequence we fed in).
    expect(md).not.toContain('evil|run|id');
    expect(md).not.toContain('.ml/runs/path|with|pipes');
  });
});

describe('renderRecoveryReport — determinism', () => {
  it('returns identical output for identical input', () => {
    const report = makeEmptyReport({
      scanned_run_dirs: 3,
      already_indexed: 1,
      recovered: [
        {
          run_id: 'a',
          run_dir: '.ml/runs/a',
          reason: 'index_orphan_marker',
        },
      ],
      skipped: [
        {
          run_dir: '.ml/runs/b',
          error: 'MISSING_RUN_JSON',
          message: 'no run.json found',
        },
      ],
      cancelled_excluded: [
        {
          run_id: 'c',
          run_dir: '.ml/runs/c',
          reason: 'cancelled',
        },
      ],
    });

    const first = renderRecoveryReport(report);
    const second = renderRecoveryReport(report);
    const third = renderRecoveryReport({ ...report }); // shallow-cloned input

    expect(first).toBe(second);
    expect(first).toBe(third);
  });
});

describe('renderRecoveryReport — canonical type compliance', () => {
  it('compiles against the canonical RecoveryReport / Entry / Skip types', () => {
    // This test exists for the type-checker more than the runtime: if
    // src/types.ts ever drifts, this fixture will fail to compile and the
    // build will catch the drift before it ships.
    const entry: RecoveryReportEntry = {
      run_id: 'x',
      run_dir: '.ml/runs/x',
      reason: 'cancelled',
    };
    const skip: RecoveryReportSkip = {
      run_dir: '.ml/runs/y',
      error: 'READ_ERROR',
      message: 'EACCES',
    };
    const report: RecoveryReport = {
      scanned_run_dirs: 1,
      already_indexed: 0,
      recovered: [],
      skipped: [skip],
      cancelled_excluded: [entry],
      recovered_at: '2026-04-25T00:00:00Z',
    };

    const md = renderRecoveryReport(report);

    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain('READ_ERROR');
    expect(md).toContain('EACCES');
  });
});
