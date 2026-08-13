# SAAS S6 — публичный каталог клиник и граница организации

Статус: `ready_for_execution`. Два явно отмеченных продуктовых нюанса вынесены за границу основных фаз и не
блокируют публичное чтение, tenant wall и маршрутизацию первого контакта.

Область выполнения: только тестовый сервер и локальные/disposable проверки. Этот документ не содержит действий
после приёмки на тестовом сервере.

## 1. Канон и приоритет

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Перед исполнением каждой фазы перечитать:

1. `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md:135`, `:151`, `:158`, `:173`, `:185` — главный
   источник решений владельца по каталогу, владению, первому контакту, ролям и совмещению ролей.
2. `docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md:1` и
   `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md:462` — порядок и TEST-гейты; старые формулировки о
   нерешённых вопросах по `be_organizations` не исполнять.
3. `docs/_TODO/SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md:24` и
   `docs/_TODO/SAAS_FOUNDATION/SAAS_R3_CUT_INVENTED_SCOPE.md:145` — bootstrap-прецеденты и известные пути,
   которые нельзя закрыть общей RLS-стеной.
4. `AGENTS.md:1`, `.cursor/rules/*.mdc`, `docs/ORCHESTRATION_BINDINGS.md:1` — правила кода, проверок и фаз.

При конфликте применяется решение владельца от 2026-07-15. Модель организации, публичного каталога, владельца
tenant и первого контакта уже определена и не требует повторного согласования.

## 2. Зафиксированные решения и граница авторства

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Решения владельца, применяемые без повторного согласования:

- рекламные данные клиник живут в отдельной публичной таблице/проекции и читаются без регистрации;
- внутренние данные организации не являются публичным каталогом; кросс-клиничное чтение доступно только
  глобальному администратору;
- создавший организацию tenant является её владельцем и может перенастраивать свою организацию;
- пациент становится пациентом клиники после регистрации клиникой, перехода по выданной клиникой ссылке или
  успешной записи в эту клинику;
- администратор может одновременно работать как специалист; в текущем UI уже есть отдельная вкладка настроек
  клиники и режим глобального администратора;
- первый контакт в мессенджере определяется явной привязкой канала/бота/ссылки к клинике, а не количеством клиник.

Инженерные решения S6, не приписываемые владельцу:

- публичный каталог реализуется денормализованной read-проекцией, чтобы анонимный запрос не получал доступ к
  `be_organizations`, `be_branches`, `be_specialists` и `be_clinic_services`;
- глобальный администратор получает отдельный подписанный principal и отдельный порт, а `adminMode` сам по себе не
  становится DB-bypass;
- регистрация специалиста и lookup приглашения сохраняются как узкие `SECURITY DEFINER` entrypoint'ы с отдельными
  `NOLOGIN`-ролями владельцев функций; общих bootstrap-грантов на таблицу не появляется;
- routing key и одноразовые clinic-link tokens хранятся только в виде hash; dedicated bot secrets остаются
  org-scoped, shared bot secrets — явно platform-global значениями `public.system_settings`; integrator читает
  обе формы напрямую с org-first/global-fallback semantics;
- при неоднозначной или отсутствующей привязке входящий webhook подтверждается транспортно, но бизнес-событие не
  исполняется и tenant не угадывается.

## 3. Факты текущего кода

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### 3.1 `be_organizations` сейчас смешивает внутреннюю модель и общий CRUD

- `apps/webapp/db/schema/bookingEngine.ts:64` содержит `id`, `title`, `is_active`, `sort_order`, `tariff_id` и
  timestamps. `tariff_id` явно коммерческий внутренний атрибут (`bookingEngine.ts:71`).
- `apps/webapp/src/modules/booking-engine/ports.ts:18` объединяет `get`, cross-org `list` и `upsert` в одном
  `OrganizationPort`.
- `apps/webapp/src/infra/repos/pgBookingEngine.ts:136` читает строку целиком, `:142` перечисляет все организации,
  `:148` делает insert/update.
- `apps/webapp/src/app/api/admin/booking-engine/organizations/route.ts:11` возвращает весь список через обычный
  booking-engine port; POST на `:18` пишет текущую строку, но guard на
  `apps/webapp/src/app/api/admin/booking-engine/_requireAdminBookingEngine.ts:23` разрешает только
  `role=admin + adminMode`, а не owner membership.
- таблица числится `SCOPED` (`deploy/postgres/p0-5-role-split.sql:124`), а descriptor называет особый
  `self_org_id` (`docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:134`). Общий renderer всё равно строит
  одну `FOR ALL`-политику (`rls-sql-renderer.mjs:526`), поэтому не выражает разные SELECT/INSERT/UPDATE правила
  root-таблицы. Одновременно `app_staff` получает табличный доступ через общий grant-set
  (`deploy/postgres/p0-5b-grants.sql:108`).

### 3.2 Изоляция «в лоб» ломает bootstrap

