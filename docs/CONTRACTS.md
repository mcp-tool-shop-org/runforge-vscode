# Cross-Domain Contracts — RunForge VS Code

## Why this doc exists

Five iterations of the dogfood swarm produced **five CRITICALs**, all from the
same root anti-pattern: canonical values redefined or duplicated in consumer
modules, shadow types diverging between writer and reader, partial-journey
smoke tests masking chain bugs.

This file captures the six rules that — applied at iter #1 — would have
prevented every CRITICAL through iter #5a. They are non-negotiable for any
work that crosses the TS extension / Python ml_runner / observability boundary.

The CRITICAL ledger that motivates this doc:

| Iter  | Finding              | Root cause                                           |
|-------|----------------------|------------------------------------------------------|
| #2    | `F-COORD-003`        | TS spawn passed Python directory instead of module   |
| #3    | `F-COORD-008`        | Observability hardcoded `.runforge/` paths           |
| #4    | `F-COORD-010`        | `index.json` shape drift (bare-array vs `{runs:[]}`) |
| #5a   | `F-COORD-011`        | Shadow `IndexEntry` in observability layer           |
| #5a   | `F-FS-001/002/003`   | Reader/writer shape divergence on `index.json`       |
| #5a   | `F-TS-001`           | Shadow `RunMetadata` missing required `metrics_v1`   |

---

## Rule 1 — Canonical values live in one place

> All canonical values live in **`src/types.ts`** (TS surface) or
> **`python/ml_runner/contracts/*.json`** (Python surface). No other location
> is authoritative.

**Why.** A canonical home is the only way to keep readers and writers in lock
step across a process boundary. Anything else creates a drift surface — and
every drift surface in this codebase has shipped a CRITICAL.

