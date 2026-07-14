# SaaS enforce roadmap — from current state to “one-command walls” (v0.2, hardened)

> Owner target, 2026-07-13: the application must work with the walls both DORMANT and ENFORCED, and the transition
> in either direction must be one owner command. This roadmap is an execution plan, not evidence that the flip is
> ready. Every database exercise below is limited to a disposable production copy until the owner authorizes TEST;
> never use prod/test/dev databases for development proofs.

---

## 0. FINAL RESULT (fixed definition of done)

**R1 — DORMANT product parity.** On a fresh production copy deployed by the repository scripts, all five units run
with `DB_PRINCIPAL_CONTEXT_MODE=legacy-guc`. A browser/API smoke logs in as real seeded doctor, admin, and patient
identities and drives the critical screens and reads/writes. It detects 401/403/5xx, empty-result regressions,
Server Action errors, and new application errors. A health endpoint alone is not evidence. If the operator-managed
`SAAS_PRODUCT_SMOKE_FIXTURE` / `--fixture-file` path is absent, this gate is **SKIPPED/BLOCKED**, not PASS.

**R2 — ENFORCED product parity plus isolation.** On the same data after one flip command, the same product smoke is
green under locked principal context and strict/FORCE RLS. A second clinic and a shared/multi-clinic patient prove
the canonical staff-org and patient-own-data matrix. Legitimate webapp, integrator API, worker, scheduler,
media-worker, cron/internal-job, public booking, OTP, and registration paths work; attempts without or with forged
context fail closed. Missing `SAAS_PRODUCT_SMOKE_FIXTURE` remains a **SKIPPED/BLOCKED** product gate and cannot be
used as R2 evidence. The canonical wall is documented at
`TENANT_WALLS_AND_ACCESS_MODEL.md:21-75,92-110`.

**R3 — one command each way, transactional operational contract.** One owner command performs preflight, quiesces
writers, changes all required DB artifacts and runtime configuration, restarts all affected units, then runs the
mode-specific product and isolation gates. One owner command returns to dormant. If ON verification fails, the
wrapper automatically executes the OFF path and proves dormant product parity. “One command” may invoke versioned
subscripts, but must not require an operator to edit env files, run SQL, or restart individual units by hand.

**R4 — repeatable and prod-mappable.** A fresh-copy rehearsal proves dormant deploy → shadow → ON → OFF twice
without residue. TEST and PROD wrappers share the same implementation with explicit environment/unit allowlists;
only owner authorization selects TEST/PROD. `deploy-test-saas.sh` is not yet sufficient evidence merely because
migrations and `/api/health` pass.

**R5 — observable, auditable, and recoverable.** Missing-principal, signature, role-switch, RLS denial, and pool
selection failures are countable by unit/mode/path without logging PII or the signing secret. The cutover has a
tested database/config rollback, writer-quiescence procedure, log capture, and decision thresholds.

### Overall acceptance commands

The implementation phase must replace placeholders below with committed commands. The final gate is objectively:

```bash
deploy/host/deploy-test-saas.sh --source fresh-prod-copy --mode dormant
deploy/host/smoke-saas-product.sh --mode dormant --fixture-file /run/bersoncarebot/saas-smoke.fixture
deploy/host/flip-saas.sh --target test on
deploy/host/smoke-saas-product.sh --mode locked --fixture-file /run/bersoncarebot/saas-smoke.fixture
deploy/host/smoke-saas-isolation.sh --mode locked --fixture-file /run/bersoncarebot/saas-smoke.fixture
deploy/host/flip-saas.sh --target test off
deploy/host/smoke-saas-product.sh --mode dormant --fixture-file /run/bersoncarebot/saas-smoke.fixture
```

Every command must exit 0 only after its assertions pass; any non-zero result is a failed R1/R2/R3 gate.

---

## 1. CURRENT STATE (source-verified on branch `auto/code-pg-delta`, 2026-07-13)

### DONE, with the actual proof boundary

- The canonical two-wall model exists: staff is org-scoped; patient is own-data-only; protected labels live in
  `app.principal_context` (`TENANT_WALLS_AND_ACCESS_MODEL.md:21-77,92-110`).
- Strict policy generation/artifact and the synthetic/live disposable-copy isolation rehearsal exist. The handoff
  reports 161 policies and the S1/S2/S3/P2/P_SHARED matrix passing, but explicitly says this was not deployed to
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
- Dormant is currently safe for a narrower reason than “walls are asleep”: migrations already contain FORCE and
  patient policies fail closed without context; current owner/BYPASSRLS runtime bypasses them. This warning is
  explicit in `DORMANT_DEPLOY_TEST_RUNBOOK.md:15-21`. The flip must not assume FORCE is wholly absent.
