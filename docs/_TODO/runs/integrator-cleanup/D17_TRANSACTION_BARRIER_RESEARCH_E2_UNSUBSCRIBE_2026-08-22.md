# D17: барьер named root внутри relation-транзакции

Дата: 2026-08-22

Run-id: `E2_UNSUBSCRIBE`

Режим: исследование, без кода, миграций, `--execute`, TEST, PROD и push

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D17

Оракул: `docs/_TODO/runs/integrator-cleanup/D17_RELATION_READERS_2026-08-22.md`

## Итог

Барьер не является случайной проверкой TypeScript. Текущий контракт сознательно связывает одну физическую
PostgreSQL-транзакцию с одним принятым capability-контекстом: контекст выбирается до checkout, устанавливается
сразу после `BEGIN`, закрепляется строкой с первичным ключом по `(database_oid, backend_pid, transaction_id)`, а
RLS и named roots требуют точного совпадения одной этой строки. `clear` помечает строку, но не удаляет её, поэтому
даже последовательная вторая установка в той же транзакции отвергается. Проверка в `runIntegratorNamedRoot` лишь
останавливает невозможный путь раньше и понятнее, чем база.

Рекомендуемый путь: сохранять один capability/principal на транзакцию и сделать для каждого действительно
атомарного смешанного сценария одну заранее объявленную транзакционную дверь — точный workflow named root,
чей transcript выбирается до checkout, устанавливается сразу после `BEGIN`, а сам root вызывается как
единственный business SQL statement. Чтения, для которых согласованность с последующей записью не нужна, выносить
до relation-транзакции отдельным named root. Не разрешать несколько контекстов и не оставлять широкое членство как
архитектуру. Цена, которой я готов пожертвовать: часть Drizzle-компонуемости и мелкой гранулярности — появятся
более крупные DB workflow roots, их declarations и контрактные тесты; для неатомарных pre-read путей явно
жертвуем единым snapshot. Я не готов жертвовать свойством «одна транзакция — один заранее названный авторитет».

## 1. Где физически живёт ограничение

### 1.1. Приложение выбирает дверь до checkout

- `apps/integrator/src/infra/db/portContextRuntime.ts:48-60` хранит named operation в
  `AsyncLocalStorage`; это не атрибут уже открытого `DbPort`, а ambient input для следующего открытия порта.
- `apps/integrator/src/infra/db/portContextRuntime.ts:188-258` выбирает ровно один descriptor: либо relation
  capability из principal, либо exact `functionIdentity` + typed args из operation. Для organization principal
  named operation обязана иметь class `tenant_service` (`:209-217`); обычный organization principal выбирает
  `tenant_service` relation capability (`:195-202`, `:231-257`).
- `apps/integrator/src/infra/db/withClient.ts:22-42` вычисляет этот principal **до** `pool.connect()`, затем передаёт
  его в `withPortContextTransaction`. Поэтому позднее вложенное ALS-значение не может переустановить уже
  открытый checkout.
- `packages/db-principal/src/portContext.ts:419-458` выполняет фиксированную последовательность
  `BEGIN; RESET ROLE` → один `app.begin_port_context(...)` → business callback → clear/commit. При ошибке —
  `ROLLBACK` и уничтожение checkout (`:460-470`).
- `apps/integrator/src/infra/db/client.ts:161-181` строит tx-bound port с `integratorDrizzle`; nested `tx` просто
  повторно использует тот же port (`:177-178`).
- `apps/integrator/src/infra/db/runIntegratorSql.ts:39-60` видит `integratorDrizzle` и на `:51-54` выбрасывает
  `Integrator named root must start before the relation transaction`. Если транзакции нет, operation scope
  оборачивает `db.query`, и именно следующий checkout получает named capability (`:55-60`).

Следствие: «позвать root внутри tx» нельзя исправить снятием одного `throw`. Без него запрос дошёл бы до базы под
уже принятым relation-контекстом и всё равно был бы отвергнут exact gate.

### 1.2. База принимает одну дверь на transaction id

