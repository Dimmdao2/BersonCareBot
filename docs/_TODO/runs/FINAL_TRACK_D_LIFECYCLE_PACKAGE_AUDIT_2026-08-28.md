# Финальный аудит Track D / lifecycle package — 28.08.2026

## Вердикт

**FAIL.** Product-поведение renewal/purge, lifecycle registry, миграция и неизменность access-boundaries
подтверждены, но пакет не land-ready по двум достижимым нарушениям:

1. candidate purge DB-proof не проходит обязательный strict TypeScript gate после удаления retired-id из
   `PurgePlatformUserRow`;
2. clinic-admin crawl даёт зелёный результат при отсутствии clinic membership, потому что принимает редирект
   `/app/settings` → `/app/account` как успешный management-проход.

Проверяемый продуктовый SHA — `a394efaa9`, baseline — `38311d193`. Команда
`git diff --name-status 38311d193..a394efaa9` показала `13` затронутых файлов; полный список был просмотрен.
HEAD `c8308e088` добавляет только audit brief, product-tree поверх candidate не меняет.

## Тест или взгляд

| Пункт | Способ до чтения тестов |
| --- | --- |
| 1 | Повторяемый HTTP/side-effect контракт: blind kill-set + route unit |
| 2 | Смешанный: strict-purge side effects через exported boundary; retired path/call graph и raw audit shape взглядом; существующий rollback-only DB-proof не перезапускался на запрещённом этим brief TEST |
| 3 | Разовая truthfulness-проверка registry против delete call graph + существующий contract gate |
| 4 | Разовая owner-aware rollback-only introspection на named DEV + migration gates |
| 5 | Повторяемое acceptance-поведение: runner walkthrough + синтетическая redirect fault injection без реальных данных |
| 6 | Разовый candidate diff/call graph и неизменность guards/закрытого route |

## Бинарная приёмка

| № | Результат | Доказательство |
| --- | --- | --- |
| 1 | **PASS** | Partial result даёт HTTP `500`, `{ok:false}` и red tick; full success даёт HTTP `200`, `{ok:true}` и green tick. Команда `pnpm --dir apps/webapp exec vitest run --project=unit src/app/api/internal/saas-billing/renewal/tick/route.unit.test.ts` → `1` файл, `2` теста PASS. Обе инверсии убиты fault injection ниже. |
| 2 | **FAIL** | Сам runtime-path выполняет canonical UUID cleanup, больше не читает/calls retired integrator cleanup; S3/media success/failure и sanitized audit защищены тестами. Но команда `pnpm --dir apps/webapp typecheck` падает с `TS2353` в `src/infra/platformUserFullPurge.devDbProof.test.ts:416`: test fixture всё ещё передаёт удалённое поле `integrator_user_id` в `PurgePlatformUserRow`. Это реальный CI/typecheck break candidate, не style. |
| 3 | **PASS** | Registry говорит `explicit-delete` для `public.message_log.platform_user_id` и `public.media_files.uploaded_by`, `anonymised` для трёх actor refs. Call graph содержит физические `DELETE FROM message_log` и post-S3 `DELETE FROM media_files`. Команда `pnpm --dir apps/webapp exec vitest run --project=fast src/modules/db-retention/journalLifecycleRegistry.contract.test.ts` → `1` файл, `6` тестов PASS. |
| 4 | **PASS** | Файл содержит ровно `3` owner-marked `ALTER TABLE`, все owner=`app_object_owner`; только существующие FK, без grants/policies/index/runtime objects. `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` → PASS и `ROLLBACK`. До и после catalog показывает те же `3` FK с `confdeltype=a`, owner=`app_object_owner`, ledger rows=`0`, то есть apply не было. |
| 5 | **FAIL** | Отдельный `clinic_admin` действительно добавлен и использует ту же email identity, что `doctor`; канон `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` подтверждает active owner+specialist membership этой учётки. Но runner не требует management final route или membership fact. Синтетический сервер без membership вернул redirect settings→account; runner сообщил `clinic_admin: routes=3 failed=0`. Достижимое последствие: финальная live-приёмка зелёная, хотя clinic admin не открыл ни одной clinic-management страницы. |
| 6 | **PASS** | Команда `git diff --exit-code 38311d193..a394efaa9 -- apps/webapp/src/app/api/doctor/clients/'[userId]'/permanent-delete/route.ts apps/webapp/src/app-layer/guards/requireRole.ts apps/webapp/src/app-layer/guards/workspaceCapabilities.ts` → exit `0`, diff пуст. Единственный изменённый API route в candidate — internal renewal tick (`git diff --name-only ... -- apps/webapp/src/app/api apps/webapp/src/app-layer/guards`). Permanent-delete по-прежнему всегда возвращает `409 account_purge_disabled`; doctor/patient guards не менялись. |

