# D17 шаг 2b — три оставшихся реляционных писателя `public.*` из интегратора

**Ветка:** `wt/d17-step2b-20260822` · **база:** `f2620820e` · **работа:** `da3a147ed`
**Оракул:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, блок «**D17 — узкая роль в базе.**»
**Это отчёт исполнителя, НЕ приёмка.** Галочку D17 ставит ведущий.

Реляционная запись `public.*` из интегратора по трём путям, названным замером независимого аудита 22.08,
переведена на именованные корни через существующий chokepoint `writeDirectPublic` → `runIntegratorNamedRoot`.
Новых слоёв, обходных путей и вторых дверей к одной записи не заводилось. Членства логина не снимались —
это шаг 3.

---

## 1. Что переведено: миграция → корень → вызывающий

### 1.1 `public.user_channel_bindings` — метка «бот заблокирован»

| | |
|---|---|
| **Было** | `apps/integrator/src/infra/db/repos/userChannelBotBlocked.ts` — ПЯТЬ реляционных операторов: `INSERT … ON CONFLICT (channel_code, external_id) DO UPDATE` и четыре `UPDATE` (по человеку+каналу и по каналу+внешнему идентификатору, в постановке и в снятии) |
| **Миграция** | `apps/webapp/db/drizzle-migrations/20260822T111000_the_bot_blocked_marker_gets_a_named_root.sql` |
| **Корень** | `app.integrator_set_user_channel_bot_blocked(uuid,uuid,text,text,boolean,text)` |
| **Владелец тела** | `app_seam_delivery_scope_owner` |
| **Исполняется под** | `app_tenant_service`, класс контекста `tenant_service` |
| **Ключ возможности** | `integrator_port_user_channel_bot_blocked_set` |
| **Вызывающий** | тот же `repos/userChannelBotBlocked.ts`; живой маршрут — `runtime/worker/outgoingDeliveryWorker.ts:299` (снятие) и `:597` (постановка) |

**Дверь одна, а не пять.** Снятие метки — та же запись с `p_bot_blocked = false`; три формы поиска строки —
параметры одного действия. Пять дверей к двум колонкам одной таблицы были бы пятью путями к одной записи (§5).

**Почему `app_tenant_service`.** Арендаторская строка очереди обрабатывается внутри
`runWithOrganizationPrincipal(scope.organizationId, …)` (`outgoingDeliveryWorker.ts:1166`), и
`app_tenant_service` — единственная роль логина интегратора, которой декларация даёт INSERT/UPDATE на
`bot_blocked_at`/`bot_blocked_reason` (`privileges.bcb_webapp_dev.sql`, блок
`public.user_channel_bindings`). Организация не угадывается: читается ТА ЖЕ окружающая
(`getCurrentDbPrincipalOrganizationId()`), которую видит `app.current_org_id()` в политиках.

### 1.2 `public.admin_audit_log` — разбор конфликта привязки номера

| | |
|---|---|
| **Было** | `apps/integrator/src/infra/db/repos/messengerPhoneBindAudit.ts` — собственная `db.tx` из четырёх операторов: `SELECT … FOR UPDATE LIMIT 1`, `UPDATE` счётчика повторов, `INSERT` первой строки и `UPDATE` в ответ на гонку `23505` |
| **Миграция** | `apps/webapp/db/drizzle-migrations/20260822T111100_the_messenger_phone_bind_audit_gets_a_named_root.sql` |
| **Корень** | `app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text) RETURNS boolean` |
| **Владелец тела** | `app_seam_identity_lookup_owner` |
| **Исполняется под** | `app_tenant_service`, класс контекста `tenant_service` |
| **Ключ возможности** | `integrator_port_messenger_phone_bind_audit_record` |
| **Вызывающий** | тот же `repos/messengerPhoneBindAudit.ts`; живой маршрут — `infra/db/writePort.ts:322`, уже внутри `writeDirectPublic('admin-audit-write', …)` |

**Дверь одна на все четыре оператора**, потому что действие одно — «зафиксировать случай и сказать, первый ли
он». Возвращаемое `boolean` и есть прежний `insertedFirst`, по которому вызывающий решает, будить ли
администратора. Разделив дверь на «прочитать» и «записать», мы вынесли бы замок открытой строки за её пределы и
потеряли атомарность, ради которой здесь и была транзакция.

