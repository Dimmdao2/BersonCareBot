# Track D final duplicate-store cutover — независимый аудит кандидата `50794b541` (#987)

**Роль:** `auditor-live`, независимый бинарный pre-landing гейт.
**Кандидат:** `50794b541` `refactor(track-d): consolidate reminder occurrence storage #987`
**База сравнения:** `50794b541^` = `91dad426e`.
**Дерево прогона:** `wt/track-d-final-cutover-20260823` @ `b4f404277`.
`git diff --name-only 50794b541 HEAD | grep -v '^docs/'` → пусто, то есть весь код, миграции и
generated-артефакты в дереве прогона побайтно равны кандидату; сверху только docs-коммиты.

## ВЕРДИКТ: **FAIL** — одна достижимая находка (D987-F1)

Всё остальное из kill-set закрыто: либо зелёным тестом, покрасневшим под названной инъекцией, либо
разовой инспекцией итогового состояния, либо живым rollback-only прогоном на именованной DEV.

---

## 1. Слепой kill-set (составлен ДО чтения тестов кандидата)

K1 provider принял → более поздняя occurrence/bookkeeping-запись падает → следующий тик шлёт ВТОРОЙ раз ·
K2 вторая эквивалентная occurrence/result-таблица физически жива · K3 успех пишется во второй эквивалентный
журнал · K4 не-провайдерский отказ инкрементит attempts и ставит retry · K5 реальный отказ провайдера НЕ
пишет attempt/retry · K6 разрушительный DROP до/без parity-гейта или гейт на `RAISE NOTICE` · K7 перенос
данных под FORCE RLS мимо санкционированного backfill-пути → 0 строк, гейт проходит на пустом множестве ·
K8 `GRANT/REVOKE/CREATE ROLE/ALTER ROLE/ALTER DEFAULT PRIVILEGES/CREATE POLICY` внутри миграции ·
K9 REHOME-маркер не точная `regprocedure` → может перевесить чужую перегрузку; не транзакционен ·
K10 расхождение declaration ↔ generated ↔ function-census ↔ relation-access · K11 рантайм 42501: узкой
роли не хватает права на финальной таблице/функции · K12 возвращена широкая membership-роль ·
K13 старый retry writer/worker и два старых стора живы в ИТОГОВОМ состоянии · K14 новый scheduler-сервис /
retry-стор / дубль-журнал / зеркало identity · K15 внешние мессенджер-идентификаторы уехали из
contact/channel bindings · K16 ретенция подметает pending/processing/retryable, либо живая терминальная
цель без авторетенции · K17 pre-session phone lookup потерял accepted-context гейт · K18 планирование и
доставка разъехались по разным процессам · K19 нет индекса на новой горячей колонке / нет уникального
дедуп-индекса · K20 `DROP … CASCADE`.

Классификация (§24.4): **разовое состояние** — K2, K6–K10, K12–K15, K17, K19, K20 (инспекция итогового
состояния, живой rollback-прогон, introspection БД). **Повторяемое поведение** — K1, K3, K4, K5, K11, K16,
K18 (поведенческие тесты + fault injection).

---

## 2. Находка D987-F1 (единственная) — FAIL

**Что:** отказ записи `queueMarkSent` ПОСЛЕ того, как провайдер принял сообщение, отправляет доставку
обратно на провайдерский путь. Пациент получает напоминание **дважды**.

**Достижимый сценарий** (`apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:844-869`):

1. `dispatchOutgoing(intent)` — Telegram/MAX/email/web-push **принял**, сообщение уже у пациента.
2. `queueMarkSent(db, row.id, …)` — обычная запись в БД, стоит ВНУТРИ того же `try`. Падает на разрыве
   соединения, deadlock, statement timeout или 42501.