- `deploy/postgres/port-context/contract.sql:122-143`: `app_ext.accepted_port_contexts` хранит полный transcript
  capability, роли, класса, purpose, function identity, hash аргументов и identity/tenant claims. Первичный ключ
  на `:141` — `(database_oid, backend_pid, transaction_id)`, то есть максимум одна строка на транзакцию.
- `deploy/postgres/port-context/contract.sql:218-242`: `clear`-строка намеренно сохраняется до COMMIT, чтобы этот
  первичный ключ отвергал вторую установку. Deferred trigger удаляет её только при завершении транзакции
  (`:243-260`).
- `deploy/postgres/port-context/contract.sql:360-434`: `app.install_port_context` проверяет capability tuple,
  форму claims и их связь с identity/tenant, затем вставляет строку с `pg_current_xact_id()` (`:430-432`).
  `unique_violation` превращается в `42501 port context already installed for transaction` (`:433`).
- `deploy/postgres/port-context/contract.sql:436-443`: `app.clear_port_context` лишь выставляет `cleared_at`; ключ
  остаётся занят.
- `deploy/postgres/port-context/contract.sql:462-468`: `app.begin_port_context` выполняет clear/install и
  `SET LOCAL ROLE`. Роль transaction-scoped, но принятый context ещё строже: он также привязан к backend и xid.
- `deploy/postgres/port-context/contract.sql:489-514`: `app.require_accepted_context` требует exact match
  `session_login`, target/effective role, class, purpose, typed args hash и function identity в текущем xid.
- `deploy/postgres/privileges/declaration.ts:7884-7910`: restrictive `rev10_context_gate_*` для прямых relation
  операций требует `purpose='relation'`, пустой args hash и `function_identity IS NULL`; restrictive policies
  складываются через AND с tenant row walls. Named-root owner policy лишь допускает exact non-login owner, а сам
  root проверяет свой exact named transcript.

Отсюда важное различие: relation-контекст и named-root-контекст — не две роли одной сессии. Это два
несовместимых transcript-а. Простое `SET LOCAL ROLE app_integrator_resolver` не меняет принятую дверь.

### 1.3. Реальные места D17

Код подтверждает три семейства из оракула:

1. Identity projection: `packages/platform-merge/src/identityProjectionWrite.ts:129-175` читает candidates, а
   `upsertIdentityProjection` вызывает это внутри переданного tx client (`:416`); integrator adapter находится в
   `apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts:114-137`. Этот package также
   обслуживает webapp, поэтому интеграторская перестройка не должна менять общий контракт вслепую.
2. Organization resolution: `apps/integrator/src/infra/db/directPublic/resolveDirectPublicActor.ts:77-99`
   читает `org_enrollments` внутри caller-owned transaction. Named root с тем же смыслом уже существует, но его
   нельзя установить поверх relation context.
3. Reminder/content paths: embedded organization lookup —
   `apps/integrator/src/infra/db/repos/reminders.ts:20-35`; context reads — `:181-250`, `:319-413`; вызовы внутри
   транзакций — `apps/integrator/src/infra/db/writePort.ts:514-535`, `:559-585`, `:666-694`, `:722-755` и
   `apps/integrator/src/infra/db/repos/reminders.ts:201-225`.

Точный census, которым получены эти места:

```bash
rg -n "db\.tx\(|getReminderOccurrenceContextForProjection\(|collectPlatformUserCandidates\(|resolveExactActiveOrganizationId\(" \
  apps/integrator/src/infra/db packages/platform-merge/src/identityProjectionWrite.ts
```

Он показывает четыре затронутых callback-а в `writePort.ts` (`514`, `559`, `666`, `722`), один в
`reminders.ts:201` и уже существующий пример pre-read в `writeReminderRulesDirect.ts:139`. Это нижняя граница
call-site scope: пять tx-bound мест; declarations, roots и тесты в неё не входят.

## 2. Живые DEV-пробы

