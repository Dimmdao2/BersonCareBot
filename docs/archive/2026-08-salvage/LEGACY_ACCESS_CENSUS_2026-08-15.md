> **АРХИВ.** Перепись доступов от 15.08.2026, поднята из удаляемой ветки 19.08.
> Её единственный подтверждённый дефект (рабочий процесс рассылок читал удалённую таблицу
> `integrator.contacts`, ошибка маскировалась под «телефон не привязан») **уже исправлен**:
> проверено 19.08 — чтений этой таблицы в живом коде ни одного, сама таблица отсутствует
> и на TEST, и на dev. Документ сохранён ради метода проверки и списка того, что перепись
> НЕ подтвердила, а не ради выводов.

# Legacy access census — 2026-08-15

## Краткий вердикт

**FAIL: один подтверждённый P1 runtime-дефект.** После удаления `integrator.contacts`
активный outgoing-delivery worker всё ещё читает её при обогащении doctor broadcast.
Ошибка ловится и превращается в `linkedPhone=false`, поэтому сообщения уходят с неверным
состоянием привязки вместо громкого отказа. В остальном census не подтвердил обход
port-context runtime через generic login, прямой второй `Pool`, `integrator.system_settings`
или несуществующий `/api/admin/mode`.

Канон для оценки: `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` (current state и
четыре runtime-login), `SCHEME.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md` и
`deploy/HOST_DEPLOY_README.md`. Архивы, dumps и historical plans finding-ами не считались.

## Подтверждённый активный дефект

### P1 — worker читает удалённую `integrator.contacts`

- **Достижимый сценарий.** Runtime всегда передаёт `doctorBroadcastMenu` в outgoing-delivery
  worker (`apps/integrator/src/infra/runtime/worker/main.ts:73-83`). Для doctor broadcast
  worker вызывает `resolveLinkedPhoneForPlatformUser` (`apps/integrator/src/infra/runtime/worker/
  doctorBroadcastIntentMenu.ts:200-204`), который выполняет `FROM contacts c`
  (`:63-71`). В текущем DEV target `integrator.contacts` удалена: это зафиксировано в
  `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:68-70`, а migration прямо предупреждает,
  что этот reader после drop даёт `42P01` (`apps/integrator/src/infra/db/migrations/core/
  20260808_0008_drop_legacy_contacts.sql:35-39`).
- **Impact.** `catch` в `doctorBroadcastIntentMenu.ts:85-87` маскирует SQL error как
  `{ linkedPhone: false }`. Получатель с реальным canonical phone получает broadcast без
  ожидаемого menu/deep-link поведения; оператор видит обычную delivery, а не legacy-reader
  failure. Это функциональная регрессия активного worker path, не теоретический старый код.
- **Причина.** Settings registry и UI всё ещё делают `public_then_contacts` default и позволяют
  `contacts_only`: `apps/webapp/src/modules/system-settings/registry.ts:81-87`,
  `apps/webapp/src/app/app/settings/AdminSettingsSection.tsx:376-385`. Но SQL join к
  `contacts` выполняется независимо от выбранной стратегии, то есть даже `public_only` не
  защищает этот path.
- **Evidence.**

  ```bash
  node /home/dev/brain/tools/code-search.mjs "Rubitime legacy contacts integrator.system_settings identity FIO" --repo bcb -k 80
  rg -n -C 8 "getIntegratorLinkedPhoneSource|resolveLinkedPhoneNormalized|linked_phone_legacy_fallback|linkedPhone" apps/integrator/src --glob '!**/*.test.*'
  rg -n -C 4 "FROM contacts c|FROM contacts|contacts c" apps/integrator/src --glob '!**/*.test.*' --glob '!**/migrations/**'
  ```

## Устаревшая текущая документация / runbook

Эти записи не являются самостоятельными runtime finding-ами, но подталкивают следующий
изменяемый path обратно к удалённым таблицам и должны быть исправлены вместе с P1.

- `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md:75` объявляет
  `public_then_contacts`/`contacts_only` действующей конфигурацией для `/start` и меню после
  удаления `integrator.contacts`.
- `apps/integrator/src/infra/db/schema.md:7-51` и
  `apps/integrator/src/integrations/telegram/db/schema.md:7-51` описывают `identities`,
  `contacts` и `telegram_state` как active/canonical integrator storage, хотя current DB plan
  фиксирует их removal.
- `apps/webapp/src/modules/auth/auth.md:246-248` всё ещё описывает phone-bind как
  `public` binding-first + `integrator.contacts`.

`deploy/env/README.md`, root `README.md` и
`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md` ещё содержат generic `DATABASE_URL` модель,
но это **не finding данного target**: current authority не разрешает PROD cutover, а README
явно оставляет `legacy-guc` для локального режима. Для switched DEV/TEST explicit bootstrap
пишет `port-context`, а `deploy-test.sh` разрешает только `locked|port-context` для runtime
(`deploy/host/deploy-test.sh:108-126`).