**Существующего корня, делающего ровно эту запись, нет.** Проверено по каталогу: единственные двери к
`public.admin_audit_log` — `app_seam_org_commerce_owner` (чтение), `app_seam_patient_self_actions_owner`,
`app_seam_specialist_provision_owner`, `app_seam_telemetry_operator_owner` (свои действия, чужие колонки и
чужие роли исполнения). Ни одна не пишет случай привязки номера и ни одна не возвращает «первый ли он».

### 1.3 `public.operator_incidents` и `public.operator_job_status` — здоровье оператора

| | |
|---|---|
| **Было** | `apps/integrator/src/infra/db/repos/operatorHealthDrizzle.ts` — Drizzle-`UPDATE`/`INSERT … ON CONFLICT` в запасных ветках трёх функций плюс две мёртвые функции |
| **Миграция** | **НЕ ЗАВОДИЛАСЬ — и не должна была** |
| **Корни** | уже существуют: `app.record_operator_outbound_probe_run(…)`, `app.read_operator_outbound_probe_meta()`, `app.resolve_operator_probe_incidents(text)` (`deploy/postgres/c4-operational-runtime.sql`) |
| **Вызывающий** | `app/operatorHealthProbeRunner.ts` через `runtime/scheduler/operatorHealthProbeTick.ts` |

**Почему нового корня нет.** Существующие двери делают ровно эту запись, и живой маршрут уже ходил через них:
единственный вызывающий — тик расписания `runScheduledOperatorHealthProbeTick`, который целиком обёрнут в
`runWithInfraPrincipal({ source: 'scheduler:handle-tick-event' })`
(`runtime/scheduler/operatorHealthProbeTick.ts:32`), а `'scheduler:handle-tick-event'` входит в
`schedulerInfraSources` (`infra/db/withClient.ts:113`), поэтому
`getCurrentIntegratorTechnicalRuntimeRole()` всегда возвращает `app_operational_scheduler` — и ветка `else`
с реляционной записью не исполнялась НИКОГДА. Она была вторым путём к той же записи (§5) и убрана.
Завести ради неё шестой корень значило бы завести дверь под недостижимый вызов.

Убрано поимённо:

- `markOperatorIncidentAlertSent(incidentId)` — Drizzle `UPDATE public.operator_incidents`. **Мёртвая:**
  ни одного вызова в дереве; одноимённая живая функция с другой сигнатурой живёт в
  `repos/outgoingDeliveryScope.ts:70` (корень `app.mark_operator_incident_alert_sent`) и её зовёт
  `outgoingDeliveryWorker.ts:745`. Доказательство —
  `grep -rn "\bmarkOperatorIncidentAlertSent\b"`: `outgoingDeliveryWorker.ts` (2, импорт из
  `outgoingDeliveryScope.js`), `namedPortRoots.unit.test.ts` (2), два определения.
- `getOperatorIncidentAlertState(incidentId)` — Drizzle `SELECT`. **Мёртвая:** единственное вхождение в
  дереве — её собственное определение.
- запасная ветка `readOperatorOutboundProbeMeta` — Drizzle `SELECT public.operator_job_status`.
- запасная ветка `recordOperatorOutboundProbeRun` — Drizzle `INSERT … ON CONFLICT DO UPDATE` на
  `public.operator_job_status`.
- запасная ветка `resolveOpenOperatorIncidentsByDedupKeyPrefix` — Drizzle `UPDATE public.operator_incidents`.
  Вместе с ней убран параметр `onlyErrorClasses`: он и раньше существовал только для этой ветки, а живая дверь
  `app.resolve_operator_probe_incidents` сама отбирает классы «пейджить с первого раза» в пространстве
  `outbound_delivery_provider` (`c4-operational-runtime.sql:815`, переменная `v_page_on_first_only`).

Поведение живого маршрута не изменилось: до правки и после неё исполняется тот же оператор с теми же
аргументами.

---

## 2. Ключи возможностей: почему префикс `integrator_port_…`

Каталог `declaration.portContext.capabilities` — ОДИН объектный литерал. Одинаковый ключ не дополняет соседа,
а вытесняет его молча: ровно так шаг 1 потерял дверь поддержки и получил вердикт FAIL. Обе новые двери порта
интегратора несут префикс `integrator_port_`, как уже сделано для
`integrator_port_support_delivery_attempt_record`. Гейт на дубль ключа (TypeScript-литерал + сверка
`--all --port-context-only --check`) остался зелёным — ни одна существующая возможность из артефакта не
пропала: диффы `port-context-capabilities.*.sql` — ровно `+2` строки, без единой `-`.

