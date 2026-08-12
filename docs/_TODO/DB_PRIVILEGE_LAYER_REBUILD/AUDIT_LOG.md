# DB privilege layer rebuild — единый журнал аудитов

Этот файл — append-only история audit-pass инициативы. Он отвечает на три вопроса: что нашли, что ещё открыто и
каким SHA/evidence это действительно исправлено.

Правила журнала:

- каждая находка получает постоянный ID;
- находка не удаляется после fix: **ОТКРЫТО — MUST FIX** меняется на **ИСПРАВЛЕНО `<SHA>`** с командами/evidence;
- если finding опровергнут, ставится **ОПРОВЕРГНУТО** и доказательство; молча стирать нельзя;
- новый audit-pass и новые findings дописываются ниже;
- `PLAN.md` остаётся authority порядка и статуса этапов, `SCHEME.md` — целевой архитектуры, owner decisions — цели;
  этот журнал не создаёт новую работу вне их scope.

## История до Ф3б-A1 — revision 8

Подробные неизменяемые отчёты прежней пересборки остаются в `evidence/`; здесь хранится единый маршрут к ним.

| Проход | Полнота/разрывы | Излишки/происхождение | Итог |
|---|---|---|---|
| Первичный | [`evidence/28-scheme-gaps.md`](evidence/28-scheme-gaps.md) | [`evidence/29-scheme-excess-and-traceability.md`](evidence/29-scheme-excess-and-traceability.md) | findings переданы в revision 2 |
| Полный census | [`evidence/30-definer-seams-full-census.md`](evidence/30-definer-seams-full-census.md) | — | полный набор definer-швов стал входом следующих ревизий |
| Круг 2 | [`evidence/31-scheme-gaps-r2.md`](evidence/31-scheme-gaps-r2.md) | [`evidence/32-scheme-excess-r2.md`](evidence/32-scheme-excess-r2.md) | findings переданы в revision 3 |
| Круг 3 | [`evidence/33-scheme-gaps-r3.md`](evidence/33-scheme-gaps-r3.md) | [`evidence/34-scheme-excess-r3.md`](evidence/34-scheme-excess-r3.md) | findings переданы в revision 4/5 |
| Круг 4 | [`evidence/35-scheme-gaps-r4.md`](evidence/35-scheme-gaps-r4.md) | [`evidence/36-scheme-excess-r4.md`](evidence/36-scheme-excess-r4.md) | findings переданы в revision 6 |
| Круг 5 | [`evidence/37-scheme-gaps-r5.md`](evidence/37-scheme-gaps-r5.md) | [`evidence/38-scheme-excess-r5.md`](evidence/38-scheme-excess-r5.md) | findings переданы в revision 7 |
| Финальный | [`evidence/39-scheme-gaps-final.md`](evidence/39-scheme-gaps-final.md) | [`evidence/40-scheme-excess-final.md`](evidence/40-scheme-excess-final.md) | revision 8 принята; позднее owner-решение A потребовало revision 9 |

Git-маршрут принятого основания и нынешнего этапа:

```bash
git log --oneline --follow -- docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md
# … a7dc7330c revision 8 → 9af9856dd owner A/revision 9 → 69d6a69ac A1 candidate
```

Старые отчёты не объявляются заново активными: они объясняют, почему в revision 8 уже есть 42 узких seam owners,
нет standing BYPASSRLS, migrator — `NOLOGIN`, activity-family закрывается каталогом, sequence ACL отделены, а
OpenPGP challenge не передаёт private key в SQL. Новый A1 обязан это сохранить.

## Audit pass A1-2026-08-11 — exact port-context contract

| Поле | Значение |
|---|---|
| Candidate | `69d6a69ac6a6c1aef114c3c81d8713711f468717`, `wt/port-context-contract` |
| Base | `9af9856ddec9b0736606301b430ccd0c12b67bde` |
| Run | `f3b-a1-auditor-codex-20260811`, `gpt-5.6-sol`, `xhigh` |
| Метод | **Взгляд**: diff + весь итоговый SCHEME + owner decisions + PostgreSQL 16/pgcrypto official primitives |
| Вердикт | **MUST FIX — candidate не принимается и не приземляется** |
| Run record | `/home/dev/brain/runs/agent-port/f3b-a1-auditor-codex-20260811.json` |

### A1-001 — RLS gate не компилируется

**Статус: ИСПРАВЛЕНО `42086f0b0`.** Candidate объявлял четырёхаргументный `require_accepted_context` с
`RETURNS void`, но §4 использует старую одноаргументную форму как boolean (`SCHEME@69d6a69ac:127,281`). Ф4 не
смог бы создать policy. В `SCHEME@42086f0b0` §2.2 закреплена одна шестиаргументная boolean raising signature, а
§2.4/§4/§8/§9 используют ровно её. Одноразовый PostgreSQL 16.14 probe с permissive business policy и restrictive
context policy вернул `expected_role_rows=1`, то есть boolean gate реально исполним в policy.

### A1-002 — `SECURITY DEFINER` проверяет owner вместо invoker-role

**Статус: ИСПРАВЛЕНО `42086f0b0`.** Внутри definer `current_user` — владелец функции, поэтому прежнее сравнение с
target role убивало valid positive path (`SCHEME@69d6a69ac:119,190,203,295`). `SCHEME@42086f0b0` §2.4 разделяет
outer runtime-policy и exact definer-root path: policy проверяет фактический `current_user`, gate — сохранённые
target/effective role и root. Одноразовый PostgreSQL 16.14 probe доказал обе стороны: expected outer role увидел
одну строку, wrong role — ноль, а definer внутри видел owner.

### A1-003 — proof не связан с exact function identity

**Статус: ИСПРАВЛЕНО `42086f0b0`.** В исходном candidate `function_identity` был только в capability row, но отсутствовал в
claims/transcript/verifier (`SCHEME@69d6a69ac:69,95,127,155`). Purpose и typed args не заменяют exact
schema-qualified `regprocedure`. В `SCHEME@42086f0b0` §2.1–§2.4 `function_identity regprocedure` входит в claims,
capability, challenge snapshot, canonical transcript и шестиаргументный gate; identity bytes строятся через
`pg_proc`/`pg_namespace`, а не search-path-dependent display.

### A1-004 — использован несуществующий `regdatabase`

**Статус: ИСПРАВЛЕНО `42086f0b0`.** `current_database()::regdatabase::oid` на PostgreSQL 16 даёт
`type "regdatabase" does not exist` (`SCHEME@69d6a69ac:155`). Нужен server-derived OID из
`pg_catalog.pg_database`. `SCHEME@42086f0b0` §2.3 использует scalar lookup `pg_database.oid`; одноразовый
PostgreSQL 16.14 probe напечатал `db_oid_type=oid`, `regprocedure_exists=true`, `regdatabase_exists=false`.

### A1-005 — typed args не различают NULL и empty

**Статус: ИСПРАВЛЕНО `42086f0b0`.** Прежний framing не имел отдельного value length/NULL marker
(`SCHEME@69d6a69ac:67,142`). Нужен exact array/null-element/tag/value framing, общий для порта и SQL.
`SCHEME@42086f0b0` §2.3 задаёт dimension/lower-bound/count, non-NULL elements, numbered tag/value fields,
`0xffffffff` для NULL и `0` для non-NULL empty. Независимый Node SHA-256 probe exact zero-arg header получил
зафиксированный `H0=0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a`.

### A1-006 — private state не exact и конфликтует с owner map

**Статус: ИСПРАВЛЕНО `42086f0b0`.** Placeholder «all §2.4 bindings and claims» не задавал columns/types/constraints,
а §2 и §6.1 назначают private objects разным owners (`SCHEME@69d6a69ac:100,108,354`). Generator не может выбрать
один DDL. `SCHEME@42086f0b0` §2.1 перечисляет exact columns/keys/checks четырёх private relations, state trigger и
единственное владение context seam; §6.1 содержит явное исключение из ordinary-object ownership.

### A1-007 — resolver/platform positive lifecycle отсутствует

**Статус: ИСПРАВЛЕНО `42086f0b0`.** Platform accessor требовал resolver-private actor, но writer/handoff/grants/order
не описаны (`SCHEME@69d6a69ac:106,111,135`). Fix должен сохранить разделение port proof и human identity proof и
не включать physical `platform_users.id` в криптографическое доказательство. `SCHEME@42086f0b0` §2.5 задаёт
pre-session root → private physical-to-opaque resolver → commit → новую human-context transaction; physical id не
входит в capability, challenge, transcript или proof, поэтому A→I boundary остаётся заменяемой.

### A1-008 — complete surface и census расходятся

**Статус: ИСПРАВЛЕНО `42086f0b0`.** §5 не учитывал итоговую cleanup/helper surface
(`SCHEME@69d6a69ac:307`). `SCHEME@42086f0b0` §2.2/§5 фиксирует полный набор: 11 definer signatures и один invoker
helper; формулы «revision-8 definer set минус legacy + 11» и `target_context_function_count = 12` вычисляются
из revision-9 declaration для конкретной базы. Прежние 42 narrow seam owners не изменены.

### Evidence прохода

```bash
git diff --name-status 9af9856ddec9b0736606301b430ccd0c12b67bde..69d6a69ac6a6c1aef114c3c81d8713711f468717
# M docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md
# M docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md

git diff --check 9af9856ddec9b0736606301b430ccd0c12b67bde..69d6a69ac6a6c1aef114c3c81d8713711f468717
# exit 0, вывода нет

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT current_database()::regdatabase::oid;"
# ERROR: type "regdatabase" does not exist

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "SELECT true AND (SELECT pg_sleep(0));"
# ERROR: argument of AND must be type boolean, not type void
```

A2–A10, код, миграции и базы audit-pass не менял. Fix run: `f3b-a1-fix-codex-r2-20260811`; commit
`42086f0b08e6aa3a9120776220e9f9234b2fe73a` изменил только `PLAN.md` и `SCHEME.md`.

### Лидерская проверка fix `42086f0b0`

**Итог по audit-pass: все восемь MUST FIX исправлены.** Это закрывает дефекты candidate выбранного OpenPGP
transaction-challenge контракта, но не является end-to-end доказательством реализации: A2–A10 ещё не выполнены,
новых функций/миграций/DEV rollout нет.

```bash
git diff --name-status 9af9856ddec9b0736606301b430ccd0c12b67bde..42086f0b08e6aa3a9120776220e9f9234b2fe73a
# M docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md
# M docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md

git diff --check 9af9856ddec9b0736606301b430ccd0c12b67bde..42086f0b08e6aa3a9120776220e9f9234b2fe73a
# exit 0, вывода нет

rg -n "issue_port_challenge|install_port_context|require_accepted_context|BCBPORTCTX|BCBPORTARGS|port_key_verifiers|port_context_capabilities" packages apps deploy/postgres
# exit 1, вывода нет: новый контракт ещё не реализован
```

После audit-pass поднята отдельная архитектурная развилка: стандартный PostgreSQL mTLS может доказать identity
порта на соединении, оставив transaction-bound context/function/purpose/args gate в БД и убрав собственный
OpenPGP challenge/replay/rotation слой. Это **не новая audit-находка**: обе архитектуры могут исполнить owner-цель,
а выбор определяет стоимость и threat model. До решения по этой развилке custom candidate не приземляется и A2 не
начинается.

### Итог архитектурной развилки — owner 11.08

**ЗАМЕНЕНО: custom candidate `69d6a69ac`/`42086f0b0` отклонён и не вливается.** Владелец выбрал PostgreSQL mTLS
для port identity; роли/grants, transaction context, native RLS и narrow definer seams сохраняются. Новый A1 строится
в `wt/port-context-mtls` от integration SHA `337fd3275`; старый audit-pass остаётся только историей реальных ошибок,
которые нельзя повторить в mTLS-контракте.

## Audit pass A1-mTLS-2026-08-11 — PostgreSQL mTLS/context contract

| Поле | Значение |
|---|---|
| Candidate | `24ae1a6bd576ce27cae3f26b446b5dde02265dda`; fix `61f8dda985d795159af006ee8fc0943b16796bb4`; leader correction `674636989`, `wt/port-context-mtls` |
| Base | `337fd3275bdcf75c0b7dd354acaff0a9a7cd30c6` |
| Run | `f3b-a1-mtls-auditor-codex-20260811`, `gpt-5.6-sol`, `xhigh` |
| Метод | **Взгляд**: owner decisions + полный diff/revision 8 regression check + official PostgreSQL 16 docs + disposable PostgreSQL 16.14 primitive probes |
| Вердикт | **INITIAL FAIL → KILL-SET ИСПРАВЛЕН И НЕЗАВИСИМО ПОДТВЕРЖДЁН; К LAND** |
| Run record | `/home/dev/brain/runs/agent-port/f3b-a1-mtls-auditor-codex-20260811.json` |

### A1-MTLS-001 — HBA с SCRAM и `map=` не загружается

**Статус: ИСПРАВЛЕНО `61f8dda98`, ПРОВЕРЕНО ЛИДОМ.** PostgreSQL 16.14 отверг строки candidate при startup:
`authentication option "map" is only valid for authentication methods ident, peer, gssapi, sspi, and cert`.
Поэтому один CN нельзя сопоставить двум webapp login через `scram-sha-256 map=...`. Сохраняем SCRAM и портовую
границу минимально: отдельный client certificate/CN для каждого application login, без `map`; staff и patient
сертификаты остаются секретами одного webapp-порта, integrator certificate — integrator-порта.

### A1-MTLS-002 — неверно заявлен SAN-only server-name check

**Статус: ИСПРАВЛЕНО `61f8dda98`.** В PostgreSQL 16/libpq `sslmode=verify-full` использует CN как fallback, когда
подходящего SAN нет; текст candidate утверждает обратное. Контракт и negative vectors должны принять реальную
семантику штатного примитива, не придумывая отдельный SAN-only компонент.

### A1-MTLS-003 — canonical empty typed-args array несовместим с dimension rule

**Статус: ИСПРАВЛЕНО `61f8dda98`, ПРОВЕРЕНО ЛИДОМ.** В PostgreSQL 16 пустой массив имеет `cardinality=0`, но `array_ndims`,
`array_lower` и `array_dims` возвращают NULL; `[1:0]={}` не существует. Zero-arg relation/root поэтому получил бы
`22023`. Empty должен быть отдельным canonical dimensionless case; lower bound 1 проверяется только при непустом
одномерном массиве.

### A1-MTLS-004 — не задано преобразование SQL types в canonical bytes

**Статус: ИСПРАВЛЕНО `61f8dda98`, ПРОВЕРЕНО ЛИДОМ.** Framing готового `bytea` задан, но exact encoding `uuid`, `oid`, `integer`,
`bigint`, `xid8`, `boolean`, `text`, `name`, `bytea`, `timestamptz` отсутствует. Node port и SQL root могут получить
разные hash на одном аргументе. Для каждого type нужны exact tag/version и canonical byte encoding через проверенные
PostgreSQL 16 primitives/явный формат.

### A1-MTLS-005 — login может вызвать definer root без `SET LOCAL ROLE`

**Статус: ИСПРАВЛЕНО `61f8dda98` + `674636989`, ПРОВЕРЕНО ЛИДОМ.** Candidate выдаёт login прямой `EXECUTE` на pre-session roots. После install login
может пропустить `SET LOCAL ROLE app_pre_session` и вызвать definer; внутри `current_user` уже owner, что disposable
probe подтвердил результатом `direct_login_root_result=visible-without-set-role`. Login должен иметь только
install/clear; named roots получают `EXECUTE` только через exact target role, включая `app_pre_session`.

### A1-MTLS-006 — Variant-A identity resolver смешан с context seam

**Статус: ИСПРАВЛЕНО `61f8dda98`.** `variant_a_identity_refs` и physical→opaque resolver должны принадлежать
существующему узкому `app_seam_identity_lookup_owner`; context seam хранит/проверяет только opaque refs. Иначе
context owner получает лишнюю identity-map власть, а число private relations и owner map расходятся.

### A1-MTLS-007 — потерян exact object ownership/contour revision 8

