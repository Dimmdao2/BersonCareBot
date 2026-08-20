> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# TASK A — Tighten PII bootstrap-hybrid tables (plan + checklist)

> **2026-07-27 — было → стало → почему.** Было: файл показывал 25 открытых боксов, что читалось как «почти
> ничего не сделано». Стало: перепроверил каждый пункт против кода (не против отчётов) — 16 из 25 сделаны и
> подтверждены живым прогоном чекеров/тестов сегодня, 1 сознательно оставлен открытым как решение владельца
> (FB#1, см. отметку на месте), 8 остаются реально открытыми (в основном FLIP-BLOCKERS — enforce/locked-режим
> ещё не включён, и это НЕ нужно для текущего TEST-dormant режима, сам файл это пишет). Почему теперь тикаю:
> само по себе строчка ⚠️ STALE-CORRECTION 2026-07-24 уже утверждала, что шаги 1-3 сделаны — я перепроверил это
> утверждение построчно (схема, миграция 0178, оба RLS-скрипта, все 5 чекеров живым прогоном сегодня) и
> подтверждаю независимо. Также нашёл и явно пометил внутреннее противоречие: более старая пометка «REOPENED
> 2026-07-23» под FLIP-BLOCKERS всё ещё говорит «шаги 1-3 остаются [ ]» — это фактически устарело (шаги 1-3
> подтверждённо сделаны), помечено `SUPERSEDED` на месте, а не удалено.

> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md
>
> **⚠️ STALE-CORRECTION (verified live on TEST 2026-07-24):** the §Checklist step-3 boxes and the 07-23 note
> "step 3 (RLS DSL split) not done / bootstrap_hybrid_org_gated never added" are **WRONG — that work IS done and
> DEPLOYED on TEST.** Reality: `rls-descriptor-model.mjs:205` gives both PII tables `scopingKind:
"bootstrap_hybrid_org_gated"`; `renderBootstrapHybridOrgGatedPredicate` (rls-sql-renderer.mjs:504);
> `p0-8-6-policy-targets.mjs` asserts per-table shapes; live TEST policy `saas_bootstrap_hybrid_p0_8_6` = the
> exact strict gated predicate under FORCE (relforcerowsecurity=t) → **the NULL-org staff-read leak is CLOSED on
> TEST.** New canon for current status: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_EXECUTION_LEDGER_2026-07-24.md` §item 5.
> **STILL-VALID here (not superseded — carry forward):** the "NOT DONE — FLIP-BLOCKERS" section below (FB#1
> bootstrap/OTP phone-write under enforce; FB#1 close-prior UPDATE vs partial unique index for NULL-org active
> rows; FB#2 base-role shape) — these runtime paths are NOT yet proven under the live strict+FORCE on TEST and
> remain the real open work.

> Single source of "done" for this task (owner rule #2). Every item `- [ ]/[x]` with an evidence link.
> Canon model: `TENANT_WALLS_AND_ACCESS_MODEL.md`. Spec: `HANDOFF_2026-07-12.md` §"TASK A". Task: taskdb #708.
> Branch `auto/code-pg-delta`. NOT pushed to main/test. Validation ONLY on disposable `bcb_saas_*_rehearsal_*`.

## Problem (the hole)

`public.platform_user_contacts` and `public.user_phone_history` are `scopingKind: bootstrap_hybrid`
(`rls-descriptor-model.mjs:34-40`). Their RLS predicate
(`renderBootstrapHybridPredicate`, `rls-sql-renderer.mjs:491-495`) is:

```
("organization_id" IS NULL OR (app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()))
```

The leading unqualified `"organization_id" IS NULL` makes every NULL-org row readable by ANY session
(incl. any clinic's staff). That is the leak to close at enforce. The other 3 hybrid tables
(`system_settings`, `system_settings_audit`, `integrator.system_settings`) legitimately keep global-NULL
(platform defaults) — DO NOT change them.

## Target predicate (strict) — BOTH PII tables, surgical single change

```
(app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())
OR
("organization_id" IS NULL
   AND app.current_org_id() IS NULL
   AND app.current_patient_user_id() IS NULL
   AND app.current_integrator_user_id() IS NULL
   AND NOT app.is_staff())
