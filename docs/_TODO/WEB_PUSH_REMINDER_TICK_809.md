# #809 — Web Push reminder tick: patient-policy conflict

Status: Opus + Sol plan review completed; source implementation may resume. Live TEST tick and cron follow only
after audited integration.

Taskdb: `#809` — `WebPush reminder tick: починить TEST job и установить cron`.

## Owner authority and supersession

Latest direct owner authorization, 2026-07-30:

> «#809 — не работает WebPush reminder tick;»
>
> «вот это напоминаю - можно делать. ты встал. Я тебе перезапускаю цель»

The PostgreSQL policy targeting is an engineering decision, not an owner product fork. The active owner ruling in
`SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` says the number and shape of PostgreSQL roles must follow established
engineering practice and should not be returned to the owner as a database-design question.

The DB/RLS test freeze in `TEST_SUITE_AUDIT_2026-07-29.md` remains active. This task does not create a new DB test
framework, a `*.postgres.integration.test.ts`, or shared-DEV proof. It extends the existing private C4 shell smoke
on its disposable `/tmp` PostgreSQL cluster. PROD remains completely outside scope.

Authority package:

- this checklist — exact #809 source/live scope;
- `SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md` — C4 runtime role, readiness and TEST cron contour;
- `deploy/HOST_DEPLOY_README.md` + `ARCHITECTURE/SERVER CONVENTIONS.md` — TEST deployment/runtime facts;
- `TEST_SUITE_AUDIT_2026-07-29.md` + `.cursor/rules/test-execution-policy.md` — behavioral-test boundary;
- PostgreSQL `CREATE POLICY`, row-security and role-membership documentation — policy role targeting and
  least-privilege basis.

## Confirmed failure

The dedicated `app_operational_web_push_reminder` role can read `content_sections` and `content_pages`, but the
patient catalog policies were targeted at `PUBLIC`. PostgreSQL therefore also evaluated the patient policy for the
operational role and attempted its `org_enrollments` subquery. That role intentionally has no
`org_enrollments` access, so the tick failed with PostgreSQL `42501` before tenant fanout.

## Scope

- Restrict only the patient policies on `content_sections` and `content_pages` to `app_patient` in the repeatable
  post-P2 overlay.
- Keep the Web Push operational role without `org_enrollments` access.
- Extend the existing private C4 PostgreSQL smoke to reproduce the old `42501`, apply the fixed overlay, and prove
  both operational catalog reads succeed without the forbidden grant **and** the patient role still reads the
  permitted rows.
- Extend C4 runtime readiness with the same catalog-read contract, including the real pre-fanout read without
  `app.org` and a fail-if-succeeds direct `org_enrollments` probe.

Outside scope: applied migration history, reminder business logic, DEV/TEST data, live tick, cron installation,
deploy, env/credentials, and PROD.

## Execution checklist

- [x] **809-P1 — Patient-only catalog policies.** `content_sections` and `content_pages` policies explicitly target
  `app_patient`; no `org_enrollments` privilege is added to the operational role. Evidence:
  `deploy/postgres/patient-visible-catalog-rls.sql`; the disposable proof asserts the operational role still receives
  SQLSTATE `42501` on a direct enrollment read.
- [x] **809-P2 — PostgreSQL regression proof.** The existing private C4 smoke reproduces the old
  `SQLSTATE 42501`, then proves: operational `content_sections` read before tenant context; both operational catalog
  reads after tenant context; direct `org_enrollments` remains denied; `app_patient` with an active enrollment still
  reads permitted visible/published rows from both catalog tables. The oracle is SQL outcome/SQLSTATE, not SQL text
  or localized stderr. Fault injection `TO app_patient → PUBLIC` must fail the operational-read assertion. Evidence:
  `pnpm run smoke:c4-web-push-reminder-runtime` PASS; isolated temporary fault injection
  `TO app_patient → TO PUBLIC` failed the pre-fanout assertion with SQLSTATE `42501`.
- [x] **809-P3 — Runtime readiness.** The Web Push operational-login probe reads both catalog tables under its
  selected organization, reads `content_sections` before `app.org`, and fails if direct `org_enrollments` becomes
  readable, so either policy-composition regression or privilege widening blocks readiness. Evidence:
  `deploy/host/assert-c4-operational-runtime-ready.sh`; `bash -n` PASS. Live TEST readiness remains `809-P5`.
- [x] **809-P4 — Narrow validation and source handoff.** Shell syntax, the private C4 PostgreSQL smoke,
  `git diff --check`, independent implementation/security audit, commit and source-branch push pass. The historical
  source-text checker `check:saas-c4-scheduler-media-cron-fanout` is **N/A / SUPERSEDED** by commit `c5b061696`,
  which deliberately removed it under `#1074`; it must not be restored or treated as a gate. Completed before source
  commit `de619246e6e73f634e0148cd4073f6566aae8ed9`: shell syntax PASS, disposable behavioral smoke PASS, SQLSTATE
  fault injection PASS, `git diff --check` PASS; source branch push PASS. Independent implementation/security audit
  PASS: exact five-path scope, no privilege widening, direct operational `org_enrollments` remains denied, old
  `42501`, fixed operational reads, positive patient reads and fault injection are behaviorally proven. Before
  integration, full CI on the combined current-feat tree ran through
  `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"`: lint, typecheck, integrator/webapp/media-worker tests,
  integrator build and webapp build PASS. The final repository audit stopped only on the pre-existing
  `p0-5-role-split.sql` generated-artifact drift; the same narrow
  `node scripts/check-saas-db-regression.mjs` failure reproduces on current `feat` without #809. Do not repeat the
  green CI tail; resume only the audit after the separately owned generated artifact is synchronized.
- [ ] **809-P5 — Live TEST completion.** After integration: use the canonical TEST deploy/readiness path, run the
  named TEST tick and verify its exact operator-health success; only after that install/verify the named TEST
  cronport task and confirm the next scheduled success. No manual `psql`, no fresh reset inferred from missing
  evidence, no PROD.
  First canonical code-only deploy on 2026-07-31 failed closed before restart: the reviewed
  `patient-visible-catalog-rls.sql` overlay ran before `test-strict-rls-finalizer.sql`, whose generated base-policy
  pass replaced it, so C4 readiness reproduced `permission denied for table org_enrollments`. The TEST closure-order
  fix includes that existing reviewed overlay from the finalizer itself; it does not add a grant or change the
  Web Push role.

## Definition of Done for this source package

`809-P1` through `809-P4` are closed with evidence in this file. `809-P5` stays open because this package must not
mutate TEST, install cron, deploy, or touch PROD.
