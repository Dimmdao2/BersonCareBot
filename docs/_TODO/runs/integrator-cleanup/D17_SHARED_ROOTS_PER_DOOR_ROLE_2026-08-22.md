# D17 — два общих с вебаппом корня получают роль ПО ДВЕРИ

**Ветка:** `wt/d17-shared-roots-20260822` · **база:** `888d20dde`
**Оракул:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **D17**.
**Это отчёт исполнителя, НЕ приёмка.** Галочку D17 ставит ведущий.

**Короткий итог.** Оба общих корня — `app.record_reminder_occurrence_finalized_projection` и
`app.record_integrator_support_delivery_attempt` — ветвятся в гейте ПО ДВЕРИ. Дверь вебаппа называет
`app_tenant_service`, дверь порта интегратора — `app_integrator_request`, дверь долговечного повтора
доставки (только у первого корня) — `app_operational_delivery_worker`. **Ни одна ветка не принимает
две роли**, соответствие «дверь → роль» один к одному. Перепись
`integratorDoorsOnTheWebappTenantRole` **уменьшилась с трёх до одной** — осталась только сквозная
`relation`, которую бриф запретил трогать. Оба корня исполнены настоящим маршрутом ОБОИХ портов и
отказывают через чужую дверь; обе инъекции неисправности покраснели.

---

## 1. Что сделано

### 1.1 Миграция — гейт ветвится по двери

`apps/webapp/db/drizzle-migrations/20260822T140000_the_shared_roots_name_the_role_of_their_door.sql`,
два statement'а `CREATE OR REPLACE FUNCTION` со своими `BCB-MIGRATION-OWNER`
(`app_seam_reminder_patient_owner`, `app_seam_delivery_scope_owner`).

Тела взяты `pg_get_functiondef` с живого DEV — дословно из кластера, не набраны заново — и в каждом
изменена РОВНО ОДНА вещь: второй аргумент `app.require_accepted_context` получил ветку двери
интегратора. Генератор миграции (`/tmp/d17_build_migration.mjs`, разовый) отказывал бы, если бы
заменяемый литерал встретился не один раз, если бы в результате пропала любая из двух ролей или если
бы в тело просочился `GRANT`/`REVOKE`/`CREATE ROLE`/`CREATE POLICY`.

Первый корень (был двухветочный — добавлена средняя ветка):

```sql
    CASE
      WHEN pg_catalog.current_setting('role', true) = 'app_operational_delivery_worker'
        THEN 'app_operational_delivery_worker'::name
      WHEN pg_catalog.current_setting('role', true) = 'app_integrator_request'
        THEN 'app_integrator_request'::name
      ELSE 'app_tenant_service'::name
    END,
```

Второй корень (был одноролевой — стал двухветочным той же формой):

```sql
CASE WHEN pg_catalog.current_setting('role', true) = 'app_integrator_request'
     THEN 'app_integrator_request'::name ELSE 'app_tenant_service'::name END
```

Сигнатура, возврат, владелец, волатильность, `SECURITY DEFINER`, `search_path` и хеш типизированных
аргументов — прежние, поэтому `CREATE OR REPLACE` сохранил OID и ни одна ссылка `regprocedure` не
протухла. Класс контекста у двери интегратора остался `tenant_service` — это не послабление, а
требование живого маршрута: рантайм порта интегратора выбирает возможность по паре
(`functionIdentity`, `contextClass`) и для организационного принципала берёт именно `tenant_service`
(`apps/integrator/src/infra/db/portContextRuntime.ts:205-224`); класс `integrator` потребовал бы
`integrator_user_id`, которого у этого вызывающего нет.

**Форма не изобретена — переиспользована дословно.** Она уже жила в репозитории у первого корня
(`20260820T112313_reminder_occurrence_delivery_capability.sql`); второй такой формы не заведено,
корни не расщеплены.

### 1.2 Почему различитель — GUC `role`, а не ключ возможности (замер, как просил бриф)