## Findings

### F1 — purge proof ломает strict typecheck

Достижимый сценарий: candidate попадает в штатный webapp typecheck. `PurgePlatformUserRow` после Track D больше
не содержит retired `integrator_user_id`, но rollback-only proof продолжает конструировать это поле. TypeScript
останавливает gate до выполнения package.

Точная команда и вывод:

```bash
pnpm --dir apps/webapp typecheck
# TS2353: src/infra/platformUserFullPurge.devDbProof.test.ts(416,5):
# 'integrator_user_id' does not exist in type 'PurgePlatformUserRow'
```

Нарушение: strict typing / обязательный применимый typecheck. Product fix не вносился.

### F2 — clinic-admin acceptance принимает отсутствие membership как PASS

Контрольный path в product: `requireOrganizationWorkspaceContext` при `no_active_membership` редиректит на
`/app/account`. Runner следует redirect, видит итоговый HTTP `200` и не сравнивает `finalRoute` с management
prefix. Синтетическая проба не читала DEV/TEST и не использовала реальные identity/data; временно был разрешён
только `127.0.0.1:5219`, после команды fault injection полностью откатан.

Команда, давшая число `3/0`:

```bash
audit_tmp="$(mktemp -d /tmp/bcb-clinic-admin-audit.XXXXXX)"
node -e 'const http=require("node:http");const s=http.createServer((q,r)=>{const p=new URL(q.url,"http://127.0.0.1").pathname;if(p==="/api/auth/email-password/login"){r.writeHead(200,{"content-type":"application/json"});r.end(JSON.stringify({ok:true}));return}if(p==="/api/me"){r.writeHead(200,{"content-type":"application/json"});r.end(JSON.stringify({ok:true,user:{role:"doctor"}}));return}if(p.startsWith("/app/settings")){r.writeHead(302,{location:"/app/account"});r.end();return}r.writeHead(200,{"content-type":"text/html"});r.end("<main>Personal account without clinic membership</main>")});s.listen(5219,"127.0.0.1")' & fake_pid=$!
cleanup(){ kill "$fake_pid" 2>/dev/null || true; wait "$fake_pid" 2>/dev/null || true; rm -r -- "$audit_tmp"; }
trap cleanup EXIT
for attempt in 1 2 3 4 5; do curl -fsS http://127.0.0.1:5219/app/account >/dev/null 2>&1 && break; sleep 0.2; done
TEST_ACCEPTANCE_ROLES=clinic_admin TEST_ACCEPTANCE_PASSWORD=synthetic TEST_ACCEPTANCE_BASE_URL=http://127.0.0.1:5219 TEST_ACCEPTANCE_OUTPUT_DIRECTORY="$audit_tmp" node runs/test-interactive-acceptance/crawl.mjs
# clinic_admin 1/3: /app/account status=200 pass=true
# clinic_admin 2/3: /app/settings status=200 pass=true
# clinic_admin 3/3: /app/settings/patient-home status=200 pass=true
# clinic_admin: routes=3 failed=0
```

Product/runner fix не вносился; синтетические output-файлы удалены.

## Blind kill-set

