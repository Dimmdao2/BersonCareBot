# 37 — полнота `SCHEME.md`, round 5

## Вердикт

**НЕТ — revision 6 не держит свойство в записанном виде. Найдено 3 разрыва: 1 BLOCKER, 1 HIGH и 1 MEDIUM. Ранее
закрытые findings не переоткрылись (`reopened=0`).** Round 4 `MEDIUM-1` про same-login activity закрыт не полностью:
два названных канала отозваны, третий штатный канал PostgreSQL остался. Приёмка схемы и отсчёт двух чистых ревью не
начинаются.

1. **BLOCKER — role-bound accessor теряет роль вызывающего внутри `SECURITY DEFINER` и не может выполнить заявленную сверку.**
2. **HIGH — прямой sequence ACL после `SET ROLE` отдаёт значение и позволяет менять sequence без контекста.**
3. **MEDIUM — `pg_stat_get_backend_activity(integer)` по-прежнему отдаёт SQL соседней сессии того же login.**

Self-check числа findings и переоткрытий:

```bash
report=docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/37-scheme-gaps-r5.md
awk '/^### (BLOCKER|HIGH|MEDIUM)-/{all++; if ($0~/^### BLOCKER-/) blocker++;
     else if ($0~/^### HIGH-/) high++; else medium++}
     END{print "findings=" all,"blocker=" blocker,"high=" high,"medium=" medium,"reopened=0"}' "$report"
# findings=3 blocker=1 high=1 medium=1 reopened=0
```

Мера — `OWNER_DECISIONS.md` §«Права БД, роли и стены», `PLAN.md` §«ЕДИНСТВЕННОЕ, ЧТО НАДО ДОКАЗАТЬ»/Ф3/Ф3б/Ф8
и brief этого круга. Все три findings имеют прямой достижимый путь к нарушению уже заданного свойства; нового
компонента и новой продуктовой области ни один не предлагает.

## Findings

### BLOCKER-1. `current_user` внутри context-owner функции — не роль вызывающего

