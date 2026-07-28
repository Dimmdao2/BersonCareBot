# R1 — Finish line correction + stale-doc hygiene · worker: gpt-5.6-terra · audit: gpt-5.6-sol

> ⚠️ **ИСТОРИЧЕСКАЯ ЗАПИСЬ (frozen, 2026-07-15).** Это frozen independent-audit stage record — не текущий
> план. Пивот к TEST-first/no-prod-cutover, зафиксированный здесь, действует как ground truth дальше в:
> [`SEQUENCE.md`](SEQUENCE.md), [`OWNER_RULINGS_2026-07-15.md`](OWNER_RULINGS_2026-07-15.md),
> [`SAAS_ENFORCE_ROADMAP.md`](SAAS_ENFORCE_ROADMAP.md) (canonical plan).

> Stage owner: orchestrator (Claude/Opus), 2026-07-15. Follows R0 (`SAAS_R0_PLAN_RECONCILIATION.md`), whose
> independent Sol audit returned **4/9**, not the worker's claimed 9/9. This stage fixes the doc-level failures
> from that audit AND corrects a much bigger problem: **the roadmap's definition of done describes a path the
> owner is not taking.**

> **2026-07-27 checkbox pass (owner canon `BACKLOG_CONSOLIDATION_2026-07-26.md` §6.3).** Was: 4 open boxes
> (R1.1/R1.4/R1.5/R1.6) counted as live backlog by raw grep. Now: all 4 marked `- [-]` 🧊 frozen — permanent
> audit-FAIL verdicts on a historical stage record, not unstarted work; this record's own line 17 forbids
> reticking them. Why: same class of miscount as R0. **Note on the "no prod cutover" quote below (line 33):**
> the owner clarified 2026-07-27 that this means the _current_ legacy host is never upgraded in place — a _new_
> prod host is built and the database is moved onto it. See `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §6. This
> pass did not touch that quote or the surrounding prose — recorded here only so a future reader of this frozen
> record doesn't misread it as "no new prod, ever."

> **Independent audit verdict (frozen): 2/6.** PASS: R1.2, R1.3. FAIL: R1.1, R1.4, R1.5, R1.6. The checkboxes
> below encode that audit verdict, not the worker's self-report. A later convergence stage may repair the
> underlying documents and link the repair, but must not retick this historical stage record.

## The owner's actual path (stated 2026-07-15) — this is the ground truth for this stage

1. Everything is brought to a fully production-grade working state **on the TEST server**, not on prod.
2. On test: raise as many organizations as needed, create test clients, exercise every role, make admins,
   verify all settings actually work.
3. On test: also finish the UI and rework route infrastructure — main landing, separate entrance for
   specialists, separate entrance for clients.
4. **Only then** the system moves to production as a **copy**: copy the folder, rename the project from
   `bersoncare` to `therapysto`/`therapio`, deploy on a **new domain**.
5. By then it must have polished UI, payments, a store with several exercise packages, and a configured tariff
   grid. That is what he shows investors.

**Consequences that this stage must write into the canon:**

- **The old `bersoncare` production is LEGACY and frozen. There will be NO prod cutover — ever.** We are not
  migrating it; we are leaving it. The new deployment is **born with walls enforced**.
- Therefore **R3/R4 as currently written — "one owner command flips ON, one flips OFF", the F1 flip state
  machine, the F2 wrappers, the dormant→ON→OFF→ON→OFF rehearsal — solve a problem that does not exist on this
  path.** An OFF lever is rollback insurance for cutting over an _existing_ prod. There is no such cutover.
  Worse: rolling walls OFF on a live multi-tenant SaaS means showing clinic A's data to clinic B — during an
  investor demo that is worse than downtime. **F1/F2 must stop being requirements**, or the next agent will
  spend days building them.
- **TEST is the working environment.** "На живом" means on test. Live work on test is sanctioned: multiple orgs,
  test clients, role exercises, wall fixes, Rubitime drop. Walls have been live-enforced on `bersoncarebot_test`
  since 2026-07-13.
- **Walls are a foundation piece, not the finish line.** The bulk of remaining work is product: UI, route/landing
  infrastructure, payments, store, tariffs.

## Stage checklist

The independent result is `closed 2/6`. Do not tick from worker self-report or from a checker exit that does not
prove the asserted property.

- [-] ~~**R1.1 — AUDIT FAIL.** `SAAS_ENFORCE_ROADMAP.md` section 0 ("FINAL RESULT / fixed definition of done") is rewritten to the
  owner's actual path above. Specifically: R1/R2 (product parity + isolation on test, multi-org) **stay** and
  remain the real bar; **R3 and R4 are struck as requirements** with a short explicit note saying why (no prod
  cutover exists on this path; OFF on a live multi-tenant SaaS leaks clinic A to clinic B); R5
  (observability/auditability) stays but is rescoped to "find what breaks under enforce on test", not
  "cutover decision thresholds". Replace the "Overall acceptance commands" block (which centres on
  `flip-saas.sh --target test on|off`) with commands that match the real path. **Do not delete the old text
  silently — move it to a clearly marked historical note** so the reasoning is not lost. The audit found that
  the rewritten result omitted payments, the exercise-package store, and the tariff grid, while live G12,
  signing-key, and review prose still required the superseded flip/OFF path.~~ — 🧊 ЗАМОРОЖЕНО 2026-07-27: permanent audit-FAIL verdict on a frozen historical stage; line 24 of this file — "A later convergence stage may repair the underlying documents and link the repair, but must not retick this historical stage record." Forward continuation (context only, not "moved work"): `SAAS_ENFORCE_ROADMAP.md`, `SEQUENCE.md`, `OWNER_RULINGS_2026-07-15.md`.
- [x] **R1.2 — AUDIT PASS.** Phases F1, F2 and G2 in section 2 get an explicit status marker: **NOT REQUIRED on the current
      path (owner, 2026-07-15)**, with the one-line reason. Do not delete the phases. G1 (owner-facing TEST
      acceptance) **stays and becomes more important**, not less.
- [x] **R1.3 — AUDIT PASS.** `TENANT_HARD_MODE_EXECUTION_PLAN.md` is **moved out of `docs/_TODO/`** into an archive location
      (use `git mv`; pick the location by the repo's existing convention — if none exists, create
      `docs/_ARCHIVE/` and say so). Reason: a file living under `_TODO` reads to any agent as "to do". Its header
      becomes unambiguous: **"НЕ ЗАПУСКАТЬ ПО НЕМУ АГЕНТОВ / DO NOT EXECUTE."** — it is not an execution plan, it
      was never approved, its 143 items were never executed, the goal was reached by another route, and its
      unique scope lives in the R0 register (link it). Keep the body intact as a record of the reasoning. Fix
      every inbound reference to the old path so nothing dangles (`RUBITIME_RETIREMENT_EXECUTION_PLAN.md:46,667,771`,
      `RUBITIME_RETIREMENT_SECTION10_DOCS_MANIFEST.md:21`, `SAAS_PRODUCT_SMOKE_A1.md:12`, and any others — search).
- [-] ~~**R1.4 — AUDIT FAIL.** _(fixes R0.3, which the audit failed)_ The R0 scope register in `SAAS_ENFORCE_ROADMAP.md` is
  missing the public-booking/webhook tenant-source scope (draft O9 / H6). Add it. Then re-verify the whole
  register against the draft's §5, §6.1, §7, H0–H8 and O1–O13 and add anything else missing. The audit still
  found H6 `profile`, H0's method-level Store matrix, and the global/org `system_settings` write split absent.~~ — 🧊 ЗАМОРОЖЕНО 2026-07-27: permanent audit-FAIL verdict on a frozen historical stage; line 24 of this file — "A later convergence stage may repair the underlying documents and link the repair, but must not retick this historical stage record." Forward continuation (context only): `SAAS_ENFORCE_ROADMAP.md`, `SEQUENCE.md`, `OWNER_RULINGS_2026-07-15.md`.
- [-] ~~**R1.5 — AUDIT FAIL.** _(fixes R0.4 and R0.9, which the audit failed)_ Two defects:
  **(a)** the 19-phase status table derived D3's status from `TENANT_HARD_MODE_LOG.md` prose, which the stage
  explicitly forbade as a source. Re-derive it from artifacts only.
  **(b)** the R0 row in `TENANT_HARD_MODE_LOG.md` records a PASS claiming the C4 checker "asserts the real
  call chain" — the Sol audit **disproved this with a working bypass** (org principal installed around a
  no-op; real work runs under the restored infra principal; checker still exits 0). Correct that row honestly.
  The stage that existed to purge stale PASSes must not leave a fresh one.
  Also record in the table that live proof of the enforced walls DOES exist but sits in taskdb, not in repo
  artifacts — facts supplied below so you do **not** need DB access. The log row was corrected, but the roadmap
  still cited the bypassable C4 checker "after the R0 checker repair" as evidence and R0 retained the false claim.~~ — 🧊 ЗАМОРОЖЕНО 2026-07-27: permanent audit-FAIL verdict on a frozen historical stage; line 24 of this file — "A later convergence stage may repair the underlying documents and link the repair, but must not retick this historical stage record." Forward continuation (context only): `SAAS_ENFORCE_ROADMAP.md`, `SEQUENCE.md`, `OWNER_RULINGS_2026-07-15.md`.
- [-] ~~**R1.6 — AUDIT FAIL.** _(fixes R0.7, which the audit failed — and it was the orchestrator's bad instruction)_ R0 was told
  "docs say 161, the renderer asserts 163, change docs to 163". That was **wrong**: these are two genuinely
  different sets, not a typo. The strict renderer asserts **163**
  (`scripts/phase4-locked-policy-artifact.mjs:47`); the prod-copy DB-state checker builds its inventory from
  migrations 0160–0176 and expects **161** (`scripts/check-phase4-prod-copy-db-state.mjs:17,211`). The delta is
  exactly two tables: `public.organization_member_invites` and `public.saas_org_entitlement_overrides` —
  **they can have wrong ENABLE/FORCE state and this gate will not look at them.** So `PHASE4_ROLLOUT_RUNBOOK.md:89`
  now asserts something false. Fix the **documentation** to state both numbers and what each covers, and record
  the two-table coverage gap as an explicit open finding for owner triage. **Do NOT change the checkers, do NOT
  "fix" the counts to agree, do NOT touch RLS/policy artifacts** — that is a wall change and needs the owner.
  Also reconcile the remaining stale "161" prose at `TENANT_WALLS_AND_ACCESS_MODEL.md:117`
  (`HANDOFF_2026-07-12.md:12` is historical — leave it, or mark it historical). The two target documents were
  corrected, but R0 itself continued to call 161 stale and to describe the change as 161 → 163, so the false
  framing remained an active evidence contract.~~ — 🧊 ЗАМОРОЖЕНО 2026-07-27: permanent audit-FAIL verdict on a frozen historical stage; line 24 of this file — "A later convergence stage may repair the underlying documents and link the repair, but must not retick this historical stage record." Forward continuation (context only): `SAAS_ENFORCE_ROADMAP.md`, `SEQUENCE.md`, `OWNER_RULINGS_2026-07-15.md`.

## Commit-boundary judgment (R2 convergence)

Commit `4293e9655` changed
`docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-section10-docs.mjs` even though R1 was described as
"documents only." The change was **necessary and is retained**: R1.3 moved the archived draft, while this
documentation-integrity checker pins both its exact path and required disposition. Leaving the checker unchanged
would preserve a dangling `_TODO` path and make the repo's own docs contract disagree with the move. The R1
boundary was therefore too strict for this path-pinning documentation checker; the change did not alter runtime,
RLS, SQL, or integration behavior.

## Facts you need (supplied so you do NOT need any DB or taskdb access)

Live proof of the enforced walls exists and is recorded in the task DB, not in repo artifacts:

- **taskdb #725** — FORCE RLS flip executed live on `bersoncarebot_test` (not a rehearsal clone) on 2026-07-13:
  p2-b protected principal context, locked policies with `enforce=1`, force cutover applied; 3 runtime login roles
  - `app_worker`; all 5 test units green. Proven by curl: clinic-2 doctor logs in, schedule-KPIs all zero,
    conversations empty, IDOR fetch of a clinic-1 patient → **404**; clinic-1 doctor normal (224 records,
    34 conversations). **Residual gap recorded there:** only 2 doctor API routes were patched to re-stamp the DB
    principal; ~44 other routes use raw `getCurrentSession()` and may crash under enforce.
- **taskdb #734** — clinic_admin capability gate live-verified on test: clinic-2 owner manages own clinic (200,
  was 403); cross-org `selectedOrganizationId` rejected; global settings keys blocked.
- **taskdb #735** — 200 interleaved concurrent requests (100 clinic-1 + 100 clinic-2, 50-way parallel): zero
  cross-org leaks.
- **D3 live smoke artifacts** exist in `/tmp` (not repo): progression 4/17 → 13/17 → 16/17 against
  `https://test.bersoncare.ru` in locked mode; the one failure was `patient.program.item.discussion-summary`
  (HTTP 500). Final 17/17 has never run.

## HARD boundaries

- **NO database access of any kind.** Not prod, not test, not dev, not taskdb, not scratch. This is a
  documentation stage; every fact you need is above. If you think you need a DB, you have misread the task — stop
  and say so.
- **NO `/opt/env`, NO SSH, NO service restart, NO deploy, NO live smoke, NO S3, NO real delivery.**
- **Commit to `feat/doctor-ui-rebuild` only, in small meaningful commits. DO NOT push. Never touch `main`/`test`.**
- **Do not touch other people's uncommitted work.** The tree is dirty with two mixed batches: the D3.3–D3.5 work
  and a stopped fixer's SECURITY DEFINER `search_path` sweep. Both must remain uncommitted and unmodified. The
  full classification is in `SAAS_R0_PLAN_RECONCILIATION.md` R0.8. Commit only files this R1 stage itself changes.
- **Do not change any code, checker, SQL, policy or RLS artifact.** R1 is documents only. The one known code
  defect (the C4 gate bypass, R0.6) is deliberately **out of scope** — it is a separate decision.
- **Do not re-litigate the owner's path.** It is recorded above. Execute it.
- Repo rules apply: `AGENTS.md` + `.cursor/rules/*`.
