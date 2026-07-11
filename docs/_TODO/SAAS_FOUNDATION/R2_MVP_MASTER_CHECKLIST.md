# SaaS master checklist — from isolation to the first paying-ready MVP

**Single source of "done" for the whole push.** Outcomes, not vague phases. Each item closes only
with a **verifiable result** (a green smoke/gate, a proven behavior, a merged+pushed artifact) — never
"refined X for a while". Owner reviews this file. Updated by the orchestrator (Opus) after each pass.

## FINAL GOAL (what this whole effort must arrive at)
A premium multi-tenant SaaS **base** where: (1) tenant data is **provably isolated** (org wall +
absolute patient wall) under a non-bypass DB role; (2) a **solo specialist can self-register** and get
their own isolated org/space **without manual SQL**; (3) the **seams** for commercialization
(entitlements/quotas, billing account, branding-as-config) exist and are dormant-safe. Screens, tariff
contents, branding UX, and product polish come after, on top of these mechanisms.

## Anti-drift rules (check every watchdog tick)
- **One trunk = `feat/doctor-ui-rebuild`.** Workers run in isolated worktrees but **every pass ends by
  merging back to `feat` + `git push origin feat`** after audit. No divergent branch lives longer than
  one short pass. Conflicts resolved immediately, never left to pile up (the 2-branch merge pain of
  2026-07-11 must not recur).
- **Each card = one concrete checklist outcome** with a verifiable proof. No open-ended "keep improving"
  loops, no endless micro-slices. If a card can't state its done-proof, it's mis-scoped.
- **Owner-vision items are PARKED, not built** until owner input: tariff contents, feature→tier mapping,
  branding UX, screens/UX, "my patients" filter, R4/R5 product decisions.
- **Every worker output is independently audited** before merge (the audit gate caught real HIGH bugs —
  keep it). Security/isolation code audited at high scrutiny.
- **Ops stays owner-gated:** deploy, push to main/test, migrations on test/prod, the enforcement flip.

---

