# Документация BersonCareBot

## Порты и инфраструктура (источник истины)

**Порты BersonCareBot:** см. **docs/ARCHITECTURE/SERVER CONVENTIONS.md**.

| Служба   | Dev  | Prod |
|----------|------|------|
| API      | 4200 | 3200 |
| Webapp   | 5200 | 6200 |

Деплой, nginx, БД, systemd: **deploy/HOST_DEPLOY_README.md**.
Cutover/backfill/reconcile env для prod/dev: **docs/ARCHITECTURE/SERVER CONVENTIONS.md** и **deploy/env/README.md**.

---

## Недавние изменения (факт по репозиторию, 2026-03)

- **CMS и медиа:** библиотека файлов для врача (`/app/doctor/content/library`), API `GET/DELETE /api/admin/media`, выбор картинки/видео в форме контента из библиотеки — см. **docs/CONTENT_CMS_REPORT.md** (раздел «Медиа-библиотека»).
- **CI:** единый workflow `.github/workflows/ci.yml` — job проверок (`pnpm run ci`) и job **Deploy** на `main` по SSH (`deploy/host/deploy-prod.sh`); отдельный workflow `deploy-host.yml` **удалён** (дублирование не используется).
- **Тесты webapp:** для стабильности `exchangeIntegratorToken.maxWhitelist` в CI замокан `configAdapter` (`getConfigValue` → env fallback), чтобы настройки из БД не переопределяли whitelist в тестах.
- **Дневник симптомов (пациент):** доработки журнала и трекинга, клиентские события (`symptomDiaryClientEvents`), отдельные клиентские компоненты — см. `apps/webapp/src/modules/diaries/diaries.md`.
- **Дневник симптомов (2026-03-31):** форма «Добавить запись» на общей странице дневника удалена; добавление идёт через `+` в строке симптома и быстрые сценарии. График симптома теперь двухлинейный: отдельные серии «в моменте» и «за день» (`/api/patient/diary/symptom-stats` -> `instant`/`daily`).
- **Профиль / безопасность (2026-03-31):** добавлен destructive-flow удаления только дневниковых данных пациента (PIN + SMS OTP + транзакционный purge), API: `/api/auth/pin/verify`, `/api/patient/diary/purge-otp/start`, `/api/patient/diary/purge`.
- **Integrator:** в `writePort` доработан сценарий upsert пользователя; добавлен тест `writePort.userUpsert.test.ts`.

---

## Структура docs/

### ARCHITECTURE/ — система как она есть

Описание текущей архитектуры, контракты, модели, guardrails.

| Файл | Назначение |
|------|------------|
| **FULL PLATFORM MODEL.md** | Концепция платформы: мессенджеры, Web-App, backend, MVP. |
| **ARCHITECTURE_GUARDRAILS.md** | Guardrails runtime: content paths, security, integrator boundaries. |
| **CONTENT_AND_SCRIPTS_FLOW.md** | Как загружается контент, матчинг сценариев по событию. |
| **DB_STRUCTURE_AND_RECOMMENDATIONS.md** | Модель БД integrator (users, identities, contacts). |
| **MESSAGING_CONTRACT.md** | Контракт message.send / message.edit: payload, parse_mode, ссылки. |
| **SPECIALIST_CABINET_STRUCTURE.md** | Продуктовая структура кабинета специалиста. |
| **DOCTOR_DASHBOARD_METRICS.md** | Метрики плиток `/app/doctor`, SQL и deep links (webapp). |
| **MAX_CAPABILITY_MATRIX.md** | Матрица Telegram vs MAX: механики, уведомления, Web App. |
| **MAX_SETUP.md** | Подключение MAX: env, webhook, smoke-тесты. |
| **LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md** | Low-level аудит auth, DI, composition roots (2026-03). |
| **CONTENT_CMS_REPORT.md** (`docs/CONTENT_CMS_REPORT.md`) | CMS: разделы `content_sections`, маршруты пациента и врача, медиа-библиотека и выбор файлов в форме контента. |

### MIGRATION/ — текущий план переноса данных и задачи

Активный roadmap миграции webapp ↔ integrator и все связанные планы.

| Файл | Назначение |
|------|------------|
| **DB_ZONES_RESTRUCTURE.md** | Roadmap верхнего уровня: этапы 0–14, guardrails, инструкция для агентов. |
| **DB_MIGRATION_PREPARATION_FOUNDATION.md** | Stage 1: реестр таблиц, ownership, backup, safeguards, projection draft. |
| **DB_MIGRATION_STAGE2_PATIENT_MASTER.md** | Stage 2: patient master domain — projection, schema, emitters. |
| **STAGE2_REMEDIATION_PLAN.md** | План исправления ошибок Stage 2: durable projection, id contract, out-of-order. |
| **STAGE2_REMEDIATION_TASKS_FOR_JUNIOR_AGENT.md** | Атомарные задачи T1–T6 для авто-агента (эталонный формат). |
| **DOCTOR_DASHBOARD_METRICS_CHANGELOG.md** | Лог правок метрик дашборда врача и навигации (webapp). |
| **REMINDERS_ROADMAP.md** | Roadmap напоминаний: фазы 1–4. |
| **plan-channel-from-context.md** | План: канал доставки из контекста вместо hardcode. |

### archive/ — история

Завершённые аудиты, рефакторинги, одноразовые отчёты.

| Файл | Назначение |
|------|------------|
| **CODE_ASSESSMENT_REPORT.md** | Code assessment integrator+webapp (2025-03). |
| **ROLLOUT.md** | MAX-first rollout checklist (завершён). |
| **STATS_READINESS.md** | Аудит diary-схемы для аналитики. |
| *(и 10 исторических аудитов)* | См. `archive/README.md`. |

---

## Документы в корне репозитория

| Файл | Назначение |
|------|------------|
| **README.md** | Запуск, конфиг, команды, endpoints. |
| **ARCHITECTURE.md** | Контракт: слои, запреты, pipeline, изоляция. |
| **docs/ARCHITECTURE/SERVER CONVENTIONS.md** | Порты, БД, пользователи PostgreSQL, nginx, systemd. |
| **SCENARIO_LOGIC_SUMMARY.md** | Логика сценариев (Telegram, Rubitime). |

---

## Спеки слоёв (src/)

Описание ответственности слоёв — в `*.md` рядом с кодом:

- `src/app/app.md`
- `src/content/content.md`
- `src/kernel/domain/domain.md`
- `src/kernel/eventGateway/eventGateway.md`
- `src/kernel/orchestrator/orchestrstor.md`
- `src/integrations/integrations.md`
- `src/infra/db/db.md`, `src/infra/db/schema.md`
- `src/infra/dispatcher/dispatcher.md`
- `src/infra/queue/queue.md`
- `src/infra/runtime/*.md`, `src/infra/observability/observability.md`

---

## Webapp

- **webapp/README.md** — запуск, роуты, контракт с интегратором.
- **webapp/INTEGRATOR_CONTRACT.md** — подписанные ссылки, auth exchange, webhooks.
- **webapp/ARCHITECTURE.md** — структура Next.js, роли, доступ.
