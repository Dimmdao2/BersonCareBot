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
- **LIVE-MIGRATE-001 — ИСПРАВЛЕНО ГРОМКО:** второй реальный запуск дошёл до остановки TEST writers, но штатно
  отказал до миграций/zero: legacy webapp login уже не имел `CONNECT` к `bersoncarebot_test`. Возвращать ему grant
  запрещено owner-порядком. Миграции переведены на локальный Unix-socket: PostgreSQL аутентифицирует системного
  `postgres`, а `PGOPTIONS` устанавливает exact historical owner `bersoncarebot_test`; реальный `node-postgres`
  probe доказал `session_user=postgres`, `current_user=bersoncarebot_test`, exact TEST database и Unix socket.
  Независимый аудит нашёл и исправил второй достижимый отказ: Corepack наследовал недоступный для `postgres`
  working directory `/home/dev`; все команды теперь исполняются из `/opt/projects/bersoncarebot-test`. Итоговый
  независимый взгляд — **PASS**; старым application login не возвращён `CONNECT`, временные `app_owner` и
  `BYPASSRLS` по-прежнему снимаются и проверяются до bilateral zero.
- **LIVE-BOOTSTRAP-001 — ИСПРАВЛЕНО ГРОМКО:** следующий live run открыл прежнее повреждённое промежуточное
  состояние TEST: application objects уже принадлежали target `app_object_owner`, но оба исполняемых ledger были
  пусты (`integrator.schema_migrations=0`, `drizzle.__drizzle_migrations=0`), поэтому обычный runner пытался
  повторить всю историю и громко отказал `42501` до zero. TEST не содержит живой работы; утверждён безопасный
  baseline без DEV/PROD данных: защищённый локальный backup → пересоздание только `bersoncarebot_test` OWNER
  `postgres` → закрытие `PUBLIC` → полный bootstrap из репозитория. Исполняемый порядок исправлен на legacy
  webapp bootstrap → integrator до `20260708` → Drizzle → integrator remainder → D30. На окно временно выдаются
  только database `CREATE/TEMPORARY`, schema `public USAGE/CREATE`, `app_owner` membership и `BYPASSRLS`; application
  login не получает `CONNECT`. Все grants отзываются и проверяются до bilateral zero; failed `REVOKE` сохраняет
  cleanup flag для EXIT-retry. Независимый итоговый взгляд — **PASS**.
- **LIVE-SOCKET-001 — ИСПРАВЛЕНО ГРОМКО:** первый empty-TEST bootstrap остановился до SQL, потому что общий
  target guard правильно запрещает libpq query override `?host=`. Локальный административный URL переведён на
  стандартный percent-encoded Unix-socket authority; guard принимает только exact canonical
  `/var/run/postgresql`, по-прежнему требует разрешённую database текущего host и запрещает query overrides.
  Реальный `node-postgres` probe доказал `session_user=postgres`, `current_user=bersoncarebot_test`, exact TEST DB
  и `inet_server_addr() IS NULL`. Independent negative matrix отвергла double-encoding, `/tmp`, TEST→PROD DB и
  `?host=`; итоговый взгляд — **PASS**.
- **LIVE-INTERLEAVE-001 — ИСПРАВЛЕНО ГРОМКО:** empty bootstrap атомарно применил legacy webapp `001–081`,
  затем `082` отказал на ещё не созданной Drizzle-таблице `recommendations`. Bootstrap теперь пропускает ровно
  `082_recommendations_domain.sql`: файл содержит только idempotent `recommendations.domain` + index, а каноническая
  Drizzle `0001` создаёт таблицу и `0053` применяет exact parity до всех её последующих use. Legacy `083–089`
  продолжают исполняться до Drizzle; manual/emergency режимы не изменены. Независимый взгляд подтвердил отсутствие
  потери schema/data и других достижимых order-break — **PASS**.
- **LIVE-INTERLEAVE-002 — ИСПРАВЛЕНО ГРОМКО:** после успешных legacy `083–085` файл `086` достиг второй
  Drizzle-зависимости (`content_sections.kind`). Bootstrap superseded-map теперь exact: legacy `082 → Drizzle 0053`,
  `086 → Drizzle 0055`; обе пары независимо сопоставлены по schema/seed/index/FK/check и имеют полную parity.
  Legacy `087–089` намеренно остаются до Drizzle: они формируют недублированный baseline, который поздние миграции
  используют/расширяют. Итоговый независимый взгляд — **PASS**, следующего pre-Drizzle order-break не найдено.
- **LIVE-INTEGRATOR-ORDER-001 — ИСПРАВЛЕНО ГРОМКО:** первый integrator greenfield replay применил Telegram
  `0001–0008` и Rubitime `0009`, затем Telegram `0009` атомарно отказал `42P01`: историческая миграция использует
  `users`, `identities` и `contacts`, хотя global filename order ставил создающие их core `0012–0014` позже.
  Discovery теперь переносит только exact prerequisite chain `core 0012 → 0013 → 0014` непосредственно перед
  exact Telegram `0009`; SQL и ledger versions не изменены, относительный порядок всех остальных миграций сохранён,
  частично заполненный TEST ledger безопасно продолжает работу. Независимая классификация — **ВЗГЛЯД**, вердикт
  **PASS**; oracle — повтор живого TEST через ранее падавший участок, отдельный source/unit-тест не создаётся.
- **LIVE-INTEGRATOR-SCHEMA-001 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** live replay прошёл ранее падавшую Telegram
  `0009`, применил 52 integrator migration entries и затем отказал `42P01` на первом явно квалифицированном
  `integrator.user_reminder_rules`. Причина: локальный административный channel передавал `SET ROLE`, но не
  исторический integrator `search_path`; TEST role имеет `public, integrator`, поэтому unqualified integrator DDL
  оказался в `public`. Обе integrator-фазы теперь получают exact `search_path=integrator,public`; webapp legacy,
  Drizzle и D30 остаются в `public`. Независимый взгляд подтвердил сам diff и потребовал не продолжать повреждённый
  ledger: поскольку TEST пуст и его downtime разрешён, перед повтором база пересоздаётся из `template0`, `PUBLIC`
  закрывается, затем выполняется полный live replay с нуля. Итоговый oracle — наличие объектов в правильных схемах
  и прохождение прежнего места отказа; отдельный source/unit-тест не создаётся.
- **LIVE-EMPTY-SEED-001 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** после завершения первой integrator-фазы Drizzle
  атомарно отказал `P0001` в `0143_seed_staff_organization_members`: этот исторический data-seed требует ровно
  одного существующего врача, его specialist и appointment, тогда как одноразовый TEST намеренно пуст.
  Исторический SQL/hash не переписывается. В Drizzle runner добавлен явный `empty-bootstrap`: только при одновременно
  пустых `drizzle` ledger, `platform_users` и `appointment_records` он выполняет остальную original SQL-chain одной
  транзакцией, а exact data-only `0143` и `0204` отмечает original hash/time без исполнения. Обычный TEST/restored
  dump/PROD сохраняет stock Drizzle path; deploy включает режим только через явную одноразовую env-команду.
  Независимый взгляд отклонил безусловное включение режима, исправление принято; live empty TEST replay остаётся
  единственным oracle, отдельный source-test не создаётся.
- **LIVE-EMPTY-GRANT-001 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** следующий атомарный Drizzle replay прошёл оба
  пустых data-seed и отказал `P0001` в exact `0241_platform_operations_audit_health_archive_global_view`.
  Миграция сама выдаёт новые права `app_platform_settings`, но её self-check дополнительно требует historical
  `app_staff SELECT` на `public.admin_audit_log` и `public.operator_health_failure_archive`; раньше этот grant
  приходил из host provisioning до миграции и потому отсутствует в greenfield TEST. Explicit `empty-bootstrap`
  теперь непосредственно перед exact `0241` выдаёт только этот SELECT внутри общей транзакции: дальнейший fail
  откатывает его вместе со всей Drizzle-chain, ordinary/restored/PROD stock path не изменён, последующий
  owner-ordered zero удаляет legacy grant. Независимая классификация — **ВЗГЛЯД**, вердикт **PASS**: prerequisite
  необходим и достаточен, write/schema/function-доступ не добавлен.
- **LIVE-EMPTY-SCHEMA-001 — НЕПОЛНОЕ ИСПРАВЛЕНИЕ, ЗАМЕНЕНО → `LIVE-EMPTY-SCHEMA-002`:** после исправленного `0241` Drizzle replay
  атомарно отказал `42501` в exact `0261_platform_registration_events_read`. Системный PostgreSQL-журнал
  зафиксировал `permission denied for schema public`: migration выполняет `SET ROLE app_owner`, затем создаёт
  SQL SECURITY DEFINER-функцию с qualified `public.*`, а historical `app_owner USAGE` раньше приходил из host
  provisioning и отсутствует в greenfield TEST. Explicit `empty-bootstrap` теперь перед exact `0261` выдаёт
  только `USAGE ON SCHEMA public TO app_owner` внутри общей транзакции — без table/data/write privileges;
  ordinary/restored/PROD stock path не изменён, дальнейший fail откатывает prerequisite, последующий owner-zero
  снимает его после успешного bootstrap. Независимая классификация была **ВЗГЛЯД / PASS**, но следующий live
  replay опроверг достаточность реализации: право пытался выдать migration role без grant option.
- **LIVE-EMPTY-SCHEMA-002 — НЕПОЛНОЕ ИСПРАВЛЕНИЕ, ЗАМЕНЕНО → `LIVE-EMPTY-SCHEMA-003`:** системный PostgreSQL-журнал следующего replay
  сохранил исходный `permission denied for schema public` и перед ним точное предупреждение
  `no privileges were granted for "public"`. Причина: соединение имеет `session_user=postgres`, но штатный
  `PGOPTIONS role=bersoncarebot_test`; прежний hook выполнял `GRANT` от migration role, не владеющей схемой.
  Explicit `empty-bootstrap` теперь требует разные administrative session и migration role, внутри общей
  транзакции временно делает `RESET ROLE`, выдаёт exact schema `USAGE`, гарантированно возвращает исходную роль
  через escaped identifier и отдельно проверяет фактический privilege. Ordinary/restored/PROD path не изменён;
  table/data privilege не добавлен, failure откатывает grant, последующий owner-zero снимает его после PASS.
  Следующий live replay опроверг семантическое предположение о `RESET ROLE`: при startup
  `PGOPTIONS role=bersoncarebot_test` команда оставила `current_user=bersoncarebot_test`, поэтому grant снова не
  был выдан; собственный privilege-check громко остановил chain до `0261`.
- **LIVE-EMPTY-SCHEMA-003 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** откатываемый live PostgreSQL 16 probe с тем же
  `PGOPTIONS` доказал: `session_user=postgres`, `current_user=bersoncarebot_test`; `RESET ROLE` сохраняет
  `current_user=bersoncarebot_test`, а explicit `SET ROLE postgres` даёт exact schema grant, возврат в
  `bersoncarebot_test` работает, `ROLLBACK` снимает grant. Runner теперь использует обнаруженный и escaped
  `administrativeRole` вместо `RESET ROLE`, затем возвращает escaped `migrationRole` и проверяет право fail-closed.
- **LIVE-EMPTY-EXTENSION-001 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** replay прошёл `0261` и атомарно отказал
  `3F000` в exact `0274_password_login_atomic_admission_altcha`; системный PostgreSQL-журнал назвал отсутствующую
  схему `app_ext`. Исторический host bootstrap устанавливал `pgcrypto` в `app_ext` до Drizzle, а greenfield TEST
  этой подложки не имел. Explicit `empty-bootstrap` теперь в начале общей транзакции создаёт `app_ext`, ставит
  `pgcrypto WITH SCHEMA app_ext`, даёт `app_owner` только schema `USAGE` и fail-closed проверяет exact extension
  namespace, `digest(text,text)` и `gen_random_bytes(integer)`. Откатываемый live PostgreSQL 16 probe с теми же
  временными правами доказал create/use и полный rollback схемы, extension и grant; ordinary/restored/PROD path
  не изменён, последующий owner-zero заменяет временные ownership/grants целевыми.
