# Гейт поверхности тела: класс «право требует ТРИГГЕР» (22.08.2026)

Ветка `wt/trigger-gate-20260822`, коммиты `62305d467` + отчётный.
Бриф — `docs/_TODO/runs/briefs/TRIGGER_INDUCED_PRIVILEGE_GATE_BRIEF_2026-08-22.md`.
Оракул — `AGENTS.md` §1 «Перед приземлением миграции — разбор её прав, а не только её объектов».

## Коротко

DEV снят с блокера: `bash deploy/host/migrate-dev.sh --execute` проходит до конца, вход тремя
учётками владельца — 200 со своей ролью. Гейт при этом НЕ ослаблен: объявленная операция, которой
нет в теле, по-прежнему дыра. Появился ровно один способ её объяснить — **явный маркер
`requiredByTrigger` с именем триггера и его таблицей**, и этот маркер сверяется с живым каталогом по
пяти условиям, поэтому выдуманное имя не проходит (доказано инъекциями).

**Поправка к брифу по адресу ошибки.** Бриф называл ошибающимся гейтом
`deploy/postgres/privileges/function-body-surface.mjs` → `compareFunctionSurfaces`. Reconcile валит
не он: сообщение `function body surface gaps (…)` печатает **SQL-гейт, встроенный в сам артефакт**
(`deploy/postgres/privileges/generate.mjs` → `generateFunctionBodySurfaceVerifySql`, отрендерено в
`deploy/postgres/generated/privileges.<база>.sql`), и он идёт по живым телам из `pg_proc`.
`compareFunctionSurfaces` — лексический близнец того же правила, применяемый к репо-артефактам; на
реальную декларацию сегодня не наведён (только фикстурный тест), но слепое пятно у него было
такое же. Научены **оба**, от одного и того же маркера, — чтобы правила не разъехались.

## Что изменено

| Файл | Строки | Что |
|---|---|---|
| `deploy/postgres/privileges/types.ts` | `291:304` | новое поле `FunctionRelationSurface.requiredByTrigger?: Partial<Record<Privilege, {trigger, onRelation}>>` — ЕДИНСТВЕННЫЙ маркер на весь репозиторий (§5) |
| `deploy/postgres/privileges/generate.mjs` | `825:842` | проверка ФОРМЫ маркера при сборе `collectGaps`: операция обязана быть в `operations`, оба поля непустые, `onRelation` — известное отношение |
| `deploy/postgres/privileges/generate.mjs` | `1548:1551` | `triggerRows` — рендер маркеров в SQL |
| `deploy/postgres/privileges/generate.mjs` | `1568:1619` | новая temp-таблица `bcb_function_surface_trigger_sources` + DO-блок сверки маркера с ЖИВЫМ каталогом; помечает строку `verified` |
| `deploy/postgres/privileges/generate.mjs` | `1621`, `1641:1644`, `1666:1669` | `trigger_explained` в цикле поверхностей; четыре проверки «declared X has no executable relation operation» пропускают ТОЛЬКО подтверждённые маркеры |
| `deploy/postgres/privileges/generate.mjs` | `1673` | в NOTICE добавлено `trigger_sources=N` — число маркеров видно в логе выкатки |
| `deploy/postgres/privileges/function-body-surface.mjs` | `194:225` | `parseTriggers(sql)` — разбор `CREATE TRIGGER` (имя, таблица, события, обработчик) |
| `deploy/postgres/privileges/function-body-surface.mjs` | `228:264` | `triggerExplainedOperations` — та же сверка по репо-артефактам |
| `deploy/postgres/privileges/function-body-surface.mjs` | `266:317` | `compareFunctionSurfaces(functions, declaredFunctions, triggers = [])` учитывает подтверждённые операции |
| `deploy/postgres/privileges/declaration.ts` | `3797:3814` | маркер на поверхности `public.organization_slug_claims` у `app.provision_specialist_owner(uuid)` |
| `deploy/postgres/privileges/function-census.test.mjs` | `175:268` | поведенческий тест на пять случаев маркера |
| `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` | `3885:3927`, `3948:3949`, `3967:3970`, `3974` | перегенерировано |
| `deploy/postgres/generated/privileges.bersoncarebot_test.sql` | те же | перегенерировано |