Ключ двери действительно различается (`integrator_reminder_occurrence_finalized_record` у вебаппа
против `integrator_port_reminder_occurrence_finalized_record` у интегратора), **но тело корня его не
видит.** Ключ и `capability_id` лежат в `app_ext.accepted_port_contexts`, а у владельцев этих швов
нет ни SELECT на таблицу, ни даже USAGE на схему:

```
             rolname             | can_select | schema_usage
---------------------------------+------------+--------------
 app_seam_context_owner          | t          | t
 app_seam_delivery_scope_owner   | f          | f
 app_seam_reminder_patient_owner | f          | f
```

Выдать им это право значило бы завести ВТОРОГО читателя принятого контекста рядом с
`app.require_accepted_context` — ровно тот дубль прохода, который запрещает AGENTS.md §5. Поэтому
различитель — GUC `role`.

**И это не «роль сеанса на усмотрение вызывающего».** `app.begin_port_context` ставит `role`
оператором `SET LOCAL ROLE p_claims.target_role`, а `app.install_port_context` строкой выше уже
отверг claims, чей `target_role` разошёлся со строкой возможности (`cap.target_role <>
p_claims.target_role` → `port context capability mismatch`). Значит выбранная ветка — это
`target_role` именно той двери, которую открыл порт. Ветка при этом всё равно обязана найти принятый
контекст на свою роль, иначе гейт отвечает 42501 — и §3.3 показывает это живьём.

### 1.3 Права — только декларация + генератор

- `deploy/postgres/privileges/declaration.ts`:
  `integrator_port_reminder_occurrence_finalized_record` и
  `integrator_port_support_delivery_attempt_record` — `targetRole: 'app_tenant_service'` →
  `'app_integrator_request'` (`contextClass` не тронут);
- `deploy/postgres/privileges/function-census.ts`: `execute` первого корня
  `['app_operational_delivery_worker','app_tenant_service']` → `+ 'app_integrator_request'`;
- `deploy/postgres/privileges/declaration.ts`: `execute` второго корня `['app_tenant_service']` →
  `['app_integrator_request','app_tenant_service']`.

`GRANT EXECUTE` у `app_tenant_service` на оба корня СОХРАНЁН и обязан быть сохранён: право EXECUTE
принадлежит функции целиком, а не двери, и без него закроется дверь ВЕБАППА. **Право на дверь
интегратора снято там, где дверь и живёт — в каталоге возможностей**: строки
`app_ext.port_context_capabilities` порта интегратора больше не носят `app_tenant_service`, а гейт
тела не пустит роль вебаппа в ветку интегратора. Живой замер каталога после reconcile:

```
    port    |    session_login     |           target_role           | context_class  |                     purpose
------------+----------------------+---------------------------------+----------------+-------------------------------------------------
 webapp     | bcb_dev_webapp_staff | app_tenant_service              | tenant_service | integrator.reminder-occurrence-finalized.record
 integrator | bcb_dev_integrator   | app_integrator_request          | tenant_service | integrator.reminder-occurrence-finalized.record
 integrator | bcb_dev_integrator   | app_operational_delivery_worker | service        | integrator.reminder-occurrence-finalized.record
 webapp     | bcb_dev_webapp_staff | app_tenant_service              | tenant_service | integrator.support-delivery-attempt.record
 integrator | bcb_dev_integrator   | app_integrator_request          | tenant_service | integrator.support-delivery-attempt.record
```

Артефакты пересобраны `--all` и `--all --port-context-only`; **оба `--check` — побайтно, EXIT=0.**
Диффа в артефактах — 40 строк на четыре файла и ни одной лишней.

### 1.4 Перепись уменьшилась с трёх до одной

`deploy/postgres/privileges/name-census.json`, запись `integratorDoorsOnTheWebappTenantRole`. Замер
из самой декларации (не из файла переписи):

```
bcb_webapp_dev:     дверей порта интегратора на роли ВЕБАППА — 1   (tenant_service -> relation-wide)
bersoncarebot_test: дверей порта интегратора на роли ВЕБАППА — 1   (tenant_service -> relation-wide)
```

