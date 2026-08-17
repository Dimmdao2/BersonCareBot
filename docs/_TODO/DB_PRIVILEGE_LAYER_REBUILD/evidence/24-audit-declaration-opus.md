> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# evidence/24 — НЕЗАВИСИМЫЙ АДВЕРСАРНЫЙ АУДИТ декларации (Opus)

**Что проверялось:** `deploy/postgres/privileges/declaration.ts` (1867 строк) + `types.ts` (478 строк)
на коммите `89759ee08` («декларация 4893 → 1867 строк, грамматика вынесена в types.ts»).
**Против чего:** `docs/OWNER_DECISIONS.md` §«Права БД, роли и стены (владелец, 08.08)» — норма
классификации и критерий приёмки; `PLAN.md` — чек-лист владельца; `SCHEME.md`; `FACTS.md` (§9
опровергнутое и §10 неверные числа не переоткрывались).
**Режим:** только чтение. Ни одной DDL/DML/записи в БД. Изменён ровно один файл — этот.

> Это **гейт-отчёт, а не список задач.** Находка, под которую нет строки в план-файле владельца,
> помечена как **ВОПРОС ВЛАДЕЛЬЦУ**, а не как работа.

---

## 0. Покрытие — что реально проверено и чем

Проверено **478 записей таблиц = 239 строк × 2 объявленные базы**, каждая по всем полям, плюс все
верхние секции файла. Ниже — по видам проверок; команды приведены при каждой находке.

| Проверка | Объём | Инструмент |
|---|---|---|
| Сжатие не потеряло решение | **478/478** записей + верхние секции | загрузка обеих версий в Node, структурная сверка поле-за-полем |
| SQL генератора до/после сжатия | 4 артефакта × 2 базы | прямой вызов `generatePrivilegesSql` / `generateOrgAllowlistSql` на обеих версиях |
| Существование таблицы | 239 объявленных × 2 базы против 228 живых в каждой | `pg_class` |
| Колонка `organization_id` | 150 строк с проставленным `org` + все 228 живых | `pg_attribute` |
| Флаги RLS/FORCE | 228 × 2 базы | `pg_class.relrowsecurity/relforcerowsecurity` |
| Владелец таблицы | 228 × 2 базы | `pg_class.relowner` |
| Гранты | **весь `relacl`** всех 228 таблиц × 2 базы + `attacl` колонок | `pg_class.relacl`, `pg_attribute.attacl` |
| Политики | 285 (dev) / 283 (TEST) | `pg_policies`, `pg_policy` |
| Definer-исключения | 11 `proconfigExceptions` + 5 `ownershipExceptions` × 2 базы | `pg_proc` |
| Объёмы строк | 10 таблиц | **`count(*)`**, не `reltuples` (G11) |
| Ссылки на код в «зачем» | 17 путей + 5 конкретных мест дословно | `code-search.mjs`, затем чтение файла |

**Чего НЕ проверял, честно:** тела 283 живых политик построчно (сверял их наличие/цель/`TO PUBLIC`,
а не семантику каждого предиката); поведенческий прогон «сессия без принципала → SELECT по каждой
таблице» (это Ф5-стенд, а не аудит файла); объёмы трёх таблиц, к которым у доступного логина нет
прав (`outgoing_delivery_queue` на TEST, `app.context_nonce_ledger`, `integrator.*` на TEST).

**Важная методическая оговорка.** Первая попытка снять гранты через
`information_schema.role_table_grants` дала на TEST заведомо ложную картину («43 из 46 отзывов —
фантомы»): эта вью фильтруется по текущей роли и под чужим логином почти пуста. Все числа по грантам
в отчёте пересняты с `pg_class.relacl` / `pg_attribute.attacl`, которые не фильтруются.

Базы: `bcb_webapp_dev` (креды — `DATABASE_URL` из `./.env`) и локальная `bersoncarebot_test` — та
самая, на которой снималась перепись `evidence/13`. `bcb_webapp_prod`, `secondbrain`, `storylama_*`
не открывались ни разу.

```bash
set -a && . ./.env; set +a
psql "$DATABASE_URL" -Atq -c "set default_transaction_read_only=on" -c "<запрос>"
```

---

## 1. Расхождения — по убыванию тяжести

### Р1 · КРИТИЧНО · Поле `revoke` не превращается ни в одну строку SQL, а логины выпадают из отзыва целиком

**Декларация говорит:** 42 таблицы несут `revoke` — 46 пар «таблица × роль», у каждой обоснование
(README: «живые гранты, которые модель СНИМАЕТ, с причиной»). Семь пар названы на ЛОГИН-роли:

