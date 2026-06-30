# Doctor UI Rebuild — fix roadmap (по owner-ревью 2026-06-13)

**Ветка:** `feat/doctor-ui-rebuild` · **Референс:** [`docs/design/doctor-cabinet-wireframe.html`](../design/doctor-cabinet-wireframe.html) · **Источник замечаний:** [`REVIEW_2026-06-13.md`](REVIEW_2026-06-13.md)

Этот документ — план исполнения замечаний ревью. Разбит на этапы с корневыми причинами (привязка к коду), границами scope, проверками, картой параллелизма и делегированием по агентам. Исполнение — только после ревью этого плана владельцем. Перед каждым этапом исполнитель читает `.cursor/rules/*.mdc` (особенно `plan-authoring-execution-standard`, `doctor-ui-shared-primitives`, `clean-architecture-module-isolation`, `test-execution-policy`, `git-commit-push-full-worktree`).

---

## Разделение на два трека (решено владельцем 2026-06-13)

Работа разнесена по двум чатам с общей памятью и этим ROADMAP:
- **Трек БД/бэкфилл (исходный чат):** довести скрипт `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` до полноценного: толерантный режим (пропускать+собирать конфликты), **схлопывание дублей по всей базе** (могли возникнуть при разработке/миграциях на новый механизм), удаление тестовых/блок-записей (`+79189000782` «Берсон», `+70000000000` «БЛОК ОКНА»), харднинг проекции. Артефакт-вердикт: [APPOINTMENTS_PARITY_S0.md](APPOINTMENTS_PARITY_S0.md). Это трек про **историческую полноту метрик**, НЕ про пропавшие живые записи.
- **Трек интерфейса (новый чат):** интеграция S1 из worktree + этапы S2–S6 ниже. Стартовать с этого ROADMAP + памяти.

**Прод-календарь (старый `DoctorBookingCalendarClient`) НЕ трогаем** — «видна только одна запись» там из-за жёсткого лока на `specialists[0]` (нет UI-переключателя); в ребилде (`ScheduleCalendarTab`, `specialistId: null`) уже без лока. Прод получит фикс вместе с ребилдом.

## 0. Решения (РЕШЕНО владельцем 2026-06-13)

### D1 — Единый источник записей = наша БД (canonical). РЕШЕНО.
**Принцип владельца:** внутри программы — **одна центральная сущность** (таблица записей в нашей БД), откуда читают и календарь, и **все** метрики. Rubitime — просто **другой источник**: запись из Rubitime приходит → через mapping (сеансы/филиалы) пишется в нашу основную систему → и уже оттуда идут downstream (рассылки пациентам, синхронизация Google Calendar). Любые изменения (отмена/перенос/длительность/комментарии) где угодно, в т.ч. в Rubitime, должны отражаться как минимум в нашем календаре и Google Calendar. Обратная запись в Rubitime — необязательна (скоро отключаем).
**Для плана:** (1) KPI/список/статистика читают **canonical** (как календарь) — S2b. (2) **Перед катовером — обязательная проверка паритета (новый под-этап S0):** сейчас фактически **два хранилища** — legacy `appointment_records` (Rubitime) и canonical `be_appointments`; убедиться, что **всё из Rubitime есть в canonical** (история + входящий поток), чтобы после отключения Rubitime ничего не потерялось. Проверить пайплайн Rubitime → (промежуточный слой интегратора: raw `rubitime_records`/data-load) → парсинг → `be_appointments`. Координация с `BOOKING_REWORK_INITIATIVE` + интегратором; правила Rubitime-sync не менять без согласования.

### D2 — Шапка-десктоп. РЕШЕНО.
Бренд в сайдбаре + per-page закреплённый заголовок; глобальная шапка → только мобайл. Реализация — S1.

### D3 — Комментарии: read-on-view + счётчик + поведение фильтра. РЕШЕНО.
- Тред помечается **прочитанным при просмотре** (открыл упражнение → история → прочитано) — это и есть фикс §4.6.
- Внутри треда сообщения визуально различаются прочитано/непрочитано; при просмотре — прочитано сразу, **без доп. действий**; ответ — клик/тап (поле под сообщением). **Кружки стрелка/галочка — убрать.**
- Ранжирование: непрочитанные сверху (новые→старые), прочитанные ниже. **Список не перетасовывается вживую**, пока врач внутри пациента/треда; прочитанное уезжает вниз при закрытии; при переходе на другого пациента с фильтром «непрочитанные» прочитанный выпадает.
- **Backlog (НЕ в этом этапе):** жест «пометить непрочитанным» (свайп мобайл / правый клик·три точки десктоп). Рекомендация: backlog после ядра. Ядро — S5b.

