# Scope decisions — Wave 2 (канон доставки)

**Дата:** 2026-06-09 (обновление по продукту).  
**Статус:** **Closed** (2026-06-09) — канон доставки Wave 2; MASTER/фазы — справочник.  
**Заменяет** для доставки уведомлений: [`PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md`](PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md) (отдельный push «восстановлено» — **отменён**).  
**Roadmap:** [`ROADMAP_WAVE2.md`](ROADMAP_WAVE2.md) · **план (архив):** [`.cursor/plans/archive/operator_health_alerting_wave2.plan.md`](../../.cursor/plans/archive/operator_health_alerting_wave2.plan.md).

---

## 1. Продукт

| # | Вопрос | Решение |
|---|--------|---------|
| P1 | Wave 2 vs PHASE E | **Wave 2 — канон.** Recovery только строкой в сводке; отдельный TG/email «восстановлено» не делаем. |
| P2 | Суточная сводка | **1 раз в сутки** в время из админки: поле **`digestTime`** (`HH:mm`), дефолт **`09:00`**, TZ **`app_display_timezone`**. Каждый день: либо `⚠️` + пункты за окно с прошлой сводки, либо `✅ Всё в порядке`. Без opt-out «тихих OK» в v1. |
| P3 | Критичный список (immediate) | См. матрицу §3. Включает **очередь синка в integrator** (`integrator_push_outbox` **error**; **degraded** — в сводку). `projection`: critical только `unreachable` \| `error` или `deadCount > 0`. Retries без dead — **не** critical. Отдельного чекбокса для outbox в UI **нет** — входит в блок **«Критичные сбои»**. |
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
| A3 | UI настроек | Блок **«Уведомления админу»**: три подблока — **Критичные сбои**, **Суточная сводка**, **Конфликты аккаунтов**. У каждого: вкл/выкл + **свои** переключатели TG / Max / Push. У сводки — одно поле времени (`digestTime`, default `09:00`). Без пяти identity-строк. |
| A4 | Dedup critical | Таблица **`operator_health_alert_sent`** (`dedup_key`, `severity`, `sent_at`) или эквивалент в Drizzle; повторный tick с тем же ключом — no-op 24 ч или до `resolved`/нормализации (зафиксировать в миграции). |
| A5 | Окно сводки | С **момента прошлой успешной сводки** до текущего запуска (первый запуск — последние 24 ч). Время срабатывания = `digestTime` в TZ `app_display_timezone`. Dedup: `digest:{YYYY-MM-DD}` — не более одной сводки в календарные сутки. |
| A6 | Critical tick нагрузка | **Облегчённый** `collectCriticalHealthSignals()` (порты read-only, без media preview / engagement). Полный `collectAdminSystemHealthData` — только digest tick и UI. |
| A7 | Health UI vs push | Красное/жёлтое в «Здоровье системы» — для кабинета; push — по §3. Пример: due backlog — в UI и в **дневной** сводке, без ночного critical-push. |

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
| O3 | Интервалы cron | critical `*/5 * * * *`; guard `*/15 * * * *` (входит в critical-контур); digest tick **`0 * * * *`** (ежечасно в :00) — отправка **только** когда локальное время (TZ из конфига) совпало с `digestTime` и dedup за день ещё не был. |

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
