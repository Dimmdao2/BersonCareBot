# PHASE D — Событийные хуки (горячие пути)

Канон: [`MASTER_PLAN.md`](MASTER_PLAN.md) §1–2, §5 фаза D.

## 1. Цель этапа

Подключить **немедленную** регистрацию сбоев (и при политике — алерт) в местах, где пользователь или внешняя система уже инициировала действие: синк Google Calendar после записи, автомерж, деградация очереди проекции, ошибки media-worker.

## 2. Зависимости

- **Фаза A** обязательна (`reportFailure`, `resolve`).

## 3. In scope / out of scope

### In scope

- **Google Calendar:** `postCreateProjection.ts` (catch вокруг `syncRubitimeWebhookBodyToGoogleCalendar` и аналоги), классы ошибок из `client.ts` (`GOOGLE_CALENDAR_HTTP_*`, token errors) → отдельные `error_class`.
- **Автомерж:** при записи `auto_merge_conflict` в audit (`admin_audit_log`) — один алерт на **новый** `conflict_key` (см. существующую дедуп-логику в `adminAuditLog.ts`); не дублировать при повторных событиях той же пары.
- **Projection queue:** при snapshot из `/health/projection` или в worker — пороги: `deadCount > 0`, `retriesOverThreshold > 0`, `oldestPendingAt` старше X (значение из `system_settings`) → `internal:projection:…`.
- **Media-worker:** сигнал по метрикам БД (failed jobs, stale pending) или heartbeat-файл — **уточнить при реализации**; минимум — хук при известной ошибке job.

### Out of scope

- Рефакторинг всего Rubitime ingest кроме точечных `reportFailure`.
- Изменение GitHub CI workflow.

## 4. Разрешённые области правок

| Область | Пути |
|---------|------|
| Post-create / GCal | `apps/integrator/src/integrations/rubitime/postCreateProjection.ts`, `google-calendar/sync.ts` |
| Audit / merge | `apps/webapp/src/infra/adminAuditLog.ts`, вызывающие сервисы merge |
| Projection | integrator worker + место чтения snapshot |
| Media | `apps/media-worker/src/**`, webapp preview metrics при необходимости |

**Запрещено:** менять схему legacy LFK таблиц (правила TREATMENT_PROGRAM_INITIATIVE).

## 5. Декомпозиция шагов

### Шаг D.1 — Google Calendar post-create

**Действия:**

1. Заменить «только warn» на `reportFailure` с деталями `recordId`, `err.message`, маппинг на `error_class`.
2. На успешном sync после предыдущего открытого инцидента gcal — `resolve` для соответствующего ключа (или общий ключ `outbound:google_calendar:*` — уточнить).

**Checklist:**

- [ ] `rg gcal sync failed` — единая точка отчёта.
- [ ] Unit-тест на маппинг ошибок.

**Критерий закрытия:** симулированный throw открывает инцидент один раз.

---

### Шаг D.2 — Auto-merge conflicts

**Действия:**

1. В месте первичной записи `auto_merge_conflict` вызвать `reportFailure` с `dedup_key` из `conflict_key` или его hash как сейчас в audit.
2. Не алертить на `auto_merge_conflict_anomaly` без отдельной политики.

**Checklist:**

- [ ] `rg auto_merge_conflict` — покрыты open paths.
- [ ] Совместимость с бейджем `openAutoMergeConflictCount` в audit API.

**Критерий закрытия:** тест на «два события одного conflict_key → один TG».

---

### Шаг D.3 — Projection thresholds

**Действия:**

1. Периодический опрос или reuse данных из существующего health — не дублировать тяжёлый SQL; предпочтительно вызывать тот же `getProjectionHealth` в probe runner (фаза B) **или** отдельный лёгкий counter query.
2. Пороги в `system_settings`.

**Checklist:**

- [ ] Нет ложного алерта при кратковременном `deadCount` flicker — debounce N минут (настройка).

**Критерий закрытия:** документированный debounce в LOG.

---

### Шаг D.4 — Media-worker (минимум)

**Действия:**

1. Определить один канонический сигнал (например рост `failed` в preview pipeline из уже существующих метрик system-health).
2. `reportFailure` с `internal:media:…`.

**Checklist:**

- [ ] Не тянуть systemd в webapp.

**Критерий закрытия:** хотя бы один реальный путь ошибки покрыт.

## 6. Definition of Done (фаза D)

- Календарь, автомерж, projection (с debounce), media — подключены к инцидентам с разными ключами.
- Нет регрессии в основных happy-path (тесты существующих сценариев зелёные).

## 7. Ссылки

- [`MASTER_PLAN.md`](MASTER_PLAN.md)
- [`PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md`](PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md)
