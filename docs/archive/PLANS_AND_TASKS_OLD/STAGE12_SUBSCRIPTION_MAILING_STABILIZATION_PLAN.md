# Stage 12: Стабилизация subscription/mailing и analytics domain — план для авто-агента

> **Режим:** только план. Реализацию выполняет младший агент в режиме авто по этому документу.
>
> **Источник:** [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md), этап 12.
>
> **Предусловие:** этап 11 завершён (projection, API, readPort с fallback, backfill/reconcile, stage11-gate).

---

## Цель этапа 12

Стабилизировать домен subscription/mailing и channel analytics после переноса (Stage 11):

- Выполнить и закрепить reconciliation данных subscription/mailing и mailing logs.
- Согласовать reconciliation delivery data и агрегатов (support_delivery_events).
- Убрать legacy product-level чтения subscription/topics из integrator (читать только из webapp через SubscriptionMailingReadsPort).
- Подтвердить достоверность новой бизнесовой аналитики (delivery/SMS counts при необходимости).
- Обеспечить полное покрытие тестами (unit, API, e2e) для всех затронутых путей.

**Результат этапа:** subscription preferences и specialist/admin-facing audit работают в новой модели; integrator не использует локальную БД для product reads по topics/subscriptions.

---

## Meta-инструкция для агента

1. **Одна задача = один логический блок с финальной верификацией.** Следующий блок только после green CI предыдущего.
2. **Каждый шаг — атомарное изменение одного файла.** Путь к файлу, что искать, на что заменить, что проверить.
3. **Тесты — отдельный шаг после production-кода.** Не смешивать.
4. **В конце каждой задачи:** шаг верификации — `pnpm run ci` зелёный.
5. **Не редактировать документы-планы** (этот файл, DB_ZONES_RESTRUCTURE.md и др.) — read-only.
6. **Идентификаторы:** bigint-safe (строки в API и payload).
7. **НЕ ДЕЛАТЬ:** не удалять таблицы/миграции integrator; не менять контракт `subscriptions.forUser` в contextQueryPort (channel bindings по phone); не удалять репозитории `topics.ts` и `subscriptions.ts` из integrator (они используются writePort); не удалять импорты/функции, используемые writePort (upsertMailingTopic, upsertUserSubscription, insertMailingLog).

---

## Контекст кодовой базы

- **Integrator readPort:** при запросах `mailing.topics.list` и `subscriptions.byUser` сейчас: если задан `subscriptionMailingReadsPort` — делегирует ему; иначе fallback на `listActiveTopics(db)` и `getUserSubscriptions(db)` + маппинг. Этап 12: убрать fallback — читать только через порт; при отсутствии порта возвращать `[]`.
- **Integrator repos:** `topics.ts` (listActiveTopics, getTopicByKey, upsertMailingTopic), `subscriptions.ts` (getUserSubscriptions, upsertUserSubscription, toggleUserSubscription). writePort использует upsertMailingTopic, upsertUserSubscription; mailingLogs.ts — insertMailingLog. Репозитории не удалять; убрать только использование listActiveTopics/getUserSubscriptions из readPort.
- **Webapp:** поддержка delivery-аналитики через `support_delivery_events` (миграция 009), ingest `support.delivery.attempt.logged`. При необходимости — минимальный API или агрегаты для специалиста.
- **Reconciliation:** скрипты `reconcile-subscription-mailing-domain.mjs` и `backfill-subscription-mailing-domain.mjs` уже есть (Stage 11); delivery-данные сверяются в `reconcile-communication-domain.mjs` (support_delivery_events).

---

## Затронутые файлы (сводка)

| Файл / зона | Задачи |
|-------------|--------|
| `apps/integrator/src/infra/db/readPort.ts` | T1 |
| `apps/integrator/src/infra/db/readPort.test.ts` | T2 |
| `apps/webapp/scripts/reconcile-subscription-mailing-domain.mjs` | T3 (опционально: расширить) |
| Документация или скрипт reconciliation delivery | T3 |
| `apps/webapp/src/app/api/...` (delivery analytics, при необходимости) | T4 |
| Тесты API subscriptions (webapp) | T2, T5 |
| E2e-сценарий (описание + при необходимости Playwright) | T6 |
| `scripts/stage12-release-gate.mjs` (новый) | T7 |
| `package.json` (root, webapp) | T7 |