**Статус: ИСПРАВЛЕНО `61f8dda98`.** Candidate заменил полный §6 словом `remain`: исчезли exact owners/default-deny
для database, tablespaces, extensions, event triggers, FDW/server/user mappings, publications/subscriptions,
matviews, foreign tables, large objects, replication slots, triggers/constraints/default privileges, а также exact
sequence/catalog census predicates. Вернуть действующий §6 revision 8, меняя только context-specific surface.

### A1-MTLS-008 — потерян migration/backup/restore и crash-acceptance contract

**Статус: ИСПРАВЛЕНО `61f8dda98`.** Candidate удалил точную последовательность migration window, reset/backfill/revoke
post-state, positive+crash controls, `--no-owner` restore, нормализацию legacy owners и полный per-principal
acceptance. Вернуть действующие §7–§8 revision 8, заменив только custom challenge vectors на mTLS/revocation/context.

### Подтверждено аудитом mTLS candidate

- PostgreSQL 16.14 поддерживает остальные выбранные типы/DDL: `oid`, `xid8`, `regprocedure`, composite/enum,
  `UNIQUE NULLS NOT DISTINCT`, boolean RLS gate и role membership options.
- Зафиксированный zero-arg SHA-256 верен: `0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a`.
- `INHERIT FALSE, SET TRUE, ADMIN FALSE`, `SET LOCAL ROLE`, CRL reload/on-demand и обязательный drain surviving
  backends исполнимы.
- Port proof отделён от human identity; private client key не вводится в SQL/dump/log; 42 узких seam owners
  сохранены; custom OpenPGP остаётся только historical replacement; A2–A10 не выданы за реализацию.

### Закрытие kill-set лидом

Исправляющий проход вернул только неустаревшие части revision 8: exact ownership/object contour и
migration/backup/restore/crash acceptance. Custom OpenPGP не восстановлен. Лидер отдельно исправил порядок cleanup
на `RESET ROLE → clear_port_context()` и удалил оставшиеся активные упоминания HBA map.

Одноразовый PostgreSQL `16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)` подтвердил: `pg_hba_file_rules` errors = `0`;
valid exact CN + client certificate + SCRAM вошёл как `app_staff`; password-only и wrong-CN дали `psql rc=2`;
empty array дал `0|NULL|NULL|NULL|2|1|1`; все десять binary-send значений и zero-arg SHA совпали; прямой root
без `SET LOCAL ROLE` дал `rc=1`, после роли вернул `visible`. Одноразовый cluster и ключи удалены.

Disposable PostgreSQL аудит остановлен и удалён; репозиторий и DEV/TEST он не менял. Полный текст команд и
сценариев находится в run record и `/tmp/f3b-a1-mtls-auditor-codex-20260811.log`.

## Audit pass IMPL-2026-08-11 — mTLS/context executable core

| Поле | Значение |
|---|---|
| Candidate | `11665f28a`, `wt/port-context-impl` |
| Acceptance commit | `d2f85bc39` — только поведенческие тесты, продукт не исправляет |
| Run | `f3b-impl-auditor-codex-20260811`, `gpt-5.6-sol`, `xhigh` |
| Метод | **Тест + взгляд**: blind 9-class kill-set, disposable PostgreSQL 16, fault injection, pool/call-site census, catalog/role/ACL inspection |
| Вердикт | **FAIL — семь MUST FIX; candidate не приземляется** |
| Run record | `/home/dev/brain/runs/agent-port/f3b-impl-auditor-codex-20260811.json` |

### IMPL-001 — core не подключён к production DB paths

**Статус: ОТКРЫТО — MUST FIX.** Webapp, integrator и media продолжают создавать connection-string pools и
устанавливать legacy signed context; новый wrapper вне экспорта не вызывается. Exact HBA поэтому либо остановит
сервисы, либо старые URL/login останутся обходами двух trust domains. Полный census также нашёл отдельные telemetry,
config-reader, purge, operational, runtime-migration/boot и media doors; их надо свернуть в webapp/integrator или
заменить exact named roots/admin channel.

### IMPL-002 — transaction wrapper не удерживает callback на одном client и не уничтожает failure

**Статус: ИСПРАВЛЕНО В ВЕТКЕ `9472e76ea`, ЕЩЁ НЕ ПРИЗЕМЛЕНО.** Callback не получает checkout-client и может выполнить query на другом backend;
cleanup failure не вызывает `release(error)`. Wrapper также ставит `request_id` всем классам и всегда H0, поэтому
нарушает claims matrix и не способен обслужить named root с typed args. Acceptance commit содержит пять красных тестов.

### IMPL-003 — SQL принимает malformed context и typed args

**Статус: ЧАСТИЧНО ИСПРАВЛЕНО `9472e76ea`, ОСТАЁТСЯ ОТКРЫТО.** Node/SQL core теперь fail-closed по claims matrix,
safe bigint и десяти typed tags; используется `pg_catalog.sha256`, а package acceptance зелёный. Полный named-root
typed-args и независимый fault-injection coverage ещё не доказаны. Исходный аудит: реальный PG16 принял staff с
лишним `subject_ref`, NULL protocol version и unknown
tag; NULL `type_tag` вернул тихий NULL. Нужны exact required+forbidden matrices, закрытый набор десяти tags, binary
length/value validation и одинаковый production Node↔SQL encoder. Live layout держит `pgcrypto` в `app_ext`, поэтому
`app.digest` candidate сломан; штатный PG16 `pg_catalog.sha256(bytea)` убирает эту лишнюю зависимость.

### IMPL-004 — role/ownership/pre-session graph не обслуживает живые пути

**Статус: ЧАСТИЧНО ИСПРАВЛЕНО `9472e76ea`, ОСТАЁТСЯ ОТКРЫТО.** Revision 10 исправила memberships/context classes:
добавлены integrator request/resolver и tenant-service, webapp→delivery убран. Полные role attributes, owners,
accessors, roots/resolver implementation и A→I handoff ещё не собраны. Исходный аудит: login roles остались INHERIT;
webapp staff получил delivery role; integrator не
получил scheduler; helper owner/EXECUTE неверен; named pre-session roots, platform/accessors/resolver/A→I handoff
отсутствуют. Дополнительный runtime census доказал дыру принятого A1: integrator login имеет delivery/scheduler, но
живому webhook request и pre-routing нужны exact `app_integrator_request` и `app_integrator_resolver`. Tenant-scoped
jobs также требуют отдельного org-carrying service class; broad staff/patient grants запрещены.

### IMPL-005 — rotation/revocation существует только на бумаге

**Статус: ОТКРЫТО — MUST FIX.** Disposable HBA проверяет базовый cert+SCRAM, но реальные PoolConfig/env, overlap,
expired/revoked/server-impersonation controls, CRL reload и mandatory drain/termination surviving backends отсутствуют.

### IMPL-006 — revision-9 declaration/generator/migration/restore отсутствуют

**Статус: ОТКРЫТО — MUST FIX.** `generate-cli.mjs --gaps` завершился `exit=2` с девятью gaps на каждую базу;
direct contract не является атомарным production apply. Из `a5c6472a1` разрешено восстановить object census, grammar,
blanket revoke, ownership/default privilege generator и atomic/idempotent proof, но не custom crypto/context rows,
старые generated SQL или упрощённый evidence fixture.

### IMPL-007 — зелёный demo acceptance не ловит независимую поломку механизма

**Статус: ЧАСТИЧНО ИСПРАВЛЕНО `9472e76ea`, ОСТАЁТСЯ ОТКРЫТО.** Disposable acceptance теперь входит в package test,
а пять wrapper tests зелёные; остальные независимые mutations девяти gate-классов ещё не закрыты. Исходный аудит:
endianness mutation production Node, удаление install, `USING(true)` и снятие FORCE
RLS оставили старый acceptance зелёным; script не подключён к package/CI. `d2f85bc39` добавил первые красные wrapper
tests, но все девять kill-set классов должны получить поведенческое/introspection evidence по своей природе.

### Подтверждено и сохраняется

- Базовый PG16 HBA exact CN + certificate + SCRAM работает; wrong/missing certificate, password-only, non-TLS и
  Unix socket application login отклоняются.
- Контекст конструктивно привязывается к DB OID, backend PID, xid8, login и capability; фиксированный definer
  `search_path`, FORCE RLS и raising `42501` с PostgreSQL log исполнимы.
- Candidate — полезный core, не выбрасывается; он наращивается тем же kill-set. Новый blind audit этого surface не
  нужен: fixer делает acceptance commit зелёным и закрывает семь findings, лидер проверяет итог.

## Audit pass DECL-2026-08-11 — revision-10 declaration/generator

| Поле | Значение |
|---|---|
| Candidate | `0da3b5e7f`, `wt/port-context-decl` |
| Метод | **Взгляд + disposable PostgreSQL 16**: двусторонняя проверка declaration→generator→catalog, ownership/ACL/policy/restore/migration crash census |
| Вердикт | **FAIL — семь MUST FIX; к DEV/TEST не применять** |

### DECL-001 — `--gaps=0` проверяет неполную модель

**ОТКРЫТО — MUST FIX.** Команда `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps`
сообщает ноль для обеих баз, хотя фактический подсчёт декларации дал для каждой `239 tables / 225 active / 1 grant /
0 policies`. Adapter удаляет TODO-policy/grantMatrix, а gate не требует restrictive context + permissive business
policy. Такой artifact включит FORCE RLS и остановит почти весь runtime вместо реализации стены.

### DECL-002 — generated schema ACL ломает context owners

**ОТКРЫТО — MUST FIX.** `app_ext.usage=[]`; blanket revoke не возвращает `USAGE` context/identity owners. Независимый
PG16 probe той же формы дал `ERROR: permission denied for schema app_ext`. Runtime/login доступа к private schema
быть не должно, но `app_seam_context_owner` и `app_seam_identity_lookup_owner` обязаны исполнять свои exact объекты.

### DECL-003 — 42 seam owners схлопываются в context owner

**ОТКРЫТО — MUST FIX.** Пустой exact function census + default `app_seam_context_owner` переназначает ему всякую
неназванную `SECURITY DEFINER` функцию. `portContext.functions` пока не приводит security/volatility/parallel/
proconfig, а старые role EXECUTE могут пережить apply. Нужен двусторонний per-signature exact census без fallback.

### DECL-004 — owner/role attributes расходятся со SCHEME revision 10

**ОТКРЫТО — MUST FIX.** Artifact делает database owner=`app_object_owner`, хотя §6.1 требует `postgres`; login renderer
не сбрасывает `CREATEDB`/`REPLICATION`. Все application roles обязаны получить полный отрицательный attribute set.

### DECL-005 — restore не воспроизводит ownership contract

**ОТКРЫТО — MUST FIX.** `pg_restore --no-owner` без `--role=app_object_owner` создаёт application objects от
`postgres`; generator затем не исправляет owners sequences/types/views/invoker functions. Restore отсутствует в
disposable proof.

### DECL-006 — migration crash proof частично вакуумен

**ОТКРЫТО — MUST FIX.** Wrapper принимает один owner вместо owner switches одной миграции; fixture не representative
project migration; kill происходит во время sleep до DDL, поэтому отсутствие таблицы не доказывает rollback DDL.
Rollback временного membership при обрыве действительно подтверждён и сохраняется.

### DECL-007 — production revision-10 artifact не проходит behavioral proof

**ОТКРЫТО — MUST FIX.** Старый fixture не содержит `portContext`; production section только генерирует и сравнивает
artifact с самим собой. Нужны apply к disposable clone, catalog match и независимые context/policy/owner mutations.

### Что сохраняется

- Каркас declaration/generator, атомарный apply, deterministic `--check` и реальный rollback membership полезны.
- `bash deploy/postgres/privileges/fixtures/proof-run.sh` и `git diff --check 0da3b5e7f^..0da3b5e7f` прошли, но не
  доказывают закрытие DECL-001–007.

## Audit pass TRUST-2026-08-11 — revision-10 SQL/rotation acceptance

| Поле | Значение |
|---|---|
| Candidate | `67f884340`, `wt/port-context-trust` |
| Метод | **Тест + взгляд**: independent PG16 named-root/catalog probes и поштучный запуск 13 заявленных mutations |
| Вердикт | **FAIL — шесть MUST FIX; к сведению/DEV/TEST не готов** |

### TRUST-001 — installer запрещает named roots большинству context classes

**ОТКРЫТО — MUST FIX.** Matrix требует `function_identity IS NULL` для staff/patient/platform/tenant-service/service.
Реальный PG16 install с объявленной staff capability и non-NULL root дал `42501 port context class identity
mismatch`. Relation access и named-root identity должны различаться по declared capability, а не запрещаться классом.

### TRUST-002 — integrator resolver принимает готовую произвольную identity/org пару

**ОТКРЫТО — MUST FIX.** `resolve_integrator_request(bigint,uuid)` не разрешает external identity и не проверяет
user→organization; он возвращает caller-supplied `77 + org` эхом. Такой результат нельзя считать human identity
proof и затем устанавливать как `app_integrator_request`.

### TRUST-003 — A→I map не участвует в runtime handoff

**ОТКРЫТО — MUST FIX.** Accessors возвращают physical actor/subject прямо из context. Acceptance получает отличный
opaque ID, но следующая транзакция его не использует. Нужен реальный opaque context ref → private Variant-A
physical resolver перед бизнес-доступом, чтобы будущая I меняла внутренний resolver, а не public contract.

### TRUST-004 — role/owner/EXECUTE graph неполон

**ОТКРЫТО — MUST FIX.** Несколько объявленных runtime roles и большинство seam owners не имеют требуемых exact
`USAGE app`/gate EXECUTE. Catalog probe также показал `hash_port_typed_args` и четыре application types владельцем
superuser creator, а не `app_object_owner`.

### TRUST-005 — 13 mutation tests дают ложный PASS

**ОТКРЫТО — MUST FIX.** Поштучный `PORTCTX_INJECT_FAULT=<fault> ... --single` показал: два HBA faults неизвестны;
forbidden claims/tags и шесть wrong-* падают на injection с `42P13 cannot change name of input parameter`; только
три policy/RLS faults достигают механизма. Runner принимает любой nonzero. Каждая мутация обязана сначала успешно
внести поломку, затем упасть на точном behavioral assertion и подтвердить ожидаемый error/result.

### TRUST-006 — rotation доказана только primitive sentinel, не runtime drain

**ОТКРЫТО — MUST FIX.** CRL reload и отказ нового соединения доказаны, но drain — прямой terminate одного известного
PID. Нет PoolConfig/env overlap, catalog enumeration всех backend отозванного credential, закрытия webapp/integrator
pools и проверки, что старый backend не появился снова.

### Что сохраняется

- Базовый exact-CN + clientcert + SCRAM, CRL reload primitive и три настоящие policy/FORCE-RLS mutations полезны.
- Независимый `acceptance.sh --single` и полный runner печатают `OK`, но этот итог не является PASS до TRUST-005.

## Audit pass RUNTIME-2026-08-11 — webapp/integrator production cutover

| Поле | Значение |
|---|---|
| Candidate | `e76b04156`, `wt/port-context-runtime` |
| Метод | **Тест + взгляд**: targeted Vitest/typecheck, chokepoint self-test и проход по живым startup/transaction/scheduler путям |
| Вердикт | **FAIL — девять MUST FIX; к сведению/DEV/TEST не готов** |

### RUNTIME-001 — integrator запускает legacy runtime migrations через отдельный raw pool

**ОТКРЫТО — MUST FIX.** `port-context` ошибочно попадает в `run-ddl-migrations`, а migration provider создаёт pool
без нового mTLS-конфига. При exact HBA сервис не стартует; при оставленной legacy allow-строке это третий обходной
DB-вход. Runtime login должен только verify schema state; DDL остаётся named operation.

### RUNTIME-002 — webapp handle transactions остались на legacy context mode

**ОТКРЫТО — MUST FIX.** Живые messenger/purge/media paths вызывают старый `startPoolTransaction`, который принимает
только `legacy-guc|shadow|locked`; в `port-context` воспроизводится `DB_PRINCIPAL_CONTEXT_MODE must be legacy-guc,
shadow, or locked`. Все runtime handle paths должны проходить shared exact-client wrapper.

