# AUDIT — `4bbbda02f`: D20 retry privilege and principal

Date: 2026-08-20  
Scope: `4bbbda02f^..4bbbda02f`  
Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D20, and the owner rule
“Никогда не расширяй права рантайм-роли; недостающее право — это НАХОДКА”.

## Verdict

**FAIL. Убито 5, не поймано 0.** Это не недостающее право `app_patient`; автор выбрал неверный
принципал. В действующем `port-context` enqueue выполняется как `app_integrator_request`, а обработка очереди —
как `app_operational_delivery_worker`. Обе роли уже объявлены для своих операций. Добавленный grant
`app_patient` текущий путь не чинит и расширяет поверхность runtime-роли конечного пользователя.

## Kill-set

| ID | Результат | Evidence |
| --- | --- | --- |
| K1 | KILLED — grant без policy не работает | Живая rollback-проба под `app_patient` после временных `USAGE` + column `INSERT` дошла до FORCE RLS и получила `SQLSTATE 42501: new row violates row-level security policy`; после `ROLLBACK` оба временных права снова `false`. |
| K2 | KILLED — principal автора неверен для текущего runtime | DEV env = `port-context`. `writePort.ts:536-543` ставит principal kind `integrator`; `portContextRuntime.ts:195-205,250-254` выбирает capability `request`; `declaration.ts:2287-2289` задаёт ей `targetRole: app_integrator_request`. `app_patient` выбирался только устаревшим `locked`-механизмом (`packages/db-principal/src/index.ts:1086-1089,1108-1130`). |
| K3 | KILLED — гипотетически допущенный `app_patient` не ограничен своей организацией | На живой таблице: `foreign_keys=0`, `user_triggers=0`, `policy_row_org_links=0`. CHECK связывает лишь `payload.organizationId` с `organization_id`; ни constraint, ни trigger, ни policy не сравнивает строку с организацией/пациентом текущего контекста. |
| K4 | KILLED — границы diff чисты | Target меняет только `deploy/postgres/privileges/declaration.ts` и авторский отчёт. Diff по `apps/webapp/db/drizzle-migrations`, любым `*.sql` и generated privilege paths пуст. |
| K5 | KILLED — D4 в обычном CI не доказывается | Gate содержит 4 env (`DATABASE_URL`, `DB_PRINCIPAL_SIGNING_SECRET`, `RUN_REMINDER_RULES_RLS_TEST`, `USE_REAL_DATABASE`) и `describe.skipIf(!enabled)`, но для осмысленного запуска файл требует ещё `DB_PRINCIPAL_CONTEXT_MODE=locked`. Обычный CI вызывает `pnpm test`, файл обнаруживается Vitest, но suite без opt-in пропускается. Тест отстал от действующего `port-context`; требование остаётся недоказанным. |

## Findings

### F1 — MUST FIX: grant расширяет неверную роль и не проходит существующий RLS

Живой `bcb_webapp_dev` подтвердил:

- `relrowsecurity=true`, `relforcerowsecurity=true`;
- обе политики применяются только к `app_integrator_request` и `app_operational_delivery_worker`;
- `rev10_direct_business_10` требует в `USING` и `WITH CHECK` одну из этих двух ролей;
- текущий column `INSERT` есть только у `app_integrator_request`;
- у `app_patient` нет даже `USAGE` на schema `integrator` в неприменённом live-состоянии.

Чтобы отделить schema/sequence ACL от RLS, rollback-проба временно выдала `app_patient` schema `USAGE`, sequence
`USAGE/SELECT` и ровно четыре добавляемых column privileges. INSERT с совпадающими
`payload.organizationId = organization_id` был отвергнут FORCE RLS с `42501`; `ROLLBACK` вернул оба проверенных
права в `false`. Следовательно, декларативная правка не исправляет заявленный отказ даже в старой модели
принципала.

Impact: owner-запрет нарушен буквально — capability у runtime-роли расширена, исправления нет.

### Security consequence: policy-допуск `app_patient` открыл бы cross-organization enqueue

Миграция `20260820T122628_direct_public_write_retry_org_invariant.sql` защищает целостность пары
`payload.organizationId`/`organization_id`, но не принадлежность этой пары пациенту. Живой каталог показывает
нулевое число FK, пользовательских trigger и policy-выражений с `organization_id`, `current_org_id` или
`current_patient_user_id`. Поэтому добавление в policy простого допуска `app_patient` позволило бы роли записать
произвольный чужой UUID, если тот же UUID положить в payload.