- signup создаёт организацию до staff-org context внутри `app.provision_specialist_owner`
  (`deploy/postgres/specialist-owner-provisioning-rls.sql:130`) и сразу создаёт owner membership (`:149`).
- lookup приглашения исполняется до workspace context и возвращает только данные приглашения плюс title клиники
  (`deploy/postgres/organization-member-invites-rls.sql:105`, join на `:138`).
- `be_organization_members` уже был переведён из `SCOPED` в `BOOTSTRAP` именно из-за pre-context resolver
  (`docs/_TODO/SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md:24`). Перевод всей `be_organizations` в существующий
  `bootstrap_global` запрещён: renderer делает такие таблицы глобально читаемыми
  (`docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:175`).
- doctor overview сейчас читает title через общий organization repo
  (`apps/webapp/src/app/api/doctor/booking-engine/overview/route.ts:13`); этот узкий label-path надо сохранить без
  выдачи raw-строки.

### 3.3 Поля, уже используемые как публичные

- филиал: `title`, `city_code`, `address` (`apps/webapp/db/schema/bookingEngine.ts:84`);
- специалист: `full_name`, `description`, только активный (`bookingEngine.ts:143`);
- услуга: `title`, `description`, `duration_minutes`, `price_minor`; текущий публичный фильтр требует
  `is_active && public_widget_visible && !admin_manual_only`
  (`apps/webapp/src/modules/patient-booking/inPersonServicesCatalog.ts:106`);
- текущий публичный create получает tenant из доверенного `branchServiceId`, затем выполняется с явным org principal
  (`apps/webapp/src/app/api/booking/public/create/route.ts:55`). Payload organization id не используется.

### 3.4 Привязка пациента существует только как read-path

- `org_enrollments` имеет уникальную пару `(organization_id, platform_user_id)` и статусы
  active/invited/discharged/archived (`apps/webapp/db/schema/bookingEngine.ts:208`).
- `PatientOrganizationPort` умеет только перечислять активные enrollment'ы
  (`apps/webapp/src/modules/patient-organization/ports.ts:8`); idempotent write-path отсутствует.
- публичная запись создаёт/разрешает пользователя и запись (`apps/webapp/src/app/api/booking/public/create/route.ts:59`),
  но enrollment не создаёт.

### 3.5 Первый контакт интегратора не выбирает клинику по deployment

- **ИСПРАВЛЕНО 13.08:** `resolveDeploymentSingleActiveOrganizationId`,
  `createResolveDeploymentOrganizationId` и их wiring удалены; первый контакт не может выбрать tenant по
  единственной/первой активной строке `be_organizations`.
- Signed `request-contact` является global pre-login handshake без tenant-write. Telegram/MAX business event
  получает клинику только из явного bot/link binding по целевой модели ниже; отсутствие binding не заменяется
  deployment fallback.
- Legacy `integrator.identities` удалена; глобальная привязка человека живёт в
  `public.user_channel_bindings(channel_code,external_id)`. Clinic channel context должен быть отдельной связью,
  а не дубликатом человека.

## 4. Целевая модель

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

```text
anonymous request ──> clinic_public_directory_entries (published snapshot only)

clinic owner ──signed staff principal──> own be_organizations title projection/update
                                          own public directory publish/update

global admin ──signed platform_admin principal──> dedicated internal organization port

signup bootstrap ──> app.provision_specialist_owner() ──> one new org + owner membership
invite bootstrap ──> app.lookup_pending_org_invite() ──> invite + organization title only

inbound bot endpoint / signed clinic link ──> organization_channel_binding ──> exact org
                                                              └──> identity_channel_binding
```

Ни один clinic request не принимает `organizationId` из body/query как источник владения. Global admin выбирает
организацию только в platform endpoint; переход в кабинет выбранной клиники начинает новый tenant-scoped run.

## 5. Публичная проекция и классификация полей

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Создать `public.clinic_public_directory_entries` как one-to-one read model организации:

| Поле проекции                | Источник                                                                     | Публичный API | Правило                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| `organization_id uuid PK/FK` | `be_organizations.id`                                                        | нет           | только ownership/join внутри БД                                                                  |
| `slug text UNIQUE`           | owner задаёт/меняет через валидатор                                          | да            | lower-case, стабильный URL id; не равен org UUID                                                 |
| `display_name text`          | явная копия `be_organizations.title` при первой публикации, затем owner edit | да            | raw organization row не читается публично                                                        |
| `description text NULL`      | рекламный текст owner                                                        | да            | plain text, ограничение длины                                                                    |
| `locations_json jsonb`       | active `be_branches`                                                         | да            | только `title`, `cityCode`, `address`                                                            |
| `specialists_json jsonb`     | active `be_specialists`                                                      | да            | только `fullName`, `description`                                                                 |
| `services_json jsonb`        | публичный фильтр service catalog                                             | да            | `title`, `description`, `durationMinutes`, `priceMinor`, опциональный server-built `bookingHref` |
| `is_published boolean`       | owner action                                                                 | косвенно      | API видит только `true`                                                                          |
| `published_at`, timestamps   | система                                                                      | нет           | audit/refresh, не рекламный payload                                                              |

