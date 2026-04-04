# Stage 7 - Yandex OAuth backend-only fallback

Сводка в общем плане: `MASTER_PLAN.md` -> Stage 7.

## Цель этапа

Сделать Yandex OAuth полностью рабочим backend fallback-механизмом без публикации кнопки/метода в публичном auth UI.

## Scope (только Stage 7)

- Полный callback flow (`code -> token -> userinfo -> session`).
- Привязка/merge через `oauth_bindings`.
- Конфиг в `system_settings`.
- Ограничение способа запуска: служебный/прямой endpoint, без UI-элементов в login.

Не включать:

- Публичные кнопки OAuth в `AuthFlowV2`.
- Новые env для OAuth-конфига.

## Предусловия

- Stage 3-4-5 завершены и публичный UI стабилен.
- `system_settings` используется как SSOT для интеграционных ключей.

## Подробный план реализации

### S7.T01 - Довести backend flow

1. Проверить `oauth/start` и `oauth/callback` routes.
2. Довести happy-path до создания сессии.
3. Обработать error-path (invalid code, token exchange fail, userinfo fail).
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S7.T02 - Callback orchestration

1. В `oauth/callback/route.ts` реализовать:
   - exchange code,
   - fetch userinfo,
   - `findOrCreateByEmail`,
   - session set + redirect.
2. Явно обработать отсутствие verified email.
3. Обновить `AGENT_EXECUTION_LOG.md`.

### S7.T03 - Merge c существующим пользователем

1. Если `verified_email` уже есть в `platform_users`, не создавать дубль.
2. Привязать OAuth binding к существующему пользователю.
3. Добавить тест на merge path.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S7.T04 - Настройки в БД

1. Проверить наличие keys в `ALLOWED_KEYS`:
   - `yandex_oauth_client_id`
   - `yandex_oauth_client_secret`
   - `yandex_oauth_redirect_uri`
2. Если нет - добавить и покрыть тестом.
3. Не добавлять env-переменные для этих значений.
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S7.T05 - Без публикации в UI

1. Убедиться, что в `AuthFlowV2` нет кнопки "Войти через Яндекс".
2. Убедиться, что `checkPhoneMethods`/UI контракт не делает OAuth видимым в login.
3. Зафиксировать служебный путь вызова (например direct endpoint).
4. Обновить `AGENT_EXECUTION_LOG.md`.

### S7.T06 - Тесты

1. Тест backend happy-path OAuth end-to-end.
2. Тест merge path по email.
3. Тест "OAuth не отображается в публичном login UI".
4. Прогнать релевантные тесты + `pnpm run ci`.
5. Зафиксировать evidence в `AGENT_EXECUTION_LOG.md`.

## Gate (критерий готовности)

- OAuth backend flow работает end-to-end.
- Нет дублей пользователей при совпадении email.
- В публичном login UI OAuth отсутствует.
- `pnpm run ci` зеленый.

## Артефакты этапа

- `docs/AUTH_RESTRUCTURE/AUDIT_STAGE_7.md` (после AUDIT).
- Обновления в `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md`.
