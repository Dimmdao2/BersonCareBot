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

## 1. CURRENT STATE (source-verified on branch `auto/code-pg-delta`, 2026-07-13)

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
and patient. Separate read-only dormant smoke from controlled mutation scenarios so reruns are idempotent.

- [ ] Specify route/API/state matrix: schedule, working hours, bookings, client card, analytics, content,
  broadcasts, patient appointments/program/media, admin settings/system health, public booking and Server Actions.
- [ ] Authenticate through the deployed environment’s supported test mechanism; never add prod auth bypass.
- [ ] Assert expected non-empty fixture facts, not only HTTP 200; capture response/request IDs and bounded unit logs.
- [ ] Fail on 401/403/5xx, Next render digest, permission/RLS errors, unexpected empty fixture results, or leaked PII.
- [ ] Add `--mode dormant|shadow|locked` and machine-readable JUnit/JSON summary.

Exit: against the current fresh-copy deployment, one command exits non-zero and identifies at least known G1 (a
calibration failure); self-tests prove each failure classifier. No DB mutation outside disposable smoke fixtures.

### Phase A2 — nginx config-as-code and smoke integration · tier: mini · audit: daily

- [ ] Put the exact TEST/PROD nginx template/source under version control with `proxy_set_header X-Forwarded-Host
  $host` in the effective `location /`; validate with `nginx -T` in deploy preflight.
- [ ] Add a Server Action request to A1 that fails if forwarded host handling regresses.
- [ ] Invoke A1 as the final dormant deploy gate only after services are ready; preserve logs on failure.

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

### Phase B2 — close remaining dormant product failures (R1) · tier: daily · audit: daily

- [ ] Run the entire A1 matrix; classify every failure independently rather than treating the nginx or G1 fix as a
  universal cause.
- [ ] Fix schedule/working-hours, bookings, analytics, content, broadcasts, patient and admin regressions found.
- [ ] Re-run from a fresh TEST copy of the approved source dump, not a patched long-lived database.

Exit: `smoke-saas-product.sh --mode dormant` exits 0 twice: immediately after fresh-copy deploy and after service
restart. Expected fixture facts are non-empty. This is R1, not owner acceptance alone.

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

Exit: an app-level shadow/locked principal smoke proves backend role, helper identity, cleanup, and concurrent
separation; A1 remains green in dormant and shadow. Static `smoke-b4-locked-runtime-principal.mjs` is supplemental.

### Phase C2 — secrets and deployment plumbing · tier: daily · audit: daily

- [ ] Generate one high-entropy signing key per environment outside the repo; install via root-managed env/credential
  files with least-readable permissions. Never print it in commands/logs.
- [ ] Supply the same active key only to processes that install signed context; document whether DB helper receives
  key material/config and implement overlap rotation if two keys are required during rolling restart.
- [ ] Add presence/equality-by-fingerprint (not value) preflight, redaction tests, restart ordering, and rollback to
  prior credential version.
- [ ] Provision the two login credentials/URLs without embedding passwords in scripts or docs.

Exit: a disposable environment secret audit exits 0; shadow context installation succeeds from every signing unit;
logs/config dumps contain neither secret nor credential-bearing URL.

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

### Phase D3 — webapp enforce read coverage · tier: daily · audit: deep

- [ ] Confirm an owner/operator-managed product smoke fixture file path is supplied. The fixture value is never
  stored in the repo or logs; only the path and command shape may be documented. If the fixture is absent, record
  **SKIPPED/BLOCKED** and stop before claiming D3/R1/R2 evidence.
- [ ] Run all A1 read scenarios under locked+FORCE for doctor/admin/patient/public surfaces.
- [ ] For every denied/empty path, trace the real principal, selected pool/role, helper context, policy, and parent
  ownership; fix one bounded feature slice per pass if failures exceed a single-pass budget.
- [ ] Preserve the canonical shared-patient behavior across two clinics.

Exit: full read matrix exits 0 with expected non-empty facts, using the supplied operator-managed fixture file;
explicit S1/S2/P2/P_SHARED negative reads remain zero. `SAAS_PRODUCT_SMOKE_FIXTURE` unset is a documented blocker,
not a successful D3 exit.

### Phase D4 — webapp enforce write coverage · tier: daily · audit: deep

- [ ] Drive controlled create/update/delete flows for booking, working hours, treatment/program content, messages,
  comments, registration, OTP, settings overrides, uploads/presign, and patient actions.
- [ ] Verify row values, org/patient ownership, idempotency and rollback; assert malicious tenant IDs are rejected.
- [ ] Split into D4a/D4b by feature family before execution if the inventory exceeds one agent’s context/test pass;
  the orchestrator must not waive any family.

Exit: machine-readable write matrix shows every scenario PASS with before/after assertions and cleanup; cross-tenant
mutations fail. No live external messages or production object writes.

### Phase E1 — structured shadow observability · tier: daily · audit: deep

- [ ] Replace bare warnings with redacted structured events/counters: unit, mode, principal kind, entrypoint class,
  route/job template, reason, role/pool mismatch, correlation ID; never patient/org IDs or signatures.
