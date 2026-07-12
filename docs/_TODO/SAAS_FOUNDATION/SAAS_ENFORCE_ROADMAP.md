# SaaS enforce roadmap — from current state to "one-button walls" (DRAFT v0.1, to be hardened)

> Goal owner stated 2026-07-13: the app must work **both** with the switch OFF (dormant) **and** ON (enforce),
> and the switch must flip with **ONE button/command**. This is the hard roadmap: phases sized for one agent pass,
> each with a checklist, scope, model tier, and an independent audit gate. Deviations may happen inside a phase;
> the exit criteria are fixed. Status of THIS file: draft by lead (Opus), pending adversarial hardening by Sol
> (gpt-5.6-sol) + a parallel review, iterate until two consecutive clean passes (plan-harden loop).

---

## 0. FINAL RESULT (definition of done — the fixed target)

On a **fresh clean copy of production**, deployed by scripts (mirrored to prod), the system reaches:

**R1. DORMANT works = prod-parity.** With `DB_PRINCIPAL_CONTEXT_MODE=legacy-guc` (default), every cabinet/screen
works exactly as prod today: no 403, no 500, no empty lists. Verified by a **drive-the-app smoke** (real login +
navigate doctor + patient + admin cabinets + key APIs), not just `health db:up`.

**R2. ENFORCE works = isolation + no breakage.** After the flip (`locked` + FORCE RLS + role switch), on the SAME
data: (a) every dormant-working screen STILL works (no fail-closed regressions); (b) real multi-clinic isolation
holds — a newly self-registered specialist gets their OWN empty clinic, cannot see clinic #1; clinic #1 keeps
working; patients see only their own data. Verified by the drive-the-app smoke run in enforce mode + the
who-sees-what matrix.

**R3. One-button flip.** A single command flips dormant→enforce and a single command reverts enforce→dormant,
each: applies/rolls back ALL DB artifacts (roles, grants, strict policies, FORCE, protected context) + sets the app
runtime mode/role config + restarts, guarded by pre-flight asserts and followed by post-flip verification. No manual
multi-step choreography.

**R4. Repeatable from zero, mirrored to prod.** `deploy-test-saas.sh` brings test from a fresh prod copy to a
working DORMANT app in one pass (DONE). `flip-*.sh on|off` toggles the wall. Prod uses the analogous
`deploy-saas-667.sh` + the same flip script in a maintenance window, with a rollback path.

**R5. Recorded + audited.** Every step in committed scripts + runbook; each phase independently audited against
reality (not against green tests); prod cutover has a final holistic audit.

---

## 1. CURRENT STATE (verified 2026-07-12/13 — grounded, not assumed)

**DONE + proven**
- Read-hole closure for `platform_user_contacts` + `user_phone_history` (TASK A); org-path proven on prod copy.
- FB#2 flip-gate assertions; FB#1 function + org-session enforce path proven (rehearsal).
- The #667/#708 migration blocker cracked + recorded: plain migrate is insufficient; correct sequence is
  data-fix (`p0-data-fix-doctor-admin-split.sql`) → temp-BYPASSRLS `pnpm migrate` → revoke. Codified in
  `deploy/host/deploy-test-saas.sh`; clean cycle from zero PROVEN (drizzle 179, health db:up).
- Server-Actions 500s root-caused to a test-nginx `X-Forwarded-Host` gap (headers were reset inside `location /`);
  fixed on the box (needs persisting into config-as-code).

**BROKEN / GAPS (the work)**
- **G1 [dormant correctness].** Doctor/admin split resolution: doctor `b0021a38` has membership role=doctor but
  `platform_users.role=admin` → `/api/doctor/*` workspace gate returns 403. Doctor cabinet APIs (working-hours,
  bookings, analytics) fail/empty. Real data/resolution bug on migrated prod data — NOT a dormant artifact.
- **G2 [nginx as-code].** The `X-Forwarded-Host $host` fix is on the box only; must live in versioned nginx config
  + the deploy so it survives and maps to prod.