Было три (два именованных корня + сквозная `relation`), стало одна — только сквозная `relation`,
которую бриф запретил трогать.

---

## 2. Что изменилось в форме аттестации тела — назвал вслух, не спрятал

Генератор привилегий держит для каждого корня ожидаемый гейт. Пока у корня ОДНА пара
(`targetRole`, `contextClass`, `purpose`), он пишет режим `'exact'` — побайтное выражение гейта. Как
только пар становится больше одной, режим — `'exact_existing'`: набор токенов, каждый из которых
обязан присутствовать в теле (`deploy/postgres/privileges/generate.mjs:1428-1445`).

Первый корень был в `'exact_existing'` и до меня (у него уже была дверь доставки). **Второй корень
перешёл из `'exact'` в `'exact_existing'` — это ослабление аттестации, и оно неизбежно для
двухдверной формы, которую заказал ведущий.** Что при этом всё ещё пришпилено у второго корня:

```
ARRAY['app.hash_port_typed_args',
      'app.record_integrator_support_delivery_attempt(uuid,text,…)',
      'app_integrator_request', 'app_seam_delivery_scope_owner', 'app_tenant_service',
      'integrator.support-delivery-attempt.record', 'tenant_service']
```

то есть обе роли, назначение, класс, владелец шва и сама сигнатура. Плюс отдельная проверка того же
генератора: тело обязано содержать `app.require_accepted_context` (там же, строка 1528).

---

## 3. Живое доказательство (реальный вывод)

### 3.1 Миграция приземлена на DEV

`bash deploy/host/migrate-dev.sh --preflight` → EXIT=0, `pending=2 total=42`,
`migrate-dev preflight: PASS`. Затем `--execute` → EXIT=0:

```
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=2 total=42 reapplied=0 …
integrator owner-ordered migrations current for "bcb_webapp_dev": pending=0 eligible=1 total=1
access reconcile committed: env=dev database=bcb_webapp_dev; local admin socket=/run/postgresql
DEV port-context runtime env synchronized with declaration
migrate-dev: PASS (pending migrations applied; declaration reconciled and catalog-audited)
```

**`pending=2`, и вторая миграция — не моя.** Кроме моей применилась
`20260822T130000_the_registration_resend_door_finds_the_unconfirmed_draft` — она приехала в дерево с
уже влитой веткой `signup-resend-dead-20260822` и в ledger DEV её не было. Это штатное движение DEV
вперёд по ветке, не побочный эффект моей правки; называю, чтобы цифра `pending=2` не читалась как
«моя миграция состоит из двух».

Живое состояние корней после reconcile:

```
                     proname                     | exec_integrator | exec_webapp | gate_has_integrator_branch
-------------------------------------------------+-----------------+-------------+----------------------------
 record_integrator_support_delivery_attempt      | t               | t           | t
 record_reminder_occurrence_finalized_projection | t               | t           | t
```

### 3.2 Оба корня — настоящим маршрутом ОБОИХ портов, и отказ через чужую дверь

Проба идёт тем же кодом, что и рантайм: соединение под настоящим ЛОГИНОМ по mTLS, каталог
возможностей — из отрендерённого `*_PORT_CONTEXT_CAPABILITIES_JSON`, тот же оператор
`app.begin_port_context($1::uuid, ROW(1, …)::app.port_context_claims)`, тот же хеш типизированных
аргументов из `@bersoncare/db-principal`. Каждая проба — своя транзакция, заканчивается `ROLLBACK`.

