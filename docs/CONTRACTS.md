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

## Operational patterns from swarm retros

The six rules above are the foundational contract. The patterns below extend
them — operational lessons accumulated through Phase 4's iter sweep (Waves
1–4 of the dogfood swarm). They reinforce specific rules where applicable
and document one new pattern (lesson #16) that lives adjacent to the
production-call-chain doctrine.

**Phase 4 produced 0 CRITICALs**, validating pattern #11 (pre-defined
contract eliminates the F-COORD-011 drift class for parallel dispatch). The
existing 7-row CRITICAL ledger above is therefore unchanged.

---

## Pattern #11 — Pre-defined contract eliminates the drift class for parallel dispatch

> Author the canonical type FIRST in a Wave 0 commit, THEN dispatch
> consumers in parallel.

**Why.** The F-COORD-011 anti-pattern is "two writers, two conventions, one
file" — a drift surface that appears whenever multiple agents write toward
the same data structure without a shared canonical declaration. The
mitigation is to make the canonical declaration *prerequisite* to dispatch:
when parallel work shares a data structure, write the type first
(`src/types.ts` for TS surface, `python/ml_runner/contracts/*.json` for
Python surface), commit it, and only then fan out the consumers.

**Pattern (Phase 4 Wave 0).** `RecoveryReport`, `RecoveryReportEntry`,
`RecoveryReportSkip` were declared in `src/types.ts` before
`FT-BACK-002` (recovery command writer) and `FT-BRIDGE-009` (recovery UI
render reader) dispatched in parallel. Result: zero shadow-type findings
across the three Wave 3 agents that touched the recovery surface.

**Reinforces:** Rule 1 (canonical home), Rule 3 (no shadow types), Rule 4
(cross-domain shapes flow through shared TS types).

---

## Pattern #12 — Grep ALL doc surfaces when fixing path drift

> When updating a path, constant, or version, grep `docs/`, `site/`,
> `README*.md`, `CHANGELOG.md`, and every `*.md` — not just the obvious
> ones.

**Why.** Documentation drift compounds. A path constant updated in code but
left stale in `site/src/content/docs/handbook/reference.md` looks correct to
the developer who is reading code; it misleads the user who is reading the
handbook. The handbook, README, CHANGELOG, and every contract doc are
*authority* surfaces — divergence between them and the code is a quiet
trust failure.

**Pattern.** When changing any value that has a name in the canonical types
module (Rule 2), follow the change with a grep across all documentation
surfaces and update every reference in the same commit.

```bash
git grep "<old-value>" -- '*.md' 'docs/' 'site/' README.md CHANGELOG.md
```

**Reinforces:** Rule 1 (canonical values live in one place — including in
prose).

---

## Pattern #13 — Tests exercise production CALL CHAIN (already encoded as Rule 5)

> Cross-reference only — see Rule 5 above.

This pattern is already canonical doctrine. Listed here only to anchor the
numbering and acknowledge the operational reinforcement Phase 4 surfaced.
Patterns #14 and #15 below extend Rule 5 with two specific failure modes.

---

## Pattern #14 — Production CALL CHAIN passes locally with incidental dev deps

> A test that imports a production module which transitively imports a dev
> dependency will pass on the developer's machine and fail on CI.

**Why.** When a production module imports `jsonschema` (or any optional
runtime dep), the import succeeds on the developer's machine because dev
deps are installed locally. CI installs ONLY declared production deps —
the import fails, the test fails, and the developer is surprised. The test
itself was honest (Rule 5 — production call chain), but the production
dependency declaration was incomplete.

**Anti-example (Phase 4 FT-PY-005).** `ml_runner.events` imported
`jsonschema` for runtime validation of emitted events. Developers had
`jsonschema` installed via `requirements-dev.txt`; CI installed only
`requirements.txt`. The events module imported successfully in the test
suite locally and failed at import time on CI.

**Correct shape.** Soft-import production dependencies that are optional
(catch `ImportError`, skip validation, log a warning), OR add the dep to
the declared production deps. The CHANGELOG must document the soft-import
policy so users know what they get without the optional dep installed.