3. `catch` → `handleDispatchFailure(...)` (`:585-620`):
   - `recordDeliveryFailureAttempt(...)` пишет `delivery.attempt.log` со `status:'failed'` — **ложная
     запись отказа провайдера для успешной отправки**;
   - `isOutgoingDeliveryDispatchErrorRetryable(safe)` (`apps/integrator/src/infra/delivery/deliveryContract.ts:123`)
     возвращает `true` для любого текста, кроме восьми зашитых конфигурационных кодов, — текст ошибки БД
     под них не подходит, значит «retryable»;
   - `queueReschedule(...)` → строка в `failed_retryable`.
4. Следующий тик: `claimDueOutgoingDeliveries` берёт `status IN ('pending','failed_retryable')`
   (`repos/outgoingDeliveryQueue.ts:233`). Occurrence всё ещё `queued` (её `markSent` не выполнялся), а
   `app.revalidate_patient_reminder_delivery_materialization` принимает
   `occurrence.status IN ('queued','sent')` (миграция `20260823T220000…`, строка 1053) — ничего не
   останавливает.
5. `dispatchOutgoing(intent)` **второй раз** → второе реальное сообщение пациенту.

**Нарушенный authority (дословно, оракул владельца этого аудита):** «Real provider failure records an
attempt and retry time. Provider success marks delivery sent. **A later bookkeeping failure must not cause
a second provider send.**» `queueMarkSent` — запись, выполняемая строго ПОСЛЕ приёма провайдером, то есть
ровно «later bookkeeping». Дополнительно нарушен пункт «actual provider failures **alone** increment
attempts and schedule retries»: инкрементится attempt и пишется `status:'failed'` там, где провайдер не
отказывал.

**Доказательство (красный acceptance-тест, оставлен в дереве как handoff по §24.5/§24.6):**
`apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts`

```
pnpm --dir apps/integrator exec vitest --run \
  src/infra/runtime/worker/outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts
→ Tests 3 failed (3)
  AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
  AssertionError: expected [ { status: 'failed', reason: 'connection terminated unexpectedly' } ] to deeply equal []
  AssertionError: expected [ 'queue-telegram-f1' ] to deeply equal []
```

**Комментарий кандидата, который это оправдывает, неточен.** В коде написано, что `queueMarkSent`
«stays inside the provider try/catch, mirroring the already-established `specialist_task_reminder` pattern
below». Зеркалирование подтверждено — у `specialist_task_reminder`/`appointment_reminder`
(`:983-985`) та же конструкция, — но это описание существующего дефекта, а не его обоснование: оракул
запрещает второй вызов провайдера независимо от того, сколько мест его допускают.

**Наименьшая граница исправления.** Не трогать `dispatchOutgoing` и не менять модель очереди. Достаточно
вынести `queueMarkSent` за пределы provider-`catch` для `reminder_dispatch`: при его отказе строка не
должна попадать в `handleDispatchFailure`. Так как `resetStaleOutgoingDeliveryProcessing` возвращает
зависшие `processing`-строки в работу, «просто не ловить» недостаточно — нужен терминальный признак
доставки, который переживёт отказ (например, пометка occurrence `sent` до `queueMarkSent` плюс
существующий repair-цикл `listPendingSpecialistTaskReminderOutcomes`, либо ужесточение
`revalidate_patient_reminder_delivery_materialization` до `occurrence.status = 'queued'`, чтобы
уже-`sent` occurrence не ревалидировалась). Выбор — за ведущим; аудитор продуктовый fix не делает.
**Это НЕ регрессия кандидата:** до `50794b541` в том же `try` стояли все три пост-приёмочные записи, то
есть дыра была шире. Кандидат закрыл два случая из трёх.

---

## 3. Требуемые проверки — результаты

### Проверка 1 — миграция fail-closed

`apps/webapp/db/drizzle-migrations/20260823T220000_consolidate_reminder_occurrence_stores.sql`, 1444 строки.