```
public.be_organization_members             bcb_test_integrator_login
public.be_organization_members             bcb_test_nonstaff_login
public.be_specialist_service_availability  bcb_test_nonstaff_login
public.be_specialists                      bcb_test_nonstaff_login
public.platform_users                      bcb_test_integrator_login
public.platform_users                      bcb_test_nonstaff_login
public.user_phone_history                  bcb_test_nonstaff_login
```

**Реальность говорит:** генератор поле `revoke` не читает вообще. Список отзыва строится так:

```
generate.mjs:428   const revokeTargets = (owner) => managed.filter((r) => r !== owner);
generate.mjs:118   managedRoleNames = Object.entries(declaration.cluster.roles)
                     .filter(([, decl]) => decl.kind !== 'superuser')
```

— то есть **только `cluster.roles`**. Логины живут в `envMapping`, а в `cluster.roles` их нет:

```bash
node --experimental-strip-types -e "import('./deploy/postgres/privileges/declaration.ts').then(m=>{
  const r=m.declaration.cluster.roles;
  console.log('ролей',Object.keys(r).length,'| login:true →',Object.keys(r).filter(k=>r[k].login));})"
# ролей 20 | login:true → [ 'postgres' ]      ← и postgres отфильтрован как superuser
```

Второй применитель, `renderEnvSql()` (`generate.mjs:847-905`), логины создаёт, ставит пароль,
членство, CONNECT и `rolconfig` — и **ни одного `REVOKE` на таблицу, последовательность или функцию
не эмитит**. Это видно и в закоммиченном пруф-артефакте: во всём
`fixtures/generated/privileges.bcb_privproof.sql` слово `_login` встречается ровно один раз, и то в
комментарии:

```bash
grep -n "_login" deploy/postgres/privileges/fixtures/generated/privileges.bcb_privproof.sql
# 111:-- CONNECT bcb_proof_staff_login: логин — статья в env-рендере (§A.1/§D.1).
grep -n "REVOKE ALL PRIVILEGES ON TABLE" deploy/postgres/privileges/fixtures/generated/privileges.bcb_privproof.sql
# 152:… FROM "app_migration_phase", "app_owner", "app_patient", "app_staff";   ← только кластерные роли
```

Пруф-фикстура `proof-declaration.ts` вообще не содержит ни одной записи `revoke:` — то есть
доказательство `evidence/20` этот путь не проходило ни разу.

**Что стоит на TEST прямо сейчас** — 22 пары «таблица × логин» на 19 таблицах, из них **15 не
упомянуты в декларации ВООБЩЕ** (ни в `grants`, ни в `revoke`); 9 из 15 — на таблицах класса P:

```bash
psql "$TESTURL" -Atq -c "set default_transaction_read_only=on" -c "
 select n.nspname||'.'||c.relname, c.relacl::text from pg_class c
 join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and c.relacl::text ~ 'bcb_(test|saas)_' order by 1;"
# 19 таблиц; разбор relacl даёт 22 пары
```

```
integrator.idempotency_keys        bcb_test_integrator_login  DELETE,SELECT      не объявлено
integrator.message_drafts          bcb_test_integrator_login  SELECT        P    не объявлено
integrator.schema_migrations       bcb_test_integrator_login  SELECT             не объявлено
integrator.telegram_state          bcb_test_integrator_login  SELECT        P    не объявлено
public.be_branches                 bcb_test_nonstaff_login    SELECT             не объявлено
public.be_clinic_services          bcb_test_nonstaff_login    SELECT             не объявлено
public.be_external_entity_mappings bcb_test_nonstaff_login    SELECT             не объявлено
public.be_organizations            bcb_test_integrator_login  SELECT             не объявлено
public.org_enrollments             bcb_test_integrator_login  SELECT        P    не объявлено
public.platform_user_contacts      bcb_test_nonstaff_login    INS,SEL,UPD   P    не объявлено
public.support_conversations       bcb_test_integrator_login  SELECT        P    не объявлено
public.support_questions           bcb_test_integrator_login  SELECT        P    не объявлено
public.user_channel_bindings       bcb_test_integrator_login  SELECT        P    не объявлено
public.user_channel_bindings       bcb_test_nonstaff_login    SELECT        P    не объявлено
public.user_channel_preferences    bcb_test_integrator_login  SELECT        P    не объявлено
+ 7 пар, которые в декларации ОБЪЯВЛЕНЫ в `revoke` — но SQL для них не эмитится
```

Плюс **колоночные гранты ПДн логину** на `public.platform_users` (TEST):

```bash
psql "$TESTURL" -Atq -c "select a.attname, a.attacl::text from pg_attribute a
 join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname='platform_users' and a.attacl is not null order by 1;"
```
```
display_name / first_name / last_name / phone_normalized /
integrator_user_id / patient_phone_trust_at   {bcb_test_integrator_login=aw/…}   (INSERT+UPDATE)
updated_at                                     {bcb_test_integrator_login=w/…}
```

