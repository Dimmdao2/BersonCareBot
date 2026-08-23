# Role grants — provenance, TEST cleanup, and PROD-migration plan (2026-07-24)

> **Why this exists (owner ask 2026-07-24):** during an incident recovery the orchestrator hand-applied DB
> grants to TEST roles to bring services back up. This doc records: what/why, which are legitimate vs pollution,
> and — for the eventual PROD SaaS cutover (migrate old prod DB + full SaaS deploy) — whether each legitimate
> grant is **AUTOMATE** (bake into a migration/deploy script) or **MANUAL** (instruction for the cutover agent).
> Full forensic audit (assertion table + per-role live state + diff): session scratchpad `role-grant-cleanup-audit.md`.
> Incident + lesson: memory `deploy-asserts-runtime-role-privileges-dont-violate`. Related: WORK_ORDER D1 (`[~]`).

## 0. What a "grant" is (plain)

Each service (api/integrator, worker, scheduler, delivery, media, webapp) connects to Postgres under its OWN
login role with a MINIMAL set of permissions ("grants"): which tables it may read/write, which functions it may
run. The TEST deploy (`deploy/host/deploy-test-saas.sh`) HARD-ASSERTS each role's exact allowed set (`assert_*`
gates) — too many OR too few = deploy FATAL. That is what took TEST down on 2026-07-24 (I granted the api role
`current_org_id`/`system_settings` to fix inbound Telegram; both are on the "must-NOT-have" list).

## 1. Current TEST state

⚠️ **ФАКТ УСТАРЕЛ 2026-08-23.** Имена `*_integrator_login`, overlay-файлы и перечисленные ручные
гранты больше не являются источником прав. Текущий login — `bcb_dev_integrator` /
`bcb_test_integrator` с `canonicalRole: 'app_integrator_request'`; tenant-доступ вынесен в узкую
`app_integrator_tenant_service` (`deploy/postgres/privileges/declaration.ts`, `relation-access.ts`; D17,
22–23.08). Точные права, membership и RLS теперь производит только генератор из декларации.

- **No live violations** — the integrator role passes both assertions it's subject to; the incident's revokes
  stuck. TEST is deploy-stable now.
- **Legitimate grants (KEEP)** — all traced to canonical overlays, already AUTOMATED for TEST:
  - `public.*` D1/D2 identity+diary column-scoped writes + reads → `deploy/postgres/integrator-login-public-identity-grants.sql`.
  - `integrator.*` own-schema narrow reads/writes (8 tables SELECT + enumerated column INSERT/UPDATE, `idempotency_keys` DELETE, `schema_migrations` SELECT, 2 sequences USAGE) → same overlay.
  - 4 `app.*` EXECUTE: `release_principal_context`, `read_global_server_runtime_setting`, `read_integrator_smtp_outbound_setting`, `report_saas_isolation_event` → `integrator-server-runtime-config.sql` + `saas-isolation-telemetry.sql`.
- **Pollution (REVOKE — my ad-hoc recovery grants, NOT canonical, NOT asserted):**
  - Blanket `DELETE,INSERT,SELECT,UPDATE` on ALL 33 `integrator` tables + `SELECT,UPDATE,USAGE` on ALL 17 sequences (canonical = the 8-table narrow set above). **`integrator.schema_migrations` is RLS-off and got write/delete → the bootstrap login can currently corrupt the migration ledger. Highest-priority fix.** 9 RLS-off tables have live unrestricted DML for the bootstrap/webhook contour.
  - 86 of 90 `app.*` EXECUTE grants = the D3.4 webapp-auth/signup/invite bundle + 5 C4 delivery/scheduler functions, wrongly granted to the integrator login (canonical target is `bcb_test_nonstaff_login` / the C4 operational logins). Breaks C4's five-contour isolation. Revoke; keep only the 4 canonical.

## 2. TEST cleanup (low-risk; does NOT touch the asserted surface, restores exact canonical)

⚠️ **ФАКТ УСТАРЕЛ 2026-08-23 — НЕ ВЫПОЛНЯТЬ.** Шаги 1–3 предписывают ручные `GRANT`/`REVOKE`; после
declaration cutover это запрещено. Любая правка прав или policy идёт только через
`deploy/postgres/privileges/declaration.ts` / `relation-access.ts` и генерацию, не миграцией и не
операторским SQL.

