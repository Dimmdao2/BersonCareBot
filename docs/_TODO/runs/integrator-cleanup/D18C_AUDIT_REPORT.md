# D18c — адверсарный аудит (коммит `d4ad54069`, ветка `wt/d18c-census`)

Аудитор независимый от исполнителя. Отчёт исполнителя и зелёные тесты доказательством не считались —
проверялось дословностью diff, чтением инфраструктуры принципала/транзакций и живой поломкой продуктового
кода с прогоном тестов. `directPublic/*` не трогался. Дерево на момент сдачи чистое (все внесённые поломки
откачены `git checkout --`, проверено `git diff` по каждому мутированному файлу — 0 строк).

## 1. Дословность SQL — по каждому из 12 diff-ов

| # | Файл | Вердикт |
|---|------|---------|
| 1 | `publicRestrictedSettings.ts` | OK. 0 параметров, текст запроса дословно перенесён. |
| 2 | `publicRuntimeSettings.ts` | OK. 1 параметр, порядок тривиален (один слот). |
| 3 | `repos/messageLogs.ts` | OK. 9 параметров, порядок `$1..$9` → `intentType, intentEventId, correlationId, channel, status, attempt, reason, payloadJson::jsonb, occurredAt::timestamptz` — 1:1 с исходным `[…]`-массивом, касты сохранены. |
| 4 | `repos/operatorDeliveryAttempts.ts` | OK. 5 параметров `$1..$5` → `eventId, channel, status, attempt, reason` — совпадает дословно. |
| 5 | `repos/outgoingDeliveryScope.ts` | OK, 3 функции. Касты `::uuid` сохранены на всех трёх запросах. |
| 6 | `repos/schedulerReminderOrganizations.ts` | OK. 0 параметров. |
| 7 | `writePort.ts` (4 места) | OK, включая нетривиальный случай: исходный текст `WHERE i.resource = $2 AND i.external_id = $1` с массивом `[channelUserId, resource]` — параметры пронумерованы «наоборот» относительно порядка объявления, но семантически `$2→resource, $1→channelUserId`. Новый код `WHERE i.resource = ${resource} AND i.external_id = ${channelUserId}` — тот же СМЫСЛ (resource на resource, channelUserId на external_id), несмотря на то что визуально номера убраны. Проверено поломкой (см. §3, пункт 3) — тест поймал обратную перестановку. |
| 8 | `kernel/domain/executor/handlers/reminders.ts` (2 запроса) | OK дословно. Но обе функции недостижимы под тестами (см. §3, пункт 6) — `catalogDb = null` при `NODE_ENV==='test'`. |
| 9 | `operationalPoolReadiness.ts` | OK дословно (`BEGIN READ ONLY` / цикл `statements` / `ROLLBACK` — те же три шага). Граница транзакции — см. §2. |
| 10 | `pgSaasIsolationDiagnostics.ts` (webapp, 5 функций) | OK. Текст и `params`-массивы НЕ тронуты этим коммитом вообще — только обёртка `pool.query(...)` → `runPgPoolPgText(pool, text, params)`. Риска пересборки нумерации здесь структурно нет (это тот же `$n`-текст, тот же массив). |
| 11 | `pgCuratedSystemHealthDiagnostics.ts` (webapp) | OK, аналогично — 0/0 параметров в обеих функциях. |
| 12 | `pgPlatformAccess.ts` (webapp) | OK. Один параметр, каст `::uuid` сохранён. См. риск §2.2 (другой executor). |

Вывод по дословности: **нарушений текста/каста/порядка параметров не найдено**. Единственный визуально
подозрительный случай (writePort.ts, «переставленные» `$1/$2`) при разборе оказался семантически верным
и в дальнейшем подтверждён поломкой-и-тестом.

## 2. Нумерация параметров, граница транзакции, принципал (статический разбор)

**2.1 `runIntegratorSql` (мост интегратора).** Компилирует drizzle-фрагмент через `PgDialect.sqlToQuery`,
затем либо исполняет на `db.integratorDrizzle` (если это TX-порт), либо падает на `db.query(text, params)`.
`db.integratorDrizzle` создаётся в `client.ts:170` как `drizzle(client, …)` НА ТОМ ЖЕ `PoolClient`, что и
`txPort.query`, — т.е. это тот же самый чекаут пула, не новое подключение. Принципал применяется ДО создания
`integratorDrizzle` (`prepareIntegratorTransactionClient(client)` на строке 169, а `integratorDrizzle` — на
170) — следовательно перевод вызова с `client.query` на `integratorDrizzle.execute` не может поменять
принципал: он уже стоит на соединении к моменту вызова. Вне транзакции (`db` верхнего уровня без
`integratorDrizzle`) `runIntegratorSql` всегда падает на `db.query`, что идентично поведению до правки —
для затронутых файлов (`publicRestrictedSettings`, `publicRuntimeSettings`, `messageLogs` — все три вызываются
с верхнеуровневым `db`, не с TX-портом) принципал накатывается по прежней схеме — за-checkout вызов
`checkoutIntegratorPoolClient` → `prepareIntegratorClient` (см. `withClient.ts:188-199`), сам механизм
конверсией не тронут.

