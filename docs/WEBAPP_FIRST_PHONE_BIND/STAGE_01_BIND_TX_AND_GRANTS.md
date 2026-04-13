# Этап 1: TX bind, GRANT на `public`, срез HTTP/fanout с phone path

## Контекст

При **одной БД** (`public` + `integrator`) привязка телефона из Telegram/Max не должна идти через **HTTP integrator → webapp** и **projection worker** на hot path. Целевой путь: **одна SQL-транзакция** — binding-first обновление канона в `public` и запись контакта/состояния в `integrator`.

Ключевые файлы (ориентиры):  
`apps/integrator/src/infra/db/writePort.ts` · `apps/integrator/src/infra/db/repos/messengerPhonePublicBind.ts` · `apps/integrator/src/infra/adapters/webappEventsClient.ts` · `apps/integrator/src/kernel/domain/executor/executeAction.ts` · `apps/integrator/src/shared/phoneLinkUserMessages.ts`

Инфра: `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md` · план Cursor §1–2.

**GRANT в репозитории:** миграция `apps/integrator/src/infra/db/migrations/core/20260413_0002_integrator_grants_public_messenger_canon.sql` (`SELECT` на `public.user_channel_bindings`, `SELECT`+`UPDATE` на `public.platform_users` для `CURRENT_USER`). Если миграции крутятся **под суперпользователем**, выдайте те же права **роли приложения integrator** отдельно в runbook деплоя (иначе `GRANT TO CURRENT_USER` попадёт не на ту роль).

## Результат этапа

- [ ] Ветка `user.phone.link` выполняет **одну** `tx`: обновление `public` (binding-first) + `integrator` согласованно.
- [ ] При ошибке на шаге `public` — **полный rollback**, нет «половины» в `integrator.contacts`.
- [ ] Для этого сценария **нет** постановки `contact.linked` в fanout/outbox (после cutover).
- [ ] Роль приложения integrator: **USAGE** на `public` + минимальные **GRANT** на затронутые объекты; в SQL — явные `public.` или `search_path` согласован с деплоем.
- [ ] `writeDb` возвращает метаданные для исполнителя: `userPhoneLinkApplied`, machine reason при отказе.
- [ ] `webappEventsClient.emit`: успех только при разборе JSON и **`ok === true`** для 200/202 (для оставшихся M2M; phone path не использует emit).

## Чек-лист аудита (этап 1)

- [ ] Ошибка на шаге обновления `public` → rollback; в integrator нет частичной записи телефона; `userPhoneLinkApplied: false`.
- [ ] Успешный commit → строка `user_channel_bindings` согласована с `platform_users.phone_normalized` / trust; контакт в integrator согласован с политикой label.
- [ ] Нет HTTP bind/emit на hot path **phone link**.
- [ ] Нет fanout `contact.linked` с phone path после заявленного cutover.
- [ ] Логи: `correlationId`, machine `reason` или `SQLSTATE`, итог `bind_tx_ok` / `bind_tx_fail` (без секретов и полного номера в clear text — по политике маскирования).
- [ ] Автотесты: TX success/failure, `no_channel_binding` (strict), регресс `executeAction`.
- [ ] `pnpm run ci` зелёный.