### RUNTIME-003 — principal→capability mapping не покрывает живые роли и вложенные principals

**ОТКРЫТО — MUST FIX.** Webapp mapper отвергает infra/organization/app_worker/service paths. Integrator сохраняет
внешнюю scheduler/delivery capability при вложенном organization principal и затем отвергает его как non-infra.
Нужен явный mapping живых entrypoints без универсального service bypass.

### RUNTIME-004 — exact function/purpose/typed-args roots фактически не подключены

**ОТКРЫТО — MUST FIX.** Descriptor не несёт typed args; одна capability выбирается на principal/worker и повторно
используется для разных named roots. Package matrix дополнительно запрещает `functionIdentity` большинству
runtime classes. Каждый root должен строить exact descriptor в месте вызова, а relation context оставаться отдельным.

### RUNTIME-005 — integrator теряет checkout при setup failure

**ОТКРЫТО — MUST FIX.** `connect()` выполняется до principal/capability mapping, а release существует только после
успешной установки context. Достижимый startup path error-tracking делает DB queries без principal, глотает ошибку и
оставляет checkout (`releases=0`). Любой setup failure обязан уничтожать client.

### RUNTIME-006 — scheduler advisory lock использует legacy checkout

**ОТКРЫТО — MUST FIX.** Scheduler lock проходит через legacy parser и в `port-context` не получает корректную
сессию. Нужен отдельный bounded session-lock contract либо отказ от session lock; generic raw checkout запрещён.

### RUNTIME-007 — Drizzle path не соблюдает destroy-on-any-failure

**ОТКРЫТО — MUST FIX.** Webapp вручную дублирует lifecycle: cleanup error при уже упавшем запросе проглатывается,
после rollback client возвращается обычным `release()`. Query/setup/cleanup failure должны destroy checkout.

### RUNTIME-008 — webapp продолжает требовать generic `DATABASE_URL`

**ОТКРЫТО — MUST FIX.** Startup instrumentation и health check валидируют legacy URL до выбора staff/patient target
pool. Конфигурация только с двумя целевыми mTLS pools поэтому не стартует или ложно сообщает DB down.

### RUNTIME-009 — certificate rotation не доведена до runtime pool drain

**ОТКРЫТО — MUST FIX.** В runtime нет overlap, reload PoolConfig/env, закрытия старых webapp/integrator pools,
перечисления и завершения всех surviving backends отозванного credential и проверки отсутствия их повторного
появления. Primitive sentinel из TRUST-006 этого не доказывает.

### Известный остаток вне candidate scope

- Media worker всё ещё создаёт два прямых DB pools и остаётся третьим trust domain. До финального cutover их нужно
  убрать за internal webapp seam, а не выдавать media worker приватный ключ webapp.

### Что подтверждено и сохраняется

- Strict mTLS PoolConfig проверяет URL-login, CA, client cert/key и server identity.
- Целевая фабрика создаёт два webapp physical pools и один integrator pool; прежние webapp
  config-reader/telemetry/purge/boot pools удалены.
- Shared `withPortContextTransaction` удерживает callback на exact client и уничтожает checkout на ошибке.
- Targeted Vitest: webapp `4 passed`, integrator `2 passed`; оба typecheck, chokepoint и self-test — PASS.

## Fix verification TRUST-FIX1-2026-08-11 — `805d801be`

| Поле | Значение |
|---|---|
| Candidate | `805d801be`, `wt/port-context-trust` |
| Метод | **Тест + взгляд**: повтор TRUST-001–006 на disposable PostgreSQL 16, independent catalog census и 13 mutations |
| Вердикт | **FAIL — TRUST-001/002 и server-half 006 закрыты; TRUST-003/004/005 остаются** |

### Исправлено громко

- **TRUST-001 ИСПРАВЛЕНО `805d801be`.** Staff/service и остальные declared named roots устанавливаются и
  исполняются с exact function; wrong function/purpose получают `42501`.
- **TRUST-002 ИСПРАВЛЕНО `805d801be`.** Integrator resolver использует external identity mapping и отвергает
  неизвестную/inactive cross-org связь; caller-supplied identity/org echo удалён.
- **TRUST-006 SERVER HALF ИСПРАВЛЕНО `805d801be`.** Два surviving backends перечисляются и завершаются: count
  `2 → 2 → 0`; PostgreSQL log содержит один revoked-certificate refusal и два administrator termination. Runtime
  PoolConfig/env overlap/restart остаётся отдельным RUNTIME-009.

### TRUST-003 — opaque handoff работает, но physical context refs всё ещё принимаются

**ОТКРЫТО — MUST FIX.** Следующая staff/patient/platform transaction действительно принимает opaque refs и private
resolver возвращает physical identity (`variant_map_rows=2`, `mapped_opaque_refs_used_in_context=2`). Но installer
не валидирует принадлежность actor/subject refs opaque map, а xid-probe сам COMMIT-ит physical actor. Catalog после
baseline: `physical_ids_in_context_refs=1`. Это нарушает invariant «context row не содержит physical ID».

### TRUST-004 — exact seam ownership/EXECUTE topology не построена

**ОТКРЫТО — MUST FIX.** Catalog census: `seam_owners=42`, `seam_missing_app_usage=0`, но
`seam_missing_gate_execute=39`, `seam_missing_hash_execute=39`; пять business roots принадлежат fallback
`app_seam_context_owner`. Revision 10 запрещает owner fallback: каждому signature нужен exact owner и execution graph.

### TRUST-005 — mutation runner всё ещё даёт составные/искусственные красные

**ОТКРЫТО — MUST FIX.** Шесть `wrong_function|purpose|hash|xid|backend|role` заменяют весь gate одним `RETURN true`
и выполняют один составной mismatch, а не шесть независимых поломок. Три RLS/policy mutations только замечают
catalog drift и вызывают искусственный `fault_detected`; заявленные cross-tenant/no-context/owner-bypass behavioral
результаты не выполняются. Каждая mutation должна успешно сломать ровно свой механизм и покраснеть на точном
достижимом результате.

## Fix verification DECL-FIX1-2026-08-11 — `20413fbc6`

| Поле | Значение |
|---|---|
| Candidate | `20413fbc6`, `wt/port-context-decl` |
| Метод | **Взгляд + disposable PostgreSQL 16.14**: independent declaration/catalog census, real ACL/RLS/restore/migration mutations |
| Вердикт | **FAIL — DECL-002/004 закрыты; DECL-001/003/005/006/007 остаются** |

### Исправлено громко

- **DECL-002 ИСПРАВЛЕНО `20413fbc6`.** `app_ext` принадлежит `app_object_owner`; USAGE есть только у
  context/identity owners, отсутствует у PUBLIC и login roles.
- **DECL-004 ИСПРАВЛЕНО `20413fbc6`.** Обе DB принадлежат `postgres`; после env-renderers application roles с
  SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS/INHERIT: `0`.

### DECL-001 — 225 generic policies не являются exact RLS contract

**ОТКРЫТО — MUST FIX.** Измерено на каждой DB: `239 tables / 225 active / 226 policies / 1 grant`; все 225
restrictive policies проверяют только `app.current_org_id() IS NOT NULL`, единственная permissive policy на
`platform_users` — `USING true`. При отсутствующем schema USAGE runtime полностью сломан; после выдачи необходимого
USAGE patient-context probe обновил две чужие строки: `UPDATE 2`, `all_rows_changed=2`. Policy обязана связывать
effective/target role, context class, purpose, typed-args hash/function root и бизнес-видимость каждой поверхности.

### DECL-003 — function metadata/ownership/EXECUTE census расходится

**ОТКРЫТО — MUST FIX.** Generator назначает функциям общий `STABLE PARALLEL RESTRICTED` и широкий search_path вместо
exact metadata; поздний ownership pass переназначает `hash_port_typed_args` владельцу `postgres`. Незаявленный
`GRANT EXECUTE app.current_org_id() TO undeclared_exec_probe` пережил reapply (`stale_execute_survived=t`). Нужен
двусторонний signature-level owner/security/volatility/parallel/proconfig/EXECUTE census и revoke remainder.

### DECL-005 — restore переназначает application objects суперпользователю

**ОТКРЫТО — MUST FIX.** После real dump→recreate→`--no-owner --role=app_object_owner` generator снова назначает
sequence/type/view/invoker/helper владельцем `postgres`. Database owner остаётся postgres, application objects должны
оставаться `app_object_owner` либо exact seam owner.

### DECL-006 — committed crash fixture всё ещё умирает до DDL

**ОТКРЫТО — MUST FIX.** Fixture сначала `pg_sleep(30)`, proof убивает через секунду, поэтому DDL rollback вакуумен.
Независимый representative probe с table+function и двумя owner switches перед sleep подтвердил wrapper:
`rc=143`, оба objects и оба memberships откатились. Исправить надо committed fixture/proof, не wrapper.

### DECL-007 — production proof не ловит реальные mutations и artifacts отсутствуют

**ОТКРЫТО — MUST FIX.** Production-shaped artifact apply и relation/policy identity census проходят (`242/242`,
`226/226`), но function census расходится; mutation DO-blocks не используют настоящий verifier, stale EXECUTE
переживает reapply. `generate-cli.mjs --check` возвращает `1`: отсутствуют четыре canonical generated
`{privileges,org-allowlist}.{dev,test}.sql`. Production artifacts должны быть закоммичены и проверяться реальным
apply/catalog verifier.

## Audit pass TEST-QUEUE-2026-08-11 — post-drop worker cutover

| Поле | Значение |
|---|---|
| Candidate | `18c2de38d`, acceptance `2835d4e8e`, `wt/test-worker-queue-cutover` |
| Метод | **Тест + взгляд**: disposable PostgreSQL без legacy relation, concurrency/future/finalize probes и active-reference census |
| Вердикт | **FAIL — три MUST FIX; TEST worker не запускать** |

### QUEUE-001 — future enqueue публикуется как due до завершения постановки

**ОТКРЫТО — MUST FIX.** Compatibility producer сначала INSERT с `next_retry_at=now()`, затем отдельный UPDATE
future `runAt`. Canonical consumer успевает claim между ними; UPDATE уже не меняет `processing`. Acceptance
`2835d4e8e` воспроизводит: `1 failed | 3 passed`, premature claim возвращает future row в processing. `runAt`
должен входить в один atomic INSERT/upsert contract.

### QUEUE-002 — post-migration TEST deploy выполняет grant на удалённую relation

**ОТКРЫТО — MUST FIX.** `deploy-test-saas.sh` запускает `p0-5b-grants.sql`, где `message_retry_jobs` остаётся GRANT
target. С `ON_ERROR_STOP` свежий post-drop deploy оборвётся до restart. Активные grants/checkers/declarations должны
ссылаться только на canonical queue; historical migrations/retired drain diagnostics остаются историей.

### QUEUE-003 — active ops info/cleanup paths обращаются к удалённой relation

**ОТКРЫТО — MUST FIX.** `apps/webapp/scripts/user-phone-admin.ts info` падает на post-drop DB; active census candidate
дал `8` executable files / `15` matches, включая Drizzle metadata, `platformUserFullPurge`, grant/declaration/P0-12.
Удалить/перевести active paths; отсутствие producer для `webappPushNotify` подтверждено, его retired consumer не
требует восстановления второго loop.

### Подтверждено и сохраняется

- Concurrent claim даёт одного владельца; stale lease/finalize/retry/dead и retry-kind contract проходят.
- В worker runtime остались два loops: projection outbox и единственный outgoing delivery; legacy job loop удалён.
- Readiness/C4/dev-c7 active paths: exact census legacy relation `0`.
- Fault mutation canonical relation и `next_retry_at <= now()` действительно красит behavior tests.

## Fix verification TEST-QUEUE-FIX1-2026-08-11 — `066200cfa`

| Поле | Значение |
|---|---|
| Candidate | `066200cfa`, acceptance `2835d4e8e`, `wt/test-worker-queue-cutover` |
| Метод | Тот же red race oracle + post-drop disposable deploy/ops checks + exact active-reference census |
| Вердикт | **PASS — QUEUE-001–003 ИСПРАВЛЕНЫ; К LAND И TEST DEPLOY** |

- **QUEUE-001 ИСПРАВЛЕНО.** Absolute `nextRetryAt` входит в исходный INSERT; acceptance `4/4` green. Независимая
  мутация, игнорирующая его, красит два assertions и откатана.
- **QUEUE-002 ИСПРАВЛЕНО.** Stale grant/checker/declaration target удалён; `p0-5b-grants.sql` с `ON_ERROR_STOP`
  проходит на post-drop disposable PostgreSQL.
- **QUEUE-003 ИСПРАВЛЕНО.** Drizzle metadata, purge и `user-phone-admin info` больше не запрашивают legacy relation;
  post-drop info path проходит. Exact active census вне historical migrations/retired diagnostic: `0` files.
- Integrator suite: `374 passed`, `3 expected-fail`, `14 skipped`; typecheck/lint PASS. Webapp relevant tests `2/2`,
  typecheck/lint PASS; `git diff --check` PASS.

## Audit pass TEST-QUEUE-CI-NAME-2026-08-11 — `bf5fb38f1`

| Поле | Значение |
|---|---|
| Candidate | `bf5fb38f1`, `wt/test-worker-queue-ci-fix` |
| Метод | **Взгляд + точный gate + штатный Integrator Vitest** |
| Вердикт | **PASS — К LAND; production-код и тело теста не изменены** |

- **CI blocker ИСПРАВЛЕН.** Коммит является ровно `R100`-переименованием
  `jobQueue.cutover.integration.test.ts` → `jobQueue.cutover.postgres.integration.test.ts`: `0` вставок,
  `0` удалений, blob до/после `1d42586a6c7662e7aa0256437cdbb30e7936bd37`.
- Новое имя входит в каноническую категорию disposable PostgreSQL harness у
  `scripts/check-no-new-raw-sql.mjs`; сам gate/allowlist не менялся. Gate: `production debt: 0`.
- Точный PostgreSQL test: `1 file / 4 tests passed`. Штатный Integrator suite: `62` файлов прошли,
  `3` пропущены; `374 passed`, `3 expected fail`, `14 skipped`. Vitest glob продолжает включать файл.

## Audit pass MEDIA-DB-DOOR-2026-08-11 — `72c1f2c17` + `e2cdadb5d`

| Поле | Значение |
|---|---|
| Candidate | `72c1f2c17`, acceptance `e2cdadb5d`, `wt/media-db-door` |
| Метод | **Тест + взгляд**: disposable PostgreSQL, control-route/runtime faults, AST/dependency census |
| Вердикт | **FAIL — четыре MUST FIX; не к land/deploy** |

### MEDIA-001 — locked runtime не назначает operational media role

**ОТКРЫТО — MUST FIX.** Authenticated `ready` под locked mode получает HTTP `409`: source
`api/internal/media-worker/control:POST` отсутствует в locked allowlist, а существующий infra mapping назначает
`app_staff`, не `app_operational_media_worker`. Достижимый результат — media-worker падает на startup readiness.
Acceptance route test: `4 PASS / 1 FAIL`, ожидался `200`, получен `409`.

### MEDIA-002 — DB chokepoint допускает alias нового Pool

**ОТКРЫТО — MUST FIX.** Временная production mutation `import { Pool as DatabasePool } from 'pg'; new
DatabasePool()` прошла `check-db-chokepoint` и его self-test. Точный `new Pool()` gate ловит. Нужен AST-level import/
constructor census, чтобы третий DB pool/login нельзя было вернуть переименованием символа.

### MEDIA-003 — удалён обязательный error tracking процесса

**ОТКРЫТО — MUST FIX.** Candidate удалил `apps/media-worker/src/errorTracking.ts`, capture loop/fatal и dependency
`@bersoncare/error-tracking`; после включения документированного backend исключения media-worker останутся только в
journal. Сохранить error tracking без прямого DB-door: DB-backed конфигурация должна приходить через узкий control seam.

### MEDIA-004 — потеряна SaaS isolation telemetry

