# 15. Схема `integrator`: должна ли каждая из 20 таблиц вообще существовать

**Рамка владельца (08.08):** «интегратор является модулем доставки, а не хранителем данных пользователей.
Если это мусор — сносить, иначе будет тянуться вечно.»

**Что это за документ.** Разбор ДО того, как тратить работу на стены. Часть 3 классификации
(`14-classification-part-1.md`, строки 62–75, 108–112, 145–153) пометила 8 таблиц `integrator` как
«люди + тексты сообщений без стен» и поставила их в очередь на обнесение стенами. Здесь проверено
таблица за таблицей, надо ли их вообще оставлять.

**Только чтение.** DDL/DML не выполнялся. Все замеры — `sudo -u postgres psql -d bersoncarebot_test -Atc`,
счётчики и агрегаты; строк с ПДн не читал. `bcb_webapp_prod` не трогал.

---

## Короткий вывод

| Вердикт | Сколько | Таблицы |
|---|---:|---|
| **СНОСИТЬ** | **5** | `telegram_users`, `content_access_grants`, `message_retry_jobs`, `user_reminder_rules`, `contacts` |
| **ПЕРЕНЕСТИ И СНЕСТИ** | **6** | `conversations`, `conversation_messages`, `user_questions`, `question_messages`, `identities`, `users` |
| **ОСТАВИТЬ** | **9** | `telegram_state` (урезав колонки), `message_drafts`, `delivery_attempt_logs`, `projection_outbox`, `idempotency_keys`, `user_reminder_occurrences`, `user_reminder_delivery_logs`, `integration_data_quality_incidents`, `schema_migrations` |
| ВОПРОС | 0 | — вопросы владельцу есть, но они про **порядок и сроки**, не про судьбу таблицы |

**Главный факт всего разбора: переносить нечего — данные УЖЕ целиком лежат в вебаппе.** Замерено
поштучно на `bersoncarebot_test`:

| Что | В `integrator` | Спроецировано в `public` | Доля |
|---|---:|---:|---:|
| `conversations` → `public.support_conversations` | 21 | 21 | **100 %** |
| `conversation_messages` → `public.support_conversation_messages` | 34 | 34 | **100 %** |
| `user_questions` → `public.support_questions` | 16 | 16 | **100 %** |
| `question_messages` → `public.support_question_messages` | 20 | 20 | **100 %** |
| `user_reminder_rules` → `public.reminder_rules` (`integrator_rule_id`) | 27 | 27 | **100 %** |
| `contacts.value_normalized` (тип `phone`) → `public.platform_users.phone_normalized` | 78 | 78 | **100 %** |
| `identities` → `public.user_channel_bindings` (по `external_id`) | 134 | 131 | 98 % |

То есть 6 из 8 «страшных» таблиц части 3 — **зеркала, а не источники**. Обносить их стенами
означало бы охранять копию.

**Три вещи, которые часть 3 назвала неверно и которые здесь опровергнуты замером:**

1. `integrator.idempotency_keys` — не «221 476 строк с телами ответов API». Реально **~225 живых строк**
   (замерено трижды подряд: 225/225/225), а 221 476 — протухшая оценка `pg_class.reltuples`. И
   `response_body` там **всегда `{}`**: 261 строка из 261 имеет `request_hash =
   '__integrator_incoming_event__'`, ноль строк с непустым телом. Тела ответов пишет ДРУГАЯ таблица —
   `public.idempotency_keys` (`apps/webapp/src/infra/idempotency/pgStore.ts`, неквалифицированное имя →
   `public`). ПДн в `integrator.idempotency_keys` нет вообще.
2. `integrator.contacts` — часть 3 пишет «нельзя связать чат с телефоном пациента, если снести». По факту
   **все 78 телефонов уже есть в `public.platform_users.phone_normalized`**, и ноль строк, где у
   `platform_users` телефона нет, а в `contacts` есть. Легаси-фолбэк не даёт НИЧЕГО.
3. `integrator.telegram_users` — часть 3 верно назвала мёртвой; это единственная таблица, где обе оценки сошлись.

---

## Сводка по всем 20

Колонка «свежесть» — `max(created_at)` (или эквивалент); «строк» — реальный `count(*)`, не `reltuples`.

| # | Таблица | Строк | Свежесть | Дублирует вебапп? | Живой потребитель сегодня | Вердикт |
|---:|---|---:|---|---|---|---|
| 1 | `telegram_users` | 2 | 2026-03-04 | да, целиком (`identities`+`telegram_state`, а те — `user_channel_bindings`+`platform_users`) | **нет** — только миграции | **СНОСИТЬ** |
| 2 | `content_access_grants` | **0** | — | нет аналога, но и данных нет | **нет** — писатель недостижим, читателя нет вообще | **СНОСИТЬ** |
| 3 | `message_retry_jobs` | 134 (10 `pending`) | 2026-07-31 | заменена `public.outgoing_delivery_queue` | только слив остатка (10 строк до 2026-08-29) | **СНОСИТЬ** |
| 4 | `user_reminder_rules` | 27 | 2026-07-18 | да — `public.reminder_rules`, 27/27 скопированы | **нет** в рантайме; только backfill-скрипты | **СНОСИТЬ** |
| 5 | `contacts` | 78 | 2026-07-20 | да — `public.platform_users.phone_normalized`, 78/78 | да, но только как фолбэк, который ничего не добавляет | **СНОСИТЬ** |
| 6 | `conversations` | 21 | 2026-07-18 | да — `public.support_conversations`, 21/21 | да (пишется на каждое сообщение поддержки) | **ПЕРЕНЕСТИ И СНЕСТИ** |
| 7 | `conversation_messages` | 34 | 2026-07-18 | да — `public.support_conversation_messages`, 34/34 | да | **ПЕРЕНЕСТИ И СНЕСТИ** |
| 8 | `user_questions` | 16 | 2026-07-09 | да — `public.support_questions`, 16/16 | пишется; читается только сам собой | **ПЕРЕНЕСТИ И СНЕСТИ** |
| 9 | `question_messages` | 20 | 2026-07-09 | да — `public.support_question_messages`, 20/20 | только пишется, **не читается ниоткуда** | **ПЕРЕНЕСТИ И СНЕСТИ** |
| 10 | `identities` | 134 | 2026-07-25 | да — `public.user_channel_bindings`, 131/134 | да, горячий путь каждого вебхука | **ПЕРЕНЕСТИ И СНЕСТИ** (D25) |
| 11 | `users` | 134 | 2026-07-25 | да — `public.platform_users.integrator_user_id` / `.merged_into_id` | да, горячий путь | **ПЕРЕНЕСТИ И СНЕСТИ** (D25) |
| 12 | `telegram_state` | 115 | 2026-07-25 | **частично**: имена — да; `state`/`last_update_id`/`last_start_at` — **нет аналога** | да, живое состояние диалога и входа | **ОСТАВИТЬ**, урезав 7 колонок |
| 13 | `message_drafts` | 17 | 2026-06-09 | нет аналога | пишется/читается на пути бота | **ОСТАВИТЬ** (транзитное состояние канала) |
| 14 | `delivery_attempt_logs` | 6 324 | **2026-08-05** | нет | да, каждая попытка отправки | **ОСТАВИТЬ** — это и есть учёт доставки |
| 15 | `projection_outbox` | 3 788 | **2026-08-03** | нет | да, воркер + `/health/projection` | **ОСТАВИТЬ** |
| 16 | `idempotency_keys` | **~225** | живая (TTL 900 с) | нет (`public.idempotency_keys` — отдельная) | да, дедуп каждого вебхука | **ОСТАВИТЬ** |
| 17 | `user_reminder_occurrences` | 2 787 | **2026-08-03** | нет (в `public` — только аналитический `reminder_occurrence_history`) | да: вебапп планирует, интегратор доставляет | **ОСТАВИТЬ** |
| 18 | `user_reminder_delivery_logs` | 1 735 | 2026-07-25 | нет | да, журнал доставки напоминаний | **ОСТАВИТЬ** |
| 19 | `integration_data_quality_incidents` | 3 | 2026-05-15 | нет | да, но холодный путь (срабатывает на кривой TZ) | **ОСТАВИТЬ** |
| 20 | `schema_migrations` | 79 | 2026-07-30 | нет (у вебаппа свой `public.webapp_schema_migrations`) | да, каждый деплой | **ОСТАВИТЬ** |

---

## Детально по каждой

### 1. `integrator.telegram_users` — **СНОСИТЬ**

1. **Что хранит.** `telegram_id`, `username`, `first_name`, `last_name`, **`phone`**, `state`, `notify_*`.
2. **Дублирует вебапп.** Целиком. Разложена в 2026-03 на `integrator.identities` + `integrator.telegram_state`
   (миграции `20260309_0011_backfill_identities_from_telegram_users.sql`,
   `…0012_backfill_identities_minimal.sql`), а те, в свою очередь, дублируют
   `public.user_channel_bindings` и `public.platform_users`.