## M0 — Dormant foundation + R2-readiness holes — ✅ DONE
- [x] R1 Phase-0 dormant schema/policies; T0.1–T0.4 context plumbing.
- [x] 3 R2-readiness holes closed (#645–#650), CI green, on `feat`, C1 NOT NULL verified on dev.

## M1 — R2 isolation code-complete & provable on scratch (Trek B) — 🔄 IN PROGRESS
**DoD:** full isolation provable on a scratch DB under `NOBYPASSRLS` + `FORCE RLS`: org wall denies
cross-org; patient wall denies cross-patient (webapp uuid + integrator bigint, incl. chain-only tables);
staff (`actor='staff'`) sees all-org (variant A); unset context fails closed. Regression gate + full CI
green. Everything merged to `feat` and pushed. **No flip** (that's M2, owner-gated).
- [x] **B4-core** — patient wall on 60 direct-column tables (mig 0169), audit-clean, merged/pushed.
- [x] **B4-core-2** — chain-only patient walls for 11 tables (integrator I2/I3 + support) + integrator GUC
      aligned to `app.integrator_user_id`; smoke proves mixed uuid+bigint patient session sees only own.
      Audit-clean on those 11 + the GUC realign. Also fixed the `\quit 1` non-fatal smoke bug. (#656, merged)
- [x] **B4-core-3** — closed the 9 named PHI chain tables (mig 0171) PLUS **18 MORE found by the
      mandated exhaustive census** (mig 0172): 3 treatment-program denorm chains (incl. a 2-hop
      instance_stage_items/_groups chain), 11 be_appointment_*/be_package_*/be_refunds/
      be_product_history_events/reminder_journal single-hop chains to already-walled parents, and 4
      media_playback_* direct `user_id` columns that had simply been missed — PLUS **1 MORE the
      independent audit caught** (media_upload_sessions.owner_user_id, mig 0173; was falsely excluded
      as "dual-role keyed by usage_purpose", but that column is on media_files, not this table).
      **28 tables newly walled. Census proved by enumeration: 157 SCOPED → 99 walled (65 direct/fk-path
      + 34 chain), 58 excluded, every excluded one org-catalog/booking-config/staff-actor/shared-config/
      dual-role — NONE patient-owned. 0 patient-owned SCOPED remain org-only.** Registered in
      `patientChainOwnedTables`/`patientOwnedColumns`, regenerated (checkers green: P0.8.3 49
      patient-owned + 12 chain, P0.8.4 11 + 15 chain), full `check:saas-db-regression` green,
      `smoke-r2-real-policy-isolation.mjs` green (exit 0) proving A1≠A2 fail-closed (staff sees all;
      mixed uuid+bigint patient sees only own; empty→deny) on a 13-table representative sample of the
      28. (#658) **⚠️ CORRECTED by B4-core-4 below — the "58 excluded / 0 patient-owned remain" claim
      here was FALSE: 3 of those 58 "excluded" tables were actually patient-owned (the "hard"
      conditional/polymorphic cases), found by an independent audit.**
- [x] **B4-core-4** — independent audit (gpt-5.6-sol) found **3 REAL patient-owned SCOPED tables**
      B4-core-3's census had wrongly counted as "excluded, non-patient": `media_files` (dual-role
      `uploaded_by`, disambiguated by `usage_purpose`), `media_transcode_jobs` (inherits `media_files`'
      ownership via its `media_id` FK, no column of its own), and `comments` (polymorphic
      `target_type`/`target_id` — had **NO RLS policy at all**, blocked behind P0.12.1, which is now
      complete). Closed with 2 NEW predicate shapes (`renderConditionalPatientPredicate`,
      `renderConditionalChainPatientPredicate`, `renderPolymorphicPatientPredicate` in
      `rls-sql-renderer.mjs`; `patientConditionalOwnedColumns`/`patientConditionalChainOwnedTables`/
      `patientPolymorphicOwnedTables` in `rls-descriptor-model.mjs`), mig
      `0174_p0_8_b4_core_4_conditional_polymorphic_patient_wall_rls.sql`, same fail-closed
      `org AND (staff OR patient)` shape as every prior B4-core migration. `comments`: 5 of 9
      `target_type` values stay org-wide (catalog, no per-patient owner); 4 resolve to the owning
      patient via a chain (1 to 3 hops deep). Full `check:saas-db-regression` green (P0.8.3 105 = 49 +
      12 + 1 conditional; P0.8.4 38 = 2 FK-path + 35 denorm + 1 polymorphic = 11 + 15 + 1 conditional-
      chain + 1 polymorphic patient-owned), `smoke-r2-real-policy-isolation.mjs` green (exit 0) proving
      staff sees all / patient A1≠A2 / shared-library-and-catalog visible-to-both / empty→deny on all
      3 tables (both comment hop-depth extremes exercised). **CORRECTED CENSUS: as of this entry, 0
      patient-owned SCOPED tables remain org-only, verified across 5 registries** (`patientOwnedColumns`,
      `patientChainOwnedTables`, `patientConditionalOwnedColumns`, `patientConditionalChainOwnedTables`,
      `patientPolymorphicOwnedTables`) — **102 walled** (65 direct/fk-path + 34 chain + 1 conditional +
      1 conditional-chain + 1 polymorphic), **55 excluded** (58 − 3 moved into the walled set), every
      excluded one still org-catalog/booking-config/staff-actor/shared-config/staff-system-queue. Given
      this checklist's own prior "0 patient-owned open" claim was wrong once already, this claim should
      be treated as provisional pending a SECOND independent audit pass before being trusted at face
      value for the M1 DoD. (#660)
- [ ] **B5** — non-bypass app DB role + grants materialized (P0.5), static check green; live scratch
      proof by lead. (#655, Codex)
- [ ] **B4-fanout** — read-context wrapper contract (Opus design): staff sessions set `app.actor='staff'`;
      patient sessions set `app.actor='patient'` + `app.patient_user_id` (+ `app.integrator_user_id`);
      a patient connection is **structurally unable** to set `actor='staff'`. Then apply per process
      family (webapp readers, integrator DbPort/pool, scheduler, media) — mechanical sweep = **Codex**.
      DoD: every SCOPED read carries the right GUCs; unset → dormant; staff never gets 0 rows.
- [ ] **B7** — shadow-mode toggle (log RLS violations, don't deny) for the staging shadow-run.
- [ ] **B8** — flip plan + rollback drafted (permissive→FORCE + role switch, behind flag/GUC). Owner approves.
- [ ] **be_organization_members** tier review (BOOTSTRAP-global → hybrid?) decided.
- [ ] **M1 exit proof:** `smoke-r2-real-policy-isolation.mjs` green covering org+patient+chain+fail-closed;
      `check:saas-db-regression` green; full `pnpm run ci` green; `feat` pushed.

## M2 — R2 enforcement flip — ⛔ OWNER-GATED (I prep, owner executes)
- [ ] Deploy dormant foundation to **test** → run migrations → single-clinic behavior unchanged.
- [ ] Deploy to **prod** (DB backup first) → migrations incl C1 → schema guardrail.
- [ ] Non-bypass role + `FORCE` flip on **test/staging** → app works, cross-tenant denied, rollback ready.
- [ ] Flip on **prod** after staging proof.
> I produce: the exact runbook + rollback + shadow-run results. Owner pushes the buttons.

## M3 — R3 tenant self-service (MVP-critical) — ⏳ NEXT after M1
**DoD:** a solo specialist self-registers → gets own isolated org → own working space, **no manual SQL**.
- [ ] **Admin/doctor account separation** (backend seam): distinct principals/roles, no entangled account.
- [ ] **Org self-provisioning service**: create org + seed first member + defaults, programmatically.
- [ ] **Basic org admin**: create/configure/invite (backend + minimal screens; rich UX = owner vision).
- [ ] **Seam: entitlements/capabilities** — per-org capability set + `requireEntitlement` gate, default
      "all enabled" (dormant). Contents/tiers = owner vision, parked.
- [ ] **Seam: billing-account** shell (per-org), empty.
- [ ] **Seam: branding-as-config** (org name/logo as config, not hardcode), default = platform brand.

## M4 — R4 patient cabinets + multi-org — later
- [ ] One global login + per-clinic enrollments; patient switches org; strictly own data everywhere.

## M5 — R5 commercialization — later (heavy owner vision)
- [ ] Tariff grid, payments, entitlement gating (catalogs/content/schedule/booking/analytics), quotas
      (users/exercises), billing lifecycle, custom domains + premium branding.

## Horizon — R6 marketplace/courses · R7 i18n/regions.

---

## Watchdog cadence (see cron)
Every ~25 min while the run is alive, and via an external OS watchdog if the session dies:
1. **Zombies:** any background agent/codex idle > ~25 min with no progress → TaskStop + relaunch/report.
2. **Depth:** are agents closing real checklist outcomes, or drifting into micro-slices? Redirect if drifting.
3. **Branch discipline:** on `feat`; audited work merged back; `feat` pushed; no lingering divergent branch.
4. **Docs/logs:** LOG.md + this file updated; taskdb statuses honest.
5. **Direction:** are we advancing M1 items toward the M1 exit proof, or polishing non-blockers?

---

## Cross-model direction audit — 2026-07-11 (Codex, independent)
Verdict: **ON-TRACK direction** (milestone order, single-trunk/audit/owner-gated discipline confirmed by a different model family; no product drift). 4 concrete issues:
- [x] **(1) GUC split-brain** — B4-core compares patient predicates to `app.patient_user_id` even for bigint integrator columns; the smoke "proved" bigint by putting a bigint in that uuid GUC (not a real mixed session → cast error / blind under enforcement). **Being fixed by B4-core-2** (align integrator to `app.integrator_user_id`); verify on completion.
- [ ] **(2) OWNER DECISION — patient-wall trust model.** `app.actor='staff'` is a custom GUC settable by ANY SQL on the connection → the wall defends against FORGOTTEN filters, NOT against arbitrary-SQL/injection. For a truly "absolute" patient wall, use **separate DB roles for patient vs staff paths** (staff-bypass keyed on the role, not a user-settable GUC) — or at minimum a server-only guard on `set_config('app.actor',...)`. Decide BEFORE the enforcement flip. Not blocking dormant work.
- [ ] **(3) B5 under-grants runtime.** App role grants only SCOPED+BOOTSTRAP, but the runtime role (webapp/integrator/worker/scheduler/media) also touches **INFRA** queues/outboxes (`projection_outbox`, `integrator_push_outbox`, `outgoing_delivery_queue`) + LEGACY/TELEMETRY → PERMISSION DENIED after flip. Grant scope ≠ RLS tier: the role needs DML on ALL tables it queries. Fix: expand grants to the runtime's full surface (or a separate infra-runtime role). Add a **pre-flip process-family smoke** running each process under the app role.
- [x] **(4) Don't call R2 complete until chain-only walls closed** — B4-core-2 in flight.

Gate tightened: **no runtime role flip (even on test) until #1 GUC align, chain-only walls, B4-fanout wrapper, and #3 INFRA grants are all resolved.**