**ОТКРЫТО — MUST FIX.** `media_worker/media_transcode_tick` остаётся обязательным семейством operator-health, но
worker telemetry и native hooks удалены, а control route не имеет узкой команды для записи signal. Ошибки
worker-side control path больше не видны как isolation failure.

### Подтверждено и сохраняется

- Disposable PostgreSQL: `7/7` — claim concurrency, stale/future, quarantine, spoof/wrong-owner/cross-org/replay,
  retry/failure, HLS/program completion и atomic rollback multi-row update.
- Media unit/runtime: `8` tests, typecheck, build PASS; webapp typecheck/lint PASS.
- Runtime AST census candidate: `18` production TS, прямых forbidden DB hits `0`; production DB dependencies пусты.
- Control commands ограничены `ready, watermark, claim, load, processing, retry, failed, done_hls, done_program`;
  auth-before-body и sanitised HTTP failures покрыты.
- Deploy/env follow-up обязателен в этом же fixer: старый media DB credential/login убрать, новый control URL/secret
  провизионить и проверять readiness; текущий candidate fail-closed не стартует со старым env.

## Fix verification TRUST-FIX2-2026-08-11 — `0fb40d181`

| Поле | Значение |
|---|---|
| Candidate | `0fb40d181`, `wt/port-context-trust` |
| Метод | **Взгляд + independent disposable PostgreSQL 16.14 probes** |
| Вердикт | **FAIL — TRUST-003/004 исправлены; TRUST-005 имеет один непойманный effective-role bypass** |

### Исправлено громко

- **TRUST-003 ИСПРАВЛЕНО `0fb40d181`.** Physical actor/staff, actor/platform и patient subject refs получают
  `42501`; opaque resolver → следующая transaction → private physical resolver проходит;
  `physical_ids_in_context_refs=0`; context owner не читает physical map.
- **TRUST-004 ИСПРАВЛЕНО `0fb40d181`.** Пять reachable roots имеют пять exact owners,
  `fallback_root_owners=0`; двусторонний metadata/effective-EXECUTE census: `0` mismatches. Явный call graph требует
  gate у `8` seam owners и hash у `3`, поэтому отсутствие прав у остальных — необходимая узость, не finding.

### TRUST-005 — effective role не связан с фактическим current_user

**ОТКРЫТО — MUST FIX.** `require_accepted_context` проверяет `p_effective_role` только на NULL. Independent mTLS
staff probe передал `p_effective_role=app_seam_password_auth_owner` при фактическом `current_user=app_staff` и
получил `true` (`wrong_effective_role_result=app_staff:true`). Committed `wrong_role` mutation меняет stored
target role и этого bypass не ловит. Нужны actual effective-role comparison и отдельная behavioral mutation.

Остальные `12` механизмов и target-role mutation поведенческие; три RLS faults дали реальные
`cross_org_rows_visible`, `no_context_query_returned_row`, `owner_query_bypassed_context_gate`. Rotation сохранила
drain `2→0`, rotated certificate подключился, PostgreSQL log содержит `4` context denial, `certificate revoked` и
ровно `2` administrator termination.

## Fix verification DECL-FIX2-2026-08-11 — `d1336ca0c`

| Поле | Значение |
|---|---|
| Candidate | `d1336ca0c`, `wt/port-context-decl` |
| Метод | **Взгляд + independent production-shaped PostgreSQL 16.14 restore/catalog/fault probes** |
| Вердикт | **FAIL — DECL-002/004/005 исправлены; DECL-001/003/006/007 остаются** |

### Исправлено громко

- **DECL-002 ИСПРАВЛЕНО.** `app_ext` owner `app_object_owner`; USAGE только у object owner и двух exact identity/
  context owners, без PUBLIC/login ACL.
- **DECL-004 ИСПРАВЛЕНО.** Обе DB owner postgres; `unsafe_application_roles=0`.
- **DECL-005 ИСПРАВЛЕНО.** Independent dump→recreate→restore→generator: `restore_owner_mismatches=0` для DB,
  sequence, type, view, invoker и exact seams.

### DECL-001 — runtime ACL пуст и imported RLS predicate нарушает org wall

**ОТКРЫТО — MUST FIX.** Census каждой DB: `238 managed / 225 active / 13 pending`, `225 restrictive / 225
permissive`, из permissive `150` table-specific + `75` fail-closed, `USING true=0`. Но table grants фактически
содержат только один patient UPDATE; SELECT/INSERT/DELETE и runtime schema USAGE отсутствуют. После временного
минимального USAGE+SELECT на `public.be_appointments`: same staff проходит, staff list падает на patient accessor,
patient видит `cross-org-same-subject`, no-context/owner bypass закрыты. Patient branch обязан проверять organization,
а combined predicate — не вызывать громкий accessor чужого class в легитимной staff-ветке.

### DECL-003 — function/ACL census не двусторонний

**ОТКРЫТО — MUST FIX.** Declared `10/10`, live `app/app_ext=11`; undeclared `app.is_staff()`. Return mismatches `2`:
`hash_port_typed_args` fixture создаёт `void` вместо `bytea`, `require_platform_principal` — `void` вместо `boolean`.
Install/clear получают по `6` non-owner grantees — DEV+TEST логины вместе, а не три своей среды. Stale EXECUTE
reapply снимает (`1→0`), но verifier-before-reapply и обратный invoker/return census отсутствуют.

### DECL-006 — crash proof не достигает второго DDL/owner switch

**ОТКРЫТО — MUST FIX.** Marker стоит после table DDL и sleep в первом step; function и второй owner switch находятся
во втором step, который ещё не запускался при kill. Поэтому function absence после `exit=143` вакуумна. Marker должен
доказывать выполнение table+function и обоих switches до kill.

### DECL-007 — реальные catalog drifts переживают reapply

**ОТКРЫТО — MUST FIX.** Independent injection после production artifact: undeclared relation, `USING true` policy,
invoker function, arbitrary table ACL и default ACL остались после reapply (`1→1`); stale function EXECUTE снят,
unsafe role attrs исправлены, dropped declared policy восстановлена. Extra relation осталась owner postgres.
Committed mutations используют соседний `DO RAISE`, production-shaped proof запускает только DEV. Нужен настоящий
двусторонний catalog verifier для DEV+TEST и fault mutations через него.

Четыре artifacts tracked и deterministic `--check=0`; штатные proof/type/syntax/diff gates зелёные, но false-green
по перечисленным четырём findings.

## Fix verification TRUST-FIX3-2026-08-11 — `992b90add`

| Поле | Значение |
|---|---|
| Candidate | `992b90add`, `wt/port-context-trust` |
| Метод | **Тест + взгляд**: independent PostgreSQL 16.14 acceptance, direct gate/ACL/RLS probes, rotation/log census |
| Вердикт | **PASS — TRUST-005 исправлен; к интеграции после совмещения веток** |

- **TRUST-005 ИСПРАВЛЕНО.** Старый relation exploit с фактическим `current_user=app_staff` и подложным
  effective seam-owner теперь получает `42501`; relation positive даёт `app_staff|true|tenant-a`.
- Committed acceptance: `bash deploy/postgres/port-context/acceptance.sh` → exit `0`;
  `rg -c '^FAULT' /tmp/portctx-audit3-acceptance.log` → `14`. `wrong_role` и `wrong_effective_role` дают разные
  behavioral FAULT, `physical_ids_in_context_refs=0`, `fallback_root_owners=0`.
- Прямой named-root gate с exact owner/regprocedure может вернуть stateless boolean, но не повышает полномочия
  внешнего запроса: relation → `42501`, `app_ext` и чужой root → permission denied; только exact разрешённый root
  проходит. Login без `SET ROLE` не имеет EXECUTE общего gate.
- Rotation/log: revoked certificate → exit `2`; новый сертификат подключился; PostgreSQL log содержит
  `certificate revoked=1`, administrative termination `=2`, context denials `=5`; старых staff backend `=0`.
- После merge audited SQL/acceptance-файлы не изменены:
  `git diff --quiet 992b90add HEAD -- deploy/postgres/port-context/contract.sql deploy/postgres/port-context/acceptance.sh`
  → exit `0`.

## Audit POSTDROP-REGISTRY-R2-2026-08-11 — stale `e99950c236`, current `3a89dcb66`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent disposable PostgreSQL, migration/overlay/catalog probes, generator mutations |
| Вердикт | **FAIL — один finding остаётся и на `3a89dcb66`; не к land** |

### Исправлено громко

- **P0.8.5 stale import ИСПРАВЛЕН в `3a89dcb66`.** Старый `e99950c236` не запускал smoke из-за удалённого
  `getP085IntegratorMailingsRootDescriptors`; current HEAD удаляет три зависшие строки. Остальные независимые
  проверки старого candidate подтвердили: `pnpm run audit` PASS, A1 RLS conformance PASS, P0.13 PASS, dropped
  relation census `0`, source-model mutation ловит ровно `10` ложных `public.*`, generator determinism `4/4`,
  disposable leftovers `0` DB / `0` roles.

### REGISTRY-001 — `integrator.message_drafts` всё ещё имеет runtime DML ACL

**ОТКРЫТО — MUST FIX.** Production-shaped catalog probe на старом candidate дал
`postdrop_registry_state=0|t|t|0|t|t|t|t`: dropped relations `0`, `message_drafts` имеет RLS+FORCE и ноль policy,
но все четыре `app_staff` ACL истинны. Проверка current `3a89dcb66` подтвердила ту же причину: строка
`LEGACY|integrator.message_drafts` попадает в `appStaffGrantTiers`, а generated `p0-5b-grants.sql` включает relation
в grant table. Текущего row bypass из-за FORCE нет, но owner contract требует **без runtime SELECT/DML grants**;
deny-all не должен зависеть только от RLS. Fix должен сохранить нужные LEGACY grants другим таблицам, убрать все
четыре ACL у `message_drafts` и доказать это после production-shaped overlays.

## Audit RUNTIME-FIX2-2026-08-11 — `8ba36e2e1`

| Поле | Значение |
|---|---|
| Candidate | `8ba36e2e1`, `wt/port-context-runtime` |
| Метод | **Тест + взгляд**: independent live-shape pool/client probes, targeted suites, lint/type/chokepoint |
| Вердикт | **FAIL — три MUST FIX; один auditor criterion отклонён как не-finding** |

### RUNTIME-004 — named-root metadata теряется в live DbPort/transaction paths

**ОТКРЫТО — MUST FIX.** Integrator `createDbPort()` выполняет `pool.connect() → client.query()`, а exact
function/purpose/typed-args discovery обёрнут только вокруг `Pool.query()`. Live-shape probe для
`app.resolve_outgoing_delivery_scope(uuid)` установил `function_identity=NULL` и zero-args hash; revision-10 gate
отказывает `42501`. Достижимы outgoing scope/incident, scheduler organization/appointment reminder roots. Webapp
аналогично устанавливает контекст до Drizzle callback, поэтому password named root внутри callback не может передать
свою exact identity. Нужен единый transaction/client path без generic SQL-parser bypass.

### RUNTIME-003 — неизвестный infra source fail-open получает service capability

**ОТКРЫТО — MUST FIX.** Integrator возвращает `service` для любого неизвестного source; webapp — для любого infra
source вне media/cron allowlist. Опечатка или новый незарегистрированный caller получает `app_service` вместо
громкого отказа до checkout. Нужен exact allowlist с сохранением принятого media-source mapping.

### RUNTIME-LINT — обязательный webapp gate красный

**ОТКРЫТО — MUST FIX.** `pnpm --dir apps/webapp run lint` падает на `check-no-new-raw-sql` в двух новых
`portContextRuntime.test.ts`; broad suppression запрещён. Integrator lint, оба typecheck, db-principal и targeted
runtime suites, chokepoint/self-test и diff-check прошли.

### Отклонено громко: missing-principal `connects=1/releases=1(error)`

**НЕ FINDING.** Реализация валидирует principal до `pool.connect()`: probe получил ожидаемую ошибку при
`connects=0`, backend не взят и утечки нет. Требовать checkout ради последующего `release(error)` ухудшает boundary и
не следует owner requirement. Regression должен фиксировать fail-before-checkout (`connects=0/releases=0`), а не
искусственно воспроизводить более дорогой путь.

Подтверждено сохраняемое: verify-only startup без migration pool, target-only repo selection, physical-client
surface с `on`, bounded scheduler transactions, rotation preflight/rollback/drain/listener и отсутствие legacy
chokepoint bypass.

## Fix verification POSTDROP-REGISTRY-FIX-2026-08-11 — `59a696bce`

| Поле | Значение |
|---|---|
| Candidate | `59a696bce`, `wt/post-drop-registry-closure` |
| Метод | **Тест + взгляд**: прежний independent finding, worker disposable catalog fault, leader diff/audit gate |
| Вердикт | **PASS — REGISTRY-001 исправлен; к land** |

- **REGISTRY-001 ИСПРАВЛЕНО.** `integrator.message_drafts` остаётся историческим `LEGACY`, но exact exclusion
  убирает relation только из broad `app_staff` grant-set. UP и DOWN дополнительно снимают stale whole-table и
  column-level ACL; остальные LEGACY grants сохранены.
- Disposable production-shaped catalog: `SELECT=f INSERT=f UPDATE=f DELETE=f`; четыре операции под `app_staff`
  получили `permission denied`. Fault injection без normalizer → exit `1` на
  `FATAL: app_staff SELECT ACL ... must be false`, затем repair green.
- Два render и checked artifact: `cmp=0/0`; старый P0.8.5 import-fix сохранён
  (`git diff --quiet 3a89dcb66 59a696bce -- ...smoke-p0-8-5-integrator-scoped-policies.mjs` → exit `0`).
- Лидер после amend фактического комментария запустил `pnpm run audit` → exit `0`; P0.10 actual-schema registry,
  P0.8.5, P0.13, generated grants/policies и product smoke contract зелёные. `git diff --check` → exit `0`.
- Устаревший комментарий «нет FORCE RLS» исправлен: live contract — FORCE deny-all плюс отсутствие ACL, чтобы
  boundary не зависел от одного слоя.

## Completion audit DECL-OPERABILITY-2026-08-11 — current candidate `a8356d565`

| Поле | Значение |
|---|---|
| Метод | **Взгляд + executable declaration census / production artifact check** |
| Вердикт | **FAIL — каталог стал fail-closed, но полная рабочая grant-матрица и artifacts отсутствуют** |

### DECL-008 — `--gaps=0` скрывает незаполненную grant-матрицу

**ОТКРЫТО — MUST FIX.** Прямой импорт `declaration.ts` и census собранных revision-10 DB дал для каждой базы:

```text
active=225 tablesWithAnyGrant=2 tableGrantEntries=3 permissive=225 restrictive=225 failClosed=75
```

Исходная семантическая перепись одновременно печатает `grantMatrixPending=225`, `openGaps=G1,G2,G3,G8,G9,G10,G11`,
но `revision10Database()` принудительно ставит каждому relation `grantMatrix: undefined`; поэтому команда
`node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps` ложно возвращает по обеим DB
`пробелов 0`. Grants сейчас есть только у `public.be_appointments` и точечной колонки `public.platform_users`.
Это безопасный deny-by-default, но не рабочий целевой результат владельца: отсутствует полный exact
runtime/function → relation/column/operation → purpose census. Нельзя закрывать gap marker, пока каждый живой DB path
не получил необходимый grant либо не переведён в named seam; positive product paths должны доказать достаточность.

### DECL-009 — production privilege artifacts не соответствуют candidate declaration

**ОТКРЫТО — MUST FIX.** Read-only команда
`node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check` → exit `1`: оба privileges
artifact расходятся, оба allowlist совпадают. Первое расхождение: committed artifact выдаёт install/clear всем шести
DEV+TEST login одновременно, candidate правильно рендерит только три login своей environment. Production artifacts
обязаны быть regenerated/tracked и пройти deterministic `--check`; fixture-only `2/2` этого не доказывает.

### HOST-001 — mTLS пока доказан только disposable acceptance, не host cutover

