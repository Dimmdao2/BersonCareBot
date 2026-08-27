# Независимый аудит кандидата `2403aaadf` — systemic lifecycle (C1–C3, D1–D2, E1–E2, этапы 3–4)

- **Роль:** `auditor-live`, независимый первичный аудит новой поверхности.
- **Точный SHA кандидата:** `2403aaadf93f3361be9acfcb38e98c04447a89ac`
- **База сравнения:** `3e40130e5` (`docs: consolidate systemic residual audit`)
- **Ветка аудитора:** `wt/audit-systemic-lifecycle-20260827`
- **Дата:** 2026-08-27
- **Authority:** `AGENTS.md` (карта + §10a, §10b, §24, §1 «Миграции schema B» / «⛔ Миграция не выдаёт
  и не отзывает права» / «Перед приземлением миграции»), план
  `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` (C1–C3, D1–D2, E1–E2, этапы 3–4),
  записанная политика хранения `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md`,
  открытый owner-чеклист `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-03_DATA_RIGHTS_AND_RETENTION.md`.

---

## ВЕРДИКТ

## `FAIL, NOT FOR LAND`

Один достижимый дефект, доказанный падающим acceptance-тестом на **немодифицированном** кандидате
(`F1` ниже). Остальные заявленные классы C1, C2, C3/E1, D2, E2, схема и права разобраны и держатся;
`F2` — реально ложная (вакуумно зелёная) проверка внутри теста кандидата.

Отчёт воркера, число его тестов и его собственный kill-set как доказательство **не принимались**.

---

## 1. Слепой kill-set (составлен по authority ДО чтения тестов и отчёта воркера)

38 именованных поломок. Составлен до открытия любого `*.test.ts` этого коммита и до
`SYSTEMIC_LIFECYCLE_C1_E1_D1_2026-08-27.md`.

| # | Поломка | Итог |
|---|---|---|
| K1 | Аккаунт без retired id: purge оставляет `reminder_occurrence_history` | закрыт |
| K2 | Удаление истории только при наличии retired id (retired id = условие) | закрыт |
| K3 | Второй purge entrypoint (`user-phone-admin.ts`) удаляет только по `integrator_user_id` | закрыт |
| K4 | Проекция в переписи без canonical-key delete, сборка зелёная | закрыт (FI-1) |
| K5 | Перепись проекций живёт в двух местах и расходится молча | закрыт |
| K6 | Гейт переписи без самотеста | закрыт аудитором (FI-1, FI-6) |
| K7 | Итоговый success/`lastSuccessAt` из failure-only журнала | закрыт |
| K8 | Полный отказ канала показывается как ok/no_data | закрыт (FI-2) |
| K9 | Тихий день показывается degraded | закрыт |
| K10 | Success-строка пишется обратно в attempt journal | закрыт |
| K11 | Пустой catch превращает ошибку чтения в no_data | закрыт |
| K12 | Успех канала A маскирует отказ канала B | закрыт |
| K13 | Создан третий журнал вместо чтения канонической очереди | закрыт |
| K14 | Очередь читается мимо объявленного узкого root | закрыт |
| K15 | `message_log` не попадает ни в один prune root | закрыт |
| K16 | Окно `message_log` выдумано / считается не по той колонке | закрыт (см. Q1) |
| K17 | `reminder_occurrence_history` удаляется по выдуманному сроку | закрыт (FI-3) |
| K18 | Ветка удаления не ограничена батчем | закрыт |
| K19 | Удаление задевает строки вне заявленной поверхности | закрыт |
| K20 | Роль prune-root / health-root без нужного права → 42501 в рантайме | закрыт |
| K21 | Миграция выдаёт/отзывает права | закрыт |
| K22 | Смена сигнатуры функции без reconcile/REHOME | закрыт |
| K23 | Имя миграции / statement-owner / verify-probe не по канону | закрыт (preflight) |
| K24 | Preflight не откатывается / требует disposable БД | закрыт (preflight) |
| K25 | `media_files` удаляются до подтверждённого S3 abort | закрыт (FI-5b, тест аудитора) |
| K26 | Неуспешный abort оставляет строку, которую selector больше не выберет | **F1 — НЕ ЗАКРЫТ** |
| K27 | `errors > 0` при `success: true` | закрыт (FI-4) |
| K28 | Пустой/тихий catch в media-потоке | закрыт |
| K29 | Вторая state machine очистки вместо существующей | закрыт |
| K30 | Один row обрабатывается обеими дверями | закрыт |
| K31 | Bounded backoff потерян | закрыт (backoff есть), но см. `F1` |
| K32 | single-PUT pending получил вторую дверь | закрыт |
| K33 | terminal `media_upload_sessions` молча добавлены в purge | закрыт |
| K34 | `integrator_user_id` nullable в ORM расходится с БД/snapshot | закрыт |
| K35 | Изменение схемы сопровождено миграцией/replay | закрыт |
| K36 | Модуль импортирует infra напрямую | закрыт |
| K37 | Registry — вторая копия схемы/политики с собственным authority | закрыт как finding; см. R1 (дыра гейта) |
| K38 | Тесты проверяют текст исходника/SQL | закрыт как класс; см. `F2` (обратный случай) |

