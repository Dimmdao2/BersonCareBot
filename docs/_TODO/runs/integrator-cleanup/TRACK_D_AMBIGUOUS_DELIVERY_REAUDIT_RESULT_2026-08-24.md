# Track D #987 — точечный повторный аудит неоднозначной доставки (`dispatching`)

**Роль:** независимый focused auditor новой очередной поверхности `dispatching`.
**Проверяемый fix:** `9829bfced` `fix(track-d): prevent ambiguous delivery replay #987`.
**Дерево прогона:** `wt/track-d-final-cutover-20260823` @ `d3044ac9d`.
`git diff --name-only 9829bfced HEAD | grep -v '^docs/'` → **пусто**: код, миграция и тесты в дереве
побайтно равны fix-коммиту, сверху только docs.
**Предмет:** закрытие `D987-F1` и регрессии, вызванные новым состоянием `dispatching`. Слепой аудит всего
Track D не повторялся; переиспользованы kill-set и acceptance-тест из
`TRACK_D_FINAL_CUTOVER_INDEPENDENT_AUDIT_2026-08-24.md` (§10 strong reuse).

## ВЕРДИКТ: **FAIL**

`D987-F1` закрыт — доказано и тестом под инъекцией, и живым rollback-only прогоном на именованной DEV.
Но новый барьер `dispatching` внесён в воркер шире, чем в БД: **один достижимый корень доставки по-прежнему
принимает только `processing`**, и после fix явный отказ провайдера у `appointment_reminder` перестал
приводить к ретраю и подменяется классом «неоднозначный исход».

| ID | Пункт | Итог | Evidence |
|---|---|---|---|
| Ч1 | все провайдерские ветки ставят `dispatching` перед вызовом | PASS | инспекция, 5/5 веток |
| Ч2 | `D987-F1` закрыт | PASS | acceptance-тест + инъекция A + живой прогон C1–C5 |
| Ч3 | нормальные пути не сломаны | **FAIL** | **D987-F2** (ниже), живой прогон L1/L2 |
| Ч4 | миграция и guard'ы репозитория | PASS | живой прогон C1–C9, grep прав, rollback-only preflight |
| Ч5 | ретенция/health на новой границе | PASS | живой прогон C10 + тело `app.prune_retention_target` |
| Ч6 | покрытие переиспользованного acceptance-теста | **FAIL** | **D987-F3**, инъекции B и C |

---

## D987-F2 (регрессия fix `9829bfced`) — FAIL

**Что.** `app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)` — единственный путь ретрая и
переключения канала для `appointment_reminder` — во всех четырёх своих guard'ах требует `status = 'processing'`.
Воркер после fix зовёт его, когда строка уже переведена в `dispatching`.

**Достижимый сценарий** (`apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`):

1. `:1014` `await queueMarkDispatching(db, row.id)` → `processing` → `dispatching`.
2. `:1016` `dispatchOutgoing(intent)` бросает обычную ошибку провайдера (5xx, таймаут) либо
   `recipient_blocked_bot`.
3. `:1022-1029` ветка `appointment_reminder` признаёт ошибку retryable/blocked.
4. `:1030` `advanceAppointmentReminderMessengerLadder(...)`. Корень
   (`deploy/postgres/generated/prod-to-target/schema-pre.sql:405-412`):

   ```sql
   SELECT * INTO delivery FROM public.outgoing_delivery_queue AS candidate
    WHERE candidate.id = p_queue_id
      AND candidate.kind = 'appointment_reminder'
      AND candidate.status = 'processing'          -- ← строка сейчас 'dispatching'
      AND candidate.attempt_count = p_expected_attempt_count
    FOR UPDATE;
   IF NOT FOUND THEN RETURN 'not_transitioned'; END IF;
   ```

   → `not_transitioned`.
5. `:1035-1041` воркер пишет `logger.info(... 'appointment_reminder_retry_transition_skipped_after_concurrent_terminalization')`
   и **`return`** — `handleDispatchFailure` (`:1044`) не достигается.
