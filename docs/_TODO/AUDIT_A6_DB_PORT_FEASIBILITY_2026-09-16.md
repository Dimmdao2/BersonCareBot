Нельзя в предложенном виде; сделать проверку корректно и только для тарифных механик можно лишь при условии, что главный порт получает обязательное типизированное и неизменяемое намерение записи, установленное до первого `await`, а физический барьер охватывает также каждый `PoolClient` и Drizzle поверх него, а не только `getDrizzle()` и `getPool()`.

# Аудит замысла А6: тарифная проверка в главном порте БД

Дата: 2026-09-16. Объект аудита: А5–А7 в
`docs/_TODO/API_DOORS_BY_AREA_2026-09-16.md`. Это аудит замысла: продуктовый код,
тесты и миграции не менялись.

## Вердикт

Решение владельца «отказ живёт в главном порте БД» выполнимо, но порт должен
пониматься как единый **типизированный протокол исполнения записи**, а не как две
функции, однажды выдавшие объект БД или пул.

Минимальные условия корректности:

1. Каждый запрос несёт тип операции (`read`/`write`) и для записи — обязательное
   неизменяемое намерение: тарифная механика либо явно одобренное исключение.
2. Контекст запроса создаётся синхронно на входе до первого `await`; намерение
   устанавливается ограниченным `AsyncLocalStorage.run(...)` вокруг конкретной
   операции и не дописывается в общий mutable `Set`.
3. Один физический барьер проверяет запросы `Pool`, выданных `PoolClient`, Drizzle
   поверх клиента и транзакции; контекст принципала и намерения фиксируется при
   открытии транзакции.
4. Для `patient`, `organization`, `clinicBilling`, `integrator`, операторских
   скриптов и фоновых путей есть явная политика, а не неявный пропуск «не staff».
5. API-граница умеет единообразно превратить типизированный отказ в
   пользовательскую фразу. Сейчас такого сквозного пути нет.

Один principal не является достаточным классификатором: под `staff` есть
нетарифные записи, а тарифные записи существуют под `patient` и `organization`.

## 1. Полнота двойного горла

### Что измерено

Переписаны конструкторы соединений, обычные Drizzle-записи, прямые запросы и
переходы от `PoolClient` к Drizzle. Результат:

- для runtime-кода webapp конструктор пула действительно один —
  `apps/webapp/src/infra/db/webappPoolProvider.ts:293`;
- на уровне **получения соединения** запросы webapp проходят через существующие
  провайдеры;
- на уровне **исполнения записи** двух точек недостаточно: после
  `getPool().connect()` код получает `PoolClient` и исполняет `client.query(...)`
  либо создаёт новый Drizzle через `getWebappSqlFromPgClient(client)`;
- отдельный integrator и операторские скрипты не проходят через две функции
  webapp вообще.

### Команды и результаты

```text
$ rg -n "\.(insert|update|delete)\(" apps/webapp/src --glob '!**/*.test.*' | wc -l
693

$ rg -l "\.(insert|update|delete)\(" apps/webapp/src --glob '!**/*.test.*' | wc -l
200

$ rg -n "getPool\(\)" apps/webapp/src --glob '!**/*.test.*' | grep -vc "app-layer/db/drizzle.ts"
74

$ rg -l "getWebappSqlFromPgClient" apps/webapp/src --glob '!**/*.test.*' --glob '!**/*.spec.*' | wc -l
23

$ rg -n "getWebappSqlFromPgClient" apps/webapp/src --glob '!**/*.test.*' --glob '!**/*.spec.*' | wc -l
83

$ rg -n "client\.query|pool\.query" apps/webapp/src --glob '!**/*.test.*' --glob '!**/*.spec.*' | wc -l
19

$ rg -l "client\.query|pool\.query" apps/webapp/src --glob '!**/*.test.*' --glob '!**/*.spec.*' | wc -l
11
```

Проверка конструкторов в runtime webapp:

```text
$ rg -n "\bnew\s+(?:pg\.)?(?:Pool|Client)\b" apps/webapp/src --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/*.devDb.*'
apps/webapp/src/infra/db/webappPoolProvider.ts:293:  const pool = new Pool({
```

