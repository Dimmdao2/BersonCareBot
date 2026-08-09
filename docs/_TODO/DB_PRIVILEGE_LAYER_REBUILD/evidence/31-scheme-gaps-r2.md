# 31 — полнота `SCHEME.md`, round 2

## Вердикт

**НЕТ — свойство пока не держится. Все 12 разрывов `evidence/28` закрыты: открытых из прежних 12 — 0.**

Clean review не получился: осталось **4 блокирующих разрыва**. Из них **3 новые**, один — не закрытый до конца
хвост `evidence/29` С5 про владельцев объектов. Последовательность «два чистых ревью подряд» начинается заново.

1. **HIGH — RLS gate не гарантирует громкий отказ на запросе, который не посещает ни одной строки.**
2. **HIGH — port attestation не доведена до исполняемого verifier/challenge-протокола.**
3. **HIGH — после удаления `app_owner` нет точной карты владельцев всех объектов.**
4. **HIGH — миграционный DDL-путь не может в записанном виде сохранять заявленное владение объектами.**

Точные self-check команды для чисел этого вердикта:

```bash
report=docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/31-scheme-gaps-r2.md
awk '/^### HIGH-/{all++; if($0 ~ /\(новый\)/) new++} END{print "findings=" all,"new=" new,"prior=" all-new}' "$report"
# findings=4 new=3 prior=1
awk '/^\| G([1-9]|1[0-2]) /{n++; if($0 ~ /\*\*Закрыт/) closed++} END{print "gaps=" n,"closed=" closed,"open=" n-closed}' "$report"
# gaps=12 closed=12 open=0
awk '/^\| ([1-9]|1[0-9]|20) \|/{n++} END{print "forks=" n}' "$report"
# forks=20
```

Мера — `OWNER_DECISIONS.md:206-222,244-252,275-301,313-327`, `PLAN.md:19-38,114-175,189-196`.
Это не новый scope: каждый finding ломает либо обязательный громкий отказ, либо положительный контроль, либо
поимённое отсутствие скрытой owner-силы.

## Findings

### HIGH-1 (новый). RLS gate не является statement-level gate

- **Механизм схемы.** Для прямого table access схема ставит бросающий accessor внутрь обязательной restrictive
  RLS policy (`SCHEME.md:141-159,161-173`). При отсутствии attestation он должен бросать `42501`
  (`SCHEME.md:61-63`).
- **Предусловие.** Прямой клиент знает пароль login, делает допустимый `SET ROLE` и выполняет запрос, при котором
  executor заведомо не запускает scan: например `SELECT * FROM protected_table WHERE false` либо `LIMIT 0`.
- **Что становится достижимо.** Запрос завершается тихо с нулём строк, accessor не вызывается и server-log event
  отсутствует. Данных клиент не получает, но обязательное свойство «любой запрос без контекста → ноль строк **и
  ошибка в журнале**» (`OWNER_DECISIONS.md:206-212`; `PLAN.md:12-13,138-140,193-196`) нарушено.