```

- Closes hole: staff of clinic A (current_org_id=A) never matches the NULL branch → no global NULL read.
- Keeps integrator write of phone_history (org-match branch has NO `is_staff()` gate; patient never carries org, so no exploit).
- Keeps bootstrap read/write of genuine NULL rows (OTP/messenger/public-booking run under context-less bootstrap principal → matches the 2nd branch).
- DORMANT wrap = `((dormantCompatibilityPredicate) OR strict)` (the SCOPED path, NOT the bootstrap_hybrid short-circuit) so legacy `legacy-guc` clinic #1 still sees ALL rows → **not blocked**.

## Three traps the implementation MUST respect

1. **Dormant trap:** these 2 tables must flow through the general dormant path
   (`renderPhase4DormantCompatPredicate` line ~90 → `((dormantCompat) OR strict)`), NOT the
   `scopingKind === "bootstrap_hybrid"` short-circuit at `phase4-locked-policy-artifact.mjs:86-88`.
   Otherwise backfilled rows become invisible in the default legacy-guc mode and clinic #1 breaks.
2. **Integrator write:** `pgUserProjection.updatePhone` (source=projection) closes prior interval via UPDATE;
   integrator is NOT staff → org-match branch must NOT require `is_staff()`.
3. **Bootstrap write:** OTP (`pgUserByPhone.createOrBind`), messenger (`pgPhoneMessengerBind`), public booking
   (`upsertBookingFormContactsBestEffort`) run under context-less bootstrap principal → they write NULL-org rows
   → the NULL branch (gated to bootstrap) must remain so those writes pass WITH CHECK.

## Checklist

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### 1. Drizzle schema + migration

- [x] **Add `organizationId: uuid("organization_id")` (nullable) + `idx_*_organization_id` + idempotent FK to
      `be_organizations(id) ON DELETE CASCADE` to `platform_user_contacts` (`apps/webapp/db/schema/platformUserContacts.ts`).** —
      `apps/webapp/db/schema/platformUserContacts.ts:14` (column), `:30` (`idx_platform_user_contacts_organization_id`),
      `:31-35` (`platform_user_contacts_organization_id_fkey` → `be_organizations.id` cascade).
- [x] **Same for `user_phone_history` (`apps/webapp/db/schema/schema.ts:130`).** —
      `apps/webapp/db/schema/schema.ts:133` (column), `:140` (`idx_user_phone_history_organization_id`),
      `:148-151` (`user_phone_history_organization_id_fkey` → `be_organizations.id` cascade).
- [x] **New migration `apps/webapp/db/drizzle-migrations/0178_*.sql` (template: `0151_*`): ADD COLUMN IF NOT EXISTS,
      index, idempotent FK, backfill, journal entry `meta/_journal.json` (idx 178, `when` strictly > 177's).** —
      `apps/webapp/db/drizzle-migrations/0178_pii_bootstrap_org_scope.sql` exists with exactly this shape
      (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, idempotent `DO $$ ... IF NOT EXISTS` FK add,
      backfill, residual-NULL `RAISE NOTICE`); `meta/_journal.json` idx 178, `when: 1791206400000`, strictly
      between idx 177 (`1791120000000`) and idx 179 (`1791292800000`).
- [x] **Backfill (idiom from 0151/0152): single active org via
      `org_enrollments WHERE status='active' GROUP BY platform_user_id HAVING count(DISTINCT organization_id)=1`
      (optionally UNION `be_organization_members` active). Stamp that org where unambiguous.
      Leave NULL for genuine pre-auth (0 or multi enrollment) rows — do NOT COALESCE-to-default (unlike message_log),
      because the gated-NULL branch depends on real bootstrap rows staying NULL. Add a post-backfill NOTICE (not
      EXCEPTION) reporting residual NULL count per table.** — migration `0178_pii_bootstrap_org_scope.sql`'s
      `user_org` CTE is exactly this UNION+`HAVING count(DISTINCT organization_id)=1` shape for both tables, no
      COALESCE-to-default, and ends with a `DO $$ ... RAISE NOTICE 'P0.8.6 PII bootstrap org scope residual NULL
    ...'` block (not an exception) reporting both residual counts.

