# SaaS enforce roadmap — TEST-first enforced walls and fresh-product launch (v0.4)

> **Canonical owner path (2026-07-15).** This document is the canonical plan for product parity and enforced tenant
> isolation on TEST, followed by a fresh new-product deployment. The old `bersoncare` production is LEGACY and
> frozen: it is never cut over. The archived
> [`Tenant Hard Mode draft`](../../_ARCHIVE/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md) is not executable;
> its unique scope remains in the reconciliation register near the end of this file.

---

## 0. FINAL RESULT (fixed definition of done)

**R1 — TEST product parity and multi-org readiness.** On TEST, create as many organizations and test clients as are
needed; exercise every role, clinic admin capability, settings flow, and the doctor/client routes. Product smoke
must detect 401/403/5xx, empty-result regressions, Server Action errors, and new application errors; a health
endpoint alone is not evidence. UI, route infrastructure, the landing page, and separate specialist/client entry
flows are part of the product work still required before launch. The investor-facing finish line also includes
payments, a store with several exercise packages, and a configured tariff grid; walls are foundation work, not a
substitute for those product surfaces.

**R2 — TEST enforced product parity plus isolation.** TEST runs with locked principal context and strict/FORCE RLS.
Multiple clinics and a shared/multi-clinic patient prove the staff-org and patient-own-data matrix. Legitimate
webapp, integrator API, worker, scheduler, media-worker, cron/internal-job, public booking, OTP, registration, and
settings paths work; missing or forged context fails closed. The canonical wall is documented at
`TENANT_WALLS_AND_ACCESS_MODEL.md:21-75,92-110`.

**R3 — NOT A REQUIREMENT on the current path (owner, 2026-07-15).** There is no `bersoncare` production cutover,
so an ON/OFF state machine and an OFF rollback lever solve no launch problem. Turning walls OFF in a live
multi-tenant SaaS can expose clinic A data to clinic B; it is unacceptable rollback insurance.

**R4 — NOT A REQUIREMENT on the current path (owner, 2026-07-15).** The dormant → ON → OFF → ON → OFF rehearsal
and PROD-mapped wrappers existed only to support a cutover of the frozen legacy product. The new `therapysto`/
`therapio` product is deployed as a fresh copy on a new domain, born with walls enforced.

**R5 — observability for enforced TEST work.** Missing-principal, signature, role-switch, RLS-denial, and pool
selection failures must be countable by unit/mode/path without PII or signing secrets, so the team can find and fix
what breaks under enforce on TEST. It is not a cutover-decision threshold or an OFF/rollback procedure.

### Overall acceptance commands for the current path

The owner-authorized TEST workflow is objectively centred on a fresh TEST deployment and locked-mode product proof;
it does not invoke an ON/OFF flip:

```bash
bash deploy/host/deploy-test-saas.sh feat/doctor-ui-rebuild
pnpm run smoke:saas-product -- \
  --mode=locked \
  --base-url=https://test.bersoncare.ru \
  --fixture-file=/run/bersoncarebot/saas-smoke.fixture
```

The product smoke and multi-org isolation matrix must pass before the fresh-copy launch. If the
operator-managed fixture is absent, product smoke is **SKIPPED/BLOCKED**, not PASS. The future new-domain deployment
is a fresh project-copy launch with enforced walls, never an old-production cutover.

### Historical note — superseded flip finish line

The former R3/R4 finish line required `flip-saas.sh --target test on|off`, automatic OFF after a failed ON, and a
dormant → ON → OFF → ON → OFF rehearsal. It is retained here as historical rationale only: it was designed to cut
over an existing production system. The owner rejected that path on 2026-07-15 because legacy `bersoncare` remains
frozen and an OFF lever in a live multi-tenant product would create a cross-clinic disclosure risk.

---

## 1. HISTORICAL STATE SNAPSHOT (2026-07-13; not a phase-status source)

This section preserves the technical observations that shaped the original phases. It is not a current-status
ledger: code, checker exit codes, committed artifacts, and admissible TEST evidence are reconciled in the
reality-derived table at `SAAS_ENFORCE_ROADMAP.md:709-729`. In particular, do not use an old “DONE” or
`TENANT_HARD_MODE_LOG.md` claim below to close B2/D3/D4/E1/E2/G1.

### DONE, with the actual proof boundary

- The canonical two-wall model exists: staff is org-scoped; patient is own-data-only; protected labels live in
  `app.principal_context` (`TENANT_WALLS_AND_ACCESS_MODEL.md:21-77,92-110`).
- Strict policy generation/artifact and the synthetic/live disposable-copy isolation rehearsal exist. The renderer
  asserts 163 policies and the S1/S2/S3/P2/P_SHARED matrix passing, but explicitly says this was not deployed to
  TEST/PROD (`HANDOFF_2026-07-12.md:9-25`). Treat that as DB/rehearsal evidence, not application acceptance.
- The central runtime carrier is already implemented. `packages/db-principal/src/index.ts:361-419` applies/clears
  principal context; locked mode does `RESET ROLE` then `SET ROLE` at `:510-549`; missing context throws in locked
  and only warns in shadow at `:515-527`. Therefore the old claim “no role-switch wiring” was false.
- Webapp still exposes a single pool provider: `apps/webapp/src/infra/db/client.ts:1-30` builds one Drizzle port and
  `webappPoolProvider.ts:1-52` supplies one pool. This is insufficient for the two-login topology below.
- Protected context is real: signed install/release helpers and membership-based `app.is_staff()` are defined in
  `deploy/postgres/p2-b-protected-principal-context.sql:147-349`; runtime HMAC installation is at
  `packages/db-principal/src/index.ts:565-620`.
- TASK A’s two PII hybrid tables are implemented and statically/RLS-smoke verified; FB#2 and the ORG-session FB#1
  path are proven. The bootstrap-session FB#1 path remains explicitly unproven
  (`TASK_A_PII_TIGHTEN_PLAN.md:93-116`). Do not describe all of TASK A as fully closed.
- The doctor/admin data-fix is not merely a migration prerequisite: it converts known `platform_users.role=admin`
  row `b0021a38` to doctor and creates a replacement admin
  (`deploy/postgres/p0-data-fix-doctor-admin-split.sql:288-318`). Dormant deployment ordering—data-fix before migrate,
  temporary migrator BYPASSRLS, guaranteed revoke—is codified in `deploy/host/deploy-test-saas.sh` and
  `scripts/deploy-saas-667.sh`; `SAAS_DEPLOY_SEQUENCE.md:1-50` records a fresh-copy migration/health proof.
- Dormant was safe for a narrower reason than “walls are asleep”: migrations already contained FORCE and patient
  policies failed closed without context; the former owner/BYPASSRLS runtime bypassed them. This warning is
  explicit in `DORMANT_DEPLOY_TEST_RUNBOOK.md:15-21`. Historical flip artifacts therefore could not assume FORCE
  was wholly absent; this is evidence context, not a current flip requirement.
- The historical FORCE cutover artifact has useful preflight assertions: bootstrap base must be NOBYPASSRLS and
  not a staff member, and owner privilege is checked (`phase4-force-rls-cutover.sql:23-71`). It is retained as
  technical evidence only, not as a required ON/OFF orchestrator on the current path.