**ОТКРЫТО — ДО DEV/TEST.** `rg` на current `feat` находит exact
`hostssl ... scram-sha-256 clientcert=verify-full clientname=CN` только в `SCHEME.md` и
`deploy/postgres/port-context/acceptance.sh`; deploy/host не содержит renderer/install/readiness HBA/CA/CRL contract.
Следовательно два порта доказаны на одноразовом PG16, но DEV/TEST host ещё не переведён и не защищён этим HBA.
Нужны штатный host apply/preflight/rollback, per-port env certificate paths и live positive/negative probes.

**Живой DEV/TEST census 11.08 подтверждает finding, не только отсутствие кода.** Команда
`hostname -I; sudo -u postgres psql -X -v ON_ERROR_STOP=1 -Atc "SELECT current_database(), current_user,
current_setting('server_version'); SHOW hba_file; SHOW ssl; SHOW ssl_ca_file; SHOW ssl_crl_file; SHOW ssl_cert_file;
SHOW ssl_key_file;"` доказала target `151.241.228.122`, PostgreSQL `16.14`, `ssl=on`, пустые CA/CRL и штатные
snakeoil server certificate/key. `sudo awk 'NF && $1 !~ /^#/' /etc/postgresql/16/main/pg_hba.conf` показал общие
`host all all 127.0.0.1/32 scram-sha-256` и `host all all ::1/128 scram-sha-256`, без обязательного client cert.
Read-only `pg_authid` census (`rolpassword LIKE 'SCRAM-SHA-256$%'`, без вывода hash) подтвердил, что пароли
прикладных логинов уже SCRAM; обновление PostgreSQL для этого не требуется. Одновременно `pg_roles` всё ещё
показывает LOGIN у старых `app_staff`/`app_patient` и семейства TEST operational login (delivery, diagnostic,
media, scheduler, web-push reminder): host reset/retirement ещё не применён. Logging base уже ведёт ошибки в stderr
(`log_min_error_statement=error`, systemd journal), но громкий context-denial должен быть доказан после cutover
живым `42501` и записью PostgreSQL journal.

Тот же live catalog подтверждает старый role-only обход до cutover: запрос
`SELECT r, pg_has_role(r,'app_platform_settings','MEMBER'), pg_has_role(r,'app_platform_settings','USAGE'),
pg_has_role(r,'app_platform_settings','SET') FROM unnest(ARRAY['bcb_test_staff_login',
'bcb_dev_runtime_staff_login']) r` вернул для обоих `MEMBER=t, USAGE=f, SET=t`. Это допустимое SET-membership
только в целевом контракте, где login имеет ноль relation ACL и каждый запрос требует принятого platform context;
на текущем host целевой context/RLS reset ещё не применён, поэтому live состояние не считается безопасным.

## Fix verification MEDIA-DB-DOOR-R2-2026-08-11 — `a5684df48`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent route/runtime/AST/deploy census + TEST role read-only introspection |
| Вердикт | **FAIL — MEDIA-001–004 исправлены; старый media DB login/credential остаётся** |

### Исправлено громко

- **MEDIA-001 ИСПРАВЛЕНО.** Control route `8/8` PASS; mutation operational-media→staff дала `1 failed / 7 passed`.
- **MEDIA-002 ИСПРАВЛЕНО.** Chokepoint/self-test exit `0`, семь import forms отклонены; alias mutation exit `1` и
  два offender. `20` production TS files, `0` DB dependency, `0` runtime DB credential identifier hit.
- **MEDIA-003/004 ИСПРАВЛЕНО.** Media `4 files / 11 tests`, error-tracking init/loop/fatal и bounded isolation
  reporter PASS; control schema содержит `11` bounded commands. PostgreSQL seam `7/7`, webapp type/lint PASS.

### MEDIA-005 — legacy media login переживает HTTP cutover

**ОТКРЫТО — MUST FIX.** Read-only TEST catalog: `bcb_test_operational_media_login` имеет `LOGIN` и membership в
`app_operational_media_worker`; census двух ролей дал `1` login из `2`, membership `1`. Current candidate declaration
ещё объявляет login (`rg ... declaration.ts | wc -l` → `4`), а executable DROP role census дал `0`. PROD deploy не
вызывает `saas-c2-secret-preflight`; runtime probe с одновременно новыми control fields и старым `DATABASE_URL` дал
`legacy_env_parse=accepted`, `database_url_still_in_process=true`. Это сохраняет третий DB credential family.
Fix обязан: удалить login/membership из declaration и host provisioning, fail-closed запретить legacy DB env,
подключить preflight к TEST/PROD и безопасно retire live role только после zero-owner/ACL census.

## Fix verification DECL-FIX3-2026-08-11 — `a8356d565`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent PostgreSQL 16.14 catalog/restore/crash probes |
| Вердикт | **FAIL — DECL-006 PASS; DECL-001/003/007 и operability остаются** |

- **DECL-006 ИСПРАВЛЕНО.** Marker следует после table/function DDL и обоих owner switches; kill exit `143`,
  table/function/memberships rollback → `t/t/t`.
- **DECL-002/004/005 PASS сохранён:** app_ext topology; database owner postgres и unsafe roles `0`; dump→recreate→
  restore owner mismatch `0`.

### DECL-010 — bilateral verifier пропускает PUBLIC и cross-environment ACL

**ОТКРЫТО — MUST FIX.** Independent mutations установили cross-env EXECUTE install, PUBLIC SELECT на
`be_appointments` и login USAGE на `app_ext`; catalog introspection каждой дала `1`, но `catalog-verifier.mjs`
вернул `catalog verifier green`/exit `0`. Unexpected install/clear grantee исключён условием, PUBLIC отсутствует в
principal/table ACL census. Verifier обязан сравнивать все effective grantees/ACL в обе стороны до reapply.

### DECL-011 — production proof подменяет громкий context gate

**ОТКРЫТО — MUST FIX.** Fixture создаёт `require_accepted_context()` как `SELECT true`, а staff proof заранее
устанавливает patient context. Реальный `SET ROLE app_staff; SELECT count(*) FROM public.be_appointments` без
context успешно вернул `0`, вместо `42501` и PostgreSQL log event. Production-shaped proof обязан использовать
фактический transaction-bound gate и negative no-context query; тихий ноль не считается успехом.

DECL-008/009 остаются частью того же fixer: полный purpose-backed grant census и deterministic production artifacts,
а не только fixture artifacts. Штатный proof-run exit `0` признан false-green до закрытия DECL-010/011.

## Fix verification DECL-FAILCLOSED-2026-08-11 — `1017b5686`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent gap fault injection и disposable PostgreSQL 16.14 ACL mutations |
| Вердикт | **PASS bounded fail-closed gate — к land; grant-этап не готов** |

- **DECL-008 false-green ИСПРАВЛЕН.** `generate-cli.mjs --gaps`, generation, `--stdout` и `--check` завершаются
  exit `2`, пока relation имеет missing/unresolved/неполный direct access status. На каждой DB machine census:
  `classified=238 active=225 pending=13 direct=1 unresolved=224 gaps=224`; SQL не создаётся.
- **DECL-010 перечисленные ACL bypass ИСПРАВЛЕНЫ в verifier.** Независимые mutations PUBLIC relation EXECUTE/ACL,
  TEST-login ACL в DEV DB, schema USAGE и CREATE дали exit `1`; после каждого revoke verifier снова exit `0`.
  Отсутствующая declared role не вызывает SQL-ошибку.
- Fault injection missing status и direct без purpose/code/grant независимо красит `collectGaps()` и generation.
  Коммит добавляет `0` строк GRANT/REVOKE и не маскирует relations как `no-runtime-surface`.
- TypeScript strict, три Node syntax checks и `git diff --check` → exit `0`; scope ровно пять файлов,
  audit worktree чист, disposable clusters удалены.

**ОСТАЁТСЯ ОТКРЫТО ГРОМКО:** `224/225` ACTIVE relations на каждую DB не имеют доказанного per-callsite access;
production artifacts не regenerated; DECL-011 actual context/no-context `42501` + PostgreSQL log proof отсутствует.
PASS принимает только защиту от ложной готовности, а не Ф3б/декларацию целиком.

## Audit RUNTIME-FIX3-2026-08-11 — `7f0f6238a` merged as `1ff9729e5`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: production callsite census, real PostgreSQL 16 transaction fault, startup path inspection |
| Вердикт | **FAIL — три MUST FIX; не к land** |

### RUNTIME-010 — production capability catalog/seed/env rendering отсутствует

**ОТКРЫТО — MUST FIX.** Production census нашёл шесть integrator и четыре webapp password named-root callsites,
но exact-loop по их `functionIdentity` дал `declaration_matches=0` для каждого. Поиск
`rg -n "INSERT INTO app_ext\\.port_context_capabilities|port_context_capabilities \\(" deploy apps packages scripts
--glob '!*.md'` находит только DDL и disposable fixture; поиск двух `*_PORT_CONTEXT_CAPABILITIES_JSON` в
`deploy/host deploy/env scripts` → exit `1`. Runtime требует unique descriptor до checkout, поэтому delivery,
scheduler/appointment и password roots не запускаются. Нужен один declaration-derived production catalog,
DB seed и env renderer; unit-only UUID/purpose не authority.

### RUNTIME-011 — active transaction повторяет SQL и маскирует `42501`

**ОТКРЫТО — MUST FIX.** Real PG16 probe временным behavioral test вызвал `runIntegratorSql` внутри active Drizzle
transaction. Получено `{ code: '25P02', fallbackCalls: 1 }` вместо исходного `{ code: '42501', fallbackCalls: 0 }`:
catch-all проглотил permission failure и вызвал `db.query` второй раз на aborted transaction. Исправление обязано
сохранить первый PostgreSQL error и исключить повтор/side effect; тест сохранён как oracle в audit result, temporary
file удалён.

### RUNTIME-012 — readiness повышает relation context до named roots

**ОТКРЫТО — MUST FIX.** `operationalPoolReadiness.ts` открывает ambient delivery/scheduler transaction, а затем
вызывает exact named roots на том же checkout. Worker/scheduler обязаны выполнить readiness при startup, поэтому
после появления descriptors получают `42501`: named operation должна выбрать capability **до** checkout, а не
внутри relation transaction.

### Что сохранено

- Integrator targeted: `5 files / 23 tests`; webapp: `3 files / 13 tests`; db-principal `25`, PostgreSQL acceptance
  и `14` faults — PASS.
- Bare `SET LOCAL ROLE app_platform_settings` без platform context → `42501`; missing principal checkout `0/0`,
  exact source allowlists, cleanup/rotation/drain и chokepoints подтверждены.
- Оба lint/typecheck, raw-SQL self-test (`13` synthetic bypass) и diff-check PASS; audit tree clean.

### Live DEV/TEST ACL baseline до reset

Команда:

```bash
for db_name in bersoncarebot_test bcb_webapp_dev; do
  sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$db_name" -P pager=off -F '|' -Atc "
    SELECT current_database(),'runtime_acl_rows',count(*)
    FROM information_schema.role_table_grants
    WHERE grantee IN ('app_staff','app_patient','app_platform_settings','app_clinic_billing','app_worker',
      'app_operational_media_worker','app_operational_delivery_worker','app_operational_scheduler',
      'app_integrator_request','app_integrator_resolver','app_tenant_service','app_service')
      AND table_schema IN ('public','integrator','app','app_ext');
    SELECT current_database(),'login_acl_rows',count(*)
    FROM information_schema.role_table_grants g
    JOIN pg_roles r ON r.rolname=g.grantee AND r.rolcanlogin
    WHERE g.table_schema IN ('public','integrator','app','app_ext');"
done
```

вернула TEST `runtime_acl_rows=1011`, `login_acl_rows=2496`; DEV `967` и `3177`. Это baseline старой схемы, не
принимаемый результат: atomic reset обязан дать application login table/column/sequence ACL `0`, затем наложить
только exact declaration runtime/seam grants.

## Audit MEDIA-DB-DOOR-FINAL-2026-08-11 — `d14926c9a`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent runtime/deploy ancestry census, PostgreSQL 16 retirement probes и env fault injection |
| Вердикт | **FAIL — 5 MUST FIX; не к land/TEST** |

### MEDIA-006 — control-only runtime не запускается

**ОТКРЫТО — MUST FIX.** `apps/media-worker/src/env.ts` одновременно требует и запрещает `DATABASE_URL`, а
`main.ts` всё ещё создаёт PostgreSQL pool/telemetry из `env.DATABASE_URL`. Штатно измерено:
`pnpm --dir apps/media-worker test` → exit `1`, `1 failed / 8 passed`; `pnpm --dir apps/media-worker typecheck`
→ exit `2`, потому что `MEDIA_WORKER_CONTROL_URL` отсутствует в типе env.

### MEDIA-007 — принятые MEDIA-001–004 потеряны при replay

**ОТКРЫТО — MUST FIX.** `git merge-base --is-ancestor a5684df48 d14926c9a` и
`git merge-base --is-ancestor e2cdadb5d d14926c9a` → exit `1`. Поэтому в candidate нет уже принятого HTTP
control route/client и PostgreSQL seam: оба exact webapp vitest пути вернули `No test files found`. Исправление
обязано восстановить принятый код, а не только удалить credential.

### MEDIA-008 — C4 по-прежнему строит четвёртый DB login

**ОТКРЫТО — MUST FIX.** `bootstrap-c4-test-env.mjs`, `assert-c4-operational-runtime-ready.sh`,
`deploy-test-saas.sh` и `c4-operational-runtime.sql` всё ещё генерируют/требуют media `DATABASE_URL`, четыре LOGIN
и membership `app_operational_media_worker`, тогда как provisioner и revision-10 declaration уже ожидают три
operational login. Общая цепочка внутренне несовместима и сохраняет третий DB credential family.

### MEDIA-009 — env denylist имеет обходы

**ОТКРЫТО — MUST FIX.** Preflight с валидным HTTP control и `PGSSLMODE=require` вернул exit `0`. Прямой fault
probe также показал принятыми `PGSSLCRL`, `PGSSLCRLDIR`, `PGSSLMINPROTOCOLVERSION`, `MEDIA_WORKER_CA`,
`MEDIA_DATABASE_CA`, `MEDIA_POSTGRESQL_URL`. Запрет должен покрывать PostgreSQL ambient/alias env, а self-test —
краснеть на каждом классе обхода.

### MEDIA-010 — активная инструкция противоречит cutover

**ОТКРЫТО — MUST FIX.** Отдельный media DB URL/login всё ещё предписан в активных
`apps/media-worker/README.md`, `deploy/env/README.md`, `deploy/HOST_DEPLOY_README.md` и C4/hard-migration docs.
Исторические audit/evidence/archive записи не переписываются; активный runbook должен однозначно требовать HTTP
control + internal secret и отсутствие DB credential.

### Что подтверждено и сохраняется

- `node deploy/host/retire-media-db-login.test.mjs` → exit `0`; расширенный disposable PostgreSQL 16 proof
  подтвердил отзыв membership/table/column/schema/sequence/function/type/default ACL, rollback при cross-database
  dependency, owned-object abort и идемпотентность.
- `node scripts/check-db-chokepoint.mjs`, его self-test, shell/MJS syntax, build и diff-check прошли.
- Эти зелёные проверки принимают retirement primitive, но не готовность процесса или deploy-chain.

## Audit RUNTIME-FIX4-2026-08-11 — `93f7a1207`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent PostgreSQL 16 transaction/readiness faults, callsite/catalog mutation и deploy wiring removal |
| Вердикт | **FAIL — RUNTIME-011/012 PASS; 4 MUST FIX; не к land** |

### RUNTIME-013 — generated env стирает relation capabilities

**ОТКРЫТО — MUST FIX.** `renderPortContextRuntimeEnv` строит JSON только из десяти named-root descriptors, а
`bootstrap-c4-test-env.mjs` заменяет переменную целиком. Независимая команда над declaration/render вывела
`integrator missing=delivery,scheduler,service` и `webapp missing=service`; runtime probe подтвердил те же четыре
`Missing declared ... port capability`. Relation-capabilities должны жить в том же declaration-derived каталоге
и сохраняться при host render, иначе startup/readiness неоперабелен.

### RUNTIME-014 — generator проверяет сам себя, не production callsites

