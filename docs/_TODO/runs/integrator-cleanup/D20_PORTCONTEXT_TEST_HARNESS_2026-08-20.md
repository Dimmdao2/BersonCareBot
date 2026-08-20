# D20 — REAL-Postgres harness под port-context (2026-08-20/21)

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D4 в реестре закрытых развилок и D20,
блок «ЗАКРЫТО 20.08», п. 1. Рабочая БД: только именованная DEV `bcb_webapp_dev`.

## Итог

**PARTIAL / BLOCKED BY REAL FINDINGS.** Silent skip устранён: четыре файла исполнили все 16 тестов. Два файла
зелёные, два обнаружили реальные несовместимости port-context и оставлены красными без снижения требований,
GRANT, миграций или изменения DB-объектов.

- `runIntegratorSql.integration.test.ts`: PASS, 1/1.
- `writeReminderRulesDirect.rls.integration.test.ts`: PASS, 3/3.
- `outgoingDeliveryQueue.reclaim.integration.test.ts`: FAIL, 3/3 + cleanup: fixture-role не может писать/удалять
  `outgoing_delivery_queue`.
- `operatorDeliveryAttempts.integration.test.ts`: FAIL, 8/9: тот же fixture-разрыв плюс несовпадение named-root
  identity для journal writer.

## D10 + D20 convergence — 2026-08-21

Предыдущие FINDING 1/2 ниже — сохранённый D20 red baseline; fixture finding закрыт admin-socket fixture pattern,
а journal identity исправлена canonical capability declaration. Current live blocker указан в этом разделе.

Фикстуры queue и journal больше не выдают `INSERT`/`DELETE` за `app_tenant_service` или worker. После
`assertTestDatabaseName` они используют существующий guarded admin-socket pattern (`postgres` через
`/var/run/postgresql`, строго `bcb_webapp_dev` или `*_test`), unique `d10b-`/`d987-` IDs и явную cleanup. Product
вызов не замаскирован: producer использует один параметризованный named root
`app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid)` с exact
accepted-context check в pending forward migration. Ни role grant, ни test-only capability не добавлялись.

Проверки классифицированы так: generator/check, migration/function/callsite, unit и typecheck — **test**; opt-in
live run и cleanup census — **view**. Test evidence: оба generator `--check` exit 0; `pnpm test:db-privileges` —
154 passed / 29 skipped / 0 failed; `node scripts/check-c4-migration-owned-function-bodies.mjs` — `OK`;
`node --test deploy/postgres/privileges/function-census.test.mjs` — 19/19; port-context catalog — 5/5. Таргетная
fault injection canonical `app.record_operator_delivery_attempt(...)` сделала catalog красным (exit 1, missing
exact descriptor); identity сразу восстановлена, artifacts regenerated и тот же catalog снова 5/5.

Финальный live **view** выполнен под lock на DEV:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-d20-portcontext-convergence-20260821 && set -a && source /home/dev/dev-projects/BersonCareBot/.env && set +a && RUN_INTEGRATOR_SQL_PERMISSION_TEST=1 RUN_OUTGOING_DELIVERY_RECLAIM_TEST=1 RUN_OPERATOR_DELIVERY_ATTEMPT_TEST=1 RUN_REMINDER_RULES_RLS_TEST=1 USE_REAL_DATABASE=1 pnpm --dir apps/integrator exec vitest run src/infra/db/runIntegratorSql.integration.test.ts src/infra/db/repos/outgoingDeliveryQueue.reclaim.integration.test.ts src/infra/db/repos/operatorDeliveryAttempts.integration.test.ts src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts"
```

Exit 1: **4 files, 16/16 executed, 7 passed / 9 failed / 0 skipped**. Это точный sanctioned-DEV blocker, а не
ослабленная проверка: live catalog ещё не reconciled и поэтому не содержит canonical journal capability и нового
generic enqueue capability. Сообщения: `Missing unique declared integrator port capability for
app.record_operator_delivery_attempt(...)` и `...app.enqueue_integrator_outgoing_delivery(...)`. Worker не применял
миграцию и не запускал reconcile; lead должен выполнить sanctioned DEV `migrate-dev.sh` reconcile и затем повторить
эту же команду. TEST/PROD не затрагивались.

После красного run cleanup **view** проверен read-only command:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT 'queue_test_rows=' || count(*) FROM public.outgoing_delivery_queue WHERE event_id LIKE 'd10b-%' OR event_id LIKE 'd987-%'; SELECT 'journal_test_rows=' || count(*) FROM public.notification_delivery_attempts WHERE event_id LIKE 'd987-%'; SELECT 'reminder_test_rows=' || count(*) FROM public.reminder_rules WHERE integrator_rule_id LIKE 'rls-it-%'; ROLLBACK;"
```

