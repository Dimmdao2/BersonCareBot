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

**Статус: ОТКРЫТО — MUST FIX.** Callback не получает checkout-client и может выполнить query на другом backend;
cleanup failure не вызывает `release(error)`. Wrapper также ставит `request_id` всем классам и всегда H0, поэтому
нарушает claims matrix и не способен обслужить named root с typed args. Acceptance commit содержит пять красных тестов.

### IMPL-003 — SQL принимает malformed context и typed args

**Статус: ОТКРЫТО — MUST FIX.** Реальный PG16 принял staff с лишним `subject_ref`, NULL protocol version и unknown
tag; NULL `type_tag` вернул тихий NULL. Нужны exact required+forbidden matrices, закрытый набор десяти tags, binary
length/value validation и одинаковый production Node↔SQL encoder. Live layout держит `pgcrypto` в `app_ext`, поэтому
`app.digest` candidate сломан; штатный PG16 `pg_catalog.sha256(bytea)` убирает эту лишнюю зависимость.

### IMPL-004 — role/ownership/pre-session graph не обслуживает живые пути

**Статус: ОТКРЫТО — MUST FIX.** Login roles остались INHERIT; webapp staff получил delivery role; integrator не
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

**Статус: ОТКРЫТО — MUST FIX.** Endianness mutation production Node, удаление install, `USING(true)` и снятие FORCE
RLS оставили старый acceptance зелёным; script не подключён к package/CI. `d2f85bc39` добавил первые красные wrapper
tests, но все девять kill-set классов должны получить поведенческое/introspection evidence по своей природе.

### Подтверждено и сохраняется

- Базовый PG16 HBA exact CN + certificate + SCRAM работает; wrong/missing certificate, password-only, non-TLS и
  Unix socket application login отклоняются.
- Контекст конструктивно привязывается к DB OID, backend PID, xid8, login и capability; фиксированный definer
  `search_path`, FORCE RLS и raising `42501` с PostgreSQL log исполнимы.
- Candidate — полезный core, не выбрасывается; он наращивается тем же kill-set. Новый blind audit этого surface не
  нужен: fixer делает acceptance commit зелёным и закрывает семь findings, лидер проверяет итог.