- **G3 [B4-fanout — THE flip enabler].** The app is NOT wired for locked-mode DB connection: single webapp pool,
  no per-principal role model, and the base-role↔`app.is_staff()` tension is unresolved (a base role that can
  `SET ROLE app_staff` is a member of app_staff → bootstrap `RESET ROLE` back to it makes `is_staff()` TRUE →
  the bootstrap-NULL branch + no-org signup writes fail-closed). Without this, the flip cannot work.
- **G4 [FB#1 bootstrap enforce proof].** The bootstrap phone-write path under enforce still unproven end-to-end
  (blocked on G3's base-role model).
- **G5 [policy/feature coverage under enforce].** Per-feature validation that every cabinet works under FORCE RLS
  (no table left fail-closed for a legitimate path); includes #664 (WITH CHECK value-enforcement + re-add 2 patient
  columns), and the app write paths (booking/OTP/registration) under enforce.
- **G6 [one-button flip].** No flip script exists (runbook section B is a stub).
- **G7 [drive-the-app verification].** No automated smoke that actually logs in and exercises cabinets; `health`
  alone hid all of the above. Needed as the gate for R1/R2.

---

## 2. PHASES (each one agent-pass; tier + audit per phase)

Model tiers: **mini**=Sonnet/gpt-5.4-mini (mechanical), **daily**=gpt-5.5 (standard code), **deep**=gpt-5.6-sol
(architecture / hardest). Audit = independent adversarial pass by a DIFFERENT model than the implementer.

### Phase A — Drive-the-app verification harness (unblocks judging every later phase)  · tier: daily · audit: mini
Scope: a headless smoke that, against test, performs real login (doctor + patient + admin dev-bypass), navigates
the key cabinet routes + hits the previously-broken APIs, and asserts HTTP 200 + non-error bodies. Runs in both
modes (param). Persist nginx fix (G2) as part of this phase's env.
Checklist:
- [ ] `deploy/host/smoke-test-app.sh` (or node): login all 3 roles, GET the working-hours/bookings/analytics APIs,
      load content + broadcasts pages, assert no 403/500/"Server Components render" digests in server log during run.
- [ ] Nginx `X-Forwarded-Host $host` inside `location /` committed to versioned config + applied by deploy.
- [ ] Wire it into `deploy-test-saas.sh` as the final gate (fail the deploy if the app smoke fails).
Exit: the smoke reproduces G1 (fails today) and becomes the pass/fail oracle for R1.

### Phase B — Fix DORMANT correctness (R1)  · tier: daily (G1 diagnosis may need deep) · audit: daily
Scope: make every cabinet work in dormant. Root-cause + fix G1 (doctor/admin split resolution); sweep every screen
the owner flagged (schedule/working-hours 403, bookings empty, content 500, analytics empty, broadcasts 500) and
fix each real cause. Confirm the nginx/Server-Actions fix clears the 500 cluster.
Checklist:
- [ ] Root cause of the doctor/admin `platform_users.role` vs membership mismatch on migrated data; fix the
      resolution (or the data-fix migration) so `/api/doctor/*` gate passes for the real doctor account.
- [ ] Each flagged screen returns 200 + real data in dormant (schedule, bookings, analytics, content, broadcasts).
- [ ] Phase-A smoke GREEN in dormant.
Exit: R1 met — drive-the-app smoke fully green in dormant on a clean prod copy.

### Phase C — B4-fanout: locked-mode connection/role model (the core flip enabler, R2 precondition)  · tier: deep · audit: deep
Scope: design + build how the app talks to the DB in locked mode so BOTH staff and bootstrap paths work. Resolve
the base-role↔is_staff tension. Likely shape (to be finalized by deep design): app connects as a non-owner,
NOBYPASSRLS base login role that is a member of `app_patient` only (so `is_staff()` is FALSE for bootstrap after
`RESET ROLE`); staff requests reach `app_staff` via `SET ROLE` granted through a separate grant/pool path; provision
the base role with the p0-5b DML surface + EXECUTE on `app.*` helpers. Update `packages/db-principal` + webapp pool
provider as needed. Set `DB_PRINCIPAL_CONTEXT_MODE`/signing-secret plumbing for test env.
Checklist:
- [ ] Decision record: exact role topology for locked mode (which role the pool authenticates as; how staff vs
      patient vs bootstrap map; how `SET ROLE app_staff` is authorized without making the base role a staff member).
- [ ] Provision roles/grants on test; wire the app config; `smoke-b4-locked-runtime-principal.mjs` + a NEW app-level
      shadow smoke pass (identity stamped, role switched, no fail-closed on legit paths).
- [ ] FB#2 pre-flip asserts still hold with the chosen base role.
Exit: in `shadow` mode the app stamps identity + switches roles correctly with zero fail-closed regressions on the
Phase-A smoke.

### Phase D — Enforce write/read coverage: FB#1 + #664 + per-feature policy validation (R2)  · tier: deep+daily · audit: deep
Scope: prove every legitimate read AND write works under FORCE RLS. Complete FB#1 bootstrap enforce proof (G4);
land #664 (WITH CHECK value-enforcement + re-add 2 patient columns); extend the rehearsal to drive the app's real
write paths under enforce (booking, OTP, specialist registration) + the Phase-A smoke under enforce.
Checklist:
- [ ] FB#1 bootstrap phone-write over pre-existing rows proven under strict+FORCE (with the Phase-C base role).
- [ ] #664 applied + verified.
- [ ] Rehearsal (or a new app-driving enforce smoke) proves: specialist self-registration under enforce creates an
      isolated clinic; clinic #1 read/write unaffected; patient own-data; no legit path fail-closed.
Exit: R2 datapath met — enforce breaks nothing legitimate, isolation holds.

### Phase E — One-button flip (R3)  · tier: daily · audit: daily
Scope: `deploy/host/flip-test-saas.sh {on|off}`. `on` = p0-5b roles+grants → p2-b → strict policies
(`-v phase4_enforce_locked_context=1`) → `phase4-force-rls-cutover.sql` (with the FB#2/owner vars) → set app env
`locked` + restart → run Phase-A smoke in enforce; abort + auto-rollback on any pre-flight/verify failure. `off` =
reverse (NO FORCE, legacy-guc, restart, smoke). Idempotent.
Checklist:
- [ ] `flip-test-saas.sh on` reaches enforce with all pre-flight asserts + post-smoke green, else auto-reverts.
- [ ] `flip-test-saas.sh off` returns to a green dormant app.
- [ ] Both recorded in the runbook + mapped to the prod equivalent.
Exit: R3 met — one command each way, self-verifying.

### Phase F — End-to-end acceptance on test + shadow-run (B7)  · tier: daily · audit: deep
Scope: full owner-facing cycle from zero: `deploy-test-saas.sh` (dormant, owner walks cabinets) → `flip on` (owner
sees isolation: registers a 2nd specialist → empty base; clinic #1 works) → `flip off`. Run a shadow period to catch
skipped-context paths.
Checklist:
- [ ] Owner live-acceptance in BOTH modes.
- [ ] Shadow-run surfaces zero unhandled fail-closed paths.
Exit: R1+R2+R3 accepted by owner on test.

### Phase G — Prod cutover runbook + final holistic audit (R4/R5)  · tier: deep · audit: deep
Scope: map the proven test flow to prod (`deploy-saas-667.sh` for dormant migrate + the flip script), maintenance
window, rollback drill, final adversarial audit of the whole package before the prod button.
Checklist:
- [ ] Prod dormant deploy + flip runbook with exact commands + rollback, dry-run-validated on a prod copy.
- [ ] Final holistic audit (different model) SHIP verdict over the whole enforce package.
Exit: prod-ready; owner presses the button.

---

## 3. Execution rules (per owner)
- One task = one focused agent pass; tier by difficulty (deep only where the architecture is hard: C, D, G).
- Independent adversarial audit after each phase — against REALITY (drive the app / query the DB), not green tests.
- Lead orchestrates + verifies each checkbox independently; "done" only after the phase exit criterion is met AND
  owner-visible where applicable. NOT pushed to prod without the owner button.

## 4. Open design questions to resolve in Phase C (flagged, not guessed)
- Exact locked-mode pool/role topology (single pool + SET ROLE vs per-principal pools).
- How to authorize staff `SET ROLE app_staff` from a base role that is NOT an app_staff member (grant path vs a
  dedicated staff pool).
- Whether the doctor/admin split (G1) is a data-fix bug or a resolution-code bug — determines if it lands in a
  migration or app code.
