# 39 — полнота `SCHEME.md`, финальный раунд

## Вердикт

**НЕТ — revision 7 пока не держит требуемое свойство. Найдено 2 finding: 1 BLOCKER и 1 LOW. Ранее закрытые
findings не переоткрылись (`reopened=0`).**

1. **BLOCKER — `pg_catalog.pg_stats` после `SET ROLE` отдаёт реальные sample values прикладных колонок без
   принятого контекста.**
2. **LOW — `pgcrypto` не поддерживает encryption master key, хотя §2.1 разрешает `[E]` key или subkey.**

Первый finding находится ровно за именованной границей §1.1, но границу не переоткрывает: каталог допустим только
пока в нём нет реальных данных клиник, врачей или пациентов. `pg_stats` содержит такие данные. Второй finding
fail-closed и не открывает данные, но разрешённая схемой ротация на `[E]` primary key ломает положительный путь.

Self-check числа findings:

```bash
report=docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/39-scheme-gaps-final.md
awk '/^### (BLOCKER|LOW)-/{all++; if($0~/^### BLOCKER-/) blocker++; else low++}
     END{print "findings=" all,"blocker=" blocker,"low=" low,"reopened=0"}' "$report"
# findings=2 blocker=1 low=1 reopened=0
```

Мера — `OWNER_DECISIONS.md` §«Права БД, роли и стены», `PLAN.md` §«ЕДИНСТВЕННОЕ, ЧТО НАДО ДОКАЗАТЬ»/Ф3б/Ф8,
`FACTS.md` §9 и границы lead-brief. Product code, схема, план, taskdb и БД не изменялись; SQL ниже был только
`BEGIN TRANSACTION READ ONLY ... ROLLBACK` на exact DEV-базе.

## Findings

### BLOCKER-1. `pg_stats` выпускает реальные значения прикладных колонок без контекста

