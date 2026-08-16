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
> **Текущие authority и исторические ссылки:**
>
> - Host/cutover, encryption, backup and infrastructure security: `../INFRASTRUCTURE_SECURITY_PLAN.md`
> - DB logins/roles/grants/RLS/DB-port contract: `../DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` (не дублируется здесь)
> - DB migration mechanics (fresh dump → hard migration): `HARD_MIGRATION_PROTOCOL.md` + wrapper `deploy/host/deploy-test-full-reset.sh` (internal engine `deploy/host/deploy-test-saas.sh`)
> - DB deploy sequence + PROD mapping notes: `SAAS_DEPLOY_SEQUENCE.md`
> - `../ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` и §3/§3.5 ниже — исторический snapshot, **не
>   исполнять**; их заменил `../DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`
> - Measured PROD/TEST divergence and new-host scope: `../PROD_VS_TEST_DIVERGENCE_2026-07-26.md`
> - Legal/privacy GO-gates: `../RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md` (PR-00..PR-04, SEC-02/03/04, DR-01/02, CRYPTO-01)
> - Deploy topology / host facts: `deploy/HOST_DEPLOY_README.md`
>
> **Hard rule:** PROD (135.x) is untouchable except by an explicit owner GO for the cutover window. Agents never run
> destructive prod steps autonomously. TEST rehearses everything first.

## MASTER ORDERED CHECKLIST (the single sequence — follow top to bottom)

> This is THE instruction. Each step links to its detail section below. Status legend:
> ✅SCRIPT (one command, proven) · ✍️MANUAL (exact commands here) · ⛔BLOCKED (needs a build first — see §8 Blockers).
> **Hard ordering (not preference):** owner-account consolidation first → identity-fix → reviewed migrations →
> provider-neutral cleanup; roles/grants → walls. **Owner correction 2026-08-15:** the retired runtime/provider
> integration stays deleted, but the reviewed CSV is again an input to the one-time data transition. Accepted
> legacy history must be canonicalized before migrations drop its source tables. Reviewed FIO also runs before
> migrations 0377/0381 create and start reading `user_identity`.
>
> - [ ] **1. GO-gates** (owner/legal, must be green) — §1. ✍️MANUAL
> - [ ] **2. Fresh prod dump → named rehearsal target** (`bersoncarebot_test`; no intermediate/disposable DB) — §2. ✅SCRIPT (`deploy/host/deploy-test-full-reset.sh`, engine `deploy-test-saas.sh`)
> - [ ] **2a. Consolidate the owner's staff identity — FIRST DATA MUTATION** — §2.0. ✅SCRIPT (`apps/webapp/scripts/consolidate-owner-identity.sql`); PROD not yet executed
> - [ ] **3. Identity data-fix** (doctor=yandex canonical; tezka email stripped; **gmail=HARD `role='admin'`**) — runs automatically as the DATAFIX step BEFORE migrations. §7 #1/#2. ✅SCRIPT (`p0-data-fix-doctor-admin-split.sql`)
> - [ ] **4. Fix ФИО by reviewed table — PRE-MIGRATION** — hash-bound manifest apply while `platform_users` is still the sole identity source. ✅SCRIPT
> - [ ] **5. Legacy appointments → canonical — PRE-MIGRATION** — hash-bound owner CSV; test/non-confirmed/stale classifications plus accepted-history transfer; zero live unresolved rows is the destructive-drop gate. ✅SCRIPT (`cutover-legacy-appointments.ts`)
> - [ ] **6. One atomic PROD schema A → current DEV schema B transition** — copy prepared data, install exact target ledgers and drop legacy surfaces in `prod-to-target-cutover.sql`; historical migration runners are not invoked. ✅SCRIPT
> - [ ] **7. Target data/shape assertions + TEST settings overlay** — fail in the same wrapper before runtime restart. ✅SCRIPT
> - [x] **Historical 29.07 cancellation is superseded for data transition only.** Runtime Rubitime remains removed; archive R1 scripts remain inert. The current cutover script is the sole executable path.
> - [ ] **9. Generated port-context access closure** — target zero + four physical logins + exact generated grants/RLS/FORCE + catalog proof through the single-target cutover; no manual overlays. ✅SCRIPT
> - [x] **10. Historical manual grants/strict-finalizer sequence is superseded.** §3/§3.5 remain provenance only and are not executable instructions.
> - [ ] **11. Service restart + units/health gate** — wrapper proves five active TEST units and `ok=true, db=up`; then run the separate owner-required three-account page/Console/Network acceptance. §4. ✅SCRIPT + explicit post-deploy acceptance
> - [ ] **12. Cutover + rollback** (owner GO → flip traffic; keep old host for rollback horizon) — §5. ✍️MANUAL
> - [ ] **13. Post-cutover verification** (delivery/alerting live; decommission old only after owner GO) — §6. ✍️MANUAL
>
> **Authorized rehearsal order 2026-08-15:** 2→2a→3→4→5→6→7→9→11. The TEST wrapper is being used only after
> synchronizing this exact order and binding both owner-reviewed inputs by hash.