### D4 — Цвет «сегодня» = приглушённый прозрачно-зелёный. РЕШЕНО.
Только зелёным (зелёных записей нет, цвет свободен; график зелёным не красим): **месяц — зелёный кружок**, **Неделя/3 дня — зелёная заливка ячейки заголовка дня**; тон серо-прозрачно-зелёный, не кислотный. Жёлтый/серый убрать. То же — в сетке «График работы» (заменить нынешний `bg-amber` today). Реализация — S2a (+ S3 для сетки).

> Координация: ветка общая с параллельным **Communications**-чатом. S5 (коммуникации) пересекается с их зоной — согласовать владение перед стартом S5, либо отдать S5 тому чату. Staging строго по явным путям, **никаких `git add -A`**.

---

## 1. Ответы на открытые вопросы ревью (по итогам исследования)

- **§1.4 «Сигналов от пациентов нет» — не баг UI.** Сигналы вычисляются (`computeProactiveInsights.ts`) из пациентов `on_support=true` по двум условиям: низкое самочувствие (значение ≤2 три+ дня подряд, `PROACTIVE_WELLBEING_LOW_MAX_VALUE=2`) и неактивность по программе (нет «done» ≥5 дней, `PROACTIVE_PROGRAM_INACTIVITY_DAYS=5`). Источник: [`pgDoctorProactiveInsights.ts`](../../apps/webapp/src/infra/repos/pgDoctorProactiveInsights.ts), сборка в [`loadDoctorTodayDashboard.ts`](../../apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts). **Пусто = сейчас никто не пробивает пороги** (либо в dev мало данных по `symptom_entries`/программам; в in-memory режиме порт всегда отдаёт пусто). Действие: проверить с засеянным «низким» пациентом; правка не требуется.
- **§3.8 «Сегодняшняя запись зелёная на месяце» — не баг.** В [`ScheduleCalendarTab.eventClassName`](../../apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx:221) у записи **нет** ветки «сегодня»: обычная запись = `bg-primary/10`. Зелень — это акцент темы `primary` (кружок «сегодня» / тинт). Подтвердить визуально; правки нет.
- **§4.3 Фильтры в «Сообщениях».** Сейчас набор = **Все / Непрочитанные / На сопровождении** (`FilterMode = all|unread|onSupport`, [`DoctorSupportInbox.tsx:87`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx:87)). «Новые» ≈ «Непрочитанные». Набор соответствует задумке — менять не нужно, только переименовать при желании владельца.

---

## 2. Карта этапов и параллелизма

```
S0 (Паритет записей Rubitime↔canonical) ── ИССЛЕДОВАНИЕ; можно параллельно с S1; БЛОКИРУЕТ S2b
S1 (Shell/шапка) ── ФУНДАМЕНТ, идёт ПЕРВЫМ и ОДИН (трогает общий shell для всех страниц)
        │
        ├── после S1 параллельно (разные зоны файлов, общая ветка):
        │
        ├─ S2 ─ Расписание · таб «Записи» (KPI/цвета/типографика/today/создание)  ┐
        ├─ S3 ─ Расписание · «График работы» + интеграция в календарь            ┘ S2→S3 ПОСЛЕДОВАТЕЛЬНО
        │        (оба трогают ScheduleCalendarTab + booking-calendar/service — НЕ параллелить между собой)
        │
        ├─ S4 ─ «Сегодня» (порядок блоков, мини-календарь, задачи, сигналы)
        │        (§1.2 мини-календарь — мягкая зависимость от S3: переиспользовать рабочие границы)
        │
        ├─ S5 ─ Коммуникации (overflow, чаты, комментарии, рассылки)
        │        (трогает общий CatalogSplitLayout — проверять эталон exercises/clients; координация с Comms-чатом)
        │
        └─ S6 ─ Пациенты (заголовок страницы) — тривиально, зависит от S1
```

**Можно параллелить:** {S2→S3 как один трек} ∥ S4 ∥ S5 ∥ S6 — после S1.
**Нельзя параллелить:** S1 ни с чем; S2 с S3 (общие файлы); правки общего `CatalogSplitLayout` (S5) и общего shell (S1) — разнести по времени/файлам.

---

## 3. Делегирование (агент × уровень мышления)

