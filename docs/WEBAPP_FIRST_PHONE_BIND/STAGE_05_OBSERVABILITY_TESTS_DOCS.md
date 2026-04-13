# Этап 5: Наблюдаемость, тесты, документация контракта

## Контекст

Без пустых `catch` и без «успеха» на неоднозначном HTTP-теле. Для TX bind — структурные поля: `correlationId`, `channelCode`, `externalId`, `platformUserId` (если есть), machine reason, `SQLSTATE` при ошибке.

Тесты: integrator — TX bind (testcontainers или реальный PG по политике репо); webapp — bind-модуль/route при наличии; регресс request-contact / await_contact.

Доки: `apps/webapp/INTEGRATOR_CONTRACT.md`, ссылки из `apps/webapp/src/modules/auth/auth.md`, при необходимости короткая нота в `docs/AUTH_RESTRUCTURE/`.

## Результат этапа

- [ ] Логи TX bind и (для legacy) emit — по чек-листу; метрики при желании: `messenger_bind_ok`, `messenger_bind_tx_fail`, `integrator_emit_body_reject`.
- [ ] Покрытие тестами критических веток из этапов 1–4.
- [ ] Документация обновлена: канон SQL/TX, HTTP bind только внешний/опционально, таблица reason ↔ смысл.

## Чек-лист аудита (этап 5)

- [ ] Code review: нет пустых `catch {}`; секреты и полные номера не утекают в логи.
- [ ] `INTEGRATOR_CONTRACT` / auth.md согласованы с фактическим кодом (коды ошибок, idempotency).
- [ ] `pnpm run ci` перед merge.