---

## Execution order

**T1** → **T2** → **T3** → **T4** → **T5** → **T6** → **T7** (строго по порядку).

---

## T1 (P0): Убрать legacy fallback в readPort для subscription/mailing

**Цель:** перевести product reads по topics и subscriptions только на webapp; при отсутствии порта возвращать пустые массивы (без чтения из БД integrator).

**Текущее состояние:** в `readPort.ts` в case `mailing.topics.list` и `subscriptions.byUser` при отсутствии `subscriptionMailingReadsPort` вызываются `listActiveTopics(db)` и `getUserSubscriptions(db)` + маппинг.

**Решение:** в обоих case удалить ветку fallback на БД; если порт не задан — возвращать `[]`.

### Шаг T1.1: Изменить case mailing.topics.list

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Найти:** блок `case 'mailing.topics.list':` (содержит `if (subscriptionMailingReadsPort)` и ветку с `listActiveTopics(db)` и маппингом).

**Заменить на:** только делегирование порту; при отсутствии порта — `return [] as T`. Не вызывать `listActiveTopics(db)` и не импортировать его для этого case (импорт listActiveTopics удалить из файла, если он больше нигде не используется в readPort).

**Верификация:** `pnpm --dir apps/integrator typecheck`.

**Критерий успеха:** запрос `mailing.topics.list` без порта возвращает `[]`; с портом — результат порта; listActiveTopics не вызывается из readPort.

### Шаг T1.2: Изменить case subscriptions.byUser

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Найти:** блок `case 'subscriptions.byUser':` (содержит `if (subscriptionMailingReadsPort)` и ветку с `getUserSubscriptions(db, userId)` и `listActiveTopics(db)` для маппинга).

**Заменить на:** только делегирование порту; при отсутствии порта — `return [] as T`. Не вызывать `getUserSubscriptions` и `listActiveTopics` из readPort.

**Верификация:** `pnpm --dir apps/integrator typecheck`.

**Критерий успеха:** запрос `subscriptions.byUser` без порта возвращает `[]`; с портом — результат порта.

### Шаг T1.3: Удалить неиспользуемые импорты

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Действие:** удалить импорты `listActiveTopics` из `./repos/topics.js` и `getUserSubscriptions` из `./repos/subscriptions.js`, если они больше нигде в файле не используются.

**Верификация:** `pnpm --dir apps/integrator typecheck` и `pnpm --dir apps/integrator test -- readPort`.

**Критерий успеха:** типчек и тесты readPort проходят; лишних импортов нет.

### Шаг T1.4: Верификация задачи T1

**Команда:** `pnpm run ci`

**DoD:** legacy fallback удалён; при отсутствии subscriptionMailingReadsPort возвращается `[]`; CI зелёный.

---

## T2 (P0): Тесты readPort для subscription/mailing (только webapp-источник)

**Цель:** зафиксировать поведение: делегирование порту при наличии; возврат `[]` при отсутствии порта; отсутствие вызовов к БД для этих типов запросов.

### Шаг T2.1: Тест mailing.topics.list без порта возвращает []

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts`

**Действие:** добавить в новый describe "subscription/mailing reads (webapp-only)" тест: createDbReadPort без subscriptionMailingReadsPort; вызов readDb({ type: 'mailing.topics.list', params: {} }); ожидать результат — массив, равный []; убедиться, что db.query не вызывался (мок db с vi.fn(), проверить количество вызовов).

**Верификация:** `pnpm --dir apps/integrator test -- readPort.test`.

**Критерий успеха:** тест зелёный.

### Шаг T2.2: Тест mailing.topics.list с портом делегирует порту

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts`

**Действие:** добавить тест: мок subscriptionMailingReadsPort с listTopics: vi.fn().mockResolvedValue([{ integratorTopicId: '1', code: 'news', title: 'News', key: 'news', isActive: true }]); createDbReadPort({ db, subscriptionMailingReadsPort }); readDb({ type: 'mailing.topics.list', params: {} }); ожидать результат равный возврату порта; expect(subscriptionMailingReadsPort.listTopics).toHaveBeenCalledTimes(1); db.query не должен вызываться для mailing_topics (проверить, что вызовов с sql, содержащим mailing_topics, нет).