## 0. When this runs

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Once, at the SaaS production cutover: stand up the new encrypted prod host (INFRA-01), migrate the current prod DB
onto the SaaS schema, provision runtime roles+grants, deploy services, verify, cut traffic over.

## 1. Owner / legal GO-gates (MANUAL — must be green before the window)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

The authorized rehearsal restores the fresh dump directly into the named `bersoncarebot_test` target. It does not
create an intermediate or disposable database. The future production run uses the same data-stage → one A → B →
generated-access order on the new production host after its separate owner GO.

- **Script:** the fresh-dump hard migration — `HARD_MIGRATION_PROTOCOL.md` + `deploy/host/deploy-test-full-reset.sh`
  (owner-gated wrapper; NOT the plain `deploy-test.sh`/`pnpm migrate`). After the reviewed data stage it executes
  only `deploy/postgres/prod-to-target-cutover.sql`; it does not replay historical webapp/integrator migrations.
- The wrapper runs data preparation → one atomic A → B transition → TEST settings overlay → generated
  single-target port-context zero/install/catalog closure → five-service restart and health gate. Product
  page/Console/Network traversal is the separate post-deploy acceptance step; the wrapper does not claim it.

### 2.0 Owner staff identity consolidation — first data mutation

- [ ] On the fresh cutover target, before the other identity fixes, the wrapper runs
  `apps/webapp/scripts/consolidate-owner-identity.sql` once as the TEST database owner. The SQL owns its assertions,
  merge/delete work and `COMMIT`; there is no separate dry-run or comparison-to-old-TEST step. PROD has not been
  changed. The executable authority is
  [`docs/OPERATIONS/OWNER_IDENTITY_CONSOLIDATION.md`](../../OPERATIONS/OWNER_IDENTITY_CONSOLIDATION.md), and its
  place in the sequence is fixed by [`PRE_PRODUCTION_TODO.md` §0](../PRE_PRODUCTION_TODO.md). The former
  `9475c2a9` contradiction was resolved by the owner on 2026-08-15: the dead patient tombstone is deleted.

Owner, 2026-07-28: «Смержим до конца и оставим одну каноническую запись. причем сделаем скриптом и теперь уже
не потеряем его. Впишем в последовательность миграции в самом начале - первым шагом» + «и чисти пустышки».
The survivor remains `role=doctor` and clinic owner, never global admin: «помни что ты сливаешь аккаунты которые
должны стать одним АДМИНОМ КЛИНИКИ, а не глобальным-админом».

The historical request for a separate TypeScript/catalog-driven 128-FK implementation from taskdb `#1072`/`#1073`
is **SUPERSEDED/CLOSED** by the owner's later flat one-shot SQL ruling. It is not an executable cutover blocker or
a second implementation path; its provenance remains in the task history.

## 2.1 SUPERSEDED HISTORICAL — phased migration-chain rehearsal findings (2026-07-25)

This section explains why the former phased runner failed and is retained only for provenance. Do not execute its
scratch recipe, bridges, temporary BYPASS sequence or historical migration chain during the current TEST rehearsal;
§2 and `HARD_MIGRATION_PROTOCOL.md` define the replacement one-A → B path.

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

