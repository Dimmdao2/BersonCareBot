# 33 — полнота `SCHEME.md`, round 3

> **ИСТОРИЧЕСКИЙ AUDIT; LOGIN TOPOLOGY ЗАМЕНЕНА 12.08.2026.** Выводы про три runtime login/global-admin через
> staff относятся к старой revision. Target — четыре runtime login при двух ports; см. SCHEME revision 11.

## Вердикт

**НЕТ — свойство в revision 4 не держится. Найдено 4 разрыва: 1 блокирующий, 2 высоких и 1 существенный.**

**Ранее закрытые findings не открылись заново: 12/12 из round 1 и 4/4 из round 2 остаются закрыты в том точном
виде, в котором были сформулированы.** Но замена C-hook на grants+hash создала два новых несущих разрыва, один
остаток буквального критерия стал достижимым снова без C-hook, и сохранилось одно прямое расхождение с owner-составом
логинов.

1. **BLOCKER — после attestation нет исполнимого перехода из login-роли в runtime-role.**
2. **HIGH — grants не дают громкого отказа для запросов без application table.**
3. **HIGH — предъявляемый port key может попасть в server log как bind parameter.**
4. **MEDIUM — схема заводит четыре login вместо трёх, прямо заданных владельцем.**

Точная self-check команда для числа findings:

```bash
report=docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/33-scheme-gaps-r3.md
awk '/^### (BLOCKER|HIGH|MEDIUM)-/{all++; if ($0~/^### BLOCKER-/) blocker++;
     else if ($0~/^### HIGH-/) high++; else medium++}
     END{print "findings=" all,"blocker=" blocker,"high=" high,"medium=" medium}' "$report"
# findings=4 blocker=1 high=2 medium=1
```

Мера — `OWNER_DECISIONS.md:206-222,260-273,291-320`, `PLAN.md:19-37,99-146,189-196`. Findings ниже не создают
нового scope: каждый нарушает уже записанный owner-критерий, положительный контроль либо точный состав входов.

## Findings

### BLOCKER-1. После attestation нет исполнимого перехода в runtime-role

- **Механизм схемы.** До контекста login намеренно не имеет ни table ACL, ни standing membership с `SET TRUE`
  (`SCHEME.md:14-18,100-104`). После `app.install_port_context(...)` verifier якобы «разрешает» exact target, затем
  порт переходит в runtime-role (`39-41,59-64,86-87,106-112,314-317`). Но role membership в PostgreSQL —
  каталожное, а не transaction-context право: внешний `SET ROLE` разрешён только если исходный `session_user` уже
  имеет цепочку membership с `SET TRUE`. Сам `SET ROLE` внутри `SECURITY DEFINER` функции прямо запрещён
  PostgreSQL. Private state `ACCEPTED` в `app_ext.port_context_state` не участвует в проверке `SET ROLE`.
- **Предусловие.** Оба порта корректно предъявили key, verifier принял свежий challenge, и порт выполняет
  обязательный positive control через `app_staff`, `app_patient`, platform либо service-role.
- **Что становится достижимо.** Ничего: port остаётся в login-роли без table grants и сам получает `42501`.
  Положительный контроль `SCHEME.md:301-302` и owner-свойство «через порт строки есть» неисполнимы. Если
  исполнитель угадает прежнее standing membership `SET TRUE`, любой прямой клиент с паролем сможет сделать тот же
  `SET ROLE` до attestation — вернутся прежний G2 и тихий zero-scan HIGH-1 round 2.