**2.2 webapp `runWebappPgText`/`getDrizzle()`.** `getDrizzle()` строит `drizzle(getPool(), {schema})` —
ТОТ ЖЕ `pg.Pool`, что и прямой `getPool().query(...)`. Принципал применяется через инструментацию пула
(`installPrincipalAwarePoolQuery`, читает `getCurrentDbPrincipal()` на каждый физический `client.query`), и
`getDrizzle()`'s `execute`/`select` дополнительно обёрнуты `withIssueTimePrincipalReads` — синхронный снимок
принципала в момент вызова, реплеится через `runWithDbPrincipalSnapshot` в момент реального `.then()`. Это
существующая (не новая для D18c), задокументированная инфраструктура (комментарии про taskdb #821) — три из
трёх переведённых webapp-файлов используют либо этот путь (`pgPlatformAccess.ts`, дефолтный `getWebappSqlDb()`),
либо явный `runPgPoolPgText(pool, …)` с тем же самым pool-объектом, что раньше (`pgSaasIsolationDiagnostics.ts`,
`pgCuratedSystemHealthDiagnostics.ts`). Подмены принципала конверсией не найдено.

**2.3 Граница транзакции `operationalPoolReadiness.ts`.** `drizzle(client)` в `drizzle-orm/node-postgres`
хранит переданный `client` как `this.client` и исполняет запросы непосредственно на нём (проверено чтением
`node_modules/.../drizzle-orm/node-postgres/session.cjs` — `NodePgPreparedQuery` держит `client`, новый
пул не чекаутится). Поскольку `client` здесь — тот же `PoolClient`, возвращённый `withIntegratorPoolClient`,
`BEGIN READ ONLY` / `statements` / `ROLLBACK` гарантированно идут на одном соединении. **Это статическое
доказательство, НЕ доказательство поломкой** — см. находку в §4.

## 3. Поломка → тест → красное/НЕ ПОЙМАНО → откат

Каждая строка — реальная мутация продуктового кода, прогон `pnpm test` (integrator: 234/247 базовых зелёных;
webapp: 410/413 базовых зелёных), затем `git checkout --` с подтверждением 0-строчного diff.

| # | Файл / мутация | Тест | Результат | Откат |
|---|---|---|---|---|
| 1 | `operatorDeliveryAttempts.ts`: `channel`↔`status` в вызове `record_operator_delivery_attempt` | весь integrator suite | **234/234 прошли — НЕ ПОЙМАНО** (0 тестов ссылаются на `recordOperatorDeliveryAttempt`) | ✅ откачено |
| 2 | `outgoingDeliveryScope.ts`: снят каст `::uuid` у `resolveOutgoingDeliveryScope` | весь integrator suite (включая `outgoingDeliveryWorker.scope.test.ts`, который мокает именно эту функцию) | **НЕ ПОЙМАНО** — мок-`DbPort` в тесте матчит по `sql.includes('app.resolve_outgoing_delivery_scope')` и подставляет канонiчный `scope` независимо от реального текста/каста | ✅ откачено |
| 3 | `writePort.ts`: в блоке привязки телефона (строка ~409, транзакционный `idPeek`) поменял местами `resource`↔`channelUserId` | весь integrator suite | **КРАСНОЕ**: `messengerPhoneLink.identity.test.ts` — 4 упавших теста (`userPhoneLinkApplied` разошёлся, `phoneLinkReason` стал `no_integrator_identity` вместо ожидаемого) | ✅ откачено |
| 4 | `writePort.ts`: та же перестановка в ветке `buildChannelAnchorWriter` (max-канал, строка ~203) | весь integrator suite | **НЕ ПОЙМАНО** | ✅ откачено |
| 5 | `writePort.ts`: та же перестановка в блоке `notifications.update`→topics (строка ~1198) | весь integrator suite | **НЕ ПОЙМАНО** | ✅ откачено |
| 6 | `reminders.ts`: `is_published = true`→`false` в `content_pages`-запросе | весь integrator suite | **НЕ ПОЙМАНО** — код мёртв под тестами: `catalogDb = process.env.NODE_ENV==='test' ? null : createDbPort()`, `resolveLinkedTitle` возвращает `null` сразу при `!catalogDb` | ✅ откачено |
| 7 | `messageLogs.ts`: `intentEventId`↔`correlationId` в `record_global_email_delivery_attempt` | весь integrator suite | **НЕ ПОЙМАНО** (0 тестов на `insertDeliveryAttemptLog`) | ✅ откачено |
| 8 | `pgPlatformAccess.ts` (webapp): снят каст `::uuid` у `pu.id = $1` | весь webapp suite | **НЕ ПОЙМАНО** (0 тестов на `pgPlatformAccessPort`/`loadCanonRow`) | ✅ откачено |
| 9 | `operationalPoolReadiness.ts`: транзакционная граница | — | **НЕ ПРОВЕРЯЕМО** в этой песочнице: 0 тестов ссылаются на файл, живой Postgres в окружении есть, но без рабочих учётных данных (`peer authentication failed`, `no pg_hba.conf entry`) — воспроизводит собственное признание коммита «no dev-DB access in this sandboxed session». Границу подтверждает только статический разбор §2.3. | н/п |

**Итог по поломкам:** 6 из 9 попыток — «непойманная поломка» (файл держится на честном слове, без юнит-теста
вообще: `operatorDeliveryAttempts`, `outgoingDeliveryScope` — каст, 2 из 3 сайтов `writePort.ts`, `reminders.ts`,
`messageLogs.ts`, `pgPlatformAccess.ts`). Один сайт `writePort.ts` — реально покрыт и красится. Один файл
(`operationalPoolReadiness.ts`) не тестируем в принципе в этой среде.

## 4. Транзакционная граница `operationalPoolReadiness.ts` — статус

Доказательство границы (§2.3) статическое, не эмпирическое: нет ни юнит-, ни dev-DB-теста, который бы
провалился при разрыве `BEGIN READ ONLY`/`ROLLBACK` на разные соединения. Само по себе поведение сейчас
КОРРЕКТНО (drizzle-orm с `PoolClient`-аргументом не чекаутит новое соединение — фиксировано в исходниках
библиотеки), но конверсия добавила недоказанную поверхность: если кто-то в будущем передаст `drizzle(pool)`
вместо `drizzle(client)` в этом файле, ничего в тестовом наборе не покраснеет. **Находка, не блокирующая
приземление** (поведение сейчас верно), но фиксирую как вопрос лиду — можно ли это дожать хотя бы юнит-тестом
на фейковом `PoolClient`, считающим число `.connect()` вызовов на пул.

## 5. Гейт (`check-no-new-raw-sql.mjs`) — честность

- Манифест: интегратор 22→13, вебапп 35→32 — совпадает и с текстом коммита, и с реальным подсчётом записей
  `Set` до/после (`git show d4ad54069^:...` vs `HEAD`), и с выводом самого скрипта (`integrator manifest
  files: 13; webapp manifest files: 32`).
- Скрипт — честная AST-проверка (`ts.createSourceFile` + обход вызовов `.query(`), не текстовый grep; она
  сама флагует «stale debt» (запись в манифесте без реального сырого вызова) и «offenders» (сырой вызов вне
  манифеста) и упала бы, если бы 12 файлов из diff всё ещё содержали `.query(` вне обёртки. Прогон на HEAD
  вернул `OK` — не смолчал бы.
- Прямая проверка: ни один из 12 сконвертированных файлов не содержит `pool.query(`/`.query(text, params)`
  за пределами `runIntegratorSql`/`runWebappPgText`/`runPgPoolPgText` (подтверждено чтением каждого diff в §1).

**Вывод: гейт не подкручен, ужат по факту.**

## 6. Отказы от конверсии — по каждому из 7 оставшихся файлов, отдельно от `directPublic`

(`directPublic/*` — 7 физических файлов в каталоге, отдельный воркстрим владельца, не входят в этот разбор.)

| Файл | Заявленная причина | Вердикт |
|---|---|---|
| `apps/integrator/.../repos/projectionHealthCore.ts` | «CLI-скрипт на голом pg.Pool» | **НАСТОЯЩАЯ.** Вызывается и из HTTP-пути (`projectionHealth.ts`, через `DbPort`), и из `infra/scripts/projection-health.ts`, который строит СВОЙ независимый пул через `createProjectionHealthPoolProvider(url)` — не завязан на `DbPort`/drizzle-мост приложения вовсе. |
| `apps/webapp/.../repos/broadcastChannelCounts.ts` (`getChannelCountsByUserIds`) | «Drizzle ANY array workaround» (комментарий в файле: «uses getPool() for array param binding») | **ЛОЖНАЯ, ОПРОВЕРГНУТА КОДОМ.** `runWebappPgText`/`runPgPoolPgText` УЖЕ поддерживает ровно этот паттерн — `pgDoctorClients.ts:322` вызывает ``runWebappPgText(`... WHERE user_id = ANY($1::uuid[])`, [userIds])`` в проде прямо сейчас. Причина устарела/неверна; файл — настоящий необоснованный остаток сырого SQL. |
| `apps/webapp/.../repos/pgAdminPlatformUserStats.ts` | «`pool.query` напрямую: uuid[] в `<> ALL($n::uuid[])` ломается через drizzle `sqlToQuery`» (комментарий в файле) | **ЛОЖНАЯ, ТОТ ЖЕ КОРЕНЬ.** `ALL(...)`/`ANY(...)` — тот же bind-механизм (`sql.param()` оборачивает массив в один позиционный параметр независимо от окружающего SQL-оператора); контрпример из `pgDoctorClients.ts` опровергает и этот случай. |
| `apps/webapp/.../repos/pgCanonicalPlatformUser.ts` | «общие raw-pg транзакционные соединения» | **НАСТОЯЩАЯ.** Сигнатуры принимают `db: Pool | PoolClient`; реальные вызывающие (`pgUserProjection.ts` и др.) передают именно открытый `PoolClient` посреди своей транзакции — перевод на `runWebappPgText`'s дефолтный `getWebappSqlDb()` увёл бы запрос на другое соединение. |
| `apps/webapp/.../repos/pgMessengerPhoneHttpBind.ts` | «общий контракт `PlatformMergeDbClient`» | **НАСТОЯЩАЯ, но файл уже эффективно переведён.** Публичный `TxQuery.query(sql, params)` — это форма, которую требует `@bersoncare/platform-merge`; ВНУТРИ `createTxQuery`/`poolAsMessengerPhoneBindDb` вызовы уже идут через `runWebappPgText`/`runPgPoolPgText`/`getWebappSqlFromPgClient`. АСТ-сторож просто не умеет заглянуть за интерфейс — законная обёртка, а не долг. |
| `apps/webapp/.../infra/upsertBroadcastDefaultsAfterChannelBind.ts` | «использовать тем же клиентом пула/транзакции, что и INSERT binding» (комментарий в файле) | **НАСТОЯЩАЯ**, тот же класс, что и `pgCanonicalPlatformUser.ts`. |
| `apps/webapp/.../modules/auth/sessionRevocationSchema.ts` | «нет доступа к dev-DB для проверки» / по факту — «CLI/bootstrap-скрипт на голом pg.Pool» | **НАСТОЯЩАЯ.** `probeSessionRevocationColumn` создаёт СОБСТВЕННЫЙ `new Pool({max:1})` до инициализации остальной инфры — это pre-boot проверка схемы, использовать общий мост здесь методологически нельзя (circular: проверка «безопасно ли использовать схему» не может опираться на путь, который сама же должна разрешить). |

**Итог по отказам: 5 из 7 — настоящие, 2 из 7 — ложные/устаревшие оправдания**, опровергнутые действующим
кодом этого же коммита/репозитория (`pgDoctorClients.ts` уже решает именно ту проблему, на которую ссылаются
`broadcastChannelCounts.ts` и `pgAdminPlatformUserStats.ts`).

## 7. Находка без пункта плана (вопрос лиду, не задача)

«Session census» (упомянутая в тексте коммита как источник полной поимённой таблицы) не найдена нигде в
репозитории — ни в `docs/_TODO/runs/integrator-cleanup/`, ни как untracked-файл. Формально план (D18c)
требует «перепись поимённо с классификацией», и коммит на неё ссылается, но артефакт отсутствует. Не блокирую
приземление этим (сам код и его тестируемость проверены напрямую), но фиксирую как вопрос — если census
существовал только в диалоге агента и не был сохранён, это стоит починить до финального закрытия D18c
(«пункт закрывается тем, что проверка перестаёт находить исключения, а не отчётом» — без письменной переписи
эта часть требования не выполнена формально).

## Итог

**PASS (приземлять), с двумя пунктами на дожим, не блокирующими:**

1. Два из семи «легитимных» отказов (`broadcastChannelCounts.ts`, `pgAdminPlatformUserStats.ts`) держатся на
   опровергнутой codebase же причине — оба технически конвертируемы прямо сейчас тем же приёмом, что уже
   применён в `pgDoctorClients.ts`. Не входит в объём диффа `d4ad54069`, но подрывает доверие к разделу
   «обоснованные отказы» — фактическая перепись (§7) должна это отразить.
2. `operationalPoolReadiness.ts` — граница транзакции верна СЕЙЧАС (статически доказано), но не защищена ни
   одним тестом; будущая правка может её сломать незаметно.

Сама конверсия 12 файлов в этом коммите — семантически пустая: дословность SQL, нумерация параметров,
принципал и (где применимо) транзакционная граница подтверждены чтением и (где было покрытие) поломкой.
Единственная находка КАЧЕСТВА конверсии — не в самих 12 файлах, а в честности классификации остатка
(раздел 6) и в отсутствующем артефакте переписи (раздел 7).
