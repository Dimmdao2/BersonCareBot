# 28 — адверсарный аудит полноты `SCHEME.md` (гейт Ф1)

## Вердикт

**НЕТ — свойство в записанном виде не держится. Найдено 12 разрывов: 5 критических и 7 высоких.**

Главный разрыв уже внутри самого текста: §2 разрешает pre-session `SECURITY DEFINER`-швы без подписанного
контекста, а §12 требует, чтобы каждая definer-функция без контекста отказала. Прямое соединение с паролем
pre-session login поэтому неотличимо для PostgreSQL от вызова того же шва портом и может получать данные без
ключа. Строить Ф4 по этой схеме нельзя до закрытия разрывов ниже.

Гейт проверяет только owner-свойство из `OWNER_DECISIONS.md:206-222` и `PLAN.md:19-37`: никто, кроме двух
портов с ключом, не получает данные; перечислены только `postgres` и migrator в окне. Это не новый scope.

## Критические разрывы

### G1. Pre-session и cross-tenant seams обходят ключ по построению

- **Механизм.** `SCHEME.md:35-37` оставляет неопознанному запросу точные `EXECUTE` на auth/resolver seams;
  `SCHEME.md:224-237` разрешает их владельцам cross-tenant `USING (true)`. Одновременно
  `SCHEME.md:303-311` требует отказа каждого login/role и каждой definer-функции без контекста. PostgreSQL не
  знает, вызвал функцию webapp-порт или прямой клиент с тем же login: проверяется только `EXECUTE` и затем права
  definer-owner.
- **Предусловие.** Украден пароль `<env>_webapp_patient` или `<env>_integrator`; у login есть предусмотренный
  схемой `EXECUTE`, но нет ключа порта.
- **Что становится доступно.** Как минимум идентификаторы пользователей/организаций и операционные данные:
  `find_platform_user_ids_by_any_confirmed_email(text)` возвращает `user_id` по caller-supplied email
  (`apps/webapp/db/drizzle-migrations/0379_user_contacts_d15b6_local.sql:176-189`),
  `resolve_outgoing_delivery_scope(uuid)` возвращает `queue_kind` и `organization_id`
  (`apps/webapp/db/drizzle-migrations/0367_auth_email_otp_delivery_queue_local.sql:24-50`), payment resolver
  возвращает organization UUID
  (`apps/webapp/db/drizzle-migrations/0226_payment_capture_replay_safety.sql:69-115`). Это уже больше требуемого
  «ничего».
- **Минимальное закрытие.** Любой definer-вызов, включая pre-session/public/worker lookup, принимает и проверяет
  короткоживущую подпись порта, связанную с backend, точной функцией/purpose и параметрами вызова. Отсутствие
  установленной личности может менять payload capability, но не отменяет доказательство ключа порта.
- **Опора.** Точные тела найдены командами
  `node /home/dev/brain/tools/code-search.mjs "find_platform_user_ids_by_any_confirmed_email resolve_outgoing_delivery_scope function" --repo bcb -k 20`
  и `rg -n "CREATE OR REPLACE FUNCTION app\.(find_platform_user_ids_by_any_confirmed_email|resolve_outgoing_delivery_scope|resolve_payment_webhook_organization|resolve_public_booking_organization)" deploy/postgres apps/webapp/db`.

### G2. Login-роли по умолчанию наследуют все runtime-права порта

- **Механизм.** `SCHEME.md:67-79` задаёт memberships, но не задаёт атрибуты login и опции каждого membership.
  PostgreSQL 16 создаёт роли с `INHERIT`, а membership по умолчанию имеет `INHERIT TRUE`, `SET TRUE`; значит login
  сразу использует сумму прав всех своих runtime-ролей без `SET ROLE`. `SET ROLE` также разрешает выбрать любую
  роль, достижимую от исходного `session_user` по цепочке `SET TRUE`, независимо от текущей роли. Runtime-атрибуты
  в `SCHEME.md:83-85` этого не исправляют.
