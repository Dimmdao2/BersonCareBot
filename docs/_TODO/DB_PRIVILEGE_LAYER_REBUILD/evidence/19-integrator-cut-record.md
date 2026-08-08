# 19. Срез 11 таблиц `integrator`: запись «что в них лежало», кто упал, план переписывания

**Распоряжение владельца (08.08.2026, дословно):** «проще вырезать легаси таблицы (запомнить из поля и что
в них лежало) и потом быстро увидеть кто упал без них и переписать на нужный порт/таблицу».

**Что сделано 08.08.2026, 23:09–23:30 MSK.** Все 11 таблиц выгружены (схема + данные) из ОБЕИХ баз,
затем снесены на `bcb_webapp_dev`, затем на `bersoncarebot_test`. Собраны доказательства поломок:
статический поиск, typecheck обоих приложений, живой прогон приложений, затронутые тесты, гейты деплоя.
**`bcb_webapp_prod` не открывался вообще** — ни на чтение, ни на запись; ни одна прод-команда не выполнялась.
**Ничего не коммичено, код не правился.**

**Итог одной строкой:** 11/11 снесены в обеих базах; **TEST-воркер доставки умер сразу и лежит до сих пор**;
typecheck обоих приложений — **0 ошибок**; **ни один тест не упал**; гейт деплоя P0.5b падает.

---

## 0. Как откатить (если решение изменится)

```bash
OUT=/home/dev/dev-projects/bcb-backups/integrator-cut-2026-08-08
cd "$OUT" && sha256sum -c SHA256SUMS          # 22 файла + суммы
sudo -u postgres psql -d bcb_webapp_dev     -f "$OUT/bcb_webapp_dev.integrator.<T>.sql"
sudo -u postgres psql -d bersoncarebot_test -f "$OUT/bersoncarebot_test.integrator.<T>.sql"
# затем вернуть то, что снял CASCADE (см. §3):
sudo -u postgres psql -d <db> -f "$OUT/RESTORE.message_drafts_policy.sql"
```

Одна таблица — один файл (`<db>.integrator.<table>.sql`), в каждом и DDL, и данные, и индексы, и FK.
Восстановление одной таблицы не требует разбора остальных. **Порядок отката по FK:**
`users` → `identities` → `contacts`/`content_access_grants`/`user_reminder_rules`/`conversations` →
`conversation_messages`/`user_questions` → `question_messages`; `telegram_users` и `message_retry_jobs`
изолированы и восстанавливаются в любой момент.

---

## 1. ЗАПОМНИТЬ: что в них лежало

Замер `count(*)` (не `reltuples`) перед сносом, 08.08.2026:

| Таблица | dev | test | Колонок | Куда тот же факт уехал в вебаппе | Строк в приёмнике (dev) |
|---|---:|---:|---:|---|---:|
| `telegram_users` | 2 | 2 | 15 | разложена в `integrator.identities` + `integrator.telegram_state` + `public.platform_users` | 115 (`telegram_state`) |
| `content_access_grants` | 0 | 0 | 10 | `public.content_access_grants_webapp` | 0 |
| `message_retry_jobs` | 113 | 134 | 12 | `public.outgoing_delivery_queue` (+ `integrator.projection_outbox`) | 2666 |
| `user_reminder_rules` | 27 | 27 | 24 | `public.reminder_rules` (связь `integrator_rule_id`) | 46 |
| `contacts` | 78 | 78 | 9 | `public.user_contacts` + `public.platform_user_contacts` + `platform_users.phone_normalized` | 457 / 3 |
| `conversations` | 21 | 21 | 10 | `public.support_conversations` | 257 |
| `conversation_messages` | 34 | 34 | 9 | `public.support_conversation_messages` | 823 |
| `user_questions` | 16 | 16 | 9 | `public.support_questions` | 26 |
| `question_messages` | 20 | 20 | 6 | `public.support_question_messages` | 39 |
| `identities` | 134 | 134 | 6 | `public.user_channel_bindings` | 135 |
| `users` | 134 | 134 | 4 | `public.platform_users` (`integrator_user_id`) | 287 |

**Комментариев на таблицах и колонках не было ни одного** (`obj_description`/`col_description` — пусто по
всем 11). Пользовательских триггеров — ноль. Представлений и функций (в т.ч. SECURITY DEFINER), ссылающихся
на любую из 11, — ноль (проверено `pg_proc.prosrc` + `pg_depend`, до и после сноса).

### 1.1 Колонки (тип, NOT NULL, default)

`telegram_users` — `id bigint NN nextval`, `telegram_id bigint NN`, `username text`, `first_name text`,
`last_name text`, `created_at timestamptz NN now()`, `phone text`, `updated_at timestamptz now()`,
`state text`, `notify_spb boolean NN false`, `notify_msk boolean NN false`, `notify_online boolean NN false`,
`last_update_id bigint`, `last_start_at timestamptz`, `is_active boolean NN true`.
*ПДн: колонка `phone` была заполнена у 0 строк из 2.*

`content_access_grants` — `id text NN`, `user_id bigint NN`, `content_id text NN`, `purpose text NN`,
`token_hash text`, `expires_at timestamptz NN`, `revoked_at timestamptz`, `meta_json jsonb NN '{}'`,
`created_at timestamptz NN now()`, `organization_id uuid NN`.

`message_retry_jobs` — `id bigint NN nextval`, `phone_normalized text`, `message_text text`,
`next_try_at timestamptz NN`, `attempts_done int NN 0`, `max_attempts int NN 2`, `status text NN 'pending'`,
`last_error text`, `created_at timestamptz NN now()`, `updated_at timestamptz NN now()`,
`kind text NN 'message.deliver'`, `payload_json jsonb`.
*Содержимое: dev — 20 строк `pending`, test — 10 строк `pending` с `next_try_at` вплоть до
2026-08-29 16:59 MSK. Это неотправленные сообщения (на TEST живых людей нет — см. §5.1).*

