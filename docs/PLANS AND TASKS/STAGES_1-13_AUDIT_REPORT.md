# Полная ревизия этапов 1–13 (DB Zones Restructure)

Дата ревизии: 2026-03-19.  
Основа: [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md) и текущее состояние кодовой базы.

---

## 1. Сводка по этапам

| Этап | Ожидание по плану | Факт | Оценка |
|------|-------------------|------|--------|
| **0** | Ownership map, таблица table→owner→source→projection→deprecation | Реестр в DB_MIGRATION_PREPARATION_FOUNDATION.md; финальная карта в STAGE13_OWNERSHIP_MAP.md | Выполнено |
| **1** | Safety rails: backup, pre/post checklist, webapp migration safeguards, reconciliation scripts | Backup в deploy-prod; webapp имеет schema_migrations и транзакции; чеклист в Foundation частично; webapp-only backup не добавлен | Частично |
| **2** | Projection contract: outbox, idempotency, retry/DLQ, bigint-safe | projection_outbox, projectionKeys (детерминированный ключ), worker с retry/DLQ, контракт ID в основном string | Выполнено |
| **3** | Patient master в webapp: схема, backfill, projection, read с webapp | 006/008, backfill-person-domain, projection user/contact/preferences, deliveryTargetsPort | Выполнено |
| **4** | Стабилизация person: reconcile, убрать legacy reads, cutover rules | reconcile-person-domain (с маппингом topics), contextQuery без legacy при наличии deliveryTargetsPort | Выполнено |
| **5** | Communication history в webapp | 009 support_*, backfill-communication-history, projection, communicationReadsPort | Выполнено |
| **6** | Стабилизация communication | reconcile-communication-domain, readPort делегирует в communicationReadsPort | Выполнено |
| **7** | Reminders + content access в webapp | 010, backfill-reminders-domain, projection, remindersReadsPort | Выполнено |
| **8** | Стабилизация reminders | reconcile-reminders-domain, readPort делегирует в remindersReadsPort | Выполнено |
| **9** | Appointments view в webapp | 011 appointment_records, backfill-appointments-domain, projection, appointmentsReadsPort | Выполнено |
| **10** | Стабилизация appointments | reconcile-appointments-domain, stage9-gate | Выполнено |
| **11** | Subscription/mailing + channel analytics в webapp | 012, backfill-subscription-mailing, projection (без записи в legacy таблицы), subscriptionMailingReadsPort | Частично (analytics) |
| **12** | Стабилизация subscription/mailing | reconcile-subscription-mailing-domain, stage11/12-gate | Выполнено |
| **13** | Cleanup legacy: freeze, мониторинг, ownership map, gate | Freeze mailing_topics/user_subscriptions, projection health, STAGE13_OWNERSHIP_MAP, stage13-gate | Выполнено |

---

## 2. Этап 0 — Ownership map и migration rules

**Ожидание:** Единый документ: table → owner → source of truth → projection target → deprecation plan; все таблицы по зонам; migration path по доменам.

**Факт:**
- В [DB_MIGRATION_PREPARATION_FOUNDATION.md](./DB_MIGRATION_PREPARATION_FOUNDATION.md) есть реестр таблиц integrator (core, telegram, rubitime) и webapp с колонками current_owner, target_owner, zone, migration_path.
- В [docs/ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md](../ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md) зафиксирован финальный статус по доменам (keep raw, keep runtime, shadow only, frozen legacy, cleanup pending).

**Отклонения:** Нет. Два документа дополняют друг друга (подготовительный реестр + итоговая карта после Stage 13).

---

## 3. Этап 1 — Safety rails для миграций и переноса данных

**Ожидание:**
- Подтвердить и описать обязательный backup для обеих БД перед миграциями.
- Явный pre-migration и post-migration verification checklist.
- Закрыть риск webapp migrations (безопасный повторный прогон).
- Reconciliation/verification scripts для сравнения old/new.

**Факт:**
- **Backup:** В `deploy/host/deploy-prod.sh` перед миграциями вызывается `sudo -n "${BACKUP_SCRIPT}" pre-migrations`. В Foundation зафиксировано: не определено, делает ли скрипт дамп обеих БД (integrator + webapp) или одной. В deploy-prod одна команда backup — список database names не зафиксирован в репо.
- **Webapp-only deploy:** В `deploy/host/deploy-webapp-prod.sh` нет шага backup перед `pnpm --dir apps/webapp run migrate`. Foundation явно называет это риском.
- **Webapp migration safeguards:** В `apps/webapp/scripts/run-migrations.mjs` есть таблица `schema_migrations`, каждая миграция в транзакции, уже применённые пропускаются. Миграции 004/005 содержат DROP и пересоздание — повторный прогон на чистой БД безопасен, на БД с данными без ledger был бы риск; ledger сейчас есть.
- **Checklist:** В Foundation раздел 7 «Readiness checklist: ready_for_stage_2» есть чеклист, но он не превращён в операционный pre/post migrate runbook в deploy. Отдельно добавлен [deploy/DATA_MIGRATION_CHECKLIST.md](../../deploy/DATA_MIGRATION_CHECKLIST.md) для порядка backfill/reconcile/gate.
- **Reconciliation scripts:** По каждому домену есть reconcile-*-domain.mjs (person, communication, reminders, appointments, subscription-mailing).