6. Строка остаётся в `dispatching`. `resetStaleOutgoingDeliveryProcessing` по таймауту
   дед-леттерит её как `failure_class = 'provider_outcome_unknown'`, `last_error = 'PROVIDER_OUTCOME_UNKNOWN'`.

**Impact (конкретный).**
- Лестница мессенджеров (`messengerLadder`: telegram → max) **никогда не переключается**: пациент не получает
  напоминание о приёме по резервному каналу. `payload_json->>'messengerStepIndex'` остаётся `0`.
- Явного отказа провайдера ретрая больше нет вообще: ни `failed_retryable`, ни `next_retry_at`.
- Реальный текст ошибки провайдера **стирается** и заменяется на `PROVIDER_OUTCOME_UNKNOWN`.
- Строка получает класс, который по замыслу владельца **запрещает** повторную отправку, — то есть напоминание
  теряется окончательно, а оператор в health-экране видит «неизвестный исход провайдера» там, где провайдер
  явно и однозначно отказал.
- До `9829bfced` строка в этот момент была `processing`, guard совпадал, лестница работала. Это регрессия
  ровно этого fix, а не старый дефект.

**Нарушенный authority.** Требование этого аудита №3 — «explicit provider errors from `dispatching` still
create real failure evidence and move to retry/dead according to the existing policy». Не выполняется.
Дополнительно нарушена модель владельца «attempt rows record only real failed provider attempts»: реальный
отказ провайдера не порождает ни attempt-строки, ни retry, а маскируется под неоднозначный исход.

**Продюсер живой, путь не мёртвый:** `apps/webapp/src/modules/booking-notifications/appointmentReminderMaterialization.ts:80,111`
ставит `kind: 'appointment_reminder'` с лестницей.

**Живое доказательство** (именованная DEV `bcb_webapp_dev`, всё в одной транзакции с `ROLLBACK`,
`/tmp/d987_ladder_probe.sql`): применён кандидатский `ALTER TABLE … CHECK`, вставлены две одинаковые
`appointment_reminder`-строки с валидной лестницей, различающиеся только статусом, и выполнен **дословный
lookup из тела самого корня**:

```
=== L1: the ladder root lookup, verbatim from its own body ===
      probe_row_status       | ladder_finds_row
-----------------------------+------------------
 audit-d987-appt-dispatching |                0     ← IF NOT FOUND → 'not_transitioned'
 audit-d987-appt-processing  |                1

=== L2: after the ladder returns not_transitioned, stale reclaim classifies the row ===
          event_id           |   status   | channel  | ladder_step |      failure_class       |        last_error
-----------------------------+------------+----------+-------------+--------------------------+--------------------------
 audit-d987-appt-dispatching | dead       | telegram | 0           | provider_outcome_unknown | PROVIDER_OUTCOME_UNKNOWN
 audit-d987-appt-processing  | processing | telegram | 0           |                          |
=== ROLLED BACK ===
```

**Почему нет красного acceptance-теста.** Гарантия здесь чисто БД-уровневая: расхождение guard'а
SECURITY DEFINER-корня и статуса строки. Fake-DB тест воркера её не видит по построению — это доказано
инъекциями B и C ниже (см. D987-F3), поэтому такой тест был бы тавтологией и ложной защитой. По брифу
(«otherwise provide exact inspection/runtime evidence») дефект зафиксирован живым прогоном выше. Продуктовый
код аудитором не менялся.

**Наименьшая граница исправления (не работа аудитора, решение ведущего).** Либо принимать `dispatching` в
guard'ах корня, либо не переводить `appointment_reminder` в `dispatching` до вызова лестницы. Второе
переоткрывает `D987-F1` для этого kind — то есть содержательно граница одна: guard корня.

---

## D987-F3 (repo-rule §10b, ложная защита переиспользованного acceptance-теста) — FAIL

**Что.** `outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts` в редакции fix-коммита заявляет
(строки 189-196) проверку восстановления и повторного захвата:

```ts
expect(await resetStaleOutgoingDeliveryProcessing(h.db, 1, 3)).toEqual({ reclaimed: 0, deadLettered: 1 });
const nextTick = await claimDueOutgoingDeliveries(h.db, 10);
```