`user_reminder_rules` — `id text NN`, `user_id bigint NN`, `category text NN`, `is_enabled bool NN false`,
`schedule_type text NN 'interval_window'`, `timezone text NN 'Europe/Moscow'`, `interval_minutes int NN`,
`window_start_minute int NN`, `window_end_minute int NN`, `days_mask text NN '1111111'`,
`content_mode text NN 'none'`, `created_at/updated_at timestamptz NN now()`, `linked_object_type text`,
`linked_object_id text`, `custom_title text`, `custom_text text`, `deep_link text`, `schedule_data jsonb`,
`reminder_intent text 'generic'`, `quiet_hours_start_minute int`, `quiet_hours_end_minute int`,
`notification_topic_code text`, `organization_id uuid NN`.

`contacts` — `id bigint NN nextval`, `user_id bigint NN`, `type text NN`, `value_normalized text NN`,
`label text`, `is_primary bool`, `created_at/updated_at timestamptz NN now()`, `organization_id uuid NN`.
*ПДн: `value_normalized` для `type='phone'` — телефоны. 78 строк, все зеркалированы (замер док. 17: 78/78).*

`conversations` — `id text NN`, `source text NN`, `user_identity_id bigint NN`, `admin_scope text NN`,
`status text NN`, `opened_at timestamptz NN`, `last_message_at timestamptz NN`, `closed_at timestamptz`,
`close_reason text`, `organization_id uuid NN`.

`conversation_messages` — `id text NN`, `conversation_id text NN`, `sender_role text NN`, `text text NN`,
`source text NN`, `external_chat_id text`, `external_message_id text`, `created_at timestamptz NN`,
`organization_id uuid NN`. *ПДн: `text` — переписка с пациентами.*

`user_questions` — `id text NN`, `user_identity_id bigint NN`, `conversation_id text`,
`telegram_message_id text`, `text text NN`, `created_at timestamptz NN now()`, `answered bool NN false`,
`answered_at timestamptz`, `organization_id uuid NN`. *ПДн: `text`.*

`question_messages` — `id text NN`, `question_id text NN`, `sender_type text NN`, `message_text text NN`,
`created_at timestamptz NN now()`, `organization_id uuid NN`. *ПДн: `message_text`.*

`identities` — `id bigint NN nextval`, `user_id bigint NN`, `resource text NN`, `external_id text NN`,
`created_at/updated_at timestamptz NN now()`. *ПДн: `external_id` — telegram/MAX-идентификатор человека.*

`users` — `id bigint NN nextval`, `created_at/updated_at timestamptz NN now()`, `merged_into_user_id bigint`.
*ПДн нет — чистый суррогатный ключ.*

### 1.2 Индексы (35 штук)

| Таблица | Индексы |
|---|---|
| `contacts` | `contacts_pkey(id)`, `contacts_type_value_normalized_key(type,value_normalized) UNIQUE`, `idx_contacts_organization_id`, `idx_contacts_user_id` |
| `content_access_grants` | `content_access_grants_pkey(id)`, `content_access_grants_user_expires_idx(user_id, expires_at DESC)`, `idx_content_access_grants_organization_id` |
| `conversation_messages` | `conversation_messages_pkey(id)`, `conversation_messages_conversation_created_idx(conversation_id, created_at)`, `idx_conversation_messages_organization_id` |
| `conversations` | `conversations_pkey(id)`, `conversations_open_user_source_uidx(user_identity_id, source) WHERE closed_at IS NULL AND status<>'closed'` **(уникальный частичный — инвариант «одна открытая беседа на канал»)**, `conversations_status_last_message_idx`, `idx_conversations_organization_id` |
| `identities` | `identities_pkey(id)`, `identities_resource_external_id_key(resource, external_id) UNIQUE`, `idx_identities_user_id` |
| `message_retry_jobs` | `message_retry_jobs_pkey(id)`, `idx_message_retry_jobs_due(status, next_try_at)` |
| `question_messages` | `question_messages_pkey(id)`, `question_messages_question_created_idx(question_id, created_at)`, `idx_question_messages_organization_id` |
| `telegram_users` | `telegram_users_pkey(id)`, `telegram_users_chat_id_key(telegram_id) UNIQUE`, `telegram_users_last_start_at_idx`, `telegram_users_last_update_id_idx` |
| `user_questions` | `user_questions_pkey(id)`, `user_questions_answered_created_idx(answered, created_at DESC) WHERE answered=false`, `user_questions_conversation_id_idx WHERE conversation_id IS NOT NULL`, `idx_user_questions_organization_id` |
| `user_reminder_rules` | `user_reminder_rules_pkey(id)`, `user_reminder_rules_enabled_idx(is_enabled, category)`, `idx_user_reminder_rules_organization_id` |
| `users` | `users_pkey(id)`, `idx_users_merged_into_user_id WHERE merged_into_user_id IS NOT NULL` |

Плюс 5 собственных последовательностей: `contacts_id_seq`, `identities_id_seq`, `message_retry_jobs_id_seq`,
`telegram_users_id_seq`, `users_id_seq` (ушли вместе с таблицами как owned-объекты).

### 1.3 Внешние ключи

**Исходящие (17).** Все 11 (кроме `telegram_users`, `users` и `message_retry_jobs`) держали
`organization_id → public.be_organizations(id) ON DELETE CASCADE`. Плюс внутри набора:
`contacts.user_id`, `content_access_grants.user_id`, `user_reminder_rules.user_id`, `identities.user_id`
→ `integrator.users(id)`; `conversations.user_identity_id`, `user_questions.user_identity_id` →
`integrator.identities(id)`; `conversation_messages.conversation_id` → `integrator.conversations(id)`;
`user_questions.conversation_id` → `integrator.conversations(id) ON DELETE SET NULL`;
`question_messages.question_id` → `integrator.user_questions(id)`;
`users.merged_into_user_id` → `integrator.users(id)` (самоссылка, цепочка слияний).

