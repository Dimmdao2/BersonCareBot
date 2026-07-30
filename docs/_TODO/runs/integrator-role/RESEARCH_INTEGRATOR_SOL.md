## КОРОТКИЙ ОТВЕТ

Владелец правильно описал целевой integrator, но не текущий. Сегодня это одновременно channel adapter и второй application core: он принимает события и доставляет сообщения, но также решает правила напоминаний, booking lifecycle, идентичность/merge, дневники/ЛФК и support-state, а затем пишет продуктовый канон в `public`.

Масштаб — 42 445 строк runtime TypeScript, 163 сценария, 44 активных action-типа, 41 repository и 3 процесса. Как минимум 5,8% runtime-кода — доказанное наследие двух БД/HTTP projection; переходная двойная реализация увеличивает это минимум до 10,1%.

Срез сделан по commit `165da3ed7`, без обращения к DEV-БД.

## 1. Что integrator реально делает

| Ответственность | Основные файлы и количество | Классификация | Доказательство |
|---|---|---|---|
| Telegram/MAX ingress | Telegram — 13 runtime-файлов/1 778 строк; MAX — 11/1 521. Webhooks плюс опциональный Telegram long polling | Delivery/ingress, но с примесью продуктового контекста | Webhooks принимают и нормализуют события, однако route wiring также разрешает пользователя, организацию, staff/admin и fallback-организацию: [routes.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/integrator/src/app/routes.ts:116), [telegram webhook](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:433), [MAX webhook](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:216). |
| M2M-вход от webapp | 11 POST routes в `integrations/bersoncare`; 6 — отправка SMS/email/OTP/contact/relay/operator alert | Шесть delivery routes — delivery/ingress; reminder rules, user merge и booking lifecycle — leaked domain; health probe — техническая эксплуатация | Регистрация всех путей: [routes.ts](/home/dev/dev-projects/bcb-wt-tariff/apps/integrator/src/app/routes.ts:162). |
| Идентификация человека | `routes.ts`, identity/channel repositories, `messengerPhonePublicBind`, `mergeIntegratorUsers`, `mergeCandidatesDirect`, `writeIdentityAndPreferencesDirect` — около 10 основных файлов | Смешано. Provider identity lookup допустим; создание/merge канонического человека, phone trust, default preferences — leaked domain | Integrator сам ищет кандидатов по телефону/каналу, создаёт `platform_users`, выставляет `patient_phone_trust_at` и обогащает профиль: [writeIdentityAndPreferencesDirect.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:180). |
| Сценарный движок бота | `kernel/domain/executor/**`: 12 файлов, из них 9 runtime, 7 466 runtime-строк | Leaked product/application logic | Перед generic transport handler стоит полноценный action router: [executeAction.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:419). В сценариях есть diary, support, reminders, phone linking, notification settings и program notes. |
| Product content и шаблоны | 5 script bundles, 4 template bundles | Смешано | 163 сценария, 312 шагов, 44 уникальных action-типа, 229 шаблонных ключей. Transport markup допустим, но semantic copy, меню и выбор продуктовых действий — продуктовая ответственность. |
| Outbound delivery | Telegram, MAX, SMSC, email, Web Push: 36 runtime-файлов, 4 213 строк; единый dispatch port | Delivery | Реальные каналы перечислены в [dispatchPort.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:27). VK и Instagram существуют только как placeholders, хотя registry объявляет их поддерживаемыми: [registry.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:13), [VK placeholder](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:4). |
| Очереди, retries, idempotency и delivery audit | `message_retry_jobs`, `outgoing_delivery_queue`, `idempotency_keys`, attempt logs; worker runtime — 9 файлов | Delivery/technical; projection retry — history | Worker содержит три независимых вечных цикла: message jobs, projection outbox и outgoing delivery: [worker/main.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:62). Delivery retries нужны и в правильном target; projection retry — legacy. |
| Напоминания | `reminders/policy.ts`, handler на 1 930 строк, repositories, scheduler, direct write | Leaked domain | Integrator задаёт default rule, presets, дни, quiet hours, планирует occurrences, snooze/skip/done и выбирает notification behaviour: [policy.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:177), [handlers/reminders.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:321). Это противоречит заявленному владению reminder scheduler со стороны webapp: [webapp architecture](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/ARCHITECTURE.md:30). |
| Booking lifecycle и Google Calendar | Bersoncare booking — 3 runtime-файла/735 строк основной route; Google Calendar — 9/710 | Calendar API — adapter; lifecycle decisions — leaked domain | Route сам пишет тексты, выбирает последствия event type, ставит напоминания за 24/2 часа, отменяет jobs, посылает web push и решает Calendar action/title marker: [bookingLifecycleRoute.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:155), [там же](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:360). |
| Дневники и ЛФК | Executor actions плюс `writeDiaryLfkDirect.ts`, 390 строк | Leaked domain | Integrator разрешает canonical person/org, проверяет entitlement и ownership, затем пишет symptom/LFK canon: [writeDiaryLfkDirect.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:1). |
| Support/conversations/questions | `handlers/supportRelay.ts` — 671 строк; 2 direct-public writers — 601 строк; несколько repositories | Leaked domain поверх delivery | Здесь находятся conversation merge/state, sender-name policy, unsupported-media product copy, question semantics и синхронизация с webapp: [supportRelay.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:65). |
| Тарифный lifecycle | `organizationMechanicLifecycleDoor.ts` | Сейчас не leaked: исправлено | Integrator больше не вычисляет состояние сам, а вызывает единственную функцию `app.resolve_organization_mechanic_access`: [organizationMechanicLifecycleDoor.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:63). |
| Operational health | `/health`, `/health/projection`, probe route, incident/webhook telemetry | Техническая эксплуатация, не delivery и не product domain | Допустимо как operational concern, хотя не является сутью channel adapter. |