```
$ git diff HEAD~1 --stat deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql
 ...port-context-capabilities.bcb_webapp_dev.sql | 2 ++
```

---

## 3. Разбор прав каждой миграции (AGENTS.md §1)

Ни одна из двух миграций не выдаёт и не отзывает прав: `GRANT`, `REVOKE`, `CREATE ROLE`, `ALTER ROLE`,
`ALTER DEFAULT PRIVILEGES`, `CREATE POLICY` в них отсутствуют.

```
$ grep -ciE "^\s*(GRANT|REVOKE|CREATE\s+ROLE|ALTER\s+ROLE|ALTER\s+DEFAULT|CREATE\s+POLICY)" \
    apps/webapp/db/drizzle-migrations/20260822T1110*.sql apps/webapp/db/drizzle-migrations/20260822T1111*.sql
0
0
```

### 3.1 `20260822T111000_the_bot_blocked_marker_gets_a_named_root.sql`

**Какие объекты создаёт:** одну функцию `app.integrator_set_user_channel_bot_blocked(uuid,uuid,text,text,
boolean,text) RETURNS void`, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `VOLATILE`, `PARALLEL UNSAFE`,
`SET search_path = pg_catalog`. Схема `app` уже существует (заголовок `BCB-MIGRATION-SCHEMA-CREATE: app`).

**Под какой ролью исполняется тело:** `app_seam_delivery_scope_owner` (владелец функции; preflight подтвердил
`session_user=bcb_dev_migrator`, `current_user=app_seam_delivery_scope_owner`, `can_create_public=f`).

**Хватает ли ОБЪЯВЛЕННЫХ прав, чтобы тело ВЫПОЛНИЛОСЬ, а не только чтобы объект родился:**

| Что делает тело | Требуемое право | Откуда берётся |
|---|---|---|
| `INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id, bot_blocked_at, bot_blocked_reason)` | INSERT на пять колонок | новый грант из `relationSurfaces` (декларация) |
| `ON CONFLICT … DO UPDATE SET bot_blocked_at, bot_blocked_reason` | UPDATE на эти колонки **и SELECT** — конфликтующая строка сначала читается | UPDATE + SELECT из того же surface |
| два `UPDATE public.user_channel_bindings … WHERE …` | UPDATE + SELECT (WHERE читает строку) | там же |
| последовательности таблицы | `USAGE, SELECT` | генератор выводит их из наличия INSERT/UPDATE — строка появилась в артефакте автоматически |
| `EXISTS (SELECT … FROM public.be_organization_members)` | SELECT (`platform_user_id`, `organization_id`, `status`) | **уже было** у `app_seam_delivery_scope_owner` (`privileges.bcb_webapp_dev.sql:11277`) — новых грантов не потребовалось |
| `EXISTS (SELECT … FROM public.org_enrollments)` | SELECT (те же три колонки) | **уже было** (`:15267`) |
| политики `rev10_named_root_owner_gate_216` / `rev10_seam_business_216` | членство владельца шва в списке ролей политики | **уже было** — роль перечислена в обеих |

Что видно ТОЛЬКО при исполнении и потому разобрано отдельно:

- **Запись в ранее read-only таблицу.** До этой миграции `app_seam_delivery_scope_owner` держал на
  `public.user_channel_bindings` ТОЛЬКО SELECT (две строки грантов). Появление INSERT/UPDATE — единственное
  расширение прав этой миграции, и оно ограничено пятью колонками:
  ```
  +GRANT SELECT ("bot_blocked_at", "bot_blocked_reason", "channel_code", "external_id", "user_id") … TO "app_seam_delivery_scope_owner";
  +GRANT INSERT ("bot_blocked_at", "bot_blocked_reason", "channel_code", "external_id", "user_id") … TO "app_seam_delivery_scope_owner";
  +GRANT UPDATE ("bot_blocked_at", "bot_blocked_reason", "channel_code", "external_id", "user_id") … TO "app_seam_delivery_scope_owner";
  +    EXECUTE pg_catalog.format('GRANT USAGE, SELECT ON SEQUENCE %s TO "app_seam_delivery_scope_owner"', s);
  ```