- **LIVE-EMPTY-LEDGER-001 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** replay прошёл `0274` и дошёл до exact
  `0330_test_ledger_schema_parity_forward_local`, где атомарно отказал `42P01`: этот TEST-specific forward
  reconciliation проверяет `public.booking_calendar_map.appointment_key`, создаваемый второй integrator-фазой
  только после Drizzle. `0330` и следующий `0331` исправляют гонку старого TEST-ledger; на greenfield все семь
  source migrations применяются напрямую с текущими hashes, `0259` уже не выдаёт ambient staff billing access,
  `0265` сам удаляет ошибочный platform conversation access, а `0278` выполняет exact owner-data cleanup.
  Explicit empty-bootstrap поэтому отмечает только exact `0330/0331` original hashes/times без исполнения их
  TEST-state assertions. Остальная chain и ordinary/restored/PROD stock path не изменены; финальная parity
  доказывается всей chain, второй integrator-фазой и последующим owner-zero/installer acceptance.
- **LIVE-EMPTY-OVERLAY-001 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** replay прошёл `0330/0331` и атомарно отказал
  `42883` в exact `0356_platform_users_definer_owner_app_owner_local`: исторический owner-repair ссылается на
  функции, которые создаёт не Drizzle, а каноническая post-migration runtime-overlay chain. Explicit
  `empty-bootstrap` теперь откладывает только body `0356`, сохраняя его original hash/time; после всей Drizzle,
  второй integrator-фазы и D30, при всё ещё остановленных writers, применяет существующую always-overlay chain с
  `protected_context_installed=0`, затем немедленно выполняет owner-ordered zero и exact target declaration.
  `0356` не создаёт schema/data/function bodies, ordinary/restored/PROD stock path не изменены, а частичный overlay
  failure не допускает TEST к запуску и не начинает zero. Независимая классификация — **ВЗГЛЯД**, вердикт
  **PASS**: порядок migrations → overlays → zero → exact seam owners/grants необходим и достаточен.
- **LIVE-INTEGRATOR-RETIREMENT-001 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** Drizzle завершил все `383` entries,
  включая D8 `0275_retire_dead_mailing_domain`, после чего первая историческая SaaS-миграция второй integrator-фазы
  громко отказала `42P01` на уже преднамеренно отсутствующей `integrator.mailing_logs`. Возвращать D8-таблицы
  запрещено. Только explicit `INTEGRATOR_MIGRATIONS_MODE=empty-bootstrap` теперь атомарно отмечает в integrator
  ledger три superseded legacy-shaping версии (`20260708_0001`, `20260708_0004`, `20260710_0001`) без их body,
  но лишь после `SHARE`-lock всех сохранившихся targets, доказанных `0` строк и exact absence четырёх D8 relations.
  `20260708_0002/0003` продолжают исполняться; `0003` создаёт, backfill-ит и проверяет `organization_id`, FK и
  индексы двух живых reminder delivery relations. Новая forward-миграция после owner-ordered legacy drops громко
  запрещает `NULL` и закрепляет `NOT NULL` только на этих двух живых таблицах. Ordinary/restored/PROD без exact
  режима остаются stock. Независимая классификация — **ВЗГЛЯД**, вердикт **PASS**: это сохраняет весь живой
  invariant и не воскрешает удалённую schema ради пустого исторического backfill.
- **LIVE-EMPTY-RESUME-001 — ИСПРАВЛЕНО ГРОМКО ДЛЯ ПОВТОРА:** после успешного заполнения Drizzle ledger и
  последующего отказа второй integrator-фазы повторный deploy снова получил общий bootstrap-флаг. Stock Drizzle
  runner закономерно должен только пропустить уже applied hashes, но его одноразовый empty-bootstrap guard пытался
  заново доказать пустой ledger и при этом обращался к уже удалённой `public.appointment_records`; PostgreSQL
  записал `42P01`. Deploy теперь принимает отдельный exact `INTEGRATOR_MIGRATIONS_MODE=empty-bootstrap`: webapp
  Drizzle остаётся stock, только вторая integrator-фаза завершает утверждённые skips, а runtime overlays всё равно
  исполняются после обеих migration phases и D30, до cleanup/zero. Unset ordinary TEST и PROD не изменены;
  неизвестный integrator mode отвергается fail-closed. Независимая классификация — **ВЗГЛЯД**, вердикт **PASS**:
  resume сохраняет owner-порядок writers stopped → complete schema/overlays → cleanup → zero → target install.

## Plan/order reconciliation 2026-08-12 — empty TEST work rejected

| Поле | Значение |
|---|---|
| Метод | **Взгляд**: owner-order против git history, текущего кода и read-only DEV catalog |
| Вердикт | **FAIL: существенное отклонение от порядка; план исправлен, live-работа ещё открыта** |

- **ORDER-001 — ИСПРАВЛЕНО `c8b10de44`:** после успешного legacy cleanup на DEV работа должна была перейти к
  `zero(DEV) → prove-zero(DEV) → install(DEV) → live-proof(DEV)`. Вместо этого была начата реконструкция
  искусственно пустой TEST. Ошибочный маршрут остановлен: DEV без пересоздания прошёл backup → target-neutral
  zero/proof → cluster baseline → mTLS readiness → declaration install; webapp и integrator поднялись через
  целевые pools. Полная live matrix остаётся открытым этапом Ф7, TEST не использовалась.
- **EMPTY-TEST-001 — ЗАМЕНЕНО/НЕ ЗАСЧИТЫВАЕТСЯ:** вся цепочка находок `LIVE-BOOTSTRAP-001` и
  `LIVE-EMPTY-*` выше описывает ошибочный empty-TEST маршрут. Её локальные PASS не являются приёмкой cutover,
  не закрывают ни один live DEV/TEST пункт и не разрешают сохранять empty-bootstrap обходы. Коммиты
  `5a01acf81..cad14a1c6` подлежат отдельному разбору: empty-TEST-specific удалить, переносимое оставить.
- **TEST-RECOVERY-001 — НЕ ИСПРАВЛЕНО:** до ошибочного пересоздания создан читаемый pre-error archive
  `/var/backups/bersoncarebot-test-portctx/bersoncarebot_test-pre-portctx-20260812T143633Z.dump`, SHA-256
  `364cb1c35778fe5b7fca8ab0134545dfd2b1aae1bc5a12ac02d0c2aea64fceeb`. Именованная TEST должна быть
  восстановлена из него и проверена отдельно; это ремонт инцидента, не финальная production-dump репетиция.
- **PRESESSION-EXACT-001 — ИСПРАВЛЕНО `48f2431a0..14a7c39ff`:** старые auth roots были достижимы через generic
  `webapp_pre_session_relation` вместо exact function/purpose/typed-args. Конкретный путь:
  `pgLoginTokens.ts → runWebappPgText → app.auth_login_token_{create,read,expire,confirm,mark_session_issued}`;
  exact context ставит только `runWebappNamedRoot`, а тела этих функций не вызывают
  `require_accepted_context`. Generic descriptor удалён; `43` callable pre-session roots получили exact
  function/purpose/typed-args gates, а verifier отдельно отвергает prior statement и nested-gate bypass.
- **GATE-WIRING-001 — ИСПРАВЛЕНО ДЛЯ CUTOVER `14a7c39ff`:** function-census был красным из-за рассинхрона declaration;
  post-zero installer replay красный на повреждённой TEST и ошибочно зависит от named live TEST. Эти gates не
  входят в обычный `pnpm run ci`, поэтому прежний зелёный full CI не доказывает их. До live DEV надо вернуть
  оба proof возвращены в green на disposable PostgreSQL 16 без зависимости от именованной TEST. Их подключение
  к обычному CI остаётся отдельным незакрытым пунктом Ф6 и не выдаётся за выполненное.
- **DEPLOY-SCOPE-001 — ИСПРАВЛЕНО `72e82121b..48f2431a0`:** bilateral DEV+TEST/shared-cutover и org-only birth trigger заменены
  owner-решениями: один target за deploy; HBA/mTLS one-time provisioning + ordinary readiness; birth wall для
  каждой managed table; отдельный global-admin DB-login/certificate/pool при двух software ports.

## Audit pass DEV-cutover-checkpoint-2026-08-12

| Поле | Значение |
|---|---|
| Candidate | `3ddebfe61937c90034976494096b025f4da3d2ae`, `feat/doctor-ui-rebuild` |
| Метод | **Взгляд**: owner order + target-neutral cutover failure paths + declaration/capability/function-body comparison |
| Вердикт | **FAIL ДЛЯ LIVE DEV — два MUST FIX до backup/zero** |

- **CUTOVER-FAILCLOSED-001 — ИСПРАВЛЕНО `48f2431a0`:** если target roles/install уже применены, а последующий
  `apply-postgres-mtls.sh --apply` или readiness падает, внутренний HBA rollback возвращает прежний файл, а общий
  EXIT trap восстанавливает исходный `CONNECTION LIMIT`. При допустимом старом broad SCRAM-правиле новые runtime
  login/password после ошибки снова получают соединение без обязательного client certificate. Cutover обязан
  оставлять target database закрытой при любом неуспехе после начала изменения доступа и возвращать исходный
  limit только после полного HBA/readiness/install/proof PASS. Wrapper теперь держит target с
  `CONNECTION LIMIT 0` на любом failure и возвращает исходный limit только после полного PASS; шесть fault points
  проверены self-test.
- **PRESESSION-EXACT-001 — ИСПРАВЛЕНО `48f2431a0..14a7c39ff`:** прежняя запись про generic pre-session подтверждена и
  расширена: статическое двустороннее сравнение EXECUTE `app_pre_session` против exact capability descriptors
  нашло `16` SECURITY DEFINER roots без exact function/purpose/typed-args gate. Достижимый пример —
  `app.phone_challenge_store_read(text)`: прямой вызов после `SET ROLE app_pre_session` читает phone/code без
  `require_accepted_context`. Каждый живой pre-session root должен получить exact descriptor/gate; функции,
  вызываемые только после human/service authentication, должны быть сняты с `app_pre_session` и переведены на
  соответствующий runtime context.

  Число `16` воспроизведено на candidate, а не взято из narrative аудитора: команда `git archive
  3ddebfe61937c90034976494096b025f4da3d2ae deploy/postgres/privileges docs/_TODO/SAAS_FOUNDATION/scripts`
  распакована в `mktemp`, затем Node с `--experimental-strip-types` сравнил сигнатуры
  `declaration.portContext.functions`, где `security=DEFINER`, `owner!=app_seam_context_owner` и
  `execute` содержит `app_pre_session`, с `portContext.capabilities[*].functionIdentity` для
  `targetRole=app_pre_session`; stdout: `missing=16` и все 16 сигнатур. После исправления callable set покрыт
  exact descriptors/bodies, а independent nested/prior-statement mutation снова делает gate красным.

Процессная оценка аудитора: target-neutral zero/install, четыре runtime login, universal birth wall и удаление
empty-TEST-specific обходов — реальный прогресс в правильном направлении. До live DEV остаются эти два
ограниченных исправления и один контролируемый проход `backup → offline zero/proof → install → live matrix`;
объём точечной отладки после живого запуска заранее определяется только реальными `42501` из PostgreSQL journal.

## Audit/live pass DEV-runtime-matrix-2026-08-12

| Поле | Значение |
|---|---|
| Candidate | `91ee0ddd4..e1ce4ebca`, `feat/doctor-ui-rebuild` |
| Метод | Живой DEV startup/smoke + PostgreSQL journal + exact catalog/callsite tests + real PostgreSQL 16 post-zero replay |
| Вердикт | **IN PROGRESS: защита fail-closed работает; runtime-разрывы исправлены в коде, повторный live DEV прогон открыт** |

- **LIVE-PRIVATE-RLS-001 — ИСПРАВЛЕНО `2d4e8bc1d`:** первый integrator startup громко отказал на чтении
  migration ledger: `FORCE RLS` закрыл private context metadata даже от exact seam owner. Добавлены ровно пять
  owner-only policies; catalog closure требует по одной exact policy и real PostgreSQL 16 acceptance доказал
  startup path без широкого runtime grant.
