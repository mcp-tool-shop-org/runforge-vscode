/**
 * ESLint custom rule: no-shadow-canonical-types
 *
 * Enforces docs/CONTRACTS.md Rule 3 — "No shadow types in consumer modules".
 *
 * Forbids `interface X` or `type X = ...` declarations where `X` is also
 * exported from `src/types.ts` (the canonical module), unless the
 * declaration site IS `src/types.ts` itself.
 *
 * Why mechanized: shadow types compile cleanly when both halves are valid
 * locally — see iter #5a's `F-COORD-011`, `F-FS-001/002/003`, `F-TS-001`.
 * The TS compiler can't catch them. Lint can.
 *
 * Implementation note: the canonical name list is hardcoded below for speed
 * and zero-runtime-cost. If `src/types.ts` adds a new exported type that
 * Python's writer also produces, append it here. (A startup-time scan of
 * `src/types.ts` would be more DRY, but adds ~50ms per lint invocation and
 * makes the rule less debuggable.)
 */

'use strict';

/**
 * Names exported as `interface` or `type` from src/types.ts.
 * Source of truth — keep in sync if src/types.ts adds canonical exports.
 */
const CANONICAL_TYPE_NAMES = new Set([
  'PresetId',
  'Preset',
  'PresetDefaults',
  'DeviceType',
  'GpuReason',
  'RunRequest',
  'RunResult',
  'RunStatus',
  'IndexEntry',
  'RunSummary',
  'RunIndex',
  'TrainingMetrics',
  'RunIdComponents',
  'ModelFamily',
  'TrainingProfile',
  'RunnerOptions',
  'MetricsV1',
  'FeatureImportance',
  'LinearCoefficients',
  'RunMetadata',
  'InterpretabilityIndex',
  'InterpretabilityArtifactEntry',
  'InterpretabilityMetricsV1Summary',
  'InterpretabilityFeatureImportanceSummary',
  'InterpretabilityLinearCoefficientsSummary',
  'IndexOrphanMarker',
  'IndexCancelledMarker',
  'RecoveryReport',
  'RecoveryReportEntry',
  'RecoveryReportSkip',
]);

/**
 * Files where canonical types are legitimately declared (not shadowed).
 * Path test uses suffix match against `context.getFilename()`; works on
 * Windows + POSIX paths.
 */
const ALLOWED_DECLARATION_SUFFIXES = [
  '/src/types.ts',
  '\\src\\types.ts',
];

function isAllowedFile(filename) {
  return ALLOWED_DECLARATION_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid re-declaring a type/interface name that is exported from src/types.ts (CONTRACTS.md Rule 3).',
      category: 'Possible Errors',
      recommended: false,
    },
    schema: [],
    messages: {
      shadowed:
        '`{{kind}} {{name}}` shadows the canonical export from src/types.ts. ' +
        'Import it instead, or use Pick<>/Omit<> to derive a subset. ' +
        '(CONTRACTS.md Rule 3 — root cause of F-COORD-011, F-FS-001/002/003, F-TS-001.)',
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (isAllowedFile(filename)) {
      return {};
    }

    function check(node, kind) {
      const name = node.id && node.id.name;
      if (!name) return;
      if (CANONICAL_TYPE_NAMES.has(name)) {
        context.report({
          node: node.id,
          messageId: 'shadowed',
          data: { kind, name },
        });
      }
    }

    return {
      TSInterfaceDeclaration(node) {
        check(node, 'interface');
      },
      TSTypeAliasDeclaration(node) {
        check(node, 'type');
      },
    };
  },
};