**Ни одного гранта не добавлено и не снято.** Диффа в `GRANT`/`REVOKE`/ролях/политиках нет вовсе —
`SELECT (kind, organization_id, slug)` на `organization_slug_claims` уже был в артефакте из ветки
`wt/provision-gate-20260822`. Миграции нет: `pending=0`, объектов не создано и не изменено.

## Как гейт теперь отличает «право требует триггер» от «в декларации мусор»

Правило одно и оно **аддитивно к старому**: операция объявлена → она обязана быть видна в теле;
если её там нет — гейт краснеет ровно тем же сообщением, что и раньше. Единственное исключение —
операция, у которой **есть маркер и маркер подтверждён**. Подтверждение — пять условий, все против
живого каталога DEV (интроспекция бесплатна: гейт исполняется внутри той же транзакции reconcile):

1. **Операция объявлена на поверхности.** Маркер на операцию, которой нет в `operations`, — мёртвая
   строка: `trigger-induced operation is not declared on the surface`.
2. **Триггер существует на названной таблице и не internal**
   (`pg_trigger` × `to_regclass(onRelation)`, `NOT tgisinternal`) — иначе
   `names a trigger absent from the catalog`.
3. **Триггер SECURITY INVOKER** (`pg_proc.prosecdef = false`). Триггер-DEFINER исполняется от
   СВОЕГО владельца и грант этой двери объяснить не может — иначе
   `names a SECURITY DEFINER trigger, which runs under its own owner`.
4. **Тело двери действительно пишет в подтриггерную таблицу СОБЫТИЕМ этого триггера.** Биты
   `tgtype` (4=INSERT, 8=DELETE, 16=UPDATE) пересекаются с тем, что тело лексически делает с этой
   таблицей — иначе `names a trigger the body never fires`. Это и есть «тело действительно в неё
   пишет» из требования 3 брифа.
5. **Тело САМОГО триггера выполняет названную операцию по названному отношению** (те же лексические
   образцы, что и для основного тела) — иначе
   `names a trigger whose body has no such relation operation`.

Только после всех пяти строка помечается `verified`, и лишь тогда четыре проверки
«declared X has no executable relation operation» её пропускают. Неподтверждённый маркер ничего не
пропускает — гейт печатает **ДВЕ** строки сразу: и причину отказа маркера, и старую дыру.

Чем это НЕ является: глухим исключением. Ни одна операция не перестала проверяться; добавилась
проверка на маркер, которого раньше не было. Читающий декларацию видит имя триггера прямо рядом с
операцией и может пройти по нему сам.

Конкретный случай: `app.provision_specialist_owner(uuid)` вставляет карточку в
`public.clinic_public_directory_entries`; на ней висит `clinic_public_directory_current_slug_guard`
(BEFORE INSERT OR UPDATE OF organization_id, slug, `tgtype=23`), обработчик
`app.guard_clinic_directory_current_slug` — `prosecdef=f`, его тело делает
`SELECT 1 FROM public.organization_slug_claims …`. Все пять условий сходятся.

## Перепись: остальные необъяснимые объявления

**Необъяснённая объявленная операция была РОВНО ОДНА — эта.** Проверено двумя независимыми
источниками, оба перечисляют ВСЕ поверхности всей декларации, а не первую попавшуюся:

1. **Живой гейт на DEV** (перед правкой): `function body surface gaps (1)` — гейт собирает все
   расхождения в `bcb_function_surface_gaps` и печатает счётчик; счётчик = 1.
2. **Лексический прогон по репо-артефактам** (snapshot + активные forward-миграции против
   `declaration.portContext.functions`, `extractRelationOperations` с вычетом `delegatesTo`):

```
UNEXPLAINED app.provision_specialist_owner(uuid) -> public.organization_slug_claims: SELECT
total 1
```

Наборы функций двух баз совпадают побайтно (`bersoncarebot_test` 422, `bcb_webapp_dev` 422,
пересечение полное), поэтому прогон на DEV покрывает и TEST-артефакт.

Чужого чинить не пришлось: второго случая класса «требует триггер» нет, и операций другого
непонятного класса тоже нет. Соответственно и вопросов владельцу по чужим объявлениям — нет.

