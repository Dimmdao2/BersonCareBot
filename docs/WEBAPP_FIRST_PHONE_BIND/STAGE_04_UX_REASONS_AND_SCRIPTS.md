# Этап 4: UX — machine reasons, тексты, сценарии (`scripts.json`)

## Контекст

Пользователь должен получать **честный** исход: отдельные тексты для **транзиентной БД**, **нет binding**, **номер у другого аккаунта**, **integrator id mismatch**, **indeterminate** — см. таблицу в плане Cursor. Реализация: метаданные из `writeDb` → `phoneLinkUserMessages` → ветки в `executeAction` / контент. Стабильные коды: см. [`PRODUCT_REASONS_AND_UX_TABLE.md`](PRODUCT_REASONS_AND_UX_TABLE.md) (в т.ч. `no_integrator_identity` отдельно от транзиента БД).

Сценарии Telegram и Max: после `user.phone.link` **успех** («Номер привязан») только если sync-шаг реально применился (`userPhoneLinkApplied`, `abortPlan`).

Файлы: `apps/integrator/src/shared/phoneLinkUserMessages.ts` · `apps/integrator/src/kernel/domain/executor/executeAction.ts` · `apps/integrator/src/content/telegram/user/scripts.json` · `apps/integrator/src/content/max/user/scripts.json` · `apps/webapp/src/shared/ui/patient/MiniAppShareContactGate.tsx` (refresh после успеха).

## Результат этапа

- [ ] Все актуальные reason для TX-пути имеют отдельный пользовательский текст (без подмены «конфликт номера» на транзиент).
- [ ] Для `no_channel_binding` — CTA «Открыть мини-приложение» там, где платформа позволяет.
- [ ] Сценарии не шлют success при `abortPlan` после неуспешного bind.
- [ ] Max зеркалит критичные ветки, если max в scope продукта.

## Чек-лист аудита (этап 4)

- [ ] Ручной или E2E сценарий: rollback bind → **нет** шага «Номер привязан».
- [ ] Каждый reason из таксономии — хотя бы один тест (unit или content regression).
- [ ] Мини-апп: после успешной привязки из бота UI обновляется без обязательного F5 (см. этап 5 для кросс-ссылки).
- [ ] `pnpm run ci`.
