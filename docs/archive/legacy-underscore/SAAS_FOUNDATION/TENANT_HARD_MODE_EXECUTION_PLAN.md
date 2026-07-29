# Tenant Hard Mode — archived reasoning record

> **НЕ ЗАПУСКАТЬ ПО НЕМУ АГЕНТОВ / DO NOT EXECUTE.** This was never approved as an execution plan; none of its 143
> items were executed, and its goal was reached by a different route. It is archived outside `_TODO` because a
> document there reads as pending work. Keep the body intact only as a record of the reasoning. Its unique scope is
> preserved in the [R0 reconciliation register](../../../_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md#r0-plan-reconciliation-register-2026-07-15).

> **Historical R0 marker (2026-07-15).** O1 (DB role granularity) remained an open owner-facing question. The
> owner's 2026-07-13 decision covered app-layer clinic-membership capability, not the DB-role topology.

> The original body below is preserved verbatim as historical reasoning, including old phase names and agent
> prompts. Those passages are not instructions and must not be executed.

Статус: draft for owner decisions, 2026-07-14. Это план исполнения; код, миграции и runtime-конфигурация этим документом не меняются.

## 1. Решение и границы

### 1.1. Verdict

Tenant isolation нельзя считать закрытой только потому, что pool/Drizzle проходят через общий principal chokepoint. Hard mode должен одновременно обеспечить три свойства:

1. каждый runtime-вход получает типизированный principal до первого tenant-owned DB access;
2. DB role не может читать или менять строки вне разрешённого scope даже при ошибке repository/query;
3. глобальные, bootstrap и worker-сценарии имеют узкие явные исключения, а не неограниченный fallback.

Быстрый путь — немедленно закрыть P0 `broadcasts` и `media` на уровне workspace principal + обязательного org predicate, затем включать DB enforcement по классам таблиц. Единый flip всех 187 DB-helper файлов запрещён: это создаст невоспроизводимый big bang и может остановить booking, bootstrap, scheduler и workers.

### 1.2. In scope реализации

- principal carrier и signed DB session context;
- отдельные runtime DB roles/grants;
- route/action/page/worker principal resolution;
- RLS/policy renderer и воспроизводимый deploy/cutover artifact;
- P0 broadcasts/media walls;
- поэтапная классификация и enforcement остальных доменов;
- queue ownership и worker claim/execute model;
- platform admin + platform scope (рабочее имя владельца: `super-org`);
- migration/backfill/rollout/rollback gates;
- source/static, unit, integration и scratch/test DB proofs.

Основные области будущих изменений:

- `packages/db-principal/**`;
- `apps/webapp/src/app-layer/{guards,principal,db}/**`;
- `apps/webapp/src/infra/{db,repos}/**` и `apps/webapp/src/app/**` для классифицированных entrypoints;
- `apps/integrator/src/{infra,principal,app,integrations}/**`;
- `apps/media-worker/src/**`;
- `apps/webapp/db/schema/**`, `apps/webapp/db/drizzle-migrations/**`;
- `deploy/postgres/**`, `deploy/host/**`, `deploy/systemd/**` только в согласованных migration/cutover пакетах;
- `docs/_TODO/SAAS_FOUNDATION/scripts/**`, chokepoint/static guards и профильный execution log.

### 1.3. Вне scope

- изменение продуктовой модели авторизации/OTP;
- добавление `organization_id` в глобальные identity-таблицы только ради единообразия;
- ad hoc RLS без descriptor/renderer и rollback;
- перенос integration config из `system_settings` в env;
- Store UI, billing, custom domain и продуктовая аналитика до их prerequisites;
- подключение к prod/dev DB или вывод ПДн в тестовые логи;
- изменения legacy Rubitime projection без отдельного cutover decision.

## 2. Неподвижные инварианты

1. Tenant source берётся только из authenticated workspace, resource ownership, enrollment или materialized job. `organizationId` из browser payload не является источником доверия.
2. `doctor` и `clinic_admin` всегда работают в выбранной организации. Отсутствие или неоднозначность membership приводит к отказу до DB business query.
3. `client` всегда ограничен одновременно организацией и собственным `platform_user_id`; один user может иметь активные enrollment в нескольких org, поэтому org выбирается по ресурсу/явному enrollment, а не как «первая клиника».
4. `platform_admin` не равен `clinic_admin`. Cross-tenant scope не наследуется от `adminMode` и не включается автоматически.
5. `bootstrap`, `infra`, `worker`, `public` и `webhook` не являются универсальным bypass. У каждой роли есть allowlist таблиц/операций.
6. Для SCOPED таблиц missing principal в enforce mode — DB error + безопасный structured security log; пустой результат не считается корректным отказом.
7. Все tenant writes stamp ownership из principal или scoped parent. Клиентский payload не может переопределить ownership.
8. Таблицы без прямого `organization_id` защищаются через scoped parent или active `org_enrollments`; `platform_users`, contacts и channel bindings остаются глобальной identity-моделью.
9. `organization_id IS NULL` разрешён только для заранее классифицированного global/default semantics. NULL не является совместимостью «видно всем» по умолчанию.
10. RLS, FORCE RLS, grants и helper functions должны воспроизводиться после fresh restore обычным migration/cutover процессом. Ручной overlay не является закрытым gate.

## 3. Principal и DB-role model

### 3.1. Два независимых слоя

- **Application principal** описывает actor/context: `doctor`, `clinic_admin`, `client`, `platform_admin`, `worker`, `bootstrap`, `migration`, `public_booking`, `webhook`.
- **PostgreSQL role** задаёт максимальный класс прав. RLS дополнительно сужает строки по signed context.

Нельзя кодировать всю продуктовую authz только DB role: capability checks остаются в guard/service. Нельзя полагаться только на app guard: DB role/RLS является последней стеной.

### 3.2. Целевая матрица ролей

| Application principal             | Целевая DB role                                                | Обязательный scope                               | Разрешение                                                                             |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `doctor`                          | `app_doctor`, member of marker `app_staff`                     | `organization_id`, `actor_user_id`               | Tenant clinical/content rows своей org; capability проверяется до DB call.             |
| `clinic_admin`                    | `app_clinic_admin`, member of `app_staff`                      | `organization_id`, `actor_user_id`               | Tenant management rows своей org; нет platform-global CRUD/audit.                      |
| `client`                          | `app_patient`                                                  | `organization_id`, `patient_user_id`             | Только свои строки/назначенные ресурсы в выбранной org.                                |
| `platform_admin` / platform scope | `app_platform_admin`, не runtime owner                         | `platform_scope`, `actor_user_id`, `reason`      | Явные global/admin ports и отдельно разрешённые cross-tenant aggregate/audit policies. |
| `platform_admin` / clinic scope   | `app_clinic_admin` или `app_doctor` через отдельный scoped run | конкретная `organization_id`, actor, reason      | Действует как tenant actor; cross-tenant право на этот run не переносится.             |
| enqueue writer                    | соответствующая doctor/clinic/public role                      | tenant/resource org                              | Только `INSERT`/enqueue function; queue SELECT/claim запрещены.                        |
| broadcast/delivery worker         | `app_worker`                                                   | сначала claim scope, затем `job.organization_id` | Claim технической очереди; business execution только под job principal.                |
| scheduler                         | `app_scheduler`                                                | per-row/per-bucket org после scan                | Читает только due-index/dispatcher view; tenant writes выполняет по org bucket.        |
| media worker                      | `app_media_worker`                                             | `job.organization_id`                            | Claim media jobs; media/file update только в org задачи.                               |
| public booking                    | `app_public_booking`                                           | org, выведенная из host/link/branch/service      | Узкий booking create/read contract; нет общего tenant read.                            |
| signed webhook/M2M                | `app_webhook`                                                  | org из trusted event/resource                    | Узкий ingress contract; mixed-org payload разбивается на per-org runs.                 |
| pre-auth/bootstrap                | `app_bootstrap`                                                | без tenant scope                                 | Только allowlisted identity/auth/org-resolution views/functions.                       |
| infra/health                      | `app_infra`                                                    | без business scope                               | Технические health/idempotency/queue metrics; tenant business tables не доступны.      |
| migrator                          | deploy-only `app_migrator`                                     | не применяется                                   | DDL/backfill/policy install; не используется runtime units.                            |
| owner                             | NOLOGIN owner role                                             | не применяется                                   | Владение схемой/таблицами; не содержится в runtime credentials.                        |

Имена конкретных cluster roles утверждаются владельцем/оператором. Marker `app_staff` сохраняется для `app.is_staff()`, но не является login role и не даёт BYPASSRLS.

### 3.3. Запрещённые сочетания

- `clinic_admin` под `app_platform_admin`;
- `client` без `patient_user_id` или с org, выбранной по «first/default»;
- `worker` с platform-wide business read;
- `bootstrap`/`infra` с DML на SCOPED clinical/media/broadcast tables;
- runtime role как owner таблицы, member migrator/owner или `BYPASSRLS`;
- integrator principal, замапленный на patient role без отдельного grant/policy contract;
- один AsyncLocalStorage principal на параллельное выполнение jobs разных org.

## 4. Signed DB session contract

### 4.1. Защищённые поля контекста

Текущие raw GUC (`app.org`, `app.patient_user_id`, `app.integrator_user_id`) не должны быть источником доверия в hard mode. Канон — protected backend context + short-lived signed SECURITY DEFINER installer, уже намеченный в `PHASE0_MULTITENANT_DESIGN_LOCK.md`.

Целевой контекст:

| Поле                                            |         Всегда | Обязательное для                                            | Назначение                                         |
| ----------------------------------------------- | -------------: | ----------------------------------------------------------- | -------------------------------------------------- |
| `principal_kind`                                |             да | все runtime runs                                            | Тип actor/process; enum, не произвольная строка.   |
| `db_role_class`                                 | да, DB-derived | все                                                         | Проверка соответствия principal фактической role.  |
| `source`                                        |             да | все                                                         | Стабильный code identifier entrypoint/job handler. |
| `request_id` / `correlation_id`                 |             да | request/job                                                 | Корреляция отказа без payload/ПДн.                 |
| `organization_id`                               |        условно | doctor, clinic_admin, client, per-org worker/public/webhook | Tenant wall.                                       |
| `actor_user_id`                                 |        условно | doctor, clinic_admin, platform_admin                        | Аудит actor; RLS не заменяет capability.           |
| `patient_user_id`                               |        условно | client                                                      | Self wall внутри org.                              |
| `integrator_user_id`                            |        условно | integrator user-bound event                                 | Messenger/reminder self/scoped policies.           |
| `job_id`                                        |        условно | worker/media-worker/scheduler execution                     | Связь с materialized job и audit.                  |
| `scope_mode`                                    |             да | `tenant`, `platform`, `bootstrap`, `infra`, `claim`         | Исключает неоднозначный empty org.                 |
| `reason_code`                                   |        условно | platform scope, emergency/break-glass                       | Audit justification из allowlisted code.           |
| `expires_at`, `backend_pid`, `nonce`, signature |             да | signed context                                              | Anti-replay/connection binding.                    |

`source`, `reason_code` и role names — allowlisted constants. URL, request body, email, phone, patient name и message content в context/log не попадают.

### 4.2. Установка и очистка

1. Guard/resolver аутентифицирует actor и разрешает workspace/resource/job.
2. Named app-layer helper создаёт typed principal. Route/module не вызывает `runWithDb*Principal` напрямую.
3. Chokepoint при checkout/transaction сверяет principal с требуемой DB role, выполняет `RESET ROLE`, `SET ROLE <exact allowlisted role>`, устанавливает signed context.
4. DB helper functions `app.current_org_id()`, `app.current_patient_user_id()`, `app.current_scope_mode()` читают protected context; policy не читает raw GUC.
5. В `finally` выполняются `app.release_principal_context()` и `RESET ROLE`; cleanup failure уничтожает pool connection.
6. Nested run может только сужать scope. Смена org или повышение tenant→platform внутри активного transaction запрещены.

Применение только на transaction недостаточно: contract обязателен для pool checkout, Drizzle transaction, `runWebappSql`, integrator `DbPort`, scheduler и media-worker. Plain Drizzle/query без principal в hard mode должен падать до business SQL.

### 4.3. Observe и enforce semantics

- `legacy-guc`: только временная совместимость до shadow rollout; новые paths не добавляются.
- `shadow`: business query продолжает выполняться только для ещё не-enforced table class, но emits `tenant_principal_violation` при missing/mismatched principal. Для P0-enforced tables shadow не ослабляет RLS.
- `locked`: отсутствие principal, role/context mismatch, missing org/patient/job или попытка bootstrap access к SCOPED class приводит к typed error до query либо RLS denial.

Глобальный process mode сам по себе недостаточен для staged rollout. Фактический rollout определяется table descriptor (`observe`/`enforce`) и grants/policies: P0-таблицы могут быть enforced, пока legacy/telemetry остаются observe.

### 4.4. Логирование hard failures

Единое событие `tenant_principal_violation` содержит:

- timestamp, service/process, source, request/correlation id;
- principal kind, DB role class, scope mode;
- opaque org id либо keyed fingerprint; patient/actor/job ids — только keyed fingerprints;
- operation class (`select|insert|update|delete|claim`), table/domain descriptor;
- reason enum: `missing_principal`, `missing_org`, `missing_patient`, `role_mismatch`, `scope_escalation`, `rls_denied`, `foreign_resource`, `legacy_null`, `unclassified_access`;
- policy/version и outcome (`observed|denied`).

Не логировать SQL values, payload, recipient, file name/path, phone, messenger id или текст сообщения. Rate-limit одинаковые события, но отдельный counter не терять. P0 denied events создают security/operator signal; observe events идут в метрики и агрегированный report.

## 5. Platform admin и `super-org`

### 5.1. Безопасная семантика

`super-org` не является UUID-wildcard и не участвует в обычном предикате `row.organization_id = current_org`. Это зарезервированный platform namespace/Organization для identity, ownership platform-managed assets и audit attribution.

Cross-tenant доступ разрешается только если одновременно истинны:

1. фактическая role — `app_platform_admin`;
2. signed context `scope_mode='platform'`;
3. actor подтверждён как platform admin;
4. вызван отдельный platform port/use-case, а не tenant repository;
5. указан allowlisted `reason_code`;
6. операция записана в immutable platform audit.

Такой подход предотвращает ошибку вида `organization_id = SUPER_ORG OR platform_admin`, которая превращает super-org в неявный bypass во всех policies.

### 5.2. Два режима platform admin

- **Platform scope:** глобальные тарифы, global settings, cross-tenant audit/aggregate, provisioning. Только `/api/admin/platform/**` или эквивалентный отдельный composition root.
- **Clinic scope:** выбранная org и обычная tenant policy. Нужен явный переход, reason/correlation и новый principal run. Clinic repository не видит platform scope.

`system_settings`: global rows (`organization_id IS NULL`) пишет только platform scope через `updateSetting`; org override пишет clinic scope с org. Mirror `public`/`integrator` сохраняет тот же logical key.

### 5.3. Reserved `platform_support`

`platform_support` не входит в первый rollout. Это reserved extension point поверх той же platform-scope модели, чтобы обычная поддержка не требовала полного `platform_admin`.

На первом этапе platform support visibility может выполняться `platform_admin` через отдельные platform-support ports/use-cases, но grants, policies, source constants и audit taxonomy не должны предполагать, что единственный platform actor навсегда admin. Позже `app_platform_support` получает узкие capabilities:

- read/search списка пользователей приложения;
- поиск/просмотр contacts и channel bindings через masked-by-default представления;
- reveal контакта только с allowlisted `reason_code` и audit event;
- чтение support inbox/threads/messages через dedicated platform-support ports;
- отсутствие provisioning, global settings writes, billing/admin mutations и tenant repository bypass.

Support visibility не реализуется через `organization_id = SUPER_ORG OR ...` и не использует обычные clinic repositories. Все cross-tenant support paths требуют `scope_mode='platform'`, actor, source, reason/correlation и immutable audit.

### 5.4. Break-glass

Break-glass не входит в первый rollout. До отдельного owner-approved runbook нельзя добавлять bypass token/role. Будущий механизм должен иметь short TTL, reason, dual approval и отдельный audit; runtime owner/migrator credentials не используются как break-glass.

## 6. Table classes и RLS strategy

### 6.1. Классы

| Класс                            | Policy shape                                                                   | Примеры/правило                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| A. Direct tenant                 | `organization_id = app.current_org_id()` + matching `WITH CHECK`               | media, broadcast audit/drafts/recipients, org settings override, most clinical/catalog rows.                      |
| B. Scoped parent                 | `EXISTS`/FK ownership через immutable parent                                   | stage items, messages, child media, appointment lifecycle. Child write копирует org parent; payload org запрещён. |
| C. Enrollment/self               | active enrollment в current org + `patient_user_id=self`                       | patient access to global identity/channel binding and patient resources. Не добавлять org в `platform_users`.     |
| D. Legitimate global catalog     | global read policy; writes platform-admin only                                 | настоящий platform catalog, tariff definitions, immutable reference definitions после ADR.                        |
| E. Global default + org override | read exact org, fallback NULL; writes разделены                                | `system_settings`; global default не означает mutable shared row для clinic role.                                 |
| F. Queue/infra                   | writer INSERT-only; claim role via narrow function/view; execution per job org | outgoing delivery, media jobs, scheduler due index, idempotency/outbox.                                           |
| G. Telemetry/operator            | process-specific grants; tenant dashboard via projections                      | health/security telemetry; raw cross-tenant data не доступна clinic role.                                         |
| H. Legacy/unclassified           | observe, deny adding new writers, cutover plan                                 | legacy booking/Rubitime projections; нельзя объявлять global ради прохождения теста.                              |

### 6.2. Enforcement order

**Enforce first:**

1. broadcasts audience/drafts/audit/recipients and enqueue path;
2. media files/folders and media mutation/foreign folder checks;
3. already-org-owned doctor clinical paths with proven principal tests;
4. Store entitlement tables after reproducible policy install;
5. worker business execution rows with non-null job org.

**Observe first:**

- references until global/per-org ADR + unique/backfill is closed;
- product analytics until org attribution/unknown bucket exists;
- legacy booking/Rubitime projections;
- global identity/contact bindings accessed through enrollment;
- remaining 47 higher-layer DB-helper files and 27 entrypoints until classified;
- bootstrap/auth/org resolution and public booking surfaces until narrow grants are proven.

### 6.3. Policy requirements

- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` for enforced SCOPED tables;
- `USING` and `WITH CHECK` for every allowed DML verb; SELECT policy alone не закрывает writes;
- table owner не используется runtime;
- no catch-all `USING (true)` for staff/worker/bootstrap;
- policy names/version generated from descriptor model;
- post-migrate checker проверяет FORCE, policy verbs, grants, owner and `rolbypassrls`;
- fresh restore proof обязателен; ручное применение overlay не принимается;
- NULL ownership count и orphan parent count равны нулю до `NOT NULL`/enforce, кроме описанных E/D classes;
- indexes покрывают `organization_id` и parent/enrollment predicates до production FORCE.

## 7. Worker queue model для рассылок

### 7.1. Ownership и separation of duties

1. Doctor/clinic writer разрешает аудиторию только внутри authenticated org через active `org_enrollments`.
2. Preview/count/execute используют один обязательный `organizationId` contract и одинаковую audience semantics.
3. Execute материализует broadcast audit и queue jobs с `organization_id NOT NULL`. Job получает immutable `organization_id`, `broadcast_audit_id`, recipient identity/ref и payload snapshot/version.
4. Enqueuer имеет `INSERT` либо вызов narrow enqueue function. У него нет `SELECT/UPDATE/DELETE` очереди и claim API.
5. Worker имеет claim/update technical state, но не может создавать broadcast audience или читать doctor client list глобально.
6. Claim выполняется под `scope_mode='claim'` role `app_worker` через narrow atomic operation (`FOR UPDATE SKIP LOCKED` внутри repository/function). Результат содержит job org.
7. Каждый job исполняется в новом `runWithWorkerJobPrincipal({jobId, organizationId, source})`. Business reads/writes вне этой org запрещены RLS.
8. Перед delivery повторно проверяется, что recipient имеет допустимую связь/enrollment с `job.organization_id` либо был materialized как valid recipient snapshot по утверждённой semantics. Foreign recipient → dead/blocked security outcome, не fallback.
9. Complete/fail/reschedule разрешены только claimed job/lease token. Worker не может менять org/job kind/payload после claim.
10. Retry сохраняет исходный org. Mixed-org batch разбивается на отдельные principal runs; нельзя держать один transaction на jobs разных org.

### 7.2. Queue schema/policy contract

Обязательные поля: `id`, `organization_id NOT NULL`, `kind`, `status`, `run_at`, `attempts`, `lease_owner`, `lease_expires_at`, `created_by_principal_kind`, `correlation_id`, payload/version, timestamps. Для broadcast intent также `broadcast_audit_id` и recipient ref.

Policy/grants:

- tenant writer: INSERT with `organization_id=current_org`; no queue SELECT;
- worker claim: narrow function/view over `queued/retry` rows; no arbitrary business table platform SELECT;
- worker technical update: claimed lease only;
- worker business repositories: normal tenant RLS under job org;
- platform admin: aggregate queue health view без recipient payload; payload access только audited incident use-case.

### 7.3. P0 broadcast acceptance

- preview, channel count, audience count и execute для org A никогда не содержат org B;
- org-less call падает до audience query;
- enqueue row всегда имеет org A;
- worker не вызывает global `listClients` и не пересчитывает audience;
- подменённый foreign recipient/job org отклоняется;
- writers не могут claim/read queue; worker не может enqueue arbitrary job;
- audit/draft/recipient reads и counters scoped той же org.

## 8. Staged execution

Каждый пакет — отдельный небольшой commit/аудит. После каждого package обновляется `docs/_TODO/SAAS_FOUNDATION/LOG.md` либо выделенный `TENANT_HARD_MODE_LOG.md`: diff, решения, проверки, known failures. Статус `completed` ставится только после локального acceptance gate.

### Phase H0 — design lock и executable inventory

Цель: превратить 187-file census в исчерпывающую decision matrix до role flip.

Работы:

- [ ] Зафиксировать owner decisions из раздела 12.
- [ ] Создать machine-readable descriptor: table → class → owner path → allowed principals/verbs → rollout state → policy version.
- [ ] Создать entrypoint matrix для 47 higher-layer files/27 entrypoints: entrypoint → auth guard → principal source → DB surface → table classes → observe/enforce.
- [ ] Сверить webapp, integrator, scheduler, worker, media-worker, public booking, webhook/M2M и bootstrap paths.
- [ ] Разделить `platform global`, `tenant`, `enrollment`, `queue/infra`, `telemetry`, `legacy` без класса `unknown global`.
- [ ] Составить method-level Store mechanic matrix вместо directory-level guesses.

Areas: `T0_DB_ACCESS_SURFACE.md`, `T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md`, descriptor/renderer/check scripts, `scripts/check-db-chokepoint.mjs`, `buildAppDeps.ts` composition roots.

Checks:

```bash
node scripts/check-db-chokepoint.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-db-access-surface.mjs
node /home/dev/brain/tools/code-search.mjs "runWithDbPrincipal getPool getDrizzle withClient" --repo bcb -k 50
```

Gate: 100% runtime DB surfaces классифицированы; новые unclassified DB calls ломают static check; текущие нарушения имеют owner/package, а не silent allow.

Checklist закрытия H0:

- [ ] Все пункты работ H0 закрыты или явно `cancelled` с причиной.
- [ ] Descriptor, entrypoint matrix и Store mechanic matrix сохранены в docs/scripts и не содержат `unknown global`.
- [ ] Все H0 Checks выполнены, результаты и known failures записаны в `TENANT_HARD_MODE_LOG.md`.
- [ ] Gate H0 подтверждён статическим check: новые unclassified DB calls падают.

### Phase H1 — P0 hotfix walls до общего role flip

#### H1-A. Broadcasts

- [ ] Перевести все preview/count/execute/audit/draft actions на doctor workspace guard.
- [ ] Сделать org обязательной в audience/count/service ports; выбрать clients через active enrollment.
- [ ] Удалить global channel count semantics для clinic surface.
- [ ] Scope audit/drafts/recipients/counters; stamp org from workspace.
- [ ] Enqueue только materialized org-owned jobs по модели раздела 7.
- [ ] Добавить A/B unit/repository/action/worker tests, включая фактический enqueue и foreign recipient.

Areas: `apps/webapp/src/app/app/doctor/broadcasts/**`, `modules/doctor-broadcasts/**`, `infra/repos/pgDoctorClients.ts`, broadcast count/delivery repos, `buildAppDeps.ts`, `apps/integrator/src/infra/runtime/worker/**`, outgoing queue repos/schema.

#### H1-B. Media reads и writes

- [ ] GET files/folders/flat/recursive/get-by-id/exists используют workspace principal.
- [ ] Repository ports требуют org; foreign folder/file id возвращает deny/not-found без раскрытия metadata.
- [ ] Зафиксировать NULL policy: legacy rows либо backfilled в org, либо выделены в platform catalog; `OR organization_id IS NULL` не добавляется без owner decision.
- [ ] Multipart `init/part-url/complete/abort`, legacy upload, presign/confirm stamp/verify одну org; auth выполняется до S3 capability work.
- [ ] Media transcode job inherits non-null file org; post-claim worker runs under job org.
- [ ] Добавить A/B tests для list/tree/upload continuation/foreign folder/job.

Areas: `apps/webapp/src/app/api/admin/media/**`, `apps/webapp/src/app/api/media/**`, `modules/media/**`, `infra/repos/mediaFoldersRepo.ts`, `infra/s3/s3MediaStorage.ts`, `apps/media-worker/**`, media schema/migrations.

Checks для H1:

```bash
pnpm --dir apps/webapp test -- doctor-broadcasts
pnpm --dir apps/webapp test -- media
pnpm --dir apps/integrator test -- outgoingDeliveryWorker
pnpm --dir apps/media-worker test
pnpm --dir apps/webapp typecheck
pnpm --dir apps/integrator typecheck
```

Gate: P0 A/B isolation зелёная без DB hard flip; missing workspace context fail-closed; нет global audience/media reads; новая очередь соответствует separation of duties.

Checklist закрытия H1:

- [ ] H1-A Broadcasts закрыт по всем work items, включая org-stamped enqueue и foreign-recipient denial.
- [ ] H1-B Media закрыт по всем work items, включая upload/multipart и media-worker job org inheritance.
- [ ] Все Checks для H1 выполнены; падения либо исправлены, либо внесены в blocked/owner-decision с точной причиной.
- [ ] Gate H1 подтверждён A/B isolation без общего DB role flip.
- [ ] `TENANT_HARD_MODE_LOG.md` обновлён diff/проверками/known failures.

### Phase H2 — principal carrier, roles и shadow instrumentation

- [ ] Расширить typed principal contract и убрать несовместимое integrator→patient role mapping.
- [ ] Реализовать distinct runtime roles/marker memberships без runtime owner/BYPASSRLS.
- [ ] Перевести policies на protected `app.current_*()` helpers и signed context.
- [ ] Применять/очищать context per checkout и transaction во всех process families.
- [ ] Ввести named wrappers для doctor, clinic admin, patient resource/enrollment, platform, job, public booking, webhook, bootstrap/infra.
- [ ] Запретить direct raw `SET app.*`, direct `runWithDb*` outside allowlisted principal layer и missing `source`.
- [ ] Добавить shadow logger/counters без ПДн и report по source/domain.
- [ ] Исправить static governance seals, включая media-worker и module-layer SQL violation.

Areas: `packages/db-principal/**`, app-layer principal/guards, all DB chokepoints, role/grant SQL renderer, static scripts.

Checks:

```bash
pnpm --filter @bersoncare/db-principal typecheck
pnpm --dir apps/webapp test -- dbPrincipalContext
pnpm --dir apps/webapp test -- withClient
pnpm --dir apps/integrator test -- withClient
pnpm --dir apps/media-worker test -- withClient
node scripts/check-db-chokepoint.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-db-access-surface.mjs
```

Scratch-only proofs: spoofed raw GUC denied; invalid/replayed/expired signature denied; wrong backend pid denied; cleanup works on success/throw/rollback; connection is destroyed on cleanup failure; role mismatch denied.

Gate: all process families can run shadow; zero unknown principal sources; signed context cannot be forged by runtime roles; shadow report пригоден для domain rollout.

Checklist закрытия H2:

- [ ] Все пункты H2 закрыты или явно `cancelled` с owner decision.
- [ ] Runtime roles/marker memberships не дают owner/BYPASSRLS и не используются как table owner.
- [ ] Signed context scratch-only proofs выполнены: spoof/replay/expired/wrong backend pid denied, cleanup проверен.
- [ ] Static governance seals закрывают raw `SET app.*`, direct principal helpers и missing `source`.
- [ ] Gate H2 подтверждён shadow run/report по webapp, integrator, scheduler, worker и media-worker.

### Phase H3 — reproducible RLS/grants and P0 DB enforce

- [ ] Перенести/встроить FORCE RLS, policies, grants, helpers из manual overlays в канонический idempotent migration/cutover path.
- [ ] Добавить post-migrate checker и fresh restore test.
- [ ] Backfill P0 org ownership, устранить orphans/NULL/foreign parent, затем constraints/indexes.
- [ ] Включить FORCE RLS для broadcast/media set и queue contract.
- [ ] Выполнить real-role A/B scratch/test proof под doctor, clinic_admin, patient denial, worker claim/execute, bootstrap denial.
- [ ] Подготовить rollback artifact, возвращающий policy/grant state без удаления tenant data/columns.

Gate: fresh disposable restore получает те же policies/grants без ручного SQL; P0 policies deny cross-org и allow legal flows; rollback proof пройден.

Checklist закрытия H3:

- [ ] FORCE RLS, policies, grants и helpers воспроизводятся из canonical migration/cutover artifact.
- [ ] Fresh disposable restore и post-migrate checker зелёные без ручного overlay.
- [ ] P0 ownership backfill/detectors показывают 0 unexplained NULL/orphan/foreign-parent rows.
- [ ] Real-role A/B proofs закрыты для doctor, clinic_admin, patient denial, worker claim/execute и bootstrap denial.
- [ ] Rollback artifact проверен и не удаляет tenant data/columns.

### Phase H4 — clinic staff domains

Rollout order: уже principal-ready clinical routes → booking canonical tables → CMS/LFK/catalog → memberships/payments. Каждый domain сначала shadow до нулевого unexplained violations, затем backfill/constraint, затем enforce.

Для каждого domain:

- [ ] Закрыть entrypoint matrix и capability order: auth → workspace → principal → entitlement → service.
- [ ] Сделать org обязательной в port или derive via scoped parent.
- [ ] Запретить ownership from payload и foreign resource ids.
- [ ] Добавить A/B allow/deny tests для SELECT/INSERT/UPDATE/DELETE.
- [ ] Проверить clinic_admin vs doctor capabilities отдельно от RLS.
- [ ] Включить FORCE/policies только после shadow/backfill gate.

Schedule settings выделяются в authz-пакет: clinic-owned APIs получают clinic-management guard и tenant principal; global Rubitime/read-source settings остаются platform scope. Это не маскируется как RLS bug.

Gate domain: 0 unexplained shadow events за согласованное окно на TEST; A/B matrix зелёная; rollback готов; owner approves enforce.

Checklist закрытия H4:

- [ ] Для каждого clinic staff domain закрыты entrypoint matrix, ownership path и capability order.
- [ ] Shadow window на TEST даёт 0 unexplained violations либо owner-approved exceptions.
- [ ] A/B allow/deny tests покрывают SELECT/INSERT/UPDATE/DELETE и различают clinic_admin vs doctor capabilities.
- [ ] FORCE/policies включены только после backfill/constraint gate и rollback proof.
- [ ] Domain gate, owner approval и результаты checks записаны в `TENANT_HARD_MODE_LOG.md`.

### Phase H5 — client wall и multi-org enrollment

- [ ] Ввести runtime patient principal с обязательными `patient_user_id` и resource/enrollment-derived org.
- [ ] Классифицировать patient routes по program instance, appointment, submission, diary/reminder/enrollment source.
- [ ] Защитить global identity/channel reads через self + active enrollment, не через invented org columns.
- [ ] Запретить first/default org; ambiguous resource/enrollment даёт explicit selection/error.
- [ ] Добавить DB value checks/triggers для patient write shapes из `P0_5B_GRANTS.md`.
- [ ] Проверить одного client с enrollment A+B: ресурс A доступен в A principal, B — в B principal, cross-resource denied.

Gate: patient cannot impersonate another patient в той же org и не получает ресурс другой org; все patient writes ограничены column/value contract.

Checklist закрытия H5:

- [ ] Patient principal всегда содержит `patient_user_id` и resource/enrollment-derived org.
- [ ] Все patient routes классифицированы по источнику org/self scope; first/default org fallback отсутствует.
- [ ] Global identity/channel reads защищены self + active enrollment без invented org columns.
- [ ] Multi-org enrollment A+B proof закрыт: own resource allowed, foreign resource denied, ambiguity handled explicitly.
- [ ] Patient write value/column contracts из `P0_5B_GRANTS.md` проверены.

### Phase H6 — public, booking, webhook/M2M

- [ ] Public booking derives exact-one org from trusted host/link/profile/branch/service before SCOPED write.
- [ ] Webhook signature authenticates caller only; event org derives from trusted resource/payload contract.
- [ ] Mixed-org batches split into per-org runs.
- [ ] Bootstrap role читает только narrow identity/org-resolution views/functions.
- [ ] Legacy/default-org fallback либо мигрирован, либо остаётся explicit blocked exception с owner deadline.
- [ ] Rubitime legacy projections не включаются в FORCE до отдельного canonical cutover.

Gate: forged org in payload ignored/denied; unknown/ambiguous org does not write SCOPED data; bootstrap cannot scan business tables.

Checklist закрытия H6:

- [ ] Public booking org source exact-one и trusted; payload org не является source of truth.
- [ ] Webhook/M2M paths проверяют signature отдельно от tenant derivation и режут mixed-org batches на per-org runs.
- [ ] Bootstrap grants ограничены identity/org-resolution views/functions и не читают business tables.
- [ ] Legacy/default-org fallbacks либо мигрированы, либо оформлены как blocked exception с owner deadline.
- [ ] Rubitime legacy FORCE остаётся заблокирован до отдельного canonical cutover decision.

### Phase H7 — references/catalog and analytics decisions

References before enforce:

- [ ] Owner selects global vs per-org vs global-base+org-overlay.
- [ ] Для per-org/overlay изменить global `UNIQUE(code)` на соответствующий key, backfill/clone seeds, define NULL/global precedence.
- [ ] Enforce read/write policies и clinic A/B tests.

Analytics before Store P4:

- [ ] Define org attribution for multi-enrollment events.
- [ ] Stamp org at ingest, add org dimension to rollups, define unknown bucket.
- [ ] Separate clinic projection from platform cross-tenant aggregate port.
- [ ] Platform aggregate uses audited platform scope; clinic sees only own aggregate.

Gate: no unclassified NULL/global semantics; uniqueness matches ownership model; analytics attribution is deterministic.

Checklist закрытия H7:

- [ ] Owner decision по references/catalog ownership зафиксирован до schema/policy changes.
- [ ] Unique keys, seed/backfill и NULL/global precedence соответствуют выбранной ownership model.
- [ ] Clinic reference/catalog A/B read/write tests зелёные.
- [ ] Analytics ingest/rollups имеют deterministic org attribution, unknown bucket и clinic/platform projection split.
- [ ] Platform aggregates работают только через audited platform scope.

### Phase H8 — full cutover and cleanup

- [ ] Все SCOPED descriptors `enforce`; remaining H class has owner-approved isolation/cutover record.
- [ ] Runtime units use only non-owner NOBYPASSRLS roles.
- [ ] Shadow violations zero/accepted by explicit class; downgrade path tested.
- [ ] Remove legacy direct principal helpers/fallbacks only after `rg` runtime proof.
- [ ] Phase-level tests complete; full CI runs once at merge/deploy checkpoint.
- [ ] Owner-operated TEST window precedes production; production requires explicit owner approval.

Final gate:

```bash
pnpm install --frozen-lockfile && pnpm run ci
```

Не повторять full CI без новых изменений. Production policy/role verification выполняется только по owner-approved cutover runbook; этот план не разрешает prod access.

Checklist финального закрытия H8:

- [ ] H0-H7 checklists закрыты или явно `cancelled` с owner-approved reason.
- [ ] Все SCOPED descriptors в `enforce`; remaining H-class имеет approved isolation/cutover record.
- [ ] Legacy helpers/fallbacks удалены только после `rg` runtime proof.
- [ ] TEST process-family smoke и final full CI выполнены один раз на integration/deploy checkpoint.
- [ ] Production window, backup confirmation и policy/role verification выполняются только по отдельному owner-approved cutover runbook.

## 9. Migration и backfill gates

Checklist для каждой enforced table family:

- [ ] descriptor/ADR ownership;
- [ ] schema adds nullable ownership/parent support, если отсутствует;
- [ ] writers начинают stamp/copy org;
- [ ] read-only detector считает NULL/orphan/conflicting owner/duplicate key без ПДн;
- [ ] idempotent backfill на disposable/test copy;
- [ ] повторный detector = 0 необъяснённых строк;
- [ ] indexes, FK/check; `NOT VALID` → validate при необходимости;
- [ ] `NOT NULL`/immutable ownership guard;
- [ ] RLS `USING` + `WITH CHECK`, grants, FORCE;
- [ ] real-role allow/deny smoke + rollback proof;
- [ ] только затем production cutover window.

Backfill запрещено угадывать org при нескольких active enrollments/parents. Такие строки идут в conflict report с opaque ids и owner rule; они не назначаются default org автоматически.

## 10. Test matrix

Минимальная матрица на каждый enforced domain:

| Actor/scenario           |                Own org/self |              Foreign org/user |     Missing context | Expected                         |
| ------------------------ | --------------------------: | ----------------------------: | ------------------: | -------------------------------- |
| doctor A                 |         allow by capability |                          deny |                deny | DB role + org RLS.               |
| clinic_admin A           |       allow management only |                          deny |                deny | Capability отличается от doctor. |
| client A                 |          allow own resource |      deny foreign patient/org |                deny | org + patient wall.              |
| client enrolled A+B      | allow resource-selected org |        deny resource mismatch |      ambiguous deny | No first/default org.            |
| platform_admin platform  |  allow explicit global port |       tenant repo direct deny | missing reason deny | Audit required.                  |
| platform_admin clinic A  |           allow A as tenant |                        deny B |                deny | No inherited platform wildcard.  |
| enqueue writer A         |                insert A job |      insert B/read/claim deny |                deny | Separation of duties.            |
| worker claim             |          claim due metadata | business read before job deny |         no job deny | Claim scope only.                |
| worker execute A         |   allow job A business data |                        deny B |                deny | Per-job principal.               |
| bootstrap/public/webhook |       narrow resolve/create |            business scan deny |  ambiguous org deny | No fallback bypass.              |
| migrator                 |    allow only deploy window |                 never runtime |                 n/a | Separate credential/unit.        |

Дополнительные обязательные tests:

- SQL injection/raw `set_config` cannot forge context;
- pool reuse does not leak context across requests/jobs;
- nested org escalation fails;
- `WITH CHECK` rejects foreign ownership even if SELECT policy passes;
- FK/parent ownership mismatch rejected;
- legacy NULL row behavior matches class ADR;
- platform audit contains actor/source/reason/correlation, no payload/ПДн;
- rollback restores service without removing stamped org data.

## 11. Rollout и rollback

### 11.1. Rollout

- [ ] source/static gates and typed wrappers;
- [ ] shadow on TEST for all process families;
- [ ] P0 app walls;
- [ ] reproducible DB roles/policies on fresh disposable restore;
- [ ] P0 FORCE on TEST;
- [ ] domain-by-domain shadow→enforce on TEST;
- [ ] full process smoke: webapp, integrator API, worker, scheduler, media-worker, public booking/webhook fixtures;
- [ ] full CI at integration checkpoint;
- [ ] owner sign-off and backup-confirmed production window;
- [ ] production canary by domain/process, monitor denial counters, then expand.

### 11.2. Rollback triggers

- legal bootstrap/auth/health path denied;
- worker queue stalls or lease accumulation grows;
- any cross-org allow;
- unexpected missing-principal/role-mismatch above agreed threshold;
- context cleanup/pool leakage failure;
- migration/backfill detector nonzero after cutover;
- clinic A legal flow regression not explained by capability.

### 11.3. Rollback actions

- [ ] stop affected rollout/canary and prevent new enqueue where delivery safety is uncertain;
- [ ] switch affected table family to prebuilt compat policy/grants artifact; do not grant BYPASSRLS;
- [ ] roll back runtime role/context mode for the affected process only per runbook;
- [ ] restart affected units to clear pooled sessions;
- [ ] verify context cleanup and queue lease recovery;
- [ ] preserve ownership columns/backfill data and security logs;
- [ ] re-run focused allow/deny smoke before resuming.

Rollback не использует `DISABLE ROW LEVEL SECURITY` как штатную кнопку и не переключает runtime на owner/migrator.

## 12. Owner decisions до реализации

| ID  | Решение                                                                            | Рекомендация                                                                                                                                                                         | Блокирует                   |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| O1  | Distinct login roles для doctor и clinic_admin или один login + marker/capability? | Distinct `app_doctor`/`app_clinic_admin`, оба members `app_staff`; яснее grants/audit.                                                                                               | H2 role SQL.                |
| O2  | Семантика super-org                                                                | Reserved platform namespace, не wildcard; cross-tenant через `app_platform_admin` + explicit platform policy.                                                                        | H2/platform policies.       |
| O3  | Может ли platform admin входить в clinic scope?                                    | Да, только explicit org selection + reason + tenant role run; default platform scope не переносится.                                                                                 | Admin UX/API.               |
| O4  | References model                                                                   | Global base + org overlay, если клиникам нужны свои одинаковые codes; иначе strict per-org. Не оставлять global unique при per-org.                                                  | H7.                         |
| O5  | Media NULL rows                                                                    | Backfill to owning org; действительно platform media вынести в отдельный class/catalog. Не показывать NULL всем clinic roles.                                                        | H1-B/H3.                    |
| O6  | Broadcast recipient validity at execution                                          | Materialized org recipient + recheck active enrollment/channel eligibility перед send.                                                                                               | H1-A/queue.                 |
| O7  | Queue claim implementation                                                         | Narrow worker-only function/repository with lease token; writers INSERT-only.                                                                                                        | H1-A/H3.                    |
| O8  | Multi-org patient UX/source                                                        | Resource-derived org; explicit enrollment selection only для truly org-agnostic surface.                                                                                             | H5.                         |
| O9  | Public booking tenant source priority                                              | Verified host/link/branch-service exact-one mapping; no default org fallback after cutover.                                                                                          | H6.                         |
| O10 | Rubitime legacy timing                                                             | Keep explicit observe exception until canonical org source/cutover package approved.                                                                                                 | H6/H8.                      |
| O11 | Shadow acceptance window/threshold                                                 | TEST: zero unexplained violations for one full representative process cycle; any P0 violation blocks enforce.                                                                        | H3-H8.                      |
| O12 | Break-glass                                                                        | Отдельный later ADR/runbook; отсутствует в first cut.                                                                                                                                | Production operations.      |
| O13 | `platform_support` timing                                                          | Reserved extension point: не входит в первый rollout; support visibility сначала может идти через `platform_admin` + dedicated platform-support ports/audit, без tenant repo bypass. | Future support role/grants. |

До O1–O3, O5–O7 нельзя начинать role/policy/queue implementation. P0 application scoping можно делать сразу при сохранении рекомендованных defaults.

## 13. Definition of Done

- [ ] Все runtime DB surfaces и table classes имеют machine-checked classification; unclassified access fails CI/static gate.
- [ ] Doctor/clinic/client access без требуемых org/self principal hard-fails и создаёт безопасный security event.
- [ ] Platform admin, worker, bootstrap/public/webhook и migrator имеют отдельные узкие roles/contracts; нет runtime owner/BYPASSRLS.
- [ ] Broadcasts и media проходят двухорганизационную A/B матрицу, queue separation и real-role RLS proofs.
- [ ] RLS/grants/helpers воспроизводятся после fresh restore; post-migrate checker и rollback proof зелёные.
- [ ] Enforced domains имеют `USING` + `WITH CHECK`, нулевые unexplained NULL/orphans и покрывающие indexes.
- [ ] Client wall доказан для двух пациентов и multi-org enrollment без first/default fallback.
- [ ] TEST process-family smoke и один финальный full CI перед integration/deploy checkpoint зелёные; production flip выполнен только после owner approval.

## 14. Сопоставление со `STORE_EXECUTION_PLAN.md`

### 14.1. Что становится prerequisite

- **Перед Store P1.b:** H0, H1 P0 scoping, H2 typed workspace principal contract и H3 reproducible RLS/grants для entitlement tables. Entitlement guard не заменяет tenant resolution.
- **Перед `mailings` entitlement:** H1-A полностью, включая preview/count/execute/enqueue. Gate только create/send route недостаточен.
- **Перед `files` entitlement:** H1-B полностью, включая GET tree/list и весь multipart pipeline. Gate одного upload init недостаточен.
- **Перед Store P2 platform tariff admin:** platform admin/super-org contract O1–O3, отдельный platform port/audit и воспроизводимые policies.
- **Перед Store P3 packages:** owner ADR о platform-global catalog vs org-owned LFK, отдельные org-package grants и media access. Текущие LFK templates/exercises нельзя объявлять global автоматически.
- **Перед Store P4 analytics:** H7 analytics attribution, org-dimensional ingest/rollups, unknown bucket и отдельный audited platform aggregate port.
- **Перед Store P5:** H8 full tenant wall плюс отдельные billing/custom-domain ADR и threat model.

### 14.2. Что меняется в Store плане

1. P1.b заменяет directory-level список на method-level matrix `mechanic → entrypoint/method/action → auth guard → principal → entitlement → service`.
2. `requireEntitlement` становится чистой проверкой уже authenticated org context; не повторяет auth и имеет API/Server Action adapters.
3. `exercise_catalog` не помечается «no clinic surface»: существующие clinic writes проходят tenant + entitlement gate.
4. `booking`, `subscriptions`, `payments`, `patient_card` получают явную combined-gate semantics; owner фиксирует, нужны ли одновременные mechanics.
5. Store phase gate выполняется после каждой реально merge/deploy фазы, а не один раз после отложенного P5.
6. Ручной `store-p0-entitlements-rls.sql` не считается закрытием до canonical migration/cutover + fresh restore checker.
7. Demo/live проверки используют безопасные test fixtures и repository/action tests; прямой DB override не является обычным test workflow.

### 14.3. Что можно продолжить параллельно

- Resolver/types/UI design тарифов без cross-tenant writes;
- method-level inventory Store surfaces;
- in-memory entitlement tests;
- admin UX wireframes.

Их merge/enforce зависит от prerequisites выше. Store P1 gating нельзя расширять на unscoped entrypoints: сначала trusted org principal, потом entitlement.

## 15. Next agent assignment prompts

### 5-5 — principal/role design audit

> Прочитай `TENANT_HARD_MODE_EXECUTION_PLAN.md`, Phase 0 design-lock и текущий `packages/db-principal`. Read-only. Проверь O1–O3, signed context, role hierarchy и platform/super-org model против privilege escalation, SQL injection, pool reuse и bootstrap deadlock. Верни конкретные corrections, exact files и scratch proofs. Не трогай DB/env/taskdb, не реализуй код.

### 5-5 — queue/RLS design audit

> Прочитай разделы 6–7 плана и текущие broadcast/outgoing queue paths. Read-only. Построй exact writer→enqueue→claim→execute map, перечисли таблицы/grants/policies и проверь, что writer не читает/claim queue, worker не формирует global audience, job org immutable. Верни owner decisions и implementation slices. Без DB access и code changes.

### Sonnet — H1-A broadcasts implementation

> Реализуй только H1-A из `TENANT_HARD_MODE_EXECUTION_PLAN.md`: workspace org для всех broadcast actions, mandatory org audience/count ports, enrollment scoping, org-stamped audit/drafts/recipients/enqueue и A/B tests. Сначала code-search, затем точечные файлы. Не менять queue role SQL/H2+, env, taskdb или prod/dev DB. Auth всегда до entitlement. Запусти только указанные targeted webapp/integrator tests + typecheck затронутых apps; сложное решение вынеси ведущему.

### Sonnet — H1-B media implementation

> Реализуй только H1-B: tenant principal для media GET/list/folders и полного upload/multipart pipeline, mandatory org repos, foreign folder deny, media job org inheritance и A/B tests. NULL/global semantics не угадывать: при отсутствии owner decision остановить соответствующий substep. Не трогать env/taskdb/DB. Запусти targeted media tests, webapp/media-worker typecheck.

### Sonnet — H2 chokepoint/static gates implementation

> После owner decisions O1–O3 реализуй согласованный H2 slice в отдельном небольшом batch: typed principal/source contract, chokepoint apply/clear tests и static checks. Не включай FORCE RLS и не меняй runtime credentials в том же batch. Не расширяй scope на domain routes. Прогони package/chokepoint tests и typecheck; full CI только на согласованном integration checkpoint.
