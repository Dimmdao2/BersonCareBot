# Execution methodology for the existing “clean the test suite” workstream

This methodology extends `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`; it does not create another plan or taskdb workstream. The existing audit and prior research remain authoritative for what constitutes test value.

The repository already contains the starting mechanisms: the [Stryker pilot configuration](/home/dev/dev-projects/bcb-wt-docs2/apps/webapp/stryker.pilot.json), the [A0 greenfield baseline](/home/dev/dev-projects/bcb-wt-docs2/docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md), and the [A1 disposable PostgreSQL verifier](/home/dev/dev-projects/bcb-wt-docs2/scripts/verify-a1-rls-conformance.mjs). Execution should extend those mechanisms rather than create parallel infrastructure.

## 1. HOW-A — cut meaningless tests

### A1. Freeze a reproducible green baseline

Every destructive batch starts from one immutable baseline SHA.

Record:

- commit SHA, Node/pnpm/Stryker/Vitest versions;
- test-file and test-case census;
- exact test commands and shard configuration;
- baseline JSON reports and elapsed time;
- mutation configuration hash;
- current A0 manifest hash.

Run the appropriate full baseline once, through the repository’s shared test mutex. The baseline must have zero unexplained failures. Stryker’s own initial dry run must also be green before each mutation batch. If either is red, stop: mutation results cannot distinguish a new kill from a pre-existing failure.

After a deletion batch, rerun only the batch’s contract tests. Run the application-level suite after a group of batches and the full CI once at the final merge checkpoint. Do not repeatedly run full CI between small batches.

### A2. Establish a stable test and contract inventory

Generate one stable record per test case:

```text
test_id = path + full describe/it title + AST-node hash
module = owning production module
environment = pure | live-db | api-ui
public_boundary = exported service/port/route/component
runtime_ms = median of three baseline executions
```

Do not use line numbers as identifiers.

Partition production code by public contract, not by test file. Within each contract, identify decision nodes mechanically from the AST:

- conditions and switch cases;
- validation returns and thrown domain errors;
- comparison boundaries;
- logical connectors;
- permission/principal checks;
- state-transition choices;
- quota, amount, expiry and retry arithmetic.