3. **Живые потребители.** **Ноль.** Только (c) миграции
   `apps/integrator/src/integrations/telegram/db/migrations/20260306_0001…0010`, последняя из которых —
   `20260306_0010_detach_telegram_users_refs.sql` — сняла все FK. Символ `telegramUsers` в
   `apps/webapp/db/schema/schema.ts:3873` — артефакт drizzle-introspect **схемы `public`**, не импортируется
   ничем. Репозиторий сам это констатирует: `apps/integrator/src/infra/db/schema.md:41` — «сохраняется только
   как legacy/deprecated storage, активный runtime в неё не пишет».
4. **Свежесть.** 2 строки, новейшая **2026-03-04** — ровно дата разложения. `n_tup_ins=2`, `n_tup_del=0`.
5. **Что сломается.** Ничего. FK уже сняты, читателей нет.
6. **Безопасное удаление.** `pg_dump -t integrator.telegram_users` → `DROP TABLE`. FK-зависимых нет.
   Из кода удалить: `apps/webapp/db/schema/schema.ts:3873` (+ отсутствие ссылок в `relations.ts` уже проверено),
   `scripts/check-telegram-users.ts`. Миграции не трогать.

### 2. `integrator.content_access_grants` — **СНОСИТЬ**

1. **Что хранит.** Замысел: временные токены доступа к контенту — `content_id`, `purpose`, `token_hash`,
   `expires_at`, `revoked_at`.
2. **Дублирует вебапп.** Аналога нет — но и данных нет.
3. **Живые потребители.** Писатель есть, но **недостижим**: `repos/reminders.ts:522` ←
   `writePort.ts:1471` (`case 'content.access.grant.create'`) ← `adapters/protectedAccessPort.ts:47`
   `issueAccess()`. Grep по всему монорепо: `issueAccess(` встречается только в объявлении типа
   (`kernel/contracts/ports.ts:278`) и в самой реализации — **ни один обработчик её не вызывает**. Сверх того
   она заглушена отсутствием `CONTENT_SERVICE_BASE_URL`/`CONTENT_ACCESS_HMAC_SECRET`
   (`protectedAccessPort.ts:29-31`). **SELECT из таблицы нет нигде.** Единственное достижимое касание —
   `UPDATE … SET user_id` при слиянии (`mergeIntegratorUsers.ts:433`), т.е. переклейка пустоты.
4. **Свежесть.** `count(*) = 0`. `n_tup_ins = 0` за всю историю таблицы.
5. **Что сломается.** Ничего. Ноль строк, ноль читателей.
6. **Безопасное удаление.** Дамп не нужен (0 строк), но снять для протокола. FK-зависимых нет; сама она
   зависит от `integrator.users` и `public.be_organizations` — их не трогает. Из кода удалить:
   `repos/reminders.ts:522-534` (`createContentAccessGrant`), `writePort.ts:1457-1471`,
   `adapters/protectedAccessPort.ts` целиком, тип в `kernel/contracts/ports.ts:278`, регистрацию в
   `db/schema/integratorDomainRepos.ts:75` и `integratorDrizzleSchema.ts:11,30`, строку в
   `mergeIntegratorUsers.ts:433`, DI-проводку `app/di.ts:271,281`. Карта D20 уже помечает
   `adapters/protectedAccessPort.ts` как **УЕЗЖАЕТ** («продуктовое решение»,
   `D20_INTEGRATOR_MAP.md:296`) — здесь оно не уезжает, а просто удаляется, потому что не работало.
   Порядок: сначала код, потом `DROP TABLE`.

### 3. `integrator.message_retry_jobs` — **СНОСИТЬ** (после 2026-08-29)

1. **Что хранит.** Легаси-очередь досылки: **`phone_normalized`, `message_text`**, `next_try_at`,
   `attempts_done`, `last_error`, `payload_json`.
2. **Дублирует вебапп.** Заменена на `public.outgoing_delivery_queue` (812 строк, свежесть **2026-08-07** —
   свежее, чем эта таблица). Cutover-миграции: `apps/webapp/db/drizzle-migrations/0339_d30_appointment_reminder_queue_cutover_local.sql`,
   `0338_…`, `0328_…`, `0335_…`.
3. **Живые потребители.** Производитель **вырезан в коде**: `bookingLifecycleRoute.ts:336,343` —
   «legacy enqueue is intentionally disabled», вместо него `webappEventsPort.materializeAppointmentReminders`
   (`:360`). Регресс запрещён статическим гейтом
   `apps/integrator/src/infra/scripts/check-no-legacy-message-retry-producers.ts:34` (алломлист из 10 файлов).
   Остался **только слив**: `runtime/worker/main.ts:67-128` → `adapters/jobQueuePort.ts:152` →
   `repos/jobQueue.ts`. Env-флага у слива нет — он зашит.
4. **Свежесть.** 134 строки: `dead` 57, `done` 67, **`pending` 10** с `next_try_at` до **2026-08-29 16:59**.
   Новейший `created_at` = 2026-07-31.
5. **Что сломается.** Пока не отработали 10 `pending` — не доедут 10 запланированных отправок.
   После 2026-08-29 — ничего. Плюс один живой потребитель колонки вне слива:
   `apps/webapp/src/infra/platformUserFullPurge.ts:483` (`DELETE … WHERE regexp_replace(phone_normalized…)`)
   — GDPR-путь, его надо снять вместе с таблицей.
6. **Безопасное удаление.** Дамп → дождаться `count(*) FILTER (WHERE status='pending') = 0` (не раньше
   2026-08-29 17:00 MSK) → `DROP TABLE`. FK-зависимых нет. Из кода удалить: `repos/jobQueue.ts`,
   `adapters/jobQueuePort.ts`, ветку `jobQueueLoop` в `runtime/worker/main.ts:67-128`, `writePort.ts:259` и
   `case 'message.retry.enqueue'` (`:1651-1676`), `kernel/domain/executor/handlers/delivery.ts:321-352`,
   `kernel/domain/actions/index.ts:46-51,85`, схему `db/schema/integratorQueues.ts`, гейт
   `check-no-legacy-message-retry-producers.ts`, строку `platformUserFullPurge.ts:483`, гранты
   `deploy/postgres/c4-operational-runtime.sql:462,481` и
   `dev-c7-operational-delivery-worker-schema-table-grants.sql:59`, проверку готовности
   `infra/db/operationalPoolReadiness.ts:30`, тесты `jobQueue.abstime.integration.test.ts` и
   `check-d30-legacy-message-retry-drain-concurrency.ts`. **Это уже пункт плана — D30 Ш7,
   `D30_SCHEDULER_REVERSAL_PLAN.md:641`, стоит `[ ]`.**

### 4. `integrator.user_reminder_rules` — **СНОСИТЬ**

1. **Что хранит.** Правила напоминаний: `category`, `schedule_type`, `timezone`, `quiet_hours_*`,
   `deep_link`, `custom_text`.
2. **Дублирует вебапп.** Да, полностью: `public.reminder_rules` (46 строк, свежесть 2026-07-24), связь по
   `integrator_rule_id`. **Замер: все 27 легаси-строк присутствуют в `public.reminder_rules`** (27/27).
   Forward-copy — миграция `apps/webapp/db/drizzle-migrations/0323_reminder_rules_scheduler_canonical_forward_local.sql`.
3. **Живые потребители.** В рантайме — **ноль**. `repos/reminders.ts:14` импортирует символ `reminderRules`
   из `db/schema/integratorPublicProduct.ts:107`, а это `pgTable('reminder_rules')`, то есть
   **`public.reminder_rules`**; в самом файле комментарий `:104-106`: «Canonical reminder business rules
   owned by webapp». Остались (d) скрипты: `apps/webapp/scripts/backfill-reminders-domain.mjs:69,140,209`,
   `reconcile-reminders-domain.mjs:67`, `integrator-schema-cleanup/{01_audit,03_reconcile,05_drop_deprecated}.ts`.
   Репозиторий сам это фиксирует дословно — `apps/webapp/src/modules/reminders/reminders.md:5`:
   «`integrator.user_reminder_rules` не является runtime-источником и не получает новых записей.»
4. **Свежесть.** 27 строк, новейшая **2026-07-18**, `n_tup_ins = 27` (после копирования — ни одной вставки).
5. **Что сломается.** Ничего в рантайме. **Сломаются два места:**
   - `integrator.user_reminder_occurrences.rule_id` FK смотрит на `public.reminder_rules(integrator_rule_id)`
     — то есть **уже НЕ на эту таблицу**. Замер подтверждает: 2787/2787 occurrence-строк резолвятся в
     `public.reminder_rules`, и лишь 2743 — в легаси. FK-блока нет.
   - Миграция `apps/webapp/db/drizzle-migrations/0282_failed_reminder_occurrence_history.sql:12,54` делает
     `INNER JOIN integrator.user_reminder_rules`. Её надо переписать на `public.reminder_rules` ДО дропа.
