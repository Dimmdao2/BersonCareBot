## КОРОТКИЙ ОТВЕТ

Владелец прав про ядро назначения: integrator должен быть ingress/delivery-адаптером каналов. Но сейчас это не «просто доставка и вебхуки»: внутри живут сценарный движок, напоминания, support-workflow, дневники/ЛФК, booking lifecycle и Google Calendar-логика. То есть транспортная часть есть, но вокруг неё вырос второй application/domain layer.

Tariff lifecycle в самом integrator сейчас не найден: дневник вызывает единый DB-function и читает лишь `mutation_allowed`. Но похожие продуктовые решения остались в reminders, booking, diary-org selection и calendar enrichment.

## Инвентарь

| Ответственность | Файлы / масштаб | Класс | Доказательство |
|---|---:|---|---|
| Telegram/MAX ingress: подписи, парсинг, нормализация update → event, long polling | `integrations/telegram/**` 19 файлов; `max/**` 16 | delivery/ingress | [Telegram webhook](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1), [MAX webhook](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:216) |
| M2M ingress от webapp: SMS, email, OTP, relay, request-contact, merge, reminder-rules, booking, operator routes | 11 POST routes; всего API — 15 routes, включая 2 health GET и 2 provider webhooks | в основном delivery/ingress, но booking/reminder/merge уже не чистый транспорт | [route composition](/home/dev/dev-projects/bcb-wt-tariff/apps/integrator/src/app/routes.ts:116) |
| Провайдерская доставка | Telegram, MAX, SMSC, SMTP email, Web Push; также Google Calendar | delivery | [DI собирает 5 delivery adapters](/home/dev/dev-projects/bcb-wt-tariff/apps/integrator/src/app/di.ts:118) |
| Очередь, retry, delivery audit | `public.outgoing_delivery_queue`, `message_retry_jobs`, worker | delivery — оставить | [outgoing-delivery contract](/home/dev/dev-projects/bcb-wt-tariff/docs/ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md:1), [worker](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1) |
| Channel identity, binding messenger ↔ platform user, entry links | `channelUsers.ts`, `writeIdentityAndPreferencesDirect.ts`, entry-token | ingress, но запись канона должна быть узкой capability main domain | [identity direct writer](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1) |
| Сценарный executor и контентный orchestrator | executor: 11 файлов / 7 764 LOC; content: 163 scenario records | leaked domain logic | [executor](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1), 48 concrete action cases |
| Напоминания: пресеты, recurrence, quiet-hours, состояния occurrence, snooze/skip/mute | `handlers/reminders.ts` 1 930 LOC; `policy.ts`; scheduler | leaked domain logic | [reminder policy](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1) |
| Дневники симптомов / ЛФК | direct writer: 390 LOC, executor actions | leaked domain logic | Пишет `symptom_trackings`, `symptom_entries`, `lfk_complexes`, `lfk_sessions`: [writer](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1) |
| Support conversations/questions | 2 direct-public writer modules, `messageThreads.ts` 739 LOC | leaked product workflow | Пишет `support_conversations`, messages, questions и delivery events: [conversations](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1), [questions](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1) |
| Booking lifecycle + Calendar | `bookingLifecycleRoute.ts` 735 LOC; Google Calendar 9 файлов | leaked domain logic | Сам выбирает последствия `created/cancelled/rescheduled/payment_captured`, тексты, reminders, push и GCal: [handler](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:525) |
| HTTP projection старой двух-БД модели | projection outbox + worker + webapp event client | historical compatibility | [unified-DB canon](/home/dev/dev-projects/bcb-wt-tariff/docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md:1) прямо называет это fallback/legacy, не основной путь |

Записи:

- В `integrator` schema — 23-table access envelope по grant inventory; ядро использует identities/users/contacts, support, reminder tables, retry jobs, idempotency и projection outbox.
- В `public` статически видно минимум 19 записываемых таблиц: identity/bind/preferences (4), diary/LFK (4), support (5), `reminder_rules`, `outgoing_delivery_queue`, `notification_delivery_attempts`, `broadcast_audit`, `patient_bookings`, `admin_audit_log`.
- Найдены 26 явно квалифицированных `public.*` таблиц, к которым сервис хотя бы обращается; ещё есть неквалифицированные product reads в Calendar code. Поэтому «сколько он трогает» честно: не менее 30 `public` tables, точный live-set требует трассировки/DB audit.

Уточнение к исходной цифре: в `directPublic/` сейчас 8 TypeScript-файлов, но два — тесты; production-модулей шесть, из них `mergeCandidatesDirect.ts` вызывает platform merge, а не содержит собственный DML. Это не совпадает с предпосылкой «семь файлов, пишущих canon».

## Сложность в числах

- `apps/integrator/src`: 288 TS-файлов, 43 536 строк.
- `infra/db/repos`: 41 файл / 5 866 строк.
- `integrations`: 69 файлов / 8 304 строки.
- executor: 7 764 строки; один `executeAction.ts` — 3 330, reminders handler — 1 930.
- `writePort.ts`: 1 980 строк; outgoing-delivery worker — 889.
- 46 integrator SQL migrations / 1 730 строк.
- 13 POST + 2 GET HTTP endpoints; статически интегратор вызывает 16 внутренних webapp API paths.
- Worker содержит три бесконечных poll-loops: generic retry jobs, projection outbox, outgoing delivery. Scheduler — ещё один loop.
- 5 channel delivery adapters; Google Calendar — отдельная внешняя интеграция.
- JSON content содержит 163 scenario records; executor содержит 48 явных action cases.

Историческая доля измерима так:

- 1 473 LOC — непосредственно `projection_*`, projection worker и `webappEventsClient`: это прежний HTTP projection/outbox механизм.
- До 2 674 LOC (6.1% всего исходного TS) — верхняя граница legacy HTTP/projection coupling вместе с webapp read/write adapters. Это не полностью мёртвый код: часть всё ещё fallback либо текущий cross-process API.
- Следовательно, история заметно усложняет сервис, но не объясняет его главную сложность: 10 220 LOC сконцентрированы всего в семи файлах [redacted-token]. Это текущая продуктовая логика, не остатки двух БД.

## Target shape

Практичный target — не новый «микросервис ради микросервиса», а тонкий channel adapter:

```text
provider webhook / poll
  → verify + normalize + provider event-id dedup
  → inbox / narrow domain command
  → main domain owns person, tariff, booking, reminders, support
  → transactional outgoing_delivery_queue
  → integrator delivery worker
  → Telegram / MAX / SMS / email / push / calendar
```

В adapter остаётся:

- provider authentication, payload parsing/normalisation, provider-specific response;
- привязка внешнего identity через узкую canonical command;
- provider-specific rendering of already-approved delivery intent;
- provider event-id idempotency;
- durable outbound claim/send/retry/DLQ/audit;
- signed entry-link issuance и технические health checks.

Не должно оставаться в adapter:

- тарифный lifecycle, entitlement calculation, выбор organisation;
- recurrence и UX-правила напоминаний;
- booking state transitions и решение, кого/когда уведомлять;
- support workflow, дневники/ЛФК, calendar-description из clinical/product data;
- собственный generic product scenario engine как место принятия решений.