JSON-массивы имеют явные TypeScript-типы и Zod-схемы; `any` и непроверенный cast запрещены. Публикация строит snapshot
только из строк текущей организации. Сортировка может использовать внутренний `sort_order`, но само значение наружу
не отдаётся.

Не публичны:

- `be_organizations.id`, `is_active`, `sort_order`, `tariff_id`, timestamps;
- `be_branches.short_title`, `color`, `timezone`, `is_active`, `sort_order`, внутренние UUID;
- room data, membership, enrollment и любые clinical/patient данные;
- service `buffer_after_minutes`, `prepayment_applicable`, `usable_in_packages`,
  `online_payment_applicable`, `public_widget_visible`, `admin_manual_only`, `sort_order`;
- bot tokens, webhook secrets, routing-key hashes, channel binding ids;
- непубличные/disabled специалисты, филиалы и услуги.

Дополнительные рекламные поля — логотип, фотографии, сайт, телефоны, соцсети, юридическое название — в текущей
модели отсутствуют. Их добавление помечено **требуется решение** и не должно расширять v1 payload молча.

## 6. Матрица доступа

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Actor                          | Public directory                            | `be_organizations` own row                       | Cross-clinic internal list | Create org                          | Delete org              |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------ | -------------------------- | ----------------------------------- | ----------------------- |
| anonymous / patient            | published SELECT                            | deny                                             | deny                       | deny                                | deny                    |
| doctor / assistant             | published SELECT + narrow current-org label | deny raw row                                     | deny                       | deny                                | deny                    |
| org `admin` member             | то же + текущие operational settings        | deny root row                                    | deny                       | deny                                | deny                    |
| org `owner` member             | own draft/read/publish                      | SELECT allowed columns; UPDATE `title` only      | deny                       | only signup path                    | requires decision below |
| global admin in platform scope | published + drafts                          | SELECT/UPDATE internal columns by dedicated port | allow                      | only registration/provisioning path | requires decision below |
| signup function role           | none                                        | no SELECT; INSERT only through function          | deny                       | one validated row                   | deny                    |
| invite lookup function role    | none                                        | title-only SELECT inside function                | deny                       | deny                                | deny                    |
| integrator bootstrap           | published if needed; channel resolver only  | deny                                             | deny                       | deny                                | deny                    |

`is_active`, `sort_order` и `tariff_id` не входят в owner UPDATE grant. Изменение lifecycle/tariff выполняется только
platform port с обязательным audit reason. `org admin` не получает право удаления или root-edit: владелец не
определил делегирование этих полномочий.

## 7. DB-wall для `be_organizations`

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Не использовать существующий общий `self_org_id -> FOR ALL`. Ввести purpose-built descriptor
`organization_root_boundary` с раздельными command policies:

1. `SELECT owner`: `id = app.current_org_id()` и
   `app.is_active_organization_owner(id, app.current_platform_user_id())`.
2. `UPDATE owner`: тот же predicate; column grant только на `title`; `updated_at` меняет trigger.
3. `SELECT/UPDATE platform`: только роль `app_platform_admin`, подписанный principal kind `platform_admin`,
   `app.current_platform_user_id()` соответствует активному `platform_users.role='admin'`.
4. `INSERT provisioning`: только `current_user` отдельной `NOLOGIN`-роли — владельца
   `app.provision_specialist_owner`; runtime login не состоит в этой роли.
5. `SELECT invite lookup`: только отдельная `NOLOGIN`-роль — владелец `app.lookup_pending_org_invite`; функция
   возвращает существующий узкий contract, не raw row.
6. `DELETE`: deny до решения semantics.
7. RLS `ENABLE + FORCE`; table owner, migrator и runtime login не используются как обход. Function-owner роли
   проходят свои command policies, а не получают `BYPASSRLS`.

Для owner/platform проверки расширить защищённый signed context:

- `packages/db-principal/src/index.ts:17`: добавить `platform_admin` principal и передавать `platformUserId` также
  для staff principal;
- `deploy/postgres/p2-b-protected-principal-context.sql:159`: добавить `principal_kind` и `platform_user_id` в
  protected backend context, HMAC payload и helpers `current_platform_user_id()` / `is_platform_admin()`;
- сохранить reset/release и nonce/TTL guarantees (`p2-b-protected-principal-context.sql:306`);
- **ЗАМЕНЕНО 12.08.2026:** `platform_admin` не выбирает staff login pool. При прежних двух software ports webapp
  владеет отдельным global-admin DB-login/mTLS certificate/pool; только он может `SET ROLE app_platform_admin`
  для этого directory surface или `app_platform_settings` для отдельного settings/system-health surface.
  Staff login не имеет platform-global membership, global-admin login не имеет staff/patient/clinical membership;
- `apps/webapp/src/app-layer/guards/requireRole.ts:215`: новый platform guard проверяет session role/adminMode,
  ставит platform principal и не разрешает использовать clinic repository в этом scope;