6. **Безопасное удаление.** Дамп → переписать `0282_…sql` (или объект, который она создаёт) на
   `public.reminder_rules` → снять `05_drop_deprecated.ts:22` и backfill-скрипты → `DROP TABLE`.
   FK-зависимых на неё нет (`user_reminder_rules → users` и `→ be_organizations` — исходящие).
   Гранты снять: `deploy/postgres/p0-5b-grants.sql:75`, `scripts/deploy-saas-667.sh:485`.

### 5. `integrator.contacts` — **СНОСИТЬ**

1. **Что хранит.** `user_id`, `type`, **`value_normalized`** (нормализованный телефон E.164), `label`,
   `is_primary`, `organization_id`. Уникальный ключ `(type, value_normalized)`.
2. **Дублирует вебапп.** Да, `public.platform_users.phone_normalized`. **Замер: 78 из 78 телефонов
   из `integrator.contacts` присутствуют в `public.platform_users.phone_normalized`; строк, где у
   `platform_users` телефона нет, а здесь есть, — НОЛЬ.** То есть фолбэк на TEST не даёт ни одного
   уникального значения.
3. **Живые потребители.** Есть, но все — обслуживание того же фолбэка:
   - **Писатель ровно один:** `repos/channelUsers.ts:737` (`DELETE`) + `:749` (`INSERT … ON CONFLICT`)
     внутри `setUserPhone`. Вызывается из **одного** места — `writePort.ts:441`, внутри транзакции
     `user.phone.link`, **сразу ПОСЛЕ** канонической записи в `public.platform_users.phone_normalized`
     (`applyMessengerPhonePublicBind`). Сам `setUserPhone` ничего не нормализует — он получает уже
     готовый E.164.
   - Второй писатель — переклейка при слиянии: `mergeIntegratorUsers.ts:405,417`.
   - Третий — вебапп: `apps/webapp/src/infra/repos/pgMessengerPhoneHttpBind.ts:181,190` (роут
     `apps/webapp/src/app/api/integrator/messenger-phone/bind/route.ts:11`).
   - **Читатели (5):** `channelUsers.ts:509,600` (`legacy_contact_phone` LATERAL в `getLinkDataByIdentity`
     — на каждом входящем вебхуке, `app/routes.ts:53`); `channelUsers.ts:406,429` (`findByIdentityByPhone`,
     фолбэк резолва получателя, `kernel/domain/executor/helpers.ts:556`);
     `repos/messageThreads.ts:80,396,461,508`; `runtime/worker/doctorBroadcastIntentMenu.ts:65`;
     `repos/adminStats.ts:51` (счётчик `withPhone` для `/admin_users`).
   - **Переключатель:** `repos/linkedPhoneSource.ts:16` — `integrator_linked_phone_source ∈
     {public_then_contacts, public_only, contacts_only}`, читается из `public.system_settings`,
     **дефолт `public_then_contacts`** (`:57,64`). `resolveLinkedPhoneNormalized` (`:27-37`) возвращает
     `pub ?? leg`. Раз `pub` есть у 78/78 — ветка `leg` не срабатывает никогда.
4. **Свежесть.** 78 строк, новейшая 2026-07-20, `n_tup_del = 0`.
5. **Что сломается.** При `integrator_linked_phone_source = public_only` — **ничего**: замер показывает,
   что `public` покрывает 100 % случаев. При текущем дефолте — сломается только теоретический человек
   без `platform_users.phone_normalized`, а таких на TEST ноль. Проверка в прод-данных обязательна
   (тем же запросом), см. «ВОПРОСЫ».
6. **Безопасное удаление.** Порядок жёсткий:
   а) выполнить сверку на живой базе (`01_audit.ts:132-163` уже считает
   `contacts_public_missing_legacy_present` и `contacts_public_legacy_phone_mismatch`);
   б) переключить `integrator_linked_phone_source` → `public_only`;
   в) выждать окно и убедиться в нуле событий лога `linked_phone_legacy_fallback` (`channelUsers.ts:526`);
   г) дамп → удалить код: `setUserPhone` (`channelUsers.ts:724-764`), вызов `writePort.ts:441`,
   5 читателей выше, `repos/linkedPhoneSource.ts` целиком вместе с настройкой,
   `pgMessengerPhoneHttpBind.ts:181,190`, `mergeIntegratorUsers.ts:405,417`,
   `platformUserFullPurge.ts:418,453`, зеркало `apps/webapp/db/schema/schema.ts:3492`;
   д) `DROP TABLE`. FK-зависимых на `contacts` нет. Политику `saas_org_dormant_p0_8_5` на ней —
   **не писать заново**, снять вместе с таблицей.
   Гейт `05_drop_deprecated.ts:46-49` («blocked: linked-phone fallback still defaults to
   public_then_contacts») снимается шагом (б).

### 6–9. Кластер поддержки: `conversations`, `conversation_messages`, `user_questions`, `question_messages` — **ПЕРЕНЕСТИ И СНЕСТИ**

Разбираю вместе: они связаны FK в один узел и снимаются одним куском.

1. **Что хранят.**
   - `conversations`: `source`, `user_identity_id`, `admin_scope`, `status`, `opened_at`, `close_reason`.
   - `conversation_messages`: `sender_role`, **`text`**, `source`, `external_chat_id`, `external_message_id`.
   - `user_questions`: `user_identity_id`, `conversation_id`, **`text`**, `answered`, `answered_at`.
   - `question_messages`: `question_id`, `sender_type`, **`message_text`**.
2. **Дублирует вебапп.** Да, целиком и по строкам:

   | integrator | public | замер |
   |---|---|---|
   | `conversations` (21) | `support_conversations` (256) | **21/21** спроецированы |
   | `conversation_messages` (34) | `support_conversation_messages` (823) | **34/34** |
   | `user_questions` (16) | `support_questions` (26) | **16/16** |
   | `question_messages` (20) | `support_question_messages` (39) | **20/20** |

   Публичная сторона — **надмножество и свежее**: `support_conversation_messages` доходит до 2026-07-24,
   `integrator.conversation_messages` — только до 2026-07-18. Механизм двойной записи:
   `apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts` (D3) и
   `writeSupportQuestionsDirect.ts` (D4), вызываются из `writePort.ts` после локального коммита, с
   durable-фолбэком через `projection_outbox`. В самом файле стоит признание,
   `writeSupportConversationsDirect.ts:25-26`: *«INTEGRATOR-LOCAL STATE RETAINED, WRITTEN IN A SEPARATE TX.»*
   Локальная копия удержана **сознательно и временно**, а не потому что она источник.
3. **Живые потребители.** (a) продакшн, все в `repos/messageThreads.ts`:
   `INSERT conversations :229`, `UPDATE :308`, чтения `:390,:420,:454,:503`;
   `INSERT conversation_messages :269`, чтения `:380,:445,:515`;
   `INSERT user_questions :572`, `UPDATE … answered :621`, внутреннее чтение `organization_id :605`;
   `INSERT question_messages :601` — **и это ЕДИНСТВЕННАЯ ссылка на `question_messages` во всём монорепо;
   SELECT из неё нет нигде.** Точки входа — вебхуки `integrations/telegram/webhook.ts:365`,
   `integrations/max/webhook.ts:302,400` → `executeAction.ts:1439,1469,1481` /
   `handlers/supportRelay.ts:239,253`. Плюс (d) крон-скрипт
   `infra/scripts/auto-close-stale-conversations.ts` (`apps/integrator/package.json:23`).
   Ни `user_questions.answered`, ни `user_questions.text`, ни `question_messages.*` **не читаются ни одним
   продуктовым/UI-путём** — интерфейсы читают `public.support_*`.
4. **Свежесть.** Все четыре застыли: 2026-07-18 / 2026-07-18 / 2026-07-09 / 2026-07-09.
   Публичные копии живут дольше. Признак: локальная запись превратилась в побочный эффект.
5. **Что сломается.** Прямо сейчас — да, сломается: `supportRelay` читает открытое обращение через
   `readPort.ts:102` (`conversation.openByIdentity`), `messageThreads` подтягивает телефон и
   последний `external_chat_id` из локальных таблиц. Поэтому это **перенос кода**, а не только дроп.
   После перевода читателей на `public.support_*` — не сломается ничего: данные там уже все.