Это вывод из практики, а не утверждение, что Stripe/AWS предписывают конкретно BersonCare-структуру. Stripe требует быстро подтверждать webhook, обрабатывать его асинхронно, дедуплицировать event IDs и не полагаться на порядок доставки. [Stripe Webhooks](https://docs.stripe.com/webhooks) AWS описывает outbox именно для надёжной границы «DB change → external event», с at-least-once и idempotent consumer. [AWS Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) Практика молчит о том, должны ли у BersonCare быть один или несколько Node-процессов; это вопрос эксплуатации, не domain boundary.

Идентификация:

- Adapter хранит `provider + external_id`, проверяет подпись и дедуплицирует provider event.
- Main domain — единственный владелец `platform_user`, merge и привязки к organisation.
- Связка — idempotent command/procedure с natural key, а не adapter, самостоятельно выбирающий кандидата и меняющий product tables.

Права при общей БД:

- Отдельные non-owner, `NOBYPASSRLS` login roles как минимум для ingress и delivery worker; migrator/owner не runtime.
- Ingress: DML только в `integrator.inbox/identities` и EXECUTE на узкие functions `bind_channel_identity`, `record_inbound_event`.
- Delivery worker: claim/update только delivery queue и delivery-attempt audit; отдельная узкая capability для `bot_blocked_at`.
- Ни одного прямого DML grant на tariff, booking, support, diary, LFK или произвольные `public.*`; для редких нужных product writes — owner-maintained `SECURITY DEFINER` function с точным входом и RLS/principal checks.

PostgreSQL даёт именно эти строительные блоки: object-level GRANT и RLS; включённый RLS без policy default-deny, но owner/BYPASSRLS его обходят. [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html), [row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

Сейчас это ещё не runtime reality: канон подтверждает один `DATABASE_URL` и одну DB role у webapp/integrator. Role split существует как dormant contract, не как подтверждённый production cutover: [P0.5 contract](/home/dev/dev-projects/bcb-wt-tariff/docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md:1).

## Приоритетный cut list

| Приоритет | Что делать | Риск изменения | Цена оставить |
|---:|---|---|---|
| 1 | Убрать legacy HTTP projection только после census оставшихся event types и drain/dead-row решения | Потерять fallback/replay для ещё не переведённого event | Два пути записи канона, отдельный loop, retry/DLQ и 1 473+ LOC compatibility |
| 2 | Перенести reminder policy/state ownership в webapp/domain; integrator оставить scheduler/delivery consumer либо убрать scheduler | Дубли/пропуски reminder occurrences при неправильной миграции состояния | Две модели rules/occurrences и 1 930 LOC продуктовой логики в adapter |
| 3 | Перенести booking lifecycle decisions и Calendar enrichment в booking domain; adapter получает готовые intents | Ошибка даст неверные уведомления или calendar events | Booking rules, тексты и payment consequences живут вне владельца booking |
| 4 | Заменить direct-public writers на узкие domain functions/commands; сначала identity, затем diary/LFK и support | Сломать chat flow или потерять idempotency/RLS context | Adapter имеет широкую поверхность записи канона и вынужден знать product tables |
| 5 | Заморозить расширение scenario executor; по мере вывода bot UX переносить сценарии в webapp | Удалить сценарий до замены — потерять пользовательский путь | Второй product application layer и 163 сценария в transport service |
| — | Оставить webhook verification, channel mapping, persistent outbound queue, provider adapters, retry/DLQ, provider-event dedup | Их удаление ломает delivery reliability | Это и есть необходимая часть integrator |

Про тарифы: найденный текущий diary path вызывает `app.resolve_organization_mechanic_access(..., 'patient_diaries')`; tariff/trial lifecycle вычисляется в DB-function, не в TypeScript integrator. [Caller](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:166), [function](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0277_organization_mechanic_access_door_local.sql:5) Новую integrator tariff-state machine статический поиск не нашёл.

## Чего я не смог установить

- Не делал DEV DB queries: поэтому не подтверждал фактические backlog/dead rows, traffic по endpoints и live grants. Это сознательно осталось read-only по коду/докам.
- Не могу по статике сказать, какие legacy HTTP fallbacks уже реально нужны сегодня: документация говорит, что они ещё допустимы, а не что они нулевые.
- Точный runtime role/ACL на DEV/PROD не установлен без разрешённой DB inspection; документы подтверждают текущую shared-role модель и будущий, но dormant split.
- Рабочее дерево уже содержало изменения env-template файлов; я их не трогал.