- Server Action failures were diagnosed as missing `X-Forwarded-Host` in TEST nginx, but the draft supplies no
  repository line proving the host-only edit. Until config-as-code and a regression check exist, this is an
  observed fact, not DONE.

### OPEN GAPS

- **G1 — dormant product correctness.** The known migrated doctor can have active doctor membership while the
  session’s platform role remains admin; doctor workspace routes then deny or resolve incorrectly. The guard
  separately checks session role and active membership (`requireRole.ts:153-181,195-243`). Determine whether the
  deployed data-fix was skipped/partial or session resolution is stale; do not preselect a code fix.
- **G2 — TEST nginx/config-as-code.** Persist and assert `X-Forwarded-Host $host` in the effective `location /`, and
  make deploy validation fail when the header is absent.
- **G3 — locked pool topology.** Runtime role switching exists, but one webapp connection login cannot safely serve
  staff and bootstrap. A login that may `SET ROLE app_staff` must be a member; `app.is_staff()` uses transitive
  membership (`p2-b-protected-principal-context.sql:314-324`), so after bootstrap `RESET ROLE` it is still staff.
  `NOINHERIT` does not change `pg_has_role(...,'MEMBER')` (the SQL explicitly guards transitive membership in
  `p0-5b-role-split-staff-patient.sql:116-130`).
- **G4 — principal fanout outside webapp.** Integrator API, delivery worker, scheduler, media-worker, and internal
  jobs are separate processes/entrypoints and must be proven under locked mode. Canon requires explicit bootstrap,
  integrator, organization, or narrowly justified infra principals (`TENANT_WALLS_AND_ACCESS_MODEL.md:98-110`).
  A webapp-only pass cannot meet R2.
- **G5 — FB#1 bootstrap write.** Strict+FORCE close/insert over a pre-existing phone-history row is not proven from
  the real bootstrap pool topology (`TASK_A_PII_TIGHTEN_PLAN.md:100-116`).
- **G6 — #664 value enforcement.** Complete and independently prove `WITH CHECK` value enforcement and restore the
  two deferred patient columns named by its canonical task/spec. Presence of a policy is not proof that inserted
  org/patient values cannot be spoofed.
- **G7 — complete enforce feature coverage.** No drive-the-app proof yet covers legitimate reads and writes across
  doctor/admin/patient/public surfaces, S3/media presign/upload/playback, queues, notifications in send-safe mode,
  booking, OTP, specialist registration, and background units.
- **G8 — signing secret lifecycle.** `DB_PRINCIPAL_SIGNING_SECRET` is mandatory in shadow/locked
  (`db-principal/index.ts:330-359`), but generation, distribution to every signing process, rotation, file
  permissions, redaction, and rollback are not a completed deployment contract. It is bootstrap infrastructure,
  not an integration setting; never print it or store it in the repo.
- **G9 — shadow observability/B7.** Shadow currently emits a plain `console.warn` for missing context
  (`db-principal/index.ts:515-523`). There is no durable per-unit counter/structured event, route/job attribution,
  threshold, or zero-gap report. A shadow period cannot be accepted from absence of noticed logs.
- **Historical G10 — atomic one-command ON/OFF and backout/B8.** This former cutover requirement is not current:
  legacy `bersoncare` is frozen, and the fresh product copy launches with walls already enforced.
- **G11 — product smoke.** Current deployment proof ends at migration count/health and manual browsing
  (`SAAS_DEPLOY_SEQUENCE.md:37-49`; `DORMANT_DEPLOY_TEST_RUNBOOK.md:40-42`). It did not expose a repeatable
  authenticated R1/R2 oracle.
- **Historical G12 — OFF recovery/version symmetry. NOT REQUIRED on the current path.** This former F1/F2
  requirement covered a legacy-production cutover and dormant recovery. The fresh product deployment is born
  enforced and must fail closed or be restored/redeployed as an enforced version; it must never recover by
  disabling tenant walls. The FORCE/NO FORCE SQL branches remain historical artifacts, not launch acceptance.

---

## 2. PHASES (each is one focused agent pass)

Tiers: **mini** = Sonnet/mechanical bounded change; **daily** = gpt-5.5 implementation/diagnosis; **deep** =
gpt-5.6-sol only for security architecture. Each phase is audited independently by a different agent/model. No
phase may claim exit from unit tests alone when its criterion requires a disposable DB or running application.

### Phase A1 — Product-smoke contract and fixtures · tier: daily · audit: mini

Scope: define deterministic, non-PII fixture IDs/accounts and a headless HTTP/browser harness for doctor, admin,
and patient. Separate read-only smoke from controlled mutation scenarios so reruns are idempotent. The runner may
retain legacy mode parsing for artifact compatibility, but the current acceptance evidence is locked TEST work.

- [ ] Specify route/API/state matrix: schedule, working hours, bookings, client card, analytics, content,
  broadcasts, patient appointments/program/media, admin settings/system health, public booking and Server Actions.
- [ ] Authenticate through the deployed environment’s supported test mechanism; never add prod auth bypass.
- [ ] Assert expected non-empty fixture facts, not only HTTP 200; capture response/request IDs and bounded unit logs.
- [ ] Fail on 401/403/5xx, Next render digest, permission/RLS errors, unexpected empty fixture results, or leaked PII.
- [ ] Add `--mode dormant|shadow|locked` and machine-readable JUnit/JSON summary.

Exit: against the current TEST configuration, one command exits non-zero for a deliberately broken calibration
fixture; self-tests prove each failure classifier. No DB mutation outside disposable smoke fixtures.

### Phase A2 — nginx config-as-code and smoke integration · tier: mini · audit: daily

- [ ] Put the exact TEST/PROD nginx template/source under version control with `proxy_set_header X-Forwarded-Host
  $host` in the effective `location /`; validate with `nginx -T` in deploy preflight.
- [ ] Add a Server Action request to A1 that fails if forwarded host handling regresses.
- [ ] Invoke A1 as the final TEST deploy gate only after services are ready; preserve logs on failure.

Exit: template/static check and a disposable deployed Server Action smoke both exit 0; deleting the header in a
test fixture makes the check fail.

### Phase B1 — diagnose and repair doctor/admin dormant identity · tier: daily · audit: deep

- [ ] On a disposable fresh copy, query only IDs/roles/counts needed to distinguish: data-fix not run, partial fix,
  stale session payload, wrong membership selection, or guard semantics.
- [ ] Make the smallest correct fix in data-fix/deploy or identity resolution; retain admin-mode semantics and
  multi-membership selection.
- [ ] Add regression coverage for platform role versus membership role and the known migration shape.

Exit: an executable assertion reports the intended doctor/admin rows and memberships, and A1’s doctor/admin subset
is green with expected non-empty facts after a from-zero dormant deploy.

### Phase B2 — former dormant product-parity gate · superseded / NOT REQUIRED on the current path

