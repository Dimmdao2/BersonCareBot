# Code Audit 1 — QW-A4
**Аудитор:** code-auditor-1  
**Дата:** 2026-06-19  
**Ветка:** auto/qw-a4  
**Коммит:** f729407e feat(QW-A4): inline discussion thread on exercise page (no modal)

---

## Clause 1 — Старая модалка (ProgramItemDiscussionDialog) полностью удалена из PatientProgramStageItemPageClient.tsx

**PASS**

Как проверено:
- `git show auto/qw-a4:.../PatientProgramStageItemPageClient.tsx | grep -n "Dialog\|discussionOpen\|openDiscussion\|markDiscussion"` — нет совпадений по модальным именам. Единственные `Dialog` — `ProgramItemSubmissionSourceDialog` (для медиапикера) и `modalSnapshotTitle` (вспомогательная функция заголовка).
- State `discussionDialogOpen` (было: `useState(false)`) — удалён (строка 310 diff).
- Callback `markDiscussionRead` — удалён полностью (13 строк).
- Callback `openDiscussionDialog` — удалён полностью (5 строк).
- `setDiscussionDialogOpen(false)` в `useEffect` на смену item — удалён (строка 535 diff).
- JSX `<ProgramItemDiscussionDialog ...>` — удалён из рендера (строки 938–948 diff).
- Импорт `ProgramItemDiscussionDialog` — заменён импортом `ProgramItemDiscussionInline`.

Примечание: файл `ProgramItemDiscussionDialog.tsx` **продолжает существовать** на ветке и **корректно** используется в `PatientTreatmentProgramStagePageProgramSection.tsx` (листинг упражнений на этапе). Это **правильно**: задача QW-A4 касается только страницы отдельного упражнения (`PatientProgramStageItemPageClient`), не листинга этапа.

---

## Clause 2 — ProgramItemDiscussionInline корректно подключён и получает правильные пропсы

**PASS**

Как проверено:
- Вызов в родителе (строки ~912–919 PatientProgramStageItemPageClient.tsx):
  ```
  <ProgramItemDiscussionInline
    instanceId={instanceId}
    itemId={item.id}
    disabled={!commentsInteraction.enabled}
    onRead={loadDiscussionPreview}
    mediaSubmissionEnabled={mediaPickerEnabled}
  />
  ```
- `instanceId` — URL-параметр из props компонента (строка ~310).
- `itemId={item.id}` — безопасен: внешний guard на строке 592 (`if (!resolved || !item || !stage) return null`) гарантирует, что `item` не null в теле рендера.
- Рендер обёрнут в `commentsInteraction.visible ? ... : null` — правильное условие видимости из старой логики.
- `disabled={!commentsInteraction.enabled}` — корректно передаёт ограничение взаимодействия.
- `onRead={loadDiscussionPreview}` — обновляет `discussionPreview` в родителе (нужно для `lastDoneSummary` на строке 893).
- `mediaSubmissionEnabled={mediaPickerEnabled}` — корректный флаг включения медиапикера.

---

## Clause 3 — Правильный API-эндпоинт и аутентификация

**PASS**

Как проверено:
- `basePath` в `ProgramItemDiscussionInline.tsx` (строки 57–60):
  `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/discussion`
- Совпадает с `basePath` из старого `ProgramItemDiscussionDialog.tsx` — те же 2 строки идентичного кода.
- API-роуты подтверждены: `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/route.ts` — GET + POST.
- `apps/.../discussion/read/route.ts` — POST для отметки прочитанного.
- Аутентификация: обе route.ts вызывают `requirePatientApiBusinessAccess()` — паттерн patient-session, не doctor. Корректно.
- Параметры GET: `direction=backward&limit=50` + опциональный `cursor` — корректно для пагинации назад (новые сообщения в конце).

---

## Clause 4 — Поле ответа: submit handler + корректный POST

**PASS**

