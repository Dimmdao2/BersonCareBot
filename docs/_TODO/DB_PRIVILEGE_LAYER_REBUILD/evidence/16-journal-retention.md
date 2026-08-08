# 16 — Журналы: чистка истории и проект регулярной очистки

Дата: 2026-08-08. Базы в работе: `bersoncarebot_test`, `bcb_webapp_dev`. **`bcb_webapp_prod` и чужие базы
(`secondbrain`, `storylama_*`, `trackd_login_audit_*`) не тронуты ни одной командой.**

Задача владельца: «почистить историю в разросшихся журналах и спроектировать их регулярную очистку».

Правило работы: FREEZE-then-delete — сначала `pg_dump` таблицы, потом удаление ТОЛЬКО строк, просроченность
которых доказана собственной колонкой таблицы; батчами; затем обычный `VACUUM (ANALYZE)` (без `VACUUM FULL`).
DDL, деплоя и правок кода в этой работе нет.

---

## Замер до

Размер баз (`SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database`):

```
bersoncarebot_test|1861 MB
bcb_webapp_dev|1064 MB
bcb_webapp_prod|243 MB        <- НЕ ТРОГАЛИ
```

Топ таблиц `bersoncarebot_test` (`pg_total_relation_size` desc, LIMIT 25 — приведены строки > 1 МБ):

```
app.context_nonce_ledger|1341 MB|7538213
public.idempotency_keys|314 MB|1251959
integrator.idempotency_keys|84 MB|221476
public.support_delivery_events|17 MB|6101
public.notification_delivery_attempts|11 MB|12229
public.product_analytics_events_recent|8736 kB|14138
integrator.delivery_attempt_logs|8496 kB|6223
public.outgoing_delivery_queue|5072 kB|623
integrator.projection_outbox|3104 kB|3768
integrator.user_reminder_occurrences|2880 kB|3394
public.product_push_notifications|2440 kB|2556
public.reminder_occurrence_history|2376 kB|2592
public.reminder_delivery_events|2024 kB|1735
public.product_analytics_user_hourly|2008 kB|4353
public.support_conversation_messages|1856 kB|823
public.app_runtime_settings_audit|1808 kB|5473
integrator.user_reminder_delivery_logs|1464 kB|1735
public.appointment_records|1440 kB|410
public.program_action_log|1288 kB|1783
public.product_analytics_hourly|1272 kB|5401
```

Топ таблиц `bcb_webapp_dev`:

```
app.context_nonce_ledger|639 MB|4381533
public.idempotency_keys|314 MB|1251994
integrator.idempotency_keys|24 MB|73790
public.support_delivery_events|9280 kB|6121
integrator.delivery_attempt_logs|8384 kB|6247
public.notification_delivery_attempts|5728 kB|12403
public.outgoing_delivery_queue|5144 kB|2666
public.product_analytics_events_recent|4496 kB|12865
integrator.projection_outbox|3080 kB|3768
integrator.user_reminder_occurrences|2800 kB|2601
public.reminder_occurrence_history|2232 kB|2467
```

**Только три таблицы во всём кластере переваливают 100 МБ или 500 тыс. строк** — `app.context_nonce_ledger`,
`public.idempotency_keys`, `integrator.idempotency_keys`. Четвёртой по размеру идёт `support_delivery_events`
на 17 МБ — на два порядка меньше. Разрослись именно те, у кого нет прунера.

Точный счёт строк и доля просроченных на момент старта:

```
-- SELECT count(*), count(*) FILTER (WHERE expires_epoch < extract(epoch from now())), min/max(accepted_at)
bersoncarebot_test  app.context_nonce_ledger  всего 8228863  просрочено 8228863  (100.0%)
                    accepted_at: 2026-07-25 15:44:55 .. 2026-08-07 20:11:21
bcb_webapp_dev      app.context_nonce_ledger  всего 4401267  просрочено 4401267  (100.0%)
                    accepted_at: 2026-07-25 15:44:55 .. 2026-08-07 12:25:41

-- SELECT count(*), count(*) FILTER (WHERE expires_at < now()), min/max(expires_at)
bersoncarebot_test  public.idempotency_keys       всего 1252027  просрочено 1252027 (100.0%)
                    expires_at: 2026-03-18 02:45:16 .. 2026-08-03 19:06:11
bersoncarebot_test  integrator.idempotency_keys   всего  232563  просрочено  232383 (99.92%)
                    expires_at: 2026-03-09 07:34:39 .. 2026-08-08 22:33:38
bcb_webapp_dev      public.idempotency_keys       всего 1251994  просрочено 1251994 (100.0%)
bcb_webapp_dev      integrator.idempotency_keys   всего   73790  просрочено   73790 (100.0%)
```

