# Runtime capability closure: independent blind audit (2026-08-17)

## Scope and authority

Candidate: `f1ee17feaffd2e19c74671726dd7d0c8bbd8e984`.

This is a gate against the owner goal recorded in
`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`: named DEV continues forward from B0, runtime database access is
only through the webapp/integrator Drizzle ports, generic tenant relation fallback and disposable database replay
do not return. The concrete defect boundary comes from
`docs/REPORTS/PATIENT_REMINDER_MATERIALIZER_500_FORENSIC_2026-08-17.md`.

The forensic report is newer than the candidate base, so it was read from the integration checkout at
`/home/dev/dev-projects/BersonCareBot/docs/REPORTS/PATIENT_REMINDER_MATERIALIZER_500_FORENSIC_2026-08-17.md`;
the candidate itself is based on `11f854141` and does not contain that report yet.

The audit does not touch DEV, TEST, or PROD and does not modify product code. One-time declarations/artifacts are
checked by inspection and targeted generators. Repeatable security/atomicity behavior is checked with the blind
fault set below. Any acceptance tests added by this audit are evidence only, not a product fix.

## Blind kill-set (recorded before reading candidate implementation or tests)

1. A generic `tenant_service` descriptor or direct Drizzle relation query can satisfy the reminder wake instead
   of exactly three named runtime roots.
2. The commit root accepts a rule, user, enrollment, or recipient outside the asserted organization, or a stale /
   disabled enrollment.
3. One malformed delivery envelope, duplicate/conflicting queue row, or injected failure after an earlier queue
   row leaves any occurrence, fingerprint, queue row, or queued marker committed.
4. Queue dedup overwrites a terminal (`sent`/`dead`) row or a row belonging to another organization.
5. A delivery is queued without an exact matching fingerprint, or the occurrence is marked queued before every
   requested delivery and fingerprint succeeds.
6. Old split occurrence/mark roots or the fingerprint helper retain runtime `EXECUTE`, or fingerprint insertion is
   callable as an external runtime root.
7. The materialization snapshot returns orphaned rules, cross-organization rows, or linked data outside the
   selected organization.
8. The delivery-target snapshot loses the canonical topic/channel preference, mute, provider availability, or
   master enable/disable gate and therefore queues through a disabled channel.
9. Capability-declaration wrapping collapses `app.auth_rate_limit_check_and_record` to SELECT-only; removing either
   DELETE or INSERT does not make the acceptance gate red.
10. The orphan-rule reconciliation can target a generic database, TEST, or PROD; writes without explicit
    confirmation; omits exact organization/rule IDs/missing-platform-user/enabled predicates; or writes after a
    count mismatch.
11. Reconciliation bypasses the application Drizzle port with raw SQL.
12. Descriptor identity, function return type, owner, `search_path`, runtime grant, DEV artifact, or TEST artifact
    drifts from the exact declaration without a red gate.
13. B0 journal/gate accepts a restored historical/disposable path, or the correction depends on
    `*.postgres.integration.test.ts`.

## Result

**FAIL.** The candidate closes the generic capability gap and renders the three exact roots, but it does not meet
the atomic conflict, topic master-gate, or reconcile fail-closed requirements. It also leaves existing privilege
census gates and the integrator typecheck red.

## Findings

### MUST FIX 1 — a queue conflict can overwrite another organization or mutate a terminal delivery

Reachable scenario: `public.outgoing_delivery_queue` already contains the stable event ID for a pending/retryable
row owned by another organization (or a same-organization terminal row left by the old split path), while the
canonical occurrence is still `planned`. In `app.commit_patient_reminder_materialization`,
`ON CONFLICT (event_id) DO UPDATE` is conditioned only on the old status. It rewrites `organization_id`, channel,
payload and retry state of a cross-org pending/retryable row. For a matching `sent`/`dead` row the upsert does
nothing, but the later fingerprint update uses only `event_id`, changes that terminal row's payload, and then
allows the occurrence to be marked queued.

Impact: cross-tenant queue ownership can be reassigned, or immutable terminal delivery evidence can be changed;
the requested conflict no longer raises, so the function commits instead of rolling the entire materialization
back. This violates kill-set items 3–5 and the owner requirement that dedup must not overwrite terminal or
cross-org rows.

The new `reminder-materialization-boundary.test.mjs` still passes because it searches SQL source text rather than
executing the conflict behavior. Under `AGENTS.md` §10a/§24.4 it is not evidence for PostgreSQL atomicity.

### MUST FIX 2 — the commit root does not validate the complete delivery envelope

The root checks organization, occurrence, generation, patient, topic, kind, channel, event ID, intent type/event
ID, attempt count, and schedule. It does not reject a missing/invalid `externalId`, `logText`,
`intent.meta.occurredAt`, source/capability metadata, or malformed/mismatched provider payload/recipient. Such an
application regression is accepted and persisted as ready work; the worker fails later, after the occurrence has
already been marked queued.

Impact: malformed delivery work is durably queued and the occurrence leaves `planned`, so a reminder can be lost
instead of the all-or-nothing function rolling back. This violates kill-set item 3 and the explicit requirement to
validate every delivery envelope.

### MUST FIX 3 — orphan reconcile can commit a partial update on count mismatch

The script pre-reads two candidates, performs the update in `db.tx(...)`, returns from the transaction (commit),
and only then checks `updated.length`. A concurrent state change between the read and update can therefore update
one rule, commit it, and subsequently throw `reconcile_atomic_update_expected_2_updated_1`.

Impact: the supposedly fail-closed one-time repair can leave half of its exact pair changed. The required
"count mismatch no writes" invariant is false. The count/ID assertion must be inside the same transaction before
commit and must validate the exact returned ID set. This violates kill-set item 10.