- **LIVE-PROJECTION-ROOT-001 — ИСПРАВЛЕНО `c8b10de44`:** прямой health query к
  `integrator.projection_outbox` был заблокирован. Добавлен один exact service root
  `app.read_integrator_projection_health(integer)`, возвращающий только агрегаты. Живой
  `GET /health/projection` после повторного target-neutral DEV cutover вернул `200`; независимый взгляд подтвердил
  отсутствие payload/id disclosure и широкого `SELECT`.
- **LIVE-INTEGRATOR-CONFIG-001 — ИСПРАВЛЕНО В КОДЕ `91ee0ddd4`, LIVE-ПОДТВЕРЖДЕНИЕ ОТКРЫТО:** startup выявил
  три чтения provider/auth/SMTP settings без exact operation. Все три переведены на named roots с фиксированными
  allowlists; unit/typecheck, exact catalog `18/18` и real PostgreSQL 16 replay прошли, вызов без context получил
  SQLSTATE `42501`. Изменение ещё должно пройти повторный live DEV cutover/startup.
- **LIVE-CLI-BYPASS-001 — ИСПРАВЛЕНО `e1ce4ebca`:** `apps/integrator/src/infra/scripts/projection-health.ts`
  принимал `INTEGRATOR_DATABASE_URL`/`SOURCE_DATABASE_URL`/`DATABASE_URL` и создавал отдельный DB pool. Отдельный
  provider удалён; CLI принимает только `INTEGRATOR_API_URL`/`PORT` и вызывает канонический
  `GET /health/projection`. Тест доказывает, что даже переданный `DATABASE_URL` игнорируется; HTTP non-2xx,
  invalid payload и network failure дают exit `1`. Targeted tests `5/5`, typecheck, integrator build,
  chokepoint/raw-SQL gates и живой compiled CLI против DEV `4200` прошли. Независимый взгляд дал PASS после
  синхронизации активных server/deploy/env docs.
- **LIVE-WEBAPP-CHANNEL-SESSION-001 — ИСПРАВЛЕНО И LIVE-ПОДТВЕРЖДЕНО:** команда живой матрицы
  через `/api/auth/dev-bypass` для `client`, `doctor` и `clinic-admin` получила `500`; webapp log назвал
  `Missing declared webapp port capability: pre_session` на прямом чтении
  `pgIdentityResolution.findByChannelBinding → user_channel_bindings`. Generic pre-session relation capability
  намеренно не возвращён. В candidate добавлен exact
  `app.auth_channel_binding_session(text,text)`: первый statement проверяет function/purpose/typed-args, а
  результат ограничен canonical user id, ролью, display name, primary phone и messenger bindings. Production
  caller переведён на `runWebappNamedRoot`; backing tables не получили runtime grant. Exact catalog/callsite
  tests `18/18`, strict declaration TypeScript и webapp typecheck прошли. После target-neutral DEV cutover
  четыре независимых cookie jar дали: `client`, `doctor`, `clinic-admin`, `admin` — auth `303` и `/api/me=200`
  с правильными user id/role/bindings. Первичный live parser-дефект на UUID-shaped demo ids также исправлен;
  повторный прогон `4/4` зелёный.
- **LIVE-PATIENT-COMPOSITION-001 — ИСПРАВЛЕНО И LIVE-ПОДТВЕРЖДЕНО:** первый живой
  `/app/patient` остановился до DB query: RSC module graph не видел binding `ConfigAdapterPort`, выполненный в
  instrumentation chunk. Patient layout теперь вызывает существующий composition root `buildAppDeps()` до
  чтения auth-channel policy и повторно прошёл эту точку; новой сущности/доступа не добавлено. После финального
  apply свежий `dev:client` получил auth `303`, `/api/me=200`, а Next server завершил `/app/patient=200`.
- **LIVE-STAFF-WORKSPACE-RESOLVE-001 — ИСПРАВЛЕНО И LIVE-ПОДТВЕРЖДЕНО:** реальный вход врача
  прошёл, но `/app/doctor` получил `500`: до определения организации `stampDbPrincipalFromSession` читал
  `be_organization_members` как generic bootstrap relation и порт громко отказал
  `Missing declared webapp port capability: pre_session`. Прямой grant не добавлен. Только pre-routing метод
  membership port переведён на exact `app.resolve_staff_workspace_memberships(uuid)` с purpose
  `auth.staff-workspace.resolve`; прочие scoped membership reads остаются обычными RLS relation operations.
  Function первым statement проверяет exact context и возвращает только активные membership rows данного
  platform user. Повторный page guard вызывает тот же root уже после маршрутизации: для него объявлен отдельный
  exact `staff` descriptor, функция требует self-resolution текущего actor и не расширяет relation grants.
  Живой прогон дополнительно громко выявил неверные DEV-данные: у clinic-admin оставались две активные
  membership после прежних fixture runs, тогда как product contract допускает одну. Каноническая DEV fixture
  теперь сохраняет старую строку как историю со `status=disabled`, но не оставляет второй активный workspace.
  Unit `10/10`, exact catalog/callsite `18/18`, оба typecheck и generated byte-check зелёные. Каноническая fixture
  применена: точный `count(*) WHERE status='active' GROUP BY platform_user_id` вернул по `1` для demo doctor и
  clinic-admin. После apply оба независимо получили auth `303`, `/api/me=200`, `/app/doctor=200`.
- **LIVE-COMMERCE-TRIAL-WILDCARD-001 — ИСПРАВЛЕНО И LIVE-ПОДТВЕРЖДЕНО:** после устранения
  workspace-разрыва PostgreSQL journal громко зафиксировал `42501 permission denied for table
  saas_organization_trials` внутри узкого `app.resolve_organization_cabinet_access(uuid)`. Причина не в
  необходимости широкого staff grant: три commerce/patient projection definer-функции читают `trial.*`, а
  lexical census не включал существующую колонку `created_by` в column-level SELECT их seam owners. В census
  добавлена ровно эта колонка для трёх функций; runtime-роли по-прежнему не получают прямого чтения таблицы,
  функции не возвращают `created_by`. Exact catalog/callsite `18/18`, declaration typecheck и generated
  byte-check зелёные. После повторного apply doctor и clinic-admin pages завершились `200`; в PostgreSQL log
  после apply прежний `permission denied for table saas_organization_trials` не повторился.
- **LIVE-GLOBAL-ADMIN-BOUNDARY-001 — ИСПРАВЛЕНО И LIVE-ПОДТВЕРЖДЕНО:** production platform guard правильно
  требует `factor_verified`, поэтому прежний `dev:admin` останавливался до DB-пути. Только явно разрешённый
  non-production dev bypass теперь моделирует уже пройденный фактор; production login/guard не ослаблены.
  Первый достигнутый global-admin render выявил общий RSC composition gap `ConfigAdapterPort is not bound`;
  существующий `buildAppDeps()` подключён в оба platform layouts. Свежий независимый cookie jar дал auth `303`,
  `/api/me=200`, `/app/admin/system-health=200` через отдельный global-admin pool.
- **LIVE-ACCOUNT-TIMEZONE-001 — ИСПРАВЛЕНО И LIVE-ПОДТВЕРЖДЕНО:** общий `/app/account` глобал-админа намеренно
  использует identity-self principal (`app_patient`), а декларация выдала `calendar_timezone` только
  `app_platform_settings`. PostgreSQL громко записал `42501 permission denied for table platform_users`.
  Identity-self получил только `SELECT calendar_timezone` и `UPDATE (calendar_timezone, updated_at)` своей строки;
  RLS остаётся `id = app.current_patient_user_id()/app.current_actor_user_id()`. Тест декларации `16/16`, strict
  typecheck и generated byte-check зелёные; атомарный DEV apply подтвердил `227` runtime gates, `45` pre-session
  roots, `226` relations, `263` routines, `94` capabilities и `4` login. Повторный GET дал `3 OK + 2 ожидаемых
  redirect` без `5xx`, реальный `PATCH /api/doctor/account/timezone` дал `200 {"ok":true}` без нового DB error.
- **LIVE-DEV-NEGATIVE-MATRIX-001 — ЧАСТИЧНО ПОДТВЕРЖДЕНО, ИСЧЕРПЫВАЮЩИЙ CENSUS ОТКРЫТ:** cutover readiness
  записал в системный PostgreSQL log отказы для missing certificate, чужого CN/login, non-TLS, local socket и
  unknown CA. Четыре прямых live-вызова с правильными сертификатами, но `SET LOCAL ROLE` без accepted context,
  завершились `psql rc=1` и не раскрыли строки: staff — `accepted port context required`; patient — `permission
  denied for schema public`; global-admin — `permission denied for table system_settings`; integrator —
  `permission denied for table reminder_rules`. Все statements присутствуют в PostgreSQL system log. Открыт
  полный fault census каждого SET-able role и direct definer, а также expired/revoked certificate probes.
  Read-only catalog часть уже пройдена на этой же DEV одной транзакцией с rollback: declaration-owned
  `--catalog-closure-verify`, `--pre-session-gate-verify`, `--port-context-verify`, `--env-verify` подтвердили
  `226` managed relations, `262` routines, `45` exact pre-session roots, `93` capabilities и ровно `4` DEV
  application logins без missing/extra/mutated entries.
- **LIVE-ROLE-NAMESPACE-001 — ИСПРАВЛЕНО В ГЕНЕРАТОРЕ, LIVE CLEANUP ОТКРЫТ:** exact diff между живыми
  `pg_roles` с BCB-префиксами и объединением `cluster.roles + envMapping + zeroState.legacyRoles` нашёл шесть
  бесконтрольных retired identities: `app_identity_bootstrap`, `app_migrator`, `app_operational_diagnostic`,
  `app_operational_web_push_reminder`, `app_phone_bind_completion`,
  `app_web_push_reminder_discovery_definer`. Они добавлены не в target role graph, а только в declaration-owned
  cluster cleanup. Environment verifier теперь отвергает неизвестное имя во всём managed namespace, а retained
  legacy допускает только как `NOLOGIN/NOSUPERUSER/NOBYPASSRLS/NOINHERIT`, без membership, target CONNECT и
  schema USAGE. Targeted catalog tests `19/19`, strict declaration typecheck и byte-check всех zero artifacts
  зелёные. Finding закрывается применением cluster cleanup и повторным live verifier на DEV; зависимые от ещё не
  cutover TEST/старых баз роли не удаляются преждевременно, а остаются явно карантинированными.
- **POSTZERO-REPLAY-DEV-SOURCE-001 — ОТКРЫТО, НЕ RUNTIME-БЛОКЕР:** команда
  `POSTZERO_SCHEMA_SOURCE_DB=bcb_webapp_dev pnpm test:db-post-zero-installer` завершилась exit `3` до нового root:
  schema-only dump уже-cutover DEV включает активный relation-birth event trigger; при последовательном replay
  trigger срабатывает на ещё не загруженную declaration registry и отвергает `integrator.contacts` как
  undeclared. DEV не изменялась. Этот harness-дефект не заменяется PASS на именованной TEST и не закрывает live
  пункт; текущий candidate проверяется штатным backup → target-neutral zero/install → live DEV matrix.

## Audit/live pass DEV-org-billing-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | `dd2d3dff323a8d22d3dc8a44b37472d253a98f59`, `feat/doctor-ui-rebuild` |
| Метод | Живой clinic-admin billing render + PostgreSQL journal + declaration/function/callsite tests + real PostgreSQL 16 context fault suite |
| Вердикт | **PASS ДЛЯ ЭТОГО БЛОКА; полный DEV live/negative census остаётся открыт в Ф7** |