Все DB-пробы выполнены только на именованной DEV-базе `bcb_webapp_dev`, в явных транзакциях с `ROLLBACK`.
TEST/PROD не затрагивались. Гипотетическое поведение вариантов, требующих изменения контракта, нельзя проверить
живьём без запрещённых брифом кода/DDL; ниже оно помечено как проектное следствие, не как замер.

### Проба A: relation context действительно устанавливает tenant principal

Команда:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SET SESSION AUTHORIZATION bcb_dev_integrator;
BEGIN;
SELECT app.begin_port_context(
  'bd5bd4d1-83c3-5af2-8128-4f6b3fc994d0',
  ROW(1,'tenant_service','app_tenant_service','relation',NULL::regprocedure,
      decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),
      NULL,NULL,'a0000000-0000-4000-8000-000000000001',NULL,NULL)::app.port_context_claims
);
SELECT session_user, current_user, app.current_org_id(), count(*) AS visible_org_rows
FROM public.be_organizations
WHERE id='a0000000-0000-4000-8000-000000000001'
GROUP BY session_user,current_user,app.current_org_id();
ROLLBACK;
RESET SESSION AUTHORIZATION;
SQL
```

Результат: `session_user=bcb_dev_integrator`, `current_user=app_tenant_service`,
`current_org_id=a0000000-0000-4000-8000-000000000001`, `visible_org_rows=1`, затем `ROLLBACK`.

### Проба B: named root под уже принятым relation context отвергается базой

После установки того же relation context в той же транзакции выполнено:

```sql
RESET ROLE;
SET LOCAL ROLE app_integrator_resolver;
SELECT app.resolve_active_organization_for_channel_binding('telegram','probe-external-id');
ROLLBACK;
```

Точный запускающий префикс тот же, что в пробе A:
`sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -P pager=off`.
Результат: `ERROR: accepted port context required` из `require_accepted_context(...)` внутри
`resolve_active_organization_for_channel_binding`; затем `ROLLBACK`. Это проверяет, что смены роли недостаточно:
named root требует свой function/purpose/args transcript.

### Проба C: clear не разрешает вторую установку в том же xid

После relation `begin_port_context`, `RESET ROLE` и `SELECT app.clear_port_context()` выполнено:

```sql
SELECT app.begin_port_context(
  'e2260516-32fc-5462-9684-94830bd525d6',
  ROW(1,'integrator','app_integrator_resolver','integrator.channel-organization.resolve',
      'app.resolve_active_organization_for_channel_binding(text,text)'::regprocedure,
      decode('bc9e593162a9c9910851eefeab72b834f8a97e7c600fca5140dfc58e2eadb9f9','hex'),
      NULL,NULL,NULL,NULL,NULL)::app.port_context_claims
);
ROLLBACK;
```

Результат: `ERROR: port context already installed for transaction` из `install_port_context`, затем `ROLLBACK`.
Hash аргументов получен, а не угадан, командой:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off \
  -c "SELECT encode(app.hash_port_typed_args(ARRAY[ROW('text@1',convert_to('telegram','UTF8'))::app.port_typed_arg,ROW('text@1',convert_to('probe-external-id','UTF8'))::app.port_typed_arg]),'hex') AS hash;"
```

Результат: `bc9e593162a9c9910851eefeab72b834f8a97e7c600fca5140dfc58e2eadb9f9`.

### Проба D: реальный TypeScript runtime отказывает до business SQL