6. **Что должна сделать миграция.** **Строк переносить не надо — 100 % уже спроецировано.** Работа — про код:
   - перевести чтения `messageThreads.ts:380,390,420,445,454,503,515,605` и `readPort.ts:102` на
     `public.support_conversations` / `support_conversation_messages` / `support_questions`;
   - убрать локальные записи `messageThreads.ts:229,269,308,572,601,621`, оставив только прямые
     писатели `directPublic/writeSupport*Direct.ts`;
   - `mergeIntegratorConversationToPlatform.ts` (перевешивание локального треда в платформенный) —
     после этого не нужен вообще;
   - `auto-close-stale-conversations.ts` — по карте D20 (`D20_INTEGRATOR_MAP.md:434`) **УЕЗЖАЕТ** в вебапп (D23);
   - перед дропом ещё раз прогнать сверку 21/21, 34/34, 16/16, 20/20 на живой базе.
   - **Порядок дропа (FK):** `question_messages` → `user_questions` → `conversation_messages` →
     `conversations`. `message_drafts` и `telegram_state` цепляются к `identities`, а не сюда.
   - Снять политики `saas_org_dormant_*` вместе с таблицами — не переписывать.
   - **Это уже решено владельцем, Р-D23 (31.07):** «старое удаляем или переносим в новое. Тех-поддержку
     делаем так как надо, а не чтобы сохранить как было». Пункт D23 в `WORK_ORDER.md:953` помечен `[x]`
     как «старая ветка ответа администратора удалена» — но САМИ ТАБЛИЦЫ остались. Это остаток D23,
     который никто не закрыл.

### 10–11. `identities` и `users` — **ПЕРЕНЕСТИ И СНЕСТИ** (это и есть незакрытый D25)

1. **Что хранят.** `users`: `id`, `created_at`, `merged_into_user_id` — якорь пользователя интегратора.
   `identities`: `user_id`, `resource` (`telegram`/`max`), `external_id` — связка «человек ↔ внешний аккаунт».
2. **Дублирует вебапп.** Да.
   - `identities` → `public.user_channel_bindings (user_id uuid, channel_code, external_id)`
     (`apps/webapp/db/schema/schema.ts:484`). **Замер: 131 из 134 `identities` имеют совпадение по
     `external_id`** (131 строка в `user_channel_bindings`). Обе пишутся сегодня в одной транзакции.
   - `users` → `public.platform_users`, где `integrator_user_id bigint` (`schema.ts:119`) — тот же ключ,
     а `merged_into_id uuid` (`:132`) — та же цепочка слияний, что и `merged_into_user_id`.
3. **Живые потребители.** Горячий путь, каждый вебхук:
   - W `channelUsers.ts:266` (`INSERT INTO users`), `:278` (`INSERT INTO identities … ON CONFLICT`) —
     через `incomingEventPipeline.ts:135` `ensureResolvedActor` → `actorResolutionPort.ts:16` →
     `writePort.ts:190`;
   - R `channelUsers.ts:74` (`resolveActiveOrganizationIdForMessengerIdentity` — до маршрутизации,
     `app/routes.ts:71`), `:489,:580,:665,:694`; `canonicalUserId.ts:37,67`; `messageThreads.ts` (7 мест);
     `adminStats.ts:58`;
   - кросс-приложение: `apps/webapp/src/infra/repos/pgPatientTelegramUsernameMention.ts:7`,
     `packages/platform-merge/src/messengerBindAuditEnrichment.ts:25`;
   - M2M-роут слияния `integrations/bersoncare/userMergeM2mRoute.ts:128,154`.
4. **Свежесть.** По 134 строки, новейшие 2026-07-25 — то есть пишутся регулярно (это не мёртвый код).
5. **Что сломается.** Всё входящее в бота, если снести сегодня. Плюс — важное для стен: **пациентские ветки
   RLS-политик `conversations`, `message_drafts`, `user_questions`, `question_messages` построены на
   `EXISTS (… FROM integrator.identities …)`** (`14-classification-part-1.md:145`). Стена пациента
   на четырёх таблицах опирается на таблицу без стены. Это ещё один довод не обносить стенами, а сносить:
   если кластер поддержки уезжает в `public.support_*`, эти политики исчезают вместе с ним, и опора
   на `identities` перестаёт быть проблемой.
6. **Что должна сделать миграция.** Это **не миграция данных, а перенос порта**:
   - `resolveCanonicalIntegratorUserId` / `resolveCanonicalUserIdFromIdentityId` (`canonicalUserId.ts`) →
     `public.platform_users.merged_into_id` (порт `platformUserByChannel.ts:38`
     `resolveCanonicalPlatformUserIdByChannel` **уже существует и делает ровно это**);
   - `getLinkDataByIdentity`, `getIdentityIdByResourceAndExternalId`, `getChannelIdsByUserId`
     (`channelUsers.ts:489,665,694`) → `public.user_channel_bindings`;
   - `resolveActiveOrganizationIdForMessengerIdentity` (`channelUsers.ts:74`) → тот же источник;
   - `telegram_state.identity_id` перевесить на `user_channel_bindings.id` (см. §12);
   - `userMergeM2mRoute` — по Р-D26 вырезается целиком («вырезать эту хрень с интегратором»),
     `WORK_ORDER.md:216`.
   - **Порядок дропа (FK):** сначала уходит кластер поддержки (§6-9) и `contacts` (§5) и
     `content_access_grants` (§2) и `user_reminder_rules` (§4) — все они FK-зависимы от `users`/`identities`;
     затем `message_drafts` и `telegram_state` перевешиваются; только потом `identities`, затем `users`
     (у `users` ещё саморефлексивный FK `users_merged_into_user_id_fkey`).
   - **Решение владельца уже есть — Р-D25 (31.07):** «интегратору остаётся только доставка входа, а
     создание учётки, доверие к телефону и синхронизация личности — вебаппу». Пункт **D25 в
     `WORK_ORDER.md:971` стоит `[ ]`** — закрыт только D15b/2 (интегратор перестал писать
     идентичность в `public`), сами таблицы остались. Карта D20 согласна:
     `adapters/actorResolutionPort.ts` — «**УЕЗЖАЕТ** — D25 «создание учётки — вебаппу»» (`:295`),
     `repos/canonicalUserId.ts` — «**УЕЗЖАЕТ** (D25)» (`:384`), `repos/channelUsers.ts` — «**УЕЗЖАЕТ**
     (D25) в части identity» (`:383`).

### 12. `integrator.telegram_state` — **ОСТАВИТЬ**, урезав 7 колонок

1. **Что хранит.** `identity_id`, `username`, `first_name`, `last_name`, **`state`**, `notify_spb`,
   `notify_msk`, `notify_online`, `notify_bookings`, `last_update_id`, `last_start_at`, `is_active`.
2. **Дублирует вебапп — частично, и это ключ к вердикту.**
   - `username`/`first_name`/`last_name` → `public.platform_users.first_name/last_name/display_name`
     (`schema.ts:119-121`) — **дубликат ПДн**;
   - `notify_spb`/`notify_msk`/`notify_online`/`notify_bookings`/`is_active` → вытеснены
     `public.user_notification_topics` / `user_notification_topic_channels`. Grep по `apps/`, `packages/`:
     эти колонки читают **только** backfill-скрипты `apps/webapp/scripts/backfill-person-domain.mjs:126,152-155`
     и `reconcile-person-domain.mjs:68` — **ни одной ссылки в рантайме**;
   - **`state`, `last_update_id`, `last_start_at` — аналога в `public` НЕТ.** Замер значений `state`
     (форма, не ПДн): `idle` 84, `await_contact:subscription` 23, `await_phoneauth:auth_<token>` — по одной
     на активный вход. Это живое состояние диалога и незавершённого входа по коду. В `public` есть
     `channel_link_secrets`, `phone_messenger_bind_secrets`, `user_channel_bindings`,
     `user_channel_preferences`, `user_notification_topic_channels` — **таблицы состояния диалога среди них нет**.
3. **Живые потребители.** W `channelUsers.ts:293-309` (upsert имён на каждом вебхуке), `:180`
   (`tryConsumeStart`, дебаунс `/start`, проводка `app/di.ts:289`), `:226` (`tryAdvanceLastUpdateId`),
   `:340-347` (`setUserState` ← `writePort.ts:373` ← `kernel/orchestrator/resolver.ts:323,345,390,418`).
   R — 9 мест в `channelUsers.ts`/`messageThreads.ts` + вебапп `pgPatientTelegramUsernameMention.ts:9`.
4. **Свежесть.** 115 строк, новейшая 2026-07-25 — живая.
5. **Что сломается, если снести целиком.** Бот теряет шаг диалога: незавершённый вход по коду
   (`await_phoneauth:*`), запрос контакта, дебаунс повторного `/start`, защита от повторной обработки
   `last_update_id`. Это **настоящая ответственность модуля доставки**, её в вебапп переносить незачем.