**Входящие ИЗВНЕ набора — ровно 2, обе на `identities`:**
`integrator.message_drafts.identity_id` и `integrator.telegram_state.identity_id`
(обе таблицы ОСТАЮТСЯ). Это и есть единственный блокер простого `DROP` — см. §3.

### 1.4 RLS

На 7 из 11 висела политика `saas_org_dormant_p0_8_5` (`contacts`, `content_access_grants`,
`conversation_messages`, `conversations`, `question_messages`, `user_questions`, `user_reminder_rules`).
На `telegram_users`, `message_retry_jobs`, `identities`, `users` политик не было.
**Одна политика на ОСТАЮЩЕЙСЯ таблице зависела от набора:** `saas_org_dormant_p0_8_5` на
`integrator.message_drafts` джойнит `integrator.identities` — последствия в §3.

---

## 2. Полный дамп: где лежит

```
/home/dev/dev-projects/bcb-backups/integrator-cut-2026-08-08/
  bcb_webapp_dev.integrator.<11 таблиц>.sql          (11 файлов)
  bersoncarebot_test.integrator.<11 таблиц>.sql      (11 файлов)
  RESTORE.message_drafts_policy.sql                  (политика + 2 FK, снятые CASCADE)
  SHA256SUMS                                         (22 суммы)
```

`pg_dump --table=integrator.<T>` — схема + данные + индексы + ограничения. Суммарно 524 KB.

---

## 3. СРЕЗ: как прошёл

Порядок — от детей к родителям, каждая таблица отдельной транзакцией, чтобы отказ одной не откатывал
остальные. **Сначала пробовался обычный `DROP TABLE` без `CASCADE`; `CASCADE` применялся только там, где
обычный отказал, и только после того, как записано, что именно он снесёт (запрос по `pg_depend`).**

| # | Таблица | dev | test |
|---|---|---|---|
| 1 | `question_messages` | DROP OK | DROP OK |
| 2 | `user_questions` | DROP OK | DROP OK |
| 3 | `conversation_messages` | DROP OK | DROP OK |
| 4 | `conversations` | DROP OK | DROP OK |
| 5 | `contacts` | DROP OK | DROP OK |
| 6 | `content_access_grants` | DROP OK | DROP OK |
| 7 | `user_reminder_rules` | DROP OK | DROP OK |
| 8 | `telegram_users` | DROP OK | DROP OK |
| 9 | `message_retry_jobs` | DROP OK | DROP OK |
| 10 | **`identities`** | **DROP отказал → CASCADE** | **DROP отказал → CASCADE** |
| 11 | `users` | DROP OK | DROP OK |

Отказ (идентичен в обеих базах):

```
ERROR: cannot drop table integrator.identities because other objects depend on it
DETAIL: constraint message_drafts_identity_id_fkey on table integrator.message_drafts
        constraint telegram_state_identity_id_fkey on table integrator.telegram_state
        policy saas_org_dormant_p0_8_5 on table integrator.message_drafts
```

`CASCADE` снёс ровно эти три объекта и ничего сверх (`NOTICE: drop cascades to 3 other objects`).
DDL для восстановления всех трёх сохранён в `RESTORE.message_drafts_policy.sql`.

**Проверка после сноса — обе базы:** таблиц из 11 осталось `0`; функций, ссылающихся на снесённое, — `0`;
в схеме `integrator` осталось 9 таблиц; `public.reminder_rules` = 46, `public.user_channel_bindings` = 135/131,
`public.platform_users` = 287/278 — канонические данные целы.

### 🔴 3.1 Побочный эффект CASCADE — не тот, который предсказывал документ 17

Документ 17 §2 писал: `CASCADE` «**тихо снимет стену** с `message_drafts` — регресс безопасности».
**Замер показывает обратное, и это важнее.** `integrator.message_drafts` имеет
`ENABLE ROW LEVEL SECURITY` **и `FORCE ROW LEVEL SECURITY`**, и та политика была у неё **единственной**.
RLS с нулём политик в PostgreSQL — это не «нет стены», это **deny-all**, и `FORCE` распространяет запрет
даже на владельца таблицы:

```
count(*) как superuser (RLS не применяется):        17
count(*) как bcb_webapp_dev_user (владелец, FORCE):  0
pg_class.reltuples:                                 17
```

То есть **утечки нет — есть полное залипание таблицы**. 17 строк черновиков сообщений физически на месте,
но невидимы и неизменяемы для любой роли приложения. Это не «регресс безопасности», это функциональная
поломка, и чинится она восстановлением политики (файл `RESTORE.…sql`) или переписыванием её условия на
`public.user_channel_bindings`.

---

## 4. КТО УПАЛ — статика

287 ссылок вида `integrator.<таблица>` в коде (без `docs/`), плюс неквалифицированные (интегратор ходит
через `search_path`, поэтому в его репозиториях просто `FROM identities`). Ниже — **только рантайм и деплой**,
без миграций (миграции — журнал, а не рантайм; их отдельно в §4.4).

### 4.1 `apps/integrator` — 8 файлов рантайма