- **Parity/identity/uniqueness гейт стоит ДО разрушительных шагов.** Гейт — блок `DO $$` на строках 85–135,
  все пять проверок бросают `RAISE EXCEPTION … USING ERRCODE='23514'` (не `NOTICE`): равенство
  operational↔history, отсутствие дублей `occurrence_key`, отсутствие `NULL` в `planned_at`,
  `organization_id`, `platform_user_id`. Разрушительные шаги — строки 1418–1444. Весь файл идёт одной
  транзакцией раннера (`BEGIN; … COMMIT;`, `migrate-local.mjs:464-536`), поэтому провал гейта откатывает
  всё. **K6 закрыт.**
- **Дропы без CASCADE.** `grep -in "CASCADE" <файл>` даёт единственное совпадение — слово CASCADE в
  комментарии-обосновании (строка 1428). `DROP FUNCTION` ×2, `DROP TABLE integrator.user_reminder_occurrences`,
  `DROP TABLE public.reminder_journal`, `DROP TABLE IF EXISTS integrator.direct_public_write_retries` — все
  RESTRICT по умолчанию. **K20 закрыт.**
- **Перенос данных под FORCE RLS — санкционированным путём.** Все четыре шага переноса и сам гейт помечены
  `-- BCB-MIGRATION-BACKFILL`; раннер исполняет их через `RESET ROLE; RESET SESSION AUTHORIZATION;`
  (`migrate-local.mjs:490-497`), то есть от локального администратора, как требует AGENTS.md §1. Перенос не
  «прошёл на нуле строк»: живой прогон (проверка 2) выполнил его на реальных 2602/2467/9 строках DEV и
  гейт пропустил. **K7 закрыт.**
- **Миграция не выдаёт и не отзывает прав.**
  `grep -in "GRANT\|REVOKE\|CREATE ROLE\|ALTER ROLE\|DEFAULT PRIVILEGES\|CREATE POLICY\|ALTER POLICY\|DROP POLICY"`
  по файлу → **0 совпадений**. **K8 закрыт.**
- **`BCB-MIGRATION-VERIFY` probe есть** (строка 2), имя файла в формате `YYYYMMDDTHHMMSS_slug.sql`.
- **Индексы на горячих колонках в том же файле** (строки 148–152): `reminder_occurrence_history_occurrence_key_key`
  UNIQUE (ключ дедупа), `idx_…_status_planned_at`, `idx_…_platform_status_planned` — равенство перед
  диапазоном, как требует §1. **K19 закрыт.**
- **Владельцы/возможности каждого изменённого тела** — из декларации, доказано живым прогоном (ниже):
  `app_object_owner` для DDL таблицы, `app_seam_reminder_materialization_owner`,
  `app_seam_reminder_patient_owner`, `app_seam_delivery_scope_owner`, `app_seam_patient_self_actions_owner`
  для соответствующих швов; `postgres` в owner-маркерах отсутствует.

### Проверка 2 — канонический rollback-only preflight на именованной DEV

Канонический вход `bash deploy/host/migrate-dev.sh --preflight` из этого worktree **невозможен**:
`assert_canonical_file` (строки 157–158) требует `$REPO_ROOT/.env` и `$REPO_ROOT/apps/webapp/.env.dev`,
которых в worktree нет (они не в git). Копировать реальные креды в worktree запрещено (AGENTS.md §1b/§5).
По правилу §1 «Если существующий entrypoint не умеет безопасно взять candidate source, используется
bounded candidate-preflight path» выполнен тот же owner-aware раннер напрямую — он и есть тело
`--preflight` (`migrate-dev.sh:213-221`), отличается только отсутствием env-плумбинга и
`seed_relation_wall_registry` (эта миграция новых таблиц не создаёт, посев ей не нужен):

```
node deploy/postgres/privileges/migrate-local.mjs \
  --db bcb_webapp_dev --migrator bcb_dev_migrator \
  --drizzle-folder apps/webapp/db/drizzle-migrations \
  --sudo-postgres --rollback-only
```

**Результат: PASS.**
`Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=6 total=63
reapplied=0 foreign-ledger-rows=11 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0`