6. **Что делать.** Оставить, но:
   - **удалить 7 колонок**: `username`, `first_name`, `last_name` (дубликат `platform_users`) и
     `notify_spb`, `notify_msk`, `notify_online`, `notify_bookings`, `is_active` (мёртвые; читаются
     только двумя backfill-скриптами, которые надо удалить вместе с ними). После этого таблица перестаёт
     быть носителем ПДн — и **вопрос «обносить ли её стенами» снимается сам**: останется
     `identity_id + state + last_update_id + last_start_at`, транспортное состояние без имён и телефонов.
   - при закрытии D25 (§10-11) перевесить `identity_id` на `public.user_channel_bindings.id`.
   - до этого — `telegram_state` держит FK на `integrator.identities`, значит дропать `identities`
     раньше нельзя.

### 13. `integrator.message_drafts` — **ОСТАВИТЬ**

1. **Что хранит.** `identity_id`, `source`, `external_chat_id`, `external_message_id`,
   **`draft_text_current`**, `state` — набранный, но не отправленный текст в диалоге бота.
2. **Дублирует вебапп.** **Нет аналога** в `public` (проверено: в `apps/webapp/db/schema` зеркало
   `messageDrafts` (`schema.ts:3549`) — артефакт introspect, запросов к нему ноль).
3. **Живые потребители.** (a) `repos/messageThreads.ts:74` (чтение, `readPort.ts:80`
   `draft.activeByIdentity`), `:135` (`INSERT … ON CONFLICT (identity_id, source)`), `:178` (`DELETE`) ←
   `writePort.ts:553,575` ← `executeAction.ts:1247,1261` (`draft.upsertFromMessage`) ← вебхуки.
4. **Свежесть.** 17 строк, новейшая **2026-06-09** — при живом support-relay до 2026-07. `n_dead_tup = 17`
   при `n_live_tup = 17`. Признак «пути мало ходят», но путь не мёртв (`DELETE` при отмене черновика есть).
5. **Что сломается.** Пациент теряет набранный текст при обрыве. Мелко, но это ровно транзитное состояние
   канала — то, что модулю доставки принадлежит по определению.
6. **Вердикт.** ОСТАВИТЬ. Судьба следует за D23: если владение поддержкой уезжает в вебапп целиком, черновик
   уедет вместе с `conversations`; **самостоятельного решения не требует**. FK на `integrator.identities` —
   учесть в порядке дропа §10-11.

### 14. `integrator.delivery_attempt_logs` — **ОСТАВИТЬ**

1. **Что хранит.** `intent_type`, `intent_event_id`, `correlation_id`, `channel`, `status`, `attempt`,
   `reason`, `payload_json`, `occurred_at` — журнал попыток отправки.
2. **Дублирует вебапп.** Нет.
3. **Живые потребители.** (a) горячий путь: `repos/messageLogs.ts:44` `insertDeliveryAttemptLog` с тремя
   ветками по принципалу (`:80` definer `app.record_global_email_delivery_attempt`, `:95` definer
   `app.record_operational_delivery_attempt_audit`, `:103` прямой Drizzle) ← `:127` `appendMessageLog` ←
   `writePort.ts:1505-1551` ← `adapters/dispatchPort.ts:136` (каждая отправка). Воркер:
   `runtime/worker/main.ts:43`. Плюс `repos/operatorDeliveryAttempts.ts:29`.
4. **Свежесть.** 6 324 строки, новейшая **2026-08-05** — самая живая таблица схемы после `idempotency_keys`.
5. **Что сломается.** Пропадает разбор «почему письмо/СМС не ушло». Это ядро ответственности модуля доставки.
6. **Вердикт.** ОСТАВИТЬ — учёт доставки, которому в вебаппе не место.
   ⚠️ **Единственная из ОСТАВИТЬ, где стена реально нужна:** `payload_json` — тело отправленного сообщения,
   редактируется только OTP (`dispatchPort.ts:85-93`), RLS off, `app_staff = arwd`. Здесь работа по стенам
   оправдана — в отличие от 11 таблиц выше.
   **Зависимость для порядка работ:** две SECURITY DEFINER функции ссылаются на неё —
   `app.record_global_email_delivery_attempt`, `app.record_operational_delivery_attempt_audit`
   (`apps/webapp/db/drizzle-migrations/0268_…sql:46`, `deploy/postgres/c4-operational-runtime.sql:1038`).

### 15. `integrator.projection_outbox` — **ОСТАВИТЬ**

1. **Что хранит.** `event_type`, `idempotency_key`, `payload`, `status`, `attempts_done`, `next_try_at`,
   `last_error` — durable-очередь проекций «интегратор → вебапп».
2. **Дублирует вебапп.** Нет — это транспорт МЕЖДУ ними.
3. **Живые потребители.** (a) `runtime/worker/main.ts:129-140` → `runtime/worker/projectionWorker.ts:15`;
   `repos/projectionOutbox.ts` (enqueue `:27` с `onConflictDoNothing`, claim `:49-55`, complete/fail
   `:73,85,100`); `repos/projectionFanout.ts:3` (`tryEmitWebappProjectionThenEnqueue`); 10 производителей в
   `writePort.ts` (`:653,683,714,778,850,957,1062,1139,1260,1621`); HTTP `app/routes.ts:177`
   `GET /health/projection`, проксируется вебаппом (`apps/webapp/src/infra/health/proxyIntegratorProjectionHealth.ts:8`).
4. **Свежесть.** 3 788 строк: `done` 3 759, `processing` 20, `cancelled` 9. Новейшая **2026-08-03**.
5. **Что сломается.** События интегратора перестанут доезжать в вебапп при сбое прямой записи — то есть
   **это и есть страховка кластера поддержки §6-9**. Пока он не переехал, сносить нельзя.
6. **Вердикт.** ОСТАВИТЬ. ⚠️ Карта D20 (`D20_INTEGRATOR_MAP.md:425`) помечает её «**УДАЛЯЕТСЯ**» — но
   **замены не проложено**, и по факту она живая. Расхождение отмечаю здесь; отдельным решением не считаю —
   когда поддержка уедет целиком, надобность отпадёт сама.
   `payload` несёт события по конкретным пациентам/записям, RLS off — стена по роли осмысленна, но её
   логично ставить **после** переезда поддержки, когда станет ясен остаточный состав событий.

### 16. `integrator.idempotency_keys` — **ОСТАВИТЬ**

1. **Что хранит.** `key`, `expires_at`, `request_hash`, `status`, `response_body`.
2. **Дублирует вебапп.** Нет. **`public.idempotency_keys` — ОТДЕЛЬНАЯ таблица** (существует, 0 строк на TEST),
   её пишет `apps/webapp/src/infra/idempotency/pgStore.ts` (неквалифицированное имя → `public`).
3. **Живые потребители.** (a) `repos/idempotencyKeys.ts:35` `createPostgresIdempotencyPort`
   (`tryAcquire :40` — `INSERT … ON CONFLICT (key) DO UPDATE … WHERE target.expires_at < now()`;
   `release :59` — точечный `DELETE`). Главный писатель — `kernel/eventGateway/index.ts:58`,
   TTL 900 с (`:30`): через него идёт КАЖДЫЙ вебхук Telegram/MAX/VK. Плюс роуты
   `relayOutboundRoute`, `operatorAlertRelayRoute.ts:159`, `requestContactRoute.ts:115`,
   `bookingLifecycleRoute.ts:109` (`app/routes.ts:215,221,231,262`).
4. **Свежесть.** **~225 живых строк** (замер трижды: 225/225/225, из них 45-46 просроченных).
   `n_tup_ins = 235 038`, `n_tup_del = 234 811` за жизнь таблицы — она перемалывает поток и остаётся крошечной.
   **`reltuples = 221 476` — протухшая оценка планировщика, не количество строк.** Именно эту оценку
   часть 3 (`14-classification-part-1.md:108,152`) приняла за размер.
5. **Что сломается.** Повтор вебхука начнёт дублировать записи и отправки — «ровно один раз» исчезнет.
   Карта D20 (`:382`): «**ОСТАЁТСЯ** — фундамент «ровно один раз»».
6. **Вердикт.** ОСТАВИТЬ — это чистая ответственность модуля доставки.
   **Опровержение находки части 3:** там записано, что `response_body` хранит тела ответов API
   «в т.ч. по бронированиям», и таблица помечена НАРУШЕНИЕм по стене пациента/клиники.
   Замер: **261 строка из 261 имеет `request_hash = '__integrator_incoming_event__'` и `response_body = '{}'`;
   строк с непустым телом — ноль.** Это sentinel-значения, которые порт пишет, чтобы удовлетворить
   `NOT NULL` общей формы колонок (`idempotencyKeys.ts:13-15`). **ПДн в таблице нет.** Класс стены надо
   понизить до «стена роли», и приоритет — низкий.
   Отдельно: планового сборщика просроченных ключей в коде **нет** (grep `expires_at <` по `apps/`, `deploy/`,
   `scripts/` даёт только предикат `ON CONFLICT`), при том что `app_operational_scheduler` имеет `DELETE`
   (`deploy/postgres/c4-operational-runtime.sql:483`). На практике это не проблема — таблица не растёт.

