# SaaS PROD deploy — single consolidated process (scripts + instructions)

> **Purpose (owner 2026-07-24):** ONE place with the full SaaS production cutover process — every script and every
> manual instruction, in order. Pragmatic rule (owner): if a step is easy to script → the script is named here; if
> scripting is hard/brittle → the exact one-off commands are written here as a MANUAL instruction (what/when/how).
> This is the entry point; deep detail lives in the linked docs (don't duplicate — follow the links).
>
> **Authoritative sub-docs (linked, still valid):**
> - Host/cutover phases I0–I6 (build new encrypted prod, rehearse, GO): `../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md`
> - DB migration mechanics (fresh dump → hard migration): `HARD_MIGRATION_PROTOCOL.md` + wrapper `deploy/host/deploy-test-full-reset.sh` (internal engine `deploy/host/deploy-test-saas.sh`)
> - DB deploy sequence + PROD mapping notes: `SAAS_DEPLOY_SEQUENCE.md`
> - **Role grants (this doc's §3 is authoritative):** `../ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md`
> - Legal/privacy GO-gates: `../RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md` (PR-00..PR-04, SEC-02/03/04, DR-01/02, CRYPTO-01)
> - Deploy topology / host facts: `deploy/HOST_DEPLOY_README.md`
>
> **Hard rule:** PROD (135.x) is untouchable except by an explicit owner GO for the cutover window. Agents never run
> destructive prod steps autonomously. TEST rehearses everything first.

## 0. When this runs
Once, at the SaaS production cutover: stand up the new encrypted prod host (INFRA-01), migrate the current prod DB
onto the SaaS schema, provision runtime roles+grants, deploy services, verify, cut traffic over.

## 1. Owner / legal GO-gates (MANUAL — must be green before the window)
From INFRA-01 §I0 + RU-privacy MASTER_PLAN. Owner + external, not engineering capacity:
- [ ] PR-00/PR-01 scope-lock + processing register; Selectel response O-02; RKN notification reconciled (PR-04 ISPDn gate).
- [ ] CRYPTO-01/C0 crypto ADR; SEC-02 host/secrets; DR-01/02 backup+restore drill proven (needs owner age-key).
- [ ] Stable SaaS release SHA (green full CI); owner resources O-07 (new VPS); GO decision.
- [x] **Owner decisions 2026-07-24:** **paid billing = OUT of first launch** (no online subscription payment day-one
      → C5B/C/D + store deferred, dropped from cutover scope; base payment infra stays but no acquirer/store);
      **session TTL = 7 days** for staff/global-admin (patient 90d unchanged; unblocks logout-everywhere / session-revoke);
      **SMTP creds = already in the prod dump's `system_settings`** (no separate provisioning) — BUT they're mixed
      in with everything, so a small task exists to LOCATE + document exactly which keys hold them (taskdb).

## 2. Database migration (SCRIPTED)
Rehearse on a disposable prod-copy first (INFRA-01 §I2), then run on the new prod host in the cutover window.
- **Script:** the fresh-dump hard migration — `HARD_MIGRATION_PROTOCOL.md` + `deploy/host/deploy-test-full-reset.sh`
  (owner-gated wrapper; NOT the plain `deploy-test.sh`/`pnpm migrate`, which is insufficient for the SaaS branch on a
  real prod DB — see SAAS_DEPLOY_SEQUENCE.md for why: data-fix-before-membership-seed + temp-BYPASSRLS migrator).
- The wrapper runs migrations → data cleanup → roles/grants → reviewed overlays → strict-RLS finalizer (base policies
  → safe overlays → FORCE with catalog/semantic assertions).

## 2.5 Legacy / Rubitime table cleanup (SCRIPTED runbooks + owner-gated destructive step)
The fresh-dump migration (§2) restores the OLD prod DB, so **Rubitime + legacy tables come along** and must be
cleaned as an explicit, owner-gated, destructive step — NOT a blind `DROP`. **Authoritative runbooks (this process
just sequences + links them — the runbooks are binding):**
- Master: `RUBITIME_RETIREMENT_EXECUTION_PLAN.md`.
- What to archive / drop / KEEP: `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md` (+ gate `pnpm run check:rubitime-r7-table-disposition`).
- Binding executable R7 spec: `RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`. Cleanup order: `RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`.

**Sequence (must not skip):** R1–R6 first (history migrated to canonical `be_*`, runtime switched off Rubitime,
R6 cutoff/drain proof `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`) → **R7 archive** (`pg_dump --data-only` of
`appointment_records`, `integrator.rubitime_records`, `integrator.rubitime_events` to a timestamped dir + SHA256SUMS)
→ **R7 DROP** (owner-approved candidates: `integrator.rubitime_api_throttle`/`rubitime_create_retry_jobs`(**now renamed
`message_retry_jobs` — KEEP, NOT a drop**, it's the generic delivery queue)/`rubitime_booking_profiles`/`rubitime_branches`/
`rubitime_services`/`rubitime_cooperators`) via a NORMAL repo migration, never ad-hoc DROP.
**KEEP-list (do NOT drop):** `public.patient_bookings`, `public.be_external_entity_mappings`, `integrator.booking_calendar_map`
(while GCal sync active), `public.booking_*` catalog tables **until R3-CATALOG `branchServiceId` removal is separately
done** (then legacy `booking_branches`/`booking_branch_services`/`branches` may be dropped).

**Gates before any DROP:** static no-reference proof (`pnpm run check:rubitime-retirement-inventory --expect-post-r6`
green; `rg` shows only docs/archives/migrations), archive done + SHA'd, R6 drain proof recorded, **explicit owner
authorization of the exact destructive batch**. Then restore/migrate proof on a disposable copy first.

**Current status (2026-07-24):** Track C R1–R2 done, R3–R6 code-only, **R7 NOT executed even on TEST**; owner has
authorized the destructive batch **on TEST** (not prod). So on prod this whole §2.5 is still pending its own
rehearsal+owner-GO. `message_retry_jobs` rename already landed (forward migration, applies in §2).

## 3. Runtime role grants (SCRIPTED overlays + MANUAL invocation) — the piece prod is currently MISSING
**Context:** `deploy/host/deploy-prod.sh` today has ZERO grant provisioning; the grant overlays exist as `.sql`
scripts but nothing calls them on prod. Per owner's pragmatic rule, we do NOT (yet) build a big env-parameterized
prod closure script — instead this section is the **MANUAL instruction to run the existing overlay scripts against
prod, in order, with prod role names substituted.** (Each `.sql` is idempotent; safe to re-run.)

**Prod role topology — RESOLVED (owner 2026-07-24):** current prod is the OLD **single-owner model — ONE DB user/role**
for the connection (pre-SaaS). So there is NO ownership shortcut to lean on: the cutover **creates the TEST-style
split login roles and grants them** exactly via the overlays below. The earlier "verify topology / ownership might
cover it" caveat is moot — run ALL overlays in full; nothing is redundant. (This also means the OLD single role
should be retired/reduced post-cutover, not reused as a service login.)

**Run these overlays against prod (order matters), substituting the prod integrator/service role names for the
`-v ..._role=` variables** (mirror `deploy-test-saas.sh`'s closure order):
1. `deploy/postgres/p2-b-protected-principal-context.sql` — principal-context functions + api role NOINHERIT + SET-only memberships.
2. `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` — webapp bootstrap/base-login grants (→ the nonstaff/webapp role, NOT the integrator role).
3. `deploy/postgres/c4-operational-runtime.sql` (+ `deploy/host/provision-c4-operational-runtime.sh`) — 5-contour operational roles.
4. `deploy/postgres/integrator-server-runtime-config.sql` — api role: EXECUTE on `read_global_server_runtime_setting`/`read_integrator_smtp_outbound_setting`/`release_principal_context`.
5. `deploy/postgres/integrator-login-public-identity-grants.sql` — D1/D2 identity+diary column-scoped writes + narrow integrator-schema reads (`-v integrator_login_public_identity_grants_role=<prod integrator role>`).
6. `deploy/postgres/saas-isolation-telemetry.sql` — `report_saas_isolation_event` EXECUTE.
7. **Migration-ledger read (MANUAL one-off — currently only bash-inline in `deploy-test-saas.sh:605`, not a reusable `.sql`):**
   `GRANT USAGE ON SCHEMA integrator TO <prod integrator role>; GRANT SELECT ON TABLE integrator.schema_migrations TO <prod integrator role>;`
   *(If/when scripted: extract to a `.sql` overlay and move this into step list; until then it's a documented manual command.)*

**MANDATORY-automate regardless of ownership:** steps 4 (the 4 `app.*` EXECUTE) + 7 (schema_migrations SELECT) —
table ownership can NEVER cover function-level privileges or a separate-identity ledger read.

**NEVER run:** the incident's ad-hoc `GRANT ALL ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA integrator/app` — that
was pollution, not canonical (see `ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` §1). Only the overlays above.

## 3.5 Install walls: strict RLS + FORCE (item #9 in §7) — MANUAL invocation, owner-GATED
**Context:** the policy `\ir` includes (`phase4-locked-helper-rls-policies.sql`, the reviewed overlays, and
`phase4-force-rls-cutover.sql`) are already generic/reusable — none of them hardcode a TEST database name. The only
prod blocker was the finalizer's own DB-name guard, which by design refuses to run against anything that isn't
`bersoncarebot_test` (or an explicitly-flagged disposable rehearsal copy). Per the owner ruling 2026-07-24, that
refusal is a safety rail for the unattended prep period, not a permanent block — cutover is exactly when this file
is supposed to run against the real prod DB. `deploy/postgres/test-strict-rls-finalizer.sql` now supports an
**explicit-flag unlock** for that one-off run (blanket removal of the guard was rejected — the flag stays gated).

**Must run:** AFTER migrations, data cleanup, runtime roles/grants (§3 above), and reviewed policy overlays; BEFORE
runtime services restart — per `HARD_MIGRATION_PROTOCOL.md` §10 ("B1, A2, and product smoke gates"), which documents
this exact ordering for the TEST wrapper and applies unchanged to prod.

**Invocation (owner-authorized operator only):**
```bash
sudo -u postgres psql -d "$PROD_DB" -X -v ON_ERROR_STOP=1 \
  -v allow_authorized_prod_target=1 \
  -v test_expected_database="$PROD_DB" \
  -v phase4_bootstrap_base_role="$PROD_BOOTSTRAP_ROLE" \
  -v phase4_staff_role="$PROD_STAFF_ROLE" \
  -v phase4_owner_role="$PROD_OWNER_ROLE" \
  -f deploy/postgres/test-strict-rls-finalizer.sql
```
- `allow_authorized_prod_target=1` is the explicit gate — omitted or any value other than `1` and the file behaves
  exactly as it always has on TEST (refuses any non-`bersoncarebot_test`/non-disposable database name).
- Even with the flag set, the file still hard-requires `current_database()` to equal the operator-supplied
  `test_expected_database` exactly (fail-closed division-by-zero abort on any mismatch/typo) — the flag alone is
  never sufficient.
- The flag changes ONLY the DB-name refusal. No FORCE/policy strictness is lowered; the same exact-163-target FORCE
  assertion and specialized-policy assertions run identically to TEST.
- Full guard text + the owner-gated header block: `deploy/postgres/test-strict-rls-finalizer.sql` (top of file).

## 4. Service deploy + gates (SCRIPTED)
- Build+release services (mirror `deploy-prod.sh` code path).
- **Run the same `assert_*` gates the TEST closure runs** (they're env-parameterized — point them at prod env files),
  BEFORE traffic cutover, fail-closed: `assert_api_runtime_can_release_principal_context`,
  `assert_integrator_server_runtime_config_ready`, `assert_api_runtime_can_read_migration_ledger`,
  `deploy/host/assert-c4-operational-runtime-ready.sh`. These catch exactly the class of grant mistake that took TEST
  down on 2026-07-24 — do not skip.
- Locked product smoke (`docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs --mode=locked`) green.

## 5. Cutover + rollback (per INFRA-01 §I5/§rollback)
- Owner GO → flip traffic to new host. Keep old host + fresh backup for the rollback horizon.
- Phased rollback model per INFRA-01. DR-01/02 restore proven beforehand.

## 6. Post-cutover (INFRA-01 §I6)
- Verify delivery/alerting live; decommission old host only after owner authorizes + rollback horizon passes.

## 7. Per-item readiness matrix + gaps (inventory 2026-07-24)
Cross-cutting finding (READ FIRST): **almost every destructive DB-mutation script has a hard code-level refusal of any DB name containing `prod`/`production`/`live`, with NO override flag** (the "prod untouchable" rule, baked in). So the audited single-command paths are proven on TEST/disposable copies but **cannot literally be pointed at the real prod DB** until a reviewed unlock (an explicit-flag gate on the guard) or a temporarily-renamed DB is arranged. This is engineering work, separate from the (proven) business logic. **#9 is the first item where this unlock is now built** (`-v allow_authorized_prod_target=1`, §3.5) — same explicit-flag pattern (not a blanket removal) is the model for #3's still-open guard.

| # | Step | Asset | Status |
|---|---|---|---|
| 1 | Specialist/doctor merge | `apps/webapp/scripts/consolidate-specialist-identity.ts` (dry-run default, `--commit`) | PARTIAL — script prod-agnostic but canonical UUID is a TEST constant; needs real-data re-derivation + reviewed invocation |
| 2 | Global-admin account | `deploy/postgres/p0-data-fix-doctor-admin-split.sql` (frees owner email → admin via `admin_emails` policy, session-only) | READY (mechanically) — relies on prod dump carrying `admin_emails` in system_settings. This is "the instruction owner gave" |
| 3 | Delete old test records | `purge-placeholder-bookings.ts` + `backfill-...--cleanup-only --delete-test ...` (`purge-placeholder-bookings-safety.ts`) | PARTIAL/BLOCKED — safety module unconditionally refuses prod-named DB; needs reviewed override before cutover |
| 4 | Rubitime CSV → canonical schema | `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` (idempotent). NB older `backfill-rubitime-records-and-clients.ts` targeted the OLD schema, ran on prod 2026-06-13 — superseded, different target | COMPLETE (mechanism) — needs real CSV+hashes + invocation once #3 guard solved |
| 5 | Drop integrator-duplicate + rubitime tables | rubitime drop migration `apps/integrator/.../20260724_0002_drop_r7_raw_tables.sql` (authored, **unapplied even on TEST**); integrator-duplicate removal = Track D (#7) | PARTIAL/GAP |
| 6 | Cut legacy tables | same R7 drop migration; `appointment_records`/rubitime-mirror archive-then-drop = **PROSE ONLY, no script**; `booking_*` catalog **blocked** on Track C R3-CATALOG (`branchServiceId` removal, not done) | PARTIAL/GAP |
| 7 | Track D — integrator writes public directly, no HTTP transport | D0/D1/D2 merged (`directPublic/*`); D3–D10 unstarted; doc says "PROD out of scope" now | PARTIAL (3/11); prod-cutover implication undocumented |
| 8 | Roles + grants | overlays exist + proven on TEST (§3 above); **no `deploy-prod-saas.sh`** (deploy-prod.sh has ZERO grants) | PARTIAL — manual-by-choice; script = taskdb #994, not built |
| 9 | Install walls (strict RLS + FORCE) | policy `\ir` includes reusable (verified no hardcoded TEST DB name); finalizer `test-strict-rls-finalizer.sql` now supports an explicit-flag prod unlock (`-v allow_authorized_prod_target=1` + exact `test_expected_database` match) — see §3.5 | EXISTS — invocation documented in §3.5; no separate `prod-strict-rls-finalizer.sql` needed |
| 10 | Post-cutover verification | `assert-c4-operational-runtime-ready.sh` + `assert_*` gates + `smoke-saas-product.mjs --mode=locked --base-url=…` (env-parameterized, no prod lockout) | COMPLETE — genuinely prod-ready as-is |
| 11 | Fix ФИО by reviewed table | `apps/webapp/scripts/fio-backfill/*` — hardcoded `targetDatabase="bersoncarebot_test"`, throws if env≠TEST | GAP for prod — TEST-only by design; prod "Phase 9" (`.cursor/plans/fio_identity_cleanup.plan.md`, taskdb #857) unimplemented |

**Ready against prod today:** #2 (mechanically), #9 (walls finalizer, gated flag — §3.5), and #10 (fully). **Real
authoring gaps:** #11 (prod ФИО apply), #5/#6 (archive-then-drop scripts + Track C R3-CATALOG unblock), #7 (Track D
D3–D10). **Guard-unlock needed:** #3 (and the shared wrapper #1/#4 ride on it) — #9's own guard-unlock is now done,
see §3.5.

**Confirmed hard ordering (not preference):** merge #1 → test-cleanup #3 → CSV backfill #4 → legacy-drop #5/#6; roles/grants #8 → walls #9; ФИО #11 after history-normalization; `booking_*` drop needs Track C R3-CATALOG first; a fully-clean #5 needs Track D #7 at D9/D10.

---
_Maintenance: when a grant/overlay changes, update §3 here. If the prod grant closure ever gets scripted into a real
`deploy-prod-saas.sh` (taskdb #994), replace §3's manual invocation with the script name + keep the topology
prerequisite. Keep this doc the single entry point (link from `docs/CURRENT_AUTHORITY_MAP.md`)._