Это исполнило все 6 pending-миграций (включая кандидатскую) под настоящими statement-owner ролями, с
`SET LOCAL ROLE`, FORCE RLS и реальными данными, и завершилось `ROLLBACK`. Ни одного отказа прав.

**Состояние DEV до и после — идентично** (`sudo -n -u postgres psql -X -d bcb_webapp_dev`):

| факт | до | после |
|---|---|---|
| `drizzle.__drizzle_migrations` содержит `20260823T220000_consolidate_reminder_occurrence_stores` | 0 | 0 |
| `integrator.user_reminder_occurrences` строк | 2602 | 2602 |
| `public.reminder_occurrence_history` строк | 2467 | 2467 |
| `public.reminder_journal` строк | 9 | 9 |
| колонка `reminder_occurrence_history.occurrence_key` | нет | нет |
| членства роли `bcb_dev_migrator` | 0 | 0 |
| владелец `app.email_auth_find_email_challenge_for_confirm(uuid,uuid)` | `postgres` | `postgres` |

База не создавалась, миграция не применялась, TEST и PROD не затрагивались, стойких данных и смен
владельца не осталось. Заодно это подтверждает перепись кандидата (2602/2467/9) точными числами.

### Проверка 3 — предотвращение двойной отправки

- **Названный класс «provider accepted, later occurrence/bookkeeping write fails» — ПОЙМАН.**
  Зелёный тест кандидата
  `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.duplicateSendPrevention.d987.test.ts`
  (4 теста) прогнан на кандидате — зелёный.
  **Fault injection** (один раз на независимый класс, §24.5): в
  `outgoingDeliveryWorker.ts` восстановлен пред-cutover порядок — `markSent` и
  `maybeClearMessengerBotBlockedMarker` возвращены ВНУТРЬ provider-`try`, `queueMarkSent` — после них.
  Результат: **3 из 4 тестов покраснели**, точное упавшее утверждение —
  `expect(h.queueSent).toEqual(['queue-telegram-2'])` →
  `AssertionError: expected [] to deeply equal [ 'queue-telegram-2' ]`
  (файл теста, строки 158/171/185). Инъекция полностью откачена: `git checkout --` + побайтное сравнение
  с копией до инъекции. **K1 в части occurrence/bot-marker закрыт.**
- **Случай «падает сама отметка очереди sent» — НЕ закрыт → D987-F1** (раздел 2). Проверено, что дизайн
  действительно шлёт дважды, и что authority этого запрещает.

### Проверка 4 — attempts/retry только на реальных отказах провайдера

- **Положительная сторона — выполняется.** `handleDispatchFailure` (и только он) пишет attempt и ставит
  retry; вызывается из `catch` вокруг `dispatchOutgoing` и из ветки провала `web_push` outcome
  (`:801-810`). До-провайдерные отказы attempt НЕ пишут: `stale_materialization` (`:723`), `rate_limited`
  (`:738`), `web_push_skipped` (`:818`) уходят в `queueMarkDead(..., REMINDER_NOT_DISPATCHED_FAILURE_CLASS)`.
  Пост-приёмочные отказы occurrence-финализации и bot-marker после кандидата тоже attempt не пишут —
  только `logger.warn` (`:869-895`). **K5 закрыт, K4 в этой части закрыт.**
- **Отрицательная сторона нарушена ровно один раз** — отказ `queueMarkSent`, см. D987-F1.
- **Успех не пишется во второй эквивалентный журнал.** `writePort.ts` `reminders.occurrence.markSent`
  после кандидата — один `markReminderOccurrenceSent(db, …)`, один атомарный UPDATE по одной строке
  `public.reminder_occurrence_history`. Удалены `writeDirectPublic('reminder-occurrence-finalize')`,
  `recordReminderOccurrenceFinalizedDirect`, `getReminderOccurrenceContextForProjection`-ветка и
  `queueDirectPublicRetry`. Оба прежних 1:1-журнала (`public.reminder_delivery_events`,
  `integrator.user_reminder_delivery_logs`) дропнуты соседней миграцией
  `20260823T170000_retire_duplicate_reminder_delivery_journals.sql` (строки 522, 526); живых писателей в
  `apps/integrator/src` не осталось (только комментарии). **K2, K3 закрыты.**