### Что он пишет

Статический inventory нашёл минимум:

- `integrator`: 23 таблицы, включая `users`, `identities`, `contacts`, `telegram_state`, conversation/question/draft tables, три reminder tables, subscriptions/mailings, idempotency, attempts, две очереди, `projection_outbox`, booking-calendar map и migration ledger. Из них 22 пишет runtime, `schema_migrations` — migrator.

- `public`: 30 затрагиваемых таблиц, из них 23 записываются. Записи идут в `platform_users`, channel bindings/preferences/topics, reminder rules, symptom/LFK canon, support canon, booking/calendar state, outgoing queue, delivery attempts, audit и operational incident tables. Ещё 7 читаются: организации/enrollments, appointments, content и `system_settings`.

Подозрение про `directPublic/**` почти верно, но текущий фактический счёт другой: не семь writer-файлов, а **6 runtime writers + 2 test-файла**. Шесть writers содержат 1 828 строк.

## 2. Сложность в числах

| Метрика | Значение |
|---|---:|
| Tracked files в `apps/integrator` | 419 |
| Файлы в `src` | 400 |
| Runtime TypeScript без tests/migrations | 281 файлов / 42 445 строк |
| Весь TS/SQL/JSON/MD source | 53 395 строк |
| Каталоги / leaf-каталоги | 64 / 47 |
| Крупные функциональные поддеревья `kernel + infra + integrations` | 27 |
| `infra` | 22 222 строки, 41,6% всего source |
| `kernel` | 13 141 строка, 24,6% |
| Executor | 7 466 runtime-строк, 17,6% runtime TS |
| Repositories | 41 |
| Direct-public writers | 6 runtime-файлов / 1 828 строк |
| Сценарии / шаги / action types | 163 / 312 / 44 |
| Template keys | 229 |
| HTTP endpoints в source | 15: 2 GET + 11 M2M POST + 2 webhook POST |
| Исходящие webapp HTTP-контракты | 32 уникальных path template |
| Реальные delivery channels | 5: Telegram, MAX, SMS, email, Web Push |
| Прочие внешние providers | Google Calendar; VK/Instagram — placeholders |
| Runtime-процессы | API + worker + scheduler |
| Постоянные background loops | 4; до 5 при Telegram long polling |
| Test-файлы внутри `apps/integrator/src` | 7 / 1 091 строк |

### Доля истории

Канон прямо фиксирует апрельскую замену двух БД и основного HTTP projection на одну PostgreSQL: [DATABASE_UNIFIED_POSTGRES.md](/home/dev/dev-projects/bcb-wt-tariff/docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md:1).

Строго доказанный нижний предел исторической сложности:

- 8 HTTP adapter-файлов;
- projection worker;
- 6 projection repositories;
- итого **15 файлов / 2 464 runtime-строки = 5,8% runtime TS**;
- `projection_outbox`, `/health/projection`;
- один из трёх worker loops, то есть 25% всех постоянных loops.