Из `apps/integrator` с DEV env и `APP_BASE_URL=http://127.0.0.1:5200` запущен реальный `createDbPort`, organization
principal, `db.tx(...)` и `runIntegratorNamedRoot(...)`:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
set +a
export APP_BASE_URL=http://127.0.0.1:5200
pnpm exec tsx -e "import { sql } from 'drizzle-orm'; import { createDbPort, closeDb } from './src/infra/db/client.ts'; import { runIntegratorNamedRoot } from './src/infra/db/runIntegratorSql.ts'; import { runWithOrganizationPrincipal } from './src/infra/principal/organizationPrincipal.ts'; void (async()=>{ const db=createDbPort(); await runWithOrganizationPrincipal('a0000000-0000-4000-8000-000000000001', async()=>{ try { await db.tx(async tx=>{ await runIntegratorNamedRoot(tx,'app.resolve_active_organization_for_channel_binding(text,text)',['telegram','probe-external-id'],sql\`SELECT app.resolve_active_organization_for_channel_binding(\${'telegram'},\${'probe-external-id'})\`); }); } catch (error) { console.log('runtime_tx_named_root='+(error instanceof Error ? error.message : String(error))); } }); await closeDb(); })();"
```

Результат: `runtime_tx_named_root=Integrator named root must start before the relation transaction`. Открытая
port-context transaction была откатана штатным catch в `withPortContextTransaction:460-470`.

### Каталожная проверка текущего охвата

Capability IDs выше получены командой:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off \
  -c "SELECT capability_id, target_role, context_class, purpose, function_identity::text FROM app_ext.port_context_capabilities WHERE session_login='bcb_dev_integrator' AND ((target_role='app_tenant_service' AND purpose='relation' AND function_identity IS NULL) OR function_identity='app.resolve_active_organization_for_channel_binding(text,text)'::regprocedure) AND active_from <= clock_timestamp() AND (active_until IS NULL OR active_until > clock_timestamp()) ORDER BY target_role, purpose;"
```

Она вернула ровно две запрошенные активные записи: relation capability
`bd5bd4d1-83c3-5af2-8128-4f6b3fc994d0` и named resolver capability
`e2260516-32fc-5462-9684-94830bd525d6`.

## 3. Варианты снятия барьера

Число мест ниже — оценка реализации, а не сделанный change. Измеренная нижняя граница call sites дана точной
`rg`-командой в §1.3; core surfaces перечислены поимённо, чтобы диапазон не выглядел точным замером.

Отдельный точный census core surfaces:

```bash
rg -l "accepted_port_contexts|runWithIntegratorPortOperation|withPortContextTransaction|revision10ContextGates|runIntegratorNamedRoot" \
  deploy/postgres/port-context/contract.sql deploy/postgres/privileges/declaration.ts \
  apps/integrator/src/infra/db/portContextRuntime.ts apps/integrator/src/infra/db/withClient.ts \
  apps/integrator/src/infra/db/runIntegratorSql.ts packages/db-principal/src/portContext.ts | sort -u | wc -l
```

Результат — `6`: `contract.sql`, `declaration.ts`, `portContextRuntime.ts`, `withClient.ts`,
`runIntegratorSql.ts`, `db-principal/portContext.ts`. Это измеренная поверхность текущего механизма, не обещание,
что каждый вариант обязан менять каждый файл.

### Вариант A — транзакция заранее называет одну workflow-дверь (рекомендую)

**Контракт.** Сохраняется правило «один accepted context на xid». До checkout объявляются точный
`functionIdentity`, purpose и args. В транзакции выполняется один compound SECURITY DEFINER root, который сам
делает нужные чтения и записи с tenant predicate в теле. Практически это либо один SQL function statement без
application `db.tx`, либо новая tx API, принимающая named operation до открытия transaction и запрещающая всё,
кроме совпавшего root.

**Что становится невозможно.** Нельзя начать generic relation transaction, а потом динамически расширить её
полномочия; нельзя смешать произвольный Drizzle SQL с named root; нельзя использовать один workflow context для
другой функции/других аргументов.

**Новая поверхность ошибки.** Более крупный root может разрастись, ошибиться в tenant predicate или отойти от
shared webapp semantics; declaration и argument transcript должны обновляться атомарно. Если вместо единственного
root разрешить generic statements под workflow context, получится bundle capability из варианта C, а не этот
вариант.

**Обратимость.** Высокая до отзыва старых relation grants: приложение можно вернуть на старый путь. После снятия
membership rollback требует вернуть grants либо сохранить dual-read window.