- **Механизм.** До `SET ROLE` login действительно не наследует runtime ACL. Но standing membership
  `INHERIT FALSE, SET TRUE, ADMIN FALSE` намеренно позволяет прямому клиенту с паролем выполнить `SET ROLE`
  до attestation (`SCHEME.md:11-24,120-130`). После switch runtime-role имеет table/column `SELECT`, а громкий
  отказ должен нести restrictive policy с accessor (`154-170`). `pg_catalog.pg_stats` эту policy не вызывает:
  системный view читает `pg_statistic` с правами своего owner и показывает строки для колонок, на которые у caller
  есть `SELECT`. PostgreSQL прямо описывает `most_common_vals`, `histogram_bounds` и `most_common_elems` как
  сохранённые значения колонок и считает view публично читаемым именно по table/column privilege, а не по RLS:
  [PostgreSQL 16 — `pg_stats`](https://www.postgresql.org/docs/16/view-pg-stats.html).
- **Предусловие.** Украден действующий пароль любого application login; у его standing membership есть
  `SET TRUE`; атакующий делает `SET LOCAL ROLE app_staff`/`app_patient`, но challenge не расшифровывает и context
  не устанавливает. Это ровно обязательный negative path §8 п.3.
- **Что становится достижимо.** Без ошибки и без server-log event читаются cross-tenant samples реальных колонок:
  на проверенной DEV среди видимых имён есть `telegram_state.first_name/last_name/username`,
  `appointment_records.phone_normalized/payload_json`, `email_challenges.email`,
  `patient_bookings.contact_name/contact_email/contact_phone`, user/channel identifiers и другие patient/clinic
  поля. Значения не печатались, проверялись только признаки `IS NOT NULL`. Exact read-only проба:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE app_staff;
  SELECT current_user,
         count(*) FILTER (WHERE schemaname IN ('public','integrator','app','app_ext')) AS managed_stats_rows,
         count(*) FILTER (
           WHERE schemaname IN ('public','integrator','app','app_ext')
             AND (most_common_vals IS NOT NULL OR histogram_bounds IS NOT NULL
                  OR most_common_elems IS NOT NULL)
         ) AS rows_with_sample_values
  FROM pg_catalog.pg_stats;
  RESET ROLE;
  SET LOCAL ROLE app_patient;
  SELECT current_user,
         count(*) FILTER (WHERE schemaname IN ('public','integrator','app','app_ext')) AS managed_stats_rows,
         count(*) FILTER (
           WHERE schemaname IN ('public','integrator','app','app_ext')
             AND (most_common_vals IS NOT NULL OR histogram_bounds IS NOT NULL
                  OR most_common_elems IS NOT NULL)
         ) AS rows_with_sample_values
  FROM pg_catalog.pg_stats;
  ROLLBACK;
  -- app_staff   | 164 | 162
  -- app_patient |  24 |  24
  ```

  Команда запуска: `sudo -n -u postgres psql -X -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off`; первый
  statement того же блока подтвердил
  `bcb_webapp_dev | postgres | 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1) | transaction_read_only=on`.
- **Почему §1.1 не закрывает finding.** Lead разрешил catalog metadata, потому что оно не является clinic/doctor/
  patient data. Здесь view возвращает сами значения колонок, собранные `ANALYZE`, а не имена таблиц, OID или
  счётчики. Это точное исключение, разрешённое brief: named boundary можно оспорить только показав выход реальных
  данных — он показан.
- **Наименьшее закрытие без нового компонента.** В существующие declaration/generator/sweep добавить
  `REVOKE SELECT ON pg_catalog.pg_stats FROM PUBLIC` и запрет effective `SELECT` для login/runtime/service-ролей;
  оставить доступ поимённому `postgres`. Тем же списком безопасно закрыть data-bearing family
  `pg_stats_ext`/`pg_stats_ext_exprs` как forward invariant: сейчас под `app_staff` обе дали `visible_rows=0`, но
  их `PUBLIC SELECT` присутствует. Acceptance после каждого допустимого `SET ROLE` проверяет `42501` на три view и
  отдельно доказывает, что `most_common_vals`/`histogram_bounds` нельзя получить. Planner читает внутреннюю
  статистику не через privilege этого view, поэтому revoke не ломает планирование.
- **Потребителей, которых сломает revoke, не найдено.** Пустой результат доказан тремя способами:
  `node /home/dev/brain/tools/code-search.mjs "pg_stats most_common_vals histogram_bounds pg_stats_ext application runtime health" --repo bcb -k 30`;
  exact `rg -n --glob '!docs/archive/**' --glob '!docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/**' '\b(pg_stats|pg_stats_ext|pg_stats_ext_exprs|pg_statistic)\b' apps packages deploy docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD`;
  exact `rg` по `SCHEME.md`, `PLAN.md`, `FACTS.md` и evidence 28–38. Runtime/health consumer и уже объявленный
  revoke/invariant не найдены.
- **Минимальный acceptance kill-set.** Без context: login до switch не видит managed stats; каждая runtime-role
  после switch получает `42501` на `pg_stats`; выборка PII-колонки и `WHERE false` одинаково красные; positive
  administrative control под локальным `postgres` видит view. Fault injection — вернуть `PUBLIC SELECT`, после
  чего тот же sample-presence probe обязан стать красным для gate.

### LOW-1. Для `pgcrypto` нужен encryption subkey, не `[E]` master key

- **Механизм.** `SCHEME.md:60` допускает OpenPGP RSA/ElGamal key «с encryption-capable ключом или подключом
  `[E]`». Штатный `pgcrypto` действительно требует encryption-capable material и отвергает `[SC]`, но его
  documented limitation строже: encryption key как master key не поддерживается; нужен encryption subkey.
  [PostgreSQL 16 — ограничения PGP code](https://www.postgresql.org/docs/16/pgcrypto.html#PGCRYPTO-PGP-FUNC-SIG).
- **Предусловие.** Provisioning/rotation создаёт допустимый по буквальному §2.1 `[E]` primary/master key без
  encryption subkey и сохраняет его public part как `P`.
- **Что становится достижимо.** Данные не открываются: `pgp_pub_encrypt_bytea` падает fail-closed. Но оба порта не
  получают challenge, все positive controls останавливаются, а ротация неработоспособна.
- **Наименьшее закрытие.** В одной строке §2.1 заменить «ключом или подключом `[E]`» на «encryption-capable
  subkey `[E]`; `[SC]` и encryption master key не принимаются». Acceptance генерирует именно dedicated subkey и
  делает encrypt/decrypt round-trip до установки key record. Новый extension/component не нужен.
- **Переоткрытие прежнего finding:** нет. Revision 7 правильно закрыла `[SC]`; это оставшаяся узкая форма
  разрешённого `[E]` material.

## Проверки, вернувшиеся чистыми

### Переход login → runtime-role и громкость

1. **Membership работает как заявлено.** PostgreSQL 16 различает `INHERIT`, `SET` и `ADMIN`: `INHERIT FALSE`
   удерживает object privileges до switch, `SET TRUE` разрешает явный `SET ROLE`, а `ADMIN FALSE` вместе с
   `NOCREATEROLE` не позволяет выдавать membership дальше
   ([Role Membership](https://www.postgresql.org/docs/16/role-membership.html),
   [`SET ROLE`](https://www.postgresql.org/docs/16/sql-set-role.html)). Exact catalog probe существующего DEV-edge:

   ```sql
   SELECT member.rolname, granted.rolname,
          m.inherit_option, m.set_option, m.admin_option,
          pg_has_role(member.oid, granted.oid, 'USAGE') AS inherits_privileges,
          pg_has_role(member.oid, granted.oid, 'SET') AS can_set_role,
          member.rolcreaterole
   FROM pg_auth_members m
   JOIN pg_roles member ON member.oid=m.member
   JOIN pg_roles granted ON granted.oid=m.roleid
   WHERE member.rolname='bcb_dev_runtime_staff_login' AND granted.rolname='app_staff';
   -- bcb_dev_runtime_staff_login | app_staff | f | t | f | f | t | f
   ```

2. **До switch ACL действительно statement-level.** Login target имеет ноль application table/column/sequence
   ACL; permission check выполняется до scan, поэтому `WHERE false` и `LIMIT 0` не обходят `42501`. После switch
   one-time scalar subquery становится `InitPlan`/`One-Time Filter` над relation scan; existing/missing indexed
   probes одинаково вызывают accessor. Исключение за system view вынесено BLOCKER-1, direct sequence ACL revision 7
   запрещает полностью.
3. **Вторая смена роли закрыта в правильном месте.** Runtime policy вычисляет `current_user` от имени querying role,
   сравнивает его с DDL-literal и передаёт literal в `require_accepted_context(name)`. Внутри definer caller-role не
   читается. Для definer path отдельная owner-policy принимает только exact seam-owner и сверяет attested root-map.
   Между switch и следующим application relation scan пути к строкам не найдено, кроме BLOCKER-1.
4. **Uncaught `42501` попадает в текущий DEV server log.** Exact read-only settings query:

   ```sql
   SELECT name, setting, context FROM pg_settings
   WHERE name IN ('log_min_messages','log_min_error_statement') ORDER BY name;
   -- log_min_error_statement | error   | superuser
   -- log_min_messages        | warning | superuser
   ```

   `ERROR` проходит threshold `WARNING`; `log_min_error_statement=ERROR` добавляет failing statement
   ([PostgreSQL logging](https://www.postgresql.org/docs/16/runtime-config-logging.html)). Server-side handler может
   погасить ошибку — это известный факт `FACTS.md` §4, поэтому §8 обязан проверять каждый фактический definer-call
   без attestation именно по client error + server-log event. Declaration отзывает runtime language `USAGE` и
   не оставляет caller-доступных wrappers для гашения permission denial.
5. **Решённые границы не переоткрыты.** `SELECT 1`, `VALUES`, обычные catalog metadata и настоящий no-scan не
   выпускают application rows; отдельным finding стал только catalog view с фактическими samples. Plain `EXPLAIN`
   не выполняет accessor и показывает planner metadata/estimates; это no-execution metadata, а не row access, и
   отдельно finding не считается. Acceptance всё равно должна держать `EXPLAIN ANALYZE` красным без context.

### Activity-text family и health

6. **Catalog-driven enumeration закрывает заявленное семейство.** Exact read-only query

   ```sql
   SELECT p.proname, pg_get_function_identity_arguments(p.oid)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='pg_catalog'
     AND (p.proname LIKE 'pg_stat_get_backend_%' OR p.proname='pg_stat_get_activity')
   ORDER BY p.proname, 2;
   -- 14 signatures на PG 16.14: pg_stat_get_activity + 13 pg_stat_get_backend_*
   ```

   включает несущие `pg_stat_get_backend_idset()` и `pg_stat_get_backend_activity(integer)`. View
   `pg_stat_activity` и `pg_stat_get_activity(integer)` названы отдельно. Новый matching overload попадёт в revoke
   и sweep автоматически. Семейство возвращает activity text ровно через найденные документированные функции:
   [Per-Backend Statistics Functions](https://www.postgresql.org/docs/16/monitoring-stats.html#MONITORING-STATS-FUNCS-TABLE).
7. **Runtime/health consumer отсутствует.** Проверены:
   `node /home/dev/brain/tools/code-search.mjs "pg_stat_activity pg_stat_get_activity pg_stat_get_backend_activity health check" --repo bcb -k 30`;
   exact `rg` по source/deploy вне archive/evidence; и DB reverse-reference:

   ```sql
   SELECT count(*)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind='f'
     AND pg_get_functiondef(p.oid) ~ 'pg_stat_(get_activity|get_backend_)';
   -- 0
   ```

   Поэтому revoke не ломает объявленные health probes; sentinel через `idset → backend_activity` остаётся
   административной acceptance-пробой под `postgres`.

### Challenge, dump, replay и rotation

8. **Private key не пересекает SQL boundary.** В БД/dump есть только public encryption key `P`, transcript и
   hashes state; proof — случайный 32-byte `N` одного challenge. `pgp_pub_encrypt_bytea` шифрует public key, а
   decrypt требует соответствующий secret key
   ([PostgreSQL 16 `pgcrypto`](https://www.postgresql.org/docs/16/pgcrypto.html)).
9. **Dump, proof и их сочетание не mint-ят fresh context.** Dump не расшифровывает fresh ciphertext; logged `N`
   относится к одному challenge. Hash сравнивается вместе с database OID, `session_user`, target role,
   PID/backend start, transaction, class/purpose/typed args и expiry; `ISSUED → ACCEPTED` атомарен. Restore меняет
   backend/transaction bindings, fresh issue создаёт новый `N`.
10. **Timing comparison не даёт практического key oracle.** Сравниваются SHA-256 hashes случайного 256-bit nonce;
    dump уже содержит hash, а ранний byte compare не превращает поиск preimage `N` в побайтовый. Новый constant-time
    extension не нужен.
11. **Rotation fail-closed.** Consume повторно требует active `key_id`; challenge старого key после revoke не
    принимается. Короткий overlap двух active public/private пар объявлен, компрометация живого env/памяти до revoke
    честно названа остаточным риском.

### Ownership, migration и прежние findings

12. **Ownership не откатилось.** Ordinary application objects принадлежат недостижимому `app_object_owner`
    (`NOLOGIN`, `NOBYPASSRLS`, без members и definer functions); 42 definer seams имеют exact owners; admin,
    extension и system objects — `postgres`. Новый object class без строки map/declaration — FAIL. Владение relation
    не даёт runtime-обход: owner под `FORCE RLS` и без `BYPASSRLS` подчиняется policy.
13. **DDL идёт как declared owner.** Локальный `postgres` в одной транзакции временно выдаёт `NOLOGIN` migrator
    только exact owner-memberships, меняет session authorization и перед каждым schema DDL делает
    `SET LOCAL ROLE <declared_owner>`. Новый object сразу получает target owner; existing DDL получает owner-power.
    Backfill после reset выполняет поимённый `postgres`.
14. **Оба migration controls сохранены.** Grant/migration/backfill/revoke/assertions атомарны; crash до commit
    откатывает всё. Positive control применяет representative real migration и проверяет owner нового/изменённого
    объекта, backfill и clean post-state; negative control убивает то же окно до commit и проверяет полный rollback.
    После commit migrator остаётся `NOLOGIN`, без `CONNECT` и membership; цена local-only migration названа.
15. **Divergence note присутствует и точна.** `SCHEME.md:42-45` и `PLAN.md` Ф3б одинаково фиксируют: неизвестный
    человек не получает DB credentials, но известный webapp port может открыть exact attested pre-session transaction
    без human principal. §10 содержит ровно этот owner question.
16. **Round 1: 12/12 исходных механизмов остаются закрыты.** Повторно проверены pre-session proof; inheritance;
    pool/backend/transaction/role binding; отсутствие HMAC-secret в БД; полный per-database definer census;
    caller GUC/UUID; pinned `search_path`/no TEMP; restrictive policy за business OR; trigger/FK/UNIQUE/cascade;
    sequences/views/matviews/FDW/LO contour; crash/BYPASS; powerful cluster paths. BLOCKER-1 — новый catalog-view
    путь, не возврат G1–G12.
17. **Round 2: 4/4 остаются закрыты.** One-time gate; исполняемый challenge/verifier; `app_object_owner` map;
    DDL exact-owner path и оба migration controls сохранены.
18. **Rounds 3–5 closures сохранены.** Standing transition существует; boundaries названы; raw key не передаётся;
    second switch сверяется policy-literal; existence oracle закрыт one-time gate; direct sequence ACL запрещён;
    activity family выбирается каталогом; seam-side role check отделён от runtime check; migrator `NOLOGIN`; `[SC]`
    отвергнут. LOW-1 уточняет поддержанный вид `[E]`, не возвращает прежний cryptographic design.
19. **`FACTS.md` §9 не вернулся.** Нет глобального «всегда бросать» для application errors, AST/call-site proof,
    capability-only target, утверждения «лог видит silent/extra visibility», неверной причины `search_path` или
    старого plan v4 как authority. Mandatory C extension не возвращён и новый component не предложен.

## Граница проверки

- Канон прочитан: `AGENTS.md` §24, `README.md`, `docs/README.md`, `OWNER_DECISIONS.md` нужный раздел, `PLAN.md`,
  `FACTS.md` §4/§9, `SCHEME.md`, evidence 26/28–38 и relevant census evidence 30.
- Репозиторный поиск начинался с `code-search`; exact `rg` использовался только по уже известным identifiers.
- SQL выполнялся только на host `151.241.228.122`, exact database `bcb_webapp_dev`, PostgreSQL 16.14, под
  `BEGIN TRANSACTION READ ONLY ... ROLLBACK`. DDL и DML не выполнялись. TEST, PROD, `*_prod`, `secondbrain` и
  `storylama_*` не открывались.
- Изменён только этот report.