- The current FORCE cutover has useful preflight assertions: bootstrap base must be NOBYPASSRLS and not a staff
  member, and owner privilege is checked (`phase4-force-rls-cutover.sql:23-71`). It is not a complete ON/OFF
  orchestrator.
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
- **G10 — atomic one-command ON/OFF and backout/B8.** Section B remains a stub
  (`SAAS_DEPLOY_SEQUENCE.md:52-59`); no idempotent wrapper coordinates writer stop, DB/config change, all-unit
  restart, post-smokes, and automatic rollback.
- **G11 — product smoke.** Current deployment proof ends at migration count/health and manual browsing
  (`SAAS_DEPLOY_SEQUENCE.md:37-49`; `DORMANT_DEPLOY_TEST_RUNBOOK.md:40-42`). It did not expose a repeatable
  authenticated R1/R2 oracle.
- **G12 — recovery/version symmetry.** SQL has FORCE/NO FORCE branches (`phase4-force-rls-cutover.sql:245-250`),
  but the roadmap needs a versioned state manifest and OFF assertions covering policies, protected helpers,
  grants, roles, runtime mode, pool credentials, and all units. Dropping shared roles/helpers on OFF is unsafe;
  dormant should normally neutralize enforcement and restore dormant runtime while retaining compatible artifacts.

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
- [ ] Re-run from a fresh production copy, not a patched long-lived database.

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
  to flip preflight.
- [ ] Exercise real OTP/contact/phone-history close+insert over pre-existing NULL and org-stamped rows through the
  application repository path, not only handcrafted SQL.
- [ ] Prove nonstaff bootstrap cannot read/write unrelated org PII and staff cannot see bootstrap NULL PII.

Exit: FB#1 application smoke and PII isolation negatives exit 0 under strict+FORCE with the production topology.

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

- [ ] Implement environment-allowlisted `flip-saas.sh --target test on|off`; PROD selection requires a separate
  explicit confirmation and remains owner-only.
- [ ] ON order is derived from proven SQL dependencies: writer stop/drain, roles/grants and protected helper setup,
  strict artifact, FORCE cutover/preflights, runtime credential/mode activation, ordered all-unit restart, product +
  isolation + background smokes. OFF uses F1’s inverse compatibility order.
- [ ] Make rerunning ON or OFF idempotent and self-verifying.

Exit: from a fresh copy, dormant → ON → OFF → ON → OFF all exit 0; injected post-ON failure automatically returns
to a green dormant app. Operator invokes exactly one command per transition.

### Phase G1 — owner-facing TEST acceptance · tier: daily · audit: deep

- [ ] Owner drives clinic #1 in dormant and enforced modes and self-registers clinic #2; automated harness verifies
  the same facts and the patient matrix.
- [ ] Exercise real TEST integrations only through approved send-safe redirects/mocks; confirm no production relay,
  credentials, DB, or bucket is used.
- [ ] Record command outputs, manifest revisions, screenshots where UI-relevant, shadow report, and rollback result.

Exit: automated R1/R2/R3 commands are green and owner records acceptance. Owner observation cannot override a red
automated gate.

### Phase G2 — PROD mapping, rollback drill, holistic audit · tier: deep · audit: deep

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

- One phase above is one focused pass. D3/D4 must be subdivided by the orchestrator if the discovered failure set
  cannot be fixed and verified honestly in one pass; never collapse C1-C4 or F1-F2 back into a mega-pass.
- Before each phase, read its canonical task/docs and locate code through the repository index. Record load-bearing
  evidence as `file:line`; rerun line references after edits.
- Every phase receives an independent adversarial audit against executable evidence. Green mocks/static checks do
  not substitute for required disposable-DB/application proofs.
- Scratch only until owner authorization. Never touch prod/test/dev DBs during implementation, never read prod env,
  never send real notifications, never use real object storage, and never print credentials/PII.
- `accepted` is owner-only. No commit/push is implied by this roadmap-hardening pass.

## 4. Resolved architecture decision and remaining owner decisions

Resolved for implementation: **dual NOBYPASSRLS login roles + dual pools selected by principal before checkout**.
This is the smallest topology consistent with both `SET ROLE app_staff` and bootstrap `app.is_staff()=false` after
`RESET ROLE`. Separate process pools may use the same two logical credentials, but each process must expose only the
principal classes it actually needs. A third narrowly granted operational pool is permitted only after C4 documents
an unavoidable cross-org job; owner/BYPASSRLS is forbidden for normal runtime.

Lead/owner decisions still required before execution:

- exact canonical #664 task/spec and names/semantics of its two deferred patient columns;
- permitted TEST authentication/fixture mechanism for automated browser smokes without enabling production bypass;
- shadow acceptance window/workload threshold and operational metrics sink;
- whether signing-key rotation must be zero-downtime (dual-key overlap) or may use the same maintenance stop as flip;
- which genuinely global scheduler/cron operations, if any, justify a separately audited infra pool;
- maintenance-window downtime and automatic rollback/restore time budget.

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
- Structured fail-closed/shadow observability, B7 objective report, B8 state machine, writer quiescence, automatic
  rollback, idempotency, version manifest, and recovery symmetry.
- Authenticated non-empty product smoke and explicit isolation/background-job smokes as R1/R2/R3 gates.

### Split phases and why

- A → A1 harness + A2 nginx/deploy: product oracle and proxy persistence are independently verifiable.
- B → identity repair + broader dormant closure: prevents one known account bug from masking unrelated failures.
- C → ADR/role proof, webapp dual pool, secret plumbing, integrator/worker, scheduler/media/cron: original B4 fanout
  crossed security architecture, multiple runtimes, operations, and media and could not fit one pass.
- D → #664, FB#1, enforce reads, enforce writes: original phase combined schema/policy design with every product path.
- E/F → observability, B7 shadow, B8 state machine, wrapper/rehearsal: shadow must be measurable before it gates flip;
  rollback mechanics must exist before the one-command rehearsal.
- G → TEST acceptance and separate PROD mapping/audit: TEST evidence must precede any production package decision.

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

## FINALIZATION v0.3 (2026-07-13) — owner decisions folded + review-pass-2 resolved (THIS LAYER IS AUTHORITATIVE)

This section overrides anything above it where they differ. The roadmap is READY for an orchestrator to execute
phase-by-phase (A1 first), each phase: worker (tier as noted) → independent adversarial audit (different model) →
lead verification against reality → owner control. Scratch/disposable DB only until owner authorizes TEST/PROD.

### Owner decisions (locked 2026-07-13)
- **Smoke login (override A1):** on TEST the product smoke authenticates as the owner's **real seeded TEST doctor +
  TEST patient/user accounts** (TEST is a production-like build with send-safety restrictions on broadcasts). The
  dev/test auth-bypass is **dev:turbo-only and MUST NOT be used on TEST**. Store TEST smoke credentials in a
  root-managed secret file (never in repo/logs); reuse the owner's existing live TEST accounts.
- **Shadow acceptance (override E2/B7):** ONE full pass of the product smoke + a representative background workload
  with **zero unexplained fail-closed/missing-context events** = shadow PASS. No multi-day soak required for TEST.
- **Signing-key rotation (override C2/G8):** NO zero-downtime rotation. Generate/rotate the signing key in the
  **same maintenance window as the flip** (a brief restart pause is acceptable). Drop the dual-key overlap
  requirement from C2; keep least-permission file storage + fingerprint preflight + redaction.

### #664 is DONE — D1 becomes RE-VERIFY, not implement
taskdb #664 = done+sealed (commit `02936c257`). The two re-added patient columns are named:
**`user_channel_preferences.is_preferred_for_auth`** (patient OTP-channel preference) and
**`public.treatment_program_events.actor_id`** (patient progress). D1 scope → independently RE-VERIFY the WITH CHECK
value-enforcement + these two columns against reality (malicious cross-org/cross-patient write must fail; legit
writes pass); only implement if re-verification finds a real gap. Do NOT re-derive the columns.

### Review pass 2 (Claude) — RESOLVED against reality
- **Finding 1 & 2 ("policies read GUC channel; locked runtime writes signed-helper channel; never meet; blocks R2")
  = REFUTED.** The FLIP replaces the policy set. `deploy/postgres/phase4-locked-helper-rls-policies.sql` contains
  **322 `app.current_org_id()/current_patient_user_id()` calls and 0 `current_setting('app.org')`**, and DROPs all
  161 policies **by the same names the migrations created** (e.g. `saas_org_dormant_p0_8_3` on `org_enrollments` in
  both 0167 and the artifact), re-creating them helper-based. The full prod-copy rehearsal applied this artifact +
  FORCE and the S1/S2/S3/P2/P_SHARED isolation matrix PASSED. So under enforce the policies read exactly the signed
  channel locked mode populates. **No "re-point every policy to the helper channel" phase is needed** — the reviewer
  analyzed only the dormant/migration policies and missed the flip-time policy swap.
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
    table) + owner runtime; the flip's real job is re-applying FORCE via `phase4-force-rls-cutover.sql`. State it
    against that baseline.
  - **Integrator (Finding 7):** confirm during C3 that integrator (mapped to `app_patient`) has the grants its write
    paths need and that its policies (helper-based `current_integrator_user_id()`) resolve under locked context.

### Execution start
Orchestrator begins at **Phase A1** and proceeds in order; C0 is the first deep-tier architectural phase and gates
all of C–G. Nothing touches TEST/PROD DBs or real deliveries during implementation; owner authorizes TEST, then PROD.