На dev по объёму хуже: `bcb_dev_runtime_staff_login` держит прямой табличный грант на **187 таблицах
из 228**, `bcb_dev_runtime_nonstaff_login` — на 12; в декларации не назван ни один.

**Почему это важно.** Критерий владельца — «любой запрос к базе данных **без контекста** и точного
совпадения разрешений выдаёт 0 строк». Приложение подключается ИМЕННО логином
(`DATABASE_URL_STAFF` = `bcb_dev_runtime_staff_login`). Вся модель декларации держится на том, что
логин `NOINHERIT` и до `SET ROLE` не имеет ничего. Прямой табличный грант логину эту конструкцию
обходит, и полное переприменение генератора его НЕ снимает — после «прихода в точку ноль» логин
останется ровно с тем, что имеет сегодня. Это и есть дефект И2 (`grant-to-login`), объявленный в
декларации на ОДНОЙ таблице (`platform_users`), а живущий на 19 (TEST) / 187 (dev).

Строки плана: Ф2 «Генератор: декларация → полный идемпотентный SQL прав» и Ф3 «REVOKE дефолтов».
Расхождение внутри существующих пунктов — не новый скоуп.

---

### Р2 · КРИТИЧНО · Ноль объявленных политик при `rls: force` на 222 таблицах, а генератор безусловно сносит все живые — это тихий ноль, прямо запрещённый критерием приёмки

**Декларация говорит:** `rls: 'force'` на 222 таблицах (плюс 3 явных `off` — журналы миграций — и
14 `n/a` под снос), и **ни одной строки `policies` ни на одной таблице ни в одной базе**:

```bash
node --experimental-strip-types -e "import('./deploy/postgres/privileges/declaration.ts').then(m=>{
 for(const db of Object.keys(m.declaration.databases)){const t=m.declaration.databases[db].tables;
 console.log(db,'| с policies:',Object.values(t).filter(x=>x.policies).length,
             '| rls=force:',Object.values(t).filter(x=>x.rls==='force').length);}})"
# bersoncarebot_test | с policies: 0 | rls=force: 222
# bcb_webapp_dev     | с policies: 0 | rls=force: 222
```

**Генератор говорит** (`generate.mjs:643-661`) — безусловно, на КАЖДОЙ таблице:

```
DO $bcb$ … FOR p IN SELECT policyname FROM pg_catalog.pg_policies
     WHERE schemaname=… AND tablename=… LOOP
       EXECUTE format('DROP POLICY %I ON %I.%I', …)
     END LOOP; … $bcb$;
<далее CREATE POLICY только для table.policies — их ноль>
```

**Реальность:**

```bash
psql "$TESTURL"      -Atq -c "select count(*) from pg_policies where schemaname<>'pg_catalog';"  # 283
psql "$DATABASE_URL" -Atq -c "select count(*) from pg_policies where schemaname<>'pg_catalog';"  # 285
```

Применение сгенерированного SQL сегодня = включить RLS+FORCE на 222 таблицах, снести все 283 живые
политики и не создать ни одной. Итог — **0 строк для всех ролей на всех таблицах, молча, без единой
записи в журнале.** Это дословно тот исход, который README самой декларации называет провалом:
«Тихий ноль с пустым журналом = FAIL».

