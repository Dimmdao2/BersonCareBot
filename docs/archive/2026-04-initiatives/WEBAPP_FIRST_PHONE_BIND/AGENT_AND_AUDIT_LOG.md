# Журнал агента и аудитов — Webapp-first phone bind

Формат записей: новые записи **вверху** (reverse chronological).

---

## Шаблон записи (агент / человек)

```
### YYYY-MM-DD — <краткий заголовок>
- **Этап:** STAGE_XX_...
- **Действия:** …
- **Артефакты:** PR / коммит / ветка
- **CI:** pass / fail
```

## Шаблон записи (аудит)

```
### AUDIT YYYY-MM-DD — <область>
- **Этап / scope:** …
- **Проверено по:** STAGE_XX чек-лист (пункты: …)
- **Найдено:** …
- **Статус:** OK / gaps (список) / blocked
- **Follow-up:** … (только если есть)
```

---

## Записи

### 2026-04-13 — закрытие хвостов аудита (п.2–6), TODO п.1, задачи п.7–8 для следующего агента

- **Этап:** пост-аудит `AUDIT 2026-04-13 — полный независимый аудит STAGE_01–06`.
- **Код:** `getLinkDataByIdentity` — при ошибке SQL **пробрасывает исключение** после структурного лога (`resource`, `externalId`, `branch`); `null` только при отсутствии строки identity. `getChannelIdsByUserId` — `warn` при ошибке запроса вместо пустого `catch`. `executeAction` `user.phone.link` — неожиданный `phoneLinkReason` → лог + текст `phoneLinkSaveFailedUserMessage` (не конфликт номера). `executeMessengerPhoneHttpBind` — при `no_integrator_identity` **`ROLLBACK`** вместо пустого `COMMIT`.
- **Доки:** `STAGE_02` (чек-лист про SQL vs `null`), `STAGE_06` (ссылка на `NEXT_AGENT_TASKS.md` §7), `MASTER_PLAN.md`, `docs/README.md`.
- **TODO проекта:** дублирование TX вынесено в [`docs/TODO.md`](../TODO.md) (раздел **Webapp-first phone bind**). П.7–8 описаны в [`NEXT_AGENT_TASKS.md`](NEXT_AGENT_TASKS.md).
- **CI:** pass (`pnpm run ci`).

### AUDIT 2026-04-13 — полный независимый аудит реализации STAGE_01–06

- **Этап / scope:** инициатива `WEBAPP_FIRST_PHONE_BIND` — сверка планов `STAGE_01`–`STAGE_06`, `MASTER_PLAN.md`, `PRODUCT_REASONS_AND_UX_TABLE.md` с кодом (`writePort` `user.phone.link`, `getLinkDataByIdentity`, `webappEventsClient.emit`, `events.ts` `contact.linked`, `executeAction` / `phoneLinkUserMessages`, `MiniAppShareContactGate`, `messenger-phone/bind`, миграции `20260413_0002`/`0003`, тесты).
- **Проверено по:** чек-листы «Результат этапа» и «Чек-лист аудита» в каждом `STAGE_*.md`; поиск `messenger-phone/bind`, `contact.linked` + `user.phone.link` в `writePort.ts`.
- **Вердикт по этапам:** целевые требования этапов **реализованы**; критических дефектов в смысле «нарушен инвариант TX / неверный контракт M2M / отсутствует покрытие критического пути» **не выявлено**. Ниже — **замечания и пробелы** с уровнем критичности.

#### Критичность: **средняя**

1. **Дублирование TX bind в webapp** — **в backlog:** [`docs/TODO.md`](../TODO.md) (раздел Webapp-first phone bind). Исторически: `messengerPhoneHttpBindExecute.ts` vs integrator.

2. **`getLinkDataByIdentity` при исключении SQL** — **закрыто в коде (2026-04-13):** после лога исключение **пробрасывается**; `null` только если строки identity нет.

#### Критичность: **низкая**

3. **`executeAction` (`user.phone.link`)** — **закрыто (2026-04-13):** неожиданный `phoneLinkReason` → warn + `phoneLinkSaveFailedUserMessage`.

4. **`getChannelIdsByUserId`** — **закрыто (2026-04-13):** `warn` при ошибке запроса.

5. **HTTP bind `no_integrator_identity`** — **закрыто (2026-04-13):** `ROLLBACK` вместо пустого `COMMIT`.

6. **Операции (GRANT под ролью миграций)** — без изменений; см. STAGE_01 / deploy runbook.

#### Критичность: **информационная / продуктовый пробел** (задачи следующему агенту)

