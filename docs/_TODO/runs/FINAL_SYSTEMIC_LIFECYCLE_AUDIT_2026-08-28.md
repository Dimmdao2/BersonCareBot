# Независимый финальный аудит: lifecycle / purge / retention / job truth — 28.08.2026

Ветка `wt/final-lifecycle-audit-20260828`, HEAD `6f924fe1d98e03545bd47051a152f59d839a4718`.
Authority: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, этапы 3 и 4 (дословные
требования и приёмка). Проверялось фактическое состояние HEAD, а не статусы документа.

Границы прохода: полный CI не запускался; общий DEV-сервер и PROD не трогались; TEST — только
read-only интроспекция и rollback-only прогоны каноническим admin-сокетом (AGENTS §6). Публичный
destructive route `POST /api/doctor/clients/:userId/permanent-delete` остаётся выключенным
(`account_purge_disabled`) и не включался. Одноразовая БД не создавалась.

## Слепой kill-set (составлен по authority ДО чтения тестов)

Этап 3: K3.1 census краснеет на новой journal/temp таблице без policy · K3.2 purge истории напоминаний
по `platform_user_id` · K3.3 retired integrator-id нигде не условие удаления · K3.4 окно истории
напоминаний + prune root + scheduler · K3.5 решение по `message_log` · K3.6 terminal
`media_upload_sessions` не покупаются в purge до owner-решения · K3.7 Drizzle ⇄ применённая TEST ⇄
generated snapshot · K3.8 живой purge не оставляет связанных пользовательских фактов · K3.9 объявленный
cascade, которого база не выполнит, не появляется молча.

Этап 4: K4.1 `errors > 0` никогда не даёт `success: true` · K4.2 retry identity не удаляется до
подтверждённого S3 Abort/Delete · K4.3 отказ остаётся retryable с bounded backoff и виден в health ·
K4.4 нет пустого `catch`, превращающего отказ в `no_data` · K4.5 окончательный success/staleness из
канонического delivery lifecycle · K4.6 успехи не дублируются в журнал попыток · K4.7 повторный запуск
завершает работу ровно один раз.

## Итог по каждому требованию

| ID | Требование этапа | Итог |
|----|------------------|------|
| 3.1 | Инвентаризировать все журналы/очереди/попытки/temp stores/проекции | PASS с названной границей |
| 3.2 | Зафиксировать для каждой сущности why/ключ/cascade/terminal/окно/root/scheduler/health | PASS с названной границей |
| 3.3 | Purge `reminder_occurrence_history` на `platform_user_id`; retired id только backfill/reconcile | PASS |
| 3.4a | Окно истории напоминаний | BLOCKED (owner) |
| 3.4b | Решение по `message_log` | PASS |
| 3.4c | Terminal `media_upload_sessions` только после owner-решения | PASS |
| 3.5 | Drizzle ⇄ применённая TEST ⇄ generated snapshots (nullable `integrator_user_id`) | PASS |
| 3.A | Приёмка: census не допускает новую journal/temp таблицу без policy | **FAIL** |
| 3.B | Приёмка: живой account purge не оставляет связанных пользовательских фактов | **FAIL** |
| 4.1 | `errors > 0` не превращается в `success: true` | **FAIL** (1 из 8 тиков) |
| 4.2 | Retry identity не удаляется до подтверждённого S3 Abort/Delete | PASS |
| 4.3 | Ошибка хранится retryable с bounded backoff и видна в health | PASS |
| 4.4a | Убрать пустые `catch`, меняющие отказ на `no_data` | PASS |
| 4.4b | Объединить логи, `operator_job_status` и isolation telemetry одним результатом | **FAIL** (живая БД) |
| 4.5 | Delivery health на текущем контракте; успехи не дублировать в журнал попыток | PASS |
| 4.A | Приёмка: fault injection → retryable + красный tick + операторский сигнал; повтор ровно один раз | **PARTIAL** (см. 4.1, 4.4b) |

## FAIL

### F1. Живой account purge физически ОТКАЗЫВАЕТ для целого класса клиентов (этап 3, приёмка)

`platform_users` --CASCADE--> `public.org_enrollments` --NO ACTION--> `public.manual_patient_commands`,
и ни один шаг purge не чистит третью таблицу. Финальный `DELETE FROM platform_users` получает `23503`,
вся транзакция откатывается, `runStrictPurgePlatformUser` возвращает `transaction_failed` — не удаляется
НИЧЕГО. На TEST это 16 живых `role='client'`.

Живое rollback-only доказательство:

```
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -c "
BEGIN;
CREATE TEMP TABLE probe AS SELECT pu.id FROM platform_users pu
  JOIN manual_patient_commands m ON m.platform_user_id=pu.id WHERE pu.role='client' LIMIT 1;
DELETE FROM platform_users WHERE id IN (SELECT id FROM probe);
ROLLBACK;"
ERROR: update or delete on table "org_enrollments" violates foreign key constraint
       "manual_patient_commands_enrollment_fkey" on table "manual_patient_commands"
```

Почему существующая проба этого не видела: `platformUserFullPurge.devDbProof.test.ts` намеренно выбирает
ОДНОГО клиента с максимальным покрытием трёх классов, и у него таких строк нет.

Добавлен падающий acceptance (rollback-only, тот же opt-in `RUN_PLATFORM_USER_PURGE_DB=1`, тот же
harness, кандидаты выводятся из ЖИВОГО графа ограничений, а не из списка в файле):
`apps/webapp/src/infra/platformUserFullPurge.devDbProof.test.ts` → describe «account purge is not
refused by a blocking dependent». Результат на HEAD: `10 passed | 1 failed`, красное утверждение —
`manual_patient_commands (manual_patient_commands_enrollment_fkey → org_enrollments)`.

Достижимый impact: удаление учётной записи пациента, который получал ручные команды, не выполняется
вообще; оператор получает `transaction_failed`, данные человека остаются.

Исправление owner-решения НЕ требует.

### F2. Часть пользовательских фактов переживает purge (этап 3, приёмка)

Таблицы с пользовательским ключом, без FK на `platform_users` и без записи в `CONTENT_TABLES` —
измерено на TEST:

| Таблица | Ключ | Строк / клиентов |
|---|---|---|
| `public.patient_diary_day_snapshots` | `platform_user_id` | 746 / 58 |
| `public.patient_practice_completions` | `user_id` | 264 / 32 |
| `public.specialist_tasks` | `patient_user_id` (FK только на `owner_user_id`) | 6 / 6 |
| `public.manual_patient_commands` | `platform_user_id` | 16 / 16 |

Проверка (read-only): census колонок с пользовательским ключом без FK на `platform_users`, затем
`JOIN platform_users ... WHERE role='client'`. Первые две — пациентский контент того же класса, что
`lfk_sessions` / `program_action_log` / `test_attempts`, у которых реестр пишет «dies with the patient
account».

Существующая проба это не ловит по построению: её surfaces = живой FK-граф + `CONTENT_TABLES`, поэтому
таблица вне обоих множеств невидима.

### F3. Census не ловит новую journal/temp таблицу с именем вне списка суффиксов (этап 3, приёмка)

Триггер кандидатов — эвристика по имени (`JOURNAL_LIFECYCLE_TABLE_SUFFIXES`, 22 суффикса) плюс семь
имён в `JOURNAL_LIFECYCLE_EXTRA_CANDIDATES`.

Инъекция A1 — в `declaration.ts` добавлена `public.bcb_injected_probe_events` без записи в реестре:
`journalLifecycleRegistry.contract.test.ts` покраснел (`undecided = ["public.bcb_injected_probe_events"]`).
Инъекция A2 — та же операция с именем `public.bcb_probe_sms_deliveries`: **6 passed, гейт остался
зелёным**. Обе инъекции откачены.

Это не гипотеза: `public.manual_patient_commands` объявлена в `declaration.ts:1119` и отсутствует и в
`JOURNAL_LIFECYCLE_REGISTRY`, и в `JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS` — то есть уже сегодня живёт
без записанного lifecycle, и именно она ломает purge (F1).

Вторая, отдельная дыра того же гейта: escape-hatch `JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS` хранит
ТОЛЬКО строку-причину и не требует purge-решения. `public.patient_practice_completions` и
`public.patient_diary_day_snapshots` записаны там как «patient diary content» — и переживают purge (F2).

### F4. `errors > 0` даёт зелёный tick у `saas_billing_renewal.tick` (этап 4, требование 1)

`apps/webapp/src/modules/saas-billing/service.ts:940-1072` — `runDueSaasBillingRenewals` намеренно не
роняет весь тик из-за одной организации и возвращает `{ dueCount, created, alreadyInvoiced, failed,
errors[] }`. Маршрут `apps/webapp/src/app/api/internal/saas-billing/renewal/tick/route.ts:60-73`
безусловно пишет `success: true` и отвечает `200 { ok: true, ... }`, складывая `failed`/`errors` в
`metaJson`.

