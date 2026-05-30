# BOT_FIXES — execution log

## 2026-05-30 — Bot fixes (Telegram + MAX)

### Сделано

1. **Staff auth (вариант B):** `messengerStaffIds.ts` — чтение `admin_*_ids` и `doctor_*_ids` из `public.system_settings`, TTL 60с; `resolveMessengerStaffAdmin` в tg/max webhook и `routes.ts`. `isAdmin = env-admin OR DB-lists`.
2. **Reply-begin:** при `abortPlan` после failed `webapp.programNote.replyBegin` — `callback.answer` в executor (кнопка не «висит»).
3. **Автологин PWA:** `urlFact` в `buildReplyMarkup`; после login bind — inline URL на `links.webappHomeUrl`; `PhoneMessengerAuthFlow` — refetch на `visibilitychange` / `focus`.
4. **Contact-клавиатура:** на failure-ветках `phoneMessengerBind.complete` — reply/inline меню (`menuOnly`) без `request_contact`.
5. **MAX:** `max.contact.phone.link` priority 10 + `$notStartsWith` для `await_phoneauth:` / `await_contact:`; resolver `$notStartsWith`.

### Проверки

- `pnpm --filter @bersoncare/integrator test` (целевые: messengerStaffIds, telegram/max webhook, executeAction, helpers.replyMarkup)
- `pnpm --filter @bersoncare/webapp test src/shared/ui/auth/PhoneMessengerAuthFlow`
- Финал: `pnpm run ci` — зелёный (2026-05-30)

### Не делали (backlog)

- Native Telegram-reply без inline «Ответить» (`message_id → conversationId`).
