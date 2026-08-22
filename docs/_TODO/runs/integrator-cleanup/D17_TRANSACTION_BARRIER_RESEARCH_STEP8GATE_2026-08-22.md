# D17 — барьер «корень нельзя позвать внутри открытой транзакции»: исследование

**Тип документа:** ИССЛЕДОВАНИЕ. Кода не писал, миграций не заводил, ничего не чинил. Решение — за ведущим.
**Run-id:** `STEP8GATE` · **ветка:** `wt/step8-gate-fix-20260822` · **база:** `4df6fd235`
**План-файл:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **D17**.
**Оракул:** `docs/_TODO/runs/integrator-cleanup/D17_RELATION_READERS_2026-08-22.md`, §4.
**Замеры:** живой DEV `bcb_webapp_dev` (PostgreSQL 16.15), каждая проба — своя транзакция, каждая кончается
`ROLLBACK`. `--execute` не запускался, TEST и прод не тронуты, `push` не делался.

---

## 0. Короткий ответ

**Барьер не там, где написано в §4 оракула.** «Принятый контекст один на транзакцию» — правда, и я её измерил
(§2, проба P4b). Но это ограничение **одной транзакции**, а не ограничение «корень нельзя позвать изнутри
работы». Физически невозможно ровно одно: держать ДВА принятых контекста в ОДНОМ `xid`. Всё остальное,
чего «нельзя», — это `throw` в прикладном коде (`runIntegratorSql.ts:53`), а не отказ базы.

Причём **сама транзакционная граница уже проходима существующими примитивами**: логин может поменять
принятый контекст внутри одной транзакции сколько угодно раз (проба P11, §2.4) — и это не дыра, а
следствие того, что настоящая стена D17 — это **членство роли**, а не одноконтекстность.

Из шести мест §4 «структурный барьер» держат **три**, и они разные по природе:

| место | что на самом деле мешает |
|---|---|
| `writeReminderRulesDirect.ts:156` (`resolveExactActiveOrganizationId`) | **ничего.** Обёртка `db.tx` там read-only и существует только чтобы сгруппировать два чтения; в том же файле, строкой выше, уже написано, что она «finishes before the named root opens its context» |
| `reminders.ts:374` (`createContentAccessGrant`) | выражение в `VALUES` — но корень на ту же таблицу **уже существует** (`app.integrator_upsert_content_access_grant`, зовётся из `writeReminderProjectionDirect.ts:141` вне транзакции) |
| `writePort.ts:517,567,676` | **настоящий барьер:** чтение-после-записи в одной транзакции. Читается строка, записанная этой же незакоммиченной транзакцией. Ни вынести вперёд, ни прочитать со второго соединения нельзя |

Рекомендация — §6. Ответ на вопрос «структурная стена или дисциплина» — §7.

---

## 1. Барьер по коду: где он выражен, построчно

Слоёв **четыре**, и они независимы. Разбирать «барьер» как одну вещь — ошибка: три слоя снимаются правкой
одной строки, четвёртый не снимается никак.

### Слой 1 — прикладной `throw` (`apps/integrator/src/infra/db/runIntegratorSql.ts:51-54`)

```ts
const withSession = db as DbPort & { integratorDrizzle?: IntegratorDrizzleDb };
if (withSession.integratorDrizzle) {
  throw new Error('Integrator named root must start before the relation transaction');
}
```

Это ЕДИНСТВЕННОЕ место, где живёт сообщение из §4 оракула. `integratorDrizzle` выставлен только у
tx-порта (`client.ts:163`), поэтому проверка означает буквально «мы внутри `db.tx`». База об этом ничего
не знает.

**Важно для оценки вариантов:** ветка `else` этой же функции зовёт `db.query(...)`, а `db.query`
(`client.ts:132`) идёт через `withIntegratorPoolClient` → `withPortContextTransaction`, то есть **берёт
СВОЙ checkout из пула и открывает СВОЮ транзакцию**. Убрать `throw` технически достаточно, чтобы корень
заработал внутри открытой транзакции — на втором соединении. Цена этого — §4, вариант B.

### Слой 2 — один контекст на транзакцию, обеспечен PRIMARY KEY

`deploy/postgres/port-context/contract.sql:122-141`:

```sql
CREATE TABLE IF NOT EXISTS app_ext.accepted_port_contexts (
  database_oid oid NOT NULL, backend_pid integer NOT NULL, transaction_id xid8 NOT NULL,
  ...
  PRIMARY KEY (database_oid, backend_pid, transaction_id)
);
```

`app.install_port_context` (`contract.sql:431-434`) вставляет строку с `pg_current_xact_id()` и ловит
конфликт:

```sql
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context already installed for transaction';
```

`app.clear_port_context` (`contract.sql:436-444`) **намеренно не удаляет строку**, а проставляет
`cleared_at` — и комментарий выше (`contract.sql:234-238`) прямо называет это частью стены: «the surviving
row is what makes the primary key reject a second `install_port_context` in the same transaction … and that
one-context-per-transaction rule is part of the wall».

Поэтому `app.begin_port_context` (`contract.sql:466-473`), который делает `clear → install → SET LOCAL ROLE`,
внутри уже открытой транзакции отказывает на `install`, а не на `clear`.

`pg_current_xact_id()` — идентификатор ВЕРХНЕЙ транзакции: `SAVEPOINT` не даёт нового (замер P2, §2.2).
Значит подтранзакция обойти слой 2 не может.

### Слой 3 — гейты требуют РАЗНЫЕ строки контекста для реляции и для корня

Реляционная работа гейтится ограничительной политикой `rev10_context_gate_N`
(`deploy/postgres/privileges/declaration.ts:7889-7900`):

```ts
const ordinaryPredicate = `(SELECT app.require_accepted_context(current_user::name, current_user::name,
  ${REV10_CONTEXT_ROLE_CLASS}, 'relation', ${REV10_EMPTY_TYPED_ARGS_HASH}, NULL::regprocedure))`;
```

то есть требует строку с `purpose='relation'`, `function_identity IS NULL`, пустым хешем аргументов и
`target_role = current_user`.

Тело именованного корня требует ДРУГУЮ строку — с `purpose = '<имя двери>'`, конкретным
`function_identity` и `typed_args_hash` РОВНО этих аргументов. Пример из живого тела R3 на DEV:

```sql
PERFORM app.require_accepted_context('app_seam_identity_lookup_owner'::name, 'app_integrator_request'::name,
  'tenant_service'::app.port_context_class, 'integrator.platform-user-delivery-identity.read',
  app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]),
  'app.integrator_read_platform_user_delivery_identity(text)'::regprocedure);
```

Обе проверки (`app.require_accepted_context`, `contract.sql:495-520`) матчатся по
`transaction_id = pg_current_xact_id()`. Две разные строки на один `xid` — запрещено слоем 2. **Вот из чего
складывается «структурность» барьера: не из одного правила, а из пересечения PK и требования разных строк.**

Класс контекста политика вычисляет ИЗ `current_user` фиксированным `CASE`
(`declaration.ts:7884`, `REV10_CONTEXT_ROLE_CLASS`) — `app_integrator_request` там жёстко отображён в класс
`integrator`, `app_tenant_service` — в `tenant_service`. Это подтверждает вывод оракула §4 о невозможности
«просто перецелить возможность».

### Слой 4 — EXECUTE на сам порт выдан только логин-роли

Измерено пробой P1 (§2.1): после `SET LOCAL ROLE app_tenant_service` вызов `app.begin_port_context` отвечает
`permission denied for function begin_port_context`. Порт открывается только из логин-роли; чтобы вообще
попробовать второй контекст, нужно сначала `RESET ROLE`.

---

## 2. Живые замеры на DEV (всё в откаченных транзакциях)

Метод: `SET SESSION AUTHORIZATION bcb_dev_integrator` — иначе `install_port_context` отвергает claims по
`cap.session_login <> session_user`. Это ровно та же названная подстановка, что и в отчёте-оракуле, и она
названа здесь, а не спрятана. Фикстура: организация `a0000000-…-0001`, `integrator_user_id` 126,
telegram `957924152`. Скрипты проб — `/tmp/d17probe/*.sql`.

