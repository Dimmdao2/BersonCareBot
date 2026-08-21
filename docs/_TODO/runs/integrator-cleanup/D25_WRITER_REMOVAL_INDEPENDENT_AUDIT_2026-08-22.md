# D25 — независимый аудит удаления integrator identity/contact writers (2026-08-22)

**Роль:** `auditor-live`, независимый (не автор кандидата).
**Бриф:** `docs/_TODO/runs/briefs/D25_INTEGRATOR_IDENTITY_WRITER_REMOVAL_INDEPENDENT_AUDIT_BRIEF_2026-08-22.md`.
**Кандидат:** `wt/d25-remove-integrator-identity-writers-20260821`, product `ef42f0129`, head после мержа
`feat/doctor-ui-rebuild` — `a81f354b1` (бриф называл `adba7f1ab`; аудит выполнен на текущем head).
**Diff:** `git diff origin/feat/doctor-ui-rebuild...HEAD` — 10 файлов, +335/−940.

**ВЕРДИКТ: FAIL.** Одна достижимая regression владельческого требования (K5) и одна конкретная
regression человеческой процедуры ручного мержа (K8). Part C — **BLOCKED** (внешняя, не D25, причина).

---

## Authority (дословно, `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`)

- стр. 282, **Р-D25 (владелец, 31.07)**: «интегратору остаётся только доставка входа, а создание учётки,
  доверие к телефону и синхронизация личности — вебаппу».
- стр. 1134, **D25**: «D25 — идентичность: интегратору остаётся только доставка входа».
- стр. 595, **D15b/2**: «достижимые `writePort.ts` `user.upsert` → `writeIdentityAndPreferencesDirect` и
  `user.phone.link` → `applyMessengerPhonePublicBind` всё ещё записывают каноническую
  идентичность/контакты из интегратора» … «После удаления двух оставшихся writer-путей живая проверка
  обязана гонять ДВА вебхука, а не один».
- стр. 285, **Р-D26 (владелец, 31.07)**: мерж решается не интегратором.

---

## Шаг 0 — kill-set «тест или взгляд» (составлен ДО чтения тестов кандидата)

| # | Названная поломка | §24.4 | Вердикт |
|---|---|---|---|
| K1 | Остался достижимый путь, которым интегратор пишет каноническую идентичность/контакты мимо точного named root | взгляд | **PASS с одной названной остаточной записью (owner question)** |
| K2 | Удалённые символы не caller-free / вместе с ними ушло то, на что опирается живой человек | взгляд | **PASS** |
| K3 | Повреждён `packages/platform-merge` или сторона вебаппа | взгляд | **PASS** |
| K4 | Нарушен §5: второй способ делать то же самое / новая обёртка-гейт | взгляд | **PASS** |
| K5 | `user.upsert` / `user.phone.link` под НЕ-bootstrap принципалом (integrator/organization) перестают работать вовсе | тест | **FAIL — подтверждено** |
| K6 | Транзиентный сбой БД молча превратился в ОПРЕДЕЛЁННЫЙ отказ вместо indeterminate | тест | **PASS** |
| K7 | Отказ по конфликту перестал быть внешне нейтральным / перестал быть fail-closed | тест | **PASS** |
| K8 | Конфликт перестал давать один durable repeat-aware случай `admin_audit_log` для человека-ревьюера | тест | **FAIL — подтверждено (сужение до одного candidate id)** |
| K9 | Неоднозначный мерж молча теряется или решается интегратором (D26) | тест | **PASS** |
| K10 | Part C: два живых вебхука на именованной DEV с существующей учёткой | взгляд | **BLOCKED** |

---

## Part A — «взгляд»: реально ли и полно ли удаление

### K1. Перечисление оставшихся writer-путей (не имена файлов — вызовы)

Как искал (по правилу «нет без списка мест, где искал»):

```bash
node /home/dev/brain/tools/code-search.mjs "user.upsert mutation dispatch runWithBootstrapPrincipal webhook" --repo bcb
grep -rnE "(INSERT INTO|UPDATE|DELETE FROM)[[:space:]]+(public\.)?(platform_users|user_channel_bindings|user_contacts|user_identity|user_phone_history|user_channel_preferences|notification_topics|user_notification_topics)" apps/integrator/src --include=*.ts | grep -v '\.test\.'
grep -rhoE "'app\.[a-z_]+\([^)]*\)'" apps/integrator/src --include=*.ts | grep -v test | sort -u
grep -rn "writeIdentityAndPreferencesDirect|mergeCandidateIdsViaPlatformMerge|applyMessengerPhonePublicBind|MessengerPhoneLinkError" --include=*.ts apps/ packages/
```