**И это НЕ ловится гейтом.** Дисциплина файла заявлена как «пробелы декларации — ГРОМКИЙ ОТКАЗ, не
тихий пропуск», и она работает: `--gaps` даёт ровно 9 мест на каждую базу и отказывает в генерации.
Но `collectGaps` перебирает `(table.policies ?? [])` (`generate.mjs:217`) — **отсутствующий массив
даёт ноль пробелов**. Самый тяжёлый пробел, G8 («имена/тела политик»), — единственный, который НЕ
fail-closed:

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps
# по 9 пробелов на базу: functionsViews.views, 4× definer-ownership, 2× fullCountLive/todo…
# ни одного про политики
```

Живой пример этого исхода в базе уже есть — `integrator.message_drafts`: RLS on, FORCE on, **0
политик**, при этом `app_staff=arwd` и `app_patient=r`:

```bash
psql "$DATABASE_URL" -Atq -c "select relrowsecurity,relforcerowsecurity,
 (select count(*) from pg_policy p where p.polrelid=c.oid), relacl::text
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='integrator' and c.relname='message_drafts';"
# t|t|0|{…,app_staff=arwd/…,app_patient=r/…}
```

Роль с полным грантом читает ноль строк и не узнаёт, почему.

**Почему это важно.** Обе половины критерия владельца («0 строк» И «пишет ошибку в журнал») здесь
проваливаются одновременно, и провал не громкий. `ACCEPTANCE_INVARIANT.andLogs` адресует только три
context-аксессора; таблица без политики к ним отношения не имеет — она молчит на уровне движка.

Строки плана: Ф2 «Генератор … применяется деплоем» + Ф5, инвариант «нет RLS-таблиц без политик».
G8 в файле объявлен открытым — расхождение в том, что он не поставлен в один ряд с остальными
девятью по громкости отказа.

---

### Р3 · ВАЖНО · 11 из 14 строк `PENDING_REMOVAL` описывают таблицы, которых уже нет ни в одной базе; их `blockedBy` теперь ложны

**Декларация говорит:** 14 таблиц под сносом, у каждой `removal.{verdict, source, blockedBy}`, где
`blockedBy` читается как «почему ещё не снесли».

**Реальность:** 11 из них снесены коммитом-РОДИТЕЛЕМ аудируемого (`a3bb461d7`, «дроп-миграции на
8 оставшихся легаси-таблиц (11 из 11)») и отсутствуют в обеих базах:

```bash
Q="select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema','pg_toast');"
psql "$DATABASE_URL" -Atq -c "$Q"   # 228
psql "$TESTURL"      -Atq -c "$Q"   # 228   (объявлено 239 ⇒ 11 отсутствуют, одинаково в обеих)
```

Отсутствуют: `integrator.{contacts, content_access_grants, conversation_messages, conversations,
identities, message_retry_jobs, question_messages, telegram_users, user_questions,
user_reminder_rules, users}`. Живых таблиц, не объявленных в декларации, — **ноль** в обеих базах.

Ложные теперь `blockedBy`, например:

* `integrator.message_retry_jobs` — «10 строк pending — **не раньше 2026-08-29 17:00 MSK** (живая
  работа, удаление = потерянное сообщение человеку)». Таблицы нет.
* `integrator.identities` — «горячий путь каждого вебхука; `integrator.telegram_state` держит FK —
  дропать только после её урезания». Таблицы нет, FK нет.

Тип `Disposition` содержит `REMOVED`, и `TableRow.disp` позволяет его поставить — не поставлено.

**Почему это важно.** Ф2 требует «декларация заполнена из живого каталога». Файл написан ПОСЛЕ дропа
и живой каталог на этом месте не переснимал; читатель получает список блокировок, которых нет.

---

### Р4 · ВАЖНО · Секция `definerExceptions` базы `bcb_webapp_dev` — дословная копия переписи TEST; четыре числа не совпадают с живым dev

`PROCONFIG_EXCEPTIONS` и `OWNERSHIP_EXCEPTIONS` — одни и те же константы для обеих баз
(`declaration.ts:706` и `:781`). Для TEST они верны, для dev — нет.

```bash
Q="select pg_get_userbyid(p.proowner) o, count(*) from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname='app'
   group by 1 order by 2 desc;"
psql "$TESTURL" -Atq -c "$Q"; psql "$DATABASE_URL" -Atq -c "$Q"
```

| поле декларации | объявлено | живой TEST | живой dev |
|---|---:|---:|---:|
| всего SECURITY DEFINER в схеме `app` | 244 | **244 ✔** | **231 ✘** |
| `defaults.coveredCount` (`search_path=pg_catalog`) | 235 | **235 ✔** | **222 ✘** |
| владеет `app_owner` | 193 (следует из drift) | **193 ✔** | **132 ✘** |
| `drift` мигратора | роль `bersoncarebot_test`, 38 | **38 ✔** | роль **`bcb_webapp_dev_user`, 88**; у роли `bersoncarebot_test` в базе dev — **0 ✘** |
| `intentional.saas_telemetry_owner` | 7 | **7 ✔** | **5 ✘** |
| `intentional.saas_system_health_owner` | 4 | **4 ✔** | **4 ✔** |
| `intentional.app_web_push_reminder_discovery_definer` | 1 | **1 ✔** | **1 ✔** |
| `drift.app_platform_settings` | 1 | **1 ✔** | **1 ✔** |

Детектор пробелов подмену не видит: он сверяет «поимённо известно N против count=M», а не `count`
против каталога.

**Почему это важно.** Ф4 — «двусторонняя сверка на все роли». Сверка живого dev против TEST-чисел
даст либо ложный красный, либо ложный зелёный на 88 функциях.

---

### Р5 · ВАЖНО · `orgTableAllowlist.fullCountLive: 172` устарел в ОБЕИХ секциях — живьём 165 по SQL самой переписи

```bash
Q="select count(*) from pg_class c
 join pg_attribute a on a.attrelid=c.oid and a.attname='organization_id'
   and a.attnum>0 and not a.attisdropped
 where c.relkind in ('r','p')
   and c.relnamespace::regnamespace::text in ('public','app','integrator');"
