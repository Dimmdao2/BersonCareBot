# 35 — полнота `SCHEME.md`, round 4

## Вердикт

**НЕТ — revision 5 пока не держит owner-свойство. Найдено 4 разрыва: 2 HIGH и 2 MEDIUM. Ранее закрытые
findings не переоткрылись.** Один finding (`MEDIUM-2`) — не закрытый revision 5 хвост round 3 про лишний login;
остальные три относятся к двум заново переписанным несущим механизмам и к названной границе каталога.

1. **HIGH — leakproof-предикат превращает бросающий RLS-accessor в оракул существования защищённых строк.**
2. **HIGH — залогированный proof вместе с dump восстанавливает повторно используемый клиентский секрет `C`.**
3. **MEDIUM — `pg_stat_activity` того же login отдаёт активный SQL порта с персональной timezone пациента.**
4. **MEDIUM — в схеме по-прежнему четыре login вместо трёх точек входа из owner-канона.**

Self-check числа findings и переоткрытий:

```bash
report=docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/35-scheme-gaps-r4.md
awk '/^### (HIGH|MEDIUM)-/{all++; if ($0 ~ /^### HIGH-/) high++; else medium++}
     /\*\*Переоткрытие ранее закрытого:\*\* да/{reopened++}
     END{print "findings=" all,"high=" high,"medium=" medium,"reopened=" reopened+0}' "$report"
# findings=4 high=2 medium=2 reopened=0
```

Мера findings — `OWNER_DECISIONS.md` §«Права БД, роли и стены», `PLAN.md` §«ЕДИНСТВЕННОЕ, ЧТО НАДО
ДОКАЗАТЬ»/Ф2/Ф3б и две границы, прямо заданные lead-brief этого круга. Ни один пункт ниже не создаёт новый
компонент или новую продуктовую область.

## Findings

### HIGH-1. Leakproof-предикат даёт оракул существования защищённой строки до RLS-accessor

