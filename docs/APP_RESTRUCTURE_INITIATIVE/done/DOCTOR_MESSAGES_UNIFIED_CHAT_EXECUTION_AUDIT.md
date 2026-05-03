# DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT

**Дата аудита:** 2026-05-02.  
**Объект:** выполнение [`DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md), этап 5 «Сообщения врача».  
**Проверяемая реализация:** текущий working tree после внедрения единого doctor support-chat.  
**Post-audit fixes:** выполнены 2026-05-02; см. одноимённую запись в [LOG.md](../LOG.md).

---

## Вердикт

Этап **в целом выполнен**: единый `DoctorChatPanel` используется на странице сообщений и в карточке пациента, старый composer из карточки удалён, unread-фильтр и conversation-level auto-read реализованы, `LOG.md` содержит preflight и итоговую запись, полный `pnpm run ci` прошёл успешно.

Первичный аудит выявил **неблокирующие замечания** по полноте UI и ведению плана:

- **Закрыто post-audit:** в списке `/app/doctor/messages` добавлен вывод `phoneNormalized` и времени последнего сообщения.
- **Закрыто post-audit:** в карточке пациента CTA «Открыть чат» получил unread badge до открытия modal через лёгкий `unread-by-patient` endpoint.
- **Закрыто post-audit:** глобальный doctor unread count теперь можно обновлять синхронно через browser-событие после успешного read в `DoctorChatPanel`.
- Frontmatter todos в Cursor plan-файле отмечены `completed`, но чекбоксы внутри body-плана остались `[ ]`. Это документная несогласованность, не runtime-дефект.
- Manual browser smoke по маршрутам из ТЗ в аудите не выполнялся; покрытие подтверждено unit/e2e-inprocess/typecheck/lint/build/CI.

---

## Проверка по плану

### Этап A — Preflight

**Статус:** выполнено.

Подтверждено:

- В [LOG.md](../LOG.md) есть запись `2026-05-02 — этап 5 «Сообщения врача»: preflight`.
- Зафиксированы факты по `DoctorSupportInbox`, API `/api/doctor/messages/**`, `ChatView`, `useMessagePolling`, `ensureWebappConversationForUser`, `markUserMessagesReadByAdmin`.
- Архитектурный baseline записан: doctor messages API routes без `@/infra/db` / `@/infra/repos`; `modules/messaging` имеет старые type-imports из `pgSupportCommunication`.

### Этап B — Conversation list + unread filter

**Статус:** выполнено; post-audit UI-замечание закрыто.

Подтверждено:

- [`AdminConversationListRow`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) расширен `unreadFromUserCount`.
- [`listOpenConversationsForAdmin`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) считает unread через `LEFT JOIN LATERAL`, фильтрует `unreadOnly` и сортирует unread first, затем `last_message_at DESC`.
- [`inMemorySupportCommunication.ts`](../../apps/webapp/src/infra/repos/inMemorySupportCommunication.ts) обновлён для parity.
- [`GET /api/doctor/messages/conversations`](../../apps/webapp/src/app/api/doctor/messages/conversations/route.ts) принимает `?unread=1` и отдаёт `unreadFromUserCount` / `hasUnreadFromUser`.
- [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx) содержит фильтр «Все / Непрочитанные», empty-state, unread badge, телефон и время последнего сообщения.

Post-audit:

- Добавлен focused test [`DoctorSupportInbox.test.tsx`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.test.tsx) на phone/time/unread и `unread=1`.

### Этап C — Chat layout extraction

**Статус:** выполнено.

Подтверждено:

- Создан [`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx).
- Внутри панели: загрузка сообщений, composer, отправка через `POST /api/doctor/messages/[conversationId]`, polling через `useMessagePolling`, merge без дублей по `id`, auto-read через `POST /read`, callbacks `onReadStateChanged` и `onSent`.
- [`ChatView`](../../apps/webapp/src/modules/messaging/components/ChatView.tsx) не переписывался под doctor-only поведение; patient UI не затронут.
- Покрытие: [`DoctorChatPanel.test.tsx`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.test.tsx).

### Этап D — Messages list opens same layout

**Статус:** выполнено.

Подтверждено:

- [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx) больше не содержит собственный composer/messages state; выбранный диалог рендерит `DoctorChatPanel`.
- После read/send вызывается `loadList` через callbacks, что обновляет unread badge/filter list.

Ограничение:

- В `/app/doctor/messages` выбран desktop pattern с правой панелью, не modal. Это допустимо планом.

### Этап E — Open chat from patient card

**Статус:** выполнено; post-audit badge-замечание закрыто.

Подтверждено:

- Добавлен [`POST /api/doctor/messages/conversations/ensure`](../../apps/webapp/src/app/api/doctor/messages/conversations/ensure/route.ts).
- Route тонкий: session, `canAccessDoctor`, Zod `patientUserId`, service call, JSON response.
- [`doctorSupportMessagingService.ensureConversationForPatient`](../../apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts) использует `ensureWebappConversationForUser`, `listMessagesSince`, `countUnreadUserMessagesForAdminByConversation`.
- [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx) открывает modal с тем же `DoctorChatPanel`.
- CTA «Открыть чат» показывает unread badge до открытия modal через [`POST /api/doctor/messages/conversations/unread-by-patient`](../../apps/webapp/src/app/api/doctor/messages/conversations/unread-by-patient/route.ts).
- Старый composer из карточки удалён.

Ограничения:

- Отдельная patient-specific ACL не добавлялась; используется существующий doctor access guard, как разрешено ТЗ при отсутствии готовой локальной ACL.

### Этап F — Read behavior

**Статус:** выполнено в MVP-режиме.

Подтверждено:

- [`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx) вызывает `POST /api/doctor/messages/[conversationId]/read` после initial/render load.
- При polling новых сообщений от `senderRole === "user"` панель снова вызывает read.
- После успешного read панель диспатчит refresh-событие для [`useDoctorSupportUnreadCount`](../../apps/webapp/src/modules/messaging/hooks/useSupportUnreadPolling.ts), чтобы глобальный doctor unread badge мог обновиться без ожидания polling interval.
- В [LOG.md](../LOG.md) явно записано: выбран conversation-level read, точный per-visible read через `IntersectionObserver` отложен.

Ограничение:

- Это не message-level visible-read. Текущее поведение читает весь диалог, что соответствует разрешённому MVP из ТЗ.

### Этап G — Удаление дубля отправки

**Статус:** выполнено.

Подтверждено:

- Удалены `SendMessageForm`, `clients/[userId]/actions.ts`, `doctor/messages/actions.ts`.
- Страницы клиентов больше не вызывают `deps.doctorMessaging.prepareMessageDraft`.
- `rg "SendMessageForm|sendMessageAction|getMessageDraftAction|doctor-client-send-message-form" apps/webapp/src` — пусто.
- Старый `messageLog` оставлен как «Старый журнал отправок».

### Этап H — Документация и CI

**Статус:** выполнено.

Подтверждено:

- [LOG.md](../LOG.md) содержит preflight и итог реализации.
- В итоговой записи указаны backend gaps, read behavior, ограничения, проверки и out-of-scope.
- `pnpm run ci` прошёл успешно на финальном дереве.

Документное замечание:

- Cursor plan frontmatter todos имеют `status: completed`.
- Body-чекбоксы плана не синхронизированы и остались `[ ]`. Если plan-файл используется как human checklist, это нужно отметить вручную или заменить body-чекбоксы ссылкой на frontmatter statuses / этот audit.

---

## Проверка функций и контрактов

### API routes

[`GET /api/doctor/messages/conversations`](../../apps/webapp/src/app/api/doctor/messages/conversations/route.ts)

- Auth/role guard есть.
- Business logic не содержит SQL.
- `unread=1` преобразуется в `unreadOnly`.
- Ответ обратно совместим по старым полям и добавляет unread-поля.

[`POST /api/doctor/messages/conversations/ensure`](../../apps/webapp/src/app/api/doctor/messages/conversations/ensure/route.ts)

- Auth/role guard есть.
- Zod валидирует `patientUserId` как UUID.
- Возвращает `conversationId`, serialized `messages`, `unreadFromUserCount`.
- Риск: если `patientUserId` UUID валиден, но не существует в БД и FK/constraint падает в repo, route не нормализует это в доменный `404`/`400`. UI покажет error state через catch/non-ok, но API-контракт для “patient missing” не идеален.

[`POST /api/doctor/messages/[conversationId]/read`](../../apps/webapp/src/app/api/doctor/messages/[conversationId]/read/route.ts)

- Существующий контракт сохранён.
- Читает все `sender_role = 'user'` в conversation.
- Не расширялся до message-level read, что соответствует MVP.

### Service / Repo

[`doctorSupportMessagingService`](../../apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts)

- `listOpenConversations` прокидывает `unreadOnly`.
- `ensureConversationForPatient` использует существующий support conversation path.
- `sendAdminReply` сохранён, relay fire-and-forget не менялся.

[`pgSupportCommunication`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts)

- Unread считается в одном query без N+1.
- `unreadOnly` применяется в SQL.
- Добавлен per-conversation count helper.

Архитектурная оговорка:

- `modules/messaging` по-прежнему импортирует типы из `@/infra/repos/pgSupportCommunication`. Это старое нарушение, зафиксированное в ТЗ. Реализация не добавила новые direct DB imports и не трогала ESLint allowlist, но расширила поверхность legacy infra-defined port. Для будущего cleanup лучше вынести `SupportCommunicationPort` и DTO в module-level `ports.ts` / `types.ts`.

### UI

[`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx)

- Есть фильтр «Все / Непрочитанные».
- Есть empty-state для общего списка и unread-list.
- Есть unread badge.
- Используется `DoctorChatPanel`.
- Post-audit: phone/time отображаются в строке диалога.

[`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx)

- Отдельной формы отправки больше нет.
- CTA «Открыть чат» открывает modal и ensure/fetch conversation.
- `messageLog` оставлен как архивный журнал.
- Post-audit: CTA показывает unread badge до открытия.

[`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx)

- Рендерит initial messages и composer.
- Send success очищает draft, перезагружает messages, вызывает `onSent`.
- Read success вызывает `onReadStateChanged`.
- Polling сливает новые сообщения по `id`.
- Best-effort read errors не ломают чат.

---

## Проверки, выполненные в ходе реализации/аудита

Кодовые проверки:

```bash
pnpm --dir apps/webapp exec vitest run src/app/api/doctor/messages/conversations/route.test.ts src/app/api/doctor/messages/conversations/ensure/route.test.ts src/app/api/doctor/messages/[conversationId]/route.test.ts src/app/api/doctor/messages/unread-count/route.test.ts src/modules/messaging/doctorSupportMessagingService.test.ts src/modules/messaging/components/DoctorChatPanel.test.tsx src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/infra/repos/pgSupportCommunication.test.ts e2e/doctor-actions-inprocess.test.ts e2e/doctor-pages-inprocess.test.ts
```

Результат: 10 test files / 57 tests passed.

```bash
pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint
```

Результат: ok.

Post-audit focused checks:

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/doctor/messages/DoctorSupportInbox.test.tsx src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/app/api/doctor/messages/conversations/unread-by-patient/route.test.ts src/modules/messaging/components/DoctorChatPanel.test.tsx src/modules/messaging/doctorSupportMessagingService.test.ts src/infra/repos/pgSupportCommunication.test.ts
```

Результат: 6 test files / 40 tests passed.

```bash
pnpm --dir apps/webapp exec vitest run src/app-layer/di/buildAppDeps.test.ts
```

Post-audit результат: 1 test file / 20 tests passed.

```bash
pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint
```

Post-audit результат: ok.

```bash
pnpm run ci
```

Результат: ok.

Grep-проверки:

```bash
rg "SendMessageForm|sendMessageAction|getMessageDraftAction|doctor-client-send-message-form" apps/webapp/src
```

Результат: пусто.

```bash
rg "@/infra/db|@/infra/repos|pool\\.query" apps/webapp/src/app/api/doctor/messages
```

Результат: пусто.

```bash
rg "DoctorChatPanel|ensureConversationForPatient|unreadFromUserCount|SendMessageForm" apps/webapp/src/app/app/doctor/broadcasts
```

Результат: пусто.

```bash
rg "DoctorChatPanel|variant=\"doctor\"|/api/doctor/messages" apps/webapp/src/app/app/patient/messages
```

Результат: пусто.

Plan status check:

```bash
rg "status: pending|status: in_progress|\\[ \\]" /home/dev/.cursor/plans/doctor_unified_chat_ba6964af.plan.md
```

Результат: pending/in_progress отсутствуют; body-чекбоксы `[ ]` остались.

---

## Scope hygiene

Подтверждено:

- `/app/doctor/broadcasts` не содержит новых упоминаний doctor chat реализации.
- `/app/patient/messages` не получил doctor-specific imports/routes.
- Миграций БД, env vars, новых зависимостей, WebSocket/SSE не добавлено.
- SQL остался в repo layer.

Важно для ревью:

- Working tree содержит параллельные изменения вне этапа 5 (`content/*`, `patient-home/*`, CMS docs). Этот аудит оценивает только doctor messages unified chat. При подготовке PR/commit нужно отделить unrelated CMS/patient-home изменения или явно описать их отдельным блоком.

---

## Рекомендации post-audit

1. **Закрыто 2026-05-02:** в строку диалога `/app/doctor/messages` добавлены `phoneNormalized` и форматированный `lastMessageAt`.
2. **Закрыто 2026-05-02:** unread badge на CTA в `ClientProfileCard` добавлен через лёгкий endpoint/query без создания диалога.
3. При следующем cleanup вынести messaging port/types из `@/infra/repos/pgSupportCommunication` в `modules/messaging/ports.ts` / `types.ts`.
4. Перед release/stage вручную пройти smoke из ТЗ: список без диалогов, список с unread, отправка, polling, открытие из карточки, исчезновение unread badge, отсутствие регрессии broadcasts.
5. **Закрыто 2026-05-02 в docs:** plan/doc статусы синхронизированы ссылками на audit и post-audit fixes; runtime-source remains code/tests/LOG.
6. **Закрыто 2026-05-02 (hardening):** `ensure`/`unread-by-patient` учитывают `patient_not_found`; `DoctorSupportInbox` и `DoctorChatPanel` обрабатывают сетевые ошибки в load/polling без падения UI.