Если добавить шесть direct-public реализаций, сосуществующих с fallback/outbox во время перехода, получается **4 292 строки = 10,1% runtime TS**. Это всё ещё нижняя граница: 1 980-строчный `writePort` и смешанные ветки fallback туда не включены.

Дополнительные следы истории:

- 8 Rubitime migration-файлов/214 SQL-строк, хотя runtime Rubitime уже выведен;
- 10 недостижимых старых `switch case` в `executeAction.ts`: новые handler sets перехватывают те же action types до switch;
- VK/Instagram placeholders сообщают ложные capabilities.

Delivery queue, provider retries и attempt logging в historical share не включены: они нужны и правильному adapter.

## 3. Правильный target

```text
Telegram / MAX webhook
        │ verify, normalize, provider-event dedup
        ▼
   ingress adapter ── normalized command/event ──► main application domain
                                                     │
                                      domain transaction + delivery intent
                                                     ▼
                                             delivery outbox
                                                     │ claim/retry
                                                     ▼
   provider adapter ◄── transport rendering ── delivery worker
        │
 Telegram / MAX / SMS / email / Web Push
```

Такой target соответствует формулировке владельца.

- Adapter валидирует подпись и schema, нормализует provider payload, хранит технический provider event ID, преобразует recipients/keyboard/media и выполняет provider API calls. Business decision находится в application/domain. Это основное разделение ports-and-adapters: инфраструктурные адаптеры переводят технический обмен, а domain изолирован от API и хранилищ. [AWS Hexagonal Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html)

