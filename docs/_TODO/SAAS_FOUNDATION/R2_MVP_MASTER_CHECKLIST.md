> STATUS (verified 2026-07-23, code-reconciled): see docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md

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

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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
- [x] **B4-roles-1** — owner decision: separate DB roles instead of a GUC flag for the staff bypass
      (`app.actor='staff'` was settable by ANY session, patient sessions included — not a real
      security boundary). New canonical helper `app.is_staff()` (schema `app`, SECURITY INVOKER,
      STABLE) = `pg_has_role(current_user, 'app_staff', 'MEMBER')` — single source of the staff role
      name. `rls-sql-renderer.mjs` `renderStaffActorCheck()` is the one chokepoint every
      staff-or-patient predicate shape (direct/chain/conditional/conditional-chain/polymorphic) calls
      through, so this one change flips ALL of them. Mig
      `0175_p0_8_b4_roles_1_is_staff_wall_rls.sql`: creates schema `app` + `GRANT USAGE ON SCHEMA app
      TO PUBLIC` (found live — without it, ANY non-superuser NOBYPASSRLS role gets a hard
      `permission denied for schema app` instead of allow/deny) + `app.is_staff()`, then re-creates
      (byte-for-byte generator output) the dormant policy for all **102 patient-owned SCOPED tables**
      (same 102 as 0169-0174 — only the staff-bypass mechanism changed). New
      `deploy/postgres/p0-5b-role-split-staff-patient.sql` creates fixed roles `app_staff`/
      `app_patient` (LOGIN NOBYPASSRLS, no credential) and asserts `app_patient` has NO membership in
      `app_staff` — the actual security invariant. Proven live on scratch by new
      `smoke-b4-roles-1-staff-role-boundary.mjs`: (a) `app_staff` sees org-wide; (b) `app_patient`
      sees own-only; (c) **`app_patient` cannot `SET ROLE app_staff`** — Postgres rejects it (the
      boundary the old GUC never had); (d) empty context denies. `check:saas-db-regression` green
      (unchanged descriptor/target counts, only predicate text changed). **NOT DONE / flagged:**
      table-level GRANTs for the two roles (B5-v2, separate), wiring them into any real
      `DATABASE_URL` (B4-fanout, below), `smoke-r2-real-policy-isolation.mjs` phase 5 is now stale
      (documented in that file, not fixed — needs a two-role restructure out of scope here), and a
      **residual risk**: `app.patient_user_id`/`app.integrator_user_id` are STILL plain GUCs — an
      `app_patient` session could still `SET app.patient_user_id` to a victim's id (identity
      impersonation, not staff impersonation — a separate follow-up, e.g. `GRANT SET ON PARAMETER`).
      Cluster-topology note: `app_staff`/`app_patient` are fixed cluster-global role names; if dev+prod
      share one Postgres cluster (per `host-psql-database-url.mdc`), B4-fanout wiring will need a
      per-environment namespacing decision, not resolved here. (#662)
- [x] **B5** — non-bypass app DB role + grants materialized (P0.5), static check green; live scratch
      proof by lead. New `deploy/postgres/p0-5b-grants.sql` (generated by `p0-5b-grants-sql.mjs`)
      grants the fixed `app_staff`/`app_patient` roles (B4-roles-1) on top of their existing
      no-grants state: `app_staff` gets the FULL runtime surface — 219 tables, mechanically derived
      from `tiers-218.tsv` (SCOPED+BOOTSTRAP+INFRA+LEGACY+TELEMETRY minus 4 pure migration-bookkeeping
      tables) — closing cross-model finding #3 below (INFRA queues/outboxes were previously
      ungranted); `app_patient` gets a CURATED 111-table patient-only surface (the 102 patient-owned
      SCOPED tables + 9 confirmed BOOTSTRAP identity/settings tables), SELECT by default with
      INSERT/UPDATE/DELETE added only on the 38+6 tables a 2026-07-11 code audit traced to a confirmed
      patient-authenticated write path — full table-by-table rationale + explicitly flagged
      uncertain tables in new `P0_5B_GRANTS.md`. Also fixed the SAME one-hop `pg_auth_members`
      transitive-membership bug B4-roles-1 already fixed in `p0-5b-*` inside the older single-role
      `p0-5-role-split.sql` (`pg_has_role` now used there too; `check-p0-5-role-split.mjs` +
      `--self-test` still green, byte-sync with the regenerated ops SQL intact). New live-scratch
      smoke `smoke-p0-5b-grants.mjs` proves, using the REAL generated grant metadata against 3
      representative real table names: `app_staff` reads a patient-owned table AND an INFRA queue
      table (`integrator.projection_outbox`); `app_patient` reads its own patient-owned row but gets
      `permission denied for table` on both a staff-only SCOPED table (`patient_merge_candidates`)
      and the same INFRA table — all 4 confirmed live. `check:saas-db-regression` green (30
      sub-checks); `smoke-b4-roles-1-staff-role-boundary.mjs` unaffected. **NOT DONE / flagged**
      (owner+B4-fanout triage, see `P0_5B_GRANTS.md`): `org_enrollments` write grant based on
      file-level coupling, not an independently traced call site; the entire payment/package family
      (`be_payments`/`be_patient_packages`/`be_refunds`/etc.) is SELECT-only pending confirmation of
      whether patients trigger their own payment intents; `system_settings`
      (non-audit)/`user_channel_bindings`/`platform_user_contacts`/`user_phone_history` are
      SELECT-only on "no confirmed write path found"; the 9 pre-session auth-flow BOOTSTRAP tables
      (`login_tokens` and siblings) are entirely excluded from `app_patient` (which role should own
      that flow is an explicit, undecided B4-fanout question); no automated `check-p0-5b-grants.mjs`
      doc/ops-sql fragment check was added to the gate (dormant grants only, judged out of scope,
      reasonable low-cost follow-up); the older single-role `p0-5-role-split.sql` was NOT
      deleted/deprecated — both artifacts coexist, B4-fanout decides which one gets wired up. (#655)
- [ ] **B4-fanout** — read-context wrapper contract (Opus design): staff sessions become/authenticate
      as the `app_staff` role; patient sessions become/authenticate as `app_patient` +
      `app.patient_user_id` (+ `app.integrator_user_id`) — role split done by B4-roles-1 above
      (`app_patient` structurally cannot become `app_staff`, proven live); this item is the
      APPLICATION-layer wiring (webapp readers, integrator DbPort/pool, scheduler, media) that
      actually connects/switches to the right role per session — mechanical sweep = **Codex**.
      DoD: every SCOPED read runs under the right role + GUCs; unset → dormant; staff never gets 0 rows.
      (REMAINING: full role-switch sweep completeness + live wiring not proven this pass. BUILT so far —
      webapp two-pool provider apps/webapp/src/infra/db/webappPoolProvider.ts (staff/nonstaff/bootstrap
      by principal kind, falls back to single DATABASE_URL when unset), sessionPrincipal.ts stamping,
      integrator apps/integrator/src/infra/principal/organizationPrincipal.ts, media-worker app_worker.
      Still open — exhaustive per-reader coverage across ALL units + "staff never 0 rows" proof + live
      DATABASE_URL_STAFF/NONSTAFF activation; residual route audit taskdb #725)
- [ ] **B7** — shadow-mode toggle (log RLS violations, don't deny) for the staging shadow-run.
      (REMAINING: "shadow" mode enum exists in packages/db-principal/src/index.ts:243 and stamps GUCs like
      locked, but the log-violations-without-deny staging shadow-run behavior + toggle wiring is not
      code-verified complete — target db-principal shadow path + staging shadow harness)
- [ ] **B8** — flip plan + rollback drafted (permissive→FORCE + role switch, behind flag/GUC). Owner approves.
      (owner-gated — PHASE4_ROLLOUT_RUNBOOK.md + deploy/postgres/phase4-force-rls-cutover.sql; plan+rollback
      drafted, owner approval pending)
- [ ] **be_organization_members** tier review (BOOTSTRAP-global → hybrid?) decided.
      (REMAINING: record the explicit BOOTSTRAP-global vs hybrid tier decision for be_organization_members —
      table is now tiered/green in check-p0-10-tier-completeness but the hybrid-vs-global ruling is not
      documented — target tiers-218.tsv + a decision note)
- [ ] **M1 exit proof:** `smoke-r2-real-policy-isolation.mjs` green covering org+patient+chain+fail-closed;
      `check:saas-db-regression` green; full `pnpm run ci` green; `feat` pushed.
      (REMAINING: DB-backed smoke-r2-real-policy-isolation.mjs + full `pnpm run ci` + `feat` push not
      runnable/verifiable in this DB-free reconciliation pass; check:saas-db-regression sub-checks confirmed
      green 2026-07-23 — target: run DB-backed suite under owner-run scratch)

## M2 — R2 enforcement flip — ⛔ OWNER-GATED (I prep, owner executes)
- [~] Deploy dormant foundation to **test** → run migrations → single-clinic behavior unchanged. (awaiting live cutover — SAAS_DEPLOY_SEQUENCE.md; owner-executed)
- [~] Deploy to **prod** (DB backup first) → migrations incl C1 → schema guardrail. (awaiting live cutover — SAAS_DEPLOY_SEQUENCE.md; owner-executed)
- [~] Non-bypass role + `FORCE` flip on **test/staging** → app works, cross-tenant denied, rollback ready. (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; owner-executed; proven once on TEST 2026-07-13 then reverted)
- [~] Flip on **prod** after staging proof. (awaiting live cutover — PHASE4_ROLLOUT_RUNBOOK.md; owner-executed)
> I produce: the exact runbook + rollback + shadow-run results. Owner pushes the buttons.

## M3 — R3 tenant self-service (MVP-critical) — ⏳ NEXT after M1

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

**DoD:** a solo specialist self-registers → gets own isolated org → own working space, **no manual SQL**.
- [ ] **Admin/doctor account separation** (backend seam): distinct principals/roles, no entangled account.
- [ ] **Org self-provisioning service**: create org + seed first member + defaults, programmatically.
- [ ] **Basic org admin**: create/configure/invite (backend + minimal screens; rich UX = owner vision).
- [ ] **Seam: entitlements/capabilities** — per-org capability set + `requireEntitlement` gate, default
      "all enabled" (dormant). Contents/tiers = owner vision, parked.
- [ ] **Seam: billing-account** shell (per-org), empty.
- [ ] **Seam: branding-as-config** (org name/logo as config, not hardcode), default = platform brand.

## M4 — R4 patient cabinets + multi-org — later

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] One global login + per-clinic enrollments; patient switches org; strictly own data everywhere.

## M5 — R5 commercialization — later (heavy owner vision)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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
- [x] **(2) OWNER DECISION — patient-wall trust model.** `app.actor='staff'` is a custom GUC settable by ANY SQL on the connection → the wall defends against FORGOTTEN filters, NOT against arbitrary-SQL/injection. For a truly "absolute" patient wall, use **separate DB roles for patient vs staff paths** (staff-bypass keyed on the role, not a user-settable GUC) — or at minimum a server-only guard on `set_config('app.actor',...)`. Decide BEFORE the enforcement flip. Not blocking dormant work. **DECIDED + DONE by B4-roles-1 above (#662): separate roles `app_staff`/`app_patient`, staff bypass keyed on `app.is_staff()` role membership, proven live that `app_patient` cannot escalate.** Residual: `app.patient_user_id` GUC identity-impersonation is still open (flagged in B4-roles-1's entry), and the app-layer connection wiring (B4-fanout) is still pending.
- [x] **(3) B5 under-grants runtime.** App role grants only SCOPED+BOOTSTRAP, but the runtime role (webapp/integrator/worker/scheduler/media) also touches **INFRA** queues/outboxes (`projection_outbox`, `integrator_push_outbox`, `outgoing_delivery_queue`) + LEGACY/TELEMETRY → PERMISSION DENIED after flip. Grant scope ≠ RLS tier: the role needs DML on ALL tables it queries. Fix: expand grants to the runtime's full surface (or a separate infra-runtime role). Add a **pre-flip process-family smoke** running each process under the app role. **FIXED by B5 above (#655): `app_staff` now grants the full 219-table runtime surface (SCOPED+BOOTSTRAP+INFRA+LEGACY+TELEMETRY, minus 4 migration-only tables), proven live to read an INFRA queue table.** Residual: the "pre-flip process-family smoke running each REAL process under the app role" this finding also asked for is still NOT done — that requires the B4-fanout application-layer connection wiring to exist first (a process can't run "under app_staff" until something actually connects it as that role), so it stays a B4-fanout deliverable, not closed here.
- [x] **(4) Don't call R2 complete until chain-only walls closed** — B4-core-2 in flight.

Gate tightened: **no runtime role flip (even on test) until #1 GUC align, chain-only walls, B4-fanout wrapper, and #3 INFRA grants are all resolved.**