psql "$TESTURL" -Atq -c "$Q"        # 165
psql "$DATABASE_URL" -Atq -c "$Q"   # 165
```

SQL взят дословно из `evidence/13-f2-census.md` §2.3 — того места, на которое ссылается комментарий
`fullCountLive: 172, // evidence/13 §2.3`. Разница 172 → 165 объясняется полностью: 7 из 11
снесённых `integrator.*` таблиц несли `organization_id`.

К чести файла, это один из девяти пробелов, и он **блокирует генерацию** («перепись насчитала 172
org-таблиц, в tables объявлено 116») — отказ громкий. Но число неверно; вдобавок dev-секция помечает
его как предположение («≈TEST is an assumption, not a measurement»), тогда как измерение показывает,
что у двух баз значение одинаковое и равно 165.

---

### Р6 · СРЕДНЕЕ · 49 живых org-таблиц классов P и C не несут `org` — allowlist стены-в-точке-рождения покрывает 116 из 165

`orgTableAllowlist.derivedFrom = 'tables[*].org === true'`, и по README именно этот список читает
event trigger §E. Поле `org` проставлено на 150 из 239 строк; ещё **49 таблиц имеют `organization_id`
живьём, а поля `org` в строке нет** — `expandTables` оставляет `org: undefined`, и в allowlist они не
попадают. Среди них:

```
public.be_appointment_cancellations  P   public.test_attempts / test_results        P
public.be_appointment_no_shows       P   public.treatment_program_instance*         P (4)
public.be_patient_packages           P   public.treatment_program_template*         C (4)
public.be_payments / be_refunds      P   public.saas_billing_accounts/invoices/…    C (5)
public.support_conversations/questions P public.tests / test_sets / test_set_items  C
public.symptom_entries / trackings   P   public.system_settings / …_audit           S
public.user_phone_history            P   public.specialist_tasks                    P
```

Стена самой таблицы от этого не зависит (D7 — стена по КЛАССУ, класс есть у всех 239). Затронут
принцип 2 плана: «новая таблица рождается закрытой; event trigger ставит RLS+FORCE **при рождении**
org-таблицы» — по 49 таблицам триггер получит allowlist без них. `TableRow.org` документирован как
«опущено там, где перепись не мерила», то есть пропуск объявлен, но Ф2 требует «заполнена из живого
каталога», а измерение — одна команда (выше).

---

### Р7 · СРЕДНЕЕ · 4 таблицы объявлены `rls: 'force'`, живьём RLS выключен, и `defect` не проставлен

Строк, где живой режим RLS не совпадает с объявленным, всего **55 на dev и 54 на TEST** — само по
себе ожидаемо (декларация — цель, а не снимок). Но у 51 из них стоит ссылка `defect`, а у четырёх нет:

| таблица | объявлено | живьём (обе базы) | `defect` |
|---|---|---|---|
| `public.reference_catalog_baselines` | force | `f / f` | — |
| `public.saas_isolation_coverage_runs` | force | `f / f` | — |
| `public.saas_isolation_event_hourly` | force | `f / f` | — |
| `public.saas_isolation_events` | force | `f / f` | — |

```bash
psql "$DATABASE_URL" -Atq -c "select relname,relrowsecurity,relforcerowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and relname in ('reference_catalog_baselines','saas_isolation_events',
                 'saas_isolation_event_hourly','saas_isolation_coverage_runs');"
```

Расхождение с реальностью, у которого нет ИМЕНОВАННОГО дефекта, при двусторонней сверке §F выглядит
как неожиданность, а не как известный долг. У трёх `saas_isolation_*` стена сегодня фактически
держится владением (`saas_telemetry_owner`, у прочих ролей ACL пуст — проверено), но объявлено force.

---

### Р8 · СРЕДНЕЕ · Доказательство «SQL побайтово одинаков для всех четырёх артефактов обеих баз» — вакуумно: SQL не производится ни одной из версий

Сообщение коммита приводит два доказательства сохранности. Первое (структурная сверка) **держится —
я воспроизвёл его независимо, §2**. Второе — нет:

```bash
git show 89759ee08^:deploy/postgres/privileges/declaration.ts > /tmp/old-declaration.ts
mkdir -p /tmp/gen-old /tmp/gen-new
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --all --out-dir /tmp/gen-new
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --all \
     --declaration /tmp/old-declaration.ts --out-dir /tmp/gen-old
# обе: «декларация неполна — генерация отказана (9 мест)»; каталоги остаются ПУСТЫМИ
diff -r /tmp/gen-old /tmp/gen-new    # различий нет — потому что сравниваются два пустых каталога
```