- **LIVE-ORG-BILLING-001 — ИСПРАВЛЕНО `dd2d3dff3`:** живой `/app/settings?tab=billing` последовательно выявил
  недостающий доступ к `saas_tariffs`, затем `accepted port context required` в агрегате квот. Декларация теперь
  разделяет потребности: клиника читает/меняет только биллинг своей организации через `app_clinic_billing`,
  webhook capture работает как org-scoped `app_worker`, global-admin управляет глобальной конфигурацией через
  `app_platform_settings`, а обычный `app_staff` не получил billing mutation. Migration `0391` и canonical
  contract разрешили organization context только clinic-billing и точному org-scoped worker relation path.
  После declaration reapply команда `curl -sS -o /tmp/bcb-clinic-billing-page-r4.html -w '%{http_code}' -b
  /tmp/bcb-live-clinic-r3.cookie 'http://127.0.0.1:5200/app/settings?tab=billing'` вернула `200`; команда
  `sudo tail -n +393949 /var/log/postgresql/postgresql-16-main.log | rg
  'ERROR|FATAL|permission denied|accepted port context|required|42501'` не вернула строк для этого запроса.
- **LIVE-DEFINER-DELEGATION-001 — ИСПРАВЛЕНО `dd2d3dff3`:** внешний безопасный aggregate
  `app.read_current_org_tariff_transition_usage()` вызывал внутренний platform aggregate, но декларация не
  описывала `delegatesTo`; поэтому повторное наложение генератора ставило внутренней функции gate только на
  platform context и ломало законный clinic context. Связь объявлена явно: clinic context теперь принимается
  при вызове через wrapper, но прямой `EXECUTE` внутренней функции остаётся только у
  `app_platform_settings`. Команда `node --test deploy/postgres/privileges/port-context-catalog.test.mjs
  deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs
  deploy/postgres/privileges/port-context-callsite-catalog.test.mjs` дала `42/42`.
- **GENERATOR-ENTRYPOINT-001 — ИСПРАВЛЕНО `dd2d3dff3`:** прямой запуск библиотечного
  `deploy/postgres/privileges/generate.mjs --all` раньше молча завершался `0` и не обновлял artifacts; именно так
  первый исправленный tariff grant не попал в применённый SQL. Библиотека теперь громко возвращает exit `2` и
  указывает на канонический `generate-cli.mjs`; отдельный regression test входит в результат `42/42`. Команда
  `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --all --check` подтверждает
  побайтное совпадение четырёх generated artifacts.
- **LIVE-LIFECYCLE-RETURNING-001 — ИСПРАВЛЕНО `dd2d3dff3`:** seam подготовки lifecycle notification выполняет
  `UPDATE ... RETURNING` по `be_organizations`; census ошибочно выдавал owner только `UPDATE`, хотя PostgreSQL
  проверяет чтение возвращаемых колонок. В surface добавлен точный `SELECT` тех же трёх колонок, без runtime
  table grant; regression test входит в `42/42`.

Проверки блока: `pnpm --dir apps/webapp exec vitest --run
src/app/api/payments/saasWebhook.route.test.ts src/infra/db/portContextRuntime.test.ts
src/infra/repos/pgOrgEntitlements.test.ts` → `31/31`; `pnpm --dir apps/webapp run typecheck` → exit `0` после
удаления повреждённого generated cache-файла `.next/dev/types/validator.ts`; `git diff --check` → exit `0`.

## Audit/live pass DEV-patient-pages-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | `bed5c1323`, `feat/doctor-ui-rebuild` |
| Метод | Последовательный живой render patient routes с отдельным срезом PostgreSQL journal после каждого запроса |
| Вердикт | **PASS ДЛЯ ЗАГРУЗКИ PATIENT-СТРАНИЦ; действия и остальные роли остаются открыты в Ф7** |

- **LIVE-PATIENT-RELATION-CAPABILITIES-001 — ИСПРАВЛЕНО `bed5c1323`:** первый валидный page census дал `32/32`
  HTTP `200`, но PostgreSQL громко показал недостающие relation capabilities для собственного лечения,
  дневников, напоминаний, поддержки и patient CMS. Права добавлены по смыслу: пациент видит только свои строки
  через существующие patient-self/current-org RLS; CMS — только опубликованные неархивные страницы и видимые
  разделы своей клиники. Внутренние данные других пациентов и служебные clinic tables не открывались.
- **LIVE-PATIENT-CASCADE-001 — ИСПРАВЛЕНО И LIVE-ПОДТВЕРЖДЕНО:** последовательные повторные проходы раскрыли
  каскадные недостающие чтения `platform_users.reminder_muted_until`, self-only `user_identity`/`user_contacts`
  и собственного `reminder_journal`. Они добавлены в ту же декларацию; прямых ручных `GRANT` нет.
- Финальная команда обхода сохранила `/tmp/bcb-patient-path-db-errors-r5.tsv`: `awk -F '\t'
  '{count[$1]++} END {for (status in count) print status, count[status]}'` вернула `200 32`; фильтр
  `awk -F '\t' '$1 !~ /^2|^3/ || $3 != "" {print}'` не вернул строк. Каждый `$3` строился только из новых
  `ERROR:|FATAL:|PANIC:` строк `/var/log/postgresql/postgresql-16-main.log` данного запроса.
- `node --test deploy/postgres/privileges/port-context-catalog.test.mjs
  deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs
  deploy/postgres/privileges/port-context-callsite-catalog.test.mjs` → `43/43`; после последнего grant delta
  `node --test deploy/postgres/privileges/relation-access.test.mjs` → `20/20`; `generate-cli.mjs --all --check`
  подтвердил побайтовое совпадение четырёх generated artifacts; env verifier подтвердил ровно `4` DEV login.

## Audit/live pass DEV-patient-actions-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `20f035702`, `feat/doctor-ui-rebuild` |
| Метод | Одноразовая DEV fixture → реальные patient HTTP mutations → фактические DB rows → отдельный PostgreSQL journal cursor |
| Вердикт | **PASS ДЛЯ SUPPORT И REMINDER ACTIONS; treatment program и остальные роли остаются открыты в Ф7** |

- **LIVE-PATIENT-REMINDER-CONTEXT-001 — ИСПРАВЛЕНО ГРОМКО:** три reminder definer-функции до выбора ветки
  безусловно вычисляли и patient, и integrator identity. Строгий accessor второй стороны закономерно ронял
  patient-вызов с `accepted integrator context required`; исходный HTTP прогон дал три `404`, а PostgreSQL
  journal — три точных `ERROR`. Migration `0392_reminder_callback_port_context_dispatch_local` сначала требует
  attested context одного из двух допустимых target-role, затем по однозначному membership реального
  `session_user` читает только соответствующую identity; чужой или смешанный login получает SQLSTATE `42501`.
  Декларация выдаёт `EXECUTE` ровно `app_patient` и `app_integrator_request`.
- **LIVE-PATIENT-REMINDER-ACL-001 — ИСПРАВЛЕНО ГРОМКО:** после исправления dispatch `done` прошёл, а snooze/skip
  громко упали `permission denied for table reminder_occurrence_history`. Runtime patient не получил прямой
  grant. Только `app_seam_reminder_patient_owner` получил недостающий column-level `SELECT`, необходимый
  PostgreSQL для `UPDATE ... WHERE/RETURNING`; `INSERT/UPDATE` остались внутри двух узких функций.
- Финальная команда `node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-patient-write-actions.mjs
  --base-url=http://127.0.0.1:5200 --auth=fixture
  --fixture-file=/tmp/bcb-patient-actions.fixture.json
  --expected-patient-user-id=00000000-0000-0000-0000-000000000001
  --refs-file=/tmp/bcb-patient-reminder-refs.json --out-json=/tmp/bcb-patient-write-actions-r6.json` дала
  `PASS 4/4`: support mark-read, done, snooze и skip — HTTP `200`. Контрольные запросы нашли `done`, `snoozed`,
  `skipped`; operational snooze стал `planned`, `delivery_generation=1`, а skip — `status=skipped`.
  PostgreSQL log cursor остался пустым: start `394369`, end `394369` (`394370..394369`).
- `node --test deploy/postgres/privileges/port-context-catalog.test.mjs
  deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs
  deploy/postgres/privileges/port-context-callsite-catalog.test.mjs` → `43/43`; journal sync, migration runner
  self-test, generated byte-check и `git diff --check` прошли.
- **ORDINARY-DEV-MIGRATOR-001 — ОТКРЫТО:** команда `bash deploy/host/migrate-dev.sh --preflight` остановилась
  `parse-dev-database-url: missing_database_url`: wrapper всё ещё требует удалённый стационарный
  `bcb_webapp_dev_user` и старый `DATABASE_URL`, тогда как cutover оставляет только четыре runtime login и
  deploy-only migrator. Поэтому 0392 была применена в DEV административно одной транзакцией вместе с её exact
  Drizzle hash/`created_at`, после чего выполнен declaration reconcile. До финальной DEV-приёмки ordinary wrapper
  должен получить новый временный миграционный механизм; возвращать постоянный legacy-login запрещено.

## Audit/live pass DEV-staff-static-and-measure-kinds-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `0ce5876a7`, `feat/doctor-ui-rebuild` |
| Метод | GET-only walk всех статических doctor/settings routes + живые create/read/rename с DB-контролем трех организаций |
| Вердикт | **PASS ДЛЯ СТАТИЧЕСКОГО STAFF RENDER И ORG-ISOLATED MEASURE KINDS; dynamic paths/actions ещё открыты** |

- **LIVE-STAFF-MEASURE-KINDS-READ-001 — ИСПРАВЛЕНО:** первый staff walk громко дал `permission denied for table
  clinical_test_measure_kinds`. Прямой вызов закрытой таблицы сначала переведён на существующий seam, после чего
  живой POST раскрыл старый SQL-дефект `column reference "code" is ambiguous`. Migration 0393 исправляет exact
  historical chain, чтобы последовательность миграций остаётся исполнимой.
- **LIVE-STAFF-MEASURE-KINDS-SCOPE-001 — ИСПРАВЛЕНО ПО OWNER-РЕШЕНИЮ:** выдавать staff запись в глобальный пул
  было бы неверно. Migration 0394 добавляет `clinical_test_measure_kind` в baseline `2`, создаёт organization-owned
  category всем существующим клиникам, копирует туда возможные legacy-строки и удаляет глобальную таблицу и три
  capability-функции. Код переиспользует существующий `reference_categories/reference_items` port и RLS; global
  admin не получает clinical capability. Live create/read/rename вернули HTTP `200`; DB показала строку ровно в
  одной организации (`1/0/0`), после удаления fixture остаток `0`.
- Команда `node docs/_TODO/SAAS_FOUNDATION/scripts/walk-app-pages-no-redirect.mjs --base-url=http://127.0.0.1:5200
  --auth=dev-bypass --include='^/app/(doctor|settings)' --concurrency=1 --timeout-ms=120000
  --out-json=/tmp/bcb-staff-page-walk-r2.json --out-csv=/tmp/bcb-staff-page-walk-r2.csv` проверила `260`
  role/path сочетаний. Для doctor: `38` прямых `OK` и `14` ожидаемых redirect; clinic-admin: `39` `OK` и `13`
  redirect; `4xx/5xx` у обеих staff-ролей нет. PostgreSQL cursor `394393..394394` содержит только checkpoint.

## Audit/live pass DEV-integrator-signed-relay-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `cd42a9ffb`, `feat/doctor-ui-rebuild` |
| Метод | Живой integrator startup + signed relay negative/positive/dedup + фактические audit/dedup rows + PostgreSQL journal cursor |
| Вердикт | **PASS ДЛЯ SIGNED RELAY AUTH/DEDUP/DELIVERY-AUDIT; остальные integrator routes и worker/scheduler остаются открыты в Ф7** |

- **LIVE-INTEGRATOR-PLATFORM-CONFIG-CONTEXT-001 — ИСПРАВЛЕНО ГРОМКО:** первый корректно подписанный MAX relay
  завершился `502`, а PostgreSQL записал `42501 permission denied for function
  read_integrator_platform_integration_availability`. Глобальная доступность интеграции ошибочно читалась под
  ambient organization principal. Чтение переведено на существующий exact no-tenant `delivery-handler`
  capability; organization identity при этом не расширяется и table grant runtime-роли не выдаётся.