```
ok   reminder :: своя дверь ИНТЕГРАТОРА [ждём pass] login=bcb_dev_integrator role=app_integrator_request result=true
ok   reminder :: своя дверь ВЕБАППА     [ждём pass] login=bcb_dev_webapp_staff role=app_tenant_service result=true
ok   support  :: своя дверь ИНТЕГРАТОРА [ждём pass] login=bcb_dev_integrator role=app_integrator_request result={"id":"baa3026a-…","ok":true,"created":true}
ok   support  :: своя дверь ВЕБАППА     [ждём pass] login=bcb_dev_webapp_staff role=app_tenant_service result={"id":"0dfc44fd-…","ok":true,"created":true}
ok   reminder :: интегратор в дверь ВЕБАППА [ждём fail] REFUSED: port context capability mismatch
ok   reminder :: вебапп в дверь ИНТЕГРАТОРА [ждём fail] REFUSED: port context capability mismatch
ok   support  :: интегратор в дверь ВЕБАППА [ждём fail] REFUSED: port context capability mismatch
ok   support  :: вебапп в дверь ИНТЕГРАТОРА [ждём fail] REFUSED: port context capability mismatch

ПРОБА ЦЕЛИКОМ ЗЕЛЁНАЯ
```

Корни не просто пропущены гейтом, а сделали работу: `reminder` вернул `true` (строка вставлена),
`support` вернул `created: true` с идентификатором.

### 3.3 Второй слой отказа: членства в роли вебаппа МАЛО

Логин `bcb_dev_integrator` в этой ветке ПО-ПРЕЖНЕМУ носит `app_tenant_service` (бриф запретил снимать
членство). Проба надевает эту роль настоящим маршрутом — через единственную оставшуюся возможность
порта интегратора на роли вебаппа, сквозную `relation`-дверь, — и стучится в оба корня:

```
сквозная дверь tenant_service порта интегратора: {"capabilityId":"bd5bd4d1-…","targetRole":"app_tenant_service","contextClass":"tenant_service","purpose":"relation"}
  reminder: login=bcb_dev_integrator role=app_tenant_service (роль ВЕБАППА надета)
ok   reminder: REFUSED: accepted port context required
  support: login=bcb_dev_integrator role=app_tenant_service (роль ВЕБАППА надета)
ok   support: REFUSED: accepted port context required

ВТОРОЙ СЛОЙ ОТКАЗА ДЕРЖИТ
```

Это и есть ответ на «а не открывает ли ELSE-ветка дверь всякому, кто надел роль вебаппа»: не
открывает. Ветка требует ПРИНЯТЫЙ контекст на эту роль с назначением и идентичностью корня, а такой
возможности у порта интегратора больше нет.

### 3.4 Инъекция A — в ветку интегратора подставлена роль вебаппа: проба покраснела

Тела корней сняты `pg_get_functiondef`, в каждом `THEN 'app_integrator_request'::name` заменено на
`THEN 'app_tenant_service'::name` (по одному вхождению в каждом), применено, прогнана та же проба:

```
FAIL reminder :: своя дверь ИНТЕГРАТОРА [ждём pass] REFUSED: accepted port context required
ok   reminder :: своя дверь ВЕБАППА     [ждём pass] …
FAIL support  :: своя дверь ИНТЕГРАТОРА [ждём pass] REFUSED: accepted port context required
ok   support  :: своя дверь ВЕБАППА     [ждём pass] …
… (все четыре отказа чужой двери остались ok)

ПРОБА КРАСНАЯ: 2 расхождений
```

Откат — восстановлением снятых определений; сверка `diff` после отката: `root1 identical`,
`root2 identical`. Повторный прогон пробы — `ПРОБА ЦЕЛИКОМ ЗЕЛЁНАЯ`.

### 3.5 Инъекция B — дверь возвращена на роль вебаппа в декларации: перепись покраснела и назвала виновника

```
not ok 9 - integrator port doors on the webapp tenant role are named, and the list only shrinks
  integrator port capabilities still reached through the webapp tenant role: … diverged
    appeared (1): support_delivery_attempt_record -> app.record_integrator_support_delivery_attempt(uuid,…)
    vanished (0): —
```

После отката — `# tests 9 # pass 9 # fail 0`.

### 3.6 Вход владельца тремя учётками на `:5200` — 200 на всех трёх

```
dimmdao@yandex.ru        {"ok":true,"redirectTo":"/app/doctor","role":"doctor"}                HTTP 200
dimmdao@gmail.com        {"ok":true,"redirectTo":"/app/admin/system-health","role":"admin"}    HTTP 200
kinesiospace@gmail.com   {"ok":true,"redirectTo":"/app/patient","role":"client"}               HTTP 200
```

