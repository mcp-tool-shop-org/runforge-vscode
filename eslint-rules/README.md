# eslint-rules — RunForge custom lint rules

Custom ESLint rules that mechanize the **non-negotiable** doctrines from
[`docs/CONTRACTS.md`](../docs/CONTRACTS.md). Every rule here exists because
shipping its absence cost a CRITICAL finding in the iter #1–#5a sweep.

## Loading

The rules are loaded via `eslint --rulesdir eslint-rules` (see `package.json`
`scripts.lint`). No new npm dep — `--rulesdir` is core ESLint 8.

## Rules

### `no-shadow-canonical-types`

Forbids `interface X` or `type X = ...` declarations where `X` is also
exported from `src/types.ts`. Allowed only in `src/types.ts` itself
(the canonical declaration site).

Catches: F-COORD-011, F-FS-001, F-FS-002, F-FS-003, F-TS-001 (iter #5a).

The canonical type-name list is hardcoded inside the rule for speed and
debuggability. If you add a new exported type to `src/types.ts` that Python
also produces, append it to `CANONICAL_TYPE_NAMES` in the rule file.

### Rule 2 — implemented as `no-restricted-syntax` (in `.eslintrc.json`)

Not a custom rule. The CONTRACTS.md Rule 2 ("no literal duplicating a named
constant") is enforced via three `no-restricted-syntax` selectors targeting:

- `'.runforge/...'` literals (root cause of F-COORD-008)
- `'.ml/outputs/index...'` literals (covered by `WORKSPACE_PATHS.INDEX_FILE`)
- Template literals starting with `.runforge/`

`src/types.ts` is excepted via the `overrides` block — that file is the
canonical home of those literals.

## Adding a new rule

1. Create `eslint-rules/<rule-name>.js` exporting the standard ESLint rule
   shape (`{meta, create}`).
2. Reference it in `.eslintrc.json` `rules` by bare name (no plugin prefix —
   `--rulesdir` registers rules at the top level).
3. Add an `overrides` entry if `src/types.ts` (or any other canonical site)
   should be excepted.
4. Add a violating-snippet test to your commit description so future
   maintainers can re-verify the rule fires.
