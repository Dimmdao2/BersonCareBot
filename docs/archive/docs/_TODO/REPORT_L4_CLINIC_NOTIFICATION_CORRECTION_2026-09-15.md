# Отчёт коррекции Л4: уведомление клиники о новой заявке

Дата: 2026-09-15.

Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, §8.8; findings
`docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_2026-09-15.md` Д1–Д3.

Фактическая база клона перед правкой: ветка `wt/leads-notify`, `git rev-parse --short HEAD` →
`623d7b083`. Указанный в brief audit SHA `f3b27aaed` уже входит в эту голову; откат к старой голове
не выполнялся.

## Д1 — аудитория читается именованным корнем

**Чем закрыта.** `listActiveClinicAdminUserIds` больше не читает отношения напрямую. Он вызывает
`app.list_clinic_lead_notification_recipients(uuid)` через `runWebappNamedRoot`. Новый
`SECURITY DEFINER`-корень принимает только capability
`leads.clinic-notification-audience.read` класса `tenant_service`, сверяет аргумент с
`app.current_org_id()` и возвращает только активные membership-роли `owner`/`admin` принятой
организации, только для неслитых platform-ролей `doctor`/`admin`. Чужой organization id возвращает
пустой массив. Общий `listActiveStaffUserIds` не изменён: это другая, platform-wide аудитория, и её
параметризация смешала бы две разные context class и две разные границы данных.

Capability и все права объявлены в `deploy/postgres/privileges/declaration.ts`; generated-файлы для
DEV/TEST/PROD пересобраны генератором. В migration-файле ACL/RLS/GRANT/REVOKE отсутствуют.

### Разбор прав миграции по AGENTS.md §1

1. Миграция создаёт одну функцию:
   `app.list_clinic_lead_notification_recipients(uuid)`; таблицы и колонки не создаёт и не меняет.
2. DDL и тело принадлежат `app_seam_public_booking_owner`; тело исполняется как этот владелец
   (`SECURITY DEFINER`). Runtime-вызов разрешён только `app_tenant_service` после принятого
   `tenant_service` context.
3. Телу нужны `SELECT` на
   `platform_users(id, role, merged_into_id)` и
   `be_organization_members(organization_id, platform_user_id, role, status)`, а также существующие
   context-функции `app.current_org_id`, `app.require_accepted_context` и
   `app.hash_port_typed_args`.
4. Оба relation surface, owner, execute-role, сигнатура, stability/parallel mode, закрытый
   `search_path` и port capability присутствуют в declaration. Необъявленных прав по телу нет.

### Чем доказано

Owner-aware rollback-only preflight из candidate checkout:

```text
$ /home/dev/brain/host-orch/run-tests.sh "bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"
CREATE FUNCTION
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=224 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
RELEASED test lock (rc=0, 2s)
```

Живой probe выполнил candidate migration, затем точный declaration-generated ACL/capability/RLS в
одной транзакции, открыл тот же порт как
`bcb_dev_webapp_staff → app_tenant_service/tenant_service`, вызвал корень для своей и чужой
организации и сделал `ROLLBACK`. Одноразовый harness после проверки удалён; в продуктовый diff он
не входит.

```text
$ /home/dev/brain/host-orch/run-tests.sh "node .lead-clinic-audience-rollback-proof.mjs"
[2026-09-15T07:32:50+03:00] pid=2268917 WAITING for test lock :: node .lead-clinic-audience-rollback-proof.mjs
[2026-09-15T07:32:50+03:00] pid=2268917 ACQUIRED test lock :: node .lead-clinic-audience-rollback-proof.mjs
psql:<stdin>:2754: NOTICE:  00000: BCB_RUNTIME_DEFINER_GATES_VERIFIED database=bcb_webapp_dev functions=426
LOCATION:  exec_stmt_raise, pl_exec.c:3897
psql:<stdin>:4470: NOTICE:  00000: BCB_FUNCTION_BODY_SURFACES_VERIFIED functions=463 rows=1141 special_contracts=8 trigger_sources=1
LOCATION:  exec_stmt_raise, pl_exec.c:3897
D1_EXPECTED_OWN=["b0021a38-fb86-45e9-9aec-d85014e932d4"]

D1_TENANT_SERVICE_OWN=["b0021a38-fb86-45e9-9aec-d85014e932d4"]

D1_TENANT_SERVICE_FOREIGN_ARG=[]
{"function_exists" : false, "capability_rows" : 0, "ledger_rows" : 0}
[2026-09-15T07:33:46+03:00] pid=2268917 RELEASED test lock (rc=0, 56s)
```