| Этап | Агент / модель | Уровень | Почему |
|------|----------------|---------|--------|
| **S0** Паритет записей (исследование) | **Opus** (general-purpose) | High | Кросс-репо (webapp + интегратор), data-integrity, основа для катовера D1 |
| **S1** Shell/шапка | **Opus** | High | Архитектура, общий shell для всех страниц, sticky-offset, риск регрессий на всех экранах |
| **S2a** Календарь: цвета/типографика/today/создание (§3.6–3.12, §3.17-toolbar) | **Sonnet** | Medium | Локальный FullCalendar + CSS/Tailwind, без backend |
| **S2b** KPI-источник (§3.5) | **Opus** | Medium→High | clean-arch порты + cutover read-source (D1), кросс-зона BOOKING_REWORK |
| **S3** «График работы» + per-date в календарь (§3.13–3.17) | **Opus** | Medium | Slot-engine + контракты booking-calendar/booking-scheduling, риск на расчёте слотов |
| **S4** «Сегодня» (§1.1–1.4) | **Sonnet** | Medium | Перестановка + мини-календарь + задачи; логика умеренная |
| **S5a** Коммуникации: верстка (§4.1, 4.2, 4.5-ширины, 4.8) | **Sonnet** | Medium | CSS/grid; осторожно с общим CatalogSplitLayout |
| **S5b** Комментарии read-state (§4.6/4.7) | **Opus** | Medium | Логика unread + порты `program-item-discussion`, нужно решение D3 |
| **S6** Пациенты заголовок (§2.1) | **Sonnet** | Low | Один заголовок по паттерну S1 |

Оркестратор (этот чат): аудит каждого этапа перед мержем зоны, контроль staging по путям, сведение финального CI перед пушем.

---

## 4. Этапы

### S0 — Паритет записей Rubitime ↔ canonical (исследование, по D1) `[предусловие §3.5]`

**Цель.** Доказать (или опровергнуть) что **всё** из Rubitime есть в canonical `be_appointments` и входящий поток пишется непрерывно — чтобы катовер read-source на canonical (S2b) был безопасен и история сохранилась после отключения Rubitime.

**Что выяснить (read-only, без правок данных):**
1. Топология: где живут оба хранилища — webapp `appointment_records` (legacy) vs `be_appointments` (canonical); есть ли промежуточный raw-слой в **интеграторе** (`rubitime_records`/data-load из источника) и как он маппится в canonical (сеансы/филиалы).
2. Полнота: сравнить объёмы и ключи (по диапазону дат, по Rubitime ID) legacy vs canonical на dev и, по согласованию, на prod (read-only). Найти расхождения (записи в legacy, которых нет в canonical, и наоборот).
3. Непрерывность: пишется ли новый поток из Rubitime в canonical сейчас (а не только разовый бэкфилл 2026-06-13); отражаются ли отмены/переносы/длительность/комментарии из Rubitime в canonical → и дальше в Google Calendar.
4. Downstream: подтвердить, что из canonical идут рассылки и Google-sync (или зафиксировать, где это пока от legacy).

**Артефакт.** Отчёт `docs/DOCTOR_UI_REBUILD_REVIEW/APPOINTMENTS_PARITY_S0.md`: топология, найденные расхождения, вывод «можно/нельзя катовер», список добивок (если canonical неполон) и кто их владелец (этот ребилд vs BOOKING_REWORK vs интегратор).
**Scope:** только чтение/анализ кода и (read-only) БД; `apps/webapp/src/modules/{doctor-appointments,booking-calendar}`, `infra/repos/*Appointment*`, интегратор Rubitime-зона, миграции/бэкфилл-скрипты.
**Вне scope:** любые правки данных/схемы; изменение Rubitime-sync.
**DoD:** отчёт готов; явный вердикт по безопасности катовера; согласован с владельцем перед S2b.

---

### S1 — Shell / шапка (фундамент) `[§0.1, §0.2/0.3, §2.1-база, §3.1-3.2-база, §3.3-3.4-база]`

**Цель.** Десктоп без дублирующей глобальной шапки: бренд в сайдбаре, на каждой странице — собственный закреплённый заголовок-«шапка» (title + слот под важное + слот под табы + док для тулбара). Мобайл сохраняет компактную шапку.

