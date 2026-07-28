> STATUS (verified 2026-07-23, code-reconciled): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md

# C1 — walls live on TEST: build checklist + owner morning-acceptance checklist

Goal: by morning, the owner opens test.bersoncare.ru, logs in as the Клиника 2 doctor, and sees that
the walls (RLS enforce) close the cross-clinic leak — while his main clinic (Точка Здоровья) still works.
Approach (owner-decided): **one DB chokepoint sets "who" from the session; RLS in the DB filters every
query; app connects as `app_staff`/`app_patient`, not the owner.** No per-route org filtering.

Anchors: Точка Здоровья = org `a0000000-0000-4000-8000-000000000001` (doctor +79643805480, 298 appts);
Демо Клиника 2 = org `ed63b540-3fb6-499d-897c-f52227ea5dd8` (doctor demo2clinic@example.com / demo1234).

---

## A. BUILD CHECKLIST — what I must do (source of truth for "done")

### Foundation

- [x] Wall roles `app_staff` / `app_patient` created on the TEST DB (LOGIN, NOBYPASSRLS, no cross-membership) (✓ deploy/postgres/p0-5b-role-split-staff-patient.sql | live-applied 2026-07-13 per OVERNIGHT STATUS/RESULT)
- [~] Apply `p0-5b-grants.sql` — table grants to `app_staff` / `app_patient` on the TEST DB (awaiting live cutover — DORMANT_DEPLOY_TEST_RUNBOOK.md; artifact deploy/postgres/p0-5b-grants.sql ready, applied 2026-07-13 then env reverted to dormant)
- [~] Create the two runtime LOGIN credentials + point `webapp.test` DATABASE at a NON-owner login (staff pool) (awaiting live cutover — DORMANT_DEPLOY_TEST_RUNBOOK.md; rollback re-pointed DATABASE_URL to owner login, current state dormant)

### Core (the one chokepoint)

- [x] Single DB layer derives the **organization from the session** (resolve membership) and stamps the
      signed principal context — in ONE place, on every query (no per-route work) (✓ app-layer/principal/sessionPrincipal.ts:41 resolveOrganizationForUser | requireRole.ts:197,215 stampStaffPrincipal centralised)
- [x] **Bootstrap/login path works under enforce**: pre-session queries (password login, OTP) run under the
      bootstrap principal so the owner can actually LOG IN with walls on (critical — else nobody gets in) (✓ bootstrap principal routes to the `nonstaff` pool via webappPoolProvider selectPool + runWithDbBootstrapPrincipal wraps login/health/public-auth, client.ts:108 | live-proven login 200 both doctors, RESULT 2026-07-13)
- [x] Audit: no query reaches the DB bypassing the common layer (find any stray `pg.connect`/pool → close it) (✓ node scripts/check-db-chokepoint.mjs — OK, 2026-07-23)

### Enforce (flip on TEST)

- [~] Apply helper policies + `phase4-force-rls-cutover.sql` (FORCE RLS) on the TEST DB (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; deploy/postgres/phase4-force-rls-cutover.sql ready, flipped+reverted 2026-07-13)
- [~] `DB_PRINCIPAL_CONTEXT_MODE=locked` + signing secret in `webapp.test` (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; current runtime default legacy-guc, reverted from locked)
- [~] Flip inside a maintenance window (tech mode) → restart units → lift maintenance (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; performed 2026-07-13 then reverted to dormant)
- [~] health green, all test units active, WireGuard prod relay untouched (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; verified once 2026-07-13 under enforce, now dormant)

### Safety

- [x] One-command ROLLBACK ready (FORCE off + back to owner/legacy-guc) in case something is wrong in the morning (✓ deploy/postgres/phase4-force-rls-cutover.sql -v phase4_force_rls_down=1 + env DATABASE_URL→owner + mode=legacy-guc, RESULT line 102)

---

## B. RESULT CHECKLIST — what YOU verify in the morning (owner acceptance)

### Login works under the walls

- [~] Log in as Клиника 2 doctor (`demo2clinic@example.com` / `demo1234`) — login succeeds with walls ON (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; proven once live 2026-07-13 login 200, system now dormant — owner re-acceptance needed)

### Isolation — Клиника 2 does NOT see Точка Здоровья (re-check each surface that leaked)

- [~] «Сегодня» — no Точка Здоровья patient signals (awaiting live cutover — proven 2026-07-13: clinic-2 patients {"clients":[]}, now dormant)
- [~] KPI numbers — mine (0), not Точка Здоровья's (awaiting live cutover — proven 2026-07-13: recordsInPeriod=0, now dormant)
- [~] Calendar — empty (my 0 appts), not Точка Здоровья's records (awaiting live cutover — proven 2026-07-13, now dormant)
- [~] Chats — client list empty, NOT Точка Здоровья's clients / last messages (awaiting live cutover — proven 2026-07-13: conversations [], now dormant)
- [~] Broadcasts — audience counts are my clinic's (0) (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; not exhaustively driven 2026-07-13, now dormant)
- [~] CMS / content — mine (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; now dormant)
- [~] Library — I do NOT see Точка Здоровья's patient files (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; now dormant)

### Main clinic still works (walls didn't break it)

- [~] Log in as the main doctor (Точка Здоровья, +79643805480) → I see MY 298 appointments, my library,
  my chats — exactly as before (awaiting live cutover — proven 2026-07-13: main doctor recordsInPeriod=224 own data, now dormant)
