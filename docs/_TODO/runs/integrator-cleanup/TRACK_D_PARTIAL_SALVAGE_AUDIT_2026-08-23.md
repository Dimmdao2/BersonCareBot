# Track D — независимый аудит частичного salvage (2026-08-23)

**Роль:** `auditor-live`, независимый от автора кандидата. Продуктовый код не правил, временных поломок не оставил.
**Кандидат:** `/home/dev/dev-projects/bcb-wt-track-d-final-cutover-20260823`, ветка
`wt/track-d-final-cutover-20260823`, HEAD `7d490e384`.
**База:** `97df9395b`. Коммиты стека: `4d1380339`, `64726bbba`, `14db74aab`, `32b79ecda`, `00a08527c`,
merge `7d490e384` (втянул только Therapysto-доки `2d1c27a54` — вне scope, деплой не блокируют).

**Authority:**
`docs/_TODO/runs/briefs/TRACK_D_FINAL_CUTOVER_CONTINUATION_2026-08-23.md`;
`bcb-wt-track-d-duplicate-store-cutover-20260823/docs/_TODO/runs/briefs/TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md`;
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` (D17 §1257+, D25 §1594+, D30 §1820+);
`docs/_TODO/runs/PRE_SESSION_GATE_CONFLICT_2026-08-23.md`.

---

## ИТОГОВЫЙ ВЕРДИКТ

| Объект | Вердикт |
| --- | --- |
| `4d1380339` (D17: снятие второго тела оверлея) | **FAIL** |
| `64726bbba` (salvage duplicate-store) | **FAIL** |
| `14db74aab` (доки) | **PASS** (docs-only) |
| `32b79ecda` (доки) | **PASS** (docs-only) |
| `00a08527c` (salvage occurrence) | **FAIL** |
| `7d490e384` (merge, Therapysto docs) | **PASS** (docs-only, вне scope) |
| **Текущий стек целиком** | **FAIL — не land-ready** |

Блокирующие: **F1**, **F2**, **F3**, **F4**. F2 и F3 — новые достижимые регрессии, а не «ожидаемая
неполнота». F4 — ровно тот случай, который бриф называет реальным FAIL: D17 без forward-repair.

---

## 1. Слепой kill-set (составлен по authority ДО чтения тестов)

Зафиксирован до инспекции реализации и до открытия любого тестового файла.

| ID | Поломка |
| --- | --- |
| K1 | провайдер отказал / бросил → строка доставки заканчивается `sent` |
| K2 | провайдер успешен → выжившая строка доставки НЕ обновлена (осталась pending/sending) → повторная отправка |
| K3 | ретрай после отказа снова пишет `attempt=1` (номер не растёт) |
| K4 | метаданные доставки (id провайдера, ошибка, время) не остаются на выжившей строке |
| K5 | пропуск ДО отправки (выключённый канал, нет адресата, rate-limit, stale, skipped web-push) создаёт success/skipped псевдо-попытку |
| K6 | какой-то продуктовый путь всё ещё пишет в удалённый reminder-журнал |
| K7 | консолидация occurrence теряет происхождение из rule |
| K8 | уникальные `seen/snoozed/skipped/done` теряются, миграция не fail-closed |
| K9 | физических источников occurrence осталось больше одного |
| K10 | оверлей всё ещё держит второе ручное тело pre-session корня |
| K11 | нет forward-repair для уже перезаписанных БД → в живой БД гейт отсутствует молча |
| K12 | оверлей применяет owner/ACL не из декларации |
| K13 | в миграции есть GRANT/REVOKE/CREATE ROLE/CREATE POLICY |
| K14 | удалённое отношение осталось в декларации привилегий / relation-access |
| K15 | сгенерированные артефакты прав не совпадают с декларацией |
| K16 | неверный порядок drop: остались зависимые FK/view/function/trigger |
| K17 | удалённая/изменённая функция ещё вызывается другой функцией, триггером или политикой |
| K18 | удалённый scheduler всё ещё импортируется/вызывается на живом пути |
| K19 | удалённый scheduler был фактической точкой входа (package.json / systemd / Docker CMD) |

---

## 2. Классификация и результат по каждому гейту

### 2.1 Гейты «взгляд / инспекция»

| Гейт | Kill-set | Результат |
| --- | --- | --- |
| Оверлей не держит второго ручного тела pre-session корня | K10, K12 | **PASS** |
| Порядок миграции и drop | K16, K17 | **PASS** |
| Разбор прав каждого удалённого отношения и изменённой функции | K14 | **PASS** |
| В миграции нет GRANT/REVOKE/POLICY | K13 | **PASS** |
| Нет остаточных читателей/писателей и необъявленной runtime-зависимости | K6 | **FAIL** (F1, F2) |
| D17: forward-repair для уже перезаписанных БД | K11 | **FAIL** (F4) |
| Один физический источник occurrence с происхождением и уникальными действиями | K7, K8, K9 | **FAIL** (не реализовано) |
| У удалённого scheduler нет живого import/call | K18, K19 | **PASS** |
| Сгенерированные артефакты прав побайтно = декларация | K15 | **PASS** |

### 2.2 Поведенческие гейты

| Гейт | Kill-set | Результат |
| --- | --- | --- |
| Отказ провайдера не может стать `sent` | K1 | **PASS** (убит FI-4) |
| Успех провайдера обновляет выжившую строку доставки | K2 | **PASS** (убит FI-2) |
| Номер попытки ретрая растёт | K3 | **FAIL** (F6) |
| Метаданные доставки остаются на этой строке | K4 | **PASS по конструкции, НЕ ПОКРЫТО** (FI-3 выжила) |
| Нет success/skipped псевдо-попытки | K5 | **FAIL** (F5) |
| Ни один продуктовый путь не пишет в удалённые reminder-журналы | K6 | **PASS** (runtime); ops-скрипты — см. F1 |

---

## 3. Находки

### F1 — BLOCKER. Остаточные писатели удалённых таблиц в ops-скриптах; один из них теперь отказывает своим же гейтом

`00a08527c` убрал `reminder_delivery_events` из `WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES`
(`apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts:43-49`, стало 4 элемента), но
`apps/webapp/scripts/realign-webapp-integrator-user-projection.ts:67-90` по-прежнему строит 5 шагов, включая
`UPDATE reminder_delivery_events …` (строка 78-79). В самом скрипте стоит проверка соответствия
(строка 92-95):

```
if (updates.length !== WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES.length) {
  throw new Error('internal: update steps out of sync with WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES');
}
```

**Достижимое последствие:** `pnpm --dir apps/webapp realign-webapp-integrator-user -- --winner=X --loser=Y --commit`
(зарегистрирован в `apps/webapp/package.json:32`) теперь всегда падает после `BEGIN`, откатывается и не
перекеивает ни одной строки. Stage-4 rekey слияния людей мёртв. Dry-run продолжает работать (он идёт через
уже почищенный `WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS`), поэтому оператор увидит корректный превью и
отказ только на `--commit`.

Не почищены в том же классе (после drop они дают `relation does not exist`):
- `apps/webapp/scripts/backfill-reminders-domain.mjs:221` — `INSERT INTO reminder_delivery_events (…)`
  (`package.json:26`);
- `apps/webapp/scripts/reconcile-reminders-domain.mjs:97` — `SELECT integrator_delivery_log_id FROM
  reminder_delivery_events` (`package.json:27`);
- `apps/webapp/scripts/integrator-schema-cleanup/01_audit.ts:22` — таблица в списке аудита.

Команды:
```
grep -rn "reminder_delivery_events\|user_reminder_delivery_logs" --include=*.ts --include=*.mjs apps/webapp/scripts
grep -n "realign-webapp-integrator-user\|backfill-reminders-domain\|reconcile-reminders-domain" apps/webapp/package.json
```

### F2 — BLOCKER. Drop двух таблиц кладёт `run_strict_post_migration_closure`: TEST-деплой отваливается ПОСЛЕ миграций

Прецедент репозитория — коммит `61e644c6d` «fix(track-d): retire mailing security targets #987»: снятие
таблицы в Track D обязано в том же проходе вычистить её из `deploy/postgres/p0-5-role-split.sql`,
`p0-5b-grants.sql`, `phase4-force-rls-cutover.sql`, `phase4-locked-helper-rls-policies.sql` и из реестров
`docs/_TODO/SAAS_FOUNDATION/scripts/*`. Кандидат этого не сделал.

Живые ссылки на удаляемые таблицы (все четыре файла из прецедента):
- `deploy/postgres/p0-5b-grants.sql:60` и `:197` (staff-список), `:245` и `:312` (patient-список с
  привилегией `SELECT`);
- `deploy/postgres/phase4-force-rls-cutover.sql:218` и `:233` (пиннированный FORCE-RLS список);
- `deploy/postgres/phase4-locked-helper-rls-policies.sql:30-35` и `:1085-1090`
  (`ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `DROP/CREATE POLICY` по обеим таблицам);
- `deploy/postgres/p0-5-role-split.sql:90` и `:214`.

Три из них исполняются на КАЖДОЙ выкатке TEST ПОСЛЕ миграций, с `ON_ERROR_STOP=1`, и раскрывают списки
через `\gexec` без фильтра существования:
- `deploy/host/deploy-test-saas.sh:490` внутри `install_p0_5b_runtime_wall()` (`:485`), которую зовёт
  `run_strict_post_migration_closure()` (`:1922`);
- `deploy/postgres/phase4-locked-helper-rls-policies.sql` и `deploy/postgres/phase4-force-rls-cutover.sql`
  подключаются `\ir` из `deploy/postgres/test-strict-rls-finalizer.sql:81` и `:91`, а тот — из
  `apply_test_strict_rls_finalizer()` (`deploy/host/deploy-test-saas.sh:858`, вызовы `:1958`, `:1969`).
  Первым упадёт `phase4-locked-helper-rls-policies.sql` (строка 30), ещё до FORCE-RLS списка.
`p0-5-role-split.sql` в `deploy/host/` не вызывается — там это только дрейф реестра, не отказ выкатки.

**Живое доказательство (named DEV, rollback-only, нулевая мутация):**
```
sudo -n -u postgres psql -d bcb_webapp_dev -X <<'SQL'
SET lock_timeout='5s'; SET statement_timeout='30s';
BEGIN;
DROP TABLE public.reminder_delivery_events;
DROP TABLE integrator.user_reminder_delivery_logs;
DROP FUNCTION app.integrator_append_reminder_delivery_event(uuid,text,text,text,bigint,text,text,text,text,timestamp with time zone);
SAVEPOINT s1; GRANT SELECT ON TABLE "public"."reminder_delivery_events" TO app_patient; ROLLBACK TO SAVEPOINT s1;
SAVEPOINT s2; GRANT SELECT ON TABLE "integrator"."user_reminder_delivery_logs" TO app_patient; ROLLBACK TO SAVEPOINT s2;
SAVEPOINT s3; ALTER TABLE "public"."reminder_delivery_events" FORCE ROW LEVEL SECURITY; ROLLBACK TO SAVEPOINT s3;
SAVEPOINT s4; ALTER TABLE "integrator"."user_reminder_delivery_logs" FORCE ROW LEVEL SECURITY; ROLLBACK TO SAVEPOINT s4;
ROLLBACK;
SQL
```
Результат: три `DROP` проходят чисто (зависимых FK/объектов нет, `CASCADE` не нужен — гейт «порядок drop»
**PASS**), а все четыре деплойных statement дают `ERROR: relation … does not exist`. После `ROLLBACK`
проверка `to_regclass`/`to_regprocedure` вернула `t|t|t` — **мутаций не осталось**. `ALTER TABLE … ENABLE
ROW LEVEL SECURITY` и `CREATE POLICY … ON` из `phase4-locked-helper-rls-policies.sql` — тот же класс
отказа на том же несуществующем отношении.

**Достижимое последствие:** первый же деплой TEST после этой миграции падает на шаге strict-closure — уже
после того, как `assert_test_writers_stopped` остановил писателей. Это ровно сценарий «упавший deploy-test
оставляет TEST мёртвым молча».

**Гейт репозитория, который это уже ловит (частично):**
```
node scripts/check-saas-db-regression.mjs
→ FAILED SAAS P0.10 tier completeness
   IN TSV, NO CODE (3): integrator.user_reminder_delivery_logs, public.integrator_push_outbox, public.reminder_delivery_events
```
Честная оговорка: гейт был **красным и до кандидата** — на базе `97df9395b` он падает с
`IN TSV, NO CODE (1): public.integrator_push_outbox` (проверено в чистой выкладке базы:
`git archive 97df9395b | tar -x -C /tmp/bcbbase && cd /tmp/bcbbase && node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-tier-completeness.mjs`,
exit 1). Кандидат не сломал гейт, но добавил в него ровно две свои протухшие записи и не сделал уборку,
которую требует прецедент `61e644c6d`. Падение TEST-деплоя (выше) от состояния этого гейта не зависит.

### F3 — BLOCKER (новая регрессия). `reminder_not_dispatched` считается операторской смертью и поднимает ложный критический алерт

`64726bbba` перевёл три ОЖИДАЕМЫХ ситуации reminder-доставки из `sent` в `dead` с
`failure_class='reminder_not_dispatched'`
(`apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:122`, вызовы `:715`, `:729`, `:812`):
stale materialization, rate-limit транзакционной почты, skipped web-push.

Миграция аккуратно исключила новый класс из ДВУХ читателей — `app.archive_operator_health_failures`
(строка 69) и `app.read_curated_system_health_pre_0196` (строки 375, 397, 415). Но третий читатель,
который и есть операторский алертинг, не тронут:

```
sudo -n -u postgres psql -d bcb_webapp_dev -Atc \
  "SELECT pg_get_functiondef(to_regprocedure('app.read_operator_delivery_queue_health()'))"
→   (queue.status = 'dead'
       AND (queue.failure_class IS NULL OR queue.failure_class <> 'recipient_blocked_bot')) AS is_operator_dead,
    …
    count(*) FILTER (WHERE is_operator_dead AND updated_at >= now() - interval '24 hours') AS dead_recent,
```

Предикат исключает только `recipient_blocked_bot`. Проверка (rollback-only, DEV):
`reminder_not_dispatched → is_operator_dead = t`.

Путь до человека:
`app.read_operator_delivery_queue_health()` → `apps/webapp/src/infra/repos/pgOperatorHealthRead.ts:263-265`
→ `deadRecent` → `countActiveOutgoingDeliveryDead()`
(`apps/webapp/src/modules/operator-health/criticalHealthSignals.ts:97-101`) →
- `classifyOperatorHealthBannerSignals` (`:122-126`) — баннер здоровья краснеет;
- критический сигнал `outbound_delivery_provider` (`:316-324`) с pushTitle **«Отказ провайдера доставки»** —
  оператору уходит push.

**Достижимое последствие:** одно rate-limited письмо-напоминание, один пропущенный web-push или одна stale
материализация — обычные, штатные события — теперь поднимают критический алерт «отказ провайдера доставки» и
держат баннер красным 24 часа. До кандидата эти строки были `sent` и в этот счётчик не попадали. Это ровно
тот класс, из-за которого алертинг перестают читать.

**Почему это не «ожидаемая неполнота»:** тело `app.read_operator_delivery_queue_health()` живёт не в
миграции, а в снапшоте схемы B (`deploy/postgres/generated/prod-to-target/schema-pre.sql` — единственное
место в репозитории, где оно есть), поэтому его правка требует отдельной forward-миграции, которой в
кандидате нет.

### F4 — BLOCKER. D17 без forward-repair: на живой DEV pre-session гейт по-прежнему отсутствует

`4d1380339` корректно убрал из UP-пути `deploy/postgres/organization-member-invites-rls.sql` пять вторых
тел и их неверные `ALTER FUNCTION … OWNER TO`. Оставшиеся `REVOKE ALL … FROM PUBLIC` (строки 1103-1111) и
`GRANT EXECUTE … TO app_patient` (строки 1125-1133) сверены с декларацией — **совпадают** (`function-census.ts`:
owner `app_seam_email_otp_owner`, execute `app_patient` у всех пяти). Гейт K12 — PASS.

Но forward-миграции, которая восстановит каноническое тело на уже перезаписанных БД, в кандидате нет.
Миграция `20260822T100000_…` уже числится применённой, повторно она не пойдёт.

```
sudo -n -u postgres psql -d bcb_webapp_dev -Atc "
SELECT p.oid::regprocedure::text, l.lanname, pg_get_userbyid(p.proowner),
       position('require_accepted_context' in p.prosrc)>0, position('hash_port_typed_args' in p.prosrc)>0
FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid IN (…пять корней…) ORDER BY 1;"
```
```
app.email_auth_delete_email_challenges_for_user(uuid)     | plpgsql | app_seam_email_otp_owner | t | t
app.email_auth_find_email_challenge_for_confirm(uuid,uuid)| sql     | postgres                 | f | f   ← НЕ ВОССТАНОВЛЕН
app.email_auth_find_email_owner_conflict(uuid,text)       | plpgsql | app_seam_email_otp_owner | t | t
app.email_auth_increment_email_challenge_attempts(uuid)   | plpgsql | app_seam_email_otp_owner | t | t
app.email_auth_verify_user_email(uuid,text)               | plpgsql | app_seam_email_otp_owner | t | t
```

**Достижимое последствие:** на `bcb_webapp_dev` (и на любой БД, где оверлей отработал последним) корень
подтверждения email-челленджа остаётся `LANGUAGE sql`, владелец `postgres`, без
`require_accepted_context` и без `hash_port_typed_args`. Сверочный прогон прав продолжает падать
`pre-session exact gate missing or mismatched` — исходный симптом
`PRE_SESSION_GATE_CONFLICT_2026-08-23.md` не устранён; коммит только гарантирует, что дальше не будет
перезаписи, но не чинит уже перезаписанное. Четыре остальных корня на DEV уже канонические — то есть у
них выиграла миграция, и правка оверлея для них профилактическая.

### F5 — FAIL гейта. Success/skipped псевдо-попытки остались; успех по-прежнему пишется вторым журналом

Оракул (бриф duplicate-store, §B): «Отдельная attempt-строка допустима только для реального неуспешного
обращения к provider, с настоящим delivery id и номером попытки. Успех — статус delivery, не второй
success-журнал.»

Живые нарушители, кандидатом не тронуты:
- `apps/integrator/src/infra/adapters/dispatchPort.ts:437` — на КАЖДЫЙ успешный `message.send` пишется
  `delivery.attempt.log` со `status='success'` → строка в `public.notification_delivery_attempts`;
- `:349` — dev-redirect SUPPRESS пишет `status='success'` вообще без обращения к провайдеру;
- `:403` — отказ провайдера, классифицированный как `recipient_blocked_bot`, пишется как `status='skipped'`;
- `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:512-537`, вызовы `:709` и `:728` —
  пропуски ДО отправки (`stale_materialization`, `rate_limited`) пишут `status='skipped', attempt: 1`.

Ни у одной attempt-строки нет id выжившей строки доставки.

**Тест НЕ добавлен, и вот почему.** Существующий принятый тест
`apps/integrator/src/infra/adapters/dispatchPort.test.ts:92` («records the successful provider attempt once»,
гейт D20 item 17) прямо закрепляет запись success-попытки. Acceptance-тест «успех не пишет attempt-строку»
означал бы, что аудитор своей волей отменяет принятый гейт D20. Это конфликт двух принятых требований, а не
дефект реализации, и решать его должен ведущий/владелец, а не тест, написанный аудитором (§24.6: аудит —
гейт, не источник scope).

### F6 — FAIL гейта. Номер попытки не растёт

`attempt` — литерал `1` во всех четырёх местах записи (`dispatchPort.ts:354`, `:408`, `:442`;
`outgoingDeliveryWorker.ts:527`). `row.attemptCount` до writer'а не доходит: `dispatchPort` вообще не знает
о строке очереди. Кандидат этого не менял. Тест не написан по той же причине, что и в F5 плюс §10b п.3:
шов, через который номер попытки и id доставки должны дойти до писателя attempt-строки, ещё не
спроектирован — тест зафиксировал бы форму, которую должен выбрать исполнитель, а не независимый оракул.

---

## 4. Что проверено и оказалось ЧИСТЫМ

- **K13 — прав в миграции нет.**
  `grep -niE "^\s*(GRANT|REVOKE|CREATE ROLE|CREATE POLICY|ALTER POLICY|DROP POLICY|ALTER DEFAULT PRIVILEGES)" apps/webapp/db/drizzle-migrations/20260823T170000_*.sql` → пусто.
- **K14 — декларация вычищена.** `deploy/postgres/privileges/declaration.ts`: удалены обе таблицы, запись
  каталога `integrator_delivery_reminder_delivery_event_append`, объявление функции
  `app.integrator_append_reminder_delivery_event(...)`, `REV10_TENANT_DIRECT_ORG`, функция
  `revision10DeliveryReplayPolicies` и её ветка в `revision10Database`. `function-census.ts`: снят
  relation-surface `public.reminder_delivery_events`, добавлен `dead_at` в surface
  `public.outgoing_delivery_queue` — и это ровно то, что читает новое тело
  `read_curated_system_health_pre_0196` (`… AND dead_at >= now() - interval '24 hours'`, строка 415).
- **K15 — артефакты = декларация побайтно.**
  `node deploy/postgres/privileges/generate-cli.mjs --check` → exit 0, четыре `ok … совпадает побайтно`.
- **Владельцы statement'ов миграции сверены с живой БД.** `app_object_owner` для обеих таблиц,
  `app_seam_delivery_scope_owner` для дропаемой функции, `saas_system_health_owner` и
  `app_seam_telemetry_operator_owner` для двух переписанных функций — совпадают с маркерами
  `-- BCB-MIGRATION-OWNER:` (`pg_get_userbyid(relowner)` / `pg_get_userbyid(proowner)` на DEV).
- **K16/K17 — зависимостей нет.** `pg_constraint … confrelid IN (обе таблицы)` → пусто; живой rollback-only
  DROP без `CASCADE` прошёл (см. F2).
- **Смена CHECK-констрейнта безопасна.** `integrator.direct_public_write_retries`: 0 строк всего, 0 строк с
  `operation='reminder_delivery_log_append'` — `ADD CONSTRAINT` не упадёт.
- **K18/K19 — scheduler.** `grep -rn "runSchedulerTick\|scheduler/scheduler"` по всему коду → единственное
  вхождение в комментарии `relation-access.ts:7119` (про другой файл, `schedulerDecisionGuard.ts`). Резидентный
  `apps/integrator/src/infra/runtime/scheduler/main.ts` на месте.
- **K6 (runtime).** Ни один продуктовый путь не пишет в удалённые журналы: сняты
  `insertReminderDeliveryLog`, `appendReminderDeliveryEventDirect`, мутация `reminders.delivery.log`
  (contracts + zod-схема), `appendDeliveryEventFromProjection` в обоих reminder-портах, операция
  `reminder_delivery_log_append`. Оставшийся `appendDeliveryEventFromProjection` в
  `apps/webapp/src/infra/repos/pgSupportCommunication.ts:529` — это `support_delivery_events`, другая таблица,
  вне этого SHA.
- **Удалённые тесты легитимны:** снятые блоки в `canonWritersUseNamedRoots.behaviour.test.ts` и
  `relation-access.test.mjs` проверяли ровно удалённый корень/таблицу; защита выживших поверхностей не ослаблена.
- **Прогоны на кандидате:**
  `pnpm typecheck` → 0; `pnpm lint` → 0 (2 warning'а в файлах вне диффа);
  `pnpm test:db-privileges` → 281 (161 pass / 120 skip), 0 fail;
  `cd apps/integrator && npx vitest --run src/infra` → 71 файл, 361 pass, 0 fail;
  `bash apps/webapp/scripts/check-drizzle-migration-order.sh` → OK;
  `git diff --check` → чисто.

---

## 5. Fault injection (один раз на независимый класс)

Дерево перед каждой инъекцией было чистым; каждая инъекция откатывалась `git checkout --` и
подтверждалась `git status --porcelain` (пусто). Продуктовых правок не оставлено.

| ID | Что сломано | Какое утверждение покраснело | Итог |
| --- | --- | --- | --- |
| FI-1 | пропуск `stale_materialization` снова помечает строку `sent` (`queueMarkDead` → `queueMarkSent`) | `outgoingDeliveryWorker.reminderGeneration.d21.test.ts` — `expect(h.queueSent).toEqual([])` и парные проверки | **убита** (5 тестов red) |
| FI-2 | успех провайдера не обновляет выжившую строку (`queueMarkSent` не вызывается) | 3 теста в `src/infra/runtime/worker/` | **убита** (3 red) |
| FI-3 | метаданные доставки не мержатся в `payload_json` (`mergeJson = null`) | — | **ВЫЖИЛА** (361 pass, 0 fail) |
| FI-4 | отказ провайдера помечает строку `sent` вместо dead | 6 тестов в 5 файлах | **убита** |

**Счёт: убито 3 из 4, не поймано 1.**

Про FI-3 (K4). Тест НЕ заводится осознанно. Единственный потребитель смерженных
`telegramMessageId`/`maxMessageId` — `getStaleReminderMessengerMessageIdForResend`
(`apps/integrator/src/infra/db/repos/reminders.ts:441`), доступный только через read-query
`reminders.delivery.staleMessengerMessage`. Перепись показывает, что эту query НИКТО не отправляет:
```
grep -rn "staleMessengerMessage" --include=*.ts --include=*.tsx --include=*.mjs . | grep -v node_modules | grep -v "^./docs/"
→ contracts/schemas.ts:194, contracts/ports.ts:31, infra/db/readPort.ts:134   (объявление + обработчик, ни одного продюсера)
```
Ключ `deleteBeforeSendMessageId` в payload очереди тоже никем не пишется (ни TS, ни SQL:
`SELECT p.oid::regprocedure FROM pg_proc p WHERE p.prosrc LIKE '%deleteBeforeSend%'` → пусто). То есть
поломка есть, но назвать её достижимое последствие нельзя — по §10a такой тест не заводится, факт идёт в отчёт.

---

## 6. Замеры на named DEV (read-only, `bcb_webapp_dev`)

```
integrator.direct_public_write_retries                          0 строк, 0 с 'reminder_delivery_log_append'
public.reminder_delivery_events                              1735 строк
integrator.user_reminder_delivery_logs                       1735 строк, 1735 уникальных occurrence,
                                                             2026-05-18 … 2026-07-25
public.outgoing_delivery_queue kind='reminder_dispatch'       276 строк, 252 уникальных occurrence,
                                                             2026-06-09 … 2026-08-17, из них status='sent': 129
user_reminder_delivery_logs со status='success' и telegramMessageId  1563
user_reminder_delivery_logs со status='success' и maxMessageId        102
outgoing_delivery_queue reminder_dispatch с telegramMessageId/maxMessageId   0 / 0
```

Из этого следует уточнение к комментарию миграции (строки 515-517): утверждение, что
`public.outgoing_delivery_queue` «already carries» тот же per-delivery факт, для истории **неверно** —
1735 записей журнала против 276 строк очереди, и ни в одной строке очереди сегодня нет messenger message id.
Само удаление обоих журналов санкционировано владельцем (бриф §B), продуктовых читателей у них после
переписывания `read_curated_system_health_pre_0196` не осталось, поэтому это **не блокер**, а неточная
мотивировка и безвозвратная потеря ~1459 исторических записей доставки. Выношу как owner question (§7).

---

## 7. Owner questions / evidence (работой не становятся)

1. **Success-attempt журнал против гейта D20.** Требование Track D «успех — статус delivery, не второй
   success-журнал» прямо противоречит принятому тесту `dispatchPort.test.ts:92`. Нужно решение ведущего:
   снимать success-запись (и переписывать D20-тест) или сузить требование Track D.
2. **История доставки.** Дроп уничтожает 1735 записей за 2026-05-18…2026-07-25, которых в
   `outgoing_delivery_queue` никогда не было. Архивировать перед дропом или принять потерю?
3. **DOWN-ветка оверлея.** После `4d1380339` `deploy/postgres/organization-member-invites-rls.sql:38-48`
   (ветка `\if :organization_member_invites_down`) дропает пять pre_session корней, тела которых оверлей
   больше не создаёт. UP-путь не затронут, автоматики вызова DOWN в `deploy/host/` нет
   (`grep -rn "organization_member_invites_down" deploy/host/ tools/` → пусто), поэтому это не находка. Но
   ручной DOWN теперь уничтожает объекты миграции без восстановления.
4. **13 однотипных кандидатов в трёх других оверлеях** (`specialist-signup-public-bootstrap-rls.sql`,
   `specialist-owner-provisioning-rls.sql`, `c5a-platform-operations-runtime.sql`), названные в сообщении
   `4d1380339`. Подтверждаю, что кандидат их не трогал; per-function разбор нужен отдельно.
5. **Мёртвый delete-before-resend.** `getStaleReminderMessengerMessageIdForResend` и вся ветка
   `deleteBeforeSendMessageId` в воркере недостижимы (см. §5). Кандидат переписал этот запрос с журнала на
   очередь вместо того, чтобы удалить мёртвый код. Не дефект, но и не уборка.
6. **Пред-существующий долг гейта P0.10:** `public.integrator_push_outbox` в `tiers-218.tsv` без кода —
   красный ещё до кандидата.

---

## 8. НЕ СДЕЛАНО для полного этапа (точная передача следующему исполнителю)

Вне этого частичного SHA, поэтому по полному этапу **NOT DONE** (аудиту не подлежало, кроме констатации):

1. **Consolidation occurrence** — не начата. Живы три физических источника:
   `integrator.user_reminder_occurrences`, `public.reminder_occurrence_history`, `public.reminder_journal`;
   `reminder_occurrence_history` активно читается/пишется (`apps/webapp/src/app-layer/stats/loadAdminReminderStats.ts:30`,
   `apps/webapp/db/schema/schema.ts:2803`). Коммит `00a08527c` назван «occurrence cutover», но по occurrence
   не сделал ничего — только доделал снятие delivery-журналов.
2. **`public.support_delivery_events`** не удалён; support по-прежнему пишет отдельный журнал
   (`apps/webapp/src/infra/repos/pgSupportCommunication.ts:529`).
3. **Copy-healing / `integrator.direct_public_write_retries`** не удалены — таблица, worker tick и
   операции живы (кандидат только сузил CHECK на одно значение).
4. **ФИО в `user_identity` как единственный физический дом** — не начато; `platform_users` сохраняет
   FIO-колонки.
5. **Legacy `user_id text` в пяти таблицах и `integrator_user_id` в четырёх** — не начато.
6. **D17 forward-migration** — см. F4.
7. **Уборка удалённых таблиц из деплой-артефактов и реестров SAAS_FOUNDATION** — см. F2 (это часть ЭТОГО
   SHA, а не будущего этапа).

## 9. Что должен закрыть следующий исполнитель по этому SHA (не расширяя scope)

- F1: привести `realign-webapp-integrator-user-projection.ts` к 4 шагам; вычистить
  `backfill-reminders-domain.mjs`, `reconcile-reminders-domain.mjs`, `integrator-schema-cleanup/01_audit.ts`.
- F2: снять обе таблицы из `p0-5b-grants.sql`, `phase4-locked-helper-rls-policies.sql`,
  `phase4-force-rls-cutover.sql`, `p0-5-role-split.sql`, а также из реестров
  `docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv`, `scripts/rls-descriptor-model.mjs`,
  `scripts/p0-8-4-policy-targets.mjs`, `scripts/p0-8-5-policy-targets.mjs`,
  `scripts/check-p0-12-json-payloads.mjs`, `scripts/check-p0-9-enforce-descriptors.mjs` — ровно по образцу
  `61e644c6d`. Приёмка: `node scripts/check-saas-db-regression.mjs` доходит до P0.10 и не называет эти две
  таблицы.
- F3: forward-миграция, добавляющая `'reminder_not_dispatched'` в исключение `is_operator_dead` внутри
  `app.read_operator_delivery_queue_health()` (владелец statement — `saas_system_health_owner`, сверить с
  `function-census.ts`).
- F4: forward-миграция, возвращающая каноническое тело
  `app.email_auth_find_email_challenge_for_confirm(uuid,uuid)` с `require_accepted_context` и
  `hash_port_typed_args`, владелец `app_seam_email_otp_owner`. Приёмка — живой замер `lanname/proowner/prosrc`
  на DEV (команда в F4).
- F5/F6: только после решения ведущего по owner question №1.