Прямой вызов подтверждает: `generatePrivilegesSql` и `generateOrgAllowlistSql` бросают
`DeclarationGapError` (9 пробелов) на обеих версиях и на обеих базах — ни одного байта SQL.
«Побайтово одинаков» здесь — сравнение двух одинаковых отказов. Гейт `--check` даёт `exit 0` не
потому, что артефакты совпали, а потому что он проверяет пруф-фикстуру
`fixtures/proof-declaration.ts`, а не реальную декларацию. Каталог `deploy/postgres/generated/` пуст.

**Почему это важно.** Правило владельца: утверждение без команды, которой оно получено, — не факт.
Здесь фраза звучит как проверка генератора на реальной декларации, а генератор её ни разу не
переварил.

---

### Р9 · НИЗКОЕ · 8 из 46 пар `revoke` в секции `bcb_webapp_dev` — фантомы (такого гранта нет)

Строки таблиц общие для двух баз, поэтому TEST-специфичные отзывы попадают и в dev-секцию:

```
public.be_organization_members             / bcb_test_integrator_login
public.be_organization_members             / bcb_test_nonstaff_login
public.be_specialist_service_availability  / bcb_test_nonstaff_login
public.be_specialists                      / bcb_test_nonstaff_login
public.platform_users                      / bcb_test_integrator_login
public.platform_users                      / bcb_test_nonstaff_login
public.user_phone_history                  / bcb_test_nonstaff_login
public.product_analytics_events_recent     / app_platform_settings
```

На `bersoncarebot_test` все 46 пар подтверждены живым `relacl` — фантомов **ноль**. На dev таких
грантов нет. Не вредно (SQL для них всё равно не эмитится, Р1), но это утверждение о реальности,
неверное для одной из двух объявленных баз.

**Побочно, для §F инварианта №8 «юрисдикция по доступу»:** логин dev-мигратора спокойно
подключается к управляемой базе TEST — подтверждает дефект §D.1 (`PUBLIC` несёт `=Tc`):

```bash
psql "postgres://<dev-логин>:<пароль>@127.0.0.1:5432/bersoncarebot_test" -Atq \
  -c "select current_database(), current_user;"
# bersoncarebot_test|bcb_webapp_dev_user
```

---

### Р10 · НИЗКОЕ · `CODE_MUST_CHANGE` C10 ссылается на несуществующий путь

```
declaration.ts:213   'apps/webapp/src/infra/repos/playbackUserVideoFirstResolve.ts:29-35 (И7)'
```

Файла по этому пути нет. Настоящий путь — `apps/webapp/src/app-layer/media/playbackUserVideoFirstResolve.ts`,
и строки 29-35 там действительно те самые (`catch → logger.error → return false`): утверждение
верное, адрес — нет. Остальные 16 путей из файла существуют.

---

### Р11 · ВОПРОС ВЛАДЕЛЬЦУ · `integrator.telegram_state`: класс P, но ни стены клиники, ни стены пациента — обоснование опирается на ещё не сделанное урезание колонок

```
declaration.ts:908  { t:'integrator.telegram_state', cls:'P', wall:'platform-role',
                      wallWhy:'после урезания 7 колонок ПДн не остаётся — остаётся стена своей роли' }
```

Урезания живьём нет:

```bash
psql "$DATABASE_URL" -Atq -c "select string_agg(attname,', ' order by attnum) from pg_attribute
 where attrelid='integrator.telegram_state'::regclass and attnum>0 and not attisdropped;"
# identity_id, username, first_name, last_name, state, notify_spb, notify_msk, notify_online, …
psql "$DATABASE_URL" -Atq -c "select count(*) from integrator.telegram_state;"       # 115
psql "$DATABASE_URL" -Atq -c "select relrowsecurity,relforcerowsecurity,relacl::text
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='integrator' and c.relname='telegram_state';"
# f|f|{…,app_staff=arwd/…}
```

Норма владельца дословно: «Все таблицы с **любыми** данными клиник/докторов и пациентов должны быть
обязательно закрыты стенами **и клиники и пациента**». Здесь таблица классифицирована как данные
пациента (`cls: 'P'`), 115 живых строк несут имя и фамилию, а объявленная стена — «своей роли»,
условно, до будущего урезания. Отдельной строки под этот случай в план-файле нет, поэтому это
вопрос, а не задача: **принять условную стену (сначала урезать колонки, потом стена роли) или
поставить обе стены сейчас?**

Того же класса, но мягче: пять таблиц класса P объявлены со стеной `clinic`, без пациентской ветки —
`be_appointment_staff_comments`, `be_patient_booking_profiles`, `manual_patient_commands`,
`patient_invites`, `patient_merge_candidates`. Первые две прямо следуют из решения D2 («он НЕ ВИДИТ
внутренние комментарии и пометку проблемный»), остальные три — инженерное суждение агентов. Их
`wallWhy` сверены с каталогом и подтвердились (у `patient_invites` и `manual_patient_commands` у
`app_patient` живьём ноль грантов). Трактовка «стена пациента = ноль доступа» выглядит корректной,
но она НЕ записана как решение владельца — стоит зафиксировать явно.