Три корня D17 на DEV **уже приземлены** (`app.integrator_read_channel_binding_identity(text,text,text)`,
`app.integrator_read_platform_user_delivery_identity(text)`,
`app.resolve_active_organization_for_channel_binding(text,text)`, все — владелец
`app_seam_identity_lookup_owner`, все `SECURITY DEFINER`), их capability-строки есть в
`app_ext.port_context_capabilities`. Поэтому пробы ниже — по НАСТОЯЩИМ объектам, а не по материализованным
из файла миграции.

### 2.1 P1 — второй контекст из целевой роли: отказ на EXECUTE

```
BEGIN; SET SESSION AUTHORIZATION bcb_dev_integrator;
begin_port_context(tenant_service/relation)      → ok, current_user = app_tenant_service, xid = 62264539
begin_port_context(R1 named root)                → ERROR: permission denied for function begin_port_context
ROLLBACK
```

### 2.2 P2 — `SAVEPOINT` не даёт новой транзакции

```
BEGIN; pg_current_xact_id() = 62264541
SAVEPOINT s1; pg_current_xact_id() = 62264541 (и после принудительного назначения subxid — то же)
ROLLBACK
```
**Вывод:** «сделать корень в подтранзакции» невозможно в принципе, а не «не реализовано».

### 2.3 P4b — второй контекст после `RESET ROLE`: отказ на PRIMARY KEY

```
BEGIN; SET SESSION AUTHORIZATION bcb_dev_integrator;
begin_port_context(tenant_service/relation)  → ok
RESET ROLE;                                  → current_user = bcb_dev_integrator
begin_port_context(R1 named root)            → ERROR: port context already installed for transaction
   CONTEXT: install_port_context line 73 → begin_port_context line 4
ROLLBACK
```
**Это и есть барьер в чистом виде.** Слой 2, без примесей.

### 2.4 P9/P10/P11 — контекст в транзакции ВСЁ-ТАКИ меняется, и это не дыра

`SET CONSTRAINTS ALL IMMEDIATE` заставляет отложенный триггер
`accepted_port_contexts_expire_at_commit` (`contract.sql:246-251`) сработать сразу и удалить строку —
PK освобождается.

**P10** — после `SET CONSTRAINTS ALL IMMEDIATE` прежний контекст действительно мёртв (fail-closed):
```
count(*) FROM public.org_enrollments  ДО  → 236
count(*) FROM public.org_enrollments ПОСЛЕ → ERROR: accepted organization context required
```

**P9** — одного `SET CONSTRAINTS ALL IMMEDIATE` НЕ хватает: режим остаётся IMMEDIATE до конца транзакции,
поэтому и НОВАЯ строка удаляется сразу после вставки. Контекст ставится, роль меняется, а гейт корня всё
равно отвечает `accepted port context required`. Комментарий в `contract.sql:243-245` («fail-closed, no way
to keep a context alive past COMMIT») подтверждён замером.

**P11** — а вот пара `SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;` возвращает отложенность,
и обмен проходит полностью:
```
BEGIN; SET SESSION AUTHORIZATION bcb_dev_integrator;
ctx1 = tenant_service/relation      → SELECT count(*) FROM public.org_enrollments = 236
RESET ROLE; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
ctx2 = R3 named root                → current_user = app_integrator_request
   SELECT * FROM app.integrator_read_platform_user_delivery_identity('126') → +79060432251 | 126
RESET ROLE; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
ctx3 = tenant_service/relation      → current_user = app_tenant_service, count(*) = 236
pg_current_xact_id() = 62265532 — ОДИН И ТОТ ЖЕ на всех трёх шагах
ROLLBACK
```

**Что это значит и чего НЕ значит.** Это НЕ повышение привилегий: `app.install_port_context` каждый раз
заново сверяет capability с `session_user` и зовёт `app_ext.assert_port_context_claim`; выйти за пределы
объявленного набора возможностей логина нельзя (P15: выдуманная организация → `port context organization
claim is not a known organization`). Но это значит, что **«один контекст на транзакцию» не является стеной
ПРОТИВ ЛОГИНА** — это дисциплина порядка, а не containment. Настоящая стена против логина — членство роли
и набор capability-строк.

### 2.5 P14 — смена роли внутри транзакции ничем не ограничена