**Anti-example (iter #4, `F-COORD-010`).** The shape of `index.json` was
defined by whichever module wrote it last. TS wrote a bare array; Python wrote
`{runs:[]}`. Neither was "canonical" — both thought they were. Fixed by
declaring `RunIndex` in `src/types.ts` as the single source of truth.

**Correct shape now.** `src/types.ts` carries `IndexEntry`, `RunIndex`,
`MetricsV1`, `FeatureImportance`, `LinearCoefficients`, `RunMetadata`,
`WORKSPACE_PATHS`. Python contracts/*.json mirrors them by schema version.

---

## Rule 2 — No literal duplicating a named constant

> If a value has a name in the canonical types module, code uses the import,
> not the literal.

**Why.** Literals can't be renamed by tooling and won't surface in
"references" or "find usages." A literal is invisible drift waiting to
happen.

**Anti-example (iter #3, `F-COORD-008`).** `.runforge/` was a string literal
sprinkled across the observability layer. The actual workspace path was
`.ml/`. The observability commands silently read empty directories — no error,
no signal, just wrong answers. Fixed by replacing every `.runforge/` literal
with `WORKSPACE_PATHS.ML_ROOT` from `src/types.ts`.

**Test for violations.**

```bash
# any of these grepping a literal copy of a canonical value is a smell
git grep "'\.runforge"           # paths
git grep "'\.ml/outputs/index"   # index file path
git grep "'metrics\.v1'"         # schema versions
```

If you must hold the value as a literal (e.g., a JSON schema), point a
comment at the canonical TS export so renames stay coupled.

---

## Rule 3 — No shadow types in consumer modules

> Defining the same interface name in two files with diverging fields is
> forbidden.

**Why.** A shadow type is a contract that compiles. The TS compiler can't see
a divergence between `src/types.ts:IndexEntry` and
`src/observability/fs-safe.ts:IndexEntry` if both are "valid" interfaces
locally — even when they describe the same JSON file with different fields.

**Anti-example (iter #5a, `F-COORD-011` + `F-FS-001/002/003` + `F-TS-001`).**
Six shadow types in `src/observability/**`:

- `fs-safe.ts:35 IndexEntry` (6 fields; canonical has 10)
- `metadata-command.ts:16 RunMetadata` (missing required `metrics_v1`)
- `metadata-command.ts:38,47 ProvenanceIndexEntry, ProvenanceIndex` (dead)
- `feature-importance-command.ts:15-33 FeatureImportance + nested`
- `linear-coefficients-command.ts:52-62 LinearCoefficientsArtifact + nested`
- `export-markdown-command.ts:19 MetricsV1`

Every one was a private re-declaration of a type already defined in
`src/types.ts`. Collapsed in iter #5a (commit `2ca61b8`) to canonical imports.

**Correct shape.** Consumer modules `import` from `src/types.ts`. They never
re-declare. If a local subset is needed, derive it (`Pick<…>`, `Omit<…>`)
rather than rewrite.

---

## Rule 4 — Cross-domain shapes flow through shared TS types

> Python's JSON output and TS's parsed view share **one** canonical TS
> interface.

**Why.** TS is the consumer. The TS interface is what the runtime actually
checks against (insofar as it checks at all). If Python's writer and TS's
canonical interface disagree, every consumer site silently coerces — and the
divergence lives in production until somebody reads a field that isn't there.

**Anti-example (iter #5a).** Python's `provenance.py` wrote a 6-field entry
keyed by `dataset_fingerprint`. TS's canonical `IndexEntry` declared 10 fields
keyed by `dataset_fingerprint_sha256` (Python's *own* schema field name across
other artifacts). Two writers, two conventions, one file. Resolved by:

- Python becomes the single writer (`3fcf8ec`).
- Python emits the full 10-field shape with `dataset_fingerprint_sha256`.
- TS deletes its writer (`ec81781`).
- `INDEX_SCHEMA_VERSION` bumped `0.2.2.1` → `1.0.0` to mark the consolidation.

**Pattern.** For any artifact crossing the boundary:

1. Define the canonical TS interface in `src/types.ts`.
2. Mirror it in `python/ml_runner/contracts/*.schema.json`.
3. Designate **one** writer (usually Python — closer to the producing data).
4. Document the writer in a doc comment on the TS interface.

---

## Rule 5 — Tests exercise the production CALL CHAIN

> A test that scaffolds around "another bug" to isolate the fix is
> prima-facie evidence that the second bug is in flight.

**Why.** Mocking out the writer to verify the reader produces a green test
and a broken product. If your test stubs the writer because the writer is
"out of scope," the writer is exactly where the next CRITICAL is hiding.

**Anti-example (iter #4 → iter #5a leak).** The iter #4 fix for `F-COORD-010`
verified that `safeReadIndex` could parse `{runs:[]}`. It did so by writing
`{runs:[]}` directly in test setup — bypassing `appendToIndex`. Then iter #5a
discovered `appendToIndex` was the *actual* writer in production and was
emitting a different shape than the reader expected. The iter #4 test passed;
the product was still broken.

**Correct shape (iter #5a, `f14ffaa`).** The new full-chain regression calls
`appendToIndex` (production writer) and `safeReadIndex` (production reader)
back-to-back, asserts shape equality, and never hand-writes a JSON file in
the setup. If the writer changes shape, the test fails.

**Trip-wire.** When you reach for `fs.writeFileSync(indexPath, ...)` in a
test setup, stop and ask: "what's wrong with calling the production writer
here?" If the answer is "it's broken in some other way," that's the next
finding to log.

---

## Rule 6 — Smoke tests cover the full user journey

> Partial-journey smoke ("spawn works") hides chain bugs ("but observability
> can't read what was written").

**Why.** A user-visible journey is the smallest unit that has the same shape
as the failure mode. "Train completes" and "Browse Runs shows the run" are
the same journey from the user's seat; splitting them in tests splits the
contract that matters.

**Anti-example (iter #2 → iter #3 leak).** Iter #2 fixed `F-COORD-003`
(spawn) by verifying `python -m ml_runner` ran to completion. The test passed
on a fresh workspace. Iter #3 then surfaced `F-COORD-008` — observability
read `.runforge/`, Python wrote `.ml/`. The user journey "train, then list
runs" was broken end-to-end. Neither iter #2's spawn smoke nor iter #3's
read-path unit tests caught it. A smoke that ran the full journey would
have.

**Correct shape.** The iter #5a regression test in `f14ffaa` runs the full
journey:

1. Spawn the runner via `spawnRunner` (Rule 1: production call chain).
2. Wait for `.ml/outputs/index.json` to land.
3. Read it via `safeReadIndex`.
4. Assert the entry has all 10 canonical fields.

One test, one journey, no stubs. Every link in the chain is real.

---

## Closing — violations are CRITICAL

These six rules are not lint suggestions. Every CRITICAL in the iter #1–#5a
sweep traces back to one of them. Surface violations immediately — open them
as findings on the active swarm — and do **not** queue them as cleanup.
Cleanup is where shadow types come from.
