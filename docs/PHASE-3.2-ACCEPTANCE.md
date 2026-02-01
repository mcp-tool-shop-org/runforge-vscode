# Phase 3.2 — Acceptance Criteria

**Title:** Hyperparameters & Training Profiles
**Phase:** 3.2
**Prerequisite:** Phase 3.1 complete and released
**Status:** Pre-implementation acceptance criteria

---

## 1. Scope

Phase 3.2 introduces explicit hyperparameter configuration and named training profiles while preserving all Phase 2 and Phase 3.1 guarantees.

**This phase is limited to:**

- Declaring hyperparameters explicitly
- Validating hyperparameters
- Recording hyperparameters in metadata
- Defining and expanding named training profiles

**It explicitly does not introduce:**

- Hyperparameter tuning or search
- Metrics schema expansion
- Feature importance artifacts
- New model families
- Regression tasks

---

## 2. Regression Gate (Hard Requirement)

All of the following must pass **unchanged**:

- Phase 2.1 tests (deterministic training)
- Phase 2.2.1 tests (metadata + provenance)
- Phase 2.2.2 tests (artifact inspection + diagnostics)
- Phase 2.3 tests (UX polish)
- Phase 3.1 tests (model choice + metadata)

**No existing test may be modified to accommodate Phase 3.2.**

---

## 3. Hyperparameter Interface (Explicit)

### 3.1 CLI Surface (Primary)

Phase 3.2 introduces explicit hyperparameter declaration via CLI:

```
--param <name>=<value>
```

May be repeated:

```
--param C=1.0 --param max_iter=1000
```

**Rules:**

- Parameters are explicit
- No implicit defaults are introduced
- If no parameters are provided, model defaults remain unchanged

### 3.2 Validation Rules

Hyperparameters must be:

- Known to the selected model
- Type-correct
- Value-valid (e.g. no negative iteration counts)

Invalid hyperparameters must:

- Fail before training starts
- Produce an actionable error message:
  - parameter name
  - provided value
  - expected type or constraint

**Silent coercion is forbidden.**

---

## 4. Determinism Rules

Hyperparameter usage must preserve determinism:

- Identical dataset + config + version → identical output
- Random seeds must be fixed where applicable
- Parallelism must remain controlled (`n_jobs=1` unless explicitly overridden and documented)

**If a hyperparameter cannot be made deterministic, it is out of scope.**

---

## 5. Metadata & Provenance

### 5.1 Required Metadata Additions

Run metadata must include:

```json
{
  "hyperparameters": {
    "<param_name>": <value>
  }
}
```

**Rules:**

- Field is mandatory for Phase 3.2 runs
- Field is optional when reading older runs
- Hyperparameters must be recorded after profile expansion
- Order must be deterministic (canonical JSON)

### 5.2 Profile Metadata Rules

**When a profile IS used (--profile specified):**

Metadata MUST include:

- `profile_name`
- `profile_version`
- `expanded_parameters_hash`

**When NO profile is used:**

Metadata MUST:

- **Omit `profile_name` entirely** (not null, not "none")
- **Omit `profile_version` entirely**
- **Omit `expanded_parameters_hash` entirely**

This keeps JSON minimal and stable.

---

## 6. Training Profiles (Named Aliases)

### 6.1 Profile Definition

Profiles are named presets that expand to:

- `model_family`
- `hyperparameters`

Examples:

- `default`
- `fast`
- `thorough`

**Profiles are aliases, not new behavior.**

### 6.2 Profile Versioning

Each profile must have:

```json
{
  "profile_name": "fast",
  "profile_version": "1.0",
  "expanded_parameters_hash": "<sha256>"
}
```

**Rules:**

- `profile_version` is explicit
- Expanded parameter hash ensures integrity
- Profile expansion must be inspectable post-run

### 6.3 Profile Selection Interface

Profiles may be selected via:

```
--profile <profile_name>
```

**Rules:**

- Profile expansion occurs before hyperparameter override
- CLI `--param` values override profile values explicitly
- Invalid profile names fail fast with valid options listed

---

## 7. Precedence Rules (Must Be Documented and Enforced)

From highest to lowest precedence:

1. CLI `--param`
2. Profile-expanded parameters
3. Model defaults

These rules must be:

- Documented
- Tested
- Deterministic

---

## 8. Artifact Inspection Compatibility

Artifact inspection must:

- Reflect the final expanded hyperparameters
- Remain read-only
- Require no schema changes to existing inspection outputs

**Hyperparameters must be visible via metadata, not inferred from artifacts.**

---

## 9. Error Handling

Phase 3.2 must add explicit error handling for:

- Unknown hyperparameters
- Type mismatches
- Invalid value ranges
- Profile conflicts

Errors must:

- Fail fast
- Be actionable
- Avoid generic "invalid config" messages

---

## 10. Tests (Mandatory)

Phase 3.2 must add tests covering:

- Hyperparameter parsing (single + repeated)
- Hyperparameter validation (type + range)
- Deterministic behavior with hyperparameters
- Metadata recording correctness
- Profile expansion correctness
- CLI override precedence
- Invalid profile handling
- Regression gate enforcement

---

## 11. Documentation Updates

**Required updates:**

README:

- Document `--param` usage
- Document profiles and precedence rules
- No marketing language added

Profiles must be documented with:

- `model_family`
- default parameters
- `profile_version`

---

## 12. Out-of-Scope (Explicit)

Phase 3.2 does **not** include:

- Hyperparameter tuning/search
- Metrics expansion
- Feature importance
- New model families
- Regression
- Auto-configuration

---

## 13. Phase 3.2 "Done" Definition

Phase 3.2 is complete when:

- [ ] Users can explicitly set hyperparameters
- [ ] Users can select named profiles
- [ ] Profile expansion is inspectable and versioned
- [ ] Determinism and provenance are preserved
- [ ] All prior guarantees remain intact
- [ ] All tests pass

---

## Next Step After Phase 3.2

Define Phase 3.3 acceptance criteria (metrics schema v1).