- **LIVE-INTEGRATOR-DELIVERY-AUDIT-OVERLAY-001 — ИСПРАВЛЕНО ГРОМКО:** следующий проход раскрыл два старых обхода:
  отсутствующую в обычном migration ledger функцию `app.read_operational_verbose_log_flag()` (`42883`) и прямой
  неqualified INSERT в `delivery_attempt_logs` (`42P01`). Migration `0395` удаляет эти overlay-only roots,
  добавляет `debug_forward_to_admin` в существующий exact provider-setting reader и создаёт один общий
  `app.record_operational_delivery_attempt_audit(..., payload_text text, timestamptz)` для Telegram/MAX/SMSC/
  email/web-push. Все каналы идут через одну declared capability; `PUBLIC` и прямой runtime table access не
  открыты. JSON payload передаётся как точный `text` transcript и приводится к `jsonb` только внутри функции:
  генератор громко отверг неподдерживаемый exact hash для `jsonb`, ослабление проверки не применялось.
- **LIVE-INTEGRATOR-NAMED-ROOT-TX-001 — ИСПРАВЛЕНО ГРОМКО:** первая версия вызывала exact audit root внутри уже
  открытой generic relation transaction; порт штатно отверг upgrade контекста до обращения к PostgreSQL, из-за
  чего safe DEV suppression превращался в `502`. Named-root теперь начинает собственную attested transaction до
  checkout physical client. Behavioral regression test проверяет отсутствие generic `db.tx` на этом пути.
- **DEV-DECLARATION-ENV-LAYER-001 — ОТКРЫТО В ОБЫЧНОМ DEPLOY ENTRYPOINT, DEV ВОССТАНОВЛЕН:** ручное повторное
  применение только `generated/privileges.bcb_webapp_dev.sql` закономерно отозвало `CONNECT` и schema `USAGE` у
  login shells: exact env-слой обязан выполняться последним. Integrator громко упал сначала `permission denied
  for database`, затем `permission denied for schema app`. Полный env render восстановил четыре login без смены
  паролей; integrator снова стартовал. Канонический post-zero installer уже применяет этот порядок атомарно, но
  обычный DEV migration/deploy entrypoint всё ещё открыт в Ф6 и не должен заменяться ручной сборкой частей.
- Финальный живой запрос дал: `missing 400 {"error":"missing_headers"}`, `invalid 401
  {"error":"invalid_signature"}`, `valid 200 {"status":"accepted"}`, `duplicate 200
  {"status":"duplicate"}`. Central DEV guard записал `PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS` с причиной
  `no_max_binding`, то есть provider не вызывался. Точный DB-контроль показал `audit|1|max|success|
  dev_redirect_suppressed` и одну durable idempotency row; обе probe-строки затем удалены, контроль вернул
  `audit_remaining=0` и `dedup_remaining=0`. Команда `sudo -n tail -n +$((start+1))
  /var/log/postgresql/postgresql-16-main.log` после финального probe не вернула строк.
- Проверки: targeted Vitest `13/13`; integrator и webapp typecheck — exit `0`; function census `6/6`;
  port-context catalog `12/12`; independent production callsite oracle `5/5`; relation access `20/20`;
  `generate-cli.mjs --check` — четыре generated artifacts совпадают побайтно. Каталог содержит `95` exact
  capabilities (`68` webapp + `27` integrator), из них `81` function-bound root.

## Audit/live pass DEV-integrator-auth-delivery-routes-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `d3fdeeea1`, `feat/doctor-ui-rebuild` |
| Метод | Signed live calls send-sms/send-email/send-otp + central no-send guard + exact audit rows + PostgreSQL journal cursor |
| Вердикт | **PASS ДЛЯ ТРЁХ AUTH-DELIVERY ROUTES; остальные integrator routes остаются открыты** |

- SMS protocol дал `400 missing_headers`, `401 invalid_signature`, затем корректно подписанный запрос — `200`.
  Email OTP и MAX OTP с положительным numeric user id дали `200`. Все три были остановлены единым
  `PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS`, provider не вызывался.
- **LIVE-MAX-OTP-RECIPIENT-VALIDATION-001 — ИСПРАВЛЕНО ГРОМКО:** signed MAX OTP с `recipientId` произвольной
  строкой проходил общую Zod-schema, после чего `maxUserRecipient` бросал исключение вне route catch и HTTP
  отвечал `500`. Route schema теперь требует для MAX положительный decimal platform user id: тот же запрос даёт
  `400 {"error":"invalid_payload"}` до dispatch, numeric id продолжает давать `200`. Behavioral test `2/2`
  проверяет обе ветки; integrator typecheck — exit `0`.
- DB-контроль после трёх positive route calls нашёл ровно три новые строки (`smsc`, `email`, `max`) со status
  `success`, reason `dev_redirect_suppressed` и payload `{"kind":"otp_redacted",...}`: код и recipient не
  попали в audit. PostgreSQL cursor финального MAX retest пуст. Probe rows `7080..7082` удалены точным условием;
  контроль вернул `remaining=0`.

## Audit/live pass DEV-integrator-operator-alert-health-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `3931a0343`, `feat/doctor-ui-rebuild` |
| Метод | Signed operator-alert/health calls + живой integrator port-context + catalog/ACL control + PostgreSQL journal |
| Вердикт | **PASS ДЛЯ OPERATOR ALERT И HEALTH; остальные integrator routes/worker paths остаются открыты в Ф7** |

- Signed operator-alert дал `200 accepted`, повтор того же idempotency key — `200 duplicate`; central DEV guard
  не вызвал provider, exact delivery-audit и durable dedup строки существовали. Точный cleanup-запрос по
  `id=7083 AND intent_event_id='dev-operator-1786601391'` и
  `key='global:dev-operator-1786601391'` удалил по одной строке; два последующих `count(*)` вернули `0/0`.
- **LIVE-INTEGRATOR-OPERATIONAL-SEAMS-ENV-SKEW-001 — ИСПРАВЛЕНО ГРОМКО:** первый signed health вызов вернул
  внешний `200`, но приложение записало три `42883`: DEV не имела девять runtime-функций, потому что их bodies
  жили только в TEST host overlays. Migration `0396_integrator_operational_runtime_seams_local.sql` переносит
  ровно эти девять узких bodies в общий Drizzle ledger; declaration теперь включает их в DEV и TEST. Команда
  `sudo -n -u postgres psql -X -At -d bcb_webapp_dev -c "select count(*) from pg_proc p join pg_namespace n on
  n.oid=p.pronamespace where n.nspname='app' and p.proname = any(array['list_google_calendar_probe_organization_ids',
  'open_or_touch_operator_probe_incident','read_integrator_clinic_delivery_credential',
  'read_integrator_google_calendar_setting','read_integrator_runtime_setting','read_operator_health_probe_config',
  'read_operator_outbound_probe_meta','record_operator_outbound_probe_run','resolve_operator_probe_incidents']);"`
  вернула `9`; ledger read-only query содержит `id=420` и `created_at=1793539230139`.
- **LIVE-INTEGRATOR-PROBE-UPSERT-ACL-001 — ИСПРАВЛЕНО ГРОМКО:** следующий health проход обнаружил `42501` в
  repository-записи `health.outbound_probe.run`: declared seam описывал `INSERT`, но PostgreSQL требует также
  `UPDATE` для `ON CONFLICT DO UPDATE` и `SELECT` для прочитанных значений. Декларация теперь выдаёт
  `SELECT/INSERT/UPDATE` перечисленных столбцов только NOLOGIN-владельцу
  `app_seam_telemetry_operator_owner`; `app_operational_scheduler` и `bcb_dev_integrator` по-прежнему имеют лишь
  EXECUTE/context path, не table ACL. Прямой вызов того же repository через
  `runWithInfraPrincipal({source:'scheduler:handle-tick-event'}, recordOperatorOutboundProbeRun)` завершился
  exit `0`; DB-строка имеет `job_family=health`, `last_status=success`, `meta_json` object.
- Финальный signed POST `/internal/operator-health-probe` вернул `HTTP 200` и три
  `skipped_not_configured`; `sudo -n journalctl -u postgresql@16-main.service --since "$probe_since"
  --no-pager -o cat` не вернул строк. Это штатный DEV-результат при отсутствующей provider-конфигурации, а не
  проглоченная DB-ошибка. Function census `6/6`, generated byte-check четырёх artifacts и `git diff --check`
  прошли.

## Audit/systemic pass DEV-function-body-surfaces-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `2ef4d403a`, `feat/doctor-ui-rebuild` |
| Метод | Единый анализ фактического `pg_proc.prosrc` всех declared SECURITY DEFINER-функций против operation surface декларации, затем live reconcile DEV |
| Вердикт | **PASS: КЛАСС РАССИНХРОНА ИСПРАВЛЕН СИСТЕМНО; НЕ ТРЕБУЕТ ПОШТУЧНОГО LIVE-ЛОВЛЕНИЯ** |

- **FUNCTION-BODY-OPERATION-SURFACE-001 — ИСПРАВЛЕНО ГРОМКО:** живой health-проход сначала обнаружил один
  недостающий ACL у `record_operator_outbound_probe_run`, но полный анализ показал, что это общий класс:
  декларация могла назвать relation и колонки, не доказав соответствие фактическим операциям тела функции.
  Generator теперь до выдачи доступа строит полный function→relation surface и по live `prosrc` fail-closed
  проверяет `SELECT/INSERT/UPDATE/DELETE`, скрытые требования `ON CONFLICT DO UPDATE`, чтение существующей строки
  и `RETURNING`. Проверка не выдаёт runtime-login прямой доступ к таблице: корректируется только минимальный ACL
  конкретного NOLOGIN seam owner.
- Первый полный base-census выявил повторяющиеся function-level расхождения; после исправления базового каталога
  тот же системный анализ полного declaration overlay нашёл оставшийся тот же класс в Google Calendar roots.
  Повторный live reconcile командой
  `sudo -n -u postgres psql -X -1 -q -v ON_ERROR_STOP=1 -d bcb_webapp_dev < deploy/postgres/generated/privileges.bcb_webapp_dev.sql`
  завершился notices `BCB_RUNTIME_DEFINER_GATES_VERIFIED ... functions=233` и
  `BCB_FUNCTION_BODY_SURFACES_VERIFIED rows=493`.
- Команда `node --test deploy/postgres/privileges/port-context-catalog.test.mjs
  deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs
  deploy/postgres/privileges/port-context-callsite-catalog.test.mjs && pnpm exec tsc -p
  deploy/postgres/privileges/tsconfig.json --noEmit` дала `43/43`, typecheck exit `0`.

## Audit/live pass DEV-request-contact-global-handshake-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `9c5789265`, `feat/doctor-ui-rebuild` |
| Метод | Signed live request-contact + duplicate + central no-send guard + application/PostgreSQL journals |
| Вердикт | **PASS: GLOBAL PRE-LOGIN HANDSHAKE НЕ УГАДЫВАЕТ КЛИНИКУ И НЕ ПИШЕТ IDENTITY** |

- **LIVE-REQUEST-CONTACT-DEPLOYMENT-ORG-001 — ИСПРАВЛЕНО ГРОМКО:** route до отправки делал два tenant-resolve,
  затем Telegram `user.upsert`; при новом deny-by-default прямое чтение `public.be_organizations` громко
  отказывало, но route проглатывал resolver failure и отвечал `200`. Эти операции не являются потребностью
  глобального contact handshake: route больше не определяет организацию, не создаёт человека/channel binding и
  не вызывает tenant write. Канонический `user.upsert` сохранён только во входящем channel-link flow, где реально
  пришло событие человека.
- Необязательный org-scoped `support_delivery_events` остаётся для клинических отправок с известной организацией;
  отсутствие организации у global/pre-login delivery больше не маркируется ложным warning. Обязательный
  operational audit по-прежнему пишется exact named root; неожиданный сбой при известной организации остаётся
  громким и сохраняет fallback.