Exit 0: `queue_test_rows=0`, `journal_test_rows=0`, `reminder_test_rows=0`.

## Почему было skipped и что изменилось

До правки каждый файл требовал непустой `DB_PRINCIPAL_SIGNING_SECRET`; первые, второй и четвёртый дополнительно
проверяли legacy `DATABASE_URL`. На DEV `DB_PRINCIPAL_CONTEXT_MODE=port-context`, runtime использует
`INTEGRATOR_DB_URL`, а signed-context secret этому режиму не нужен. Поэтому `enabled=false`, и `describe.skipIf`
поглощал файл целиком.

Baseline-команда:

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/.env
set +a
RUN_INTEGRATOR_SQL_PERMISSION_TEST=1 \
RUN_OUTGOING_DELIVERY_RECLAIM_TEST=1 \
RUN_OPERATOR_DELIVERY_ATTEMPT_TEST=1 \
RUN_REMINDER_RULES_RLS_TEST=1 \
USE_REAL_DATABASE=1 \
pnpm --dir apps/integrator exec vitest run \
  src/infra/db/runIntegratorSql.integration.test.ts \
  src/infra/db/repos/outgoingDeliveryQueue.reclaim.integration.test.ts \
  src/infra/db/repos/operatorDeliveryAttempts.integration.test.ts \
  src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts
```

Реальный вывод до правки, exit `0`:

```text
Test Files  4 skipped (4)
Tests  16 skipped (16)
Duration  1.68s (... tests 0ms ...)
```

После правки gate требует ровно opt-in flag, `USE_REAL_DATABASE=1`,
`DB_PRINCIPAL_CONTEXT_MODE=port-context` и непустой `INTEGRATOR_DB_URL`. Отсутствующие обязательные mTLS/capability
поля не превращаются в skip: штатная runtime-валидация громко завершает прогон ошибкой.

## Команда, которая запускает тесты сегодня

Команда — та же, что выше. Она грузит канонический DEV integrator env из пути, заданного
`SERVER CONVENTIONS.md`, и не выводит credential values. После правки её реальный итог, exit `1`:

```text
Test Files  2 failed | 2 passed (4)
Tests  11 failed | 5 passed (16)
```

Ключевой результат — больше нет `skipped`: все 16 тестов исполнились. Красный цвет не скрыт.

## Изменённые assertions

1. `createRealPostgresIntegrationTestHarness(runtimeSource, principalContextMode)` теперь принимает mode явно и
   сверяет его с `DB_PRINCIPAL_CONTEXT_MODE` до подключения.
2. Fixture current-role в `locked` по-прежнему должен быть `app_staff`; в `port-context` должен быть
   `app_tenant_service`. Это не ослабление: ожидается точная роль, которую реально устанавливает
   organization-principal через `app.begin_port_context`.
3. Runtime current-role не менялся: для обоих worker source требуется точное
   `app_operational_delivery_worker`. Это основной narrow-role oracle тестов.
4. Reminder DB-name guard расширен только с `*_test` до явно разрешённого множества
   `bcb_webapp_dev OR *_test`; любой другой database name по-прежнему fail-closed.
5. Поведенческие assertions, ожидаемые записи, RLS denial, journal-content и reclaim/dead-letter ожидания не
   изменялись.

Stale header `locked + DATABASE_URL + DB_PRINCIPAL_SIGNING_SECRET` заменён реальной командой с каноническим DEV
env. Описание теперь называет действительные роли `app_integrator_request` и `app_tenant_service`.

## FINDING 1 — fixture capability не может готовить очередь

Достижимый сценарий: любой queue-backed test вызывает `harness.withFixtures`, port-context устанавливает
`app_tenant_service`, затем fixture делает `INSERT`/`DELETE public.outgoing_delivery_queue`. PostgreSQL отвечает
`42501 permission denied for table outgoing_delivery_queue` до поведения, ради которого создан тест.

Live introspection, exit `0`:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT current_database() AS database_name, has_table_privilege('app_tenant_service', 'public.outgoing_delivery_queue', 'INSERT') AS tenant_can_insert_queue, has_table_privilege('app_tenant_service', 'public.outgoing_delivery_queue', 'DELETE') AS tenant_can_delete_queue, has_table_privilege('app_operational_delivery_worker', 'public.outgoing_delivery_queue', 'INSERT') AS worker_can_insert_queue, has_table_privilege('app_operational_delivery_worker', 'public.outgoing_delivery_queue', 'DELETE') AS worker_can_delete_queue; ROLLBACK;"
```