**Верификация:** `pnpm --dir apps/integrator test -- readPort.test`.

**Критерий успеха:** тест зелёный.

### Шаг T2.3: Тест subscriptions.byUser без порта возвращает []

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts`

**Действие:** тест: порт не передан; readDb({ type: 'subscriptions.byUser', params: { integratorUserId: '42' } }); ожидать []; db.query не вызывался.

**Верификация:** `pnpm --dir apps/integrator test -- readPort.test`.

**Критерий успеха:** тест зелёный.

### Шаг T2.4: Тест subscriptions.byUser с портом делегирует порту

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts`

**Действие:** тест: мок порта getSubscriptionsByUserId: vi.fn().mockResolvedValue([{ integratorTopicId: '1', topicCode: 'news', isActive: true }]); readDb({ type: 'subscriptions.byUser', params: { integratorUserId: '42' } }); ожидать результат порта; getSubscriptionsByUserId вызван с '42'; db.query не вызывался для user_subscriptions.

**Верификация:** `pnpm --dir apps/integrator test -- readPort.test`.

**Критерий успеха:** тест зелёный.

### Шаг T2.5: Верификация задачи T2

**Команда:** `pnpm run ci`

**DoD:** четыре теста добавлены и проходят; CI зелёный.

---

## T3 (P0): Reconciliation — проверка и при необходимости расширение

**Цель:** убедиться, что reconciliation subscription/mailing и delivery данных выполнима и задокументирована; при необходимости расширить скрипт или сценарий.

### Шаг T3.1: Проверить reconcile-subscription-mailing-domain

**Файл:** без изменения кода (или минимальное изменение только при баге).

**Действие:** убедиться, что `apps/webapp/scripts/reconcile-subscription-mailing-domain.mjs` сравнивает три пары таблиц (mailing_topics, user_subscriptions, mailing_logs); при наличии DATABASE_URL и INTEGRATOR_DATABASE_URL скрипт запускается без синтаксических ошибок. Запуск: `pnpm --dir apps/webapp run reconcile-subscription-mailing-domain -- --max-mismatch-percent=100` (для проверки запуска; без БД скрипт завершится с кодом 1 и сообщением об отсутствии URL — это допустимо).

**Верификация:** без БД — exit 1 и понятное сообщение; с БД — exit 0 при совпадении счётчиков в пределах порога.

**Критерий успеха:** скрипт запускается; поведение соответствует описанию в комментарии скрипта.

### Шаг T3.2: Документировать порядок reconciliation для этапа 12

**Файл:** не редактировать план (read-only). При необходимости добавить в репозиторий один файл: `docs/ARCHITECTURE/STAGE12_RECONCILIATION.md` (короткий): порядок запуска для cutover — 1) backfill-subscription-mailing-domain (при необходимости); 2) reconcile-subscription-mailing-domain; 3) при необходимости reconcile-communication-domain для delivery_events. Либо ограничиться комментарием в stage12-release-gate (см. T7). Если в плане указано «не создавать лишних документов», шаг T3.2 считать выполненным при наличии проверки T3.1 и вызова reconcile в stage12-gate.

**Верификация:** не ломает CI.

**Критерий успеха:** порядок reconciliation ясен из кода или одного добавленного файла.

### Шаг T3.3: Верификация задачи T3

**Команда:** `pnpm run ci`

**DoD:** reconciliation скрипты проверены; при необходимости документация/комментарий добавлены; CI зелёный.

---

## T4 (P1): Delivery analytics — подтверждение и при необходимости минимальный API

**Цель:** подтвердить, что данных support_delivery_events достаточно для отчётности по доставке (SMS/delivery counts); при необходимости добавить минимальный GET API или агрегат для специалиста/админки.

### Шаг T4.1: Проверить существующие пути чтения delivery

**Файл:** обзор `apps/webapp/src/infra/repos/pgSupportCommunication.ts` (методы, читающие из support_delivery_events).

**Действие:** убедиться, что есть возможность читать delivery events (например, для списка по каналу или по пользователю). Если такой метод уже есть и используется в API или сервисах — задачу T4 считать выполненной (подтверждение). Если нет — добавить минимальный метод в порт/репозиторий и при необходимости GET endpoint (например, для админки/специалиста), без изменения планов.