Скорость роста реестра nonce: 8.23 млн строк за 13 суток на TEST ≈ **630 тыс. строк/сутки ≈ 7 строк/сек** —
это темп установки принципала на соединениях, то есть роста никто не остановит, кроме прунера.

### Доказательство, что просроченный nonce уже ничего не защищает

`app.install_signed_context` (`deploy/postgres/p2-b-protected-principal-context.sql:204-210`) отвергает
просроченную подпись **до** обращения к реестру:

```sql
v_now_epoch := floor(extract(epoch FROM clock_timestamp()))::bigint;
IF p_expires_epoch <= v_now_epoch THEN
  RAISE EXCEPTION 'expired_context';
END IF;
IF p_expires_epoch > v_now_epoch + 300 THEN
  RAISE EXCEPTION 'context_ttl_too_long';
END IF;
```

Вставка в реестр — ниже, на строке 238. Значит строка с прошедшим `expires_epoch` не может быть предъявлена
повторно ни при каких условиях: повтор ловится проверкой срока, а не уникальностью nonce. Верхняя граница
окна, которое реестр обязан покрывать, зашита тут же — **300 секунд** (`context_ttl_too_long`); фактический
TTL подписи — **30 секунд** (`packages/db-principal/src/index.ts:1109`, `signer.ttlMs ?? 30_000`).

### Доказательство, что просроченный ключ идемпотентности не читается

Чтение гейтится сроком: `WHERE key = $1 AND expires_at > now()`
(`apps/webapp/src/infra/idempotency/pgStore.ts:37`). Запись — `TTL_SEC = 24 * 60 * 60`
(`pgStore.ts:8`). На стороне интегратора — то же: `WHERE target.expires_at < now()` в `ON CONFLICT DO UPDATE`
(`apps/integrator/src/infra/db/repos/idempotencyKeys.ts:53`), TTL вызывающих — 24 часа
(`requestContactRoute.ts`, `operatorAlertRelayRoute.ts`: `24 * 60 * 60 * 1000`).

---

## Что удалено (с путями дампов)

**Каталог дампов: `/tmp/journal-cleanup-2026-08-08/`** (контрольные суммы — в `SHA256SUMS` там же).
Формат `-Fc` (custom, сжатый), восстановление — `pg_restore -d <db> -t <table> <файл>`.

| Дамп | Что внутри | Байт | sha256 (начало) |
|---|---|---:|---|
| `/tmp/journal-cleanup-2026-08-08/test__app.context_nonce_ledger.dump` | `bersoncarebot_test` → `app.context_nonce_ledger` | 237 543 603 | `249e5c22f117…` |
| `/tmp/journal-cleanup-2026-08-08/dev__app.context_nonce_ledger.dump` | `bcb_webapp_dev` → `app.context_nonce_ledger` | 127 018 424 | `ce1a0003e405…` |
| `/tmp/journal-cleanup-2026-08-08/test__idempotency_keys.dump` | `bersoncarebot_test` → `public.idempotency_keys` + `integrator.idempotency_keys` | 47 589 548 | `db07c8a41f11…` |
| `/tmp/journal-cleanup-2026-08-08/dev__idempotency_keys.dump` | `bcb_webapp_dev` → обе `idempotency_keys` | 42 593 667 | `e212a5d352f4…` |

Целостность каждого дампа проверена `pg_restore -l` до первого DELETE (TOC читается, `TABLE DATA` на месте:
1 запись в дампах реестра, 2 — в дампах ключей). Итого 434 МБ дампов.

Удаление — батчами по 200 000 строк, каждый батч отдельной транзакцией
(`/tmp/journal-cleanup-2026-08-08/prune.sh`):

```sql
WITH victims AS (SELECT <key> FROM <table> WHERE <predicate> LIMIT 200000)
DELETE FROM <table> t USING victims v WHERE t.<key> = v.<key>;
```

