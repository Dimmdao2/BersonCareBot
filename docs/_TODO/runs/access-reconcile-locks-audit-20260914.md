# Аудит access reconcile locks и четырёх сопутствующих изменений — 2026-09-14

Кандидат: `wt/audit-reconcile-locks` / `4b95edce576cc0ff0aadca4796e577a246c9354f`.

Из **RUN** получены находки о фактических блокировках reconcile, stale policy digest, restore-like wrong-owner/missing-relation состояниях, `psql` meta-командах, retry/`lock_timeout`, live-телах функций и отказе архивного overlay. Из **VIEW** получены выводы о сохранности security guard в двух миграциях, соответствии email dedup-key, совместимости curated health snapshot, повторном дорогом чтении и точности архивной пометки. PROD не читался и не изменялся.

## Итог

Кандидат не проходит аудит.

| Область | Результат |
| --- | --- |
| Обычный no-op reconcile: ноль `ACCESS EXCLUSIVE` | **НЕ ВЫПОЛНЕНО**: полный reconcile всё ещё берёт пять постоянных `ACCESS EXCLUSIVE` через `port-context/contract.sql` |
| Policy digest | **НЕ ВЫПОЛНЕНО**: `ALTER POLICY` сохраняет digest-comment, после чего reconcile молча оставляет изменённый predicate |
| Busy object / bounded wait | **ВЫПОЛНЕНО**: `lock_timeout=3s` действует и на advisory lock, и на table DDL; retry отпускает транзакцию перед backoff |
| Restore-like wrong owner / missing relation | **ВЫПОЛНЕНО**: wrong owner исправляется; missing relation падает громко |
| Две function migrations | **ВЫПОЛНЕНО**: guard ровно один в каждой; email open/resolve классы совпадают и закрываются |
| Curated blocked-preview count | **НЕ ВЫПОЛНЕНО**: обязательное поле в `.strict()` ломает обе стороны version skew; banner делает второе перекрывающееся агрегатное чтение |
| Архивный overlay | **НЕ ВЫПОЛНЕНО**: отказ работает, но ломает документированный TEST bootstrap; утверждение про guards верно лишь для восьми функций из десяти |

## RUN-1 — no-op generated artifact не берёт постоянные exclusive locks, полный reconcile берёт

**CONFIRMED.**

Артефакт отдельно был применён штатным клиентом:

```bash
sudo -n -u postgres psql -X -1 -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1 \
  -f deploy/postgres/generated/privileges.bcb_webapp_dev.sql
```

Пока процесс был активен, выполнялся замер:

```sql
SELECT count(*)
FROM pg_locks l
JOIN pg_class c ON c.oid = l.relation
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE l.pid = :candidate_pid
  AND l.mode = 'AccessExclusiveLock'
  AND n.nspname NOT LIKE 'pg_temp%';
```

Результат: `persistent_access_exclusive|0`; `psql` завершился с кодом `0`. Это одновременно исполнило новые `\gset`/`\if` guards на live DEV, а не только прочитало их.

Затем дважды был запущен полный штатный путь (env разобран canonical parser в закрытый временный файл, значения не печатались):

```bash
node deploy/postgres/privileges/reconcile-access.mjs \
  --env dev --db bcb_webapp_dev \
  --admin-socket /var/run/postgresql --admin-port 5432
```

На втором запуске тот же запрос, дополненный выводом `n.nspname || '.' || c.relname`, показал пять постоянных `AccessExclusiveLock`:

```text
app_control.org_table_allowlist
app_control.relation_wall_registry
app_ext.accepted_port_contexts
app_ext.port_context_capabilities
app_ext.variant_a_identity_refs
```

Точное происхождение найдено командой:

```bash
rg -n 'ALTER TABLE|CREATE POLICY|DROP POLICY' \
  deploy/postgres/port-context/contract.sql \
  deploy/postgres/privileges/reconcile-access.mjs
```

`reconcile-access.mjs` вставляет `deploy/postgres/port-context/contract.sql` в ту же транзакцию, а contract без guards выполняет `ALTER TABLE` над этими пятью существующими отношениями. Поэтому owner-свойство 1 не выполнено, хотя новый generated artifact сам по себе ведёт себя правильно.