- **Предусловие.** Ровно целевой graph: staff login является членом staff, billing, platform, worker, media и
  telemetry ролей; integrator login — трёх integrator ролей.
- **Что становится доступно.** Прямому login — объединённые ACL всех этих ролей; к нему применяются политики всех
  унаследованных ролей. Уже отдельно не закрытые sequences из G10 читаются сразу; любая policy/capability без
  context accessor тоже становится прямым каналом. После получения одного подписанного ORG-контекста можно
  переключиться из staff в billing, если подпись не связана с exact role (G3).
- **Минимальное закрытие.** Все прикладные login: `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  NOBYPASSRLS NOINHERIT`; каждое ребро: `WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`; все прочие рёбра — отсутствуют.
  Декларация и сверка обязаны сравнивать три membership options, а не только пару member/role.
- **Опора.** `SCHEME.md:107` уже задаёт `NOINHERIT` владельцам швов, но не login. Фактические опции снимались
  точной командой из `evidence/26-roles-and-logins-from-need.md:399-406`. Семантика — официальные разделы
  PostgreSQL [Role Membership](https://www.postgresql.org/docs/16/role-membership.html) и
  [`SET ROLE`](https://www.postgresql.org/docs/current/sql-set-role.html).

### G3. Контекст не связан с exact role и транзакцией; pool/backend reuse сохраняет чужую личность

- **Механизм.** Подписанные поля в `SCHEME.md:38-42` не включают `session_user`, exact `current_user`, database и
  transaction/pool lease. `SCHEME.md:47-48` полагается только на успешный application cleanup. Если connection
  вернулся в пул без cleanup, backend тот же и контекст действителен до expiry; nonce уже принят и здесь ничего
  не проверяет. Источник схемы привязывает строку только к `pg_backend_pid()`
  (`evidence/26-roles-and-logins-from-need.md:537-548`;
  `evidence/25-definer-seams-without-bypassrls.md:24-28`), а PID может быть повторно использован новым backend
  после завершения старого.
- **Предусловие.** Исключение/abort/cancel между запросом и cleanup, ошибочный возврат client в пул либо завершение
  backend с оставшейся неистёкшей строкой и повтор PID; TTL ещё не истёк.
- **Что становится доступно.** Следующий пользователь пула получает строки предыдущей организации/пациента; при
  нескольких `SET TRUE` memberships один ORG-контекст можно использовать под другой runtime-ролью.
- **Минимальное закрытие.** Подпись и DB-row связываются одновременно с database, `session_user`, exact
  `current_user`, `backend_start`/случайным session challenge и exact transaction/lease id. Контекст годен только в
  одной транзакции; checkout сначала доказывает отсутствие context; ошибка cleanup уничтожает физическое
  соединение, а не возвращает его в pool.
- **Опора.** Текущий backend-only key доказан точной командой П11 в
  `evidence/26-roles-and-logins-from-need.md:537-549`; lifecycle-обещание — только `SCHEME.md:47-52`.

### G4. HMAC нельзя одновременно проверять в БД и хранить secret «только в env порта»

- **Механизм.** `SCHEME.md:33-34` говорит, что `DB_PRINCIPAL_SIGNING_SECRET` не хранится в таблице. Но
  `SCHEME.md:50-51` называет таблицу ключа, а `SCHEME.md:113` даёт `app_seam_context_owner` чтение signing secret.
  HMAC-verifier технически обязан знать тот же secret, которым подписывает порт.
- **Предусловие.** Схема реализуется как HMAC, как прямо записано в `SCHEME.md:41`.
- **Что становится доступно.** Вариант «секрета нет в БД» неработоспособен и не установит ни один контекст;
  вариант «секрет лежит в БД» нарушает owner-требование «ключ живёт в env порта и больше нигде» и превращает
  чтение secret-table/backup в возможность подписывать любой principal.
- **Минимальное закрытие.** Асимметричная подпись: private signing key только в env двух портов, в PostgreSQL —
  только public verification key. В схеме удалить все упоминания DB-таблицы signing secret и оставить owner
  контекста доступ только к public verifier, nonce и context.
- **Опора.** Противоречащие строки — `SCHEME.md:33-34`, `50-52`, `113`; owner-требование —
  `OWNER_DECISIONS.md:291-301` и `PLAN.md:134-145`.

### G5. Census покрывает не все `SECURITY DEFINER`: 95 функций остаются вне схемы

- **Механизм.** `SCHEME.md:104-153` распределяет 132 функции и отдельно 4 health-функции. Read-only catalog
  census на DEV дал **231 total, 132 в исходном app_owner-census, 4 health, 95 вне схемы**. Из этих 95 ровно
  88 принадлежат login-migrator `bcb_webapp_dev_user`; остальные принадлежат `saas_telemetry_owner`, runtime-role
  и отдельному definer-owner. Владелец функции может менять ACL/body и снова выдать себе `EXECUTE`; login-owner
  тем самым остаётся постоянным каналом вне migration window.
- **Предусловие.** Closure сохраняет любую из 95 функций, потому что в `SCHEME.md` нет её целевого owner/seam.
- **Что становится доступно.** Точная поверхность зависит от body каждой пропущенной функции; для 88 функций
  прямой migrator-login остаётся владельцем и может исполнять/переписать definer-шов вне объявленного окна.
- **Минимальное закрытие.** Census строится из всех `pg_proc.prosecdef` во всех managed schemas, а не из функций
  одного owner. Каждая функция получает решение: конкретный NOLOGIN seam-owner, `SECURITY INVOKER` или удаление;
  ноль функций принадлежит login/runtime роли.
- **Опора и число.** Выполненная команда (только `BEGIN TRANSACTION READ ONLY ... ROLLBACK`):

  ```sql
  WITH d AS (
    SELECT pg_get_userbyid(p.proowner) owner,count(*) n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE p.prosecdef AND ns.nspname NOT IN ('pg_catalog','information_schema')
    GROUP BY p.proowner
  )
  SELECT sum(n),
         sum(n) FILTER (WHERE owner='app_owner'),
         sum(n) FILTER (WHERE owner='saas_system_health_owner'),
         sum(n) FILTER (WHERE owner NOT IN ('app_owner','saas_system_health_owner'))
  FROM d;
  -- 231 | 132 | 4 | 95
  ```

  Сам источник уже признаёт отдельно не классифицированные 88 функции:
  `evidence/25-definer-seams-without-bypassrls.md:13-18`.

## Высокие разрывы

### G6. Caller-controlled identifier/GUC становится полномочием definer-owner

- **Механизм.** `SCHEME.md:237` допускает «transaction-local точный идентификатор». В исходном SQL швов 26/27
  policy доверяет `current_setting('app.*_queue_id')`
  (`evidence/25-definer-seams-without-bypassrls.md:299-312`), а body принимает queue UUID от caller. Любая роль
  PostgreSQL может поставить custom GUC своего session/transaction; факт, что значение transaction-local, не
  делает его доверенным.
- **Предусловие.** Caller имеет `EXECUTE` шва и знает/угадывает UUID чужой queue row.
- **Что становится доступно.** Чтение или изменение чужой queue row с полномочиями seam-owner; тот же класс
  ошибки применим к любому `USING(true)` seam, который возвращает строку по caller-supplied identifier.
- **Минимальное закрытие.** Не использовать caller-writable GUC/argument как authority. Порт подписывает exact
  function purpose + row identifier; definer проверяет подпись до первого чтения и сам устанавливает owner-private
  transaction marker. Для уже идентифицированного principal идентификатор дополнительно связывается с signed
  tenant/patient.
- **Исполняемое доказательство механизма.** На `bcb_webapp_dev`, без DDL/DML:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL app.audit_probe_queue_id = '00000000-0000-4000-8000-000000000001';
  SELECT current_setting('app.audit_probe_queue_id', true);
  ROLLBACK;
  -- 00000000-0000-4000-8000-000000000001
  ```

### G7. Для definer-функций не закреплён безопасный `search_path`; `TEMP` тоже не отозван

- **Механизм.** `SCHEME.md:104-153` фиксирует owner/ACL/policy, но нигде не требует function-level
  `SET search_path` и schema-qualified references. `SCHEME.md:307-308` отзывает у `PUBLIC` только CONNECT/USAGE,
  не database `TEMPORARY`. PostgreSQL ищет writable temporary schema раньше неявно включённых schemas; unqualified
  table/type/operator/function в `SECURITY DEFINER` может быть подменён объектом caller.
- **Предусловие.** Хотя бы одно unqualified имя в definer body и право caller создать temp object либо объект в
  другой writable schema.
- **Что становится доступно.** Полная named-column/table поверхность owner конкретного seam, вплоть до auth
  secrets и cross-tenant строк.
- **Минимальное закрытие.** Для каждого definer: `SET search_path = pg_catalog, pg_temp` (либо только trusted
  schemas, затем `pg_temp`) и полная квалификация app/public/integrator/app_ext объектов; database `TEMPORARY`
  отозван у `PUBLIC` и runtime login, если он не доказан нужен. Двусторонняя сверка проверяет `pg_proc.proconfig`.
- **Опора.** Read-only команда C2 ниже дала 231 функцию с пятью вариантами, включая
  `search_path=app, pg_catalog` и `search_path=app, public, pg_catalog`, но ни один target-инвариант в схеме.
  Официальное правило: PostgreSQL
  [Writing SECURITY DEFINER Functions Safely](https://www.postgresql.org/docs/16/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

### G8. Схема предполагает AND, а permissive RLS policies складываются через OR

- **Механизм.** `SCHEME.md:19-22` требует одновременного совпадения четырёх условий, но декларация не фиксирует
  `AS RESTRICTIVE` и не запрещает вторую применимую permissive policy. В PostgreSQL permissive policy — default;
  несколько применимых policies объединяются `OR`, а roles в `TO` учитывают membership. Одна будущая policy без
  context accessor снимает обязательность всех остальных.
- **Предусловие.** На одной таблице/command применимы две permissive policies — например tenant policy и
  public/operational policy либо policies двух унаследованных ролей из G2.
- **Что становится доступно.** Все строки, пропущенные более широкой веткой OR, даже если exact principal/tenant
  predicate другой ветки не прошёл.
- **Минимальное закрытие.** Отдельная `AS RESTRICTIVE` context-gate policy для каждой runtime role/command/table;
  business policies могут быть permissive только за ней. Альтернатива — ровно одна применимая permissive policy,
  содержащая весь `AND`, с catalog-инвариантом, запрещающим вторую.
- **Опора.** Исходный census прямо показывает почти полностью permissive состояние
  (`evidence/25-definer-seams-without-bypassrls.md:551-562`). Семантика — PostgreSQL
  [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

### G9. FK/UNIQUE и triggers отсутствуют в модели транзитивной силы шва

- **Механизм.** `SCHEME.md:162-217` моделирует только ACL + RLS/FORCE + policy. Census Ф3 ищет прямые textual
  relation references только среди `relkind IN ('r','p')`
  (`evidence/25-definer-seams-without-bypassrls.md:472-515`); он не раскрывает вызываемые функции, trigger bodies,
  FK cascades и constraint probes. PostgreSQL выполняет referential-integrity checks в обход RLS и предупреждает
  о covert-channel через разницу success/violation.
- **Предусловие.** Caller-reachable mutation seam или runtime DML пишет tenant-таблицу с global UNIQUE/FK либо
  запускает trigger, который читает/пишет более широкую поверхность.
- **Что становится доступно.** Как минимум факт существования cross-tenant key/value через различающиеся ошибки;
  при owner/definer trigger — чтение либо mutation строк вне signed tenant.
- **Минимальное закрытие.** В seam declaration добавить транзитивную поверхность `pg_trigger` и constraints для
  каждой writable relation. Tenant uniqueness/FK включает tenant key либо seam проверяет signed scope и не
  раскрывает cross-tenant outcome; trigger-definer входит в полный census G5 и имеет тот же exact owner/context.
- **Опора.** PostgreSQL прямо фиксирует bypass в
  [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html); ограниченность текущей
  команды — её точный `c.relkind IN ('r','p')` и lexical body match в
  `evidence/25-definer-seams-without-bypassrls.md:474-515`.

### G10. Sequences, views, materialized/foreign tables и large objects выпали из declaration/sweep

- **Механизм.** `SCHEME.md:256-269` перечисляет database/schema/table/column/function ACL, но не sequence ACL,
  view options/owners, materialized views, foreign servers/user mappings и large-object ACL. `SCHEME.md:276`
  закрывает только **default** sequence privileges — уже существующие grants generator не отзывает и сверка не
  видит. Обычный view по умолчанию применяет права/RLS view-owner, не caller; materialized view хранит строки без
  RLS.
- **Предусловие.** Сохранился sequence grant, runtime получает SELECT на non-`security_invoker` view, появляется
  materialized/foreign relation или large object с данными.
- **Что становится доступно.** Текущие/следующие sequence values; через owner-view — base rows мимо caller RLS;
  через materialized/foreign/large object — хранимые или удалённые данные вне таблиц схемы.
- **Минимальное закрытие.** Declaration/revoke/sweep/acceptance охватывают `relkind S/v/m/f`, large objects,
  foreign server/FDW/user mappings. Views по умолчанию `security_invoker=true`; любое definer-view — отдельный
  именованный seam. Materialized/foreign data либо запрещены, либо получают отдельную exact wall/capability.
- **Исполняемое доказательство текущей поверхности.** Read-only команды C1/C3 ниже дали **6 sequences** и
  **28 ACL-строк**, включая `SELECT/USAGE` для `app_staff` и `app_patient`. В том же census `v/m/f = 0`, то есть
  для них сейчас чисто, но target-gate отсутствует. Семантика view — PostgreSQL
  [`CREATE VIEW`](https://www.postgresql.org/docs/current/sql-createview.html).

### G11. Временный `ALTER ROLE ... BYPASSRLS` переживает crash wrapper

- **Механизм.** `SCHEME.md:241-250` делает BYPASSRLS и memberships постоянными catalog changes, а снятие доверяет
  normal exit/error/signal handler. `SIGKILL`, смерть host/runner или потеря соединения между grant и cleanup не
  запускают handler; роль остаётся LOGIN+BYPASSRLS после завершения фактического окна. Post-state проверка есть
  только в успешно дошедшем wrapper.
- **Предусловие.** Crash после строки 245/246 и до 247-250.
- **Что становится доступно.** Любое данное таблиц, на которые у migrator есть ACL/ownership, по прямому migrator
  password вне окна; BYPASSRLS игнорирует все policies, включая FORCE.
- **Минимальное закрытие.** Не сохранять BYPASSRLS у migrator: backfill выполняется в одной контролируемой
  superuser-транзакции (уже объявленное исключение `postgres`) либо иной session-scoped elevation без catalog
  lease. Если временный attribute остаётся, runtime/CONNECT открывается только через независимый startup gate,
  который сначала безусловно снимает elevation и проверяет каталог после любого reboot/crash; одного trap
  недостаточно.
- **Опора.** Точные шаги — `SCHEME.md:241-250`; owner допускает elevation только в окне —
  `OWNER_DECISIONS.md:275-289`, `PLAN.md:119-126`.

### G12. Проверка исключений не охватывает replication, server files/program, FDW/extensions и DB ownership

- **Механизм.** `SCHEME.md:312-313` краснит только неожиданный `rolbypassrls`, membership/ACL/policy; login attrs
  вообще не перечислены. PostgreSQL даёт отдельные пути вне обычных table ACL/RLS: `SUPERUSER`, `REPLICATION`,
  `CREATEROLE`; predefined `pg_read_server_files`, `pg_write_server_files`, `pg_execute_server_program`,
  `pg_read_all_data`/`pg_write_all_data`; database owner/CREATE/TEMP; foreign server/user mapping; trusted extension
  creation. Проверочный `SELECT` по классам таблиц не доказывает отсутствие `COPY ... PROGRAM`, чтения server
  files, physical/logical replication или remote FDW.
- **Предусловие.** Любой неименованный login имеет один такой attribute/membership/ownership либо `USAGE` на
  foreign server/user mapping.
- **Что становится доступно.** Файлы/команды OS-пользователя PostgreSQL, WAL/base backup или logical stream,
  remote data и возможность создать объект, подменяющий доверенный path. Эти каналы сильнее RLS и не требуют
  подписанного context.
- **Минимальное закрытие.** Cluster-wide allowlist из фактических `pg_roles`/memberships/owners: только `postgres`
  имеет super/file/program/replication power; у всех остальных явно false/absent. Acceptance отдельно инвентаризует
  database/schema/tablespace ownership, extensions/languages, publications/subscriptions/replication slots,
  FDW/servers/user mappings и server-file/program roles; всё незаявленное — FAIL.
- **Опора.** На текущем DEV выполненная catalog-команда для шести powerful predefined roles вернула 0 memberships
  — текущее состояние чисто, но такого инварианта нет в target scheme. Семантика — PostgreSQL
  [Predefined Roles](https://www.postgresql.org/docs/17/predefined-roles.html). Отдельно
  `pg_db_role_setting` хранит per-database defaults, невидимые в `pg_roles.rolconfig`; команда
  C4 ниже дала 8 текущих строк, а declaration их не нормализует. Каталог: PostgreSQL
  [`pg_db_role_setting`](https://www.postgresql.org/docs/16/catalog-pg-db-role-setting.html).

## Проверки, вернувшиеся чистыми

1. **FORCE и отсутствие постоянного BYPASS в целевой конструкции.** `SCHEME.md:162-164`, `216-220` требует
   RLS+FORCE, seam-owner не владеет таблицей, все runtime/seam/health/migrator в steady state — NOBYPASSRLS.
   Механика PostgreSQL здесь описана верно.
2. **PUBLIC function ACL.** `SCHEME.md:109`, `262-269`, `276-283` отзывает default `EXECUTE` у PUBLIC, выдаёт
   exact caller и применяет generator одной транзакцией; окна между CREATE и REVOKE в целевой reapplication нет.
3. **`row_security=off`.** `SCHEME.md:309-311` использует его как detector тихой фильтрации, не как обход. Это
   совпадает с PostgreSQL: setting вызывает ошибку, когда policy отфильтровала бы строки, но сам RLS не обходит.
4. **Текущие views/materialized/foreign relations.** Команда
   C1 ниже вернула только `S=6, i=829, r=227`; `v/m/f` сейчас отсутствуют. Это не снимает G10: target не запрещает
   их появление и не сверяет.
5. **Текущие powerful predefined memberships.** Read-only join `pg_auth_members` → `pg_roles` по
   `pg_read_all_data`, `pg_write_all_data`, `pg_read_server_files`, `pg_write_server_files`,
   `pg_execute_server_program`, `pg_create_subscription` (команда C5) вернул 0 строк. Это текущий clean result, не
   target-gate.
6. **Function-level search_path не отсутствует полностью.** Read-only команда C2 по 231 `prosecdef` не нашла ни
   одной `proconfig IS NULL`/без `search_path`; G7 относится к небезопасной форме и отсутствию инварианта, а не к
   утверждению «search_path нигде нет».
7. **Nonce/expiry/HMAC nominal checks присутствуют.** `SCHEME.md:38-46` проверяет HMAC, expiry, nonce и backend;
   G3 — про lease/transaction/PID reuse после успешной установки, G4 — про невозможное место хранения HMAC key.

## Вопрос владельцу, не finding и не новая задача

**Какой из двух уже именованных exception обслуживает backup?** Канонический
`deploy/postgres/postgres-backup.sh:5-11,471-512` берёт application `DATABASE_URL` и запускает `pg_dump` напрямую.
После точного применения схемы такой dump без signed context обязан упасть (это безопасный исход), но backup через
«порт» технически не является `pg_dump`. Нужен owner-выбор: backup выполняется через уже разрешённый `postgres`
локально/offline либо migrator внутри отдельного объявленного окна. Новый постоянный backup-login из этого аудита
не выводится.

## Команды и граница SQL-проверки

Все catalog-пробы выполнялись только после точного host/database gate:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
[ -n "$DATABASE_URL" ] || exit 1
db_target="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')"
[ "$db_target" = bcb_webapp_dev ] || exit 1
```

Каждый многострочный SQL-блок начинался `BEGIN TRANSACTION READ ONLY;` и завершался `ROLLBACK;`. Identity output:
`bcb_webapp_dev | bcb_webapp_dev_user | 127.0.0.1 | 5432 | PostgreSQL 16.14`. Ни DDL, ни DML, ни TEST/PROD/чужая
БД не выполнялись. Репозиторный поиск начинался командой
`node /home/dev/brain/tools/code-search.mjs "security definer search_path principal_context install_signed_context" --repo bcb -k 20`,
после чего точные строки проверялись `rg`/`nl -ba`.

Точные catalog-команды, на которые ссылаются результаты выше:

```sql
-- C1: классы объектов
SELECT c.relkind, count(*)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('app','public','integrator')
GROUP BY c.relkind ORDER BY c.relkind;

-- C2: function-level settings и отсутствие definer без search_path
SELECT p.proconfig,count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
GROUP BY p.proconfig ORDER BY count(*) DESC;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND (p.proconfig IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
  ))
ORDER BY n.nspname,p.proname;

-- C3: ACL всех managed sequences
SELECT n.nspname,c.relname,
       CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
       x.privilege_type,x.is_grantable
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('S',c.relowner))) x
WHERE n.nspname IN ('app','public','integrator') AND c.relkind='S'
ORDER BY n.nspname,c.relname,grantee,x.privilege_type;

-- C4: role/database settings (включая невидимые в pg_roles.rolconfig per-database rows)
SELECT r.rolname, d.datname, s.setconfig
FROM pg_db_role_setting s
LEFT JOIN pg_roles r ON r.oid=s.setrole
LEFT JOIN pg_database d ON d.oid=s.setdatabase
WHERE s.setrole=0 OR r.rolname !~ '^pg_'
ORDER BY r.rolname NULLS FIRST,d.datname NULLS FIRST;

-- C5: memberships в мощных predefined roles
SELECT member.rolname AS member, granted.rolname AS granted,
       m.admin_option,m.inherit_option,m.set_option
FROM pg_auth_members m
JOIN pg_roles member ON member.oid=m.member
JOIN pg_roles granted ON granted.oid=m.roleid
WHERE granted.rolname IN (
  'pg_read_all_data','pg_write_all_data','pg_read_server_files','pg_write_server_files',
  'pg_execute_server_program','pg_create_subscription'
)
ORDER BY member.rolname,granted.rolname;
```