> **Why this phase is not required.** Its only exit was a twice-run **dormant** deployment proof before a later
> walls-ON transition. The owner path is TEST-first with walls already enforced, followed only after TEST readiness
> by a separate fresh product copy on a new domain (`SEQUENCE.md:4-19`; the attributable source is also collected in
> `OWNER_DECISIONS_FOR_REVIEW.md:84-101`). A second dormant baseline neither proves the enforced product nor moves
> that path forward. Existing live wall evidence is taskdb #725/#734/#735; it is not reclassified here as B2 PASS.

**Historical checklist — superseded; retain for provenance, do not execute.**

- Formerly: run the A1 matrix in dormant mode, fix dormant regressions, and repeat it after a restart of a
  fresh-copy deployment.
- Former exit: a twice-green `smoke-saas-product.sh --mode dormant` with non-empty fixture facts.

The required enforced product evidence now belongs to D3 (reads), D4 (writes), E2 (all-unit workload), and G1
(owner-facing TEST acceptance). Do not revive B2 as a prerequisite for a TEST wall transition.

### Phase C0 — locked topology ADR and executable role proof · tier: deep · audit: deep

**Decision: use two runtime login roles and two pools, not a SECURITY DEFINER role-switch bridge.**

Topology:

1. `app_runtime_staff_login LOGIN NOINHERIT NOBYPASSRLS` is a member only of `app_staff`; staff/organization
   principals check out the staff pool and locked runtime executes `SET ROLE app_staff`.
2. `app_runtime_nonstaff_login LOGIN NOINHERIT NOBYPASSRLS` is a member only of `app_patient`; patient/integrator
   principals execute `SET ROLE app_patient`; bootstrap checks out this same pool and remains the base login after
   `RESET ROLE`, so `app.is_staff()` is false. Grant the base login direct least-privilege DML only for genuine
   bootstrap tables/functions, including the FB#1 surface.
3. Pool selection happens before checkout from the ALS principal: staff/organization → staff pool;
   patient/integrator/bootstrap → nonstaff pool. Missing/infra principal in locked mode is rejected unless an
   entrypoint has an explicitly reviewed, separate operational pool. Never give a request pool BYPASSRLS.
4. Owner/migrator stays NOLOGIN/maintenance-only as designed by `p0-5-role-split.sql:337-412`; it is never an app
   `DATABASE_URL`.

Required SQL assertions:

```sql
SELECT NOT rolbypassrls FROM pg_roles
 WHERE rolname IN ('app_runtime_staff_login','app_runtime_nonstaff_login');
SELECT pg_has_role('app_runtime_staff_login','app_staff','MEMBER')
   AND NOT pg_has_role('app_runtime_staff_login','app_patient','MEMBER');
SELECT pg_has_role('app_runtime_nonstaff_login','app_patient','MEMBER')
   AND NOT pg_has_role('app_runtime_nonstaff_login','app_staff','MEMBER');
```

Also assert each login cannot `SET ROLE` to the other wall/owner/migrator, nonstaff `app.is_staff()=false` after
`RESET ROLE`, staff `app.is_staff()=true` only on the staff connection, and bootstrap DML is exactly allowlisted.
Do not use a SECURITY DEFINER helper to evade membership: PostgreSQL role switching is membership-governed, and a
definer function that makes session authorization mutable would enlarge the privilege boundary and undermine the
existing `pg_has_role` wall.

Exit: ADR plus disposable-DB executable proof exits 0 for the positive and negative assertions. No app code yet.

### Phase C1 — webapp dual-pool fanout · tier: deep · audit: deep

- [ ] Extend the pool provider/composition root to build staff and nonstaff pools without exposing raw pools to
  modules; select by normalized ALS principal before `connect()`.
- [ ] Make bootstrap explicit at every public/pre-auth entrypoint. Missing and `infra` fail closed in locked mode.
- [ ] On release, always release protected context and `RESET ROLE`; poison/destroy the client if cleanup fails.
- [ ] Bound both pool sizes so the combined connection budget is safe; expose pool/role mismatch metrics.
- [ ] Add tests for concurrent staff/patient/bootstrap requests, connection reuse, exceptions, and cross-request
  context leakage.

Exit: an app-level principal smoke proves backend role, helper identity, cleanup, and concurrent separation under
the declared TEST configuration; locked product evidence remains D3. Static
`smoke-b4-locked-runtime-principal.mjs` is supplemental.

### Phase C2 — secrets and deployment plumbing · tier: daily · audit: daily

- [ ] Generate one high-entropy signing key per environment outside the repo; install via root-managed env/credential
  files with least-readable permissions. Never print it in commands/logs.
- [ ] Supply the same active key only to processes that install signed context; document the DB helper boundary
  without putting key material in the repository.
- [ ] Add presence/equality-by-fingerprint (not value) preflight, redaction tests, and a controlled restart proof
  for the currently enforced TEST configuration.
- [ ] Do not create dual-key overlap, an OFF credential path, or a maintenance-window flip procedure. The recorded
  2026-07-13 decision is one active key with a brief coordinated restart if replacement is needed
  (`OWNER_DECISIONS_FOR_REVIEW.md:74-78`); the 2026-07-15 path does not turn that into an old-product cutover.
- [ ] Provision the two login credentials/URLs without embedding passwords in scripts or docs.

Exit: a disposable environment secret audit exits 0; context installation succeeds from every signing unit in the
declared enforced configuration; logs/config dumps contain neither secret nor credential-bearing URL.

### Phase C3 — integrator API and delivery worker fanout · tier: deep · audit: deep

- [ ] Inventory every integrator API/worker entrypoint and map bootstrap/integrator/organization principal before DB
  checkout; split pools where both staff-like organization and nonstaff principals occur.
- [ ] Prove Telegram/MAX/webhook/public-booking projections in send-safe mode; no real delivery or real S3.
- [ ] Reject unclassified jobs/events in locked mode and attribute the rejection safely.

Exit: controlled queued fixtures are consumed once under strict roles, expected DB effects appear in the correct
org, cross-org/blank-context fixtures are denied, and no outbound delivery occurs.

### Phase C4 — scheduler, media-worker, cron/internal-job fanout · tier: deep · audit: deep

- [ ] Map each scheduler/media/cron job to organization or a separately reviewed infra operation; batch jobs must
  partition by org rather than acquire ambient global visibility.
- [ ] Prove media claim/transcode metadata flow and webapp S3 presign/upload/playback authorization under locked
  context using fake/local object storage; verify cross-org object keys cannot be presigned.
- [ ] Give any unavoidable infra pool its own NOLOGIN/login contract, narrow grants, call-site allowlist, and audit
  record; never silently reuse owner/BYPASSRLS.

Exit: scheduler tick, media claim/complete, internal cron fixtures, and presign allow/deny matrix exit 0 under FORCE;
missing-org jobs fail closed and are visible in metrics.

### Phase D1 — #664 WITH CHECK and deferred columns · tier: daily · audit: deep

- [ ] Read #664’s canonical task/spec, enumerate the exact two columns and all affected descriptors/write paths;
  do not infer them from this roadmap.
- [ ] Implement same-row value enforcement for staff org and patient ownership on INSERT/UPDATE, regenerate strict
  artifacts, restore/backfill the two columns with dormant compatibility.
- [ ] Add positive and malicious cross-org/cross-patient INSERT/UPDATE proofs.