Задание обязательное и ежечасное: `backgroundJobManifest.ts:364-382` (`required: true`, `cron: '0 * * * *'`,
`environments: ['prod','test']`), шаблоны `deploy/host/cron.d/bersoncarebot-{,test-}saas-billing-renewal.cron.template`.

Достижимый сценарий: провайдер платежей отклоняет off-session списание или срабатывает
`SaasBillingTariffDowngradeBlockedError` → счёт продления клинике не выставлен, а карточка «Здоровье
системы» показывает обязательный job зелёным.

Два уже исправленных соседа делают ровно наоборот: `media-pending-delete/purge/route.ts:57-68` и
`media-multipart/cleanup/route.ts:88-97`.

Добавлен падающий acceptance:
`apps/webapp/src/app/api/internal/saas-billing/renewal/tick/route.unit.test.ts` — `1 passed | 1 failed`
(`expected 200 to be 500`). Отдельного теста у этого маршрута до сих пор не было ни одного.

Исправление owner-решения НЕ требует.

### F5. Isolation telemetry для `maintenance` и `saas_billing` отвергается живой БД (этап 4, требование 3)

TS-словарь закрыт (`cronIsolationOperations.ts:18-19`, `saasIsolationDiagnostics.ts:53-54`), но живая
дверь их не принимает — на TEST и на DEV:

```
sudo -n -u postgres psql ... -d bersoncarebot_test -c "SELECT pg_get_functiondef(
  'app.report_saas_isolation_event(text,text,text,text)'::regprocedure);"
→ IF (p_source_service, p_source_operation) NOT IN ( ... ('cron','cron_health'), ('cron','cron_media'),
    ('cron','cron_analytics'), ('cron','cron_reminders'), ('cron','cron_specialist_tasks') )
  THEN RAISE EXCEPTION 'invalid_saas_isolation_service_operation' USING ERRCODE = '22023';
```

То же в CHECK-ограничении `saas_isolation_events_source_operation_check`; на `bcb_webapp_dev` обе
подстроки тоже отсутствуют.

Значения существуют только в `deploy/postgres/saas-isolation-telemetry.sql:111,148`, а этот overlay
применяет исключительно `deploy/host/deploy-test-saas.sh` — restore/cutover-путь. Обычный
`deploy/host/deploy-test.sh` его не накатывает, миграции этой таблицы не касаются. То есть исправление
§E3 кодом сделано, но дойти до живой базы штатным деплоем не может.

Достижимый сценарий: распознанный isolation-отказ при записи тика `db_journal_retention` (семейство
`maintenance`) или `saas_billing_renewal.tick` — `recordOperatorCronJobTickBestEffort` вызывает
`reportSaasIsolationEventBestEffort`, дверь отвечает `22023`, best-effort репортер это глотает, и
операторского сигнала нет, как и до исправления. Приёмка этапа 4 требует именно «операторский сигнал».

## BLOCKED / OWNER QUESTION

### OQ1. Окно хранения `reminder_occurrence_history` (этап 3, требование 4)
Механика собрана целиком: ветка в живом `app.prune_retention_target` (подтверждено интроспекцией),
bounded batch, named root `reminder_occurrence_history_terminal`, запись в реестре, seam планировщика.
Отсутствует ТОЛЬКО число: `REMINDER_OCCURRENCE_HISTORY_RETENTION_DAYS_OWNER_DECISION = null`
(`journalRetention.ts`), цель отдаётся как `skipped: 'owner_decision_pending'`. Придуманное агентом
число молча удалило бы историю приверженности пациента. Классифицирую как OWNER QUESTION, а не FAIL:
`OQ-REMINDER-HISTORY-WINDOW`.

### OQ2–OQ5. Четыре зафиксированных policy-расхождения — состояние на HEAD

**OQ2. `message_log`: физическое удаление против заявленной анонимизации.** Реестр объявляет
`userPurge: { kind: 'anonymised', column: 'platform_user_id' }`, живой FK действительно `SET NULL`
(`confdeltype='n'`), НО purge-ядро физически удаляет строки двумя запросами:
`platformUserFullPurge.ts:104-118` (по телефону) и `platformUserFullPurge.ts:313-317` (по id).
Объявленный жизненный цикл ложен. Детектор расхождений в пробе сравнивает реестр только с FK-графом и
этот класс не видит вообще.

**OQ3. Media ownership / post-commit cleanup.** Реестр объявляет `media_files.uploaded_by` как
`anonymised` (живой FK `SET NULL`), а `strictPlatformUserPurge.ts:145-175` после коммита удаляет
S3-объекты и строки `DELETE FROM media_files WHERE id = $1` для каждой строки, собранной
`collectPurgeArtifactKeys` по `uploaded_by`.