Для полноты: SECURITY INVOKER триггеров в каталоге DEV тринадцать (из двадцати не-internal), то
есть класс не единичный и правило заведено не под один случай — просто сегодня в декларации им
затронута одна поверхность.

## Доказательства (реальный вывод)

### `bash deploy/host/migrate-dev.sh --execute` — ДО правки

```
ERROR:  function body surface gaps (1):\ndeclared SELECT has no executable relation operation: app.provision_specialist_owner(uuid) -> public.organization_slug_claims
    at command (…/deploy/postgres/privileges/reconcile-access.mjs:65:11)
EXIT=1
```

### `bash deploy/host/migrate-dev.sh --execute` — ПОСЛЕ правки

```
EXIT=0
integrator owner-ordered migrations current for "bcb_webapp_dev": pending=0 eligible=0 total=1
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=30 verified-objects=74 foreign-ledger-rows=0
integrator owner-ordered migrations current for "bcb_webapp_dev": pending=0 eligible=1 total=1
access reconcile committed: env=dev database=bcb_webapp_dev; local admin socket=/run/postgresql
migrate-dev: PASS (pending migrations applied; declaration reconciled and catalog-audited)
```

Сам гейт в изоляции (тот же блок артефакта, `BEGIN … ROLLBACK` на живой `bcb_webapp_dev`):

```
NOTICE:  BCB_FUNCTION_BODY_SURFACES_VERIFIED functions=407 rows=966 special_contracts=8 trigger_sources=1
```

### Живой вход тремя учётками владельца на DEV

```
dimmdao@yandex.ru        HTTP 200  {"ok":true,"redirectTo":"/app/doctor","role":"doctor"}
dimmdao@gmail.com        HTTP 200  {"ok":true,"redirectTo":"/app/admin/system-health","role":"admin"}
kinesiospace@gmail.com   HTTP 200  {"ok":true,"redirectTo":"/app/patient","role":"client"}
```

**Понадобился второй шаг, и это часть того же блокера.** После зелёного reconcile вход всё ещё
отдавал `500`. Причина не в правах: миграция `pre_session_resolve_identity(uuid) → (uuid,text)`
доехала до базы, а рантайм-каталог порт-контекста в дереве, из которого запущен сервер :5200
(`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`), остался с прежней сигнатурой — три
записи из 222 (`staff_identity_resolve`, `patient_identity_resolve`, `globalAdmin_identity_resolve`).
Это ровно «каталог порт-контекста разошёлся с базой» из брифа. Снято штатным портом того же дерева
`node deploy/host/update-dev-port-context-env.mjs` (тот же шаг, которым заканчивается
`migrate-dev.sh`; дерево на том же коммите `36d037b6e`, свои несохранённые правки туда не попадали)
и перезапуском :5200 тем же `next dev --webpack -H 127.0.0.1 -p 5200` — Next читает env один раз при
старте. После перезапуска расхождение — 0 записей из 222. В журнале PostgreSQL за время этих `500`
ошибок нет ни одной: отказ был на стороне приложения, не прав.

### Оба `--check` генератора побайтно

```
$ node deploy/postgres/privileges/generate-cli.mjs --all --check
--check: артефакты соответствуют декларации побайтно.       (exit 0)
$ node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check
--check: артефакты соответствуют декларации побайтно.       (exit 0)
```

### `pnpm test:db-privileges`

```
# tests 183
# pass 139
# fail 0
# skipped 44
```

(183 против 176 до правки — добавлен поведенческий тест маркера с пятью случаями.)

### Инъекция неисправности на НОВЫЙ гейт

Ломал продукт (декларацию), перегенерировал артефакт, гонял гейт против живого DEV в откаченной
транзакции, возвращал побайтно. Все три — на уже закоммиченной правке.