7. **STAGE_06 skeleton + admin_audit** — [`NEXT_AGENT_TASKS.md`](NEXT_AGENT_TASKS.md) §7.

8. **Паритет Max vs Telegram** — [`NEXT_AGENT_TASKS.md`](NEXT_AGENT_TASKS.md) §8.

- **Статус (обновлено 2026-04-13):** п.2–6 закрыты кодом/доками; п.1 — TODO; п.7–8 — `NEXT_AGENT_TASKS.md`.
- **CI (2026-04-13):** pass (`pnpm run ci`).

### AUDIT 2026-04-14 — STAGE_06 (повторный аудит, полное покрытие чек-листа)

- **Этап / scope:** `STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md` — закрытие хвостов после первичной реализации.
- **Проверено по:** чек-лист аудита этапа 6; отсутствие вызовов маршрута из hot path (поиск `messenger-phone/bind` в репозитории); соответствие `INTEGRATOR_CONTRACT.md` / `auth.md` / `api.md`.
- **Найдено / закрыто:** не хватало автотестов для **400** (нет idempotency header), **503** + `indeterminate`, **422** для `no_integrator_identity` и `integrator_id_mismatch`, **409** (тот же ключ, другое семантическое тело), ветки **`channelCode: max`**; обновлены перекрёстные ссылки в документации проекта.
- **Статус:** OK, пробелов по задачам этапа 6 не остаётся.
- **CI:** pass (`pnpm run ci`).

### AUDIT 2026-04-13 — STAGE_06 (опциональный signed HTTP bind)

- **Этап / scope:** `STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md` — `POST /api/integrator/messenger-phone/bind`.
- **Проверено по:** чек-листы «Результат этапа» и «Чек-лист аудита»; контракт в `apps/webapp/INTEGRATOR_CONTRACT.md`.
- **Сделано:** маршрут с `verifyIntegratorSignature`, обязательным `x-bersoncare-idempotency-key`, кешем успешных ответов; тот же TX, что `user.phone.link`, в `messengerPhoneHttpBindExecute.ts` (SQL синхронизирован с integrator-репами; без импорта из `apps/integrator`, иначе падает `next build` на `.js`-путях integrator); коды 401 / 422 / 503 / 409; тесты `route.test.ts`; документация контракта.
- **Статус:** OK, этап закрыт.
- **CI:** pass (`pnpm run ci`).

### AUDIT 2026-04-13 — STAGE_05 (наблюдаемость, тесты, доки — закрыт)

- **Этап / scope:** `STAGE_05_OBSERVABILITY_TESTS_DOCS.md` (чек-листы и todo Cursor: `admin-audit-logs`, `product-copy-contract`, `docs-contract`).
- **Проверено по:** контекст этапа; чек-листы «Результат этапа» и «Чек-лист аудита»; соответствие [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) коду (`reason` / `sqlState` на `bind_tx_fail`, поля `metric` / emit).
- **Найдено (исправлено):** не хватало полей `metric`, `channelCode` / `externalId` / `platformUserId` в успешном bind; emit при 200/202 без `ok: true` не помечался для агрегации; в журнале инициативы оставалась формулировка про «хвосты STAGE_05».
- **Сделано:** `writePort` `user.phone.link` — `metric`, `channelCode`, `externalId`, `platformUserId`; `webappEventsClient.emit` — `integrator_emit_body_reject`; тесты emit; обновлены `INTEGRATOR_CONTRACT.md`, `auth.md`, `INTEGRATOR_TELEGRAM_START_SCRIPTS.md`, `PRODUCT_REASONS_AND_UX_TABLE.md`, `STAGE_05` (секция соответствия todo), аудит инициативы в этом файле; коммит в репозитории.
- **Статус:** OK, этап закрыт.
- **Артефакты:** коммит (см. git).
- **CI:** pass (`pnpm run ci`).

### 2026-04-13 — STAGE_04 (UX, reasons, сценарии)

- **Этап:** `STAGE_04_UX_REASONS_AND_SCRIPTS.md`.
- **Действия:** TX-путь `user.phone.link`: раздельные тексты по `PhoneLinkFailureReason`; транзиент и indeterminate — `phoneLinkSaveFailedUserMessage`; при `no_channel_binding` и `facts.links.webappHomeUrl` — inline «Открыть мини-приложение» для Telegram и Max. Тесты `executeAction`, `phoneLinkUserMessages`, `handleIncomingEvent` (`abortPlan`). Обновлены `STAGE_04`, `PRODUCT_REASONS_AND_UX_TABLE.md`.
- **Артефакты:** коммит в репозитории.
- **CI:** pass (`pnpm run ci`).