## RUN-2 — `ALTER POLICY` оставляет stale digest и reconcile считает drift неизменённым

**CONFIRMED, fault injection полностью откатан.**

До инъекции:

```text
oid=7301239
qual=(CURRENT_USER = 'app_platform_settings'::name)
comment=bcb1:1f1d097ee1a5e036
```

Инъекция:

```sql
ALTER POLICY rev10_admin_audit_platform_select_16
ON public.admin_audit_log USING (false);
```

Повторный запрос к `pg_policy` показал тот же `oid=7301239` и тот же comment, но `qual=false`. После полного запуска:

```bash
node deploy/postgres/privileges/reconcile-access.mjs \
  --env dev --db bcb_webapp_dev \
  --admin-socket /var/run/postgresql --admin-port 5432
```

получено `status=0`, а запрос к `pg_policy` всё ещё показал `qual=false` и старый comment. Guard сравнивает только `polname || '|' || comment`, поэтому фактический predicate не входит в live digest.

Откат:

```sql
ALTER POLICY rev10_admin_audit_platform_select_16
ON public.admin_audit_log
USING (CURRENT_USER = 'app_platform_settings'::name);
```

Финальная проверка:

```bash
sudo -n -u postgres psql -X -At -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c \
  "SELECT oid, pg_get_expr(polqual, polrelid), obj_description(oid, 'pg_policy')
   FROM pg_policy
   WHERE polrelid='public.admin_audit_log'::regclass
     AND polname='rev10_admin_audit_platform_select_16'"
```

вернула исходные predicate и comment.

Изменение predicate в `declaration.ts` меняет digest точного `CREATE POLICY` и не было найдено пути, при котором guard штатно пропустит такое изменение; индексное переименование policy тоже меняет сравниваемый набор. Проблема — независимый live drift через `ALTER POLICY` (плюс теоретическая, не рассматриваемая как finding, коллизия усечённого hash).

## RUN-3 — restore-like состояния

### Неверный owner

**CONFIRMED.** Birth-wall ожидаемо отверг прямой owner drift:

```text
ERROR: relation birth wall rejected owner postgres ... expected app_object_owner
```

Для fault injection event trigger был выключен и включён обратно внутри одной транзакции; `public.admin_audit_log` временно получил owner `postgres`. При удерживаемом `ACCESS SHARE` reconcile получил bounded timeout/retry, затем завершился с кодом `0` и восстановил owner.

Финальная проверка:

```sql
SELECT pg_get_userbyid(relowner)
FROM pg_class WHERE oid='public.admin_audit_log'::regclass;
```

дала `app_object_owner`.

### Отсутствующее relation

**CONFIRMED.** Тем же безопасным способом таблица временно переименовывалась в `public.admin_audit_log_audit_missing`. Полный reconcile завершился `status=1` с:

```text
ERROR: relation "public.admin_audit_log" does not exist
```

Ошибка не была классифицирована как lock retry. Таблица возвращена на место. Финальная команда:

```sql
SELECT to_regclass('public.admin_audit_log'),
       to_regclass('public.admin_audit_log_audit_missing'),
       pg_get_userbyid(relowner)
FROM pg_class WHERE oid='public.admin_audit_log'::regclass;
```

подтвердила: исходное relation существует, временное отсутствует, owner `app_object_owner`. Команда

```sql
SELECT evtname, evtenabled FROM pg_event_trigger
WHERE evtname='bcb_relation_birth_wall';
```

дала `bcb_relation_birth_wall|O`.

То есть guard не пропускает DDL, необходимый после `--no-owner`: wrong owner делает probe false; отсутствие активной relation доходит до DDL и падает громко. `migrate-local.mjs` сам generated SQL не парсит: wrapper после мигратора вызывает reconcile, который отдаёт артефакт `psql`.

## RUN-4 — `psql` meta-команды и потребители артефакта

**CONFIRMED.** Прямой live запуск артефакта из RUN-1 завершился `0`; `\gset` и `\if` отработали в `psql`.

Потребители искались командами:

```bash
node /home/dev/brain/tools/code-search.mjs \
  "generated privileges sql consumer reconcile migrate restore psql" --repo bcb -k 20
rg -n 'privileges\.(bcb_webapp_dev|bcb_webapp_test|bcb_webapp_prod)\.sql|generated/privileges' \
  deploy tools apps docs README.md
```