| Файл | Строки | Что делает | Достижим с |
|---|---|---|---|
| `src/infra/db/repos/messageThreads.ts` | 73, 80, 122, 216, **229 (INSERT conversations)**, **269 (INSERT conversation_messages)**, 283, **308 (UPDATE conversations)**, 332, **337 (INSERT users)**, 345, **350 (INSERT identities)**, 380, 389–390, 396, 420, 445, 454–455, 461, 503–504, 508, 515, 560, **572 (INSERT user_questions)**, 582, **601 (INSERT question_messages)**, 605, **621 (UPDATE user_questions)** — 31 место | весь кластер поддержки: беседы, сообщения, вопросы | вебхуки Telegram/MAX → `executeAction.ts:1439/1453/1469/1481` → `writePort.ts:602/720/810/882/992/1096` |
| `src/infra/db/repos/channelUsers.ts` | 74, 182, 197, 228, 260, **266 (INSERT users)**, **278 (INSERT identities)**, 334, 368, 406–407, 429–430, 489, 509, 580, 600, 665, 694, 709, **737 (DELETE contacts)**, **749 (INSERT contacts)** — 22 места | `upsertUser`, резолв канала, `setUserPhone` | вебхуки; `writePort.ts:441` (`user.phone.link`); `kernel/domain/usecases/handleUpdate.ts:105` |
| `src/infra/db/repos/mergeIntegratorUsers.ts` | 230, 236, 320–321, 368, 381, 385, **390/398 (identities)**, 405, 417, **433 (content_access_grants)**, **441 (users)** — 13 мест | M2M-слияние канонических пользователей | живой роут `integrations/bersoncare/userMergeM2mRoute.ts:128,154` |
| `src/infra/db/repos/jobQueue.ts` | **57, 64** (`reclaimStaleProcessing`), **99, 104** (`claimDueJobs`) | очередь ретраев доставки | 🔴 **воркер-цикл `while(true)`**, `runtime/worker/main.ts:66–92` |
| `src/infra/db/operationalPoolReadiness.ts` | 30 | стартовый пробник воркера доставки | старт `bersoncarebot-worker-*` |
| `src/infra/db/repos/canonicalUserId.ts` | 37 (`users`), 67 (`identities`) | разрешение канонического id по цепочке слияний | общий |
| `src/infra/db/repos/adminStats.ts` | 51 (`contacts`), 58 (`identities`) | `/admin_users` в боте | команда бота |
| `src/infra/db/repos/mergeIntegratorConversationToPlatform.ts` | 49, 53, 62, 66 | перенос бесед в `public.support_*` | слияние |
| `src/infra/runtime/worker/doctorBroadcastIntentMenu.ts` | 65 (`contacts`) | меню рассылки врача | воркер |
| `src/infra/scripts/check-d30-legacy-message-retry-drain-concurrency.ts` | 8 мест | одноразовый диагностический скрипт | вручную |
| `src/infra/scripts/auto-close-stale-conversations.ts` | — | крон закрытия зависших бесед | крон |

Плюс мёртвая ветка `content_access_grants`: `infra/adapters/protectedAccessPort.ts` (весь файл — `issueAccess()`
не вызывается ни одним обработчиком **и** заглушен отсутствием env), `infra/db/repos/reminders.ts:507–534`
(`createContentAccessGrant`), `infra/db/writePort.ts:35,1457–1471`, `kernel/contracts/ports.ts:62,278`,
`kernel/contracts/schemas.ts:237`, `infra/db/schema/integratorDomainRepos.ts:75`,
`infra/db/integratorDrizzleSchema.ts:11,30`, `app/di.ts:45,271,281`.

Drizzle-объявления, привязанные к схеме `integrator` (то есть указывающие на реально снесённые таблицы):
**одно** — `messageRetryJobs` в `src/infra/db/schema/integratorQueues.ts:62`
(`integratorSchema.table('message_retry_jobs', …)`) и `contentAccessGrants` в
`integratorDomainRepos.ts:75`.

### 4.2 `apps/webapp` — 6 файлов рантайма

| Файл | Строки | Что делает |
|---|---|---|
| `src/infra/repos/pgMessengerPhoneHttpBind.ts` | 84 (`users`), 114/127/132/148/168 (`identities`), **181 (DELETE contacts)**, **190 (INSERT contacts)** | **вторая, независимая реализация `setUserPhone`** ← живой роут `app/api/integrator/messenger-phone/bind/route.ts:79` |
| `src/infra/platformUserFullPurge.ts` | 418, 432, **453 (DELETE contacts)**, **483 (DELETE message_retry_jobs)**, **489 (DELETE users)** | полное удаление пользователя платформы |
| `src/infra/mergePreviewIntegratorUserPresence.ts` | 61 (`integrator.users`) | превью слияния в кабинете (`AdminMergeAccountsPanel.tsx`) |
| `src/infra/strictPlatformUserPurge.ts` | 1 место | строгая чистка |
| `src/infra/repos/pgPatientTelegramUsernameMention.ts` | 7 (`integrator.identities`) | резолв @username пациента |
| `src/app/app/settings/AdminSettingsSection.tsx` | 2 места | текст настройки `integrator_linked_phone_source` |

`packages/platform-merge/src/messengerBindAuditEnrichment.ts:25` — `integrator.identities` в аудит-обогащении.

**Мёртвые Drizzle-артефакты (важно не спутать).** В `apps/webapp/db/schema/schema.ts` объявлены
`telegramUsers:3873`, `contentAccessGrants:3843`, `messageRetryJobs:3950`, `contacts:3492`,
`conversations:3587`, `conversationMessages:3626`, `userQuestions:3656`, `questionMessages:3695`,
`identities:3466`, `users:3520` — **все через голый `pgTable(...)`, то есть схема `public`**.
Проверено запросом по `pg_class`: **ни одной таблицы с такими именами нет ни в одной схеме** ни до сноса,
ни после (в `public` их не было изначально). Это остатки drizzle-introspect. Плюс `relations.ts:74,600,670,672`.

### 4.3 Скрипты и деплой