---

### Р12 · НИЗКОЕ · Единственное структурное поле, потерянное при сжатии, — `date` у решений владельца

`OwnerDecision` в `types.ts` больше не имеет поля `date`; в старой версии каждое из девяти решений
несло `date: '2026-08-08'`. Все девять — от 08.08, и раздел канона так и называется, так что
информация не утрачена; но это единственное место, где сжатие удалило поле, а не сократило текст.

Побочно: в `drift` у dev-`patient_specialist_links` исчезло предложение «GAP G7 закрыт: таблица
связывает пациента со специалистом ВНУТРИ организации → `org: true`» — сам флаг `org: true` на
месте, обоснование флага ушло.

---

## 2. Что проверено и сошлось (чисто)

**Вопрос 1 — сжатие. Решения НЕ потеряны и НЕ искажены.** Заявлению о побайтовой идентичности я не
поверил и сверил сами объекты. Обе версии загружены в Node, ключи отсортированы, массивы
нормализованы; из сравнения исключены только прозаические поля (`why`, `wallWhy`, `rlsWhy`,
`policyRequirement`, `requires`, `rule`, `note`, `drift`, тексты причин `revoke`) и `date` (Р12):

```bash
git show 89759ee08^:deploy/postgres/privileges/declaration.ts > /tmp/old-declaration.ts
node --experimental-strip-types <скрипт структурной сверки>
# STRUCTURAL IDENTICAL (all prose + revoke reasons excluded, arrays sorted): true
```

Поле-за-полем по **478/478 записям таблиц** совпали: `cls`, `wall`, `rls`, `disposition`, `owner`,
`org`, `grants` (включая колоночные — состав привилегий и списки колонок), **ключи** `revoke`,
`defect`, `ownerGate`, `codeMustChange`, `removal.{verdict,source,blockedBy}`, `drift`,
`grantMatrix`. Отклонений — **ноль**. Отдельно совпали агрегаты, которые файл считает сам: 239
таблиц, 225 с классом и стеной, 14 PENDING_REMOVAL, P 110 / C 66 / S 45 / T 13 / R 5, 116 `org:true`,
46 пар revoke, 53 отклонения стены, 225 `G2-pending`, распределение по 11 стенам.

Проверил и то, что **правила восстановления не могут «доложить» другую стену**: `expandTables`
(`types.ts:439-477`) бросает при `wall` без `wallWhy` и при `rls` без `rlsWhy`; все 53 отклонения
несут `wallWhy` (40 из них — через 5 общих констант, как и заявлено). Умолчание
`wall = row.drop ? 'pending-removal' : CLASS_DEFAULT_WALL[cls]` перепроверено на всех 239 строках —
восстановленная стена совпадает со стеной старой длинной формы у каждой. Пропавшие
`policyRequirement` (14 таблиц) — дословный пересказ шаблона стены; требований сверх шаблона в них
не было.

**Вопрос 2 — реальность. Сошлось:**

* Живых таблиц вне декларации — **0** в обеих базах (239 объявлено, 228 живых, 11 — снесённые, Р3).
* `org`-флаг: среди 150 строк, где он проставлен, расхождений с `pg_attribute` — **0** в обеих базах.
* Владельцы таблиц: все 6 не-миграторных владельцев объявлены верно в обеих базах
  (`app.context_nonce_ledger`, `app.context_signing_secrets`, `app.principal_context` → `app_owner`;
  три `saas_isolation_*` → `saas_telemetry_owner`).
* `revoke`: **46/46** пар подтверждены живым `relacl` на `bersoncarebot_test`.
* Definer-исключения: 9 из 11 существуют, у всех девяти совпал владелец и **побайтово** `proconfig`
  (включая `search_path=app, app_ext, pg_catalog` с пробелами после запятых); 2 помечены
  `isNew: true` (`app.resolve_organization_for_channel_identity`, `app.prune_context_nonce_ledger`) и
  действительно отсутствуют. Объявленный дрейф владения
  `app.read_outbound_provider_incident_health` (живьём мигратор, цель `app_owner`) подтверждён.
  Замечу: сигнатуры в декларации записаны типами аргументов и совпадают — первое «расхождение» у
  меня было артефактом сравнения с `pg_get_function_identity_arguments`, который печатает и имена.
* Перепись definer по TEST — восемь чисел из восьми: 244 всего, распределение proconfig
  235/5/2/1/1, `app_owner` 193, мигратор 38, telemetry 7, health 4, `app_platform_settings` 1,
  web_push 1.