- [~] No Forbidden / empty screens on MY OWN pages (awaiting live cutover — proven 2026-07-13: 17 routes 0×HTTP 500, now dormant)

### Kill switch

- [x] Walls can be turned OFF with one command (back to dormant) if anything is wrong (✓ deploy/postgres/phase4-force-rls-cutover.sql -v phase4_force_rls_down=1 + env→owner + mode=legacy-guc, RESULT line 102)

---

## OVERNIGHT STATUS (2026-07-13, updated live)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] Wall roles + grants on TEST DB (done, non-disruptive).
- [x] **Core code already present** — `sessionPrincipal.ts` already resolves org from session membership +
      stamps staff/patient principal. No code change needed for staff reads.
- [x] Both doctors have active memberships (main=doctor@a0000000, 2nd=owner@ed63b540) → neither fails-closed.
- [x] **PROOF on a byte-clone of the TEST data** (`bcb_saas_c1_rehearsal_*`): staff+clinic2 context sees
      **0** of clinic1's 298 appts and 0 of its 225 conversations (incl. a direct org-id IDOR attempt = 0);
      staff+clinic1 sees its 298/225; no-context = fail-closed. **Login SURVIVES under FORCE** (login tables
      have RLS disabled → governed by grants). pgcrypto relocation to app_ext is safe (runtime uses Node crypto,
      not PG pgcrypto).
- [ ] **Live-test flip DEFERRED (safety):** `FORCE RLS` is DB-wide → it also governs the background units
      (worker/scheduler/integrator/media) which do NOT yet stamp a principal → they fail-closed under FORCE.
      A safe live flip therefore needs the principal FANOUT to all units + the two-pool topology (a runtime role
      distinct from `app_staff` — proven necessary: a combined role breaks the bootstrap NULL-org PII path).
      This is real build work, NOT a safe 6am autonomous flip. **TEST stays working DORMANT.**
- Next safe steps (on the clone, no live-test risk): two-pool pool-provider code; principal stamping in the
  background units; then a full clone rehearsal of login+isolation THROUGH the running app; only then flip live.

### Update 2 (heartbeat cycle ~05:50)

- [x] Webapp two-pool code committed (63f149c8c), 20 unit tests verified green locally. Dormant-safe
      (falls back to single DATABASE_URL when DATABASE_URL_STAFF/NONSTAFF unset).
- [x] Full grounded architecture doc written: `TENANT_ISOLATION_ARCHITECTURE.md` (awaiting owner sign-off).
- [x] app_worker narrow-grant surface grounded: media-worker touches `media_files`, `media_transcode_jobs`,
      `system_settings`; integrator ALREADY has its own principal layer (`integratorPoolProvider` +
      `infra/principal/organizationPrincipal.ts`) → inbound is already org-aware; fanout is smaller than feared.
- **BLOCKER for the live flip (honest):** the enforce flip + its break/fix is (a) iterative across webapp +
  integrator + media-worker (FORCE is DB-wide), (b) owner explicitly wants to be in the loop for the test
  break/fix, and (c) NOT safely completable in one autonomous pass without risking a broken test mid-fix.
  So the live FORCE flip waits for an owner-driven session. Autonomous prep (safe, no live-test impact)
  continues: two-pool committed, architecture grounded, app_worker grant-set mapped. TEST stays working DORMANT.

## RESULT (verified live 2026-07-13 ~06:5x, HEAD 6146ed139) — WALLS ENFORCED & WORKING ON TEST

Independently re-verified by the lead against reality (not agent report):

- Login as BOTH doctors (demo2clinic@example.com / dimmdao@yandex.ru, pw demo1234) → 200.
- 17 doctor routes swept as clinic-2 → **0 HTTP 500** (the ~44-route re-stamp bug fixed CENTRALLY in
  `ensureDbPrincipalContext` — one place, per-route patches reverted).
- **Isolation (the leak you saw, now closed):** clinic-2 `schedule-kpis recordsInPeriod=0`, `conversations []`,
  `patients {"clients":[]}`; IDOR on a Точка-Здоровья patient → 404. Main doctor → `recordsInPeriod=224`, own data.
- Background units (worker/scheduler/api/media) active, **0 fail-closed/permission-denied lines** in 5 min.
- health ok, all 5 units active, prod WireGuard relay untouched.
- One command flips OFF (rollback): `phase4-force-rls-cutover.sql -v phase4_force_rls_down=1` + env DATABASE_URL→owner + mode=legacy-guc + restart.

### NOT-DONE / caveats (honest)

- PATIENT login/registration under enforce NOT verified (staff-focused pass; bootstrap uses nonstaff pool — may be rough).
- Actual message/broadcast DISPATCH not driven end-to-end (units up, no fail-closed spam, but no live send tested).
- Route sweep sampled ~17; central fix should cover all but not every route exhaustively hit. taskdb #725 tracks the residual audit.
- Main doctor given a password (demo1234) for the demo; his real login is phone/OTP.
- Integrator duplicate-table cleanup (T0.4) and marketplace (#724) are separate, deferred, NOT walls blockers.

## Honest caveats (stated up front, not hidden)

- **Patient login / registration under enforce may be limited** until the `app_patient` pool is fully wired
  — the morning test focuses on the STAFF side (the isolation you saw leak). I will report patient-side status.
- **Exercise catalog** visibility ("магазин наборов") is a separate product decision, not a walls item.
- Morning report will mark each build item green ONLY after it is verified against reality (a running query /
  a driven request), never from "code written". Anything not verified is listed under "NOT DONE".