**Корневые причины / факты.**
- Глобальная шапка: [`DoctorWorkspaceShell.tsx`](../../apps/webapp/src/shared/ui/doctor/shell/DoctorWorkspaceShell.tsx) рендерит `DoctorHeader` (fixed, на всю ширину) + ряд `DoctorAdminSidebar | content`.
- [`DoctorHeader.tsx`](../../apps/webapp/src/shared/ui/doctor/shell/DoctorHeader.tsx): иконка `Home` (строки 91-98), заголовок по центру + бейдж `ADMIN MODE` (101-113), кнопки Пациенты/Коммуникации/Меню (115-144). Высота пишется в CSS-var `--doctor-sticky-offset` ([`useReportShellChromeHeight`](../../apps/webapp/src/shared/hooks/useReportShellChromeHeight.ts)).
- Все sticky-паддинги и sticky-тулбары завязаны на `--doctor-sticky-offset` ([`doctorWorkspaceLayout.ts`](../../apps/webapp/src/shared/ui/doctor/doctorWorkspaceLayout.ts)). При удалении desktop-шапки оффсет должен стать высотой per-page-заголовка (или 0 + sticky под заголовком).
- Сайдбар [`DoctorAdminSidebar.tsx`](../../apps/webapp/src/shared/ui/doctor/shell/DoctorAdminSidebar.tsx) начинается с метки «Разделы» (стр. 44) — бренд добавляем над ней.
- Эталон sticky-тулбара (для дока тулбаров под заголовком): [`DoctorCatalogStickyToolbar`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogStickyToolbar.tsx) + exercises.

**Шаги.**
1. Сайдбар: блок бренда сверху (лого + «Berson Care · Doctor») над «Разделы».
2. `DoctorWorkspaceShell` / `DoctorHeader`: на `md+` скрыть глобальную шапку (оставить только мобайл). Снять верхний паддинг контента на desktop (оффсет→0 или под per-page header).
3. Ввести общий компонент **per-page sticky header**: слоты `title` / `info` (важное уведомление, напр. здоровье системы) / `tabs` (справа) / `toolbar-dock`. На базе существующих констант layout. Заголовки экранов — из [`doctorScreenTitles.ts`](../../apps/webapp/src/shared/ui/doctorScreenTitles.ts).
4. Перепривязать `--doctor-sticky-offset` к новому per-page header (desktop) так, чтобы каталожные sticky-тулбары (exercises и др.) не разъехались.
5. Применить заголовок на «Сегодня» (вынести существующий info про здоровье системы в строку заголовка), подготовить точки подключения для S2/S5/S6 (табы расписания/коммуникаций — в слот `tabs`).

**Scope (трогать):** `apps/webapp/src/shared/ui/doctor/shell/**`, `apps/webapp/src/shared/ui/doctor/doctorWorkspaceLayout.ts`, `apps/webapp/src/shared/hooks/useReportShellChromeHeight.ts`, `apps/webapp/src/shared/ui/doctorScreenTitles.ts`, новый общий header-компонент в `shared/ui/doctor/`, точечно `apps/webapp/src/app/app/doctor/page.tsx` (применение заголовка на «Сегодня»).
**Вне scope:** контент конкретных табов (S2–S6); пациентская зона.
**Проверки/DoD:** desktop без дубль-шапки, мобайл-шапка работает; sticky exercises/clients/любой каталог не сломан (визуально + `pnpm --dir apps/webapp test -- doctorWorkspace|Shell|Header` затронутые); typecheck webapp; «Сегодня» показывает заголовок + строку важного.

---

### S2 — Расписание · таб «Записи» `[§3.2, §3.5, §3.6, §3.7-3.12, §3.17(toolbar)]`

Файлы: [`ScheduleCalendarTab.tsx`](../../apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx), [`DoctorCalendarEventPanel.tsx`](../../apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx), [`DoctorCalendarToolbarFilter.tsx`](../../apps/webapp/src/app/app/doctor/calendar/DoctorCalendarToolbarFilter.tsx); backend KPI: [`schedule-kpis/route.ts`](../../apps/webapp/src/app/api/doctor/schedule-kpis/route.ts), [`doctor-appointments` service/ports/repos](../../apps/webapp/src/modules/doctor-appointments), [`doctorAppointmentsReadSwitch.ts`](../../apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts), [`buildAppDeps.ts:568-577`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts).

