# Аудит Фазы 4 — Рассылки

**Аудитор:** claude-4.6-sonnet-medium  
**Дата:** 2026-03-31  
**Спека:** `docs/BRANCH_UX_CMS_BOOKING/PHASE_4_TASKS.md`  
**Diff:** коммиты `f3619ec`–`0536518` (`[4.1]`–`[4.6]`)

---

## Файлы проверены

| Файл | Статус |
|---|---|
| `broadcasts/actions.ts` | ✅ |
| `broadcasts/actions.test.ts` | ✅ |
| `broadcasts/labels.ts` | ✅ |
| `broadcasts/BroadcastAudienceSelect.tsx` | ✅ |
| `broadcasts/BroadcastAudienceSelect.test.tsx` | ✅ |
| `broadcasts/BroadcastForm.tsx` | ⚠️ |
| `broadcasts/BroadcastConfirmStep.tsx` | ⚠️ |
| `broadcasts/BroadcastConfirmStep.test.tsx` | ✅ |
| `broadcasts/BroadcastAuditLog.tsx` | ⚠️ |
| `broadcasts/BroadcastAuditLog.test.tsx` | ✅ |
| `broadcasts/page.tsx` | ❌ |
| `app-layer/di/buildAppDeps.ts` — `resolveAudienceSize` | ⚠️ |
| `shared/ui/DoctorHeader.tsx` | ✅ |

---

## Соответствие спеку

**Частично** — 2 критических нарушения, 1 отсутствующий тест-блок из спека.

---

## Замечания

### 1. [severity: critical] Журнал не обновляется после успешной отправки

- **Файлы:** `broadcasts/actions.ts`, `broadcasts/page.tsx`, `broadcasts/BroadcastConfirmStep.tsx`
- **Что не так:**  
  `page.tsx` — Server Component — фетчит `listBroadcastAuditAction(50)` один раз при рендере страницы. После вызова `executeBroadcastAction` из `BroadcastForm` серверные данные **не инвалидируются**: новая запись в `broadcast_audit` НЕ появляется в таблице журнала до ручного refresh.  
  При этом `BroadcastConfirmStep` (строка 22) сообщает пользователю: **«Журнал обновится автоматически.»** — это ложное обещание.  
  В других экшенах проекта (например, `content/actions.ts`) используется `revalidatePath` из `next/cache`.
- **Как исправить:**  
  В `executeBroadcastAction` после успешного вызова `deps.doctorBroadcasts.execute()` добавить:
  ```ts
  import { revalidatePath } from "next/cache";
  // ...
  revalidatePath("/app/doctor/broadcasts");
  ```
  После этого Next.js автоматически перефетчит данные страницы, и новая запись появится в журнале.  
  Альтернатива: убрать фразу «Журнал обновится автоматически» и написать «Страница обновится при следующем переходе» — но это хуже UX.

---

### 2. [severity: critical] `onBroadcastSent` prop в `BroadcastForm` не используется из `page.tsx`

- **Файлы:** `broadcasts/page.tsx`, `broadcasts/BroadcastForm.tsx`
- **Что не так:**  
  `BroadcastForm` принимает опциональный `onBroadcastSent?: (entry) => void` для уведомления родителя об отправке. В `page.tsx`:
  ```tsx
  <BroadcastForm />
  ```
  Callback не передаётся. Это не вызывает ошибки, но означает, что родительская страница не знает о завершённой отправке — будущая логика (refresh, analytics) не подключена.  
  Замечание связано с #1: правильный паттерн — `revalidatePath` внутри экшена + при необходимости `router.refresh()` в обработчике.