### Проверка 5 — удаление старого retry writer/worker и двух старых сторов (инспекция итога, не текстовые тесты)

Итоговое состояние дерева: `apps/integrator/src/infra/db/repos/directPublicWriteRetry.ts`,
`apps/integrator/src/infra/runtime/worker/directPublicWriteRetryWorker.ts`,
`apps/integrator/src/infra/db/directPublic/writeReminderProjectionDirect.ts`,
`apps/integrator/src/infra/db/repos/projectionKeys.ts` — **отсутствуют**. Ссылок в исполняемом коде нет
(остались только комментарии и pre-cutover snapshot `deploy/postgres/generated/prod-to-target/schema-pre.sql`,
поверх которого forward-миграции и накатываются — это корректный вход A→B, а не живой стор).

Итоговое состояние схемы (после миграции, доказано живым прогоном): `integrator.user_reminder_occurrences`,
`public.reminder_journal`, `integrator.direct_public_write_retries` дропнуты; в декларации, relation-access
и function-census их больше нет; `retired-db-security-oracles.test.mjs:44` держит отсутствие
`integrator.direct_public_write_retries` на уровне декларации. Резидентный процесс потерял тик
`runDirectPublicWriteRetryTick` целиком (`scheduler/main.ts`, `schedulerLockedTick.ts` — чистое удаление,
новых сервисов не добавлено). **K13, K14 закрыты.**

### Проверка 6 — rehome-маркер

Маркер один на всё дерево:
`20260823T190000_email_auth_find_email_challenge_for_confirm_forward_repair.sql:4` →
`-- BCB-MIGRATION-REHOME-FUNCTION: app.email_auth_find_email_challenge_for_confirm(uuid,uuid)`.

- **Точность.** Парсер (`migrate-local-parse.mjs:31-45`) требует
  `^ident\.ident\([A-Za-z0-9_[\],. ]*\)$` — точка с запятой, кавычки и произвольный SQL отвергаются
  (`… has an unsafe function rehome identity`), плюс он требует, чтобы в том же блоке реально стоял
  `CREATE OR REPLACE FUNCTION <то же имя>(` — иначе `… rehomes X but does not replace that function`.
  Раннер резолвит идентичность через `pg_catalog.to_regprocedure(<литерал>)`, то есть по ТОЧНОЙ сигнатуре:
  другую перегрузку он взять не может. Тесты парсера на обе диверсии — `migrate-local-parse.test.mjs:76,84`.
- **Транзакционность и rollback-safety.** Блок `DO $bcb_rehome$` вставляется между `BEGIN;` и
  `SET LOCAL SESSION AUTHORIZATION` (`migrate-local.mjs:475-484`), то есть до выполнения тела и внутри той
  же транзакции. Живой rollback-only прогон это подтвердил делом: после `ROLLBACK` владелец функции на DEV
  остался `postgres` (см. таблицу выше).
- **Оверлей больше не держит второго тела.** `deploy/postgres/organization-member-invites-rls.sql` содержит
  для этой сигнатуры только `DROP FUNCTION IF EXISTS` (строка 41) и GRANT/REVOKE (1108, 1130);
  `CREATE [OR REPLACE] FUNCTION app.email_auth_find_email_challenge_for_confirm` в файле **нет ни одного**.
  **K9 закрыт.**

### Проверка 7 — generated privileges vs declaration и достаточность рантайма

- **Артефакт == декларация, побайтно.** Оба генератора перезапущены поверх коммита:
  `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev` и
  `--db bersoncarebot_test`; `git status --porcelain` после них **пуст** — дрейфа нет. **K10 закрыт**
  (кроме отдельного пункта по function-census ниже).