| Файл | Строки | Класс |
|---|---|---|
| `deploy/postgres/p0-5b-grants.sql` | 58–76 (11 строк), 267–275 (patient-список) | 🔴 **падает** — см. §5.3. Файл генерируемый: править `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs` |
| `deploy/postgres/p0-5-role-split.sql` | 90–102 | GRANT-список |
| `deploy/postgres/phase4-locked-helper-rls-policies.sql` | 29–44 и далее | `ALTER TABLE … ENABLE RLS` + `CREATE POLICY` на снесённых |
| `deploy/postgres/phase4-force-rls-cutover.sql` | 235–241 | список `FORCE RLS` — **без единого `to_regclass`-охранника во всём файле** |
| `deploy/postgres/c4-operational-runtime.sql` | 462, 481 | REVOKE/GRANT на `message_retry_jobs` |
| `deploy/postgres/dev-c7-operational-delivery-worker-schema-table-grants.sql` | 20, 59 | GRANT на `message_retry_jobs` |
| `deploy/postgres/integrator-login-public-identity-grants.sql` | 265–278, 390–414 (23 строки) | REVOKE/GRANT по `identities`/`users`/`contacts`/`conversations`/`conversation_messages` |
| `deploy/host/assert-c4-operational-runtime-ready.sh` | 106 | пробник: `UPDATE integrator.message_retry_jobs SET id=id WHERE false` |
| `scripts/deploy-saas-667.sh` | 485–487, 503, 551 | `FOREACH` по списку таблиц + `count(*) … WHERE organization_id IS NULL` + `RAISE EXCEPTION` |
| `scripts/check-telegram-users.ts` | весь файл | одноразовый отладочный скрипт |
| `apps/webapp/scripts/backfill-reminders-domain.mjs` | 69, 140, 209, 260 | backfill |
| `apps/webapp/scripts/reconcile-reminders-domain.mjs` | 67, 109 | сверка |
| `apps/webapp/scripts/backfill-communication-history.mjs` | 73–74, 135–136, 198, 250–251 | backfill кластера поддержки |
| `apps/webapp/scripts/reconcile-communication-domain.mjs` | 71, 86, 101, 114 | сверка |
| `apps/webapp/scripts/backfill-person-domain.mjs` | 100, 115, 127 | backfill |
| `apps/webapp/scripts/reconcile-person-domain.mjs` | 63–64, 69 | сверка |
| `apps/webapp/scripts/user-phone-admin.ts` | 276, 365 | админ-утилита |
| `apps/webapp/scripts/integrator-schema-cleanup/{01_audit,03_reconcile,05_drop_deprecated}.ts` | 9 мест | реестр уборки |

### 4.4 Миграции (не трогать — журнал)

184 ссылки в `apps/integrator/src/infra/db/migrations/` и `apps/webapp/db/drizzle-migrations/`.
**Три миграции сноса уже лежат в репозитории** (коммит `630994462`), но применены НЕ были:
`core/20260808_0001_drop_legacy_telegram_users.sql`, `…_0002_drop_legacy_user_reminder_rules.sql`,
`…_0003_drop_dead_content_access_grants.sql`. Для остальных 8 миграций сноса **нет** — см. §7.1.

---

## 5. КТО УПАЛ — живой прогон, сборка, тесты, деплой

### 5.1 🔴 Рантайм: TEST-воркер доставки умер в момент сноса и лежит до сих пор

Самое сильное доказательство. На боксе живут systemd-юниты, работающие против `bersoncarebot_test`.

```
bersoncarebot-worker-test.service     active running   ← СЛОМАН СНОСОМ
bersoncarebot-api-test.service        active running   ← без изменений
bersoncarebot-webapp-test.service     active running   ← без изменений
bersoncarebot-scheduler-test.service  active running   ← сломан ДО сноса (см. 5.5)
```

Граница чистая, до секунды:

```
journalctl -u bersoncarebot-worker-test  --until 23:11  → "tick failed": 0 раз
journalctl -u bersoncarebot-worker-test  первая ошибка  → Aug 08 23:11:37  "Runtime worker tick failed"
                                          и дальше каждые 5 секунд, непрерывно
postgres.log 23:11:37.387  bcb_test_operational_delivery_login@bersoncarebot_test
  ERROR: relation "integrator.message_retry_jobs" does not exist at character 44
  STATEMENT: WITH stale AS (SELECT id FROM integrator.message_retry_jobs WHERE status='processing' …)
```

**Масштаб поломки шире, чем «одна очередь».** Падает `queue.reclaimStaleProcessing(...)` — это **первый**
вызов внутри `jobQueueLoop` (`runtime/worker/main.ts:78`). Исключение убивает весь виток цикла, поэтому
**`claimDueJobs` и вся выдача заданий не выполняются вообще** — не только ретраи. Второй цикл
(`projection outbox`) живёт в отдельном `Promise` и не задет.

За 11 минут наблюдения — 132 отказа. На TEST живых пользователей нет (`test-has-no-real-users-only-owner`),
так что реального ущерба людям нет, но **на проде тот же снос остановил бы всю доставку сообщений**.

### 5.2 Рантайм: вебапп

Dev-вебапп (`127.0.0.1:5200`) поднялся и работает. С сессией `dev:admin` пройдены
`/app/doctor`, `/app/doctor/clients`, `/app/settings`, `/app/admin/system-health` — **все 200, в логе
Next.js ни одной ошибки БД**. Кабинет врача снос не заметил: он читает `public.*`.

Ломаются точечные пути. Проверено прямым выполнением SQL каждого сайта против `bcb_webapp_dev`
(`search_path=integrator,public`) — **14 из 14 дают `42P01 relation … does not exist`**:

| Сайт | Ошибка |
|---|---|
| `pgMessengerPhoneHttpBind.ts:84` | `relation "users" does not exist` |
| `pgMessengerPhoneHttpBind.ts:114,132` | `relation "identities" does not exist` |
| `pgMessengerPhoneHttpBind.ts:181,190` | `relation "contacts" does not exist` |
| `platformUserFullPurge.ts:483` | `relation "message_retry_jobs" does not exist` |
| `mergePreviewIntegratorUserPresence.ts:61` | `relation "integrator.users" does not exist` |
| `pgPatientTelegramUsernameMention.ts:7` | `relation "integrator.identities" does not exist` |
| `messengerBindAuditEnrichment.ts:25` | `relation "integrator.identities" does not exist` |
| `messageThreads.ts:229 / 572 / 601` | `conversations` / `user_questions` / `question_messages` |
| `mergeIntegratorUsers.ts:433` | `content_access_grants` |
| backfill/reconcile напоминаний | `user_reminder_rules` |
| `check-telegram-users.ts:20` | `telegram_users` |

### 5.3 Деплой: гейт P0.5b падает

```
sudo -u postgres psql -v ON_ERROR_STOP=1 -d bcb_webapp_dev -f deploy/postgres/p0-5b-grants.sql
→ exit=3
→ psql:428: ERROR: relation "integrator.contacts" does not exist
```

Ровно тот класс отказа, который предсказан документом 17 §Шаг 2: `GRANT … ON TABLE %I.%I` без проверки
существования, применяется с `ON_ERROR_STOP=1`. **Шаг установки стены P0.5b валит деплой целиком.**
По той же схеме, без охранников, упадут `phase4-force-rls-cutover.sql` (в файле **0** `to_regclass`/`IF EXISTS`),
`deploy-saas-667.sh:485/551` и пробник `assert-c4-operational-runtime-ready.sh:106`.

### 5.4 Сборка: 0 ошибок в обоих приложениях

```
pnpm -C apps/webapp    typecheck  → exit 0
pnpm -C apps/integrator typecheck → exit 0
```

**Это не «повезло», а свойство архитектуры, и его надо понимать:** весь доступ к 11 таблицам идёт через
`sql`-шаблоны, а не через типизированные Drizzle-объекты. Единственные Drizzle-объявления с реальной
привязкой к схеме `integrator` — `messageRetryJobs` и `contentAccessGrants`; они компилируются независимо
от наличия таблицы в базе. **TypeScript не может увидеть этот снос в принципе.**

### 5.5 Тесты: НИ ОДИН не упал

| Прогон | Результат |
|---|---|
| `apps/integrator`: `deliveryContract`, `jobQueue.abstime.integration`, `messengerPhoneLink.identity`, `canonicalAfterMerge`, `userUpsert.identity` | 34 passed, 1 expected fail, 3 skipped — **зелено** |
| `apps/webapp` `test:postgres` (39 файлов) | **130 passed, 0 failed** |

Причины (обе — самостоятельные находки, а не оправдание):
1. Юнит- и контрактные тесты замоканы: `jobQueue.abstime.integration.test.ts` включается только при
   `RUN_JOB_QUEUE_ABSTIME_TEST=1 && USE_REAL_DATABASE=1` — то есть по умолчанию **skip**.
2. `test:postgres` **строит собственную базу из цепочки миграций** (`count=377`), а цепочка все 11 таблиц
   по-прежнему СОЗДАЁТ. Тесты видят мир, где таблицы есть.

**Вывод: у этих 11 таблиц нет тестового покрытия на уровне БД вообще.** Зелёный CI после сноса — не
доказательство работоспособности, а доказательство слепоты набора тестов к этому классу изменений.

### 5.6 Что НЕ упало из-за сноса (важно не приписать)

| Симптом | Причина | С какого момента |
|---|---|---|
| `bersoncarebot-scheduler-test` — «tick failed» каждые 5 с, `42501 permission denied for table operator_job_status` / `for function current_org_id` | права роли, к сносу отношения нет | **с 2026-08-02**, 155 508 записей в логе |
| dev-интегратор (`pnpm --dir apps/integrator dev`) не стартует | (а) `Integrator startup migration gate failed: 3 discovered migration(s) are not applied` — те самые `20260808_000{1,2,3}` из коммита `630994462`, которых нет в журнале dev; (б) `DATABASE_URL_DIAGNOSTIC is required … in locked mode` | до сноса |
| `check-p0-10-tier-completeness.mjs` / `check-saas-db-regression` FAIL: «IN TSV, NO CODE: integrator.content_access_grants, integrator.telegram_users, integrator.user_reminder_rules» | проверка **статическая** (в скрипте нет ни одного обращения к `DATABASE_URL`), читает код и миграции; сломана коммитом с тремя миграциями сноса | до сноса |
| `check-new-table-rls-coverage.mjs` | PASS | — |

---

## 6. ПЛАН ПЕРЕПИСЫВАНИЯ

Группировка по стоимости решения, а не по таблицам.

### (в) МЁРТВЫЙ КОД — удалять целиком, замена не нужна

