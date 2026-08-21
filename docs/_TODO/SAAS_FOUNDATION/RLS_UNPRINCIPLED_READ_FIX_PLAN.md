# RLS Unprincipled-Read Fix Plan (taskdb #821)

Status: DESIGN ONLY — read-only investigation, 2026-07-17. No code/schema changed. This document
is the input for an owner go/no-go on a surgical fix; nothing here has been applied.

## 0. Reality Summary

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

`deploy/postgres/phase4-force-rls-cutover.sql` (commit `16a910970`) put ~140 tables on TEST under
`FORCE ROW LEVEL SECURITY`. The relevant tenant policy shape (e.g. `saas_org_dormant_p0_8_3`) is:

    is_staff() AND current_org_id() = organization_id

Under the real login role `bcb_test_staff_login`, with no DB principal installed on the connection,
`current_org_id()` reads NULL → the policy is never true → **every row is invisible**. Because
`FORCE RLS` denies by hiding rows, not by erroring, a plain `db.select()` that hits this doesn't
throw — it silently returns `[]`. Two concrete, previously-confirmed symptoms:

- `listWorkingHoursAdmin` (`apps/webapp/src/infra/repos/pgBookingScheduling.ts:433`) → doctor/admin
  schedule editor shows an empty week.
- `listBusyIntervals` (`apps/webapp/src/infra/repos/pgBookingScheduling.ts:197`) → the slot engine
  sees no existing bookings → double-booking.

Writers are fine because every mutation in this codebase runs inside `db.transaction()`, and
`apps/webapp/src/app-layer/db/drizzle.ts`'s `withPrincipalAwareTransactions()` explicitly snapshots
`getCurrentDbPrincipal()` and installs it into that transaction before the caller's callback runs.
Reads that call `db.select()` directly (no `.transaction()`) do not get that same explicit,
deterministic treatment.

**This is not a new discovery.** `docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md` (2026-07-09,
i.e. a week before the FORCE cutover) already flagged this exact risk in its open-risk table:

> Principal currently applies only inside transaction chokepoints | FORCE RLS can deny plain
> reads/writes unexpectedly | T0.1/T0.3/T0.4

That follow-up was never fully closed before FORCE went live on TEST. #821 is that flagged risk
materializing.

## 1. How The Principal Machinery Actually Works (and where it breaks)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Read these first if verifying this doc: `packages/db-principal/src/index.ts`,
`apps/webapp/src/app-layer/db/drizzle.ts`, `apps/webapp/src/infra/db/withClient.ts`,
`apps/webapp/src/infra/db/webappPoolProvider.ts`, `apps/webapp/src/infra/db/client.ts`,
`apps/webapp/src/app-layer/principal/{sessionPrincipal,withOrganizationPrincipal,bootstrapPrincipal}.ts`.

- `packages/db-principal` keeps the "current principal" in an `AsyncLocalStorage` cell
  (`principalStorage`). `getCurrentDbPrincipal()` reads it; `runWithDbPrincipal`/`enterWithDbPrincipal`
  set it.
- During session resolution, `stampDbPrincipalFromSession()` (`app-layer/principal/sessionPrincipal.ts`)
  resolves the authenticated user's organization membership server-side and calls
  `enterWithDbStaffPrincipal({ organizationId: resolved.context.organizationId, platformUserId, source })`
  — this is the **only** place an org id enters the principal, and it is always derived from the
  session's own `platformUserId` via `organizationMembershipService.resolveOrganizationForUser(...)`,
  never from a client-supplied value.
- `getPool()` (`infra/db/client.ts`) returns a single `pg.Pool` whose `.query` method is monkey-patched
  by `installPrincipalAwarePoolQuery()` (`infra/db/webappPoolProvider.ts`): every call to `pool.query(...)`
  checks out a client, calls `applyDbPrincipalToConnection(client, getCurrentDbPrincipal(), ...)`
  (sets `app.org`/`app.patient_user_id`/`app.integrator_user_id` via `set_config(..., false)`, or does
  `SET ROLE` + `app.install_signed_context(...)` in `locked`/`shadow` mode), runs the query, clears the
  context, and releases the client.
- `getDrizzle()` (`app-layer/db/drizzle.ts`) builds a Drizzle instance over that same `Pool`.
  Drizzle-orm's `node-postgres` driver calls `client.query(...)` directly for a plain `.select()` — so
  a plain `db.select()` **does** flow through the monkey-patched `pool.query`. For `.transaction()`,
  drizzle instead does `await this.client.connect()` (bypassing `pool.query` entirely) and runs
  `BEGIN`/callback/`COMMIT` on the checked-out `PoolClient` — which is why
  `withPrincipalAwareTransactions()` had to add its own explicit, synchronous `getCurrentDbPrincipal()`
  snapshot + apply/clear around `.transaction()` in `drizzle.ts`.