### 2. Repos stamp organization_id

- [x] **`pgPlatformUserContacts.upsertContact`: stamp `organization_id` from `getCurrentDbPrincipalOrganizationId()`
      (`@bersoncare/db-principal`) — set for doctor/admin; `undefined` (→ NULL) for booking/bootstrap.** —
      `apps/webapp/src/infra/repos/pgPlatformUserContacts.ts:1,54,59`.
- [x] **`pgPhoneHistory.applyPlatformUserPhoneHistoryTransition`: add `organization_id` to the INSERT, sourced from
      `getCurrentDbPrincipalOrganizationId()` (set for admin/projection; NULL for otp/messenger bootstrap).** —
      `apps/webapp/src/infra/repos/pgPhoneHistory.ts:4,42,44-46`.
- [x] **Confirm no call site needs org threaded that can't get it ambiently (booking/otp/messenger legitimately NULL).** —
      every caller (`pgUserProjection.ts:599,826`, `pgUserByPhone.ts:287,321` (OTP), `pgPhoneMessengerBind.ts:126,213,229`)
      calls `applyPlatformUserPhoneHistoryTransition` without an explicit org argument — the function has no such
      parameter, it resolves org ambiently via `getCurrentDbPrincipalOrganizationId()` internally, so bootstrap
      callers (OTP/messenger/booking) naturally get `NULL` with no code change needed at the call sites.

### 3. Enforce policy (RLS DSL) — split the 2 PII tables off bootstrap_hybrid

- [x] **`rls-descriptor-model.mjs`: give `platform_user_contacts` + `user_phone_history` a new scopingKind
      (e.g. `bootstrap_hybrid_org_gated`) + new predicateTemplate; keep the 3 system_settings on `bootstrap_hybrid`.** —
      `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:40-43` (`bootstrapHybridOrgGatedTables` Set
      with exactly these 2 tables), `:201-209` (`scopingKind: "bootstrap_hybrid_org_gated"`,
      `predicateTemplate: "org_gated_null_bootstrap"`); the 3 `system_settings*` tables remain on the separate
      `bootstrapHybridTables` branch (`scopingKind: "bootstrap_hybrid"`) immediately below it.
- [x] **`rls-sql-renderer.mjs`: new render fn for the gated strict predicate above.** —
      `docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs:520` (`renderBootstrapHybridOrgGatedPredicate`),
      used at `:646`.
- [x] **`phase4-locked-policy-artifact.mjs`: `renderPhase4StrictPredicate` branch for the new kind; ensure the new kind
      does NOT hit the bootstrap_hybrid short-circuit in `renderPhase4DormantCompatPredicate` (so dormant = general wrap).** —
      `docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs:93-95` (strict-predicate branch);
      `:121-126` (`renderPhase4DormantCompatPredicate`'s short-circuit list checks `scopingKind === "bootstrap_hybrid"`
      etc. but NOT `"bootstrap_hybrid_org_gated"`, confirming it falls through to the general
      `(dormantCompatibilityPredicate) OR strict` wrap as required).
- [x] **`p0-8-6-policy-targets.mjs`: `getP086BootstrapHybridDescriptors` / `assertP086BootstrapHybridTargets` /
      `renderP086PolicyStatements` updated to span both kinds (still 5 targets: 3 old-shape + 2 new-shape).** —
      confirmed by live run 2026-07-27: `check-p0-8-6-policy-generator.mjs` → "P0.8.6 policy generator OK: 3
      global bootstrap hybrids and 2 PII org-gated bootstrap hybrids."
- [x] **Regenerate artifact: `node docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs --write`.** —
      artifact is in sync: `check-phase4-locked-policy-artifact.mjs` → "OK (168 policies, helper-based, no raw
      GUC context)" (run 2026-07-27).
