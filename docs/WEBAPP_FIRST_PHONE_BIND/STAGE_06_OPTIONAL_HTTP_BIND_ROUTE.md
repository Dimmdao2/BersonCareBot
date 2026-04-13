# Этап 6 (опционально): Signed HTTP bind для внешнего вызывающего

## Контекст

`POST /api/integrator/messenger-phone/bind` (или аналог) — **не** путь integrator→webapp для обычного Telegram-контакта при общей БД. Держать только если есть **внешний** клиент (другой сервис, админка). Реализация = тонкая обёртка над **тем же** bind-модулем, что и TX из integrator.

См. план Cursor §1 M2M endpoint и чек-лист `webapp-bind-route`.

## Результат этапа

- [x] Route не вызывается из основного phone link бота при одной БД.
- [x] Подпись, idempotency, коды ошибок — по чек-листу в мастер-плане Cursor (секция DoD `webapp-bind-route`).

## Чек-лист аудита (этап 6)

- [x] Неверная подпись → 401, лог без секрета.
- [x] Нет binding → 422 (strict) или явная политика skeleton с флагом и аудитом.
- [x] Успех затрагивает ровно `user_channel_bindings.user_id` → `platform_users`.
- [x] Автотесты: success, no-binding, idempotency, phone conflict.
- [x] `pnpm run ci`.

### Замечания по аудиту (политика и покрытие)

- **Strict 422:** реализован ответ **`422`** с `reason: no_channel_binding` (и прочими machine-reason из TX). Отдельный «skeleton»-режим с флагом и записью в `admin_audit_log` для этого маршрута **не** вводился: маршрут опционален и предназначен для доверенного внешнего клиента; при необходимости политику расширяют отдельной задачей (чек-лист для следующего агента: [`NEXT_AGENT_TASKS.md`](NEXT_AGENT_TASKS.md) §7).
- **Hot path:** в репозитории **нет** вызовов `POST /api/integrator/messenger-phone/bind` из сценариев бота/integrator (`user.phone.link` остаётся TX в процессе integrator при unified DB). Проверка: поиск по репозиторию `messenger-phone/bind` — только webapp route, тесты и доки.
- **Автотесты маршрута** (`route.test.ts`): 401; 400 без idempotency header; 200 success; 422 `no_channel_binding`, `no_integrator_identity`, `integrator_id_mismatch`, `phone_owned_by_other_user`; 503 `db_transient_failure` + `indeterminate`; 200 кеш при повторе; **409** при том же idempotency key и другом семантическом теле; `channelCode: max` + подпись.
