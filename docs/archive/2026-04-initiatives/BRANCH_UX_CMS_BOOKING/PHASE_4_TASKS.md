# Фаза 4 — атомарные задачи (Рассылки)

Источник: `docs/BRANCH_UX_CMS_BOOKING/PLAN.md` (раздел «Фаза 4»), `docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md`, существующий сервис `apps/webapp/src/modules/doctor-broadcasts/`.

Цель фазы: полноценный UI массовых рассылок поверх готового сервиса `doctorBroadcasts` (preview / execute / listAudit).

**Что уже есть:**
- `apps/webapp/src/modules/doctor-broadcasts/service.ts` — сервис с `getCategories()`, `preview()`, `execute()`, `listAudit()`.
- `apps/webapp/src/modules/doctor-broadcasts/ports.ts` — типы `BroadcastCategory`, `BroadcastAudienceFilter` (8 значений), `BroadcastCommand`, `BroadcastPreviewResult`, `BroadcastAuditEntry`, `BroadcastAuditPort`.
- `apps/webapp/src/infra/repos/pgBroadcastAudit.ts` — PG-репо с `append()` / `list(limit)`.
- `apps/webapp/src/infra/repos/inMemoryBroadcastAudit.ts` — in-memory репо.
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` — сервис подключён как `deps.doctorBroadcasts`.
- Миграция `007_phone_challenges_message_log_broadcast_audit.sql` — таблица `broadcast_audit` существует.
- `apps/webapp/src/app/app/doctor/broadcasts/page.tsx` — заглушка с информационным баннером.

**Чего нет:**
- Server Actions для broadcasts.
- UI-компонентов для выбора аудитории и категории.
- Формы создания рассылки с предпросмотром.
- Двухшагового подтверждения перед отправкой.
- Журнала рассылок в UI.
- Реальной отправки сообщений через бота (за рамками данной фазы; `execute()` пишет в аудит с `sentCount: 0`).

**Известное ограничение:** `resolveAudienceSize` в `buildAppDeps.ts` не различает сегменты `inactive`, `without_appointment`, `sms_only` (все падают в `{}` = «все клиенты»). Исправление этого — в задаче 4.1.

---

### Задача 4.1: Server Actions для рассылок + исправить resolveAudienceSize

**Цель:** создать `"use server"` Actions-модуль для рассылок и устранить некорректный подсчёт аудитории для сегментов `inactive`, `without_appointment`, `sms_only`.

**Предусловия:**
- Сервис `deps.doctorBroadcasts` зарегистрирован в `buildAppDeps.ts`.
- `requireDoctorAccess()` гарантирует доступ только врачу.

**Файлы для изменения:**
1. `apps/webapp/src/app-layer/di/buildAppDeps.ts` — расширить `resolveAudienceSize`:
   - `without_appointment` → `{ hasUpcomingAppointment: false }` (если порт поддерживает) или подсчёт через разницу `all` − `with_upcoming_appointment`;
   - `inactive` → фильтр клиентов, у которых нет событий за последние 90 дней (или маппить в `{}` с явным TODO-комментарием, если порт не поддерживает);
   - `sms_only` → маппить в `{}` с явным TODO-комментарием до появления канального атрибута.

**Файлы для создания:**
1. `apps/webapp/src/app/app/doctor/broadcasts/actions.ts` — Server Actions:
   - `previewBroadcastAction(command: BroadcastCommand): Promise<BroadcastPreviewResult>` — вызывает `deps.doctorBroadcasts.preview(command)`.
   - `executeBroadcastAction(command: BroadcastCommand): Promise<{ auditEntry: BroadcastAuditEntry }>` — вызывает `deps.doctorBroadcasts.execute(command)`.
   - `listBroadcastAuditAction(limit?: number): Promise<BroadcastAuditEntry[]>` — вызывает `deps.doctorBroadcasts.listAudit(limit)`.
2. `apps/webapp/src/app/app/doctor/broadcasts/actions.test.ts` — unit-тесты с моком `buildAppDeps`.

**Детальное описание:**
- Файл начинается с `"use server";`.
- Каждая функция сначала вызывает `await requireDoctorAccess()`, затем `buildAppDeps()`.
- Для `previewBroadcastAction` и `executeBroadcastAction` передать `actorId: session.user.id` из результата `requireDoctorAccess()`.
- Тесты мокируют `buildAppDeps` и проверяют: корректный проброс `command`, наличие `actorId`, ответ сервиса пробрасывается как есть.

**Тесты:**
- [ ] `previewBroadcastAction` вызывает `deps.doctorBroadcasts.preview()` с правильными аргументами и возвращает `BroadcastPreviewResult`.
- [ ] `executeBroadcastAction` вызывает `deps.doctorBroadcasts.execute()` и возвращает `{ auditEntry }`.
- [ ] `listBroadcastAuditAction` вызывает `deps.doctorBroadcasts.listAudit()` с `limit`.
- [ ] Без сессии врача Actions бросают ошибку (проверяется через мок `requireDoctorAccess`).

**Критерии готовности:**
- [ ] Файл `broadcasts/actions.ts` существует, экспортирует три Actions.
- [ ] `resolveAudienceSize` в `buildAppDeps.ts` не имеет «тихих» неверных маппингов без комментария.
- [ ] `pnpm run ci` зелёный.

---

### Задача 4.2: Компонент `BroadcastAudienceSelect`

**Цель:** врач видит понятный список именованных сегментов аудитории (не сырые enum-значения) и может выбрать один.

**Предусловия:**
- Типы `BroadcastAudienceFilter` из `ports.ts` доступны.

**Файлы для создания:**
1. `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAudienceSelect.tsx` — React-компонент.

**Детальное описание:**
- Props: `value: BroadcastAudienceFilter | ""`, `onChange: (v: BroadcastAudienceFilter) => void`, `disabled?: boolean`.
- Рендерить `<select>` (или `<Select>` из shadcn/ui если используется в проекте) со всеми 8 вариантами:
  | Значение | Метка |
  |---|---|
  | `all` | Все клиенты |
  | `active_clients` | Активные клиенты |
  | `with_upcoming_appointment` | С будущей записью |
  | `without_appointment` | Без записи |
  | `with_telegram` | Telegram-пользователи |
  | `with_max` | MAX-пользователи |
  | `sms_only` | Только SMS |
  | `inactive` | Неактивные (90+ дней) |
- Первым пунктом: disabled placeholder «— выберите аудиторию —» при `value === ""`.
- Prop `disabled` блокирует select (нужен при отправке формы).

**Тесты:**
- [ ] Component/RTL: рендерится 8 опций + placeholder.
- [ ] Component/RTL: `onChange` вызывается при выборе опции с правильным `BroadcastAudienceFilter`-значением.
- [ ] Component/RTL: при `disabled=true` select не принимает взаимодействие.

**Критерии готовности:**
- [ ] Компонент рендерит все 8 сегментов с русскими метками.
- [ ] Без UX-регрессий при включении в форму.
- [ ] `pnpm run ci` зелёный.

---

### Задача 4.3: Форма создания рассылки с предпросмотром (`BroadcastForm`)

**Цель:** врач заполняет категорию, аудиторию и текст рассылки, нажимает «Предпросмотр» — система показывает, сколько получателей будет охвачено.

**Предусловия:**
- Задача 4.1 выполнена (`previewBroadcastAction` доступен).
- Задача 4.2 выполнена (`BroadcastAudienceSelect` существует).

**Файлы для создания:**
1. `apps/webapp/src/app/app/doctor/broadcasts/BroadcastForm.tsx` — клиентский компонент формы.

**Детальное описание:**

Компонент — `"use client"` с локальным состоянием (useState/useActionState).

**Поля формы:**
- **Категория** — `<select>` со списком из `BroadcastCategory` (8 значений) с русскими метками:
  | Значение | Метка |
  |---|---|
  | `service` | Сервисное |
  | `organizational` | Организационное |
  | `marketing` | Маркетинговое |
  | `important_notice` | Важное уведомление |
  | `schedule_change` | Изменение расписания |
  | `reminder` | Напоминание |
  | `education` | Образовательное |
  | `survey` | Опрос |
- **Аудитория** — `<BroadcastAudienceSelect>`.
- **Заголовок** — `<input type="text">`, обязательное поле, max 200 символов.
- **Текст сообщения** — `<textarea>`, обязательное поле, min 10 символов.

**Кнопка «Предпросмотр»:**
- Валидирует поля на клиенте (все обязательные заполнены).
- Вызывает `previewBroadcastAction` через `startTransition` (React 18+).
- Пока Action работает — кнопка показывает «Загрузка…» и `disabled`.
- После ответа рендерит `BroadcastPreviewPanel` (задача 4.4) с результатом.

**Состояния компонента:**
- `idle` — начальное, форма пустая.
- `previewing` — Action выполняется.
- `previewed` — получен `BroadcastPreviewResult`, показан `BroadcastPreviewPanel`.
- `error` — ошибка Action, показать inline-сообщение.

**Тесты:**
- [ ] Component/RTL: при незаполненных полях кнопка «Предпросмотр» не вызывает Action.
- [ ] Component/RTL: при корректных полях Action вызывается с правильным `BroadcastCommand`.
- [ ] Component/RTL: в состоянии `previewing` кнопка `disabled`.
- [ ] Component/RTL: после успешного preview рендерится блок с числом получателей.

**Критерии готовности:**
- [ ] Форма не отправляет данные без заполнения всех полей.
- [ ] Предпросмотр показывает число получателей выбранного сегмента.
- [ ] Состояние `error` показывает понятное сообщение вместо краша.
- [ ] `pnpm run ci` зелёный.

---

### Задача 4.4: Двухшаговое подтверждение и отправка (`BroadcastConfirmStep`)

**Цель:** после предпросмотра врач должен явно подтвердить отправку — случайный клик по «Отправить» невозможен.

**Предусловия:**
- Задача 4.3 выполнена (`BroadcastForm` в состоянии `previewed` рендерит слот под `BroadcastPreviewPanel`).
- Задача 4.1 выполнена (`executeBroadcastAction` доступен).

**Файлы для создания:**
1. `apps/webapp/src/app/app/doctor/broadcasts/BroadcastConfirmStep.tsx` — клиентский компонент шага подтверждения.

**Файлы для изменения:**
1. `apps/webapp/src/app/app/doctor/broadcasts/BroadcastForm.tsx` — подключить `BroadcastConfirmStep` в состоянии `previewed`; добавить состояния `confirming`, `sent`, `execute_error`.

**Детальное описание:**

`BroadcastConfirmStep` принимает props:
- `preview: BroadcastPreviewResult` — данные предпросмотра.
- `command: BroadcastCommand` — команда, готовая к отправке.
- `onConfirm: () => void` — колбэк для начала отправки (вызывает `executeBroadcastAction`).
- `onCancel: () => void` — возврат к форме.
- `isLoading: boolean` — блокировка на время отправки.

**UI шага подтверждения:**
- Карточка с summary:
  - категория рассылки (русская метка),
  - аудитория (русская метка сегмента),
  - заголовок сообщения,
  - число получателей: «**N** получателей».
- Предупреждение: «После подтверждения рассылка будет запущена и её нельзя отменить».
- Кнопка «Отправить N получателям» — при клике вызывает `executeBroadcastAction`.
- Кнопка «Назад» — возвращает в состояние `idle` с сохранёнными данными формы.
- Пока `executeBroadcastAction` выполняется — обе кнопки `disabled`, текст кнопки «Отправка…».

**После успешного `execute`:**
- `BroadcastForm` переходит в состояние `sent`.
- Показать: «Рассылка запущена. Журнал обновится автоматически.»
- Кнопка «Создать новую рассылку» сбрасывает форму в `idle`.

**Тесты:**
- [ ] Component/RTL: `onConfirm` вызывается при клике «Отправить».
- [ ] Component/RTL: `onCancel` вызывается при клике «Назад».
- [ ] Component/RTL: при `isLoading=true` обе кнопки `disabled`.
- [ ] Component/RTL: summary отображает число получателей из `preview.audienceSize`.
- [ ] Integration: успешный `executeBroadcastAction` приводит к состоянию `sent` в `BroadcastForm`.

**Критерии готовности:**
- [ ] Между нажатием «Предпросмотр» и реальной отправкой есть явный шаг подтверждения.
- [ ] Пользователь видит сводку (категория, аудитория, заголовок, число получателей) перед отправкой.
- [ ] Кнопка «Назад» не сбрасывает данные формы.
- [ ] `pnpm run ci` зелёный.

---

### Задача 4.5: Журнал рассылок (`BroadcastAuditLog`)

**Цель:** врач видит историю отправленных рассылок с датой, категорией, сегментом аудитории и счётчиком охвата.

**Предусловия:**
- Задача 4.1 выполнена (`listBroadcastAuditAction` доступен).
- Таблица `broadcast_audit` существует (миграция 007 применена).

**Файлы для создания:**
1. `apps/webapp/src/app/app/doctor/broadcasts/BroadcastAuditLog.tsx` — клиентский компонент журнала.

**Детальное описание:**

Props: `entries: BroadcastAuditEntry[]`.

**Рендер при `entries.length === 0`:** empty-state — «Рассылок ещё не было».

**Рендер при `entries.length > 0`:** таблица или список карточек с колонками:
- **Дата** — `executedAt` в формате `DD.MM.YYYY HH:mm`.
- **Категория** — русская метка из фиксированной map (та же, что в `BroadcastForm`).
- **Аудитория** — русская метка сегмента (та же map, что в `BroadcastAudienceSelect`).
- **Заголовок** — `messageTitle`.
- **Охват** — `audienceSize` получателей.
- **Отправлено** — `sentCount` (пока всегда 0 — не скрывать колонку, отображать как «0 / N»).
- **Ошибки** — `errorCount` (скрыть колонку если все записи `errorCount === 0`).

Метки категорий и аудитории вынести в отдельные `const`-мэппинги в shared-файл `broadcasts/labels.ts`, чтобы переиспользовать и в `BroadcastForm`.

**Тесты:**
- [ ] Component/RTL: при пустом массиве рендерится empty-state.
- [ ] Component/RTL: при массиве из 2 записей рендерятся 2 строки таблицы с правильными данными.
- [ ] Component/RTL: дата форматируется корректно.

**Критерии готовности:**
- [ ] Врач видит историю рассылок с понятными метками (не сырые enum-значения).
- [ ] Пустое состояние явно обозначено.
- [ ] `pnpm run ci` зелёный.

---

### Задача 4.6: Интеграция в `broadcasts/page.tsx`

**Цель:** страница `/app/doctor/broadcasts` показывает форму создания рассылки и журнал вместо информационного баннера.

**Предусловия:**
- Задачи 4.1–4.5 выполнены.

**Файлы для изменения:**
1. `apps/webapp/src/app/app/doctor/broadcasts/page.tsx` — заменить баннер-заглушку на рабочий UI.

**Файлы для создания:**
1. `apps/webapp/src/app/app/doctor/broadcasts/labels.ts` — общие const-мэппинги `AUDIENCE_LABELS` и `CATEGORY_LABELS` (рефакторинг из задачи 4.5).

**Детальное описание:**

Страница — Server Component (по умолчанию в Next.js App Router):
1. Вызывает `listBroadcastAuditAction(50)` для получения журнала.
2. Рендерит два блока:
   - **«Новая рассылка»** — `<BroadcastForm />` (клиентский).
   - **«Журнал рассылок»** — `<BroadcastAuditLog entries={entries} />` ниже формы.

Удалить старый `<section id="doctor-broadcasts-overview-section">` с placeholder-текстом.

Убедиться, что `requireDoctorAccess()` вызывается в `page.tsx` (уже есть — оставить).

**Примечание по `labels.ts`:** создать этот файл в задаче 4.5 или 4.6, рефакторнуть оба компонента (`BroadcastForm` и `BroadcastAuditLog`) на импорт из него. Если задача 4.6 создаёт файл — убедиться, что задача 4.5 уже была выполнена с inline-маппингами, и в рамках 4.6 они переносятся.

**Тесты:**
- [ ] E2E / Manual: страница `/app/doctor/broadcasts` загружается без ошибок.
- [ ] Manual: врач может заполнить форму → получить предпросмотр → подтвердить → рассылка появляется в журнале.
- [ ] Manual: без записей журнал показывает empty-state.
- [ ] Snapshot/regression: заголовок `AppShell` остаётся «Рассылки».

**Критерии готовности:**
- [ ] Баннер-заглушка удалён.
- [ ] Страница показывает форму и журнал.
- [ ] Полный user flow (заполнить → предпросмотр → подтвердить → запись в журнале) работает end-to-end.
- [ ] `pnpm run ci` зелёный.

---

## Общие критерии готовности Фазы 4

- [ ] `/app/doctor/broadcasts` показывает рабочий UI рассылок без заглушки.
- [ ] Врач может выбрать категорию, аудиторию, написать сообщение.
- [ ] Предпросмотр показывает реальное число получателей выбранного сегмента.
- [ ] Перед отправкой есть явный шаг подтверждения со сводкой.
- [ ] Журнал отображает историю рассылок с русскими метками и датами.
- [ ] Метки категорий и аудитории переиспользуются из единого `labels.ts`.
- [ ] `pnpm run ci` зелёный.

## Порядок выполнения

```
4.1 (Actions + resolveAudienceSize fix)
  └── 4.2 (BroadcastAudienceSelect)
       └── 4.3 (BroadcastForm + preview)
            └── 4.4 (BroadcastConfirmStep + execute)
4.5 (BroadcastAuditLog)    ← можно параллельно с 4.2–4.4
  └── 4.6 (page.tsx integration)  ← зависит от всего
```
