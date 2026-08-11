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