---

## 4. Тесты и статика

- `pnpm test:db-privileges` — `# tests 205 # pass 143 # fail 0 # skipped 62`;
- opt-in DEV-пробы: `RUN_PORT_CONTEXT_GATE_DB=1 …port-context-gate-refusal…` — 3/0;
  `RUN_INTEGRATOR_MEMBERSHIP_DB=1 …integrator-login-membership-load…` — 3/0;
- оба `--check` генератора — побайтно, EXIT=0;
- интегратор: `npx tsc --noEmit` — EXIT=0; `npx vitest run src/infra/db` — 38 файлов, 175 тестов,
  0 падений;
- вебапп: `npx vitest run src/infra/db/portContextRuntime.test.ts src/infra/repos/pgReminderProjection`
  — 2 файла, 25 тестов, 0 падений;
- `npx eslint deploy/postgres/privileges/{declaration.ts,function-census.ts,relation-access.test.mjs}`
  — EXIT=0;
- гейты репозитория: `check-db-chokepoint`, `check-no-new-raw-sql`, `check-queue-port-boundary`,
  `check-test-runner-visibility`, `check-c4-migration-owned-function-bodies` — все OK.

**Один тест правился, и вот почему.** `deploy/postgres/privileges/relation-access.test.mjs:182`
пришпиливал точный список EXECUTE первого корня двумя ролями. Третья роль там появилась намеренно
(дверь интегратора), поэтому список обновлён и рядом написано, почему право EXECUTE у трёх ролей не
означает трёх проходов: дверь выбирает гейт тела, и каждая его ветка называет ровно одну роль.

---

## 5. Находки, которые НЕ чинились (их нет в плане владельца)

1. **`tsc` декларации был красным ДО меня и остался.** `npx tsc --noEmit -p
   deploy/postgres/privileges/tsconfig.json` даёт два `TS2322` на строках `evidence`. Проверено
   прямым замером: те же две ошибки на дереве БЕЗ моих правок (`git stash` на `declaration.ts` +
   `function-census.ts` → те же два сообщения, EXIT=2). Мои правки к ним отношения не имеют.
2. **Живой DEV-интегратор ждёт перезапуска.** Каталог возможностей приезжает к нему из `.env` при
   старте, а бежит он из главного чекаута (`/home/dev/dev-projects/BersonCareBot`, `tsx watch`).
   `migrate-dev.sh` синхронизировал env МОЕГО worktree, а не главного, поэтому две мои двери у
   живого процесса отвечали бы `port context capability mismatch`. Я синхронизировал строку
   `INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON` в главном чекауте ХИРУРГИЧЕСКИ: заменены ровно два
   значения `targetRole` (дельта длины файла — 8 символов = 2 × 4), бэкап
   `/tmp/d17_main_env_backup_1787415379.env`, после правки расхождение каталогов — 0. **Сам процесс я
   не перезапускал** — он чужой. Каталог вебаппа при этом не расходился ни на одну строку (замер: 0
   расхождений), поэтому вход на `:5200` из §3.6 от этого не зависит.

---

## НЕ СДЕЛАНО

- **Сквозная `relation`-дверь не переведена** — бриф запретил (60 колоночных привилегий на семи
  отношениях, отдельная работа с отдельным живым прогоном). Она и есть единственная оставшаяся
  строка переписи.
- **Членство `bcb_dev_integrator` в `app_tenant_service` НЕ снято** — бриф запретил снимать его в
  этой ветке. Состояние членств после работы прежнее и полное:
  `app_integrator_request, app_integrator_resolver, app_operational_delivery_worker,
  app_operational_scheduler, app_service, app_tenant_service`.
- **`app_operational_delivery_worker` не тронута** — её дверь у первого корня осталась своей веткой.
- **Живой DEV-интегратор не перезапущен** (§5.2) — чужой процесс.
- **Полный CI, `push`, деплой и запись на TEST не запускались** — запрещено брифом. Галочка D17 не
  ставилась.