## Легитимный legacy, который должен существовать только для перехода

- `DATABASE_URL`, `DATABASE_URL_NONSTAFF` и `legacy-guc` внутри
  `deploy/host/deploy-test.sh:303-356` — stopped-writer migration bridge под local OS
  `postgres`; это не application runtime login. Тот же script перед normal TEST deploy
  fail-closed проверяет mode (`:108-126`).
- `INTEGRATOR_DATABASE_URL`/`SOURCE_DATABASE_URL` в
  `deploy/host/run-stage13-cutover.sh:68-90` — input cutover/backfill, не runtime env.
- `integrator.contacts`, `identities`, `users` и `telegram_state` в migrations,
  `deploy/postgres/prod-to-target-cutover-data.sql` и archival dumps — одноразовый
  preservation/cutover input. Новый runtime reader/writer там появляться не должен.
- `rubitime` в `apps/webapp/src/infra/repos/pgCanonicalAppointments.ts:118-124` — canonical
  external mapping lookup, не вызов Rubitime и не второй database. Это допустимый migration
  identity key.

## False positives, исключённые после проверки

- `/api/admin/mode` существует: `apps/webapp/src/app/api/admin/mode/route.ts`; active smoke
  helper вызывает его в `deploy/host/mint-smoke-session.mjs:138-145`. Поэтому известный пример
  не является stale HTTP finding.
- `new Pool` находится в declared pool providers (`apps/webapp/src/infra/db/webappPoolProvider.ts:292-335`);
  direct second application pool вне owning port не подтверждён. В `port-context` provider
  требует exact staff/patient/global-admin configurations и не имеет generic fallback.
- `integrator.system_settings` active reader/writer не найден. Integrator runtime settings идут
  через `public.system_settings` and named accessor (`apps/integrator/src/infra/db/
  publicSystemSettings.ts`), что соответствует current contract.
- Generic URL fallback в `apps/webapp/src/infra/db/client.ts:30-88` и defaults
  `legacy-guc` в обоих env parsers остаются compatibility code для non-target local/legacy
  modes. Static inspection не доказывает, что switched host реально запущен так; DEV/TEST
  bootstrap rejects their retention (`deploy/host/bootstrap-c4-test-env.mjs:796-807`).

## Существующие gates и слепая зона

Существуют declaration/callsite gates: выполнена команда

```bash
node --test deploy/postgres/privileges/port-context-callsite-catalog.test.mjs deploy/postgres/privileges/port-context-catalog.test.mjs deploy/postgres/privileges/function-census.test.mjs
```

Она завершилась `pass`; вывод команды содержит `tests 27`, `fail 0`. Эти gates доказывают
catalog, capability и named-root callsites, но не запрет legacy relations в arbitrary worker
SQL, transitional settings values, current prose/runbooks и script-to-Next-route alignment.
Это также прямо не входит в обычный CI: `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md:193-198`.

### Один компактный системный gate

Добавить один `node --test deploy/postgres/privileges/legacy-access-census.test.mjs` с маленьким
declaration-owned registry из двух списков:

1. **forbidden in active runtime**: generic runtime URL names, `legacy-guc`,
   `integrator.contacts|identities|users|telegram_state`, `integrator.system_settings` и retired
   HTTP route aliases; roots — `apps/*/src`, `deploy/host` normal deploy/smoke и current
   architecture/runbook docs.
2. **transition allowlist**: exact migration, backfill and cutover files, each with reason and
   expiry/removal owner.

Gate scans those roots, rejects an unregistered token, verifies each referenced `/api/...` literal
against `apps/webapp/src/app/api/**/route.ts`, and includes one mutation self-test per class.
It is a local mechanical command, not full CI; it complements rather than duplicates the existing
catalog oracle.

## Найденный TaskDB workstream

`#1084` — **«Система доступа к БД v3: порт-единственная дверь + EXPLAIN-поверхность +
выполнимость политик + exact-ACL»**, status `doing`. Найдено только через:

```bash
node /home/dev/brain/tools/taskdb.mjs find bcb "порт"
node /home/dev/brain/tools/taskdb.mjs find bcb "доступ"
```

P1 и предложенный gate относятся к этому workstream; TaskDB в ходе аудита не менялся.

## Что статически не доказать — нужен живой тест

- Что DEV/TEST host env действительно содержит только четыре port-context credentials, а HBA/DB
  catalog отвергают old login: выполнить existing host probe
  `node deploy/host/probe-dev-test-postgres-mtls.mjs --check` на documented DEV/TEST host.
- Что table drop применён в конкретной восстановленной TEST database: catalog probe under local
  admin channel and then an eligible synthetic doctor broadcast; assert canonical-phone recipient
  receives the intended menu/deep-link without a swallowed `42P01`. Do not run against real
  recipients.
- Что no production process or external smoke packet still invokes an obsolete route/credential:
  inspect the deployed immutable env/unit files and execute the owner-approved smoke on synthetic
  TEST only. Repository reading cannot prove remote process state.