Exit: named #664 checker plus real strict+FORCE SQL smoke exits 0; malicious writes fail and legitimate legacy,
staff, patient, and bootstrap writes succeed as specified.

### Phase D2 — FB#1 bootstrap phone-write closure · tier: deep · audit: deep

- [ ] Grant `app_runtime_nonstaff_login` the minimal direct bootstrap DML/function surface chosen in C0 and add it
  to the enforced-deployment preflight.
- [ ] Exercise real OTP/contact/phone-history close+insert over pre-existing NULL and org-stamped rows through the
  application repository path, not only handcrafted SQL.
- [ ] Prove nonstaff bootstrap cannot read/write unrelated org PII and staff cannot see bootstrap NULL PII.

Exit: FB#1 application smoke and PII isolation negatives exit 0 under strict+FORCE with the target locked topology.

### Phase D3 — TEST enforced read coverage · tier: daily · audit: deep

> **Required in changed form; currently BLOCKED.** Enforced reads on TEST are a direct R2 requirement. They are not
> a pre-cutover rehearsal. The last admissible smoke progression is 4/17 → 13/17 → 16/17; no 17/17 artifact exists
> (`SAAS_R0_PLAN_RECONCILIATION.md:161-193`). The remaining visible discussion-summary failure is not evidence that
> walls are wrong: `app_patient` cannot read the mixed `system_settings` table. Phase 5 in `SEQUENCE.md:72-80`
> deliberately leaves that symptom visible pending the owner's settings-root decision.

- [ ] **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА — prerequisite.** Record the approved split between secrets and
  client-readable settings, including its ownership/read boundary. Do not solve it with a per-flag accessor
  whitelist and do not grant `app_patient` SELECT on the mixed `system_settings` table; those are rejected
  directions in `SEQUENCE.md:72-80` and `OWNER_DECISIONS_FOR_REVIEW.md:129-137`.
- [ ] After that decision is implemented, add a bounded regression for
  `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.ts:29-35`:
  the patient can read the approved client setting and cannot read a secret or another patient’s discussion.
  Evidence: the targeted test and a locked TEST smoke result, both redacted of fixture data.
- [ ] Confirm an owner/operator-managed product smoke fixture file path is supplied. The value stays outside
  repo/logs. Before any TEST smoke, if the fixture is absent, record
  **SKIPPED/BLOCKED** and stop before claiming D3/R1/R2 evidence. This is enforced by
  `docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-product-smoke-contract.mjs:41-90`.

If the fixture is absent, record
  **SKIPPED/BLOCKED** and stop before claiming D3/R1/R2 evidence.

`SAAS_PRODUCT_SMOKE_FIXTURE` unset is a documented blocker,
not a successful D3 exit.
- [ ] Run every read scenario in
  `docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json` under the already-enforced TEST configuration for
  doctor, clinic-admin, patient, and public entry points. Assert scenario-specific non-empty fixture facts, not
  HTTP success alone; retain a redacted JSON/JUnit result.
- [ ] For every denied or unexpectedly empty result, record the real principal, selected pool/role, helper context,
  policy, and scoped parent. A fix is accepted only with the corresponding scenario and an A/B negative read.
- [ ] Prove the shared-patient matrix: each clinic sees only its own scoped data, while the shared patient's
  self-data remains self-only. Evidence: the S1/S2/P2/P_SHARED negative assertions and taskdb-compatible
  redacted result, never PII.

Exit: after the Phase-5 settings decision and implementation, the locked TEST read matrix is 17/17 with expected
non-empty facts; S1/S2/P2/P_SHARED cross-tenant negatives are zero; the fixture is operator-managed; and the
discussion-summary regression is green. A static checker, a 16/17 run, or an absent fixture is not a D3 exit.

### Phase D4 — TEST enforced write coverage · tier: daily · audit: deep

> **Required in changed form.** A fresh product born with walls still needs legitimate writes under those walls;
> this replaces the former transition validation. No write-matrix artifact exists yet
> (`SAAS_R0_PLAN_RECONCILIATION.md:621-626`), so the phase is not started.

- [ ] Build the machine-readable scenario inventory from the actual A1 contract and the executable routes/actions:
  booking, working hours, treatment/program content, messages/comments, registration/OTP, patient actions, and
  media upload/presign. For each scenario record route/action, actor, ownership source, expected before/after fact,
  cleanup method, and cross-tenant negative. Evidence: versioned contract plus the test that consumes it.
- [ ] Drive the inventory only against owner-authorized TEST fixtures with send-safe integrations and non-production
  object storage. Re-runs must be idempotent or clean their own fixture records; no production DB, real delivery,
  or production bucket is in scope.
- [ ] Assert server-derived organization/patient ownership on every create/update/delete; a payload-supplied tenant
  identifier is rejected or ignored by the authorized server path. Evidence: before/after assertions plus one
  malicious cross-tenant attempt per feature family.
- [ ] Keep settings writes out of this matrix until the Phase-5 settings-root decision is implemented. When it is,
  prove the approved client-settings boundary and the required `public`/`integrator` mirror identity through the
  normal settings service; do not introduce a direct table write or a new integration env variable
  (`.cursor/rules/system-settings-integrator-mirror.mdc:1-24`).
- [ ] Do not create, alter, or use `be_organizations` as a D4 fixture path. Its three ownership/provisioning
  questions remain explicitly blocked for the owner (`OWNER_DECISIONS_FOR_REVIEW.md:121-128`).
- [ ] Split D4 into named feature-family passes if the inventory cannot be audited in one pass. Every pass retains
  the same machine-readable evidence; no family is waived.

Exit: every approved inventory scenario has a passing TEST before/after assertion and fixture cleanup proof; every
feature family has a failed cross-tenant mutation negative; settings writes are either proven through the approved
Phase-5 design or explicitly absent; and no external production channel was reached.

### Phase E1 — structured enforced-TEST observability · tier: daily · audit: deep

> **Required in changed form.** R5 still requires countable failures to make the enforced TEST system diagnosable;
> it is not a threshold for turning walls ON/OFF (`SAAS_ENFORCE_ROADMAP.md:35-37`). No structured-counter/report
> artifact exists, so the phase remains not started (`SAAS_R0_PLAN_RECONCILIATION.md:625-626`).

- [ ] Replace bare warnings with redacted structured events/counters: unit, active enforcement mode, principal kind,
  entrypoint class, route/job template, reason, role/pool mismatch, and correlation ID. Never emit patient/org IDs,
  fixture values, signatures, or credential material. Evidence: schema/type definition and redaction tests.
- [ ] Cover missing principal; signing install/release failure; cleanup failure; RLS denial; and unclassified
  background operation. Evidence: one deterministic fault-injection test per event class and a report that changes
  by the expected aggregate count.
- [ ] Provide one repository report command that consumes only redacted aggregate events and prints totals plus an
  explicit, versioned allowlist of explained events. Unknown event classes make the command fail.
- [ ] Define the workload boundary by scenario IDs and unit list, not elapsed soak time or a cutover decision
  threshold. The owner-recorded acceptance is one full product smoke plus representative background workload with
  zero **unexplained** events (`OWNER_DECISIONS_FOR_REVIEW.md:74-78`).