**S2a — фронт (Sonnet/Medium):**
- **§3.5-LIST (БАГ, подтверждён owner 2026-06-13): «вид списком» ПУСТ.** Гипотеза «строгий `kind`-фильтр» **проверена и отвергнута**: календарь читает canonical-порт напрямую (`buildAppDeps.ts:501`), который ставит `kind:"appointment"` (`pgBookingCalendar.ts:302`), а `ListView` фильтрует тем же `kind==="appointment"` ([:386](../../apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx:386)) — совпадает. Причина другая → **нужен рантайм-репро**: проверить, доходит ли `data.events` в list-режиме; дата-группировку по дням и таймзону в `ListView` (`visibleRange` → `from.plus(i).toISODate()` vs `e.startAt.setZone(tz).toISODate()`); пустой ли период по факту. Не утверждать «работает» без прогона на 127.0.0.1:5200.
- **§3.2** табы расписания → в слот `tabs` per-page header (после S1); тулбар периода+создать — в `toolbar-dock` (sticky под заголовком, §3.3/3.4).
- **§3.6** убрать лишний шаг создания: при «+ Создать запись» открывать форму создания сразу. Сейчас `setShowCreatePanel(true)` → `DoctorCalendarEventPanel` с `selected=null` инициализируется в `mode="view"` (плейсхолдер + кнопка). Инициализировать `mode="create"` при открытии для создания; крестик → стартовый плейсхолдер.
- **§3.7** цвета записей в `timeGrid` (Неделя/3 дня) приходят дефолтным синим FullCalendar поверх Tailwind-классов из `eventClassName` (стр. 221-236) — переопределить через FC CSS-переменные (`--fc-event-bg-color`/`border`/`text`) или `!`-классы, синхронно со статусной палитрой месяца.
- **§3.9** типографика FC: уменьшить `.fc-col-header-cell-cushion` (вес/размер) и заголовки.
- **§3.10/§3.11 (D4)** «сегодня» в месяце: убрать жёлтую заливку FC (`--fc-today-bg-color: transparent`), оставить кружок (`fc-today-circle`, стр. 1066-1074) и перекрасить его в **приглушённый прозрачно-зелёный** (сейчас `--primary`); цифры дат уменьшить.
- **§3.12 (D4)** «сегодня» в Неделя/3 дня: **зелёная** (серо-прозрачно-зелёная, не кислотная) заливка header-ячейки дня вместо жёлтой.
- **§3.17(toolbar)** приглушить ядрёные цвета фильтра локаций (в этом табе — `DoctorCalendarToolbarFilter`; основной ядрёный набор — в S3).

**S2b — KPI-источник (Opus/Medium→High; по D1 РЕШЕНО):**
- **§3.5-KPI (причина ТОЧНО подтверждена):** KPI идут через read-switch → дефолт **legacy-порт**, а у него `getScheduleKpis` — **хардкод-заглушка из всех нулей** ([pgDoctorAppointments.ts:358](../../apps/webapp/src/infra/repos/pgDoctorAppointments.ts:358)). Это НЕ «пустой источник» — настоящий расчёт реализован только в **canonical-порту**. **Фикс:** направить schedule-KPI на canonical (либо катовер `booking_doctor_appointments_read_source`→`canonical`, либо schedule-kpis route напрямую canonical-порт). Для текущего/будущего canonical полон → цифры сразу появятся; историческая полнота — после бэкфилла (трек БД, см. ниже). НЕ зависит жёстко от бэкфилла для запуска.

**Scope:** `schedule/tabs/ScheduleCalendarTab.tsx`, `calendar/DoctorCalendarEventPanel.tsx`, `calendar/DoctorCalendarToolbarFilter.tsx`; (S2b) `modules/doctor-appointments/**`, `infra/repos/*DoctorAppointments*`, `app/api/doctor/schedule-kpis/route.ts`, точечно `buildAppDeps.ts`.
**Вне scope:** «График работы» (S3), Rubitime sync-правила.
**Проверки/DoD:** KPI и список показывают реальные данные; создание открывает форму сразу; цвета/типографика/«сегодня» в Неделя/3 дня соответствуют месяцу; `pnpm --dir apps/webapp test -- ScheduleCalendarTab|schedule-kpis|doctorAppointments`; typecheck webapp. KPI-источник — отдельный аккуратный коммит.

---

### S3 — Расписание · «График работы» + интеграция в календарь `[§3.13-3.17]`

Файлы: [`ScheduleWorkTab.tsx`](../../apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx), [`booking-calendar/service.ts`](../../apps/webapp/src/modules/booking-calendar/service.ts), [`booking-scheduling/computeSlots.ts`](../../apps/webapp/src/modules/booking-scheduling/computeSlots.ts), `ScheduleCalendarTab.tsx` (рендер заливки).