| Что | Где | Доказательство мёртвости |
|---|---|---|
| Вся ветка `content_access_grants` в интеграторе | `adapters/protectedAccessPort.ts` (весь файл), `repos/reminders.ts:507–534`, `writePort.ts:35,1457–1471`, `kernel/contracts/ports.ts:62,278`, `kernel/contracts/schemas.ts:237`, `schema/integratorDomainRepos.ts:75`, `integratorDrizzleSchema.ts:11,30`, `app/di.ts:45,271,281` | `issueAccess()` не вызывается ни одним обработчиком; заглушен отсутствием env; `n_tup_ins = 0` за всю историю; таблица 0 строк в обеих базах. Живая замена `public.content_access_grants_webapp` уже подключена к пациентскому UI (`pgEntitlements.ts`) |
| `resolvePatientTelegramUsernameMention` + `pgPatientTelegramUsernameMention.ts` | `apps/webapp/src/app-layer/messaging/`, `src/infra/repos/` | **ноль потребителей во всём репозитории** (проверено `rg` по всем каталогам) |
| `scripts/check-telegram-users.ts` | весь файл | одноразовый отладочный скрипт по снесённой таблице |
| `check-d30-legacy-message-retry-drain-concurrency.ts` | весь файл | одноразовый диагностический скрипт |
| Мёртвые Drizzle-артефакты | `apps/webapp/db/schema/schema.ts:3466,3492,3520,3587,3626,3656,3695,3843,3873,3950` + `relations.ts:74,600,670,672` | голый `pgTable` → схема `public`, где таких таблиц не было НИКОГДА (проверено по `pg_class`); потребителей ноль |
| Скрипты backfill/reconcile легаси-доменов | `backfill-reminders-domain.mjs`, `reconcile-reminders-domain.mjs`, `backfill-communication-history.mjs`, `reconcile-communication-domain.mjs`, `backfill-person-domain.mjs`, `reconcile-person-domain.mjs`, `integrator-schema-cleanup/*` | перенос выполнен и подтверждён замерами; источник снесён — сверять больше не с чем |

### (а) ТРИВИАЛЬНОЕ ПЕРЕПИСЫВАНИЕ — приёмник известен, решений не требуется

| Сайт | Что делал | Чем заменить | Правка |
|---|---|---|---|
| `jobQueue.ts:57,64,99,104` | claim/reclaim из `integrator.message_retry_jobs` | `public.outgoing_delivery_queue` — уже канон, 2666 строк в dev против 113 в снесённой | заменить имя таблицы и колонки в 4 запросах; семантика `status/next_try_at/attempts` уже есть в очереди |
| `operationalPoolReadiness.ts:30` | пробник готовности | убрать строку (`public.outgoing_delivery_queue` уже проверяется строкой ниже) | −1 строка |
| `assert-c4-operational-runtime-ready.sh:106` | `UPDATE integrator.message_retry_jobs SET id=id WHERE false` | убрать фрагмент | −1 фрагмент |
| `c4-operational-runtime.sql:462,481`, `dev-c7-…-grants.sql:20,59` | GRANT/REVOKE | убрать строки | — |
| `platformUserFullPurge.ts:483` | `DELETE FROM message_retry_jobs` | `DELETE FROM public.outgoing_delivery_queue WHERE …` | 1 запрос |
| `mergeIntegratorUsers.ts:433` | `UPDATE content_access_grants SET user_id` | удалить строку (переклейка нуля строк) | −1 строка; **снимает единственный риск 500 на живом M2M-роуте** |
| `adminStats.ts:51,58` | счётчики по `contacts`/`identities` для `/admin_users` | `public.user_channel_bindings` + `public.platform_users.phone_normalized` | 2 запроса |
| `doctorBroadcastIntentMenu.ts:65` | `FROM contacts` | `public.platform_users` / `public.user_contacts` | 1 запрос |
| `p0-5b-grants.sql` (генератор `p0-5b-grants-sql.mjs`) | GRANT-списки | добавить 11 таблиц в набор исключений — механизм уже есть (`r7DroppedRawRubitimeTables`, `:117`, комментарий описывает ровно этот класс отказа), затем регенерировать файл | правка генератора |
| `p0-5-role-split.sql:90–102`, `phase4-locked-helper-rls-policies.sql:29+`, `phase4-force-rls-cutover.sql:235–241`, `integrator-login-public-identity-grants.sql:265–278,390–414`, `deploy-saas-667.sh:485–487,503,551` | списки таблиц | вычеркнуть 11 имён | — |
| `check-p0-10-tier-completeness.mjs` + `tiers-218.tsv` | реестр тиров | убрать 11 строк | — |
| `user-phone-admin.ts:276,365`, `AdminSettingsSection.tsx` | админ-утилита и текст настройки | `public.user_contacts`; текст поправить | — |

### (б) ТРЕБУЕТ РЕШЕНИЯ — не переписывать, пока не выбрано

**б-1. Кластер поддержки: `conversations` + `conversation_messages` + `user_questions` + `question_messages`
(31 место в `messageThreads.ts`).** Приёмники существуют и УЖЕ наполнены:
`public.support_conversations` 257, `support_conversation_messages` 823, `support_questions` 26,
`support_question_messages` 39. Более того, дуальная запись в них **уже написана** —
`infra/db/directPublic/writeSupportConversationsDirect.ts`. Решить надо не «куда», а:
- снимать ли локальную половину дуальной записи в `writePort.ts:602/720/810/882/992/1096` одним коммитом
  или поэтапно;
- 🔴 **потерян инвариант «одна открытая беседа на канал».** Снесённая `conversations` держала уникальный
  частичный индекс `conversations_open_user_source_uidx (user_identity_id, source) WHERE closed_at IS NULL
  AND status <> 'closed'`. **Аналога в `public.support_conversations` НЕТ** — замерено по `pg_indexes`:
  там только `UNIQUE(integrator_conversation_id)` и `UNIQUE(id)`. То есть после переезда база перестаёт
  физически запрещать две открытые беседы на один канал. Это отдельная миграция, а не строчка правки;
- куда переезжает крон `auto-close-stale-conversations.ts`.

**б-2. `contacts` — снимать надо ДВЕ независимые реализации `setUserPhone`.** Интегратор
(`channelUsers.ts:737,749`) и вебапп (`pgMessengerPhoneHttpBind.ts:181,190`) — это не «репозиторий и его
вызов», а два самостоятельных писателя со своими HTTP-входами. Плюс переключатель
`repos/linkedPhoneSource.ts` по умолчанию стоит в `public_then_contacts` — то есть **фолбэк на снесённую
таблицу зашит в дефолт**. Решение: перевести дефолт в `public_only`, дождаться окна без событий
`linked_phone_legacy_fallback` (`channelUsers.ts:526`), и только потом резать. Приёмник:
`public.user_contacts` (457) / `platform_users.phone_normalized`.