* `named`-список дефектных org-таблиц: на TEST 5+1, на dev 6 — совпадает с живым набором ТОЧНО,
  включая НАМЕРЕННОЕ исключение `public.appointment_records` (она PENDING_REMOVAL) и dev-специфичную
  `patient_specialist_links` (RLS on, FORCE off — дефект Д24).
* Колоночные гранты `app_patient` на `platform_users` (`calendar_timezone`, `reminder_muted_until`,
  только UPDATE) подтверждены `pg_attribute.attacl` на обеих базах.
* Грантов `PUBLIC` на таблицы — **ноль** в обеих базах.
* Представлений (`relkind in ('v','m')`) в обеих базах **ноль** — требование `security_invoker`
  сегодня ни к чему не применяется.

**Числа в тексте (через `count(*)`, не `reltuples`) — сошлись:** `platform_users` 278 и
`user_contacts` 444 на TEST (цитируются в обосновании роли `app_identity_bootstrap`);
`operator_incidents` 9, `operator_job_status` 20, `schema_migrations` 73 на dev — все три цитируются
дословно и совпали. Не проверены из-за отсутствия прав у доступного логина: «812 строк payload_json»,
«12,6 млн строк `context_nonce_ledger`», «зеркала support_* 21/21, 20/20, 16/16».

**Вопрос 4 — обоснования «зачем». Выборка прошла:**

* `public.booking_calendar_map`, `wallWhy` «токенов и org-колонки нет» — живые колонки
  `id, appointment_key, gcal_event_id, created_at, updated_at`: **верно**.
* `public.operator_job_status`, причина отзыва D12 «политика `saas_enforce_default_deny_p0_9_1`
  выдана PUBLIC с USING true» — **верно дословно** (`pg_policies`; единственная такая на базе).
* `channelUsers.ts:65-95` «сырой join по четырём таблицам» — в файле ровно четыре:
  `integrator.identities`, `public.org_enrollments`, `public.be_organization_members`,
  `public.platform_users`: **верно**.
* `measureKindCode.ts:1` «код сам называет пул глобальным» — строка 1 дословно
  «(глобальный пул measure_kinds)»: **верно**.
* `be_appointment_staff_comments` «body заполняет врач/администратор (pgClientHistory.ts)» — **верно**
  (`code-search.mjs` → `pgClientHistory.ts:1121-1159`); слепой `grep` по имени таблицы дал бы ложную
  находку, потому что обращение идёт через объект drizzle-схемы.
* `patient_invites` и `manual_patient_commands`, `wallWhy` «пациенту не показывается» — у
  `app_patient` живьём ноль грантов на обеих таблицах: **верно**.
* Шаблонных заглушек вида «служебная таблица» без содержания в выборке из ~40 прочитанных `why` не
  встретилось: каждая называет, что лежит и что ломается без этого.

**Вопрос 3 — норма владельца, разложение по классам и стенам:** все 110 таблиц класса P, кроме шести
(Р11), несут стену с пациентской веткой; все 45 класса S несут стену своей роли (`platform-role*` 23
либо `definer-only` 21 — «ноль грантов рантайм-ролям», что строже); все 66 класса C — под клинической
стеной либо `reference-org-copy`. Доступ глобал-админа задан ЯВНО
(`PLATFORM_ROLE_SCOPE.mayTouch` / `mustNotTouch`, `provisional: true`), а не подразумевается. Модель
двух портов (D4) выдержана: каждый логин несёт поле `port`, третьи порты помечены `mustFold`.

---

## 3. Итог гейта

**FAIL по двум пунктам. Оба — внутри существующих строк плана владельца, оба бьют по критерию приёмки:**

* **Р1** — объявленный `revoke` не производит ни строки SQL, а логины выпадают из отзыва вообще:
  22 прямых табличных гранта логинам на TEST (из них 15 в декларации не упомянуты) плюс 7 колоночных
  грантов ПДн переживают полное переприменение генератора. На dev тот же дефект на 187 таблицах.
* **Р2** — при `rls: force` на 222 таблицах объявлено ноль политик, а генератор безусловно сносит все
  283 живые: применение даёт тихий ноль без записи в журнал, и детектор пробелов это не ловит
  (G8 — единственный пробел, который не fail-closed).

**Сжатие само по себе — PASS.** Ни одно решение не потеряно и не искажено; проверено независимо,
поле-за-полем, по 478/478 записям, а не по заявлению коммита. При этом второе доказательство из
сообщения коммита (побайтовая идентичность SQL, Р8) вакуумно.

Остальное — места, устаревшие относительно живого каталога (Р3, Р4, Р5, Р6, Р7, Р9) и один неверный
путь (Р10). Один вопрос владельцу — Р11.