- **Как исправить:**  
  После добавления `revalidatePath` в `executeBroadcastAction` (замечание #1) callback `onBroadcastSent` из `page.tsx` передавать не нужно — данные обновятся автоматически. Пропс можно оставить для будущей клиентской расширяемости.

---

### 3. [severity: major] Отсутствует `BroadcastForm.test.tsx`

- **Файл:** *(не создан)*
- **Что не так:**  
  Спека задачи 4.3 явно требует 4 RTL-теста:
  - при незаполненных полях кнопка «Предпросмотр» не вызывает Action;
  - при корректных полях Action вызывается с правильным `BroadcastCommand`;
  - в состоянии `previewing` кнопка `disabled`;
  - после успешного preview рендерится блок с числом получателей.  
  
  Ни один из них не покрыт. `BroadcastConfirmStep.test.tsx` покрывает только компонент подтверждения, не сам flow формы.
- **Как исправить:**  
  Создать `broadcasts/BroadcastForm.test.tsx` (`@vitest-environment jsdom`) с моком `./actions` и проверками четырёх кейсов из спека. Особое внимание: мок `previewBroadcastAction` должен возвращать `BroadcastPreviewResult` и проверять, что кнопка становится `disabled` во время transition.

---

### 4. [severity: major] `inactive` и `sms_only` сегменты показывают завышенный охват аудитории

- **Файл:** `app-layer/di/buildAppDeps.ts`
- **Что не так:**  
  Сегменты `inactive` и `sms_only` в `resolveAudienceSize` возвращают `all.length` (всех клиентов) с TODO-комментарием. В UI они отображаются как «Неактивные (90+ дней)» и «Только SMS». Врач видит предпросмотр с числом _всех_ клиентов (например, 200), думает что отправит 200 «неактивным», — реальная фильтрация отсутствует.  
  Это вводящая в заблуждение UX: пользователь принимает решение на основе некорректного числа.
- **Как исправить:**  
  Вариант A (рекомендуется): в `BroadcastAudienceSelect.tsx` пометить эти опции визуально как «⚠ Подсчёт недоступен» или добавить `title`-атрибут с предупреждением.  
  Вариант B: временно скрыть `inactive` и `sms_only` из списка опций до появления фильтра в порту. Удалить после появления тикета.  
  В спеке уже есть оговорка об этом, но UX-последствие не было устранено.

---

### 5. [severity: minor] `BroadcastConfirmStep.tsx` — `result` prop смешивает два несвязанных состояния

- **Файл:** `broadcasts/BroadcastConfirmStep.tsx`
- **Что не так:**  
  Компонент принимает `result: BroadcastAuditEntry | null`. Когда `result != null`, весь интерфейс подтверждения (кнопки, summary) заменяется success-сообщением. Это нарушает принцип единой ответственности: один компонент рендерит и «подтверди отправку», и «отправка выполнена».  
  Практическое следствие: при `result != null` пропсы `onConfirm`, `onCancel`, `isLoading`, `command` игнорируются, но TypeScript не сигнализирует об этом. Будущий разработчик может передать всё что угодно и не заметить.
- **Как исправить:**  
  Опционально: разбить на два компонента `BroadcastConfirmStep` + `BroadcastSentMessage` с явными типами. Или использовать discriminated union: `type Props = { state: "confirming"; ... } | { state: "sent"; result: ... }`. Это minor — текущий код функционально корректен.

---

### 6. [severity: minor] `BroadcastAuditLog.tsx` помечен `"use client"` без необходимости

- **Файл:** `broadcasts/BroadcastAuditLog.tsx`
- **Что не так:**  
  Компонент — чисто презентационный, без хуков, эффектов и браузерного API. Директива `"use client"` заставляет его грузиться в клиентский bundle. Как Server Component он рендерился бы на сервере без JS-нагрузки.
- **Как исправить:**  
  Удалить строку `"use client";`. Компонент получает данные через props из `page.tsx`, что совместимо с Server Component.

---

### 7. [severity: minor] `BroadcastForm.tsx` — dead code в ветке `stage === "sent"` (строка 104)

- **Файл:** `broadcasts/BroadcastForm.tsx`, строка 104
- **Что не так:**  
  ```ts
  command={buildCommand() ?? { category: sentEntry.category, ... }}
  ```
  `buildCommand()` возвращает `null` только если поля формы не заполнены. На стадии `"sent"` поля формы всё ещё в состоянии (не сброшены), все условия валидны, поэтому `buildCommand()` никогда не вернёт `null`. Fallback `??` недостижим.
- **Как исправить:**  
  Заменить на `command={buildCommand()!}` с явным non-null assertion, или построить команду из `sentEntry` напрямую без `??`.

---

## Тесты

**Покрытие:**

| Модуль | Тестов | Замечание |
|---|---|---|
| `actions.ts` | 4 unit | ✅ полное покрытие Actions |
| `BroadcastAudienceSelect` | 3 RTL | ✅ |
| `BroadcastConfirmStep` | 5 RTL | ✅ |
| `BroadcastAuditLog` | 6 RTL | ✅ |
| `BroadcastForm` | **0** | ❌ отсутствует, требуется по спеку |
| `labels.ts` | 0 | acceptable — pure const map |

**CI:** green ✅

---

## Решение: **rework**

Обязательно (блокирует merge):
1. `executeBroadcastAction` → добавить `revalidatePath("/app/doctor/broadcasts")` (#1)
2. Создать `BroadcastForm.test.tsx` с 4 тест-кейсами из спека (#3)

Рекомендовано (не блокирует, но снижает UX-риск):
3. Исправить UX для `inactive`/`sms_only` — предупреждение или скрытие (#4)

Опционально:
4. Удалить `"use client"` из `BroadcastAuditLog` (#6)
5. Убрать dead code в строке 104 `BroadcastForm` (#7)
6. Рефакторинг `BroadcastConfirmStep` result-prop (#5)
