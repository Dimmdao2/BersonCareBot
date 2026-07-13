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
- [x] Wall roles `app_staff` / `app_patient` created on the TEST DB (LOGIN, NOBYPASSRLS, no cross-membership)
- [ ] Apply `p0-5b-grants.sql` — table grants to `app_staff` / `app_patient` on the TEST DB
- [ ] Create the two runtime LOGIN credentials + point `webapp.test` DATABASE at a NON-owner login (staff pool)

### Core (the one chokepoint)
- [ ] Single DB layer derives the **organization from the session** (resolve membership) and stamps the
      signed principal context — in ONE place, on every query (no per-route work)
- [ ] **Bootstrap/login path works under enforce**: pre-session queries (password login, OTP) run under the
      bootstrap principal so the owner can actually LOG IN with walls on (critical — else nobody gets in)
- [ ] Audit: no query reaches the DB bypassing the common layer (find any stray `pg.connect`/pool → close it)

### Enforce (flip on TEST)
- [ ] Apply helper policies + `phase4-force-rls-cutover.sql` (FORCE RLS) on the TEST DB
- [ ] `DB_PRINCIPAL_CONTEXT_MODE=locked` + signing secret in `webapp.test`
- [ ] Flip inside a maintenance window (tech mode) → restart units → lift maintenance
- [ ] health green, all test units active, WireGuard prod relay untouched

### Safety
- [ ] One-command ROLLBACK ready (FORCE off + back to owner/legacy-guc) in case something is wrong in the morning

---

## B. RESULT CHECKLIST — what YOU verify in the morning (owner acceptance)

### Login works under the walls
- [ ] Log in as Клиника 2 doctor (`demo2clinic@example.com` / `demo1234`) — login succeeds with walls ON

### Isolation — Клиника 2 does NOT see Точка Здоровья (re-check each surface that leaked)
- [ ] «Сегодня» — no Точка Здоровья patient signals
- [ ] KPI numbers — mine (0), not Точка Здоровья's
- [ ] Calendar — empty (my 0 appts), not Точка Здоровья's records
- [ ] Chats — client list empty, NOT Точка Здоровья's clients / last messages
- [ ] Broadcasts — audience counts are my clinic's (0)
- [ ] CMS / content — mine
- [ ] Library — I do NOT see Точка Здоровья's patient files

### Main clinic still works (walls didn't break it)
- [ ] Log in as the main doctor (Точка Здоровья, +79643805480) → I see MY 298 appointments, my library,
      my chats — exactly as before
- [ ] No Forbidden / empty screens on MY OWN pages

### Kill switch
- [ ] Walls can be turned OFF with one command (back to dormant) if anything is wrong

---

## OVERNIGHT STATUS (2026-07-13, updated live)
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

## Honest caveats (stated up front, not hidden)
- **Patient login / registration under enforce may be limited** until the `app_patient` pool is fully wired
  — the morning test focuses on the STAFF side (the isolation you saw leak). I will report patient-side status.
- **Exercise catalog** visibility ("магазин наборов") is a separate product decision, not a walls item.
- Morning report will mark each build item green ONLY after it is verified against reality (a running query /
  a driven request), never from "code written". Anything not verified is listed under "NOT DONE".