- [x] **Update `check-p0-8-6-policy-generator.mjs` to assert per-table shapes (system_settings → old; 2 PII → gated).** —
      confirmed by the same 2026-07-27 run distinguishing "3 global bootstrap hybrids" (old shape) from "2 PII
      org-gated bootstrap hybrids" (new shape) in its own assertion output.
- [x] **Green: `check-p0-8-rls-descriptors.mjs`, `check-p0-8-sql-renderer.mjs`, `check-p0-8-6-policy-generator.mjs`,
      `check-phase4-locked-policy-artifact.mjs`, `check-p0-9-enforce-descriptors.mjs`.** — all 5 re-run
      2026-07-27, all green: "P0.8.1 RLS descriptor model OK: 233 descriptors..."; "P0.8.2 RLS SQL renderer
      predicate tests OK."; "P0.8.6 policy generator OK: 3 global bootstrap hybrids and 2 PII org-gated bootstrap
      hybrids."; "check-phase4-locked-policy-artifact: OK (168 policies...)"; "P0.9 enforce descriptors OK: 233
      descriptors, missing/unknown deny, ...".

### 4. Verify (orchestrator runs 4b/4c on disposable copy)

- [x] **4a. `node scripts/check-saas-db-regression.mjs` green (static suite).** — re-run 2026-07-27:
      `check-saas-db-regression: OK` (full suite, incl. `check-phase4-force-cutover-sql: OK (168 targets)`,
      `check-phase4-locked-policy-artifact: OK (168 policies...)`).