### MUST FIX 4 — a disabled topic master switch still queues every available channel

The snapshot correctly returns `topicMasterEnabled`, and the wake passes it to
`resolvePatientNotificationChannels`, but that resolver checks only `muted`; it never acts on
`topicMasterEnabled=false`.

The audit added one behavior-level acceptance test. On the untouched candidate it fails with:

```text
expected [ 'web_push', 'telegram', 'max' ] to deeply equal []
```

Impact: a patient who switched off the reminder topic still receives reminders. This violates kill-set item 8.

### MUST FIX 5 — existing privilege census/catalog gates are red after adding the roots

The targeted existing suite reports `27 pass / 5 fail`. The failures are stale closed-set counts and generated
surface totals (`82 != 78`, `385 != 382`, census `232/487` instead of `229/470`, verifier marker mismatch, and
capabilities `213 != 210`).

Impact: the DB access contract cannot pass its maintained gate, so the candidate cannot be integrated as a green
privilege-layer change. This is a concrete build/test regression, not a style finding.

### MUST FIX 6 — exact candidate integrator typecheck is red

`pnpm --dir apps/integrator run typecheck` exits 2 with three errors in
`src/infra/adapters/webappEventsClient.materializeWake.test.ts` (tuple `[]` indexed at line 37 and `headers` on
`never` at line 41). `git diff f1ee17fe^^ f1ee17fe^` shows that file came from parent merge `11f854141`, not this
candidate's own diff, but it is still present on the exact candidate SHA and blocks the required app typecheck.

## Kill-set disposition

1. **PASS** — declaration inspection measured exactly 3 matching webapp capabilities; generic
   `tenant_service` is absent; the repository implementation contains only `runWebappNamedRoot`, with no direct
   Drizzle relation query.
2. **PASS** — the SQL roots bind organization context and validate rule organization/user, enabled rule, active
   enrollment, live unmerged patient, and integrator identity.
3. **FAIL** — conflict paths described in MUST FIX 1 commit instead of rolling back; malformed envelope behavior is
   described in MUST FIX 2.
4. **FAIL** — cross-org retryable rows and terminal rows are mutable as described in MUST FIX 1.
5. **PASS by inspection** for sequencing: fingerprints are computed after all queue upserts and the occurrence is
   marked after all fingerprint writes. This does not cure the conflict predicates in MUST FIX 1.
6. **PASS** — declaration has `execute: []`, `invocation: internal` for both old split roots and the fingerprint;
   both generated target artifacts contain no runtime `GRANT EXECUTE` for them.
7. **PASS** — the rule snapshot filters to context organization, enabled non-orphan rules; due rows join the same
   organization/rule/user; linked content is current-org or global only.
8. **FAIL** — channel/topic/provider/mute fields are preserved, but the master topic gate is ignored at selection
   time (MUST FIX 4).
9. **PASS with fault injection** — deleting canonical DELETE makes declaration import fail with the exact missing
   DELETE error; deleting canonical INSERT makes `relation-access.test.mjs` red on the missing INSERT gap. Current
   DEV/TEST generated grants contain table SELECT+DELETE plus column-scoped INSERT.
10. **FAIL** — dry-run, exact DB name/org/two IDs/enabled/orphan predicates are present, but the post-commit count
    check permits a partial write (MUST FIX 3).
11. **PASS** — reconcile uses `createDbPort`, organization principal, Drizzle session, and a port transaction; no
    raw SQL is present.
12. **PASS for the rendered candidate state** — all three roots have exact owner, return, search path and runtime
    role in both DEV/TEST artifacts, and `generate-cli --check` is byte-identical. The wider maintained census gate
    is nevertheless red (MUST FIX 5).
13. **PASS** — B0 gate reports only B0 + 19 webapp forwards + 0 integrator forwards, no alternate executor; changed
    production/runtime paths do not import or depend on `*.postgres.integration.test.ts`.

## Commands and measured results

```bash
node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs \
  deploy/postgres/privileges/relation-access.test.mjs \
  deploy/postgres/privileges/reminder-materialization-boundary.test.mjs
```

`48 pass / 0 fail`. The callsite oracle's own fault cases red on 8 classes: identity, missing descriptor, wrong
descriptor, added/moved/removed/extra/cross-port callsite.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
```

`4/4` checked artifacts byte-identical (DEV privileges + allowlist, TEST privileges + allowlist).

```bash
node scripts/check-b0-migration-baseline.mjs
node scripts/check-no-new-raw-sql.mjs
```

B0 gate: `B0 roots + 19 webapp and 0 integrator forward migrations; no legacy chain`. Raw-SQL gate: production
debt `0` (reported harness/low-level/migration allowlisted counts unchanged).

```bash
node --test deploy/postgres/privileges/function-census.test.mjs \
  deploy/postgres/privileges/port-context-catalog.test.mjs
```

`27 pass / 5 fail` (MUST FIX 5).

```bash
pnpm --dir apps/webapp exec vitest --run \
  src/infra/repos/pgPatientReminderMaterialization.unit.test.ts \
  src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts
pnpm --dir apps/webapp run typecheck
```

Targeted webapp tests: `2 files / 3 tests pass`; webapp typecheck exit `0`.

```bash
pnpm --dir apps/webapp exec vitest --run \
  src/modules/patient-notifications/resolveNotificationChannels.audit.unit.test.ts
```

`1 file / 1 test fail` on the untouched candidate (MUST FIX 4).

```bash
pnpm --dir apps/integrator run typecheck
```

Exit `2`, three TypeScript errors (MUST FIX 6).

No database, server, DEV, TEST, or PROD command was executed.
