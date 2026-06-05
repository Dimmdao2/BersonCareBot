---
name: Wave3 Phase08 Integrator schema reduction
overview: До миграции хвостов на Drizzle убрать или перенести дубли integrator-схемы, которые после unified DB должны читать/писать public-канон.
status: pending
isProject: false
todos:
  - id: w3-p08-inventory
    content: "Построчная инвентаризация integrator tables/repos: keep technical state vs duplicate of public."
    status: pending
  - id: w3-p08-settings
    content: "Удалить концепцию зеркала integrator.system_settings из runtime: integrator читает public.system_settings напрямую."
    status: pending
  - id: w3-p08-booking-catalog
    content: "Rubitime booking profile tables сверить с public.booking_* и перевести reads/writes на public, если покрыто."
    status: pending
  - id: w3-p08-appointments
    content: "rubitime_records/appointment_records/patient_bookings: оставить integrator только raw webhook/event audit, канон записи в public."
    status: pending
  - id: w3-p08-reminders
    content: "integrator.user_reminder_* mirror: решить dispatch from public vs минимальное technical queue state."
    status: pending
  - id: w3-p08-identities
    content: "integrator.users/identities/contacts: оставить только channel identity state, убрать дубли профиля пациента."
    status: pending
  - id: w3-p08-plan-update
    content: "Обновить фазу 09: исключить файлы/таблицы, которые удаляются или переводятся на public."
    status: pending
  - id: w3-p08-senior-owner-approval
    content: "Перед delete/deprecate/drop получить senior-agent review + owner approval; для prod-действий зафиксировать backup/rollback/окно выката."
    status: pending
  - id: w3-p08-verify
    content: "LOG/RAW_SQL: таблица keep/delete/move; targeted tests для изменённых dispatch/settings/booking paths."
    status: pending
---

# Wave 3 — фаза 08: Integrator schema reduction

## Зачем эта фаза перед Drizzle P1+

После unified DB (`public` + `integrator` в одной PostgreSQL) часть integrator-схемы стала не технической state интеграций, а дублирующей копией webapp-канона.  
Эту часть нельзя сначала «аккуратно мигрировать на Drizzle», а потом удалить: это двойная работа и риск закрепить ненужный слой.

## Definition of Done

- [ ] Для каждой integrator-таблицы/репозитория есть статус: **keep**, **move-to-public**, **delete/deprecate**, **raw-audit-only**.
- [ ] `integrator.system_settings` больше не является runtime source of truth; чтение идёт из `public.system_settings`.
- [ ] Фаза 09 обновлена: не мигрирует файлы, которые фаза 08 удаляет/переводит на `public`.
- [ ] `RAW_SQL_INVENTORY.md` и `LOG.md` содержат итоговую матрицу решений.
- [ ] Нет новых зеркал `public`-канона в `integrator`.
- [ ] Для любого `delete/deprecate/drop`: senior-agent review + owner approval; для production — backup/rollback/окно выката.

## Owner decisions

- `public` — главный источник бизнес-данных.
- `integrator` должен остаться технической схемой: очереди, locks/claims, throttle, outbox, delivery logs, внешние события и channel identity state.
- Дубли в `integrator` можно отключать/удалять, если эти бизнес-данные уже есть в `public`.
- Историю в `integrator` отдельно не храним, если она уже покрыта `public`.
- Нужные справочники переносим/канонизируем в `public`.

## Preliminary classification

| Группа | Предварительный статус | Причина |
|--------|------------------------|---------|
| `integrator.system_settings`, `settingsSyncRoute`, `syncSettingToIntegrator` | **delete/deprecate** | В одной БД можно читать `public.system_settings`; зеркало создаёт двойную запись и риск рассинхрона |
| `rubitime_branches`, `rubitime_services`, `rubitime_cooperators`, `rubitime_booking_profiles` | **move-to-public candidate** | Webapp уже имеет booking catalog (`public.booking_*`); integrator справочники выглядят legacy v1 mapping |
| `rubitime_records` | **raw-event-only or delete/deprecate candidate** | Канон записи должен быть `public.appointment_records` / `public.patient_bookings`; отдельная история в `integrator` нужна только если это непокрытый technical external event log |
| `rubitime_events` | **keep technical audit** | События внешней интеграции, полезно для replay/debug |
| `booking_calendar_map` | **move-to-public candidate** | Связь с `public.patient_bookings.gcal_event_id`; возможно заменить колонкой/каноном public |
| `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs` | **move-to-public candidate** | Правила/история напоминаний уже каноничны в webapp; integrator может dispatch читать из `public` |
| `users`, `identities`, `contacts` | **keep only channel identity state** | Нужно для Telegram/Max identities; не дублировать профиль пациента и бизнес-канон |
| `conversations`, `conversation_messages`, `message_drafts` | **review with support canon** | Если PWA support canon в `public`, integrator хранит только channel transport/log |
| `projection_outbox`, `rubitime_create_retry_jobs`, throttle row, delivery logs | **keep technical state** | Очереди, retry, идемпотентность и внешние интеграции |

## Scope

**Разрешено:** `apps/integrator/src/**`, `apps/webapp/src/modules/system-settings/**`, `apps/webapp/src/infra/integrator-push/**`, docs в `INTEGRATOR_DRIZZLE_MIGRATION`, точечные тесты.

**Вне scope:** удаление production-таблиц без senior-agent review, owner approval, backup/rollback/окна выката; переписывание UI.

## Проверки

```bash
rg "system_settings|rubitime_branches|rubitime_services|rubitime_records|user_reminder_rules|booking_calendar_map" apps/integrator/src --glob "*.ts"
pnpm --dir apps/integrator run test
pnpm --dir apps/webapp run typecheck
```

## Stop conditions

- Нельзя переходить к фазе 09, пока нет матрицы keep/delete/move.
- Нельзя переводить файл на Drizzle, если его таблица помечена `delete/deprecate` или `move-to-public`.
- Нельзя выполнять destructive DB action только решением агента: нужен senior-agent review + owner approval.