Imports, types, logging, static labels, JSX copy and wiring-only object literals are “arid” unless the contract explicitly makes them observable. Google’s scalable system likewise mutates changed code, omits uninteresting/arid nodes, limits mutants per line/review, and selects useful operators rather than attempting whole-repository brute force. [Google’s 2021 mutation-at-scale paper](https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/) reports this approach across more than 24,000 developers and 1,000 projects; the earlier system covered about 30% of diffs with statement coverage. [State of Mutation Testing at Google](https://research.google/pubs/state-of-mutation-testing-at-google/)

### A3. Use two Stryker modes, not one

| Setting | Offline cleanup/audit | Pull-request shrink-only gate |
|---|---:|---:|
| Scope | Fixed module batch | Changed decision-line ranges |
| `coverageAnalysis` | `perTest` | `perTest` |
| `disableBail` | `true` | `false` |
| `incremental` | `true` | `false` for correctness |
| `--force` | On a rerun after config/environment changes | Always |
| Concurrency | 2 on the shared host; 4 on a dedicated runner | 4 |
| Report | JSON plus clear text | JSON plus short failure summary |

Important details:

- The Vitest runner always uses per-test coverage; its documentation says the configured `coverageAnalysis` value is ignored because `perTest` is mandatory. It runs each Vitest worker single-threaded because Stryker supplies the outer parallelism. [`vitest.related` defaults to true](https://stryker-mutator.io/docs/stryker-js/vitest-runner/).
- `disableBail` does not enable per-test coverage. It makes a killed mutant report all failing/killing tests instead of stopping after the first. Use it for the cleanup kill matrix; leave it off in merge CI for speed. [Stryker configuration](https://stryker-mutator.io/docs/stryker-js/configuration/)
- Incremental mode is useful for the fixed offline sweep and interrupted-run recovery. It is not a safe PR correctness boundary: Stryker does not detect dependency, environment, snapshot or unrelated configuration changes, and Vitest reports changed tests only at file granularity. [Stryker incremental limitations](https://stryker-mutator.io/docs/stryker-js/incremental/)
- PR runs should pass exact `file:start-end` mutation ranges and `--force`; Stryker officially supports line and column ranges.
- Keep `disableTypeChecks: true`; mutants intentionally create TypeScript-invalid intermediate forms. Typecheck the unmutated baseline separately.
- Retain the pilot’s 60-second absolute timeout initially. Tune only from measured dry-run time using Stryker’s formula, not by increasing it until hangs disappear.
- Keep `maxTestRunnerReuse: 0` unless RSS measurements demonstrate a leak. If heavy Next graphs grow continuously, restart workers every 20–50 mutations and record the cost.

### A4. Control heavy Next.js import graphs

Use this fixed escalation:

1. Mutate the domain service or public route handler, not `page.tsx`, when both expose the same decision.
2. Use the `fast` Vitest project for pure/module/API contracts. Browser Mode is unsupported by the Stryker Vitest runner.
3. Let `vitest.related=true` select directly related tests. For an API/server-process contract that reaches code indirectly, use an explicit batch test-file allowlist and `related=false`; otherwise Stryker can silently omit the relevant test.
4. Treat static mutants separately. Do not globally enable `ignoreStatic`; a session TTL or permission constant evaluated at import time can be a real decision. Ignore only an AST-classified non-decision static node.
5. Split a batch when its dry run exceeds 90 seconds or its projected mutation phase exceeds 15 minutes.
6. Never run Stryker concurrently with a full Next build or full repository test run on the shared eight-core host.

The existing pilot produced 224 mutants in 261 seconds at concurrency four. That is approximately 1.17 wall-seconds per mutant, but it is not a universal rate. Heavy Next import graphs may double it.

### A5. Fixed batching and ordering

The sweep terminates after every listed contract has been processed once; it is not “audit until satisfied.”

1. Already completed no-op formatter/source-text removal.
2. The 200 heavy test files, partitioned by owning contract.
3. The 34 mock-echo candidates, with the overlap processed only once.
4. Tenant/RLS/principal contracts.
5. Auth/password/session contracts.
6. Quota/billing contracts.
7. The 32 sensitive zero-coverage production files.
8. The remaining modules in stable lexical order.

Target 75–150 decision mutants or at most 15 projected minutes per batch. A batch may contain several test files but only one or a few related public contracts.

Before each batch:

- run the unmutated targeted tests;
- run Stryker’s dry run;
- abort if either is red;
- save the immutable batch definition and configuration hash.

### A6. Produce a factual kill matrix and minimize by environment

For each environment separately, build:

```text
test_id -> {non-equivalent decision mutants killed, historical defects replayed}
mutant_id -> {tests that killed it}
```

Classify:

- `KEEP_PROVEN`: kills at least one non-equivalent decision mutant or a replayed historical defect.
- `REDUNDANT_PROVEN_SET`: kills only mutants already killed by another test in the same contract and environment.
- `UNPROVEN`: kills no relevant mutant.
- `ARBITER_REQUIRED`: claims a consequence that the generated operators did not represent.
- `DELETE_PROVEN_FORM`: fails under a behavior-preserving transformation or reads/asserts source text.

Within each `module × environment × consequence`, select a deterministic minimum covering set:

1. maximize newly covered decision mutants;
2. divide by median runtime to break broad-but-expensive ties;
3. prefer state/output assertions over collaborator-call assertions;
4. use path and test title as the final stable tie-break.

Do not let a pure unit test displace a live-DB test: they prove different environments. Preserve the existing 28 live-DB files until their behaviors have been represented in the new DB matrix.

Google’s testing guidance is directly aligned: invoke public APIs, test state rather than interactions, and expect refactoring not to require test edits. It explicitly warns that interaction tests can pass when a record is immediately deleted and fail when an equivalent internal API replaces the old call. [Software Engineering at Google, Chapter 12](https://abseil.io/resources/swe-book/html/ch12.html)

### A7. Put the arbiter at the only subjective boundary

AI does not decide whether an `UNPROVEN` test is useful.

If a reviewer claims that such a test protects consequence `C`:

1. state `C` as public input/state → observable wrong result;
2. hand-inject exactly that fault;
3. run the unmodified candidate test;
4. keep it only if it goes red for the claimed reason;
5. revert the fault and confirm green.

One fault injection may arbitrate a whole duplicate group. The result is evidence for the contract, not one document row per assertion.

Under the owner’s deletion default:

- no claimed consequence → delete;
- claimed consequence but arbiter stays green → delete;
- arbiter goes red → owner may approve retention;
- equivalent production mutation → neither proves nor disproves a test; classify the mutation, not the test.

Human checkpoints:

- **Calibration gate:** after three representative batches—pure auth, heavy Next graph, live-DB boundary—approve configuration and measured cost once.
- **Exception gate:** owner reviews only proposed keeps that lack ordinary mutation evidence and any new equivalent-mutant suppression.
- **Final cut gate:** one aggregate before/after report and independent review of deletion evidence. It is not a second manual review of all 10,000 tests.

### A8. Deduplicate surviving mutants by consequence

A surviving mutant is not a task or card. Generate a worklist row in the existing audit keyed by:

```text
tier
+ module
+ environment
+ public_boundary
+ decision_id
+ observable_consequence
```

Example:

```text
quota | org-entitlements | pure
| requireEntitlement
| write-access state transition
| blocked organization can still write
```

All mutations of `blocked`, `read_only`, boolean connectors and guard removal that produce that same consequence belong to one row. Store the member mutant IDs and zero-coverage files as evidence under it.

If the consequence is initially unknown, group mechanically by module, public boundary and AST decision cluster. A human names the observable consequence once at the checkpoint. AI-generated bug stories are not accepted.

### A9. Deletion application

Apply deletions in small, reversible batches:

1. save the verdict report;
2. delete only classified cases;
3. run the same unmutated contract tests;
4. run one targeted hand-injected arbiter from each retained consequence group;
5. revert all injected faults;
6. commit the deletion plus the existing audit’s evidence/checkmarks together;
7. after a logical module group, run the application-level phase gate.

A green run after deletion proves only that the baseline still runs. The pre-deletion kill matrix and arbiters are the evidence that value was retained.

### Cost and duration

| Scope | Expected cost |
|---|---:|
| 1,500-mutant calibration sample | 40–90 minutes measured expectation; 80–180 minutes for 2× import cost |
| 5,000–15,000 selected decision mutants | approximately 2–10 machine-hours |
| Exhaustive default Stryker mutation over the repository | plausibly 30–60+ machine-hours; not recommended |
| Inventory, classifier and report tooling | 2–3 engineer-days |
| 200-heavy-file and mock-echo adjudication | 3–5 engineer-days |
| Remaining fixed contract sweep and deletion integration | 3–7 engineer-days |
| Total HOW-A | approximately 8–15 engineer-days plus machine time |

The largest uncertainty is not execution time but the number of human arbiter groups. One arbiter per mutant would make the work uneconomic; one per deduplicated consequence is essential.

## 2. HOW-B — build missing valuable tests

### B1. Contract-authoring recipe

For every priority module:

1. Identify the public interface used by production: exported service, repository port, HTTP route or visible UI action.
2. Write one contract table containing:
   - initial state and principal;
   - input/action;
   - observable result;
   - persisted state or externally visible side effect;
   - named fault the row must detect.
3. Split the contract by environment:
   - `*.contract.test.ts`: pure logic with controlled ports/fake clock;
   - `*.postgres.integration.test.ts`: disposable PostgreSQL 16;
   - route/UI file only when the public behavior cannot be observed below that layer.
4. Stub only nondeterministic or external inputs. Do not assert calls to an internal collaborator unless that call itself is the external contract.
5. Use table-driven cases when they express different inputs to one behavior; do not combine unrelated behavior in one large `it`.
6. Run the test green.
7. Hand-inject the named fault and require red.
8. Revert the fault.
9. Run mutation testing on the contract’s decision lines and add any surviving non-equivalent consequence to the deduplicated worklist.

Google defines a basic test as one behavior, a specific input, an observable output and a controlled environment. It also states that tests derive their value from engineers’ trust and that a bad suite can be worse than none. [Software Engineering at Google, Chapter 11](https://abseil.io/resources/swe-book/html/ch11.html)

### B2. Tier 1 — tenant isolation, RLS and principal routing

Extend the existing A1 harness instead of adding a second database framework. It already creates a socket-only PostgreSQL cluster, restores A0, applies migrations, installs non-owner staff/patient logins, signs principal context and proves two-organization appointment visibility.

Use at least:

- organizations A and B;
- staff A and staff B;
- patient A and patient B;
- a missing/unsigned principal;
- an owner/operator connection used only as an oracle.

For every protected public boundary, execute this result matrix:

| Principal/context | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Correct role, own organization | Exact expected rows | Contract-specific success | Exact affected row/state | Contract-specific success/denial |
| Correct role, foreign organization | Empty result or specified denial | Denied; no row created | Zero affected/denied; row unchanged | Zero affected/denied; row remains |
| Correct login, missing context | Rejected before scoped access | Rejected | Rejected | Rejected |
| Wrong base login/runtime role | Rejected | Rejected | Rejected | Rejected |
| Patient against another patient in same org | Only explicitly shared data | Denied by default | Denied | Denied |

Assertions must verify the final result through a separate oracle connection. A foreign update returning zero is insufficient unless the oracle proves that the row remained unchanged.

PostgreSQL’s own rules make non-owner execution essential: superusers and `BYPASSRLS` roles always bypass RLS, table owners normally bypass it unless `FORCE ROW LEVEL SECURITY` is active, and an enabled table without an applicable policy is default-deny. [PostgreSQL 16 RLS documentation](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)

Supplement behavioral cells with diagnostics—not substitutes for them:

- `session_user`, `current_user`;
- `row_security_active(table)`;
- `pg_has_role(..., 'MEMBER'|'SET'|'USAGE')`;
- exact affected row counts;
- SQLSTATE and persisted state.

PostgreSQL provides `pg_has_role` and `row_security_active` specifically for these facts. [System information functions](https://www.postgresql.org/docs/16/functions-info.html) pgTAP’s privilege and policy helpers are also an established catalog-level pattern, but they should remain secondary to result assertions. [pgTAP documentation](https://pgtap.org/documentation.html)

#### Required DB fault-injection suite

For each protected boundary, create a fresh disposable database per injection or restore a clean snapshot between injections:

1. `REVOKE` a privilege required by an allowed operation. At least one own-organization positive cell must fail.
2. Weaken the applicable policy to `USING (true)`/`WITH CHECK (true)` or disable/replace it. At least one cross-organization negative cell must fail.
3. Remove `FORCE ROW LEVEL SECURITY` where an owner path is exercised. The owner-path negative must fail.
4. Change the owner of a relevant `SECURITY DEFINER` function:
   - to an underprivileged role to prove allowed behavior fails; or
   - to a bypass-capable role where that would expose foreign data, to prove a negative fails.
5. Grant an application login an unintended privileged role. The topology and behavioral matrix must both fail.

A mutation-injection run passes only when the baseline matrix is green and every injected database fault makes at least one predeclared cell red. A fault that leaves the matrix green is a missing test.

`SECURITY DEFINER` functions execute with their owner’s privileges, so owner mutation is a real behavioral fault, not catalog trivia. PostgreSQL also recommends selective `EXECUTE` grants and a safe `search_path`. [PostgreSQL 16 `CREATE FUNCTION`](https://www.postgresql.org/docs/16/sql-createfunction.html)

Estimated implementation: 3–6 engineer-days, including matrix expansion and fault injection. The previous 2–4 day estimate is credible for the base matrix but optimistic once DB mutations and cleanup isolation are included.

### B3. Tier 2 — auth, passwords and sessions

Contracts:

- correct password succeeds; wrong password produces the public generic refusal;
- repeated failures increment persistent state and activate the exact delay/lockout boundary;
- a correct password does not silently bypass an already-active lockout unless specified;
- OTP/challenge redemption is single-use and replay-safe;
- tampered, malformed and expired session cookies are rejected;
- session TTL and maximum age use a fake clock and test both sides of each boundary;
- logout/revocation makes the previous session unusable;
- cookie attributes and `/api/me` behavior are checked through the route boundary.

Required injected faults:

- invert password verification;
- remove failure-counter increment;
- change `>=` to `>` at the lockout threshold;
- remove signature verification;
- choose the wrong session-TTL branch;
- accept an expired/replayed challenge.

Use real hashing/verifier code with low test cost where feasible; never retain plaintext credentials in fixtures or reports.

Estimated implementation: 2–4 engineer-days.

### B4. Tier 3 — quotas and billing

Pure contract cases:

- `usage = limit - 1` allows;
- `usage = limit` denies;
- invalid and negative limits are rejected;
- disabled mechanics deny;
- `read_only` permits only declared reads;
- `blocked` denies declared writes;
- missing entitlement produces the documented result.

Live-DB cases:

- entitlement functions can read every required table under their actual owner/runtime role;
- ordinary staff/patient roles cannot directly read billing internals;
- the usage visible through the public billing/entitlement interface matches persisted facts;
- concurrent reservations cannot exceed a finite quota;
- denial leaves no partial persisted state.

The known surviving decisions at `requireEntitlement` and `org-entitlements/service` become the initial hand-injection list. Every one must be killed or narrowly proved equivalent.

Estimated implementation: 2–3 engineer-days.

### B5. Tier 4 — the 32 sensitive zero-coverage files

Process them in fixed consequence order, beginning with the three named critical seams.

#### Organization provisioning

Call `createOrganizationProvisioningService` and its real PostgreSQL port.

Assert:

- a valid intent provisions exactly one organization, owner membership and specialist;
- retry/replay is idempotent;
- slug collision returns `slug_unavailable` without partial rows;
- a foreign principal cannot read or provision another challenge;
- membership/platform-user mismatch and non-owner membership are rejected;
- the created owner is bookable only in the new organization.

This must include live PostgreSQL because the production behavior depends on functions, grants, ownership and RLS.

#### Patient invites

Split pure token/email behavior from DB lifecycle behavior.

Assert:

- issuing a new invite supersedes the previous pending invite;
- revoked, expired, exchanged and superseded tokens cannot redeem;
- bound recipient mismatch fails;
- cross-organization lookup/revoke/redeem fails;
- bearer and continuation are single-use;
- concurrent redemption has exactly one winner;
- successful redemption produces the intended relationship and no foreign one;
- failed email delivery cancels proof state.

The email sender may be stubbed as an external boundary; assertions must target the returned lifecycle and database state, not merely that the stub was called.

#### Registry acquiring gateway

Use a deterministic provider-registry fake and the public gateway/route.

Assert:

- globally disabled payments fail;
- absent or disabled provider fails;
- explicit provider overrides the default only when enabled;
- amount, currency, patient identity, return URL and description reach the provider contract correctly;
- provider error becomes the public failure without a false success record;
- refund preserves the caller’s idempotency key;
- the unsupported webhook method directs callers to the booking webhook route;
- API authorization prevents charging a foreign patient.

Inject faults in provider selection, enabled checks, amount/currency forwarding, error mapping and refund idempotency.

#### Remaining 29 files

Apply the same contract recipe in stable path order. Zero coverage alone selects the build queue; it does not dictate test count. Stop once each public decision consequence has one proven contract in the appropriate environment.

Estimated implementation for all 32 files: 8–16 engineer-days.

### B6. Tier 5 — the three unguarded invariants

1. **Patient reference UUID across organizations:** create two organization relationships for the same canonical patient, invoke the public reference-building path in both principals, and assert that the canonical patient UUID is retained without substituting a foreign organization-local identifier. Inject the substitution and require red.
2. **Structured FIO precedence:** supply conflicting structured name fields and `displayName`; assert that structured FIO wins and `displayName` is used only when structured data is absent. Invert precedence and require red.
3. **Media FK `ON DELETE SET NULL`:** in disposable PostgreSQL, insert a media row and linked patient-file row, delete the media row, and assert that the patient-file row remains while the FK becomes `NULL`. Recreate the constraint as `CASCADE` and then `RESTRICT`; the contract must fail under both mutations.

Estimated implementation: 1–2 engineer-days.

Total HOW-B estimate: approximately 16–31 engineer-days. Parallelization can reduce calendar time, but DB harness changes and mutation/fault-injection runs must remain serialized around their shared artifacts.

## 3. HOW-C — CI shrink-only gate

### C1. Diff-scoped mutation merge job

Run as a required job in parallel with existing lint, typecheck, tests, build and A1 jobs.

1. Fetch the merge target and compute the exact merge base.
2. Parse added/modified TypeScript with the AST.
3. Intersect changed lines with decision nodes.
4. Generate Stryker mutation ranges for those nodes.
5. Generate at most two high-value mutants per decision node:
   - equality/boundary;
   - conditional/boolean;
   - logical connector;
   - return/throw value;
   - arithmetic for money/quota/time.
6. Cap a PR at 100 decision mutants. More than 100 fails with “split the change” unless deterministic parallel shards keep the same cap per reviewed unit.
7. Run an unmutated dry run.
8. Run Stryker with `--force`, bail enabled and concurrency four.
9. Parse JSON rather than relying only on Stryker’s aggregate threshold.

Google’s operational lesson is to mutate only changed code and cap/filter the surfaced mutants because developer attention is also a finite resource. [Practical Mutation Testing at Scale](https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/)

### C2. Exact failure conditions

The merge job fails when any of these is true:

- the unmutated dry run fails;
- changed decision lines exist but the generated mutant set is empty;
- a changed decision mutant is `Survived` or `NoCoverage`;
- a mutant has a runtime/compile infrastructure error that prevents classification;
- the mutation job exceeds six minutes;
- a new `Stryker disable` suppression lacks the required owner/code-owner approval and reason;
- result JSON is missing or belongs to a different base/head/config hash;
- a rerun produces a different baseline outcome, indicating a flaky contract.

`Killed` is accepted. `TimedOut` is accepted only with a sufficiently generous, fixed timeout derived from the green dry run; recurring load-induced timeouts are infrastructure failures, not kills.

The effective changed-decision threshold is therefore 100% of non-ignored, valid mutants detected. Configure Stryker’s display thresholds as `high=100`, `low=100`, `break=100`, but retain the JSON status check because aggregate score alone can hide classification errors.

### C3. Equivalent mutants

The raw score remains a lower bound. A survivor blocks the merge, but it is not automatically a demand for another test.

Resolution:

1. prove that the mutation has no observable effect over the public contract’s valid domain;
2. add the narrowest supported suppression, naming only the mutator and line;
3. include a specific equivalence reason;
4. require owner/code-owner approval for any new suppression;
5. keep ignored mutants visible in reports.

Stryker supports narrow `// Stryker disable next-line <Mutator>: <reason>` annotations; ignored mutants remain visible but do not affect the score. Global mutator exclusion is explicitly a shotgun approach and is not acceptable here. [Stryker equivalent-mutant handling](https://stryker-mutator.io/docs/stryker-js/disable-mutants/)

Do not maintain a line-number allowlist. It would become another source-text test. The suppression must travel with the AST node and be reviewed when that code changes.

### C4. Eight-minute wall-time budget

Because jobs run in parallel, the mutation job must fit inside the existing merge wall time:

| Phase | Budget |
|---|---:|
| dependency/cache restore | 45 seconds |
| AST diff and range generation | 15 seconds |
| Stryker dry run | 60–90 seconds |
| up to 100 mutants | 2–4 minutes based on the pilot, including 2× graph risk |
| report and upload | 15 seconds |
| total hard timeout | 6 minutes |

A1/A0 DB jobs run in parallel with a seven-minute hard timeout, leaving one minute of workflow scheduling slack. The current A1 workflow permits 15 minutes, so this target must be measured before enforcement. If A1 exceeds seven minutes, optimize snapshot restore/dependency setup; do not move tenant isolation out of the merge gate.

No automatic “retry until green” is allowed. One diagnostic rerun may classify a flake, but the build remains failed if results differ.

### C5. Make `a0-greenfield` real in the migration commit

The existing baseline checker deliberately permits append-only pending migrations, so it does not currently enforce same-commit refresh. Add these invariants to the existing A0 mechanism:

- any migration-directory diff requires an A0 baseline/manifest diff;
- the new manifest frontier must equal the current migration frontier—zero pending migrations;
- any changed historical migration fails before refresh;
- a baseline change without a migration requires explicit baseline-repair approval;
- CI rebuilds the normalized schema on disposable PostgreSQL 16 and byte/hash-compares it with the committed baseline;
- A0 check, restore, seed, migration-ledger and A1 proof all run from the committed artifact.

The current generator records a source commit and requires migration directories clean relative to `HEAD`. That makes a literal one-commit workflow awkward. Extend the existing refresh command with an index/staged-tree mode:

1. read migration sources from the staged Git index;
2. build a disposable database from the previous baseline plus those staged migrations;
3. dump and normalize schema;
4. record migration-content hashes or a migration-subtree digest, not a self-referential final commit SHA;
5. stage the regenerated `schema.sql` and manifest;
6. commit migration and baseline together.

CI repeats the generation in a temporary directory and runs a zero-diff/hash comparison. The known modified `0175` history must be investigated against TEST/PROD before any refresh; regenerating the baseline first would conceal the drift identified by the authority document.

This follows the mature schema-dump model:

- Rails updates `schema.rb`/`structure.sql` from the database after migration, recommends committing it, and uses it because loading a current schema is faster and less error-prone than replaying all historical migrations. [Rails Active Record Migrations, schema dumping](https://guides.rubyonrails.org/v7.2/active_record_migrations.html)
- GitLab requires schema changes in `db/structure.sql`; its `db:check-migrations` merge job compares rollback output with the target schema, compares migrated output with the committed structure, and verifies the migration ledger files. [GitLab `db:check-migrations`](https://docs.gitlab.com/development/database/dbcheck-migrations-job/) GitLab’s migration guide states that `structure.sql` is automatically generated by `rails db:migrate` and should be committed with the migration. [GitLab migration style guide](https://gitlab.com/gitlab-org/gitlab/-/blob/master/doc/development/migration_style_guide.md)

Estimated HOW-C implementation: 4–8 engineer-days—two to three for mutation diff tooling and stabilization, one to three for staged A0 regeneration/drift enforcement, and one to two for workflow timing and flake calibration.

## 4. Stage reconciliation

| Existing stage | Disposition | Reason |
|---|---|---|
| **0. Formatter/mechanical probes** | **ALREADY DONE** | The audit records a green 1,792-file/10,815-test baseline, 23 files/53 formatter failures, classification of 52 source-text failures, the repaired `pagePrincipalCensus`, the rejected rename probe, 61.94% statement coverage, 90 zero-coverage files, and two measured Stryker pilots. Do not repeat these probes. |
| **1. Delete pure source-text tests** | **ALREADY DONE** | The audit records the post-cleanup suite at 1,737 files/10,423 tests with zero failures and describes the removed pure source-text class. Remaining source-reading candidates, if any, are handled mechanically by HOW-A rather than reopening a separate stage. |
| **2. Clean mixed source-text files** | **ALREADY DONE** | The audit records 21 additional files/803 assertions and states that all removed assertions were textual while executable checks were retained. |
| **3. Mutation over 200 heavy files** | **FOLD INTO HOW-A A2–A9** | Replace per-test prose verdicts with the fixed decision-mutant kill matrix, environment-specific covering set, arbiter and consequence worklist. Retire the old open-ended stage when those fixed batches finish. |
| **4. Thirty-four mock-echo files** | **FOLD INTO HOW-A A5–A7** | Process as one fixed batch after heavy-file overlap removal. State/output contracts and hand fault injection decide ambiguous cases; no visual/AI opinion pass remains. |
| **5. Three unguarded invariants** | **FOLD INTO HOW-B Tier 5** | Two public behavioral contracts and one PostgreSQL FK contract, each with a required fault injection, replace the standalone stage. |
| **6. New-code mutation gate** | **FOLD INTO HOW-C C1–C4** | The owner-approved requirement becomes the strict changed-decision merge shrink-only gate with explicit statuses, exception handling and time budget. |
| **7. Real A0 greenfield baseline** | **FOLD INTO HOW-C C5** | Same-commit staged regeneration, zero-pending frontier and CI drift comparison implement the accepted requirement. The `0175` historical-drift investigation remains a blocking prerequisite to the first legitimate refresh. |
| **8. Shared env layer** | **CANCEL AS A TEST-SUITE STAGE** | Env-file deduplication is operational configuration work and neither deletes meaningless tests nor builds missing contracts. Removing it from this audit does not reverse the owner’s separate approval; it only prevents unrelated prod-env work from blocking completion of “clean the tests.” No new task or card is created here. |

“Fold” means that the old checkbox is superseded by the named fixed HOW section and must not remain as a second independently open stage.

## 5. Honest uncertainty

- The 3% mutation scores come from two modules and cannot be generalized to the whole repository.
- Stryker’s generated-mutant count for selected decision nodes is not yet measured repository-wide. Whole-repository brute force could cost tens of machine-hours.
- Heavy Next import graphs may exceed the assumed 2× multiplier. Dedicated mutation configs and direct public-module contracts may be required before the six-minute CI target is realistic.
- Equivalent-mutant frequency is unknown. The strict gate shifts this uncertainty into explicit, narrow human-approved suppressions instead of lowering the threshold.
- Mutation operators do not model all faults: transaction isolation, missing grants, ownership, concurrency and RLS require the separate PostgreSQL fault-injection matrix.
- The current A1 harness proves one appointment boundary, two roles and two organizations. Expanding it to full CRUD across sensitive boundaries may take longer than the original 2–4 day estimate.
- The 32 sensitive zero-coverage files are not equal in complexity. Provisioning and invite lifecycles may each consume several days; small pure adapters may take hours.
- A literal eight-minute merge wall time depends on GitHub runner scheduling, dependency-cache hit rate and PostgreSQL startup time. The proposed job budgets must be calibrated from at least 20 representative PR runs before being treated as stable.
- Same-commit A0 generation requires changing the current source-commit-based generator semantics. Merely adding the existing checker to CI would not satisfy the requirement because it presently allows a pending migration tail.