- **`SELECT … FOR UPDATE`/`FOR SHARE` в теле отсутствует** — замка нет, права класса UPDATE ради замка не
  требуется. Гейт `row-lock-privileges.test.mjs` эту функцию не видит и не должен.
- **Право, которого требует ТРИГГЕР, а не оператор тела, здесь не возникает: триггеров на
  `public.user_channel_bindings` нет.** Проверено по действующим артефактам схемы:
  ```
  $ grep -rhn "CREATE TRIGGER" -A2 apps/webapp/db/drizzle-migrations/ deploy/postgres/ | grep -oiE "ON [a-z_.\"]+" | sort -u
  … public.user_channel_preferences … (public.user_channel_bindings в списке отсутствует)
  ```
  Соседняя `public.user_channel_preferences` триггер (`p2_c2_user_channel_preferences_patient_write_guard`)
  несёт, `user_channel_bindings` — нет. Маркер `FunctionRelationSurface.requiredByTrigger` поэтому не
  используется и обходить гейт нечем.
- **Разница вставки и обновления сохранена такой, какой её даёт RLS.** `rev10_tenant_insert_216` — это
  `WITH CHECK`, он ОТКАЗЫВАЕТ (`42501`) при вставке привязки человека чужой клиники; `rev10_tenant_update_216`
  — это `USING`, он чужую строку просто НЕ ВИДИТ (ноль строк, ни одной ошибки). Тело повторяет обе половины
  дословно: явный `RAISE … 42501` во вставке и фильтр `EXISTS` в трёх обновлениях (включая `WHERE` у
  `ON CONFLICT DO UPDATE`).

### 3.2 `20260822T111100_the_messenger_phone_bind_audit_gets_a_named_root.sql`

**Какие объекты создаёт:** одну функцию `app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)
RETURNS boolean`, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `VOLATILE`, `PARALLEL UNSAFE`,
`SET search_path = pg_catalog`.

**Под какой ролью исполняется тело:** `app_seam_identity_lookup_owner` (preflight:
`session_user=bcb_dev_migrator`, `current_user=app_seam_identity_lookup_owner`, `can_create_public=f`).

**Хватает ли ОБЪЯВЛЕННЫХ прав, чтобы тело ВЫПОЛНИЛОСЬ:**

| Что делает тело | Требуемое право | Откуда берётся |
|---|---|---|
| `SELECT … FROM public.admin_audit_log … LIMIT 1 FOR UPDATE` | **UPDATE-класса, а не SELECT** | **уже было**: `GRANT UPDATE (…11 колонок…) … TO "app_seam_identity_lookup_owner"` (`privileges.bcb_webapp_dev.sql:10525`) |
| два `UPDATE public.admin_audit_log … WHERE …` | UPDATE + SELECT | **уже было** (`:10523`, `:10525`) |
| два `INSERT INTO public.admin_audit_log (…)` | INSERT | **уже было** (`:10524`) |
| политики `rev10_named_root_owner_gate_19` / `rev10_seam_business_19` | членство владельца шва в списке | **уже было** |

Новых грантов эта миграция не порождает вовсе — диффа по блоку `public.admin_audit_log` в артефакте нет.
Единственная строка артефакта, которую она добавляет, — запись функции в перепись поверхностей и
`GRANT EXECUTE … TO "app_tenant_service"`.

Что видно ТОЛЬКО при исполнении:

- **`SELECT … FOR UPDATE` требует права класса UPDATE.** Колоночного SELECT не хватает: PostgreSQL берёт за
  замок `ACL_UPDATE` и падает `42501 permission denied for table` ещё до того, как посмотрит на данные (тот же
  класс дефекта, что сломал вход по коду из почты 21.08 — см. шапку `row-lock-privileges.test.mjs`).
  Табличный UPDATE при этом не нужен, хватает UPDATE на любой одной колонке; у владельца объявлены
  одиннадцать. Гейт `row-lock-privileges.test.mjs` эту пару видит: `latestArtifactFunctions` разбирает мою
  миграцию, `rowLockedRelations` находит `public.admin_audit_log`, `holdsUpdate` подтверждает право —
  4/4 зелёные. В `ROW_LOCK_SURFACES` запись НЕ добавлялась намеренно: она нужна только там, где UPDATE
  появляется РАДИ ЗАМКА; здесь тело и так обновляет ту же таблицу по существу дела.
