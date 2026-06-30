# PHASE A — Модель данных и ядро алертинга

Канон: [`MASTER_PLAN.md`](MASTER_PLAN.md) §3–5 фаза A, §10, `.cursor/rules/000-critical-integration-config-in-db.mdc`, `clean-architecture-module-isolation.mdc`, `system-settings-integrator-mirror.mdc`.

## 1. Цель этапа

Ввести **персистентную модель операторских инцидентов** и **ядро жизненного цикла**: открытие (с дедупом), обновление счётчика/последней ошибки, закрытие, флаги «алерт отправлен» / «recovery отправлен». Обеспечить **мультиканальную доставку** (TG через integrator dispatch, email, запись для UI) без дублирования уведомлений до resolution.

## 2. Hard gates перед кодом

- **Решение по размещению таблицы:** при **unified PostgreSQL** (`public` + `integrator`) — одна таблица в схеме, доступная обоим процессам, **или** две зеркальные таблицы с синхронизацией (избегать дублирования без необходимости). Зафиксировать выбор в `LOG.md` со ссылкой на `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`.
- **Ключи дедупа:** стабильный формат `{direction}:{integration}:{error_class}` (пример: `outbound:google_calendar:GOOGLE_TOKEN_HTTP_400`). Документировать в коде как константы/фабрику ключей.
- Прочитать: `recordDataQualityIncidentAndMaybeTelegram` как эталон дедупа «первое срабатывание».

## 3. In scope / out of scope

### In scope

- Таблица(ы) инцидентов + Drizzle schema + миграция.
- Репозиторий/порт: CRUD + `openOrTouchIncident`, `resolveIncidentByKey` (идемпотентно).
- Сервис уровня приложения: «при открытии нового инцидента — отправить алерт; при повторе — только touch; при resolve — recovery».
- Интеграция с `dispatchPort` (integrator) для TG; вызов `sendMail` или существующего bersoncare email route — по месту размещения сервиса.
- Новые **операционные** ключи в `system_settings` (частота cron, пороги — если хранятся в БД): только через `ALLOWED_KEYS` + sync в integrator.

### Out of scope

- Реализация самих synthetic probes (фаза B).
- UI (фаза F).
- Изменение схемы `integration_data_quality_incidents` без явной необходимости — предпочтительно **новая** таблица `operator_incidents` (или согласованное имя), чтобы не смешивать семантику.

## 4. Разрешённые области правок

| Разрешено | Примеры путей |
|-----------|----------------|
| Схема БД webapp | `apps/webapp/db/schema/**`, миграции Drizzle |
| Integrator DB repos | `apps/integrator/src/infra/db/**` при необходимости зеркала |
| Webapp модуль | `apps/webapp/src/modules/*` через **новый** модуль `operator-incidents` или `system-health` расширение — **порты**, не прямой pool в `modules/*` |
| Integrator | `apps/integrator/src/infra/**`, `apps/integrator/src/kernel/**` — точки вызова без нарушения слоёв integrator |
| `system_settings` | `apps/webapp/src/modules/system-settings/types.ts` + UI settings при необходимости |

**Запрещено:** новые env для ключей интеграций; прямые `import { getPool }` из `modules/*` (ESLint).

## 5. Декомпозиция шагов

### Шаг A.1 — Проектирование схемы таблицы

**Действия:**

1. Поля (минимум): `id`, `dedup_key` (unique partial index `WHERE resolved_at IS NULL` или глобальный unique + версионирование — выбрать и обосновать), `direction` (`outbound` | `inbound_webhook` | `internal`), `integration` (строка-enum в коде), `error_class`, `error_detail` (text/jsonb ограниченный), `opened_at`, `last_seen_at`, `occurrence_count`, `resolved_at`, `alert_sent_at`, `recovery_notified_at`, `created_by` опционально (`probe` | `webhook` | `manual`).
2. Индексы: поиск открытых по `integration`, по `last_seen_at` для UI.

**Checklist:**

- [ ] `rg operator_incidents` — нет конфликта имён с существующими таблицами.
- [ ] Ревью миграции на `ON CONFLICT` / partial unique.

**Критерий закрытия:** схема задокументирована в комментарии к миграции и в `LOG.md`.

---

### Шаг A.2 — Drizzle + миграция

**Действия:**

1. Добавить таблицу в schema, `drizzle-kit generate`, применить миграцию в dev.
2. Если integrator читает ту же БД — убедиться в `search_path` / префиксе схемы по `DATABASE_UNIFIED_POSTGRES.md`.

**Checklist:**

- [ ] `pnpm exec drizzle-kit check` (или эквивалент проекта) без ошибок.
- [ ] Типы inferred из schema.

**Критерий закрытия:** миграция применима с нуля.

---

### Шаг A.3 — Порт + реализация репозитория (webapp)

**Действия:**

1. `modules/operator-incidents/ports.ts` — интерфейс порта.
2. `infra/repos/pgOperatorIncidents.ts` — реализация (только из `app-layer`/DI wiring, не из modules — соблюсти правило: **порт в modules, impl в infra**).
3. `buildAppDeps` — регистрация только если webapp пишет инциденты; если только integrator — порт в integrator.

**Checklist:**

- [ ] ESLint: нет `no-restricted-imports` нарушений в `modules/**`.
- [ ] Unit-тесты на repo с in-memory или test DB по паттерну проекта.

**Критерий закрытия:** транзакционный `openOrTouch` + `resolve` покрыты тестами.

---

### Шаг A.4 — Сервис алертинга

**Действия:**

1. Функции: `reportFailure(...)`, `reportSuccessForProbe(...)` (resolve + recovery notify).
2. Политика: при `open` с `INSERT` новой строки → `alert_sent_at` после успешной отправки (или очередь retry — MVP: best-effort + лог).
3. Email: использовать существующий mail path; не хардкодить SMTP в modules.

**Checklist:**

- [ ] Дедуп: два параллельных вызова не создают два открытых инцидента с одним ключом.
- [ ] `rg dispatchOutgoing` — паттерн meta `eventId` уникален и укладывается в лимиты Telegram.

**Критерий закрытия:** интеграционный тест или ручной сценарий в dev задокументирован в `LOG.md`.

---

### Шаг A.5 — `system_settings` для операторских флагов

**Действия:**

1. Ключи вроде `operator_health_probe_interval_hours`, `operator_health_alert_email_enabled` — только после согласования имён; добавить в `ALLOWED_KEYS`, при необходимости UI в admin Settings.
2. `syncSettingToIntegrator` — не забыть зеркало по `.cursor/rules/system-settings-integrator-mirror.mdc`.

**Checklist:**

- [ ] Нет секретов в ключах значения в UI без маскирования.

**Критерий закрытия:** integrator и webapp читают одни и те же ключи из своих путей конфига.

## 6. Definition of Done (фаза A)

- Таблица и миграция в репозитории; dev-применение проверено.
- API жизненного цикла инцидента с тестами на конкуренцию/dedup.
- Алерт при первом открытии; без повторных TG/email до `resolve`.
- Запись всегда доступна для будущего UI (даже если UI в фазе F).
- `LOG.md`: решение по схеме БД и формату `dedup_key`.

## 7. Зависимости для следующих фаз

- **B** использует сервис открытия/resolve после probe.
- **C–E** — те же вызовы из вебхуков и хуков.

## 8. Ссылки

- [`MASTER_PLAN.md`](MASTER_PLAN.md)
- [`PHASE_B_SYNTHETIC_PROBES_CRON.md`](PHASE_B_SYNTHETIC_PROBES_CRON.md)