Exit: every fault injection increments its expected counter and makes the report fail; a clean, declared TEST
workload yields a redacted zero-unexplained report; redaction tests pass. This exit never authorizes a wall-mode
change or an OFF recovery.

### Phase E2 — all-unit enforced TEST workload (B7 evidence) · tier: daily · audit: deep

> **Required in changed form.** The useful part of B7 is one complete, measurable workload through all units, not
> a shadow-to-enforced transition. It follows D3, D4, and E1 and therefore cannot start while D3 is blocked by
> Phase 5. The owner-recorded decision requires one full product smoke plus representative background workload,
> not a multi-day soak (`OWNER_DECISIONS_FOR_REVIEW.md:74-78`).

- [ ] With the enforced TEST configuration already active, run the full locked product-read smoke and the approved
  controlled background workload. Attach the exact scenario IDs, unit list, commit, and redacted aggregate report
  to the run evidence.
- [ ] Cover webapp, integrator API, worker, scheduler, media worker, cron/internal jobs, signup, OTP, booking, and
  media paths. Send-safe fixtures must prove queue/job handling without real notification delivery or production
  object storage.
- [ ] Confirm each unit loads the active signing configuration and clears principal state on normal and exceptional
  paths. Evidence: E1 counters, targeted fault tests, and the workload report; do not create a mode switch or
  observe an OFF fallback.
- [ ] Investigate every unexplained event to a bounded feature/unit fix, then repeat the same declared workload.
  Do not reset an observation window or substitute “no one noticed errors” for the report.

Exit: one declared all-unit enforced TEST workload has a green 17/17 product-read result where applicable,
expected send-safe background effects, and E1's zero-unexplained redacted report. This is evidence for TEST
readiness only; it neither runs nor designs a legacy-production cutover.

### Phase F1 — B8 flip state machine and OFF/backout · tier: deep · audit: deep

> **NOT REQUIRED on the current path (owner, 2026-07-15).** There is no legacy-production cutover; an OFF lever
> would risk exposing clinic A data to clinic B in a live multi-tenant SaaS (`SEQUENCE.md:83-88`).

**Historical checklist — superseded; retain for provenance, do not execute.**

- Formerly: define dormant/transitioning/enforced/OFF states, state manifests, writer quiescence, and automatic OFF
  recovery after an enforced-mode failure.
- Former exit: fault-injected proof of every ON/OFF transition.

No F1 exit exists on the current path. A failure of the enforced TEST or future fresh-product copy is diagnosed and
repaired/redeployed as an enforced version; it is never recovered by disabling tenant walls.

### Phase F2 — one-command wrappers and full TEST rehearsal (R3/R4) · tier: daily · audit: deep

> **NOT REQUIRED on the current path (owner, 2026-07-15).** The one-command ON/OFF rehearsal only served the
> legacy-production cutover that the owner is not performing (`SEQUENCE.md:83-88`).

**Historical checklist — superseded; retain for provenance, do not execute.**

- Formerly: implement `flip-saas.sh --target test on|off`, an ordered ON/OFF dependency wrapper, and idempotent
  transition self-checks.
- Former exit: dormant → ON → OFF → ON → OFF from a fresh copy and automatic return to dormant.

The current launch proof is the enforced TEST matrix in D3/D4/E2/G1, followed only by an owner-controlled fresh
new-domain copy. Neither an ON command nor an OFF command is a roadmap deliverable.

### Phase G1 — owner-facing TEST acceptance · tier: daily · audit: deep

> **REQUIRED and more important on the current path.** TEST is the sanctioned live working environment: prove
> enforced walls while exercising multiple organizations, test clients, all roles, admins, settings, landing, and
> specialist/client entry flows (`SEQUENCE.md:4-19`). This is TEST acceptance, not a switch of legacy production.

- [ ] Use the existing approved TEST organizations and test clients; drive each documented role/session through the
  two-clinic isolation matrix, clinic-admin capability, patient self-data boundary, settings flows, landing page,
  specialist entry, and client entry. Evidence: redacted run record plus screenshots only where they prove UI
  state. **Do not create, alter, or otherwise touch `be_organizations`**; its ownership questions are blocked for
  owner decision (`OWNER_DECISIONS_FOR_REVIEW.md:121-128`).
- [ ] Require the actual automated evidence, not a health endpoint or manual impression: D3 locked reads 17/17,
  D4 approved write matrix, E1 redacted counter/report tests, and E2 all-unit enforced workload must all be green.
  Owner observation may add findings but cannot override a red or blocked gate.
- [ ] Exercise TEST integrations only through approved send-safe redirects/mocks. Evidence confirms no production
  relay, credentials, DB, or bucket was used and no live external message was sent.
- [ ] Record every failure found, its owner path/principal, the bounded repair evidence, and the final rerun. Keep
  fixture values, cookies, response bodies, and PII out of repository artifacts.
- [ ] Before declaring the future fresh copy investor-ready, bind the owner-stated product requirements — interface,
  payment, store with exercise packages, and tariff grid — to their own approved checklists and TEST evidence.
  The requirement is documented in `SEQUENCE.md:8-14` and `OWNER_DECISIONS_FOR_REVIEW.md:88-96`; this walls
  roadmap does not invent their UX or billing details. Missing detail is **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА** before a
  product checklist claims it is complete.

Exit: all automated TEST walls/product gates above are green; the owner records acceptance of the redacted
multi-org test run; and the required investor-facing product surfaces have approved, evidence-backed TEST
checklists. This phase produces no production mapping, no migration/cutover command, and no domain copy itself.

### Phase G2 — PROD mapping, rollback drill, holistic audit · tier: deep · audit: deep

> **NOT REQUIRED on the current path (owner, 2026-07-15).** No `bersoncare` PROD mapping, rollback drill, or
> cutover command will be built (`SEQUENCE.md:15-19`). The future product starts as a fresh new-domain copy with
> walls already enforced.

**Historical checklist — superseded; retain for provenance, do not execute.**

- Formerly: map TEST to legacy PROD, rehearse an exact production wrapper, automatic OFF recovery, and old-code
  compatibility.
- Formerly: issue a SHIP/NO-SHIP cutover decision based on a maintenance-window threshold and hand an operator ON
  and OFF commands.

No G2 exit exists on the current path. The later new-domain project-copy launch is a separate owner action after
G1; it must be born enforced and never includes a `bersoncare` rollback drill or wall-mode transition.

---

## 3. Execution rules

- One active phase above is one focused pass. D3/D4 must be subdivided by the orchestrator if the discovered failure
  set cannot be fixed and verified honestly in one pass; never collapse C1-C4 into a mega-pass. F1/F2/G2 are
  explicitly not required on the current path.
- Before each phase, read its canonical task/docs and locate code through the repository index. Record load-bearing
  evidence as `file:line`; rerun line references after edits.
- Every phase receives an independent adversarial audit against executable evidence. Green mocks/static checks do
  not substitute for required disposable-DB/application proofs.
- Scratch/disposable environments are the default. TEST work is allowed only in an explicitly owner-authorized
  phase; no phase thereby gains access to legacy prod/dev DBs, prod env, real notification delivery, real object
  storage, credentials, or PII output.