- отдельный `PlatformOrganizationDirectoryPort` — единственный application port с cross-org list/update.

## 8. Bootstrap-контракты, которые обязаны остаться зелёными

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Entrypoint                 | Tenant source                                 | Разрешённый DB surface                                                                | Запрещено                                   |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| specialist signup          | verified signup intent + user                 | `provision_specialist_owner`: INSERT org, INSERT owner membership, update intent/user | прямой INSERT в `be_organizations`          |
| organization invite lookup | token hash                                    | `lookup_pending_org_invite`: invitation fields + title                                | list/search orgs, tariff/lifecycle          |
| doctor overview            | signed current-org staff context              | narrow current-org label + scoped catalog                                             | raw organization repository                 |
| public directory GET       | slug/published index                          | directory projection only                                                             | joins to internal source tables             |
| public booking             | trusted branch/service                        | exact org booking + enrollment                                                        | payload/default/first org                   |
| messenger first contact    | trusted channel binding or signed clinic link | exact channel→org resolver                                                            | enrollment count/single active org fallback |

Bootstrap helper owner roles и function signatures фиксируются в migration smoke. Смена taxonomy
`be_organizations -> BOOTSTRAP` без нового purpose-built descriptor является ошибкой.

## 9. Patient enrollment invariant

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Добавить в `PatientOrganizationPort` idempotent method:

```ts
ensureActiveEnrollment(input: {
  organizationId: string;
  platformUserId: string;
  source: "clinic_registration" | "clinic_registration_link" | "booking";
}): Promise<PatientOrganizationEnrollment>;
```

Правила:

- unique `(organization_id, platform_user_id)` остаётся каноном;
- повторный вызов не создаёт дубль;
- successful booking восстанавливает/создаёт `active` enrollment до ответа API;
- tenant берётся из branch/service booking context, не из contact payload;
- clinic registration использует `gate.ctx.organizationId` и server-resolved patient id;
- clinic registration link хранит только token hash, одноразово подтверждается после auth и несёт server-side org;
- direct patient self-enrollment по произвольному org UUID запрещён;
- appointment/enrollment должны коммититься согласованно: использовать общий `runWebappTransaction`; уведомления
  запускаются только после commit. Если текущая booking orchestration не позволяет общей транзакции, сначала
  вынести DB writes в transaction-aware ports, а не оставлять compensating best-effort.

Действия `discharged -> active` и `archived -> active` при новой записи прямо следуют правилу «записался — появился»,
но должны писать audit event с source=`booking`.

## 10. Явная привязка канала к клинике

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### 10.1 Таблицы

Создать внутреннюю таблицу `public.messaging_channel_instances`:

- `id uuid PK`, `channel_code telegram|max`, `mode dedicated_bot|shared_link_bot`;
- `owner_organization_id uuid NULL FK`: обязателен для dedicated instance и всегда NULL для shared instance;
- `public_bot_handle`/`external_bot_id` — nullable публичный идентификатор, не credential;
- `routing_key_hash text UNIQUE`, `is_active`, timestamps;
- одна строка описывает конкретный bot/webhook instance; routing key определяет instance, но не подставляется как
  organization id.

Owner управляет только dedicated instance с `owner_organization_id = app.current_org_id()` через tenant service.
Shared instance создаёт/изменяет только global admin; owner может выпустить/отозвать только binding/link своей
клиники к уже разрешённому shared instance. Прямого списка чужих instances для owner нет.

Создать внутреннюю таблицу `public.organization_channel_bindings`:

- `id uuid PK`, `organization_id uuid NOT NULL FK`, `channel_instance_id uuid NOT NULL FK`;
- `clinic_link_token_hash text UNIQUE NULL`, `is_active`, timestamps, creator id;
- dedicated instance имеет ровно одну active organization binding; shared-link instance может иметь несколько, но
  каждая клиника получает отдельный high-entropy link token;
- unique active binding на `(organization_id, channel_instance_id)`; конфликтующий token запрещён.

Создать `integrator.identity_channel_bindings`:

- `identity_id bigint FK integrator.identities`;
- `organization_channel_binding_id uuid`, денормализованные `channel_instance_id uuid` и
  `organization_id uuid NOT NULL`;
- `is_current boolean`, `selected_at timestamptz`;
- unique `(identity_id, organization_channel_binding_id)`;
- partial unique гарантирует не больше одной current binding на `(identity_id, channel_instance_id)`;
- DB check/trigger подтверждает, что instance/org совпадают с parent organization binding.

`integrator.identities` остаётся глобальной person/channel identity; новая связь различает контекст клиники и не
ломает `(resource, external_id)` uniqueness.

### 10.2 Credentials и runtime config

Добавить org-scoped ключи в `apps/webapp/src/modules/system-settings/types.ts:2` и классифицировать `per_org` в
`apps/webapp/src/modules/system-settings/orgScopedKeys.ts:53`:

- `clinic_telegram_bot_token`, `clinic_telegram_webhook_secret`;
- `clinic_max_bot_api_key`, `clinic_max_webhook_secret`.

Для опционального `shared_link_bot` добавить отдельные platform-global DB keys
`clinic_shared_telegram_bot_token`, `clinic_shared_telegram_webhook_secret`,
`clinic_shared_max_bot_api_key`, `clinic_shared_max_webhook_secret`. Они не являются fallback для clinic key:
instance mode однозначно выбирает org-scoped dedicated credential либо platform shared credential.

Публичные handle/nickname живут в channel instance. Dedicated secrets — только в `system_settings` scope=`admin` с
`organization_id`; shared secrets — только в явно global строках platform admin scope. Запись выполняется через
`createSystemSettingsService().updateSetting`, чтобы сохранить mirror. Новых integration env keys не добавлять.
Существующие platform login bot settings не переопределять: login bot и clinic conversation channel имеют разные
обязанности.

### 10.3 Inbound resolution

1. Bot вызывает `/webhook/:channel/:routingKey`; сервер hash'ирует key и получает ровно один active channel instance
   до разбора business payload.
2. У dedicated instance единственная active organization binding сразу задаёт tenant. У shared-link instance первый
   контакт обязан содержать короткий opaque `/start clinic_<token>`; token hash даёт ровно одну active organization
   binding.
3. Успешный shared clinic token атомарно создаёт/обновляет identity binding и делает её current для пары
   `(identity, channel instance)`. Открытие ссылки другой клиники является явным переключением current binding;
   порядок строк и enrollment не участвуют.
4. Caller secret проверяется credential'ом выбранного channel instance: org-scoped для dedicated, явно platform
   shared для shared-link. Проверка подписи канала и определение tenant — разные шаги; успех одного не заменяет другой.
5. Resolver возвращает `{ organizationId, channelInstanceId, channelBindingId }`; эти значения ставятся в principal
   и immutable event facts. Любой org id из webhook body игнорируется/отклоняется.
6. Для последующих dedicated events endpoint снова является tenant source. Shared event без нового clinic token
   разрешается только через единственную current binding, ранее выбранную clinic link. Если current binding нет или
   она disabled, business event не исполняется и пользователь получает нейтральное предложение открыть ссылку
   нужной клиники. «Последняя по времени без явного link event», «первая» и default clinic запрещены.
7. Zero/multiple/inactive binding: HTTP transport acknowledgement, structured PII-free incident,
   `handleIncomingEvent` не вызывается.
8. Удалить `resolveDeploymentSingleActiveOrganizationId`, `createResolveDeploymentOrganizationId` и все их wiring/tests.
   Enrollment-based resolver не используется для выбора клиники входящего сообщения.
9. Outbound dispatch получает immutable `organizationId + channelInstanceId + channelBindingId`; mode instance
   выбирает dedicated или shared credential без fallback. Queue с отсутствующим/неоднозначным context становится
   failed/incident, а не отправляется.
10. Long-polling runner создаётся на каждый active channel instance и передаёт его id в общий webhook processor;
    singleton `telegramConfig.botToken` не определяет tenant.

## 11. Исполняемый чек-лист

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Каждый пункт закрывается только вместе с указанным доказательством. Номера новых migrations выбирать в момент
исполнения после проверки `apps/webapp/db/drizzle-migrations/meta/_journal.json:1`, чтобы не конфликтовать с
параллельной работой.

### S6.0 — census и execution log

- [ ] Создать execution log; записывать phase, изменённые paths, команды и фактические результаты без секретов/ПДн.
      Где: `docs/_TODO/SAAS_FOUNDATION/SAAS_S6_EXECUTION_LOG.md:new`. Доказательство: запись существует до первого
      code change.
- [ ] Через code-search и точечный `rg` обновить census всех `getOrganization`, `listOrganizations`,
      `upsertOrganization`, `resolveDeploymentSingleActiveOrganizationId` и прямых SQL к `be_organizations`.
      Где: anchors из §3. Доказательство: таблица caller→target port в execution log, ноль неразобранных runtime callers.
- [ ] Зафиксировать две synthetic организации, owner/admin/doctor/patient/global-admin identities и два channel
      bindings в disposable fixture. Где: `docs/_TODO/SAAS_FOUNDATION/scripts/p0-13-synthetic-fixtures.mjs:471` или
      отдельный `scripts/s6-clinic-directory-fixtures.mjs:new`. Доказательство: fixture не содержит реальных данных и
      не делает outbound delivery.

### S6.1 — signed platform/owner context

- [ ] Расширить typed principal без `any`. Где: `packages/db-principal/src/index.ts:17`, `:176`, `:480`, `:582`.
      Доказательство: unit tests различают staff, patient, integrator и platform_admin; forged/expired/replayed context
      отклоняется.
