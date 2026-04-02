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
| `--rubitime-offset-minutes=N` | из env/appTimezone | Офсет наивных дат Rubitime |
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