**ОТКРЫТО — MUST FIX.** Mutation
`password_login_acquire.functionIdentity → app.password_login_complete(uuid,boolean)` оставила
`port-context-catalog.test.mjs` `2/2` и оба regenerated artifact checks зелёными, после чего реальный callsite упал
на missing unique descriptor. Нужен независимый exact callsite↔catalog behavioral oracle.

### RUNTIME-015 — deploy closure seed apply не защищён self-test

**ОТКРЫТО — MUST FIX.** После временного удаления `install_port_context_capability_catalog` из
`deploy-test-saas.sh` shell syntax, bootstrap self-test и catalog test остались зелёными. Self-test общей
post-migration closure обязан краснеть, когда exact seed перестал применяться.

### RUNTIME-016 — новый PG oracle нарушает raw-SQL gate

**ОТКРЫТО — MUST FIX.** `node scripts/check-no-new-raw-sql.mjs` → exit `1` на
`apps/integrator/src/infra/db/runIntegratorSql.integration.test.ts:21,47,54`; из-за этого webapp lint завершился
exit `1`. Behavioral PostgreSQL oracle сохраняется, но должен пользоваться разрешённым test DB port/harness, а не
новым прямым `pg.Pool.query`.

### Исправлено громко

- **RUNTIME-011 ИСПРАВЛЕНО.** Integrator suite: `67` files / `391` passed; disposable PostgreSQL вернул исходный
  `42501`, `fallbackCalls=0`. Возврат catch/fallback mutation дал `1 failed / 3 passed`.
- **RUNTIME-012 ИСПРАВЛЕНО.** Возврат named roots внутрь relation transaction сделал оба readiness unit tests
  красными; disposable PostgreSQL дал `42501` внутри relation-context и success в exact named-context.
- DB-principal `25/25`, PG16 fault suite, chokepoint/self-test, integrator lint/typecheck, webapp typecheck и
  diff-check прошли; fault mutations откатились, дерево аудитора чистое.

## Audit MEDIA-DB-DOOR-FINAL-R2-2026-08-11 — `f0e0adb3c`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent deploy-order inspection, env fault injection, PostgreSQL 16 retirement probes |
| Вердикт | **FAIL — MEDIA-006/007 исправлены; DEPLOY-001 и MEDIA-008–010 MUST FIX; не к land/TEST** |

### DEPLOY-001 — HTTP readiness вызывается до нового webapp

**ОТКРЫТО — MUST FIX.** В PROD operational readiness вызывается до restart webapp, поэтому первый rollout получает
старый процесс без control route и `404`. В TEST все units сначала остановлены, provision уже вызывает HTTP
readiness, а webapp стартует позднее; первый cutover детерминированно падает. Deploy sequence обязан сначала
поднять новый webapp, затем проверять authenticated media control, не открывая старый DB-door.

### MEDIA-008 — четвёртый media credential не закрыт fail-closed

**ОТКРЫТО — MUST FIX.** Реальный `saas-c2-secret-preflight.mjs` с `DATABASE_URL_MEDIA_WORKER` в API env вернул
exit `0`. Mutation с четвёртым элементом `OPERATIONAL_KEYS` не покрасила
`bootstrap-c4-test-env.mjs --self-test` (exit `0`). Старый URL/credential может пережить cutover; preflight,
bootstrap oracle и автоматический retirement должны закрывать это как одно обязательное поведение.

### MEDIA-009 — denylist пропускает обычные неизвестные DB aliases

**ОТКРЫТО — MUST FIX.** Runtime guard принял `POSTGRESQL_URL`, `POSTGRES_URL`, `POSTGRES_PASSWORD`,
`MEDIA_WORKER_CONNECTION_STRING`, `MEDIA_CONNECTION_STRING`, `DB_URL`; полный preflight с `POSTGRESQL_URL` в
media env также вернул exit `0`. Запрет обязан ловить DB URL/credential families поведенчески, без списка только
из уже известных старых имён.

### MEDIA-010 — активный C4 runbook всё ещё описывает пять DB login/URL

**ОТКРЫТО — MUST FIX.** `SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md` требует “five distinct LOGIN roles” и readiness
через “five distinct URLs”, тогда как исполняемая цель — три DB login плюс authenticated HTTP control.

### Исправлено громко

- **MEDIA-006 ИСПРАВЛЕНО:** media-worker control-only runtime: `5 files / 16 tests`, typecheck/build PASS.
- **MEDIA-007 ИСПРАВЛЕНО:** ancestry `442489525`, `a5684df48`, `e2cdadb5d` присутствует; route `8/8`, PostgreSQL
  seam `7/7`, wrong-role и extra-command mutations красные.
- Retirement primitive сохранил полный ACL rollback; chokepoint, штатные self-tests, webapp type/lint и
  `git diff --check 442489525..f0e0adb3c` прошли. Эти PASS не принимают deploy/cutover целиком.

## Audit FUNCTION-CENSUS-R2-2026-08-11 — `e94107b95`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent PostgreSQL 16 bilateral catalog mutations и read-only DEV/TEST comparison |
| Вердикт | **FAIL — основной census подтверждён; 4 MUST FIX; не к land** |

### SEAM-001 — 13 genuine pre-session функций недоступны `app_pre_session`

**ОТКРЫТО — MUST FIX.** Сравнение `BUSINESS_SEAM_FUNCTIONS` с authoritative evidence/30 §7.1 дало
`evidence=34 mapped=34 pre_session=21`. У 13 rate-limit/email OTP/public reference/VAPID/slug/SMTP/public-booking
phone OTP функций caller заменён на `app_patient` либо другую runtime-роль. Exact pre-session checkout получит
permission denied, а лишний caller сохранит EXECUTE.

### SEAM-002 — verifier пропускает EXECUTE произвольному LOGIN

**ОТКРЫТО — MUST FIX.** Disposable mutation `CREATE ROLE audit_rogue LOGIN; GRANT EXECUTE ... TO audit_rogue`
оставила verifier зелёным: bilateral census ограничен известными declaration logins и PUBLIC.

### SEAM-003 — verifier пропускает extra SECURITY DEFINER в `public`

**ОТКРЫТО — MUST FIX.** `public.audit_extra()` осталась незамеченной, потому что extra-definer closure проверяет
только `app`/`app_ext`. Все managed application schemas должны сравниваться bilateral.

### SEAM-004 — seam owner может сам стать member другой роли

**ОТКРЫТО — MUST FIX.** `GRANT app_service TO app_seam_dedicated_bot_owner` не покрасил verifier: проверяется
только обратное направление membership. Все 42 seam owners обязаны быть memberless в обоих направлениях.

### Подтверждено и сохраняется

- Strict TypeScript и census tests `5/5`; штатная PG16 acceptance: TEST `247` definers/`42` owners, DEV `234`/`42`.
- Read-only live comparison: metadata mismatch TEST `0/238`, DEV `0/225`; TEST-only presence `13/13`; obsolete
  context functions `0`; OpenPGP/HMAC hits `0`.
- Independent PG16 mutations: `13/16` пойманы, три пропущенных соответствуют SEAM-002–004.
- Dedicated-bot owner/caller/surface верны; lexical surfaces `467`, автоматически созданных grant entries `0`.
- `generate-cli.mjs --gaps` честно exit `2`: `223` relation gaps на каждую DB и обе missing APIs остаются открыты.

## Fix verification FUNCTION-CENSUS-FIX-2026-08-11 — `f27bf390b`

| Поле | Значение |
|---|---|
| Метод | **Тот же сохранённый test+view gate**: exact authority comparison и PostgreSQL 16 catalog mutations |
| Вердикт | **PASS bounded function/seam census — к land; relation grant matrix остаётся открыта** |

- **SEAM-001 ИСПРАВЛЕНО:** authoritative pre-session `authority=34 mapped=34 exact=34`; у каждой only caller
  `app_pre_session`. Mutation с REVOKE красная.
- **SEAM-002 ИСПРАВЛЕНО:** actual EXECUTE ACL сравнивается со всеми catalog grantee; произвольный rogue LOGIN
  красит verifier, generated reconciliation снимает grant и возвращает green.
- **SEAM-003 ИСПРАВЛЕНО:** extra-definer closure покрывает `public/app/integrator/app_ext/drizzle`, исключая
  extension-owned/system objects; лишняя `public` SECURITY DEFINER красит verifier и transactional closure.
- **SEAM-004 ИСПРАВЛЕНО:** 42 seam owners memberless bilateral; обе membership directions red → reapply → green.
- Unit census/context `8/8`; strict TypeScript; PG16 function acceptance TEST `247`, DEV `234`, `42` owners и
  `12` real mutations/DB; context catalog acceptance `10` capabilities — PASS. Scope ровно пять privilege-файлов,
  `git show --check f27bf390b` и чистое дерево — PASS.

**ОСТАЁТСЯ ОТКРЫТО ГРОМКО:** `generate-cli.mjs --gaps` exit `2`, `223` relation gaps/DB и две missing named APIs.
Этот PASS принимает точный function/seam census, а не полную grant/RLS operability.

## Audit RUNTIME-FIX5-2026-08-11 — `9d7332be2` / HEAD `a5b12040d`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: independent repo-wide callsite census, disposable PostgreSQL 16 role/error probes |
| Вердикт | **FAIL — RUNTIME-015 и 011/012 PASS; RUNTIME-013/014/016 MUST FIX; не к land** |

### RUNTIME-013 — relation catalog противоречит active role graph

**ОТКРЫТО — MUST FIX.** Формальный census `10 function rows + 14 relation env descriptors` зелёный, но integrator
не имеет relation descriptor `resolver`, webapp не имеет active `pre_session`/telemetry, а webapp `service →
app_service` и `tenant_service → app_tenant_service` недостижимы его exact staff login membership. Disposable
role probe: `staff_app_service_set=false`, `staff_tenant_service_set=false`, `integrator_resolver_set=true`.
`webapp-health-check` поэтому выбирает capability, после которой `SET LOCAL ROLE app_service` получает permission
denied. Исправление не может расширить запрещённый webapp membership: source/capability надо назначить правильной
достижимой роли по смыслу. Targeted integrator suite дополнительно red: `1 failed / 20 passed / 1 skipped` из-за
sync `toThrow` против rejected Promise в `withClient.test.ts`.

### RUNTIME-014 — callsite oracle не path-independent

**ОТКРЫТО — MUST FIX.** Oracle содержит фиксированный `CALLSITE_FILES` из четырёх путей и не обнаруживает новые/
перемещённые production roots repo-wide. Четыре локальные descriptor mutations краснеют, но фактический
RUNTIME-013 остаётся false-green. Нужен production-source discovery, независимый от generator expected list.

### RUNTIME-016 — committed PostgreSQL 42501 oracle красный

**ОТКРЫТО — MUST FIX.** Реальный opt-in disposable PG16 исполняет statement один раз и даёт
`fallbackCalls=0`, `cause.code=42501`, но committed test проверяет только top-level `error.code` и падает с
`undefined`. Oracle обязан корректно доказывать SQLSTATE по фактической error chain и оставаться green без raw SQL.

### Исправлено громко

- **RUNTIME-015 ИСПРАВЛЕНО:** dedicated strict closure self-test green; удаление installer call даёт exit `1`,
  `status=74`.
- **RUNTIME-011/012 PASS сохранён:** failed SQL не ретраится; named roots выбираются до checkout, возврат внутрь
  relation transaction красит readiness test.
- Webapp `13` targeted tests, catalog/callsite unit `5/5`, db-principal `25` + `14 FAULT`, оба lint/typecheck,
  raw-SQL/chokepoint gates и deterministic artifacts прошли; финальное audit tree чистое.

## Audit MEDIA-DB-DOOR-FINAL-R3-2026-08-11 — `be2b7b744` / HEAD `441e5fb04`

| Поле | Значение |
|---|---|
| Метод | **Тест + взгляд**: reuse deploy-order/env/retirement kill-set across every actual caller |
| Вердикт | **FAIL — основной cutover gate PASS; 2 MUST FIX; не к land/TEST** |

### DEPLOY-001 — bootstrap-systemd-prod обходит общий cutover gate

**ОТКРЫТО — MUST FIX.** `bootstrap-systemd-prod.sh` запускает webapp, затем напрямую media-worker при наличии
env/build, без authenticated control probe и проверки/retirement legacy role. На первом rollout он может поднять
старый media-worker с DB-door и завершиться успешно. Исправленные `deploy-prod.sh`/`deploy-test-saas.sh` и helper
недостаточны, пока этот actual caller не использует ту же ordered sequence.

### MEDIA-010 — ещё два активных runbook описывают старый порядок

**ОТКРЫТО — MUST FIX.** `SAAS_PROD_DEPLOY_PROCESS.md` всё ещё требует `5-contour operational roles` и readiness
до traffic cutover; `HARD_MIGRATION_PROTOCOL.md` требует media-control readiness до restart. Первый cutover тогда
обращается к старому/остановленному webapp; automatic ordered retirement не описан.

### Подтверждено и сохраняется

- Общий helper fault-test red на restart-before-retirement; provision/preflight/bootstrap self-tests PASS.
- Реальный preflight: fourth media URL rejected `3/3` env, aliases rejected `28/28`, positive control green.
- PostgreSQL 16 retirement PASS; media `16`, route `8/8`, seam `7/7`, exact commands `11`, chokepoints PASS.
- Webapp type/lint, syntax, ancestry/diff-check и clean final tree PASS.

## Fix verification MEDIA-DB-DOOR-FINAL-FIX-2026-08-11 — `76e1f5e85`

| Поле | Значение |
|---|---|
| Метод | **Тот же сохранённый deploy-order gate**: actual bootstrap caller trace + fault mutations |
| Вердикт | **PASS media DB-door stage — к integration CI/land** |

- **DEPLOY-001 ИСПРАВЛЕНО:** `bootstrap-systemd-prod.sh` останавливает legacy media, рестартует новый webapp и
  вызывает общий sequence: `is-active → authenticated control → exact legacy login retirement → media restart`.
  Inactive webapp, control failure и retirement failure не доходят до media; helper bypass и перестановка дают RED.
- **MEDIA-010 ИСПРАВЛЕНО:** active PROD/hard-migration runbooks требуют три DB login и ordered automatic cutover;
  active-doc census не нашёл five-contour/five-URL формулировок вне historical evidence/archive/audit.
- Сохранены env negatives `3/3 + 28/28`, media `16`, route `8/8`, seam `7/7`, PostgreSQL retirement,
  chokepoint/self-test, syntax/diff/show check и чистое дерево.

PASS принимает удаление третьей media DB-door и deploy safety; full privilege-layer, mTLS host и relation grants
остаются отдельными открытыми требованиями.

## Fix verification RUNTIME-FIX6-2026-08-11 — `c2e5d5cad`

| Поле | Значение |
|---|---|
| Метод | **Тот же сохранённый runtime gate**: repo-wide AST census + SET-membership + real PG16 error path |
| Вердикт | **PASS runtime capability catalog — к integration CI/land** |

- **RUNTIME-013 ИСПРАВЛЕНО:** integrator resolver descriptor добавлен; webapp pre-session/telemetry явны;
  health источники идут через reachable `app_worker`; запрещённые webapp service/tenant descriptors удалены.
  PG16 acceptance: `10` function rows и `15` relation descriptors, каждый SET-able exact port login.
- **RUNTIME-014 ИСПРАВЛЕНО:** recursive production AST census сканирует оба app source roots, исключая tests/
  generated; находит `10` literal roots + `1` dynamic wrapper. Add/move/remove/extra/cross-port/wrong-port mutations
  красные.
- **RUNTIME-016 ИСПРАВЛЕНО:** real disposable PG16 даёт SQLSTATE chain `42501`, `statement_count=1`,
  `fallback=0`; server statement count подтверждён. Async rejected assertion исправлен.
- Targeted integrator `23 pass / 1 opt-in skip`, webapp `14`, catalog `8`, db-principal `25 + 14 faults`, strict
  closure, generator byte-check, оба lint/typecheck, raw-SQL/chokepoint self-tests и `git show --check` — PASS.

Этот PASS принимает runtime wrapper/catalog wiring, но не relation grant matrix, host mTLS или live DEV/TEST.