- [ ] Cover missing principal, signing/install/release failure, cleanup failure, RLS denial, and unclassified infra.
- [ ] Provide a report command with event totals and allowlisted known exceptions; define acceptance as zero
  unexplained events over the agreed workload/window.

Exit: fault injection produces each counter and report failure; clean fixture workload produces a zero-unexplained
report. Log redaction tests pass.

### Phase E2 — B7 shadow run across all units · tier: daily · audit: deep

- [ ] Run the full A1 and controlled background workload in shadow after fresh-copy dormant deploy.
- [ ] Include webapp, integrator API, worker, scheduler, media-worker, cron/internal jobs, signup, OTP, booking, and
  media paths; restart units mid-run to exercise pool cleanup/secret loading.
- [ ] Fix every unexplained missing-context or mismatch event, then restart the observation window.

Exit: the committed shadow report command exits 0 with zero unexplained events for the full workload and agreed
duration/count. This is B7; “no one noticed errors” is not acceptance.

### Phase F1 — B8 flip state machine and OFF/backout · tier: deep · audit: deep

> **NOT REQUIRED on the current path (owner, 2026-07-15).** There is no legacy-production cutover; an OFF lever
> would risk exposing clinic A data to clinic B in a live multi-tenant SaaS.

- [ ] Define explicit states `dormant`, `transitioning-on`, `enforced`, `transitioning-off`, `failed-rolled-back` and
  a lock preventing concurrent deploy/flip.
- [ ] Version a state manifest of expected roles, memberships, grants, helpers/policies, FORCE flags, credential
  fingerprints, runtime mode, unit set, and code/schema revision.
- [ ] ON preflight: clean revision/schema, shadow gate, backups, connection capacity, all units known, secrets ready,
  role negative asserts, product fixture available. Quiesce every writer before DB/runtime boundary changes.
- [ ] OFF: restore `legacy-guc` and dormant connection credentials, restart all units, neutralize FORCE/strict mode in
  the documented order, then product-smoke. Retain compatible roles/helpers unless an independently safe teardown
  is proven.
- [ ] Any failed ON postcheck automatically calls the same OFF implementation; preserve logs and return non-zero
  even if rollback succeeds.

Exit: static/self-tests plus fault-injected rehearsal prove every transition and automatic rollback branch.

### Phase F2 — one-command wrappers and full TEST rehearsal (R3/R4) · tier: daily · audit: deep

> **NOT REQUIRED on the current path (owner, 2026-07-15).** The one-command ON/OFF rehearsal only served the
> legacy-production cutover that the owner is not performing.

- [ ] Implement environment-allowlisted `flip-saas.sh --target test on|off`; PROD selection requires a separate
  explicit confirmation and remains owner-only.
- [ ] ON order is derived from proven SQL dependencies: writer stop/drain, roles/grants and protected helper setup,
  strict artifact, FORCE cutover/preflights, runtime credential/mode activation, ordered all-unit restart, product +
  isolation + background smokes. OFF uses F1’s inverse compatibility order.
- [ ] Make rerunning ON or OFF idempotent and self-verifying.

Exit: from a fresh copy, dormant → ON → OFF → ON → OFF all exit 0; injected post-ON failure automatically returns
to a green dormant app. Operator invokes exactly one command per transition.

### Phase G1 — owner-facing TEST acceptance · tier: daily · audit: deep

> **REQUIRED and more important on the current path.** TEST is the sanctioned live working environment: prove
> enforced walls while exercising multiple organizations, roles, settings, and the investor-facing product flows.

- [ ] Owner drives clinic #1 and self-registers clinic #2 under enforced walls; automated harness verifies the same
  facts and the patient matrix.
- [ ] Exercise real TEST integrations only through approved send-safe redirects/mocks; confirm no production relay,
  credentials, DB, or bucket is used.
- [ ] Record command outputs, screenshots where UI-relevant, the shadow report, and every TEST wall failure found
  and fixed.

Exit: automated R1/R2 TEST gates are green and owner records acceptance. Owner observation cannot override a red
automated gate.

### Phase G2 — PROD mapping, rollback drill, holistic audit · tier: deep · audit: deep

> **NOT REQUIRED on the current path (owner, 2026-07-15).** No `bersoncare` PROD mapping, rollback drill, or
> cutover command will be built: the new product launches as a fresh copy on a new domain with walls already
> enforced.

- [ ] Map TEST wrapper to exact canonical PROD paths/units without copying TEST credentials; reconcile with
  `scripts/deploy-saas-667.sh` and host conventions.
- [ ] Rehearse the exact PROD command against a disposable fresh production copy, including stopped writers,
  backup/restore timing, automatic OFF, and old-code/schema compatibility.
- [ ] Independent holistic audit traces browser/job → principal → pool/login → role → protected context → policy and
  verifies secret handling, observability, all-unit coverage, and rollback.
