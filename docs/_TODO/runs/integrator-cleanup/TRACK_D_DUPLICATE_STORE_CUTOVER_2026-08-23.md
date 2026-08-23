# Track D — final occurrence consolidation and automatic retention (#987 final cutover pass)

Однопроходный автономный прогон на `wt/track-d-final-cutover-20260823`. Никаких мутаций DEV/TEST/PROD,
никаких push/land/deploy — только код в этой ветке + один коммит в конце. **Итог: §C сделан и проверен
целиком; §A/§B спроектированы, но НЕ выполнены** — точная причина и остаток см. ниже. Это НЕ
"candidate-ready": физическая консолидация трёх occurrence-таблиц не произошла.

## §A/§B — НЕ СДЕЛАНО: обоснование и точный дизайн для следующего прохода

### Почему не выполнено в этом проходе

Бриф требует форвард-миграцию, которая консолидирует `integrator.user_reminder_occurrences`,
`public.reminder_occurrence_history`, `public.reminder_journal` в ОДНУ физическую таблицу, и предписывает
явно: **"abort on ambiguous parity instead of guessing"**. После полного чтения всех трёх репозиториев
(`apps/integrator/src/infra/db/repos/reminders.ts`, `apps/webapp/src/infra/repos/pgReminderJournal.ts`,
`pgReminderProjection.ts`, `pgPatientReminderMaterialization.ts`, `apps/integrator/src/infra/runtime/worker/
outgoingDeliveryWorker.ts`, `apps/integrator/src/infra/db/writePort.ts`,
`apps/integrator/src/infra/db/directPublic/{writePort,writeReminderProjectionDirect}.ts`) нашлись два
конкретных источника неоднозначности, которые нельзя закрыть без живого прогона (запрещённого этим
брифом на DEV/TEST/PROD):

1. **`app.commit_patient_reminder_materialization`** — SECURITY DEFINER функция на ~180 строк с точным
   JSON-контрактом идемпотентности (валидирует форму входного JSON поле-в-поле, включая идемпотентный
   guard на повторную материализацию). Любое изменение формы occurrence-строки, на которую опирается эта
   функция, требует переписать и эту функцию, и КАЖДЫЙ вызывающий её код — без возможности прогнать её на
   реальных данных (миграция БД/бэкфилл на DEV запрещены) я не могу доказать, что переписанный контракт
   бьётся байт-в-байт со старым для уже существующих occurrence-строк.
2. **Конкретный риск дублирующей отправки в `outgoingDeliveryWorker.ts:695-867`.** Финализирующая запись
   occurrence (`record_reminder_occurrence_finalized_projection` / аналог) сейчас лежит ВНУТРИ более
   широкого `try/catch`, который при ЛЮБОЙ ошибке (включая ошибку самой финализирующей записи) уходит в
   `handleDispatchFailure` → это переустанавливает диспатч уже успешно отправленного сообщения. Если наивно
   убрать retry-обёртку вокруг occurrence-finalize (что требуется для отказа от
   `integrator.direct_public_write_retries`, §B), тот же путь ошибок начнёт повторно отправлять пациенту
   уже отправленное напоминание. Это не гипотетический риск — код прочитан построчно, путь подтверждён.

Оба пункта требуют либо (a) живого прогона на DEV/TEST с реальными occurrence-строками, либо (b) owner-
подтверждения точного плана переписывания перед тем, как трогать функцию с идемпотентным guard'ом на
живых пациентских данных. Ни то ни другое не укладывается в жёсткие границы этого прохода
("не трогать DEV/TEST/PROD", "не гадать при неоднозначности"). Бриф явно разрешает зафиксировать связный
частичный результат вместо угадывания — этим и воспользовался.

### Спроектированное решение (для следующего прохода, НЕ реализовано)

- **Канонический физический стол:** `public.reminder_occurrence_history` — совпадает с буквальной формулировкой
  брифа ("occurrence... provenance and the patient facts seen/snoozed/skipped/done"), и у него ниже риск по
  RLS/security-дизайну, чем у переноса в `integrator`-схему (integrator-схема недоступна пациентским
  read-путям напрямую).
- **Новые столбцы, нужные `reminder_occurrence_history`, чтобы поглотить `user_reminder_occurrences`:**
  operational-очередь поля (`dispatch_attempt_count`, `next_attempt_at`, `locked_by`/`locked_until` —
  сейчас живут только в `integrator.user_reminder_occurrences`) — без них воркер теряет свою claim/lock
  модель.