- `accepted` is owner-only. No commit/push is implied by this roadmap-hardening pass.

## 4. Resolved architecture decision and remaining owner decisions

Resolved for implementation: **dual NOBYPASSRLS login roles + dual pools selected by principal before checkout**.
This is the smallest topology consistent with both `SET ROLE app_staff` and bootstrap `app.is_staff()=false` after
`RESET ROLE`. Separate process pools may use the same two logical credentials, but each process must expose only the
principal classes it actually needs. A third narrowly granted operational pool is permitted only after C4 documents
an unavoidable cross-org job; owner/BYPASSRLS is forbidden for normal runtime.

Disposition of the questions recorded in the earlier roadmap pass:

- **resolved below:** #664 task/columns, TEST smoke authentication, shadow acceptance, and signing-key rotation;
- **still open:** which genuinely global scheduler/cron operations, if any, justify a separately audited infra
  pool;
- **deferred to the separate owner-controlled new-domain launch:** its project-copy operational procedure, after
  G1's TEST gates and product checklists are complete. It is not a `bersoncare` cutover, an ON/OFF design, or a
  maintenance-window decision threshold in this roadmap.

---

## Hardening pass 1 (Sol) — findings

### Corrected

- Replaced the false claim that locked-mode principal/role wiring does not exist: the ALS principal carrier,
  signed context, locked `RESET ROLE`/`SET ROLE`, and fail-closed behavior are implemented; the missing part is safe
  pool/login fanout and deployment proof.
- Narrowed “TASK A done”: strict PII policy and ORG-session FB#1 are proven, while bootstrap-session FB#1 remains
  open by its own checklist.
- Corrected dormant semantics: FORCE/fail-closed policies already occur in the migration chain; current parity relies
  on the owner/BYPASSRLS runtime path, not universally dormant policy text.
- Reclassified fresh-copy migration + `/api/health` as deploy-chain evidence, not R1 product evidence.
- Framed doctor/admin mismatch as a diagnosis between data-fix execution, session identity, membership selection,
  and guard semantics rather than assuming one fix.

### Added gaps

- All-unit principal/role coverage (integrator API, delivery worker, scheduler, media-worker, cron/internal jobs).
- Media/S3 presign/upload/playback cross-org proof, #664 malicious-value proofs, and controlled real write coverage.
- Signing-key generation/distribution/rotation/redaction and dual-login credential management.
- Structured fail-closed/shadow observability and a B7 objective report remain current. B8 state machine, writer
  quiescence, automatic OFF rollback, and recovery symmetry were cutover-only findings and are now historical.
- Authenticated non-empty product smoke and explicit isolation/background-job smokes remain R1/R2 gates; their
  former R3 cutover use is historical.

### Split phases and why

- A → A1 harness + A2 nginx/deploy: product oracle and proxy persistence are independently verifiable.
- B → identity repair + broader dormant closure: prevents one known account bug from masking unrelated failures.
- C → ADR/role proof, webapp dual pool, secret plumbing, integrator/worker, scheduler/media/cron: original B4 fanout
  crossed security architecture, multiple runtimes, operations, and media and could not fit one pass.
- D → #664, FB#1, enforce reads, enforce writes: original phase combined schema/policy design with every product path.
- E → observability and B7 shadow: enforce failures must be measurable before TEST acceptance.
- G1 → owner-facing TEST acceptance: TEST evidence precedes a fresh product-copy launch. F1/F2/G2 remain historical
  cutover phases, not current requirements.

### Phase-C topology recommendation

Use `app_runtime_staff_login`→`app_staff` and `app_runtime_nonstaff_login`→`app_patient`, both LOGIN NOINHERIT
NOBYPASSRLS, with no cross-membership and two pools selected from the normalized principal before checkout.
Bootstrap uses the nonstaff base role after `RESET ROLE` plus a direct minimal bootstrap DML/function allowlist.
`NOINHERIT` alone cannot solve the tension because `app.is_staff()` asks transitive role membership. Do not add a
SECURITY DEFINER `SET ROLE` escape hatch and do not use owner/BYPASSRLS as a runtime pool.

### Still uncertain / needs lead or owner

- The #664 source task and exact two patient columns were not named in the v0.1 draft; execution must bind to the
  canonical task before D1.
- The host-only nginx change and current TEST account symptoms are reports, not reproducible repository evidence
  until A2/B1 run on an authorized disposable deployment.
- The correct split of organization versus integrator principals inside each background process needs entrypoint
  inventory in C3/C4; this pass deliberately does not grant an ambient infra role.
- Taskdb could not be updated in this environment because `SECONDBRAIN_DB_URL` is absent; no raw SQL fallback was
  used.

---

## Historical finalization v0.3 (2026-07-13) — retained technical decisions, superseded finish line

This was the authoritative layer before the owner's 2026-07-15 path correction. Section 0 now overrides it where
they differ: there is no legacy-production cutover, no OFF requirement, and no instruction to restart execution at
A1 without re-deriving current phase status. The compatible technical decisions below remain evidence. Scratch or
disposable environments remain the implementation default; live TEST work requires owner authorization, and any
future fresh-product deployment is a separate owner action rather than authorization to cut over `bersoncare`.

### Owner decisions (2026-07-13, retained where compatible with the current path)
- **Smoke login (override A1):** on TEST the product smoke authenticates as the owner's **real seeded TEST doctor +
  TEST patient/user accounts** (TEST is a production-like build with send-safety restrictions on broadcasts). The
  dev/test auth-bypass is **dev:turbo-only and MUST NOT be used on TEST**. Store TEST smoke credentials in a
  root-managed secret file (never in repo/logs); reuse the owner's existing live TEST accounts.
- **All-unit acceptance (historically labelled “shadow”, override E2/B7):** ONE full product-smoke pass plus a
  representative background workload with **zero unexplained fail-closed/missing-context events**. No multi-day
  soak is required for TEST. On the current path E2 collects that evidence under already-enforced TEST walls, not
  as a shadow-to-enforced transition.
- **Signing-key replacement (override C2/G8):** NO zero-downtime rotation and no dual-key overlap. A replacement
  uses one coordinated restart of the active enforced environment, with least-permission file storage, fingerprint
  preflight, and redaction (`OWNER_DECISIONS_FOR_REVIEW.md:74-78`). This retained technical decision is **not** a
  legacy-production cutover step, a wall-mode change, or a maintenance-window gate.

### #664 is DONE — D1 becomes RE-VERIFY, not implement
taskdb #664 = done+sealed (commit `02936c257`). The two re-added patient columns are named:
**`user_channel_preferences.is_preferred_for_auth`** (patient OTP-channel preference) and
**`public.treatment_program_events.actor_id`** (patient progress). D1 scope → independently RE-VERIFY the WITH CHECK
value-enforcement + these two columns against reality (malicious cross-org/cross-patient write must fail; legit
writes pass); only implement if re-verification finds a real gap. Do NOT re-derive the columns.