| Fault | Результат |
| --- | --- |
| R1/R2: partial renewal принудительно считается success | `const success=true` → route assertion `response.status === 500` красное (`1` failed / `1` passed) |
| R3: full success принудительно считается failure | `const success=false` → assertion `response.status === 200` красное (`1` failed / `1` passed) |
| P1/P2: вернуть DELETE по `integrator_user_id` | `platformUserFullPurge.retiredIntegratorProjections.unit.test.ts` красный на запрете retired fallback (`1/1` failed) |
| P4: убрать canonical `reminder_occurrence_history.platform_user_id` root | тот же test красный на `canonicalDelete` (`1/1` failed) |
| P3a: записать raw target UUID в audit details | новый strict-purge test красный на raw UUID |
| P3b: записать S3 key/provider error в audit details | новый strict-purge test красный на `private/media/raw-video.mp4` |
| P5: исключить patient-file key из external cleanup | новый strict-purge test красный на точном delete-key set |
| P6: игнорировать S3-disabled artifact flag в outcome | новый strict-purge test красный: ожидал `partial_failed`, получил `completed` |
| A1: убрать отдельную clinic-admin роль | default roles/config inspection ловит отсутствие; candidate роль добавил |
| A2: clinic-admin без membership | **НЕ ПОЙМАН RUNNER’ОМ**: synthetic redirect proof дал `3` routes / `0` failed → F2 |
| A3: завести четвёртую identity | config использует тот же `dimmdao@yandex.ru` для doctor и clinic_admin; owner canon подтверждает одну identity |
| A4/A5: вернуть destructive route/расширить guards | exact candidate diff по route и двум guard-файлам пуст |

Fault injections product-кода полностью откатаны. Непойманных классов среди renewal/purge тестов — `0`; в
acceptance runner непойман один named fault A2.

## Migration rollback-only evidence

До preflight и после него выполнена одна и та же команда:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "SELECT c.conname, c.confdeltype, pg_catalog.pg_get_userbyid(t.relowner) AS table_owner FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid WHERE c.conname IN ('system_settings_audit_changed_by_fkey','organization_slug_rename_events_actor_fkey','online_intake_status_history_changed_by_fkey') ORDER BY c.conname; SELECT count(*) AS candidate_ledger_rows FROM drizzle.__drizzle_migrations WHERE tag='20260828T085822_anonymise_audit_actors_on_account_delete';"
```

Оба раза: `3` rows, `confdeltype=a`, owner=`app_object_owner`; `candidate_ledger_rows=0`. Между ними:

```bash
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
# migrate-dev preflight: PASS (... rollback-only webapp DDL validation complete)
```

Shape/privilege gates:

```bash
node scripts/check-migration-privileges.mjs
# OK (101 migration files)
bash apps/webapp/scripts/check-drizzle-migration-order.sh
# OK
rg -n "^-- BCB-MIGRATION-OWNER:|^--> statement-breakpoint|^ALTER TABLE|\b(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY|CREATE INDEX)\b" apps/webapp/db/drizzle-migrations/20260828T085822_anonymise_audit_actors_on_account_delete.sql
# 3 owner markers; 3 ALTER TABLE; 2 breakpoints; forbidden privilege/index matches: 0
```

## Targeted validation

```bash
pnpm --dir apps/webapp exec vitest run --project=unit \
  src/infra/strictPlatformUserPurge.unit.test.ts \
  src/infra/platformUserFullPurge.retiredIntegratorProjections.unit.test.ts \
  src/app/api/internal/saas-billing/renewal/tick/route.unit.test.ts
# 3 files / 6 tests PASS

pnpm --dir apps/webapp exec vitest run --project=fast \
  src/infra/platformUserFullPurge.collectPurgeArtifactKeys.test.ts \
  src/modules/db-retention/journalLifecycleRegistry.contract.test.ts
# 2 files / 8 tests PASS

pnpm --dir apps/webapp exec eslint src/infra/strictPlatformUserPurge.unit.test.ts
# PASS

node --check runs/test-interactive-acceptance/crawl.mjs
# PASS

git diff --check
# PASS
```

Уже записанный на exact candidate TEST proof из authority переиспользован, но не повторялся из-за границы brief
«не трогать TEST/реальные данные»: команда
`RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run src/infra/platformUserFullPurge.devDbProof.test.ts`
в плане имеет результат `9/9 PASS`. Независимый текущий typecheck обнаружил F1 в самом этом файле.

Full CI не запускался. TEST/PROD, env, taskdb, UI и реальные данные не затрагивались.