- **Триггеров на `public.admin_audit_log` нет** (та же перепись `CREATE TRIGGER`, что и выше), маркер
  `requiredByTrigger` не нужен.
- **Стена организации.** Таблица объявлена `org=true`, а `idx_admin_audit_log_conflict_open` уникален по всей
  таблице, а не по клинике. Поэтому мало сверить `p_organization_id` с `app.current_org_id()` — КАЖДЫЙ поиск
  строки дополнительно сужен `organization_id = p_organization_id`: без этого совпадение `conflict_key` у двух
  клиник дописывало бы повтор в чужую строку.

### 3.3 Таймштампы

Последняя миграция в дереве до этого хода — `20260822T110500_…`. Новые: `20260822T111000_…` и
`20260822T111100_…` — строго больше. Мигратор идёт по watermark `created_at`, не по хешу; preflight
подтвердил `pending=7 total=37` и применил обе в откатываемой транзакции.

---

## 4. Доказательства (реальный вывод команд)

### 4.1 `bash deploy/host/migrate-dev.sh --preflight` — PASS, с откатом

```
   session_user   |         current_user          | can_create_public
------------------+-------------------------------+-------------------
 bcb_dev_migrator | app_seam_delivery_scope_owner  | f
(1 row)
CREATE FUNCTION
…
   session_user   |          current_user          | can_create_public
------------------+--------------------------------+-------------------
 bcb_dev_migrator | app_seam_identity_lookup_owner  | f
(1 row)
CREATE FUNCTION
…
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=7 total=37 reapplied=0 foreign-ledger-rows=0 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

`--execute` не запускался (запрещён брифом; DEV ведёт ведущий). Файлы `.env` / `apps/webapp/.env.dev`,
которых требует гейт путей обёртки, были скопированы в worktree на время прогона и удалены сразу после
(`git status` чист, оба пути в `.gitignore`).

### 4.2 Оба `--check` генератора — побайтно

```
$ node deploy/postgres/privileges/generate-cli.mjs --all --check
ok bcb_webapp_dev/privileges: deploy/postgres/generated/privileges.bcb_webapp_dev.sql совпадает побайтно
ok bcb_webapp_dev/allowlist: deploy/postgres/generated/org-allowlist.bcb_webapp_dev.sql совпадает побайтно
ok bersoncarebot_test/privileges: deploy/postgres/generated/privileges.bersoncarebot_test.sql совпадает побайтно
ok bersoncarebot_test/allowlist: deploy/postgres/generated/org-allowlist.bersoncarebot_test.sql совпадает побайтно
--check: артефакты соответствуют декларации побайтно.

$ node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check
ok bcb_webapp_dev/portContext: deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql совпадает побайтно
ok bersoncarebot_test/portContext: deploy/postgres/generated/port-context-capabilities.bersoncarebot_test.sql совпадает побайтно
--check: артефакты соответствуют декларации побайтно.
```

### 4.3 `pnpm test:db-privileges`

```
1..186
# tests 186
# suites 0
# pass 142
# fail 0
# cancelled 0
# skipped 44
```

(до правки на той же голове: 179 тестов; +7 — рост переписи функций и поверхностей от двух новых корней.)

### 4.4 Интегратор: typecheck, lint, тесты

```
$ pnpm --dir apps/integrator typecheck
> tsc --noEmit                     # без вывода — 0 ошибок

$ npx eslint apps/integrator/src deploy/postgres/privileges
# без вывода, exit 0

$ node scripts/check-db-chokepoint.mjs                    → check-db-chokepoint: OK
$ node scripts/check-no-new-raw-sql.mjs                    → OK (production debt: 0)
$ node scripts/check-c4-migration-owned-function-bodies.mjs → OK

$ npx vitest run          (весь пакет интегратора)
 Test Files  107 passed | 1 skipped (108)
      Tests  551 passed | 2 expected fail | 1 skipped (554)