### 17. `integrator.user_reminder_occurrences` — **ОСТАВИТЬ**

1. **Что хранит.** `rule_id`, `occurrence_key`, `planned_at`, `status`, `queued_at`, `sent_at`,
   `delivery_channel`, `delivery_job_id`, `platform_user_id`, `delivery_generation`.
2. **Дублирует вебапп.** Нет. В `public` есть `reminder_occurrence_history` и `reminder_journal`, но это
   **аналитическая проекция**, а не замена. При этом таблица уже «наполовину публичная»: **все три её FK
   смотрят в `public`** — `organization_id → be_organizations`, `platform_user_id → platform_users`,
   `rule_id → reminder_rules(integrator_rule_id)`.
3. **Живые потребители.** Разделённое владение, обе стороны пишут:
   - вебапп планирует: `apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts:131`
     (`app.upsert_patient_reminder_occurrence_plan`) и `:155`
     (`app.mark_patient_reminder_occurrence_queued`), вход
     `apps/webapp/src/app/api/integrator/patient-reminders/materialize-wake/route.ts:46`;
   - интегратор доставляет: `repos/reminders.ts:280,307,398,415,555,584,610` ←
     `writePort.ts:1257,1294,1329,1398,1404,1420`; воркер `runtime/worker/outgoingDeliveryWorker.ts:59-62`;
     ревалидация при claim `repos/patientReminderMaterialization.ts:12`.
   - **10 SECURITY DEFINER функций** ссылаются на неё (`app.upsert_patient_reminder_occurrence_plan`,
     `mark_patient_reminder_occurrence_queued`, `patient_reminder_materialization_fingerprint`,
     `resolve_outgoing_delivery_scope`, `patient_cancel_pending_reminder_occurrences`,
     `patient_skip_reminder_occurrence`, `patient_done_reminder_occurrence`,
     `patient_snooze_reminder_occurrence`, `list_scheduler_reminder_organization_ids`,
     `revalidate_patient_reminder_delivery_materialization`). Прямые табличные права у `app_owner` уже
     отозваны (`0338_…sql:6`).
4. **Свежесть.** 2 787 строк, новейшая **2026-08-03**: `sent` 1 662, `failed` 949, `planned` 105, `skipped` 71.
5. **Что сломается.** Напоминания перестанут ставиться в очередь и начнут дублироваться
   (`delivery_generation` — забор от двойной отправки, D21).
6. **Вердикт.** ОСТАВИТЬ. Механика доставки — ровно то, что модулю принадлежит.
   Замечание на будущее (не действие): раз все FK смотрят в `public`, схемная прописка `integrator`
   для неё — историческая случайность; при желании навести порядок это **`ALTER TABLE … SET SCHEMA public`,
   а не дроп**. Отдельным решением владельца не является — 10 definer-функций придётся тронуть.

### 18. `integrator.user_reminder_delivery_logs` — **ОСТАВИТЬ**

1. **Что хранит.** `occurrence_id`, `channel`, `status`, `error_code`, `payload_json`.
2. **Дублирует вебапп.** Нет.
3. **Живые потребители.** (a) W `repos/reminders.ts:435` `insertReminderDeliveryLog` ← `writePort.ts:1420`.
   Хранит message-id MAX (`kernel/contracts/ports.ts:139`).
4. **Свежесть.** 1 735 строк, новейшая **2026-07-25** — при том что occurrences живут до 2026-08-03.
   Разрыв в 9 дней объясним: с 2026-07-24 все occurrence переходили в `failed`, а не в `sent`.
5. **Что сломается.** Не видно, почему напоминание не дошло.
6. **Вердикт.** ОСТАВИТЬ — журнал доставки. FK-зависимость: держит FK на `user_reminder_occurrences`,
   значит дроп последней (если бы понадобился) — только после этой.

### 19. `integrator.integration_data_quality_incidents` — **ОСТАВИТЬ**

1. **Что хранит.** `integration`, `entity`, `external_id`, `field`, `raw_value`, `timezone_used`,
   `error_reason`, `status`, `occurrences`.
2. **Дублирует вебапп.** Нет.
3. **Живые потребители.** (a) холодный путь: `repos/integrationDataQualityIncidents.ts:14`
   (`INSERT … ON CONFLICT … occurrences + 1`) ← `infra/db/dataQualityIncidentAlert.ts:10` ←
   **единственный вызов** `config/appTimezone.ts:89`, срабатывает только когда
   `system_settings.app_display_timezone` отсутствует или не является валидной IANA-зоной (`:60-73`).
   Сам `getAppDisplayTimezone` — на живых путях (`bookingLifecycleRoute.ts:15`,
   `adapters/remindersReadsPort.ts:8`, `repos/bookingDisplayTimezone.ts:8`).
4. **Свежесть.** 3 строки, новейшая 2026-05-15. **Это НЕ признак смерти** — таблица по построению пишется
   только при поломке данных; «с мая не было кривых TZ» — нормальный результат.
5. **Что сломается.** Молча пропадёт сигнал «внешняя система прислала мусор».
6. **Вердикт.** ОСТАВИТЬ. `raw_value` может нести исходное значение поля — стена клиники осмысленна,
   но при 3 строках это низкий приоритет.

### 20. `integrator.schema_migrations` — **ОСТАВИТЬ**

1. **Что хранит.** `version`, `applied_at` — журнал миграций собственного SQL-мигратора интегратора.
2. **Дублирует вебапп.** Нет: у вебаппа свой `public.webapp_schema_migrations`
   (`apps/webapp/scripts/run-migrations.mjs:27`, там же явное предупреждение о коллизии имён `:23-25`).
3. **Живые потребители.** (a) `apps/integrator/src/infra/db/migrate.ts:12`
   (`INTEGRATOR_MIGRATIONS_TABLE = 'integrator.schema_migrations'`), чтение `:141`; стартовый гейт
   `apps/integrator/src/main.ts:14` → `runStartupMigrationGate` (`migrate.ts:542`), в режиме
   `locked`/`shadow` переходит в `verify-ledger-only` и **не даёт процессу подняться**, если журнал
   не сходится с репозиторием. Деплой: `deploy/host/deploy.sh:27`, `deploy/host/migrate.sh:25`,
   `deploy/host/deploy-test-saas.sh:3091-3101`, ассерты `:622,628-631`, `scripts/deploy-saas-667.sh:473,479`.
4. **Свежесть.** 79 строк, последняя применена 2026-07-30.
5. **Что сломается.** Интегратор не стартует, деплой падает на ассерте.
6. **Вердикт.** ОСТАВИТЬ. Данных людей нет, это служебный журнал — часть 3 (`:132`) оценила так же.

---

## ЧТО СНОСИТЬ И В КАКОМ ПОРЯДКЕ

Порядок продиктован FK и definer-функциями. Замеренный граф FK внутри схемы:

```
users ←── identities ←── telegram_state
  ↑          ↑     ↑
  |          |     └── conversations ←── conversation_messages
  |          |              ↑
  |          |              └── user_questions ←── question_messages
  |          └── message_drafts
  ├── contacts
  ├── content_access_grants
  └── user_reminder_rules

user_reminder_occurrences ←── user_reminder_delivery_logs      (FK наружу: public.*)
users.merged_into_user_id → users                              (саморефлексивный)
```

### Волна 0 — без зависимостей, можно сегодня

| Шаг | Таблица | Что перед дропом |
|---|---|---|
| 0.1 | `telegram_users` | дамп; удалить `schema.ts:3873`, `scripts/check-telegram-users.ts`. FK-зависимых нет, читателей нет. **Риска ноль.** |
| 0.2 | `content_access_grants` | дамп (0 строк); удалить `protectedAccessPort.ts`, `reminders.ts:522-534`, `writePort.ts:1457-1471`, тип `ports.ts:278`, схему `integratorDomainRepos.ts:75` + `integratorDrizzleSchema.ts:11,30`, `mergeIntegratorUsers.ts:433`, DI `di.ts:271,281`. |
| 0.3 | колонки `telegram_state`: `username`, `first_name`, `last_name`, `notify_spb`, `notify_msk`, `notify_online`, `notify_bookings`, `is_active` | сначала удалить `backfill-person-domain.mjs` и `reconcile-person-domain.mjs` (единственные читатели); убрать upsert имён `channelUsers.ts:293-309`. **Таблица перестаёт быть носителем ПДн.** |