но fake-DB харнесс (`:139-152`) распознаёт эти запросы по подстроке и **сам реализует их семантику**:
`if (queueStatus === 'dispatching') { queueStatus = 'dead'; return [{status:'dead'}] }`. Оракул совпал с
проверяемой реализацией — assert'ы про dead-letter и про недоступность строки обычному claimant'у не могут
покраснеть ни при какой правке SQL. Прямой запрет §10b: «тест не воспроизводит алгоритм … нашей реализации,
чтобы изготовить себе oracle»; «оракул независим от проверяемой реализации».

**Impact.** Регрессия, возвращающая двойную отправку, проходит весь набор незамеченной. Доказано инъекцией:

- **Инъекция B** — в `resetStaleOutgoingDeliveryProcessing` убран член `stale.stale_status = 'dispatching'`
  из `status = CASE …`, то есть зависшая `dispatching`-строка снова возвращается в `pending` и уходит на
  повторную отправку. Результат: `Test Files 28 passed | Tests 138 passed` — **ноль красных**.
- **Инъекция C** — `claimDueOutgoingDeliveries` расширен до `status IN ('pending','failed_retryable','dispatching')`,
  то есть обычный claimant снова забирает неоднозначную строку. Результат: `138 passed` — **ноль красных**.

Обе инъекции откачены; `git status --porcelain` пуст, md5 обоих файлов совпадает с исходными.

**Что тест действительно ловит (инъекция A).** Восстановлена пред-fix форма ветки `reminder_dispatch`:
снят `queueMarkDispatching` и отказ `queueMarkSent` возвращён в `handleDispatchFailure`. Результат —
**3 из 3 красные**, названные поломки:

| названная поломка | покрасневшее утверждение |
|---|---|
| барьер перед провайдером не поставлен | `expect(h.queueStatus()).toBe('dispatching')` (`:187`) |
| ложная запись отказа провайдера при успешной отправке | `expect(h.attemptLog.filter(e => e.status === 'failed')).toEqual([])` (`:208`) |
| успешно доставленная строка возвращена на провайдерский путь | `expect(h.queueRetryable).toEqual([])` (`:217`) |