```text
database_name  | tenant_can_insert_queue | tenant_can_delete_queue | worker_can_insert_queue | worker_can_delete_queue
bcb_webapp_dev | f                       | f                       | f                       | f
```

Не исправлено: brief запрещает расширять runtime privileges, менять role/grant/policy и подменять реальный
principal. Готового test-fixture порта для произвольной queue-row shape и удаления нет. Проверено:

- `code-search "outgoing_delivery_queue named root enqueue cleanup port context capability tenant_service"`;
- точный `rg` по `deploy/postgres/port-context`, `deploy/postgres/privileges`, `apps/integrator/src`;
- live `INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON` — только имена/roles/purpose/functionIdentity, без credentials;
- live `has_table_privilege` выше.

Существующие roots enqueue конкретные продуктовые формы и не являются произвольным fixture/cleanup портом; их
использование изменило бы test setup и oracle.

## FINDING 2 — journal writer вызывает не объявленный runtime function identity

`operatorDeliveryAttempts.ts` вызывает
`app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)`.
Текущий DEV capability catalog объявляет вместо него
`app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)`.
`integratorPortContextPrincipal` требует ровно один exact function identity и поэтому громко падает до SQL:

```text
Error: Missing unique declared integrator port capability for
app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)
```

Обе функции существуют и обе исполнимы ролью, что доказано read-only introspection; несовпадение находится именно
между app call-site и port-context catalog, а не в отсутствии SQL function или EXECUTE grant. Не исправлено по hard
prohibition: неправильный код под тестом — FINDING, не повод менять тест либо capability/DB в этой harness-задаче.

## Fault injection

**Не выполнен.** Обязательной исходной зелени delivery-attempt journal file нет: permanent code/env mismatch уже
делает его красным до journal SQL, а fixture mismatch валит queue-backed сценарии. Выдавать этот естественный FAIL
за намеренную fault injection или временно ослаблять assertion было бы ложным evidence. Поэтому цепочки
green → red → green для journal нет.

## Cleanup

После красного прогона проверено отсутствие остатков, exit `0`:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT (SELECT count(*) FROM public.outgoing_delivery_queue WHERE event_id LIKE 'd10b-%' OR event_id LIKE 'd987-%') AS queue_test_rows, (SELECT count(*) FROM public.notification_delivery_attempts WHERE event_id LIKE 'd987-%') AS journal_test_rows, (SELECT count(*) FROM public.reminder_rules WHERE integrator_rule_id LIKE 'rls-it-%') AS reminder_test_rows; ROLLBACK;"
```

```text
queue_test_rows | journal_test_rows | reminder_test_rows
0               | 0                 | 0
```

Port-context runtime сам открывает bounded transaction, вызывает `app.begin_port_context` и на ошибке выполняет
`ROLLBACK`. Успешные cross-role app calls используют production commit lifecycle и существующую явную cleanup;
единую внешнюю rollback-транзакцию поверх нескольких mTLS checkout не добавляли.

## Проверки

| Команда | Exit | Реальный итог |
| --- | ---: | --- |
| baseline opt-in команда выше, до правки | 0 | 4 files skipped, 16 tests skipped, tests 0ms |
| opt-in команда выше, после правки | 1 | 2 files passed, 2 failed; 5 tests passed, 11 failed; 0 skipped |
| `pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json` | 0 | без вывода |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run"` | 0 | 99 files passed, 4 skipped; 502 passed, 2 expected fail, 16 skipped |
| read-only privilege/function introspection | 0 | findings подтверждены живой `bcb_webapp_dev` |
| read-only cleanup census | 0 | 0 queue, 0 journal, 0 reminder test rows |

Полный Vitest без opt-in по канону оставляет эти четыре файла skipped; это ожидаемый default. Доказательство этой
задачи — отдельный opt-in run, который теперь не пропускает ни одного из 16 тестов и честно красный.

## NOT DONE

- Не достигнута общая зелень четырёх opt-in файлов: два реальных finding выше оставлены красными.
- Не выполнен delivery-attempt green → red → green fault injection, потому что green baseline отсутствует.
- Не добавлялись migration, grants, roles, policies, DB objects, env variables или credential paths.
- Не менялись product-code named root/capability declarations и не создавался test-only DB fixture bypass.
- Не заменялся production multi-checkout lifecycle единой admin/outer transaction ради искусственной зелени.