**Корневые причины.**
- **§3.13** Главное: календарь рисует рабочие часы из **weekday** `be_working_hours` — [`service.ts:107-119`](../../apps/webapp/src/modules/booking-calendar/service.ts) (`schedulingPort.listWorkingHours` + `workingIntervalsForDate(dateKey, tz, effectiveRows, 0)` **без** per-date строки). А `ScheduleWorkTab.handleSave` пишет в **per-date** `be_working_days` (`PUT /api/admin/booking-engine/working-days`, стр. 595-608). Т.е. сохранённый per-date график **не доходит** до календаря. Нужно: чтение per-date `be_working_days` (+ `breaks jsonb`) в booking-calendar с fallback на weekday.
- **§3.14** Нерабочие часы/перерывы рисовать как светло-серую заливку фона. Сейчас `working` не рендерится (фон белый, ок), `break` = `bg-slate-500/10` фон-эвент ([`ScheduleCalendarTab.tsx:227, 736-746`](../../apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx)). Нужно: серой заливкой покрыть весь **не-рабочий** диапазон (до/после смены + перерывы), а не только перерывы; рабочие — белым.
- **§3.15** Убрать «Закрыть выбранные дни»/`isClosed`: кнопка `handleClose` (стр. 613-624), статус «выходной» в `DayCell` (стр. 263-265, 294-296). Заменить на «Очистить расписание» = удалить запись дня (сейчас `handleClear` чистит только выбор, **не** удаляет сохранённое — нужно действие delete в API working-days).
- **§3.16** Дни с расписанием отрисовывать тинтом филиала (уже частично — `branchCellClass`).
- **§3.17** Ядрёные цвета филиалов: [`branchColorActiveClass`](../../apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx:202) = `bg-blue-500/bg-green-600 text-white` и т.п. — приглушить (тинты `/10`+цветной текст+мягкая граница). Плюс «сегодня» в сетке = `bg-amber-500/10` (стр. 263) → убрать жёлтый по §3.10/3.12.

**Шаги.** (1) booking-calendar читает per-date `be_working_days`+breaks с fallback на weekday; (2) серая заливка нерабочего диапазона в Неделя/3 дня (и в мини-календаре «Сегодня» — общий хелпер для S4 §1.2); (3) удалить «закрыть день», добавить delete-расписания; (4) приглушить палитру филиалов и today-в-сетке.
**Scope:** `schedule/tabs/ScheduleWorkTab.tsx`, `modules/booking-calendar/**`, `modules/booking-scheduling/computeSlots.ts` (если нужен perDayRow-путь), `app/api/admin/booking-engine/working-days/**` (delete), рендер заливки в `ScheduleCalendarTab.tsx`.
**Вне scope:** новые миграции (модель `be_working_days`+`breaks jsonb` уже есть, миграции 0116-0118); Rubitime sync.
**Проверки/DoD:** сохранённый per-date график виден в календаре; нерабочее серое/рабочее белое; «закрыть день» убрано, «очистить расписание» удаляет; палитра приглушена; `pnpm --dir apps/webapp test -- ScheduleWorkTab|booking-calendar|computeSlots`; typecheck webapp. **NB:** S3 идёт после S2 (общие `ScheduleCalendarTab` + `booking-calendar/service`).

---

### S4 — «Сегодня» `[§1.1-1.4]`

Файлы: [`DoctorTodayDashboard.tsx`](../../apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx), [`DoctorTodayMiniCalendar.tsx`](../../apps/webapp/src/app/app/doctor/DoctorTodayMiniCalendar.tsx), [`DoctorGlobalTasksSection.tsx`](../../apps/webapp/src/app/app/doctor/DoctorGlobalTasksSection.tsx), [`loadDoctorTodayDashboard.ts`](../../apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts).

**Корневые причины.**
- **§1.1** Порядок: `DoctorTodayDashboard.tsx:241-252` — `DoctorCurrentAppointmentCard` (Следующая запись) рендерится ПЕРЕД `DoctorTodayMiniCalendar` (Расписание). Поменять местами: Расписание выше.
- **§1.2** Мини-календарь: `computeRange()` ([`DoctorTodayMiniCalendar.tsx:25-48`](../../apps/webapp/src/app/app/doctor/DoctorTodayMiniCalendar.tsx)) считает окно **только по записям** (1 запись в 13:00 → ~3 часа). Брать границы из рабочего дня (переиспользовать хелпер рабочих границ из S3 / `deriveWorkingBounds`), запись — лишь расширяет.
- **§1.3** Задачи: `DoctorGlobalTasksSection` сортирует «сегодня вперёд» (стр. 13-23), но **не фильтрует** по сегодня, нет «Все задачи» и счётчика; загрузка `specialistTasks.listGlobalOpen(..., 8)` без total ([`loadDoctorTodayDashboard.ts:402-410, 464`](../../apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts)). Нужно: показывать задачи на сегодня + кнопка «Все задачи» + метрика «сегодня N / всего M» (добавить total в loader). Поднять блок задач над «На сопровождении». Детальная страница задач — **вне этого ревью**.
- **§1.4** Сигналы — см. раздел 1 (не баг; проверить данными).