Отдельное приложение integrator имеет собственные провайдеры:

```text
$ rg -n "\bnew\s+(?:pg\.)?(?:Pool|Client)\b" apps/integrator/src --glob '!**/*.test.*' --glob '!**/*.spec.*'
apps/integrator/src/infra/db/integratorPoolProvider.ts:91:  const pool = new Pool({
apps/integrator/src/infra/db/integratorMigrationPoolProvider.ts:15:  return new Pool({
```

У скриптов есть прямые подключения к той же БД:

```text
$ rg -n "\bnew\s+(?:pg\.)?(?:Pool|Client)\b" apps/webapp/scripts scripts --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!check-db-chokepoint.mjs' --glob '!prove-error-tracking-load.mjs' | wc -l
16

$ rg -l "\bnew\s+(?:pg\.)?(?:Pool|Client)\b" apps/webapp/scripts scripts --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!check-db-chokepoint.mjs' --glob '!prove-error-tracking-load.mjs' | wc -l
14
```

Это не только read-only инструменты. Например, точечный поиск нашёл реальные
`INSERT`/`UPDATE`/`DELETE` в `seed-content-pages.mjs`,
`backfill-patient-specialist-links.ts` и `user-phone-admin.ts`:

```text
$ rg -n "INSERT|UPDATE|DELETE|\.insert\(|\.update\(|\.delete\(" apps/webapp/scripts/seed-content-pages.mjs apps/webapp/scripts/user-phone-admin.ts apps/webapp/scripts/backfill-patient-specialist-links.ts
apps/webapp/scripts/backfill-patient-specialist-links.ts:193:          `INSERT INTO patient_specialist_links
apps/webapp/scripts/seed-content-pages.mjs:64:        `INSERT INTO content_pages ...
apps/webapp/scripts/user-phone-admin.ts:376:    `DELETE FROM phone_otp_locks ...
apps/webapp/scripts/user-phone-admin.ts:456:      const r = await client.query(`UPDATE ${table} ...
```

Существующий структурный gate запущен через общий замок:

```text
$ /home/dev/brain/host-orch/run-tests.sh "node scripts/check-db-chokepoint.mjs"
check-db-chokepoint: OK
```

Он подтверждает разрешённые фабрики в `src`, но не утверждение, что проверка,
поставленная только на `Pool.query`, охватит `PoolClient.query` и Drizzle поверх
клиента.

### Контрпример и MUST FIX

`apps/webapp/src/infra/db/withClient.ts` выдаёт сырой `PoolClient` после
`pool.connect()`. `apps/webapp/src/infra/db/runWebappSql.ts:43-46` строит над ним
Drizzle. Так работают, в частности,
`apps/webapp/src/infra/repos/pgPatientPayments.ts` и
`apps/webapp/src/infra/adminAuditLog.ts`. Обёртка только `getPool()` или
`Pool.query` не увидит последующие запросы клиента.

**MUST FIX А6:** считать главным портом не две фабрики, а все точки физического
исполнения, включая checked-out client. Иначе достижимая запись через транзакцию
обходит тарифный барьер, что нарушает требование владельца о непроходимой двери.

## 2. Можно ли ограничить проверку тарифными механиками

### Principal к моменту записи

В целевом `port-context` успешный запрос без principal невозможен:
`webappPoolProvider.ts:426` и `portContextRuntime.ts` fail closed при пустом
контексте. Прямая временная проба чистой границы, запущенная через общий замок
без подключения к БД, дала точное число принятых вызовов `0`:

```text
$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec tsx -e \"import { webappPortContextPrincipal } from './src/infra/db/portContextRuntime.ts'; let accepted=0,rejected=0; try { webappPortContextPrincipal(undefined, {}); accepted++; } catch { rejected++; } console.log(JSON.stringify({acceptedWithoutPrincipal:accepted,rejectedWithoutPrincipal:rejected}));\""
{"acceptedWithoutPrincipal":0,"rejectedWithoutPrincipal":1}
```

Статический поиск показывает все три fail-closed места target boundary:

```text
$ rg -n "if \(!principal\)|principal is required" apps/webapp/src/infra/db/webappPoolProvider.ts apps/webapp/src/infra/db/portContextRuntime.ts
apps/webapp/src/infra/db/webappPoolProvider.ts:426:    if (!principal) {
apps/webapp/src/infra/db/webappPoolProvider.ts:427:      throw new Error('A webapp principal is required before selecting a database port');
apps/webapp/src/infra/db/portContextRuntime.ts:329:  if (!principal) {
apps/webapp/src/infra/db/portContextRuntime.ts:593:  if (!principal) {
```

Но principal стоит не **всегда** во всех поддерживаемых режимах. В
`packages/db-principal/src/index.ts:766-769`
`assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal` немедленно возвращает
для любого режима, кроме `locked`; default там же — `legacy-guc`. Legacy/shadow
провайдер поэтому допускает checkout без principal. Число таких **попыток
записи** дерево и текущая телеметрия не дают:
`missingPrincipalSelections` считает все выборы порта вместе, не отделяя read от
write и не записывая call site.

```text
$ rg -n "getCurrentWebappPoolRoutingMetrics|missingPrincipalSelections|poolRoutingMetrics" apps/webapp/src
apps/webapp/src/infra/db/webappPoolProvider.ts:63:  missingPrincipalSelections: number;
apps/webapp/src/infra/db/webappPoolProvider.ts:419:    missingPrincipalSelections += 1;
apps/webapp/src/modules/observability/application/collectCriticalHealthSignals.ts:354:  const poolRoutingMetrics = getCurrentWebappPoolRoutingMetrics();
```

### Почему principal недостаточен

Типы в `packages/db-principal/src/index.ts` включают не только перечисленные в
А6 `staff`, `patient`, `integrator`, `platform`, `bootstrap`, `infra`, но также
`organization` и `clinicBilling`. В А6 для последних нет политики.

Реальные нетарифные записи под `staff`:

- `app/api/doctor/patients/[userId]/email-change/route.ts` — защитная смена
  e-mail;
- `app/api/doctor/patients/route.ts` — обязательный журнал доступа внутри GET;
- `app/api/doctor/booking-engine/patient-packages/[id]/consume/route.ts` — расход
  уже купленного абонемента.

Реальные тарифно-зависимые записи под не-`staff`:

- `app/api/patient/courses/[courseId]/enroll/route.ts` — запись на курс под
  `patient` после проверки механики courses;
- `app/api/patient/reminders/create/route.ts` — создание программы/напоминания
  под `patient`;
- `app/api/payments/patient-acquiring-webhook/[provider]/route.ts` и
  `infra/repos/pgPaymentCaptureUnitOfWork.ts` — изменение состояния платежа под
  `organization`.

Кроме API routes есть server actions. А5 типизирует
`requireDoctorWorkspaceApiContext`, но actions используют другой вход:

```text
$ rg -l "^['\"]use server['\"]" apps/webapp/src --glob '*.ts' --glob '*.tsx' | wc -l
32

$ rg -l "requireEntitlementForMutationAction|requireEntitlementForMutation" apps/webapp/src/app/app --glob '*.ts' --glob '*.tsx' | wc -l
20
```

Например, `app/app/doctor/content/actions.ts` использует
`requireDoctorWorkspaceContext` и action-guard, а не типизируемый А5 API guard.

### Вывод и MUST FIX

Principal отвечает на вопрос «кто исполняет», но не «является ли эта запись
тарифной». Проверять все `staff`-записи нельзя: это заблокирует защитные и
учётные действия. Пропускать все не-`staff` тоже нельзя: реальные patient- и
organization-пути меняют данные тарифных механик.

**MUST FIX А5–А6:** обязательное намерение записи должно приходить от каждого
входа — API, server action, background/integrator adapter — и проверяться портом
независимо от legacy/shadow/port-context routing mode. Одобрение конкретных
исключений остаётся в А7; principal сам исключением быть не может.

## 3. Цена на каждой записи и корректность AsyncLocalStorage

### Измерение

Временный Node benchmark был запущен через общий замок и удалён после прогона.
Семь повторов, медиана:

```text
$ /home/dev/brain/host-orch/run-tests.sh "node tmp-a6-als-bench.mjs"
plain property:                 0.57 ns/op
AsyncLocalStorage.getStore():  5.75 ns/op
getStore() + Set.has():        8.90 ns/op
Promise.resolve outside ALS: 319.85 ns/await
Promise.resolve in ALS + read:381.90 ns/await
```

Это изолированный микрозамер Node, не Next/Turbopack load test. Он показывает,
что одна проверка контекста и ветвление без аллокации дешевле порядка микросекунд
и несопоставимы с сетевым round trip к PostgreSQL. Для multi-row statement цена
должна быть один раз на запрос, не на строку. Аллокация допустима один раз на
request/ограниченную mutation scope; клонировать контекст на каждую строку нельзя.

### Корректность важнее CPU

`mechanicWriteClearance.ts` уже документирует runtime-дефект: первый
`enterWith()` в середине запроса после `await` может не пережить границы кадров
Next/Turbopack. Если А6 впервые создаст свою ALS-метку в DB-порту, он повторит
тот же дефект. Безопасный вариант — создать пустую request-cell до первого
`await`, а намерение передавать через bounded `run(...)`.

Отдельная временная проба реального `mechanicWriteClearance` была запущена через
замок и удалена:

```text
$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec tsx tmp-a6-clearance-probe.ts"
{"siblingObservedGrant":true}
```

Одна ветка `Promise.all` добавила courses в общий mutable `Set`, после чего
соседняя ветка увидела чужое разрешение. Поэтому текущая модель накопительного
Set годится для request-wide факта уже проверенной механики, но не как точное
намерение конкретной записи.

**MUST FIX А6:** не ставить новую late `enterWith()`-метку и не использовать
mutable request-wide Set как write intent. Иначе параллельная нетарифная операция
сможет воспользоваться разрешением соседней тарифной операции.

## 4. Где замысел ломается

### Пакетная запись

Для одного multi-row `INSERT` достаточно одной проверки. Но DB-порт не может
надёжно вывести факт записи из SQL-глагола: named roots часто выглядят как
`SELECT app.some_mutating_function(...)`. Обычный разбор только
`INSERT/UPDATE/DELETE` их пропустит. `runWebappNamedRoot` уже знает имя функции;
именно декларация root/операции должна нести признак mutation и intent.

`packages/platform-merge/src/mergeSql.ts` также исполняет скомпилированные
фрагменты через внедрённый `db.query`. Собственного пула у package нет, но после
получения сырого клиента он попадает в тот же обход физической обёртки.

Точки транзакционного исполнения и Drizzle-on-client переписаны командой:

```text
$ rg -n "runInDrizzleMutationTransaction|runDrizzleMutationTransaction|activeDrizzleMutationTx|getWebappSqlFromPgClient|drizzleOnPgClient" apps/webapp/src/infra/db apps/webapp/src/infra/repos --glob '!**/*.test.*' --glob '!**/*.spec.*'
apps/webapp/src/infra/db/pgAdvisoryLock.ts:6:export function drizzleOnPgClient(client: PoolClient) {
apps/webapp/src/infra/db/drizzleMutationTx.ts:14:export async function runInDrizzleMutationTransaction<T>(...)
apps/webapp/src/infra/db/drizzleMutationTx.ts:23:export async function runDrizzleMutationTransaction<T>(...)
apps/webapp/src/infra/db/runWebappSql.ts:44:export function getWebappSqlFromPgClient(client: PoolClient): WebappSqlExecutor {
... вызовы найдены в pgCourses, pgClinicDirectory, pgComments, pgClinicalTests,
    pgContentSections, pgPatientComorbidities, pgProgramActionLog и других repos
```

### Транзакция и смена principal

`infra/db/drizzleMutationTx.ts` хранит только активный `DrizzleDb` в ALS; вложенный
`runInDrizzleMutationTransaction` повторно использует транзакцию без проверки
principal/intent. Достижимый сценарий:

1. транзакция открыта под `staff`;
2. внутри неё код входит в `organization` или `patient` principal;
3. ambient-проверка в момент statement видит новый principal и пропускает
   staff-правило, хотя физическая транзакция открыта в другом контексте.

Транзакция должна фиксировать `{principal, writeIntent}` при открытии; смена
контекста внутри неё либо запрещается, либо каждый statement проверяется против
снимка транзакции.

### `runInDrizzleMutationTransaction`

Он не является альтернативным полным горлом: при уже активной транзакции просто
вызывает callback с прежним Drizzle. Барьер только вокруг функции открытия
транзакции не увидит последующие записи и не различит несколько намерений внутри
неё.

### `Promise.all`

Фактическая проба выше показала `siblingObservedGrant:true`. Общая mutable cell
делает clearance шире конкретной операции. Bounded immutable context устраняет
этот обход.

### Ретраи

Поиск не нашёл общего автоматического DB transaction retry wrapper в webapp:

```text
$ node /home/dev/brain/tools/code-search.mjs "database transaction retry serialization deadlock retry wrapper" --repo bcb -k 20
```

Найденные retry-механизмы относятся к новым job/request/idempotent попыткам, а
не к прозрачному повтору callback транзакции. Текущего отдельного finding нет.
Контракт А6 всё равно должен требовать повторного входа в bounded intent на
каждой будущей попытке, не переиспользовать прежний clearance.

## 5. Место лучше

### Что проверено

Поиск существующей границы не обнаружил третью готовую полную дверь; он вернул
ровно уже найденные `runWebappSql`, `pgAdvisoryLock`, провайдер пула и их
integrator-аналоги:

```text
$ node /home/dev/brain/tools/code-search.mjs "main database port execute mutation named root PoolClient transaction" --repo bcb -k 10
bcb/apps/webapp/src/infra/db/runWebappSql.ts:41-90
bcb/apps/webapp/src/infra/db/pgAdvisoryLock.ts:1-32
bcb/apps/integrator/src/infra/db/runIntegratorSql.ts:1-50
bcb/apps/integrator/src/infra/db/pgAdvisoryLock.ts:1-50
bcb/apps/webapp/src/infra/db/webappPoolProvider.ts:321-370
```

Не лучшее место **вместо** главного порта, а более точная граница **самого**
главного порта:

1. Типизированный mutation executor принимает discriminated intent, например
   `tariff(mechanic)` или `approvedExemption(id)`; read не платит цену policy
   check.
2. Drizzle `.insert/.update/.delete` и named-root descriptors передают ему тип
   операции; raw client без такой декларации не выдаётся прикладному коду.
3. Декоратор физического `PoolClient.query` является последним fail-closed
   барьером и сверяет снимок principal/intent. Это одна реализация политики, а
   не независимые проверки в `getDrizzle()` и `getPool()`.

Сравнение с предложением А6:

| Ось | Две фабрики | Типизированный главный порт + физический client barrier |
|---|---|---|
| Непроходимость | `PoolClient`/Drizzle-on-client обходят | охвачены pool, client, transaction и injected package query |
| Узость | principal путает тарифные и нетарифные записи | решение задаёт обработчик, порт проверяет обязательность |
| Цена | ALS на каждом запросе, но классификация всё равно неизвестна | один ALS read/branch на statement; без DB-запроса и без per-row работы |

DB trigger/session-GUC хуже по этим осям: таблица не однозначна механике, mutating
`SELECT app.*` требует отдельной разметки, а управление session state в пуле и
транзакциях добавляет риск утечки и лишнюю работу. Это не требуется для
исполнения решения владельца на уровне главного application DB port.

Отдельные процессы integrator и операторские scripts должны либо войти в тот же
типизированный протокол своих портов, либо получить явно одобренный статус вне
А6. Локальный webapp-порт физически не может перехватить их соединения.

## 6. Доходит ли отказ человеческой фразой

### Что существует

- `shared/http/apiResponse.ts` содержит `TypedApiResponseError` и распознаёт его
  в `mapApiError`;
- `respondWithSafeApiError` вызывает `classifyApiError`;
- `errorCodeText.ts` знает `entitlement_required`;
- `notificationText.ts` содержит пользовательскую фразу об отсутствии механики
  в тарифе.

### Что измерено

```text
$ find apps/webapp/src/app/api -name 'route.ts' -print | wc -l
479

$ rg -l "respondWithSafeApiError" apps/webapp/src/app/api --glob 'route.ts' | wc -l
66

$ rg -l "mechanicWriteClearanceRefusalResponse" apps/webapp/src/app/api --glob 'route.ts' | wc -l
2
```

Текущий `MechanicWriteClearanceRequiredError` — обычный `Error`.
`mechanicWriteClearanceRefusalResponse` превращает его в осмысленный ответ только
в двух явных местах. В остальных routes plain infrastructure error попадёт в
fallback `respondWithSafeApiError`/локальный catch либо в 500; универсального
преобразования в тарифную фразу нет.

Даже для `TypedApiResponseError` общий client helper `readSafeApiErrorText`
читает поле `message`, тогда как часть safe API path сохраняет только code.
Наличие `errorCodeText.ts` само по себе не доказывает показ фразы конкретному
пользователю.

Есть и смысловая граница: ошибка «у write нет объявленного intent» не знает
mechanic и не должна притворяться продуктовым отказом. Тарифный guard А5 может
дать точную фразу до записи; отказ самого порта при отсутствующем/несовместимом
intent — programmer/system failure с безопасным сообщением и digest.

**MUST FIX А6:** определить единый типизированный transport port-error до
API-boundary и обязательное отображение. Иначе конкретный путь — например новый
route без локального catch — потеряет смысл и вернёт generic 500, что нарушает
прямое требование плана «отказ должен дойти фразой».

## Сводка обязательных исправлений замысла

1. Охватить `PoolClient.query`, Drizzle-on-client и транзакционный snapshot;
   две фабрики сами по себе не являются execution choke point.
2. Сделать write intent обязательным для всех ingress-вариантов и не выводить
   тарифность из `staff` principal.
3. Создавать ALS-cell до первого `await`, а intent передавать immutable bounded
   scope; не использовать общий mutable Set для разрешения конкретной записи.
4. Добавить единый typed error transport до API/UI либо явно разделить ранний
   продуктовый отказ guard и fail-closed programmer error порта.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. Должна ли гарантия А6 распространяться только на webapp runtime или также на
   отдельный integrator и операторские/backfill scripts? Во втором случае один
   локальный порт webapp физически не является главным для всей БД: одинаковый
   протокол потребуется во всех процессах либо понадобится отдельная DB-level
   граница.
2. Должны ли patient-инициированные тарифные записи (`courses/enroll`, создание
   reminders/program) входить в А6 сейчас? Формулировка плана «patient —
   отдельно» оставляет их вне staff-barrier, хотя это реальные записи механик.
3. Какие категории А7 одобрены как явные исключения: security/account writes,
   access journal, расход уже купленного абонемента, settlement/recovery уже
   оплаченного платежа? Без решения владельца порт должен fail closed, а не
   назначать исключения самостоятельно.

## НЕ СДЕЛАНО

- Не реализована А6, не менялись продуктовый код, тесты, схема, миграции и
  privileges.
- Не запускались миграции и живые пробы против DEV; TEST и PROD не затрагивались,
  второй Next-сервер не поднимался, полный CI не запускался.
- Не получено число **попыток write** без principal: текущий счётчик
  `missingPrincipalSelections` смешивает reads и writes и не хранит call site.
  Прямой пробой подтверждено только число принятых target port-context boundary
  вызовов без principal — `0`; legacy/shadow допускают такой checkout. Для
  точного числа write-попыток нужна временная инструментализация уже
  типизированного write path, которого А6 пока не имеет.
- Не проводился production-like Next/Turbopack throughput/load test. Выполнен
  только удалённый после прогона Node microbenchmark; его результат достаточен
  для оценки порядка CPU-цены, но не является SLO-доказательством.
- Не принимались продуктовые решения А7: перечисленные исключения оставлены
  владельцу.
