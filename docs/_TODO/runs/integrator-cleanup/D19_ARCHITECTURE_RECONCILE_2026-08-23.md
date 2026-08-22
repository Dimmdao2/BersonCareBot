# D19 — сверка записанной архитектуры с текущей реализацией

**Дата:** 2026-08-23

**HEAD до правок:** `ac8d85124`

**Оракул:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D19.
**Граница:** изменены только документация и этот отчёт; код, миграции, DEV/TEST/PROD и push не тронуты. Галочку D19
ставит ведущий.

## БЛОКЕР ПУТИ TEST: generated-каталог и сохранённый deploy-assert расходятся

В активном обычном пути `deploy/host/deploy-test.sh` расхождения декларации с применяемыми правами нет: он запускает
`reconcile-access.mjs --env test --db bersoncarebot_test`, который строит и применяет exact-набор из той же
`declaration.ts`. Оба committed generated-набора также совпадают с декларацией побайтно.

Но сохранённый путь `deploy/host/deploy-test-saas.sh --post-migration-closure` (он же strict closure full-reset)
рассинхронизирован с generated-каталогом, который сам загружает:

```text
PORT_CONTEXT_CAPABILITY_SEED=deploy/postgres/generated/port-context-capabilities.bersoncarebot_test.sql
bcb_test_integrator=46
bcb_test_webapp_staff=46
combined_staff_integrator=92
deploy assertion: [ "$count" = "10" ]
```

Команды замера:

```bash
rg -n "PORT_CONTEXT_CAPABILITY_SEED=|expected 10 active declaration-owned" deploy/host/deploy-test-saas.sh
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const source = readFileSync('deploy/postgres/generated/port-context-capabilities.bersoncarebot_test.sql', 'utf8');
const rows = [...source.matchAll(/^  \('[^\n]+?'::uuid, '[^']+'::app\.port_name, '([^']+)'::name,/gmu)]
  .map((match) => match[1]);
for (const login of ['bcb_test_integrator', 'bcb_test_webapp_staff']) {
  console.log(`${login}=${rows.filter((row) => row === login).length}`);
}
console.log(`combined=${rows.filter((row) =>
  row === 'bcb_test_integrator' || row === 'bcb_test_webapp_staff').length}`);
NODE
```

`install_port_context_capability_catalog` сначала заменяет каталог из файла, затем считает эти две роли и потребует
`10`; фактический результат будет `92`, поэтому этот путь выкатки TEST завершится `FATAL`. Обычный
`deploy-test.sh` с 12.08 этот strict closure не вызывает — это прямо записано в его комментарии перед
`mark_e1_runtime_coverage_start`; следовательно, расхождение ограничено post-migration/full-reset путём, но путь
реальный и исполняемый.

**ВОПРОС ВЕДУЩЕМУ:** strict closure надо удалить как выведенный путь или заменить ручное число проверкой exact-набора,
производного от декларации? По брифу deploy-код не исправлялся.

## 1. Пути записи канона в интеграторе: остались

Ответ: **да**. Снятие широкой роли убрало прямой медицинский табличный доступ, но не удалило ограниченные операции над
каноническими `public.*`-поверхностями. Перепись декларации дала **19 различных integrator-capability/role дверей с
write-surface в `public`**; у каждой найден production-reference в `apps/integrator/src`.

Команда, давшая число `19` (не счёт из таблицы отчёта):

```bash
node --experimental-strip-types --input-type=module <<'NODE'
import { declaration } from './deploy/postgres/privileges/declaration.ts';
const writeOps = new Set(['INSERT', 'UPDATE', 'DELETE']);
const doors = new Set();
for (const capability of Object.values(declaration.portContext.capabilities)) {
  if (capability.port !== 'integrator' || !capability.functionIdentity) continue;
  const fn = declaration.portContext.functions[capability.functionIdentity];
  const writesPublic = (fn?.relationSurfaces ?? []).some((surface) =>
    surface.relation.startsWith('public.') && surface.operations.some((operation) => writeOps.has(operation)));
  if (writesPublic) doors.add(`${capability.functionIdentity}|${capability.targetRole}`);
}
console.log(`distinct_declared_public_write_doors=${doors.size}`);
NODE
# distinct_declared_public_write_doors=19
```

