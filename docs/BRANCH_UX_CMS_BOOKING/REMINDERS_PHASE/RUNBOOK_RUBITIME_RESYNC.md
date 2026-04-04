# Runbook: Rubitime quiet re-sync + outbox repair

**Область применения:** integrator host (`/opt/projects/bersoncarebot`).  
**Deploy user:** `deploy` (ограниченный sudo, см. SERVER CONVENTIONS.md).  
**Env file (integrator):** `/opt/env/bersoncarebot/api.prod`.

---

## Контекст

Системные расхождения `integrator.rubitime_records` vs Rubitime API:
- `record_at` diff (-120 / -60 мин) — наивные даты Rubitime без таймзоны интерпретировались некорректно.
- `stale updated_at` — локальные записи отставали от API на часы/дни.
- `projection_outbox` мёртвые события `appointment.record.upserted` с `platform_user_id null` — webapp не мог резолвить пользователя из booking-события.

**Скрипт:** `apps/integrator/src/infra/scripts/resync-rubitime-records.ts`  
**Собранный JS:** `apps/integrator/dist/infra/scripts/resync-rubitime-records.js`

---

## Подготовка на хосте

### 1. Собрать integrator на prod-хосте

```bash
cd /opt/projects/bersoncarebot
git pull
pnpm install --frozen-lockfile
pnpm --dir apps/integrator run build
```

Убедиться, что артефакт создан:

```bash
ls -la apps/integrator/dist/infra/scripts/resync-rubitime-records.js
```

### 2. Проверить env

```bash
grep -E 'DATABASE_URL|RUBITIME_API_KEY' /opt/env/bersoncarebot/api.prod | grep -c '='
# ожидать: 2
```

---

## Модуль 1: quiet re-sync rubitime_records

### Шаг 1.1 — Dry-run (безопасно, только отчёт)

```bash
cd /opt/projects/bersoncarebot/apps/integrator
env $(cat /opt/env/bersoncarebot/api.prod | xargs) \
  node dist/infra/scripts/resync-rubitime-records.js \
  --active-days=20 \
  --canceled-days=20 \
  --report-file=/tmp/resync-dryrun.json
```

Просмотр итогов:

```bash
cat /tmp/resync-dryrun.json | python3 -m json.tool | grep -A 20 '"summary"'
```

Ожидаемые поля в отчёте:
- `scanned` — кол-во строк rubitime_records в окне
- `compared` — кол-во запросов к API
- `matches` — совпадений
- `mismatches` — расхождений (без коммита — 0 обновлений)
- `classCounts` — разбивка по классам: `record_at`, `status`, `phone`, `payload`, `stale`
- `apiErrors` — ошибки API (должно быть 0)
- `notFoundActive` — активных записей, которых нет в API (цель: 0)

### Шаг 1.2 — Commit (применить исправления)

> **Важно:** перед commit убедиться, что dry-run показал понятные расхождения.
> Скрипт НЕ вызывает enqueueProjectionEvent и не отправляет уведомлений.

```bash
cd /opt/projects/bersoncarebot/apps/integrator
env $(cat /opt/env/bersoncarebot/api.prod | xargs) \
  node dist/infra/scripts/resync-rubitime-records.js \
  --active-days=20 \
  --canceled-days=20 \
  --commit \
  --report-file=/tmp/resync-commit.json
```

Проверить результат:

```bash
cat /tmp/resync-commit.json | python3 -m json.tool | grep -E '"updated"|"mismatches"|"matches"'
```

### Шаг 1.3 — Контрольный compare-run (после commit)

```bash
cd /opt/projects/bersoncarebot/apps/integrator
env $(cat /opt/env/bersoncarebot/api.prod | xargs) \
  node dist/infra/scripts/compare-rubitime-records.js \
  --active-days=20 \
  --canceled-days=20 \
  --report-file=/tmp/compare-postfix.json

cat /tmp/compare-postfix.json | python3 -m json.tool | grep -E '"mismatches"|"matches"|"apiErrors"|"notFoundActive"'
```

Целевое состояние после re-sync:
- `apiErrors == 0`
- `notFoundActive == 0`
- `mismatches` существенно снижены (остаточные — объяснимы: записи обновлённые уже после resync)

---

## Модуль 2: repair-outbox-bookings

### Шаг 2.1 — Показать кандидатов (dry-run)

```bash
cd /opt/projects/bersoncarebot/apps/integrator
env $(cat /opt/env/bersoncarebot/api.prod | xargs) \
  node dist/infra/scripts/resync-rubitime-records.js \
  --mode=repair-outbox \
  --report-file=/tmp/repair-dryrun.json

cat /tmp/repair-dryrun.json | python3 -m json.tool
```

Просмотреть `summary.samples` — список событий с `platform_user_id null`.

Фильтрация по конкретному телефону (последние 10 цифр):