**Верификация:** `pnpm --dir apps/webapp typecheck` и при добавлении кода — соответствующие тесты.

**Критерий успеха:** специалист/админка могут опереться на webapp для delivery-данных; CI зелёный.

### Шаг T4.2: Верификация задачи T4

**Команда:** `pnpm run ci`

**DoD:** delivery analytics подтверждены или дополнены минимальным путём; CI зелёный.

---

## T5 (P0): Тесты API subscriptions (webapp) и адаптера

**Цель:** полное покрытие API маршрутов subscriptions и адаптера subscriptionMailingReadsPort.

### Шаг T5.1: Тесты GET /api/integrator/subscriptions/topics

**Файл:** создать при отсутствии `apps/webapp/src/app/api/integrator/subscriptions/topics/route.test.ts` или дополнить существующий.

**Действие:** тесты: 400 при отсутствии заголовков (x-bersoncare-timestamp, x-bersoncare-signature); 401 при неверной подписи (мок verifyIntegratorGetSignature); 503 при отсутствии порта (мок buildAppDeps без subscriptionMailingProjection); 200 с телом { ok: true, topics: [...] } при успехе (мок порта с listTopics). Использовать мок buildAppDeps и мок verifyIntegratorGetSignature по образцу других API route тестов в webapp.

**Верификация:** `pnpm --dir apps/webapp test -- subscriptions/topics`.

**Критерий успеха:** тесты зелёные.

### Шаг T5.2: Тесты GET /api/integrator/subscriptions/for-user

**Файл:** создать при отсутствии `apps/webapp/src/app/api/integrator/subscriptions/for-user/route.test.ts` или дополнить.

**Действие:** тесты: 400 при отсутствии query integratorUserId; 400/401 при отсутствии заголовков или неверной подписи; 503 при отсутствии порта; 200 с телом { ok: true, subscriptions: [...] } при успехе (мок порта listSubscriptionsByIntegratorUserId).

**Верификация:** `pnpm --dir apps/webapp test -- subscriptions/for-user`.

**Критерий успеха:** тесты зелёные.

### Шаг T5.3: Тесты адаптера subscriptionMailingReadsPort (integrator)

**Файл:** создать при отсутствии `apps/integrator/src/infra/adapters/subscriptionMailingReadsPort.test.ts`.

**Действие:** мок fetch: при успешном ответе с topics/subscriptions — маппинг в формат порта; при ошибке или !ok — возврат []; проверка URL и заголовков (canonical path, наличие X-Bersoncare-Timestamp, X-Bersoncare-Signature). Тесты: listTopics возвращает массив при ok; getSubscriptionsByUserId возвращает массив при ok; при fetch reject или status !== 200 — пустой массив.

**Верификация:** `pnpm --dir apps/integrator test -- subscriptionMailingReadsPort`.

**Критерий успеха:** тесты зелёные.

### Шаг T5.4: Верификация задачи T5

**Команда:** `pnpm run ci`

**DoD:** все перечисленные тесты добавлены и проходят; CI зелёный.

---

## T6 (P0): E2e-сценарий и описание

**Цель:** зафиксировать e2e-сценарий стабилизации: интегратор читает topics/subscriptions только из webapp; reconciliation проходит.

### Шаг T6.1: Описание e2e-сценария

**Файл:** не редактировать план. Добавить в репозиторий файл `docs/ARCHITECTURE/STAGE12_E2E_SCENARIO.md` (или один общий E2E для этапов 11–12) с описанием сценария:

1. Предусловие: webapp и integrator запущены; APP_BASE_URL и webhook secret заданы; в webapp есть хотя бы один topic (через backfill или ingest).
2. Integrator вызывает readPort.readDb({ type: 'mailing.topics.list', params: {} }) — результат приходит из webapp (через subscriptionMailingReadsPort), не из локальной БД integrator.
3. Integrator вызывает readPort.readDb({ type: 'subscriptions.byUser', params: { integratorUserId: '...' } }) — результат из webapp.
4. Запуск reconcile-subscription-mailing-domain при двух БД завершается с кодом 0 при совпадении данных.

Либо: e2e = запуск stage12-gate при настроенных БД (projection-health + reconcile).

**Верификация:** документ создан; при наличии e2e-раннера (Playwright/Vitest) при необходимости добавить один e2e-тест, вызывающий API webapp с подписью и проверяющий 200 и форму ответа (без обязательного запуска против живого webapp в CI, если так принято в проекте).