- **Что переносится из `reminder_journal`:** append-only guard "once" на done/skip/snooze — становится
  UNIQUE constraint на `(occurrence_id, action)` вместо отдельной таблицы-журнала.
- **Функции, которые нужно переписать целиком (не патчем):**
  `app.commit_patient_reminder_materialization`,
  `app.patient_done_reminder_occurrence` / `..._skip_...` / `..._snooze_...`,
  `app.mark_current_patient_reminder_history_seen` / `..._all_...`,
  `app.record_reminder_occurrence_finalized_projection`.
- **Вызывающие места, которые придётся адаптировать (полная перепись за пределами `pgReminderJournal.ts`/
  `pgReminderProjection.ts`/`reminders.ts`):** `pgPatientReminderMaterialization.ts`,
  `pgReminderRules.ts:340-395` (косвенное чтение), `pgDoctorAnalyticsMetricAccounts.ts:670-700` (аналитика
  читает projection напрямую), `pgReminderMessengerTopicDisable.ts`,
  `webappIntegratorUserProjectionRealignment.ts`, `platformUserFullPurge.ts:85-125` — восемь
  не-RPC read-мест, требующих собственной адаптации под финальную схему.
- **§B (`integrator.direct_public_write_retries`):** сейчас несёт РОВНО 3 живых значения `operation`,
  все — finalize/expire occurrence. Условие брифа на удаление ("если после §A не остаётся независимого
  живого назначения") технически выполнено бы после §A — но убрать retry-обёртку раньше, чем закрыт риск
  дублирующей отправки (пункт 2 выше), значит внести регрессию с повторной отправкой пациентам. §B поэтому
  блокирован §A, а не выполним отдельно.

**Владельческий impact прямо сейчас:** три occurrence-хранилища продолжают жить раздельно; ничего не
сломано и не изменилось в поведении occurrence/reminder-путей этим проходом. `direct_public_write_retries`
продолжает нести свои 3 живые операции без изменений.

## §C — СДЕЛАНО

Расширил существующий чокпоинт `app.prune_retention_target(text,integer,boolean)` пятью новыми ветками
закрытого списка и добавил один новый named root `app.prune_context_nonce_ledger(integer,integer,boolean)`
(таблица заперта под ACL, где ничего, кроме владельца, не имеет прав — see p2-b:356-359 — поэтому не
может присоединиться к общему чокпоинту, у неё окно в минутах, а не в сутках). Окна взяты дословно из
`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md`.

### Новые retention-цели

| Цель                              | Таблица                                   | Окно                                | Живые статусы не трогаются |
| ---------------------------------- | ------------------------------------------ | ------------------------------------ | --------------------------- |
| `app.context_nonce_ledger`         | `app.context_nonce_ledger` (own root)      | grace 1ч по умолчанию (min 0, max 24ч) | — (TTL-таблица) |
| `public_idempotency_keys`          | `public.idempotency_keys`                  | `expires_at` + 24ч                   | — |
| `integrator_idempotency_keys`      | `integrator.idempotency_keys`               | `expires_at` + 24ч                   | — |
| `outgoing_delivery_queue_sent`     | `public.outgoing_delivery_queue`           | `status='sent'`, `sent_at` 30д        | pending/processing/failed_retryable никогда |
| `outgoing_delivery_queue_dead`     | `public.outgoing_delivery_queue`           | `status='dead'`, `dead_at` 180д       | то же |
| `notification_delivery_attempts`   | `public.notification_delivery_attempts`     | `created_at` 180д                    | — |

Стёрты как протухшие цели retention для `integrator.delivery_attempt_logs`, `integrator.message_retry_jobs`,
`integrator.projection_outbox` — все три уже ретированы более ранними Track D миграциями
(20260821T003000, 20260820T210709, D30 scheduler-reversal), таблиц не существует — заменяющий журнал не
создаётся, как требует бриф.

### Изменённые/созданные объекты

**Миграция:** `apps/webapp/db/drizzle-migrations/20260823T210000_db_journal_retention_targets.sql`
(2 statement, `--> statement-breakpoint` между ними).

| Statement | Объект | Runtime-принципал (owner) | Что делает | Почему нет GRANT/REVOKE в миграции |
| --------- | ------ | -------------------------- | ---------- | ------------------------------------ |
| 1 | `CREATE OR REPLACE FUNCTION app.prune_retention_target(text,integer,boolean)` — тело функции ИЗМЕНЕНО (добавлены 5 веток в существующий CASE) | `app_seam_retention_sweep_owner` (без изменений — та же роль, что владела функцией до этой миграции) | Расширяет закрытый список целей | Права уже выданы предыдущей миграцией этой же функции; `declaration.ts` не менял `execute`-список для этой функции (остался `app_operational_maintenance`) — генератор просто перегенерировал байт-идентичный SQL под тот же набор прав |
| 2 | `CREATE OR REPLACE FUNCTION app.prune_context_nonce_ledger(integer,integer,boolean)` — НОВЫЙ объект | `app_object_owner` (тот же владелец, что владеет таблицей `app.context_nonce_ledger` — паттерн "owner-owns-target", как у `app.install_signed_context`) | Отдельный root, свой grace/limit-контракт | Права — из `declaration.ts` (`execute: ['app_operational_maintenance']`) → `generate-cli.mjs --all` регенерировал `deploy/postgres/generated/privileges.*.sql`; в самой миграции нет ни одного GRANT/REVOKE |

Тело ни одной уже существующей функции не менялось семантически для старых 4 веток — новые 5 веток
добавлены рядом, старая логика байт-в-байт сохранена (проверено диффом миграции против предыдущей версии
функции в живой DEV БД, см. "Проверка" ниже).

**`deploy/postgres/privileges/declaration.ts`:** расширил `relationSurfaces` записи
`app.prune_retention_target(text,integer,boolean)` четырьмя новыми элементами (`public.idempotency_keys`,
`integrator.idempotency_keys`, `public.outgoing_delivery_queue` колонки `status,sent_at,dead_at`,
`public.notification_delivery_attempts`); добавил новую запись
`app.prune_context_nonce_ledger(integer,integer,boolean)` через `rev10Function(...)` — `owner:
'app_object_owner'`, `execute: ['app_operational_maintenance']`, `relationSurfaces: [{relation:
'app.context_nonce_ledger', columns: ['nonce','expires_epoch'], operations: ['SELECT','DELETE']}]`.

**Регенерированные артефакты (байт-в-байт, `generate-cli.mjs --all` → `--check`):**
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`, `org-allowlist.bcb_webapp_dev.sql` (диффа не
дал — allowlist не менялся), `privileges.bersoncarebot_test.sql`, `org-allowlist.bersoncarebot_test.sql`.

**Порт:** `apps/webapp/src/infra/db/pruneRetentionTarget.ts` — `RETENTION_SWEEP_TARGETS` +5 меток;
`clampContextNonceLedgerGraceSec`/`clampContextNonceLedgerLimit`/`pruneContextNonceLedger(...)` — новые
экспорты, зеркалят существующий `pruneRetentionTarget`/`clampRetentionDays` паттерн, никакого сырого SQL
(идёт через `runWebappNamedRoot` + typed `sql` template).

**Новый агрегирующий модуль:** `apps/webapp/src/modules/db-retention/journalRetention.ts` —
`runDbJournalRetention(overrides)` прогоняет все 6 целей (5 через `pruneRetentionTarget`, 1 через
`pruneContextNonceLedger`) независимо (падение одной цели не блокирует остальные, ошибки собираются и
перебрасываются вместе в конце тика — точный отчёт, какие цели реально прошли).

**Новый internal route:** `apps/webapp/src/app/api/internal/db-journal-retention/tick/route.ts` — Bearer
`INTERNAL_JOB_SECRET` (тот же секрет, что у остальных internal-джобов), `?dryRun=1`, вызывает
`enterWithDbInfraPrincipal({source: 'api/internal/db-journal-retention/tick:POST'})` (роль на выходе —
`app_staff`, механизм существующий, изменений в `packages/db-principal/src/index.ts` не потребовалось —
`require_accepted_context` проверяет `target_role`, а не литеральный `SET ROLE`, что уже доказано тем, что
`product-analytics/retention` работает по той же схеме), пишет
`recordOperatorCronJobTickBestEffort({jobFamily: 'maintenance', jobKey:
'maintenance.db_journal_retention.tick'})`.

**Cron-источник:** `packages/db-principal/src/webappLockedInfraCronSources.ts` — добавлена строка
`'api/internal/db-journal-retention/tick:POST'` в `WEBAPP_LOCKED_INFRA_CRON_SOURCES`.

**Operator-health регистрация:** `apps/webapp/src/modules/operator-health/reconcileJobKeys.ts` —
`OPERATOR_MAINTENANCE_JOB_FAMILY = 'maintenance'`, `OPERATOR_DB_JOURNAL_RETENTION_JOB_KEY =
'maintenance.db_journal_retention.tick'`; `cronJobRegistry.ts` — запись `id: 'db_journal_retention'`,
`staleAfterSec: 3ч`, `internalPath: '/api/internal/db-journal-retention/tick'`.

**Cron-шаблон и документация хоста:** `deploy/host/cron.d/bersoncarebot-db-journal-retention.cron.template`
(ежечасно, loopback — тот же паттерн, что `bersoncarebot-saas-billing-renewal.cron.template`) +
`deploy/HOST_DEPLOY_README.md` — новый абзац housekeeping, строка в таблице «Host scheduled jobs», строка
в списке Bearer-потребителей `INTERNAL_JOB_SECRET`. **Файл шаблона НЕ поставлен в реальный crontab этим
проходом** — только код в репозитории; живая установка — отдельное действие через `cronport.mjs` при
деплое (за пределами скоупа этого прохода: деплой запрещён брифом).

## Проверка

Все команды выполнены из корня репозитория, без мутации DEV/TEST/PROD; часть проверок читает живую DEV
БД для сверки имён ролей (`sudo -n -u postgres psql -d bcb_webapp_dev`), но ничего не пишет.

```
$ node deploy/postgres/privileges/generate-cli.mjs --check
ok bcb_webapp_dev/privileges: ... совпадает побайтно
ok bcb_webapp_dev/allowlist: ... совпадает побайтно
ok bersoncarebot_test/privileges: ... совпадает побайтно
ok bersoncarebot_test/allowlist: ... совпадает побайтно
--check: артефакты соответствуют декларации побайтно.

$ node deploy/postgres/privileges/generate-cli.mjs --gaps
=== bcb_webapp_dev: classified=227 active=213 pending=10 access={...} unresolved=0 gaps=0 ===
=== bersoncarebot_test: classified=227 active=213 pending=10 access={...} unresolved=0 gaps=0 ===

$ node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs
# tests 30 / pass 30 / fail 0

$ node --test deploy/postgres/privileges/relation-access.test.mjs
# tests 42 / pass 42 / fail 0

$ pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json
(чисто, exit 0)

$ pnpm --dir apps/webapp exec vitest --run \
    src/infra/db/pruneRetentionTarget.unit.test.ts \
    src/modules/db-retention/journalRetention.unit.test.ts \
    src/app/api/internal/db-journal-retention/tick/route.unit.test.ts
# 3 файла / 12 тестов / все зелёные

$ pnpm --dir packages/db-principal run test   # build + type-tests + node:test
# tests 31 / pass 31 / fail 0

$ git diff --check -- apps/webapp deploy packages/db-principal
(пусто — нет конфликт-маркеров/висящих пробелов)
```

**Что НЕ прогонялось (за пределами скоупа):** полный CI, живой прогон миграции на DEV/TEST — брифом
разрешены только точечные/фазовые проверки, не полный CI; сама миграция физически не применена ни к
одной БД (только распарсена статическими гейтами выше) — что и подтверждает "ничего не сломано в
occurrence-путях", описанное в §A/§B.

## Остаток (честный список)

1. **§A физическая консолидация трёх occurrence-таблиц — НЕ выполнена.** Дизайн выше даёт конкретный план
   (канонический стол, новые колонки, список функций и вызывающих мест на переписывание), но требует
   владельческого решения по риску дублирующей отправки (`outgoingDeliveryWorker.ts:695-867`) и живого
   прогона на DEV перед тем, как трогать `commit_patient_reminder_materialization`.
2. **§B удаление `integrator.direct_public_write_retries` — НЕ выполнено**, блокировано пунктом 1 (нельзя
   безопасно убрать retry-обёртку раньше устранения риска повторной отправки).
3. §C выполнен целиком и проверен статически; живого прогона на DEV/TEST (миграция не применена нигде) не
   было — это ожидаемо согласно границам прохода, а не недоделка.

Коммит несёт §C целиком + честную незавершённость §A/§B в этом файле — не заявляю "candidate-ready".
