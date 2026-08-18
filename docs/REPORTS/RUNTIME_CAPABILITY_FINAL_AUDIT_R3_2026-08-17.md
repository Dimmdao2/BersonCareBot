# Runtime capability correction: final independent audit R3 (2026-08-17)

## Scope

- Candidate: `ff2c194454a5078ff081283f8f344b63b84b43a9`.
- Production correction parent: `be04488333a5cbd0123279af877c4670b63a7cf8`.
- Fresh clone: `/home/dev/dev-projects/bcb-wt-runtime-capability-audit-r3-20260817`, branch
  `wt/runtime-capability-audit-r3-20260817`.
- Authority: `AGENTS.md` §1/§5/§7/§9–§10b/§24, the six findings in
  `docs/REPORTS/RUNTIME_CAPABILITY_BLIND_AUDIT_2026-08-17.md`, and the bounded R3 brief.
- Audit only: no product fix and no database, DEV, TEST, PROD, deploy, migration, or reconcile command.

## Verdict

**PASS.** The candidate preserves closure of all six production findings, removes the stale historical PostgreSQL
oracle instead of repairing/replaying it, and replaces its eight consequences with the current atomic capability,
maintained gates, and an explicit rollback-only named-DEV step. The exact candidate passed all required static,
targeted, typecheck, lint, generator, B0, and raw-SQL gates. All temporary fault injections made the intended gate
red and were fully restored.

## Previous six findings

1. **Cross-organization / terminal queue conflicts — PASS.** The commit root retains `DO NOTHING`, exact
   organization/kind/channel/retryable/payload predicates, row locking, exact update counts, and fingerprint-side
   predicates. The boundary suite includes adversarial cross-org and terminal mutations.
2. **Complete delivery envelope — PASS.** Scalar, identity, event/generation, topic, retry, nested intent,
   provider-recipient, message, and channel-array validation remain in the current root; the boundary and producer
   tests are green.
3. **Reconcile exact count / rollback — PASS.** Candidate selection, exact before/after ID assertions, and update
   remain inside one Drizzle-port transaction; the targeted reconcile behavior test is green. The reconcile command
   itself was not run.
4. **Topic master switch — PASS.** `topicMasterEnabled=false` still resolves to zero delivery channels; the targeted
   resolver and worker behavior tests are green.
5. **Privilege census/catalog/generated artifacts — PASS.** The maintained suite reports `82/82`, the declaration
   supplement reports `2/2`, and all four generated artifacts are byte-identical.
6. **Application typechecks — PASS.** Both webapp and integrator typechecks exit `0`; the stale split-API test that
   caused the R2 failure is absent.

## Eight retired assertions: replacement audit

The mapping in `docs/REPORTS/PATIENT_REMINDER_MATERIALIZATION_B0_REPLACEMENT_2026-08-17.md` is truthful and does
not claim static checks as live PostgreSQL evidence:

1. Cross-tenant rejection is exercised by the named-DEV step (`42501`) and protected by the organization boundary
   gate.
2. Queue-side rollback is exercised by one valid delivery followed by an invalid envelope; the step requires
   `22023` and then proves the stable occurrence id/key absent twice.
3. Unavailable patient behavior is exercised against an unknown identity and must return `not_actionable`; current
   enrollment and patient-state predicates also have mutation gates.
4. Exact event/generation/recipient evidence and stale-delivery suppression are split correctly between the
   boundary gate and the worker behavior test.
5. Occurrence-key convergence is protected by conflict/lock/winner invariants; the named step reuses the stable
   id/key twice and rejects residue.
6. Snoozed-generation preservation remains an executable wake test.
7. The declaration gate requires the three current roots to be `SECURITY DEFINER` under the isolated owner.
8. The declaration and maintained privilege suites require the exact caller/direct-relation boundary; retired split
   roots and the fingerprint helper have no runtime execution path.

The deleted oracle depended on retired split functions, disabled RLS, raw SQL, historical migration files, and a
disposable `pbt_*` database. None of those paths is restored. Exact search of the candidate finds no
`patientReminderMaterialization.postgres.integration.test.ts`, no production dependency on a PostgreSQL integration
test, and the B0 gate reports only B0 plus current forward migrations.

## Named-DEV step safety

Inspection and the `4/4` self-test confirm:

- only canonical files under `/home/dev/dev-projects/BersonCareBot` are read, with symlinks refused;
- all four URLs must be PostgreSQL on `127.0.0.1:5432/bcb_webapp_dev` and both apps must use `port-context`;
- the command accepts exactly `--run --organization-id <uuid>`; the organization UUID must be supplied from an
  authenticated real-account context, while the step itself has no login or dev-bypass path;
- all database calls use `createPgPatientReminderMaterializationPort` under
  `runWithDbOrganizationPrincipal`; no raw SQL, migration runner, historical executor, disposable database, or RLS
  bypass exists;
- every mutating scenario is either rejected before write, returns `not_actionable` before write, or raises inside
  the atomic capability. The readback requires zero residue by both stable occurrence id and idempotency key.

## Commands and results

```bash
node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs \
  deploy/postgres/privileges/relation-access.test.mjs \
  deploy/postgres/privileges/reminder-materialization-boundary.test.mjs \
  deploy/postgres/privileges/function-census.test.mjs \
  deploy/postgres/privileges/port-context-catalog.test.mjs
```

Exit `0`: `82` passed, `0` failed.

```bash
node --experimental-strip-types --test \
  deploy/postgres/privileges/reminder-materialization-declaration.test.mjs
```

Exit `0`: `2` passed, `0` failed.

```bash
pnpm --dir apps/webapp run test:db-behavior:patient-reminder-materialization:named-dev:self-test
```

Exit `0`: `4` passed, `0` failed.

```bash
pnpm --dir apps/webapp exec vitest --run \
  src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts \
  src/infra/repos/pgPatientReminderMaterialization.unit.test.ts \
  src/modules/reminders/materializePatientReminderDeliveries.unit.test.ts \
  src/modules/patient-notifications/resolveNotificationChannels.unit.test.ts
```

Exit `0`: `4` files / `10` tests passed.

```bash
pnpm --dir apps/integrator exec vitest --run \
  src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts \
  src/infra/scripts/reconcile-dev-patient-reminder-orphans-core.test.ts \
  src/infra/adapters/webappEventsClient.materializeWake.test.ts
```

Exit `0`: `3` files / `16` tests passed.

After building the four referenced workspace packages, both commands exited `0`:

```bash
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/integrator run typecheck
```

`pnpm --dir apps/webapp run lint` exited `0`, including its raw-SQL, infra-boundary, transaction-quota, migration
layout/journal, and media-door sub-gates.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
node scripts/check-b0-migration-baseline.mjs
node scripts/check-no-new-raw-sql.mjs
```

All exit `0`: four generated artifacts byte-identical; `B0 + 19 webapp / 0 integrator` forward migrations and no
legacy chain; raw-SQL production debt `0`.

## Fault injection

Temporary working-tree mutations produced the required red results:

- changing the canonical database constant to `bersoncarebot_test` made the target-refusal self-test exit `1`;
- weakening UUID validation made the missing/invalid organization argument test exit `1`;
- disabling the occurrence id/key leak predicate made the leak-detection test exit `1`;
- making the second rollback delivery equal to the valid first event made the rollback-trigger construction test
  exit `1`.

The existing boundary suite also executes its cross-org, terminal, payload, recipient, source, occurrence-conflict,
lock, blocked-patient, and inactive-enrollment mutations. After restoration, `git diff --exit-code` returned `0`
before this report was added.
