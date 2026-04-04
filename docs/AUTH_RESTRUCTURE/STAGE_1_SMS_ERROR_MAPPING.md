# Stage 1 - Фикс маппинга ошибок SMS доставки

Сводка в общем плане: `MASTER_PLAN.md` -> Stage 1.

## Цель этапа

Перестать маскировать ошибки доставки SMS под ошибку формата номера. Пользователь должен видеть корректное сообщение "Не удалось отправить код", когда проблема на стороне доставки/интегратора.

## Scope (только Stage 1)

- Коды ошибок в SMS port и adapter.
- Маппинг API-ошибок в `phone/start`.
- Проверка пользовательского сообщения в UI.
- Тесты на сценарий "интегратор вернул 500/transport error".

Не включать:

- Изменения в международной валидации номера (Stage 2).
- Логику выбора каналов по стране (Stage 4).

## Предусловия

- Есть текущий путь `phone/start` через integrator SMS adapter.
- Есть тестовый контур, где можно замокать ответ интегратора.

## Подробный план реализации

### S1.T01 - Коды ошибок в контракте

1. Открыть `apps/webapp/src/modules/auth/smsPort.ts`.
2. Добавить новый код в перечисление/union `SMS_ERROR_CODES`: `delivery_failed`.
3. Проверить типы `PhoneOtpDelivery` и все switch/case на полноту.
4. Обновить комментарии контракта (если есть), чтобы разграничить:
   - `invalid_phone` = ошибка в номере,
   - `delivery_failed` = сбой доставки/внешнего сервиса.
5. Добавить запись в `AGENT_EXECUTION_LOG.md`.

### S1.T02 - Маппинг в integrator adapter

1. Открыть `apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.ts`.
2. Для HTTP/транспортных ошибок (кроме explicit rate-limit) возвращать `delivery_failed`.
3. Для `data.ok !== true` также возвращать `delivery_failed`, если это не валидатор номера.
4. Сохранить `invalid_phone` только для достоверных кейсов "номер невалиден".
5. Добавить запись в `AGENT_EXECUTION_LOG.md`.

### S1.T03 - API message mapping

1. Открыть `apps/webapp/src/app/api/auth/phone/start/route.ts`.
2. В маппинге ошибок добавить ветку:
   - `delivery_failed` -> "Не удалось отправить код. Попробуйте позже."
3. Проверить статус-коды для пользовательских и сервисных ошибок.
4. Добавить запись в `AGENT_EXECUTION_LOG.md`.

### S1.T04 - UI поверхность

1. Открыть `apps/webapp/src/shared/ui/auth/AuthFlowV2.tsx`.
2. Проверить, что API message пробрасывается в toast/inline без перезаписи на "Неверный формат номера".
3. Если есть client-side fallback message map, обновить его.
4. Добавить запись в `AGENT_EXECUTION_LOG.md`.

### S1.T05 - Тесты

Минимум:

1. Unit/integration test adapter: интегратор возвращает 500 -> `delivery_failed`.
2. Route test `phone/start`: `delivery_failed` дает ожидаемый `message`.
3. UI test (или integration): пользователю показывается "Не удалось отправить код..."
4. Прогнать релевантные тесты и затем `pnpm run ci`.
5. Зафиксировать checks и verdict в `AGENT_EXECUTION_LOG.md`.

## Gate (критерий готовности)

- При недоставке кода пользователь не видит "Неверный формат номера".
- Ошибка корректно маппится в `delivery_failed` от adapter до UI.
- Тесты stage зеленые, `pnpm run ci` зеленый.

## Артефакты этапа

- `docs/AUTH_RESTRUCTURE/AUDIT_STAGE_1.md` (после AUDIT).
- Обновления в `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md`.