Последняя JSON-строка доказывает rollback: кандидатной функции, capability и ledger-записи в DEV
после probe нет.

## Д2 — отказ уведомления не отменяет созданную заявку

**Чем закрыта.** После успешного `port.create` сервис возвращает созданную заявку, а уведомление
запускает как `void promise.catch(...)`. Ошибка сериализуется и пишется в logger вместе с `leadId`
и `organizationId` через переданный из `app-layer/di` reporter; модуль не импортирует infra.
Наружу из `submit` ошибка больше не выходит. Acceptance-oracle аудитора в
`service.unit.test.ts` не менялся и не ослаблялся.

**Чем доказано.** Точный targeted-прогон через host-lock:

```text
$ /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project unit src/modules/leads"
[2026-09-15T07:37:40+03:00] pid=2279981 WAITING for test lock :: pnpm --dir apps/webapp exec vitest run --project unit src/modules/leads
[2026-09-15T07:37:40+03:00] pid=2279981 ACQUIRED test lock :: pnpm --dir apps/webapp exec vitest run --project unit src/modules/leads
RUN  v5.0.0 /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp
Test Files  2 passed (2)
      Tests  5 passed (5)
   Duration  313ms (import 56%, transform 27%, setup 8%, tests 5%, worker 4%)
[2026-09-15T07:37:41+03:00] pid=2279981 RELEASED test lock (rc=0, 1s)
```

В эти пять входит audit-oracle: rejected notification при уже успешном create не отклоняет
`submit`.

## Д3 — кликабельный внешний URL

**Чем закрыта.** `notificationUrl` строится как абсолютный URL от `APP_BASE_URL` с удалением одного
завершающего `/`; `nativeRoute` сохранён относительным.

**Чем доказано.** Правка проверена инспекцией итогового вызова и eslint/typecheck. Отдельный тест не
добавлен: он дублировал бы literal/контракт текста, что запрещено AGENTS.md §10a.

## Остальные проверки

```text
$ pnpm --dir apps/webapp exec eslint src/app-layer/di/buildAppDeps.ts src/infra/repos/leadClinicAdminAudience.devDbProof.test.ts src/infra/repos/pgStaffUsers.ts src/modules/leads/notifyClinicLeadCreated.ts src/modules/leads/service.ts
(exit 0, output отсутствует)

$ ./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
(exit 0, output отсутствует)

$ /home/dev/brain/host-orch/run-tests.sh "node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --census && node scripts/check-migration-privileges.mjs && node scripts/check-c4-migration-owned-function-bodies.mjs && bash apps/webapp/scripts/check-drizzle-migration-order.sh"
DEV/TEST/PROD privilege and allowlist artifacts: byte-equal
Privilege census: 221 active relations across 3613 files; patient modules 408/120
Migration privilege check: OK (225 migrations)
C4 migration-owned function bodies: OK
Migration layout/order: OK
RELEASED test lock (rc=0, 81s)
```

## НЕ СДЕЛАНО

- Миграция на DEV не применялась; были только транзакционные проверки с `ROLLBACK`.
- TEST и оба PROD не затрагивались. Локальные PROD-generated-файлы только пересобраны из одной
  declaration.
- Полный `pnpm run ci` и `scripts/ci-record.mjs` не запускались — это оставлено ведущему после
  landing согласно brief.
- Финальный `pnpm --dir apps/webapp exec tsc --noEmit` не зелёный: команда завершилась `exit 2`
  на семи ошибках в нетронутых `src/infra/repos/pgPatientMergeCandidate.ts` и
  `src/infra/repos/pgPlatformUserMerge.ts` (контракты `@bersoncare/platform-merge`: отсутствуют
  `kind`, `organizationIds`, `medicalConflictApproval`, `mergeOutcome` и
  `MergePlatformUsersOutcome`). Локальных ошибок файлов этой коррекции в выводе нет; чинить соседний
  merge-account workstream вне brief не стали.
- Второй Next-сервер, автоматические UI-тесты и внешняя доставка Telegram/MAX не запускались.
- `listActiveStaffUserIds`, новая тема предпочтений уведомлений и UI настроек не менялись.
- Строка verdict в очереди не записывалась; автор работы не подписывал собственную приёмку.
