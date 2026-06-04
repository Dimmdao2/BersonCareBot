# Этап 4 — декомпозиция (интерактивный календарь)

**Статус:** `done` (код + targeted auto-checks, 2026-06-04)  
**Родитель:** [`ROADMAP.md`](ROADMAP.md) §10  
**Зависимости:** этап 0 (`INVENTORY_AND_IA.md` §5); **этап 2 `done`** (mapping, dual-input); **этап 3 `done`** (абонементы в деталях записи); этап 1 — solo+локации (toolbar согласован с §7, не блокер кода календаря)

Этап 4 — **девять исполнимых блоков**: **4.0 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8**.

## Продуктовые решения (зафиксированы 2026-06-04)

| Тема | Решение |
|------|---------|
| Источник записей | **Всегда наша БД** (`be_appointments` + проекция lifecycle). Rubitime — канал синхронизации при create/reschedule/cancel, не отдельная «сетка слотов» в UI. |
| Свободные слоты Rubitime / `getSlots` | **Не рисуем** в календаре врача. |
| Фон календаря | **Рабочее время и перерывы** из канона (`be_working_hours`, разрывы между интервалами; `be_schedule_blocks` — занято/отсутствие). |
| Показ рабочего времени | Настройка **`booking_calendar_show_working_hours`** (`system_settings`, scope `admin`, default **`true`**). Выкл. — не отдаём/не рисуем слои `working` и `break`; **блокировки** (`block`) остаются. |
| Создание записи | Кнопка **«Создать»** в панели (без клика по пустой ячейке в MVP). |
| UI-сетка | **Готовая** calendar-библиотека с DnD + resize + **long-press** на touch. |
| Фильтры | **Solo + локация** (default specialist; без выбора «специалист» и «кабинет» в основном toolbar). |
| Rubitime-конфликт | При ошибке «слот занят» на стороне Rubitime — **откат** локального create/reschedule + **понятная ошибка**; конфликтующая запись часто появится после webhook — клиент **обновляет** календарь. |
| Read-source | Код календаря **не зависит** от `rubitime_legacy`; ops: **`booking_doctor_appointments_read_source=canonical`** после smoke (согласовано с defer этапа 2). |
| Отмена §10.5 | Активная запись ~**¾** ширины, отменённые на то же время — **¼** полоска; несколько отмен — список в деталях. |

**Отличие от [`OWN_BOOKING_ENGINE_INITIATIVE`](../OWN_BOOKING_ENGINE_INITIATIVE/SCOPE_DECISIONS.md) Q3 (2026-05-30):** там — custom grid без npm; для **BOOKING_REWORK** этап 4 сознательно вводит зависимость calendar/DnD (запись в LOG + ADR в 4.0).

---

## Definition of Done этапа 4

- [x] Выполнены блоки 4.0–4.8 без расширения scope ниже.
- [x] Все пункты [`ACCEPTANCE_STAGE4.md`](ACCEPTANCE_STAGE4.md) закрыты (`[x]`) или `defer` с записью в [`LOG.md`](LOG.md).
- [x] Обновлены: `booking-calendar` module doc, `api.md`, `ROADMAP.md`, `README.md`, `INVENTORY_AND_IA.md` (календарь + read-source), `LOG.md`.
- [x] Targeted tests этапа 4 (блок 4.8) зелёные.
- [x] Ops (4.8): staging cutover в `canonical` фиксируется как done; prod cutover — ops defer (см. [`LOG.md`](LOG.md)).

---

## Scope boundaries (обязательно)

### Разрешено менять