| База | Таблица | Предикат просроченности | Удалено строк | Батчей | Время |
|---|---|---|---:|---:|---:|
| `bersoncarebot_test` | `app.context_nonce_ledger` | `expires_epoch < extract(epoch from now())::bigint` | **8 228 863** | 42 | 78 c |
| `bcb_webapp_dev` | `app.context_nonce_ledger` | то же | **4 401 267** | 23 | 27 c |
| `bersoncarebot_test` | `public.idempotency_keys` | `expires_at < now()` | **1 252 027** | 7 | 5 c |
| `bcb_webapp_dev` | `public.idempotency_keys` | `expires_at < now()` | **1 251 994** | 7 | 5 c |
| `bersoncarebot_test` | `integrator.idempotency_keys` | `expires_at < now()` | **232 407** | 2 | 1 c |
| `bcb_webapp_dev` | `integrator.idempotency_keys` | `expires_at < now()` | **73 790** | 1 | 1 c |
| | | **ИТОГО** | **15 440 348** | | |

Ни одной строки без доказанного собственной колонкой истечения срока не удалено. Ни одна таблица без
колонки срока не тронута (список — в «Правилах хранения», колонка «сделано сейчас» = нет).

Затем — обычный `VACUUM (ANALYZE)` по каждой из шести таблиц (без `VACUUM FULL`, без эксклюзивных блокировок).
Куча реестра усохла до нуля страниц:

```
INFO:  table "context_nonce_ledger": truncated 94286 to 0 pages
INFO:  index "context_nonce_ledger_pkey": pages: 77286 in total, 77281 newly deleted,
       77281 currently deleted, 21653 reusable
```

---

## Замер после

Размер баз:

```
bersoncarebot_test|952 MB     (было 1861 MB, −909 MB)
bcb_webapp_dev|487 MB         (было 1064 MB, −577 MB)
```

**Освобождено суммарно 1486 МБ (≈ 1.45 ГБ) внутри баз.**

На файловой системе `df -h /` показывает те же `67G avail` до и после — и это ожидаемо, а не ошибка замера:
из 1486 МБ логически освобождённого места ~1230 МБ остались занятыми индексными файлами (Postgres не
возвращает их ОС без `REINDEX`/`VACUUM FULL` — см. «Требует окна обслуживания»), а ещё 434 МБ занял каталог
дампов. На диск место вернётся после окна обслуживания и удаления дампов.

Таблицы (`total` / `heap` / `indexes` / `reltuples`):

```
=== bersoncarebot_test ===
app.context_nonce_ledger|604 MB|24 kB|604 MB|0
public.idempotency_keys|142 MB|24 kB|142 MB|0
integrator.idempotency_keys|84 MB|40 MB|44 MB|214

=== bcb_webapp_dev ===
app.context_nonce_ledger|247 MB|24 kB|247 MB|0
public.idempotency_keys|142 MB|24 kB|142 MB|0
integrator.idempotency_keys|11 MB|24 kB|11 MB|0
```

Счёт живых строк после чистки:

```
bersoncarebot_test  app.context_nonce_ledger      0 (просрочено 0)
bersoncarebot_test  public.idempotency_keys       0 (просрочено 0)
bersoncarebot_test  integrator.idempotency_keys 233 (просрочено 53)   <- TEST живой, пишет заново
bcb_webapp_dev      app.context_nonce_ledger      0
bcb_webapp_dev      public.idempotency_keys       0
bcb_webapp_dev      integrator.idempotency_keys   0
```

53 уже просроченных строки на TEST через минуты после чистки — ровно та причина, по которой разовая чистка
задачу не закрывает и нужен раздел ниже.

Топ таблиц после (TEST): после трёх вычищенных первой «живой» идёт `public.support_delivery_events` 17 МБ.
Ни одной таблицы > 100 МБ по **данным** не осталось — остаток на диске держат индексные файлы (см.
«Требует окна обслуживания»).

---

## Правила хранения — проект

### Механизм: берём существующий, ничего не изобретаем

В репозитории уже есть работающий конвейер периодических задач, и retention в нём уже живёт:

1. **host cron** — шаблоны `deploy/host/cron.d/*.cron.template`, строка вида
   `*/5 * * * * root bash -lc '… curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_JOB_SECRET" "http://127.0.0.1:6200/api/internal/<job>/tick"'`.
2. **internal-маршрут** `apps/webapp/src/app/api/internal/**/route.ts` — сверка Bearer с `INTERNAL_JOB_SECRET`
   через `timingSafeEqual`, затем `enterWithDbInfraPrincipal({ source: '…' })`.