## Audit DB-ACCESS-PROGRESS-2026-08-11 — main `b27bebfa6`, candidates through `da5679122`

| Поле | Значение |
|---|---|
| Метод | **Взгляд + repository/process evidence**: owner goal → ancestry → audit/fix sequence → CI/land hygiene |
| Вердикт | **PASS WITH CORRECTIONS — clear convergence; обязательный locked CI исправлен** |

- **ЦИКЛА НЕТ:** function census `4 findings → f27bf390b PASS`; runtime завершил пять содержательных сужений
  `9 → 3 → 3 → 4 → 3 → c2e5d5cad PASS`; media после одного ancestry-replay сузился
  `5 → 4 → 2 → 76e1f5e85 PASS`. После финальных fixer SHA новые blind audits не запускаются: используется
  сохранённый kill-set и лидерская проверка.
- **PROCESS-CI-001 ИСПРАВЛЕНО ГРОМКО:** первый прямой `pnpm run ci` обнаружил ambient-env зависимость двух
  `d15b6PhoneMessengerBindMirror` tests. Коммит `da5679122` передаёт явный fake Pool; exact test без
  `DATABASE_URL` — `2/2 PASS`. Обязательный gate затем выполнен штатно:
  `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"` → lock acquired/released, `rc=0`, `604s`.
  Внутри: integrator `374`, db-principal `21` + PostgreSQL 16 fault acceptance, webapp `1166`, media `16`,
  production build `426` страниц и полный repository audit — PASS.
- **LAND-QUEUE-001 ИСПРАВЛЕНО ГРОМКО:** land gate выявил три ранних product-коммита без собственных строк
  очереди: `434de6457 → 0d3653b1f → e537f0f52`. Они являются ancestry последовательно проверенных media
  candidates (`72c1f2c17/e2cdadb5d`, затем финальный `76e1f5e85`) и не получают отдельный новый PASS: в queue
  зарегистрировано, что их исходные неполные состояния заменены и приняты только в составе финального fixer.
- Main на снимке аудитора чист и совпадал с origin; product candidates не были выданы за landed. Runtime
  `c2e5d5cad`, seams `f27bf390b` и media stack through `da5679122` оставались candidate+proved.
- **ОСТАЁТСЯ ОТКРЫТО ГРОМКО:** host mTLS отсутствует; login ACL ещё не обнулены; seam-кандидат оставляет
  `223` relation gaps/DB и две missing named APIs; atomic reset/regrant/restore, DEV/TEST probes и PostgreSQL
  live journal proof ещё не выполнены. Taskdb #1084/#1085 остаются `doing`; их descriptions надо обновить после
  ближайших lands.
- Не продолжать старую `wt/port-context-grants`: её callsite census не уменьшает gaps. Критический путь:
  land media → runtime → seams; затем full semantic grant matrix + atomic artifacts; host mTLS DEV; TEST
  deploy/probes/logging; финальный locked CI/taskdb/push.

## Integration verification RUNTIME-MEDIA-MERGE-2026-08-11 — `9414b5ef7`

| Поле | Значение |
|---|---|
| Метод | **Сохранённые runtime/media kill-sets + mandatory host-locked full CI** |
| Вердикт | **PASS — runtime capability/context candidate совместим с landed media; к land** |

- Merge `b97d61eeb` разрешил четыре реальных пересечения и сохранил обе границы: runtime relation/function
  capabilities работают через два DB port factory; media-worker не имеет собственного DB pool/login и вызывает
  authenticated webapp control. PostgreSQL 16 probes: `10` function capabilities, `15` SET-able relation
  descriptors, `25` db-principal tests и `14` fault injections — PASS.
- **RUNTIME-INTEGRATION-001 ИСПРАВЛЕНО:** C4 chain self-test раньше читал скрипты из hardcoded main checkout.
  `9414b5ef7` оставляет live `SRC_REPO` без изменений, но self-test разрешает и path-guards все artifacts
  относительно реально исполняемого checkout; exact gate подтвердил
  `checkout=/home/dev/dev-projects/bcb-wt-portctx-runtime`.
- Первый locked CI дошёл до dependency audit и обнаружил не source regression, а stale worktree install:
  Vitest `4.1.6` при committed lock `4.1.10`; старые installed CVE packages дали red. После
  `pnpm install --frozen-lockfile` actual Vitest `4.1.10`, старые packages отсутствуют, `pnpm audit` чист.
- Финальный `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"` → lock acquired/released, `rc=0`, `528s`:
  integrator `390`, db-principal `25`, webapp `1182`, media `16`, PostgreSQL 16 acceptance, production build
  `426` страниц и repository/dependency audit — PASS.
- Land-queue ancestry registration покрывает промежуточные fix/merge commits только как части уже
  зафиксированной цепочки FAIL→fix→`c2e5d5cad`→integration PASS; отдельный новый product PASS им не присваивается.

Этот PASS не принимает full relation grants, atomic reset/regrant/restore, host mTLS или DEV/TEST cutover.

## Integration verification FUNCTION-SEAM-MERGE-2026-08-11 — `f08d6acdc`

| Поле | Значение |
|---|---|
| Метод | **Сохранённый function-census kill-set + runtime/media regressions + mandatory locked full CI** |
| Вердикт | **PASS — exact SECURITY DEFINER seam совместим с landed runtime/media; к land** |

- Merge `f08d6acdc` (`f27bf390b` + main `12eec600e`) прошёл без конфликтов; diff против main ограничен девятью
  `deploy/postgres/privileges/**` файлами. Runtime generator/catalog изменения и seam closure сохранились вместе.
- Function census: `34/34` genuine pre-session roots имеют единственного caller `app_pre_session`; TEST `247`,
  DEV `234`, `42` memberless seam owners и `12` реальных красных mutations на каждую БД — PASS. Rogue LOGIN
  EXECUTE, extra definer и обе membership directions обнаруживаются и transactional reapply их очищает.
- Runtime/media regressions: `10` function capabilities, `15` SET-able relation descriptors, `14` port-context
  faults, integrator targeted `16`, webapp `23`, media `16`, db-principal `25` — PASS.
- Fail-closed сохранён намеренно: `generate-cli.mjs --gaps` для TEST и DEV возвращает exit `2`,
  `unresolved=223`, missing named APIs `2`; relation grants не расширены и gaps не замаскированы.
- `pnpm install --frozen-lockfile`, затем `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"` → lock
  acquired/released, `rc=0`, `545s`; полный test/build/audit и dependency audit — PASS.

Этот PASS принимает exact function/seam census, но не full relation grants, atomic artifacts, host mTLS или
DEV/TEST cutover.

## Audit RELATION-MATRIX-WIP-2026-08-11 — `75c0d9530` + незакоммиченный grants diff

| Поле | Значение |
|---|---|
| Метод | **Взгляд**: independent runtime callsite/RLS/role×operation×column review; generator self-check — только контроль |
| Вердикт | **FAIL — направление верное, но WIP нельзя коммитить/land/deploy** |

`node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps --db bcb_webapp_dev`
дал `classified=238 active=225 pending=13 unresolved=0 gaps=0`; `git diff --check` — PASS. Это доказывает
внутреннюю замкнутость декларации, но не least privilege и не работоспособность runtime после cutover.

### REL-001 — живые пути ошибочно попали в PENDING_REMOVAL

**ОТКРЫТО — MUST FIX.** Нулевые grants до переключения кода ломают active runtime: `appointment_records`
используется projection/purge/merge/admin stats; legacy integrator relations ещё участвуют в channel routing,
message threads и merge preview. `integrator.identities` дополнительно нужен staff Telegram username path и
RLS-предикату `telegram_state`. Каждый путь надо атомарно перевести на retained model либо временно вернуть
relation в ACTIVE с точным доступом. **ИСПРАВЛЕНО В WIP:** шесть duplicate writes в
`be_appointment_events` удалены; retained `be_appointment_history_events` остаётся write authority.

### REL-002 — tenant grants не совпадают с RLS и реальными операциями

**ОТКРЫТО — MUST FIX.** У `app_tenant_service` найдены `48` relations, где grant существует, но permissive policy
допускает только staff/patient; calendar sync и platform merge после cutover получают RLS deny. Простое tenant OR
запрещено: calendar нужны exact SELECT-колонки, merge — главным образом `UPDATE(platform_user_id)`, а не broad
table UPDATE. Integrator idempotency/data-quality/projection также требуют role-specific scope, а не role-only
policy.

### REL-003 — lexical upper bound был выдан как privilege authority

**ОТКРЫТО — MUST FIX.** Измеренный WIP всё ещё содержит сотни table-wide staff/tenant operation edges. Достижимые
примеры: UPDATE audit/history rows; изменение provider payload/idempotency identifiers; расширение payment intent/
payment UPDATE за реальные `status/updated_at`; лишние DELETE/UPDATE для package/specialist/reference paths.
Требуется exact role×operation×column census и command-aware org/patient RLS; `gaps=0` критерием завершения не
является.

### Исправлено громко в том же WIP и должно сохраниться

- **FIXED:** `app_patient` direct table grants сведены к нулю; self-booking идёт через boolean/named roots.
- **FIXED:** tenant `platform_users` DELETE снят, INSERT/UPDATE ограничиваются конкретными колонками.
- **FIXED:** `integrator.idempotency_keys` и `integration_data_quality_incidents` переводятся на named seams.
- **FIXED:** `projection_outbox`: request — exact INSERT; worker — SELECT + exact UPDATE; DELETE/app_service сняты.
- **FIXED:** tenant `be_appointments` — SELECT `id, package_usage_ref` и UPDATE `platform_user_id`.
- **FIXED:** лишние operation edges сняты с `be_package_items`, `be_subscription_packages`,
  `be_specialist_rooms`, `recommendation_regions`.
- **FIXED:** strict capability tuple восстановлен; migration ledger — named root; deploy gate делает bilateral
  exact closure и PostgreSQL 16 faults missing/mutated/stale красные.

Следующий gate: законченная narrow matrix + исправленные live PENDING paths + phone completion без delegated-args
обхода, затем один disposable PostgreSQL 16 reset/regrant behavior proof и повтор этого сохранённого kill-set.

## Land gate GRANTS-R2-2026-08-12 — `456f7e3e4`

| Поле | Значение |
|---|---|
| Метод | **Взгляд**: owner-порядок + deploy/migration/runtime path; targeted checks только подтверждают diff |
| Вердикт | **FAIL — DB candidate сохранён в origin, но не приземляется до точки ноль/cutover** |

- **GRANTS-R2-LAND-001 — ОТКРЫТО — MUST FIX.** Ранний fail-closed guard в `deploy-test.sh` покрывает только уже
  выбранный `port-context`. В поддерживаемом `locked` ordinary deploy доходит до `pnpm migrate`; journal включает
  `0385`, которая удаляет `install_signed_context`, `release_principal_context` и `reset_principal_context`, пока
  locked runtime ещё вызывает их. Достижимый путь: TEST на `0384` + locked env → deploy применяет `0385` раньше
  точки ноль/mTLS cutover → runtime/closure не стартуют. Это нарушает owner-порядок и делает ветку небезопасной
  промежуточной поставкой.
- Решение land-gate: не замораживать все TEST deploy искусственным общим guard. DB candidate остаётся запушенным;
  в `feat` сначала входят только независимо безопасные изменения. Следующий DB-этап — воспроизводимая миграция
  точки ноль и её отдельное disposable/DEV доказательство; `0385` и новая выдача применяются только после него.
- Остальной gate на `456f7e3e4` зелёный: `git diff --check`; bash syntax; bootstrap self-test; relation/catalog
  `17/17`; generated `--check`; phone completion `2/2`; прямых patient/pre-session grants и target `BYPASSRLS`
  нет. Host mTLS, zero-state и TEST cutover честно остаются открыты.

## Audit ZERO-STATE-2026-08-12 — `932669ce0` → fixer `7308baa85`

| Поле | Значение |
|---|---|
| Метод | **Взгляд + PostgreSQL 16.14 test**: owner-порядок, revoke-only артефакты, bilateral verifier, независимые fault injections |
| Вердикт | **FAIL → ИСПРАВЛЕНО ГРОМКО → PASS** |

- **ZERO-STATE-001 ИСПРАВЛЕНО:** первый аудит доказал ложный PASS verifier: standalone composite type мог
  сохранить чужой `USAGE`, а application collation — чужого владельца. Fixer `7308baa85` включает composite и
  multirange types в revoke/ownership/verifier и нейтрализует + проверяет collation ownership.
- Сохранённый `bash deploy/postgres/privileges/zero-state.acceptance.sh` на PostgreSQL `16.14` — PASS: `9`
  независимых fault-классов, повторное применение, atomic rollback, third-DB blocker и громкий login refusal в
  server log. Отдельная инъекция дала `perdb=postgres|f|f|postgres|1|f`, `cluster=0|1`: ACL сняты, оба владельца
  стали `postgres`, строка сохранена, exact legacy roles удалены, посторонняя роль сохранена.
- **LIVE-CENSUS-001 ИСПРАВЛЕНО В КАНДИДАТЕ:** read-only сравнение фактических DEV/TEST ролей с generated exact
  list нашло два пропуска — `app_migrator` и `app_phone_bind_completion`; оба добавлены в zero-state и независимо
  доказано их `NOLOGIN`/удаление. `bcb_webapp_prod` оставлен вне контура согласно evidence/13.
- `rg '^\s*(GRANT|CREATE ROLE|CREATE USER|CREATE POLICY)\b' deploy/postgres/generated/zero-state.*.sql | wc -l`
  → `0`; generated `--check`, `node --check`, `bash -n`, targeted ESLint и `git diff --check` — PASS.

PASS принимает воспроизводимый revoke-only контракт и disposable proof точки ноль. Он не разрешает выдавать новые
grants до отдельного live DEV zero-state proof и не принимает mTLS/transaction context/RLS/runtime cutover.

## Audit HOST-MTLS-R2-2026-08-12 — `69dcadeb6`

| Поле | Значение |
|---|---|
| Метод | **Взгляд + independent PostgreSQL 16.14 fault injection**: HBA exactness, loaded config, TLS material, readiness/rollback |
| Вердикт | **FAIL → ИСПРАВЛЕНО ГРОМКО `3de484cb1` → PASS OFFLINE** |

- **HOST-MTLS-001 — ИСПРАВЛЕНО ГРОМКО `3de484cb1`:** readiness теперь выполняет три реальные positive и пять
  negative connection probes и требует свежую запись auth refusal в PostgreSQL journal. Сохранённая инъекция
  активного `hostssl all all ... trust` делает readiness красным вместо ложного PASS.
- **HOST-MTLS-002 — ИСПРАВЛЕНО ГРОМКО `3de484cb1`:** preflight проверяет CA/CRL, cert↔key и key mode до записи;
  apply сверяет реально предъявленный PostgreSQL server certificate после reload. Несовпадающий ключ отвергается,
  исходные HBA/config остаются побайтно прежними.
- **HOST-MTLS-003 — ИСПРАВЛЕНО ГРОМКО `3de484cb1`:** renderer запрещает HBA special identifiers, wildcard/role
  forms и duplicate/nested/malformed managed blocks; unit faults по каждому классу зелёные.
- Остальной сохранённый oracle зелёный: три mTLS positive, password/wrong-CN/non-TLS/socket/server-impersonation
  negatives, CRL rejection/drain, прежние context/RLS fault classes, `managed_hostssl_rules=6`, role/grant DDL `0`.

Лидер повторил сохранённый oracle на итоговом SHA: `bash -n` обоих shell-файлов, `node --check` обоих renderer
файлов, `git diff --check 69dcadeb6..3de484cb1` и `pnpm run test:postgres-mtls-host` — PASS; disposable PostgreSQL
16 отработал mTLS apply/readiness, broad-HBA rejection и все прежние context/RLS fault classes. Live
DEV/TEST/PROD и host files не затрагивались. PASS разрешает интеграцию offline primitive, но не является live
host cutover — тот остаётся отдельным атомарным gate вместе с ролями/grants.

## Completeness gate POSTZERO-ACCESS-R3-2026-08-12 — `4a4dbef6a`