Это не отдельная достижимая уязвимость текущего diff: существующая RLS сейчас всё отвергает. Это доказательство,
почему policy нельзя расширять вслед за неверным grant: tenant boundary очереди тогда определялся бы
пользовательским input, а не текущим DB-контекстом.

### F3 — D4: реальное требование всё ещё не доказано

Утверждение “только четыре переменные” верно лишь для skip-gate. Файл сам требует пятую настройку
`DB_PRINCIPAL_CONTEXT_MODE=locked`; комментарий и реализация построены на старом signed-context/`SET ROLE
app_patient`. В DEV и webapp, и integrator имеют `DB_PRINCIPAL_CONTEXT_MODE='port-context'`.

Обычный CI запускает integrator `vitest --run`, но не задаёт opt-in env, поэтому suite пропускается. Попытка
запустить ровно файл без env завершилась до Vitest (`rc=254`, binary отсутствует в изолированном clone), так что
нового runtime evidence на target SHA нет. Независимая source-команда ниже подтверждает gate, skip и CI wiring с
`rc=0`. Требование D4 остаётся недоказанным до port-context live proof на именованной DEV/TEST.

## Правильные principal boundaries

- Enqueue из request-path: `app_integrator_request` — выбор в
  `deploy/postgres/privileges/declaration.ts:2287-2289`; эта роль уже имеет четыре column `INSERT` на очереди в
  `declaration.ts:6692-6693`.
- Claim/update/replay worker: `app_operational_delivery_worker` —
  `directPublicWriteRetryWorker.ts:112-116` выбирает `portCapability: 'delivery'`, а
  `declaration.ts:2293-2295` сопоставляет её worker-роли. SELECT/UPDATE уже объявлены в
  `declaration.ts:6696-6698`.
- `runWithIntegratorPrincipal` (`organizationPrincipal.ts:21-25`) сам роль не выбирает: он только сохраняет
  typed principal. Выбор `app_patient` существует лишь в legacy `locked`, не в активном `port-context`.

## Boundary result

PASS. В `4bbbda02f` нет migration-файлов, generated privilege SQL или любого `*.sql`; значит, нет и прямых
`GRANT`/`REVOKE`/`CREATE ROLE`/`ALTER ROLE`/`ALTER DEFAULT PRIVILEGES`/`CREATE POLICY` в миграциях. Единственная
правка продукта находится в декларации, как требует repo-rule. Это не меняет общий FAIL по существу grant.

## Commands and exit codes

Все команды ниже запускались без output pipe.

1. Live catalog/RLS/ACL/constraints, read-only transaction:
   `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 ...`
   — `rc=0`.
2. Hypothetical `app_patient` privilege probe: `BEGIN; GRANT ...; SET LOCAL ROLE app_patient; INSERT ...;
   ROLLBACK;` — process `rc=0`; INSERT `SQLSTATE=42501`; post-rollback
   `has_column_privilege=false`, `has_schema_privilege=false`.
3. Live FK/trigger/policy-row-link census, read-only transaction:
   `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 ...`
   — `rc=0`; exact results `foreign_keys=0`, `user_triggers=0`, `policy_row_org_links=0`.
4. `rg -n '^DB_PRINCIPAL_CONTEXT_MODE=' /home/dev/dev-projects/BersonCareBot/.env
   /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` — `rc=0`; both values `port-context`.
5. Node source measurement of D4 gate + skip + package/workflow wiring — `rc=0`;
   `gateEnvCount=4`, `skipIf=true`, `requiredMode=true`, root/workflow `pnpm test=true`.
6. `env -u RUN_REMINDER_RULES_RLS_TEST -u USE_REAL_DATABASE -u DATABASE_URL
   -u DB_PRINCIPAL_SIGNING_SECRET -u DB_PRINCIPAL_CONTEXT_MODE pnpm --dir apps/integrator exec vitest run
   src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts` — `rc=254`, `vitest` binary not
   installed in this clone; no test claim made from this command.
7. `git diff --check` — `rc=0`.
8. `git diff --exit-code 4bbbda02f^ 4bbbda02f -- apps/webapp/db/drizzle-migrations` — `rc=0`.
9. `git diff --exit-code 4bbbda02f^ 4bbbda02f -- ':(glob)**/*.sql'` — `rc=0`.
10. `git diff --exit-code 4bbbda02f^ 4bbbda02f -- deploy/postgres/generated
    deploy/postgres/privileges/generated` — `rc=0`.
11. `git diff --name-status 4bbbda02f^ 4bbbda02f` — `rc=0`; ровно два пути, перечисленные в boundary result.
12. Node census строк K1–K5 этого отчёта — `rc=0`, `killed=5 missed=0`.