- [ ] Версионировать signed payload и protected context с `principal_kind` + `platform_user_id`, сохранив cleanup.
      Где: `deploy/postgres/p2-b-protected-principal-context.sql:159`,
      `docs/_TODO/SAAS_FOUNDATION/scripts/check-p2-b-protected-context-sql.mjs:1`, smoke `:new/updated`.
      Доказательство: old signature не даёт platform access; released pooled connection возвращает NULL helpers.
- [ ] Добавить `app_platform_admin` как `NOLOGIN` runtime role, доступную только через `SET LOCAL ROLE` из
      dedicated global-admin login после accepted port/human context, и helper с двойной проверкой role + DB user.
      Staff login membership в этой роли запрещён. Где: `deploy/postgres/p0-5b-role-split-staff-patient.sql:1`,
      `deploy/postgres/p2-b-protected-principal-context.sql:344`. Доказательство: adminMode под staff principal не
      читает cross-org; platform principal обычного user id отклоняется.
- [ ] Добавить `requirePlatformAdminApiContext` и запретить использование clinic repositories внутри него. Где:
      `apps/webapp/src/app-layer/guards/requireRole.ts:215`, `apps/webapp/src/app-layer/principal/platformAdminPrincipal.ts:new`.
      Доказательство: guard tests на admin/adminMode, admin без режима, doctor и malformed/stale id.

### S6.2 — purpose-built root wall

- [ ] Заменить descriptor `self_org_id` для `be_organizations` на `organization_root_boundary`; renderer строит
      раздельные SELECT/INSERT/UPDATE/DELETE policies и column grants. Где:
      `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:134`,
      `rls-sql-renderer.mjs:526`, `p0-9-enforce-descriptors.mjs:44`.
      Доказательство: static generator test запрещает `FOR ALL` и generic BOOTSTRAP для root table.
- [ ] Создать migration и соответствующий повторяемый policy artifact; revoke table-wide CRUD у `app_staff`,
      применить §7 policies/column grants. Где:
      `apps/webapp/db/drizzle-migrations/<next>_s6_organization_root_boundary.sql:new`,
      `deploy/postgres/s6-organization-root-boundary-rls.sql:new`. Доказательство: catalog queries `pg_policy`,
      `information_schema.role_table_grants` и `column_privileges` совпадают с матрицей §6.
- [ ] Переназначить narrow function owners на отдельные `NOLOGIN` roles и дать только нужные command grants.
      Где: `deploy/postgres/specialist-owner-provisioning-rls.sql:130`,
      `deploy/postgres/organization-member-invites-rls.sql:105`. Доказательство: direct bootstrap table read/insert denied;
      обе функции проходят прежний contract.
- [ ] Добавить `app.current_organization_label()` для doctor/admin current-org label или равноузкий port; убрать
      doctor overview с raw organization repo. Где: `apps/webapp/src/app/api/doctor/booking-engine/overview/route.ts:13`,
      admin overview `apps/webapp/src/app/api/admin/booking-engine/overview/route.ts:15`.
      Доказательство: doctor видит только id/title своей клиники, cross-org id возвращает deny/null.
- [ ] Разделить generic booking organization facade и management ports. Где:
      `apps/webapp/src/modules/booking-engine/ports.ts:18`,
      `apps/webapp/src/infra/repos/pgBookingEngine.ts:136`,
      `apps/webapp/src/modules/organization-management/{ports,service}.ts:new`,
      `apps/webapp/src/infra/repos/pgOrganizationManagement.ts:new`.
      Доказательство: booking port больше не содержит cross-org list/upsert; modules не импортируют infra.
- [ ] Перевести owner edit на `membershipRole === "owner"`; global internal list/update — на отдельный platform port.
      Где: `apps/webapp/src/app/api/admin/booking-engine/organizations/route.ts:11` заменить двумя routes:
      `/api/clinic/organization` и `/api/admin/organizations`. Доказательство: access matrix tests для всех ролей;
      payload org id owner route игнорируется/отклоняется.

### S6.3 — публичный каталог

- [ ] Добавить Drizzle schema и migration таблицы из §5. Где:
      `apps/webapp/db/schema/bookingEngine.ts:64` либо отдельный
      `apps/webapp/db/schema/clinicDirectory.ts:new`, migration `<next>_s6_clinic_public_directory.sql:new`.
      Доказательство: FK/unique/checks, JSON default arrays, published index, RLS FORCE.
- [ ] Создать clean-architecture module, infra repo и DI binding. Где:
      `apps/webapp/src/modules/clinic-directory/{types,ports,service}.ts:new`,
      `apps/webapp/src/infra/repos/pgClinicDirectory.ts:new`,
      `apps/webapp/src/app-layer/di/buildAppDeps.ts:1`. Доказательство: typecheck + architecture lint; Zod rejects extra/internal
      fields and malformed JSON.
- [ ] Реализовать owner preview/update/publish с server-side snapshot builder. Где:
      `/api/clinic/directory/route.ts:new`, `/api/clinic/directory/publish/route.ts:new`.
      Доказательство: owner A не читает/публикует B; org admin/doctor denied; unpublished row не появляется публично.