```
current_user = app_tenant_service → SET LOCAL ROLE app_integrator_request → current_user = app_integrator_request
(session_user всё это время bcb_dev_integrator)
```
`SET ROLE` проверяется против `session_user`, а `bcb_dev_integrator` — член обеих ролей. Никакого
«переход роли внутри транзакции запрещён» нет.

### 2.6 P12/P13/P16 — ширина двери, которую D17 хочет закрыть, в числах

Реляционный трафик под классом `integrator` не поедет — не из-за политик, а раньше:
```
P12: контекст integrator/app_integrator_request/relation ставится (iuid=126, org=…0001),
     SELECT count(*) FROM public.org_enrollments → ERROR: permission denied for schema public
```
`app_integrator_request` не имеет даже USAGE на схему `public`. Замер прав:

| роль | USAGE на `public` | таблиц `public` с любым SELECT | таблиц `integrator` с любым SELECT |
|---|---|---|---|
| `app_tenant_service` | да | **42 из 207** | 1 из 6 |
| `app_integrator_request` | **нет** | 0 из 207 (недостижимы) | 2 из 6 |
| `app_integrator_resolver` | нет | 0 | 0 |

P13 под tenant_service: `platform_users` 235 строк (в таблице 304), `org_enrollments` 236 (из 239),
`integrator.user_reminder_occurrences` 2602. RLS сужает до организации — но не до цели.

**P16 — и клинику эта дверь не доказывает, а НАЗЫВАЕТ:** тот же логин с тем же capability назвал ДРУГУЮ
существующую организацию `d0000000-…-0004` и получил её 6 строк `platform_users`. Для класса
`tenant_service` `assert_port_context_claim` проверяет только, что организация существует. Это по
построению (интегратор — служба, а не арендатор), но это и есть точная цена невыполненного D17:
**42 таблицы `public` с ПДн, любая клиника по выбору вызывающего, без сужения по цели.**

---

## 3. Три места §4 — что там на самом деле (по коду)

**(1) `writeReminderRulesDirect.ts:137-159` — барьера нет.** Обёртка `db.tx` там read-only, и её
собственный комментарий (строки 136-137) гласит: «Read-only, so it keeps its own bounded transaction and
finishes before the named root opens its context». Оба чтения внутри (`collectPlatformUserCandidates`,
`resolveExactActiveOrganizationId`) — кандидаты в корни, а сама транзакция после этого не нужна. Второй
предполагаемый вход, `resolvePlatformUserIdForActor` (`resolveDirectPublicActor.ts:57`), живых вызывающих
не имеет: `grep -rn "resolvePlatformUserIdForActor" apps/integrator/src --include=*.ts` вне тестов даёт
только собственное определение.

**(2) `reminders.ts:374` `createContentAccessGrant` — барьер снимаемый.** Выражение
`organizationIdForIntegratorUserSql` (`reminders.ts:22-36`) первым делом делает
`COALESCE(getCurrentOrganizationPrincipalId(), <SQL-поиск>)` — то есть в живом организационном маршруте
организация УЖЕ известна в процессе, а SQL-ветка — фолбэк. Вызывающий один: `writePort.ts:725`, внутри
`db.tx`. На эту же таблицу уже есть корень `app.integrator_upsert_content_access_grant(...)`
(capability `integrator.content-access-grant.upsert`), который зовётся из
`writeReminderProjectionDirect.ts:141` БЕЗ транзакции. Паттерн «вся запись — один корень» здесь уже
применён соседом.

**(3) `writePort.ts:517, 567, 676` — настоящий барьер.** Форма всюду одна:
```ts
const directInput = await db.tx(async (txDb) => {
  await markReminderOccurrenceSent(txDb, occurrenceId, channel);      // ЗАПИСЬ
  const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);  // ЧТЕНИЕ ТОГО ЖЕ
  ...
});
```
Чтение обязано увидеть незакоммиченную запись этой же транзакции. Вынести вперёд нельзя (данных ещё нет);
прочитать со второго соединения нельзя (READ COMMITTED не видит чужую незакоммиченную транзакцию);
подтранзакцией не обойти (P2). Тот же класс — `reminders.ts:220` внутри
`expireOrphanedPendingReminderOccurrences`.

---