Итого: переиспользованный acceptance-тест закрывает **3 названные поломки из 5** заявленных им же.
Оставшиеся две (dead-letter с `provider_outcome_unknown`; недоступность `dispatching` обычному claimant'у)
не покрыты ни одним тестом репозитория — `resetStaleOutgoingDeliveryProcessing` упоминается ровно в одном
тестовом файле, этом самом. В настоящем аудите они доказаны живым прогоном (C3, C4, C5 ниже), а не тестом.

---

## Результаты по пунктам брифа

### Ч1 — барьер перед каждым достижимым вызовом провайдера: PASS

`apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`, все пять веток, каждая — после
локальной подготовки, которая может упасть безопасно (её отказ уходит в внешний `catch` тика →
`finalizeClaimedRowFailure` (`:163-180`) → `queueReschedule`/`queueMarkDead` из `processing`, без вызова
провайдера и без attempt-строки):

| ветка | `queueMarkDispatching` | подготовка перед барьером |
|---|---|---|
| `operator_alert` | `:665` | разбор `incidentId`, `operatorIncidentAlertAlreadySent` |
| `INBOUND_REPLY_QUEUE_KIND` | `:694` | разбор intent |
| `reminder_dispatch` | `:826` | revalidate materialization (`:741`), email rate-limit (`:761`), best-effort удаление устаревшего сообщения |
| `DOCTOR_BROADCAST_INTENT_QUEUE_KIND` | `:940` | `enrichDoctorBroadcastIntentIfNeeded` вынесен из `try` наверх (`:930-938`) |
| generic transport (`specialist_task_reminder`, `appointment_reminder`, `operator_health_digest`, `auth_email_otp`, `outbound_message`) | `:1014` | per-kind revalidate materialization (`:993`, `:1006`) |

Хвост функции — `queueMarkDead('UNKNOWN_KIND:…')` (`:1081`), провайдера не зовёт. Параллельного
доставочного пути нет: `claimDueMessageRetryJobs`/`rescheduleMessageRetryJob` (`repos/jobQueue.ts:119-172`)
живых вызывающих не имеют (`grep claimDueJobs` → только объявление порта и адаптер), это retained-диагностика.

**Осознанное исключение, не находка.** Два `dispatchOutgoing({type:'message.delete'})` (`:783`, `:803`)
остаются под `processing`. Это best-effort удаление ранее отправленного сообщения, обёрнутое в собственный
`try/catch` с `logger.warn`; смерть воркера здесь приводит к reclaim и повторному удалению (безвредно), но
не ко второй *отправке* уведомления — сам send всё равно происходит ровно один раз ниже. Постановка
`dispatching` перед ними, наоборот, дед-леттерила бы напоминание, которое ещё вообще не отправлялось.
Граница владельца — at-most-once после передачи уведомления провайдеру — соблюдена.

### Ч2 — `D987-F1` закрыт: PASS

```
pnpm --dir apps/integrator exec vitest --run \
  src/infra/runtime/worker/outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts \
  src/infra/runtime/worker/outgoingDeliveryWorker.duplicateSendPrevention.d987.test.ts
→ Test Files 2 passed | Tests 7 passed
```

Провайдер вызван один раз; failed-attempt не записан; retry не поставлен; строка осталась `dispatching`;
инъекция A красит 3/3 (таблица выше). Оставшиеся два звена цепочки доказаны живьём (C3–C5).

### Ч3 — нормальные пути: **FAIL** (D987-F2)

- **Зависшие `processing` по-прежнему реклеймятся и ретраятся** — PASS, живой прогон C4/C5:
  `audit-d987-processing-stale` → `pending`, `failure_class` пуст, `dead_at` пуст, `reclaim_count = 1`;
  следующий дословный claim его забирает (`reclaimed_processing_retried = 1`).
- **Явные ошибки провайдера из `dispatching` → retry/dead** — PASS для всех kind, кроме
  `appointment_reminder`. `handleDispatchFailure` (`:590-626`) не читает статус строки:
  `recordDeliveryFailureAttempt` (`:526-553`) пишет attempt из in-memory `row` через writePort, а
  `queueReschedule`/`queueMarkDead` принимают `dispatching` (живой прогон C7/C8). Для
  `appointment_reminder` — **FAIL, D987-F2**.
- **Успешная отправка по-прежнему становится `sent`** — PASS, живой прогон C6 + 71 зелёный тест
  (`vitest --run src/infra/runtime/worker/ src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts
  src/infra/db/repos/outgoingDeliveryReclaimSettings.test.ts` → 14 files / 71 tests passed).

### Ч4 — миграция и guard'ы репозитория: PASS

`apps/webapp/db/drizzle-migrations/20260823T220000_consolidate_reminder_occurrence_stores.sql:1445-1453`.

- **CHECK допускает `dispatching`** — живой прогон C1/C2; после дословного кандидатского `ALTER TABLE`
  `pg_get_constraintdef` печатает все шесть статусов, вставка `dispatching`-строк проходит.
- **Переходы принимают верные пред-финальные состояния** — живой прогон C6/C7/C8: из `dispatching` строка
  становится `sent`, `failed_retryable`, `dead` соответственно (`markOutgoingDeliverySent` `:326`,
  `rescheduleOutgoingDeliveryRetry` `:458`, `markOutgoingDeliveryDead` `:439` — все
  `status IN ('processing','dispatching')`).
- **Обычный claimant не может забрать `dispatching`** — живой прогон C3: дословный
  `claimDueOutgoingDeliveries` до всякого восстановления захватил 108 строк, из них
  `claimed_dispatching = 0`, `claimed_processing = 0`.
- **Барьер ставится только из `processing`** — живой прогон C9: `audit-d987-processing-boundary` →
  `dispatching`, `audit-d987-pending-boundary` остался `pending` (`markOutgoingDeliveryDispatching` `:227`).
- **Миграция не выдаёт и не отзывает прав**:
  `grep -in "GRANT\|REVOKE\|CREATE ROLE\|ALTER ROLE\|DEFAULT PRIVILEGES\|CREATE POLICY\|ALTER POLICY\|DROP POLICY"`
  по всему файлу → **0 совпадений**. Маркер владельца сохранён: `-- BCB-MIGRATION-OWNER: app_object_owner`
  (`:1446`), и он совпадает с фактическим владельцем таблицы на DEV
  (`pg_tables.tableowner = app_object_owner`), то есть `ALTER TABLE` идёт от роли, реально владеющей объектом.
- **Канонический rollback-only preflight на именованной DEV — PASS** (вход из worktree по
  `migrate-dev.sh:213-221`, `--preflight` недоступен без `.env`):

  ```
  node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
    --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations \
    --sudo-postgres --rollback-only
  → Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev":
    pending=6 total=63 reapplied=0 foreign-ledger-rows=11 relabeled=0 dropped-foreign=0
    dropped-foreign-by-hash=0 unapplied=0
  ```

  Новый statement разобран парсером owner-маркеров и исполнен под настоящей ролью без единого 42501.
  `pending` осталось 6 — fix дописал существующий файл миграции, новой миграции не появилось.
- **Новых сущностей нет.** `git diff --name-only 50794b541 HEAD | grep -v '^docs/'` → ровно 5 файлов:
  `outgoingDeliveryQueue.ts`, `outgoingDeliveryWorker.ts`, acceptance-тест, файл миграции,
  `function-census.test.mjs`. Ни новой таблицы, ни журнала результатов, ни второго воркера, ни
  параллельного пути доставки; в схеме добавлено одно значение статуса, в коде — одна функция
  `markOutgoingDeliveryDispatching` (`:220-229`). Дизайн владельца «одна строка очереди = одна доставка»
  сохранён. `declaration.ts`/`relation-access.ts`/generated-артефакты не тронуты, поэтому
  доказательство отсутствия дрейфа из прошлого аудита остаётся валидным (§10 strong reuse).
- **Красный гейт прошлого аудита закрыт:** `node --test deploy/postgres/privileges/*.test.mjs`
  → `# pass 162 # fail 0 # skipped 120` (было 161/1/120).

### Ч5 — ретенция и health: PASS

- `app.prune_retention_target(text,integer,boolean)` (`20260823T210000_db_journal_retention_targets.sql:174,198`)
  подметает очередь только по `status = 'sent' AND sent_at < cutoff` и `status = 'dead' AND dead_at < cutoff`.
  Живая работа (`pending`, `processing`, `dispatching`, `failed_retryable`) в предикаты не попадает —
  живой прогон C10: `live_rows = 3` не учтены ни в `sent_target`, ни в `dead_target`.
- Неоднозначная строка становится **обычной хранимой `dead`-строкой**: `resetStale…` выставляет ей
  `dead_at = now()` (`repos/outgoingDeliveryQueue.ts:189-192`), поэтому она попадает под ту же
  `outgoing_delivery_queue_dead`-ретенцию, что и любой другой dead, и не растёт вечно.
- Оператору она видна: `app.read_operator_delivery_queue_health()` считает `is_operator_dead` как
  `status = 'dead' AND failure_class <> 'recipient_blocked_bot'`, то есть
  `provider_outcome_unknown` попадает в `deadTotal`/`deadRecent`/`deadByKind`.

### Ч6 — покрытие переиспользованного acceptance-теста: **FAIL** (D987-F3, выше)

---

## Рекомендации и owner questions (работой автоматически НЕ становятся, §24.6)

1. **In-flight `dispatching` невидим на health-экране.** `app.read_operator_delivery_queue_health()` считает
   `is_processing` строго как `status = 'processing'`, поэтому строка в полёте не входит ни в
   `processingCount`, ни в `dueCount`, ни в `deadTotal` — до момента дед-леттера. Требования владельца на
   этот счёт нет, терминальное состояние оператору видно; поэтому рекомендация, не находка.
2. **`replace_appointment_reminder_generation` / `replace_specialist_task_reminder_generation`** гасят старую
   генерацию по `status IN ('pending','failed_retryable','processing')` и `dispatching` не трогают. Это
   согласуется с границей at-most-once (сообщение уже у провайдера) и не является регрессией fix: `processing`
   в их `ON CONFLICT … WHERE queue.status IN ('pending','failed_retryable')` и раньше не проходил.
   Называю, чтобы при исправлении D987-F2 решение по guard'ам принималось разом.
3. **Тот же класс, что D987-F1, остаётся у не-обёрнутых пост-`sent` записей doctor broadcast**
   (`:974-976`: `maybeClearMessengerBotBlockedMarker`, `incrementBroadcastAuditCounter` без своего
   `try/catch`). Второй отправки это не даёт — строка уже `sent`, а `finalizeClaimedRowFailure` пишет только
   под `status IN ('processing','dispatching')`, — но `sent_count` рассылки в этом случае не инкрементится.
   Вне объёма fix.

## НЕ СДЕЛАНО

- Продуктовый код не менялся, D987-F2 не исправлялся (§24.6: аудитор fix не делает).
- Красный acceptance-тест на D987-F2 не оставлен намеренно — обоснование в разделе D987-F2; вместо него
  живое runtime-доказательство L1/L2.
- D987-F3 (ложная защита теста) не исправлялся — это правка того же переиспользуемого теста, её делает
  выбранный по §24.1 исполнитель.
- Full CI не гонялся (запрещён брифом). TEST/PROD не трогались, реальных отправок не было, одноразовых баз
  не создавалось, исторический replay миграций не выполнялся.
- Ветка branding и конфликт вокруг `read_integrator_clinic_delivery_credential` не рассматривались (вне брифа).

## Точные команды и результаты

```
git diff --name-only 9829bfced HEAD | grep -v '^docs/'                       # пусто
git diff --name-only 50794b541 HEAD | grep -v '^docs/'                       # 5 файлов
pnpm --dir apps/integrator exec vitest --run \
  src/infra/runtime/worker/outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts \
  src/infra/runtime/worker/outgoingDeliveryWorker.duplicateSendPrevention.d987.test.ts   # 7 passed
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/ \
  src/infra/db/repos/outgoingDeliveryQueue.namedRoot.unit.test.ts \
  src/infra/db/repos/outgoingDeliveryReclaimSettings.test.ts                 # 14 files / 71 passed
#  ↑ инъекция A (пред-fix форма reminder_dispatch)                            # 3 failed / 3
#  ↑ инъекция B (stale dispatching → pending)   — весь набор                  # 28 files / 138 passed (не ловит)
#  ↑ инъекция C (claim берёт dispatching)       — весь набор                  # 28 files / 138 passed (не ловит)
git status --porcelain                                                       # пусто (инъекции откачены)
pnpm --dir apps/integrator exec tsc --noEmit                                 # exit 0
node --test deploy/postgres/privileges/*.test.mjs                            # 162 pass / 0 fail / 120 skip
grep -in "GRANT\|REVOKE\|CREATE ROLE\|ALTER ROLE\|DEFAULT PRIVILEGES\|CREATE POLICY\|ALTER POLICY\|DROP POLICY" \
  apps/webapp/db/drizzle-migrations/20260823T220000_consolidate_reminder_occurrence_stores.sql   # 0
node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
  --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations \
  --sudo-postgres --rollback-only                                            # PASS, pending=6, ROLLBACK
sudo -n -u postgres psql -X -d bcb_webapp_dev -f /tmp/d987_reaudit_probe.sql # C1–C10, ROLLBACK
sudo -n -u postgres psql -X -d bcb_webapp_dev -f /tmp/d987_ladder_probe.sql  # L1–L2,  ROLLBACK
```

**Состояние именованной DEV после аудита — исходное:** `CHECK` снова с пятью статусами, проб
(`event_id LIKE 'audit-d987-%'`) — 0, распределение статусов `dead 87 / pending 107 / sent 134` совпадает
с замером до прогона. Обе SQL-проверки выполнялись одной транзакцией с `ROLLBACK` (§10b), базы не
создавались, TEST и PROD не затрагивались.