**Reinforces:** Rule 5 (the test imported the production module; the
production module's dep was the silent gap).

---

## Pattern #15 — Cancel-firing tests need handler-registration evidence

> A subprocess that has spawned but not yet registered its signal handler
> will silently drop signals. Tests must wait for first-event-on-stream
> or marker-file as the gate, not just spawn-success.

**Why.** Spawning a Python subprocess and immediately sending it `SIGTERM`
is a race — the OS delivers the signal before Python's `signal.signal()`
call has registered the handler. Default `SIGTERM` behaviour is "exit
silently with no cleanup," which means the `.cancelled` marker is never
written and the test sees a "forced" cancel where it expected "graceful."
The test passed in 95% of CI runs; the 5% flakes were the race.

**Anti-example (Phase 4 FT-PY-004).** Initial cancel test spawned the
runner and called `process.kill('SIGTERM')` 50ms later. The handler
registered at ~80ms. Result: intermittent flake where the marker was
never written.

**Correct shape.** The test waits for the FIRST `run_start` (or any
post-handler) event on the stderr event stream, OR for a sentinel marker
file written immediately after handler registration. Only after that gate
is the cancel signal fired.

**Reinforces:** Rule 5 (production call chain). The test exercised the
real subprocess; the gap was treating "spawn returned" as equivalent to
"handler registered." Rule 5 is robust only when the gate is the
production *signal* (event observed, marker present), not the production
*scaffold* (process exists).

---

## Pattern #16 — Library-function injection beats command-wrapper injection

> When the natural injection point is a registered VS Code command
> wrapping a library function, inject at the library function — not at
> the command.

**Why.** A registered VS Code command (e.g.
`runforge.recoverIndex`) is a thin wrapper that pulls dependencies from
the activation context, calls a library function, and routes the result
to a UI surface. Tests that inject at the command boundary must:

1. Stand up a fake `vscode.commands` registration.
2. Wait for `activate()` to complete.
3. Fire the command and intercept the UI side effect.

That coupling tests *the registration timing of VS Code commands*, not
the recovery logic. Tests that inject at the library function — the
function the command wraps — call the function directly with a workspace
path argument, assert against the returned `RecoveryReport`, and skip
all of the above scaffolding.

**Anti-example (early FT-BACK-002 design).** First sketch of the recover-
index test wrapped `vscode.commands.executeCommand('runforge.recoverIndex')`
and asserted on the resulting QuickPick state. Three layers of mocks; flaky
on CI. Refactored to call `recoverIndex(workspacePath)` (the library
function) directly. Test is now a single import + assertion. The command
registration is verified separately by Extension Host smoke (§3.4 of
`CONTRACT-PHASE-4.md`).

**Pattern.** For any command that wraps a pure or near-pure library
function:

1. Export the library function from `src/<domain>/<feature>.ts`.
2. The command file is a 5-line wrapper: pull deps from context, call the
   library function, route the return to a UI surface.
3. Unit/integration tests target the library function.
4. The Extension Host smoke (one test per command) covers the wrapper
   registration end-to-end.

**Adjacent to Rules 1–6** (no direct reinforcement). This is a NEW
pattern surfacing from Phase 4's recovery + cancel work; document it here
so future Phase work that introduces new VS Code commands inherits the
shape.

---

## Pattern #17 — Snapshot tests on rendered paths must use POSIX separators

> Path strings emitted into user-facing output must be built with
> `path.posix.join` (or `/`-string concatenation), not `path.join`.

**Why.** `path.join` returns OS-native separators. A snapshot test captured
on Windows records `'\runs\test\metrics.v1.json'`; the same code on Linux
CI produces `'/runs/test/metrics.v1.json'` and the snapshot mismatches.
This is a member of the same "no environment-dependent values" family as
frozen timestamps and fixed run_ids, but it tends to slip past audits
because the producing call (`path.join`) looks innocuous.

**Anti-example (Phase 4 Wave 4 fix-up).** `formatInterpretabilityIndex`
rendered quick-link paths into markdown via
`path.join(runDir, artifacts.X.path)`. Wave 4's snapshot tests passed
locally on Windows and failed on Linux CI on exactly the path-separator
boundary. Fixed by switching the three render-output calls to
`path.posix.join`; the remaining filesystem-IO `path.join` calls were left
untouched (OS-native separators are correct for IO). Same fix applied
preventively to `export-markdown-command.ts:185,193` for the
artifact-listing table.

**Pattern.**
- `path.join` for filesystem I/O (`fs.statSync`, `fs.readdirSync`,
  `readJsonSafe`, etc.).
- `path.posix.join` (or template literals with `/`) for paths rendered to
  the user — markdown output, log lines, error messages, anywhere a string
  ends up in a snapshot or in user-visible UI.

**Reinforces:** Rule 5. The snapshot test exercises the real renderer, so
any env-dependent value in the renderer trips the snapshot. Adjacent to
Pattern #15: both are about subtle environment contamination in the test
surface.

---

## Closing — violations are CRITICAL

These six rules are not lint suggestions. Every CRITICAL in the iter #1–#5a
sweep traces back to one of them. Surface violations immediately — open them
as findings on the active swarm — and do **not** queue them as cleanup.
Cleanup is where shadow types come from.