- [ ] Реализовать unauthenticated `GET /api/public/clinics` и `GET /api/public/clinics/[slug]`, оба работают под
      bootstrap principal и читают только projection. Где: `apps/webapp/src/app/api/public/clinics/**:new`.
      Доказательство: запрос без cookie = 200; SQL spy/static audit подтверждает отсутствие внутренних table joins;
      response schema не содержит поля из deny-list §5.
- [ ] Добавить страницы каталога/карточки на существующем app origin. Где:
      `apps/webapp/src/app/clinics/page.tsx:new`, `apps/webapp/src/app/clinics/[slug]/page.tsx:new`.
      Доказательство: guest UI показывает две published clinics, unpublished/disabled content отсутствует, ссылки записи
      несут только server-built trusted refs.
- [ ] Добавить owner-секцию «Публичная страница клиники» в существующую вкладку. Где:
      `apps/webapp/src/app/app/doctor/clinic/settings/page.tsx:35`; навигация уже существует в
      `apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts:94`. Доказательство: admin-as-doctor видит прежний кабинет и
      platform sections; owner видит clinic settings; doctor не видит edit controls.

### S6.4 — patient enrollment

- [ ] Расширить `PatientOrganizationPort` и service методом §9. Где:
      `apps/webapp/src/modules/patient-organization/ports.ts:8`, `service.ts:8`,
      `apps/webapp/src/infra/repos/pgPatientOrganization.ts:20`. Доказательство: insert, idempotent repeat и controlled
      reactivation tests.
- [ ] Включить ensure-enrollment в successful public/canonical booking transaction. Где:
      `apps/webapp/src/app/api/booking/public/create/route.ts:55`,
      `apps/webapp/src/modules/patient-booking/canonicalCreate.ts:134`.
      Доказательство: appointment + active enrollment появляются вместе; forced failure не оставляет одну половину.
- [ ] Добавить clinic registration application command с tenant только из clinic guard. Где:
      `apps/webapp/src/modules/patient-organization/service.ts:8`,
      `/api/clinic/patients/enroll/route.ts:new`. Доказательство: server-resolved user A enrolls in current org;
      body organization id rejected; doctor/assistant denied.
- [ ] Добавить one-time clinic registration link flow с hash-only token. Где:
      schema/migration `<next>_s6_clinic_patient_registration_links.sql:new`, module/route
      `/api/clinic/patient-registration-links` и `/api/patient/clinic-registration/accept`:new.
      Доказательство: valid token after auth enrolls once; expired/used/forged token denied; token не попадает в DB/log.

### S6.5 — channel binding и первый контакт

- [ ] Добавить схемы §10.1 в webapp/integrator migrations и typed contracts. Где:
      `apps/webapp/db/schema/messagingChannelInstances.ts:new`,
      `apps/webapp/db/schema/organizationChannelBindings.ts:new`,
      `apps/integrator/src/infra/db/migrations/core/<timestamp>_s6_channel_bindings.sql:new`,
      `apps/integrator/src/kernel/contracts/index.ts:1`.
      Доказательство: FK/unique/org-match/mode-owner constraints и no-secret schema audit; owner A управляет только
      своим dedicated instance/binding, owner B denied, shared instance изменяет только platform principal.
- [ ] Добавить org-scoped setting keys и Settings UI через существующий `updateSetting`. Где:
      `apps/webapp/src/modules/system-settings/types.ts:2`, `orgScopedKeys.ts:53`, clinic settings page `:35`.
      Доказательство: public+integrator mirror сохраняют одну `(key, scope, organization_id)` identity; dedicated mode не
      подменяет отсутствующий clinic credential global строкой, shared mode читает только явно shared key.
- [ ] Реализовать узкий bootstrap resolver channel key/link token → exact org; table SELECT интегратору не выдавать.
      Где: `apps/integrator/src/infra/db/repos/channelUsers.ts:68` заменить новым port/repo,
      policy/function artifact `deploy/postgres/s6-organization-channel-bindings-rls.sql:new`.
      Доказательство: correct binding resolves A/B; forged, disabled, zero and duplicate fail closed.
- [ ] Передавать binding context через Telegram/MAX processors и principal. Где:
      `apps/integrator/src/integrations/telegram/webhook.ts:155`, `:381`,
      `apps/integrator/src/integrations/max/webhook.ts:57`, `:194`.
      Доказательство: первый user без identity попадает в выбранную клинику; одна и та же external identity через два
      разных binding получает два точных tenant runs без смешивания; shared bare event идёт только в клинику,
      явно выбранную последним valid `clinic_<token>` event, а без current selection отклоняется.
- [ ] Удалить single-active-org fallback и его wiring во всех M2M callers. Где:
      `apps/integrator/src/infra/db/repos/channelUsers.ts:101`, `apps/integrator/src/app/routes.ts:77`.
      Доказательство: `rg` не находит symbol/comment; tests с двумя active organizations зелёные и не зависят от порядка id.
