# CODE AUDIT 2 — QW-B5 + QW-A2 (независимый, CODE-AUDITOR-2, Sonnet)

**Дата:** 2026-06-19  
**Ветка:** auto/qw-a2-b5  
**Аудитор:** CODE-AUDITOR-2 (Sonnet, независим от auditor-1)  
**Метод:** §7 СТАНДАРТ ГЛУБОКОГО КОД-АУДИТА — презумпция «не работает»

---

## QW-B5: reminders.ts — selectedChannels filter

### B5-C1: Трассировка данных — источник `fetched`, тип `selectedChannels`

**PASS**

**Как проверено:**
- `reminders.ts:515` — `deliveryTargetsFetched = await deps.deliveryTargetsPort.getTargetsByChannelBinding(bindingParams)` — результат `DeliveryTargetsFetchResult | null`
- `reminders.ts:516` — `const fetched = deliveryTargetsFetched` — локальный алиас для удобства optional chaining
- Контракт: `contracts/notificationChannels.ts:34-37` — `DeliveryTargetsFetchResult = { channelBindings: Record<string,string>; resolution?: ResolvedNotificationChannelsPayload }`. Поле `resolution` — опциональное.
- `ResolvedNotificationChannelsPayload.selectedChannels: NotificationChannelCode[]` — всегда `array` (никогда `undefined`) когда `resolution` существует.
- Вывод: `fetched?.resolution?.selectedChannels` может быть `undefined` (если `fetched===null` или `resolution` отсутствует) либо `NotificationChannelCode[]` (включая `[]`). Типы корректны.

---

### B5-C2: Пустой массив `selectedChannels: []` — поведение и интент

**PASS**

**Как проверено:**
- `reminders.ts:538` — `if (fetched?.resolution?.selectedChannels)` — в JS пустой массив `[]` truthy.
- При `selectedChannels = []`: условие ВХОДИТ в ветку → `selectedSet = new Set([])` → `channelsToSend.filter(ch => selectedSet.has(ch.channel))` → `filter` возвращает `[]` для любого ch → `sendChannels = []`.
- `reminders.ts:689` — `for (const { channel, chatId, externalId } of sendChannels)` — цикл не выполняется, никаких отправок в мессенджер.
- Это ИНТЕНДИРОВАННОЕ поведение (пользователь отключил все каналы → не отправляем). Подтверждается комментарием в коде (`reminders.ts:539-541`) и тест-кейсом #2 (`selectedChannels = []`, `expect(enqueuedChannels()).toHaveLength(0)`).
- Поведение КОРРЕКТНО для сценария «пользователь выключил все мессенджер-каналы».

---

### B5-C3: Легаси-ветка `else if hasResolvedTopicBindings` при null-fetched

**PASS**

**Как проверено:**
- `reminders.ts:504` — `if (topicCode && deps.deliveryTargetsPort)` — порт запрашивается только при наличии обоих.
- Если `getTargetsByChannelBinding()` вернул `null`: `fetched = null` → `fetched?.resolution?.selectedChannels` = `undefined` → falsy → первая ветка НЕ входит.
- `hasResolvedTopicBindings = null?.channelBindings && ...` = `undefined` = falsy → `else if` тоже НЕ входит.
- Итог: `sendChannels = channelsToSend` (все каналы) — легаси-поведение без фильтрации сохранено.
- Если порт отсутствует (`deps.deliveryTargetsPort` нет): весь блок `if (topicCode && deps.deliveryTargetsPort)` пропускается, `sendChannels = channelsToSend` — аналогично.
- Регрессии для старых deployments без порта нет.

---

### B5-C4: Пересечение типов — `web_push`/`email` в `selectedChannels` vs `channelsToSend`

**PASS**

**Как проверено:**
- `reminders.ts:487` — `channelsToSend: Array<{ channel: 'telegram' | 'max'; ... }>` — строго typed, содержит только `'telegram'` и `'max'`, никогда `'web_push'`/`'email'`.
- `selectedChannels: NotificationChannelCode[]` может содержать `'web_push'` или `'email'`, но `selectedSet.has(ch.channel)` где `ch.channel ∈ {'telegram','max'}` — совпадение только при наличии `'telegram'`/`'max'` в set.
- Внешние каналы (`web_push`/`email`) в `selectedChannels` не вызывают ложных DROP-ов и не добавляют несуществующие каналы — фильтр работает только по совпадению.
- Риска «случайно дропнуть web_push» нет, т.к. `web_push` никогда не попадает в `channelsToSend`.

---

### B5-C5: Покрытие тестами