Исполняемый путь найден только через `psql`: непосредственно в документации/ручном применении либо как stdin дочернего `psql` из reconcile. Restore/migrate wrappers вызывают reconcile. Не найден executable consumer, пытающийся разобрать весь файл как обычный SQL без psql meta-command support.

Helper, который извлекает `CREATE POLICY "` строки, был исполнен отдельно:

```bash
node --input-type=module -e \
  "import { declaredPolicies } from './deploy/postgres/privileges/declaredPolicyConformance.mjs';
   console.log(declaredPolicies.get('admin_audit_log')?.filter(p => p.name.startsWith('rev10_admin_audit_platform_select_')))"
```

Он вернул ожидаемую policy; guard-строки разбор не нарушили.

Дополнительные проверки:

```bash
node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev --check
node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev --check --port-context-only
pnpm run test:db-privileges
```

Оба `--check` прошли. Последняя команда дала ровно `tests 380`, `pass 185`, `fail 0`, `skipped 195`. Первый запуск suite до подключения уже существующих workspace dependencies дал четыре `spawnSync node_modules/.bin/tsx ENOENT`; после временных symlink и их удаления тот же suite прошёл полностью. Это дефект оснащения worktree, не кандидата.

## RUN-5 — lock timeout и retry

**CONFIRMED для реальной блокировки и advisory lock.**

При удержании `ACCESS SHARE` на `app_control.org_table_allowlist` полный reconcile напечатал:

```text
access reconcile: объект занят живым запросом (попытка 1), повтор через 5 c
```

и после освобождения blocker завершился `0`. Backoff произошёл после rollback, то есть transaction/table locks во время сна не держались.

Покрытие advisory lock проверено отдельным владельцем того же ключа и конкурентной командой:

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
SELECT pg_advisory_xact_lock(
  hashtextextended('bcb-access-reconcile:' || current_database(), 0)
);
COMMIT;
```

Она завершилась с кодом `3` и `canceling statement due to lock timeout` после заданных `3s`. В reconcile `SET LOCAL` расположен сразу после `BEGIN`, до advisory lock и до всех включённых SQL-фрагментов, поэтому он покрывает каждое следующее statement этой транзакции.

Классификатор проверен запуском настоящего `reconcile-access.mjs` с временным подставным `psql`, считающим попытки:

```text
permission denied: status=1 attempts=1 elapsed_ms=3582
deadlock detected / 40P01: status=0 attempts=2 elapsed_ms=8665
P0001 с текстом "lock timeout": status=0 attempts=2 elapsed_ms=8578
```

Следовательно, настоящая privilege error падает с первой попытки, настоящий deadlock повторяется, но regex действительно повторяет и не-lock ошибку, если её текст содержит `lock timeout`. **HYPOTHESIS по продуктовому impact:** достижимого statement в текущем generated/contract SQL, который выдаёт такой ложный текст, не найдено; поэтому это не отдельный MUST FIX, а доказанная избыточная классификация.

## VIEW-1 — две function migrations сохраняют security guard и email lifecycle

**CONFIRMED чтением migration/application и live definition.**

Live-команда:

```sql
SELECT p.oid::regprocedure,
       (length(pg_get_functiondef(p.oid)) -
        length(replace(pg_get_functiondef(p.oid),
          'app.require_attested_context_for_roles', ''))) /
        length('app.require_attested_context_for_roles') AS guard_count,
       pg_get_userbyid(p.proowner)
FROM pg_proc p
WHERE p.oid IN (
  'app.open_or_touch_operator_probe_incident(text,text,text)'::regprocedure,
  'app.resolve_operator_probe_incidents(text)'::regprocedure
);
```

дала для обеих функций `guard_count=1`, owner `app_seam_telemetry_operator_owner`. В migration source guard также ровно один на функцию.

Команды чтения:

```bash
rg -n 'email_.*round_trip_failed|resolve_operator_probe_incidents|v_page_on_first_only|require_attested' \
  apps/integrator/src/infra/db/repos/operatorHealthDrizzle.ts \
  apps/integrator/src/application/operatorHealthProbeRunner.ts \
  apps/webapp/db/schema/migrations/20260914T120000_*email_probe*.sql
