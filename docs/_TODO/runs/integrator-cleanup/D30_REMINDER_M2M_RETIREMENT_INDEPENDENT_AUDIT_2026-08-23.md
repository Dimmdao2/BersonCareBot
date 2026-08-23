# D30 — независимый аудит снятия M2M-канала `reminder_rule_upsert` (2026-08-23)

**Роль:** `auditor-live`, независимый от автора кандидата.
**Кандидат (product):** `024142803f5455cc0311fd0256cf0aaf44e5cac9` на `wt/d30-remove-reminder-rule-m2m-20260823`.
**База интеграции:** `5fddb9aea92da375b20cd9bcc2043d8d007b24c2`.
**Отчёт воркера (входной сигнал, не доказательство):** `D30_REMINDER_M2M_RETIREMENT_FIXER_2026-08-23.md`.

**Оракул.** `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2.3 Р-D30: «Разделяются две оси: владение
решением (какие напоминания, сроки и тексты) — webapp; исполнение по расписанию — integrator».
Точный scope — `D30_SCHEDULER_REVERSAL_PLAN.md` Ш8: «Дренаж `integrator_push_outbox` исчезает вместе с
M2M-каналом `reminder_rule_upsert`».

---

## 1. Kill-set (составлен по authority ДО чтения тестов, §24.4/§24.5)

Пункты 1–8 — минимум из брифа; 9–15 добавлены собственным чтением authority и §1.

| # | Что может быть неверно | Метод |
|---|---|---|
| 1 | В webapp остался достижимый producer/retry/cron, отправляющий копию `reminder_rules` в integrator; в integrator остался route/write-port/direct-writer/retry-operation, принимающий и переписывающий эту копию | **взгляд** (итоговый граф вызовов) |
| 2 | Forward-миграция роняет зависимую функцию молча: порядок «сначала переписать две живые health/archive-функции, потом `DROP` двух retired-функций и таблицы без `CASCADE`, потом сузить один `CHECK`» нарушен | **взгляд** (тело миграции + тела функций) |
| 3 | Миграция выдаёт/отзывает права; owner-маркеры не совпадают с владельцами объектов; declaration, function census и generated DEV/TEST артефакты не соответствуют конечному состоянию | **взгляд** (§1 + штатный generator check) |
| 4 | Из system health, admin UI, archive filters, runbooks и maintenance tick удалена НЕ только retired outbox-классификация: пострадали общая TTL-очистка архива и webhook-error retention | **взгляд** |
| 5 | create/update/toggle расписания перестал писать каноническую `public.reminder_rules`, либо вместе с ложным `syncWarning` потеряны формы, расписание или показ ошибки канонической записи | **тест** (поведение) + **взгляд** (UI-путь) |
| 6 | scheduler/materialize-wake перестал читать актуальное правило webapp или создаёт не единственный delivery intent в `public.outgoing_delivery_queue`; delivery-путь оказался завязан на снятый M2M POST | **тест** + **взгляд** (тело `app.read_patient_reminder_materialization_snapshot`) |
| 7 | Оставшиеся direct-public retry operations (`markSent`, `markFailed`, orphan expiry, delivery-log) перестали исполняться: missing imports, неверный `switch`, ослабленный retry `CHECK` | **тест** + **взгляд** (сверка `CHECK` с предыдущей редакцией) |
| 8 | maintenance tick перестал запускаться scheduler-ом под общим именем либо всё ещё читает/архивирует снятую таблицу | **тест** (обе TTL-очистки) + **взгляд** (job key, wiring) |
| 9 | Имя/порядок миграции, statement-owner-маркеры, `SCHEMA-CREATE`/`LANGUAGE-USAGE`, `BCB-MIGRATION-VERIFY` probe не соответствуют §1 | **взгляд** |
| 10 | Снятая таблица осталась в drizzle-схеме, `declaration.ts`, `relation-access.ts`, generated privileges, post-migrate schema check или deploy-ассертах → генератор выдаст грант на несуществующий объект и reconcile упадёт на выкатке (§1, «удаление разбирается тем же списком в обратную сторону») | **взгляд** |
| 11 | Снятие route/контрактов оставило висячий импорт, мёртвое связывание или недостижимый `switch`-случай в integrator | **взгляд** + build-check |
| 12 | Снятие модулей/скрипта оставило webapp несобираемым или с нарушенным lint-гейтом | **разовый build/lint-check** |
| 13 | Вместе с M2M пропала побочная работа, которую делал только он: снятие непрожитых occurrence при смене расписания (`DELETE FROM integrator.user_reminder_occurrences … status IN ('planned','queued')` в теле снятого корня) → человек получает напоминание по старому расписанию | **взгляд** (трассировка последствия до живого человека) |
| 14 | Сужение `CHECK` на `integrator.direct_public_write_retries` падает на существующих строках `operation='reminder_rule_upsert'`, либо такие строки после снятия обрабатываются молча | **взгляд** (fail-closed или молча) |
| 15 | Заведён дубль вместо параметра существующей точки (§5, один общий проход) — например второй tick рядом с переименованным | **взгляд** |

---

## 2. Вердикты по пунктам

`ID → вердикт → evidence`

**1 → PASS.** Producer снят целиком: каталога `apps/webapp/src/infra/integrator-push/` больше нет
(`integratorM2mPosts.ts`, `integratorPushOutbox.ts`, `runIntegratorPushWorkerTick.ts`,
`deliverIntegratorPushPayload.ts`), `modules/reminders/notifyIntegrator.ts` удалён, связывание снято в
`buildAppDeps.ts` (`notifyIntegrator` больше не передаётся в `createRemindersService`), скрипт и его
`package.json`-алиас `integrator-push-outbox-tick` удалены. Consumer снят: `reminderRulesRoute.ts` удалён,
регистрация вырезана из `apps/integrator/src/app/routes.ts`, тип мутации `reminders.rule.upsert` убран из
`kernel/contracts/ports.ts` и `schemas.ts`, `directPublic/writeReminderRulesDirect.ts` удалён, retry-operation
`reminder_rule_upsert` убрана из union и из worker-`switch`. Сплошной поиск по дереву
(`rg 'integrator_push_outbox|reminder_rule_upsert'` без `docs/**`, `*.md`, `prod-to-target/*` и
`scripts/integrator-schema-cleanup/*`, исключая каталог миграций) даёт **0 строк**.
Замечу отдельно: `apps/integrator/src/infra/adapters/remindersReadsPort.ts:160,183` продолжает ходить на
`/api/integrator/reminders/rules` — это **GET в webapp** (`fetchRemindersGet`), целевое направление Р-D30
«integrator читает решение webapp». Роут webapp этим кандидатом не тронут.
Единственная снятая проверяемая величина канала — `INTEGRATOR_PUSH_KINDS` на базе содержала ровно
`['reminder_rule_upsert']` (`git show <base>:…/integratorPushOutbox.ts`), т.е. второго producer-а у таблицы
не было и Ш8 выполняется дословно.

**2 → PASS.** Порядок в `20260823T160000_retire_reminder_rule_m2m.sql` ровно такой: строка 7
`CREATE OR REPLACE FUNCTION app.archive_operator_health_failures(...)`, строка 173
`CREATE OR REPLACE FUNCTION app.read_curated_system_health_pre_0196()`, затем 490/494 `DROP FUNCTION IF EXISTS`
(без `CASCADE`), 498 `DROP TABLE IF EXISTS public.integrator_push_outbox` (без `CASCADE`), 502–505 сужение
одного `CHECK`. Тела переписаны хирургически — машинный diff против предыдущих редакций:
`app.archive_operator_health_failures` против `20260821T040000_cut_over_canonical_contacts.sql` — удалены
ровно значение `'integrator_push_outbox'` из входного enum и его ветка (47 строк), остальное побайтно то же;
`app.read_curated_system_health_pre_0196` против живого снимка `prod-to-target/schema-pre.sql` — удалены CTE
`push_outbox`, ключ `'integratorPushOutbox'` и `push_outbox` из финального `FROM`; добавлены только
`PARALLEL UNSAFE` (это и есть умолчание PostgreSQL, семантика не меняется) и перенос `LANGUAGE sql` на свою
строку под парсер. Ни одна другая функция в дереве не ссылается на снятые объекты (см. п.10), поэтому «молча
исчезнуть» нечему; `CREATE OR REPLACE` сохраняет OID, так что `regprocedure`-идентичности не рвутся.

**3 → PASS.** Ни `GRANT`, ни `REVOKE`, ни `CREATE POLICY`, ни `ALTER/CREATE ROLE`, ни
`ALTER DEFAULT PRIVILEGES` в файле нет (`grep`); `node scripts/check-migration-privileges.mjs` →
`check-migration-privileges: OK (62 migration files)`. Разбор прав — раздел 3 ниже.
Артефакты соответствуют конечному состоянию, полученному штатным генератором:
`generate-cli.mjs --check` → 4/4 побайтно; повторный `--all --port-context-only` не меняет дерево
(`git status --porcelain` пуст после прогона); `--gaps` → `unresolved=0 gaps=0` на обеих БД;
`--census` → `216 ACTIVE relations across 3295 source files`, обе БД ok.

**4 → PASS.** Из health-контракта убрана только retired-классификация: `SystemHealthResponse` потерял поле
`integratorPushOutbox` и одноимённую пробу, `classifyIntegratorPushOutboxSystemHealthStatus` удалён, из
`criticalHealthSignals` убран топик `integrator_push_outbox`, из digest — строка деградации,
из archive-констант — probe и source-kind, из admin-UI — карточка «Очередь синка в integrator».
Общая уборка цела и доказана поведенчески: `runOperatorHealthMaintenanceTick` по-прежнему делает обе
операции — `purgeHealthFailureArchiveTtlBestEffort()` и `purgeIntegrationWebhookErrorEventsBestEffort()`;
TTL-очистка архива probe-агностична (`healthFailureArchiveService.purgeExpired` →
`pruneArchivedOlderThanDays(HEALTH_FAILURE_ARCHIVE_RETENTION_DAYS)`), поэтому исторические строки архива с
`health_probe='integrator_push_outbox'` продолжат вычищаться по 90 дням. Список архива их не роняет: в
`admin/health-failure-archive/route.ts` `probeEnum` — фильтр входного query-параметра, при `probe=null`
выдаются все строки, невалидный параметр даёт `400`, а не `500` на легаси-строке.
Исторические миграции, отчёты и `deploy/postgres/generated/prod-to-target/{schema-pre,schema-post}.sql`
классифицирую как history/input: это pre-forward снимок схемы B, поверх которого и применяется этот forward.
`apps/webapp/scripts/integrator-schema-cleanup/01_audit.ts` — history: собственная шапка файла говорит
`HISTORICAL ONE-SHOT TOOL … not a live runtime workflow`, он read-only, ни в одном package-скрипте не
объявлен, а его пробы обёрнуты в `optionalScalar`.

**5 → PASS.** Взгляд: во всех трёх местах сервиса удалена ровно ветка `syncWarning`, а канонические записи
(`port.updateEnabled`, `port.updateScheduleAndType`, `createRule`) и `if (!result.ok) return { ok: false,
error: result.error }` сохранены дословно — в `actions.ts`, обоих `api/patient/reminders/*` route и в UI
(`ReminderRulesClient`, `LegacyReminderScheduleDialog`, `ReminderCreateDialog`, `ReminderScheduleForm`)
убран только амбер-блок предупреждения; блок `{error && …}` на месте в каждом.
Тест: инъекция «канонический create не выполняется» (подмена `port.create` на чтение списка в
`service.ts:344`) даёт красное `service.idempotency.test.ts:95` —
`expected "vi.fn()" to be called with arguments … Number of calls: 0`. Инъекция откачена.

**6 → PASS.** Взгляд: планировщик читает именно webapp-канон — тело
`app.read_patient_reminder_materialization_snapshot` берёт правила `FROM public.reminder_rules AS rule
WHERE rule.organization_id = v_org AND rule.is_enabled = true`, а due-occurrence джойнит ту же
`public.reminder_rules` с условием `rule.is_enabled = true`. Ни одной ссылки на снятый канал в этом пути нет,
delivery-намерения по-прежнему собирает `materializePatientReminderDeliveries` и приземляет
`app.commit_patient_reminder_materialization` в `public.outgoing_delivery_queue`.
Тест: инъекция «дублирующий delivery intent» (`return [...deliveries, ...deliveries]`) краснит
`materializePatientReminderDeliveries.unit.test.ts:36` на списке каналов. Инъекция откачена.

**7 → PASS.** `CHECK` сужен, а не ослаблен: предыдущая редакция
(`20260820T122628_direct_public_write_retry_org_invariant.sql:10-19`) перечисляла семь значений, новая — те же
шесть минус `reminder_rule_upsert`. TS-union в `directPublicWriteRetry.ts` уже́ на одно значение,
`content_access_grant_upsert` пишется корнем со стороны БД — это не расхождение, а подмножество.
Висячих импортов нет: `pnpm --dir apps/integrator run typecheck` → exit 0,
`pnpm --dir apps/webapp run typecheck` → exit 0. Ветка `switch` заканчивается `const exhaustive: never`, то
есть неизвестная operation громко бросает, а не тонет.
Тест: инъекция «ветка `reminder_delivery_log_append` ничего не пишет» краснит
`directPublicWriteRetryWorker.test.ts:116` — `expected "vi.fn()" to be called once, but got 0 times`.
Инъекция откачена.

**8 → PASS.** Тик остался одной точкой под тем же именем задачи:
`OPERATOR_SYSTEM_HEALTH_GUARD_TICK_JOB_KEY` не менялся, оба вызывающих (`/api/integrator/system-health/
guard-wake` от резидентного scheduler и legacy Bearer `/api/internal/system-health-guard/tick`) зовут один
переименованный use-case `runOperatorHealthMaintenanceTick`; чтения/архивации снятой таблицы в нём не
осталось. Тест: инъекция «убрана webhook-очистка» краснит
`runOperatorHealthMaintenanceTick.unit.test.ts:25`. Инъекция откачена.

**9 → PASS.** Имя `20260823T160000_retire_reminder_rule_m2m.sql` — формат `YYYYMMDDTHHMMSS_slug`, файл
последний по сортировке (предыдущий — `20260823T145002_…`). Каждый из шести блоков, разделённых
`--> statement-breakpoint`, начинается ровно с одного `-- BCB-MIGRATION-OWNER:`; `postgres` в маркерах нет.
`-- BCB-MIGRATION-SCHEMA-CREATE: app` стоит на обоих `CREATE OR REPLACE FUNCTION app.*` — это требуемое
употребление (seam-owner держит на схеме `app` только `USAGE`, раннер выдаёт `CREATE` на транзакцию;
формулировка зафиксирована в `d25-generic-ingress-creates-nothing.devDbProof.test.mjs:469`).
`-- BCB-MIGRATION-LANGUAGE-USAGE:` — `plpgsql` и `sql` по телу. Probe
`-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.integrator_push_outbox') IS NULL` проверяем.
`node --test deploy/postgres/privileges/migrate-local-parse.test.mjs` → 6 pass / 0 fail;
`node --test deploy/postgres/privileges/*.test.mjs` → 282 теста, `pass 162, fail 0, skipped 120`.

**10 → PASS.** Снятая таблица не осталась ни в одном активном реестре: `apps/webapp/db/schema/schema.ts`,
`declaration.ts` (включая `public.integrator_push_outbox_id_seq` и touch-колонку `updated_at`),
`relation-access.ts`, `function-census.ts`, generated `privileges.{bcb_webapp_dev,bersoncarebot_test}.sql`,
`port-context-capabilities.*.sql`, `deploy/host/webapp-post-migrate-schema-check.sh`,
`deploy/postgres/{dev-c3-app-function-owners,p0-5b-grants,saas-system-health-diagnostics,
u9a-platform-settings-role}.sql` — во всех ссылки удалены. Отдельно проверил `saas-system-health-diagnostics.
sql`: он тело `read_curated_system_health_pre_0196` не определяет (только `ALTER … OWNER`/`REVOKE`/`GRANT`),
второго источника тела нет. `--gaps` и `--census` (числа выше) подтверждают, что грантов на несуществующий
объект не осталось.

**11 → FAIL (блокирующий).** См. раздел 4.

**12 → PASS для webapp / FAIL для integrator.** `pnpm exec eslint` по всем изменённым существующим файлам
webapp → exit 0. Integrator — см. раздел 4.

**13 → PASS.** Снятый корень `app.integrator_upsert_reminder_rule` действительно делал побочную работу:
`20260822T130000_the_integrator_roots_name_the_integrator_role.sql:121-124` —
`DELETE FROM integrator.user_reminder_occurrences … status IN ('planned','queued') AND organization_id =
p_organization_id`. Прослеживаю последствие до человека и не нахожу потери:
(а) при смене расписания сам webapp делает ту же уборку своим корнем — `service.ts:291`
`if (scheduleChanged) await port.cancelWebPushPendingOccurrences(ruleId)` →
`app.patient_cancel_pending_reminder_occurrences`, который удаляет ровно те же `('planned','queued')` в
границах того же арендатора;
(б) при выключении правила непрожитые occurrence физически не могут выстрелить: due-выборка джойнит
`rule.is_enabled = true`;
(в) при создании правила снимать нечего.
Порядок вызовов в `updateRule` дополнительно снимает вопрос по staff-инициированному пути
(`api/doctor/clients/[userId]/warmup-schedule`): уборка стоит ДО места, где на базе висел снятый
`tryNotifyIntegrator`, поэтому поведение этого маршрута до и после кандидата тождественно — кандидат его не
менял ни строкой.

**14 → PASS с именованным предполётным замером.** Отказ здесь fail-closed и громкий в обе стороны:
`ADD CONSTRAINT … CHECK` валидирует существующие строки, поэтому строка `operation='reminder_rule_upsert'`
уронит саму миграцию (деплой падает, данные целы), а не пропустит её тихо; если бы такая строка дожила,
worker бросил бы её на `const exhaustive: never` в `executeDirectPublicWriteRetry`, а не проглотил.
На именованной DEV это уже проверено лидом owner-aware rollback-only preflight-ом на этом же SHA
(`migrate-dev preflight: PASS`), то есть на DEV нарушающих строк нет. Для TEST/PROD достаточно одного
read-only замера перед выкаткой:
`SELECT count(*) FROM integrator.direct_public_write_retries WHERE operation = 'reminder_rule_upsert';`
Сам `DROP TABLE public.integrator_push_outbox` теряет только строки уже недостижимого канала: адресат
(`integrator.user_reminder_rules`) значится `intentionally_retire` в
`deploy/postgres/prod-to-target-cutover-data.sql:190` («`public.reminder_rules` is canonical»), читателей у
него в дереве нет.

**15 → PASS.** Дубля не заведено: `runIntegratorPushOutboxHealthGuardTick` не продублирован, а переименован в
`runOperatorHealthMaintenanceTick` (`git diff -M` показывает rename, similarity 52%), вместе с ним удалена
промежуточная обёртка `runIntegratorPushOutboxHealthClassificationTick`; оба вызывающих переведены на
единственную оставшуюся точку.

---

## 3. Разбор прав миграции (§1 «Перед приземлением миграции»)

Файл: `apps/webapp/db/drizzle-migrations/20260823T160000_retire_reminder_rule_m2m.sql`.
Форма: forward-only, без `CASCADE`, без единого `GRANT`/`REVOKE`/`POLICY`/`ROLE`.

**1. Что создаётся / меняется / удаляется.**

| # | Statement | Объект | Операция |
|---|---|---|---|
| 1 | `CREATE OR REPLACE FUNCTION app.archive_operator_health_failures(text,integer,uuid)` | функция | тело переписано, сигнатура и OID те же |
| 2 | `CREATE OR REPLACE FUNCTION app.read_curated_system_health_pre_0196()` | функция | тело переписано, сигнатура и OID те же |
| 3 | `DROP FUNCTION IF EXISTS app.enqueue_current_reminder_rule_push(text)` | функция | удаление |
| 4 | `DROP FUNCTION IF EXISTS app.integrator_upsert_reminder_rule(23 арг.)` | функция | удаление |
| 5 | `DROP TABLE IF EXISTS public.integrator_push_outbox` | таблица (+ её `_id_seq` по `OWNED BY`) | удаление |
| 6 | `ALTER TABLE integrator.direct_public_write_retries DROP/ADD CONSTRAINT …operation_check` | таблица | сужение `CHECK` на одно значение |

**2. Под какой ролью исполняется каждое тело — и совпадает ли маркер с фактическим владельцем.**
Сверял не по названию операции, а с владельцем, записанным в декларации/сгенерированном артефакте базы:

- #1 маркер `app_seam_telemetry_operator_owner` = `declaration.ts:6900` (`owner: 'app_seam_telemetry_operator_owner'`);
- #2 маркер `saas_system_health_owner` = `function-census.ts:7311-7312` (`"owner": "saas_system_health_owner"`);
- #3 маркер `app_seam_reminder_patient_owner` = `privileges.bcb_webapp_dev.sql@base:5062`
  (`ALTER FUNCTION app.enqueue_current_reminder_rule_push(text) OWNER TO "app_seam_reminder_patient_owner"`);
- #4 маркер `app_seam_reminder_patient_owner` = тот же артефакт, строка `5453`;
- #5 маркер `app_object_owner` = тот же артефакт, строка `14052`
  (`ALTER TABLE "public"."integrator_push_outbox" OWNER TO "app_object_owner"`);
- #6 маркер `app_object_owner` = `privileges.bcb_webapp_dev.sql:10364`
  (`ALTER TABLE "integrator"."direct_public_write_retries" OWNER TO "app_object_owner"`).

Оба `CREATE OR REPLACE` несут `-- BCB-MIGRATION-SCHEMA-CREATE: app`: seam-owner держит на схеме `app` только
`USAGE`, и без этого маркера раннер не выдаст ему `CREATE` на время транзакции. Владелец таблицы вправе
дропнуть её и принадлежащую ей последовательность; владелец функции — дропнуть функцию.

**3. Каких прав требуют тела, чтобы исполниться (а не только чтобы объект существовал).**
Обе переписанные функции только **сокращают** свою поверхность: новых таблиц, колонок, `FOR UPDATE`,
новых записей и новых seam-ролей ни одна не приобрела. `app.archive_operator_health_failures` сохраняет
прежний набор по `public.outgoing_delivery_queue` (`SELECT … FOR UPDATE OF queue` + `DELETE` + `UPDATE`
поколоночно по `updated_at`) — это ровно то, что и осталось объявлено, и что проверяет
`function-census.test.mjs:475` (в тесте вырезана только вторая, исчезнувшая релейшн; утверждение по
`outgoing_delivery_queue` сохранено дословно). `app.read_curated_system_health_pre_0196` теряет один
`SELECT`-источник. Сигнатуры не менялись → `function_identity` (`regprocedure`) стабильна, отдельного
reconcile по смене OID не требуется.

**4. Чего из этого нет в декларации — и добавлено ли в этой же ветке.**
Обратная сторона §1 (удаление разбирается тем же списком наоборот) выполнена в этой же ветке: из
`declaration.ts` сняты таблица, её последовательность, touch-колонка и оба объявления функций; из
`function-census.ts` — relation-surface на снятую таблицу; артефакты перегенерированы штатным генератором и
сходятся побайтно. Ручных grant-строк на снятые объекты не осталось ни в одном `deploy/postgres/*.sql` —
проверено сплошным поиском. Отдельно отмечу `u9a-platform-settings-role.sql`: снятая таблица убрана из
списка `REVOKE ALL PRIVILEGES ON TABLE …`, оставшиеся четыре имени сохранены — «липкости» списка колонок
здесь нет, привилегия одна на весь список.
Индексов на новые горячие колонки миграция не добавляет и не должна: новых колонок нет.

**Итог по правам: нарушений §1 не найдено.**

---

## 4. Блокирующая находка

**F1. Кандидат ломает repo-гейт `lint`: `apps/integrator/src/app/routes.ts:107` — мёртвое связывание,
оставшееся от вырезанной регистрации роута.**

Снятие `registerBersoncareReminderRulesRoute(...)` убрало единственного потребителя локальной константы.
На базе она была объявлена и использована, на кандидате — только объявлена:

```
$ git show 5fddb9aea92da375b20cd9bcc2043d8d007b24c2:apps/integrator/src/app/routes.ts | grep -n "resolveTenantForIntegratorUserId"
108:  const resolveTenantForIntegratorUserId = createResolveTenantForIntegratorUserId();
180:    resolveTenantForIntegratorUserId,
$ git show 024142803f5455cc0311fd0256cf0aaf44e5cac9:apps/integrator/src/app/routes.ts | grep -n "resolveTenantForIntegratorUserId"
107:  const resolveTenantForIntegratorUserId = createResolveTenantForIntegratorUserId();
```

Гейт падает, причём и приложенческим, и корневым конфигом:

```
$ pnpm --dir apps/integrator run lint
apps/integrator/src/app/routes.ts
  107:9  error  'resolveTenantForIntegratorUserId' is assigned a value but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (1 error, 0 warnings)
 ELIFECYCLE  Command failed with exit code 1        # INTEGRATOR_LINT_EXIT=1

$ pnpm exec eslint apps/integrator/src/app/routes.ts     # корневой конфиг, первый шаг `pnpm run ci`
  107:9  error  'resolveTenantForIntegratorUserId' is assigned a value but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (1 error, 0 warnings)                        # ROOT_ESLINT_ON_FILE_EXIT=1
```

Тайпчек это не ловит (`tsc --noEmit` обоих приложений — exit 0), поэтому дефект доживает ровно до `lint`,
то есть до первого шага `pnpm run ci` и до merge-гейта. По §24.7 `land-ready` требует зелёными все применимые
targeted-гейты — этот красный.

**Локализованный fix (исправляет лид, не аудитор).** Мёртвый кластер целиком:

- `apps/integrator/src/app/routes.ts:107` — сама константа (то, на что ругается ESLint);
- `apps/integrator/src/app/routes.ts:55-69` — фабрика `createResolveTenantForIntegratorUserId()`; после
  удаления строки 107 у неё не остаётся ни одного вызова во всём дереве
  (`grep -rn "createResolveTenantForIntegratorUserId" apps/integrator/src` → только эти два места);
- `apps/integrator/src/app/routes.ts:11-12` — импорты `resolveActiveTenantForIntegratorUserId` и типа
  `ResolvedIntegratorUserTenant`, используемые только этой фабрикой; после её удаления ESLint укажет и на них.

Сам репозиторный экспорт `resolveActiveTenantForIntegratorUserId`
(`apps/integrator/src/infra/db/repos/channelUsers.ts:14`) после этого остаётся без вызывающих. ESLint его не
ловит, и трогать его этим fix-ом не обязательно — это отдельное решение лида, а не часть гейта.

## 5. Незаблокирующие остатки (точные строки, решает лид)

Оба — остаточные упоминания снятой классификации; ничего не ломают, поэтому findings-ами по §24.6 не
считаю, но бриф просил, чтобы retired outbox-классификации не осталось в admin UI и runbook.

- `apps/webapp/src/modules/operator-health/cronJobRegistry.ts:85` — `label: 'Health guard (outbox)'`.
  Метка пользовательская: `collectCronJobsHealth.ts:139` кладёт её в ответ, и глобальный админ видит её в
  аккордеоне «Cron-задачи хоста». Тик больше не касается outbox — имя вводит в заблуждение.
- `deploy/HOST_DEPLOY_README.md:459` — в том же абзаце, который кандидат уже переписал, уцелела фраза
  «**critical** push по ipo **error** — в `operator-health-critical/tick`». Топик `integrator_push_outbox`
  из `classifyCriticalHealthSignals` удалён, такого push больше не существует.

## 6. Наблюдения (не работа)

- `deploy/postgres/privileges/name-census.json`, ключ `b0ForwardArtifactRoots`, всё ещё содержит
  `app.enqueue_current_reminder_rule_push`. Проверил: `rg 'b0ForwardArtifactRoots' deploy/postgres/privileges/`
  находит только сам JSON — ни один `assertNameCensus(...)` этот ключ не читает, гейта за ним нет.
  Оставлять руками не правленным — верное решение воркера: файл регенерируется своим механизмом
  (`BCB_UPDATE_NAME_CENSUS=1`).
- `AGENTS.md` §10b приводит как живой пример
  `apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts`. Этого файла в
  дереве нет и **на базе не было** — он снят раньше (`407fa7f92`, «retire remaining live-DB fixture test
  harness»). Расхождение канона с деревом существует до кандидата и к D30 отношения не имеет.

---

## 7. Команды и фактические результаты

Каждое число — рядом с командой, которая его дала. Всё выполнено на дереве кандидата
(`git diff --stat 024142803..HEAD` = только docs-файл брифа; продуктовые файлы тождественны кандидату).

```
node deploy/postgres/privileges/generate-cli.mjs --check
  → ok bcb_webapp_dev/privileges, ok bcb_webapp_dev/allowlist,
    ok bersoncarebot_test/privileges, ok bersoncarebot_test/allowlist — 4/4 побайтно; EXIT=0
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only ; git status --porcelain
  → записано 2 файла (78308 / 78586 байт), дерево после прогона ЧИСТОЕ (вывод пуст)
node deploy/postgres/privileges/generate-cli.mjs --gaps
  → bcb_webapp_dev: classified=230 active=216 pending=10 directGrantEntries=657 unresolved=0 gaps=0
  → bersoncarebot_test: те же значения; EXIT=0
node deploy/postgres/privileges/generate-cli.mjs --census
  → ok обе БД: 216 ACTIVE relations across 3295 source files
node scripts/check-migration-privileges.mjs          → OK (62 migration files); EXIT=0
node scripts/check-c4-migration-owned-function-bodies.mjs → OK; EXIT=0
node --test deploy/postgres/privileges/*.test.mjs    → tests 282, pass 162, fail 0, skipped 120, 24.5 s
node --test deploy/postgres/privileges/migrate-local-parse.test.mjs → tests 6, pass 6, fail 0
pnpm --dir apps/integrator run typecheck             → EXIT=0
pnpm --dir apps/webapp run typecheck                 → EXIT=0
pnpm --dir apps/integrator exec vitest run --no-coverage \
    src/infra/db/repos/directPublicWriteRetry.unit.test.ts \
    src/infra/runtime/worker/directPublicWriteRetryWorker.test.ts \
    src/infra/db/directPublic/canonWritersUseNamedRoots.behaviour.test.ts \
    src/integrations/bersoncare/deliveryIdempotency.route.test.ts
                                                     → 4 files passed, 17 tests passed
pnpm --dir apps/webapp exec vitest run --project=unit --project=route --no-coverage \
    src/modules/reminders/ src/app-layer/health/ src/app-layer/reminders/ \
    src/modules/operator-health/ .../materialize-wake/route.route.test.ts
                                                     → 10 files passed, 27 tests passed
pnpm --dir apps/webapp exec vitest run --project=fast --no-coverage \
    src/modules/reminders/ src/app-layer/health/ src/app-layer/reminders/ \
    src/modules/operator-health/ src/app/app/patient/reminders/
                                                     → 4 files passed, 11 tests passed
pnpm exec eslint <44 изменённых существующих файла apps/webapp>  → EXIT=0
pnpm --dir apps/integrator run lint                  → 1 problem (1 error) ; EXIT=1   ← F1
pnpm exec eslint apps/integrator/src/app/routes.ts   → 1 problem (1 error) ; EXIT=1   ← F1
git status --porcelain (после каждой инъекции)       → пусто
```

**Fault injection — посажено `4`, убито `4`, не поймано `0`, все откачены.** Один раз на независимый класс:

| Класс | Что сломано | Какое утверждение покраснело |
|---|---|---|
| Каноническая запись правила (kill-set 5) | `service.ts:344` — `port.create` подменён чтением списка | `service.idempotency.test.ts:95` — `expect(create).toHaveBeenCalledWith(...)`, `Number of calls: 0` |
| Единственность delivery intent (kill-set 6) | `materializePatientReminderDeliveries.ts` — `return [...deliveries, ...deliveries]` | `materializePatientReminderDeliveries.unit.test.ts:36` — список каналов |
| Оставшиеся direct-public retry operations (kill-set 7) | `directPublicWriteRetryWorker.ts` — ветка `reminder_delivery_log_append` ничего не пишет | `directPublicWriteRetryWorker.test.ts:116` — `expected … to be called once, but got 0 times` |
| Обе TTL-очистки maintenance tick (kill-set 8) | `runOperatorHealthMaintenanceTick.ts` — снят вызов webhook-очистки | `runOperatorHealthMaintenanceTick.unit.test.ts:25` — `purgeWebhook … toHaveBeenCalledTimes(2)` |

Новых acceptance-тестов не писал: все четыре названных класса уже закрыты существующими зелёными тестами и
лично проверены инъекцией; остальные пункты kill-set по своей природе — взгляд (§24.4), тест отсутствия
строки/импорта/SQL-текста заводить запрещено.

---

## 8. Вердикт

# FAIL, NOT FOR LAND

Само снятие M2M-канала выполнено верно и полно: producer, consumer, очередь, права, артефакты, health-
поверхность и runbook приведены к конечному состоянию, ни одна живая функция не осталась висеть на снятых
объектах, побочная уборка occurrence не потеряна, а четыре независимых класса поведения доказаны инъекцией.
Ветку держит один локализованный дефект — **F1**: кандидат оставил мёртвое связывание, из-за которого
`lint` (и приложенческий, и корневой, т.е. первый шаг `pnpm run ci`) падает на этом SHA. Правка — удаление
одного мёртвого кластера в `apps/integrator/src/app/routes.ts`; делает лид, аудитор продуктовый код не
трогает.

---

## 9. Строка для `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`

```
| **Независимый аудит D30 (снятие M2M `reminder_rule_upsert`) — `FAIL, NOT FOR LAND`**, product `024142803`, audit `<SHA этого коммита>` на `wt/d30-remove-reminder-rule-m2m-20260823` | **Opus 5**/high по брифу `docs/_TODO/runs/briefs/D30_REMINDER_M2M_RETIREMENT_INDEPENDENT_AUDIT_2026-08-23.md`, отчёт `docs/_TODO/runs/integrator-cleanup/D30_REMINDER_M2M_RETIREMENT_INDEPENDENT_AUDIT_2026-08-23.md`. **Блокирующих `1`, незаблокирующих остатков `2`, наблюдений `2`. Инъекций посажено `4`, убито `4`, не поймано `0`**, все откачены. Ш8 выполнен: producer, consumer, `public.integrator_push_outbox`, оба retired-корня, декларация, function census и generated DEV/TEST артефакты сведены к конечному состоянию; `generate-cli --check` побайтно 4/4, `--gaps` `unresolved=0 gaps=0`, `--census` `216` релейшнов, `check-migration-privileges` OK (`62`), privileges-набор `282` теста `pass 162 / fail 0`, оба `tsc --noEmit` exit `0`, targeted vitest `18` файлов / `55` тестов зелёные. Разбор прав по §1 сделан: миграция прав не выдаёт и не отзывает, все шесть owner-маркеров сверены с владельцами объектов в артефакте базы, обе функции переписаны `CREATE OR REPLACE` без смены сигнатуры, `DROP` без `CASCADE`, `CHECK` сужен ровно на одно значение. Отдельно прослежено до человека: снятая корнем уборка непрожитых occurrence не потеряна — её делает `app.patient_cancel_pending_reminder_occurrences` из `service.ts:291`, а для выключенного правила occurrence не выбирается (`rule.is_enabled = true` в due-джойне). **БЛОКЕР: `apps/integrator/src/app/routes.ts:107`** — после вырезания регистрации reminder-rules-роута константа `resolveTenantForIntegratorUserId` осталась без потребителя (на базе строка `180` её использовала), `pnpm --dir apps/integrator run lint` и корневой `eslint` дают `1 error @typescript-eslint/no-unused-vars`, exit `1`; тайпчек это не ловит, значит красным становится первый шаг `pnpm run ci`. Мёртвый кластер целиком: строка `107`, фабрика `55-69` и импорты `11-12`. Незаблокирующее: метка `'Health guard (outbox)'` (`cronJobRegistry.ts:85`, видна админу) и фраза про «push по ipo error» (`HOST_DEPLOY_README.md:459`). Full CI, `--execute`, deploy, TEST/PROD, push, cronport и Therapysto/night-ветки не трогались; дерево после инъекций чистое |
```

## 10. NOT DONE

- **Full `pnpm run ci` не гонялся** — уровень аудита `app` по §10, repo-факторов нет; вдобавок он заведомо
  красный на шаге `lint` из-за F1, так что нового сигнала не даёт.
- **`pnpm --dir apps/webapp run lint` целиком не гонялся** — прогнан ESLint по всем 44 изменённым
  существующим файлам webapp (exit 0). Integrator, наоборот, пролинтован целиком (`eslint src`).
- **`migrate-dev.sh --execute`, любые действия на TEST/PROD, deploy, provider send, cronport, push, fixtures
  и одноразовые базы — не выполнялись.** DEV-схема на этом SHA уже проверена лидом owner-aware rollback-only
  preflight-ом; повторять без нового SHA не требуется.
- **Живого прогона планировщика и живой доставки нет.** Утверждения по kill-set 6 держатся на теле
  `app.read_patient_reminder_materialization_snapshot`, коде wake-use-case и unit-тестах с инъекцией, а не на
  наблюдённом тике. Это остаётся за pre-landing live-гейтом лида.
- **Замер `integrator.direct_public_write_retries WHERE operation='reminder_rule_upsert'` на TEST/PROD не
  делался** (границы брифа) — команда для лида приведена в п.14 раздела 2. На DEV вопрос закрыт preflight-ом.
- **Продуктовый код не исправлялся** (§24.6): F1 и оба незаблокирующих остатка описаны точными строками для
  лида. Новых acceptance-тестов не заводил — все четыре поведенческих класса уже закрыты существующими
  тестами и проверены инъекцией.