**Охват.** Измеренная нижняя граница — три workflow-family и пять tx-bound call sites из §1.3. Из шести core
surfaces текущего механизма потребуются как минимум named operation/runtime adapter и declaration; точный file
count зависит от решения «один statement без `db.tx`» против новой named-tx API. Дополнительно нужны roots и tests.

**Структурность.** Да, если единственный statement — exact root и широкое membership снято: забытый context/root
получает 42501, а произвольный relation SQL физически недоступен.

**DEV-проверка.** Текущая предпосылка проверена пробами B–D. Будущий compound root не проверялся: для этого нужен
запрещённый брифом DDL/код.

### Вариант B — вынести чтение до открытия relation-транзакции

**Контракт.** Не меняется. Named read получает собственную короткую транзакцию и committed snapshot; затем
relation transaction открывается с заранее вычисленными ID/context. Такой паттерн уже есть в
`writeReminderRulesDirect.ts:139-158`: pre-read transaction заканчивается до named write.

**Что становится невозможно.** Нельзя гарантировать, что прочитанное отношение/organization/candidate не
изменится между read и write. Нельзя читать uncommitted данные последующей transaction.

**Новая поверхность ошибки.** TOCTOU, stale decision, удалённое/переназначенное tenant membership, расхождение
retry semantics. Стена структурна только если write/root заново валидирует tenant/identity; переданный UUID без
DB revalidation оставляет корректность на дисциплине автора.

**Обратимость.** Высокая: call order можно вернуть, схема не меняется.

**Охват.** Пять измеренных tx-bound мест из §1.3 плюс их adapters/tests. Для identity merge и grant insert
простой pre-read может быть семантически неприемлем, поэтому это не единое решение всех мест.

**Структурность.** Частично. Сам named read структурный; связь его результата с последующей записью — нет, пока
write не повторяет стену.

**DEV-проверка.** Существующий пример порядка есть в коде; отсутствие race невозможно доказать одиночной
rollback-пробой. Гипотеза о TOCTOU не выдаётся за замер.

### Вариант C — заранее объявленный bundle capability для нескольких relation statements

**Контракт.** Одна строка/xid сохраняется, но появляется workflow purpose, которому restrictive policies разрешают
явно перечисленный набор таблиц/операций. Это «транзакция заранее называет дверь», но дверь — не один root, а
ограниченный multi-statement bundle.

**Что становится невозможно.** Нельзя обращаться к relation вне declared bundle; нельзя динамически добавлять
операцию без изменения declaration.

**Новая поверхность ошибки.** Ошибка allowlist/policy даёт whole-transaction authority шире одного root;
application может переносить данные между разрешёнными шагами. Это по сути новый scoped DB role/capability и
сложнее для аудита, чем один function body.

**Обратимость.** Средняя: bundle policies/capabilities можно отозвать, но каждый потребитель должен быть сначала
переведён обратно.

**Охват.** Все шесть измеренных core surfaces, три workflow-family и tests.

**Структурность.** Да относительно незаявленных relations, если allowlist генерируется и broad membership снято;
слабее exact root внутри заявленного bundle.

**DEV-проверка.** Не проверялось: требует новый capability class/purpose и RLS DDL.

### Вариант D — последовательная замена контекста внутри одного xid

**Контракт.** Разрешить после `clear` установить следующий context, сохраняя не более одного active context.
Первичный ключ и accessors меняются: история строк должна иметь отдельный ключ, а active row — partial uniqueness.

**Что становится невозможно.** Исчезает неизменность principal/capability на transaction. Savepoint/rollback
может откатить `clear` или вторую установку и рассинхронизировать ожидание приложения с `SET LOCAL ROLE`.

**Новая поверхность ошибки.** Confused deputy и data ferry: один xid последовательно читает под одной дверью и
пишет под другой; локальные переменные/данные приложения переносят authority через границу. Ошибки savepoint и
очистки становятся security-critical.

**Обратимость.** DDL обратим до появления зависимых callers; поведенческий откат сложнее после того, как workflows
начнут полагаться на switching.

**Охват.** Все шесть измеренных core surfaces, accessors/gates и transaction tests; затем каждый switching caller.