Результат — перечисление **непустое ровно на одну запись**:

1. `writePort.ts` `user.upsert` → `upsertBootstrapChannelIdentity` → `app.integrator_upsert_channel_identity(text,text,text)`
   (`writeIdentityAndPreferencesDirect.ts:34-60`) — точный named root, релационной транзакции не открывает
   (`runIntegratorNamedRoot` отвергает уже открытую TX, `runIntegratorSql.ts:52-54`).
2. `writePort.ts` `user.phone.link` → `bindBootstrapMessengerPhone` → `app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)`
   (`directPublic/bootstrapMessengerPhoneBind.ts:11-42`) — то же.
3. **Остаточная запись, НЕ закрытая кандидатом:** `apps/integrator/src/infra/db/repos/userChannelBotBlocked.ts:41-50`
   — `INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id, bot_blocked_at, bot_blocked_reason) … ON CONFLICT DO UPDATE`.
   Достижима из delivery-пути, когда одновременно известны `platformUserId` и `externalId`, а строки привязки
   нет: тогда интегратор СОЗДАЁТ каноническую строку привязки канала, а не только помечает доставку.
   **Это НЕ finding:** чекбокс D15b/2 владельца перечисляет ровно два writer-пути, и этот в него не входит.
   Классифицирую как **owner question** (§24.6): считать ли `bot_blocked`-INSERT «синхронизацией личности»
   в смысле Р-D25 или доставочным фактом; я работу из этого не завожу.

Никаких других записей в `platform_users` / `user_channel_bindings` / `user_contacts` / topic-таблицы из
`apps/integrator/src` нет — ни сырым SQL, ни через Drizzle, ни через named root (полный список из 29 named
roots интегратора не содержит других identity/contact-корней).

### K2. Удаления caller-free; что теряет человек

`mergeCandidatesDirect.ts`, `repos/messengerPhonePublicBind.ts` удалены целиком; `writeIdentityAndPreferencesDirect`
и записи `identity-upsert`/`phone-bind` в `directPublic/writePort.ts` — удалены. Ссылок на удалённые символы в
активном коде не осталось (единственные упоминания — комментарии и один тест, см. ниже).

Что человек теряет вместе с ними — и это существенно:

- старый путь при конфликте телефона отдавал в `admin_audit_log` **оба** id (`mapMergeFailure(err, [platformUserId, otherPhone])`,
  `packages/platform-merge/src/messengerPhonePublicBind.ts:401`; `[platformUserId, preferredCanonicalId]:260`;
  `[idA, idB]:211`). Новый путь всегда отдаёт один. Подробно — K8 ниже.
- старый путь сам ВЫПОЛНЯЛ мерж (`mergePairIfDistinct`). Его исчезновение — не потеря, а прямое исполнение
  Р-D26: новый SQL-корень переносит привязку только когда исходная запись доказуемо пустая
  (нет ФИО/контактов/истории/enrollments/членств/других привязок — миграция `20260821T040000_cut_over_canonical_contacts.sql:1565-1601`),
  иначе возвращает `merge_blocked_distinct_real_users`. Это не решение о мерже двух живых людей.

### K3. `packages/platform-merge` и вебапп

`packages/platform-merge` не тронут (в diff его нет). Вебапп продолжает звать движок напрямую:
`apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts:12,104,114`
(`applyMessengerPhonePublicBind` / `MessengerPhoneLinkError` из `@bersoncare/platform-merge`). **PASS.**

Замечание (рекомендация, не finding): `apps/integrator/src/infra/db/messengerPhonePublicBind0380.unit.test.ts`
остался в интеграторе и тестирует функцию, которая теперь принадлежит только вебаппу. Место теста — не требование
владельца; переносить его — решение лида.

### K4. §5 — один общий проход

Второго способа не появилось: обе мутации идут через один и тот же `runIntegratorNamedRoot`, ветвление по
принципалу (`getCurrentDbPrincipal()?.kind === 'bootstrap' ? … : …`) удалено, `writeDirectPublic` больше не
знает операций `identity-upsert`/`phone-bind`. Новых обёрток/гейтов/дублей нет. **PASS.**

---

## Part B — «тест»: контракты поведения

Новые acceptance-тесты аудитора (пишутся один раз, §24.5):