```

Полный CI и push не запускались (запрещено брифом).

### 4.5 Поведенческие тесты на каждый из трёх путей + инъекция неисправности

Два новых файла:

- `apps/integrator/src/infra/db/directPublic/remainingWritersUseNamedRoots.behaviour.test.ts` — 9 тестов,
  пути 1.1 и 1.2. Заглушка одна и на границе (`DbPort`), всё остальное — настоящий код живого маршрута:
  тот же chokepoint, те же обёртки принципала, те же репозитории. Проверяется: какой оператор реально уходит
  в базу, позиционный набор аргументов, `principalKind`/`principalOrganizationId` в момент вызова, и что
  аргумент организации ВСЕГДА равен окружающей организации принципала, а не значению из данных случая.
- `apps/integrator/src/infra/db/repos/operatorHealthUsesNamedRootsOnly.behaviour.test.ts` — 3 теста, путь 1.3.
  Здесь корень зовётся через `createDbPort()` внутри репозитория, поэтому заглушка ставится подменой модуля
  (как в соседнем `operatorHealthDrizzle.openOrTouchOperatorIncident.test.ts`). Второй арбитр — подменённый
  `getIntegratorDrizzle`, который БРОСАЕТ: реляционный путь по этим двум таблицам шёл только через него.

**Инъекция неисправности — по каждому пути отдельно, продукт возвращён побайтно.**

| Путь | Что вернули | Результат |
|---|---|---|
| 1.1 `user_channel_bindings` | `runIntegratorNamedRoot` заменён на `db.query('INSERT INTO public.user_channel_bindings … ON CONFLICT … DO UPDATE …')` | `Tests 3 failed \| 6 passed (9)` — `AssertionError: expected 'INSERT INTO public.user_channel_bindi…' not to match /INSERT\s+INTO\s+public\.user_channel…/i` (×2) и красный на позиционном наборе аргументов |
| 1.2 `admin_audit_log` | тот же вызов заменён на `db.query('INSERT INTO public.admin_audit_log … ')` | `Tests 4 failed \| 5 passed (9)` — `AssertionError: expected 'INSERT INTO public.admin_audit_log (o…' not to match /INSERT\s+INTO\s+public\.admin_audit_…/i` (×3) |
| 1.3 `operator_*` | обе двери заменены на `INSERT INTO public.operator_job_status … ON CONFLICT` и `UPDATE public.operator_incidents …` | `Tests 3 failed (3)` — `expected 'INSERT INTO public.operator_job_statu…' to contain 'app.record_operator_outbound_probe_run'`, `expected 'UPDATE public.operator_incidents SET …' to contain 'app.resolve_operator_probe_incidents'` |

После каждого прогона — `git checkout --` затронутого файла; итог:

```
$ git diff HEAD --name-only | wc -l
0
```

### 4.6 Два существующих теста подогнаны под новый оператор — с сохранением их предмета

- `runtime/worker/outgoingDeliveryWorker.inboundReply.d35.test.ts` ловил постановку метки по тексту
  `sql.includes('user_channel_bindings') && sql.includes('bot_blocked_at = now()')`. Теперь ловит
  `sql.includes('app.integrator_set_user_channel_bot_blocked') && params[4] === true` — предмет («канал
  РЕАЛЬНО помечается заблокированным») и оба его арбитра сохранены дословно.
- `runtime/worker/outgoingDeliveryWorker.scope.test.ts` инъецировал отказ по
  `sql.includes('UPDATE public.user_channel_bindings')` — тот же перевод на имя корня. Без правки инъекция
  переставала срабатывать и тест «не повторять внешнее напоминание, если учёт метки упал после отправки»
  становился ложно-зелёным (замерено: `expected 2 to be 1`).

---

## 5. Перепись реляционных писателей `public.*` в `apps/integrator/**`

Метод: (1) многострочный разбор `INSERT INTO` / `UPDATE` / `DELETE FROM` по всем `.ts` вне `*.test.ts` с
раскрытием схемы, включая формы без префикса `public.`; (2) перепись Drizzle-записей (`.insert(`, `.update(`,
`.delete(`) и всех вызывающих `getIntegratorDrizzle`/`getIntegratorDrizzleSession`; (3) сверка каждой найденной
таблицы со схемой её символа (`integrator.*` отсеяны) и с грантами в
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`.

**Результат: НЕ чистый.** Трёх названных брифом путей больше нет, но в дереве остаются:

### 5.1 Живой писатель, вне объёма этого хода — `public.outgoing_delivery_queue`

`repos/outgoingDeliveryQueue.ts:177,239,283,371,395,415` и `repos/jobQueue.ts:163,191` — восемь `UPDATE`
(в двух случаях `WITH … FOR UPDATE SKIP LOCKED` + `UPDATE … FROM`). Это собственная очередь исходящей
доставки интегратора, а не продуктовый канон вебаппа: декларация выдаёт `app_operational_delivery_worker`
ровно `SELECT` и `UPDATE` на одиннадцать колонок именно этой таблицы
(`privileges.bcb_webapp_dev.sql:15507-15508`), и для этой роли объявлена возможность отношения
`integrator_delivery_relation` (`purpose: 'relation'`, `runtimeSources: INTEGRATOR_DELIVERY_SOURCES`).
Это НЕ находка о забытом писателе — это объявленное назначение роли. Но оно упирается в формулировку шага 3
(«снять членство в `app_operational_delivery_worker`), поэтому вынесено вопросом ниже.

### 5.2 Мёртвый код — `public.support_questions` / `public.support_question_messages`

`directPublic/writeSupportQuestionsDirect.ts:147` (`INSERT … ON CONFLICT DO UPDATE`), `:200` (`INSERT`),
`:238` (`UPDATE`) — функции `createSupportQuestionDirect`, `appendSupportQuestionMessageDirect`,
`markSupportQuestionAnsweredDirect`.

**Доказательство, что мёртвые.** Точный поиск по каждому идентификатору во всём дереве
(`grep -rn "createSupportQuestionDirect\|appendSupportQuestionMessageDirect\|markSupportQuestionAnsweredDirect\|SupportQuestionsDirect" --include=*.ts apps/ packages/`) даёт ШЕСТЬ вхождений, и ни одно не
является вызовом этих трёх функций:

```
runtime/worker/directPublicWriteRetryWorker.ts:5   — import { … } from '…/writeSupportQuestionsDirect.js'  (импортирует appendSupportDeliveryEventDirect)
db/writePort.ts:39                                 — import { appendSupportDeliveryEventDirect }
db/writePort.ts:822                                — ссылка в комментарии на шапку файла
db/writePort.reminderRuleFallback.test.ts:21       — vi.mock модуля
db/repos/directPublicWriteRetry.ts:4               — import type { AppendSupportDeliveryEventDirectInput }
db/directPublic/canonWritersUseNamedRoots.behaviour.test.ts:41 — import { appendSupportDeliveryEventDirect }
```

Смысловая проверка тем же результатом: живой путь «вопрос поддержки» идёт по HTTP —
`infra/adapters/webappEventsClient.ts:183` → `POST /api/integrator/support/question`. Обратные ссылки из
`writePort.ts` (`writeDb`-кейсы) на эти три функции отсутствуют; динамической диспетчеризации по имени в
модуле нет. Из шага 1 они выпали корректно: они не входили в §2.2 переписи, потому что там перечислялись
ЖИВЫЕ писатели.

Убирать их этим ходом я не стал — это работа вне названного объёма (§24.6), и решение «удалить три
экспортированные функции» принимает ведущий, а не находка. См. вопрос 2.

### 5.3 DEV-скрипт — `public.reminder_rules`

`infra/scripts/reconcile-dev-patient-reminder-orphans.ts:69` — Drizzle `.update(reminderRules)`. Одноразовый
DEV-скрипт: `dry-run` по умолчанию, мутация требует точного флага `--execute` И точного имени DEV-базы
(`configuredDatabaseName()`), список правимых строк зашит в две константы `ORPHAN_RULE_IDS`. Именованное
исключение брифа (dev-скрипты).

### 5.4 Ложные срабатывания, проверенные и отвергнутые

- `repos/reminders.ts:338` — `UPDATE user_reminder_occurrences` БЕЗ префикса схемы: это
  `integrator.user_reminder_occurrences` (символ объявлен в `schema/integratorDomainRepos.ts:21` через
  `integratorSchema.table`), а `public.reminder_rules` в том же операторе стоит в `FROM`, то есть читается.
  Латентная неоднозначность имени без схемы отмечена, но это не писатель `public.*`.
- `repos/reminders.ts:291,412` — `.delete(userReminderOccurrences)` / `.update(userReminderOccurrences)`, та же
  таблица схемы `integrator`.
- `integrations/webappEntryToken.ts:39`, `repos/notificationDeliveryAttempts.ts:60` — текст `INSERT INTO
  platform_users` / `insert into … notification_delivery_attempts` внутри комментариев, не код.
- `repos/platformUserByChannel.ts`, `repos/platformUserDeliveryPhone.ts`, `directPublic/resolveDirectPublicActor.ts`,
  `db/organizationMechanicLifecycleDoor.ts` — только `SELECT` либо вызов двери
  (`FROM app.resolve_organization_mechanic_access(...)`).

---

## ВОПРОСЫ ВЛАДЕЛЬЦУ:

1. **`public.outgoing_delivery_queue` — входит ли она в «реляционную запись `public.*`, которую снимает
   шаг 3»?** Восемь `UPDATE` из `outgoingDeliveryQueue.ts`/`jobQueue.ts` — это ядро цикла доставки, и
   декларация выдала под них `app_operational_delivery_worker` ровно `SELECT` + `UPDATE` на одиннадцать
   колонок, плюс объявила возможность отношения `integrator_delivery_relation`. То есть это объявленное
   назначение роли, а не забытый писатель канона. Если шаг 3 снимает у логина ЧЛЕНСТВО в роли, а роль
   по-прежнему принимается через `app.begin_port_context` по объявленной возможности — путь жив и вопрос
   снят. Если же шаг 3 задуман шире — очередь надо переводить на корень, а это отдельная работа, которой
   нет в плане. Прошу назвать, какое из двух.
2. **Три мёртвые функции записи канона поддержки (`writeSupportQuestionsDirect.ts:119,179,231`) — удалить
   или оставить?** Они пишут `public.support_questions`/`public.support_question_messages` отношением, у
   `app_tenant_service` на обе таблицы есть INSERT/UPDATE, вызывающих нет ни одного (доказательство в §5.2),
   живой путь — HTTP. Пока они в дереве, перепись «реляционных писателей `public.*`» не бывает чистой, и
   любой следующий аудит будет спотыкаться о них заново. Удаление — не находка, а продуктовое решение
   (вдруг это заготовка под перевод поддержки с HTTP на прямую запись).
3. **Стоит ли считать частью D17 то, что оба переведённых пути СЕГОДНЯ не доезжают до базы?** Замер по
   артефакту прав: у `app_tenant_service` (и у любой другой роли логина интегратора) НЕТ грантов на
   `public.admin_audit_log` вовсе, а на `public.user_channel_bindings` они есть только у `app_tenant_service`
   — то есть путь 1.2 под enforce-стенами отказывал `42501` и отказ проглатывался
   (`logger.error('recordMessengerPhoneBindBlocked: audit insert failed')`), а путь 1.1 отказывал везде, где
   строка очереди не арендаторская. Новые корни исполняются под теми же ролями и с той же стеной, поэтому
   поведение этим ходом не изменилось — но факт «разбор конфликта привязки номера, скорее всего, не
   записывался» стоит отдельного решения: чинить это здесь я не стал, в плане такого пункта нет.

## НЕ СДЕЛАНО:

- **Членства логина интегратора в `app_tenant_service` и `app_operational_delivery_worker` не снимались** —
  это шаг 3, отдельный проверяемый шаг. Поведение этим ходом не менялось.
- **`bash deploy/host/migrate-dev.sh --execute` не запускался** — запрещён брифом, DEV ведёт ведущий.
  Миграции на DEV НЕ применены; доказана только их исполнимость с откатом.
- **Полный CI и `push` не запускались** — запрещено брифом. Прогнаны: `typecheck` интегратора, `eslint` по
  затронутым деревьям, три лямбда-гейта из `pnpm lint`, `pnpm test:db-privileges`, весь vitest интегратора.
  `pnpm test:webapp`, `pnpm build`, `pnpm run audit` НЕ гонялись.
- **Галочка D17 не ставилась** — её ставит ведущий.
- **Перепись реляционных писателей `public.*` в `apps/integrator/**` НЕ чиста.** Остались §5.1
  (`outgoing_delivery_queue`, живой, объявленное назначение роли), §5.2 (три мёртвые функции канона
  поддержки) и §5.3 (DEV-скрипт). Первые две — предмет вопросов 1 и 2; работы по ним я не заводил (§24.6:
  находка вне объёма — строка в отчёте и вопрос, а не работа).
- **`repos/reminders.ts:338` пишет `user_reminder_occurrences` без префикса схемы** — полагается на
  `search_path`. Это не писатель `public.*` и не поломка, но одноимённой таблицы в `public` не существует
  только сегодня. Отмечено, не правилось.
- **Тесты на TEST/PROD и живой прогон приложения не делались** — деплой, TEST и PROD брифом запрещены.