| Класс | Именованные корни / поверхности |
| --- | --- |
| Идентичность и канал | `integrator_upsert_channel_identity` → `platform_users`, `user_channel_bindings`, `user_identity`, `user_channel_preferences`; `integrator_bind_bootstrap_channel_phone` → `platform_users`, bindings/preferences, `user_contacts`, `user_phone_history`; `integrator_set_user_channel_bot_blocked` → bindings |
| Напоминания | `integrator_upsert_reminder_rule` → `reminder_rules`; две capability-двери общего `record_reminder_occurrence_finalized_projection` → `reminder_occurrence_history`; `integrator_append_reminder_delivery_event` → `reminder_delivery_events` |
| Доставка и аудит | `record_operator_delivery_attempt` и `integrator_record_notification_delivery_attempt`; `record_integrator_support_delivery_attempt`; `integrator_increment_broadcast_audit_counter`; `record_collapsing_audit_event`; `mark_operator_incident_alert_sent` |
| Очередь/health | `enqueue_integrator_outgoing_delivery`, два appointment-reminder корня очереди, `record_integrator_webhook_outcome` |
| Календарь | `upsert_google_calendar_event_id` и `delete_google_calendar_event_id` → `booking_calendar_map` и `patient_bookings` |

Отдельная relation-перепись membership ролей показала прямые `public`-записи только у законной delivery-роли:
`UPDATE public.outgoing_delivery_queue` и `INSERT public.reminder_delivery_events`; у новой
`app_integrator_tenant_service` `public.*`-права только `SELECT`. Её собственные записи — два отношения
`integrator.*` (`user_reminder_occurrences`, `user_reminder_delivery_logs`).

Способы поиска, а не вывод из старого отчёта:

1. `node /home/dev/brain/tools/code-search.mjs "integrator canonical public writes direct retry transaction repository" --repo bcb -k 30` — кандидаты к переписи.
2. Обход `declaration.portContext.capabilities` с `port === 'integrator'` и
   `relationSurfaces.operations ∩ {INSERT,UPDATE,DELETE}` — 19 distinct `public` write-дверей.
3. Поиск имени каждого корня/runtime/purpose по production `apps/integrator/src` без `*.test.ts`/`*.spec.ts` — у
   всех 19 есть reference.
4. Обход всех memberships `bcb_dev_integrator` по табличным grants — названный relation-список выше.
5. Обратные ссылки сверены с `D17_DROP_WIDE_MEMBERSHIP_2026-08-22.md`,
   `D17_CANON_WRITER_CENSUS_2026-08-22.md` и самим D19 в WORK_ORDER.

Следствие для архитектурного текста: истинно «нет широкого/прямого табличного доступа к медицинскому канону»; неверно
«нет ни одного пути записи продуктового канона». Это исправлено в `apps/webapp/ARCHITECTURE.md`.

## 2. Один путь к базе: runtime chokepoint подтверждён

Команды:

```bash
rg -n "new[[:space:]]+(Pool|PgPool|Client)[[:space:]]*\(|drizzle[[:space:]]*\(" \
  apps/integrator/src --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts'
rg -n "from ['\"]pg['\"]|require\(['\"]pg['\"]\)" \
  apps/integrator/src --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts'
rg -n "createIntegratorPoolProvider|createDbPort" \
  apps/integrator/src --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts'
```

Результат: runtime-конструктор `new Pool` ровно один — `integratorPoolProvider.ts`; `client.ts` создаёт один общий
pool через него, а production-callers получают `createDbPort()`. `drizzle(client)` в `client.ts`,
`operationalPoolReadiness.ts` и `pgAdvisoryLock.ts` оборачивает уже выданный тем же pool client и нового соединения не
создаёт. Второй `new Pool` находится только в `integratorMigrationPoolProvider.ts`, то есть в отдельном migration
executor, не runtime-обходе. Других value-import `pg` нет.

`scripts/check-no-new-raw-sql.mjs --census` и `scripts/check-db-chokepoint.mjs` в этом worktree не запустились:
`ERR_MODULE_NOT_FOUND: typescript` (root `node_modules` отсутствует). Поэтому автоматический AST-гейт не выдан за
запущенный; вывод основан на полной переписи constructors/value-imports/callers и на D18 production debt=0.

## 3. Вечных циклов: один

Команда:

```bash
rg -n "while[[:space:]]*\(true\)|setInterval[[:space:]]*\(" \
  apps/integrator/src --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts'
```

Результат — одна строка: `apps/integrator/src/infra/runtime/scheduler/main.ts:198`. Это единый resident
scheduler+worker: один systemd-unit `bersoncarebot-scheduler-prod.service`, один advisory leader-lock и один top-level
цикл. API — отдельный HTTP-процесс без своего `while(true)`/`setInterval`; прежнего integrator worker-unit в дереве
нет. Число с целевой схемой сошлось.

## 4. Узкая роль и deploy

Декларация DEV и TEST совпадает:

- login `bcb_*_integrator`, canonical role `app_integrator_request`;
- 6 memberships: `app_integrator_request`, `app_integrator_resolver`, `app_operational_delivery_worker`,
  `app_operational_scheduler`, `app_integrator_tenant_service`, `app_service`;
- `app_tenant_service` отсутствует;
- integrator capabilities с target `app_tenant_service`: **0**; с target `app_integrator_tenant_service`: **1**;
- у узкой роли **8** отношений и у всех `rls=force`; шесть `public.*` только на чтение, два `integrator.*` имеют
  необходимые write-операции; медицинских отношений нет.

Числа получены этой командой:

```bash
node --experimental-strip-types --input-type=module <<'NODE'
import { declaration } from './deploy/postgres/privileges/declaration.ts';
const role = 'app_integrator_tenant_service';
const login = declaration.envMapping.test.bcb_test_integrator;
const relations = Object.entries(declaration.databases.bersoncarebot_test.tables)
  .filter(([, spec]) => spec.grants?.[role]);
const capabilities = Object.values(declaration.portContext.capabilities)
  .filter((capability) => capability.port === 'integrator');
console.log(`memberships=${login.memberships.length}`);
console.log(`old_memberships=${login.memberships.filter((item) => item.role === 'app_tenant_service').length}`);
console.log(`old_target_capabilities=${capabilities.filter((item) => item.targetRole === 'app_tenant_service').length}`);
console.log(`narrow_target_capabilities=${capabilities.filter((item) => item.targetRole === role).length}`);
console.log(`narrow_relations=${relations.length}`);
console.log(`forced_relations=${relations.filter(([, spec]) => spec.rls === 'force').length}`);
NODE
# memberships=6; old_memberships=0; old_target_capabilities=0;
# narrow_target_capabilities=1; narrow_relations=8; forced_relations=8
```

Проверки committed artifacts:

```text
node deploy/postgres/privileges/generate-cli.mjs --all --check
  4 generated artifacts are byte-identical
node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only
  2 capability artifacts are byte-identical
```

Итог: **обычный deploy-test exact-reconcile совпадает с текущей ролью; strict closure/full-reset — нет**, расхождение
и вопрос ведущему стоят первым разделом отчёта. TEST и базы не трогались.

## 5. Прямые импорты между деревьями приложений

Текущий exact-поиск module specifier:

```bash
rg -n "['\"][^'\"]*(integrator/src|webapp/src)[^'\"]*['\"]" \
  apps/integrator/src apps/webapp/src --glob '*.ts' --glob '*.tsx' \
  --glob '!*.test.ts' --glob '!*.test.tsx' --glob '!*.spec.ts' --glob '!*.spec.tsx'
```

В production найден ровно один прямой cross-tree re-export:
`apps/webapp/src/shared/normalizeToUtcInstant.ts:11` → `../../../integrator/src/shared/normalizeToUtcInstant.js`.
Он не новый: `git log --follow` показывает создание `869f00fd2` от 04.04.2026 и форматирование `68bfcbeda` от
29.07.2026. Команда

```bash
git diff 15febe16b2016bd398dcc3a36f1715d9c65ea8ee..HEAD -U0 -- \
  apps/integrator/src apps/webapp/src \
  | rg "^\+[^+].*['\"][^'\"]*(integrator/src|webapp/src)[^'\"]*['\"]"
```

дала пустой результат: после коммита D19a `15febe16b` новых прямых импортов не появилось. Семантический поиск
`code-search` выполнен до exact-поиска; `tsconfig` paths проверены отдельно — cross-app alias не объявлен; обратные
ссылки сверены с D19a evidence и прошлым D19 reverify. Гейт D19a остаётся частичным и этот старый `shared/**`
реэкспорт не ловит; это уже честно записано в `apps/webapp/ARCHITECTURE.md`.

## 6. Что изменено и что не изменено

- `apps/webapp/ARCHITECTURE.md`: строка про общий `DATABASE_URL`/DB-role оставлена исправленной и уточнена фактическим
  D17-состоянием; будущая формулировка «после вычистки получит роль / доступа к продуктовому канону нет» заменена на
  текущий точный контракт ролей, восьми FORCE RLS отношений и ограниченных named-root writers.
- Корневой `ARCHITECTURE.md`: `rg -n "same DATABASE_URL|same.*DB role|app_tenant_service|узк.*рол|продуктов.*канон|вечн.*цикл" ARCHITECTURE.md`
  не нашёл расхождения; файл не менялся.
- Deploy-код не исправлялся: blocker strict closure оставлен вопросом ведущему, как требует brief.
- Не запускались `--execute`, TEST/PROD/deploy, миграции, full CI и push.