**Структурность.** Нет по главному критерию: автор обязан правильно переключать и не переносить данные между
дверями. База проверяет каждую фазу, но не смысл их композиции.

**DEV-проверка.** Текущее запрещающее поведение измерено пробой C. Поведение после смены PK не проверялось из-за
запрета DDL.

### Вариант E — несколько одновременно принятых контекстов на xid

**Контракт.** Ключ расширяется capability ID/sequence; gates делают existential match среди active rows. Accessors
должны стать capability-aware либо контракт должен запретить разные organization/identity claims в одном xid.

**Что становится невозможно.** Больше нельзя однозначно ответить «кто текущий principal/tenant» одним
`current_org_id()` без дополнительного ключа. Если relation и named contexts сосуществуют, named root не сужает
уже доступный relation surface.

**Новая поверхность ошибки.** Union of privileges, неоднозначный tenant, cross-context data ferry, ошибочный
выбор accessor-строки, более трудный audit и cleanup. Это непосредственно разрушает полезное свойство текущего PK.

**Обратимость.** Низкая после появления multi-context callers/data: возврат к одному context потребует переписать
их все.

**Охват.** Все шесть измеренных core surfaces, каждый accessor текущих claims, named gates, RLS generator и все
callers, которым нужен выбор context; caller tail заранее не ограничен.

**Структурность.** Нет для D17: широкая relation door остаётся активной рядом с named door, поэтому забыть narrow
root снова возможно.

**DEV-проверка.** Текущий запрет измерен пробой C; multi-row contract не проверялся без DDL.

### Вариант F — отдельный checkout/nested independent transaction для root

**Контракт.** Внешний relation xid не меняется; named root открывает второе соединение и вторую транзакцию со своим
context. Это буквально connection pinning на две независимые transactions, а не вложенная атомарность.

**Что становится невозможно.** Root не видит uncommitted изменения внешней tx; его результат/side effect может
закоммититься, когда внешняя tx откатится. Возможны ожидание собственного lock и deadlock.

**Новая поверхность ошибки.** Скрытая потеря atomicity, pool exhaustion, self-deadlock и противоречивые retries.
Для чистого committed read это функционально вариант B, но с менее явной границей.

**Обратимость.** Высокая на уровне кода, если не было committed side effects.

**Охват.** Из измеренных core surfaces затрагивает `runIntegratorSql.ts`, `withClient.ts` и
`portContextRuntime.ts`, плюс каждый caller; DB contract не решает.

**Структурность.** Каждая отдельная transaction структурна, композиция между ними — дисциплина.

**DEV-проверка.** Не запускалось: скрытое второе соединение потребовало бы написать код. PostgreSQL snapshot/lock
последствия — проектная семантика, а не локальный замер этого варианта.

### Вариант G — осознанно оставить `app_tenant_service` membership

**Контракт.** Ничего не менять: integrator login продолжает открывать organization-scoped relation transaction;
named roots используются только там, где caller их выбрал.

**Что становится невозможным.** Невозможно выполнить цель D17 «у интегратора нет широкого арендного membership».
Снять membership без дальнейшей перестройки нельзя.

**Новая поверхность ошибки.** Разработчик может забыть narrow root и успешно прочитать любую relation surface,
разрешённую `app_tenant_service`, хотя tenant row wall продолжит ограничивать выбранную организацию.

**Обратимость.** Нулевая стоимость сейчас; решение можно пересмотреть позднее, но долг и широкая поверхность
остаются.

**Охват.** Код не меняется; нужна явная owner/plan запись о принятом исключении.

**Структурность.** Tenant isolation остаётся структурной через RLS, но требование «только именной корень» полностью
остаётся на дисциплине пишущего. По главному критерию D17 — нет.

**DEV-проверка.** Проба A доказала, что relation path сейчас работает. Полный catalog census membership выполнялся
read-only командой:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off \
  -c "SELECT granted.rolname FROM pg_auth_members membership JOIN pg_roles granted ON granted.oid=membership.roleid JOIN pg_roles login ON login.oid=membership.member WHERE login.rolname='bcb_dev_integrator' ORDER BY granted.rolname;"