**So both paths _can_ work.** The gap is not "reads have no chokepoint at all" — it's that the
pool-level chokepoint applies whatever principal happens to be ambient in `AsyncLocalStorage` _at
that exact call_, and nothing in the codebase **guarantees** that ambient value is the caller's org
principal for a plain read the way `withDoctorWorkspacePrincipal(...)` guarantees it for a write.
Two concrete, directly-observed failure shapes:

1. **Missing wrap, by omission.** In the same route file, `POST`/`PATCH`/`DELETE` wrap their
   `deps.bookingScheduling.*` call in `withDoctorWorkspacePrincipal(gate.ctx, source, fn)`, while `GET`
   calls the read method directly with no wrap at all. See
   `apps/webapp/src/app/api/admin/booking-engine/working-hours/route.ts` (POST/PATCH/DELETE wrapped
   at 72/97/119; GET unwrapped at 41-48) and the doctor mirror at
   `apps/webapp/src/app/api/doctor/booking-engine/working-hours/route.ts` (same asymmetry, plus
   `assertOwnedByDoctor()`'s pre-write authorization read at line 43 is also unwrapped).
2. **Half-fixed within one function.** `payment-timeline/route.ts` line 104 wraps
   `deps.patientPayments.listPayments(...)` in `withDoctorWorkspacePrincipal(...)`, but the sibling
   call on line 106, `deps.payments.listPaymentHistoryForUser(...)`, in the _same_ `Promise.all([...])`,
   is not wrapped. Direct evidence the previous fix strategy (wrap the call site, case by case) is
   error-prone even for the engineer doing it in the same PR — exactly why the owner wants one
   chokepoint instead of N patches.
3. **Historical ALS-continuity gap.** `ensureDbPrincipalContext()`'s doc comment in
   `packages/db-principal/src/index.ts` records a previously-confirmed live TEST incident: a route's DB
   principal read straight after `getCurrentSession()` showed 'staff', but a later query in the same
   handler saw 'bootstrap' again. Argument for making the _lowest_ layer (the DB checkout) the
   deterministic point of truth rather than depending on call sites re-wrapping.

Only two routes were previously hand-patched: `doctor/schedule-kpis` (whole handler wrapped) and
`doctor/messages/conversations`. Every other read call site inherited nothing.

## 2. Blast-Radius Inventory (ranked, with direct evidence)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Heuristic scan for "exported async method containing `.select(` but no `.transaction(`" inside
`infra/repos` returns **~321 raw hits across 65 files** (over-counts). A second heuristic — `route.ts`
under `app/api/{doctor,admin,patient}` importing **no** principal-wrapper helper — found **170 of 338**
route files. Both are upper bounds. **A Phase 0 automated audit must produce the exact number before
any fix is declared done.**

Directly-verified examples per domain (bug is systemic, not booking-only):

| #   | Domain       | Route / repo fn                                                                              | Table(s)                               | Wrapped?                                                                   | Symptom                                                                         |
| --- | ------------ | -------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Schedule     | `GET admin/.../working-hours:41-48` → `listWorkingHoursAdmin` (`pgBookingScheduling.ts:433`) | `be_working_hours`                     | **No**                                                                     | Empty week in editor                                                            |
| 2   | Schedule     | `GET doctor/.../working-hours:71-79` + `assertOwnedByDoctor:43`                              | `be_working_hours`                     | **No**                                                                     | Same as #1; also breaks own-row ownership gate for PATCH/DELETE                 |
| 3   | Schedule     | `listBusyIntervals` (`pgBookingScheduling.ts:197`), slot engine                              | `be_appointments`,`be_schedule_blocks` | **No**                                                                     | Slot engine sees no bookings → double-booking                                   |
| 4   | Appointments | `GET doctor/appointments/list:20-29` → `listAppointmentsForSpecialist`                       | `be_appointments`                      | **No**                                                                     | Past-appointments archive empty                                                 |
| 5   | Appointments | (contrast) `GET doctor/schedule-kpis:46` → `getScheduleKpis`                                 | `be_appointments`                      | **Yes**                                                                    | Works today; the "2 patched routes" precedent                                   |
| 6   | Patients     | `GET doctor/clients/search:39-40` → `listClients`                                            | client roster                          | **No**                                                                     | Patient search returns nothing                                                  |
| 7   | Patients     | (contrast) `GET doctor/patients/[userId]/clinical:37-42` → `getClinicalState`                | clinical\_\*                           | **Yes**                                                                    | Works; but `getClinicalState` computes org from ambient principal (see §4 flag) |
| 8   | Programs     | `GET doctor/treatment-program-templates:20-38` → `listTemplates`                             | `treatment_program_templates`          | **No** (route never calls requireDoctorWorkspaceApiContext, no org passed) | Program-template library empty                                                  |
| 9   | Content      | `app/app/doctor/content/page.tsx:21-22` (RSC page) → `contentPages.listAll()`                | `content_pages`                        | **No**                                                                     | CMS hub empty. Proves blast radius spans RSC page-loaders, not just API routes  |
| 10  | Finances     | `GET admin/.../prepayment-policies:28-36` → `listPrepaymentPolicies`                         | `be_prepayment_policies`               | **No**                                                                     | Prepayment-policy screen empty                                                  |
| 11  | Finances     | `GET doctor/patients/[userId]/payment-timeline:105-107` → `listPaymentHistoryForUser`        | `be_payment_history_events`            | **No** (sibling `listPayments:104` IS wrapped)                             | Timeline drops prepayment/refund rows                                           |

High-density repo files for the full pass: `pgTreatmentProgram.ts`, `pgTreatmentProgramInstance.ts`,
`pgProgramItemDiscussion.ts`, `pgProgramActionLog.ts`, `pgPayments.ts`, `pgMemberships.ts`,
`pgPatientClinical.ts`, `pgContentPages.ts`, `pgContentSections.ts`, `pgBookingEngine.ts`,
`pgClientHistory.ts`.

**Estimated true count: ~40-70 distinct broken read call sites** once filtered to org-scoped tables
under the cutover with zero principal wrap anywhere in the chain — consistent with the owner's "~44".
Estimate only; Phase 0 produces the real number.

## 3. Options For The Single Chokepoint

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### Option (a) — make the read layer itself always install the principal on checkout

Extend the mechanism that already makes `db.transaction()` safe (`withPrincipalAwareTransactions()` in
`app-layer/db/drizzle.ts`) so it also governs every drizzle query entry point outside an explicit
transaction — route `.select()`/`.query.*`/`.execute()` through the same snapshot→apply→clear sequence
`.transaction()` already uses (e.g. an implicit short read transaction reusing
`applyDbPrincipalToTransaction`/`clearDbPrincipalFromTransaction`).

- **Safe:** invents no new way to pick a principal — same `getCurrentDbPrincipal()` at the same
  synchronous pre-checkout point; reuses code already exercised by
  `smoke-r2-real-policy-isolation.mjs`/`rehearse-multitenant-isolation.mjs`. No policy/role/pool-routing
  change.
- **Surface: one file** (`drizzle.ts`). Fixes every current and future `db.select()`, including the
  RSC-page case (#9) a route-level fix can't reach.
- **Misses:** a call site whose _ambient_ principal is absent for a non-read-vs-write reason (finding
  #8, route never establishes a session/org). There the read now fails-closed correctly (empty) rather
  than wrong-data — safe direction; needs a small separate follow-up per route, not a security gap.
- **Already covered:** `withClient()`/`withPoolClient()` callers apply the principal explicitly already;
  only Drizzle's bare query-builder path is the gap.

### Option (b) — route every read through an explicit principal-aware helper

`withReadPrincipal(fn)` or require explicit `organizationId` on every repo read (mirror
`withDoctorWorkspacePrincipal` for writes), changing all ~40-70 call sites.

- **Safe/auditable** per call site; lintable.
- **Cost:** ~40-70 call sites (routes + RSC pages), each a chance to swap args exactly like §7's
  companion bug; higher surface/review cost; the "N patches" pattern the owner wants to avoid.

### Option (c) — temporarily relax FORCE on TEST while (a) lands

Roll back to `NO FORCE` on TEST during Phase 1-2, then re-cutover (script supports `DOWN` via
`phase4_force_rls_down`). Lowest immediate app risk but re-opens the pre-cutover trust model meanwhile
and needs a second rollout runbook.

### Recommendation

**Ship Option (a)** (one file, proven code, fixes routes + RSC pages, fails closed), paired with a
**non-blocking companion**: extend the `check-db-chokepoint.mjs` static-guard family to flag (not
block) repo reads reachable with no session-derived org context (finding #8 shape). Option (b) as
incremental defense-in-depth afterward. Option (c) is the owner's call (§8) and is compatible as a
parallel safety valve if verification runs long.

## 4. Tenant-Isolation Safety Proof

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

**The installed org is never client-supplied.** `stampDbPrincipalFromSession()`
(`sessionPrincipal.ts:26-68`) is the only place an org id enters a doctor/admin principal, deriving it
via `organizationMembershipService.resolveOrganizationForUser({ platformUserId: session.user.userId })`
— `userId` from the cookie-verified session, never request body/query/header. Patient path analogous.
Option (a) doesn't touch this derivation — only _when/how reliably_ the already-derived principal is
applied for a plain read. It cannot make a request see a different org than its own session resolves to,
because it introduces no new source of an org id.

**Fail-closed, never fail-open, both modes:**

- `legacy-guc`: missing principal → `applyDbPrincipalToTransaction` returns false, no `set_config` →
  connection's `app.org` was cleared to `''` by the prior checkout's cleanup (always in `finally`) →
  `current_org_id()` NULL → policy false for every org → **empty**, not another org's rows.
- `locked`/`shadow`: missing principal throws before the query
  (`assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal`) or the signed-context installer refuses
  (`applySignedDbPrincipal` false/throws for bootstrap/absent) → no query runs with ambiguous identity.
- Policy shape `current_org_id() = organization_id` can only match the one org id present at query time
  — no path resolves missing → "match everything." A cross-org leak would require the previous request's
  principal to survive on a reused pooled connection — exactly what
  `clearDbPrincipalFromConnection`/`releasePreparedClient` and the `finally` in
  `installPrincipalAwarePoolQuery` prevent, and Option (a) touches none of that.
- `AsyncLocalStorage` is per-async-context; concurrent requests each get their own cell. The only risk
  category is a single request's own ALS reading a stale/bootstrap value _for itself_ (fails closed),
  never another tenant's value.

**One non-negotiable implementation constraint:** the new "always apply on checkout" logic must
snapshot `getCurrentDbPrincipal()` **synchronously, at the call site, on every single query** — exactly
as `withPrincipalAwareTransactions()` does — never memoize/cache a snapshot outside a single async
continuation (doing so at pool-creation or across requests would defeat the walls).

**Flag for owner:** finding #7 (`getClinicalState`, `pgPatientClinical.ts:125-161`) computes
`principalOrganizationId()` inside the query builder and drops the app-layer `eq(..., organizationId)`
filter when ambient principal is absent (`principalOrganizationId() ? eq(...) : undefined`) — safe under
FORCE RLS (RLS still restricts) but no defense-in-depth if RLS were ever misconfigured. Follow-up: pass
explicit organizationId here regardless of the chokepoint fix.

## 5. Test Plan

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

1. **Mechanism-level (exists, stays green):** `smoke-r2-real-policy-isolation.mjs`,
   `rehearse-multitenant-isolation.mjs` — prove the principal+RLS plumbing (staff/patient wall, plain
   SET can't forge visibility, locked-mode fail-closed release). They don't exercise webapp
   route/page code, so they won't catch #821 alone, but must keep passing unmodified.
2. **Application positive (new — the real regression coverage):** use the owner's already registered
   Clinic A account and its existing data for the §2 routes (`working-hours`, `appointments/list`,
   `clients/search`, `treatment-program-templates`, `prepayment-policies`, the `doctor/content` page loader).
   Do not seed a clinic, user or dataset; see `AGENTS.md` §1b.
3. **Cross-org negative (must never regress):** use the existing Clinic B account; it must return only
   Clinic B rows (or empty), never a Clinic A row. This catches a leak introduced by a careless fix per §4.
4. **Companion-bug regression (§7):** if a mutation probe is necessary, it must run in one transaction with
   guaranteed rollback and leave no fixture entity or state behind; a response code alone is insufficient.
5. Gate through `check-saas-db-regression.mjs` + `check-db-chokepoint.mjs` before any phase done.
   **TEST-only**, disposable DB names only, never dev/prod (per `PHASE4_ROLLOUT_RUNBOOK.md`).

## 6. Phased Checklist (each phase auditable, TEST-only, no prod)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] **Phase 0 — exact inventory.** Real static scan over `infra/repos/*.ts` cross-referenced against
      the FORCE-RLS table list (`phase4-force-rls-cutover.sql`/`R1_TABLE_TAXONOMY.md`); produce exact count
  - file:line list of unwrapped org-scoped reads. Checked-in inventory file (like `P0_7_WRITER_CENSUS.md`).
- [ ] **Phase 1 — chokepoint fix.** Option (a) in `drizzle.ts` only. Unit-test the wrapping (snapshot
      correctness, cleanup-on-error, no-principal fail-closed) — mirror `drizzle.test.ts`.
- [ ] **Phase 2 — application proof.** Positive + negative integration tests (§5) against the two-clinic
      fixture. Every §2 route flips `[]`→correct-own-org, stays `[]`/correct for the other org.
      `check-saas-db-regression.mjs` green.
- [ ] **Phase 3 — companion bug (independent, §7).** Fix `deactivateWorkingHours` arg order at 2 sites;
      add the real-DELETE regression test.
- [ ] **Phase 4 — hardening (non-blocking).** Extend `check-db-chokepoint.mjs` to flag reads reachable
      with no session-derived org (finding #8); pass explicit organizationId into `getClinicalState` (§4).
- [ ] **Phase 5 — sign-off.** Re-run isolation rehearsals unmodified (prove no policy/principal drift),
      then owner walkthrough per `ST-02_WALKTHROUGH.md` on real TEST UI.

## 7. Companion Bug (independent of RLS): `deactivateWorkingHours` swapped args

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Plain argument-order defect, type-checker-invisible (both params `string`). Git archaeology:

- `modules/booking-scheduling/ports.ts:306` — service facade declares
  `deactivateWorkingHours(id, organizationId)`.
- `modules/booking-scheduling/service.ts:285-286` implements it correctly, remapping to the Port's
  opposite order (`ports.ts:171` / `pgBookingScheduling.ts:540`).
- Commit `460b7c8ce` (2026-07-09) changed the DELETE call from correct
  `deactivateWorkingHours(id, gate.ctx.organizationId)` to swapped
  `deactivateWorkingHours(gate.ctx.organizationId, id)` at:
  - `app/api/admin/booking-engine/working-hours/route.ts:120`
  - `app/api/doctor/booking-engine/working-hours/route.ts:182`
- **Effect:** `WHERE id = <orgId> AND organization_id = <rowId>` matches zero rows → `UPDATE 0` → no
  error → DELETE returns `200 OK` but the row is never deactivated. "Closed" schedule slot stays bookable.
- **Why tests miss it:** route tests mock `deps.bookingScheduling`, asserting the buggy arg order as
  ground truth; never exercise the real service→port remap. Only an integration test (Phase 3) catches it.
- **Fix:** swap back to `deactivateWorkingHours(id, gate.ctx.organizationId)` at both sites. One line
  each, zero RLS/schema involvement. Ship alongside Phase 3, not blocking Phases 1-2.

## 8b. OWNER DECISIONS — RESOLVED 2026-07-17

Owner ruled on all four (verbatim intent):

1. **Keep FORCE ON.** No relaxing. Test+dev live on the same server, nobody works live, we are just preparing
   this toward a full working system — no reason to ever remove the walls.
2. **Approved Option (a) — single chokepoint — emphatically.** Owner's directive: the whole POINT of turning
   on the walls was NOT to fix each query in place, but to route EVERY query that fails-under-walls onto the
   ONE common port where organization/patient/etc. are auto-injected. Minimize the number of places that
   bypass that port. This is a deliberate architectural consolidation, desirable long-term, not just a bugfix.
3. **Phase 0 in parallel with Phase 1 — lead's call, approved** as long as it doesn't hurt quality.
4. **Companion bug (§7) as a separate diff — lead's call, trusted.** Ship it separately.

## 8. Owner Decisions Needed (superseded by 8b above)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

1. **Keep FORCE on TEST during the fix, or temporarily relax to NO FORCE (Option c)?** Recommendation:
   keep FORCE on — Option (a) is small/single-file/low-risk; relaxing re-opens the trust model the
   cutover closed.
2. **Approve Option (a)** (single drizzle-layer chokepoint) as primary, with Option (b) per-call-site
   discipline as non-blocking hardening (Phase 4)?
3. **Phase 0 inventory before or in parallel with Phase 1?** Recommendation: parallel — Phase 1 fixes
   the mechanism regardless of the exact count; the number is needed for Phase 2's coverage claim.
4. Confirm the companion bug (§7) ships as a separate, independently reviewable diff from the RLS fix.

---

_Read-only design output. No migration, policy, code, or test file was modified to produce this._
_Authored overnight 2026-07-17 by the autonomous lead ahead of owner review; verified against live TEST
DB read-only (see taskdb #821, memory force-rls-cutover-breaks-unprincipled-reads)._