**Отклонения и уязвимости:**

1. **Критично: Webapp-only deploy без backup**  
   При деплое только webapp (`deploy-webapp-prod.sh`) перед `pnpm --dir apps/webapp run migrate` не выполняется backup. При падении или ошибочной миграции откат без снимка БД невозможен.  
   **Рекомендация:** Добавить в deploy-webapp-prod.sh вызов backup (тот же или отдельный скрипт) перед migrate и зафиксировать в HOST_DEPLOY_README.

2. **Средне: Не зафиксировано, какие БД попадают в pre-migrations backup**  
   Foundation просил «до первого data move зафиксировать в runbook хоста фактическое поведение postgres-backup.sh и список включаемых database names». В репозитории этого нет — поведение зависит от хоста.  
   **Рекомендация:** В HOST_DEPLOY_README или отдельном runbook описать контракт: скрипт должен делать дамп обеих БД (integrator и webapp), используемых в deploy-prod, или явно указать «только integrator» и ввести отдельный регламент для webapp.

3. **Низко: Нет единого операционного pre/post migrate checklist**  
   Есть readiness checklist в Foundation и DATA_MIGRATION_CHECKLIST для backfill. Отдельного «перед/после каждой миграции» чеклиста (например, проверка схемы, счетчиков строк) в коде/deploy нет.  
   **Рекомендация:** При необходимости добавить в deploy краткий pre/post migrate checklist (например, в README или в комментариях скрипта).

---

## 4. Этап 2 — Projection contract (integration → webapp)

**Ожидание:** Единый durable projection (outbox, retry, DLQ), группы событий, детерминированный idempotency key, bigint-safe ID, out-of-order handling.

**Факт:**
- `projection_outbox` (миграция 20260319_0001), статусы pending/processing/done/dead, retry через worker, DLQ при исчерпании попыток.
- `projectionKeys.projectionIdempotencyKey(eventType, stableId, payloadFingerprint)` — детерминированный ключ без Date.now() для бизнес-событий.
- writePort везде использует projectionIdempotencyKey для событий проекции.
- Webapp events: POST /api/integrator/events, приём в events.ts; deliveryTargetsPort для person/channel lookup.
- В readPort и API передача ID в виде string (integrator_user_id и т.д.) — bigint-safe.
- В `webappEventsClient.ts` fallback idempotency key строится из hash тела — при отсутствии ключа в событии дедупликация по телу.

**Отклонения и уязвимости:**

1. **Низко: eventId с Date.now() для message-retry**  
   В `writePort.ts` при отправке события повторной отправки сообщения используется  
   `eventId: \`message-retry:${phoneNormalized}:${Date.now()}\``.  
   Это не idempotency key проекции, а идентификатор конкретной попытки; для таких событий дедупликация по времени допустима. Guardrail («не строить ключ на Date.now() для событий, которые должны дедуплицироваться») не нарушен.  
   **Рекомендация:** Оставить как есть; при желании в комментарии в коде явно указать, что это намеренно уникальный идентификатор попытки.

2. **Низко: Timestamp в заголовках запросов к webapp**  
   В deliveryTargetsPort, communicationReadsPort, remindersReadsPort, appointmentsReadsPort для подписи запроса используется `String(Math.floor(Date.now() / 1000))`. Это не ключ дедупликации, а параметр подписи. Нарушений нет.

---

## 5. Этапы 3–4 — Patient master: миграция и стабилизация

**Ожидание:** Целевая модель в webapp, backfill, projection, product read с webapp, reconcile, убрать legacy product read для person.

**Факт:**
- Схема: 006 platform_users, user_channel_bindings; 008 integrator_user_id, user_notification_topics. Notification flags (notify_spb и т.д.) проецируются в topic_code (booking_spb и т.д.) в backfill и в reconcile (после исправления маппинга).
- backfill-person-domain: users, contacts, identities, telegram_state → platform_users, bindings, notification_topics; idempotent по integrator_user_id; запросы по массиву user id используют `unnest($1::text[])::bigint` (bigint-safe).
- contextQueryPort: при наличии deliveryTargetsPort channel.lookupByPhone и subscriptions.forUser идут в webapp; при отсутствии возвращают null/[] без обращения к legacy read.
- reconcile-person-domain после правки использует тот же NOTIFY_TOPIC_MAP (notify_* → topic_code), сравнение тем корректно.
- DI: deliveryTargetsPort всегда создаётся и передаётся в contextQueryPort.

