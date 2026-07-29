# BOT_FIXES — execution log

## 2026-05-30 — Bot fixes (Telegram + MAX) — закрыто

### Сделано

1. **Staff auth (вариант B):** `messengerStaffIds.ts` — `admin_*_ids` ∪ `doctor_*_ids` из `public.system_settings`; `isAdmin = env-admin OR resolver`. TTL-кеш списков 60 с + **сброс при** `POST /api/integrator/settings/sync` (`invalidateMessengerStaffIdsCacheForSettingKey`). Типы: `kernel/contracts/messengerStaff.ts`.
2. **Reply-begin:** `callback.answer` в executor при `abortPlan` (failed begin / port missing / **нет** `stageItemId`).
3. **Автологин PWA:** `urlFact` в `buildReplyMarkup`; login success — inline URL `links.webappHomeUrl` (`phoneAuthOpenApp*`); PWA — refetch на **`visibilitychange`** (шаг `code`).
4. **Contact-клавиатура:** `appendPhoneMessengerBindFailureRecovery` — меню `menuOnly` на всех failure bind, включая `write_port_missing`.
5. **MAX:** `max.contact.phone.link` priority 10, `$notStartsWith` в resolver; staff facts как в Telegram.

### Проверки

- `pnpm run ci` — зелёный (2026-05-30)
- Integrator: `messengerStaffIds`, webhook tg/max, `executeAction`, `helpers.replyMarkup`, `routing.test`, `contentConfig.test`, `settingsSyncRoute`
- Webapp: `PhoneMessengerAuthFlow.test.tsx`

### Доработки после аудита (тот же день)

- `write_port_missing` → recovery menu
- `reply-begin` без `stageItemId` → `callback.answer` + `abortPlan`
- Инвалидация кеша staff ids в `settingsSyncRoute`
- Доки: `INTEGRATOR_CONTRACT.md`, `admin.md`, runbook, `docs/BOT_FIXES/README.md`
- Тесты: success `replyBegin` + `programNoteReplyState`; replay/login без URL-кнопки при отсутствии `webappHomeUrl`

### Backlog (вне инициативы)

- Native Telegram-reply без inline «Ответить» (`message_id → conversationId`).

---

## 2026-05-31 — program_reply: state + replyMode (Telegram + MAX)

### Симптом / причина

См. `docs/archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/LOG.md` (§ 2026-05-31): пустой `{{values.programNoteReplyState}}` в плане, `max` без персистенции state.

### Сделано

- State выставляется в `replyBegin`, не в script-step с `values.*`.
- MAX: `user.state.set` / read `userState` как у telegram (`telegram_state` по identity).
- Runtime re-interpolation `values.*` между шагами плана.
- `mergeIntegratorUsers`: `topic_id` в DELETE дубликатов подписок.

### Проверки

- Integrator unit-тесты по зоне (см. LOG инициативы); full `ci` — не в этой сессии.