- Live-команда с HMAC, загруженным локально из `.env` без вывода secret, дала `first 200 accepted` и
  `duplicate 200 duplicate`; central guard записал `PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS`, provider не
  вызывался. `sudo -n tail -n +$((probe_start+1)) /var/log/postgresql/postgresql-16-main.log` не вернул строк.
  Команда `pnpm --dir apps/integrator exec vitest run
  src/integrations/bersoncare/requestContactRoute.route.test.ts
  src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts && pnpm --dir apps/integrator exec tsc --noEmit &&
  git diff --check` дала `2 files / 8 tests`, typecheck и diff-check exit `0`.
- SQL cleanup с exact predicates `id IN (7085,7086)` и двумя именованными probe keys удалил только созданные
  этим проходом строки; два последующих `count(*)` вернули `audit_remaining=0`, `dedup_remaining=0`.

## Audit/live pass DEV-integrator-dedicated-webhook-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `9b69294db`, `feat/doctor-ui-rebuild` |
| Метод | Full declared function-body operation scan + живой unknown/known dedicated-bot resolver для Telegram/MAX + DB/журнал-контроль |
| Вердикт | **PASS ДЛЯ DEDICATED-BOT PRE-ROUTING И WEBHOOK OUTCOME; остальные integrator routes остаются открыты в Ф7** |

- **LIVE-WEBHOOK-OUTCOME-DIRECT-DRIZZLE-001 — ИСПРАВЛЕНО ГРОМКО:** webhook health/error раньше писал две
  таблицы прямым Drizzle-кодом и двумя независимыми запросами. Migration `0397` создаёт одну атомарную
  `app.record_integrator_webhook_outcome(text,boolean,integer,text,text)`: она обновляет last status и при отказе
  добавляет error event. Runtime получает только exact `EXECUTE`; у `bcb_dev_integrator`,
  `app_integrator_request` и `app_service` direct table grants нет.
- **FUNCTION-BODY-UPSERT-SELECT-002 — ИСПРАВЛЕНО СИСТЕМНО:** живой вызов показал, что PostgreSQL 16 для
  `INSERT ... ON CONFLICT DO UPDATE` требует также `SELECT` строки конфликта. Generator теперь fail-closed
  требует `SELECT` для каждого такого body. Полный запрос по всем declared `pg_proc.prosrc` нашёл тот же класс
  ещё в password/OTP/cooldown/tariff seams; исправлен весь класс, а не один webhook.
- **LIVE-DEDICATED-BOT-GENERIC-CONTEXT-001 — ИСПРАВЛЕНО ГРОМКО:** dedicated resolver вызывался через generic
  relation context, затем первая версия named root упиралась в рассинхрон JS claims matrix и уже правильного
  PostgreSQL contract. Теперь `app_integrator_resolver` допускает ровно resolver-контекст без заранее известного
  человека/организации, только с exact function/purpose/typed-args hash; обычный `app_integrator_request`
  по-прежнему обязан иметь integrator user + organization.
- Негативный HTTP-прогон дал Telegram/MAX `200 {"ok":false,"error":"Unknown bot"}`; last status обеих строк —
  `processed_ok=0`, `webhook_auth_failed`, HTTP `200`. В application log нет `[db][query] error`; команда
  `journalctl --since '2026-08-13T10:35:52+03:00' --no-pager -q | rg
  "port context|permission denied|42501|bcb_webapp_dev"` нашла только собственную read-only `sudo psql` запись,
  PostgreSQL error отсутствует.
- Положительный probe вставил по одной заведомо одноразовой binding-строке с fingerprint `ff…ff`; exact resolver
  вернул `a0000000-0000-4000-8000-000000000001` для Telegram и MAX (`pass=true`). Cleanup удалил fixture;
  `SELECT count(*) ... WHERE credential_fingerprint='ff…ff'` вернул `0`.
- `pnpm --dir packages/db-principal test` дал `27/27` unit tests и `port-context cutover sequence self-test:
  PASS`; targeted integrator tests и typecheck прошли. Function/access/callsite suite после regeneration —
  `43/43`; generated DEV/TEST artifacts совпадают с declaration.
- **ORDINARY-DEV-MIGRATOR-001 — ОСТАЁТСЯ ОТКРЫТО:** 0397 применена на DEV административно одной транзакцией с
  exact ledger row, потому что ordinary `migrate-dev.sh` всё ещё требует удалённый generic `DATABASE_URL`.
  Постоянный legacy login не возвращать; переносимый deploy-only migrator закрывается отдельным пунктом Ф6.

## Audit/independent view aa7df8702-auditor-20260813

| Поле | Значение |
|---|---|
| Candidate | `aa7df8702` |
| Метод | Независимый `reviewer-critical`, классификация «ВЗГЛЯД», PostgreSQL 16 privilege semantics + owner plan |
| Вердикт | **FAIL → ИСПРАВЛЕНО ГРОМКО ниже** |

- **WEBHOOK-ERROR-EVENTS-DIRECT-APP-WORKER-001 — НАЙДЕНО:** auditor подтвердил exact resolver, атомарный outcome
  writer, typed args, migration/declaration/callsite consistency и systemic `ON CONFLICT` verifier, но нашёл один
  обход: `app_worker` сохранял прямые `SELECT/INSERT/DELETE` на `public.integration_webhook_error_events`.
  Staff login мог `SET ROLE app_worker`, создать event отдельно от last-status либо удалить его вне exact purpose.
- Run record: `/home/dev/brain/runs/agent-port/aa7df8702-auditor-20260813.json`; изменений аудитор не вносил.

## Audit/fix pass DEV-webhook-error-health-seams-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `aa7df8702`, `feat/doctor-ui-rebuild` |
| Метод | Exact named-root replacement + generated catalog checks + live positive/negative DEV probes |
| Вердикт | **PASS: WEBHOOK-ERROR-EVENTS-DIRECT-APP-WORKER-001 ИСПРАВЛЕНО ГРОМКО** |

- Migration `0398_webhook_error_health_seams_local.sql` добавляет только два health-root:
  `app.list_integration_webhook_burst_signals(integer,integer)` и
  `app.prune_integration_webhook_error_events(integer)`. Repository aggregate/retention переведены на них;
  direct access `app_worker` из declaration удалён. Атомарный writer `0397` остаётся единственным runtime-путём
  записи webhook outcome/error pair.
- Команда catalog proof
  `SELECT has_table_privilege(... SELECT), has_table_privilege(... INSERT), has_table_privilege(... DELETE),
  has_function_privilege(... list ...), has_function_privilege(... prune ...), has_function_privilege(... record ...)`
  вернула `f|f|f|t|t|t`.
- Живой webapp-port вызов exact aggregate и retention roots вернул `{"aggregateRows":0,"pruned":0}`.
  Отрицательный `SET ROLE app_worker; SELECT * FROM app.list_integration_webhook_burst_signals(1,1)` дал exit `1`
  и `accepted port context required`; `/var/log/postgresql/postgresql-16-main.log` записал exact owner, role,
  purpose, typed-args expression, function identity и statement.
- `node --test deploy/postgres/privileges/relation-access.test.mjs
  deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/function-census.test.mjs
  deploy/postgres/privileges/port-context-callsite-catalog.test.mjs` дал `44/44`; targeted Vitest — `3/3`;
  webapp typecheck, generated byte-check и `git diff --check` прошли. DEV reconcile сообщил `99` capabilities,
  `236` runtime definer gates, `497` function-body surfaces, `4` env login и `272` catalog routines.

## Audit/live pass DEV-patient-treatment-program-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `aa7df8702`, `feat/doctor-ui-rebuild` |
| Метод | Одноразовая cross-org fixture + реальные patient list/detail/touch/complete + DB state/cleanup |
| Вердикт | **PASS ДЛЯ PATIENT TREATMENT-PROGRAM SLICE** |

- Десять treatment-program relations получили смысловую patient-self/current-clinic стену и минимальные
  operation/column grants; семь ранее пропущенных tenant markers исправлены системно. Drizzle insert columns
  перечислены полностью, включая defaulted поля, потому что generated SQL всё равно называет их явно.
- Own list/detail/touch/complete дали `200`; detail экземпляра другой организации дал `404`. DB state после
  действий — `in_progress|1|1|2`; exact cleanup подтвердил `0` оставшихся probe-строк, новых patient ошибок в
  PostgreSQL log не появилось.
- Первый fail-loud проход выявил частично сохранённый stage status до отказа event INSERT. Шесть составных
  progress mutations теперь выполняются одной mutation transaction. Найденный nested-transaction класс исправлен
  в общем `drizzleMutationTx`: вложенный repository использует уже активный tx, не делает второй `BEGIN` на том
  же client. Unit-test доказывает один outer transaction и reuse того же tx; финальный live replay зелёный.

## Audit/independent view 0e46d830-auditor-20260813

| Поле | Значение |
|---|---|
| Candidate | `0e46d830247b80053d4f58356d62b5115183d461` |
| Метод | Независимый критический взгляд: patient atomicity, exact seams, cross-org wall, migration/declaration consistency |
| Вердикт | **FAIL → ИСПРАВЛЕНО ГРОМКО ниже** |

- **PATIENT-LAST-TEST-TX-VISIBILITY-001 — НАЙДЕНО:** `patientSubmitTestResult` записывал результат в общей
  transaction, но `listResultsForAttempt` открывал другое соединение и не видел незакоммиченный последний
  результат. Первая отправка последнего/единственного теста не ставила `submitted_at`; пациенту пришлось бы
  отправлять тест повторно. Остальные критерии candidate аудитор признал PASS; файлов и БД он не менял.

## Audit/fix and exhaustive negative pass DEV-runtime-definers-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | рабочее дерево после `0e46d8302`, `feat/doctor-ui-rebuild` |
| Метод | Исправление audit finding + полный live login/role/definer/PUBLIC census через четыре реальные mTLS-login |
| Вердикт | **PASS: PATIENT-LAST-TEST-TX-VISIBILITY-001 ИСПРАВЛЕНО; ПОЛНАЯ NEGATIVE MATRIX ЗЕЛЁНАЯ** |

- `pgTreatmentProgramTestAttempts` теперь получает executor через `getDrizzleOrMutationTx`: чтение результатов
  видит запись той же outer transaction. Новый unit-test воспроизводит этот boundary и получает последний
  результат через active mutation executor; targeted Vitest дал `2/2`.
- **RUNTIME-GATE-NOT-FIRST-001 — НАЙДЕНО И ИСПРАВЛЕНО СИСТЕМНО:** первый прогон `85` exact roots дал `82`
  `accepted context required`, но две appointment lookup functions сначала валидировали `NULL`-аргумент и
  отвечали `22023`. Generator раньше заменял содержание существующего gate на месте. Теперь он удаляет старый
  standalone gate, всегда вставляет актуальный gate первой executable-командой и затем проверяет первое
  выражение каждого SQL/PLpgSQL runtime definer. Канонические bodies также исправлены. Повторный прогон:
  `summary|roots=85|42501=85`.
- Полный catalog-driven вызов всех обычных runtime definer functions дал
  `summary|runtime_definers=236|42501=236`; отдельный проход context accessors/gates дал
  `summary|context_helpers=6|42501=6`. Ещё `12` SECURITY DEFINER functions не имеют runtime EXECUTE. PostgreSQL
  file journal содержит физические login, exact gate/function и statement каждого отказа.
- Запрос `SELECT rolname,... FROM pg_roles WHERE rolcanlogin` вернул `16` cluster login. Только четыре
  `bcb_dev_*` и именованный DBA `postgres` имеют CONNECT к `bcb_webapp_dev`; `bcb_test_integrator`,
  `bcb_test_webapp_patient`, `bcb_test_webapp_staff`, `brain`, `brain_ro`, `code_search_ro`, `storylama_dev`,
  `storylama_prod`, `tgcarebot`, `pbt_tpl_1785583727857_d29e62` и `pbt_tpl_1785583783003_37ea98` — `CONNECT=f`.
  У `PUBLIC` запрос по `aclexplode` вернул `relation=0`, `routine=0`.