```

Приложение открывает ключи:

```text
outbound_delivery_provider:email:email_patient_round_trip_failed
outbound_delivery_provider:email:email_staff_round_trip_failed
```

и вызывает resolve для тех же двух error classes. `open_or_touch` принимает их как `outbound_delivery_provider`; `resolve_operator_probe_incidents` добавляет оба класса в ветку `v_page_on_first_only`, поэтому строки действительно попадают под закрывающий filter. Guard не потерян и не задублирован.

## VIEW-2 — curated blocked-preview count несовместим при rolling version skew

**CONFIRMED по достижимому call path; runtime deployment не мутировался.**

Команда:

```bash
rg -n 'curatedSystemHealthSnapshotSchema|blockedCount|loadCuratedSystemHealthSnapshot|collectCriticalHealthSignalsBase|probeVideoTranscodeStatus|loadAdminTranscodeHealthMetrics' \
  apps/integrator/src deploy
```

показала обязательный `mediaPreview.blockedCount` внутри `.strict()` schema и следующие пути:

- app новее DB: старый JSON не содержит обязательного поля, `parse()` бросает исключение;
- DB новее app: старая `.strict()` schema отвергает лишнее поле;
- scheduled critical tick вызывает `loadCuratedSystemHealthSnapshot()` без safe-wrapper в общем `Promise.all`, поэтому весь tick падает до classification;
- deploy применяет DB migration до запуска нового color, а singleton старого color переносится после switch. Значит окно «новая DB + старый app» является штатным rolling path, а не теоретическим сочетанием.

**CONFIRMED по call graph:** `collectCriticalHealthSignalsBase()` сначала вызывает `probeVideoTranscodeStatus()` → `loadAdminTranscodeHealthMetrics()` с media aggregates, затем отдельно `countBlockedMediaPreviewsSafe()` → полный `app.read_curated_system_health()`, который снова агрегирует media и остальные health domains. Таким образом banner path делает второе перекрывающееся дорогое чтение. Scheduled path повторно snapshot не читает. Фактическая прибавка latency на DEV не измерялась.

## VIEW-3 / RUN-6 — архивный `c4-operational-runtime.sql`

### Header неточен

**CONFIRMED.** Роли проверены:

```sql
SELECT count(*) FROM pg_roles
WHERE rolname IN ('app_owner', 'app_operational_diagnostic');
```

Результат `0`: эта часть header верна.

Функции посчитаны командой:

```bash
rg -n '^CREATE OR REPLACE FUNCTION' deploy/postgres/c4-operational-runtime.sql
```

Она вернула десять definitions. Разбиение bodies по этим границам и поиск `app.require_attested_context_for_roles` дал `0` во всех десяти overlay bodies. Live bodies проверены командой:

```sql
SELECT p.oid::regprocedure,
       position('app.require_attested_context_for_roles'
                IN pg_get_functiondef(p.oid)) > 0 AS has_guard
FROM pg_proc p
WHERE p.oid IN (
  'app.operator_incident_alert_already_sent(uuid)'::regprocedure,
  'app.mark_operator_incident_alert_sent(uuid)'::regprocedure,
  'app.read_outgoing_delivery_reclaim_config()'::regprocedure,
  'app.read_operator_health_imap_setting()'::regprocedure,
  'app.read_operator_health_smtp_outbound_setting(text)'::regprocedure,
  'app.list_google_calendar_probe_organization_ids()'::regprocedure,
  'app.read_operator_outbound_probe_meta()'::regprocedure,
  'app.record_operator_outbound_probe_run(text,timestamp with time zone,text,jsonb)'::regprocedure,
  'app.resolve_operator_probe_incidents(text)'::regprocedure,
  'app.open_or_touch_operator_probe_incident(text,text,text)'::regprocedure
)
ORDER BY 1;
```

Она дала guard только в восьми:

```text
app.mark_operator_incident_alert_sent(uuid)       false
app.operator_incident_alert_already_sent(uuid)    false
остальные восемь                                  true
```

Следовательно, фраза header «ни одна из 10 функций ... live-функции этот guard содержат» неверна для двух alert-sent функций.

### Refusal работает, self-test не ловит сломанный bootstrap caller

**CONFIRMED.** Прямой запуск:

```bash
sudo -n -u postgres psql -X -1 -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -v ON_ERROR_STOP=1 \
  -f deploy/postgres/c4-operational-runtime.sql