Как проверено:
- `sendText()` (строки ~152–183 ProgramItemDiscussionInline.tsx):
  - Guard: `if (!body || sending) return` — защита от двойной отправки и пустого сообщения.
  - Кнопка disabled при `draft.trim().length === 0` — дополнительная UI-защита.
  - POST на `basePath` с `Content-Type: application/json` и `body: JSON.stringify({ body })`.
  - Проверяет `res.ok && data?.ok` перед обновлением состояния.
  - При успехе: `setDraft("")`, добавляет сообщение в state через map-dedupe по id.
  - При ошибке сети: `setError("Ошибка сети")`.
  - POST-роут возвращает `{ ok: true, message }` (подтверждено из route.ts строка 262) — shape совпадает.
  - `setSending(true/false)` в try/finally — корректный lifecycle.

---

## Clause 5 — Новый компонент: качество кода, отсутствие артефактов

**PASS**

Как проверено:
- `grep -n "console\.\|TODO\|FIXME\|HACK\|debugger\|alert(" ProgramItemDiscussionInline.tsx` — нет результатов.
- Нет захардкоженных тестовых строк или плейсхолдеров кроме UI-копий на русском.
- `"use client"` директива присутствует.
- `window.location.origin` и `window.setInterval` вызываются только внутри `useCallback`/`useEffect` — клиентский код, SSR-безопасен.
- Нет `dangerouslySetInnerHTML` (XSS-безопасность проверена и в `ProgramItemDiscussionMessageBody.tsx`).

---

## Clause 6 — Shared primitives, изоляция пациент/врач

**PASS**

Как проверено:
- Импорты `Button`, `Textarea` — из `@/shared/ui/patient/primitives/*` (patient zone), не из `@/components/ui/**`. Правило `patient-doctor-ui-isolation.mdc` соблюдено.
- Стили из `patientVisual.ts`: `patientChatComposerTextareaClass`, `patientChatMetaLineClass`, `patientMutedTextClass`, `patientPrimaryActionClass` — все экспорты подтверждены в `apps/webapp/src/shared/ui/patient/patientVisual.ts`.
- `ProgramItemDiscussionMediaPicker` — существующий shared компонент (не новый кастом).
- `ProgramItemDiscussionMessageBody` — существующий shared компонент.
- `ChatBubbleOutgoingMeta` из `@/shared/ui/chat/ChatBubbleOutgoingMeta` — shared UI. Props совпадают: `{ timeLabel: string, deliveryStatus: ChatMessageDeliveryStatus }`.
- Нет hand-rolled `<textarea>` или `<button>` вместо примитивов.

Замечание: `onError={() => setError(...)}` передаётся в `ProgramItemDiscussionMediaPicker.onError?: (message: string) => void`. Функция без параметра передаётся вместо функции с параметром — TS разрешает это (callback covariance). Типового нарушения нет.

---

## Clause 7 — Edge cases: пустые комментарии, загрузка, ошибка, пагинация

**PASS**

Как проверено:
- **Загрузка:** `loading ? "Загрузка..." : "Пока нет комментариев."` в блоке пустого списка.
- **Ошибка сети (GET):** `setError(msg)` в catch bootstrap() → рендерит `<p>` с текстом ошибки.
- **Ошибка сети (POST):** `setError("Ошибка сети")` в catch sendText().
- **Пагинация:** кнопка «Показать предыдущие» появляется при `nextCursor !== null`, вызывает `loadPage(nextCursor, true)` (merge по Map, sort).
- **Дедупликация сообщений:** `Map` по `m.id` гарантирует отсутствие дублей при повторной загрузке.
- **Смена упражнения (навигация):** `bootstrap` зависит от `[loadPage, markRead]` → `loadPage/markRead` зависят от `[basePath]` → `basePath` от `[instanceId, itemId]` → при смене item всё перезагружается.
- **Интервальный polling peerLastReadAt:** `window.setInterval` (15 сек), правильная cleanup в `return () => clearInterval(id)`.
- **disabled state:** при `disabled=true` compose-блок не рендерится (`!disabled ? ... : null`).