- **POST-ZERO-INSTALLER-RERUN-001 — ОСТАЁТСЯ ОТКРЫТО:** initial installer на уже-cutover DEV сначала требует
  pre-install zero policy state, затем без `IF NOT EXISTS` повторяет `CREATE ROLE`; оба запуска остановились
  внутри transaction и полностью откатились. Maintenance reconcile без одноразовых zero/login-shell шагов
  завершился одной transaction: `99` capabilities, `236` gates, `497` function surfaces, `4` env login.
  Обычный deploy entrypoint должен явно отделить initial cutover от повторяемого declaration reconcile.

## Audit/fix pass repeatable-access-reconcile-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | текущий diff после `4eeaafa06`, `feat/doctor-ui-rebuild` |
| Метод | Real DEV replay + disposable PostgreSQL 16 drift repair/idempotence/data-preservation acceptance |
| Вердикт | **PASS: повторяемый target reconcile и cluster-isolation доказаны; migration wrapper открыт** |

- `reconcile-access.mjs` отделяет обычный post-cutover reconcile от initial installer: не выполняет legacy,
  zero-state, target-login cleanup или restore; один target принимает явно и в одной транзакции применяет
  DB-local contract, relation wall registry, allowlist, privileges, четыре env-login и context catalog, затем
  запускает environment/port-context/bidirectional catalog verifier до `COMMIT`.
- **RECONCILE-REPLAYED-POST-ZERO-001 — НАЙДЕНО АУДИТОРОМ И ИСПРАВЛЕНО ГРОМКО:** первая версия повторно
  подключала `post-zero-roots.sql`, где кроме function bodies есть legacy drops и перенос `telegram_state`.
  Обычный reconcile больше не читает этот разовый artifact; существующие function bodies обновляет только
  declaration-owned gate/census, а новые/изменённые bodies обязана принести schema migration.
- **RECONCILE-MUTATED-SIBLING-ROLES-002 — НАЙДЕНО АУДИТОРОМ; ПЕРВАЯ ПРАВКА БЫЛА НЕПОЛНОЙ:** первая версия
  применяла полный privileges artifact с cluster-role baseline и могла менять TEST/shared roles из DEV-запуска.
  `--target-access-only` убрал мутации из privilege artifact, но повторный аудит доказал, что подключаемый
  `contract.sql` всё ещё создавал/менял shared roles. Запись «исправлено» выше была преждевременной. Контракт
  разделён на DB-local часть и отдельный declaration-owned shared-role baseline.
- **RECONCILE-ROGUE-MEMBERSHIP-003 — НАЙДЕНО ПОВТОРНЫМ АУДИТОРОМ:** первая read-only проверка exact membership
  ошибочно смотрела только связи, где обе стороны managed; произвольный login мог получить `app_staff` и
  `SET ROLE`. Исправлено до любой фиксации PASS: verifier проверяет любую связь с managed endpoint против
  полного declaration-графа shared roles и всех DEV/TEST login memberships. Disposable acceptance создаёт
  реальный rogue LOGIN с CONNECT и `app_staff`, требует громкий отказ без тихого ремонта и затем удаляет fixture.
  Объявленные login-edges другой, ещё не cutover среды являются допустимыми, но не обязательными: обязательность
  четырёх memberships доказывает environment verifier только выбранного target, поэтому DEV не активирует TEST.
- **RECONCILE-MUTATED-SIBLING-ROLES-002 И RECONCILE-ROGUE-MEMBERSHIP-003 — ИСПРАВЛЕНО ГРОМКО:** финальный
  независимый аудит повторно запустил disposable PostgreSQL 16 acceptance и получил PASS; новых блокирующих
  findings нет. Shared attribute drift и rogue LOGIN→runtime-role дают rollback без тихого ремонта, target drift
  восстанавливается, контрольные данные сохраняются, отсутствующие TEST memberships из DEV не создаются.
- Окончательная реализация добавила read-only shared-role verifier. Disposable PostgreSQL 16 намеренно изменил
  `app_staff` на `INHERIT`: target reconcile громко отказал и оставил drift нетронутым; отдельный
  `--shared-role-baseline` затем вернул `NOINHERIT`. Тот же acceptance доказал repair точного function grant и
  capability, сохранение контрольной строки, второй idempotent reconcile и rollback с сохранением неизвестной
  SECURITY DEFINER-функции. Команда
  `bash deploy/postgres/privileges/post-zero-installer.acceptance.sh` завершилась `PASS`.
- Окончательный запуск на живой `bcb_webapp_dev` завершился сообщением
  `access reconcile committed: env=dev database=bcb_webapp_dev`; все read-only verifiers исполнились до COMMIT.
- Два последовательных запуска на живой `bcb_webapp_dev` дали `PASS`. Disposable acceptance после initial
  zero/install вручную отозвала нужный function grant и сделала capability неактивной; reconcile восстановил
  оба состояния, сохранил контрольную строку `public.system_settings`, а второй reconcile не создал дубль.
  Команда `bash deploy/postgres/privileges/post-zero-installer.acceptance.sh` завершилась
  `post-zero installer acceptance: PASS`.
- После исправлений ещё два живых DEV-прогона дали `reconcile_run_3=PASS` и `reconcile_run_4=PASS`; hash-снимок
  атрибутов shared roles и memberships, не относящихся к четырём DEV-login, дал
  `shared_cluster_snapshot=UNCHANGED`.
- Остаток не скрыт: `migrate-dev.sh` по-прежнему требует удалённый `bcb_webapp_dev_user` и ещё не вызывает этот
  reconcile после schema/data migrations. Поэтому ordinary deploy целиком не объявлен готовым.

## Audit/live-matrix census staff-clinic-global-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | `4eeaafa06`, read-only production-callsite census |
| Метод | Guard/caller census от потребности doctor, clinic-admin и global-admin; без выдачи прав из наличия кода |
| Вердикт | **FAIL: два legacy hybrid-guard класса блокируют корректную live matrix** |

- **ADMIN-BOOKING-HYBRID-GUARD-001 — НАЙДЕНО:** `requireAdminBookingEngine` сначала требует legacy
  `session.user.role === 'admin'`, затем clinical workspace membership. Команда
  `while ... rg -c 'export (async )?function (POST|PUT|PATCH|DELETE)' ...` по `29` exact caller-файлам получила
  `28` mutation exports. Clinic owner/admin отсекается первым условием, отдельный global-admin не должен проходить
  второе. Лечить это DB-grant нельзя: каждый caller надо отнести к doctor-own, clinic-management, auditable
  platform action или мёртвому дублю.
- **ADMIN-PLATFORM-CLINICAL-HYBRID-002 — НАЙДЕНО:** точный поиск файлов, одновременно вызывающих
  `requireAdminApiContext` и `requireDoctorWorkspaceApiContext`, вернул `7` routes: audit-log resolve,
  audit-log read, health-failure clear, operator-incidents acknowledge/resolve, reference archive и user-profile
  update. Platform operations должны получать platform principal, а clinical/reference/support действия —
  отдельное смысловое решение; global-admin clinical membership запрещено owner-решением.
- Положительная live matrix этих групп не запускается до разделения guard/caller-классов. Остальные staff,
  clinic-admin и global-admin mutation families перечислены исполнителем и проверяются блоками с synthetic
  cross-org fixture, reversible state и central no-send.

## Fix pass admin-guard-separation-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | текущий diff после `2238b8fcd`, `feat/doctor-ui-rebuild` |
| Метод | Independent read-only caller classification → minimal deletion/separation → targeted behavior tests/typecheck |
| Вердикт | **КОД ИСПРАВЛЕН; ПОЛОЖИТЕЛЬНЫЙ LIVE DEV CENSUS ОСТАЁТСЯ ОТКРЫТ** |

- **ADMIN-BOOKING-HYBRID-GUARD-001 — ИСПРАВЛЕНО ГРОМКО:** точный caller census классифицировал все `29`
  route-файлов старого guard как legacy HTTP-поверхность: рабочие appointment/package действия уже имеют
  doctor routes, каталоги и расписание обслуживаются текущими doctor/clinic-management путями, а старые UI
  hosts не монтируются либо всегда перенаправляются middleware. Эти routes и orphan UI удалены; сам hybrid
  helper удалён, а живой helper переименован в `_requireClinicManagementBookingEngine.ts`.
- Удаление закрывает два достижимых cross-org bypass, а не маскирует их новым grant: старый manual appointment
  принимал произвольный body `organizationId` и подменял attested organization; merge-candidate dismiss менял
  строку по UUID без organization predicate. Global-admin clinical grants под эти пути не выдавались.
- **ADMIN-PLATFORM-CLINICAL-HYBRID-002 — ИСПРАВЛЕНО ГРОМКО:** пять живых platform operations (audit list/
  resolve, health archive clear, operator incident acknowledge/resolve) теперь требуют только строгий
  `requirePlatformOperationsApiContext`, который одновременно проверяет platform capability + factor и ставит
  отдельный platform DB principal. Orphan reference archive и небезопасный global user-profile PATCH удалены.
- Поведенческий gate:
  `pnpm --dir apps/webapp exec vitest --run src/app/api/admin/platformOperationsRoutes.route.test.ts
  src/app/api/admin/booking-engine/policies/route.route.test.ts
  src/app/api/admin/booking-engine/prepayment-policies/route.route.test.ts
  src/app/api/admin/booking-engine/public-appointments/route.route.test.ts
  src/app-layer/guards/requireEntitlementReadOnlyRefusesWrites.test.ts` → `5` files / `24` tests PASS.
  `protectedActionRegistryCoverage.unit.test.ts` → `8/8`; `pnpm --dir apps/webapp run typecheck` → PASS.
- Это закрывает найденный класс в коде, но не заменяет живое доказательство: clinic-admin и global-admin
  mutations должны пройти через DEV с правильными pool/context, а staff/global census остаётся открытым.

## Audit/live-matrix census integrator-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | `4eeaafa06`, read-only production-callsite census |
| Метод | HTTP/event/worker/scheduler caller census + external-delivery safety path inspection |
| Вердикт | **PASS ДЛЯ ПЛАНА ПРОГОНА; LIVE ОСТАЁТСЯ ОТКРЫТ** |

- Команда `rg -n '\bapp\.(get|post|put|delete|patch)...' apps/integrator/src/app
  apps/integrator/src/integrations --glob '*.ts' --glob '!*.test.ts'` получила `15` production HTTP routes;
  `9` уже имеют положительный evidence, остаток сгруппирован в `6` route-сценариев. Отдельно остаются `5`
  реально производимых projection event types, `8` outgoing delivery kinds и `4` scheduler paths.
- **LIVE-NO-SEND-GATE-001 — УСЛОВИЕ ПРОГОНА:** non-production redirect по умолчанию перенаправляет сообщения
  на настроенные тестовые контакты; это не нулевой внешний трафик. Worker/incoming action matrix поэтому
  запускается только отдельным one-shot process с `DEV_REDIRECT_DISABLE_DEFAULTS=1`, без explicit redirect
  targets и passthrough. Сначала должен быть доказан `PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS` до адаптера.
- Legacy worker/scheduler exports отделены от production main loops. `createPostgresJobQueue` не удаляется как
  legacy: его живой compatibility producer пишет canonical `public.outgoing_delivery_queue`, которую читает
  новый worker.

## Audit/independent view current-runtime-definer-fix-20260813

| Поле | Значение |
|---|---|
| Candidate | текущий незакоммиченный diff после `0e46d8302` |
| Метод | Независимый повторный взгляд: patient tx visibility, gate-first reconciliation, generated consistency, честность PLAN/log |
| Вердикт | **PASS** |

- Аудитор подтвердил, что новый repository test покраснел бы при возврате старого `getDrizzle`; multi-context
  `exact_existing` сохраняет hand-written expression и полный token check, а post-check требует gate первой
  командой. DEV/TEST generated byte-check, privilege tests, targeted Vitest, webapp typecheck и `git diff --check`
  зелёные. Полный положительный live census и повторяемый deploy остаются открытыми, поэтому PASS не завышает
  готовность всей Ф7.