---

## 2. FINDINGS

### F1 (MUST FIX, блокирует landing) — повторный запуск pending-delete НИКОГДА не завершает работу после успешного abort

**Файл:** `apps/webapp/src/infra/repos/s3MediaStorage.ts:1347-1372` (`purgePendingMediaDeleteBatch`).

**Что происходит.** Шаг abort не идемпотентен. После УСПЕШНОГО `AbortMultipartUpload` этот факт нигде
не записывается: строка сессии остаётся в статусе `expired`, который не входит в исключение
`status NOT IN ('completed','aborted')` выборки сессий. Поэтому следующий тик вызывает abort ещё раз —
на upload, которого S3 уже не знает. S3 отвечает `NoSuchUpload`, `s3AbortMultipartUpload`
(`apps/webapp/src/infra/s3/client.ts:253`) ничего не проглатывает и бросает, выставляется
`abortFailed`, строка отправляется обратно в backoff **так и не будучи удалённой**.

Backoff (`computeDeleteRetryDelayMinutes`) упирается в 1 сутки, лимита попыток и терминального
состояния нет. Итог: строка `media_files` и её сессия живут вечно, а
`/api/internal/media-pending-delete/purge` начиная с этого момента отдаёт `ok:false` + HTTP 500 на
КАЖДОМ тике — красная операторская карточка, которую не может погасить ни один ретрай.

**Как достигается.** Любой отказ ПОСЛЕ успешного abort в той же итерации. В тесте это отказ
`s3DeleteObject` на тике 1 — ровно тот сценарий, который соседний тест этого же файла уже трактует как
обычный retryable исход. Тот же вечный клин достигается вообще без транзиентного отказа, если у бакета
стоит lifecycle-правило `AbortIncompleteMultipartUpload` или upload был завершён вне нашего потока —
в обоих случаях `NoSuchUpload` вернёт уже ПЕРВЫЙ abort.

**Против чего.** Приёмка этапа 4 плана владельца: «fault injection S3/provider/DB ошибки оставляет
retryable запись, красный tick и операторский сигнал; **повторный запуск завершает работу ровно один
раз**». Повторный запуск здесь не завершает работу никогда.

**Доказательство (падает на исходной реализации кандидата, ничего в продукте не менялось):**

```
apps/webapp/src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts
> pending upload abort lifecycle
> finishes the work on the retry after an abort that already succeeded

AssertionError: expected { removed: +0, errors: 1 } to deeply equal { removed: 1, errors: +0 }
```

Тест добавлен аудитором и передаётся исполнителю как фиксированный oracle. Направление исправления
(решает исполнитель): либо трактовать отсутствующий в S3 upload как уже прерванный, либо переводить
сессию в `aborted` в той же транзакции сразу после подтверждённого abort.

### F2 (MUST FIX, ложная защита) — утверждение «`DELETE FROM media_files` не выполнялся» вакуумно зелёное

**Файл:** `apps/webapp/src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts`, тест
`aborts the multipart upload BEFORE deleting anything…`:

```ts
const statements = fakes.runSql.mock.calls.map((call) => String(call[1]?.queryChunks ?? call[1]));
expect(statements.some((sql) => /DELETE FROM media_files/i.test(sql))).toBe(false);
```