1. `REVOKE ALL ON ALL TABLES/SEQUENCES IN SCHEMA integrator FROM bcb_test_integrator_login;`
2. `REVOKE ALL ON ALL ROUTINES IN SCHEMA app FROM bcb_test_integrator_login;` then re-`GRANT EXECUTE` the 4 canonical app functions.
3. Re-run `integrator-login-public-identity-grants.sql` (idempotent) + re-grant `USAGE ON SCHEMA integrator` + `SELECT ON integrator.schema_migrations`.
4. Verify: the two integrator assertions still pass + api restarts clean + product smoke green + watch logs for any NEW 42501 (residual risk: a code path needing a revoked grant — audit found none in `apps/integrator/src`).

## 3. PROD-migration plan (the owner's core question: automate vs manual)

⚠️ **ФАКТ УСТАРЕЛ 2026-08-23 — НЕ ИСПОЛЬЗОВАТЬ ДЛЯ CUTOVER.** Предложенная closure из overlay/inline
GRANT не соответствует действующему declaration-owned механизму. PROD остаётся вне этого документа; его
топология должна выводиться из текущей декларации и канонического deploy runbook, а не из этого плана.

**Structural finding (PROVEN by grep):** `deploy/host/deploy-prod.sh` contains **ZERO** GRANT/REVOKE and calls
**none** of the DB-provisioning overlays. There is currently **no prod-side equivalent** of `deploy-test-saas.sh`'s
grant closure. So every legitimate grant is automated for TEST but **would be MISSING on a fresh prod deploy**.

**Prod topology caveat (INFERRED, unverifiable from this TEST box):** a migration comment says prod's integrator
role has table access via **ownership** (it owns the tables) rather than explicit grants. If true, ownership could
cover the `public.*`/`integrator.*` TABLE grants — but **cannot** cover the 4 `app.*` function EXECUTE grants or
`schema_migrations` SELECT (function-level privilege ≠ table ownership). Those are MANDATORY-automate regardless.

### Disposition

| Item                                                                            | Automate or Manual                                                                                                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All legitimate D1/D2/A7 table + function grants (the overlays above)            | **AUTOMATE** — build a prod DB-provisioning closure that reuses the SAME overlay files with prod role names (see below).                                                    |
| The 4 `app.*` EXECUTE + `schema_migrations` SELECT                              | **AUTOMATE (mandatory)** — ownership can never cover these.                                                                                                                 |
| Confirm prod's actual role topology (split `*_login` roles vs old single-owner) | **MANUAL prerequisite** — read-only prod inspection (`\du`, `pg_tables.tableowner`) by whoever has sanctioned prod access; the TEST role names/count may not translate 1:1. |
| The incident's blanket "ALL TABLES/FUNCTIONS" grants                            | **NEVER automate** — pollution; baking them into prod would permanently ship the excess-privilege bug.                                                                      |

### PROD CUTOVER sequence (ordered)

1. **[MANUAL, first]** Inspect prod role topology (read-only) → decide: adopt the TEST-style split-login model on
   prod (recommended, consistent with the SaaS direction), or keep single-owner for migrated data.
2. **[AUTOMATE — scoped engineering task]** Build `deploy-prod-saas.sh` (or a shared `deploy-saas-db-closure.sh`
   sourced by both test + prod) that runs, env-parameterized with prod role names, the same chain the TEST closure
   runs: P2-B principal-context → D3.4 base-login grants → C4 operational (5-contour) → integrator-server-runtime-config
   → integrator-login-public-identity-grants → saas-isolation-telemetry → migration-ledger SELECT (currently
   bash-inline in `deploy-test-saas.sh:605` — **extract to a `.sql` file** so both scripts can reuse it).
   _This is a real lift — promoting the TEST DB-provisioning half to a reusable module — not a one-liner._
3. **[AUTOMATE]** Run that closure in the prod SaaS deploy after migrations, before service restart (mirrors TEST order).
4. **[AUTOMATE — verify]** Re-run the same `assert_*` gates (already env-parameterized) against prod before declaring done.

**Bottom line for the owner:** the legitimate grants are ALREADY automated for TEST; the missing piece is that
**prod has no DB-grant provisioning at all** — so the SaaS cutover needs a scoped task to build the prod-side
closure (reusing the existing overlays). The 4 function grants + migration-ledger read MUST be automated (no
ownership shortcut). One manual prerequisite: verify prod's role topology first. Do NOT carry the ad-hoc pollution forward.
