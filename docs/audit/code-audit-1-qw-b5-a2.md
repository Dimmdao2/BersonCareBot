# CODE-AUDIT-1 — QW-B5 + QW-A2
**Аудитор:** CODE-AUDITOR-1 (Sonnet, независимый)  
**Дата:** 2026-06-19  
**Ветка:** `auto/qw-a2-b5`  
**Стандарт:** §7 ROLE_PROMPTS_v3.md (глубокий аудит; презумпция «не работает»)

---

## ИТОГОВЫЙ ВЕРДИКТ

| Пункт | Вердикт |
|-------|---------|
| B5-1: Трассировка условия `selectedChannels` | PASS |
| B5-2: Трассировка truthy-проверки `if ([])` | PASS |
| B5-3: Крайние случаи (null/undefined resolution, push-only selectedChannels) | PASS |
| B5-4: Нет повторного присвоения `sendChannels` после блока | PASS |
| B5-5: Тест-покрытие — 4 сценария | PASS |
| A2-1: Удалённые импорты не используются в файле | PASS |
| A2-2: `useMemo` по-прежнему нужен | PASS |
| A2-3: Остаточные Props в интерфейсе (`lastDoneAtIsoByItemId`, `planItemDoneRepeatCooldownMinutes`) | FAIL (minor / dead-prop) |
| A2-4: JSX после удаления кнопки — нет dangling ternary | PASS |
| §6-1: Нет сырого SQL | PASS |
| §6-2: Нет новых hand-rolled UI без shared-примитива | PASS |
| §6-3: Нет новых импортов, которые должны идти через shared | PASS |

**Общий вердикт: PASS с одним minor FAIL (A2-3)** — дефект не влияет на рантайм, но оставляет мёртвые props в интерфейсе (TypeScript-технически безопасно, но нарушает принцип чистоты).

---

## QW-B5: reminders — selectedChannels filter

### B5-1: Трассировка условия и путь данных

**PASS**

Как проверено: `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts`, строки 487–551.

Полный поток данных:
1. `channelsToSend` строится из `occ.chatId` (Telegram) и `allIdentities` (MAX) — строки 487–497.
2. `let sendChannels = channelsToSend` (строка 500) — изначально все каналы без фильтра.
3. Если `topicCode && deps.deliveryTargetsPort` (строка 504): вызывается `getTargetsByChannelBinding(...)` → результат в `deliveryTargetsFetched` → `fetched = deliveryTargetsFetched` (строка 516).
4. `fetched` существует тогда и только тогда, когда `deps.deliveryTargetsPort` присутствует **и** порт вернул ненулевой результат.
5. `fetched?.resolution?.selectedChannels` — строка 538. Согласно типу `ResolvedNotificationChannelsPayload` (`notificationChannels.ts:28`), `selectedChannels` — **обязательное** поле типа `NotificationChannelCode[]`. Т.е. при наличии `resolution` поле всегда присутствует. Опциональность только на `resolution` (поле `DeliveryTargetsFetchResult.resolution?`).
6. Ветки:
   - `fetched` — undefined → `?.resolution?.selectedChannels` → undefined → условие false → `sendChannels` не меняется (без фильтра).
   - `fetched.resolution` — undefined → `?.selectedChannels` → undefined → false → fallthrough к `else if (hasResolvedTopicBindings)`.
   - `fetched.resolution.selectedChannels` — массив (включая `[]`) → условие true → применяем `Set`-фильтр.
7. После блока (строки 553–687) `sendChannels` больше нигде не перезаписывается до итерации `for (const { channel, chatId, externalId } of sendChannels)` на строке 689.

### B5-2: Критическая проверка truthy-поведения пустого массива

**PASS**

Как проверено: Анализ логики JS + типов.

`if (fetched?.resolution?.selectedChannels)` — ключевой вопрос: что происходит когда `selectedChannels = []`?

- В JavaScript пустой массив `[]` является **truthy** значением: `Boolean([]) === true`.
- Следовательно при `selectedChannels = []`:
  - Условие **true** → входим в первую ветку.
  - `const selectedSet = new Set([])` — пустое множество.
  - `channelsToSend.filter((ch) => selectedSet.has(ch.channel))` — для любого канала `has(...)` вернёт `false`.
  - `sendChannels = []` → ни один канал не получит сообщение.
  - **Результат: корректный** — «все каналы отключены».
- При `selectedChannels = undefined` (поле отсутствует):
  - Условие **false** → не входим в первую ветку.
  - Переходим к `else if (hasResolvedTopicBindings)` — старое поведение (по bindings).
  - **Результат: корректный** — обратная совместимость сохранена.

Это **интенциональное** поведение, правильно описанное в комментарии строк 539–542.

### B5-3: Крайние случаи

**PASS**

Как проверено: трассировка по типам + код строки 504–551.

