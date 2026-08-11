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
