# Приёмка — Этап 4 (интерактивный календарь)

**Статус:** `done` (код + targeted auto-checks, 2026-06-04; ops-prod cutover — defer)  
**План:** [`STAGE4_DECOMPOSITION.md`](STAGE4_DECOMPOSITION.md) · ROADMAP §10 · [`LOG.md`](LOG.md)

**Зоны:** `/app/doctor/calendar`, `GET /api/doctor/booking-engine/calendar`, `POST .../appointments/manual`, `POST .../appointments/[id]/manual-reschedule`, `.../lifecycle`, `.../payment`, `.../comments`.

## Definition of Done

- [x] Закрыты разделы 4.0–4.8 ниже.
- [x] Targeted auto-checks из 4.8 прошли.
- [x] Обновлены `ROADMAP.md`, `README.md`, `LOG.md`, `api.md`, `booking-calendar.md`.
- [x] Ops: staging `booking_doctor_appointments_read_source=canonical`; prod — defer в ops журнал (см. `LOG.md`).

---

## 4.0 — Calendar library

- [x] Выбрана и добавлена одна npm-зависимость с DnD + resize
- [x] Зафиксировано в LOG отступление от OWN_BOOKING «custom grid без npm»
- [x] Spike/интеграция: day + week (+ month) отображаются в TZ филиала

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | ✅ |
| Владелец | | визуально по желанию |

---

## 4.1 — Feed API

- [x] Календарь врача отдаёт записи из **canonical** (`be_appointments`), без режима `rubitime_legacy` в UI
- [x] `readSource` в doctor calendar response = `canonical`
- [x] В ответе есть слои **`working`** (рабочее время) и **`break`** (перерывы из gaps или blocks) при **`booking_calendar_show_working_hours=true`** (default)
- [x] При **`booking_calendar_show_working_hours=false`** слоёв `working`/`break` нет; записи и `block` остаются
- [x] **`freeSlot` / `includeFreeSlots`** не используются в doctor calendar
- [x] `schedule_blocks` (отсутствие/занято) по-прежнему видны
- [x] Ключ `booking_calendar_show_working_hours` добавлен в `ALLOWED_KEYS` и `admin/settings` allowlist

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | `service.test.ts` + route test ✅ |

---

## 4.2 — Toolbar и шапка

- [x] В toolbar **нет** выбора специалиста и кабинета
- [x] Есть выбор **локации**; специалист подставляется автоматически (solo)
- [x] Подпись периода корректна для **день / неделя / месяц** (русский формат, без обрезки)
- [x] Переключатель **«Рабочее время»** в toolbar календаря: выкл. убирает фон, вкл. возвращает; значение сохраняется в `system_settings`

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | ✅ |
| Владелец | | удобство toggle |

---

## 4.3 — Сетка на библиотеке

- [x] Custom luxon grid заменён на calendar library
- [x] Рабочее время и перерывы видны как фон
- [x] Записи и блокировки кликабельны

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | ✅ |
| Владелец | | day/week/month |

---

## 4.4 — Детали и создание

- [x] Клик/tap по записи открывает панель: пациент, услуга, локация, время, статус, источник
- [x] Видны оплата/предоплата, абонемент (если привязан), Rubitime id/url при наличии
- [x] История lifecycle отображается
- [x] **«Создать»** открывает форму ручной записи (без клика по пустой ячейке)

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | ✅ |
| Владелец | | |

---

## 4.5 — Отмены рядом

- [x] Активная и отменённая запись на **одно время** не перекрывают друг друга полностью (~¾ / ~¼)
- [x] Отмена визуально отличима (крестик / зачёркивание)
- [x] Несколько отмен на слот — список в деталях по клику на полоску

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | интеграционный smoke `DoctorBookingCalendarClient` ✅ |
| Владелец | | сценарий: отмена → новая запись на то же время |

---

## 4.6 — DnD и resize

- [x] **Desktop:** drag переносит запись; после сохранения время в БД и lifecycle обновлены
- [x] **Desktop:** resize меняет длительность; при конфликте — ошибка, запись не «ломается»
- [x] При длительности ≠ стандарта услуги — предупреждение (defer в этап 5, не блокер этапа 4)
- [x] **Touch:** long-press активирует перенос; обычный scroll не срабатывает как drag (manual defer в этап 5)
- [x] **Touch:** resize за нижний край события (manual defer в этап 5)

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | route/lifecycle tests ✅ |
| Владелец | | touch device smoke |

---

## 4.7 — Rubitime и обновление календаря

- [x] Ручное создание и перенос **отправляют** sync в Rubitime (при включённом bridge); **`manual-cancel`** — канон → Rubitime ([`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md))
- [x] При ответе «слот занят» / conflict — **нет** оставшейся «битой» записи в нашей БД; UI показывает понятную ошибку
- [x] Для `manual` и `manual-reschedule` используется единый контракт ошибки: `409 external_slot_taken` + `hint=refresh_calendar`
- [x] После ошибки conflict пользователь может **обновить** календарь и увидеть запись, пришедшую webhook'ом
- [x] Пока открыт календарь: периодический refetch (poll) + refetch при возврате на вкладку
- [x] После успешного create/reschedule/cancel календарь обновляется без F5

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | rollback test ✅ |
| Владелец / ops | | конфликт с реальным Rubitime на staging |

---

## 4.8 — Read-source, тесты, docs

### Автотесты

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/booking-calendar/service.test.ts \
  src/app/api/doctor/booking-engine/calendar/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/manual/route.test.ts \
  src/app/api/doctor/booking-engine/appointments/\[id\]/manual-reschedule/route.test.ts \
  --project fast
```

- [x] Команда выше — зелёная
- [x] `tsc -p apps/webapp` без ошибок в затронутых модулях

### Ops

- [x] Staging: `booking_doctor_appointments_read_source=canonical`
- [x] Smoke: календарь + список записей врача согласованы с canonical
- [x] Prod cutover — defer по ops-решению после staging (см. `LOG.md`)

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | | |
| Ops | | |

---

## Регрессии (ROADMAP §10 проверки)

- [x] Клик → детали
- [x] Drag → lifecycle
- [x] Resize → конфликты
- [x] Active + cancelled рядом
- [x] Шапка day/week/month
- [x] Нет зависимости календаря от Rubitime **слотов** для отрисовки

---

## Закрытие этапа 4

ROADMAP §10 → `done`: интерактивный календарь принят по чеклисту; ops read-source — см. 4.8.

**Не блокирует этап 4:** этап 5 (полный UI-проход владельца по всей инициативе).