## 4. Все разумные варианты, включая те, что мне не нравятся

### A. Транзакция объявляет свою дверь на входе (один контекст, но «широкий»)
Транзакция при `BEGIN` ставит контекст класса корня и внутри зовёт только этот корень.
*Что меняется:* ничего в контракте — это уже сегодня возможно.
*Что становится невозможным:* реляционная работа в этой транзакции — политика `rev10_context_gate_N`
требует `purpose='relation'` и `function_identity IS NULL`; с корневым контекстом обычные таблицы закрыты
(проверять пробой не пришлось: это прямое следствие §1 слой 3 и подтверждено формой предиката).
Плюс `typed_args_hash` привязан к КОНКРЕТНЫМ аргументам — контекст, объявленный на входе, годится ровно
для одного вызова с ровно этими аргументами (в отчёте-оракуле это проба P6′).
*Правится мест:* 0.
*Вердикт:* **не решает задачу.** Годится только там, где транзакция вырождается в один корень — то есть
это подмножество варианта E.

### B. Убрать `throw`: корень идёт по ВТОРОМУ соединению (autonomous transaction)
*Что меняется:* удаляется `runIntegratorSql.ts:51-54`; корень получает свой checkout и свою транзакцию
(механика уже написана — `client.ts:132` → `withIntegratorPoolClient` → `withPortContextTransaction`).
*Что становится невозможным:* корень не видит незакоммиченных данных внешней транзакции — то есть **место
(3) §3 не чинится вообще**, и это тихий отказ: корень вернёт 0 строк, а не ошибку.
*Новая поверхность ошибки:* (а) **исчерпание пула и самоблокировка.** `max: 5`
(`integratorPoolProvider.ts:118`); при 5 одновременных открытых транзакциях шестой checkout ждёт вечно —
ровно механика уже случавшегося отказа входа из-за невозвращённого соединения. (б) блокировки: корень
читает строки, которые внешняя транзакция могла заблокировать → ожидание внутри собственного ожидания.
(в) атомарность рвётся: корень коммитится независимо, откат внешней транзакции его не отменяет.
*Обратим:* да, тривиально.
*Правится мест:* 1 строка + режим пула.
*Вердикт:* дёшево и опасно. Годится только для ЧИСТО ЧИТАЮЩИХ корней вне пути записи. Для мест (3) —
нет.

### C. Несколько принятых контекстов на транзакцию (расширить PK)
`PRIMARY KEY (database_oid, backend_pid, transaction_id)` → добавить `capability_id`; `require_accepted_context`
и `require_attested_context_for_roles` уже написаны как `EXISTS(...)`, они переживут несколько строк.
*Что меняется в контракте порта:* «принятый контекст один на транзакцию» перестаёт существовать как
инвариант. Ломается сознательное решение из `contract.sql:234-238`.
*Что становится невозможным:* нечего назвать — это чистое ослабление.
*Новая поверхность ошибки:* аксессоры `app.current_org_id()`, `app.current_actor_user_id()`,
`app.current_integrator_user_id()` (`contract.sql:571-608`) написаны как `SELECT … INTO value FROM
accepted_port_contexts WHERE <xid> …` без `LIMIT` — при двух строках это `SELECT INTO` с несколькими
результатами (plpgsql возьмёт первую произвольную). Правится не одна таблица, а весь набор аксессоров и
их семантика «текущая организация». Это самая широкая правка из всех, и она задевает ВЕБАПП, у которого
свой порт на том же шве.
*Обратим:* миграцией — да; но код, написанный под многоконтекстность, назад не свернётся.
*Правится мест:* 1 PK + ≥6 аксессоров + оба порта + декларация + вся тестовая база шва.
*Вердикт:* **дороже всех и ослабляет ровно тот инвариант, ради которого шов построен.** Не рекомендую.
Отдельно отмечу: как показала проба P11 (§2.4), фактически многоконтекстность УЖЕ достижима — значит этот
вариант не покупает новой способности, он только легализует её и убирает fail-closed.