**PASS (с замечанием — не блокирующим)**

**Как проверено:**
Файл: `reminders.channelFilter.test.ts`, 4 теста в describe `B-5`:

1. `sends to telegram when selectedChannels includes telegram (baseline)` — новый путь, happy-path.
2. `sends nothing when selectedChannels is empty (all messengers OFF)` — ключевой фикс-кейс, `selectedChannels=[]`, bindings пустые → 0 sends.
3. `sends only to telegram when max is disabled` — частичный disable, MAX identity присутствует.
4. `sends nothing when selectedChannels omits telegram even though occ.chatId is set` — chatId есть, но selectedChannels=[] → 0 sends.

Покрыты: все 4 новых поведения новой ветки. Все тесты тестируют именно `if (fetched?.resolution?.selectedChannels)` — первую ветку.

**Замечание (не блокирующее):** Нет теста для «легаси»-пути (когда `deliveryTargetsPort` вернул `null` или `resolution` отсутствует — `else if hasResolvedTopicBindings`). Этот путь не регрессировал (подтверждено трассировкой), и добавление теста — опционально. Существующее покрытие достаточно для данного фикса.

---

### B5-C6: §6 — Архитектурные критерии

**PASS**

- Нет сырого SQL — изменение логика-only в `reminders.ts:538-543`.
- Нет дублирования: единый chokepoint фильтрации каналов перед dispatch (L689).
- Нет нарушений изоляции слоёв.

---

## QW-A2: PatientInstanceStageItemCard.tsx — удаление кнопки «Выполнено»

### A2-C1: Трассировка JSX после удаления кнопки

**PASS**

**Как проверено:**
Полный файл прочитан: строки 1-338.

После удаления ветки с кнопкой «Выполнено», JSX в зоне `!isPersistentRecommendation(item)` больше не существует. Структура рендера теперь (L302-327):

```
{!contentBlocked && !readOnly && itemInteraction === "full" ? (
  item.itemType === "clinical_test" ? (
    <div>... PatientTestSetProgressForm ...</div>
  ) : null          // ← для НЕ-clinical_test ничего
) : null}           // ← для readOnly/contentBlocked ничего
```

Семантика: для non-clinical_test элементов при `!contentBlocked && !readOnly && itemInteraction === "full"` рендерится `null` — корректно, без dangling branches. Закрывающие скобки сбалансированы (L326: `: null`, L327: `: null}`). Компонент компилируется.

---

### A2-C2: Пропс `planItemDoneRepeatCooldownMinutes` — интерфейс vs реализация

**PASS**

**Как проверено:**
- `PatientInstanceStageItemCard.tsx:56` — `planItemDoneRepeatCooldownMinutes: number` — required prop (нет `?`), присутствует в интерфейсе.
- Деструктуризация в компоненте (L58-75): `planItemDoneRepeatCooldownMinutes` НЕ деструктурируется — прпос принимается но не используется.
- TypeScript не выдаёт ошибку на «принятый, но неиспользованный» проп.
- Оба caller-а (`PatientInstanceStageBody.tsx:152,189`) передают `planItemDoneRepeatCooldownMinutes={planItemDoneRepeatCooldownMinutes}` — проп-контракт удовлетворён.
- `PatientTreatmentTabProgram.tsx:66` → `PatientTreatmentProgramStagePageClient` → далее → `PatientInstanceStageBody` — цепочка не обрывается.

---

### A2-C3: `useMemo` — не осиротевший импорт

**PASS**

**Как проверено:**
- `PatientInstanceStageItemCard.tsx:3` — `import { useCallback, useEffect, useMemo, useState } from "react"`
- `useMemo` используется:
  - L81: `const recommendationPreviewMedia = useMemo(...)` — вычисление превью медиа рекомендации.
  - L85: `const recommendationBodyPreview = useMemo(...)` — вычисление превью текста.
- Импорт активный, не осиротевший.

---

### A2-C4: Осиротевший импорт `isPersistentRecommendation`

**FAIL**

**file:line:** `PatientInstanceStageItemCard.tsx:10`

**Дефект:** `isPersistentRecommendation` импортируется из `@/modules/treatment-program/stage-semantics` (L9-12), но имеет ровно 1 упоминание в файле — только в самой import-строке (L10). После удаления ветки с кнопкой «Выполнено», которая использовала `isPersistentRecommendation` в условии, функция нигде в теле компонента не вызывается.

**Воспроизведение:** `grep -c "isPersistentRecommendation" PatientInstanceStageItemCard.tsx` → `1` (только строка импорта). TypeScript с `noUnusedLocals` выдаст предупреждение/ошибку (зависит от tsconfig).