| Поле | Значение |
|---|---|
| Метод | **Взгляд**: сверка результата с исходным worker brief и owner-порядком |
| Вердикт | **FAIL CHECKPOINT — сохранён в origin, НЕ К AUDIT/LAND/DEV/TEST** |

- Полезный сдвиг сохранён: свежая матрица описывает `238` relations, structural generator сообщает
  `unresolved=0`/`gaps=0`, direct patient grants отсутствуют, несколько живых caller paths переведены на named roots.
- **POSTZERO-R3-001 — ОТКРЫТО:** исполнитель не создал объявленные named roots/точный DDL, хотя это обязательная
  часть исходного brief. Декларация не является исполняемым доступом.
- **POSTZERO-R3-002 — ОТКРЫТО:** отсутствует live-catalog zero precondition и атомарный установщик
  `zero PASS → roles/context/RLS/grants/seams`; checkpoint нельзя безопасно применить после restore/zero.
- **POSTZERO-R3-003 — ОТКРЫТО:** отсутствует обязательный disposable PostgreSQL 16 behavior proof для positives,
  cross-boundary/context/direct-bypass negatives, drift repair, rollback и server journal. Поэтому `gaps=0` пока
  доказывает только внутреннюю согласованность generator, не безопасность или работоспособность схемы.

Следующий ход продолжает тот же stage в той же ветке до исполнения всех трёх пунктов; независимый security audit
запускается только после этого, чтобы не выдавать заведомо незавершённый checkpoint за кандидата.

## Independent matrix audit POSTZERO-R3-MATRIX-2026-08-12 — `4a4dbef6a` → partial `9f50ae649`

| Поле | Значение |
|---|---|
| Метод | **Взгляд** по точному SHA: owner-порядок, relation/caller census, role/policy paths; без продуктовых правок |
| Вердикт | **FAIL — 5 реальных блокеров; 1 исправлен в partial, 4 + E2E остаются открыты** |

- **POSTZERO-MATRIX-001 — ОТКРЫТО, P0:** `4a4dbef6a` удалил `generateZeroStateSql`,
  `generateZeroStateClusterSql` и обработку `--zero-state*`; флаги молча стали проверять обычные grants. Это стирает
  уже принятую исполняемую точку ноль и нарушает обязательный порядок. В `9f50ae649` не исправлено.
- **POSTZERO-MATRIX-002 — ОТКРЫТО, P0 / REL-001:** `integrator.identities`, `integrator.telegram_state`,
  `public.appointment_records` и другие relations объявлены `PENDING_REMOVAL` с полным revoke, хотя production
  callers всё ещё читают их (`channelUsers`, admin stats, merge preview). После regrant ломаются routing/phone
  lookup/preview, а stats местами тихо возвращает ложный ноль. В `9f50ae649` callers/matrix не исправлены.
- **POSTZERO-MATRIX-003 — ИСПРАВЛЕНО ГРОМКО В PARTIAL `9f50ae649`:** одиннадцать вызываемых named roots ранее
  существовали только в declaration/callers. Partial добавил конкретные SECURITY DEFINER bodies, каждый через
  exact `require_accepted_context`; `require_current_seam_context` и phone completion role отсутствуют. Это ещё
  не PASS слоя без полного installer acceptance.
- **POSTZERO-MATRIX-004 — ОТКРЫТО, P1:** global-admin health archive вызывается под
  `app_platform_settings`, но matrix выдаёт `operator_health_failure_archive` только org-scoped `app_staff`.
  Достижимый результат после cutover — `42501`/500 в global-admin GET.
- **POSTZERO-MATRIX-005 — ОТКРЫТО, P0 SECURITY:** classification прямо запрещает clinic staff доступ к
  `system_settings_audit` из-за legacy `old_value_json/new_value_json` с секретами и global rows, но matrix снова
  выдаёт `app_staff` SELECT+INSERT и policy с `organization_id IS NULL`. Достижимы чтение старого platform secret
  и запись в глобальный audit ledger.
- **POSTZERO-MATRIX-006 — ОТКРЫТО:** partial `9f50ae649` добавил local installer, но исполнитель сам подтвердил
  отсутствие обязательного end-to-end disposable `zero → install → full target` proof с late rollback и drift
  repair. Его hand-written zero precondition не заменяет bilateral zero verifier и пока не доказан fault injection.

Положительно и должно сохраниться: точный SHA даёт `app_patient_table_grants=0`,
`app_pre_session_table_grants=0`, positive `BYPASSRLS=0`, по `172` restrictive context policies в каждом generated
artifact; матрица заметно сузила writes. Следующий fixer использует эти шесть сценариев как сохранённый kill-set и
заканчивает один stage; новый blind audit до этого не запускается.

## Independent installer audit POSTZERO-INSTALLER-2026-08-12 — `9f50ae649` → partial `65a0c7be6`

| Поле | Значение |
|---|---|
| Метод | **Взгляд** по exact SHA: реальный zero→installer порядок, role/env render, bilateral catalog, transaction и roots DDL |
| Вердикт | **FAIL — roots приняты; installer/runtime E2E остаётся блокером** |

- **INSTALLER-001 — ОТКРЫТО:** честный cluster zero удаляет три login, а installer начинает с `contract.sql`,
  который делает им `ALTER ROLE`; первый positive cutover падает `role does not exist` и откатывается.
- **INSTALLER-002 — ОТКРЫТО:** даже заранее созданные login не помогают: generated privileges позже снимает
  membership/CONNECT/schema grants и installer не выполняет exact env login renderer последним. Transaction может
  commit с мёртвыми positive ports; post-verifier это пока не ловит.
- **INSTALLER-003 — ЧАСТИЧНО ИСПРАВЛЕНО `65a0c7be6`, НУЖЕН FAULT PROOF:** ручной subset zero guard заменён
  извлечённым generated verifier. Однако temporary expected-role list строится через `SELECT` только по уже
  существующим ролям; после zero он пуст и не доказывает отсутствие всех declared BCB roles. Нужен literal exact
  expected set и fault injection ACL/owner/default/PUBLIC/policy/membership/powerful legacy role до первого DDL.
- **INSTALLER-004 — ИСПРАВЛЕНО ГРОМКО `65a0c7be6`:** roots/legacy context drops вынесены из orphan Drizzle
  `0385` в явно вызываемый cutover-only `deploy/postgres/privileges/post-zero-roots.sql`; ordinary locked migration
  больше не может преждевременно удалить старую дверь.
- **INSTALLER-005 — ОТКРЫТО:** capability seed/verifier удаляет stale rows только трёх текущих login и не сверяет
  `active_from`. Чужая legacy login row или future `active_from` переживает replace/reapply и даёт false-green либо
  постоянный `42501` легитимному порту.
- **INSTALLER-006 — ОТКРЫТО:** installer допускает только zero-first запуск; безопасного exact target reapply для
  ремонта ACL/policy/membership/function/capability drift нет. Повтор после успеха отказывается из-за существующих
  ролей вместо восстановления target.
- **INSTALLER-007 — ОТКРЫТО:** installer не имеет behavior test. Текущий catalog acceptance создаёт облегчённые
  boolean stubs и не проверяет real roots owner/security/search_path/returns/EXECUTE. Нужен disposable PostgreSQL
  16 full zero→install→positive/negative runtime, late rollback, drift repair, repeat apply и journal/SQLSTATE.
- **INSTALLER-008 — ОБЩИЙ CUTOVER GATE:** новые LOGIN/grants нельзя commit при активной legacy password HBA.
  Финальная integration orchestration обязана сначала доказать фактически загруженный exact mTLS HBA реальными
  negative probes, использовать явно проверенный local admin socket, остановленные services, затем installer.

Что независимо принято: 11 real roots имеют согласованные signatures/returns/owners, SECURITY DEFINER,
volatility/parallel/search_path, exact six-dimensional gate tuple и planned EXECUTE; SQL errors находятся внутри
`BEGIN`/`ON_ERROR_STOP`/verifier/`COMMIT`. Partial `65a0c7be6` также восстановил zero generator, оставил живые
relations ACTIVE и исправил platform settings/health policy направления. Следующий worker занимается только
installer/E2E и сохранёнными INSTALLER-001–007; host integration закрывает INSTALLER-008.

## Process and legacy-cut audit 2026-08-12 — `78470ac13` → fixer `c7c9044f8`

| Поле | Значение |
|---|---|
| Метод | **Взгляд**: два независимых аудита owner-порядка, migration/runtime paths и target privileges; затем PostgreSQL 16 behavior proofs |
| Вердикт | **FAIL CHECKPOINT → ИСПРАВЛЕНО ГРОМКО → PASS ДЛЯ ТЕКУЩЕГО СЛОЯ** |

- **INSTALLER-001–007 — ИСПРАВЛЕНО ГРОМКО `9d74c01d5`:** installer создаёт exact login shells, рендерит
  memberships/credentials последним, использует literal zero verifier, чинит capability drift, допускает
  deterministic target reapply и доказывает late rollback. Повторено на итоговом слое командой
  `pnpm test:db-post-zero-installer` — PASS real PG16 zero→cluster-zero→installer, drift repair, rollback, replay.
- **INSTALLER-008 — OFFLINE PRIMITIVE PASS, LIVE ОТКРЫТ:** `3de484cb1` и
  `pnpm test:postgres-mtls-host` доказывают exact loaded HBA, certificate/password negatives, journal и context/RLS
  faults. Единый host cutover TEST/PROD ещё не запускался и остаётся частью whole-chain gate.
- **LEGACY-DECL-001 — ИСПРАВЛЕНО ГРОМКО `c7c9044f8`:** post-zero declaration/fixture ложно возвращали уже
  удалённые `integrator.identities`, `integrator.telegram_state`, `integrator.message_drafts`, `integrator.users`.
  Они удалены из активной матрицы, fixture больше не создаёт подложные shells; exact поиск по generated artifacts
  возвращает ноль упоминаний, installer acceptance проходит после настоящего legacy-drop состояния.
- **APPOINTMENT-CUT-001 — ИСПРАВЛЕНО ГРОМКО `c7c9044f8`:** `0386` теперь до DROP сравнивает существующую
  canonical-ссылку с вычисленным legacy target и откатывает весь cut при несовпадении или невозможности доказать
  target. `pnpm run verify:offline-legacy-appointment-cut` — PASS: positive/idempotent и три atomic negative.
- **APPOINTMENT-LOOKUP-001 — ИСПРАВЛЕНО ГРОМКО `c7c9044f8`:** общий `LIMIT 1` больше не выбирает NULL перед
  Rubitime mapping. `pgCanonicalAppointments.postgres.integration.test.ts` на disposable PostgreSQL — `2/2`:
  canonical+legacy lookup и soft-delete по retained external id.
- **APPOINTMENT-ACCESS-001 — ИСПРАВЛЕНО ГРОМКО `c7c9044f8`:** два HMAC webapp integrator-read и global
  integrator admin count не получают широкого table grant. Добавлены три exact transaction-bound
  SECURITY DEFINER roots; admin count больше не глотает отказ как ложный `0`. Callsite oracle — `5/5`, relation
  matrix — `12/12`, generated byte check — PASS.
- **CUTOVER-CHAIN-001 — ОТКРЫТО, СЛЕДУЮЩИЙ GATE:** DEV и TEST находятся в одном PostgreSQL-кластере, а
  single-DB installer не выражает owner-порядок для обеих БД. Нужен один restore-shaped runner/proof:
  `legacy-drop обеих БД → zero обеих БД → cluster role drop → доказанный zero обеих БД → post-zero install обеих
  БД → positive/negative port runtime`. До него live TEST/PROD cutover запрещён.

Итог process-аудита: работа не ходит по кругу; owner-порядок live-применения не нарушен. Завершены offline
legacy removals, zero-state, post-zero installer и host-mTLS primitives. Следующий шаг — только цельная shared-
cluster rehearsal, не новый документационный мини-слайс.

## Independent shared-cutover audit 2026-08-12 — `22de0ba59` → fixer `de4eeede9`

| Поле | Значение |
|---|---|
| Метод | **Взгляд**: owner-порядок, bilateral zero/failure, exact capability/runtime paths и host authentication boundary |
| Вердикт | **PASS ПОСЛЕ ИСПРАВЛЕНИЙ: 2 findings ИСПРАВЛЕНЫ ГРОМКО** |

- **SHARED-CUTOVER-001 — ИСПРАВЛЕНО ГРОМКО `de4eeede9`:** `db.transaction()` в webapp обходил новый
  physical→opaque pre-session handoff и падал до business SQL. Теперь этот путь на том же checked-out client
  сначала выполняет exact identity capability; raw resolver SQL переведён в Drizzle. `11/11` runtime tests,
  webapp typecheck и полный repo lint — PASS, `production debt: 0`.
- **SHARED-CUTOVER-002 / INSTALLER-008 — ИСПРАВЛЕНО ГРОМКО 2026-08-12:** host renderer и apply/readiness
  теперь устанавливают один first-match HBA block на две exact DB и шесть глобально различных LOGIN. На реальном
  disposable PostgreSQL 16 доказаны `6/6` own-env mTLS+SCRAM positives, cross-env и third-DB terminal rejects,
  password-only/wrong-CN/non-TLS/socket/server-impersonation negatives, отказ при `NULL` SCRAM verifier и свежий
  PostgreSQL auth-refusal journal. Команда `pnpm test:postgres-mtls-host` — PASS; независимый повтор того же
  behavior gate — PASS. Это закрывает offline/host-artifact finding, но не заменяет будущий live TEST proof.
- Принято для текущего offline слоя: disposable chain `legacy обеих → zero обеих → cluster zero → base обеих →
  exact env обеих`; late failure возвращает обе базы в verified zero; generated byte checks и catalog oracle
  зелёные. Не принято этим аудитом: live DEV/TEST и его системный journal; PROD cutover.

## Independent TEST-first cutover audit 2026-08-12 — pre-live checkpoint

| Поле | Значение |
|---|---|
| Метод | **Взгляд**: supported ordinary TEST control flow, zero→target order, service failure cleanup, DEV quiescence and PROD boundary |
| Вердикт | **FAIL → 2 findings ИСПРАВЛЕНЫ ГРОМКО → PASS** |

- **TEST-CUTOVER-001 — ИСПРАВЛЕНО ГРОМКО:** первый вариант после успешного cluster zero оставлял EXIT cleanup,
  который пытался выполнить `ALTER ROLE bersoncarebot_test` уже после преднамеренного удаления этой legacy-роли;
  настоящий PASS превращался бы в красный exit. Теперь оба wrapper сначала доказанно снимают временные legacy
  elevation, пока роль существует, затем отключают только legacy-часть cleanup; fail-closed остановка writers остаётся.
- **TEST-CUTOVER-002 — ИСПРАВЛЕНО ГРОМКО:** direct internal
  `--port-context-post-migration-cutover` сначала не ставил EXIT trap, поэтому поздний restart/health failure мог
  оставить часть TEST writers активной. Режим теперь ставит `cleanup_exit`; любой failure до release останавливает
  все пять TEST units.
- Повторный независимый взгляд: **PASS, достижимых MUST FIX нет**. DEV перед изменением замораживается
  `CONNECTION LIMIT 0 → terminate sessions → zero sessions`; PROD ordinary TEST route не трогает; старая closure,
  возвращавшая operational logins, поддерживаемым маршрутом не вызывается. `bash -n`, `shellcheck -S error`,
  `git diff --check` — PASS. Это только pre-live gate; реальный TEST и PostgreSQL journal ещё не приняты.
- **LIVE-PREFLIGHT-001 — ИСПРАВЛЕНО ГРОМКО:** первый реальный запуск `deploy-test.sh` завершился до остановки
  writers и любых DB/HBA/env writes: legacy C2 preflight читал `root:deploy 0640` env от `dev`, а после исправления
  пользователя закономерно отклонил исходный media-worker `DATABASE_URL`, который утверждённый port-context
  bootstrap должен удалить. Для одноразового перехода старый source-state gate заменён exact read-only target
  renderer `bootstrap-c4-test-env.mjs --port-context-check`; на реальном TEST env он печатает PASS без записи.