**(a) `selectedChannels` содержит только не-мессенджерные каналы (например `['push']`):**
- `channelsToSend` строится только из `'telegram'` и `'max'` записей (строки 488–496).
- `selectedSet = new Set(['push'])`.
- `channelsToSend.filter((ch) => selectedSet.has(ch.channel))` — для `ch.channel === 'telegram'` или `'max'` → `has(...)` вернёт `false` → `sendChannels = []`.
- Telegram/MAX не получат сообщение. Поведение корректное — `push`-канал не относится к мессенджерному пути `channelsToSend`.

**(b) `fetched` существует, но `resolution` — null/undefined:**
- `fetched?.resolution?.selectedChannels` → `undefined?.selectedChannels` → `undefined` → false.
- Падает в `else if (hasResolvedTopicBindings)` → старое поведение.
- `?.` цепочка безопасна.

**(c) `deliveryTargetsPort` отсутствует (`deps.deliveryTargetsPort === undefined`):**
- Строка 504: `if (topicCode && deps.deliveryTargetsPort)` → false → весь блок пропускается.
- `sendChannels` остаётся `channelsToSend` без фильтра. Старое pre-fix поведение — ожидаемо для сред без порта.

### B5-4: Нет повторного переопределения `sendChannels` после блока

**PASS**

Как проверено: `grep -n "sendChannels"` — строки 500, 543, 545, 571, 689.

После блока 504–551 переменная `sendChannels` используется только для:
- `recordMessengerNotEnqueuedSkipsBestEffort(..., sendChannels, ...)` — строка 571 (только чтение).
- `for (const { channel, chatId, externalId } of sendChannels)` — строка 689 (итерация, только чтение).
Перезаписей нет.

### B5-5: Тест-покрытие

**PASS**

Как проверено: `apps/integrator/src/kernel/domain/executor/handlers/reminders.channelFilter.test.ts` (4 теста).

| Тест | Сценарий | Покрывает |
|------|----------|-----------|
| `baseline` | `selectedChannels: ['telegram']` + `channelBindings: {telegramId}` | Положительный кейс — telegram отправлен |
| `all-off` | `selectedChannels: []` + `channelBindings: {}` | **Главный кейс бага** — пустые bindings + пустые selectedChannels → ничего не отправлено |
| `partial-disable` | `selectedChannels: ['telegram']` + MAX identity в identities | Частичное отключение — telegram да, max нет |
| `chatId-but-no-channel` | `occ.chatId > 0` + `selectedChannels: []` | ChatId присутствует, но explicit disable → ничего |

Тест-файл правильно тестирует интеграцию через `handleReminders` целиком (не mock-пропуская логику), что обеспечивает регрессионную защиту.

---

## QW-A2: PatientInstanceStageItemCard — удаление кнопки «Отметить выполненным»

### A2-1: Удалённые импорты не используются в файле

**PASS**

Как проверено: `grep -n` по файлу `PatientInstanceStageItemCard.tsx`.

Удалённые сущности:
- `mergeLastActivityDisplayedIso` — в файле отсутствует (grep: 0 вхождений).
- `isItemDoneCooldownActive` — в файле отсутствует.
- `planItemDoneRepeatCooldownMsFromMinutes` — в файле отсутствует.
- `patientCompactActionClass` — в файле отсутствует.
- `patientSimpleCompleteDoneButtonToneClass` — в файле отсутствует.

Все 5 удалённых импортов полностью исключены из тела компонента. Импорты из `stageItemSnapshot` (строки 16–19) и из `patientVisual.ts` (строки 23–25) — только используемые остаточные (`pickRecommendationRowPreviewMedia`, `parseRecommendationMediaFromSnapshot`, `recommendationBodyMdPreviewPlain`, `patientMutedTextClass`, `patientPillClass`).

### A2-2: `useMemo` по-прежнему нужен

**PASS**

Как проверено: `grep -n "useMemo"` по файлу (строки 3, 81, 85).

`useMemo` импортируется из React (строка 3) и используется дважды:
- Строка 81: `const recommendationPreviewMedia = useMemo(...)`.
- Строка 85: `const recommendationBodyPreview = useMemo(...)`.

Импорт не стал мёртвым — удалять нельзя.

### A2-3: Остаточные мёртвые Props в интерфейсе

**FAIL (minor)**

**Файл:** `apps/webapp/src/app/app/patient/treatment/program-detail/PatientInstanceStageItemCard.tsx:52, 56`

**Дефект:** Props `lastDoneAtIsoByItemId` и `planItemDoneRepeatCooldownMinutes` объявлены в интерфейсе функции (строки 52 и 56), но **не деструктурируются** и **не используются** в теле компонента (деструктуризация на строках 58–75 не включает ни одно из них).

```
// Строка 52: МЁРТВЫЙ PROP
lastDoneAtIsoByItemId?: Readonly<Record<string, string>>;

// Строка 56: МЁРТВЫЙ PROP (к тому же обязательный — required, не optional)
planItemDoneRepeatCooldownMinutes: number;
```

**Влияние на рантайм:** нулевое — TypeScript проверит, что все callers передают `planItemDoneRepeatCooldownMinutes` (обязательный), а сам компонент его игнорирует.

