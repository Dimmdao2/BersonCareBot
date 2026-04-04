# Stage 2 - Международная валидация телефона в UI и API

Сводка в общем плане: `MASTER_PLAN.md` -> Stage 2.

## Цель этапа

Сделать ввод номера международным (страна, формат, валидация) и не отправлять невалидный номер на backend.

## Scope (только Stage 2)

- Подключение библиотеки международного ввода телефона.
- Новый `InternationalPhoneInput`.
- Нормализация в E.164.
- Унификация server-side проверки номера.

Не включать:

- Telegram Login Widget (Stage 3).
- Правила "SMS только для РФ" (Stage 4), кроме технической поддержки валидатора.

## Предусловия

- Согласована зависимость: `react-phone-number-input` + `libphonenumber-js`.
- Текущий `PhoneInput` в `AuthFlowV2` выделен и заменяем.

## Подробный план реализации

### S2.T01 - Зависимости

1. Добавить/обновить зависимости пакетным менеджером.
2. Проверить lockfile изменения.
3. Проверить, что импортируется peer metadata без runtime ошибок.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S2.T02 - Новый компонент

1. Создать `apps/webapp/src/shared/ui/auth/InternationalPhoneInput.tsx`.
2. Использовать `PhoneInputWithCountrySelect`.
3. Дефолтная страна: `RU`.
4. Inline-валидация: `isValidPhoneNumber`.
5. Disabled состояния кнопки "Продолжить" при невалидном номере.
6. Ошибки формата показывать inline, без toast.
7. Обновить `AGENT_EXECUTION_LOG.md`.

### S2.T03 - Включение в auth flow

1. Открыть `AuthFlowV2.tsx`.
2. Заменить `PhoneInput` на `InternationalPhoneInput`.
3. Проверить обработку controlled value и submit.
4. Проверить, что форматированный ввод корректно уходит дальше по flow.
5. Обновить `AGENT_EXECUTION_LOG.md`.

### S2.T04 - Нормализация номера

1. Открыть `modules/auth/phoneNormalize.ts`.
2. Ввести `normalizePhoneInternational`:
   - `+7` сохраняет текущую совместимую логику,
   - для остальных использовать E.164 парсинг/нормализацию.
3. Явно задокументировать поведение для пустых/некорректных входов.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S2.T05 - Валидация номера

1. Открыть `modules/auth/phoneValidation.ts`.
2. Добавить `isValidPhoneE164`.
3. Оставить `isValidRuMobileNormalized` как helper для SMS policy.
4. Сверить места использования, чтобы не ломать legacy контракты.
5. Обновить `AGENT_EXECUTION_LOG.md`.

### S2.T06 - API маршруты

1. Обновить валидацию входа в:
   - `app/api/auth/phone/start/route.ts`
   - `app/api/auth/check-phone/route.ts`
   - `app/api/auth/pin/login/route.ts`
   - `app/api/auth/messenger/start/route.ts`
2. Использовать `isValidPhoneE164` как общий фильтр.
3. Не смешивать "валидность номера" и "доступность SMS для РФ".
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S2.T07 - Стили и тема

1. Подогнать styles под текущий UI kit.
2. Проверить dark theme.
3. Проверить фокус, hover, error state.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S2.T08 - Тесты

1. Тест-кейсы для `+1`, `+44`, `+49`, `+380`, `+7`.
2. Client-side: валидация и disabled submit.
3. Server-side: API принимает валидный E.164 и отклоняет мусор.
4. Прогнать релевантные тесты + `pnpm run ci`.
5. Зафиксировать evidence в `AGENT_EXECUTION_LOG.md`.

## Gate (критерий готовности)

- Поле телефона международное и валидирует inline.
- Невалидный номер не отправляется на backend.
- API использует единый E.164 валидатор.
- Тесты stage зеленые, `pnpm run ci` зеленый.

## Артефакты этапа

- `docs/AUTH_RESTRUCTURE/AUDIT_STAGE_2.md` (после AUDIT).
- Обновления в `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md`.
