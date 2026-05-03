# PHASE B — Синтетические пробы (cron / scheduler)

Канон: [`MASTER_PLAN.md`](MASTER_PLAN.md) §3.4–3.7, §4–5 фаза B, `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (после решения — зафиксировать факты).

## 1. Цель этапа

Реализовать **периодические read-only (или безопасные) пробы** исходящих интеграций с записью результата в слой инцидентов (фаза A): успех → при необходимости `resolve` + recovery; провал → `openOrTouch` с `direction=outbound`.

Частота: **1×/час или 1–2×/сутки** — из `system_settings`, не хардкод в коде.

## 2. Зависимости

- **Фаза A** завершена (таблица + сервис `reportFailure` / `reportSuccessForProbe`).

## 3. In scope / out of scope

### In scope

- Модуль `operatorHealthProbes` (или эквивалент) в **integrator** (предпочтительно: все внешние вызовы уже рядом с клиентами) **или** отдельный скрипт + systemd timer — **выбор зафиксировать в LOG**.
- Пробы:
  - **Telegram:** `getMe` через grammy `api.getMe()` (обёртка с таймаутом).
  - **MAX:** `getMaxBotInfo` из `max/client.ts`.
  - **Google Calendar:** refresh token + минимальный GET (metadata календаря или `events.list` `maxResults=1`).
  - **Rubitime:** `fetchRubitimeSchedule` / `postRubitimeApi2` с эталонным триплетом из **настроек**; успех = HTTP + envelope `status: ok` + парсинг структуры `data` **без** требования наличия свободных слотов.
  - **SMSC:** виртуальная отправка и/или `cost=1` — отдельная функция рядом с `createSmscClient`, не ломать production `sendSms`.
  - **SMTP (опционально):** `verify()` если mailer доступен из integrator; иначе defer или probe только из webapp cron — согласовать.

### Out of scope

- Проверка входящих вебхуков (фаза C).
- Изменение throttle Rubitime (не снижать интервал ниже существующего глобального).

## 4. Разрешённые области правок

| Разрешено | Пути |
|-----------|------|
| Integrator | `apps/integrator/src/integrations/**`, `apps/integrator/src/infra/**`, worker entry если цикл там |
| Конфиг | `system_settings` keys, `runtimeConfig` читатели в integrator |
| Webapp | только если cron живёт в webapp (нежелательно по нагрузке) — согласовать в LOG |
| Доки | `docs/ARCHITECTURE/`, `LOG.md` |

**Вне scope:** правки Rubitime бизнес-логики вебхука кроме вызова throttle-aware probe.

## 5. Декомпозиция шагов

### Шаг B.1 — Выбор механизма расписания

**Действия:**

1. Вариант A: **systemd timer** на хосте вызывает `node scripts/operator-health-probe.mjs` с `INTERNAL_JOB_SECRET` или signed call к integrator.
2. Вариант B: **встроенный интервал** в integrator worker loop (осторожно: не блокировать projection consumer).
3. Зафиксировать в `LOG.md` + не-секретные пути в SERVER CONVENTIONS при подтверждении на проде.

**Checklist:**

- [ ] Нет запуска пробы чаще, чем раз в N минут без настройки.

**Критерий закрытия:** один выбранный вариант описан операторски.

---

### Шаг B.2 — Реестр проб и общий раннер

**Действия:**

1. Интерфейс `ProbeResult { name, ok, errorClass?, detail?, durationMs }`.
2. Раннер: `Promise.allSettled`, сбор результатов, логирование `probe` structured log.
3. На fail — вызов фазы A `reportFailure` с `direction=outbound`.
4. На success после предыдущего fail — `reportSuccessForProbe` / `resolve`.

**Checklist:**

- [ ] Таймауты на каждый внешний fetch (`AbortSignal.timeout`).
- [ ] Rubitime probe проходит `withRubitimeApiThrottle`.

**Критерий закрытия:** локальный dry-run в dev (без прод ключей — graceful skip с `not_configured`).

---

### Шаг B.3 — Конфигурация эталонов в `system_settings`

**Действия:**

1. Ключи: например `operator_health_rubitime_probe` JSON `{ branchId, cooperatorId, serviceId }`, `operator_health_smsc_virtual_phones`, `operator_health_probe_cron_mode`, интервал.
2. Добавить в `ALLOWED_KEYS`, парсер, опционально секция admin UI «Операторский мониторинг».

**Checklist:**

- [ ] `updateSetting` path — зеркало integrator.
- [ ] `rg ALLOWED_KEYS` — ключи уникальны.

**Критерий закрытия:** без дефолтных секретов в репо; пустой конфиг = skip probe с reason `not_configured`.

---

### Шаг B.4 — Тесты

**Действия:**

1. Nock-тесты на каждый клиентский путь (как `client.nock.test.ts`).
2. Тест раннера: один failing probe → один вызов `reportFailure`.

**Checklist:**

- [ ] `pnpm test` в затронутом пакете зелёный.

**Критерий закрытия:** регрессии ловятся CI на уровне пакета.

## 6. Definition of Done (фаза B)

- По расписанию выполняется полный набор настроенных проб; отключённые интеграции пропускаются явно.
- Rubitime: успех при пустом расписании, если envelope ok.
- Ошибки открывают инциденты с разными `error_class` для разных причин.
- Документирован выбор scheduler + несекретные пути/имена unit (когда известны).

## 7. Ссылки

- [`MASTER_PLAN.md`](MASTER_PLAN.md)
- [`PHASE_A_DATA_MODEL_AND_CORE_ALERTING.md`](PHASE_A_DATA_MODEL_AND_CORE_ALERTING.md)
- [`PHASE_C_INBOUND_WEBHOOK_LAST_STATUS.md`](PHASE_C_INBOUND_WEBHOOK_LAST_STATUS.md)