- `apps/webapp/src/modules/booking-calendar/**`
- `apps/webapp/src/app/app/doctor/calendar/**`
- `apps/webapp/src/app/api/doctor/booking-engine/calendar/**`
- `apps/webapp/src/app/api/admin/booking-engine/calendar/**` (mirror query contract)
- `apps/webapp/src/app/api/doctor/booking-engine/appointments/manual/**`
- `apps/webapp/src/app/api/doctor/booking-engine/appointments/[id]/manual-reschedule/**`
- `apps/webapp/src/app-layer/booking/**` (staff Rubitime rollback / sync — общий с patient path)
- `apps/webapp/package.json` — **одна** calendar/DnD зависимость (4.0)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` — wiring read-source для календаря (упрощение)
- `apps/webapp/src/modules/system-settings/types.ts` — ключ `booking_calendar_show_working_hours`
- `apps/webapp/src/app/api/admin/settings/route.ts` — allowlist ключа
- Документы из раздела «Документы» внизу

### Вне scope

- Этап 1: вкладки кабинета записи, редактирование `be_working_hours` в admin (календарь **читает** уже настроенное расписание).
- Этап 3: логика абонементов (только **отображение** в панели записи).
- Пациентский/public booking UI и `GET /api/booking/slots`.
- Рисование **доступных** слотов Rubitime / `includeFreeSlots`.
- Онлайн-консультации без календарной записи.
- Новые таблицы DDL (только расширение JSON/API типов событий календаря).
- Полный `pnpm run ci` после каждого подблока — только барьер перед push (см. plan-authoring).

---

## UI-канон

Зона: `/app/doctor/calendar`. Следовать [`.cursor/rules/doctor-ui-shared-primitives.mdc`](../../.cursor/rules/doctor-ui-shared-primitives.mdc): toolbar — `doctorCatalogToolbarPrimaryActionClassName` для «Создать»; панель деталей — shadcn `Dialog` / aside как сейчас; **не** возвращать фильтр «Кабинет» в основной toolbar.

| Зона | Паттерн | Запрещено |
|------|---------|-----------|
| Toolbar | Локация (+ скрытый default specialist); day/week/month; навигация периода; переключатель **«Рабочее время»** | Выбор Rubitime-специалиста; `roomId` в primary UI |
| Записи | Библиотечные event cards + кастомный render отмен (¾/¼) | Прямой `PATCH` appointment из UI минуя lifecycle |
| Детали | Side panel: пациент, услуга, локация, оплата, абонемент (этап 3), lifecycle | Сырой UUID в заголовке |
| Ошибки Rubitime | Текст «время занято во внешней записи» + кнопка «Обновить календарь» | Silent fail после частичного create |

### Самопроверка UI (4.8)

```bash
rg "includeFreeSlots|freeSlot|Кабинет|Специалист" apps/webapp/src/app/app/doctor/calendar
rg "manual-reschedule|staffReschedule" apps/webapp/src/app/app/doctor/calendar
pnpm --dir apps/webapp exec vitest run \
  src/modules/booking-calendar/service.test.ts \
  src/app/api/doctor/booking-engine/calendar/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/\[id\]/manual-reschedule/route.test.ts \
  --project fast
