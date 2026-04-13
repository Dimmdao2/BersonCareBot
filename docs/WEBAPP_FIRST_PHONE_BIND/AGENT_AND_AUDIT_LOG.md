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
- **Артефакты:** коммит(ы) в ветке разработки.
- **CI:** ожидается `pnpm run ci` перед пушем.

### AUDIT 2026-04-13 — Документация инициативы

- **Этап / scope:** WEBAPP_FIRST_PHONE_BIND (полнота планов).
- **Проверено по:** чек-листы STAGE_01–06 (логическая полнота после правок).
- **Найдено:** устранены внешняя-only опора для UX-таблицы, отсутствие миграции GRANT в репо, окно рассинхрона read path, баг `no_integrator_identity` внутри `db.tx`, пустой журнал.
- **Статус:** gaps сокращены; STAGE_03 закрыт по чек-листу в `STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md`; хвосты STAGE_05 (метрики/аудит-логи), STAGE_06 — по отдельным задачам.