- **Механизм.** Revision 6 закрывает второй role switch утверждением, что каждый accessor сравнивает `current_user`
  с target role transcript (`SCHEME.md:11-15,81-83,104-106`). Но `require_accepted_context`, `current_org_id`,
  `current_patient_user_id`, `current_integrator_user_id` и `require_platform_principal` входят именно в целевой
  `SECURITY DEFINER`-набор шва 1 (`184-188,190-196,222-224`). В PostgreSQL `current_user` внутри
  `SECURITY DEFINER` меняется на владельца функции; `current_role`/`user` — его синонимы. Поэтому accessor видит
  `app_seam_context_owner`, а не внешнюю `app_staff`/`app_patient`/service-role. Это штатная семантика
  [PostgreSQL 16, System Information Functions](https://www.postgresql.org/docs/16/functions-info.html).
- **Предусловие.** Порт корректно прошёл challenge, state принят для роли A, затем выполнил предусмотренный
  `SET LOCAL ROLE A` и первый запрос к managed relation. Restrictive policy вызывает
  `app.require_accepted_context()` как написано в §4.
- **Что становится достижимо.** При буквальной реализации сравнение всегда видит owner шва и даёт `42501`, то есть
  staff/patient/platform/service/integrator positive controls не получают ни одной строки. Если при реализации
  сравнение выкинуть как неработающее, снова достижим исходный путь round 4 С1: контекст A используется после
  `SET LOCAL ROLE B`. Между switch и первым accessor data-path нет; разрыв именно в том, что заявленный accessor
  не может узнать роль вызывающего выбранным выражением.
- **Проверка каталога.** Текущие три accessors, от которых выведен target seam, уже `SECURITY DEFINER`; это не
  предположение о будущей форме. Команда была только read-only на exact `bcb_webapp_dev`:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SELECT n.nspname, p.proname, p.prosecdef, pg_get_userbyid(p.proowner)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='app'
    AND p.proname IN ('current_org_id','current_patient_user_id','current_integrator_user_id')
  ORDER BY p.proname;
  ROLLBACK;
  -- app.current_integrator_user_id | t | app_owner
  -- app.current_org_id             | t | app_owner
  -- app.current_patient_user_id    | t | app_owner
  ```

  Точный search по всем 231 текущим non-system definer bodies также дал ноль существующих образцов получения
  caller-role:

  ```sql
  SELECT count(*) FILTER (WHERE lower(pg_get_functiondef(p.oid)) LIKE '%current_setting(''role''%'),
         count(*) FILTER (WHERE lower(pg_get_functiondef(p.oid)) LIKE '%current_user%'), count(*)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema');
  -- 0 | 0 | 231
  ```
- **Наименьшее закрытие без нового компонента.** Не читать caller-role через `current_user` внутри definer.
  Restrictive policy каждой exact role передаёт в private verifier неизменяемый literal ожидаемой роли, а verifier
  сравнивает его с transcript; то же exact-role binding задаётся каждому attested root seam. Альтернатива той же
  мощности — тонкий `SECURITY INVOKER` accessor, который захватывает caller `current_user` до закрытого внутреннего
  definer-reader. В обоих вариантах inner private function не имеет runtime `EXECUTE`. Acceptance обязана доказать
  A→A green, A→B `42501` и fault injection сравнения. Это изменение существующего шва 1, не новый компонент.

### HIGH-1. Sequence privileges остаются вне context-gate

- **Механизм.** До `SET ROLE` login действительно имеет ноль table/column/**sequence** ACL (`SCHEME.md:19-21`).
  После `SET ROLE` громкость возложена на restrictive RLS policy (`22-23,159-180`), но у sequence нет RLS/policy.
  §6.2 включает sequences в декларацию, однако не запрещает прямой `USAGE`/`SELECT`/`UPDATE` runtime-role. Значит
  любое такое exact право, выданное после Ф7 как «нужное», немедленно становится доступно прямому клиенту с
  password и standing `SET TRUE` membership — до challenge и без accepted context.
- **Предусловие.** Runtime-role получает хотя бы один прямой sequence grant. Это не теоретический объектный класс:
  текущий read-only census exact DEV показал пять `USAGE`+`SELECT` у `app_staff` и один у `app_patient`; команда,
  которой получено число:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  WITH seq AS (
    SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='S' AND n.nspname IN ('public','integrator','app','app_ext')
  ), roles AS (
    SELECT oid, rolname FROM pg_roles WHERE rolname IN ('app_staff','app_patient')
  )
  SELECT r.rolname,
         count(*) FILTER (WHERE has_sequence_privilege(r.oid,s.oid,'USAGE')),
         count(*) FILTER (WHERE has_sequence_privilege(r.oid,s.oid,'SELECT'))
  FROM roles r CROSS JOIN seq s GROUP BY r.rolname ORDER BY r.rolname;
  ROLLBACK;
  -- app_patient | 1 | 1
  -- app_staff   | 5 | 5
  ```
- **Что становится достижимо.** `SELECT last_value FROM schema.sequence`/`pg_sequences` раскрывает счётчик
  прикладной активности; `nextval()` возвращает новый value и с `USAGE` двигает sequence. PostgreSQL отдельно
  фиксирует, что `nextval` требует `USAGE` или `UPDATE`, а полученное значение не возвращается после rollback:
  [Sequence Manipulation Functions](https://www.postgresql.org/docs/16/functions-sequence.html). Таким образом,
  прямой клиент не только получает application value, но и может необратимо расходовать номера без контекста.
- **Наименьшее закрытие без нового компонента.** Зафиксировать ноль прямых sequence ACL у всех runtime/login roles.
  Если конкретной записи нужен sequence, она проходит через уже существующий exact attested definer seam, чей
  owner получает право только на named sequence. Acceptance §8 обходит все `relkind='S'` отдельно: после каждого
  разрешённого `SET ROLE` без context `SELECT`/`nextval` дают `42501`; positive path проверяется через named seam.
  Это уточнение уже объявленных declaration/seam механизмов.

### MEDIUM-1. Отозваны не все штатные пути к activity text

- **Механизм.** Revision 6 отзывает `SELECT` на `pg_stat_activity` и `EXECUTE` на
  `pg_stat_get_activity(integer)` (`SCHEME.md:25-32,255-259,300,344`). PostgreSQL 16 предоставляет ещё один
  публичный штатный accessor: `pg_stat_get_backend_activity(integer)`, который возвращает текст последнего запроса
  backend-а; backend ids перечисляет `pg_stat_get_backend_idset()`. Он прямо документирован в
  [Cumulative Statistics / Per-Backend Statistics Functions](https://www.postgresql.org/docs/16/monitoring-stats.html).
- **Предусловие.** Прямой клиент с паролем application login подключён одновременно с нормальной pool-сессией того
  же login. `track_activities=on`; текущий setting superuser-only и равен `on`.
- **Что становится достижимо.** Тот же real patient/clinic value, ради которого round 4 поднял `MEDIUM-1`, остаётся
  виден в активном SQL соседней сессии. Read-only two-session probe на exact DEV вернул один sentinel:

  ```bash
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
    "BEGIN TRANSACTION READ ONLY; SELECT pg_sleep(5) FROM
     (VALUES ('r5_patient_secret_sentinel')) AS v(secret); ROLLBACK;" & sentinel_pid=$!
  visible="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
    "BEGIN TRANSACTION READ ONLY;
     SELECT count(*) FROM pg_catalog.pg_stat_get_backend_idset() AS b(backend_id)
     WHERE pg_catalog.pg_stat_get_backend_pid(backend_id) <> pg_backend_pid()
       AND pg_catalog.pg_stat_get_backend_activity(backend_id)
           LIKE '%r5_patient_secret_sentinel%'; ROLLBACK;")"
  wait "$sentinel_pid"
  printf 'pg_stat_get_backend_activity_same_login_visible=%s\n' "$visible"
  # pg_stat_get_backend_activity_same_login_visible=1
  ```
- **Наименьшее закрытие без нового компонента.** В тех же declaration/sweep/acceptance строках отозвать у
  `PUBLIC`, login и runtime roles также `EXECUTE ON FUNCTION pg_catalog.pg_stat_get_backend_activity(integer)`.
  Sentinel acceptance проверяет все три access paths. Exact code search, затем exact `rg`, не нашли runtime/health
  consumer этого accessor; `pg_stat_activity` встречается только в disposable/admin scripts под owner connection:

  ```bash
  node /home/dev/brain/tools/code-search.mjs \
    "pg_stat_activity pg_stat_get_activity pg_stat_get_backend_activity health check" --repo bcb -k 30
  rg -n --glob '!docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/**' --glob '!docs/archive/**' \
    'pg_stat_activity|pg_stat_get_activity|pg_stat_get_backend_activity' .
  # runtime/health source: 0; postgres-integration/disposable admin scripts: 4 files
  ```

  Поэтому дополнительный revoke не ломает declared health path; при будущей доказанной потребности доступ получает
  только exact health seam owner, не login/runtime-role.

## Проверки, вернувшиеся чистыми

### Громкость grants/RLS и границы

1. **`INHERIT FALSE, SET TRUE, ADMIN FALSE` несёт ровно заявленную механику.** `INHERIT FALSE` не даёт login
   object privileges до switch, `SET TRUE` разрешает явный switch, `ADMIN FALSE` вместе с `NOCREATEROLE` не даёт
   передать membership. На локальном PG 16.14 exact catalog probe дал
   `inherit_option=f, set_option=t, admin_option=f, inherits_privs=f, can_set_role=t` для существующего
   `bcb_dev_runtime_staff_login → app_staff`. Это соответствует
   [SET ROLE](https://www.postgresql.org/docs/16/sql-set-role.html) и
   [Role Membership](https://www.postgresql.org/docs/16/role-membership.html).
2. **До первого switch table grant не протекает.** Login object ACL запрещён отдельным инвариантом §6.2; permission
   check relation выполняется до scan и ловит также `WHERE false`/`LIMIT 0`. После switch one-time форма
   `USING ((SELECT app.require_accepted_context()) AND predicate)` ставит InitPlan/One-Time Filter над indexed scan;
   acceptance содержит существующий/отсутствующий indexed probes. Исключение direct sequence ACL вынесено HIGH-1.
3. **Границы §1.1/§1.2 названы честно.** Обе прямо маркированы сознательными сужениями решения ведущего. Tableless
   SQL и no-scan не выпускают clinic/doctor/patient rows. За catalog boundary найден только конкретный третий
   activity accessor MEDIUM-1; других путей к application values в каталогах по схеме не заявлено.
4. **`ERROR` проходит текущий log threshold.** Команда

   ```sql
   SELECT name, setting, context FROM pg_settings
   WHERE name IN ('log_min_messages','log_min_error_statement') ORDER BY name;
   -- log_min_error_statement | error   | superuser
   -- log_min_messages        | warning | superuser
   ```

   и два read-only probes дали `caught_log_delta=0`, `uncaught_log_delta=257`: server-side PL/pgSQL handler может
   погасить denial, обычный `42501` логируется. Target не оставляет этот обход: §6.2 сначала отзывает все managed
   ACL у `PUBLIC`/login/runtime, object contour включает languages, а ни одной runtime-потребности в language
   `USAGE` не объявлено; exact function callers проверяются отдельно. Это согласуется с фактом `FACTS.md` §4 и не
   возвращает отвергнутое глобальное правило §9.2.

### Key exchange, dump, replay и rotation

5. **Primitive существует на заявленном PG.** Exact read-only query после database gate вернул
   `server_version=16.14`, `pgcrypto=1.3`,
   `app_ext.pgp_pub_encrypt_bytea(bytea,bytea)->bytea`, `app_ext.gen_random_bytes(integer)->bytea` и
   `app_ext.digest(bytea,text)->bytea`. `pgp_pub_encrypt_bytea` действительно шифрует public key и требует
   соответствующий secret key для decrypt:
   [PostgreSQL 16 pgcrypto](https://www.postgresql.org/docs/16/pgcrypto.html).
6. **Dump не даёт proof.** В state лежит `SHA-256(N)`, в verifier table — только public encryption key `P`.
   Возможность самому шифровать произвольный plaintext публичным `P` не расшифровывает server-issued ciphertext и
   не восстанавливает random 256-bit `N`.
7. **Logged proof не становится reusable port secret.** В SQL пересекает границу только `N` одного challenge.
   Transcript связан с database OID, `session_user`, target role, PID+backend start, transaction, class/purpose/args
   и expiry; atomic `ISSUED → ACCEPTED` закрывает второй consume. Dump+logged `N` подтверждают историческую пару,
   но после restore backend/transaction bindings не совпадут и fresh challenge использует новый nonce.
8. **Timing compare не даёт практического восстановления.** Verifier сравнивает hashes случайного 256-bit nonce.
   Даже ранний byte comparison раскрывал бы совпадающий prefix hash, а не биты preimage `N`; dump и так содержит
   этот hash. Constant-time extension/component для данного threat model не требуется.
9. **Rotation не оставляет security-window.** Новый `key_id/P` и private `K` кратко перекрываются со старой парой;
   consume повторно проверяет active key, поэтому challenge старого key после revoke отклоняется. Компрометация
   живого env/памяти до revoke честно названа остаточным риском.

### Владение, миграционное окно и regression

10. **Ownership map полна на уровне дизайна.** Ordinary objects принадлежат недостижимому
    `app_object_owner` (`NOLOGIN`, `NOBYPASSRLS`, без members/definer functions); definer functions — exact одному
    из 42 seam owners; administrative/system objects — `postgres`. Новый object class без exact declaration — FAIL.
11. **DDL исполняется заявленным owner.** Локальный `postgres` временно даёт migrator только exact owner
    memberships, меняет session authorization на `NOLOGIN` migrator и перед каждым schema DDL делает
    `SET LOCAL ROLE <declared_owner>`. Новый object сразу получает нужного owner, existing DDL получает owner-power.
12. **Оба migration controls сохранены.** Grant, migration, backfill, revoke и assertions находятся в одной
    transaction: crash до commit откатывает всё. Positive control использует representative real migration на
    disposable clone и проверяет новый/изменённый owner, backfill и чистый post-state; negative control убивает это
    же окно до commit и проверяет полный rollback. После commit migrator снова `NOLOGIN`, без `CONNECT`/membership.
13. **Divergence note присутствует и точна.** §1.3 прямо говорит, что известный webapp port может открыть exact
    attested pre-session transaction без human principal, хотя буквальная Ф3б говорит «неизвестный не получает
    соединения»; §10 содержит ровно этот owner question.
14. **Прежние closures проверены по исходным механизмам.** 12/12 round 1 и 4/4 round 2 остаются закрыты: port proof
    обязателен для pre-session; login не наследует runtime ACL; context связан с DB/login/backend/transaction;
    private key не хранится в БД; census берёт весь фактический `prosecdef`; caller GUC/UUID не authority; pinned
    `search_path`/no TEMP; restrictive gate остаётся за business OR; trigger/FK/UNIQUE/cascade и полный object
    contour входят в declaration; постоянного migrator BYPASS нет; powerful cluster paths allowlisted; ownership и
    DDL owner path названы. Round 3 transition mechanism остаётся рабочим, границы и Ф3б названы. Round 4 existence
    oracle и key algebra закрыты; activity closure неполна (MEDIUM-1), а четыре login — решённая граница brief.
15. **`FACTS.md` §9 не вернулся.** Нет правила бросать все application errors, AST/call-site auditor,
    capability-only target, утверждения «лог видит silent/extra visibility», неверной причины `search_path` или
    авторизации по переписи мест вызова. `row_security=off` остаётся fault detector после valid context.

## Граница результата

Это gate схемы, не источник реализации. BLOCKER-1/HIGH-1/MEDIUM-1 закрываются уточнением уже объявленных
accessor/declaration/seam механизмов; нового компонента не требуется. SQL выполнялся только read-only на exact local
`bcb_webapp_dev`; DDL/DML не выполнялись. `*_prod`, TEST, PROD, `secondbrain` и `storylama_*` не открывались.
Product code, `SCHEME.md`, `PLAN.md`, taskdb и остальные документы не менялись.
