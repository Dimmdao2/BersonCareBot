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

## MASTER ORDERED CHECKLIST (the single sequence — follow top to bottom)
> This is THE instruction. Each step links to its detail section below. Status legend:
> ✅SCRIPT (one command, proven) · ✍️MANUAL (exact commands here) · ⛔BLOCKED (needs a build first — see §8 Blockers).
> **Hard ordering (not preference):** identity-fix #2 → migrations #3 → test-cleanup #4 → CSV backfill #5 →
> legacy-drop #6; roles/grants #8 → walls #9; ФИО #7 after history-normalization.
>
> - [ ] **1. GO-gates** (owner/legal, must be green) — §1. ✍️MANUAL
> - [ ] **2. Fresh prod dump → disposable copy** (rehearse first; then new prod host in the window) — §2. ✅SCRIPT (`deploy/host/deploy-test-full-reset.sh`, engine `deploy-test-saas.sh`)
> - [ ] **3. Identity data-fix** (doctor=yandex canonical; tezka email stripped; **gmail=HARD `role='admin'`**) — runs automatically as the DATAFIX step BEFORE migrations. §7 #1/#2. ✅SCRIPT (`p0-data-fix-doctor-admin-split.sql`)
> - [ ] **4. SaaS schema migrations** (incl. `0233_global_admin_hard_role`, membership seed 0143) — part of §2 engine. ✅SCRIPT
> - [ ] **5. Test-record cleanup + dedup** (remove test bookings, merge clone clients) — §2.5 + §8. ⛔BLOCKED (safety module refuses prod-named DB; needs reviewed guard-unlock like §3.5's flag)
> - [ ] **6. Rubitime CSV → canonical `be_*` backfill** (history import, no dup integrator/rubitime tables) — §2.5 + §8. ✅SCRIPT (`backfill-canonical-from-legacy-appointments.ts`) but needs real CSV+hashes + the #5 guard
> - [ ] **7. Legacy / Rubitime archive-then-drop** (R7 archive → drop; `booking_*` after R3-CATALOG) — §2.5 + §8. ✅SCRIPT for the archive+mirror-drop (`deploy/host/archive-rubitime-retirement-tables.sh` + migration `0237_r7_drop_public_rubitime_mirror_tables.sql`, proven on TEST 2026-07-25) · ⛔ still BLOCKED for the rest: `appointment_records` **drop** (live runtime refs), `booking_*` catalog (Track C R3-CATALOG), and the prod-side rehearsal + `R7_DROP_RESTORE_PROOF.md`
> - [ ] **8. Fix ФИО by reviewed table** (after history normalization) — §8. ⛔BLOCKED for prod (`fio-backfill/*` is TEST-only by design; prod "Phase 9" unimplemented)
> - [ ] **9. Runtime roles + grants** (create TEST-style split login roles; run overlays in order) — §3. ✍️MANUAL (overlays are scripts; no `deploy-prod-saas.sh` yet = taskdb #994)
> - [ ] **10. Install walls** (strict RLS + FORCE, owner-gated flag) — §3.5. ✍️MANUAL (`test-strict-rls-finalizer.sql -v allow_authorized_prod_target=1`)
> - [ ] **11. Service deploy + assert gates + product smoke** (fail-closed BEFORE traffic) — §4. ✅SCRIPT
> - [ ] **12. Cutover + rollback** (owner GO → flip traffic; keep old host for rollback horizon) — §5. ✍️MANUAL
> - [ ] **13. Post-cutover verification** (delivery/alerting live; decommission old only after owner GO) — §6. ✍️MANUAL
>
> **Runnable end-to-end on a fresh dump TODAY:** steps 2→3→4→9→10→11 (migrate + identity + roles + walls + boot).
> **Still BLOCKED (must build before a full clean run):** steps 5, 7, 8 (and 6 needs the #5 guard + real CSV). See §8.

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

**Archive+drop tooling (B-7(b), landed 2026-07-25):** the archive is a script, not prose —
`deploy/host/archive-rubitime-retirement-tables.sh` (`--execute` + exact `--expected-database` + loopback-only
+ owner-gated `--allow-authorized-prod-target`; archive → SHA256SUMS → verify → drop hand-off through
`pnpm run migrate`, never an ad-hoc DROP). Its drop half is the repo migration
`apps/webapp/db/drizzle-migrations/0237_r7_drop_public_rubitime_mirror_tables.sql`, which drops ONLY
`public.rubitime_records`/`public.rubitime_events`. Exact invocation: runbook §3.

**Current status (2026-07-25):** Track C R1–R2 done, R3–R6 code-only. R7 **archive is now scripted and proven
on TEST** (`bersoncarebot_test`: `public.appointment_records` 458 rows, `integrator.rubitime_records` 91 rows,
`integrator.rubitime_events` 418 rows archived+verified; both `public.rubitime_*` mirrors recorded missing),
and the mirror-drop migration applied+re-applied on a disposable scratch DB. Owner authorized the destructive
batch **on TEST only** (not prod), so on prod this whole §2.5 is still pending its own rehearsal+owner-GO, and
`RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` is still unwritten. **`public.appointment_records` DROP stays
unauthored** — live runtime readers/writers (R7_TABLE_DISPOSITION.md Track C). `message_retry_jobs` rename
already landed (forward migration, applies in §2).

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
| 1 | Specialist/doctor merge + identity data-fix | `deploy/postgres/p0-data-fix-doctor-admin-split.sql` (identity roles; runs BEFORE migrations via `deploy-test-saas.sh` DATAFIX) + `apps/webapp/scripts/consolidate-specialist-identity.ts` (specialist-row dup merge, dry-run default, `--commit`) | READY (identity data-fix) — anchors: DOCTOR = phone `+79643805480` + `dimmdao@yandex.ru` (role doctor), CLIENT tezka `+79189000782` = no email. **consolidate-specialist-identity** still PARTIAL (canonical UUID is a TEST constant; needs real-data re-derivation). Idempotent; STOPS loudly on un-merged dup. |
| 2 | Global-admin account (**HARD role, owner 2026-07-25**) | `deploy/postgres/p0-data-fix-doctor-admin-split.sql` (hard-sets `dimmdao@gmail.com` → `platform_users.role='admin'`) + migration `0233_global_admin_hard_role.sql` (asserts the same in the migration chain) | READY — **CORRECTED**: the global admin is a real persisted `role='admin'` (a dedicated account, separate from the doctor), NOT the old session-only `admin_emails` elevation. `service.ts:102` maps `role='admin'`→adminMode. Membership seed 0143 is doctor-only, so a persisted admin is never seeded into an org. `admin_emails` stays as a harmless redundant belt. |
| 3 | Delete old test records | `purge-placeholder-bookings.ts` + `backfill-...--cleanup-only --delete-test ...` (`purge-placeholder-bookings-safety.ts`) | PARTIAL/BLOCKED — safety module unconditionally refuses prod-named DB; needs reviewed override before cutover |
| 4 | Rubitime CSV → canonical schema | `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` (idempotent). NB older `backfill-rubitime-records-and-clients.ts` targeted the OLD schema, ran on prod 2026-06-13 — superseded, different target | COMPLETE (mechanism) — needs real CSV+hashes + invocation once #3 guard solved |
| 5 | Drop integrator-duplicate + rubitime tables | rubitime drop migration `apps/integrator/.../20260724_0002_drop_r7_raw_tables.sql` (authored; **CORRECTED 2026-07-25: it WAS applied + ledger-tracked on TEST** — `integrator.schema_migrations` row `applied_at 2026-07-24 17:34:46+03`, see `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md` "reconciled TEST status". The old "unapplied even on TEST" line was stale prose); integrator-duplicate removal = Track D (#7) | PARTIAL/GAP — migration proven on TEST; prod rehearsal + `R7_DROP_RESTORE_PROOF.md` outstanding |
| 6 | Cut legacy tables | same R7 drop migration; archive-then-drop is now **SCRIPTED**: `deploy/host/archive-rubitime-retirement-tables.sh` (archive+SHA+verify, gated) + migration `0237_r7_drop_public_rubitime_mirror_tables.sql` (drops `public.rubitime_records`/`public.rubitime_events` only); `booking_*` catalog **blocked** on Track C R3-CATALOG (`branchServiceId` removal, not done) | PARTIAL — archive script EXISTS + proven on TEST; `appointment_records` **drop** still blocked by live runtime refs (archive only); `booking_*` still blocked |
| 7 | Track D — integrator writes public directly, no HTTP transport | D0/D1/D2 merged (`directPublic/*`); D3–D10 unstarted; doc says "PROD out of scope" now | PARTIAL (3/11); prod-cutover implication undocumented |
| 8 | Roles + grants | overlays exist + proven on TEST (§3 above); **no `deploy-prod-saas.sh`** (deploy-prod.sh has ZERO grants) | PARTIAL — manual-by-choice; script = taskdb #994, not built |
| 9 | Install walls (strict RLS + FORCE) | policy `\ir` includes reusable (verified no hardcoded TEST DB name); finalizer `test-strict-rls-finalizer.sql` now supports an explicit-flag prod unlock (`-v allow_authorized_prod_target=1` + exact `test_expected_database` match) — see §3.5 | EXISTS — invocation documented in §3.5; no separate `prod-strict-rls-finalizer.sql` needed |
| 10 | Post-cutover verification | `assert-c4-operational-runtime-ready.sh` + `assert_*` gates + `smoke-saas-product.mjs --mode=locked --base-url=…` (env-parameterized, no prod lockout) | COMPLETE — genuinely prod-ready as-is |
| 11 | Fix ФИО by reviewed table | `apps/webapp/scripts/fio-backfill/*` — hardcoded `targetDatabase="bersoncarebot_test"`, throws if env≠TEST | GAP for prod — TEST-only by design; prod "Phase 9" (`.cursor/plans/fio_identity_cleanup.plan.md`, taskdb #857) unimplemented |

**Ready against prod today:** #1/#2 identity data-fix (doctor merge + **hard global admin**, corrected 2026-07-25),
#6's archive+mirror-drop tooling (gated flag, same shape as §3.5 — B-7(b), 2026-07-25), #9 (walls finalizer, gated
flag — §3.5), and #10 (fully). **Real authoring gaps:** #11 (prod ФИО apply), `appointment_records` **drop** +
Track C R3-CATALOG unblock (both blocked on removing live runtime references, not on tooling), #7 (Track D D3–D10).
**Guard-unlock needed:** #3 (and the shared wrapper #4 rides on it) — #9's and #6's own guard-unlocks are now done
(§3.5 and B-7(b) respectively).

**Confirmed hard ordering (not preference):** merge #1 → test-cleanup #3 → CSV backfill #4 → legacy-drop #5/#6; roles/grants #8 → walls #9; ФИО #11 after history-normalization; `booking_*` drop needs Track C R3-CATALOG first; a fully-clean #5 needs Track D #7 at D9/D10.

## 8. Blockers to build BEFORE a full clean run (steps 5, 7, 8)
These are the reasons a fresh-dump run cannot yet do "everything" in one pass. Each is a discrete build task with an
independent audit. Until they land, a clean run covers only steps 2→3→4→9→10→11 (migrate + identity + roles + walls + boot).

- **B-5 (checklist step 5) — Test-record cleanup + dedup guard-unlock.** `purge-placeholder-bookings.ts` +
  `backfill-...--cleanup-only --delete-test` exist, but `purge-placeholder-bookings-safety.ts` unconditionally refuses
  any prod-named DB with no override. **Build:** add the same explicit-flag gate §3.5 uses for the walls finalizer
  (`allow_authorized_prod_target=1` + exact expected-DB match), not a blanket removal. Then rehearse on a disposable copy.
- **B-6 (step 6) — Rubitime CSV canonical backfill invocation.** `backfill-canonical-from-legacy-appointments.ts` is
  idempotent and ready as a mechanism; it just needs the **real prod CSV + SHA manifest** and rides on B-5's guard.
  No new code — an operational input + a reviewed invocation.
- **B-7 (step 7) — Legacy / Rubitime archive-then-drop.** Status 2026-07-25 — **(b) BUILT, (a) partly done, (c) still blocked.**
  - **(b) DONE — the script exists.** `appointment_records` + rubitime-mirror archive-then-drop is no longer prose:
    `deploy/host/archive-rubitime-retirement-tables.sh` does GATE → `pg_dump --data-only` → SHA256SUMS → VERIFY
    (hash + non-empty + readable + archived-rows == live-rows) → and only then hands the drop to the **normal repo
    migration chain**; it never issues `DROP TABLE` itself. Safety gate mirrors §3.5: refuses without `--execute`,
    refuses unless `current_database()` == `--expected-database` exactly, always refuses a non-loopback DB host,
    and refuses a prod/production/live-named DB unless `--allow-authorized-prod-target` +
    a verbatim `--authorized-prod-database` are both supplied. Drop half =
    `apps/webapp/db/drizzle-migrations/0237_r7_drop_public_rubitime_mirror_tables.sql` (journal idx 237), dropping
    ONLY `public.rubitime_records`/`public.rubitime_events`, `IF EXISTS ... CASCADE`. Target list is machine-checked
    against the runbook/disposition/cleanup-sequence docs by `pnpm run check:rubitime-r7-table-disposition`
    (extended, not replaced), which also fails if the migration ever names a KEEP-list table or `appointment_records`.
    Invocation: runbook §3.
  - **(a) PARTLY DONE.** The archive ran on TEST under the owner's TEST-only authorization (3 tables archived +
    verified, 2 recorded missing) and the mirror-drop migration was applied + re-applied on a disposable scratch DB.
    The earlier "not executed even on TEST" line for the *integrator* R7 drop migration was stale — that migration
    is applied and ledger-tracked on TEST (see §7 row 5). **Still open:** the prod-side rehearsal on a fresh
    disposable prod copy, and writing `RUBITIME_RETIREMENT_R7_DROP_RESTORE_PROOF.md` (the doc the
    `--require-drop-ready` gate waits on).
  - **STILL BLOCKED, NOT BUILT: `public.appointment_records` DROP.** Only its *archive* is scripted. The table has
    live bidirectional runtime traffic (`pgAppointmentProjection.ts`, `pgDoctorAppointments.ts`,
    `publicAppointmentRecordSync.ts`, the admin soft-delete route), and both the runbook ("Do not drop
    `public.appointment_records` until every runtime reference is gone") and the disposition doc ("KEEP for now,
    ARCHIVE+DROP deferred") forbid authoring the drop. Removing those readers/writers is its own build task.
  - **(c) STILL BLOCKED.** `booking_*` catalog drop is blocked on Track C R3-CATALOG (`branchServiceId` removal not
    done; live admin booking-catalog CRUD still reads those tables) — that removal is its own build task.
- **B-8 (step 8) — Prod ФИО apply.** `fio-backfill/*` hardcodes `targetDatabase="bersoncarebot_test"` and throws off
  TEST by design. **Build:** the prod "Phase 9" apply path (`.cursor/plans/fio_identity_cleanup.plan.md`, taskdb #857)
  — env-gated like the other prod steps, after history normalization (steps 5/6).
- **B-9 (supports steps 9) — `deploy-prod-saas.sh`** (taskdb #994): the §3 overlays are currently a MANUAL ordered list.
  Optional to script, but until then step 9 is hand-run.

Tracking: taskdb #996 (this program), #995 (locate SMTP keys in the dump — needed by step 9/§3), #994 (`deploy-prod-saas.sh`).

---
_Maintenance: when a grant/overlay changes, update §3 here. If the prod grant closure ever gets scripted into a real
`deploy-prod-saas.sh` (taskdb #994), replace §3's manual invocation with the script name + keep the topology
prerequisite. Keep this doc the single entry point (link from `docs/CURRENT_AUTHORITY_MAP.md`)._
