# Этап 6 (опционально): Signed HTTP bind для внешнего вызывающего

## Контекст

`POST /api/integrator/messenger-phone/bind` (или аналог) — **не** путь integrator→webapp для обычного Telegram-контакта при общей БД. Держать только если есть **внешний** клиент (другой сервис, админка). Реализация = тонкая обёртка над **тем же** bind-модулем, что и TX из integrator.

См. план Cursor §1 M2M endpoint и чек-лист `webapp-bind-route`.

## Результат этапа

- [ ] Route не вызывается из основного phone link бота при одной БД.
- [ ] Подпись, idempotency, коды ошибок — по чек-листу в мастер-плане Cursor (секция DoD `webapp-bind-route`).

## Чек-лист аудита (этап 6)

- [ ] Неверная подпись → 401, лог без секрета.
- [ ] Нет binding → 422 (strict) или явная политика skeleton с флагом и аудитом.
- [ ] Успех затрагивает ровно `user_channel_bindings.user_id` → `platform_users`.
- [ ] Автотесты: success, no-binding, idempotency, phone conflict.
- [ ] `pnpm run ci`.