`String(query.queryChunks)` для drizzle-шаблона даёт `'[object Object],<param>,[object Object]'` —
текста SQL там нет никогда. Замерено отдельным пробником в этом же раннере:

```
expected '[object Object],x,[object Object]' to be 'SHOW_ME'
```

Значит `.some(...)` не может стать `true` ни при какой реализации: утверждение зелёное независимо от
поведения. Соседние утверждения того же теста (`s3AbortMultipartUpload` вызван с ключом,
`s3DeleteObject` не вызван) настоящие — но именно заявленная гарантия «строка не удалена» не
проверяется. §10a «тест, зелёный вне зависимости от реальной поломки, создаёт ложное чувство защиты»;
§24.4, критерий аудитора теста №5.

Рабочий экстрактор `sqlTextOf` добавлен аудитором в тот же describe — достаточно перевести на него эту
строку.

### F3 (MUST FIX, недостающее покрытие названного класса) — ядро D1 (порядок «stage, а не delete») не было закрыто ничем

Слепая инъекция FI-5: возврат `stageExpiredMultipartSessionForPurgeTx`
(`apps/webapp/src/infra/repos/mediaUploadSessionsRepo.ts:326-372`) к `DELETE FROM media_files` —
дословно та поломка, которую называет §D1 — оставил **весь набор зелёным**. Route-тест
(`cleanup/route.unit.test.ts:31-34`) мокает эту функцию целиком, и за порядком не следил никто.

Отказ дорогой (parts остаются в бакете, `s3_key` + `upload_id` уходят каскадом, ретрай невозможен) и
молчаливый (тик рапортует успех) — §10a ступень 2 пройдена. Тест добавлен аудитором:
`hands an expired multipart session to the purge lifecycle without destroying the retry identity` —
зелёный на кандидате, краснеет на FI-5b.

---

## 3. Разобранные классы: что проверено и чем

### C1 — purge не зависит от retired integrator id — ДЕРЖИТСЯ

- `reminder_occurrence_history` включена в `CONTENT_TABLES`
  (`platformUserFullPurge.ts:39`) и удаляется по `platform_user_id` в основной транзакции
  (`deleteContentTablesForUser`, вызов `runWebappPurgeCoreInTransaction:308`) — **до** и независимо от
  ветки retired id (`:310-312`).
- Retired-id ветка сведена к переписи `WEBAPP_RETIRED_INTEGRATOR_ID_PROJECTIONS` — единственный список,
  из которого теперь строятся и gate-specs, и realignment-таблицы, и оба purge entrypoint
  (`platformUserFullPurge.ts:155`, `scripts/user-phone-admin.ts:448`). Второй копии списка нет.
- Гейт `purgeCoverageGapsForRetiredIntegratorProjections()` требует, чтобы КАЖДАЯ таблица переписи
  удалялась по `platform_user_id`. Все четыре (`reminder_rules`, `reminder_occurrence_history`,
  `content_access_grants_webapp`, `support_conversations`) присутствуют в `CONTENT_TABLES`.
- **Живой read-only замер (право on the target):**

```bash
sudo -n -u postgres psql -d bersoncarebot_test -Atc \
  "SELECT count(*), count(DISTINCT platform_user_id), count(*) FILTER (WHERE platform_user_id IS NULL)
     FROM public.reminder_occurrence_history WHERE integrator_user_id IS NULL;"
# 130|33|0     (bcb_webapp_dev: 0|0|0)
```

Все 130 строк 33 пользователей, которые старый ключ не доставал, достижимы новым:
`platform_user_id` `NOT NULL` в обеих БД и в generated snapshot.

- **FI-1** (удалить `reminder_occurrence_history` из `CONTENT_TABLES`) →
  `platformUserFullPurge.retiredIntegratorProjections.unit.test.ts`: `2 failed | 1 passed`. Поймано.

### C2 — delivery health следует failure-only журналу — ДЕРЖИТСЯ