**Критерий успеха:** сценарий зафиксирован; при наличии инфраструктуры e2e — тест добавлен и зелёный или пропущен при отсутствии БД.

### Шаг T6.2: Опциональный e2e-тест (если в проекте приняты e2e)

**Файл:** если в webapp есть e2e (например, в `apps/webapp/e2e/` или `tests/e2e/`), добавить тест: запрос GET /api/integrator/subscriptions/topics с валидными заголовками подписи (или с моком verify) и проверка статуса 200 и наличия поля topics в JSON. Зависимости: не требовать реальный webhook secret в CI; использовать мок или тестовый ключ. Если в проекте нет директории e2e или скрипта test:e2e — шаг не выполнять; в отчёте агента указать «e2e-инфра отсутствует, T6.2 пропущен».

**Верификация:** `pnpm --dir apps/webapp test:e2e` или аналог, если есть.

**Критерий успеха:** e2e добавлен и проходит в принятой конфигурации; иначе шаг пропущен без падения CI.

### Шаг T6.3: Верификация задачи T6

**Команда:** `pnpm run ci`

**DoD:** e2e-сценарий описан; при наличии e2e-инфра — тест добавлен; CI зелёный.

---

## T7 (P0): Stage 12 release gate и финальная верификация

**Цель:** скрипт stage12-gate для go/no-go; финальный CI.

### Шаг T7.1: Создать stage12-release-gate.mjs

**Файл:** создать `scripts/stage12-release-gate.mjs`

**Содержимое:** по образцу stage11-release-gate: последовательно запустить stage11-gate (или те же шаги: projection-health + reconcile-subscription-mailing-domain); при успехе — exit 0; при неуспехе — exit 1. Допустимо: при отсутствии DATABASE_URL/INTEGRATOR_DATABASE_URL — exit 0 с предупреждением в консоль (или 1 — согласовать с принятой практикой в проекте).

**Верификация:** `pnpm run stage12-gate` при настроенных БД — exit 0 после успешного stage11-gate и reconcile; без БД — поведение по документированному (предупреждение или 1).

**Критерий успеха:** скрипт создан и вызывается из корня.

### Шаг T7.2: Добавить npm script stage12-gate

**Файл:** корневой `package.json`

**Действие:** в scripts добавить `"stage12-gate": "node scripts/stage12-release-gate.mjs"`.

**Верификация:** `pnpm run stage12-gate` выполняется.

**Критерий успеха:** команда доступна.

### Шаг T7.3: Финальная верификация этапа 12

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный.

**DoD этапа 12:**

- Legacy fallback в readPort для mailing.topics.list и subscriptions.byUser убран; читается только webapp (или [] при отсутствии порта).
- Тесты readPort, API subscriptions и адаптера subscriptionMailingReadsPort покрывают новые и изменённые пути.
- Reconciliation subscription/mailing проверена; при необходимости — delivery.
- Delivery analytics подтверждены или дополнены минимально.
- E2e-сценарий описан; при наличии e2e — тест добавлен.
- stage12-release-gate создан и добавлен в npm scripts.
- Subscription preferences и specialist/admin-facing audit работают в новой модели; integrator не использует локальную БД для product reads по topics/subscriptions.

---

## Ссылки на guardrails (DB_ZONES_RESTRUCTURE.md)

- Idempotency key детерминированный.
- Reconciliation обязательна как часть cutover.
- Идентификаторы между сервисами — bigint-safe (строка).
- Projection delivery durable: outbox + retry/backoff.

---

## НЕ ДЕЛАТЬ (жёсткие ограничения)

- Не редактировать документы-планы (этот файл, DB_ZONES_RESTRUCTURE.md).
- Не удалять таблицы integrator (mailing_topics, user_subscriptions, mailing_logs, mailings).
- Не менять семантику `subscriptions.forUser` в contextQueryPort (channel bindings по phone).
- Не удалять репозитории `topics.ts`, `subscriptions.ts`, `mailingLogs.ts` из integrator (используются writePort).
- Не удалять вызовы upsertMailingTopic, upsertUserSubscription, insertMailingLog из writePort.
- Не использовать недетерминированные idempotency keys для событий проекции.
