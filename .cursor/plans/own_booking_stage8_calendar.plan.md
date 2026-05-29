---
name: "Own Booking Engine — Stage 8: Specialist/admin calendar"
overview: "Этап 8: календарь специалиста/администратора (готовый React/Next-компонент по возможности) на канонических записях — просмотр/создание/перенос/отмена, статусы/оплаты/абонементы/комментарии, фильтры специалист/филиал/кабинет/день-неделя-месяц; Google Calendar как зеркало, не источник правды. Источник — docs/OWN_BOOKING_ENGINE_INITIATIVE/STAGE_CHECKLISTS.md §Этап 8."
gitBranch: initiative/own-booking-engine
isProject: false
todos:
  - id: "s8-component"
    content: "Выбор готового календарного компонента vs собственный; решение в SCOPE_DECISIONS (Q3)"
    status: pending
  - id: "s8-read"
    content: "Серверная агрегация календаря из канонических appointment/schedule_block по диапазону+фильтрам (не проекция Rubitime)"
    status: pending
  - id: "s8-view"
    content: "Представление: записи/слоты/статусы/филиалы/кабинеты/специалисты/услуги/переносы/отмены/оплаты/абонементы/блокировки"
    status: pending
  - id: "s8-actions"
    content: "Действия из календаря: создать вручную/перенести/отменить (через service этапов 2/4)"
    status: pending
  - id: "s8-filters"
    content: "Фильтры: специалист/филиал/кабинет/день-неделя-месяц"
    status: pending
  - id: "s8-gcal"
    content: "Google Calendar как зеркало (переиспользовать существующий синк); канон — собственная БД"
    status: pending
  - id: "s8-verify"
    content: "Тесты агрегации/действий; typecheck/lint; api.md, DOCTOR_CABINET_NAVIGATION.md, LOG.md, ROADMAP.md"
    status: pending
---

# Этап 8 — Календарь специалиста / администратора

> ТЗ: `STAGE_CHECKLISTS.md` §Этап 8 (ТЗ §15,22.2). Зависит от этапов 1,2,4; отображает оплаты/абонементы по мере готовности 5–7.

## Контекст существующего кода

- Текущий список записей врача: `modules/doctor-appointments/*` + `infra/repos/pgDoctorAppointments.ts` читают **`appointment_records`** (проекция Rubitime), не канон. Кабинет пациента upcoming/past — тоже `appointment_records` через `appointmentProjectionPort`.
- Навигация врача: `apps/webapp/src/shared/ui/doctorNavLinks.ts`, `DOCTOR_CABINET_NAVIGATION.md`; страница `app/app/doctor/appointments/page.tsx`.
- Google Calendar: webapp OAuth/admin `app/app/settings/GoogleCalendarSection.tsx` + `app/api/admin/google-calendar/*`, integrator синк `apps/integrator/src/integrations/google-calendar/sync.ts` (`syncAppointmentToCalendar`), маппинг `bookingCalendarMap` (`rubitime_record_id`↔`gcal_event_id`). Триггер — Rubitime webhook/projection.

## Scope boundaries

- **Можно трогать:** новый календарь UI (кабинет врача/админа), серверная агрегация (read-модель календаря над каноном), переключение чтения врача с `appointment_records` на канон (или мост), действия через service этапов 2/4, расширение GCal-синка на канон (зеркало), docs/навигация.
- **Вне scope:** изменение платёжной/абонементной логики (этапы 5/6 — здесь только отображение их статусов); карточка клиента (9).

## Декомпозиция

### Шаг 8.1 — Выбор компонента (todo s8-component) — ТЗ §15.2
- Оценить готовый React/Next-календарь vs собственный (`[need-decision]` Q3 — лицензии/зависимости/покрытие логики). Решение зафиксировать в `SCOPE_DECISIONS.md`.
- Чек: решение задокументировано с критериями.

### Шаг 8.2 — Серверная агрегация (todo s8-read) — ТЗ §15.1,22.2
- Read-модель календаря из канонических `appointment` + `schedule_block` по диапазону дат + фильтрам; пагинация/диапазон. Источник — канон (НЕ `appointment_records`).
- Перевести чтение врача на канон (или через bridge на переходный период).
- Чек: агрегация по неделе/месяцу корректна и производительна.

### Шаг 8.3 — Представление (todo s8-view) — ТЗ §15.1,15.4
- Показать: записи, свободные/занятые слоты, филиалы, кабинеты, специалисты, услуги, статусы, переносы, отмены, оплаты/предоплаты (этап 5), абонементные визиты (этап 6), ручные блокировки, комментарии, пациент.
- Чек: карточка события показывает статус/оплату/абонемент/комментарий.

### Шаг 8.4 — Действия (todo s8-actions) — ТЗ §15.4
- Создание вручную/перенос/отмена из календаря через service этапов 2/4 (не дублировать логику).
- Чек: действия меняют канон и историю; уведомления уходят.

### Шаг 8.5 — Фильтры (todo s8-filters) — ТЗ §15.4
- Специалист/филиал/кабинет/день-неделя-месяц.
- Чек: фильтры корректно сужают выборку.

### Шаг 8.6 — Google Calendar (todo s8-gcal) — ТЗ §15.3,C8
- GCal — зеркало/синхронизация (переиспользовать `syncAppointmentToCalendar`); канон — собственная БД; переносы/отмены/правила — внутри системы.
- Чек: изменение записи в каноне отражается в GCal; GCal не является источником правды.

### Шаг 8.7 — Верификация (todo s8-verify)
- Тесты агрегации/действий; `typecheck`/`lint`; обновить `api.md`, `DOCTOR_CABINET_NAVIGATION.md`, `doctorNavLinks.ts`, `LOG.md`, `ROADMAP.md`.

## Definition of Done (этап 8)
- [ ] Календарь специалиста/админа на каноне: просмотр/создание/перенос/отмена/фильтры (§15.1,§15.4).
- [ ] Календарная выборка tenant-safe: фильтрация по `organization_id`, без межклинических утечек (C1).
- [ ] Статусы/оплаты/абонементы/комментарии видны (по мере готовности 5–7).
- [ ] GCal — зеркало; канон — БД (§15.3,C8).
- [ ] UI §B-calendar; тесты/typecheck/lint зелёные; docs/навигация/статусы обновлены; Q3 закрыт.

## Gate
Сужения и выбор компонента — в `SCOPE_DECISIONS.md`.