- Успех и watermark берутся из канонической `public.outgoing_delivery_queue` (`status='sent'`,
  `sent_at`), ошибки остаются в `notification_delivery_attempts`; `status='success'` в журнале больше
  не считается (`pgNotificationDeliveryAttempts.ts:89-93`). Обратной записи успеха в журнал попыток
  нет, третий журнал не заведён (проверено по diff: writer'ы `apps/integrator/**` не тронуты).
- Очередь читается **через объявленный узкий root** `app.read_operator_delivery_queue_health()`, а не
  прямым SELECT. Проверено, что прямой SELECT был бы 42501: в
  `deploy/postgres/generated/privileges.bcb_webapp_dev.sql:15324` все runtime-роли отозваны с
  `outgoing_delivery_queue`.
- **Словарь каналов сходится** (иначе успех был бы вечным нулём, просто в другом месте):

```bash
sudo -n -u postgres psql -d bersoncarebot_test -Atc "SELECT DISTINCT channel FROM public.outgoing_delivery_queue ORDER BY 1;"
# email / max / telegram / web_push   — совпадает с NOTIFICATION_DELIVERY_CHANNELS
```

- Классификатор различает три состояния: подтверждённая доставка → `ok`; пусто при `dueBacklog > 0`
  → `degraded` (полный отказ не пишет ни одной failure-строки); пусто без backlog → `no_data`.
- Пустой `catch` заменён на `logger.error` + `errorCode`.
- **FI-2** (убрать ветку `dueBacklog > 0 → degraded`) →
  `adminNotificationDeliveryHealthMetrics.unit.test.ts`: `2 failed | 3 passed`. Поймано.

### C3 / E1 — retention — ДЕРЖИТСЯ (с owner question, см. Q1)

- Обе ветки добавлены в ОДИН закрытый root `app.prune_retention_target`, обе ограничены
  `batch_limit = 200000` через victims CTE.
- `message_log`: `sent_at < cutoff`, колонка `NOT NULL` в обеих БД, индекс `idx_message_log_sent_at`
  существует.
- `reminder_occurrence_history_terminal`: только `status IN ('sent','failed','skipped')`. Проверено по
  реальному CHECK-констрейнту, что полный словарь — `planned/queued/sent/failed/skipped`, то есть
  незавершённая работа (`planned`, `queued`) сохраняется. `planned_at` `NOT NULL` (0 NULL из 4035
  строк на TEST).
- **Срок не выдуман:** таргет зарегистрирован, но не исполняется —
  `REMINDER_OCCURRENCE_HISTORY_RETENTION_DAYS_OWNER_DECISION = null` → результат
  `skipped: 'owner_decision_pending'`.
- **FI-3** (подставить выдуманные 30 суток) → `journalRetention.unit.test.ts`: `3 failed | 2 passed`.
  Поймано.

### D1 / этап 4 — media cleanup — ЯДРО ВЕРНО, но см. F1/F3

- `stageExpiredMultipartSessionForPurgeTx` больше не удаляет `media_files`: строка переводится в
  `pending_delete`, сессия переводится в `expired` и **выживает** (она держит `s3_key` + `upload_id`).
- `purgePendingMediaDeleteBatch` сначала подтверждает `AbortMultipartUpload`, только потом удаляет
  объекты и строку; неуспешный abort → `schedulePendingDeleteRetry` + `errors += 1`, ничего не удалено.
- Вторая state machine не заведена: FK
  `media_upload_sessions_media_id_fkey … ON DELETE CASCADE` подтверждает, что сессия умирает вместе с
  media-строкой одной дверью.
- Оба тика перестали рапортовать успех при `errors > 0` (`ok:false`, HTTP 500,
  `recordOperatorCronJobTick(success:false)`), тихие catch убраны.
- **FI-4** (`const success = true`) → `cleanup/route.unit.test.ts`: `1 failed | 2 passed`. Поймано.
- **FI-5** (возврат к delete-first) → **весь набор зелёный** ⇒ finding `F3`.

### D2 / E2 — ничего не расширено без owner-решения — ДЕРЖИТСЯ

- single-PUT `pending` очищается уже существующим `stageStaleSinglePutMediaForPurge`, который через
  `notExists(session)` исключает multipart-строки. Второго крона/двери не заведено; multipart-строки
  входят в ТУ ЖЕ `pending_delete` машину. Дубля нет.
- terminal `media_upload_sessions` в purge/retention **не добавлены**; в реестре записано
  `retention: { kind: 'owner-question', id: 'OQ-TERMINAL-UPLOAD-SESSION-WINDOW' }`.

### Схема — ДЕРЖИТСЯ

`integrator_user_id` объявлен nullable в Drizzle без миграции и без исторического replay. Сверено с
реальностью, а не с отчётом:

```bash
# bcb_webapp_dev и bersoncarebot_test: integrator_user_id | bigint | YES (nullable)
# deploy/postgres/generated/prod-to-target/schema-pre.sql: "integrator_user_id bigint," (без NOT NULL)
```

---

## 4. Разбор прав миграций (§1 «Перед приземлением миграции»)

Три миграции, все `CREATE OR REPLACE FUNCTION` **с той же сигнатурой** — OID не меняется, DROP+CREATE
нет, `regprocedure`-идентичность сохранена.

| Миграция | Объект | Владелец тела | Что нужно телу | Где объявлено |
|---|---|---|---|---|
| `20260827T183500` | `app.prune_retention_target(text,integer,boolean)` | `app_seam_retention_sweep_owner` | `SELECT`+`DELETE` на `public.reminder_occurrence_history` (`status`,`planned_at`,`id`) и `public.message_log` (`sent_at`,`id`) | `declaration.ts` +12 строк → генератор выдал `GRANT DELETE` + `GRANT SELECT(...)` + `rev10_named_root_owner_gate` / `rev10_seam_business` политики для новой роли |
| `20260827T184500` | `app.read_curated_system_health_pre_0196()` | `saas_system_health_owner` | `SELECT` на `public.outgoing_delivery_queue` включая `channel` | **уже объявлено**: `GRANT SELECT ("channel","created_at",…) … TO "saas_system_health_owner"` (generated:15365) и surface-строка `('app.read_curated_system_health_pre_0196()', 'public.outgoing_delivery_queue', ARRAY['id','kind','channel',…])`. Новых прав не требуется |
| `20260827T185000` | `app.read_operator_delivery_queue_health()` | `app_seam_telemetry_operator_owner` | те же уже объявленные `channel`/`status`/`sent_at` | без изменений |

- **Ни одна миграция не выдаёт и не отзывает прав.** Проверено механически:
  `grep -n "DROP FUNCTION\|GRANT\|REVOKE\|CREATE POLICY\|ALTER ROLE\|CREATE ROLE\|ALTER DEFAULT" apps/webapp/db/drizzle-migrations/20260827T*.sql` → пусто (exit 1).
- Права приезжают декларацией + генератором; сгенерированные артефакты пересобраны
  (`BCB_FUNCTION_BODY_SURFACES_VERIFIED … rows=984 → rows=986`).
- Индексы под новые горячие предикаты уже существуют
  (`idx_reminder_occurrence_history_status_planned_at`, `idx_message_log_sent_at`) — новых горячих
  колонок миграции не создают.

### Owner-aware preflight на именованной DEV (обязательный пункт)

```bash
bash deploy/host/migrate-dev.sh --preflight \
     --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

Результат — целевая БД `bcb_webapp_dev` (именованная постоянная, НЕ disposable), execute не
выполнялся, TEST/PROD не затрагивались:

```
 session_user     | current_user                      | can_create_public
 bcb_dev_migrator | app_seam_retention_sweep_owner     | f
 bcb_dev_migrator | saas_system_health_owner           | f
 bcb_dev_migrator | app_seam_telemetry_operator_owner  | f
...
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev":
  pending=3 total=96 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

Каждое тело скомпилировано под ЗАЯВЛЕННЫМ владельцем (не от `postgres`), транзакция закончилась
`ROLLBACK`. Имена, statement-owner маркеры, `SCHEMA-CREATE`/`LANGUAGE-USAGE`/`REHOME-FUNCTION` и
`BCB-MIGRATION-VERIFY` приняты раннером — K23/K24 закрыты.

---

## 5. Реестр жизненного цикла (~950 строк): вторая копия схемы или нет

Отдельно оценено по требованию брифа и §5 / owner-решению «одна сущность, один статус».

**Не является второй копией authority и не дублирует источник истины:**

- набор КАНДИДАТОВ выводится механически из `declaration.ts` — независимого артефакта, а не из самого
  реестра (`journalLifecycleRegistry.contract.test.ts:28-50`);
- окно исполняется единственным закрытым root `app.prune_retention_target`; реестр обязан ссылаться на
  реально существующий target из `RETENTION_SWEEP_TARGETS` и на реальный `CRON_JOB_REGISTRY.jobKey`,
  иначе тест краснеет — то есть реестр не может объявить политику, которой некому исполнить;
- обратная связка тоже стоит: prune-target без владельца в реестре — красный;
- `owner-question` — записанное решение с устойчивым id, а не молчание.

Файл лежит рядом с `declaration.ts` (не под `apps`), чтобы production relation-census не читал его
имена таблиц как callsites — граница соблюдена.

**FI-6** (объявить новую таблицу `public.fi6_probe_events` без записи в реестре) → contract-тест
`1 failed | 5 passed`. Гейт работает; K37 как finding не подтверждается.

**R1 (recommendation, не finding).** Набор кандидатов держится на суффиксах имени
(`JOURNAL_LIFECYCLE_TABLE_SUFFIXES`) плюс ручной список исключений. **FI-7**: объявленная
`public.fi7_delivery_trace` — журнал, чьё имя не совпало ни с одним суффиксом — прошла гейт
**зелёной** (`6 passed`). То есть перепись полна ровно настолько, насколько дисциплинировано
именование. Это ограничение конструкции, а не достижимый дефект текущего кода: все существующие
журналы разобраны, а список `EXTRA_CANDIDATES` для неподходящих имён уже предусмотрен. Требования
«гейт обязан быть независим от имени» в плане владельца нет ⇒ рекомендация, работой автоматически не
становится.

---

## 6. Fault injection — сводка «что сломано → что покраснело»

Все временные правки продуктового кода откачены; в рабочем дереве осталось только изменение
тест-файла аудитора.

| ID | Что сломано | Что покраснело |
|---|---|---|
| FI-1 | `reminder_occurrence_history` убрана из `CONTENT_TABLES` | `platformUserFullPurge.retiredIntegratorProjections.unit.test.ts` — 2 failed |
| FI-2 | Убрана ветка `dueBacklog > 0 → degraded` | `adminNotificationDeliveryHealthMetrics.unit.test.ts` — 2 failed |
| FI-3 | `…OWNER_DECISION = 30` (выдуманный срок) | `journalRetention.unit.test.ts` — 3 failed |
| FI-4 | `const success = true` в multipart cleanup | `cleanup/route.unit.test.ts` — 1 failed |
| FI-5 | `stageExpiredMultipartSessionForPurgeTx` → `DELETE FROM media_files` | **НИЧЕГО (0 failed)** ⇒ finding `F3` |
| FI-5b | тот же возврат, против теста аудитора | новый тест `hands an expired multipart session…` — 1 failed |
| FI-6 | Объявлена `public.fi6_probe_events` без записи в реестре | `journalLifecycleRegistry.contract.test.ts` — 1 failed |
| FI-7 | Объявлена `public.fi7_delivery_trace` (имя вне суффиксов) | **НИЧЕГО (0 failed)** ⇒ R1, рекомендация |
| — | Кандидат «как есть», без правок | `finishes the work on the retry after an abort that already succeeded` — 1 failed ⇒ finding `F1` |

Непойманного по kill-set: **1** (K26 → `F1`), плюс `F3` (K25 держится в коде, но не защищён) и `F2`
(ложная защита внутри существующего теста).

---

## 7. Прогоны и результаты

| Команда | Результат |
|---|---|
| `pnpm install --frozen-lockfile` + сборка `packages/{db-principal,error-tracking,operator-db-schema,platform-merge}` | ok (в worktree не было `node_modules`/`dist`) |
| `npx vitest run` по 7 файлам кандидата (до правок аудитора) | `7 passed (7)`, `33 passed (33)` |
| `npx vitest run src/app-layer/health src/modules/db-retention src/infra/repos/s3MediaStorage src/app/api/internal/media-multipart src/app/api/internal/media-pending-delete src/infra/platformUserFullPurge` | `1 failed \| 11 passed (12)`, `1 failed \| 43 passed (44)` — единственное падение = acceptance-тест аудитора `F1`, побочных поломок нет |
| `npx tsc --noEmit -p apps/webapp/tsconfig.json` | exit 0 |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root …` | PASS, `ROLLBACK`, `bcb_webapp_dev` |

Full CI не гонялся: кандидат отклонён на pre-landing acceptance, до полного прогона дело не доходит.

---

## 8. Настоящие OWNER QUESTIONS (не findings, работой автоматически не становятся)

### Q1. `OQ-REMINDER-HISTORY-WINDOW` — решения владельца НЕТ; поведение кандидата корректно

Поиск по owner-регистрам:

- `grep -rn "OQ-REMINDER-HISTORY-WINDOW" --include=*.md --include=*.ts .` → встречается ТОЛЬКО в
  артефактах самого кандидата; ранее принятого решения нет;
- `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md` «Правила хранения»
  предшествует консолидации Track D и `reminder_occurrence_history` не называет;
- `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-03_DATA_RIGHTS_AND_RETENTION.md:53,88` —
  «Утверждена retention matrix…» и «Матрица БД/files/messages/audit/backups/payments → trigger → срок»
  стоят **открытыми чекбоксами** `- [ ]`;
- taskdb: `#905 PR-03` закрыт только узким slice A0, зонтик `#898` — `todo`.

**Что код делает до решения:** ветка, батч, объявленная поверхность, named root и планировщик — на
месте; таргет `reminder_occurrence_history_terminal` зарегистрирован, но при каждом тике возвращает
`{ deleted: 0, skipped: 'owner_decision_pending' }`. **Ни одна строка истории напоминаний не
удаляется.** Явный операторский override
(`overrides.reminderOccurrenceHistoryRetentionDays`) остаётся возможен разово. Это правильный выбор:
выдуманный агентом срок удалял бы историю приверженности пациента.

**Вопрос владельцу:** сколько хранить `reminder_occurrence_history` в терминальных статусах
(`sent`/`failed`/`skipped`)? Безопасный дефолт-предложение: 365 суток — год закрывает годовой отчёт по
приверженности; но это НЕ решение аудитора и в код не внесено.

### Q2. `OQ-TERMINAL-UPLOAD-SESSION-WINDOW` — решения владельца НЕТ; поведение кандидата корректно

Вопрос дословно стоит в самом плане владельца
(`SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md:388`): «Нужно ли отдельное окно для terminal
`media_upload_sessions`, или они должны жить до удаления `media_id`?» Ответа нигде нет.

**Что код делает до решения:** terminal-сессии в purge/retention НЕ добавлены; они по-прежнему уходят
только вместе со своей `media_files` строкой (FK `ON DELETE CASCADE`). Записано как
`retention: { kind: 'owner-question' }`. Это прямо требовалось планом («включить только после
owner-решения») и, отдельно, необходимо для D1: сессия — единственный носитель retry identity, её
досрочное удаление вернуло бы ровно тот дефект, который чинит эта ветка.

### Q3. 90 суток для `message_log` — решение принял агент по аналогии класса, не владелец

Это НЕ finding: срок не выдуман, он взят из уже записанной и уже исполняемой политики. Evidence-16
назначает 90 суток классу «журнал, несущий текст сообщения, отправленного человеку»
(`integrator.delivery_attempt_logs` — «`payload_json` — тело отправленного сообщения», 90 суток по
`occurred_at`; `public.support_delivery_events` — «тот же класс… то же ограничение»).
`message_log.text` — ровно это содержимое, и план (этап 3) просил «решение по `message_log`».

**Что владельцу стоит знать перед landing:** у `message_log`, в отличие от двух названных журналов,
есть продуктовый читатель — вкладка коммуникаций в карточке клиента врача
(`DoctorClientCommunicationsTab.tsx:31`), подписанная «Старый журнал отправок». То есть еженедельный
sweep через 90 суток начнёт подрезать то, что врач видит на экране. Подпись «старый журнал отправок»
подтверждает классификацию как журнала доставки (а не переписки), поэтому аудитор не считает это
дефектом; но открытая owner-матрица PR-03 явно перечисляет класс «messages», и одно слово владельца
здесь дешевле, чем восстановление.

На DEV и TEST в `message_log` сейчас 0 строк — немедленной потери данных нет ни при каком решении.

---

## 9. Наблюдения (не findings, исправления не требуют)

1. **`lastConfirmedDeliveryAt` имеет два разных смысла.** В
   `loadAdminNotificationDeliveryHealthMetrics` он берётся как `queue.lastSentAt` — это `max(sent_at)`
   по ВСЕЙ очереди без окна; в curated-пути та же поле считается `max(sent_at)` внутри 24 ч. При
   последней доставке 30 ч назад один путь покажет дату, другой `null`. Классификатор это поле не
   использует, статус карточки не меняется — расхождение чисто отображательное.
2. **`getOutgoingDeliveryQueueHealth()` теперь вызывается дважды** на один рендер health-страницы
   (внутри `getHealthSnapshot24h` и в `loadAdminNotificationDeliveryHealthMetrics`). Функция
   `STABLE`, стоимость мала.
3. **`support_questions` / `support_question_messages` переживают полное удаление аккаунта.**
   `support_questions.conversation_id` имеет `ON DELETE SET NULL`, а `deleteContentTablesForUser`
   (шаг `:308`) удаляет `support_conversations` РАНЬШЕ ветки retired id (шаг `:311`), чьи подзапросы
   после этого не находят ни одного диалога. Проверено, что это поведение **побайтно совпадает с
   базой `3e40130e5`** — кандидат его не вносил и не ухудшал; в переписи retired-id проекций этих
   таблиц нет справедливо (колонки `integrator_user_id` у них не существует). Отмечено как факт для
   следующего прохода этапа 3, не как finding по этому кандидату.
4. Комментарий в `webappIntegratorUserProjectionRealignment.ts` ссылается на
   `purgeCoverageForRetiredIntegratorProjections()`, фактическое имя —
   `purgeCoverageGapsForRetiredIntegratorProjections()`.

---

## 10. Что аудитор оставил в дереве

Только тест-файл (§24.3: аудитор коммитит созданные им acceptance-тесты и audit-artifact; продуктовый
fix не делает):

- `apps/webapp/src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts`
  - `finishes the work on the retry after an abort that already succeeded` — **падает** на кандидате,
    фиксированный oracle для `F1`;
  - `hands an expired multipart session to the purge lifecycle without destroying the retry identity`
    — зелёный на кандидате, краснеет на FI-5b, закрывает `F3`;
  - хелпер `sqlTextOf` — рабочая замена сломанному извлечению SQL из `F2`.
- этот отчёт.

Все временные поломки продуктового кода (FI-1…FI-7) откачены; `git status` перед коммитом показывает
единственный изменённый файл продукта — ни одного.

---

## 11. Итог

**`FAIL, NOT FOR LAND`.**

Передаётся выбранному по §24.1 исполнителю: `F1` (падающий acceptance-тест — фиксированный oracle),
`F2` (одна строка извлечения SQL), `F3` (закрыт тестом аудитора, продуктовой правки не требует —
подтвердить, что тест остаётся в наборе). Нового слепого аудита после исправления не требуется:
kill-set и тесты переиспользуются, итоговый зелёный SHA принимает оркестратор.

Owner-решения `OQ-REMINDER-HISTORY-WINDOW` и `OQ-TERMINAL-UPLOAD-SESSION-WINDOW` **не блокируют**
эту ветку: до ответа код ничего не удаляет.

### НЕ СДЕЛАНО

- Full `pnpm run ci` не гонялся — кандидат отклонён на pre-landing acceptance.
- Живой прогон `purgePendingMediaDeleteBatch` против реального S3 не выполнялся: `F1` доказан на
  самом дешёвом слое (unit), поднимать бакет ради того же класса ошибки §10a запрещает.
- `migrate-dev.sh --execute` не выполнялся (запрещено брифом); проверен только rollback-only preflight.
- TEST/PROD/env/domains не трогались; disposable БД не создавалась; продуктовый код не исправлялся.