**Scope:** `app/app/doctor/DoctorTodayDashboard.tsx`, `DoctorTodayMiniCalendar.tsx`, `DoctorGlobalTasksSection.tsx`, `loadDoctorTodayDashboard.ts` (+ total задач из `specialist-tasks` порта, если потребуется — минимально).
**Вне scope:** отдельная страница задач; пациентская зона.
**Проверки/DoD:** Расписание над Следующей записью; мини-календарь покрывает рабочий день; задачи на сегодня + «Все задачи»+счётчик, блок выше «На сопровождении»; `pnpm --dir apps/webapp test -- DoctorToday|loadDoctorTodayDashboard`; typecheck. **NB:** §1.2 — после S3 (общий хелпер границ).

---

### S5 — Коммуникации `[§4.1-4.10]`

Файлы: [`DoctorCommunicationsShell.tsx`](../../apps/webapp/src/app/app/doctor/communications/DoctorCommunicationsShell.tsx), [`DoctorAppShell.tsx`](../../apps/webapp/src/shared/ui/doctor/DoctorAppShell.tsx), [`CatalogSplitLayout.tsx`](../../apps/webapp/src/shared/ui/doctor/catalog/CatalogSplitLayout.tsx) (общий!), [`DoctorSupportInbox.tsx`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx), [`DoctorCommentsTab.tsx`](../../apps/webapp/src/app/app/doctor/comments/DoctorCommentsTab.tsx), [`BroadcastsTab.tsx`](../../apps/webapp/src/app/app/doctor/communications/tabs/BroadcastsTab.tsx), [`BroadcastForm.tsx`](../../apps/webapp/src/app/app/doctor/broadcasts/BroadcastForm.tsx).

**S5a — верстка (Sonnet/Medium):**
- **§4.1** Overflow во всех табах: `CatalogSplitLayout` — у grid-детей нет `min-w-0`, контейнер не гасит горизонтальный overflow ([`CatalogSplitLayout.tsx:22-39`](../../apps/webapp/src/shared/ui/doctor/catalog/CatalogSplitLayout.tsx)). Добавить `min-w-0` детям + `overflow-x-hidden`. **ВНИМАНИЕ: файл общий** (exercises/clients) — изменения только аддитивные, проверить эталон.
- **§4.2** Чаты master/detail: [`DoctorSupportInbox.tsx:350`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx) `lg:grid-cols-[1fr_1.2fr]` + overflow из §4.1 раздувают список. Привести к «список уже / диалог шире» (напр. `[0.8fr_1.6fr]`) + `min-w-0`. Подтвердить runtime.
- **§4.5** Комментарии «скачут»: [`DoctorCommentsTab.tsx:983`](../../apps/webapp/src/app/app/doctor/comments/DoctorCommentsTab.tsx) `lg:grid-cols-[1fr_1.4fr]` статично, а контент справа меняется при выборе пациента. Зафиксировать ширины на пропорциях «пациент выбран» (owner: фиксированные блоки, без скачка).
- **§4.8a** Рассылки: [`BroadcastsTab.tsx:91`](../../apps/webapp/src/app/app/doctor/communications/tabs/BroadcastsTab.tsx) rightPane `overflow-y-auto` + вложенные блоки без ограничения высоты → паразитный внешний скролл + независимые внутренние. Убрать внешний `overflow-y-auto` (вписать в экран) / ограничить скролл одним контейнером.
- **§4.8b** Блоки каналов: [`BroadcastForm.tsx:328`](../../apps/webapp/src/app/app/doctor/broadcasts/BroadcastForm.tsx) `grid grid-cols-3` переносится при 5+ каналах. В одну строку (`auto-fit`/число колонок по числу каналов).
- **§4.10** Цвета — ок, не трогаем.