### D. Вынести чтение ДО открытия транзакции
*Что меняется:* ничего в контракте; чтение делается корнем, результат передаётся аргументом.
*Где применимо:* места (1) и (2) §3 — полностью. Место (3) — **нет**: читается собственная запись.
*Новая поверхность ошибки:* окно между чтением и записью (TOCTOU): организация/владелец могли измениться.
Для мест (1) и (2) это неопасно — оба значения по смыслу стабильны на длине запроса, и место (2) в живом
организационном маршруте берёт организацию вообще из принципала, а не из базы.
*Обратим:* да.
*Правится мест:* 2 файла, ~2 функции.
*Вердикт:* **правильный ответ для (1) и (2).**

### E. Транзакция САМА становится корнем (запись+чтение в одном теле)
`db.tx { write; read }` → один `SECURITY DEFINER`-корень, который делает и запись, и возврат контекста
проекции. Открытой реляционной транзакции не остаётся — снимать барьер не нужно, он исчезает.
*Что меняется в контракте порта:* ничего. Это ровно тот приём, которым уже переведены соседи:
`app.record_reminder_occurrence_finalized_projection(...)`, `app.integrator_upsert_content_access_grant(...)`,
`app.integrator_upsert_reminder_rule(...)` — все в каталоге DEV, все зовутся вне транзакции.
*Что становится невозможным:* произвольная композиция шагов на стороне Node — последовательность
фиксируется в теле корня. Это цена и одновременно смысл.
*Новая поверхность ошибки:* стена арендатора переезжает в тело корня и должна быть выписана там дословно
(как уже сделано в R1/R3), иначе корень ШИРЕ прежнего чтения; ошибка тут не громкая, а тихо-расширяющая.
Против неё есть готовый приём из отчёта-оракула — инъекция неисправности с обязательной проверкой
попадания подстановки.
*Обратим:* корень удаляется миграцией; код возвращается к `db.tx` — да, обратим.
*Правится мест:* 3 корня (finalize-sent / finalize-failed / delivery-logged могут стать ОДНИМ корнем с
параметром — три места отличаются только видом финализации) + `expireOrphaned…` + `createContentAccessGrant`
уходит на существующий корень.
*Вердикт:* **единственный вариант, который чинит место (3).**

### F. Оставить членство — осознанный отказ от D17(в)
*Что меняется:* ничего.
*Цена, измеренная:* §2.6 — 42 таблицы `public` (включая `platform_users`, `user_contacts`,
`user_channel_bindings`), клиника выбирается вызывающим из списка существующих, сужения по цели нет.
*Вердикт:* честный вариант, если ведущий решит, что D17 не окупается сейчас. Но тогда это надо записать
как решение с этой цифрой, а не как «не успели».

### G. `dblink` / `pg_background` — автономная транзакция внутри БД
`dblink` и `postgres_fdw` на DEV **доступны, но не установлены** (`pg_extension`: `btree_gist`, `pgcrypto`,
`plpgsql`). Семантика та же, что у B (отдельная транзакция, не видит незакоммиченного), плюс новая
поверхность: вторая аутентификация внутри БД мимо mTLS-контракта порта. **Не рекомендую даже
рассматривать** — это дверь в обход `render-host-mtls-hba`.

### H. Дать корню ветку гейта, принимающую РЕЛЯЦИОННЫЙ контекст
Тело корня ветвится: если принят контекст `purpose='relation'`/`app_tenant_service` — считать его
достаточным.
*Что теряется:* привязка к точным аргументам (`typed_args_hash` реляционного контекста — пустой) и к
`function_identity`. Транскрипт вызова исчезает.
*Главное:* транзакция при этом ПО-ПРЕЖНЕМУ идёт под `app_tenant_service`, то есть **членство не снимается,
и цель D17 не достигается**. Вариант мёртв по постановке, привожу для полноты.

---

## 5. Как это решают взрослые системы

Норма индустрии для «принципал на транзакцию» в Postgres+RLS — ровно то, что здесь уже построено, и
дальше неё индустрия не идёт:

- **Контекст ставится `SET LOCAL` / `set_config(..., true)` внутри явной транзакции и умирает на COMMIT.**
  Это прямо рекомендуемый паттерн; главная описанная ошибка — забыть `LOCAL`, тогда значение переживает
  запрос и следующий клиент из пула наследует чужого арендатора. Здесь эта ошибка невыразима: контекст
  живёт строкой в таблице, привязанной к `pg_current_xact_id()`, и удаляется отложенным триггером на
  COMMIT.