3. **источник в allowlist** `packages/db-principal/src/webappLockedInfraCronSources.ts` — в locked-режиме
   такой источник получает `RESET ROLE; SET ROLE app_staff` без арендного контекста
   (`packages/db-principal/src/index.ts:1032-1037`).
4. **реестр наблюдаемости** `apps/webapp/src/modules/operator-health/cronJobRegistry.ts` — `jobKey`,
   `scheduleHint`, `staleAfterSec`; тик отмечается `recordOperatorCronJobTickBestEffort`, «Здоровье системы»
   краснеет, если задача перестала отрабатывать.
5. **готовый образец retention** — `/api/internal/product-analytics/retention` +
   `apps/webapp/src/modules/product-analytics/productAnalyticsRetention.ts` (окна 90/180/730/730 суток,
   `dryRun=1`, окна переопределяются query-параметром). Такие же —
   `/api/internal/media-playback-stats/retention`, `/api/internal/media-hls-proxy-errors/retention`.

**Предложение: один новый job `db_journal_retention`** — маршрут `/api/internal/db-journal-retention/tick`,
модуль `apps/webapp/src/modules/db-retention/journalRetention.ts` с константами окон, строка в `cron.d`
(еженедельно для журналов, **ежечасно** для реестра nonce и ключей идемпотентности — они растут быстро),
запись в `CRON_JOB_REGISTRY` (`jobFamily: OPERATOR_MAINTENANCE_JOB_FAMILY`, `staleAfterSec` = 2× периода),
источник в `WEBAPP_LOCKED_INFRA_CRON_SOURCES`. Один job на все журналы, а не по job на таблицу: расписание
одно, отчёт один, наблюдаемость одна. Удаление внутри — теми же батчами по 200k с `LIMIT`, чтобы тик был
ограничен по времени и не держал длинных блокировок.

### Роль прунера и место в SCHEME.md

Прунер — **системная забота, не арендная**: он ходит по всем клиникам сразу и не имеет `organization_id`.
По §A SCHEME.md это роль `kind: 'service', scope: 'NONE'`, а не терминал.

- Для **`public.idempotency_keys` / `integrator.idempotency_keys` и журналов схем `public`/`integrator`**
  новых грантов не нужно: ACL уже даёт `app_staff=arwd` (перепись ниже), а текущий шов
  locked-infra-cron как раз ставит `SET ROLE app_staff`. Это работает сегодня и не создаёт нового ключа.
  **Но это же и дефект**: `app_staff` — терминальная ORG-роль, и она уже имеет DELETE на кросс-арендный
  журнал. Правильный целевой вид — отдельная `app_operational_maintenance`
  (`kind: 'service'`, `scope: 'NONE'`, `login: false`) с `DELETE` ровно на перечисленные таблицы, и шов
  `applySignedDbPrincipal` ставит её вместо `app_staff` для источников retention. Это строка декларации §A
  и грант в генерате §B — не заплатка на миграции.
- Для **`app.context_nonce_ledger` ни один из этих путей не работает.** Перепись ACL:
  `owner=app_owner`, `acl=app_owner=arwdDxt/app_owner` — больше **никого**. Плюс p2-b:356-359 явно
  отзывает всё у `PUBLIC`, `app_staff`, `app_patient`. Единственный корректный вход — **SECURITY DEFINER
  функция, принадлежащая `app_owner`** (ровно тот же приём, что у `app.install_signed_context`):

  ```sql
  -- app.prune_context_nonce_ledger(p_grace_sec int DEFAULT 3600, p_limit int DEFAULT 200000)
  --   RETURNS bigint, SECURITY DEFINER, OWNER app_owner, SET search_path = app, pg_catalog
  --   DELETE ... WHERE expires_epoch < extract(epoch from now())::bigint - p_grace_sec
  --   (по ctid, LIMIT p_limit), RETURN число удалённых
  ```

  и строка в `definerExceptions` §A.7 SCHEME.md:
  `'app.prune_context_nonce_ledger(integer,integer)': { owner: 'app_owner', execute: ['app_operational_maintenance'], searchPath: 'app, pg_catalog', why: 'реестр nonce закрыт от всех ролей (p2-b:356-359); прунер — единственный легальный вход' }`.
  `execute` даём **только** сервисной роли; давать `app_staff` нельзя — это открыло бы DELETE по шву
  принципала любой арендной сессии.

### Таблица окон

