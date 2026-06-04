# Приёмка — Этап 5 (полный проход UI и приемка)

**Статус:** `in_progress` (агентская часть выполнена; ожидает ручного прохода и подписи владельца)  
**ROADMAP:** [`ROADMAP.md`](ROADMAP.md) §11 · [`LOG.md`](LOG.md) §«Этап 5: проход UI владельца»

**Зоны:** `/app/doctor/admin/booking` (4 вкладки), `/app/doctor/appointments` (список + расписание), `doctorNavLinks`, `doctorScreenTitles`, `DOCTOR_CABINET_NAVIGATION.md`, `INVENTORY_AND_IA.md`.

---

## Definition of Done

- [ ] Агентская часть (§5.A ниже) — выполнена и проверена.
- [ ] Ручной проход владельца по §5.B — пройден.
- [ ] Владелец явно подтверждает: **«Новый интерфейс записи принят»**.
- [ ] Обновлены `ROADMAP.md` (этап 5 → `done`), `LOG.md` (запись о приёмке).

---

## 5.A — Агентская часть

### 5.A.1 — Admin «Настройки записи»: 4 вкладки

- [x] `bookingAdminTabs.ts` сокращён до 4 вкладок: `overview`, `form-public`, `payments`, `integrations`
- [x] Удалены route-папки: `locations/`, `services/`, `availability/`, `schedule/`, `form/`, `rules/`, `memberships/`, `public/`, `operations/`
- [x] Legacy `/catalog` редиректит на overview (`LEGACY_TAB_ALIASES`)
- [x] `layout.tsx`: заголовок «Запись» → «Настройки записи»

### 5.A.2 — Обзор и настройка (overview)

- [x] `BookingCatalogHelp`: шаги runbook — кликабельные ссылки на якоря и маршруты
- [x] `BookingOverviewPanel`: карточка «Быстрые действия» удалена
- [x] `page.tsx`: прокрутка — help → stats → локации → услуги/доступность (grid 2 col) → правила

### 5.A.3 — Форма и публичная запись

- [x] `form-public/page.tsx` создан: `BookingSoloFormFieldsSection` + widget + attribution

### 5.A.4 — Навигация

- [x] `doctorNavLinks.ts`: пункт «Запись» → «Настройки записи» (`admin-booking`)
- [x] `doctorNavLinks.ts`: «Мердж пациентов» перенесён из «Работа с пациентами» → «Администрирование»
- [x] `doctorScreenTitles.ts`: все упоминания «Запись» → «Настройки записи»; шаблон заголовков для 4 вкладок

### 5.A.5 — Страница «Записи» врача (`/app/doctor/appointments`)

- [x] `?tab=appointments|schedule` + `?view=future|past`
- [x] Tab=appointments: список записей, сгруппированных по `dateKey`; будущие — ASC, архив — DESC
- [x] Tab=appointments, view=past: ленивая подгрузка через `GET /api/doctor/appointments/list`
- [x] `DoctorCreateAppointmentDialog`: создание ручной записи (пациент + услуга + локация + время → POST manual)
- [x] Tab=schedule: настройка расписания; видна только `role=admin`

### 5.A.6 — Инфраструктура

- [x] `AppointmentRow.dateKey` выводится в сервисе из `recordAtIso` в бизнес-TZ
- [x] `DoctorAppointmentsListFilter` — фильтр `past` с `limit`/`offset`; реализован в обоих репо (legacy + canonical)
- [x] `GET /api/doctor/appointments/list` — новый эндпойнт с auth-guard и пагинацией

### 5.A.7 — Авто-проверки

- [x] vitest: 42/42 тестов — зелёные (`bookingAdminTabs`, `service`, `readSwitch`, `dashboard`, `screenTitles`)
- [x] `tsc --noEmit` — 0 ошибок
- [x] `eslint --max-warnings=0` — 0 предупреждений

### 5.A.8 — Документация

- [x] `DOCTOR_CABINET_NAVIGATION.md` — обновлены строки кластера «Администрирование», маршрутов `/appointments` и admin booking
- [x] `INVENTORY_AND_IA.md` — добавлена §1a «Навигация после этапа 5»
- [x] `ACCEPTANCE_STAGE5.md` — создан (этот файл)

---

## 5.B — Ручной проход владельца (обязательно до `done`)

> Следующие пункты выполняет владелец постановки вручную в браузере.

### Настройки записи (admin)

- [ ] `/app/doctor/admin/booking` — вкладки «Обзор и настройка», «Форма и публичная запись», «Оплата», «Интеграция Rubitime» отображаются корректно
- [ ] Обзор: runbook-шаги — ссылки кликабельны, ведут к нужным секциям страницы
- [ ] Обзор: секции «Локации», «Услуги», «Доступность», «Правила» в одной прокрутке
- [ ] Форма+публичная: форма записи и виджет на одном экране
- [ ] Оплата и Rubitime: вкладки работают, контент присутствует
- [ ] Навигация в меню: «Настройки записи» отображается в кластере «Администрирование»
- [ ] «Мердж пациентов» — отсутствует в «Работа с пациентами»; присутствует в «Администрирование»

### Работа врача — Записи

- [ ] `/app/doctor/appointments` — вкладки «Записи» и «Расписание» в тулбаре
- [ ] Будущие записи сгруппированы по датам, сортировка ASC (ближайшая дата первая)
- [ ] Переключатель «Архив»: записи в порядке DESC (свежие сверху)
- [ ] Кнопка «Загрузить ещё» подгружает следующую страницу архива
- [ ] Клик на запись раскрывает действия (DoctorAppointmentActions)
- [ ] «Создать запись» открывает диалог; форма работает; после создания список обновляется
- [ ] Вкладка «Расписание» видна только при `role=admin`; содержит секции расписания

### Принятие

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка (агент) | 2026-06-04 | ✅ §5.A выполнена |
| Владелец | | ожидается |

---

## Defer / вне scope этапа 5

- Touch long-press / resize smoke на реальном устройстве — defer из этапа 4.
- Предупреждение в календаре при resize ≠ длительность услуги — defer (LOG §«Решения владельца»).
- Ops: `booking_doctor_appointments_read_source=canonical` prod cutover — отдельный ops-журнал.
- Создание абонементов на `/appointments` — следующий шаг (требует решения владельца).
- Nav label «Записи» vs «Запись» — открытый вопрос (требует решения владельца).