- **Почему это не пропущенная строка в другом документе.** Выполнены сначала lexical code-search, затем точный
  поиск по целевой схеме, плану, owner-решениям и evidence 26/28/31/32:

  ```bash
  node /home/dev/brain/tools/code-search.mjs \
    "verifier context conditional SET ROLE membership after attestation GRANT ROLE" --repo bcb -k 30
  rg -n "SET (LOCAL )?ROLE|GRANT .* TO|membership|членств|переход.*role|переход.*роль|install_port_context" \
    docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/{SCHEME.md,PLAN.md} docs/OWNER_DECISIONS.md \
    docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/{26-roles-and-logins-from-need.md,28-scheme-gaps.md,31-scheme-gaps-r2.md,32-scheme-excess-r2.md}
  ```

  Для runtime-перехода найдено только утверждение, что verifier его разрешает; exact `GRANT/REVOKE`, membership
  options, кто имеет `ADMIN`, момент снятия и commit/crash/pool failure path отсутствуют. Официальная механика:
  [SET ROLE](https://www.postgresql.org/docs/16/sql-set-role.html),
  [Role Membership](https://www.postgresql.org/docs/16/role-membership.html).
- **Минимальное закрытие.** Записать и доказать исполнимый на PostgreSQL 16 exact transition-протокол: кто и каким
  штатным правом создаёт ограниченный `SET`-путь, когда он исчезает, почему commit/crash/cancel/pool reuse не оставляет
  membership, и как это проверяется до первого table statement. Если штатный протокол не выдерживает эти условия,
  **закрытие требует нового enforcement-компонента либо изменения owner-критерия**. Новый компонент из этого аудита
  не предлагается; ближайшая non-component альтернатива — standing membership + RLS accessor — прямо не выполняет
  громкий statement-level отказ и поэтому закрытием не является.

### HIGH-1. Grants не дают громкого отказа для запросов без application table

- **Механизм схемы.** Claim `SCHEME.md:14-18,138-141,293-304` доказан только для statement, который проходит
  permission check защищённой relation. PostgreSQL не требует table privilege для `SELECT 1`, `VALUES`, многих
  built-in functions и session/system information. `pg_catalog` всегда эффективно присутствует в `search_path`,
  `pg_roles` является публично читаемым view с замаскированным паролем, а `issue_port_challenge` намеренно должен
  вернуть nonce ещё до context. Такие запросы завершаются успешно и не создают `ERROR` в server log.
- **Предусловие.** Прямой клиент имеет верный пароль любого application login, но не port key и не accepted context.
- **Что становится достижимо.** Не tenant rows, но результат SQL и metadata: scalar values, database/session
  identity, список ролей без password, доступная часть `information_schema`, catalog/object/function metadata,
  публичные built-ins и свежий challenge nonce. Это противоречит буквальным «любой запрос ... 0 строк и пишет
  ошибку» и «anything else ... must obtain nothing, and the denial must be loud».
- **Исполняемая проверка.** На локальной DEV-базе, только read-only и после exact database gate:

  ```bash
  set -a
  source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
  set +a
  test "$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')" = bcb_webapp_dev
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
  BEGIN TRANSACTION READ ONLY;
  SELECT 1;
  SELECT count(*) > 0 FROM information_schema.tables;
  SELECT count(*) > 0 FROM pg_catalog.pg_roles;
  ROLLBACK;
  SQL
  # 1
  # t
  # t
  ```

  Это проверка механики PostgreSQL, не утверждение, что сегодняшняя DEV уже реализует revision 4. Официальные
  источники: [Schemas / pg_catalog](https://www.postgresql.org/docs/16/ddl-schemas.html),
  [`pg_authid` / публичный `pg_roles`](https://www.postgresql.org/docs/16/catalog-pg-authid.html),
  [Privileges](https://www.postgresql.org/docs/16/ddl-priv.html).
- **Минимальное закрытие.** Штатными object grants нельзя условно запретить `SELECT 1` по наличию private context.
  Без нового statement/connection gate минимальная честная форма — owner-решение сузить критерий до каждого
  запроса к managed application data и поимённо объявить разрешённые tableless/catalog/bootstrap результаты.
  Сам аудитор owner-текст не смягчает; при действующей буквальной формулировке finding остаётся открытым.

### HIGH-2. Предъявляемый port key может попасть в server log как bind parameter

- **Механизм схемы.** Port каждый раз передаёт исходный 32-byte key в `install_port_context` как bind parameter, а
  `SCHEME.md:43-48` без механизма утверждает, что parameter не пишется в application/server log. PostgreSQL при
  `log_statement=all` включает значения Bind parameters; их длину задаёт `log_parameter_max_length`, default `-1`
  разрешает полный вывод. На error-пути bind values отдельно управляются
  `log_parameter_max_length_on_error`. Ни эти settings, ни запрет application query-parameter logging, ни
  acceptance-поиск sentinel key в логах в revision 4 не объявлены.
- **Предусловие.** Оператор включает допустимый statement logging при `log_parameter_max_length=-1`, либо
  nonzero error-parameter logging; порт выполняет успешный verifier или verifier падает после Bind.
- **Что становится достижимо.** Читатель server/application log получает исходный reusable port key. При наличии
  валидного DB-пароля он выпускает собственный свежий nonce и устанавливает разрешённый этому login контекст до
  `revoked_at`; backend/transaction binding и single-use consume не помогают, потому что повторяется не старый
  вызов, а долгоживущий ключ на новом challenge.
- **Текущий DEV не является воспроизведённой утечкой.** Точная read-only команда:

  ```bash
  set -a
  source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
  set +a
  test "$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')" = bcb_webapp_dev
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At <<'SQL'
  BEGIN TRANSACTION READ ONLY;
  SELECT name, setting FROM pg_settings
  WHERE name IN ('log_statement','log_parameter_max_length','log_parameter_max_length_on_error')
  ORDER BY name;
  ROLLBACK;
  SQL
  # log_parameter_max_length|-1
  # log_parameter_max_length_on_error|0
  # log_statement|none
  ```

  Значит сейчас success path не логирует statement, error path не печатает parameters; target-инварианта,
  удерживающего это состояние, всё равно нет. Семантика и defaults:
  [PostgreSQL logging parameters](https://www.postgresql.org/docs/16/runtime-config-logging.html).
- **Минимальное закрытие.** В существующую declaration/settings/sweep добавить exact запрет вывода bind values
  (`log_parameter_max_length=0`, `log_parameter_max_length_on_error=0`) и redaction contract двух портов; acceptance
  выполняет success+error verifier с одноразовым sentinel key и доказывает его отсутствие в application/server log.
  Новый компонент не нужен.

### MEDIUM-1. Четыре login вместо трёх, заданных владельцем

- **Механизм схемы.** Owner canon требует логинов ровно по точкам входа: migrator + webapp + integrator
  (`OWNER_DECISIONS.md:260-273`; `PLAN.md:99-113`). `SCHEME.md:93-100,321` создаёт четыре: migrator, два webapp
  (`_staff`, `_patient`) и integrator. Инженерная развилка «один или два webapp login: два» не является более новым
  owner-решением и не может заменить дословный состав.
- **Предусловие.** Target roles/logins provisioned буквально по §3.1.
- **Что становится достижимо.** Появляется дополнительный постоянный password/connection entrypoint к verifier и
  pre-session surface. Сам по себе он tenant rows не открывает, но увеличивает credential surface и нарушает
  требуемую структуру «login = точка входа».
- **Точный замер.** Команда по target-таблице §3.1:

  ```bash
  awk 'BEGIN{t=0} /^\| Login \| Единственная точка входа/{t=1; next} t && /^\|---/{next}
       t && /^\| `?<env>_/{n++; next} t && !/^\|/{print n; exit}' \
    docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md
  # 4
  ```
- **Минимальное закрытие.** Оставить один `<env>_webapp` login; patient/staff/platform/service разделять принятым
  context class и exact runtime-role после закрытия BLOCKER-1. Если два webapp login принципиальны, требуется явное
  новое owner-решение, а не инженерная строка §9.

## Повторная проверка прежних findings

| Finding прошлого круга | Результат revision 4 |
|---|---|
| G1 pre-session/cross-tenant без port proof | **Закрыт:** каждый data seam требует accepted state exact purpose/args; challenge сам данных таблиц не читает. |
| G2 login наследует runtime grants | **Закрыт как прежний сценарий:** standing `INHERIT/SET` path отсутствует. Новый positive-path blocker описан отдельно выше. |
| G3 stale pool/backend/role context | **Закрыт:** DB, session user, target role, PID+backend start, transaction, expiry и accepted state сверяются; bad cleanup уничтожает connection. |
| G4 HMAC secret в БД | **Закрыт:** БД хранит SHA-256 verifier 256-bit random key, не исходный key; это не HMAC-secret и dump не mint-ит context. |
| G5 неполный definer census | **Закрыт:** acceptance берёт фактический per-database `prosecdef` set; целевая арифметика остаётся 231 DEV / 244 TEST, не hardcode одного total. |
| G6 caller UUID/GUC authority | **Закрыт:** exact typed args hash и server-derived bindings; caller field сам не authority. |
| G7 search path/TEMP | **Закрыт:** trusted path, qualification, `pg_temp` last, TEMP/CREATE revoke, `proconfig` census. |
| G8 permissive policy OR | **Закрыт:** restrictive accepted-context gate остаётся обязательным после перехода в runtime-role. |
| G9 triggers/FK/UNIQUE/cascades | **Закрыт в declaration contour:** caller/callee и constraint surface перечислены. |
| G10 sequences/views/matviews/FDW/LO | **Закрыт:** полный object contour и default deny сохранены. |
| G11 crash оставляет BYPASSRLS | **Закрыт:** migrator BYPASSRLS не получает; catalog elevation и revoke в одной transaction. |
| G12 powerful cluster paths | **Закрыт:** фактический role/owner/membership/object allowlist и named `postgres` exception. |
| Round 2 HIGH-1: RLS не ловит zero-scan | **Закрыт для table statements:** отсутствие table grant даёт permission error до executor/scan. HIGH-1 этого отчёта относится к SQL без protected relation. |
| Round 2 HIGH-2: verifier не исполним | **Закрыт для key/hash/challenge:** штатные `pgcrypto.digest`/`gen_random_bytes`, private state table, bindings, expiry и atomic consume заданы. Runtime role transition — новая отдельная стадия, пропущенная при этой замене. |
| Round 2 HIGH-3: нет successor ownership map | **Закрыт:** `app_object_owner` и exact object-class map заданы в §6.1. |
| Round 2 HIGH-4: DDL идёт не под owner | **Закрыт:** каждый schema DDL идёт после `SET LOCAL ROLE <declared_owner>`. |

**Итог повторной проверки: 0 ранее закрытых finding открылись заново.** BLOCKER-1 и HIGH-2 созданы новым
grant/hash-механизмом; HIGH-1 — непокрытая буквальная граница owner-инварианта после удаления statement hook;
MEDIUM-1 — ранее пропущенное противоречие owner-составу, а не регрессия closure.

## Проверки, вернувшиеся чистыми

1. **Permission denial действительно statement-level для relation.** Табличный ACL проверяется до чтения строк;
   `WHERE false`/`LIMIT 0` не обходят отсутствие `SELECT`. Это настоящее закрытие round 2 HIGH-1 в его прежней
   формулировке.
2. **`42501` попадает в текущий DEV server log.** Read-only permission probe к `pg_authid` при
   `log_min_messages=warning`, `log_min_error_statement=error` завершился `permission denied`; размер
   `/var/log/postgresql/postgresql-16-main.log` вырос на 257 bytes. Точная команда замера:

   ```bash
   log_path=/var/log/postgresql/postgresql-16-main.log
   before_bytes="$(stat -c %s "$log_path")"
   set -a
   source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
   set +a
   test "$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')" = bcb_webapp_dev
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
     "SELECT name||'='||setting FROM pg_settings WHERE name IN ('log_min_messages','log_min_error_statement') ORDER BY name"
   # log_min_error_statement=error
   # log_min_messages=warning
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
     'SELECT rolpassword FROM pg_catalog.pg_authid LIMIT 0' >/tmp/bcb-gaps-r3-psql.out 2>/tmp/bcb-gaps-r3-psql.err || true
   after_bytes="$(stat -c %s "$log_path")"
   echo "$before_bytes $after_bytes $((after_bytes-before_bytes))"
   sudo -n -u postgres /usr/bin/grep -n 'permission denied for table pg_authid' "$log_path" | tail -2
   rm -f /tmp/bcb-gaps-r3-psql.out /tmp/bcb-gaps-r3-psql.err
   # 7421313 7421570 257
   # 68719:2026-08-09 13:33:47.996 MSK [1383516] bcb_webapp_dev_user@bcb_webapp_dev ERROR:  permission denied for table pg_authid
   # 68973:2026-08-09 13:36:49.510 MSK [1384967] bcb_webapp_dev_user@bcb_webapp_dev ERROR:  permission denied for table pg_authid
   ```

   PostgreSQL `ERROR` включён порогом `WARNING`; `log_min_error_statement=ERROR` добавляет statement text.
   [Официальная семантика уровней](https://www.postgresql.org/docs/16/runtime-config-logging.html).
3. **Hash из dump не является key.** Для случайных 32 bytes unsalted SHA-256 не нуждается в password salt:
   offline preimage остаётся 256-bit задачей. Dump содержит hash и истёкший/bound state, но не исходный key;
   DB/backend/transaction/expiry bindings не переживают restore.
4. **Hash-table не открыт runtime.** `app_object_owner` — недостижимый NOLOGIN owner, seam 1 получает exact
   `SELECT`, `postgres` — уже объявленное административное исключение; login/runtime table ACL отсутствуют.
5. **Timing сравнения hash не создаёт практического oracle key.** Даже ранний bytea compare раскрывал бы максимум
   информацию о SHA-256 output, который сам не является секретом и уже хранится в БД; подобрать input с нужным
   digest prefix для 256-bit random key через network timing не легче релевантной preimage-задачи.
6. **Replay готового вызова закрыт.** Fresh server nonce, database/session/role/backend start/transaction/purpose/
   args/expiry binding и atomic `ISSUED → ACCEPTED` не позволяют перенести accepted call. Компрометация самого
   reusable key до revoke отдельно и честно названа остаточным риском; finding HIGH-2 закрывает реальный log-path к
   такой компрометации.
7. **Rotation fail-closed.** Новый `key_id` добавляется до смены env; exact key id допускает намеренное короткое
   перекрытие, старый challenge после `revoked_at` не принимается. Окно расширяет только срок уже скомпрометированного
   старого key и не делает hash usable.
8. **Ownership полностью названо.** Обычные application objects принадлежат `app_object_owner`, definer-функции —
   одному из 42 seam owners, admin/extension objects — `postgres`; fallback owner отсутствует. Точная арифметика
   таблицы §5:

   ```bash
   printf '%s\n' 6 17 25 9 13 8 2 7 2 11 3 1 2 3 1 1 7 10 5 8 4 2 3 8 6 4 2 2 2 2 12 2 3 1 2 7 4 5 5 11 12 4 \
     | awk '{sum+=$1; rows++} END {print "seam_rows=" rows, "signature_sum=" sum}'
   # seam_rows=42 signature_sum=244
   ```
9. **Migration window имеет оба контроля.** §7 выполняет DDL как declared owner, backfill как named `postgres`,
   revoke+post-state до commit; §8 требует и representative real migration, и kill-before-commit rollback. Round 2
   ownership/positive-control findings не открылись.
10. **Отклонённые подходы `FACTS.md` §9 не вернулись.** Нет общего правила «всегда бросать» для application
    ошибок, AST/call-site proof, capability-only target, утверждения «лог видит всё» или переписи мест вызова.
    Mandatory C-extension revision 3 также удалён; этот аудит его не возвращает и нового компонента не предлагает.
11. **Граница среды соблюдена.** SQL выполнялся только на `bcb_webapp_dev` после exact gate, только
    `BEGIN TRANSACTION READ ONLY ... ROLLBACK` и один ожидаемо запрещённый `SELECT`; DDL/DML не выполнялись.
    `*_prod`, `secondbrain`, `storylama_*` и TEST не открывались.

## Граница результата

Это gate схемы. Product code, SQL, базы, taskdb, plan и canon не изменялись. Единственное изменение — этот отчёт.
