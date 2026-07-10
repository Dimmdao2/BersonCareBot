# R2 enforcement prep — Trek B plan (autonomous engineering track)

Single source of "done" for the pre-flip engineering work (owner rule #1). Ops/deploy/flip
(Trek A steps 2-3, Trek C steps 9-10) are owner-gated and NOT in this file. Report = closed X/N
against this checklist + a "НЕ СДЕЛАНО" section. Each item: worker → independent audit → owner.

Goal: get from "dormant foundation on feat" to "provably safe to flip FORCE RLS", without
touching test/prod. All work is code + scratch-DB only. No push to main/test, no deploy, no flip.

## Context (established)
- R1 dormant foundation + T0.1–T0.4 context plumbing done; 3 R2-readiness holes closed on `feat`
  (taskdb #645–#650), CI green, pushed to `origin/feat`, C1 NOT NULL verified on dev.
- Isolation PATTERN proven live: `smoke-p0-13-db-isolation.mjs` OK (NOBYPASSRLS + FORCE RLS + 2 orgs
  + patient wall, hand-written policies on a compat schema).

## Checklist

- [ ] **B6 — real-policies 2-org proof.** Upgrade the pattern smoke to the ACTUAL migration-generated
      policies on the REAL schema: fresh scratch DB → apply real webapp Drizzle (0141–0168) + integrator
      (I1–I4, C1) migrations → seed a 2nd org + 2nd patient → NOBYPASSRLS role → assert cross-tenant deny
      across a representative set of the real SCOPED policies (not just the ~10 hand-picked ones).
      Gate: org wall + patient wall + fail-closed hold under the real generated policies. Scratch only.
- [x] **B4-core — patient-wall in real policies (Opus design + Sonnet impl).** DONE 2026-07-11
      (taskdb `#653`, LOG.md entry "B4-core patient wall in real RLS policies"). OWNER DECISION
      (2026-07-11): doctor visibility = **org-wide (variant A)** — NO assignment predicate in RLS.
      Patient wall = **absolute**: a patient sees ONLY their own rows, never any other patient's, in
      any org context. Wired `renderStaffOrPatientPredicate` (rls-sql-renderer.mjs) into the real
      policy generators/descriptors (`rls-descriptor-model.mjs` `patientOwnedColumns` registry — 60
      tables; `p0-8-3/4/5-policy-targets.mjs`; `p0-9-enforce-descriptors.mjs`) for patient-owned SCOPED
      tables with the fail-closed staff-vs-patient shape:
      `org match AND ( current_setting('app.actor')='staff' OR (app.patient_user_id IS NOT NULL AND <patient_col> = app.patient_user_id) )`.
      Staff session sets `app.actor='staff'` (patient sees all org); patient session sets
      `app.actor='patient'` + `app.patient_user_id` (own only); unset → DENY. A patient session can NEVER
      set actor='staff' (separate authenticated code path — that wiring is B4-fanout, not touched here).
      Proved via the real-policy smoke (`smoke-r2-real-policy-isolation.mjs`, exit 0): patient A≠B
      deny, staff sees all org, unset denies, org wall holds for patient sessions too, bigint integrator
      identity path proven on `integrator.content_access_grants`. New migration
      `0169_p0_8_b4_core_patient_wall_rls.sql` (60 tables). Scope explicitly excludes tables reachable
      only via multi-hop FK/JOIN chains (documented in LOG.md, not silently dropped) — see LOG.md for
      the full excluded-table list and rationale.
- [ ] **B4-fanout — read-context wrapper + coverage.** The chokepoint read wrapper sets `app.org` +
      `app.actor` (+ `app.patient_user_id` for patient sessions) on every SCOPED read, per session type.
      Apply per process family (webapp readers, integrator DbPort/pool, scheduler, media). Unset → dormant.
      **MODEL SPLIT:** wrapper contract = Opus design; the uniform mechanical sweep across N reader
      call-sites is a **Codex candidate** once the wrapper is designed (bulk, repetitive, well-specified —
      Codex's sweet spot). Security-sensitive spots stay Sonnet-under-audit.
- [ ] **DEFERRED (not now, owner 2026-07-11):** "my patients" soft default filter (UX relevance, not a
      security wall) — try at port level later if needed, no toggle for now. Hard assignment/handoff RLS
      (variants B/C) — only under a future large-clinic business order.
- [ ] **be_organization_members tier review:** currently BOOTSTRAP-global (membership cross-tenant
      readable). Decide if it should be BOOTSTRAP-hybrid before flip. (B6 finding, minor.)
- [ ] **B4-fanout — apply read context per process family (Sonnet, one worker each).** webapp route
      readers; integrator `DbPort.query`/pool Drizzle paths; scheduler/queue; media claim/reclaim.
      Each: reads run under principal; unset context preserves dormant behavior; targeted tests + audit.
- [ ] **B5 — non-bypass DB app role.** Materialize the `NOBYPASSRLS` app role + grants (P0.5), scratch
      prod-parity proof that the app's queries work under it with policies dormant. Runtime role flip = ops (owner).
- [ ] **B7 — shadow-mode toggle.** A GUC/flag "log RLS violations, don't deny" mode so a staging
      shadow-run can surface any query that would break under enforcement. Code + unit only.
- [ ] **B8 — flip plan + rollback (Opus).** Draft the controlled permissive→FORCE + role-switch plan
      with rollback, behind a flag/GUC. Owner approves; execution is ops.

## Done today
- [x] Pattern isolation proof re-run green (`smoke-p0-13-db-isolation.mjs`).

## НЕ СДЕЛАНО / owner-gated (not in this track)
- Deploy dormant foundation to test/prod; run migrations on test/prod; push to main/test.
- The actual R2 enforcement flip (FORCE RLS + role switch) on any shared env.
- Milestone acceptance of the 3-holes work.