| Таблица | Что хранит | Окно хранения | Обоснование окна | Механизм очистки | Роль | Нужна ли стена | Сделано сейчас |
|---|---|---|---|---|---|---|---|
| `app.context_nonce_ledger` | защита от повтора подписи принципала: `nonce` (PK), `backend_pid`, `accepted_at`, `expires_epoch` | **`expires_epoch < now() − 1 час`** | Реестр обязан покрывать только окно, в котором подпись ещё принимается. Оно жёстко ограничено сверху: `p_expires_epoch > v_now_epoch + 300 → context_ttl_too_long` (p2-b:208-210), фактический TTL — 30 с (`db-principal/src/index.ts:1109`). Просроченная подпись отвергается **раньше** обращения к реестру (p2-b:204-207 против вставки на 238), т.е. хранение просроченной строки не предотвращает ничего. Час запаса — на перекос часов и на «посмотреть последний час» при разборе инцидента; 300 с хватило бы формально | новый job `db_journal_retention`, **ежечасно** (при 630 тыс. строк/сутки суточный шаг уже даёт 600 МБ пилу) | `app_operational_maintenance` через SECURITY DEFINER `app.prune_context_nonce_ledger` (owner `app_owner`) | стена не нужна — таблица уже закрыта от всех ролей (ACL = только `app_owner`); классификация 14-part-1 §130: «OK по стенам» | **да**, удалено 12 630 130 строк в двух базах |
| `public.idempotency_keys` | кэш ответов межсервисного API: `key`, `request_hash`, `status`, **`response_body` (jsonb — тела ответов о пациентах и привязках телефонов)**, `expires_at` | **`expires_at < now() − 24 часа`** (полная жизнь строки — 48 ч) | Чтение уже гейтится `expires_at > now()` (`pgStore.ts:37`) — просроченная строка не отдаётся никому и является мёртвым весом. TTL записи — 24 ч (`pgStore.ts:8`). Лишние сутки — окно поддержки «повторился ли вебхук вчера»; дальше держать нельзя: в `response_body` лежат ПДн, и минимизация хранения тут прямое требование, а не вкусовщина | тот же job, **ежечасно**; есть индекс `idx_idempotency_keys_expires_at` — удаление дешёвое | `app_operational_maintenance` (сегодня работает и `app_staff`: ACL `app_staff=arwd`) | **ДА, стена обязательна.** 14-part-2 Н9: RLS off/off, 0 политик, `organization_id` нет вовсе, `app_staff=arwd` — любой staff любой клиники читает тела ответов о чужих пациентах. Прунер этого не лечит | **да**, удалено 2 504 021 строка в двух базах |
| `integrator.idempotency_keys` | то же на стороне интегратора; TTL вызывающих — 24 ч (`requestContactRoute.ts`, `operatorAlertRelayRoute.ts`) | **`expires_at < now() − 24 часа`** | То же основание: `ON CONFLICT … WHERE target.expires_at < now()` (`idempotencyKeys.ts:53`) — просроченная строка перезаписывается, а не читается | тот же job, ежечасно | `app_operational_maintenance` (сегодня ACL: `app_staff=arwd`, `app_operational_scheduler=arwd`) | **ДА.** 14-part-1 §11: RLS off/FORCE off, 0 политик, `response_body` несёт тела ответов в т.ч. по бронированиям | **да**, удалено 306 197 строк |
| `integrator.delivery_attempt_logs` | журнал попыток отправки: `intent_type`, `channel`, `status`, `attempt`, `reason`, **`payload_json` — тело отправленного сообщения** (редактируется только OTP, `dispatchPort.ts:90`) | **90 суток по `occurred_at`** | Вопрос «почему не ушло письмо/СМС» задают в горизонте дней, максимум недель после сбоя, а не кварталов. Против удлинения окна работает содержимое: `payload_json` — текст, отправленный конкретному человеку; чем дольше он лежит, тем дороже утечка. 90 суток закрывают и разбор инцидента, и квартальный отчёт по доставке | тот же job, **еженедельно** (объём мал: 6 324 строки, 8.5 МБ) | `app_operational_maintenance` (ACL сегодня: `app_staff=arwd`, `app_owner=a`) | **ДА, обе стены** (клиника + пациент). 14-part-1 №8: RLS off, 0 политик, содержимое сообщений открыто `app_staff` любой клиники | **нет** — колонки срока нет, предикат «старше N суток» это политика, а не факт таблицы. Диапазон: `occurred_at` 2026-03-04 … 2026-08-05 |
| `integrator.message_retry_jobs` | очередь досылки: **`phone_normalized`, `message_text`**, `next_try_at`, `attempts_done`, `last_error`, `payload_json` | **терминальные (`done`, `dead`) — 30 суток по `created_at`; `pending` — не трогать никогда** | Самая чувствительная таблица набора: телефон и текст сообщения пациента в открытом виде. Отработавшая или сдохшая задача не нужна дольше срока разбора отказа доставки; 30 суток — верх этого срока. `pending` (сейчас 10 строк) — живая работа, удаление = потерянное сообщение человеку | тот же job, еженедельно | `app_operational_maintenance` (ACL: `app_staff=arwd`, `app_operational_delivery_worker=rw`) | **ДА, обе стены.** 14-part-1 №9: RLS off, 0 политик, телефон и текст без стен | **нет** — нет колонки срока. Состав: `done` 67, `dead` 57, `pending` 10; `created_at` 2026-03-05 … 2026-07-31 |
| `integrator.projection_outbox` | очередь проекций событий в webapp: `event_type`, `idempotency_key`, `payload` (события по конкретным пациентам/записям), `status`, `last_error` | **`status='done'` — 30 суток по `created_at`; `cancelled`/`processing`/непройденные — не трогать** | `done` — уже доехавшее событие, дальше это чистая история; `idempotency_key` от повтора защищает получатель, а не outbox. 30 суток — окно «сверить, доехало ли». Неуспешные статусы удалять нельзя: это невыполненная работа и вход для `requeue-projection-outbox-dead.ts` | тот же job, еженедельно | `app_operational_maintenance` (ACL: `app_staff=arwd`, `app_operational_delivery_worker=rw`, `app_operational_diagnostic=r`) | **ДА, стена роли + стена клиники.** 14-part-1 №10: RLS off, 0 политик, `payload` арендный | **нет** — нет колонки срока. Состав: `done` 3 759, `processing` 20, `cancelled` 9; `created_at` 2026-03-20 … 2026-08-03 |
| `public.outgoing_delivery_queue` | очередь исходящих: `event_id`, `kind`, `channel`, **`payload_json` — текст сообщения человеку**, `status`, `next_retry_at`, `priority` | **`status='sent'` — 30 суток по `sent_at`; `status='dead'` — 180 суток по `dead_at`; остальные статусы — не трогать** | Отправленное сообщение хранится ради «дошло ли» — это недели. Мёртвое хранится дольше (полгода), потому что это материал разбора систематических отказов доставки, а таких отчётов ждут по полугодиям. Живые статусы — неотправленная работа | тот же job, еженедельно | `app_operational_maintenance` (ACL: `app_staff=arwd`, `app_operational_delivery_worker=rw`, `app_owner=arw`) | **ДА, и это уже открытый дефект Н6** (14-part-3): `rls=false/force=false, pol=0`, а `organization_id` — **NULL во всех 812 строках**, т.е. сам дискриминатор аренды не заполняется. Включать RLS в лоб нельзя — отрежет всю доставку; чинится заполнением `organization_id`, не прунером | **нет** — нет колонки срока. Состав: `sent` 676, `dead` 136; `created_at` 2026-06-09 … 2026-08-07 |
| `public.notification_delivery_attempts` | попытки доставки уведомления: `user_id`, `topic_code`, `channel`, `status`, `reason`, `endpoint_hash`, `recipient_ref`, `error_message`, `metadata` | **180 суток по `created_at`** | Кормит диагностику доставки в админке (`adminWebPushHealthMetrics.ts`, `collectAdminSystemHealthData.ts`) — там сравнивают периоды, поэтому окно вдвое шире журнала отправок. Прямого текста сообщения не несёт (`endpoint_hash`, `recipient_ref`), поэтому 180 суток допустимы | тот же job, еженедельно | `app_operational_maintenance` (ACL: `app_staff=arwd`, `app_patient=r`, `app_owner=a`, `saas_system_health_owner=r`) | стена **уже стоит**: `rls=true/force=true`, 2 политики (staff-org OR `user_id=current_patient` + org-политика web-push-роли). 14-part-3: **OK**. Остаётся хвост — 8 строк из 12 626 с `organization_id IS NULL` | **нет** — нет колонки срока; 12 626 строк, 11 МБ, роста не даёт. `created_at` 2026-05-19 … 2026-08-07 |
| `public.support_delivery_events` | журнал доставки сообщений поддержки: `channel_code`, `status`, `attempt`, `reason`, `payload_json` | **90 суток по `occurred_at`** | Тот же класс, что `delivery_attempt_logs`, и то же ограничение: `payload_json` — содержимое переписки с пациентом | тот же job, еженедельно | `app_operational_maintenance` (ACL: `app_staff=arwd`, `app_patient=r`) | стена **уже стоит**: RLS on/forced, 1 политика с JOIN-веткой пациента. 14-part-4: **OK** | **нет** — нет колонки срока; 6 182 строки, 17 МБ. `occurred_at` 2026-03-04 … 2026-08-02 |
| `public.product_analytics_events_recent` / `_user_hourly` / `_hourly` / `product_push_notifications` | продуктовая аналитика | **90 / 180 / 730 / 730 суток — УЖЕ РЕАЛИЗОВАНО** | окна заданы в `productAnalyticsRetention.ts:4-16` | `/api/internal/product-analytics/retention`, job `product_analytics_retention`, еженедельно | текущий infra-cron принципал (`app_staff` через locked-infra-cron шов) | стена стоит (`rls=true/force=true`, 2 политики), но 14-part-3 держит **ВОПРОС** по второй политике `product_analytics_registration_platform_operations_select` — она даёт `app_platform_settings` кросс-арендное чтение событий регистрации вместе с `user_id` | **не требуется** — прунер работает |
| `public.app_runtime_settings_audit` | аудит изменений рантайм-настроек, 5 653 строки | **не чистить** | Это аудиторский след «кто и когда поменял настройку». Удаление аудита по расписанию — ровно то, чего аудит не должен допускать. 1.8 МБ на 5 месяцев — расти ему некуда | — | — | по классификации отдельного нарушения нет | **нет** |

