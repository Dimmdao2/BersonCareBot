# Scope decisions — Wave 2 (канон доставки)

**Дата:** 2026-06-09 (обновление по продукту).  
**Статус:** зафиксировано для исполнения Wave 2. **Wave 2 — единственный канон** доставки; MASTER/фазы — справочник.  
**Заменяет** для доставки уведомлений: [`PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md`](PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md) (отдельный push «восстановлено» — **отменён**).  
**Активный план:** [`ROADMAP_WAVE2.md`](ROADMAP_WAVE2.md).

---

## 1. Продукт

| # | Вопрос | Решение |
|---|--------|---------|
| P1 | Wave 2 vs PHASE E | **Wave 2 — канон.** Recovery только строкой в сводке; отдельный TG/email «восстановлено» не делаем. |
| P2 | Сводка при пустом дне | **Всегда** слать утро и вечер: либо `⚠️` + пункты, либо `✅ Всё в порядке`. Без opt-out «тихих OK» в v1. |
| P3 | Критичный список (immediate) | См. матрицу §3. `projection`: critical только `unreachable` \| `error` или `degraded` с `deadCount > 0`. `retriesOverThreshold` без dead — **не** critical. |
| P4 | `dueBacklog` без dead | **Не** immediate. In-app баннер «Сегодня» + строка в сводке при наличии в окне. |
| P5 | Backup `failure` | Immediate при **любом** tier с `lastStatus === "failure"` (последний прогон). |
| P6 | Конфликты аккаунтов | **Один чекбокс** «Конфликты аккаунтов» в блоке «Уведомления админу». Вкл. → немедленный push по всем identity-событиям (внутри: `channel_link`, `auto_merge_*`, `messenger_phone_*` → флаг `topics.account_conflicts`). Не в сводку. |
| P7 | Probe fail (MAX/Rubitime) | Первый fail → **сводка** (если инцидент открыт). **Critical** только после **3 подряд** неуспешных probe-run (≈3× интервал cron probe, по умолчанию 3 ч при hourly). |
| P8 | Inbound webhook (фаза C / волна 4) | Ошибки parse/auth/dispatch → **сводка**. **Critical** только при **≥5** ошибок одного `error_class` за **15 мин** (burst). |
| P9 | Email | **Вне scope Wave 2.** Backlog после стабилизации волн 0–2 в prod. |

---

## 2. Архитектура

| # | Вопрос | Решение |
|---|--------|---------|
| A1 | Единый диспетчер, без новых процессов | **`dispatchOperatorAlert`** — тонкая функция в webapp, **не** новый systemd/worker. Доставка только через **существующий** контур: `relayOutbound` / staff Web Push / `outgoing_delivery_queue` + **integrator worker** (`outgoingDeliveryWorker`). Integrator при инцидентах — только enqueue в ту же очередь; **не** `adminTelegramId` в один чат. |
| A2 | Ключ конфигурации | Один ключ **`operator_health_alert_config`** в блоке **«Уведомления админу»** (`scope=admin`, `ALLOWED_KEYS`). Lazy merge из legacy **`admin_incident_alert_config`**. |
| A3 | UI настроек | Один блок **«Уведомления админу»**: каналы (TG / Max / Push), чекбоксы **«Критичные сбои»**, **«Суточная сводка»**, **«Конфликты аккаунтов»**, часы сводки. Без пяти отдельных identity-строк. |
| A4 | Dedup critical | Таблица **`operator_health_alert_sent`** (`dedup_key`, `severity`, `sent_at`) или эквивалент в Drizzle; повторный tick с тем же ключом — no-op 24 ч или до `resolved`/нормализации (зафиксировать в миграции). |
| A5 | Окна сводки | **Утро 08:00:** с предыдущего **вечернего** слота (20:00 вчера) до 08:00 сегодня. **Вечер 20:00:** с 08:00 до 20:00 того же дня. TZ: **`app_display_timezone`**. |
| A6 | Critical tick нагрузка | **Облегчённый** `collectCriticalHealthSignals()` (порты read-only, без media preview / engagement). Полный `collectAdminSystemHealthData` — только digest tick и UI. |
| A7 | Health UI vs push | **Не вопрос на обсуждение — правило:** красное/жёлтое на странице «Здоровье системы» = **информация в кабинете**; Telegram/Max/Push — **отдельно**, по матрице §3. Пример: очередь «забилась» (due backlog) — видно в UI и попадёт в вечернюю сводку, **но не** разбудит ночью. |