- **Узкая роль достаточна, широкая не возвращена.** Живые integrator-пути после cutover и их права на
  `public.reminder_occurrence_history` для `app_integrator_tenant_service`/`app_integrator_request`:
  `markReminderOccurrenceSent` (UPDATE status, sent_at, delivery_channel, occurred_at, updated_at) ✔;
  `markReminderOccurrenceFailed` (+failed_at, error_code) ✔; `expireOrphanedPendingReminderOccurrences`
  (SELECT organization_id/status/planned_at/integrator_occurrence_id, UPDATE status/failed_at/error_code/
  occurred_at/updated_at) ✔; `resolveReminderOccurrenceOrganizationId` ✔;
  `getReminderOccurrenceContextForProjection` ✔; `getReminderOccurrenceOwnerUserId` ✔;
  `rescheduleReminderOccurrencePlanned` (UPDATE planned_at/status/queued_at/sent_at/failed_at/
  delivery_channel/delivery_job_id/error_code/updated_at + RETURNING integrator_occurrence_id) ✔ —
  `delivery_generation` он НЕ пишет, поэтому отсутствие этой колонки в UPDATE-гранте не мешает;
  `markReminderOccurrenceSkippedLocal` ✔; `cancelPendingReminderOccurrencesForRule` (DELETE табличный) ✔;
  `getStaleReminderMessengerMessageIdForResend` ✔. INSERT интегратору не выдан и не нужен: строки рождаются
  только в SECURITY DEFINER корнях `app.upsert_patient_reminder_occurrence_plan` и
  `app.commit_patient_reminder_materialization`, которым INSERT выдан их владельцу
  `app_seam_reminder_materialization_owner`. Широкой membership-роли интегратору не возвращено; наоборот,
  `app_tenant_service` потеряла EXECUTE на удалённом `app.record_reminder_occurrence_finalized_projection`.
  **K11 (в достижимой части) и K12 закрыты.** Живой owner-aware прогон на DEV не дал ни одного 42501.

### Проверка 8 — авторетенция живых терминальных целей

Действующий chokepoint — `app.prune_retention_target(text,integer,boolean)`
(`20260823T210000_db_journal_retention_targets.sql`), закрытый список из 9 целей:
`media_hls_proxy_error_events`, `product_analytics_events_recent`, `product_analytics_user_hourly`,
`product_push_notifications`, `public_idempotency_keys`, `integrator_idempotency_keys`,
`outgoing_delivery_queue_sent`, `outgoing_delivery_queue_dead`, `notification_delivery_attempts`.

- **Живая работа не подметается:** очередь чистится только по `status = 'sent' AND sent_at < cutoff` и
  `status = 'dead' AND dead_at < cutoff`. `pending`, `processing` и `failed_retryable` в предикаты не
  попадают ни разу. **K16 в этой части закрыт.**
- **Дропнутые кандидатом таблицы в списке целей не значатся**, поэтому cutover ретенцию не ломает: ни
  `reminder_journal`, ни `user_reminder_occurrences`, ни `direct_public_write_retries` там нет.
- Документы рантайм и деплой не блокируют — требование выполнено, ничего документного в гейт не добавлено.

---

## 4. Второй красный гейт (не находка по §24.6, но блокирует landing)

`node --test deploy/postgres/privileges/*.test.mjs` → `# pass 161 # fail 1 # skipped 120`.

Падает `deploy/postgres/privileges/function-census.test.mjs:101`
«aggregated runtime surface findings separate invoker triggers from exact definer corrections»:

```
assert.deepEqual(surface('app.patient_cancel_pending_reminder_occurrences(text)', 'public.reminder_rules'), {
  columns: ['integrator_rule_id', 'organization_id', 'platform_user_id'], …
})
→ actual columns: ['integrator_rule_id', 'platform_user_id', 'organization_id']
```