### 2026-04-13 — STAGE_03 (legacy emit, contact.linked, 422)

- **Этап:** `STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md`.
- **Действия:** `webappEventsClient.emit` — успех только при `ok === true`; невалидный JSON ответа → warn + неуспех; тесты в `webappEventsClient.test.ts`. `contact.linked` — идемпотентный fast-path при совпадении телефона на строке integrator без channel/external в payload; Postgres `23505` → `retryable: false` (HTTP 422) для projection upsert на `contact.linked` / `user.upserted` / `preferences.updated`; `findByIntegratorId` возвращает `phoneNormalized` для проверки. Док: чек-листы STAGE_03, секция Legacy emit surface.
- **Артефакты:** коммит в репозитории.
- **CI:** pass (`pnpm run ci`).

### 2026-04-13 — STAGE_02 (read link-data из public)

- **Этап:** `STAGE_02_READ_LINK_DATA_FROM_PUBLIC.md`.
- **Действия:** подтверждена реализация `getLinkDataByIdentity` (`public` bindings → `platform_users` + `merged_into_id`, `COALESCE` с `contacts.label = resource`); добавлены тесты (max-ветка, пустой телефон, legacy fallback); чек-листы STAGE_02 отмечены; уточнён абзац про `linkedPhone` в `INTEGRATOR_TELEGRAM_START_SCRIPTS.md`.
- **Артефакты:** коммит в репозитории.
- **CI:** pass (`pnpm run ci`).

### AUDIT 2026-04-13 — STAGE_01 (bind TX + GRANT + срез fanout)

- **Этап / scope:** `STAGE_01_BIND_TX_AND_GRANTS.md` — реализация и инфра-права.
- **Проверено по:** чек-лист «Результат этапа» + «Чек-лист аудита» в том же файле.
- **Найдено:** в миграциях были только table-level `GRANT` на `public` без **`GRANT USAGE ON SCHEMA public`**, хотя [`DATABASE_UNIFIED_POSTGRES.md`](../ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md) требует `USAGE` на схемы; остальные пункты (одна `tx`, нет `contact.linked` на phone path, метаданные `writeDb`, логи `bind_tx_*`, `webappEventsClient.emit` + `ok`, тесты) — соответствуют.
- **Исправления:** добавлена миграция `apps/integrator/src/infra/db/migrations/core/20260413_0003_integrator_grant_usage_on_public_schema.sql`; тест «public UPDATE failure до integrator — нет записи в contacts» в `writePort.userUpsert.test.ts`; ссылка в `20260413_0002_…sql`; примечание в `deploy/env/README.md` про зеркалирование прав роли приложения после прогона под суперпользователем; чек-листы STAGE_01 отмечены выполненными.
- **Статус:** OK по коду репозитория; на production-хосте после деплоя убедиться, что миграции применены и роль из `DATABASE_URL` имеет те же права, что и при миграции (если миграции шли не тем же пользователем).

### 2026-04-13 — Закрытие пробелов ревью (план + код)

- **Этап:** STAGE_01 / STAGE_02 / STAGE_04 (частично).
- **Действия:** миграция GRANT на `public` для integrator; `getLinkDataByIdentity` читает канон из `public` с fallback на `contacts`; исправлена передача `no_integrator_identity` из `writeDb` (результат TX, а не `return` из колбэка); ветка UX и тесты; снимок таблицы reason в [`PRODUCT_REASONS_AND_UX_TABLE.md`](PRODUCT_REASONS_AND_UX_TABLE.md); матрица 1↔2 и legacy двух БД в [`MASTER_PLAN.md`](MASTER_PLAN.md).
- **Артефакты:** коммит(ы) в репозитории.
- **CI:** pass (`pnpm run ci`).

### AUDIT 2026-04-13 — Документация инициативы

- **Этап / scope:** WEBAPP_FIRST_PHONE_BIND (полнота планов).
- **Проверено по:** чек-листы STAGE_01–06 (логическая полнота после правок).
- **Найдено:** устранены внешняя-only опора для UX-таблицы, отсутствие миграции GRANT в репо, окно рассинхрона read path, баг `no_integrator_identity` внутри `db.tx`, пустой журнал.
- **Статус:** gaps сокращены; STAGE_03 закрыт по чек-листу в `STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md`; STAGE_05 закрыт по [`STAGE_05_OBSERVABILITY_TESTS_DOCS.md`](STAGE_05_OBSERVABILITY_TESTS_DOCS.md) (логи/метрики-поля, тесты, контракт, журнал аудита); STAGE_06 закрыт по [`STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`](STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md).