**б-3. `identities` + `users` — самое дорогое, и данные к переезду НЕ готовы.** 22 места в интеграторе
(`channelUsers.ts` — 16, `messageThreads.ts` — 4, `mergeIntegratorUsers.ts` — 6, `canonicalUserId.ts` — 2)
плюс 8 в вебаппе. Три отдельных решения:
- **зеркалирование не закончено:** документ 17 §«Отдельно» замерил `users` → `platform_users` **91 %**
  (122 из 134), из 12 непокрытых 2 недостижимы даже через `user_channel_bindings`. Что делать с этими
  строками — вопрос владельца, а не инженерное решение;
- **`message_drafts` и `telegram_state` остались с оборванными FK** (CASCADE их снял) — перевесить на
  `public.user_channel_bindings.id` требует, чтобы у каждой строки нашлась пара;
- **RLS-политику `message_drafts` надо переписать**, а не восстановить: её условие джойнит снесённую
  `identities`. Пока политики нет, таблица под `FORCE RLS` отдаёт 0 строк всем (§3.1).

**б-4. `message_retry_jobs` — 30 непровязанных `pending` (20 dev + 10 test).** Формально (а) тривиально,
но самые дальние `next_try_at` — до 2026-08-29 16:59. Условие разблокировки из документа 17 —
«дождаться `pending = 0`, не раньше 2026-08-29 17:00». Сейчас они снесены и лежат только в дампе.
Решение владельца: долить эти 30 строк в `public.outgoing_delivery_queue` при обратном переносе или
считать потерянными (на TEST/DEV живых адресатов нет — потери людей нет).

**б-5. `user_reminder_rules` — вернуть или нет.** Живых читателей у неё нет (RLS-политики
`user_reminder_occurrences`/`user_reminder_delivery_logs` давно переписаны на `public.reminder_rules` —
проверено по `pg_policies`, а не по тексту миграции). Но `public.reminder_rules` содержит 46 строк против
27 в снесённой, и связь идёт через `integrator_rule_id`. Проверить, что все 27 покрыты, — до окончательного
решения.

---

## 7. ЧТО УДИВИЛО

1. **🔴 `CASCADE` не «снял стену», а заклинил таблицу.** Документ 17 предсказывал утечку. По факту
   `message_drafts` имеет `FORCE RLS`, и снятие единственной политики превратило её в deny-all: 17 строк
   есть в `pg_class`, владелец таблицы видит 0. PostgreSQL здесь fail-closed. Правило на будущее:
   **«последняя политика на FORCE-RLS таблице» — это не безопасность, это выключатель таблицы.**
2. **🔴 Ни typecheck, ни тесты не видят снос таблицы — вообще.** 0 ошибок компиляции в обоих приложениях,
   0 упавших тестов из 164. Причина структурная: доступ идёт через `sql`-шаблоны (TS слеп по построению),
   а интеграционные тесты строят свою базу из цепочки миграций, которая все 11 таблиц по-прежнему создаёт.
   **Из этого следует, что «зелёный CI» для этого класса изменений не значит ничего** — единственный
   надёжный детектор оказался живой воркер.
3. **🔴 Снос НЕ воспроизводится из репозитория.** Миграции создают все 11; миграции сноса есть только для
   3 (и те не применены на dev). Свежая база из `pnpm run migrate` вернёт 8 таблиц обратно. Сейчас
   `bcb_webapp_dev`/`bersoncarebot_test` **разошлись с цепочкой миграций** — это состояние надо либо
   закрепить миграциями на оставшиеся 8, либо откатить.
4. **Гейт старта интегратора сработал раньше рантайма и по другой причине.** Dev-интегратор не поднимается
   не из-за сноса, а потому что три миграции `20260808_*` лежат в репозитории и не применены —
   `verifyStartupMigrationState` в `locked`/`shadow` не даёт процессу встать. То самое свойство, о котором
   предупреждал документ 17 §3.2: **файлы миграций в репозитории — это гейт запуска**, и они уже
   заблокировали dev, ещё до всякого сноса.
5. **Живой TEST-воркер оказался единственным честным детектором.** 132 отказа за 11 минут, граница до
   секунды (23:11:37), первый вызов в цикле — `reclaimStaleProcessing`, поэтому умер **весь** job-цикл,
   а не только ретраи. Ни один статический инструмент этого не показал.
6. **Кабинет врача не заметил сноса совсем.** `/app/doctor`, `/app/doctor/clients`, `/app/settings`,
   `/app/admin/system-health` — 200 и чистый лог. Легаси-схема из doctor-UI уже полностью вычищена;
   вся оставшаяся связность — в интеграторе и в 6 точечных файлах вебаппа.
7. **Часть «поломок» оказалась чужой.** `bersoncarebot-scheduler-test` падает **с 2026-08-02** (155 508
   записей `42501` в логе PostgreSQL) — к сносу отношения не имеет. `check-p0-10-tier-completeness`
   сломан коммитом с миграциями сноса, а не самим сносом: скрипт статический, в нём нет ни одного
   обращения к базе. Оба легко было бы записать себе в результат — не записаны.
8. **`p0-5b-grants.sql` упал на 428-й строке, применённый частично.** Это и есть поведение деплоя:
   `ON_ERROR_STOP=1` останавливает шаг на середине, оставляя половину грантов применённой. Не «предупредит»,
   а именно окирпичит шаг установки стены.
9. **Единственный настоящий блокер `DROP` — не код, а два FK и одна политика.** 10 из 11 таблиц снялись
   обычным `DROP TABLE` без `CASCADE` в обеих базах. Вся «связность» легаси-набора, которой боялись,
   оказалась внутренней: наружу торчали ровно три объекта, и все три — от `identities`.