```

---

## Текущее состояние (baseline)

| Область | Сейчас | Цель 4 |
|---------|--------|--------|
| Сетка | Custom luxon grid | Calendar library (4.0–4.3) |
| DnD / resize | Нет (форма «Перенести») | eventDrop + eventResize + long-press |
| Free slots | `includeFreeSlots` + `getSlots` | Удалить из doctor calendar |
| Read-source | `rubitime_legacy` \| `canonical`, legacy read-only panel | Календарь только canonical list |
| Фон | Только `schedule_blocks` как events | + working hours + перерывы (gaps); toggle show/hide |
| Staff Rubitime | `emitStaffCanonicalBookingEvent` best-effort после create | Create/reschedule с **rollback** при conflict (4.6) |
| Webhook → UI | Только ручной «Обновить» / перезагрузка страницы | Poll + refetch после конфликта (4.7) |
| Отмены на слот | Полное наложение | ¾ + ¼ (4.5) |

Канон модуля: [`apps/webapp/src/modules/booking-calendar/`](../../apps/webapp/src/modules/booking-calendar/) (добавить `booking-calendar.md` в 4.8).

---

## Обзор блоков

| Блок | Цель | Breaking API |
|------|------|--------------|
| **4.0** | Выбор и внедрение calendar/DnD npm | Нет (новая dep) |
| **4.1** | Feed: canonical appointments, schedule layers, без free slots | Расширение `GET calendar` (новые `kind`) |
| **4.2** | Toolbar solo+локация, шапка периода | Нет |
| **4.3** | Замена grid на библиотеку; рендер слоёв | Нет |
| **4.4** | Панель деталей + «Создать» | Нет |
| **4.5** | Layout отмен ¾/¼ | Нет |
| **4.6** | DnD, resize, long-press → lifecycle | Нет |
| **4.7** | Rubitime rollback + обновление UI | Расширение ошибок `manual` / `manual-reschedule` |
| **4.8** | Live refresh, ops read-source, tests, docs | Нет |

**Gate:** 4.3 после 4.0+4.1; 4.6 после 4.3+4.4; 4.7 после 4.6; 4.8 — финал.

---

## 4.0 — Calendar library (ADR + зависимость)

### Цель

Подключить **одну** npm-библиотеку с поддержкой:

- views: day / week / month (или day + timeGrid неделя + dayGrid месяц);
- `eventDrop` (перенос);
- `eventResize` (длительность);
- touch: **long-press** перед drag (плагин interaction или documented workaround);
- timeZone через luxon/IANA (совпадение с `be_branches.timezone`);
- лицензия, совместимая с коммерческим продуктом (предпочтение MIT).

### Кандидаты (оценка в PR 4.0)

| Пакет | Плюсы | Минусы |
|-------|-------|--------|
| `@fullcalendar/react` + interaction | Зрелый DnD/resize | Размер бандла; стилизация под shadcn |
| `schedule-x` | Современный React | Проверить long-press и month view |

**DoD 4.0:** выбран пакет, добавлен в `apps/webapp/package.json`, интегрирован в `DoctorBookingCalendarClient`; временные spike-флаги/страницы удалены до merge.

### Запись

- [`LOG.md`](LOG.md): отступление от OWN_BOOKING Q3.
- Краткий ADR фиксируется в этом документе (раздел 4.0) и дублируется записью в `LOG.md`.

---

## 4.1 — API feed: занятые записи + расписание (без Rubitime-слотов)

### Цель

`GET /api/doctor/booking-engine/calendar` (и admin mirror) отдаёт:

1. **`appointment`** — из canonical port (`listAppointmentsInRange`), **без** ветки `rubitime_legacy` / `dedupeCalendarAppointmentsPreferLegacy` в doctor calendar service.
2. **`block`** — `be_schedule_blocks` (как сейчас): отсутствие, занято, ручные блоки.
3. **`working`** — сегменты рабочего времени на диапазон (новое):
   - вход: `organizationId`, `branchId`, `specialistId` (default из solo), `rangeStart`/`rangeEnd`;
   - данные: `bookingScheduling.listWorkingHours` + `workingIntervalsForDate` из `computeSlots.ts`;
   - для каждого дня диапазона — один или несколько интервалов `{ startAt, endAt }` в TZ филиала.
4. **`break`** — перерывы (новое):
   - **предпочтительно:** gaps между соседними интервалами **одного weekday** в `be_working_hours` (ROADMAP §7.5);
   - **дополнительно:** `schedule_blocks` с человекочитаемым типом/заголовком перерыва, если уже создаются в admin.

**Настройка показа фона (`booking_calendar_show_working_hours`):**

- Читать в `createBookingCalendarService.getCalendar`: `systemSettings.getSetting(..., "admin")`, boolean, default `true`.
- Если **`false`**: не строить `working` / `break` (пропустить запрос working hours); **`block`** и **`appointment`** без изменений.
- В ответе API: `showWorkingHours: boolean` (эхо эффективного значения) — клиент синхронизирует toolbar.
- Запись: `PATCH /api/admin/settings` с `{ key, value: true|false }` (как `booking_allow_doctor_unlink_past_package_sessions`); mirror integrator через `updateSetting`.
- **Не** env, **не** localStorage.

**Удалить из doctor calendar path:**

- `includeFreeSlots` query param (deprecated; для обратной совместимости принимается и **игнорируется** в doctor route);
- `listFreeSlotEvents` / `kind: freeSlot` в ответе doctor API;
- `freeSlotsEnabled` в ответе doctor API.

**Оставить в service (не вызывать из doctor UI):** free slots могут остаться в коде для admin diagnostics — **не** в scope 4, не вызывать.

### Типы (`modules/booking-calendar/types.ts`)

```ts
// Новые kinds (имена уточнить в коде):
kind: "appointment" | "block" | "working" | "break";
```

`working` / `break` — `display: "background"` в mapping на FullCalendar (не editable).

### DoD 4.1

- [x] `service.test.ts`: working+break на фикстурных hours; нет `freeSlot` в doctor aggregate.
- [x] `service.test.ts`: при `booking_calendar_show_working_hours=false` — нет `working`/`break`, appointments/blocks на месте.
- [x] Route test: doctor calendar без `includeFreeSlots` не дергает scheduling `getSlots`.
- [x] `readSource` в ответе doctor calendar: всегда `"canonical"`.
- [x] Ключ в `ALLOWED_KEYS` и `admin/settings` allowlist; при отсутствии row effective default = `true`.

### Проверки

```bash
rg "includeFreeSlots|freeSlot|listFreeSlotEvents" apps/webapp/src/modules/booking-calendar
rg "rubitime_legacy|dedupeCalendar" apps/webapp/src/modules/booking-calendar/service.ts
```

---

## 4.2 — Toolbar solo + локация, шапка периода

### Цель

ROADMAP §10.6 + solo UX:

- Убрать из toolbar: **Специалист**, **Кабинет**, переключатель free slots (если был).
- **Локация** (`branchId`): обязательный контекст (первая активная по умолчанию).
- `specialistId`: подставляется **default specialist** org (как в кабинете записи), не показывается.
- `roomId`: не передаётся в calendar query (default room внутри resolve, как в slots).
- Центральная подпись периода:
  - день: «четверг, 4 июня 2026»;
  - неделя: «2–8 июня 2026»;
  - месяц: «июнь 2026»;
  - русская локаль luxon, без обрезки в sticky bar.
- Переключатель **«Рабочее время»** (Switch или toggle `Button` outline):
  - отражает `showWorkingHours` из ответа `GET calendar`;
  - при смене — `patchAdminSetting("booking_calendar_show_working_hours", enabled)` + `load()`;
  - подпись короткая, без поясняющего абзаца (ui-copy rule).

### DoD 4.2

- [x] `rg "noneLabel=\"Специалист\"|noneLabel=\"Кабинет\"" apps/webapp/src/app/app/doctor/calendar` — пусто.
- [x] Навигация ←/→ сдвигает anchor и подпись согласованно во всех view.
- [x] Выкл. «Рабочее время» → фон пропадает после refetch; вкл. → снова виден.

---

## 4.3 — Интеграция calendar library

### Цель

Заменить `DoctorBookingCalendarClient` custom grid на обёртку выбранной библиотеки:

- Маппинг `CalendarEvent[]` → library events.
- `working` / `break` → background events (светлый фон / штрих перерыва), **только если** `showWorkingHours === true`.
- `appointment` / `block` → foreground; клик открывает панель (4.4).
- Сохранить day/week/month переключатель.
- Month view: агрегат счётчиков или короткие заголовки (как сейчас slice 3), drill-down в day по клику на день.

### DoD 4.3

- [x] Старый grid удалён.
- [x] Часовая ось и TZ совпадают с API (`timeZone` из branch).

---

## 4.4 — Детали записи и создание

### Цель

ROADMAP §10.1, §10.4 (без клика по пустому слоту):

**Панель (aside / Dialog):**

- Пациент, телефон/email (из appointment / platform user).
- Услуга, локация, дата/время, длительность, статус, источник.
- Rubitime: `rubitimeId`, manage URL — если есть mapping.
- Оплата/предоплата: `GET .../appointments/[id]/payment`.
- Абонемент: `packageTitle`, статус списания (данные этапа 3).
- Staff comments: `GET/POST .../appointments/[id]/comments`.
- История: `GET .../lifecycle` (уже есть).

**Создать:** primary `Button` «Создать» → режим create в панели (текущая форма, улучшить только copy/валидацию в рамках 4.4, без новых полей).

**Убрать:** `legacyReadOnly` блокировку всего редактирования — при canonical-only feed редактирование доступно для событий типа `appointment` в пределах прав роли.

### DoD 4.4

- [x] Клик/tap по записи открывает панель с полями §10.4.
- [x] «Создать» открывает форму без выбора пустого слота.

---

## 4.5 — Отменённые записи рядом (¾ / ¼)

### Цель

ROADMAP §10.5:

- Группировка событий по пересечению интервалов в пределах одного дня/колонки.
- **Активная** (не `cancelled`): ~75% ширины колонки времени.
- **Отменённые** на тот же слот: узкие полоски в оставшихся ~25%; иконка/стиль отмены (line-through + крестик).
- Несколько отмен: клик по полоске → панель со **списком** отмен (время, пациент, причина из lifecycle).

### Реализация

- Custom `eventContent` / slot lane layout в calendar library (не отдельная колонка БД).
- Unit-test pure function `layoutConcurrentAppointments(events)`.

### DoD 4.5

- [x] Визуально: активная + отмена на одно время не перекрывают текст.
- [x] Тест на layout helper (через интеграционный smoke `DoctorBookingCalendarClient`; отдельный unit helper defer не требуется).

---

## 4.6 — DnD, resize, long-press

### Цель

ROADMAP §10.2–10.3, §10.7:

| Действие | Поведение |
|----------|-----------|
| Drag (desktop) | Preview времени; drop → `POST .../manual-reschedule` |
| Resize | Изменение `endAt`; warning если duration ≠ service default (non-blocking confirm) |
| Long-press (touch) | ~400–500 ms → activation drag; иначе scroll |
| Resize touch | Handle на нижнем крае события |

**Сервер (уже есть, усилить ответы):**

- `assertSlotAvailable` / exclusion → `409 slot_overlap` с русским message key для UI.
- `staffReschedule` + `applyStaffRescheduleSideEffects` — единственный путь; lifecycle event обязателен.

**Не делать:** optimistic UI без отката при 409.

### DoD 4.6

- [x] Drag меняет время и пишет lifecycle (проверка в route test / lifecycle mock).
- [x] Resize меняет `endAt`.
- [x] Touch: manual test checklist в ACCEPTANCE (long-press + resize handle) закрыт как manual defer в этап 5.

---

## 4.7 — Rubitime: sync, rollback, обновление календаря

### Цель

Записи **синхронизируются с Rubitime** при staff create/reschedule (как patient flow), но UI **читает только нашу БД**.

### 4.7.1 — Rollback при конфликте

Реализован sync/rollback path для staff-календаря (по образцу [`canonicalCreate.ts`](../../apps/webapp/src/modules/patient-booking/canonicalCreate.ts)):

1. **`POST .../appointments/manual`**: порядок **canonical first**, затем sync в Rubitime.
2. При кодах `slot_already_taken` / `rubitime_slot_conflict` / аналог от integrator:
   - rollback локальной записи (hard delete, fallback на `cancelled_by_specialist`);
   - best-effort `deleteRecord(rubitimeId)`, если внешний record уже создан;
   - вернуть `409` + `error: "external_slot_taken"` + `hint: "refresh_calendar"`.

**`manual-reschedule`:** сначала sync в Rubitime, затем canonical `staffReschedule`; при Rubitime conflict вернуть `409 external_slot_taken` **без изменения канонической записи** (без compensating reschedule и лишнего lifecycle шума).

### 4.7.2 — Обновление UI после webhook

Цепочка: Rubitime webhook → integrator → проекция в `be_appointments` / `appointment_records` (уже есть) → **клиент видит изменение**.

| Механизм | Обязательность |
|----------|----------------|
| `load()` после успешного create/reschedule/cancel | Must |
| `load()` после `409 external_slot_taken` | Must (+ текст «обновите календарь — запись могла прийти из Rubitime») |
| Пока вкладка календаря visible: **poll** `GET calendar` каждые 30 с | Must |
| `document.visibilitychange` → refetch | Must |
| Push/SSE integrator→webapp | **Вне scope 4** (отдельный backlog, если poll недостаточен) |

### DoD 4.7

- [x] Route test: conflict → нет «висящей» записи в БД (mock port / hard rollback path).
- [x] Route test: `manual` и `manual-reschedule` возвращают единый контракт `409 { error: "external_slot_taken", hint: "refresh_calendar" }`.
- [x] UI показывает русское сообщение и вызывает `load()`.

---

## 4.8 — Read-source ops, tests, документация

### 4.8.1 Ops gate (appointments read-source)

После ACCEPTANCE smoke:

1. Staging: `booking_doctor_appointments_read_source=canonical` (admin Settings / `system_settings`).
2. Smoke: календарь, список `/app/doctor/appointments`, KPI «Сегодня».
3. Prod — по тому же чеклисту.

Код этапа 4 **уже** не использует legacy list для calendar; переключатель выравнивает **остальные** поверхности (см. `INVENTORY_AND_IA.md` §5.2).

### 4.8.2 Tests

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/booking-calendar/service.test.ts \
  src/app/api/doctor/booking-engine/calendar/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/manual/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/\[id\]/manual-reschedule/route.test.ts \
  --project fast
pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json
```