### Review pass 2 (Claude) — historical artifact analysis retained
- **Finding 1 & 2 ("policies read GUC channel; locked runtime writes signed-helper channel; never meet; blocks R2")
  = REFUTED.** In the historical rehearsal, the strict policy artifact replaced the policy set.
  `deploy/postgres/phase4-locked-helper-rls-policies.sql` contains
  **322 `app.current_org_id()/current_patient_user_id()` calls and 0 `current_setting('app.org')`**, and DROPs all
  163 policies **by the same names the migrations created** (e.g. `saas_org_dormant_p0_8_3` on `org_enrollments` in
  both 0167 and the artifact), re-creating them helper-based. The full prod-copy rehearsal applied this artifact +
  FORCE and the S1/S2/S3/P2/P_SHARED isolation matrix PASSED. So under enforce the policies read exactly the signed
  channel locked mode populates. **No "re-point every policy to the helper channel" phase is needed** — the reviewer
  analyzed only the dormant/migration policies and missed the rehearsal-time policy replacement. This technical
  conclusion does not reinstate the superseded flip finish line.
- **Finding 5 ("fail-open on empty context") = REFUTED for enforce.** The strict `\if :phase4_enforce_locked_context`
  branch is `(is_staff() AND org-match) OR (patient owns)` with NO empty-context permit → **fail-closed**. The
  permissive empty-context branch exists only in the dormant-compat `\else` branch (correct for dormant).
- **Kept refinements, with current scope boundaries:**
  - **C0/D2 grant surface (Finding 3, real):** retain the requirement to inventory the genuine OTP/pre-auth
    bootstrap surface and its direct least-privilege grants before proving it. The historical registration portion
    named `be_organizations/be_specialists/be_organization_members/specialist_signup_intents` is **BLOCKED —
    ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА**; do not add grants, fixtures, or implementation for it in this roadmap
    (`OWNER_DECISIONS_FOR_REVIEW.md:121-128`). The permitted inventory must remain explicit and be asserted by
    preflight rather than inferred from an ambient staff role.
  - **Context TTL (Finding 6, real):** add an exit criterion that a request/transaction holding a pooled client
    longer than the signed-context TTL (default 30s, cap 300s) does not silently lose context → either re-stamp
    per statement or bound long handlers; the enforce read/write smokes (D3/D4) must include a >30s path.
  - **§1 framing (Finding 8, real):** dormant safety is `0177_phase4_no_force_rls_compat.sql` (NO FORCE on every
    table) + owner runtime; the historical enforce artifact re-applied FORCE through
    `phase4-force-rls-cutover.sql`. State technical evidence against that baseline without turning it into a current
    ON/OFF requirement.
  - **Integrator (Finding 7):** confirm during C3 that integrator (mapped to `app_patient`) has the grants its write
    paths need and that its policies (helper-based `current_integrator_user_id()`) resolve under locked context.

### Historical execution-start note
The pre-R1 instruction was to begin at A1 and proceed in order. It is superseded: the orchestrator must use the
reality-derived phase table below and must not redo completed artifact work from scratch. No implementation pass
touches a live DB or delivery channel without explicit owner authorization. Authorized TEST work does not authorize
a legacy-production cutover; a later fresh-product deployment is a distinct owner-controlled launch.

---

## R0 plan reconciliation register (2026-07-15)

The archived `docs/_ARCHIVE/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md` is not discarded. This is an
exhaustive crosswalk for its load-bearing §5, §6.1, §7, H0–H8 and O1–O13 scope. A row may say “covered” rather than
“draft-only”; keeping it here is intentional evidence that the scope was checked instead of silently omitted.

| Archived scope | Draft pointer | Current roadmap relationship / retained requirement |
|---|---|---|
| DB role granularity beyond the built `app_staff`/`app_patient` pair | O1 | Open owner-facing question. The current roadmap continues with the built/live-proven topology until a later decision changes it; app-layer clinic capability does not settle DB-role granularity. |
| `super-org` is a reserved platform namespace, never a tenant wildcard | §5.1, O2 | Retained design constraint for future platform scope: cross-tenant access needs a distinct platform role, signed platform context, dedicated port, allowlisted reason, and immutable audit. |
| Platform admin clinic scope is a separate tenant run | §5.2, O3 | Retained. Explicit org selection starts a new tenant-scoped principal; platform scope cannot flow through clinic repositories or `adminMode`. |
| Global versus org-scoped `system_settings` writes | §5.2, §6.1 class E | Retained exactly: `organization_id IS NULL` global defaults are written only from audited platform scope through `updateSetting`; clinic scope writes only the selected org override, preserving the `public`/`integrator` mirror identity and global fallback. |
| Reserved `platform_support` extension | §5.3, O13 | Not in the first rollout. Future support uses dedicated platform-support ports, masked-by-default contact views, reasoned reveal/audit, and no tenant-repository bypass or provisioning/global-settings/billing mutation. |
| Break-glass | §5.4, O12 | Deferred to a separate owner-approved ADR/runbook with short TTL, reason, dual approval, and audit; owner/migrator credentials are never the mechanism. |
| H0 exhaustive census, machine-readable descriptor, entrypoint matrix, and eight table classes | §6.1, H0 | Retained future workstream: every DB surface maps to owner path, principals/verbs, rollout state, and one of direct-tenant, scoped-parent, enrollment/self, true-global, global-default+org-override, queue/infra, telemetry/operator, or legacy/unclassified. No `unknown global`. |
| H0 method-level Store mechanic matrix and entitlement ordering | H0 work/checklist, §14.1–§14.2 | Retained: map `mechanic → entrypoint/method/action → auth guard → principal → entitlement → service`; directory-level guesses are insufficient, and tenant resolution precedes `requireEntitlement`. |
| Broadcast queue ownership, claim/execution separation, recipient validity, and leases | §7, H1-A, O6/O7 | Roadmap C3/C4/D4 require background proof but not this full design. Retain immutable non-null job org, INSERT-only writers, narrow worker claim, per-job org principal, recipient revalidation, lease-token-only completion/retry, and per-org batch execution. |
| Media NULL-row ownership and complete media path | H1-B, O5 | Roadmap C4/D3/D4 cover behavior; the owner decision remains: backfill legacy rows to an owning org or classify genuine platform media separately. Never make NULL visible to every clinic. List/tree/upload/multipart/job inheritance remain one wall. |
| Typed principal, protected signed session, cleanup, and shadow governance across every process family | H2 | C0–C4/E1 cover much of it. Retain H2's stricter all-checkout contract, narrowing-only nested runs, connection poisoning on cleanup failure, named-source static gates, and PII-free violation counters. |
| Reproducible P0 RLS/grants on fresh restore with ownership cleanup and rollback artifact | H3 | Current migration/proof phases partially cover this. Retain zero unexplained NULL/orphan/foreign-parent rows, real-role A/B proofs, post-migrate checks, and rollback that preserves tenant data/ownership columns. |
| Clinic-domain rollout choreography and capability order | H4 | D3/D4/G1 do not replace the domain gate: `auth → workspace → principal → entitlement → service`, ownership never from payload, doctor and clinic-admin capabilities tested separately, then shadow/backfill/constraint/enforce. Schedule-setting clinic writes stay tenant-scoped while true global Rubitime/read-source settings stay platform-scoped. |
| Multi-org patient enrollment and org derivation | H5, O8 | R2/D3 require shared-patient proof; retain resource-derived org, explicit enrollment selection only for truly org-agnostic surfaces, no first/default fallback, and self+active-enrollment protection for global identity/channel reads. |
| Public booking and webhook/M2M tenant source | H6, O9 | R2 requires the paths, while H6 uniquely requires exact-one org from trusted **host/link/profile/branch/service**, separate caller-signature and tenant derivation, payload-org denial, narrow bootstrap resolution access, and mixed-org batches split into per-org runs. |
| Rubitime legacy quarantine timing/default-org fallback | H6, O10 | Retained as an explicit isolation exception until canonical org source and quarantine package are owner-approved. It is not a reason to revive the legacy-production cutover. |
| References/catalog ownership and uniqueness | H7, O4 | Still open: true global, per-org, or global-base+org-overlay. Unique keys, seed/backfill, NULL precedence, and A/B policies must follow the chosen ownership model. |
| Analytics org attribution | H7 | Retain deterministic org-at-ingest, multi-enrollment rule, org-dimensional rollups, unknown bucket, clinic-only projection, and separately audited platform aggregate port. |
| Shadow acceptance threshold | O11 | Superseded framing: retain only the measurable evidence rule — one full product smoke plus representative all-unit workload with zero unexplained violations (`OWNER_DECISIONS_FOR_REVIEW.md:74-78`). E2 runs this against already-enforced TEST; it is not a shadow soak or a threshold for a wall-mode transition. |
| H8 full cutover/cleanup package | H8 | The production-cutover portion is historical and not required. Reusable parts remain: all process families on NOBYPASSRLS roles, no unclassified enforced scope, legacy helper removal only after runtime proof, TEST acceptance, and one appropriate final integration gate. |