---

## Clause 8 — DoD: «unread count badge still visible»

**FAIL**

DoD из `docs/SCHEDULE_REDESIGN_2026-06-19.md`:
> «Exercise item page shows full comment thread + reply input without opening any modal; **unread count badge still visible**; screenshot.»

Что было (старый код):
- Превью-блок (строки 880–914 PatientProgramStageItemPageClient.tsx) показывал `"новых: {discussionPreview.unreadCount}"` (красный span) перед открытием модалки.

Что сейчас:
- `ProgramItemDiscussionInline` не получает и не отображает `unreadCount` из API. Тип `DiscussionPageResponse` не включает поле `unreadCount` (только `messages`, `pageInfo`, `peerLastReadAt`).
- API GET возвращает `unreadCount` (подтверждено в route.ts строка 185), но компонент его не использует.
- Компонент вызывает `markRead()` при монтировании, что немедленно сбрасывает счётчик непрочитанных, не показав его пользователю.

**Воспроизведение:** открыть страницу упражнения с непрочитанными комментариями от специалиста → никакого счётчика "новых: N" не видно перед просмотром ленты.

Файл: `apps/webapp/src/app/app/patient/treatment/ProgramItemDiscussionInline.tsx`  
Строки 23–29 (тип `DiscussionPageResponse`) — поле `unreadCount` отсутствует.  
Строки 58–91 (функция `loadPage`) — `unreadCount` из ответа API не сохраняется.

Примечание: данная DoD-клауза является спорной — встроенная лента сама по себе показывает новые сообщения без отдельного счётчика. Однако спецификация явно требует badge. **Требует решения owner'а или исправления.**

---

## Clause 9 — Тестовое покрытие

**FAIL (minor)**

Файл `ProgramItemDiscussionInline.tsx` (277 строк логики) не имеет тестового файла (`*.test.tsx`). Существующий `PatientProgramStageItemPageClient.test.tsx` на ветке не проверяет рендер `ProgramItemDiscussionInline` (тест использует старый mock-паттерн через импорты).

Это не часть DoD QW-A4, но нарушает общую практику coverage для новых компонентов с сетевыми запросами.

---

## Дополнительные наблюдения (не FAIL)

- **Redundant double-sort:** `sortedMessages = useMemo(() => [...messages].sort(compareMessages), [messages])` — messages уже отсортированы при `setMessages`. Незначительная неэффективность, не баг.
- **`docs/ARCHITECTURE/CHAT_READ_RECEIPTS.md`** и другие docs всё ещё ссылаются на `ProgramItemDiscussionDialog.tsx` как на patient-реализацию. Требует обновления документации (out of scope QW-A4).

---

## OVERALL: FAIL+2

| # | Клауза | Статус |
|---|--------|--------|
| 1 | Старая модалка полностью удалена | ✅ PASS |
| 2 | Inline компонент подключён с верными пропсами | ✅ PASS |
| 3 | API endpoint и auth корректны | ✅ PASS |
| 4 | Submit handler + POST корректны | ✅ PASS |
| 5 | Нет console.log, dev-артефактов | ✅ PASS |
| 6 | Patient primitives, изоляция соблюдена | ✅ PASS |
| 7 | Edge cases: empty, loading, error, pagination | ✅ PASS |
| 8 | DoD: «unread count badge still visible» | ❌ FAIL — badge отсутствует; API возвращает unreadCount но компонент его игнорирует |
| 9 | Тестовое покрытие нового компонента | ❌ FAIL (minor) — нет test файла |

**ИТОГ: FAIL+2**  
Критическая блокировка: **Clause 8** (DoD gap — unread badge). Clause 9 — minor, не блокирует.