### Волна 1 — со сроком/переключателем

| Шаг | Таблица | Гейт |
|---|---|---|
| 1.1 | `user_reminder_rules` | переписать `0282_failed_reminder_occurrence_history.sql:12,54` с `integrator.user_reminder_rules` на `public.reminder_rules`; удалить `backfill-reminders-domain.mjs`, `reconcile-reminders-domain.mjs`, записи в `01_audit/03_reconcile/05_drop_deprecated`; снять гранты `p0-5b-grants.sql:75`, `deploy-saas-667.sh:485`. Данные уже 27/27 в `public`. |
| 1.2 | `contacts` | сверка на живой базе (`01_audit.ts:132-163`) → `integrator_linked_phone_source = public_only` → окно без событий `linked_phone_legacy_fallback` → удалить `setUserPhone` + 5 читателей + `linkedPhoneSource.ts` + `pgMessengerPhoneHttpBind.ts:181,190` + `platformUserFullPurge.ts:418,453` → дроп. Снять политику `saas_org_dormant_p0_8_5`. |
| 1.3 | `message_retry_jobs` | **не раньше 2026-08-29 17:00 MSK** (10 строк `pending`). Затем `count(*) FILTER (status='pending') = 0` → удалить `jobQueue.ts`, `jobQueuePort.ts`, `jobQueueLoop` в `worker/main.ts:67-128`, `writePort.ts:259,1651-1676`, `handlers/delivery.ts:321-352`, `actions/index.ts:46-51,85`, `integratorQueues.ts` (часть), гейт `check-no-legacy-message-retry-producers.ts`, `platformUserFullPurge.ts:483`, гранты `c4-operational-runtime.sql:462,481`, `dev-c7-…:59`, `operationalPoolReadiness.ts:30`. **Это D30 Ш7 плана, `[ ]`.** |

### Волна 2 — кластер поддержки (остаток D23)

Порядок дропа строго по FK: `question_messages` → `user_questions` → `conversation_messages` → `conversations`.

Перед первым дропом:
1. перевести чтения на `public.support_*`: `messageThreads.ts:380,390,420,445,454,503,515,605`, `readPort.ts:102`;
2. убрать локальные записи `messageThreads.ts:229,269,308,572,601,621`, оставив `directPublic/writeSupport*Direct.ts`;
3. удалить `mergeIntegratorConversationToPlatform.ts` и ветку `writePort.ts:594`;
4. `auto-close-stale-conversations.ts` — увезти в вебапп (D20 `:434`) либо переписать на `public.support_conversations`;
5. повторить сверку 21/21, 34/34, 16/16, 20/20 на живой базе;
6. снять политики `saas_org_dormant_*` вместе с таблицами.

Побочный эффект, важный для всей работы по стенам: **вместе с этими четырьмя таблицами исчезают четыре
RLS-политики, чья пациентская ветка построена на `EXISTS … FROM integrator.identities`** — то есть исчезает
и претензия «стена пациента опирается на таблицу без стены» (`14-classification-part-1.md:145`).

После волны 2 `message_drafts` остаётся единственным держателем FK на `identities` со стороны поддержки.

### Волна 3 — D25 (`identities`, `users`)

Только после волн 1-2, потому что от них FK-зависимы `contacts`, `content_access_grants`,
`user_reminder_rules`, `conversations`, `message_drafts`, `telegram_state`.

1. перевести резолв на существующий порт `repos/platformUserByChannel.ts:38`
   (`resolveCanonicalPlatformUserIdByChannel`) и `public.user_channel_bindings`;
2. перевесить `telegram_state.identity_id` и `message_drafts.identity_id` на `user_channel_bindings.id`;
3. вырезать `userMergeM2mRoute` (Р-D26);
4. дроп `identities`, затем `users` (учесть саморефлексивный `users_merged_into_user_id_fkey`).

### Definer-функции: что учесть

| Функция | Ссылается на | Влияние на план |
|---|---|---|
| `app.record_global_email_delivery_attempt` (DEF) | `delivery_attempt_logs` | таблица ОСТАЁТСЯ — трогать не надо |
| `app.record_operational_delivery_attempt_audit` (DEF) | `delivery_attempt_logs` | то же |
| 10 функций `app.*_patient_reminder_*` / `resolve_outgoing_delivery_scope` / `list_scheduler_reminder_organization_ids` (все DEF) | `user_reminder_occurrences` | таблица ОСТАЁТСЯ — трогать не надо |

**Ни одна definer-функция не ссылается ни на одну таблицу из списка СНОСИТЬ / ПЕРЕНЕСТИ И СНЕСТИ**
(проверено по `pg_proc.prosrc` для всех 19 таблиц). Это снимает самый неприятный класс блокеров.

---

## Ответы на вопросы владельца

### Зачем интегратору нормализованные телефоны?

**Незачем. Сегодня — ни для чего.**

Нормализованный телефон в схеме `integrator` живёт в двух местах, и оба лишние:

- **`contacts.value_normalized`** — единственный писатель `channelUsers.ts:749` (`setUserPhone`), и он
  вызывается ровно из одной точки — `writePort.ts:441`, **внутри той же транзакции и сразу ПОСЛЕ** записи
  канонического значения в `public.platform_users.phone_normalized`. То есть это зеркало, создаваемое
  строкой ниже оригинала. Сам `setUserPhone` ничего не нормализует — E.164 приезжает готовым.
  Читается он через переключатель `linkedPhoneSource.ts` с дефолтом `public_then_contacts`,
  формула `pub ?? leg`. **Замер: `pub` есть у 78 из 78 → ветка `leg` не срабатывает никогда.**
- **`message_retry_jobs.phone_normalized`** — писатель достижим только через мёртвый путь
  `message.retry.enqueue`; из 134 строк все живые несут `payload.targets[]`, и ветка чтения этой колонки
  (`jobQueuePort.ts:109,136`) для них не выполняется. Единственный живой потребитель колонки вне слива —
  GDPR-purge `platformUserFullPurge.ts:483`.

**Как модуль доставки резолвит получателя на самом деле** — двумя портами, и оба уже переведены на вебапп:
1. `repos/platformUserDeliveryPhone.ts:10` `getPhoneNormalizedForDeliveryLookup` — читает
   `public.platform_users.phone_normalized`, идя по `merged_into_id IS NULL`
   (порт `readPort.ts:59` `user.phoneForDeliveryLookup`, потребитель `contextQueryPort.ts:117`);
2. `adapters/deliveryTargetsPort.ts` — подписанный HMAC-запрос `GET /api/integrator/delivery-targets`
   в вебапп, резолвящий все каналы получателя **в момент отправки**. Пробуется **первым**
   (`kernel/domain/executor/helpers.ts:525`); `contacts` — только фолбэк, когда первый вернул пусто.

Что модулю доставки действительно нужно — это **функция** `phone/normalizeRuPhoneE164.ts` (привести
`8 (912) …`, `+7912…`, `7912…` к одной форме адреса канала), и она остаётся. Карта D20 формулирует
границу дословно (`:319`): «**ОСТАЁТСЯ** (форма адреса канала); доверие к телефону — **УЕЗЖАЕТ** (D25)».
**Хранить** телефон интегратору не нужно ни для чего.

### Что ещё дублирует вебапп и зачем?

Пять групп. «Зачем» в каждом случае — не архитектура, а **незакрытый шаг переезда**:

| Что дублируется | Оригинал в `public` | Зачем это появилось |
|---|---|---|
| Личность: `users`, `identities` | `platform_users.integrator_user_id` / `.merged_into_id`, `user_channel_bindings` | Р-D25 принято 31.07, но пункт **D25 в `WORK_ORDER.md:971` — `[ ]`**. Закрыт только D15b/2 (интегратор перестал ПИСАТЬ идентичность в `public`); читатели горячего пути остались на локальных таблицах. Обе стороны пишутся в одной транзакции — 131/134 совпадают. |
| Имена: `telegram_state.username/first_name/last_name` | `platform_users.first_name/last_name/display_name` | тот же незакрытый D25 — upsert имён на каждом вебхуке (`channelUsers.ts:293-309`). |
| Настройки уведомлений: `telegram_state.notify_*`, `is_active` | `user_notification_topics`, `user_notification_topic_channels` | переезд **уже состоялся**; в рантайме эти колонки не читает никто, остались только два backfill-скрипта. Чистый мусор. |
| Поддержка: `conversations`, `conversation_messages`, `user_questions`, `question_messages` | `support_conversations`, `support_conversation_messages`, `support_questions`, `support_question_messages` | двойная запись **сознательно временная** — в коде прямо написано: `writeSupportConversationsDirect.ts:25-26` «INTEGRATOR-LOCAL STATE RETAINED, WRITTEN IN A SEPARATE TX». Р-D23 принято, таблицы не сняты. Все 4 спроецированы на 100 %. |
| Телефон: `contacts.value_normalized` | `platform_users.phone_normalized` | фолбэк-переключатель на время переезда; фактически 78/78 покрыты, фолбэк не срабатывает. |
| Правила напоминаний: `user_reminder_rules` | `reminder_rules` (`integrator_rule_id`) | forward-copy миграцией `0323_…` состоялся, 27/27 скопированы, рантайм читает `public`. Осталась пустая оболочка. |