- [ ] Produce SHIP/NO-SHIP checklist and maintenance-window abort thresholds. Owner alone authorizes PROD.

Exit: disposable rehearsal and rollback drill exit 0, holistic audit says SHIP with no unresolved high findings,
and the owner has one exact ON command and one exact OFF command. The roadmap does not itself authorize either.

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
- **still open:** maintenance-window downtime and fail-closed restore/redeploy time budget for the fresh product.

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
- **Shadow acceptance (override E2/B7):** ONE full pass of the product smoke + a representative background workload
  with **zero unexplained fail-closed/missing-context events** = shadow PASS. No multi-day soak required for TEST.
- **Signing-key rotation (override C2/G8):** NO zero-downtime rotation. Generate/rotate the signing key in the
  **same maintenance window as the enforced fresh-copy deployment/restart** (a brief restart pause is acceptable).
  Drop the dual-key overlap requirement from C2; keep least-permission file storage + fingerprint preflight +
  redaction. This is not an ON/OFF flip instruction.

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
- **Kept as real refinements (fold into the phases below):**
  - **C0/D2 grant surface (Finding 3, real):** before enforce, C0 must inventory + grant the FULL bootstrap/base-login
    surface, not just FB#1: the `app_runtime_nonstaff_login` needs direct DML on every genuine pre-auth-written table
    (OTP → `platform_users`, `user_phone_history`, `user_channel_bindings/preferences`, `platform_user_contacts`;
    registration → `be_organizations/be_specialists/be_organization_members/specialist_signup_intents`) AND EXECUTE
    on `app.release_principal_context()` + `app.current_*()` + `app.close_active_user_phone_history()` (these are
    granted only to app_staff/app_patient today; bootstrap reaches them only if granted to the base login directly).
    Add a preflight assertion listing this surface.
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
| Shadow acceptance threshold | O11 | Covered by the retained 2026-07-13 owner decision: one full product smoke plus representative all-unit workload with zero unexplained violations. A static checker or “no one noticed errors” is not evidence. |
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
| B2 | not-started | No B2-specific product-parity artifact found in this R0 pass | Full A1 dormant matrix green twice from fresh copy and restart. |
| C0 | repo-artifact-only | `pnpm run check:saas-c0-locked-topology`; `pnpm run smoke:saas-c0-locked-topology` | Disposable DB executable proof in the actual target topology. |
| C1 | repo-artifact-only | `pnpm run check:saas-c1-webapp-dual-pool-fanout` | App-level shadow/locked smoke proving role/helper cleanup and concurrency. |
| C2 | repo-artifact-only | `pnpm run check:saas-c2-secrets-deployment-plumbing` | Real secret installation/fingerprint/redaction audit in disposable environment. |
| C3 | repo-artifact-only | `pnpm run check:saas-c3-integrator-fanout-inventory` | Controlled queued fixtures under strict roles with send-safe/no-delivery proof. |
| C4 | repo-artifact-only (checker not trusted as chain proof) | Inventory/checker artifacts exist, but `check:saas-c4-scheduler-media-cron-fanout` is bypassable: an org principal may wrap a no-op while real DB/S3 work runs after infra-principal restoration and the checker still exits 0. | Owner decision on checker repair; then strict+FORCE scheduler/media/internal cron fixtures, fake/local object storage proof, and infra pool/grants decision. |
| D1 | repo-artifact-only | `pnpm run check:saas-d1-664-with-check-reverify` | Owner-authorized strict+FORCE/live re-verification if required by the phase gate. |
| D2 | repo-artifact-only | `pnpm run check:saas-d2-fb1-bootstrap-phone-write` | Production-topology strict+FORCE application smoke for FB#1 and isolation negatives. |
| D3 | blocked | `SAAS_PRODUCT_SMOKE_A1.md` and runner/checker are repo artifacts; supplied `/tmp` smoke progression was 4/17 → 13/17 → 16/17, with no final 17/17 | Authorized locked+FORCE read matrix with expected non-empty facts; do not infer a PASS from log prose. |
| D4 | not-started | No D4 write-matrix artifact found in this R0 pass | Controlled create/update/delete write matrix and cross-tenant mutation negatives. |
| E1 | not-started | Roadmap still describes future structured observability work | Structured counters/report command and redaction/fault-injection tests. |
| E2 | not-started | Roadmap still describes future all-unit shadow run | Full A1/background shadow workload with zero unexplained events. |
| F1 | not-required-current-path | Explicit roadmap marker (owner, 2026-07-15) | No legacy-production cutover exists; an OFF lever would create a cross-clinic disclosure risk. |
| F2 | not-required-current-path | Explicit roadmap marker (owner, 2026-07-15) | No ON/OFF rehearsal is required for a fresh product-copy launch. |
| G1 | not-started | No owner-facing TEST acceptance artifact found in this R0 pass | Automated gates green plus owner acceptance evidence. |
| G2 | not-required-current-path | Explicit roadmap marker (owner, 2026-07-15) | No `bersoncare` PROD mapping or rollback drill: the new product starts on a new domain with walls enforced. |