```

Она показала, что `bcb_dev_integrator` имеет в том числе `app_tenant_service`. Никакие grants не менялись.

### Не-вариант — дать root EXECUTE роли `app_tenant_service`

Это не снимает барьер: exact root проверяет target role/class/purpose/function/args, а relation context несёт
`purpose='relation'` и `function_identity=NULL`. Чтобы такой вызов прошёл, пришлось бы ослабить exact gate до
relation context; тогда это уже broad relation authority под именем root, а D17 не выполнен. Проба B проверяет
именно этот класс отказа.

## 4. Что считается нормой во взрослых системах

1. PostgreSQL документирует `SET LOCAL` как состояние до конца текущей транзакции; COMMIT/ROLLBACK его снимает, а
   rollback к более раннему savepoint отменяет более поздний `SET LOCAL`. Это естественно делает principal
   transaction-scoped, а не свободно накапливаемым:
   <https://www.postgresql.org/docs/16/sql-set.html>.
2. `SET [LOCAL] ROLE` меняет `current_user` с проверкой membership; в SECURITY DEFINER функции менять `role`
   нельзя. Нормальная граница — выбрать роль на входе в транзакцию, а privileged root исполнять под точным owner:
   <https://www.postgresql.org/docs/16/sql-set-role.html>.
3. PostgreSQL RLS — централизованная fail-closed стена: при включённом RLS без политики действует default deny,
   restrictive policies объединяются через AND. Это поддерживает модель «заявить tenant/principal один раз,
   проверять на каждой строке», но требует не выдавать runtime `BYPASSRLS`/superuser:
   <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>.
4. AWS Prescriptive Guidance для pooled multi-tenant PostgreSQL показывает обычный паттерн runtime tenant variable
   + RLS (`current_setting('app.current_tenant')`) вместо роли на каждого tenant: tenant передаётся приложением,
   а isolation централизуется политиками:
   <https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html>.
5. PgBouncer в transaction pooling закрепляет server connection за client только на время transaction; session
   `SET/RESET` в этом режиме несовместимы. Поэтому connection pinning на срок transaction и `SET LOCAL`, а не
   session-wide principal, — стандартная композиция с pooler:
   <https://www.pgbouncer.org/features.html>.

Вывод из практики не в том, что PostgreSQL запрещает несколько `SET LOCAL`, — он их разрешает. Норма безопасности
состоит в одном логическом principal/tenant на unit of work, transaction-local состоянии и fail-closed RLS.
Текущий BCB contract делает эту норму сильнее встроенного GUC: он криптографически/типизированно связывает exact
capability с xid и намеренно запрещает второй transcript. Несколько contexts технически реализуемы, но это уже
смена security model, а не снятие неудобной проверки.

## 5. Ответ на главный критерий: структурная ли стена

Выбранный вариант A делает стену **структурной**, только если соблюдены все три условия одновременно:

1. transaction context устанавливается до checkout и называет exact workflow root;
2. transaction выполняет только этот root, а tenant predicate/revalidation находится в его DB body;
3. `bcb_*_integrator` больше не имеет `app_tenant_service` relation membership.

Тогда забыть стену невозможно: без exact context root получает 42501, с другим transcript — 42501, а прямой SQL
не имеет роли/политики для доступа. Если разрешить произвольные statements под workflow context, передать в запись
непроверенный результат pre-read или оставить membership, стена снова становится дисциплиной пишущего.

## 6. Решение, которое должен принять ведущий

Принять ли для трёх D17 families контракт «один атомарный workflow = один named SECURITY DEFINER root», разрешив
pre-read split только после явной оценки потери snapshot/atomicity по конкретному месту. Это оставляет действующий
one-context invariant и даёт структурное снятие membership; цена — более крупная DB API surface и точечный перенос
части transaction orchestration из TypeScript в declaration-owned roots.