---

## 3. Матрица сигналов (канон)

| Сигнал | Push | Баннер «Сегодня» | Сводка |
|--------|------|------------------|--------|
| `webappDb === down` | critical | да | да |
| `integratorApi` не `ok` | critical | да | да |
| `projection` `unreachable` \| `error` | critical | да | да |
| `projection.deadCount > 0` | critical | да | да |
| `projection` только retries | нет | да | да |
| `outgoingDelivery.deadTotal > 0` | critical | да | да |
| `outgoingDelivery.dueBacklog` ≥ порог | нет | да | да |
| `integrator_push_outbox` `error` | critical | да | да |
| `integrator_push_outbox` `degraded` | нет | да | да |
| backup tier `lastStatus === failure` | critical | да | да |
| cron job `stale` / `error` | нет | нет | да |
| `videoTranscode` `error` | critical | да | да |
| `videoTranscode` `degraded` | нет | нет | да |
| открытые `operator_incidents` (probe) | нет* | да | да |
| конфликты аккаунтов (`account_conflicts`) | да (если чекбокс вкл.) | нет | нет |

\* После 3 подряд probe fail → critical по P7.

---

## 4. Ops

| # | Вопрос | Решение |
|---|--------|---------|
| O1 | Cron-артефакты | Обязательные шаблоны в `deploy/host/cron.d/`: `bersoncarebot-operator-health-critical`, `bersoncarebot-operator-health-digest`, `bersoncarebot-system-health-guard`. Установка — в `deploy-prod.sh` или documented manual step в HOST_DEPLOY. |
| O2 | `INTERNAL_JOB_SECRET` | **Обязателен** на prod для всех internal ticks. Gate в deploy README: без секрета ticks не работают. |
| O3 | Интервалы cron | critical `*/5 * * * *`; guard `*/15 * * * *`; digest — `0 8,20 * * *` с `CRON_TZ` = значение `app_display_timezone` на хосте (оператор синхронизирует с Settings). |

---

## 5. Документация и фазы

| Документ | Статус после решений |
|----------|----------------------|
| [`MASTER_PLAN.md`](MASTER_PLAN.md) | Видение; §3.3 email и §7 DoD recovery — **пересмотрено** Wave 2 |
| [`MVP_IMPLEMENTATION_PLAN.md`](MVP_IMPLEMENTATION_PLAN.md) | **Закрыт** (baseline кода) |
| [`PHASE_E`](PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md) | **Superseded** → recovery в сводке |
| [`PHASE_D`](PHASE_D_EVENT_HOOKS.md) | D.3/D.4 — волна 3; политика critical/digest — §3 |
| [`PHASE_B`](PHASE_B_SYNTHETIC_PROBES_CRON.md) | B — волна 4; fail policy P7 |
| [`PHASE_C`](PHASE_C_INBOUND_WEBHOOK_LAST_STATUS.md) | C — волна 4; fail policy P8 |
| [`PHASE_F`](PHASE_F_UI_AND_ADMIN_API.md) | F блок интеграций — волна 4; bulk reset — **done** |

Перед волной 0 агент читает: `.cursor/rules/plan-authoring-execution-standard.mdc`, `000-critical-integration-config-in-db.mdc`, `clean-architecture-module-isolation.mdc`, `system-settings-integrator-mirror.mdc`, `test-execution-policy.md` (step/phase между волнами; полный `pnpm run ci` — только финал Wave 2 или перед push).