**Отклонения:** Существенных нет. Исправление маппинга тем в reconcile и bigint-safe запросы в backfill уже внесены ранее.

---

## 6. Этапы 5–6 — Communication history: миграция и стабилизация

**Ожидание:** Треды, сообщения, вопросы в webapp; projection; product read с webapp; reconcile; убрать legacy product read.

**Факт:**
- Схема 009: support_conversations, support_conversation_messages, support_questions, support_question_messages с integrator_* id.
- backfill-communication-history.mjs есть.
- writePort шлёт support.conversation.*, support.question.* в projection; idempotency через projectionIdempotencyKey.
- readPort: conversation.byId, conversation.listOpen, questions.unanswered, question.byConversationId при наличии communicationReadsPort делегируют в webapp; при отсутствии — fallback на integrator (для dev).
- reconcile-communication-domain есть. stage6-gate вызывает projection-health и reconcile.

**Отклонения:** Нет. Fallback на integrator при не настроенном webapp — осознанный режим для разработки.

---

## 7. Этапы 7–8 — Reminders и content access: миграция и стабилизация

**Ожидание:** Правила напоминаний, content access в webapp; projection; product read с webapp; reconcile; убрать legacy product read для reminders.

**Факт:**
- Схема 010: reminder_rules, reminder_occurrence_history, reminder_delivery_events, content_access_grants_webapp с integrator_* id.
- backfill-reminders-domain есть.
- writePort шлёт REMINDER_RULE_UPSERTED, REMINDER_OCCURRENCE_FINALIZED, REMINDER_DELIVERY_LOGGED, CONTENT_ACCESS_GRANTED в projection.
- readPort reminders.rules.forUser и reminders.rule.forUserAndCategory требуют remindersReadsPort (при отсутствии — throw). reminders.occurrences.* и reminders.due остаются на integrator (runtime).
- reconcile-reminders-domain есть. stage7-gate есть.

**Отклонения:** Нет.

---

## 8. Этапы 9–10 — Appointments: миграция и стабилизация

**Ожидание:** Product view записей на приём в webapp; projection из rubitime; product read с webapp; reconcile; убрать legacy product read.

**Факт:**
- Схема 011: appointment_records (integrator_record_id, phone_normalized, status, payload_json и т.д.).
- backfill-appointments-domain есть; integrator_record_id передаётся как string.
- writePort шлёт APPOINTMENT_RECORD_UPSERTED в projection.
- readPort booking.byExternalId и booking.activeByUser требуют appointmentsReadsPort (throw при отсутствии). contextQueryPort bookings.forUser идёт через readPort → appointmentsReadsPort.
- reconcile-appointments-domain есть. stage9-gate есть.

**Отклонения:** Нет. Семантика «forUser» (userId в contextQuery может быть phone или integrator user id) должна совпадать с тем, как webapp API активных записей принимает параметр; при расхождении возможна ошибка привязки — при необходимости проверить по коду webapp API.

---

## 9. Этапы 11–12 — Subscription/mailing и стабилизация

**Ожидание:** mailing_topics, user_subscriptions, mailing_logs в webapp; projection; product read с webapp; channel analytics и SMS delivery accounting в webapp; reconcile; убрать legacy product read/write.

**Факт:**
- Схема 012: mailing_topics_webapp, user_subscriptions_webapp, mailing_logs_webapp.
- backfill-subscription-mailing-domain есть; id передаются как string (bigint-safe).
- writePort для mailing.topic.upsert и user.subscription.upsert только пишет в projection_outbox, не в локальные mailing_topics/user_subscriptions (legacy write убран).
- Таблицы mailing_topics и user_subscriptions в integrator заморожены миграцией (триггеры запрещают INSERT/UPDATE/DELETE).
- readPort mailing.topics.list и subscriptions.byUser идут через subscriptionMailingReadsPort (при отсутствии — пустой массив).
- reconcile-subscription-mailing-domain есть. stage11-gate, stage12-gate есть.

**Отклонения и недоделки:**

1. **Средне: Channel analytics / SMS delivery accounting**  
   В плане этапа 11: «Channel analytics и SMS delivery accounting: журнал отправленных сообщений, доставлено/не доставлено, количество SMS и статусы, payload summary, channel-level aggregates».  
   В webapp есть message_log (аудит сообщений врача), но отдельного переноса/проекции integrator.delivery_attempt_logs в webapp для единой «channel analytics» и SMS-учёта в коде не видно. Foundation упоминал перекрытие message_log и delivery_attempt_logs и необходимость стратегии.  
   **Рекомендация:** Явно зафиксировать в ownership map или в плане Stage 14: что считается «channel analytics» после 13-го этапа (только message_log webapp или также проекция delivery_attempt_logs). При необходимости запланировать отдельную задачу на аналитику доставки/SMS.