- **Механизм.** Standing membership позволяет прямому клиенту с паролем сделать `SET ROLE` до контекста
  (`SCHEME.md:13-17,132-141`). После этого у runtime-role уже есть exact table/column grant, а громкость держит
  бросающий accessor внутри restrictive RLS policy (`24-26,166-180`). Но PostgreSQL разрешает выполнять
  `LEAKPROOF` functions/operators до policy expression. UUID equality действительно `LEAKPROOF`, а индексный
  предикат выполняется до row-level `Filter`. Это штатная семантика PostgreSQL, а не теоретическая перестановка:
  [CREATE POLICY](https://www.postgresql.org/docs/16/sql-createpolicy.html),
  [CREATE FUNCTION / LEAKPROOF](https://www.postgresql.org/docs/16/sql-createfunction.html).
- **Предусловие.** У атакующего есть верный пароль application login, но нет port key/context. Он выполняет
  разрешённый `SET LOCAL ROLE app_staff` и проверяет известный или перебираемый clinic/appointment predicate,
  например `be_appointments.organization_id + start_at` либо appointment UUID. У `app_staff` эта relation имеет
  `SELECT`; целевая схема сохраняет table access, а не capability-only модель.
- **Что становится достижимо.** Для отсутствующего indexed value Index Scan не получает tuple, policy accessor не
  вызывается, ответ — тихий ноль. Для существующего value tuple доходит до `Filter`, accessor бросает `42501`.
  Разница «ноль / ошибка» раскрывает существование защищённой записи и позволяет проверять расписание/UUID вне
  port context. Это **не** разрешённая граница §1.2: строка реально существует и факт о ней извлечён именно из
  различия отказов.
- **Исполняемое доказательство механизма.** Выполнено только на локальной `bcb_webapp_dev`, только read-only,
  после exact database gate:

  ```bash
  set -a
  source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
  set +a
  test -n "$DATABASE_URL"
  test "$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')" = bcb_webapp_dev
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
  BEGIN TRANSACTION READ ONLY;
  SELECT 'uuid_eq_leakproof=' || p.proleakproof
  FROM pg_proc p
  WHERE p.oid = 'uuid_eq(uuid,uuid)'::regprocedure;
  EXPLAIN (COSTS OFF)
  SELECT id FROM public.be_appointments
  WHERE id = '00000000-0000-4000-8000-000000000001'::uuid;
  ROLLBACK;
  SQL
  # uuid_eq_leakproof=true
  # Index Scan using be_appointments_pkey on be_appointments
  #   Index Cond: (id = ...)
  #   Filter: (... app.current_org_id() ... OR ... app.current_patient_user_id() ...)
  ```

  Схема `be_appointments` подтверждает clinic/patient payload и btree indexes по `organization_id/start_at`,
  patient и status: `apps/webapp/db/schema/bookingEngine.ts:525-584`.
- **Наименьшее закрытие без нового компонента.** Зафиксировать для каждой restrictive context-policy
  statement-like one-time форму на уже существующем accessor, например uncorrelated scalar subquery
  `USING ((SELECT app.require_accepted_context(...)) AND <business predicate>)`, и доказать планом/исполнением,
  что gate стоит `One-Time Filter` **над** Index Scan. Acceptance добавляет пару exact indexed probes: value
  существует / value отсутствует; без context обе обязаны дать одинаковый `42501`. Такая форма на текущем PG16
  действительно планируется над scan:

  ```sql
  EXPLAIN (COSTS OFF)
  SELECT id FROM public.be_appointments
  WHERE (SELECT app.current_org_id()) IS NOT NULL
    AND id = '00000000-0000-4000-8000-000000000001'::uuid;
  -- Result
  --   One-Time Filter: ($0 IS NOT NULL)
  --   InitPlan 1 ...
  --   -> Index Scan ...
  ```

  Это использует существующий accessor/RLS и не возвращает отвергнутое C-extension. Если исполняемая policy
  не удерживает этот порядок на всех поддержанных командах, minor SQL-изменения недостаточно: остаются только
  уже отвергнутый statement component либо явное owner-решение принять existence-oracle.
- **Переоткрытие ранее закрытого:** нет. Round 2 finding был про `WHERE false`/`LIMIT 0`; lead назвал их допустимой
  пустой границей. Здесь другой путь: indexed predicate раскрывает факт о реально существующей строке.

### HIGH-2. Logged proof + dump восстанавливают `C` и позволяют mint новых proof

- **Механизм.** Revision 5 хранит `S = SHA-256(C)`, а клиент передаёт
  `proof = C XOR HMAC-SHA-256(S,T)` (`SCHEME.md:72-90`). Схема утверждает, что залогированный proof связан с
  nonce и повторно бесполезен (`91`). Это верно для proof **без** verifier, но неверно для предусмотренного backup:
  dump содержит `S` из `app_ext.port_key_verifiers` и может содержать canonical `T` из
  `app_ext.port_context_state`; исключение этих tables/state из backup в §7 не задано. При наличии logged proof
  hash обращать не надо:

  ```text
  C = proof XOR HMAC-SHA-256(S,T)
  proof2 = C XOR HMAC-SHA-256(S,T2)
  SHA-256(C) = S
  ```

  `proof2` проходит verifier на новом nonce `T2`; backend/transaction/expiry и atomic consume старого challenge
  этому не мешают.
- **Предусловие.** Читатель backup/dump получает `S` и state/transcript, а success/error SQL с proof попадает в
  server либо application log. PostgreSQL при `log_statement=all` пишет Bind values; полный размер разрешён при
  `log_parameter_max_length=-1`. На error-path параметры отдельно регулирует
  `log_parameter_max_length_on_error`: [PostgreSQL logging parameters](https://www.postgresql.org/docs/16/runtime-config-logging.html).
  Текущая DEV не логирует success statements, но target-инварианта на эти settings в схеме нет:

  ```bash
  set -a
  source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
  set +a
  test -n "$DATABASE_URL"
  test "$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')" = bcb_webapp_dev
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<'SQL'
  BEGIN TRANSACTION READ ONLY;
  SELECT name || '=' || setting FROM pg_settings
  WHERE name IN ('log_statement','log_parameter_max_length','log_parameter_max_length_on_error')
  ORDER BY name;
  ROLLBACK;
  SQL
  # log_parameter_max_length=-1
  # log_parameter_max_length_on_error=0
  # log_statement=none
  ```
- **Что становится достижимо.** С новым `C` и верным login password атакующий сам выпускает challenge и
  устанавливает свежий staff/patient/platform/service context любой target-role, разрешённой этому login, до
  revoke key. Это не replay одного proof, а выпуск неограниченного числа новых proof.
- **Наименьшее закрытие.** В существующую declaration/settings/sweep добавить обязательные
  `log_parameter_max_length=0` и `log_parameter_max_length_on_error=0`; два порта обязаны редактировать proof и
  transcript в своих logs. Acceptance должна искать sentinel **proof/C/T**, а не только исходный `K`, на success и
  error paths. Тогда dump сам по себе оставляет только 256-bit preimage task, а proof не появляется во втором
  артефакте. Новый компонент не нужен.
- **Переоткрытие ранее закрытого:** нет. Прежний finding относился к передаче исходного `K`; revision 5 его больше
  не передаёт. Новый разрыв вызван алгеброй `proof` вместе со stored verifier.

### MEDIUM-1. Каталог отдаёт SQL соседней port-сессии того же login с patient value

- **Механизм.** §1.1 утверждает, что `pg_catalog` не содержит clinic/doctor/patient data (`SCHEME.md:28-33`). Но
  PostgreSQL разрешает ordinary role видеть полную activity своих сессий — sessions той же роли, членом которой
  caller является: [Cumulative Statistics / Viewing Statistics](https://www.postgresql.org/docs/16/monitoring-stats.html).
  Все pool backends порта разделяют один login, поэтому прямое соединение с тем же password видит
  `pg_stat_activity.query` легитимных port backends без context.
- **Предусловие.** Прямой клиент с паролем `<env>_webapp_patient` или staff подключён одновременно с нормальным
  запросом порта того же login; `track_activities=on` (штатное и текущее состояние).
- **Что становится достижимо.** Текущий product code вставляет персональную timezone пациента как SQL literal:
  `pgProgramActionLog.ts:285-380` строит `sql.raw` с `displayIana` внутри literal, а doctor patient calendar получает
  значение через `patientCalendarTimezone.getIanaForUser(patientUserId)`
  (`loadDoctorPatientExerciseCalendar.ts:87-119`). Следовательно, direct client видит реальное patient value в
  активном SQL, минуя port context. Это ровно доказательство, требуемое lead-оговоркой: за catalog boundary
  скрывается не только metadata.
- **Исполняемая проверка.** Две одновременные сессии одного локального DEV login; обе read-only, первая держит
  синтетический sentinel, вторая проверяет только факт видимости:

  ```bash
  set -a
  source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
  set +a
  test -n "$DATABASE_URL"
  test "$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')" = bcb_webapp_dev
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
    "BEGIN TRANSACTION READ ONLY; SELECT pg_sleep(6) FROM
     (VALUES ('r4_patient_secret_sentinel')) AS v(secret); ROLLBACK;" & probe_pid=$!
  visible=$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
    "BEGIN TRANSACTION READ ONLY; SELECT count(*) FROM pg_catalog.pg_stat_activity
     WHERE usename=current_user AND pid<>pg_backend_pid()
       AND query LIKE '%r4_patient_secret_sentinel%'; ROLLBACK;")
  wait "$probe_pid"
  printf 'same_login_query_visible=%s\n' "$visible"
  # same_login_query_visible=1
  ```
- **Наименьшее закрытие без нового компонента.** Для application login задать через существующую role declaration
  `track_activities=off` и сверять `rolconfig`; direct login не может вернуть setting, потому что менять
  `track_activities` разрешено только superuser. Acceptance повторяет cross-session sentinel probe и требует, чтобы
  query text не был виден. Локально параметризовать найденную timezone полезно, но одной call-site правки для
  системного инварианта недостаточно и она противоречила бы П3 как способ доказательства всей стены.
- **Переоткрытие ранее закрытого:** нет. Lead разрешил catalog metadata; этот finding существует только потому,
  что live activity содержит прикладное patient value.

### MEDIUM-2. Четвёртый login всё ещё противоречит owner-составу точек входа

- **Механизм.** Owner canon и `PLAN.md` Ф2 задают login ровно по точкам входа: deploy channel, webapp port,
  integrator port (`OWNER_DECISIONS.md:260-273`, `PLAN.md:99-113`). Revision 5 создаёт отдельные webapp staff и
  patient login плюс integrator и migrator (`SCHEME.md:8-17,123-143`), а развилка 7 сама признаёт выбор «три или
  четыре» и отсутствие owner-переопределения (`323`).
- **Точный подсчёт target-таблицы:**

  ```bash
  awk 'BEGIN{t=0} /^\| Login \| Единственная точка входа/{t=1; next}
       t && /^\|---/{next} t && /^\| `<env>_/{n++; next}
       t && !/^\|/{print "scheme_logins=" n; exit}' \
    docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md
  # scheme_logins=4
  ```
- **Предусловие.** Target provisioned буквально по §3.1.
- **Что становится достижимо.** Появляется дополнительный постоянный password/connection entrypoint к challenge,
  catalog и patient target-role. При закрытых HIGH выше он сам по себе не отдаёт application rows, но нарушает
  owner-структуру «login = port» и расширяет credential surface без owner authority.
- **Наименьшее закрытие.** Оставить один `<env>_webapp` login; точный class/role уже связан с transcript и accepted
  context, поэтому staff/patient разделяются runtime-role, а не ещё одним DB password. Если физическое разделение
  webapp credentials важнее, это **OWNER QUESTION** и требует нового решения в owner canon; инженерная развилка
  схемы его не заменяет.
- **Переоткрытие ранее закрытого:** нет. Это сохранённый `MEDIUM-1` round 3, а не новая регрессия revision 5.

## Проверки, вернувшиеся чистыми

### Переход login → runtime-role

1. `INHERIT FALSE` на каждом ребре действительно не даёт login использовать object privileges роли до
   `SET ROLE`; `SET TRUE` действительно разрешает явный переход. Это точная семантика PostgreSQL 16:
   [SET ROLE](https://www.postgresql.org/docs/16/sql-set-role.html),
   [Role Membership](https://www.postgresql.org/docs/16/role-membership.html). Round 3 blocker закрыт механизмом,
   а не словом.
2. `ADMIN FALSE` вместе с `NOCREATEROLE` login/runtime roles не даёт передавать membership дальше. Других и
   транзитивных рёбер схема запрещает и двусторонне сверяет (`SCHEME.md:119-141,255-271`).
3. До `SET ROLE` login не имеет application table/column/sequence ACL; permission check relation выполняется до
   scan, поэтому `WHERE false`/`LIMIT 0` на managed relation дают `42501`. После `SET ROLE` единственный найденный
   незакрытый путь — HIGH-1.

### Громкость и системный лог

4. На проверенной локальной DEV settings равны `log_min_messages=warning` и
   `log_min_error_statement=error`; PostgreSQL `ERROR` проходит этот threshold, а failing statement включается в
   log. Команда, которой получены значения:

   ```bash
   set -a
   source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
   set +a
   test "$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')" = bcb_webapp_dev
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
     "BEGIN TRANSACTION READ ONLY; SELECT name||'='||setting FROM pg_settings
      WHERE name IN ('log_min_messages','log_min_error_statement') ORDER BY name; ROLLBACK;"
   # log_min_error_statement=error
   # log_min_messages=warning
   ```

5. Tableless `SELECT 1`/`VALUES`, обычные catalog/object metadata и challenge bootstrap не отдают managed rows;
   это принятая lead-граница, а не finding. Исключение с реальным patient value вынесено отдельно в MEDIUM-1.
6. Default `PUBLIC EXECUTE` для новых functions учтён: схема требует revoke в той же declaration/generator
   transaction, exact caller list и полный per-database `prosecdef` census (`224-230,255-271,297-311`). Для exact
   pre-session functions table access разрешён только после принятой attestation; `issue_port_challenge` возвращает
   caller/server binding, не clinic rows.

### Attestation, hash и replay

7. Без сочетания из HIGH-2 dump сам по себе контекст не mint-ит: в нём есть `S`, но нет `K` или `C`; при случайном
   256-bit `C` требуется preimage SHA-256. Tenant/runtime roles не читают `port_key_verifiers` или private state;
   доступ имеют только exact seam owner, `app_object_owner` как недостижимый owner и поимённые административные
   исключения (`SCHEME.md:72-76,92-94,236-253`).
8. Обычный replay proof между backend/transaction/login/role/purpose/args закрыт: server nonce, PID+backend start,
   transaction, expiry, canonical typed args и atomic `ISSUED → ACCEPTED` сверяются заново (`80-94`).
9. Сравнение `SHA-256(C')` с 32-byte `S` не создаёт практически полезного timing-oracle: атакующий без `S` не
   управляет восстановленным `C'`, а с `S` раннее сравнение hash bytes не превращает preimage search в
   покомпонентный поиск из-за avalanche SHA-256. Отдельный component для constant-time compare этому threat model
   не нужен.
10. Rotation не оставляет неименованного окна: overlap старого/нового key_id объявлен, `not_before/not_after` и
    `revoked_at` проверяются при consume, начатый challenge старого key после revoke не принимается (`96-98`).

### Владение и миграционное окно

11. `app_object_owner` имеет named need, `NOLOGIN/NOBYPASSRLS`, ноль standing members и ноль definer-functions;
    ordinary objects, seam functions и administrative/system objects имеют поимённую owner-map без fallback
    (`55-58,232-253`). Прежний разрыв successor ownership не вернулся.
12. Каждый schema DDL выполняется после `SET LOCAL ROLE <declared_owner>`, поэтому новый object сразу получает
    заявленного owner; existing DDL получает owner-power той же роли. Backfill выполняет поимённый `postgres` после
    reset (`273-290`). Прежний DDL ownership drift не вернулся.
13. Grant временных memberships, migration, backfill, revoke и assertions находятся в одной transaction: crash до
    commit откатывает elevation и DDL. Positive control на representative real migration и отдельный crash-control
    оба прямо обязательны (`275-285,311-313`).

### Regression и scope checks

14. Findings первого и второго кругов просмотрены по их исходным механизмам: pre-session без key, inheritance,
    stale pool context, secret split, полный definer census, caller UUID/GUC, search path/TEMP, permissive OR,
    trigger/FK/cascade, полный object contour, crash/BYPASS, cluster powerful paths, statement-empty RLS,
    executable verifier, ownership map и DDL owner path. Ни один из них в прежней форме не вернулся.
15. Из round 3 transition blocker закрыт; две lead-границы теперь названы; raw `K` больше не пересекает SQL boundary;
    divergence против Ф3б восстановлен точно (`SCHEME.md:42-53`). Незакрытый login-count не объявлен
    «переоткрытием» — он никогда не был закрыт.
16. `FACTS.md` §9 проверен пункт за пунктом. Не вернулись: правило бросать все прикладные ошибки; AST/call-site
    auditor; capability-only target; утверждение, что log видит silent/extra visibility; неверная причина
    `search_path`; доказательство авторизации по call sites; старый plan v4 как authority.
17. Поиск выполнялся сначала через code-search, затем exact `rg` по известным идентификаторам:

    ```bash
    node /home/dev/brain/tools/code-search.mjs \
      "DB privilege layer scheme stored hash attestation loud denial grants migration window app_object_owner" \
      --repo bcb -k 20
    node /home/dev/brain/tools/code-search.mjs \
      "pg_stat_activity query application data literals SQL comments user id organization id raw query" \
      --repo bcb -k 30
    node /home/dev/brain/tools/code-search.mjs \
      "countDistinctLocalCalendarDaysWithDoneInWindow displayIana patient timezone call" \
      --repo bcb -k 30
    rg -n 'sql\.raw\(|pg_stat_activity|log_min_messages|log_parameter_max_length|app_staff|platform_users' \
      apps/webapp/src apps/integrator/src packages deploy docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD
    ```

18. SQL был только read-only на exact local `bcb_webapp_dev`. DDL/DML не выполнялись. `*_prod`, `secondbrain`,
    `storylama_*`, TEST и PROD не открывались. Product code, scheme, plan, taskdb и прочие документы не менялись.

## Граница результата

Это audit gate, не план исправлений. HIGH-1/HIGH-2/MEDIUM-1 имеют прямую строку owner-свойства и минимальное
закрытие существующими механизмами PostgreSQL; MEDIUM-2 имеет прямую строку Ф2. Ни один finding автоматически не
расширяет workstream, а единственная развилка, требующая owner-слова при отказе от минимального закрытия, названа
явно.