| #   | Defect (from-zero only)                                                                                                                                                                                                                                                                    | Fix                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/tmp/bcb-prod-fresh.dump` left from a previous run is chowned `postgres:0600`, so the next pull dies with `Permission denied` **mid-reset**, after TEST writers are stopped                                                                                                               | `15fdac233` — remove the stale artifact before pulling                                                                       |
| 2   | identity data-fix asserted a live `dimmdao@gmail.com` row that does not exist on prod (steps 1+3 free that email)                                                                                                                                                                          | `10b29f4ce` — CREATE the clean global-admin account when absent (owner instruction #3)                                       |
| 3   | migration `0218` spells `app.current_org_id()` into POLICY expressions; no migration creates it (only the post-chain overlay does) → whole batch aborts `P0001`/rolls back                                                                                                                 | `f1fe3e943` — fail-closed bootstrap stub in `0175`                                                                           |
| 4   | `0219` resolves `app.current_patient_user_id()` eagerly → `42883 undefined_function`                                                                                                                                                                                                       | `9f95bdfab` — stubs for the other two accessors (16 migrations depend on them)                                               |
| 5   | `0225` runs `ALTER FUNCTION … OWNER TO app_owner`, which requires MEMBERSHIP in `app_owner` — deliberately zero-member                                                                                                                                                                     | `4f8565647` — temporary membership for the migrate step only, revoked + **unconditionally re-asserted** back to zero members |
| 6   | same `ALTER … OWNER TO app_owner` also requires the NEW owner to hold **CREATE on the schema**; `app_owner` had neither USAGE nor CREATE on `app` at migration time (USAGE is granted only by the post-chain `e1-webapp-runtime-config.sql:71`) → `42501 permission denied for schema app` | `15d9748be` — `GRANT USAGE, CREATE ON SCHEMA app TO app_owner` in `0175`, role-existence guarded                             |

**HARD PREREQUISITE discovered — seam/capability role names must exist BEFORE the migration chain.** Migrations
GRANT to / transfer ownership to `app_owner`, `app_staff`, `app_patient` and other declared roles. On this box
those cluster-level roles already existed, which masked the dependency; on a **virgin prod host they will not**,
and the chain fails with `42704 undefined_object`. The canonical prerequisite is now
`node deploy/postgres/privileges/generate-cli.mjs --shared-role-baseline`, followed by
`--shared-role-verify`, applied by `deploy-test-saas.sh` immediately before migrations. Because revision 10
correctly retired `app_owner`, `app_identity_bootstrap` and `app_operational_diagnostic` while the historical
migration SQL still names them, the wrapper then applies `deploy/postgres/pre-migration-legacy-role-bridge.sql`.
That bridge is temporary and creates only those three `NOLOGIN` names with fail-closed attributes and zero
members; the final target zero removes them. Neither layer creates a runtime login, password or per-database
grant. Exact database ACL and the four runtime logins still install after migrations in the single-target
port-context cutover.

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

## 2.2 SUPERSEDED HISTORICAL — former demo-fixture closure findings (2026-07-25)

This section records why the old locked overlay/fixture closure was retired. It is not an active decision or
execution path: the current fresh-reset does not seed S3 A/B clinics, mint stored smoke sessions, run the old
nginx/A2/E1 chain or take TEST down on a post-restart product-smoke failure. Current authority is §2 plus
`HARD_MIGRATION_PROTOCOL.md`; owner page acceptance happens separately after deploy.

The post-migration closure itself now runs end to end on a from-zero prod dump: roles+grants → protected
principal helpers → reviewed overlays → isolation telemetry → integrator login grants → **reversible SaaS
isolation scenario proof** → TEST settings → **base policies → safe overlays → exact FORCE assertions** →
C4 three-DB-login provisioning plus authenticated media control → strict+FORCE reassertion → nginx → ordered TEST
restart (new webapp → control → legacy media-login retirement → media-worker). Two things surfaced:

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
→ **SUPERSEDED OWNER QUESTION:** (A) re-seed the synthetic demo clinics on TEST — they exist purely
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

## 2.5 Retired provider tables in an old dump

Rubitime runtime was retired on 2026-07-27. The former R1–R7 plans, CSV backfill and archive/drop scripts are
historical only: `docs/archive/2026-07-rubitime-retirement/README.md`. They are not executable dependencies of this
production process and must not be rerun.

An old source dump may still contain legacy provider tables. The supported path is the atomic
`prod-to-target-cutover.sql`, followed by its retired-relation inventory. Migration
`0237_r7_drop_public_rubitime_mirror_tables.sql` is historical provenance and is not replayed on the restored dump.
Do not run archive scripts or ad-hoc DROP from the retired packet. Any remaining table not covered by the A → B
requires a new owner-reviewed provider-neutral migration. `public.appointment_records`, generic retry storage,
calendar mappings and canonical booking data are separate provider-neutral concerns and are not dropped merely
because Rubitime is retired.

## 3. SUPERSEDED — Runtime role grants (исторический snapshot, не исполнять)

> Этот раздел сохранён для provenance старого deploy-процесса. Команды, порядок overlays и topology ниже заменены
> текущим `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`; переносить их в DEV/PROD или использовать как параллельный checklist
> запрещено.

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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
3. `deploy/postgres/c4-operational-runtime.sql` (+ `deploy/host/provision-c4-operational-runtime.sh`) — exactly three
   operational DB logins; media-worker has no DB login and enters only through authenticated webapp HTTP control.
4. `deploy/postgres/integrator-server-runtime-config.sql` — api role: EXECUTE on `read_global_server_runtime_setting`/`read_integrator_smtp_outbound_setting`/`release_principal_context`.
5. `deploy/postgres/integrator-login-public-identity-grants.sql` — D1/D2 identity+diary column-scoped writes + narrow integrator-schema reads (`-v integrator_login_public_identity_grants_role=<prod integrator role>`).
6. `deploy/postgres/saas-isolation-telemetry.sql` — `report_saas_isolation_event` EXECUTE.
7. **Migration-ledger read (MANUAL one-off — currently only bash-inline in `deploy-test-saas.sh:605`, not a reusable `.sql`):**
   `GRANT USAGE ON SCHEMA integrator TO <prod integrator role>; GRANT SELECT ON TABLE integrator.schema_migrations TO <prod integrator role>;`
   _(If/when scripted: extract to a `.sql` overlay and move this into step list; until then it's a documented manual command.)_

**MANDATORY-automate regardless of ownership:** steps 4 (the 4 `app.*` EXECUTE) + 7 (schema_migrations SELECT) —
table ownership can NEVER cover function-level privileges or a separate-identity ledger read.

**NEVER run:** the incident's ad-hoc `GRANT ALL ON ALL TABLES/SEQUENCES/FUNCTIONS IN SCHEMA integrator/app` — that
was pollution, not canonical (see `ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` §1). Only the overlays above.

## 3.5 SUPERSEDED — strict RLS + FORCE (исторический snapshot, не исполнять)

> Актуальные RLS/grants/cutover gates находятся только в `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`. Текст ниже сохранён
> как датированное объяснение прежнего процесса и не является инструкцией.

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
dump straight into the canonical `public.system_settings` row using `dblink`, so
the credential never passes through a shell argument, a file, or a log. TEST send-safety stays in force
(`DEV_REDIRECT_EMAIL` plus the passthrough allowlist), which is what makes this safe to do at all.

**Separate blocker, do not confuse the two:** with the credential present the login screen STILL hid the
email-code option, because the public login path runs under a bootstrap principal that has no `SELECT` on
`system_settings`, so the "is SMTP configured?" read raised, was swallowed, and reported false. See
`docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md`, section "LOGIN IS BROKEN ON TEST".

## 4. Service release + post-deploy acceptance

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

For the current TEST rehearsal, `deploy-test-full-reset.sh` owns the service release. After generated access
installation it installs/asserts the TEST media-worker unit, restarts `api`, `worker`, `scheduler`, `webapp` and
`media-worker`, proves all five units active, and requires `/api/health` to report `ok=true` and `db=up`.

After the wrapper returns, run the separate owner-required acceptance against the real TEST domain: traverse every
page for the canonical global-admin, doctor and patient accounts and require complete rendering with clean browser
Console/Network (no unexpected 4xx/5xx, redirect loop, blank data panel or failed action). The historical
`smoke-saas-product.mjs --mode=locked`, stored demo sessions, C4 media sequence and old `assert_*` list are not
claimed or invoked by the current fresh-reset wrapper.

The future new-PROD-host service release needs its own reviewed owner-gated command and traffic-cutover gates; do
not infer that implementation from the retired TEST closure.

## 5. Cutover + rollback (per INFRA-01 §I5/§rollback)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Owner GO → flip traffic to new host. Keep old host + fresh backup for the rollback horizon.
- Phased rollback model per INFRA-01. DR-01/02 restore proven beforehand.

## 6. Post-cutover (INFRA-01 §I6)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Verify delivery/alerting live; decommission old host only after owner authorizes + rollback horizon passes.

## 7. Per-item readiness matrix + gaps (inventory 2026-07-24)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> ⚠️ **SUPERSEDED (2026-07-26)** — item 2 below describes the old session-only `admin_emails` elevation as a
> "harmless redundant belt" beside the persisted role; that allowlist grant path is now the superseded scheme.
> Canon: [ADMIN_ACCESS_MODEL.md](../../ARCHITECTURE/ADMIN_ACCESS_MODEL.md).

Cross-cutting boundary (current): the command proven here targets only the named `bersoncarebot_test` rehearsal
database. It is not pointed at a renamed/disposable database and is not the future production-host wrapper.
Production adaptation remains separately owner-gated; historical §3/§3.5 unlocks are not the current TEST path.

| #   | Step                                                           | Asset                                                                                                                                                                                                                                                                                                                                                                                                                     | Status                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Specialist/doctor merge + identity data-fix                    | `apps/webapp/scripts/consolidate-owner-identity.sql` is the first data mutation; `deploy/postgres/p0-data-fix-doctor-admin-split.sql` follows it in the same wrapper. The old `consolidate-specialist-identity.ts` path is not invoked.                                                                                                                                                | READY FOR TEST REHEARSAL — flat owner consolidation is data-derived/asserting and the following identity split fixes roles before FIO/A → B.                                                                                                                                                                                                                              |
| 2   | Global-admin account (**HARD role, owner 2026-07-25**)         | `deploy/postgres/p0-data-fix-doctor-admin-split.sql` (hard-sets `dimmdao@gmail.com` → `platform_users.role='admin'`) + migration `0233_global_admin_hard_role.sql` (asserts the same in the migration chain)                                                                                                                                                                                                              | READY — **CORRECTED**: the global admin is a real persisted `role='admin'` (a dedicated account, separate from the doctor), NOT the old session-only `admin_emails` elevation. `service.ts:102` maps `role='admin'`→adminMode. Membership seed 0143 is doctor-only, so a persisted admin is never seeded into an org. `admin_emails` stays as a harmless redundant belt. |
| 3   | Delete old test records                                        | `purge-placeholder-bookings.ts` + `backfill-...--cleanup-only --delete-test ...` (`purge-placeholder-bookings-safety.ts`)                                                                                                                                                                                                                                                                                                 | PARTIAL/BLOCKED — safety module unconditionally refuses prod-named DB; needs reviewed override before cutover                                                                                                                                                                                                                                                            |
| 4   | Historical appointment transition                              | `apps/webapp/scripts/cutover-legacy-appointments.ts`; owner CSV is hash-bound and used only for accepted ids/date range. Archive R1 tools remain inert.                                                                                                                                 | CURRENT PRE-MIGRATION STEP (owner 2026-08-15); zero live unresolved is mandatory before drops.                                                                                                                                                                                                             |
| 5   | Retired provider mirror tables                                 | Removed by the atomic `prod-to-target-cutover.sql` after step 4 has copied accepted history. Historical migrations `0262` and the integrator retirement migration are provenance only on this path.                                                                                                                                                | CURRENT A → B step; final retired-relation inventory must be zero.                                                                                                                                                                                                                                         |
| 6   | Provider-neutral legacy cleanup                                | The pre-cutover data stage closes all live legacy rows; the atomic A → B transition copies canonical data and removes `appointment_records`.                                                                                                                                          | CURRENT; no separate runtime Rubitime workstream and no historical migration replay.                                                                                                                                                                                                                       |
| 7   | Track D — integrator writes public directly, no HTTP transport | D0/D1/D2 merged (`directPublic/*`); D3–D10 unstarted; doc says "PROD out of scope" now                                                                                                                                                                                                                                                                                                                                    | PARTIAL (3/11); prod-cutover implication undocumented                                                                                                                                                                                                                                                                                                                    |
| 8   | Roles + grants                                                 | TEST uses the declaration-generated single-target zero/install/catalog closure through `initial-cutover.mjs`; §3 is historical only.                                                                                                                                                                                                                                                                                    | READY FOR TEST REHEARSAL; the future new-PROD-host wrapper remains a separate owner-gated adaptation.                                                                                                                                                                                                                                                                      |
| 9   | Install walls (strict RLS + FORCE)                             | Included in the same generated target privilege artifact and catalog proof; §3.5 and `test-strict-rls-finalizer.sql` are historical provenance, not an additional current step.                                                                                                                                                                                                                                       | READY FOR TEST REHEARSAL; no manual wall overlay follows the generated closure.                                                                                                                                                                                                                                                                                           |
| 10  | Post-cutover verification                                      | Current wrapper proves five active TEST units plus health/db. The owner-required three-account page/Console/Network traversal runs separately after deploy; historical locked fixture-smoke is not reused.                                                                                                                                                                                                               | CURRENT TEST ACCEPTANCE STEP; completion is evidence from the real post-deploy traversal, not a wrapper claim.                                                                                                                                                                                                                                                            |
| 11  | Fix ФИО by reviewed table                                      | `apps/webapp/scripts/fio-backfill/*`; TEST and explicit authorized-PROD target gates exist.                                                                                                                                                                                                                                                           | CURRENT PRE-MIGRATION STEP; TEST uses the reviewed TEST manifest, PROD later requires the environment-matching PROD seal.                                                                                                                                                                                   |

**Ready for the current TEST rehearsal:** #1/#2 identity data-fix (doctor merge + **hard global admin**,
corrected 2026-07-25), #9 generated access closure, followed by the separate #10 acceptance. The future new-PROD
host still requires its own owner-gated wrapper/adaptation. The retired Rubitime
archive/mirror-drop tooling is not an entrypoint. **Real authoring gaps:** #11 (prod ФИО apply), a separately
owner-reviewed provider-neutral appointment cleanup workstream, and #7 (Track D D3–D10).
**Guard-unlock needed for future PROD:** #3 (and the shared wrapper #4 rides on it); historical §3.5 is not the
current TEST walls gate.

**Confirmed current ordering (owner 2026-08-15):** fresh dump → merge identity → identity data-fix → reviewed
FIO → hash-bound legacy appointment transition → declaration-derived NOLOGIN prerequisites → one atomic
`prod-to-target-cutover.sql` A → B transition → TEST settings overlay → generated single-target port-context
zero/install/catalog closure → runtime gates. The CSV belongs only to the one-time transition; no archived
Rubitime command, historical migration runner, manual grant/finalizer chain or runtime integration returns.

Fresh-PROD correction: `0143_seed_staff_organization_members` now seeds the canonical specialist retained by
the preceding owner consolidation instead of the deleted duplicate. `0420_reconcile_canonical_owner_membership_local`
repairs already-migrated databases and carries the repository's migration-hash reconciliation marker for `0143`.

## 8. SUPERSEDED HISTORICAL — pre-A → B blocker inventory

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

This entire section is historical gap provenance and is not an executable backlog for the authorized 2026-08-15
TEST rehearsal. Current execution is the complete ordered transition in the master checklist; do not reintroduce
its disposable probes, normal migration chain or manual finalizer.

- **B-5 (checklist step 5) — Test-record cleanup + dedup guard-unlock.** `purge-placeholder-bookings.ts` +
  `backfill-...--cleanup-only --delete-test` exist, but `purge-placeholder-bookings-safety.ts` unconditionally refuses
  any prod-named DB with no override. **Build:** add the same explicit-flag gate §3.5 uses for the walls finalizer
  (`allow_authorized_prod_target=1` + exact expected-DB match), not a blanket removal. Then rehearse on a disposable copy.
- **B-6 — ЗАМЕНЕНО 2026-08-15.** Archived Rubitime tools stay retired, but the owner-reviewed CSV is an input to
  `cutover-legacy-appointments.ts`, the current pre-migration canonical transfer.
- **B-7 — SUPERSEDED/CLOSED BY CURRENT A → B ORDER.** Legacy mirror removal now happens inside
  `prod-to-target-cutover.sql` only after the data stage proves zero live unresolved legacy appointments;
  reviewed normal migrations are not replayed.
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

## 9. Taskdb-card provenance retained before consolidation

This section preserves the evidence and owner constraints from the seven source cards. It does not change taskdb;
the lead applies the consolidation proposal from `DOCS_PLAN_HYGIENE_2026-07-29.md`.

- **`#994` — PROD DB-grant closure.** `deploy/host/deploy-prod.sh` has zero `GRANT`/`REVOKE` and calls none of
  the DB-provisioning overlays. The required order, mandatory automation of the four `app.*` `EXECUTE` grants plus
  `schema_migrations SELECT`, read-only role-topology prerequisite, and prohibition on carrying the ad-hoc
  ALL-TABLES/FUNCTIONS pollution into PROD are in §3, B-9 and
  `ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` §3.
- **`#996` — the consolidated cutover program.** Owner 2026-07-25: «делай все это». The card requires the
  single ordered runbook, closure of steps 5–8, and a fresh-prod-dump full-reset rehearsal with clean boot, assert
  gates and product smoke; these are the master checklist and §8. The already committed identity fix evidence is
  retained verbatim: `fde909270`, `0a0c6cff5`.
- **`#1042` — move to the new production server.** The owner's question was «когда пора загружать платформу
  на новый сервер». The measured inventory is retained in
  `PROD_VS_TEST_DIVERGENCE_2026-07-26.md`: `origin/main`/`d09ea70c8`, **1,831 commits / 3,729 files /
  +540,730 −51,399 lines**, only 136 migrations on `main` versus 251 on the feature branch, no organization/RLS
  foundation on the old PROD path, root-run services, the hardcoded identity anchors, and the conclusion that a
  clean new-host build is smaller than in-place migration. PROD was not touched. The new-host frame is also the
  first blockquote of this document; owner resource O-07 and stable release/GO remain open in §1.
- **`#857` / `#858` — FIO closeout.** Step 8 points to
  `.cursor/plans/fio_identity_cleanup.plan.md` Phases 9–11 and
  `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/README.md` Phases 9–11. TEST evidence is `#849` only; PROD mutation
  still requires the exact current-copy preview/manifest and explicit owner command. Runtime parser retirement
  remains after production reconciliation; the one-off dictionary parser is not runtime, and notification
  templates are separate.
- **`#1072` / `#1073` — owner staff identity.** Step 2a and
  `docs/OPERATIONS/OWNER_IDENTITY_CONSOLIDATION.md` retain the survivor/tombstone scope, the clinic-admin-not-global
  owner constraint, protected records, cleanup set, TEST evidence, later flat-SQL ruling, no-dangling-reference
  gate, and the still-open DB no-repeat invariant and `f9365e51b` script-restoration requirement.

---

_Maintenance: when a grant/overlay changes, update §3 here. If the prod grant closure ever gets scripted into a real
`deploy-prod-saas.sh` (taskdb #994), replace §3's manual invocation with the script name + keep the topology
prerequisite. Keep this doc the single entry point (link from `docs/CURRENT_AUTHORITY_MAP.md`)._