- [x] **4b. R2 isolation smoke: `smoke-r2-real-policy-isolation.mjs` green + extended to prove the 2 PII tables:
      staff clinic-walled on org rows; NULL rows NOT visible to staff; bootstrap CAN read/write NULL.** — script
      contains exactly these assertions for both tables (`docs/_TODO/SAAS_FOUNDATION/scripts/smoke-r2-real-policy-isolation.mjs`:
      `staff_puc_org_a_ok`/`staff_puc_null_hidden_ok`/`staff_uph_null_hidden_ok` around lines 479-496;
      `bootstrap_puc_null_visible_ok`/`bootstrap_puc_org_a_hidden_ok`/`bootstrap_uph_null_visible_ok`/
      `bootstrap_uph_null_write_ok` around lines 608-634); `node --check` syntax-clean 2026-07-27. Not re-executed
      against a live temp cluster in this doc-hygiene pass (needs a disposable Postgres cluster setup outside
      this pass's scope) — evidence here is the script's content, not a fresh live run.
- [ ] 4c. Full rehearsal on disposable prod-copy (`rehearse-multitenant-isolation.mjs`, host sudo -u postgres) —
      clinic #1 not blocked (dormant + enforce), who-sees-what matrix still holds, contacts/phone writes succeed.
      **Left OPEN 2026-07-27** — this is exactly the claim the file's own "(REOPENED 2026-07-23: ...)" note
      (§ below) casts doubt on: no corroborating artifact (LOG.md row / taskdb ref / evidence file) for a real
      prod-copy rehearsal run was found anywhere in the repo in this pass either. Do not tick without a fresh,
      evidenced run.
- [x] **4d. webapp typecheck + scoped repo tests green.** — re-run 2026-07-27: `pnpm --dir apps/webapp typecheck`
      clean (`tsc --noEmit`, no errors); scoped repo tests `pgUserByPhone`/`pgPhoneMessengerBind` (OTP/messenger
      phone-history call sites) → 3 файла, 21/21 passed (число уточнено независимым аудитом 27.07: в набор
      входит и `pgUserByPhone.createOrBind.test.ts`, ранее не посчитанный).

### 5. Independent audit + acceptance

- [x] **Independent adversarial audit by a DIFFERENT model (reality-check: predicate correctness, dormant trap,
      integrator/bootstrap write paths, no clinic #1 lockout, checker coverage).** — ✅ **PASS. Свежий
      адверсарный аудит 2026-07-27 против ЖИВОГО кода** (не против отчёта и не по цитате прошлого аудита).
      Проверено и совпало: (1) отрендеренный предикат `rls-sql-renderer.mjs:523` посимвольно равен целевому
      из §"Target predicate (strict)"; тот же SQL лежит в задеплоенном артефакте
      `deploy/postgres/phase4-locked-helper-rls-policies.sql:1151,1520`. Разобраны все ветки: staff клиники A
      NULL-строку не читает, staff без org-контекста режется через `NOT is_staff()`, обойти в рамках текущей
      архитектуры сессий не удалось. (2) Ловушка dormant НЕ сработала: `bootstrap_hybrid_org_gated` намеренно
      отсутствует в списке short-circuit `phase4-locked-policy-artifact.mjs:121-126`, обе таблицы идут общим
      путём `(dormantCompat OR strict)`. (3) Запись интегратора проходит: org-match ветка не содержит
      `is_staff()`. (4) Запись при bootstrap (OTP/мессенджер/публичная запись) проходит WITH CHECK через
      NULL-ветку. (5) Чекеры проверяют СТРОГУЮ форму, а не «политика существует»:
      `check-p0-8-sql-renderer.mjs:123-127` делает `assert.equal` на точную строку предиката,
      `check-phase4-locked-policy-artifact.mjs` регенерирует артефакт и диффит с закоммиченным `.sql`.
      Прогнано сейчас: 5 чекеров + `check-saas-db-regression` зелёные, webapp typecheck чистый,
      `pgUserByPhone`/`createOrBind`/`pgPhoneMessengerBind` — 3 файла, 21/21.
      **История этой галочки — урок, а не формальность.** 27.07 её сняли, рассуждая о датах: аудит от 12.07
      не мог проверить код, переписанный 23.07. Логика верная, вывод неверный — владелец: «надо проверить
      было в коде прежде чем снимать. Врать может подпись». Проверили код — реализация корректна.
      Не закрыто и остаётся открытым отдельно (сам план это и так честно держит): 4c — живая репетиция на
      disposable-копии, и FLIP-BLOCKERS для enforce/locked-режима.
- [ ] Owner live acceptance. Update taskdb #708 with commit_ref. — no evidence of a live owner walkthrough or a
      taskdb #708 `commit_ref` found in this pass; left open.

## Status (2026-07-12)

Steps 1–3 implemented (Codex 5.5) + independently re-verified by lead against reality: all 6 RLS/journal checks,
`check-saas-db-regression`, webapp `tsc`, 33 scoped repo tests GREEN. R2 real-policy smoke GREEN on a real temp
cluster, extended with PERMANENT PII NULL-gating assertions proving on strict+FORCE: staff sees only its org rows
& NOT NULL rows (hole closed); bootstrap (no-context, non-staff) reads+writes ONLY NULL rows; dormant clinic #1 not
blocked. Independent adversarial audit: **SHIP-WITH-FIXES** — core correct, hole closed exactly, dormant-safe.

## FB#1/FB#2 progress (2026-07-12, deep multi-layer — enforce-only, dormant-safe, NOT needed for TEST-dormant)

Implemented + rehearsal-verified in layers (each caught by the LIVE prod-copy rehearsal, not by mocked tests):

- **FB#2 DONE**: pre-FORCE flip-gate asserts the bootstrap base role is NOBYPASSRLS + not a staff member + can
  EXECUTE the close function; and the owner role is BYPASSRLS + has UPDATE on user_phone_history. Green.
- **FB#1 function + grants + own-data guard**: `app.close_active_user_phone_history` (SECURITY DEFINER, owner
  BYPASSRLS, own-data gate for patient sessions), granted to app roles + bootstrap login roles; table DML granted
  to the owner role AS THE INVOKING TABLE OWNER (after RESET ROLE — app_owner cannot self-grant on public tables);
  `check_function_bodies=off` for the forward-ref. Deploy applies clean; dormant clinic #1 read confirmed.
- **FB#1 ORG-session enforce path PROVEN** on prod-copy: close+insert of a phone transition over a pre-existing
  ORG-stamped active row under strict+FORCE succeeds (no permission error, no unique_violation).
- **FB#1 BOOTSTRAP-session enforce path — NOT YET PROVEN.** The rehearsal's bootstrap proof fails at the
  bootstrap session's own INSERT (`permission denied for table user_phone_history`). Root cause is a
  rehearsal-vs-prod TOPOLOGY divergence, not a code defect: prod pre-auth/OTP sessions run as the DATABASE_URL role
  = the runtime table OWNER (`bcb_webapp_prod`, NOBYPASSRLS, non-staff), which has table DML by ownership; the
  rehearsal models the bootstrap base role as a separate `NOINHERIT` login role (`patientLoginRole`) that lacks
  direct table DML. **Open item:** faithfully model the prod bootstrap connection-role topology in the rehearsal
  (bootstrap base role must have SELECT/INSERT/UPDATE on the bootstrap-written tables, as the prod owner role does)
  AND add a flip-gate assertion of that privilege — OR confirm/decide the prod pre-auth connection-role identity.
  This is genuinely the "owner-gated, unwired" locked-mode connection routing (see 0175 header / audit FB#2).

## NOT DONE — FLIP-BLOCKERS (must close before any enforce/locked+FORCE cutover; NOT needed for TEST-dormant deploy)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] **FB#1-bootstrap [HIGH] prove the bootstrap/OTP phone-write path under enforce** (topology-fidelity above).
      **Confirmed still open 2026-07-27** — no rehearsal-topology fix or fresh proof found in this pass; leave open.
- [ ] **FB#1 [HIGH] user_phone_history close-prior UPDATE vs partial unique index.** Under strict RLS an org-context
      session (admin/integrator) cannot SEE a prior NULL-org active row (OTP/messenger/booking bootstrap origin), so
      `applyPlatformUserPhoneHistoryTransition`'s `UPDATE ... WHERE valid_to IS NULL` won't close it; the new-active
      INSERT then violates `uq_user_phone_history_user_active` (unique indexes ignore RLS) → phone-update tx rollback.
      Latent (dormant app role is BYPASSRLS → no break; bites only at locked+FORCE). Fix options (owner triage):
      (a) close prior via SECURITY DEFINER helper closing ALL the user's active rows regardless of org; (b) re-stamp
      org on transition; (c) pre-flip invariant: no NULL-org active row survives for an org-known user.
      **🟢 РЕШЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: вариант (b) + (c). Дословно: «вариант (b)+(c) - ок».**
      Вариант **(a) ОТКЛОНЁН** — не заводить новую SECURITY DEFINER функцию ради этого. Причина, изложенная
      владельцу при рекомендации: в системе уже 45 definer-функций, и именно на них держится запрет снимать
      FORCE-RLS; 46-я расширяет поверхность обхода стен ради одного частного случая.
      **Что делать конкретно:**
  - **(b) постоянное правило:** при переходе телефона проставлять `organization_id` на строку истории, как
    только клиника известна. Тогда org-контекстная сессия ВИДИТ прошлую активную строку, обычный
    `UPDATE ... WHERE valid_to IS NULL` её закрывает, и уникальный индекс не срабатывает. Никаких обходов
    стен не требуется. Точка правки — `applyPlatformUserPhoneHistoryTransition` (`pgPhoneHistory.ts`).
  - **(c) разовая чистка ПЕРЕД включением стен:** ни у одного человека с известной клиникой не должно
    остаться активной строки без организации. Прогоняется один раз, до флипа, с отчётом об остатке.
    **Целевой инвариант, который это даёт:** если клиника у человека известна — его активная строка телефона
    несёт эту клинику. Строки без организации остаются легальными только для тех, у кого клиники ещё нет
    (вход по СМС-коду, привязка мессенджера, публичная запись до определения клиники) — а такие сессии и так
    проходят через NULL-ветку предиката.
    **Обоснование самой таблицы истории** (владелец спросил «кто так вообще делает»): паттерн стандартный —
    SCD-2 / effective-dating, в медицинском стандарте HL7 FHIR это поле `ContactPoint.period`. Ключевая
    причина здесь — переиспользование номеров операторами: телефон является и фактором входа (СМС-код), и
    каналом медицинских напоминаний, поэтому без интервалов действия напоминание пациента может уйти
    постороннему, получившему его старый номер. Исследование с источниками — в ответе владельцу 27.07.
- [ ] **FB#2 [MEDIUM] locked-mode bootstrap base DB role must be NOBYPASSRLS AND not a member of app_staff.**
      Bootstrap/infra principals `RESET ROLE` to the base `DATABASE_URL` role (db-principal `applySignedDbPrincipal`
      early-returns for bootstrap). If that role ∈ app_staff → `NOT app.is_staff()` false → bootstrap NULL reads/writes
      fail closed; if BYPASSRLS → bootstrap sees every clinic. R2 smoke proves the DESIRED role shape works; add a
      flip-gate assertion on the real locked base role.
      **Checked 2026-07-27:** found `check-saas-d3-4-bootstrap-base-login-grants.mjs` with `NOBYPASSRLS` +
      `NOT pg_has_role(..., 'app_staff', 'MEMBER')` assertions, but for a `d3_4_media_worker_runtime_role`, not
      clearly the general locked-mode bootstrap base role this item describes — not confident enough to tick. Left
      open; needs a closer read of that script (or its sibling `check-saas-d3-4-bootstrap-base-login-read-grants.sql`,
      currently modified/in-flight per git status) to confirm scope before ticking.
- [ ] Full prod-copy rehearsal DONE (dump 20260712_201501, 251 users): deploy-667 GREEN, migration applied,
      contacts_null_org=0 on real data, dormant clinic#1 not blocked, strict+FORCE who-sees-what matrix ALL CONFIRMED,
      disposable copy dropped, prod untouched. → landed change PROVEN end-to-end on real data.
      (REOPENED 2026-07-23: migration 0178 + schema/repo org-stamping code do exist and match this description, but the
      "ALL CONFIRMED" rehearsal claim itself has no corroborating artifact — no LOG.md row, no taskdb ref, no evidence
      file anywhere in the repo references this dump/run, unlike every other prod-copy rehearsal in this initiative
      (e.g. DEPLOY_667_SEQUENCE.md, LOG.md #708). It also directly conflicts with this same file's own next section:
      "FB#1 BOOTSTRAP-session enforce path — NOT YET PROVEN... fails at the bootstrap session's own INSERT" — the
      bootstrap write path this line claims was "ALL CONFIRMED" is documented two paragraphs later as unproven and
      failing. ~~Steps 1-3 of the numbered checklist above remain correctly `[ ]` (RLS-policy split /
      bootstrap_hybrid_org_gated scopingKind was never added to rls-descriptor-model.mjs/rls-sql-renderer.mjs), so the
      enforcement side of Task A is genuinely not done;~~ **SUPERSEDED 2026-07-24/27:** this specific claim is now
      wrong — steps 1-3 ARE done (per the ⚠️ STALE-CORRECTION note at the top of this file, re-verified independently
      2026-07-27 against `rls-descriptor-model.mjs:40-43,201-209`, `rls-sql-renderer.mjs:520,646`,
      `phase4-locked-policy-artifact.mjs:93-95,121-126`, and 5 green checker runs — see §3 checklist above, all
      ticked). **What is STILL VALID from this REOPENED note and NOT superseded:** the core critique that the "ALL
      CONFIRMED" prod-copy rehearsal claim itself has no corroborating artifact — that remains true; no such artifact
      was found in this 2026-07-27 pass either. **this self-reported rehearsal line overstates verification and
      is downgraded pending an actual reproducible artifact.)**
- [ ] Owner live acceptance folds into TASK B TEST-dormant deploy walkthrough (register new specialist → empty
      patient base; existing clinic keeps working). — no evidence of this walkthrough having happened found in this
      pass; left open.

## Audit notes (LOW / no action)

- 0178 does NOT re-create the drizzle 0163 policy (deploy artifact is canonical; dormant no-op under BYPASSRLS) — by design.
- contacts onConflict `COALESCE(existing, EXCLUDED)` keeps first-writer org (unique key excludes org) — acceptable, contacts ≠ identity.
- `pgTreatmentTail15C.repo.test.ts` stamps org on a source=otp INSERT (mocked principal) — parity test only, fine.