Причина: кандидат переписал тело `app.patient_cancel_pending_reminder_occurrences(text)` и перегенерировал
`function-census.ts` (запись подтверждена `git log -L 5512,5535:deploy/postgres/privileges/function-census.ts`
→ последний коммит `50794b541`), а зашитое в тест ожидание порядка колонок не обновил. Набор колонок тот же,
порядок другой; на выдаваемые гранты это не влияет (генератор сортирует колонки), то есть дефекта прав тут
нет. Но бриф воркера прямо требовал зелёный `function-census` check, а §24.7 `land-ready` требует все
применимые targeted-гейты. **Наименьшее исправление:** привести ожидание в
`function-census.test.mjs:129-134` к фактическому порядку (или сравнивать множество, а не список).

---

## 5. Owner questions / рекомендации (работой автоматически НЕ становятся, §24.6)

1. **Ретенция объединённой occurrence-таблицы.** До cutover операционные срабатывания жили в
   `integrator.user_reminder_occurrences`, теперь они на одной строке с пациентской историей в
   `public.reminder_occurrence_history`. У этой таблицы авторетенции нет — и не было ни у одной из двух
   исходных. Это не регрессия кандидата, но теперь операционные терминальные записи растут вместе с
   историей, которую пациент видит в кабинете. Нужно ли окно хранения и какое — продуктовое решение
   владельца, а не инженерное.
2. **Мёртвый read-путь с недостающей колонкой.** `occurrenceSelectShape`
   (`apps/integrator/src/infra/db/repos/reminders.ts:74-91`) выбирает `created_at`, которого нет в
   SELECT-гранте ни `app_integrator_tenant_service`, ни `app_integrator_request`. Живого вызывающего у
   `reminders.occurrences.forRuleRange` нет (объявление есть в `ports.ts`/`schemas.ts`/`readPort.ts`,
   отправителей запроса — ноль), поэтому по §24.6 это не находка. Но если путь когда-нибудь оживят, он
   упадёт 42501. Дешевле убрать `created_at` из выборки либо тип запроса целиком.
3. **Тот же класс D987-F1 живёт и у `specialist_task_reminder`/`appointment_reminder`**
   (`outgoingDeliveryWorker.ts:983-985`). Вне объёма этого кандидата; называю, чтобы исправление D987-F1
   не пришлось делать дважды.

---

## 6. НЕ СДЕЛАНО

- Full CI не гонялся — запрещено брифом, его гоняет ведущий после landing.
- Продуктовый fix по D987-F1 не делался (аудитор fix не делает, §24.6). Оставлен красный acceptance-тест
  как handoff.
- Красный `function-census.test.mjs` не правился по той же причине.
- Живой end-to-end прогон доставки на DEV/TEST не выполнялся: брифом запрещены реальные отправки и
  мутации именованной DEV; поведение доказано поведенческими тестами + rollback-only прогоном схемы.

## 7. Точные команды прогона

```
git diff --name-only 50794b541 HEAD | grep -v '^docs/'                      # пусто
pnpm --dir apps/integrator exec vitest --run \
  src/infra/runtime/worker/outgoingDeliveryWorker.duplicateSendPrevention.d987.test.ts \
  src/infra/db/writePort.reminderOccurrenceHistory.test.ts \
  src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts               # 13 passed
# ↑ тот же файл под инъекцией пред-cutover порядка                            # 3 failed / 1 passed
pnpm --dir apps/integrator exec vitest --run \
  src/infra/runtime/worker/outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts  # 3 failed (D987-F1)
node --test deploy/postgres/privileges/*.test.mjs                            # 161 pass / 1 fail / 120 skip
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --db bersoncarebot_test
git status --porcelain                                                       # пусто → дрейфа нет
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
  --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations \
  --sudo-postgres --rollback-only                                            # PASS, pending=6, ROLLBACK
pnpm --dir apps/integrator exec tsc --noEmit                                 # exit 0
npx eslint apps/integrator/src/.../outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts  # exit 0
git diff --check                                                             # clean
```