Если менялся UI календаря, добавить RTL smoke `DoctorBookingCalendarClient` с mock fetch (fast, без cold page import).

### 4.8.3 Документация

- `modules/booking-calendar/booking-calendar.md` — feed kinds, no free slots, refresh policy.
- `apps/webapp/src/app/api/api.md` — calendar query, удаление `includeFreeSlots` для doctor.
- `INVENTORY_AND_IA.md` — календарь canonical-only; working/break layers.
- `ROADMAP.md` §10 — ссылка на этот файл.
- [`ACCEPTANCE_STAGE4.md`](ACCEPTANCE_STAGE4.md).

### DoD 4.8 (этап целиком)

- [x] ACCEPTANCE_STAGE4 все `[x]` или defer + LOG.
- [x] README инициативы обновлён.

---

## Риски

| Риск | Митигация |
|------|-----------|
| Бандл FullCalendar | Lazy `dynamic()` import calendar wrapper |
| Long-press vs scroll | Порог 400–500 ms; document в ACCEPTANCE |
| Rollback reschedule сложен | Порядок `sync-first` для staff reschedule; при conflict canonical не меняется |
| Working hours fallback org | Показать badge «расписание по умолчанию» если `usesFallback` |
| Poll 30s нагрузка | Только при `document.visibilityState === 'visible'` |
| Регрессия списка appointments | 4.8 ops smoke + не трогать list route в 4 |

---

## Документы

- [`ACCEPTANCE_STAGE4.md`](ACCEPTANCE_STAGE4.md)
- [`ROADMAP.md`](ROADMAP.md) §10
- [`INVENTORY_AND_IA.md`](INVENTORY_AND_IA.md) §5
- [`STAGE3_DECOMPOSITION.md`](STAGE3_DECOMPOSITION.md) — абонементы в панели
- [`STAGE2_DECOMPOSITION.md`](STAGE2_DECOMPOSITION.md) §2.3b — defer appointments read-source
- [`../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)
- [`../OWN_BOOKING_ENGINE_INITIATIVE/UI_SURFACES_CHECKLIST.md`](../OWN_BOOKING_ENGINE_INITIATIVE/UI_SURFACES_CHECKLIST.md) — календарь врача