**S5b — read-state комментариев (Opus/Medium; по D3 РЕШЕНО):**
- **§4.6** Фикс: тред помечается прочитанным **при просмотре** (открытие упражнения/треда). Сейчас «новое» = «последнее сообщение пациента позже read-курсора» (`isUnread`, [`DoctorCommentsTab.tsx:289-292`](../../apps/webapp/src/app/app/doctor/comments/DoctorCommentsTab.tsx)); порт [`listUnreadExerciseCommentsForDoctor`](../../apps/webapp/src/modules/program-item-discussion/ports.ts) + mark-read только при открытии треда ([`.../discussion/read/route.ts`](../../apps/webapp/src/app/api/doctor/treatment-program-instances)) → починить так, чтобы просмотр реально снимал «новое» и счётчики/бейджи ([`loadDoctorCommunicationsBadges.ts`](../../apps/webapp/src/app/app/doctor/communications/loadDoctorCommunicationsBadges.ts)) сходились.
- **§4.7 (D3):** убрать кружки «стрелка/галочка» (read-by-view, reply-by-click); внутри треда — визуальное различие прочитано/непрочитано; ранжирование непрочитанные сверху→прочитанные ниже; **без живой перетасовки** пока врач внутри пациента; обновление фильтра «непрочитанные» при уходе на другого пациента/тред (прочитанный выпадает).
- **Backlog (НЕ здесь):** жест «пометить непрочитанным» (свайп/правый клик·три точки) — отдельный todo.

**Scope:** `app/app/doctor/communications/**`, `app/app/doctor/messages/**`, `app/app/doctor/comments/**`, `app/app/doctor/broadcasts/**`, `shared/ui/doctor/catalog/CatalogSplitLayout.tsx` (аккуратно, общий), `modules/program-item-discussion/**` (S5b).
**Вне scope:** перепись чатов/комментариев по сути; пациентская зона.
**Проверки/DoD:** нет горизонтального overflow ни в одном табе; чаты/комментарии — приятные фикс-пропорции без скачка; рассылки — один скролл, каналы в строку; отвеченные комментарии не висят как новые; **обязательно проверить эталон** (exercises/clients не сломаны после правок CatalogSplitLayout); `pnpm --dir apps/webapp test -- Comments|SupportInbox|Broadcast|CatalogSplit|communications`; typecheck.
**NB:** координация с параллельным Comms-чатом (общая зона/ветка).

---

### S6 — Пациенты `[§2.1]`

- Добавить заголовок «Пациенты» по паттерну per-page header из S1. Файл: [`clients/page.tsx`](../../apps/webapp/src/app/app/doctor/clients/page.tsx) (+ клиентский список, если заголовок там).
- **Вне scope:** переработка карточки пациента (§2.2 — не в этом ревью).
- **DoD:** заголовок есть; typecheck; визуально.

---

## 5. Кросс-сквозные правила исполнения

- **Ветка одна (`feat/doctor-ui-rebuild`), staging только по явным путям** — `git add <конкретные файлы>`, никогда `-A` (рядом параллельный Comms-чат).
- **Общие файлы** (`shell/**`, `doctorWorkspaceLayout.ts`, `CatalogSplitLayout.tsx`) — изменения аддитивные + регрессионная проверка эталонных страниц (exercises/clients).
- **Doctor UI канон** (`.cursor/rules/doctor-ui-shared-primitives`): reuse-first, без `rounded-2xl`, без `text-lg/xl/3xl`, KPI через `doctorMetricValueClass`, плотность не откатывать.
- **Тесты по уровням** (`test-execution-policy`): step → phase webapp; **полный `pnpm run ci` — один раз перед пушем** (`pre-push-ci`). Текущий известный красный — только `audit` (esbuild advisory), вне нашего scope.
- **Документация:** обновлять `schedule.md`/`communications.md`/`DOCTOR_*` доки и [`REVIEW_2026-06-13.md`](REVIEW_2026-06-13.md) (статусы пунктов) по мере закрытия; вести `LOG.md` инициативы.
- **Per-stage cursor-план:** при исполнении этапа заводить `.cursor/plans/<stage>.plan.md` с frontmatter и закрывать статусы по правилу.

## 6. Definition of Done (вся инициатива)
1. Все ☐-пункты `REVIEW_2026-06-13.md` закрыты или явно `cancelled` с причиной.
2. Десктоп без дубль-шапки; заголовки на всех готовых страницах; sticky-тулбары работают, эталонные страницы не сломаны.
3. Расписание: KPI/список с реальными данными; график сохраняется и виден в календаре; цвета/типографика/«сегодня» по референсу.
4. «Сегодня»: порядок блоков, мини-календарь на рабочий день, задачи с «Все задачи».
5. Коммуникации: без overflow, фикс-пропорции, рассылки без двойного скролла, корректные «новые» комментарии.
6. Один зелёный `pnpm run ci` (кроме pre-existing `audit`) перед пушем; доки и `REVIEW`/`LOG` синхронизированы.