```bash
env $(cat /opt/env/bersoncarebot/api.prod | xargs) \
  node dist/infra/scripts/resync-rubitime-records.js \
  --mode=repair-outbox \
  --phone-last10=9001234567
```

Фильтрация по конкретным record id:

```bash
env $(cat /opt/env/bersoncarebot/api.prod | xargs) \
  node dist/infra/scripts/resync-rubitime-records.js \
  --mode=repair-outbox \
  --record-ids=123,456
```

### Шаг 2.2 — Requeue (commit)

```bash
cd /opt/projects/bersoncarebot/apps/integrator
env $(cat /opt/env/bersoncarebot/api.prod | xargs) \
  node dist/infra/scripts/resync-rubitime-records.js \
  --mode=repair-outbox \
  --commit \
  --report-file=/tmp/repair-commit.json

cat /tmp/repair-commit.json | python3 -m json.tool | grep -E '"found"|"requeued"'
```

После requeue outbox worker автоматически подберёт события при следующем цикле.

### Шаг 2.3 — Requeue `dead` в `projection_outbox` (после исправления linking / схемы)

**Скрипт:** `apps/webapp/scripts/requeue-projection-outbox-dead.ts`  
**Условие:** общая БД (`DATABASE_URL`), таблица `projection_outbox` на стороне integrator.

**Dry-run** (только отчёт, без изменений):

```bash
cd /opt/projects/bersoncarebot
source /opt/env/bersoncarebot/api.prod   # или webapp env с DATABASE_URL
pnpm --dir apps/webapp exec tsx scripts/requeue-projection-outbox-dead.ts
```

**Commit** (сбросить подходящие `dead` в `pending`, обнулить `attempts_done`):

```bash
pnpm --dir apps/webapp exec tsx scripts/requeue-projection-outbox-dead.ts --commit
```

Фильтры (опционально): `--event-type=appointment.record.upserted`, `--error-contains=platform_user_id` (по умолчанию фильтр по подстроке в `last_error`).

**Контроль до/после:**

```sql
SELECT status, count(*) FROM projection_outbox
WHERE event_type = 'appointment.record.upserted' GROUP BY status;
```

---

## Модуль 3: точечная починка отдельных проблемных записей

Использовать, когда по итогам `compare-rubitime-records` осталось 1-2 записи в:
- `notFoundActive` (критично, нужно довести до 0);
- `mismatches` (например, только `record_at mismatch`).

### Шаг 3.1 — извлечь проблемные `recordId` из compare-отчёта

```bash
jq -r '.summary.samples.notFound[] | select(.localStatus=="created" or .localStatus=="updated") | .recordId' \
  /root/rubitime-compare-report-20d.json
```

### Шаг 3.2 — проверить точечный `repair-outbox` по этим ID

```bash
cd /opt/projects/bersoncarebot && \
ENV_FILE="/opt/env/bersoncarebot/api.prod" \
pnpm --dir apps/integrator run rubitime:resync -- \
  --mode=repair-outbox \
  --record-ids=8059457 \
  --report-file="/root/repair-outbox-8059457-dryrun.json"
```

Если `found=0`, значит для этого `recordId` нет outbox-событий, требующих requeue.

### Шаг 3.3 — ручная деградация `notFoundActive` в `canceled` (точечно)

```bash
source /opt/env/bersoncarebot/api.prod && \
psql "$DATABASE_URL" <<'SQL'
WITH bad(record_id) AS (VALUES ('8059457'))
UPDATE rubitime_records r
SET status = 'canceled',
    last_event = 'manual_not_found_cleanup',
    updated_at = now(),
    payload_json = COALESCE(r.payload_json, '{}'::jsonb)
      || jsonb_build_object(
           '_manual_cleanup',
           jsonb_build_object(
             'reason', 'record_not_found_in_rubitime',
             'at', now()::text
           )
         )
FROM bad
WHERE r.rubitime_record_id = bad.record_id
  AND r.status IN ('created','updated');
SQL
```

### Шаг 3.4 — точечная правка `record_at mismatch` (если остался единичный drift)

```bash
source /opt/env/bersoncarebot/api.prod && \
psql "$DATABASE_URL" <<'SQL'
UPDATE rubitime_records
SET record_at = '2026-04-03T14:00:00.000Z'::timestamptz,
    last_event = 'manual_record_at_fix',
    updated_at = now(),
    payload_json = COALESCE(payload_json, '{}'::jsonb)
      || jsonb_build_object(
           '_manual_cleanup',
           jsonb_build_object(
             'reason', 'record_at_mismatch_minus_60',
             'at', now()::text
           )
         )
WHERE rubitime_record_id = '8062187'
  AND status IN ('created','updated','canceled');
SQL
```

### Шаг 3.5 — контрольный compare