### Сводно по механизму (одной строкой)

Один новый еженедельно-и-ежечасный job `db_journal_retention` на **уже существующем** конвейере
host-cron → `POST /api/internal/<job>/tick` с Bearer `INTERNAL_JOB_SECRET` → `enterWithDbInfraPrincipal` →
батчевый DELETE по окнам из таблицы выше, с записью тика в `operator_job_status` и строкой в
`CRON_JOB_REGISTRY`, чтобы «Здоровье системы» краснело, когда прунер встал; для `app.context_nonce_ledger` —
через SECURITY DEFINER `app.prune_context_nonce_ledger` (owner `app_owner`), потому что таблица закрыта
от всех ролей.

---

## Требует окна обслуживания

Данные удалены, кучи усохли (`heap` = 24 кБ), но **индексные файлы Postgres обычным `VACUUM` на диск не
возвращает** — btree-страницы помечены удалёнными и переиспользуемыми, файл остаётся прежнего размера
(«pages: 77286 in total, 77281 currently deleted» на реестре TEST). Это ~1.19 ГБ, которые заберёт только
`VACUUM FULL` (ACCESS EXCLUSIVE на таблицу) или `REINDEX` (`CONCURRENTLY` — почти без блокировки, но это DDL).
**В этой работе не запускалось.**