- **Transaction pooling обязателен, statement pooling с RLS запрещён** — сессионная переменная теряется
  или перемешивается между операторами. Здесь пул — сессионный на checkout, транзакция целиком на одном
  клиенте (`withPortContextTransaction`), и checkout при любой ошибке уничтожается, а не возвращается.
- **«Connection pinning»** в индустрии означает «одна транзакция = один физический бэкенд = один
  арендатор», и цена этого — именно исчерпание пула при вложенных checkout'ах. Это ровно риск варианта B.
- **Автономных транзакций в PostgreSQL нет.** Их эмулируют `dblink`/`pg_background` — вторым соединением,
  которое коммитится независимо от основной транзакции. То есть индустрия подтверждает: «прочитать
  привилегированно изнутри своей транзакции и увидеть её незакоммиченное» — нельзя ничем.
- **`SET ROLE` внутри транзакции разрешён** (в отличие от стандарта SQL) и проверяется против членств
  сессионного пользователя; **внутри `SECURITY DEFINER`-функции — запрещён**, что и объясняет, почему
  `app.begin_port_context` вынесен отдельной `SECURITY INVOKER`-обёрткой (это выписано в
  `contract.sql:453-458` и подтверждается документацией).

**Чего в индустрии НЕТ и что здесь есть:** привязки контекста к `function_identity` + хешу типизированных
аргументов. Обычный «tenant GUC» отвечает на вопрос «кто», здесь контекст отвечает ещё и «зачем и с чем».
Именно эта добавка и делает невозможным «один контекст на реляцию и корень сразу» — общего контекста,
годного и туда и туда, по построению не существует. Это не недоработка, это цена узкой двери.