**Также:** Пропсы `lastDoneAtIsoByItemId?: ...` (L52) и `planItemDoneRepeatCooldownMinutes: number` (L56) остались в интерфейсе, но не деструктурируются и не используются в теле — `lastDoneAtIsoByItemId` особенно: она опциональная, принимается, но нигде не применяется. Для `planItemDoneRepeatCooldownMinutes` это допустимо (backward-compat контракт), для `lastDoneAtIsoByItemId` — мёртвый код в интерфейсе. Не блокирует компиляцию (strict TS не проверяет неиспользованные пропсы), но сигнализирует о неполной зачистке.

**Степень критичности:** Некритично для runtime (осиротевший импорт не ломает поведение), но нарушает §6 п.10 (чистота кода) и может вызвать предупреждение TS при `noUnusedLocals: true`.

---

### A2-C5: Удалённые импорты не остались в файле

**PASS**

**Как проверено:** Проверка grep по всем удалённым символам:
- `patientCompactActionClass` — не найдено (удалён)
- `patientSimpleCompleteDoneButtonToneClass` — не найдено (удалён)
- `mergeLastActivityDisplayedIso` — не найдено (удалён)
- `isItemDoneCooldownActive` — не найдено (удалён)
- `planItemDoneRepeatCooldownMsFromMinutes` — не найдено (удалён)
- `planItemDoneRepeatCooldownMs` — не найдено (удалён)
- `mergedDoneIso` — не найдено (удалён)
- `simpleCompleteDoneFrozen` — не найдено (удалён)

Все ожидаемые удаления выполнены.

---

### A2-C6: §6 — Архитектурные критерии

**PASS**

- Нет нового кода — только удаление. §6 нарушений нет.
- Нет дублирования.
- Нет нарушений изоляции.

---

## Итоговая таблица

| Пункт | Результат | Краткое основание |
|-------|-----------|-------------------|
| B5-C1: тип/источник `fetched` + `selectedChannels` | PASS | Типы корректны, `resolution?.selectedChannels` — `array\|undefined` |
| B5-C2: `selectedChannels=[]` truthy → 0 sends | PASS | JS truthy [], Set.has→false, sendChannels=[], loop пустой |
| B5-C3: legacy else-if при null-fetched | PASS | null?.x = undefined = falsy, легаси-поведение сохранено |
| B5-C4: web_push/email в selectedChannels vs channelsToSend | PASS | channelsToSend строго typed telegram\|max, нет риска ложных DROP-ов |
| B5-C5: покрытие тестами | PASS | 4 теста покрывают фикс-сценарий; легаси-путь не протестирован (не блокирует) |
| B5-C6: §6 | PASS | Логика-only, нет SQL, нет дублирования |
| A2-C1: JSX после удаления кнопки | PASS | null-ветки сбалансированы, семантика корректна |
| A2-C2: planItemDoneRepeatCooldownMinutes в интерфейсе | PASS | Все callers передают, TS не ошибается |
| A2-C3: useMemo не осиротел | PASS | useMemo используется в 2 местах |
| **A2-C4: isPersistentRecommendation — осиротевший импорт** | **FAIL** | **L10: импортируется, нигде не вызывается в теле** |
| A2-C5: удалённые импорты очищены | PASS | Все 8 удалённых символов отсутствуют |
| A2-C6: §6 | PASS | Только удаление, нарушений нет |

---

## ВЕРДИКТ: FAIL (1 дефект)

**FAIL по A2-C4:** `apps/webapp/src/app/app/patient/treatment/program-detail/PatientInstanceStageItemCard.tsx:10` — осиротевший импорт `isPersistentRecommendation`. После удаления кнопки «Выполнено» импорт не был зачищен.

**Фикс:** Удалить `isPersistentRecommendation,` из строки 9-12 (или всю строку 10, если `patientStageItemShowsNewBadge` остаётся — он используется на L80).

Точная замена:
```ts
// было:
import {
  isPersistentRecommendation,
  patientStageItemShowsNewBadge,
} from "@/modules/treatment-program/stage-semantics";

// стало:
import {
  patientStageItemShowsNewBadge,
} from "@/modules/treatment-program/stage-semantics";
```

Дополнительно (не блокирующее, рекомендация): убрать из интерфейса `lastDoneAtIsoByItemId?: Readonly<Record<string, string>>` (L52) — пропс принимается но нигде не используется после удаления кнопки.

Все пункты QW-B5 — **PASS**. QW-A2 — **FAIL** (1 дефект, легко исправим).