- **Почему это механизм PostgreSQL, а не предположение.** Документация PostgreSQL говорит, что policy expression
  вычисляется **для каждой строки**, а не один раз на statement; пример restrictive policy при отказе возвращает
  `0 rows`/`UPDATE 0`, а не ошибку: [Row Security Policies, строки 25–27 и 161–181](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
  `WITH CHECK` бросает на реально вставляемой/обновляемой строке, но не исправляет пустой `SELECT`:
  [CREATE POLICY](https://www.postgresql.org/docs/16/sql-createpolicy.html).
- **Минимальное закрытие.** Назвать в схеме механизм, который проверяет attestation один раз **до выполнения любого
  data statement**, независимо от числа строк. Если остаются прямые table grants, одной RLS policy недостаточно;
  нужен отдельный statement-level gate либо явное изменение owner-критерия. Подменять требование тихим нулём нельзя.

### HIGH-2 (новый). Attestation описана как формат, но не как исполняемый протокол

- **Механизм схемы.** Private keys находятся только в env двух портов, PostgreSQL хранит public keys
  (`SCHEME.md:43-51`). База должна выдать одноразовый challenge, атомарно проверить подпись/nonce и сохранить
  transaction-local acceptance (`SCHEME.md:52-63`).
- **Предусловие.** Ф4 начинает реализацию на заявленном PostgreSQL 16-контуре репозитория.
- **Что становится достижимо.** Положительный путь невозможно однозначно собрать по схеме: не названы алгоритм и
  verifier primitive/extension, canonical byte encoding envelope, функция выдачи challenge, место/owner состояния
  nonce и атомарная операция consume. В явном списке шва 1 остаются шесть функций — install, три accessor-а,
  port gate и platform accessor (`SCHEME.md:90-93`); отдельного challenge API там нет. Импровизация HMAC возвращает
  G4, caller-generated/untracked challenge ослабляет обещанную одноразовость, а отсутствие verifier останавливает оба
  positive controls (`SCHEME.md:353-374`).
- **Проверка доступного механизма.** Поиск по репозиторию:

  ```bash
  node /home/dev/brain/tools/code-search.mjs \
    "asymmetric signature Ed25519 RSA verify public key pgcrypto signing DB_PRINCIPAL_SIGNING_SECRET install_signed_context" \
    --repo bcb -k 30
  node /home/dev/brain/tools/code-search.mjs \
    "CREATE EXTENSION pgcrypto pgsodium openssl signature verify" --repo bcb -k 30
  rg -n "pgsodium|ed25519|rsa_verify|verify_signature|CREATE EXTENSION.*(pgcrypto|pgsodium)" .
  ```

  Точные provisioning-находки — только `CREATE EXTENSION pgcrypto` (`deploy/postgres/p2-b-protected-principal-context.sql:107`,
  `deploy/host/deploy-test-saas.sh:359`, greenfield `schema.sql:60`); asymmetric verifier не найден. Штатный
  `pgcrypto` PostgreSQL 16 прямо указывает `No support for signing`:
  [pgcrypto §F.28.3.10](https://www.postgresql.org/docs/16/pgcrypto.html#PGCRYPTO-PGP-FUNC-SIG).
- **Что проверено чисто в split.** Public verification key сам по себе не позволяет подписать envelope; в БД по
  `SCHEME.md:45-51` нет материала, достаточного для mint principal. Клиент с одним паролем может запросить challenge,
  но не подписать его; перенос готовой подписи между backend/transaction/login/role/function ломают bindings
  `SCHEME.md:52-63,67-81`. G1 и G4 поэтому закрыты как модель угроз; finding — исполнимость этой модели.
- **Минимальное закрытие.** Зафиксировать поддерживаемый на PostgreSQL 16 алгоритм и verifier, точные bytes/canonical
  encoding, challenge issue + atomic consume state machine, owner/ACL всех его объектов и test vectors. Если нужен
  новый extension, он входит в exact extension allowlist §6 и acceptance §8.

### HIGH-3 (хвост `evidence/29` С5). Удалён `app_owner`, но successor ownership map отсутствует

- **Механизм схемы.** Все 244 definer-функции действительно получили 42 точных owner-а, а `app_owner` исключён
  (`SCHEME.md:194-261`). Для остальных объектов есть лишь родовое требование «named `NOLOGIN` owner roles либо
  `postgres`» (`SCHEME.md:300-330`), но имена ролей и отображение object → owner не приведены. У large objects
  перечислен только ACL (`SCHEME.md:314-315`). `evidence/30` Q2/Q7 — полный owner census функций, не relations,
  schemas, sequences, views, LO и прочих объектов (`evidence/30:423-674,909-911`).
- **Предусловие.** Генератор удаляет `app_owner` либо пытается нормализовать ownership по §6.
- **Что становится достижимо.** Для существующего объекта нет однозначного successor-а. Реализация должна либо
  оставить прежнего owner-а вопреки `SCHEME.md:257,427`, либо угадать `postgres`/широкого owner-а, либо упасть на
  post-state. Owner может менять/отключать RLS и policy; это скрытая сила, которую нельзя вывести из ACL. PostgreSQL
  отдельно фиксирует, что право alter/drop присуще owner и не является обычным grant:
  [Privileges, строки 20–27](https://www.postgresql.org/docs/16/ddl-priv.html).
- **Поиск отсутствующей карты.** Проверены `SCHEME.md` целиком, `evidence/30` §2–§9 и точный поиск:

  ```bash
  rg -n "app_owner|owner|владеет|владельц" \
    docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md \
    docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/30-definer-seams-full-census.md
  ```

  Найдены 42 function owners и общие классы §6; пообъектной successor-карты вне функций нет. Это ровно остаток
  `evidence/29:152-159`, а не новая область аудита.
- **Минимальное закрытие.** Добавить в единственную декларацию exact owner для каждого managed database/schema/
  relation/sequence/view/matview/foreign object/large object и прочих классов §6, плюс явное переназначение всех
  объектов `app_owner`. Двусторонняя сверка должна сравнивать этот mapping, а не только запрещать login/runtime owner.

### HIGH-4 (новый). Миграционный DDL-путь не сохраняет целевое ownership

- **Механизм схемы.** Wrapper под `postgres` временно выдаёт migrator owner-memberships/DDL grants, затем исполняет
  schema changes как `SET LOCAL ROLE <env>_migrator`; backfill после `RESET ROLE` делает `postgres`
  (`SCHEME.md:337-351`). Одновременно любой relation/schema должен принадлежать `NOLOGIN` owner-у или `postgres`,
  но не login-migrator (`SCHEME.md:322-323,339-340`).
- **Предусловие.** Миграция создаёт новый объект либо меняет существующий объект, принадлежащий NOLOGIN owner-у.
- **Что становится достижимо.** Новый объект принадлежит роли, исполнившей `CREATE`, то есть login-migrator; это
  прямо противоречит target ownership. Для `ALTER`/`DROP` обычного DDL grant недостаточно: право изменить/уничтожить
  объект присуще owner-у и не выдаётся как ACL. Схема не говорит, что migrator наследует временное membership, делает
  `SET LOCAL ROLE` точного object owner-а или перед commit передаёт ownership. Post-state assertion только откатит
  такую migration; выполнить её он не помогает.
- **Механика PostgreSQL.** Созданный объект принадлежит текущей роли; после `SET ROLE group_role` новые объекты
  принадлежат group role: [Role Membership, строки 27–33](https://www.postgresql.org/docs/16/role-membership.html).
  Alter/drop — owner-only power, не grantable: [Privileges, строки 20–27](https://www.postgresql.org/docs/16/ddl-priv.html).
- **Что чисто.** Backfill через `RESET ROLE` к поимённому `postgres` работоспособен и проходит `FORCE RLS`, потому
  что superuser всегда bypasses RLS: [Row Security Policies, строки 25–29](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
  Временные membership/grants и сама migration находятся в одной транзакции, поэтому crash до commit их откатывает;
  G11 остаётся закрытым (`SCHEME.md:342-351`).
- **Минимальное закрытие.** Wrapper должен выполнять каждый schema DDL как объявленный NOLOGIN object owner
  (`SET LOCAL ROLE exact_owner` через временное `SET TRUE` membership) либо атомарно передавать ownership каждому
  созданному объекту до post-state; для existing ALTER также явно определить получение owner-power. Backfill оставить
  под уже объявленным исключением `postgres`.

## Проверка прежних 12 gaps по одному

Ниже «ничего» означает: при указанном предусловии application data не становится доступно. Проверены несущие
разделы `SCHEME.md`, а не итоговая таблица §9.

| Gap | Итог и точный механизм | Предусловие → что достижимо | Минимальное изменение |
|---|---|---|---|
| G1 pre-session без ключа | **Закрыт.** Любой seam до первого чтения проверяет signed port/function/purpose/args (`43-63`); exact login имеет только EXECUTE (`97-118`). | Верный пароль без private key → challenge получить можно, подпись создать/перенести нельзя → ничего. Проверены bindings `52-63` и negative controls `364-365`. | Нет; исполнимость протокола отдельно HIGH-2. |
| G2 login наследует runtime | **Закрыт.** Logins `NOINHERIT`; рёбра `INHERIT FALSE, SET TRUE, ADMIN FALSE`; сверяется транзитивная достижимость (`106-109`). | Прямое соединение до `SET ROLE` → только CONNECT/exact seam EXECUTE, table ACL нет → ничего. | Нет. |
| G3 stale context/pool/role | **Закрыт.** DB/session_user/exact role/backend_start/transaction binding, transaction-local lifetime, bad connection уничтожается (`52-56,67-88`). | Abort, reuse pool/PID, `RESET ROLE`, новая transaction → signature mismatch/контекста нет → `42501`, кроме statement-level случая HIGH-1. | Нет для replay; HIGH-1 закрывается отдельно. |
| G4 HMAC secret в БД | **Закрыт.** Private key только env порта, public verifier только БД (`45-51`). | Dump/public-key read → проверить можно, mint principal нельзя → ничего. | Нет для split; verifier completeness — HIGH-2. |
| G5 неполный definer census | **Закрыт.** Все 244 signature распределены по 42 owners (`194-261`), login/runtime owners = 0 в target. | Любая из прежних 95 пропущенных функций → получает точный seam owner и caller list либо ноль runtime EXECUTE (`250-275`). | Нет. Независимая арифметика ниже печатает `244`. |
| G6 caller UUID/GUC authority | **Закрыт.** Canonical args подписаны; GUC/identifier сами не authority; internal edge проверяет signed root (`57-59,263-275`). | Caller знает чужой UUID и ставит custom GUC → signature/hash не совпадает → ничего. | Нет; canonical encoding надо конкретизировать в HIGH-2. |
| G7 search_path/TEMP | **Закрыт.** Trusted pinned path, qualified application objects, `pg_temp` last, TEMP/CREATE revoked, `proconfig` сверяется (`263-269`). | Caller создаёт temp/writable-schema shadow → path не выбирает его, CREATE/TEMP отсутствуют → ничего. | Нет. |
| G8 permissive OR | **Закрыт.** Отдельный restrictive gate обязателен; business OR только за ним; conjunction единая/restrictive (`161-173`). | Добавлена permissive business policy → она не снимает restrictive attestation gate → ничего без ключа. | Нет. |
| G9 FK/UNIQUE/triggers | **Закрыт в дизайне.** Writable surface включает triggers, callees, FK/UNIQUE/EXCLUDE/cascade; cross-wall key либо signed seam с одинаковым отказом (`186-192,316`). | Mutation запускает constraint/trigger → edge входит в declaration/census и не получает незаявленную силу. | Нет на уровне схемы; Ф4 обязан материализовать mapping и acceptance `369`. |
| G10 sequences/views/matview/foreign/LO | **Закрыт в дизайне.** Полный object contour, invoker views, default deny matview/foreign/LO (`300-318`). | Старый sequence ACL или новый view/matview/FDW/LO → generator/sweep видит и отзывает либо FAIL. | Нет, кроме exact owner mapping HIGH-3. |
| G11 crash оставляет BYPASS | **Закрыт.** Migrator BYPASS не получает; grants/migration/revoke/assertions — одна transaction; crash rollback (`337-351`). | SIGKILL до commit → catalog changes и migration откатываются → persistent elevation нет. | Нет для crash/BYPASS; работоспособность DDL — HIGH-4. |
| G12 мощные cluster paths | **Закрыт.** Фактический `pg_roles`/owners/memberships allowlist и object classes FDW/server/mapping/replication/extensions/files/program (`317-330,355-371`). | Неизвестный login имеет powerful attribute/membership/owner → acceptance FAIL; только `postgres` allowlisted. | Нет. |

Точная независимо выполненная команда для числа G5:

```bash
printf '%s\n' 6 17 25 9 13 8 2 7 2 11 3 1 2 3 1 1 7 10 5 8 4 2 3 8 6 4 2 2 2 2 12 2 3 1 2 7 4 5 5 11 12 4 \
  | awk '{s+=$1} END{print s}'
# 244
```

**Итог по вопросу 1: 12/12 закрыты; 0/12 остаются открыты.** HIGH-1–HIGH-4 — другие разрывы, найденные при
проверке того, что revision 2 добавила вокруг этих закрытий.

## Проверка 20 закрытых развилок

Проверены все пункты `SCHEME.md:396-437` против `evidence/26` и `evidence/30`. Ни один выбор не выдал runtime/login
новый широкий table access; два выбора требуют доделать несущий механизм (помечены findings).

| # | Проверка направления |
|---:|---|
| 1 | Port proof отделён от identity и обязателен всегда (`43-77`) — меньше, чем identity-only/pre-session-by-password. |
| 2 | Private/public split уменьшает DB secret surface (`45-51`); исполняемый verifier/challenge не определён — HIGH-2. |
| 3 | Platform получает отдельный raising accessor, не membership-only доступ (`74-77,180`). |
| 4 | Неизвестному оставлен только attested exact seam, а расхождение с буквальным PLAN названо (`33-39`). |
| 5 | Два webapp login разрывают pre-session и staff membership surfaces (`97-118`). |
| 6 | Media process лишён DB credentials и идёт через authenticated HTTP webapp (`149-155`). |
| 7 | Global telemetry оставлена только потому, что exact семь functions действительно агрегируют isolation telemetry; table ACL = 0 (`133`, `evidence/30:238-247`). |
| 8 | Diagnostic role удалена; health получает exact integrator-attested function, не delivery mutation role (`137-155`). |
| 9 | Cleanup остаётся в `app_worker`, но exact job purpose/table gate не даёт соседнему job сложить права (`141-151`). |
| 10 | Все 72 DEV PUBLIC EXECUTE отзываются; re-grant только exact caller (`263-275`, `evidence/30:372-421`). |
| 11 | Staff cross-user `close_active_user_phone_history` EXECUTE не выдаётся (`419-420`). |
| 12 | `list_platform_organization_members` остаётся без runtime caller (`421-422`). |
| 13 | Census расширен с 132 до полного union 244 без union прав различающихся bodies (`194-261`). |
| 14 | Telemetry/health/discovery разделены по surfaces (`231-243,425-426`). |
| 15 | `app_owner` из target удалён (`255-258,427`), но successor object-owner map не закончен — HIGH-3. |
| 16 | Безтабличный staff accessor становится invoker/no-table-ACL (`428-429`; `evidence/30:292-304`). |
| 17 | Два owners на cooldown сохраняют две exact policies, не объединяют credential surfaces (`296-298`). |
| 18 | Для десяти body drifts запрещён union; target выбирает migration chain/live-run (`432-433`; `evidence/30:60-76`). |
| 19 | Backup использует уже объявленный локальный `postgres`, новый standing login/migrator read не создаётся (`434-435`). |
| 20 | `USING(true)` ограничена exact owner/relation/columns и обязательным signed restrictive gate (`296-298,436-437`). |

**Итог по 20 forks:** решения направлены к меньшей runtime-поверхности; тихого union grant не найдено. Forks 2 и
15 формально выбрали правильное направление, но их несущая реализационная спецификация неполна (HIGH-2/HIGH-3).

## Проверки, вернувшиеся чистыми

1. **Asymmetric split не даёт БД mint principal.** В БД только public verifier (`SCHEME.md:45-51`); private key
   только в env конкретного порта. Проверены exact lines и repo search из HIGH-2.
2. **Replay между соединениями/транзакциями закрыт в модели.** Envelope связан с DB OID, session_user, exact
   role/function, backend identity+start, transaction, purpose, args, expiry, nonce (`52-63`); principal повторяет
   bindings (`67-81`); negative controls перечислены `364-365`.
3. **`app_owner` больше не нужен как function owner.** Mapping 244/42 сходится; TEST login-owner и runtime-owner
   переназначены (`194-261`; `evidence/30:321-354`). Exact search по `app_owner` в `SCHEME.md` нашёл только заявления
   об удалении и исторические/closure-ссылки (`257,427`).
4. **Backfill под FORCE RLS возможен.** Он явно выполняется `postgres` после `RESET ROLE` (`342-351`), а superuser
   bypasses RLS. Migrator BYPASS не получает ни внутри, ни вне окна.
5. **Все 20 forks просмотрены по одному.** Проверены `SCHEME.md:396-437`, вопросы `evidence/26:554-593`, решения
   surfaces `evidence/30:78-421`; union прав двух deployment bodies запрещён.
6. **Опровергнутые подходы FACTS §9 не вернулись.** Проверка `FACTS.md:413-425` против `SCHEME.md` целиком:
   нет правила «всегда бросать» для прикладных ошибок (только gates), нет AST/call-site census, нет capability-only,
   системный лог не объявлен полным детектором видимости, `row_security=off` используется как detector, а не bypass
   (`SCHEME.md:353-374`).
7. **PUBLIC/default и мощные пути перечислены двусторонне.** CONNECT/USAGE/TEMP/default privileges и все powerful
   role/object paths входят в §6/§8 (`300-335,353-374`); это закрывает прежние G10/G12, а не утверждает, что Ф4 уже
   реализована.
8. **SQL к базам не выполнялся.** Для findings были достаточны exact scheme lines, уже сохранённые read-only census
   commands `evidence/30` и официальная семантика PostgreSQL. `*_prod`, `secondbrain`, `storylama_*` не открывались.

## Граница результата

Это gate схемы, не план исправлений. HIGH-1–HIGH-4 соответствуют уже существующим owner/PLAN требованиям;
никакого дополнительного product scope из них не создаётся. Product code, SQL, БД, taskdb и остальные документы
не изменялись.