Sources:
- [Postgres RLS for Multi-Tenant SaaS, the Production Pattern](https://theroadtoenterprise.com/blog/postgres-rls-multi-tenant-saas)
- [Postgres Row-Level Security for Multi-Tenancy: The Pattern and the Footguns](https://patotski.com/blog/postgres-row-level-security-multi-tenant/)
- [Why tenant context must be scoped per transaction](https://dev.to/m_zinger_2fc60eb3f3897908/why-tenant-context-must-be-scoped-per-transaction-3aop)
- [PostgreSQL: Documentation — SET ROLE](https://www.postgresql.org/docs/current/sql-set-role.html)
- [Implementing Autonomous Transactions in Postgres — CYBERTEC](https://www.cybertec-postgresql.com/en/implementing-autonomous-transactions-in-postgres/)
- [Autonomous transaction support in PostgreSQL — Dalibo](https://blog.dalibo.com/2016/08/19/Autonoumous_transactions_support_in_PostgreSQL.html)

---

## 6. Рекомендация одним абзацем — и чем я готов пожертвовать

**Барьер снимать не нужно; нужно убрать транзакцию.** Рекомендую вариант **E + D**: места (1) и (2)
переводятся вынесением чтения вперёд (вариант D, ~2 файла), а три места `writePort.ts:517/567/676` вместе с
`expireOrphanedPendingReminderOccurrences` сворачиваются в ОДИН корень «финализировать вхождение напоминания
и вернуть контекст проекции» с параметром вида финализации — по образцу уже живущих
`app.record_reminder_occurrence_finalized_projection` и `app.integrator_upsert_content_access_grant`, а
`createContentAccessGrant` уезжает на УЖЕ существующий корень. Ни `runIntegratorSql.ts:51-54`, ни PK
`accepted_port_contexts` при этом не трогаются: `throw` перестаёт срабатывать не потому, что его сняли, а
потому, что открытой реляционной транзакции под организационным принципалом не остаётся. **Чем жертвую,
называю прямо:** (1) свободой композиции на стороне Node — порядок «записать, потом прочитать контекст»
переезжает в тело корня, и изменить его впредь можно только миграцией, а не правкой TypeScript; (2) ~4
новыми `SECURITY DEFINER`-телами, в каждом из которых стену арендатора надо выписать дословно, и это самая
опасная часть работы — забытый предикат расширяет доступ ТИХО (страховка обязательна: инъекция неисправности
с проверкой попадания подстановки, как в §3 отчёта-оракула, «до» и «после» на чужой клинике); (3) тем, что
работа получается заметно больше «перевода читателей» — это отдельный этап плана, а не хвост D17, и я
предлагаю ведущему завести его как таковой, а не дописывать в идущий пункт.

**Явно отвергаю:** вариант C (расширение PK) — он ослабляет единственный инвариант шва и, судя по P11,
не покупает даже новой способности; вариант B в путях записи — он молча вернёт 0 строк там, где сегодня
громко падает; вариант G — обход mTLS-контракта.

---

## 7. Делает ли выбранный вариант стену СТРУКТУРНОЙ

**Да — и это главный аргумент за E+D, сильнее, чем стоимость.**

Разберу по критерию «можно ли забыть»:

| вариант | что должен ПОМНИТЬ пишущий, чтобы стена держала |
|---|---|
| **E + D (рекомендуемый)** | **ничего.** После перевода у логина не остаётся членства в `app_tenant_service`; `SET LOCAL ROLE app_tenant_service` отвергнет сама база. Забыть невозможно: нет роли — нет двери. Новый реляционный код под организационным принципалом не «сработает шире, чем надо», а **не запустится вообще** |
| C (несколько контекстов) | помнить, какой контекст ставить и не поставить широкий «на всякий случай». Членство остаётся → дверь остаётся. **Дисциплина** |
| B (второе соединение) | помнить, что корень не видит своей же незакоммиченной записи. Членство остаётся. **Дисциплина, причём с тихим отказом** |
| H (ветка гейта) | членство остаётся по построению. **Дисциплина** |
| F (не снимать) | стены нет вовсе |

Оговорка, которую обязан назвать, иначе это будет обещание, а не вывод: **структурной стена станет только
в момент `REVOKE app_tenant_service FROM bcb_*_integrator`,** а не в момент перевода последнего читателя.
Пока членство есть, всё остальное — узкие двери рядом с открытой широкой. И обратно: как только членства
нет, «один контекст на транзакцию» перестаёт быть частью стены и остаётся тем, чем и является по замеру
P11 — правилом порядка. Поэтому приёмка D17(в) должна проверять не «читатели переведены», а ровно два
факта: `pg_auth_members` не содержит пары `bcb_*_integrator → app_tenant_service`, и
`app_ext.port_context_capabilities` не содержит строки `session_login='bcb_*_integrator',
target_role='app_tenant_service'`. Первое без второго — полстены: capability-строка без членства мертва,
но она вернёт дверь к жизни в тот день, когда членство кто-нибудь выдаст обратно.

---

## НЕ СДЕЛАНО

- **Кода не писал, миграций не заводил, ничего не чинил** — это исследование, границы брифа соблюдены.
  `--execute` не запускался, TEST и прод не тронуты, `push` не делался. Правка в репозитории одна — этот файл.
- **Вариант E не прототипирован** — тело сводного корня не написано и не проверено; оценка «один корень с
  параметром на три места» сделана по форме трёх блоков `writePort.ts`, а не измерена реализацией.
- **Не проверял пробой** утверждение §4-A о том, что при корневом контексте закрыта реляционная работа —
  вывел из формы предиката `rev10_context_gate_N` и слоя 3. Называю это выводом, а не замером.
- **Не мерил ширину двери на TEST и проде** — цифры §2.6 сняты с DEV; на других базах число таблиц может
  отличаться.
- **Побочная находка, НЕ чинил и в задачу не превращаю (AGENTS.md, «аудит — гейт, не источник работы»):**
  на DEV у `app_seam_identity_lookup_owner` нет EXECUTE на `app.integrator_context_installed()`, из-за чего
  корень `app.integrator_read_channel_binding_identity` падает `permission denied for function
  integrator_context_installed` (пробы P5b/P7). В декларации грант объявлен
  (`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:850`), то есть это расхождение приземлённого
  DEV с артефактом после миграции `20260822T190000`, а не дефект кода. Ведущему — на заметку перед живой
  приёмкой второй двери, не мне в работу.
- **Второй исследователь** работает над тем же вопросом независимо; его отчёт я не искал и не сверялся.
