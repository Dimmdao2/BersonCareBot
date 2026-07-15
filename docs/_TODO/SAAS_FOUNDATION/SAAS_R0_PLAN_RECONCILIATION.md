# R0 — Plan reconciliation stage · tier: gpt-5.5 · audit: gpt-5.6-sol

> Stage owner: orchestrator (Claude/Opus). Created 2026-07-15 after an owner-facing audit found two rival plan
> documents, an unticked checklist in both, a red gate reported as PASS, and uncommitted work.

## Owner decision being encoded (2026-07-15)

The owner was shown the fact base and the conflict analysis. Decision encoded by this stage:

1. **`SAAS_ENFORCE_ROADMAP.md` remains the canonical plan, but its old cutover finish line is superseded by R1.**
   Current work is TEST-first enforced product readiness followed by a fresh new-domain product copy; frozen legacy
   `bersoncare` production is never cut over.
2. **[`docs/_ARCHIVE/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md`](../../_ARCHIVE/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md)
   is an archived, non-executable reasoning record.** It was never approved or executed; its O1–O13 do **not** gate
   current work, and its unique scope is retained in the roadmap register.
3. **O1 (DB role granularity) is OPEN — do not record it as decided.**
   *(Corrected 2026-07-15 by the orchestrator, who initially overstated this. The owner pushed back: "я не
   уверен что это моё решение, и хочу понять оптимально ли оно сейчас." He is right.)*
   Two different layers were being conflated:
   - **App-layer authorization — decided by the owner 2026-07-13:** clinic-management is authorized by
     **clinic-membership capability at a single backend chokepoint**, not by the global `admin` role. Built and
     live-verified (taskdb #734). This decision stands.
   - **DB-layer role granularity — NOT decided by the owner:** how many Postgres roles exist (the built
     `app_staff`/`app_patient` pair vs the draft's ~12 per-principal roles) is an **engineering choice that was
     made inside the roadmap's C0 ADR**, not an owner ruling. The owner's 13.07 reasoning ("safe because RLS
     already scopes every query to the caller's org under enforce") is *consistent* with the 2-role topology but
     does not settle it.

   **Treat O1 as an open owner-facing question under active discussion (2026-07-15).** It does not block R0 and
   it does not block the roadmap's current phases — the built topology is live-proven (taskdb #725, #734, #735).
   Do not write "the owner decided O1" into any document.
4. **Nothing from the draft is discarded.** Its unique scope is transferred to an explicit register (R0.3) so a
   future stage can pick it up.

**Superseded by R1 owner path:** TEST observability and an all-unit shadow run remain valuable to find enforce
failures, but the old F1 automatic-OFF design is no longer a requirement. There is no legacy-production cutover and
turning walls OFF in a live multi-tenant product risks a cross-clinic disclosure.

## Stage checklist

Each item must be closed with concrete evidence (`file:line`, command + exit code, or commit hash). Report
`closed X/9` against this file. Do not tick an item you did not verify against reality.

- [x] **R0.1** Historical: the roadmap was marked canonical for the former flip path. R1 supersedes that finish line
      with TEST-first enforced readiness and a fresh-product launch.
- [x] **R0.2** Historical draft moved to
      `docs/_ARCHIVE/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md`; its body remains intact as reasoning, but
      its header now says **DO NOT EXECUTE** and links the roadmap register.
      **O1 wording (corrected):** state that O1 is an **open question under owner discussion as of 2026-07-15**,
      that the currently built and live-proven topology is `app_staff`/`app_patient` + app-layer capability at a
      single chokepoint, and that the owner's 2026-07-13 decision covers the **app-layer** authorization model
      only — it does **not** settle DB role granularity. **Do not write "the owner decided O1" anywhere.**
- [x] **R0.3** Scope register: every area the draft covers that the roadmap does **not** is listed in one place
      with a pointer to the draft section, so it cannot be silently lost. Verified-absent-from-roadmap areas:
      broadcasts queue ownership/claim model (draft §7, H1-A), media NULL-row ownership policy (O5, H1-B),
      platform admin / `super-org` + `platform_support` + break-glass (draft §5, O2/O3/O12/O13), references and
      catalog ownership (O4, H7), analytics org attribution / unknown bucket / platform-vs-clinic split (H7),
      Rubitime legacy quarantine timing (O10, H6), multi-org patient enrollment org-derivation rule (O8, H5),
      H0 census → descriptor → entrypoint-matrix pipeline and the 8-class RLS taxonomy (draft §6.1, H0).
- [x] **R0.4** Real per-phase status table for all 19 roadmap phases (A1, A2, B1, B2, C0, C1, C2, C3, C4, D1, D2,
      D3, D4, E1, E2, F1, F2, G1, G2). One row per phase: state ∈ {not-started, repo-artifact-only, live-proven,
      blocked}, evidence (`file:line` / run artifact / commit), and what is still missing for that phase's exit
      criterion. **Derive every status from reality — git, checker exit codes, evidence files — NOT from the
      prose in `TENANT_HARD_MODE_LOG.md`.** The log has at least one stale PASS (see R0.6); treat it as a claim
      to verify, never as a source.
- [x] **R0.5** `docs/_TODO/SAAS_FOUNDATION/README.md` index points at the canonical plan. It is currently stale:
      its "LIVE (read these)" section points at `CORRECTED_PLAN.md` and lists neither the roadmap nor the draft.
- [x] **R0.6** Gate `pnpm run check:saas-c4-scheduler-media-cron-fanout` exits 0. It currently **FAILS** on HEAD:
      it pins the literal `createDbOrganizationPrincipal` inside `apps/media-worker/src/processTranscodeJob.ts`,
      but commit `f9a004f07` moved that call behind `runWithOptionalMediaWorkerOrganizationPrincipal` in
      `apps/media-worker/src/runMediaWorkerSql.ts:81`. Runtime behavior is intact; the checker is stale.
      **Fix the checker so it verifies the real call chain** (`processTranscodeJob` → `runMediaWorkerSql` →
      `createDbOrganizationPrincipal`), not by re-pinning the same brittle string against whichever file holds
      it today. Do not weaken the gate into a no-op.
- [x] **R0.7** Stale policy count corrected across docs: the renderer asserts **163** targets
      (`docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:35-54`; 107+38+13+5), but
      `SAAS_ENFORCE_ROADMAP.md:66,512` and `PHASE4_ROLLOUT_RUNBOOK.md:89` still say 161. Fix the docs to 163.
- [x] **R0.8** **Inventory the uncommitted working tree — do NOT blanket-commit it.**
      *(Rewritten 2026-07-15 by the orchestrator after discovering the tree is not a single clean batch.)*
      The ~28 uncommitted files are at least two different things mixed together:
      **(a)** the D3.3–D3.5 work described in `TENANT_HARD_MODE_LOG.md`, and
      **(b)** in-flight, unreviewed work from a fixer agent the **owner stopped mid-run** — file mtimes
      `01:55–02:08` on 2026-07-15 show a SECURITY DEFINER hardening sweep changing
      `SET search_path = public, pg_catalog` → `SET search_path = pg_catalog` across at least
      `deploy/postgres/organization-member-invites-rls.sql`,
      `deploy/postgres/patient-web-push-vapid-public-key-accessor.sql`,
      `deploy/postgres/specialist-owner-provisioning-rls.sql`,
      `deploy/postgres/specialist-signup-public-bootstrap-rls.sql`.
      Deliver a classification table: every modified/untracked path → `{D3.3-D3.5 per log, stopped-fixer
      search_path sweep, orchestrator R0 artifact, unknown}` → evidence (mtime, diff nature, matching log row).
      For the search_path batch **additionally report, read-only**: do the affected SECURITY DEFINER functions
      reference their tables schema-qualified? Dropping `public` from `search_path` is standard definer
      hardening **only if every object reference is qualified** — otherwise those functions break at runtime
      under enforce. State per function: safe / breaks / unknown. **Do not fix it, do not finish that sweep,
      do not commit it** — it is a stopped agent's unreviewed security change and needs an owner decision.
      **Commit ONLY the files this R0 stage itself creates or changes** (the R0 stage doc, the R0.6 C4 checker
      fix, the R0.1/R0.2/R0.3/R0.5/R0.7 doc edits, the R0.9 log row). Everything else stays in the tree
      untouched. **Do not push. Do not touch `main` or `test`.**
- [x] **R0.9** `TENANT_HARD_MODE_LOG.md` gets an R0 row in its existing table format (Date | Stage | Done |
      Checks | Decisions/skipped), honestly recording what was and was not verified.

## R0.8 working-tree inventory (2026-07-15)

Inventory source: `git status --short`, path mtimes via `stat`, and read-only `git diff`/targeted file inspection.
This table is intentionally not a review or acceptance of the non-R0 changes.

| Path | Classification | Evidence |
|---|---|---|
| `CLAUDE.md` | unknown | mtime `2026-07-15 01:48`; diff only points agents at `docs/ORCHESTRATION_BINDINGS.md`; not referenced by D3 log. |
| `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.test.ts` | D3.3-D3.5 per log | mtime `00:40`; paired with D3.5 discussion-summary route fix in log row. |
| `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.ts` | D3.3-D3.5 per log | mtime `00:19`; diff switches feature flag read to `getPublicConfigBool`, matching D3.5 log. |
| `apps/webapp/src/infra/repos/pgPlatformAccess.repo.test.ts` | D3.3-D3.5 per log | mtime `02:06`; paired with D3.5 narrow credential accessor change. |
| `apps/webapp/src/infra/repos/pgPlatformAccess.ts` | D3.3-D3.5 per log | mtime `02:05`; diff replaces direct credential table EXISTS with `app.current_patient_has_*` / `app.staff_user_has_*`. |
| `deploy/host/deploy-test-saas.sh` | D3.3-D3.5 per log | mtime `01:56`; diff wires P0.5b grants, runtime overlays, and D3.4 bootstrap/base-login grants as described in D3.3-D3.5 log rows. |
| `deploy/postgres/organization-member-invites-rls.sql` | stopped-fixer search_path sweep | mtime `01:55`; diff is `SET search_path = public, pg_catalog` -> `pg_catalog` across SECURITY DEFINER functions. |
| `deploy/postgres/p0-5b-grants.sql` | D3.3-D3.5 per log | mtime `02:00`; diff adds D3.5 patient sensitive-table revokes and reviewed P0.5b wording. |
| `deploy/postgres/patient-web-push-vapid-public-key-accessor.sql` | stopped-fixer search_path sweep | mtime `01:55`; diff is search_path-only for `app.get_web_push_vapid_public_key()`. |
| `deploy/postgres/specialist-owner-provisioning-rls.sql` | stopped-fixer search_path sweep | mtime `01:55`; diff is search_path-only for the provisioning SECURITY DEFINER function. |
| `deploy/postgres/specialist-signup-public-bootstrap-rls.sql` | D3.3-D3.5 per log | mtime `02:08`; mixed diff: D3.5 public config/credential helpers plus stopped search_path hardening. |
| `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` | D3.3-D3.5 per log | untracked, mtime `02:04`; D3.4 bootstrap/base-login grant artifact named by D3.4 log row. |
| `docs/AGENT_AUTORUN_SCHEME.md` | unknown | mtime `01:48`; diff changes model/scope escalation policy, not D3 work. |
| `docs/ORCHESTRATION_BINDINGS.md` | unknown | mtime `01:48`; diff changes escalation/model scope wording, not D3 work. |
| `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md` | D3.3-D3.5 per log | mtime `01:59`; diff documents P0.5b grants, overlay rehydration, and D3.4 bootstrap grants. |
| `docs/_TODO/SAAS_FOUNDATION/P0_5B_GRANTS.md` | D3.3-D3.5 per log | mtime `02:00`; diff documents reviewed 219/111 grant surfaces and D3.5 boolean credential helpers. |
| `docs/_TODO/SAAS_FOUNDATION/README.md` | orchestrator R0 artifact | R0.5 edit points LIVE index at `SAAS_ENFORCE_ROADMAP.md` and demoted draft. |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_D2_FB1_BOOTSTRAP_PHONE_WRITE.md` | D3.3-D3.5 per log | mtime `02:00`; diff adds D3.4 composition note. |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` | orchestrator R0 artifact | R0.1/R0.3/R0.4/R0.7 edits in this stage. |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md` | D3.3-D3.5 per log | mtime `02:08`; diff adds meaningful JSON evidence requirements. |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md` | D3.3-D3.5 per log | mtime `02:00`; diff hardens auth-header/fixture evidence wording. |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md` | orchestrator R0 artifact | untracked stage contract/inventory file for this stage. |
| `docs/_ARCHIVE/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md` | archived by R1 | Original draft body preserved as non-executable historical reasoning. |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md` | orchestrator R0 artifact | pre-existing D3 rows plus R0.9 row appended by this stage. |
| `docs/_TODO/SAAS_FOUNDATION/PHASE4_ROLLOUT_RUNBOOK.md` | orchestrator R0 artifact | R0.7 policy-count correction from 161 to 163. |
| `docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json` | D3.3-D3.5 per log | mtime `01:58`; D3.3/D3.5 product-smoke contract calibration. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-c4-scheduler-media-cron-fanout.mjs` | orchestrator R0 artifact | R0.6 checker fix: real chain `processTranscodeJob` -> `runMediaWorkerSql` -> `createDbOrganizationPrincipal`. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs` | D3.3-D3.5 per log | untracked, mtime `02:06`; package script and D3.4 log identify it as bootstrap/base-login grant checker. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-hard-migration-protocol.mjs` | D3.3-D3.5 per log | mtime `01:59`; paired with hard-migration protocol changes. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-product-smoke-contract.mjs` | D3.3-D3.5 per log | mtime `02:08`; diff pins meaningful JSON evidence and fixture actor checks. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs` | D3.3-D3.5 per log | mtime `01:54`; diff regenerates P0.5b grant exclusions/revokes. |
| `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs` | D3.3-D3.5 per log | mtime `01:58`; product-smoke evidence hardening per D3.3 log. |
| `package.json` | D3.3-D3.5 per log | mtime `2026-07-14 23:53`; adds `check:saas-d3-4-bootstrap-base-login-grants`. |

### Search-path sweep safety (read-only report)

The stopped fixer changed SECURITY DEFINER functions to `SET search_path = pg_catalog`. I did not fix or finish that
sweep. Read-only inspection result:

| File | Affected SECURITY DEFINER functions | Table-reference status |
|---|---|---|
| `deploy/postgres/organization-member-invites-rls.sql` | invite lookup/acceptance, email challenge helpers | safe by inspection: persistent tables are schema-qualified as `public.*`; local CTE names such as `chain` are not persistent tables. |
| `deploy/postgres/patient-web-push-vapid-public-key-accessor.sql` | `app.get_web_push_vapid_public_key()` | safe by inspection: reads `public.system_settings`. |
| `deploy/postgres/specialist-owner-provisioning-rls.sql` | specialist owner provisioning helper | safe by inspection: persistent tables are schema-qualified as `public.*`. |
| `deploy/postgres/specialist-signup-public-bootstrap-rls.sql` | public config, credential-presence, email registration, signup intent helpers | safe by inspection: persistent tables are schema-qualified as `public.*`; helper calls are `app.*` or `pg_catalog.*`. Mixed D3.5 changes still need owner review before commit. |

## Stage exit

- All 9 items closed with evidence, or explicitly `blocked` with the exact reason and a pointer to the log.
- `pnpm run check:saas-c4-scheduler-media-cron-fanout` exits 0.
- `pnpm run check:saas-db-regression` exits 0 (it aggregates ~28 sub-checkers; it does **not** include c4, so run
  c4 separately — that gap is itself worth noting in the log).
- The R0 stage's own changes are committed; the rest of the working tree is left exactly as found, with R0.8's
  classification table explaining what each remaining file is.
- No scope from the draft is lost: R0.3 register accounts for every area listed there.

## Hard boundaries for this stage

- **No production anything.** No prod/test/dev DB reads or writes, no `/opt/env`, no SSH, no service restart, no
  deploy wrapper execution, no live smoke, no S3, no real delivery.
- **No push.** Commit only, to `feat/doctor-ui-rebuild`. `main`/`test` are owner-only.
- **No scope expansion.** This stage does not fix D3, does not run the wrapper, does not chase the final 17/17.
  If you find something out of scope, write it down in the log and stop — do not fix it.
- **Do not re-litigate the canonical-plan decision.** It is recorded above as an owner decision. Execute it.
- Repo rules apply in full: `AGENTS.md` + `.cursor/rules/*` (clean architecture, drizzle-only/no raw SQL through
  the app layer, no dup, dev/prod separation, branch/deploy rules).
