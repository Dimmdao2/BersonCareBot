---
name: Wave3 Phase08 Integrator schema reduction
overview: До миграции хвостов на Drizzle убрать или перенести дубли integrator-схемы, которые после unified DB должны читать/писать public-канон.
status: completed
isProject: false
todos:
  - id: w3-p08-inventory
    content: "Построчная инвентаризация integrator tables/repos: keep technical state vs duplicate of public."
    status: completed
  - id: w3-p08-settings
    content: "Удалить концепцию зеркала integrator.system_settings из runtime: integrator читает public.system_settings напрямую."
    status: completed
  - id: w3-p08-booking-catalog
    content: "Rubitime booking profile tables сверить с public.booking_* и перевести reads/writes на public, если покрыто."
    status: completed
  - id: w3-p08-appointments
    content: "rubitime_records/appointment_records/patient_bookings: оставить integrator только raw webhook/event audit, канон записи в public."
    status: completed
  - id: w3-p08-reminders
    content: "integrator.user_reminder_* mirror: решить dispatch from public vs минимальное technical queue state."
    status: completed
  - id: w3-p08-identities
    content: "integrator.users/identities/contacts: оставить только channel identity state, убрать дубли профиля пациента."
    status: completed
  - id: w3-p08-plan-update
    content: "Обновить фазу 09: исключить файлы/таблицы, которые удаляются или переводятся на public."
    status: completed
  - id: w3-p08-senior-owner-approval
    content: "Не выполнялось destructive delete/drop; senior-agent review + owner approval остаются обязательным gate перед любым будущим drop/deprecate в prod."
    status: cancelled
  - id: w3-p08-verify
    content: "LOG/RAW_SQL: таблица keep/delete/move; targeted tests для изменённых dispatch/settings/booking paths."
    status: completed
---

# Wave 3 — фаза 08: Integrator schema reduction

## Зачем эта фаза перед Drizzle P1+

После unified DB (`public` + `integrator` в одной PostgreSQL) часть integrator-схемы стала не технической state интеграций, а дублирующей копией webapp-канона.  
Эту часть нельзя сначала «аккуратно мигрировать на Drizzle», а потом удалить: это двойная работа и риск закрепить ненужный слой.

## Definition of Done

- [x] Для каждой integrator-таблицы/репозитория есть статус: **keep**, **move-to-public**, **delete/deprecate**, **raw-audit-only**.
- [x] `integrator.system_settings` больше не является runtime source of truth; чтение идёт из `public.system_settings`.
- [x] Фаза 09 обновлена: не мигрирует файлы, которые фаза 08 удаляет/переводит на `public`.
- [x] `RAW_SQL_INVENTORY.md` и `LOG.md` содержат итоговую матрицу решений.
- [x] Нет новых зеркал `public`-канона в `integrator`.
- [x] Для любого будущего `delete/deprecate/drop`: senior-agent review + owner approval; для production — backup/rollback/окно выката. В фазе 08 destructive DB action не выполнялся.

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

## Закрытие (2026-06-06)

Фаза закрыта как **non-destructive reduction**: runtime-readers настроек больше не зависят от `integrator.system_settings`, но таблицы и legacy sync endpoint не удалялись. Все будущие `DROP` / hard deprecate остаются за отдельным owner-approved cutover с backup/rollback/окном выката.

### Кодовые изменения

- `apps/integrator/src/config/appBaseUrl.ts`, `appTimezone.ts`, `smtpOutbound.ts`, `infra/db/repos/operationalVerboseLog.ts`, `linkedPhoneSource.ts`, `kernel/domain/executor/handlers/patientHomeMorningPing.ts`, `integrations/google-calendar/runtimeConfig.ts`: чтение настроек квалифицировано как `public.system_settings`.
- `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts`: endpoint помечен как legacy compatibility; запись зеркала явно квалифицирована как `integrator.system_settings`, чтобы route не выглядел runtime-source.

### Итоговая матрица решений

| Группа | Статус | Решение phase08 |
|--------|--------|-----------------|
| `integrator.system_settings` + `settingsSyncRoute` | **delete/deprecate candidate; runtime source removed** | Runtime reads идут из `public.system_settings`; signed sync route оставлен совместимостью/cache invalidation, без статуса source of truth. Future removal требует owner approval и cleanup webapp `system_settings_sync` outbox. |
| `syncSettingToIntegrator` / `system_settings_sync` outbox | **deprecate candidate** | Не удалялось из-за действующего webapp sync-контракта; не является runtime requirement для integrator settings reads. |
| `rubitime_branches`, `rubitime_services`, `rubitime_cooperators`, `rubitime_booking_profiles`, `bookingProfilesRepo` | **move-to-public / deprecate candidate** | Не мигрировать “ради Drizzle” в фазе 09; текущий runtime остаётся legacy v1 mapping до отдельного booking catalog cutover на `public.booking_*` / `booking-rubitime-sync`. |
| `rubitime_records` | **raw-audit-only / deprecate candidate** | Канон записи — `public.appointment_records` + `public.patient_bookings`; integrator row допустим только как legacy raw Rubitime audit/replay surface. Ops scripts остаются Class C. |
| `rubitime_events` | **keep technical audit** | Внешний webhook/event log для replay/debug, техническая state integrator. |
| `booking_calendar_map` | **move-to-public candidate** | Сейчас это thin map + sync в `public.patient_bookings.gcal_event_id`; не расширять. Future target — public canonical calendar fields/mapping. |
| `user_reminder_rules`, `user_reminder_occurrences`, `user_reminder_delivery_logs` | **move-to-public candidate; dispatch state review** | Не расширять зеркало; перед удалением нужен отдельный dispatch-from-public design. Пока integrator dispatch paths остаются как technical queue/history state. |
| `users`, `identities`, `contacts`, `telegram_state` | **keep channel identity state** | Сохранять только messenger/channel identity и связывание с public users; не использовать как дубль профиля пациента. |
| `conversations`, `conversation_messages`, `message_drafts`, `user_questions`, `question_messages` | **review / transport-log only** | Если PWA support canon покрывает бизнес-историю в `public`, integrator оставляет только channel transport/log. Без удаления в phase08. |
| `projection_outbox`, `rubitime_create_retry_jobs`, `outgoing_delivery_queue` usage, throttle/advisory, `delivery_attempt_logs`, idempotency/locks | **keep technical state** | Очереди, claims, retries, throttle, delivery/audit logs и идемпотентность остаются integrator technical state. |

### Проверки

- `rg "FROM system_settings|INTO system_settings|UPDATE system_settings" apps/integrator/src --glob "*.ts"` → 0 unqualified matches.
- `rg "public\.system_settings|integrator\.system_settings" apps/integrator/src --glob "*.ts"` → только expected public reads + legacy sync route/test.
- Targeted tests/typecheck зафиксированы в `LOG.md`; destructive DB action не выполнялся.