| База | Объект | Занято сейчас | Живых строк | Чем вернуть |
|---|---|---:|---:|---|
| `bersoncarebot_test` | `app.context_nonce_ledger_pkey` | 604 МБ | 0 | `REINDEX INDEX CONCURRENTLY` или `VACUUM FULL app.context_nonce_ledger` |
| `bcb_webapp_dev` | `app.context_nonce_ledger_pkey` | 247 МБ | 0 | то же |
| `bersoncarebot_test` | `idempotency_keys_pkey` (115 МБ) + `idx_idempotency_keys_expires_at` (27 МБ) | 142 МБ | 0 | то же |
| `bcb_webapp_dev` | `idempotency_keys_pkey` (115 МБ) + `idx_idempotency_keys_expires_at` (27 МБ) | 142 МБ | 0 | то же |
| `bersoncarebot_test` | `integrator.idempotency_keys`: куча 40 МБ + `_pkey` 39 МБ + `_expires_at_idx` 5 МБ | 84 МБ | 233 | `VACUUM FULL` — куча не усохла, потому что живые строки держат хвост файла |
| `bcb_webapp_dev` | `integrator.idempotency_keys` | 11 МБ | 0 | то же |
| | **ИТОГО к возврату** | **≈ 1230 МБ** | | |

Замечание: на реестре nonce и на `public.idempotency_keys` живых строк **ноль**, поэтому `VACUUM FULL` там
отработает мгновенно и блокировка будет измеряться миллисекундами — но это всё равно ACCESS EXCLUSIVE, и
решение о запуске за владельцем. Если прунер из раздела выше встанет на расписание, повторно эта проблема
не возникнет: индекс не будет успевать раздуться.

