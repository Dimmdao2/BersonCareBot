# Stage 4 - Правила методов входа по типу номера

Сводка в общем плане: `MASTER_PLAN.md` -> Stage 4.

## Цель этапа

После ввода номера корректно определять доступные методы авторизации: SMS только для российских мобильных, публичный UI без email/oauth кнопок.

## Scope (только Stage 4)

- Helper "это РФ мобильный номер?".
- Обновление `resolveAuthMethodsForPhone`.
- Ограничение `phone/start` для не-РФ номера + sms channel.
- Публичный UI policy: показывать только Telegram Login + phone flow.

Не включать:

- Реализацию OAuth backend (Stage 7).
- Политику PIN (Stage 5).

## Предусловия

- Stage 2 завершен: международная нормализация и валидация уже есть.
- Stage 3 завершен: Telegram Login доступен как метод.

## Подробный план реализации

### S4.T01 - helper `isRuMobile`

1. Добавить helper в модуль валидации/методов.
2. Ясно зафиксировать критерий (E.164 +7 + мобильный паттерн).
3. Добавить unit-тесты helper-а.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S4.T02 - `resolveAuthMethodsForPhone`

1. Для не-РФ номеров выставлять `sms: false`.
2. Для всех номеров оставить `telegramLogin: true`, если виджет настроен.
3. Убедиться, что payload совместим с текущим frontend.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S4.T03 - Публичный UI policy

1. В `AuthFlowV2` после `check-phone`:
   - не показывать SMS для не-РФ,
   - не показывать Email/OAuth как публичные кнопки.
2. Оставить Telegram Login как primary, phone flow как secondary.
3. Проверить UX сообщения для пользователя с иностранным номером.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S4.T04 - Защита API

1. В `phone/start/route.ts` добавить guard:
   - если `deliveryChannel === "sms"` и номер не РФ -> `sms_ru_only`.
2. Проверить статус и message контракта.
3. Убедиться, что это не ломает другие каналы.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S4.T05 - Тесты

1. `check-phone` для `+49...` -> `sms: false`.
2. Попытка `phone/start` c `sms` и не-РФ -> ошибка `sms_ru_only`.
3. `+7...` сценарий остается рабочим.
4. Прогнать релевантные тесты + `pnpm run ci`.
5. Зафиксировать evidence в `AGENT_EXECUTION_LOG.md`.

## Gate (критерий готовности)

- Для не-РФ номера SMS не предлагается в UI.
- API отсекает SMS для не-РФ номера.
- Для РФ номера SMS работает как раньше.
- `pnpm run ci` зеленый.

## Артефакты этапа

- `docs/AUTH_RESTRUCTURE/AUDIT_STAGE_4.md` (после AUDIT).
- Обновления в `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md`.