```
=== (а) маркер снят: операция объявлена, в теле её нет ===
ERROR:  function body surface gaps (1):
declared SELECT has no executable relation operation: app.provision_specialist_owner(uuid) -> public.organization_slug_claims

=== (б) маркер называет несуществующий триггер ===
ERROR:  function body surface gaps (2):
declared SELECT has no executable relation operation: app.provision_specialist_owner(uuid) -> public.organization_slug_claims
trigger-induced surface names a trigger absent from the catalog: app.provision_specialist_owner(uuid) -> public.organization_slug_claims (clinic_public_directory_current_slug_guard_typo ON public.clinic_public_directory_entries)

=== (в) маркер называет РЕАЛЬНЫЙ триггер, но на таблице, в которую тело не пишет ===
ERROR:  function body surface gaps (2):
declared SELECT has no executable relation operation: app.provision_specialist_owner(uuid) -> public.organization_slug_claims
trigger-induced surface names a trigger the body never fires: app.provision_specialist_owner(uuid) -> public.organization_slug_claims (trg_media_folders_depth_ins ON public.media_folders)

=== ВОЗВРАТ ===
--check: артефакты соответствуют декларации побайтно.
git status --short → пусто
```

(в) сверх требований брифа: показывает, что подставить чужое настоящее имя тоже нельзя.

### Поведенческий тест маркера (лексический близнец)

`function-census.test.mjs`, тест
`trigger-induced surface passes only when the named trigger is real, INVOKER and actually fires` —
пять случаев на одной фикстуре: (а) маркер сошёлся → дыр нет; (б) выдуманный триггер → две строки;
(в) маркера нет вовсе → старое поведение сохранено; (г) триггер-DEFINER → отказ; (д) тело в
подтриггерную таблицу не пишет → отказ. Названный отказ, ради которого тест живёт (§10a ступень 2):
маркер с несуществующим именем принят молча → генератор выдаёт владельцу шва грант, который никто не
может проследить до исполняемого оператора, а НАСТОЯЩЕЕ право живого триггера остаётся невыданным;
миграция, reconcile и деплой зелёные, падает первый живой вызов `42501`, и снаружи это выглядит не
отказом прав, а неверно работающей функцией.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. **`compareFunctionSurfaces` на реальную декларацию не наведён — навести ли?** Сегодня он гоняется
   только по фикстуре; правило дублирует SQL-гейт из артефакта, и я научил его тому же маркеру,
   чтобы копии не разъехались. Чтобы навести его на настоящую декларацию, нужен ещё
   `deploy/postgres/generated/prod-to-target/schema-post.sql` во входном наборе (триггеры лежат
   ТАМ, а не в `schema-pre.sql` и не в forward-миграциях — проверено) и фильтр `security === 'DEFINER'`,
   которого в JS-близнеце нет, а в SQL-гейте есть. Это отдельная работа, в брифе её нет.
2. **Три записи `.env.dev` в главном дереве и перезапуск :5200 — я это сделал.** Без этого живой
   вход, которого требует бриф, не получить: файл гейтом не покрыт, а `migrate-dev.sh` обновляет
   каталог только В СВОЁМ дереве, поэтому сервер, запущенный из другого дерева на том же коммите,
   систематически расходится с базой после каждой миграции, меняющей сигнатуру definer-корня. Стоит
   ли это чинить структурно (например, чтобы `migrate-dev.sh` обновлял каталог того дерева, из
   которого реально поднят :5200, или чтобы приложение падало громко и по имени, а не `500` с
   пустым `{"type":"Error"}`) — решение ваше, в брифе такого пункта нет.

## НЕ СДЕЛАНО

- **`pnpm lint` и `pnpm typecheck` не запускались.** В worktree нет `node_modules` (eslint падает
  `Cannot find package '@eslint/js'`), а разворачивать их ради двух файлов — это полный CI, который
  бриф прямо запрещает. Изменённый TypeScript — `types.ts` и `declaration.ts`; генератор исполняет
  оба через `--experimental-strip-types` в каждом из прогонов `--check` и в `pnpm test:db-privileges`,
  все зелёные. `.mjs`-файлы попадают только под `js.configs.recommended` + `prettier` (правил длины
  строки в `eslint.config.mjs` нет).
- **Push и полный CI не запускались**, TEST и PROD не тронуты, deploy не гонялся.
- **Артефакт `bersoncarebot_test` на живой базе не проверялся** — TEST брифом запрещён. Он
  перегенерирован и сверен `--check` побайтно; наборы функций двух баз идентичны, так что живая
  проверка на DEV покрывает то же правило.
- **Миграция не написана — и не нужна.** Правки прав нет вовсе: изменился только гейт и одна строка
  декларации, объясняющая уже существующий грант.
- **Чужие «необъяснимые» объявления не чинились** — их нет (см. «Перепись»).