### Переведён ли код уже на чтение из вебаппа, а таблицы просто остались?

По таблицам, а не «в общем»:

| Таблица | Код переведён? | Доказательство |
|---|---|---|
| `user_reminder_rules` | **ДА, полностью** | `repos/reminders.ts:14` импортирует `reminderRules` из `integratorPublicProduct.ts:107` = `pgTable('reminder_rules')` = **`public`**. Комментарий в файле `:104-106`. Прямое утверждение репозитория: `apps/webapp/src/modules/reminders/reminders.md:5`. Рантайм-ссылок на легаси-таблицу нет ни одной. |
| `message_retry_jobs` | **ДА** (производитель), **НЕТ** (слив) | `bookingLifecycleRoute.ts:336,343` — «legacy enqueue is intentionally disabled», вместо неё `materializeAppointmentReminders` (`:360`); статический гейт `check-no-legacy-message-retry-producers.ts:34`. Слив `worker/main.ts:67-128` ещё крутится ради 10 строк. |
| `telegram_users` | **ДА** | ноль ссылок вне миграций; `schema.md:41`. |
| `contacts` | **ДА, но фолбэк не отключён** | ported-пути: `platformUserDeliveryPhone.ts:10` и `deliveryTargetsPort.ts` (пробуется первым, `helpers.ts:525`). Фолбэк живёт из-за дефолта `public_then_contacts` в `linkedPhoneSource.ts:57,64`. Данными он ничего не добавляет (78/78). |
| `conversations`, `conversation_messages`, `user_questions`, `question_messages` | **ЗАПИСЬ — да, ЧТЕНИЕ — нет** | прямые писатели в `public` работают (`directPublic/writeSupport*Direct.ts`), 100 % строк спроецировано. Но `readPort.ts:102` и 8 чтений в `messageThreads.ts` всё ещё бьют в локальные таблицы, и локальная запись сохранена намеренно (`writeSupportConversationsDirect.ts:25-26`). |
| `identities`, `users` | **ЗАПИСЬ — частично, ЧТЕНИЕ — нет** | D15b/2 (`5137e8c68`, land `2c1cd63fb`) свёл запись идентичности к одной реализации `packages/platform-merge/src/identityProjectionWrite.ts`. Но резолв на горячем пути — по-прежнему локальный: `channelUsers.ts:74,489,665,694`, `canonicalUserId.ts:37,67`. Готовый публичный порт `platformUserByChannel.ts:38` существует и **не используется на этих путях**. |
| `content_access_grants` | **н/д** | никуда не переведён — путь никогда не работал (`issueAccess()` не вызывается ниоткуда). |
| `telegram_state` (колонки `notify_*`, `is_active`) | **ДА** | ноль рантайм-ссылок; каноничны `user_notification_topics` / `user_notification_topic_channels`. |
| `delivery_attempt_logs`, `projection_outbox`, `idempotency_keys`, `user_reminder_occurrences`, `user_reminder_delivery_logs`, `integration_data_quality_incidents`, `schema_migrations` | **вопрос не применим** | это не пользовательские данные, а учёт доставки. Переводить некуда и незачем. |
| `message_drafts` | **вопрос не применим** | аналога в `public` нет; транзитное состояние канала. |

**Сводный ответ: да — по 11 таблицам из 20 код уже опирается на вебапп полностью или в записи, а таблицы
остались нечищенными.** Ни одна из них не является источником данных, которого нет в `public`.

---

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Ни один не про судьбу таблицы (она определена выше) — все про срок и порядок.

**В-1. Волну 0 (три безрисковых шага: `telegram_users`, `content_access_grants`, 8 колонок
`telegram_state`) делаем сразу или ждём общей волны?** Рекомендация — сразу: FK-зависимых нет,
читателей нет, откат — восстановление из дампа. Это снимает 2 из 8 «нарушений» части 3 без единого
изменения в рантайм-логике.

**В-2. `contacts` — снимаем по замеру или ждём окна наблюдения?** Замер на TEST: 78/78 телефонов уже в
`public.platform_users.phone_normalized`, уникальных значений у фолбэка ноль. Safe-default —
переключить `integrator_linked_phone_source` в `public_only`, подождать неделю без событий
`linked_phone_legacy_fallback`, потом дроп. Быстрый вариант — дроп сразу после сверки на живой базе.
Рекомендую safe-default: цена ожидания — неделя, цена ошибки — человек не получает сообщение.

**В-3. Волна 2 (кластер поддержки) — это остаток D23 или новый workstream?** Пункт D23 в
`WORK_ORDER.md:953` помечен `[x]`, но закрыта была только «старая ветка ответа администратора»; четыре
таблицы с текстами переписки остались. Формально это НЕ новый скоуп — Р-D23 звучит «старое удаляем или
переносим в новое». Прошу подтвердить, что дочистка идёт как остаток D23, а не заводится отдельно.

**В-4. Часть 3 планировала обносить стенами 8 таблиц `integrator`. По этому разбору 6 из них подлежат
сносу, а `idempotency_keys` вообще не содержит ПДн. Переставляем приоритет?** Предложение: работу по
стенам в схеме `integrator` свести к **одной** таблице — `delivery_attempt_logs` (`payload_json` = тело
сообщения, RLS off, `app_staff = arwd`), а остальное закрыть удалением. Это меняет объём работ по стенам
в `integrator` с 8 таблиц до 1 + понижение класса ещё двух (`projection_outbox`,
`integration_data_quality_incidents` — стена роли/клиники, низкий приоритет).

---

## Приложение: команды замеров

```bash
# список таблиц и ОЦЕНКА строк (внимание: reltuples врёт — см. idempotency_keys)
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT c.relname, c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='integrator' AND c.relkind IN ('r','p') ORDER BY 1"

# РЕАЛЬНЫЕ строки + свежесть (по каждой таблице)
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT count(*), max(created_at) FROM integrator.<t>"

# churn: почему reltuples разошёлся с реальностью
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT s.relname, c.reltuples::bigint, s.n_live_tup, s.n_dead_tup, s.n_tup_ins, s.n_tup_del FROM pg_stat_user_tables s JOIN pg_class c ON c.oid=s.relid WHERE s.schemaname='integrator' ORDER BY 1"

# FK-граф схемы
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT ns.nspname||'.'||src.relname||' -> '||fns.nspname||'.'||tgt.relname||' ('||c.conname||')' FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=src.relnamespace JOIN pg_class tgt ON tgt.oid=c.confrelid JOIN pg_namespace fns ON fns.oid=tgt.relnamespace WHERE c.contype='f' AND (fns.nspname='integrator' OR ns.nspname='integrator') ORDER BY 1"

# definer-функции, ссылающиеся на таблицу
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT n.nspname||'.'||p.proname||CASE WHEN p.prosecdef THEN '(DEF)' ELSE '' END FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prosrc ~ 'integrator\.<t>\M'"

# сверка «уже ли всё в вебаппе»
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT
 (SELECT count(*) FROM integrator.conversations c WHERE EXISTS (SELECT 1 FROM public.support_conversations s WHERE s.integrator_conversation_id=c.id)),
 (SELECT count(*) FROM integrator.conversation_messages m WHERE EXISTS (SELECT 1 FROM public.support_conversation_messages s WHERE s.integrator_message_id=m.id)),
 (SELECT count(*) FROM integrator.user_questions q WHERE EXISTS (SELECT 1 FROM public.support_questions s WHERE s.integrator_question_id=q.id)),
 (SELECT count(*) FROM integrator.question_messages m WHERE EXISTS (SELECT 1 FROM public.support_question_messages s WHERE s.integrator_question_message_id=m.id))"

sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT count(*) AS contacts_phone, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.platform_users pu WHERE pu.phone_normalized = c.value_normalized)) AS matched FROM integrator.contacts c WHERE c.type='phone'"

sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT (SELECT count(*) FROM integrator.user_reminder_rules), (SELECT count(*) FROM integrator.user_reminder_rules r WHERE EXISTS (SELECT 1 FROM public.reminder_rules p WHERE p.integrator_rule_id=r.id))"

# опровержение «221 476 строк с телами ответов»
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT request_hash, count(*), count(*) FILTER (WHERE response_body::text <> '{}') FROM integrator.idempotency_keys GROUP BY 1"
```