```bash
cd /opt/projects/bersoncarebot && \
ENV_FILE="/opt/env/bersoncarebot/api.prod" \
pnpm --dir apps/integrator run rubitime:compare-records -- \
  --active-days=20 \
  --canceled-days=20 \
  --limit=120 \
  --batch-size=20 \
  --min-interval-ms=5600 \
  --retry-count=2 \
  --retry-base-ms=6000 \
  --display-timezone=Europe/Moscow \
  --stale-threshold-minutes=120 \
  --sample-size=200 \
  --report-file="/root/rubitime-compare-report-20d-final.json"
```

Ожидаемое состояние после точечной починки:
- `mismatches=0`
- `notFoundActive=0`
- `apiErrors=0`
- `notFoundCanceled` может быть `>0` (допустимо для реально отсутствующих в Rubitime отменённых записей).

---

## SQL-контроль до/после

### До: посмотреть состояние outbox

```sql
-- Статистика по dead/pending appointment.record.upserted с platform_user_id
SELECT status, COUNT(*) AS cnt
FROM projection_outbox
WHERE event_type = 'appointment.record.upserted'
  AND status IN ('dead','pending')
  AND last_error ILIKE '%platform_user_id%'
GROUP BY status;
```

```sql
-- Sample dead событий
SELECT id, status, attempts_done, last_error, created_at, payload->>'phoneNormalized' AS phone
FROM projection_outbox
WHERE event_type = 'appointment.record.upserted'
  AND status = 'dead'
  AND last_error ILIKE '%platform_user_id%'
ORDER BY id DESC
LIMIT 10;
```

### До: посмотреть расхождения record_at

```sql
-- Сколько записей с отличающимся record_at в окне 20 дней
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE record_at IS NULL) AS no_record_at,
  MIN(record_at) AS min_record_at,
  MAX(record_at) AS max_record_at
FROM rubitime_records
WHERE status IN ('created','updated')
  AND COALESCE(updated_at, record_at, created_at) >= now() - interval '20 days';
```

### После: проверить patient_bookings

```sql
-- Убедиться, что новые записи связаны с user
SELECT
  pb.id,
  pb.platform_user_id,
  pb.rubitime_id,
  pb.slot_start,
  pb.status,
  pb.created_at
FROM patient_bookings pb
WHERE pb.created_at >= now() - interval '24 hours'
ORDER BY pb.created_at DESC
LIMIT 20;
```

### После: outbox состояние

```sql
SELECT status, COUNT(*) FROM projection_outbox
WHERE event_type = 'appointment.record.upserted'
GROUP BY status;
```

Цель: `dead` с `platform_user_id` — 0 (или ноль в колонке `pending` для этих записей после requeue + успешной обработки).

---

## Параметры скрипта (справка)

| Параметр | Дефолт | Описание |
|----------|--------|----------|
| `--mode=resync` | resync | Режим: `resync` или `repair-outbox` |
| `--commit` | false (dry-run) | Применить изменения в БД |
| `--active-days=N` | 20 | Окно для активных записей |
| `--canceled-days=N` | 20 | Окно для canceled записей |
| `--limit=N` | 0 (без лимита) | Макс. кол-во записей для обработки |
| `--batch-size=N` | 200 | Размер батча при выборке |
| `--min-interval-ms=N` | 5200 | Минимальный интервал между запросами к API |
| `--retry-count=N` | 2 | Кол-во повторов при rate-limit |
| `--stale-threshold-minutes=N` | 120 | Порог stale updated_at (мин) |
| `--display-timezone=IANA` | из `system_settings.app_display_timezone` | IANA-зона для наивных дат Rubitime (`normalizeToUtcInstant`) |
| `--sample-size=N` | 25 | Кол-во sample-записей в отчёте |
| `--report-file=PATH` | stdout | Файл для JSON-отчёта |
| `--phone-last10=XXXXXXXXXX` | - | Фильтр repair-outbox по телефону |
| `--record-ids=a,b,c` | - | Фильтр repair-outbox по rubitime record ids |

---

## Что проверять после всех операций

- `compare-run`: `apiErrors=0`, `notFoundActive=0`, `mismatches` тренд вниз.
- `projection_outbox`: нет новых `dead` с `platform_user_id null`.
- `patient_bookings`: новые Rubitime записи появляются с `platform_user_id` (запись видна в `/api/booking/my`).
- В боте: запись, пришедшая через webhook, видна в webapp без ручных SQL-правок.

---

## Важно

- Скрипт НЕ вызывает `enqueueProjectionEvent` и НЕ отправляет никаких уведомлений пациентам или админу.
- При dry-run (без `--commit`) данные не меняются.
- При commit обновляются ТОЛЬКО строки с фактическими расхождениями.
- Для repair-outbox: после requeue события подберёт projection worker при следующем цикле (~1-5 минут). Проверить повторно SQL-контролем.