The archived objection to a global FORCE flip remains relevant to TEST validation: E2/R5 must find failures under
enforce. F1/F2/G2 are not requirements because the owner will not cut over the frozen legacy production.

## R0 roadmap phase status table (reality-derived, 2026-07-15)

States are deliberately conservative. `TENANT_HARD_MODE_LOG.md` is treated as a claim source only; evidence below
comes from committed/repo artifacts and checker results, and live TEST/PROD/dev DB proof is not claimed by this R0
stage.

Live proof that the enforced walls work exists outside repository artifacts: taskdb #725 records the 2026-07-13
FORCE-RLS test cutover and two-clinic denial proof; #734 records the clinic-admin capability proof; #735 records
200 interleaved requests with zero cross-org leaks. This evidence does not turn every individual phase below into
PASS, and the final D3 17/17 smoke remains absent.

| Phase | State | Evidence used | Missing for roadmap exit |
|---|---|---|---|
| A1 | repo-artifact-only | `SAAS_PRODUCT_SMOKE_A1.md`; `pnpm run check:saas-product-smoke-contract` | Owner-managed live fixture/base URL and deployed smoke proving non-empty product facts. |
| A2 | repo-artifact-only | `deploy/nginx/test-webapp.conf`; `pnpm run check:saas-a2-nginx-forwarded-host` | Effective `nginx -T`/Server Action proof on authorized deployed environment. |
| B1 | repo-artifact-only | `pnpm run check:saas-b1-doctor-admin-identity`; guard regression tests exist in webapp | Disposable fresh-copy diagnosis plus A1 doctor/admin subset green. |
| B2 | not-required-current-path | `SEQUENCE.md:4-19` fixes TEST-first enforced readiness and a later fresh new-domain copy; taskdb #725/#734/#735 are live wall evidence, not B2 proof. | The former twice-green dormant/restart gate served a later ON transition and is superseded. Do not run it or infer B2 PASS. |
| C0 | repo-artifact-only | `pnpm run check:saas-c0-locked-topology`; `pnpm run smoke:saas-c0-locked-topology` | Disposable DB executable proof in the actual target topology. |
| C1 | repo-artifact-only | `pnpm run check:saas-c1-webapp-dual-pool-fanout` | App-level shadow/locked smoke proving role/helper cleanup and concurrency. |
| C2 | repo-artifact-only | `pnpm run check:saas-c2-secrets-deployment-plumbing` | Real secret installation/fingerprint/redaction audit in disposable environment. |
| C3 | repo-artifact-only | `pnpm run check:saas-c3-integrator-fanout-inventory` | Controlled queued fixtures under strict roles with send-safe/no-delivery proof. |
| C4 | repo-artifact-only (checker not trusted as chain proof) | Inventory/checker artifacts exist, but `check:saas-c4-scheduler-media-cron-fanout` is bypassable: an org principal may wrap a no-op while real DB/S3 work runs after infra-principal restoration and the checker still exits 0. | Owner decision on checker repair; then strict+FORCE scheduler/media/internal cron fixtures, fake/local object storage proof, and infra pool/grants decision. |
| D1 | repo-artifact-only | `pnpm run check:saas-d1-664-with-check-reverify` | Owner-authorized strict+FORCE/live re-verification if required by the phase gate. |
| D2 | repo-artifact-only | `pnpm run check:saas-d2-fb1-bootstrap-phone-write` | Production-topology strict+FORCE application smoke for FB#1 and isolation negatives. |
| D3 | blocked | `check:saas-product-smoke-contract` and `check:saas-d3-4-bootstrap-base-login-grants` exit 0 as static/repo checks; progression is 4/17 → 13/17 → 16/17, without a final 17/17 artifact. `SEQUENCE.md:72-80` records the visible discussion-summary block on mixed `system_settings`. | Owner decision and implementation for the settings-root split, then an operator-managed locked TEST read matrix with expected non-empty facts and 17/17; do not infer PASS from log prose or static checks. |
| D4 | not-started | No machine-readable enforced write matrix or TEST before/after artifacts found in this pass. | Approved controlled write matrix, fixture cleanup/idempotency proof, and cross-tenant mutation negatives; settings writes wait for Phase 5 and `be_organizations` remains out of scope. |
| E1 | not-started | No structured counter schema, report command, or redaction/fault-injection artifact found in this pass. | Enforced-TEST counters/report plus redaction and deterministic fault-injection tests. |
| E2 | not-started (depends on D3/D4/E1) | No all-unit enforced workload artifact found in this pass. | One declared all-unit TEST workload, locked product smoke, send-safe background proof, and E1 zero-unexplained report — not a shadow/ON-OFF run. |
| F1 | not-required-current-path | Explicit roadmap marker (owner, 2026-07-15) | No legacy-production cutover exists; an OFF lever would create a cross-clinic disclosure risk. |
| F2 | not-required-current-path | Explicit roadmap marker (owner, 2026-07-15) | No ON/OFF rehearsal is required for a fresh product-copy launch. |
| G1 | not-started | No redacted owner-facing multi-org TEST acceptance artifact found in this pass. | D3/D4/E1/E2 automated gates green, owner acceptance evidence, and approved evidence-backed checklists for the owner-stated investor-facing product surfaces; never a legacy-production mapping. |
| G2 | not-required-current-path | Explicit roadmap marker (owner, 2026-07-15) | No `bersoncare` PROD mapping or rollback drill: the new product starts on a new domain with walls enforced. |