---

## Открытые вопросы

1. **Окно для `app.context_nonce_ledger`: 1 час или 5 минут?** Формально хватает 300 с (жёсткий потолок TTL
   в p2-b:208). Я предлагаю час — как запас на перекос часов и на «посмотреть последний час» при разборе.
   Час стоит ~26 тыс. строк / ~4 МБ. Возражений против 300 с у меня нет, если владелец хочет минимум.
2. **Заводить ли `app_operational_maintenance` или ехать на `app_staff`?** На `app_staff` прунер журналов
   заработает без единого нового гранта (ACL уже позволяет) — но это цементирует то, что терминальная
   ORG-роль имеет `DELETE` на кросс-арендные журналы. Считаю правильным завести сервисную роль строкой
   декларации §A и сузить `app_staff`; это решение уровня SCHEME, не уровня прунера.
3. **`integrator.message_retry_jobs`: 10 строк `pending` от 2026-03-05.** Они старше пяти месяцев и, судя по
   всему, никогда не будут отправлены (телефон и текст лежат в базе всё это время). Это не задача retention —
   это вопрос «висит ли у нас застрявшая очередь досылки»; выношу отдельно.
4. **`public.outgoing_delivery_queue`: `organization_id` NULL во всех 812 строках** (дефект Н6, 14-part-3).
   Retention-предикат по `status`/`sent_at` от этого не зависит и работать будет, но пока дискриминатор
   аренды не заполняется, стену на эту таблицу поставить нельзя. Порядок работ: сначала backfill+заполнение
   `organization_id`, потом RLS. Прунером не лечится.
5. **Где хранить дампы после приёмки.** Сейчас они в `/tmp/journal-cleanup-2026-08-08/` (434 МБ) — `/tmp`
   переживает не всё. Если это FREEZE «на всякий случай перед необратимым», их надо перенести в постоянное
   место; если чистка принята — удалить. Нужен ответ владельца, я по умолчанию ничего не удаляю.
6. **Применять ли те же окна к `bcb_webapp_prod`.** Он в этой работе не тронут по инструкции. Копия старого
   прода занимает 243 МБ и не растёт — но когда прунер поедет в деплой, он поедет и туда, где база живая.
   Окна выше рассчитаны на живую прод-нагрузку, а не на TEST.

---

## Чем измерено (команды, все read-only кроме перечисленных DELETE/VACUUM)

```bash
# размеры
sudo -u postgres psql -d <db> -Atc "SELECT n.nspname||'.'||c.relname, pg_size_pretty(pg_total_relation_size(c.oid)), c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 25"
sudo -u postgres psql -Atc "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database ORDER BY pg_database_size(datname) DESC"
# просроченность
sudo -u postgres psql -d <db> -Atc "SELECT count(*), count(*) FILTER (WHERE expires_epoch < extract(epoch from now())) FROM app.context_nonce_ledger"
sudo -u postgres psql -d <db> -Atc "SELECT count(*), count(*) FILTER (WHERE expires_at < now()) FROM public.idempotency_keys"
# ACL и владение
sudo -u postgres psql -d <db> -Atc "SELECT n.nspname||'.'||c.relname||' | owner='||pg_get_userbyid(c.relowner)||' | acl='||coalesce(array_to_string(c.relacl,' , '),'(default)') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ..."
# индексы после чистки
sudo -u postgres psql -d <db> -Atc "SELECT i.indexrelid::regclass::text, pg_size_pretty(pg_relation_size(i.indexrelid)) FROM pg_index i WHERE i.indrelid IN (...) ORDER BY pg_relation_size(i.indexrelid) DESC"
# дамп (FREEZE) и проверка
sudo -u postgres pg_dump -d <db> -Fc -t '<table>' -f /tmp/journal-cleanup-2026-08-08/<name>.dump
sudo -u postgres pg_restore -l /tmp/journal-cleanup-2026-08-08/<name>.dump
# удаление (батч) и вакуум
bash /tmp/journal-cleanup-2026-08-08/prune.sh <db> <table> "<predicate>" <keycol> 200000
sudo -u postgres psql -d <db> -c "VACUUM (ANALYZE) <table>"
```
