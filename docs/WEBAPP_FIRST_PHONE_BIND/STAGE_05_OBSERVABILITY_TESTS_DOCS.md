# Этап 5: Наблюдаемость, тесты, документация контракта

## Контекст

Без пустых `catch` и без «успеха» на неоднозначном HTTP-теле. Для signed **`GET`** к webapp — та же строгость, что для `emit`: успех только при `ok === true` в JSON (зафиксировано в `INTEGRATOR_CONTRACT.md`). Для TX bind — структурные поля: `correlationId`, `channelCode`, `externalId`, `platformUserId` (если есть), machine reason, `SQLSTATE` при ошибке.

Тесты: integrator — TX bind (testcontainers или реальный PG по политике репо); webapp — bind-модуль/route при наличии; регресс request-contact / await_contact.

Доки: `apps/webapp/INTEGRATOR_CONTRACT.md`, ссылки из `apps/webapp/src/modules/auth/auth.md`, при необходимости короткая нота в `docs/AUTH_RESTRUCTURE/`.

## Соответствие todo Cursor-плана (`webapp-first_phone_bind_5069b809`)

Пункты из таблицы в [`MASTER_PLAN.md`](MASTER_PLAN.md) для этого этапа — **`admin-audit-logs`**, **`product-copy-contract`**, **`docs-contract`** — закрыты здесь: операционный аудит и записи в [`AGENT_AND_AUDIT_LOG.md`](AGENT_AND_AUDIT_LOG.md), снимок reason ↔ UX в [`PRODUCT_REASONS_AND_UX_TABLE.md`](PRODUCT_REASONS_AND_UX_TABLE.md), синхронизация `INTEGRATOR_CONTRACT.md` и `auth.md` с кодом (идемпотентность M2M, поля логов bind/emit).

## Результат этапа

- [x] Логи TX bind и (для legacy) emit — по чек-листу; метрики при желании: `messenger_bind_ok`, `messenger_bind_tx_fail`, `integrator_emit_body_reject` (как поле `metric` в структурных логах для агрегации).
- [x] Покрытие тестами критических веток из этапов 1–4 (регресс: `writePort.userUpsert`, `webappEventsClient.emit`, `executeAction` / `handleIncomingEvent` — по состоянию репозитория; добавлены тесты на `integrator_emit_body_reject`).
- [x] Документация обновлена: канон SQL/TX, HTTP bind только внешний/опционально, таблица reason ↔ смысл (`PRODUCT_REASONS_AND_UX_TABLE.md`, ссылки в контракте).

## Чек-лист аудита (этап 5)

- [x] Code review: нет пустых `catch {}`; секреты и полные номера не утекают в логи.
- [x] `INTEGRATOR_CONTRACT` / auth.md согласованы с фактическим кодом (коды ошибок, idempotency).
- [x] `pnpm run ci` перед merge.