```

завершился `status=3` на строке 40 с собственным `FATAL` и намеренным division-by-zero — до function DDL.

Команда:

```bash
bash deploy/host/provision-c4-operational-runtime.sh --self-test
```

дала `provision-c4-operational-runtime self-test: OK`.

Но чтение `provision-c4-operational-runtime.sh` показало, что документированный `--bootstrap-test-env` по-прежнему передаёт overlay в `psql` без `-v c4_allow_archived_overlay=1`. Этот branch достижим и описан в `deploy/HOST_DEPLOY_README.md`; перед overlay он уже меняет env/roles. Поэтому новый refusal детерминированно обрывает свежий TEST bootstrap после частичных внешних изменений, а self-test этого не исполняет и даёт ложный green. Это реальный integration break, не замечание о стиле header.

## Решение по трём owner-свойствам

1. **«Трогать только то, что разошлось» — НЕ СДЕЛАНО.** Generated privilege artifact достигает нулевых постоянных `ACCESS EXCLUSIVE`, но фактический ordinary reconcile всегда берёт пять таких locks из включённого `port-context/contract.sql`.
2. **«Брать замок с ожиданием, а не намертво» — СДЕЛАНО.** Реальная table contention и advisory contention ограничены `3s` на попытку; whole-transaction retry и backoff работают, privilege error не маскируется. Later reader всё ещё может ждать за pending exclusive lock до этого bounded timeout, но не паркуется бессрочно.
3. **«Не держать всё одной транзакцией» — НАМЕРЕННО ПРОПУЩЕНО; НЕ СОГЛАСЕН.** Во время wrong-owner опыта после освобождения первоначального blocker был запущен later reader, а команда

   ```sql
   SELECT pid, state, wait_event_type, wait_event, query
   FROM pg_stat_activity
   WHERE datname='bcb_webapp_dev'
     AND wait_event_type='Lock';
   ```

   показала его в `wait_event_type=Lock`, `wait_event=relation`: после получения exclusive lock на единственном drifted relation reconcile держал его до окончания последующей длинной catalog verification. Аргумент «после (1) locks нет» покрывает только steady state, не реальный drift, ради которого reconcile существует. Это не выбор только между rare wait и half-applied permissions: exclusive DDL можно выполнить короткой preflight/apply транзакцией (или по одному relation), а ACL/policy grant set и финальную проверку оставить атомарными. Текущее решение сохраняет наблюдавшийся queue-stall на всё оставшееся время транзакции при одном drifted объекте.

## НЕ ПРОВЕРЕНО

- Полный destructive fresh-cluster/`--no-owner` restore не выполнялся: правила запрещают одноразовую БД, а уничтожать именованную DEV ради аудита нельзя. Его два существенных состояния — wrong owner и missing relation — воспроизведены fault injection на `bcb_webapp_dev` и откатаны.
- PROD `135.106.187.95` и `135.106.162.170` не трогались даже чтением.
- Не запускались старый app binary на новой DB и новый app binary на старой DB; version-skew failure доказан строгими schemas и реальным deploy/call path, но не отдельным rolling deployment.
- Не измерялась миллисекундная стоимость второго health/banner чтения; подтверждено только само дополнительное DB round trip и перекрывающаяся агрегация.
- Не прогонялось исчерпание всего массива backoff, найденного командой `rg -n 'RETRY_BACKOFF_SECONDS' deploy/postgres/privileges/reconcile-access.mjs`; проверены первая реальная lock retry, успешное продолжение и classifier branches.

## Чистота после аудита

Финальная live-проверка показала: `public.admin_audit_log` существует с owner `app_object_owner`, временного `admin_audit_log_audit_missing` нет, policy predicate восстановлен, `bcb_relation_birth_wall` имеет состояние `O`. Временный fake `psql`, dependency symlinks и fault-injection процессы удалены/завершены.