- Webhook должен быстро принять событие, проверить подпись, дедуплицировать provider event и передать работу в асинхронную очередь. Provider delivery бывает повторным и unordered; Stripe рекомендует сохранять event IDs и обрабатывать webhook асинхронно. [Stripe webhook best practices](https://docs.stripe.com/webhooks)

- Идентификация делится на два уровня:
  - adapter владеет фактом `(provider, external_user_id)` и технической привязкой к уже известному canonical ID;
  - main application решает, создавать ли человека, доверять ли телефону, merge ли это, какие роли/enrollments/preferences выдать.
  
  Практика молчит о том, в какой именно schema должна лежать таблица binding. Граница выше — вывод из domain ownership, а не универсальный отраслевой стандарт.

- Idempotency тоже двухуровневая:
  - adapter: provider event/send-attempt idempotency;
  - main application: business-command idempotency внутри своей транзакции.
  
  Outbox следует записывать в той же транзакции, что и продуктовый state; consumer обязан выдерживать at-least-once и дубли. [AWS Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)

- Outbound delivery: одна очередь intents, provider abstraction, bounded retries с backoff, затем terminal/dead state и ручной redrive. Retried operation должна быть idempotent. [AWS Retry with Backoff](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html), [AWS DLQ guidance](https://docs.aws.amazon.[redacted-token]-dead-letter-queues.html)

- Semantic copy — «почему и что сообщить» — должен приходить из main application. Adapter оставляет только provider rendering и ограничения. Практика молчит о том, хранить ли semantic templates в коде, CMS или БД.

- Практика также молчит, должен ли adapter быть отдельным процессом. Для BCB он может остаться процессом, пакетом или модулем; важна ownership/privilege boundary, а не количество deploy units.

### Least privilege при одной базе

Сейчас boundary фактически отсутствует: канон подтверждает один `DATABASE_URL` и одну роль с доступом к обеим schemas: [webapp architecture](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/ARCHITECTURE.md:40), [unified DB](/home/dev/dev-projects/bcb-wt-tariff/docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md:15).

Минимальная форма:

- отдельный non-owner `webapp_runtime`;
- отдельный `integrator_ingress` с DML только на provider inbox/identity-binding/idempotency;
- отдельный `integrator_delivery` с claim/update только delivery queue, attempts и dead/redrive state;
- отдельный migrator/owner без runtime login usage;
- `NOBYPASSRLS`, tenant RLS как второй слой;
- на `public` — только необходимые `SELECT`, либо `EXECUTE` на узкие functions/views; никаких широких DML;
- main application пишет product canon и delivery outbox.

PostgreSQL позволяет выдавать `SELECT/INSERT/UPDATE/DELETE/EXECUTE` объектно и даже поколоночно; RLS отдельно ограничивает строки. Owners и `BYPASSRLS` обходят обычные policies, поэтому runtime-роли не должны владеть таблицами. [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html), [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [role attributes](https://www.postgresql.org/docs/current/role-attributes.html)

Мешают этому сегодня: 23 записи в `public`, шесть direct writers, identity merge/trust, product scheduler, 32 webapp HTTP paths, 41 repository и fallback-ветки, которым нужен широкий обзор обеих schemas.

## 4. Что резать и в каком порядке

| Приоритет | Действие | Что требуется сначала | Риск изменения | Цена оставить |
|---|---|---|---|---|
| 1 | Удалить ложную/мёртвую поверхность: VK/Instagram placeholders и 10 недостижимых executor cases | Точечная проверка registry consumers и bootstrap | Низкий: могут сломаться diagnostics, ожидающие ложные capabilities | Ложное представление о каналах и дальнейшее размножение executor |
| 2 | Убрать из integrator решения идентичности: создание/merge `platform_users`, phone trust, enrollments/default preferences | Main-app command/function для link/merge; migration данных и idempotency | Очень высокий: неверный merge означает смешение людей и данных | Самый опасный domain leak и главный blocker отдельной DB-роли |
| 3 | Перенести почти как есть product logic: сначала booking lifecycle, затем reminder policy/scheduler, потом diary/LFK, support и notification settings | Main-app handlers и transactional outbox; поведенческие проверки против текущих сценариев | Booking — duplicate/lost notifications; reminders — пропуск/дубль; diary/support — потеря записи или сообщения | Два центра продуктовых правил и постоянный риск расхождения UI/бота |
| 4 | Прекратить прямые записи integrator в `public`; удалить шесть direct writers после переключения callers | Канонические main-app functions/commands и миграция каждого mutation type | Потеря canon write либо повторная запись при неверном cutover | 1 828 строк копии webapp semantics и невозможность least privilege |
| 5 | Дренировать и удалить HTTP projection compatibility | Проверить pending/dead `projection_outbox`, доказать замену каждого event type | Потеря события на переходе или недоступность ещё живого consumer | Минимум 2 464 строки, один loop, таблица, health endpoint и две failure-модели |
| 6 | Свести worker к delivery queue; вынести product scheduler из integrator | После переноса reminders и projection | Смена retry semantics может породить дубли | Три worker loops и отдельный scheduler для компонента доставки |
| 7 | Включить раздельные runtime-роли и отозвать broad `public` grants | Роли можно подготовить раньше; enforcement — после пунктов 2–6 | Недостающий grant остановит ingress/delivery | Компрометация adapter сейчас эквивалентна компрометации всей продуктовой БД |
| Оставить | Telegram/MAX ingress, long polling при сетевой необходимости, SMS/email/Web Push/Telegram/MAX adapters, signature/schema validation, provider identity key, idempotency, delivery queue, attempts, retries/backoff, operational telemetry | — | Удаление ломает реальные каналы | Это и есть полезное ядро integrator |

Google Calendar может остаться provider adapter, если main application присылает уже решённую команду `create/update/cancel`. Практика молчит, должен ли он жить в том же deploy unit, что и messenger adapters.

## Чего я не смог установить

- Какие из условных webhook routes реально включены и используется ли сейчас Telegram webhook или long polling: это определяется runtime config. Поэтому 15 — число route definitions; фактическое одновременно открытое число может быть меньше.
- Точные ACL/RLS production и текущие имена ролей: документы подтверждают общий role boundary, но фактические `GRANT` я не проверял на PROD, а PROD read был вне scope.
- Размер и состояние `projection_outbox`, `message_retry_jobs` и outgoing queue. Без read-only DB query нельзя доказать, что legacy можно удалить прямо сейчас.
- Реальную частоту использования 32 outgoing HTTP-контрактов и каждого из 44 actions.
- Полный causal-процент исторического кода. 5,8% — доказанный нижний предел, 10,1% — переходный нижний предел; смешанный `writePort` не позволяет честно присвоить истории каждую строку.
- Static table inventory может пропустить динамически построенный SQL identifier; поэтому числа таблиц сформулированы как минимумы.
- Поведенческое test coverage: тесты и CI по условиям mission не запускались. Файлы не изменялись, DEV-БД не читалась.