**OQ4. Post-purge audit хранит сырой user id и артефакты.** `strictPlatformUserPurge.ts:355-380` пишет
в `admin_audit_log` (реестр: `keep-forever`) `target_id` = сырой UUID удалённой учётки и
`details` = `{ phoneNormalized: <телефон человека>, webappIntegratorUserId, artifact: { intakeS3Keys,
mediaFiles[{id,s3Key}], patientFileS3Keys } }` (`buildExternalCleanupAuditDetails`,
`adminAuditLog.ts:109`). После «полного удаления» телефон и ключи файлов человека остаются навсегда.

**OQ5. Три FK объявлены `anonymised` при фактическом `NO ACTION`** — подтверждено живьём на TEST
(`confdeltype='a'`): `public.system_settings_audit.changed_by`,
`public.organization_slug_rename_events.actor_platform_user_id`,
`public.online_intake_status_history.changed_by`. Сегодня недостижимо (все три пишутся сотрудниками,
purge принимает `role='client'`), набор зафиксирован в `RECORDED_REGISTRY_FK_DIVERGENCES` и гейт
краснеет на НОВОМ расхождении — механика адекватна, открыто только owner-решение.

**Что в OQ2–OQ5 можно и нужно исправить БЕЗ owner-решения:** сам детектор. Он сравнивает реестр только
с живым FK-графом и `CONTENT_TABLES`, поэтому «объявлено anonymised, а код физически удаляет» (OQ2, OQ3)
не краснеет ничем. Сравнение объявленного `anonymised` с фактом удаления в purge-коде — механическая
проверка, продуктового решения не требует. Само содержание политики (переживает ли строка удаление
учётки, что именно хранит post-purge audit) — owner.

## PASS с evidence

- **3.3** `CONTENT_TABLES` содержит `{ table: 'reminder_occurrence_history', column: 'platform_user_id' }`
  (`platformUserFullPurge.ts:40`); `deleteWebappProjectionByIntegratorUserId` вызывается как reconcile-хвост
  для сирот, не как условие; тот же ключ исправлен в `apps/webapp/scripts/user-phone-admin.ts:302`.
  Инъекция: удаление записи из `CONTENT_TABLES` → devDbProof `2 failed | 7 passed`
  (`reminder_occurrence_history.platform_user_id: declared explicit-delete, absent from CONTENT_TABLES`).
- **3.4b** `message_log` — 90 суток, класс взят из уже принятой политики evidence/16; ветка присутствует
  в живой функции: `position('message_log' in pg_get_functiondef('app.prune_retention_target(...)')) > 0`
  → `true` на TEST. Инъекция: подмена `pruneTarget` → гейт покраснел (`orphanTargets = ["message_log"]`).
- **3.4c** `listExpiredActiveUploadSessions` (`mediaUploadSessionsRepo.ts:499-521`) выбирает только
  `('initiated','uploading','completing')`; terminal-сессии в purge не попадают, `OQ-TERMINAL-UPLOAD-SESSION-WINDOW`
  записан.
- **3.5** live TEST `information_schema.columns` → `reminder_occurrence_history.integrator_user_id
  is_nullable=YES`; Drizzle `schema.ts:2793` — без `.notNull()`; generated snapshot
  `deploy/postgres/generated/prod-to-target/schema-pre.sql` → `integrator_user_id bigint,`.
  Полная сверка (`tsx` по реальной Drizzle-схеме против `information_schema` живой TEST):
  **0 расхождений NOT NULL, 0 отсутствующих колонок**.
- **4.2 / 4.3** `purgePendingMediaDeleteBatch` (`s3MediaStorage.ts:1329-1424`) прерывает обработку строки
  при неуспешном `AbortMultipartUpload`, возвращает её в retry с `delete_attempts`/`next_attempt_at`,
  и только подтверждённое удаление считает `removed`. Инъекция: проглотить `abortFailed` и продолжить
  удаление → `s3MediaStorage.lifecycle.unit.test.ts` покраснел на «aborts the multipart upload BEFORE
  deleting anything, and keeps the row retryable when the abort fails». Откачено.
- **4.4a** пустых `catch → no_data` в health-пути не осталось: `collectAdminSystemHealthData.ts`
  (строки 308, 351, 414, 559, 592, 633, 692, 710, 1065) возвращает `status: 'error'` с именованным
  `errorCode`; `loadAdminNotificationDeliveryHealthMetrics` логирует и отдаёт
  `notification_delivery_health_query_failed`.