## Audit/fix pass platform-operation-seams-live-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | `0947ebea6..26dc627e1`, `feat/doctor-ui-rebuild` |
| Метод | Независимый read-only взгляд → PostgreSQL 16 declaration verifier → живой DEV через четыре runtime-login |
| Вердикт | **ДВЕ НАХОДКИ ИСПРАВЛЕНЫ; БЕЗОПАСНЫЙ PLATFORM LIVE SLICE ЗЕЛЁНЫЙ** |

- **PLATFORM-AUDIT-ACTOR-001 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** exact platform mutation работает как
  `app_platform_admin`, а `current_actor_user_id()` первоначально признавал только `app_platform_settings`.
  Контракт теперь признаёт обе platform-роли; живые acknowledge/clear записали обязательный audit без `42501`.
- **PLATFORM-ARCHIVE-DIAGNOSTIC-LOSS-002 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** первая версия archive seam удаляла
  очередь после обезличенного INSERT и теряла clinic/doctor/raw diagnostic history. Полный tenant-walled архив
  теперь сохраняет organization, doctor, маскированного получателя, заголовок и усечённую ошибку; global-admin
  читает только отдельную sanitised-проекцию без этих clinical-полей.
- Штатный `migrate-dev.sh --execute` больше не зависит от удалённых `DATABASE_URL`/`bcb_webapp_dev_user`:
  integrator и webapp migrations идут через NOLOGIN `bcb_dev_migrator` под exact owners, затем обязательны
  declaration reconcile, catalog closure и синхронизация runtime capability JSON обоих software ports.
  Финальный живой запуск: `pending=0`, `access reconcile committed`, `migrate-dev: PASS`.
- Verifier дважды остановил reconcile до COMMIT: сначала на неописанном `INSERT RETURNING SELECT`, затем на
  некорректно раздвоенной relation-surface записи. После исправления единая declaration прошла closure.
- Живой DEV: `client/doctor/clinic-admin/admin` auth `303`, `/api/me=200`; global audit/archive и doctor archive
  `200`; platform response не содержит doctor/raw/recipient clinical fields; integrator `/health=200`.
  Exact resolve отсутствующего UUID дал JSON `404`; acknowledge с нулём строк и два пустых archive batch дали
  `200`, а `admin_audit_log` подтвердил обе action-группы со `status=ok`.
- Не заявлено как выполненное: два существующих open incident не закрывались, `15` существующих dead delivery
  rows не переносились ради теста. Resolve-all и непустой outgoing archive остаются в полном live census Ф7.
- **НЕЗАВИСИМЫЙ ПОВТОРНЫЙ АУДИТ — PASS:** оба MUST FIX закрыты. Live definition содержит
  `app_platform_admin` в actor accessor; полный архив сохраняет tenant/doctor diagnostics, platform list остаётся
  sanitised. Прямых grants platform-ролям на четыре queue/archive relation — `0`; exact seam EXECUTE доступен
  только через объявленный `app_platform_admin` context.

## Live/fix pass nonempty-platform-mutations-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | `feat/doctor-ui-rebuild`, следующий diff после `1f0bd91bb` |
| Метод | Backup затрагиваемых DEV-таблиц → реальные global-admin HTTP actions → DB state/audit/sanitised read → штатный migration/reconcile replay |
| Вердикт | **ДВА LIVE-ONLY ДЕФЕКТА ИСПРАВЛЕНЫ ГРОМКО; НЕПУСТОЙ PLATFORM SLICE ЗЕЛЁНЫЙ** |

- До destructive actions создан data-only custom dump шести затрагиваемых DEV-таблиц:
  `/tmp/bcb-dev-platform-live-before-20260813T143814.dump`, SHA-256
  `e9c74108b44817f90abaee269dec683199eb4d434d5a91da02f08d60be68ecc6`.
- **PLATFORM-ARCHIVE-SPECIAL-SYNTAX-003 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** непустой outgoing archive падал,
  потому что миграция `0399` квалифицировала специальные SQL-конструкции как функции
  `pg_catalog.coalesce(...)` и `pg_catalog.greatest(...)`. Пустые batch этого не исполняли и дали ложное
  ощущение готовности. Уже применённую migration не переписывали: fail-loud forward migrations `0400/0401`
  проверяют exact число ошибочных конструкций в установленном body и заменяют только их.
- **DEV-MIGRATION-D30-GATE-004 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** после перевода `migrate-dev.sh` на
  owner-ordered migrator старый online-index gate продолжал искать буквальный `pnpm run migrate` и отвергал
  актуальный безопасный wrapper. Gate теперь узнаёт канонический owner-migrator → streamed D30 artifact → psql
  порядок; старый и новый варианты покрыты self-test.
- Штатная команда `bash deploy/host/migrate-dev.sh --execute` применила `0400`, затем `0401`; оба запуска после
  forward migration завершились `access reconcile committed` и `migrate-dev: PASS`. Временные `CREATE ON SCHEMA
  app` и `USAGE ON LANGUAGE plpgsql` были выданы seam owner только внутри migration transaction и отозваны до
  commit/reconcile.
- Живой результат: `POST /api/admin/operator-incidents/resolve-all` → `200`, `resolved=2`;
  `POST /api/admin/health-failure-archive/clear` для `outgoing_delivery` → `200`, `inserted=3/deleted=3`, для
  `outgoing_reminder_dispatch` → `200`, `inserted=12/deleted=12`. После этого open incidents и обе dead-группы
  равны `0`, архив вырос с `44` до `59`; у новых строк `15` непустых raw diagnostics и `2` tenant ownership.
  `GET` platform/doctor archive → `200`; platform response на `59` строках содержит `0` clinical values.
- Audit rows подтвердили `operator_incidents_resolve_all|ok|2` и два
  `health_failure_archive_clear_dead|ok|3/12`. Прямые platform grants на рабочие queue/archive tables не
  добавлялись; изменение прошло через exact SECURITY DEFINER root и отдельный global-admin pool.

### Независимый аудит commit `4fd09d2e3` — PASS

- Независимый read-only auditor повторно проверил порядок journal `0399 → 0400 → 0401`, exact replacement-counts
  (`2` для `coalesce`, `1` для `greatest`), ledger hashes, owner и отзыв временных migration-привилегий.
- D30 gate сохраняет owner-migrator → streamed artifact → `psql` порядок; backup читается, SHA-256 совпадает.
  Прямых platform grants на queue/archive relations — `0`. Новых MUST FIX нет.

## Live/fix pass patient-reminder-diary-2026-08-13

| Поле | Значение |
|---|---|
| Candidate | текущий diff после `4fd09d2e3`, `feat/doctor-ui-rebuild` |
| Метод | Реальный patient session на DEV, две активные клиники, own+foreign fixtures, DB state/hash и fail-loud log |
| Вердикт | **ЧЕТЫРЕ ПРОПУЩЕННЫХ ДОСТУПА И ТИХИЙ НОЛЬ ИСПРАВЛЕНЫ ГРОМКО; PATIENT REMINDER/MOOD SLICE ЗЕЛЁНЫЙ** |

- **PATIENT-REMINDER-HISTORY-005 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** `mark-seen` сначала дал PostgreSQL `42501`.
  После exact `SELECT` + column-only `UPDATE(seen_at)` старый запрос всё равно возвращал HTTP `200`, но менял
  `0` строк: ownership проверялся через `reminder_rules`, чья policy требует выбранную клинику. Запрос теперь
  использует канонический `reminder_occurrence_history.platform_user_id`; старые `catch { return 0 }` для count/
  stats удалены. Live specific/all обновили две свои строки, подмешанная чужая осталась `seen=false`.
- **PATIENT-REMINDER-MUTE-006 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** patient self policy уже ограничивала
  `platform_users.id`, но новая декларация потеряла column grant `reminder_muted_until`. Возвращён только этот
  столбец вместе с уже нужным `updated_at`. Mute и unmute дали `200`; чужой patient row остался `NULL`.
- **PATIENT-REFERENCE-CATALOG-007 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** новая декларация потеряла D3-доступ пациента
  к полной current-clinic копии `reference_categories/reference_items`, поэтому mood падал на
  `reference_items 42501`. Возвращён current-org `SELECT` для patient; существующий staff management сохранён.
  Одновременно удалены не подтверждённые production-кодом широкие staff `DELETE` на обеих reference-таблицах.
- **PATIENT-SYMPTOM-ENTRIES-008 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** `symptom_trackings` уже разрешал self CRUD, а
  собственные `symptom_entries` не имели patient ACL, поэтому дневник создавал tracking и падал на первом чтении.
  Возвращён полный смысловой self action set: `SELECT`, exact-column `INSERT/UPDATE`, `DELETE`, под существующей
  patient ownership policy. Live POST создал score `3`, повторный POST изменил ту же строку на `4`, today/week
  вернули `200`; hash `617` чужих entries до/после одинаков: `88586d226a979db1da7ebfcc4546f66d`.
- **PATIENT-PROMO-READ-MUTATION-009 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** reminders read-page при отсутствии
  выбранной клиники правильно не имела права материализовать promo, но до проверки этого решения всё равно
  читала clinic template, ловила ошибку и продолжала с `ensure_default_promo_failed`. Проверка
  `canMaterialize` перенесена перед DB-read: новый grant не добавлялся. Повторный живой render дал `200` и
  `0` новых строк в webapp runtime log; behavior test также требует, чтобы `getTemplate` не вызывался.
- Все одноразовые fixtures удалены: own symptom entries `0`, own trackings `0`, reminder history fixture `0`,
  reminder rule fixture `0`; organization preference возвращена в исходное невыбранное состояние.

### Независимый аудит commit `27964f430` — MUST FIX найден и закрыт

- **REMINDER-FINALIZED-OWNERSHIP-010 — НАЙДЕНО АУДИТОРОМ И ИСПРАВЛЕНО ГРОМКО:** предыдущий live fixture
  вручную содержал `platform_user_id`/`organization_id`, но настоящий producer
  `reminder.occurrence.finalized` терял оба уже известных ownership-поля. Поэтому прежняя формулировка
  «reminder slice зелёный» была преждевременной: новая реальная строка могла исчезнуть из patient history.
- Integrator теперь берёт canonical `platform_user_id` и organization непосредственно из своей operational
  occurrence/rule, громко падает при отсутствии ownership и передаёт оба поля через projection event. Webapp
  требует их в payload и INSERT. Exact staff INSERT grant расширен только этими двумя колонками; patient ACL
  не расширен. Targeted fanout/repository tests требуют сохранения обоих полей.

### Live/fix pass patient-analytics-2026-08-13

- **PATIENT-PUSH-OPEN-CONTEXT-011 — НАЙДЕНО И ИСПРАВЛЕНО ГРОМКО:** push-open route получал обычную сессию,
  но не ставил patient DB principal; repository уходил в запрещённый direct path. Endpoint теперь требует
  authenticated patient business context и пишет только через exact current-patient seam. Старое описание
  optional pre-login analytics явно помечено `УСТАРЕЛО/ЗАМЕНЕНО`; до логина остаются только auth/session paths.
- **DEFINER-ON-CONFLICT-SELECT-012 — НАЙДЕНО LIVE И ИСПРАВЛЕНО КЛАССОМ:** PostgreSQL 16 требует `SELECT` на
  conflict-key/predicate columns даже для `INSERT ... ON CONFLICT DO NOTHING`. Старый verifier проверял это
  только для `DO UPDATE`, поэтому push-open громко падал `42501` на `product_analytics_events_recent`.
  Проверка распространена на `DO NOTHING`; полный DEV body census нашёл и закрыл все восемь таких seam
  relation-surfaces. Повторный reconcile теперь прерывается при любом новом необъявленном случае.
- Живой результат: первый push-open → `200 {deduped:false}`, повтор → `200 {deduped:true}`; recent/hourly/
  user-hourly содержали ровно `1/1/1`. Обычный patient page-view также дал `200 accepted=1`. Все analytics
  fixtures и выбранная organization затем удалены: `recent=0`, `hourly=0`, push fixture `=0`.