**Влияние на TypeScript:** компилятор не ругается на неиспользуемые props в объектном деструктурировании (это не переменная без использования). Компиляция успешна.

**Влияние на вызывающий код:** все callers обязаны продолжать передавать `planItemDoneRepeatCooldownMinutes`, несмотря на то что он не используется. Это:
1. Нарушает принцип минимального интерфейса.
2. Может ввести следующего разработчика в заблуждение (зачем этот prop?).
3. Вызывает ложные зависимости во всей цепочке: `PatientInstanceStageBody.tsx:152,189`, `PatientPlanTabPanels.tsx:89`, etc.

**Воспроизведение:** `grep -n "planItemDoneRepeatCooldownMinutes" PatientInstanceStageItemCard.tsx` → только в интерфейсе (строка 56), не в теле.

**Рекомендация:** Удалить оба prop из интерфейса, убрать их из вызовов в `PatientInstanceStageBody.tsx` (строки 152, 189). Это требует отдельного прохода по всей цепочке callers.

**Почему не PASS:** наличие dead prop в обязательном интерфейсе — это конкретный дефект состояния кода, а не архитектурный вопрос; согласно §7 «презумпция не сделано» → FAIL.

### A2-4: JSX после удаления кнопки — нет dangling ternary

**PASS**

Как проверено: прочтён весь JSX `PatientInstanceStageItemCard.tsx` (строки 156–338).

После удаления кнопки «Отметить выполненным» остался блок (строки 302–327):
```tsx
{!contentBlocked && !readOnly && itemInteraction === "full" ? (
  item.itemType === "clinical_test" ? (
    <div ...>
      {!clinicalTestSnapLoaded ? <p>Загрузка…</p> : <PatientTestSetProgressForm ... />}
    </div>
  ) : null
) : null}
```

Это нормально:
- Внешний ternary: `!contentBlocked && !readOnly && itemInteraction === "full"` — либо рендерит внутренний блок, либо `null`.
- Внутренний ternary: только `clinical_test` тип рендерит форму, остальные → `null`.

Ранее в этом месте был ещё один ternary `!isPersistentRecommendation(item) ? <button>...</button> : null`, добавленный как отдельная ветка. После удаления только `clinical_test`-ветка осталась — структура корректна, нет «висящего» условия без ветки.

Блок `{!contentBlocked && readOnly && item.itemType === "clinical_test" ? ... }` (строки 328–332) — тоже корректен и не затронут.

---

## §6 ALWAYS-КРИТЕРИИ

### §6-1: Нет сырого SQL

**PASS**

Как проверено: оба изменённых файла. `reminders.ts` — изменение в логике JS-условий, не SQL. `PatientInstanceStageItemCard.tsx` — React-компонент, SQL нет.

### §6-2: Нет новых hand-rolled UI без shared-примитива

**PASS**

Как проверено: QW-A2 **удаляет** UI, не добавляет. QW-B5 — бэкенд-логика.

### §6-3: Нет новых импортов, которые должны идти через shared

**PASS**

Как проверено: оба файла. В `reminders.ts` новых импортов нет. В `PatientInstanceStageItemCard.tsx` импорты только удалялись.

---

## Итоговая таблица

| # | Клауз | Вердикт | Как проверено |
|---|-------|---------|---------------|
| B5-1 | Трассировка пути данных `selectedChannels` | PASS | `reminders.ts:487–551, notificationChannels.ts:24–37` |
| B5-2 | Truthy `[]` → `sendChannels=[]` → корректно | PASS | Анализ JS truthy + `reminders.ts:538–543` |
| B5-3 | push-only selectedChannels, null resolution, no port | PASS | Трассировка типов + `reminders.ts:504–551` |
| B5-4 | `sendChannels` не перезаписывается после блока | PASS | `grep sendChannels` → строки 500,543,545,571,689 |
| B5-5 | 4 теста покрывают главный баг и крайние случаи | PASS | `reminders.channelFilter.test.ts:197–293` |
| A2-1 | Удалённые импорты нигде не используются | PASS | `grep` по `PatientInstanceStageItemCard.tsx` |
| A2-2 | `useMemo` не стал мёртвым | PASS | `PatientInstanceStageItemCard.tsx:3,81,85` |
| A2-3 | Мёртвые props в интерфейсе | **FAIL** | `PatientInstanceStageItemCard.tsx:52,56` — объявлены, не деструктурированы |
| A2-4 | JSX без dangling ternary | PASS | `PatientInstanceStageItemCard.tsx:302–332` |
| §6-1 | Нет raw SQL | PASS | оба файла |
| §6-2 | Нет new hand-rolled UI | PASS | QW-A2 удаляет, не добавляет |
| §6-3 | Нет несанкционированных импортов | PASS | оба файла |

**Итог:** 11 PASS, 1 FAIL (minor A2-3 — dead props `lastDoneAtIsoByItemId` и `planItemDoneRepeatCooldownMinutes` остались в интерфейсе `PatientInstanceStageItemCard`).