---

## 10. Этап 13 — Cleanup и деактивация legacy

**Ожидание:** Оставшиеся UI/API чтения на webapp; запрет новых product writes в integrator; мониторинг projection; freeze/архив legacy таблиц; убрать устаревшие read/write paths; final ownership map; оставить только нужные shadow/runtime таблицы.

**Факт:**
- Product reads переведены на webapp (через *ReadsPort и deliveryTargetsPort); при не настроенном webapp — fallback или пустой результат/throw по домену.
- Новые product writes для subscription/mailing в integrator отключены (только проекция); таблицы заморожены триггером.
- Projection health: getProjectionHealth (pending, dead, oldestPendingAt, lastSuccessAt, retriesOverThreshold), isProjectionHealthDegraded; projection-health.mjs для gate; используется INTEGRATOR_DATABASE_URL при наличии.
- STAGE13_OWNERSHIP_MAP.md и legacyCleanupMatrix.ts фиксируют статусы таблиц и путей.
- stage13-gate: preflight (stage12-gate + все reconcile) → projection health → опционально e2e при STAGE13_E2E=1. DATA_MIGRATION_CHECKLIST описывает порядок backfill/reconcile/gate при деплое/cutover.

**Отклонения:** Нет. Архитектурно этап 13 выполнен.

---

## 11. Архитектурные нарушения и риски

1. **readPort всё ещё содержит пути к legacy данным**  
   user.lookup, user.byPhone, user.byChannelId, conversation.* (при отсутствии communicationReadsPort), reminders.occurrences.*, reminders.due, stats.adminDashboard читают из integrator. По плану это допустимо: runtime/scheduling и admin stats могут оставаться в integrator. Product-facing reads (conversation для UI, reminders.rules, booking, mailing.topics, subscriptions) переключены на webapp при настроенных портах. Явного нарушения нет.

2. **Условное включение webapp-портов**  
   remindersReadsPort, appointmentsReadsPort, subscriptionMailingReadsPort создаются только при `env.APP_BASE_URL && integratorWebhookSecret().length >= 16`. В prod при корректном env всё подключается. При неполной конфигурации integrator откатывается на legacy read или throw — задокументированное поведение, не нарушение.

3. **Нет удаления legacy таблиц**  
   План этапа 13: «архивировать или freeze», «убрать устаревшие read и write paths». Таблицы не удаляются, только freeze; read paths убраны в смысле «product read идёт с webapp». Соответствует «cleanup по доменам, не одним большим удалением» и готовности к Stage 14.

---

## 12. Итоговая таблица отклонений и действий

| # | Этап | Критичность | Описание | Рекомендация |
|---|------|-------------|----------|--------------|
| 1 | 1 | Высокая | Webapp-only deploy без backup перед migrate | Добавить backup в deploy-webapp-prod.sh и описать в README |
| 2 | 1 | Средняя | Не зафиксировано, какие БД в pre-migrations backup | Описать в runbook/README контракт backup (обе БД или иначе) |
| 3 | 11 | Средняя | Channel analytics / SMS delivery accounting не выделены в webapp | Зафиксировать решение в ownership/плане; при необходимости запланировать проекцию delivery_attempt_logs |
| 4 | 1 | Низкая | Нет единого операционного pre/post migrate checklist в deploy | При необходимости добавить краткий чеклист в README или скрипт |
| 5 | 2 | Низкая | eventId с Date.now() для message-retry | Оставить; при желании добавить комментарий в коде |

---

## 13. Полнота переноса данных (карточки и настройки)

- **Person:** users, contacts, identities, telegram_state (в т.ч. notify_*) → platform_users, user_channel_bindings, user_notification_topics. Backfill и reconcile покрывают; маппинг notify_* → topic_code унифицирован.
- **Подписки на рассылки:** user_subscriptions (после 0010 user_id = users.id), mailing_topics, mailing_logs → webapp-таблицы. Backfill и reconcile есть.
- **Записи на приём:** rubitime_records → appointment_records. Backfill и reconcile есть.
- **Коммуникация, напоминания, content access:** Соответствующие backfill и reconcile имеются.

Целостность: в backfill используются строковые id и unnest::bigint где нужно; upsert по стабильным ключам; повторный прогон идемпотентен. Скрипты переноса при миграции/деплое описаны в DATA_MIGRATION_CHECKLIST; автоматический запуск backfill в deploy не делается намеренно (выполняется вручную при cutover).

---

Документ можно обновлять по мере устранения пунктов из таблицы отклонений и по результатам Stage 14.
