# SaaS PROD deploy — single consolidated process (scripts + instructions)

> 🟢 **РАМКА ВСЕГО ЭТОГО ДОКУМЕНТА — решение владельца 27.07.** Здесь описан переезд на **НОВЫЙ** сервер, а
> не обновление работающего. Дословно: «мы не будем обновлять тот прод что работает сейчас — мы создадим
> новый и обновим БД, которую возьмём из нынешнего прода в момент переезда». Канонная формулировка 15.07
> «переключения прода не будет никогда» относится к обновлению **текущего** хоста `adelaide` на месте и
> этому документу не противоречит. Единственное действие над нынешним продом — снять свежий дамп.
> Полностью: [`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §6](../../ARCHITECTURE/OWNER_PRODUCT_RULES.md).

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
> - [ ] **8. Fix ФИО by reviewed table** (after history normalization) — §8. ✅SCRIPT (B-8 done 2026-07-25, `818f51570`): gated cutover apply — `--allow-authorized-prod-target` + exact `--authorized-prod-database` + environment-matching manifest
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
      **SMTP creds = already in the prod dump's `system_settings`** (no separate provisioning) — **CORRECT.
      The owner was right.** My 2026-07-25 "VERIFIED FALSE" reversal was itself wrong and is withdrawn; see the
      corrected §3.6. `system_settings.smtp_outbound` carries a real object (`from, host, port, user, secure,
      password`) in the dump. I had queried the **restored TEST database**, where the reset overlay had already
      nulled it, instead of querying the dump — so I measured our own scrub and called it prod's state.
      taskdb #995 stays CLOSED, but for the opposite reason: the keys exist and have been located.

## 2. Database migration (SCRIPTED)
Rehearse on a disposable prod-copy first (INFRA-01 §I2), then run on the new prod host in the cutover window.
- **Script:** the fresh-dump hard migration — `HARD_MIGRATION_PROTOCOL.md` + `deploy/host/deploy-test-full-reset.sh`
  (owner-gated wrapper; NOT the plain `deploy-test.sh`/`pnpm migrate`, which is insufficient for the SaaS branch on a
  real prod DB — see SAAS_DEPLOY_SEQUENCE.md for why: data-fix-before-membership-seed + temp-BYPASSRLS migrator).
- The wrapper runs migrations → data cleanup → roles/grants → reviewed overlays → strict-RLS finalizer (base policies
  → safe overlays → FORCE with catalog/semantic assertions).

## 2.1 From-zero rehearsal findings — HARD prerequisites and fixes (2026-07-25)
**Owner ruling 2026-07-25:** if a migration or grant step genuinely cannot be scripted, doing it BY HAND
once, at the cutover, is ALLOWED — do not burn hours automating an unsolvable step. The absolute
requirement is that every such step is written HERE, in exact order, with the exact commands, so the whole
sequence stays reproducible from this one document.

**Why this section exists.** The migration chain had NEVER actually been run against a fresh prod dump.
The long-lived TEST database carried leftovers from earlier deploys (schema `app`, its principal
accessors, prior ownership transfers), which silently satisfied prerequisites that the chain itself does
not create. A from-zero restore exposed a chain that **could not run on real prod data** — i.e. the
documented cutover order (migrations → cleanup → roles/grants → overlays) was unrunnable as written.
Eight rehearsal runs, each surfacing a distinct defect; all fixed:

| # | Defect (from-zero only) | Fix |
|---|---|---|
| 1 | `/tmp/bcb-prod-fresh.dump` left from a previous run is chowned `postgres:0600`, so the next pull dies with `Permission denied` **mid-reset**, after TEST writers are stopped | `15fdac233` — remove the stale artifact before pulling |
| 2 | identity data-fix asserted a live `dimmdao@gmail.com` row that does not exist on prod (steps 1+3 free that email) | `10b29f4ce` — CREATE the clean global-admin account when absent (owner instruction #3) |
| 3 | migration `0218` spells `app.current_org_id()` into POLICY expressions; no migration creates it (only the post-chain overlay does) → whole batch aborts `P0001`/rolls back | `f1fe3e943` — fail-closed bootstrap stub in `0175` |
| 4 | `0219` resolves `app.current_patient_user_id()` eagerly → `42883 undefined_function` | `9f95bdfab` — stubs for the other two accessors (16 migrations depend on them) |
| 5 | `0225` runs `ALTER FUNCTION … OWNER TO app_owner`, which requires MEMBERSHIP in `app_owner` — deliberately zero-member | `4f8565647` — temporary membership for the migrate step only, revoked + **unconditionally re-asserted** back to zero members |
| 6 | same `ALTER … OWNER TO app_owner` also requires the NEW owner to hold **CREATE on the schema**; `app_owner` had neither USAGE nor CREATE on `app` at migration time (USAGE is granted only by the post-chain `e1-webapp-runtime-config.sql:71`) → `42501 permission denied for schema app` | `15d9748be` — `GRANT USAGE, CREATE ON SCHEMA app TO app_owner` in `0175`, role-existence guarded |

**HARD PREREQUISITE discovered — runtime roles must exist BEFORE the migration chain.** Migrations
GRANT to / transfer ownership to `app_owner`, `app_staff`, `app_patient`. On this box those cluster-level
roles already existed, which masked the dependency; on a **virgin prod host they will not**, and the chain
will fail with `42704 undefined_object`. Therefore on a new host the role-creation part of §3 (the
`p0-5b` role split + `app_owner`) must run BEFORE §2's migrate step — the rest of §3's grants still run
after. The helpers added in 0175 and `deploy-test-saas.sh` warn loudly instead of failing obscurely when
a role is missing. **This reorders the master checklist for a virgin host: 9(roles only) → 4 → 9(grants).**

**Diagnostic recipe (the migrate runner redacts errors on purpose).**
`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` prints only `reason=… sqlstate=…` and suppresses raw
SQL/params so PII never reaches logs. To get the real message + failing statement without weakening that,
replay on a scratch copy (≈2 min loop instead of a ≈10 min full reset):
```bash
# 1. scratch DB from the same dump, owned by the migrator role
sudo -u postgres psql -c "DROP DATABASE IF EXISTS bcb_migrate_probe;"
sudo -u postgres psql -c "CREATE DATABASE bcb_migrate_probe OWNER bersoncarebot_test;"
sudo -u postgres psql -d bcb_migrate_probe -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS btree_gist;"
sudo -u postgres pg_restore --no-owner --no-acl -d bcb_migrate_probe /tmp/bcb-prod-fresh.dump
# 2. reassign every object to the migrator role (the real restore does this via --role)
#    then run the identity data-fix, then the integrator + webapp chains
# 3. run drizzle migrate from a throwaway script that prints error.cause chain verbatim
```
Note `sudo -u postgres` cannot read files under `/home/dev` — always pipe SQL via stdin
(`… | sudo -u postgres psql`), never `-f /home/dev/...`.

**MANDATORY probe teardown.** Any elevation granted for diagnosis must be revoked before the next deploy:
```bash
sudo -u postgres psql -c "REVOKE app_owner FROM bersoncarebot_test;"
sudo -u postgres psql -c "ALTER ROLE bersoncarebot_test NOBYPASSRLS;"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS bcb_migrate_probe;"
sudo -u postgres psql -c "DROP ROLE IF EXISTS bcb_probe_login;"
# verify BOTH are false:
sudo -u postgres psql -tAc "SELECT pg_has_role('bersoncarebot_test','app_owner','member'), (SELECT rolbypassrls FROM pg_roles WHERE rolname='bersoncarebot_test');"
```
Proven live on 2026-07-25: leftover probe membership made the next deploy abort with
`FATAL: role bersoncarebot_test already has membership in app_owner before deploy`. That is the guard
working as designed (fail-closed on pre-existing elevation) — not a bug to work around.

## 2.2 Closure findings — verification apparatus depends on retired demo fixtures (2026-07-25)
The post-migration closure itself now runs end to end on a from-zero prod dump: roles+grants → protected
principal helpers → reviewed overlays → isolation telemetry → integrator login grants → **reversible SaaS
isolation scenario proof** → TEST settings → **base policies → safe overlays → exact FORCE assertions** →
C4 five-contour provisioning → strict+FORCE reassertion → nginx → TEST unit restart. Two things surfaced:

**(a) Three verification steps are built on the S3 demo clinics A/B and cannot run without them.**
`test-patient-identity-capability-gate.sql`, `test-owner-ready-locked-matrix.sql` (26 hardcoded fixture
UUIDs) and the A2 product smoke fixture (`/run/bersoncarebot/saas-smoke.fixture`, which carries **signed
session cookies for demo user ids** `53000000-…-d0a2`/`d0a1`/`a101`/`d001`) all assert against those
fixtures. The owner retired the demo data on 2026-07-25 and its seed step was removed from the closure, so
each of them aborted the closure in turn. The first two now **skip loudly when the fixtures are absent and
run unchanged (still fatal) when they are present** — one shared predicate,
`demo_isolation_fixtures_present`. The product smoke still fails 18/22: the app is behaving CORRECTLY
(401 for a session signed for a non-existent user, 307 for unauthenticated) — the fixture is stale, not the
product. The 4 public scenarios pass, proving the app serves.
→ **OWNER DECISION NEEDED (pick one):** (A) re-seed the synthetic demo clinics on TEST — they exist purely
for this verification, are TEST-only and carry zero prod risk, and all three gates work again; or
(B) re-issue the operator smoke fixture against the owner's real identities (doctor = yandex account,
global admin = the account created by the identity data-fix), which tests real data but requires minting
signed sessions for real users. Until one is chosen, authenticated product surfaces stay UNVERIFIED by
automation.

**(a.1) Owner rulings 2026-07-25 on the two blockers, and what they produced.**
- **ФИО drift → "применяй" (DONE).** The reviewed manifest is snapshot-bound, and one client row had changed on prod
  after the review (display name `Ольга Альмендингер` → `Olga A`, with first/last stored swapped). Procedure used,
  and the one to repeat at the real cutover: update ONLY that row's `expectedBefore` to the current live value,
  keep `desiredAfter` exactly as reviewed, drop `manifestSha256`, re-seal with
  `pnpm --dir apps/webapp run fio:owner-reviewed-test:seal -- --manifest <payload> --output <sealed>`, confirm
  `preview` reports `unexpectedDrift: 0`, then apply. Result: 165 eligible rows applied, drift 0, rollback artifact
  written. **Expect this every time**: the manifest must be re-reviewed/re-sealed against the cutover-day dump.
- **Verification apparatus → "реальные" (BLOCKED on a permission, not on engineering).** Re-pointing
  `/run/bersoncarebot/saas-smoke.fixture` at real identities requires MINTING signed session cookies
  (`encodeSessionCookie` = base64url(JSON) + HMAC-SHA256 with `SESSION_COOKIE_SECRET`) — which is exactly what the
  existing operator fixture contains. The agent harness blocks that action as session forgery, so it needs either an
  explicit owner permission rule or the owner running the mint themselves. Everything else is ready: doctor
  `b0021a38…` (yandex), global admin `9c40e322…` (gmail, created by the data-fix), a real enrolled patient with a
  real program instance/item and a real media file. **Independent limit:** the real clinic has NO
  `clinic_public_directory_entries` row, so slug-dependent public booking scenarios cannot be verified on real data
  until the clinic is published — that is a separate product action, not a fixture problem.

**(b) A failed closure gate leaves TEST DOWN.** The failure path stops the TEST units (observed: webapp
started 15:44:54, served 200s, was SIGTERM'd at 15:45:05 when the smoke gate failed). So an aborted closure
is not just "gate red" — the environment goes offline. Restart explicitly after fixing a gate:
```bash
sudo systemctl start bersoncarebot-webapp-test bersoncarebot-api-test bersoncarebot-worker-test \
  bersoncarebot-scheduler-test bersoncarebot-media-worker-test
```
For the real cutover this matters more: budget for the fact that a red gate takes the environment down, and
verify services are up as an explicit final step.

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

## 3.6 Outbound email (SMTP) — travels WITH the dump, but the reset scrubs it (corrected 2026-07-25)

**Why this is its own step:** email is the PRIMARY login mechanism (owner ruling: password-less login, always a
code to the email), so if SMTP is missing after cutover, **nobody can log in** — including the owner's own
global-admin account, which is a clean credential-less row whose only entry path is an email code.

**The credential IS in the prod dump.** Proven by restoring the dump's `system_settings` into a scratch database
and inspecting it there — never by querying a restored TEST DB:
```bash
sudo -u postgres psql -c "CREATE DATABASE bcb_smtp_probe_scratch"
sudo -u postgres pg_restore --schema-only -t system_settings -d bcb_smtp_probe_scratch "$DUMP"
sudo -u postgres pg_restore --data-only  -t system_settings -d bcb_smtp_probe_scratch "$DUMP"
sudo -u postgres psql -tAd bcb_smtp_probe_scratch -c \
  "SELECT key, jsonb_object_keys(value_json->'value') FROM system_settings WHERE key='smtp_outbound'"
# -> from / host / port / user / secure / password
sudo -u postgres psql -c "DROP DATABASE bcb_smtp_probe_scratch"   # teardown is mandatory
```

**Why TEST looks empty:** `deploy/postgres/test-settings-override.sql:88-91` deliberately writes
`{"value":null}` over `smtp_outbound` on the **reset** path only (`\if :test_settings_overlay_reset`); a
code-only closure preserves it. That is a send-safety measure, not a defect — a freshly reset TEST must not
inherit a live mail sender by accident.

**METHOD LESSON — do not repeat this one.** "What does prod have?" must be answered **against the dump**, never
against a restored TEST database. Every reset overlay in `test-settings-override.sql` (SMTP, OAuth redirect URIs,
base URLs, feature toggles) rewrites prod values by design, so a restored TEST DB reports OUR overrides back to
us. I burned a whole owner cycle asserting the opposite and wrote it into this runbook as fact.

**Cutover step (prod):** nothing to provision from outside — the value arrives with the restore, and the prod
cutover does NOT run the TEST reset overlay. Verify after restore that `smtp_outbound` is a non-null object and
send one real code to the owner's address before declaring login healthy. The runtime reads it through
`app.read_integrator_smtp_outbound_setting` (`0235_integrator_smtp_restricted_accessor.sql`, plus §3 step 4's
EXECUTE grant).

**Restoring it on TEST after a reset** (what was done 2026-07-25): copy the value from a scratch restore of the
dump straight into `public.system_settings` **and** the `integrator.system_settings` mirror using `dblink`, so
the credential never passes through a shell argument, a file, or a log. TEST send-safety stays in force
(`DEV_REDIRECT_EMAIL` plus the passthrough allowlist), which is what makes this safe to do at all.

**Separate blocker, do not confuse the two:** with the credential present the login screen STILL hid the
email-code option, because the public login path runs under a bootstrap principal that has no `SELECT` on
`system_settings`, so the "is SMTP configured?" read raised, was swallowed, and reported false. See
`docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md`, section "LOGIN IS BROKEN ON TEST".

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

> ⚠️ **SUPERSEDED (2026-07-26)** — item 2 below describes the old session-only `admin_emails` elevation as a
> "harmless redundant belt" beside the persisted role; that allowlist grant path is now the superseded scheme.
> Canon: [ADMIN_ACCESS_MODEL.md](../../ARCHITECTURE/ADMIN_ACCESS_MODEL.md).

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
  - **(c) STILL BLOCKED — and this doc's earlier premise was WRONG (corrected 2026-07-25).**
    Track C R3-CATALOG landed its *dead-code* half (see below) but **cannot** reach zero runtime references on its own.
    - **DONE (verified):** the dead legacy-catalog reads are gone — `pgBookingCatalog.listServicesByCity`
      / `listCitiesForPatient`, `modules/booking-catalog/service.ts`, and `apps/integrator/.../branchTimezone.ts`
      (the last integrator read of `booking_branches` + `branches`). Independently re-checked: zero live callers,
      `tsc --noEmit` exit 0 in webapp AND integrator. The patient/public flow uses the canonical engine
      (`be_branches`/`be_clinic_services`/`be_service_location_availability`).
    - **`branches` does NOT belong to this blocker.** The earlier wording implied R3-CATALOG would free
      `public.branches`; it will not. `branches` is joined by the **live doctor-appointments feature**
      (`pgDoctorAppointments.ts` ×8 joins, `pgBranches.ts`, `pgBookingCalendarLegacy.ts`) via `appointment_records`,
      so it belongs to the `appointment_records` cluster (itself drop-blocked). Only
      `booking_branches` / `booking_branch_services` are in R3-CATALOG's scope.
    - **4 OWNER DECISIONS now block the rest** (product calls, not engineering — do NOT guess these):
      1. **Legacy admin catalog `/api/admin/booking-catalog/*` — 10 live endpoints.** Evidence it is de-facto
         retired: its only UI (`settings/RubitimeSection.tsx`) is **orphaned** (imported nowhere but its own test),
         `api.md:53` labels the tree "Legacy каталог", and the canonical `/api/admin/booking-engine/*` is live and
         UI-backed at `/app/doctor/admin/booking`. **Retire (delete) the 10 endpoints, or migrate them onto `be_*`?**
      2. **`pgRubitimeMapping.ts` admin mapping view + link path** (writes `booking_branch_services`). Its UI
         (`BookingRubitimeMappingSection.tsx`) is **also orphaned**; `schedule.md:129` records "Rubitime tab
         отсутствует … C0 already retired", yet `/api/admin/booking-engine/rubitime-mapping` is still live. Same call.
      3. **Integrator `booking.upsert` webhook path** (`lookupBranchServiceByRubitimeIds`) is genuinely reachable and
         fills `patient_bookings` compat snapshots + derives `slot_end` from catalog duration. **Is Rubitime webhook
         ingestion still expected to run at all?** If yes, dropping the catalog silently degrades every ingested
         booking to the +60min `computeFallbackSlotEnd` — a behavior change that needs an explicit ruling.
      4. Confirm `patient_bookings.branch_service_id` stays a **historical trace-only** column (its FK goes with the
         drop's CASCADE), per the disposition doc.
- **B-8 (step 8) — Prod ФИО apply. DONE 2026-07-25 (commit `818f51570`).** Was TEST-only by construction
  (`targetDatabase="bersoncarebot_test"` hardcoded). Now: manifest `environment` widened to `TEST | PROD` with a strict
  environment↔approval-decision pairing **inside the hashed payload**, and a new `assertFioApplyTarget()` gate mirroring
  §3.5 — a non-TEST database is permitted ONLY with `--allow-authorized-prod-target` AND an exact
  `--authorized-prod-database=<name>` match, AND a manifest whose environment agrees (no cross-environment replay).
  Loopback + URL/`current_database()` agreement enforced in BOTH modes; `assertTestTarget()` left byte-for-byte intact;
  rollback artifacts record their target DB and are re-checked against live `current_database()`. Default (no flag) =
  today's exact TEST behavior. Evidence: `pnpm run fio:owner-reviewed-test:test` → 16 passed; `tsc --noEmit` exit 0.
- **B-9 (supports steps 9) — `deploy-prod-saas.sh`** (taskdb #994): the §3 overlays are currently a MANUAL ordered list.
  Optional to script, but until then step 9 is hand-run.

Tracking: taskdb #996 (this program), #995 (locate SMTP keys in the dump — needed by step 9/§3), #994 (`deploy-prod-saas.sh`).

---
_Maintenance: when a grant/overlay changes, update §3 here. If the prod grant closure ever gets scripted into a real
`deploy-prod-saas.sh` (taskdb #994), replace §3's manual invocation with the script name + keep the topology
prerequisite. Keep this doc the single entry point (link from `docs/CURRENT_AUTHORITY_MAP.md`)._
