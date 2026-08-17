> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# SaaS S5 — разделение restricted settings и runtime config

Статус: **частично реализован.** На 2026-07-19 S5-0 (reality lock), S5-1 (additive runtime/audit contract) и S5-2 (RLS/grants/config-reader contract) завершены. S5-3 находится в executor/audit-gate: write chokepoint и dual-read/dual-write compatibility реализуются до независимого аудита. S5-4—S5-6 не начаты; S5-7 остаётся TEST/owner/ops-gated. S5 не complete.

> **Boundary:** это storage/runtime settings split, не план нового settings UI. Единый settings hub, ownership
> полей и отмена текущего переноса всей schedule-settings вкладки исполняются только по
> [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md)
> §15 и `IMPLEMENTATION_ROADMAP.md` C3. S5 не создаёт второй UI contract.

Этот этап относится только к полностью рабочей системе на **тестовом сервере**. Любые действия за его пределами
в scope не входят.

## 0. Канон и провенанс

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

При исполнении источники читаются в таком порядке:

1. [`OWNER_RULINGS_2026-07-15.md:1-167`](./OWNER_RULINGS_2026-07-15.md) — главный источник решений владельца.
   Для S5 обязательны §3, §9, §10, §15 и §16.
2. [`OWNER_DECISIONS_FOR_REVIEW.md:36-55`](./OWNER_DECISIONS_FOR_REVIEW.md) Часть Б — тариф → mechanics →
   клиника, полный конструктор и org overrides. Поправка по биллингу из rulings §1 имеет приоритет.
3. [`SEQUENCE.md:72-80`](./SEQUENCE.md) — симптом mixed `system_settings` и запрет функции/accessor на каждый флаг.
4. [`SAAS_ENFORCE_ROADMAP.md:301-349`](./SAAS_ENFORCE_ROADMAP.md) — D3/D4 зависят от исправленного settings-root.
5. `AGENTS.md`, `.cursor/rules/*.mdc`,
   [`docs/ORCHESTRATION_BINDINGS.md:49-96`](../../ORCHESTRATION_BINDINGS.md) — архитектура, проверки и цикл
   executor → audit → fixer → audit.

Владелец **не выбирал техническую схему хранения**. Его решение: приложение обязано читать настройки, смешанный
корень надо исправить, а инженерную схему не надо выносить ему как меню. Выбор ниже — инженерное решение S5; он не
подписан именем владельца.

## 1. Решение

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Выбран один путь: **физически разделить restricted settings и безопасный runtime config, затем выдавать UI один
типизированный effective snapshot через общий provider**.

### 1.1. Два хранилища

| Контур        | Хранилище                                                        | Что в нём                                                                                                               | Кто читает                                                                         |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Restricted    | существующий `public.system_settings` и его compatibility mirror | API keys, OAuth secrets, VAPID private key, payment credentials, allowlists, test identifiers, internal/security config | только server-side restricted ports и системные роли                               |
| Runtime       | новая `public.app_runtime_settings`                              | только значения, безопасные для application runtime; global default и org override; ни одного секрета                   | staff, patient server runtime; browser/public получает только разрешённую проекцию |
| Runtime audit | **планируемая** `public.app_runtime_settings_audit`              | old/new value, actor, source, org, timestamp                                                                            | staff/platform audit; пациент не читает                                            |

`public.system_settings` остаётся DB-backed источником интеграционных секретов. Новые env-переменные для ключей,
webhook URI или флагов не вводятся. Runtime config хранится один раз в `public.app_runtime_settings`; integrator
читает settings/runtime rows напрямую из схемы `public`, без второго mirror.

### 1.2. Один типизированный registry

Каждый setting key имеет одну исчерпывающую запись:

```text
key
storage: restricted | runtime | derived_runtime
ownership: global | per_org
audience: server | authenticated_client | public
value type/parser/default
optional mechanic dependency
optional safe projection from a restricted envelope
```

- Новый неизвестный key не собирается без полной записи registry.
- `restricted` никогда не попадает в runtime table или client serializer.
- `derived_runtime` — только безопасная проекция mixed envelope. Источник истины остаётся restricted row.
- Новый обычный UI-флаг требует запись registry и обычную строку данных; новая DB function, view или policy для
  конкретного флага не требуется.

Стартовые anchors: `apps/webapp/src/modules/system-settings/types.ts:1-202` и
`apps/webapp/src/modules/system-settings/orgScopedKeys.ts:1-190`. Исполнитель создаёт единый registry внутри
существующего `modules/system-settings`, а `SystemSettingKey`, `ALLOWED_KEYS`, org scope и runtime-key types выводит
из него либо проверяет compile-time exhaustiveness без второго ручного списка.

### 1.3. Один runtime provider для UI и server-side feature evaluation

Клиентские поверхности не читают таблицы и не вызывают key-specific DB accessors. Они используют один контракт:

```text
resolveRuntimeConfig(context) -> {
  flags: typed boolean map,
  values: typed scalar/structured map,
  revision: opaque string
}
```

`context` содержит доказанный `patientUserId` и, когда нужен org override, явный `organizationId`:

1. организация текущего авторизованного ресурса;
2. иначе явно выбранная организация patient app;
3. если обе отсутствуют — доступны только global rows, а запрос per-org key получает typed
   `organization_context_required`.

Запрещены fallback на «первую» или «единственную активную» клинику. Для обсуждения программы организация уже есть
в `TreatmentProgramInstanceDetail.organizationId` (`apps/webapp/src/modules/treatment-program/types.ts:361-375`):
route сначала получает свой instance, затем provider читает config с resource-derived org.

### 1.4. Стыковка с S4 без второго механизма

Тарифные mechanics не копируются в settings. Источник истины остаётся
`saas_tariffs` + `saas_org_entitlement_overrides`, resolver —
`apps/webapp/src/modules/org-entitlements/service.ts:10-36`.

Runtime provider собирает один UI snapshot из двух источников:

```text
ordinary runtime values ───────────────┐
runtime rollout flags ─────────────────┼─> RuntimeConfigSnapshot.flags / values ─> UI
resolved tariff mechanics + overrides ┘
```

- UI читает только snapshot, а не два независимых набора флажков.
- Registry умеет `source=setting`, `source=mechanic` и `source=all(...)`.
- `booking_payment_enabled` фиксируется как operational readiness; mechanic `payments` — коммерческое право
  клиники. Effective UI flag равен `payments entitlement AND booking_payment_enabled`.
- Server-side authorization не доверяет snapshot: порядок остаётся
  `auth → resource/org context → requireEntitlement(mechanic) → runtime readiness → service`.
- `requireEntitlement` (`apps/webapp/src/app-layer/guards/requireEntitlement.ts:7-23`) остаётся единственным
  enforcement chokepoint mechanics и дорабатывается по S4, а S5 не создаёт параллельную tariff model.

### 1.5. Restricted reads из patient-initiated backend command

`app_patient` не получает доступ к `system_settings`. Если backend-команда, начатая пациентом, должна вызвать
интеграцию с secret-bearing config (известный пример — acquiring provider в
`apps/webapp/src/app-layer/di/buildAppDeps.ts:776-785`), она использует отдельный server-only
`RestrictedSettingsPort` и узкую системную DB capability:

- `app_config_reader NOLOGIN NOBYPASSRLS` получает только `USAGE public` и `SELECT` restricted settings;
- отдельный login/pool является членом только `app_config_reader`, не `app_staff` и не `app_patient`;
- restricted-table policy для `app_config_reader` разрешает только global row или exact
  `organization_id = app.current_org_id()`; missing/forged org для org-row fail-closed;
- config-reader principal несёт resource-derived org, не patient payload;
- raw pool и port не экспортируются в routes/modules; composition находится в infra/DI;
- результат передаётся только integration adapter и никогда не сериализуется в response.

Это инженерное применение least privilege к системной роли из rulings §16. Оно не меняет продуктовые роли и не
даёт patient connection возможность `SET ROLE app_config_reader`.

## 2. Почему этот вариант, а не A/C

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Критерий                                | A: audience marker в mixed table             | **B: отдельный runtime store**                          | C: view над mixed table                         |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| Ошибка RLS открывает secret-bearing row | Да                                           | **Нет: secret table не granted**                        | Base table закрыта, но projection сложнее       |
| Mixed JSON                              | Нужен field split в той же таблице           | **Безопасная derived projection**                       | CASE/projection по каждому envelope             |
| Следующий UI-флаг                       | Registry + row, но общий table grant опаснее | **Registry + row**                                      | Часто правка view/SQL whitelist                 |
| Проверяемость privileges                | Средняя                                      | **Прямая: patient has zero grants on restricted store** | Требует доказывать view owner/invoker semantics |
| Долговечность при десятках флагов       | Средняя                                      | **Высокая**                                             | Средняя                                         |

Выбран B. Это не локальное изобретение:

- распространённое разделение confidential data и ordinary config отражено в официальной модели
  [Kubernetes Secret](https://kubernetes.io/docs/concepts/configuration/secret/) против ConfigMap;
- типизированный provider с evaluation context соответствует
  [OpenFeature Provider](https://openfeature.dev/specification/sections/providers/) и
  [Evaluation Context](https://openfeature.dev/specification/sections/evaluation-context/);
- таблица runtime config получает default-deny RLS и отдельные grants по правилам
  [PostgreSQL Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

S5 не внедряет Kubernetes или сторонний feature-flag сервис. Он использует проверенные границы: secrets отдельно,
typed evaluation отдельно, server enforcement отдельно от UI.

## 3. Фактическая исходная точка

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Mixed table: `apps/webapp/db/schema/schema.ts:2642-2658` — `key/scope/organization_id/value_json`, без
  sensitivity/audience.
- Effective org override → global fallback:
  `apps/webapp/src/infra/repos/pgSystemSettings.ts:201-253`.
- Единственный write service и compatibility sync:
  `apps/webapp/src/modules/system-settings/service.ts:95-219`.
- Patient role не имеет grant на mixed table; staff grant находится в generated inventory:
  `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs:1-51,155-170`.
- Locked policy mixed table разрешает global/current-org row, но не отделяет secret:
  `deploy/postgres/phase4-locked-helper-rls-policies.sql:1325-1340`.
- Два исключения уже показывают проблему key-specific accessors:
  `deploy/postgres/specialist-signup-public-bootstrap-rls.sql:136-160` и
  `deploy/postgres/patient-web-push-vapid-public-key-accessor.sql:1-22,72-99`.
- Broken route читает mixed table под patient principal до загрузки resource org:
  `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.ts:28-49`.
- Его unit test мокает общий `systemSettings.getSetting` и не доказывает locked DB access:
  `.../discussion/summary/route.test.ts:1-113,145-160`.

## 4. Инварианты

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

1. `app_patient` и browser/public principals имеют **zero privileges** на `public.system_settings` и
   `public.system_settings_audit`.
2. `app_runtime_settings` физически не содержит secret, password, private key, API key, refresh token,
   webhook secret, allowlist или test identifier.
3. Новый key default-deny: без registry entry код не собирается; invalid value не записывается.
4. Ownership и audience независимы: global/per-org не означают public/restricted.
5. Effective read: exact org override → global fallback. Caller-supplied org без resource/session proof отклоняется.
6. Один admin write service маршрутизирует storage, пишет audit и поддерживает compatibility; routes не пишут
   таблицы напрямую.
7. Browser serializer возвращает только `authenticated_client|public`; `server` rows остаются server-side.
8. Runtime snapshot для UI включает resolved mechanics; UI не читает entitlement tables отдельно.
9. Runtime flag не заменяет authorization. Disabled tariff mechanic остаётся запрещённой server guard даже при
   подменённом client response.
10. Ни один новый runtime flag не требует новой DB function/view/policy.
11. Runtime reads webapp/integrator/media проходят только sanctioned ports; direct SQL checker знает оба store.
12. Все schema/policy/grant изменения additive до финального тестового cleanup; стены не отключаются при rollback.

## 5. Исходная классификация для миграции

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

S5-0 обязан подтвердить каждый key callsite-матрицей. Ниже стартовый набор, уже доказанный текущими patient chains;
это инженерная классификация, не цитата владельца.

### Runtime, `authenticated_client`

`app_display_timezone`, `support_contact_url`, `patient_app_maintenance_enabled`,
`patient_app_maintenance_message`, `patient_booking_url`,
`patient_default_promo_treatment_program_template_id`, `patient_home_daily_practice_target`,
`patient_home_mood_icons`, `patient_home_daily_warmup_repeat_cooldown_minutes`,
`patient_treatment_plan_item_done_repeat_cooldown_minutes`, `patient_program_discussion_ui_enabled`,
`patient_program_discussion_media_submission_enabled`, `notifications_topics`, `video_playback_api_enabled`,
`video_default_delivery`, `booking_payment_enabled`.

### Runtime, `server`

`video_presign_ttl_seconds`, `booking_lifecycle_notifications`, `booking_min_notice_hours`. Значения не секретны,
но raw JSON браузеру не нужен.

### Runtime, `public`

`specialist_signup_enabled`, `support_contact_url` и публичные login/link identifiers после проверки их текущих
pre-session consumers. Один key может иметь только одну максимальную audience; `public` доступен также
authenticated runtime.

### Derived runtime

- `web_push_vapid_public_key` проецируется из restricted `web_push_vapid.publicKey`; private key не покидает
  restricted store.
- `booking_payment_public_config` проецирует только provider id/label/enabled и operational fields без credentials;
  `booking_payment_providers` остаётся restricted.

### Restricted

Минимум: `max_bot_api_key`, `booking_payment_providers`, `smtp_outbound`, `web_push_vapid`, OAuth client secrets,
refresh/private keys, role allowlists, phones/telegram/max IDs, `integration_test_ids`,
`test_account_identifiers`. S5-0 расширяет список по registry и fail-closed относит сюда всё непроверенное.

## 6. Порядок исполнения

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

`S5-0 → S5-1 → S5-2 → S5-3 → S5-4 → S5-5 → S5-6 → S5-7`

Каждый checkbox закрывается записью в `SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md`: **что изменено**, актуальные
`file:line`, **какое доказательство выполнено и его результат**. Один этап = один executor pass, затем независимый
audit, fixer и повторный audit по `docs/ORCHESTRATION_BINDINGS.md:49-96`.

### S5-0 — reality lock: registry и callsite matrix

**Scope:** только инвентаризация, types/registry/checker/tests и execution log. DDL и runtime behavior не менять.

- [x] Построить исчерпывающую матрицу всех текущих keys:
      `key → callers → principal → storage → ownership → audience → parser/default → client serialization → mechanic`.
      **Где:** `apps/webapp/src/modules/system-settings/types.ts:1-202`,
      `apps/webapp/src/modules/system-settings/orgScopedKeys.ts:1-190`, webapp/integrator/media callsites через code-search;
      **доказательство:** количество registry keys равно `ALLOWED_KEYS`, orphan/unknown caller даёт non-zero checker.
- [x] Ввести один typed registry и вывести/проверить из него `SystemSettingKey`, runtime/restricted subsets и
      runtime flag/value types. **Где:** `apps/webapp/src/modules/system-settings/types.ts:1-202` и
      `apps/webapp/src/modules/system-settings/orgScopedKeys.ts:1-190`; **доказательство:** compile-time fixture с новым
      key без classification не собирается; key не может одновременно принадлежать restricted и runtime store.
- [x] Зафиксировать `RuntimeFlagDefinition` sources `setting|mechanic|all` и mappings минимум для discussion,
      booking, payments и patient app. **Где:** новый registry рядом с
      `apps/webapp/src/modules/system-settings/types.ts:1-202` и mechanic types в
      `apps/webapp/src/modules/org-entitlements/types.ts:6-23`; **доказательство:** unit tests показывают, что payment
      flag = entitlement AND operational flag, а discussion не создаёт entitlement copy.
- [x] Проверить mixed envelopes и утвердить safe projectors для VAPID/payment public config.
      **Где:** `apps/webapp/src/modules/system-settings/webPushVapidRuntime.ts:1-82` и
      `apps/webapp/src/modules/payments/bookingPaymentSettings.ts:1-50`; **доказательство:** projector tests не возвращают
      `privateKey/password/apiKey/webhookSecret/refreshToken`.

**Проверка:** targeted registry/projector tests + `pnpm --dir apps/webapp typecheck`.

**Выход:** каждый существующий key классифицирован; неизвестных и «по умолчанию global/public» нет.

### S5-1 — additive schema и data contract

**Scope:** webapp Drizzle schema, следующая generated migration, schema docs/checkers. Старые rows не удалять.

**Current reconciliation (2026-07-19):** `app_runtime_settings` already exists from `0186` and selected later
migrations. S5-1 preserves its identity, partial unique indexes, FKs and structural checks; only the missing audit
contract and residual registry-backed backfill belong to `0209`. The database trigger is the single intended audit
owner. S5-3 must route writes through its chokepoint without adding a second audit insert.

- [x] Подтвердить и сохранить существующий `public.app_runtime_settings`: `key`, `scope`, nullable
      `organization_id`, `audience`, `value_json`, `updated_at`, `updated_by`; partial unique indexes для global и org
      identity, FK и structural checks из `0186` не переписываются. **Доказательство:** S5-1 contract test читает
      migration/schema boundary; runtime root не создаётся повторно.
- [x] Добавить `public.app_runtime_settings_audit` с old/new values, actor, source и org.
      **Где:** рядом с audit-моделью `apps/webapp/db/schema/schema.ts:2642-2658` и следующим generated migration;
      **доказательство:** first write и update создают ровно одну audit row в той же transaction; rollback transaction
      не оставляет audit.
- [x] Добавить CHECK только на стабильные structural enums (`scope`, `audience`), не DB whitelist ключей.
      **Где:** schema и generated migration из предыдущего пункта, anchor
      `apps/webapp/db/schema/schema.ts:2642-2658`; **доказательство:** новый registry key не требует DDL; invalid audience
      отклоняется DB.
- [x] В той же additive migration скопировать только S5-0 runtime keys из `public.system_settings`, сохранив
      `(key, scope, organization_id, value_json, updated*)`; derived rows построить safe projection.
      **Где:** следующий generated migration после существующих
      `apps/webapp/db/drizzle-migrations/0163_saas_tariffs_and_entitlements.sql:1-52`; **доказательство:** idempotent
      migration fixture, source/destination counts by key, zero restricted keys в destination; значения в test output
      не печатаются.
- [x] Обновить `docs/ARCHITECTURE/DB_STRUCTURE.md` и configuration docs, не объявляя старые copies удалёнными.
      **Где:** `docs/ARCHITECTURE/DB_STRUCTURE.md:1` и
      `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md:1`; **доказательство:** docs/checker называют оба store и их
      ownership.

**Проверка:** migration/schema tests на disposable fixture; никаких подключений к рабочей dev DB.

**Выход:** runtime store существует и заполнен additive; старый read/write path ещё работоспособен. S5-1 dynamic
proof исполняется только через
`docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md`: private PostgreSQL 16 cluster в `/tmp`, без
application env и без DEV/TEST/PROD. Он проверяет schema/FK/check/index/trigger, insert/update/rollback audit,
idempotent reapply, aggregate source/destination counts, restricted-key absence, secret-field-safe projections и
защиту более новой destination row.

### S5-2 — RLS, grants и системная config-reader capability

**Scope:** canonical RLS/grant sources, generated artifacts, role/pool contract tests. Никаких broad grants.

- [x] Добавить runtime table/audit в SaaS table inventory и явную custom-policy классификацию; обновить
      `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:34-43,228-230` и связанные target/check scripts.
      **Где:** указанные descriptor/target/check scripts; **доказательство:** descriptor checker не считает таблицу
      unknown/unclassified.
- [x] Политики runtime table: staff — global/current org; patient — global/current resource org; bootstrap — только
      `audience='public'`; missing/forged context fail-closed. Audit table пациенту недоступна.
      **Где:** canonical policy source, anchor
      `deploy/postgres/phase4-locked-helper-rls-policies.sql:1325-1340`; **доказательство:** real-role matrix
      S1/S2/P1/P2/bootstrap на disposable DB.
- [x] Обновить source generator
      `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs:49-53,155-170,772-811`, затем regenerated artifact;
      `app_patient` получает только `SELECT app_runtime_settings`, staff — нужный DML, patient — zero audit writes.
      **Где:** указанный source generator и generated artifact из его header; **доказательство:** generated diff + grant
      smoke; ручная правка generated list запрещена.
- [x] Явно сохранить `REVOKE ALL` для patient/bootstrap на restricted table/audit/mirror.
      **Где:** `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs:49-53,155-170,772-811`;
      **доказательство:** privilege snapshot и прямые negative SELECT.
- [x] Добавить `app_config_reader` и отдельный config-reader login/pool без membership в staff/patient; grant только
      на restricted config surface; policy разрешает global/exact current org и fail-closed org-row. **Где:** role/grant
      source рядом с C0 topology artifacts, locked policy source и
      `apps/webapp/src/infra/db/webappPoolProvider.ts:11-29,137-180`; **доказательство:** membership/SET ROLE negative
      matrix, global/exact-org positive tests, missing/wrong-org denial, pool cleanup/concurrency tests, zero
      clinical-table privileges.
- [x] Синхронизировать generated locked policy artifact
      (`deploy/postgres/phase4-locked-helper-rls-policies.sql:1325-1340`) через его generator, не ручной вставкой.
      **Где:** указанный artifact и canonical generator из его header; **доказательство:**
      `pnpm run check:saas-db-regression` и policy artifact self-test green.

**Проверка:** targeted role/grant/policy checkers + disposable real-role SQL smoke.

**Выход:** patient читает safe runtime rows и физически не может прочитать restricted store; server adapter имеет
узкую отдельную capability для секретов.

### S5-3 — один write chokepoint, dual-read/dual-write compatibility

**Scope:** existing system-settings ports/service, new runtime port/repo, DI, admin API compatibility.

- [x] Расширить ports в `apps/webapp/src/modules/system-settings/ports.ts:1-95`: restricted и runtime repositories
      остаются infra implementations, module получает их через DI; общий write unit-of-work port атомарно пишет
      legacy row и, только для registry `storage=runtime`, authoritative runtime row; runtime audit создаёт единственный
      DB trigger owner, а compatibility sync запускается только после commit. Mixed/restricted VAPID/payment projection
      остаётся legacy-trigger-owned. **Где:** указанный ports file и composition root
      `apps/webapp/src/app-layer/di/buildAppDeps.ts:776-785`;
      **доказательство:** clean-architecture lint, transaction rollback test; module не импортирует
      `@/infra/db`/`@/infra/repos`.
- [x] Реализовать `pgAppRuntimeSettings` с generic `getEffective`, `getSnapshotRows`, `upsert` и audit transaction;
      org override → global fallback повторяет доказанную семантику `pgSystemSettings.ts:201-253`.
      **Где:** новый infra repo рядом с `apps/webapp/src/infra/repos/pgSystemSettings.ts:201-253`;
      **доказательство:** repo tests global-only, org override, wrong-org, audience и concurrent upsert.
- [x] Сохранить один `createSystemSettingsService().updateSetting`: registry маршрутизирует restricted write в
      прежний port+sync, runtime write — в новый store. During compatibility runtime write также обновляет legacy copies
      в `public` и `integrator` через тот же service boundary, помечая их non-authoritative.
      **Где:** `apps/webapp/src/modules/system-settings/service.ts:95-219` и
      `apps/webapp/src/app/api/admin/settings/route.ts:250-370`; **доказательство:** одна admin PATCH создаёт
      согласованные rows/audit; route не вызывает sync сам.
- [x] Read path runtime keys: new store first, legacy fallback только при missing row; mismatch telemetry содержит
      key/source/count, но не value/actor/org identifiers.
      **Где:** `apps/webapp/src/modules/system-settings/service.ts:95-219` и
      `apps/webapp/src/infra/repos/pgSystemSettings.ts:201-253`; **доказательство:** fallback/mismatch tests; exception не
      превращается молча в hardcoded default.
- [x] Mixed secret write атомарно обновляет restricted row и derived safe projection; private fields никогда не
      попадают в runtime audit.
      **Где:** `apps/webapp/src/modules/system-settings/service.ts:95-219` и
      `apps/webapp/db/drizzle-migrations/0210_s5_runtime_dual_write_trigger_bypass.sql`;
      **доказательство:** private disposable PostgreSQL proof checks one trigger-owned VAPID/payment runtime audit,
      no credential-shaped fields, and rollback.
- [x] Admin GET/PATCH contract остаётся backward-compatible по key names и redaction.
      **Где:** `apps/webapp/src/app/api/admin/settings/route.ts:250-370` и
      `apps/webapp/src/app/api/admin/settings/route.test.ts:1`; **доказательство:** существующие tests + новые routing
      cases green.

**Проверка:** system-settings service/repo/admin API tests; webapp typecheck/lint.

**Выход:** один write API обслуживает два физических store; compatibility rollback ещё возможен без потери writes.

### S5-4 — generic runtime provider и S4 mechanics

**Scope:** module provider/service, app-layer orchestration, org-entitlements dependency, one patient runtime API/RSC
contract. UI redesign вне scope.

- [ ] Реализовать typed `resolveRuntimeConfig(context)` и generic `isFlagEnabled(flag, context)` через module port;
      никаких `getDiscussionFlag()`/`getPaymentFlag()` DB methods.
      **Где:** `apps/webapp/src/modules/system-settings/ports.ts:1-44` и новый provider/service рядом с
      `apps/webapp/src/modules/system-settings/service.ts:95-219`; **доказательство:** один provider test matrix для
      boolean/scalar/structured/default/invalid values.
- [ ] Derive org только из authorized resource или explicit selected patient org; nested patient principal получает
      `{platformUserId, organizationId}` через существующий principal carrier
      (`packages/db-principal/src/index.ts:298-320,507-515`).
      **Где:** указанный principal carrier и patient orchestration callsites из S5-0 matrix; **доказательство:** payload
      org игнорируется; shared patient A/B получает соответствующие overrides; no-context per-org read даёт typed error.
- [ ] Подключить `resolveOrgEntitlements` один раз на snapshot и вычислить registry flags `setting|mechanic|all`.
      **Где:** runtime provider из предыдущего пункта и
      `apps/webapp/src/modules/org-entitlements/service.ts:10-36`; **доказательство:** A/B tariffs/overrides дают разные
      flags; ordinary scalar settings не копируются в entitlement.
- [ ] Browser/RSC serializer отдаёт только audience `authenticated_client|public`; public pre-session surface —
      только `public`. **Где:** runtime provider/serializer из первого пункта S5-4, anchor
      `apps/webapp/src/modules/system-settings/ports.ts:1-44`; **доказательство:** snapshot contract и
      secret-key/property scan.
- [ ] Добавить revision/cache invalidation по successful write без per-key cache module.
      **Где:** `apps/webapp/src/modules/system-settings/service.ts:95-219` и runtime provider S5-4;
      **доказательство:** write → next snapshot changes revision/value; org A invalidation не загрязняет org B.

**Проверка:** provider/entitlement contract tests + cross-org concurrency test.

**Выход:** у UI один runtime contract для обычных settings и tariff mechanics.

### S5-5 — migrate consumers и удалить key-specific runtime accessors

**Scope:** подтверждённые webapp/integrator/media callsites из S5-0; behavior не менять кроме источника config.

- [ ] Перевести все patient request chains на RuntimeConfigProvider; `server` values остаются server-side.
      **Где:** `apps/webapp/src/app/app/patient/treatment/loadPatientProgramInteractionBundle.ts:1-44` и patient
      callsites из S5-0 matrix; **доказательство:** matrix имеет `migrated` и focused test для каждой различной
      parser/ownership family.
- [ ] Перевести integrator runtime-safe keys на sanctioned reader `public.app_runtime_settings`; restricted keys
      остаются на `public.system_settings`. **Где:** anchor
      `apps/integrator/src/infra/db/publicSystemSettings.ts:64-102`; **доказательство:** principal/callsite matrix и
      integrator tests global/org fallback.
- [ ] Перевести media runtime-safe flags на runtime port без расширения restricted grants.
      **Где:** `apps/media-worker/src/pipelineEnabled.ts:1-13` и
      `apps/media-worker/src/watermarkEnabled.ts:1-14`; **доказательство:** existing pipeline/watermark tests +
      direct-read checker.
- [ ] Перевести acquiring/payment secret read на `RestrictedSettingsPort`; integration adapter получает config,
      patient route и response — нет. **Где:** `apps/webapp/src/app-layer/di/buildAppDeps.ts:776-785` и
      `apps/webapp/src/modules/payments/service.ts:561-575`; **доказательство:** app_patient direct SELECT denied,
      authorized adapter call works, returned/logged objects redacted.
- [ ] Заменить `app.get_public_config_bool` и VAPID key-specific accessor общим runtime path; удалить их port methods,
      grants и artifacts только после `rg` подтверждает zero consumers.
      **Где:** `deploy/postgres/specialist-signup-public-bootstrap-rls.sql:136-160` и
      `deploy/postgres/patient-web-push-vapid-public-key-accessor.sql:1-22,72-99`; **доказательство:** direct function
      calls отсутствуют; signup и web-push public-key scenarios green.
- [ ] Расширить `apps/webapp/scripts/check-system-settings-accessors.mjs:8-19,42-57`: sanctioned readers для обоих
      stores; direct SELECT из routes/modules/integrator/media даёт non-zero.
      **Где:** указанный checker и его fixture/test; **доказательство:** checker self-test на injected offender.

**Проверка:** targeted webapp/integrator/media tests, accessor checker, typecheck/lint затронутых приложений.

**Выход:** runtime config не читается из restricted store ни одним patient path; key-specific DB accessors больше не
нужны.

### S5-6 — discussion-summary и security acceptance

**Scope:** discussion route/shared gate tests, runtime provider integration, locked smoke contract.

- [ ] Переставить summary flow:
      `patient auth → validate instanceId → get own instance → resource organizationId → generic runtime flag → summary`.
      **Где:**
      `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.ts:28-54`;
      **доказательство:** route не вызывает `systemSettings.getSetting` и не содержит parser setting envelope.
- [ ] Расширить существующий route test (`.../discussion/summary/route.test.ts:1-160`): enabled=200,
      disabled=403, чужой instance=404 до config disclosure, org forwarded from instance, restricted read never called.
      **Где:** `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/discussion/summary/route.test.ts:1-160`;
      **доказательство:** все пять cases green и test double restricted port падает при любом вызове.
- [ ] Добавить locked integration case с реальными roles/grants: `patient.program.item.discussion-summary` получает
      saved flag через generic provider и возвращает 200; другой patient/instance denied.
      **Где:** `docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json:163` и его runner;
      **доказательство:** сохранённый machine-readable result содержит expected 200 и отрицательный cross-patient case.
- [ ] Добавить adversarial matrix: direct restricted SELECT, forged org, org-B override, mixed-envelope private
      fields, browser request for `audience=server`.
      **Где:** S5 runtime role/integration suite рядом с
      `docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json:163`; **доказательство:** все negative cases denied,
      org-B возвращает только свой effective override, secret scan пуст.
- [ ] Добавить structural checker: runtime-key literals отсутствуют в DB functions/views/policies; добавление
      registry fixture key не меняет SQL artifact count.
      **Где:** расширение `apps/webapp/scripts/check-system-settings-accessors.mjs:8-19,42-57` и
      `package.json:33-45`; **доказательство:** self-test намеренно вставляет key-specific SQL и checker падает.

**Проверка:** focused route/provider tests + disposable locked DB smoke + `pnpm run check:saas-db-regression`.

**Выход:** обязательный критерий владельца закрыт без accessor/function на флаг.

### S5-7 — тестовый сервер: порядок, cleanup и rollback rehearsal

**Scope:** только отдельный авторизованный оркестраторский проход на тестовом сервере по существующим scripts/runbook;
этот план не даёт команд доступа к хосту и не разрешает реальные отправки.

Порядок применения:

1. создать additive tables/audit и backfill;
2. применить RLS/grants/config-reader role contract;
3. запустить build с dual-read/dual-write;
4. выполнить deterministic reconciliation;
5. прогнать A/B runtime/security matrix и discussion-summary;
6. перевести все readers на новые ports;
7. повторить reconciliation и полный declared workload;
8. удалить runtime copies из `public.system_settings` только после двух green reconciliation checkpoints;
   restricted rows не удалять;
9. прекратить compatibility dual-write и повторить acceptance.

- [ ] До шага 8 проверить counts по каждому migrated key/global/org identity, zero mismatches и zero restricted rows
      в runtime store. **Где:** reconciliation artifact и
      `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md:1`; **доказательство:** redacted machine-readable
      report без values/PII.
- [ ] A/B matrix: global fallback, org override, shared patient resource context, public bootstrap, authenticated
      snapshot, server-only value и tariff mechanic composition. **Где:** runtime integration suite S5-4/S5-6 и
      `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md:1`; **доказательство:** сохранённый matrix report
      показывает expected result каждого case.
- [ ] Security matrix: patient/browser не читают restricted/audit/server serialization; config-reader не читает
      clinical tables; forged/missing context fail-closed. **Где:** real-role suite S5-2/S5-6 и
      `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md:1`; **доказательство:** все negative probes denied,
      permitted runtime probes green.
- [ ] Product smoke: discussion-summary 200 при enabled, штатный 403 при disabled, ни одного unexpected 5xx/empty
      result/RLS denial в settings scenarios. **Где:**
      `docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json:163` и
      `docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-product-smoke-contract.mjs:151`;
      **доказательство:** сохранённый smoke report green по этим scenarios.
- [ ] После всех этапов выполнить один repo-level gate `pnpm install --frozen-lockfile && pnpm run ci`; не повторять
      без новых изменений. **Где:** `package.json:61` и
      `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md:1`; **доказательство:** exit 0 и зафиксированные
      commit/ref + command + timestamp в log.

**Rollback rehearsal на тестовом сервере:**

1. стены не отключать;
2. остановиться на последнем green S5 checkpoint;
3. если cleanup уже выполнен, idempotent rollback artifact восстанавливает runtime copies в
   `public.system_settings` из `app_runtime_settings`;
4. вернуть dual-read/dual-write build;
5. revoke новых patient/bootstrap/config-reader grants, которые не нужны этому checkpoint; новые tables не drop;
6. повторить reconciliation, restricted-denial matrix и discussion-summary.

**Доказательство rollback:** сохранённые runtime writes не потеряны, restricted rows не менялись, patient не получил
доступ к mixed table, discussion-summary остаётся green на восстановленном dual-read checkpoint.

## 7. Definition of Done

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] В документе нет выбора, ожидающего владельца; технический путь B обоснован и единственный.
      **Где:** этот документ, §1-2; **доказательство:** review не находит альтернативного execution path или owner gate.
- [ ] Все keys имеют exhaustive storage/ownership/audience/type classification; unknown key fail-closed.
      **Где:** registry S5-0, anchors `apps/webapp/src/modules/system-settings/types.ts:1-202` и
      `apps/webapp/src/modules/system-settings/orgScopedKeys.ts:1-190`; **доказательство:** registry checker и negative
      compile fixture green.
- [ ] `system_settings` после cleanup содержит только restricted/internal rows; runtime config — только
      `app_runtime_settings`; integrator runtime читает каноническую `public` schema.
      **Где:** schema/migration S5-1 и `apps/integrator/src/infra/db/publicSystemSettings.ts:64-102`;
      **доказательство:** final reconciliation даёт zero misplaced/mismatched rows.
- [ ] `app_patient` имеет zero privileges на restricted tables и читает runtime config только в доказанном context.
      **Где:** grant/policy sources S5-2, anchors
      `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs:49-53,155-170,772-811`;
      **доказательство:** privilege snapshot + real-role positive/negative matrix green.
- [ ] UI получает один typed snapshot, в котором tariff mechanics и ordinary flags собраны без копирования sources.
      **Где:** runtime provider S5-4 и `apps/webapp/src/modules/org-entitlements/service.ts:10-36`;
      **доказательство:** typed snapshot contract и tariff/override composition tests green.
- [ ] Server-side mechanics по-прежнему защищены единым `requireEntitlement`; client snapshot не является authz.
      **Где:** `apps/webapp/src/app-layer/guards/requireEntitlement.ts:7-23` и protected callsites из S4 matrix;
      **доказательство:** forged-enabled snapshot не проходит server guard при disabled mechanic.
- [ ] VAPID/payment mixed envelopes имеют safe derived projection; secrets отсутствуют в runtime rows/audit/API/logs.
      **Где:** `apps/webapp/src/modules/system-settings/webPushVapidRuntime.ts:1-82` и
      `apps/webapp/src/modules/payments/bookingPaymentSettings.ts:1-50`; **доказательство:** projector, persistence,
      response и log secret scans пусты.
- [ ] `patient.program.item.discussion-summary` работает под locked walls через generic provider.
      **Где:** discussion route/test S5-6 и
      `docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json:163`; **доказательство:** saved smoke result = expected
      200, cross-patient case denied, restricted port не вызван.
- [ ] Следующий runtime flag требует registry entry/data/admin UI при необходимости, но не DB function/view/policy.
      **Где:** registry/checker S5-0/S5-6, anchor
      `apps/webapp/scripts/check-system-settings-accessors.mjs:8-19,42-57`; **доказательство:** fixture key проходит без
      изменения SQL artifact count, key-specific SQL fixture роняет checker.
- [ ] Migration, grants, code, tests, test-server order, cleanup и rollback rehearsal закрыты доказательствами.
      **Где:** S5-1—S5-7 и `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md:1`;
      **доказательство:** у каждого этапа есть executor result, independent audit, fixer при необходимости и повторный
      green audit.
- [ ] Targeted checks, SaaS DB regression, тестовый A/B smoke и один финальный repo-level CI green.
      **Где:** `package.json:33-61` и execution log; **доказательство:** зафиксированы команды, exit 0 и ссылки на
      redacted reports.

## 8. Вне scope

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- UX-редизайн экранов настроек.
- Изменение цен, состава тарифов или mechanic defaults — это S4.
- Новый billing/provider contract; S5 только разделяет public operational projection и credentials.
- Переписывание `system_settings` mirror целиком вне runtime keys.
- Любые хостовые действия в текущем planning pass.