- `apps/integrator/src/infra/db/writePort.identityRootReachability.audit.test.ts`
- `apps/integrator/src/infra/db/writePort.phoneLinkConflictContract.audit.test.ts`

### K5 — FAIL. Точные корни недостижимы под теми принципалами, которые ставит вебхук

**Названная поломка:** Telegram-обновление от человека, у которого уже разрешена клиника
(`telegram/webhook.ts:372-378` — `runWithIntegratorPrincipal`, иначе `runWithOrganizationPrincipal`),
не создаёт привязку канала и не привязывает подтверждённый контакт: `user.upsert` бросает,
а `user.phone.link` возвращает «транзиентный» отказ, которого ретрай никогда не вылечит.

Почему так. Кандидат зовёт named root напрямую, без `writeDirectPublic`, и опирается на комментарий
«one exact named root … for every principal — bootstrap and organization/integrator alike»
(`writePort.ts:249-251`, `:288-294`). В боевом режиме (`DB_PRINCIPAL_CONTEXT_MODE=port-context` —
именно он в DEV, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` §1) каждый `db.query` сначала проходит
`integratorPortContextPrincipal` (`portContextRuntime.ts:187-266`). Обе способности объявлены как
`contextClass=integrator`, `targetRole=app_integrator_resolver`
(`deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql:37-38`), а этот слой:

- под `integrator`-принципалом находит способность и затем бросает
  `Integrator resolver capability requires a bootstrap principal` (`portContextRuntime.ts:258-261`);
- под `organization`-принципалом требует `contextClass === 'tenant_service'`, совпадений ноль, бросает
  `Missing unique declared integrator port capability for …` (`portContextRuntime.ts:208-229`).

То же требование продублировано в самой SECURITY DEFINER функции:
`PERFORM app.require_accepted_context('app_seam_phone_binding_owner', 'app_integrator_resolver', 'integrator', 'integrator.bootstrap-phone-bind', …)`
(`apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql:1461`).

Тесты кандидата этого не видят: `bootstrapChannelIdentityRoot.unit.test.ts` подаёт рукописный `DbPort`,
чей `query()` возвращает заготовленную строку, — фейк стоит НИЖЕ решающего слоя, поэтому зелёный при сломанном
продукте (ровно §10a «тест, зелёный вне зависимости от реальной поломки»).

Доказательство — тот же продуктовый вызов через настоящий port-context пул с настоящими объявленными
дескрипторами (физический клиент фейковый, слой — нет):

```
pnpm --dir apps/integrator exec vitest run src/infra/db/writePort.identityRootReachability.audit.test.ts
```

```
✓ control: user.upsert writes the channel identity for an unresolved-org (bootstrap) webhook
× user.upsert writes the channel identity when the clinic AND integrator user are resolved
    Error: Integrator resolver capability requires a bootstrap principal
× user.upsert writes the channel identity when only the clinic is resolved
    Error: Missing unique declared integrator port capability for app.integrator_upsert_channel_identity(text,text,text)
× user.phone.link binds the confirmed contact when the clinic AND integrator user are resolved
    expected { userPhoneLinkApplied: false, phoneLinkIndeterminate: true, phoneLinkReason: 'db_transient_failure' }
             to deeply equal { userPhoneLinkApplied: true }
× user.phone.link binds the confirmed contact when only the clinic is resolved   (то же)
Tests  4 failed | 1 passed (5)
```

Положительный контроль (bootstrap) зелёный — значит стенд верен, и красное относится к продукту, а не к стенду.

Побочный эффект той же причины: постоянный конфигурационный отказ доезжает до внешнего результата как
`phoneLinkIndeterminate: true` + `phoneLinkReason: 'db_transient_failure'` (`writePort.ts:341-365`), то есть
как «повторяемо» — ретраи будут вечными.

**Границы исправления (не расширять):** сделать корни достижимыми под теми принципалами, под которыми их
реально зовут, через существующий шов (например, вернуть вход в уже разрешённый принципал так, как это делали
`writeDirectPublic`-операции, либо объявить недостающую способность). НЕ вводить второй способ записи, широкую
relation-способность, HTTP-переход или второе хранилище.

### K6 — PASS. Транзиентный сбой остаётся indeterminate

`user.phone.link` при оборванном соединении отдаёт
`{ userPhoneLinkApplied: false, phoneLinkIndeterminate: true, phoneLinkReason: 'db_transient_failure' }`
(`writePort.ts:341-365`) — контракт сохранён.

**Fault injection (класс 1 из 2):** временно убрал `phoneLinkIndeterminate: true` из этой ветки →
`× reports a dropped connection as indeterminate, not as a definite refusal` (2 failed | 2 passed). Откачено.

### K7/K9 — PASS. Отказ нейтрален, fail-closed, мерж не решается интегратором

`{ userPhoneLinkApplied: false, phoneLinkReason: <code> }` без перечисления кандидатов наружу; при
`merge_blocked_ambiguous_candidates` записи нет, отказ есть. Четыре кода корня
(`no_channel_binding`, `phone_owned_by_other_user`, `merge_blocked_ambiguous_candidates`,
`merge_blocked_distinct_real_users`) все входят в `PhoneLinkFailureReason` (`kernel/contracts/ports.ts:86-101`),
так что `as PhoneLinkFailureReason` на достижимом множестве корректен.

**Fault injection (класс 2 из 2):** временно сделал отказную ветку fail-open (`userPhoneLinkApplied: true`) →
3 из 4 тестов красные. Откачено; `git diff -- apps/integrator/src/infra/db/writePort.ts` пуст.

### K8 — FAIL. Ручной ревьюер больше не видит вторую учётку

**Названная поломка:** человек, которому Р-D26 отдаёт решение о мерже, открывает
`messenger_phone_bind_blocked` и видит только исходную учётку; с кем именно столкнулся номер — не видно.
Дополнительно `conflict_key` — это sha256 отсортированных candidate ids
(`repos/messengerPhoneBindAudit.ts:47-57`), поэтому два РАЗНЫХ конфликта с одним источником и разными
владельцами номера схлопываются в одну строку с инкрементом `repeat_count`: второй случай исчезает.

Кандидат: `candidateIds: bindResult.platformUserId ? [bindResult.platformUserId] : []` (`writePort.ts:311`),
и `platform_user_id` корня в конфликтных ветках — всегда `v_source_user_id`
(миграция `…:1509`, `:1517`, `:1544`, `:1562`). Старый путь отдавал оба id (ссылки выше).

```
× leaves one durable manual-review case naming BOTH colliding accounts
    expected [ '…0111' ] to deeply equal [ '…0111', '…0222' ]
```

Условие `if (reason && organizationId)` (`writePort.ts:308`) само по себе **не** regression: старый
`writeDirectPublic('admin-audit-write')` под bootstrap тоже писал бы `organization_id = NULL` и падал на
собственном WITH CHECK RLS. Но вместе с K5 это даёт худший итог: единственный принципал, под которым код
сейчас вообще доходит до корня, — bootstrap, а под ним `organizationId` всегда NULL, то есть durable-случай
не пишется НИКОГДА. Оба пункта чинятся одним исправлением K5 плюс возвратом второго id.

Исправление K8 требует, чтобы корень отдавал контрагента (сейчас он его не возвращает). Это правка вне
`apps/integrator` — **вопрос лиду/владельцу о границах правки**, а не расширение скоупа аудитом.

---

## Part C — живая проверка двумя вебхуками: **BLOCKED**

Что делал (изолированный процесс на свободном порту 4271, общие 4200/5200 не занимал):

```bash
cp /home/dev/dev-projects/BersonCareBot/.env .env
cp /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev apps/webapp/.env.dev
PORT=4271 NODE_ENV=development apps/integrator/node_modules/.bin/tsx apps/integrator/src/main.ts
curl -s http://127.0.0.1:4271/health          # {"ok":true,"db":"up"}
curl -X POST http://127.0.0.1:4271/webhook/telegram …   # 404 Route POST:/webhook/telegram not found
```

**Препятствие 1.** На именованной DEV Telegram сконфигурирован `mode=long_polling`, поэтому `registerRoutes`
сознательно НЕ регистрирует HTTP-маршрут вебхука (`app/routes.ts:202-210`) — оттуда 404. Живой эквивалент —
`processTelegramUpdate`, ровно та же функция, которую зовёт HTTP-маршрут. Прогнал два обновления через неё,
собрав telegram-deps точно как `routes.ts` (существующая DEV-учётка `telegram:394775688` → `260ec91f-…`,
телефон подавался ТОТ ЖЕ, что уже в `user_contacts`, — повтор подтверждения, а не изменение данных):

```
===== webhook-1-start =====
webhook-1-start outcome: {"status":"rejected","reason":"PIPELINE_FAILED"}
===== webhook-2-contact =====
webhook-2-contact outcome: {"status":"rejected","reason":"PIPELINE_FAILED"}
===== observed identity/contact writes =====
user.upsert | principal=bootstrap | OK
user.upsert | principal=bootstrap | OK
```

**Препятствие 2 (собственно блокер).** Оба обновления падают в pipeline на РЕЛЯЦИОННОМ чтении
`select user_id from public.user_channel_bindings inner join public.platform_users …`
(`repos/platformUserByChannel.ts`, `resolveCanonicalPlatformUserIdByChannel`). Точная причина, снятая
временно расширенным сериализатором ошибок (откачен):

```
error: permission denied for schema public
    at withPortContextTransaction (packages/db-principal/dist/portContext.js:366)
```

Это то же самое чтение, на котором держится pre-routing (`resolveActiveOrganizationIdForChannel`), поэтому
организация не разрешается («telegram webhook: no exact organization context»), путь остаётся на bootstrap и
до `user.phone.link` не доходит. Файл не входит в diff кандидата — блокер **пред-существующий** и совпадает по
классу с уже записанным в `docs/_TODO/runs/integrator-cleanup/D20_PORTCONTEXT_TEST_HARNESS_2026-08-20.md`
состоянием «live catalog ещё не reconciled».

Что Part C всё же доказал: первый вебхук ЖИВО дошёл до `user.upsert` и точный корень отработал под bootstrap.
Второй вебхук живо не проверен — поэтому Part C = **BLOCKED**, не PASS и не FAIL.

Проверка отсутствия следов (read-only, после прогона):

```
binding|user=260ec91f-…|handle=NULL|created=2026-06-10 20:00:04.6675+03
users_created_last_hour=0
bindings_created_last_hour=0
```

Ни fixture, ни новых строк, ни миграций, ни deploy, ни TEST/PROD.

---

## Прогоны

```
pnpm --dir apps/integrator exec vitest run \
  src/infra/db/writePort.identityRootReachability.audit.test.ts \
  src/infra/db/writePort.phoneLinkConflictContract.audit.test.ts \
  src/infra/db/bootstrapChannelIdentityRoot.unit.test.ts \
  src/infra/db/userUpsert.identity.test.ts \
  src/infra/db/directPublic/writePort.unit.test.ts \
  src/infra/db/writePort.directProjectionFallback.test.ts
→ Test Files 2 failed | 4 passed (6);  Tests 5 failed | 23 passed (28)
```

Все 4 файла кандидата зелёные — и это часть находки, а не смягчение: они зелёные при сломанном продукте.

```
pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json      → exit 0
pnpm exec eslint <два новых файла>                                  → exit 0
```

Все прогоны — через `/home/dev/brain/host-orch/run-tests.sh` (общий замок хоста).

---

## Что должно быть исправлено перед land (ограниченно)

1. **K5.** Сделать оба точных корня достижимыми под `integrator`- и `organization`-принципалом Telegram/MAX-вебхука
   через существующий шов; убрать маскировку постоянного отказа под `db_transient_failure`.
2. **K8.** Вернуть в `messenger_phone_bind_blocked` вторую конфликтующую учётку (нужен возврат контрагента из
   корня) — границу правки за пределами `apps/integrator` подтверждает лид/владелец.

Тесты аудитора переиспользуются воркером до зелёного; повторный слепой аудит по §24.6 не нужен, кроме случая,
если исправление K8 создаст новую SQL-поверхность.

## Owner questions / рекомендации (работой НЕ становятся)

- `repos/userChannelBotBlocked.ts` INSERT в `public.user_channel_bindings` — доставочный факт или
  «синхронизация личности» по Р-D25?
- `messengerPhonePublicBind0380.unit.test.ts` живёт в интеграторе, а покрывает теперь только вебапповую функцию.
- Пред-существующий `permission denied for schema public` на релационном чтении привязок канала блокирует ВЕСЬ
  входящий Telegram на именованной DEV — отдельная работа, вне D25.

## NOT DONE

- Живой второй вебхук (`user.phone.link`) на именованной DEV — не выполнен, блокер назван выше.
- Продуктовые правки не делал (запрещено брифом): K5 и K8 остаются падающими acceptance-тестами.
- Full CI, миграции, deploy, push, TEST/PROD — не запускались.
- Первый вебхук под `integrator`/`organization` принципалом живо не проверен: DEV до этой ветки не доходит.