- **4.5** `pgNotificationDeliveryAttempts.getHealthSnapshot24h` пропускает строки `status='success'` и
  берёт `successCount`/`lastSuccessAt`/`confirmedDeliveries24h` из `app.read_operator_delivery_queue_health()`;
  `classifyNotificationDeliverySystemHealthStatus` различает тихий день и аварию через `dueBacklog`.
  Дублирование успехов заблокировано в самой двери: живой
  `app.integrator_record_notification_delivery_attempt` содержит
  `IF p_status IS DISTINCT FROM 'failed' THEN RAISE EXCEPTION ...`.
- **4.7** повтор завершает работу один раз: `s3MediaStorage.lifecycle.unit.test.ts` → «finishes the work
  on the retry after an abort that already succeeded»; у продления тарифа — `saas_billing_invoices_period_uidx`.

## Recommendations (не findings, достижимого сценария нет)

1. `app.record_operator_delivery_attempt` (живая TEST) до сих пор принимает `p_status IN ('success',
   'failed','skipped')` и вставит строку `success` в `notification_delivery_attempts`, тогда как
   сестринская дверь `app.integrator_record_notification_delivery_attempt` такое поднимает исключением.
   Продуктовых вызывающих со `success` нет (`outgoingDeliveryWorker.ts:531`, `dispatchPort.ts:242` —
   оба `status: 'failed'`), поэтому это запас, а не дефект; две двери в одну таблицу расходятся в правиле.
2. 12 таблиц объявлены в Drizzle `schema.ts`, но отсутствуют в применённой схеме TEST: `contacts`,
   `content_access_grants`, `conversation_messages`, `conversations`, `identities`,
   `integration_data_quality_incidents`, `message_drafts`, `question_messages`, `telegram_users`,
   `user_questions`, `users`, `webapp_schema_migrations`. Ни один экспорт не импортируется продуктовым
   кодом (проверено), поэтому это ORM-only остаток того же класса, что снятый `.notNull()`.
3. Пропуск `reminder_occurrence_history_terminal` по owner-решению честно попадает в `metaJson` тика, но
   тик остаётся `success: true` — это верно для отложенного решения; отдельного сигнала «политика ещё не
   принята» на карточке нет.

## Что запускалось

```
pnpm install --frozen-lockfile
pnpm --dir packages/{operator-db-schema,db-principal,platform-merge,error-tracking} run build
pnpm --dir apps/webapp exec vitest run src/modules/db-retention/                      → 13/13 PASS
pnpm --dir apps/webapp exec vitest run \
  src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts \
  src/app/api/internal/{media-pending-delete/purge,media-multipart/cleanup,media-preview/process,db-journal-retention/tick}/route.unit.test.ts
                                                                                       → 24/24 PASS
RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run \
  src/infra/platformUserFullPurge.devDbProof.test.ts        → до правки 9/9 PASS; после 10 PASS | 1 FAIL (F1)
pnpm --dir apps/webapp exec vitest run \
  src/app/api/internal/saas-billing/renewal/tick/route.unit.test.ts        → 1 PASS | 1 FAIL (F4)
pnpm --dir apps/webapp typecheck                                                       → PASS
npx eslint <два изменённых файла>                                                      → PASS
```

Живая TEST-интроспекция — только внутри `BEGIN READ ONLY … ROLLBACK` либо `BEGIN … ROLLBACK`
(единственная пишущая проба — `DELETE`, отбитый FK и откаченный). Счётчики до и после прохода совпадают:
`platform_users` 328, `org_enrollments` 276, `manual_patient_commands` 16,
`reminder_occurrence_history` 4135, `media_files` 187.

## Временные поломки production-кода — все откачены

| Инъекция | Файл | Состояние |
|---|---|---|
| A1 `public.bcb_injected_probe_events` | `deploy/postgres/privileges/declaration.ts` | откачена |
| A2 `public.bcb_probe_sms_deliveries` | `deploy/postgres/privileges/declaration.ts` | откачена |
| B удалена запись `reminder_occurrence_history` из `CONTENT_TABLES` | `apps/webapp/src/infra/platformUserFullPurge.ts` | откачена |
| C подменён `pruneTarget` у `message_log` | `deploy/postgres/privileges/journal-lifecycle-registry.ts` | откачена |
| D проглочен `abortFailed` в purge-батче | `apps/webapp/src/infra/repos/s3MediaStorage.ts` | откачена |

`git status` после отката каждой инъекции — чисто; в коммит вошли только два тестовых файла.
Продуктовый fix аудитором не делался.