- [ ] Сделать outbound adapter binding-aware и fail-closed без credential fallback. Где:
      `apps/integrator/src/app/di.ts:241`, delivery adapters Telegram/MAX и outgoing worker
      `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:321`.
      Доказательство: dedicated event A использует fake credential A, B — B; shared event использует только fake shared
      credential; missing org/instance/binding/credential не вызывает fake network adapter и пишет PII-free incident.
- [ ] Обновить channel link parser: распознавать `clinic_<token>` отдельно от существующего user link
      (`link_<token>`). Где: `apps/webapp/src/modules/auth/channelLink.ts:75`, Telegram parser
      `apps/integrator/src/integrations/telegram/webhook.ts:223`, MAX mapping рядом с
      `apps/integrator/src/integrations/max/webhook.ts:273`. Доказательство: namespaces не пересекаются; старый account
      binding contract остаётся зелёным.

### S6.6 — adversarial доказательства и TEST acceptance

- [ ] Добавить unit/route tests: public payload allowlist, owner-only edit, global-admin dedicated port,
      admin-as-doctor menu, enrollment idempotency, signup/invite compatibility, exact channel routing. Где: соседние
      `*.test.ts[x]` для routes/services из S6.1–S6.5 и `apps/integrator/src/integrations/{telegram,max}/webhook.test.ts`.
      Доказательство: команды и counts в log.
- [ ] Выполнить disposable DB smoke с реальными ролями и RLS, org A/B, всеми actors из §6 и malicious cross-org
      SELECT/UPDATE/INSERT/DELETE. Где: `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-s6-clinic-org-boundary.mjs:new`.
      Доказательство: только разрешённые cells проходят.
- [ ] Добавить S6 в regression aggregator и соответствующие static gates. Где:
      `scripts/check-saas-db-regression.mjs:1`, `docs/_TODO/SAAS_FOUNDATION/scripts/check-s6-clinic-org-boundary.mjs:new`.
      Доказательство: агрегатор падает при возврате table-wide app_staff CRUD, generic bootstrap или single-org fallback.
- [ ] Выполнить узкие lint/typecheck/tests по мере фаз; после последнего fix — один релевантный full CI. Где:
      `.cursor/rules/test-execution-policy.md:1`, root `package.json:1`, execution log из S6.0. Доказательство: точные
      команды, exit codes и commit ref исполнителя в log.
- [ ] На тестовом сервере проверить через существующий dev/test auth: guest каталог; owner A edit/publish; owner B
      isolation; global admin internal list; admin-as-doctor переключение; два clinic bots/links только через safe fake
      transports. Где: `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md:1`, routes/pages из S6.2–S6.5.
      Доказательство: redacted API assertions и минимальные screenshots без ПДн/секретов.
- [ ] Провести независимый audit всего checklist против кода и executable evidence; найденные дефекты вернуть в fix
      loop, затем повторить только затронутый gate и финальный CI. Где: `docs/ORCHESTRATION_BINDINGS.md:1`, execution log
      из S6.0. Доказательство: `seal_test=true` и `seal_audit=true`; `accepted` остаётся действием владельца.

## 12. Явно требующие решения нюансы

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Эти нюансы не меняют принятую модель и не блокируют основные фазы:

1. **Удаление аккаунта организации.** Владелец зафиксировал право удалить аккаунт, но не определил hard delete,
   retention clinical/financial/audit данных и судьбу пациентов с enrollment в других клиниках. До решения S6 ставит
   `DELETE deny`, не показывает фиктивную кнопку и не подменяет удаление деактивацией.
2. **Расширенный рекламный набор.** Для v1 достаточно проверяемых полей §5. Логотипы, фото, контакты, сайт, соцсети и
   юридические реквизиты добавляются только после определения состава, модерации и media ownership.

Оба нюанса записываются в taskdb только исполнителем через taskdb-port; raw SQL к taskdb запрещён. Они не блокируют
root RLS, публичный v1 каталог, enrollment invariant и exact channel routing.

## 13. Definition of Done

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

S6 завершён только когда одновременно доказано:

- анонимный пользователь получает только published allowlist-проекцию и не касается внутренних таблиц;
- `tariff_id` и прочая внутренняя metadata ни в одном public/tenant response не появляются;
- owner меняет только разрешённые поля собственной строки; org admin/doctor не получают root CRUD;
- cross-clinic internal list проходит только через signed platform_admin principal + dedicated port + audit reason;
- direct runtime INSERT организации запрещён, signup создаёт ровно одну организацию и owner membership;
- invite lookup продолжает возвращать title без list/read доступа к `be_organizations`;
- успешная запись/clinic registration/link создают idempotent active enrollment точной клиники;
- при двух клиниках первый Telegram/MAX контакт маршрутизируется по bot/link binding, а не по пользователю,
  enrollment, default или порядку строк;
- все references на `resolveDeploymentSingleActiveOrganizationId` удалены;
- TEST evidence, execution log, adversarial audit, lint, typecheck, relevant tests и финальный CI честно зафиксированы.
