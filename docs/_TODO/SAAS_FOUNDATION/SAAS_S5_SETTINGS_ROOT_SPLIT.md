# SaaS Stage 5 — корневое разделение настроек

Статус: **план; код и БД не менялись**. Этап ждёт выбора владельца.

## 1. Рамка решения и провенанс

Канон задачи:

- `docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md:73-85` фиксирует проблему: одна таблица смешивает секреты и настройки,
  нужные пациентскому приложению; по одному accessor на каждый флаг уже признан тупиком.
- `docs/_TODO/SAAS_FOUNDATION/OWNER_DECISIONS_FOR_REVIEW.md:128-134` оставляет корень `system_settings` открытым
  решением владельца, а не инженерным фактом.
- Модель тарифа подтверждена отдельно: тариф → entitlements → клиника, глобально настраиваемый каталог и точечные
  переопределения клиники (`OWNER_DECISIONS_FOR_REVIEW.md:39-46`).
- Путь запуска — полностью довести новый продукт на тесте и затем развернуть копию на новом домене; старый прод не
  переключается (`SEQUENCE.md:9-18`, `OWNER_DECISIONS_FOR_REVIEW.md:90-99`).

Ниже нет утверждения, что владелец уже выбрал схему. Все варианты и рекомендация — инженерные предложения.

**ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА:** выбрать вариант A, B или C в разделе 7. До выбора нельзя закреплять одну из
схем в roadmap, миграциях или чекерах.

## 2. Что именно смешано сейчас

### 2.1. Модель данных и доступ

- Единственная таблица содержит `key`, `scope`, nullable `organization_id`, произвольный `value_json` и аудит
  обновления (`apps/webapp/db/schema/schema.ts:2642-2658`). Отдельного признака секретности или аудитории нет.
- В whitelist сейчас **96 ключей** (`apps/webapp/src/modules/system-settings/types.ts:2-189`).
- Текущая кодовая классификация владения содержит **32 `per_org` и 64 `global`**
  (`apps/webapp/src/modules/system-settings/orgScopedKeys.ts:27-172`). Это описание поведения текущего кода, а не
  подтверждённое владельцем решение по каждому ключу.
- Эффективное чтение пытается взять строку клиники, затем global fallback
  (`apps/webapp/src/infra/repos/pgSystemSettings.ts:44-75`). Сервис применяет ту же классификацию на write-path и
  синхронизирует запись в зеркало интегратора (`apps/webapp/src/modules/system-settings/service.ts:95-184`).
- Жёсткая RLS-политика разрешает строку с `organization_id IS NULL` либо строку текущей клиники, но сама по себе не
  отделяет секрет от клиентского флага (`deploy/postgres/phase4-locked-helper-rls-policies.sql:1325-1331`).
- Grant inventory даёт `app_staff` доступ к `public.system_settings`, `public.system_settings_audit` и
  `integrator.system_settings`, но не включает эти таблицы в **111** patient-table grants; staff inventory содержит
  **219** таблиц (`docs/_TODO/SAAS_FOUNDATION/P0_5B_GRANTS.md:322-328,359-362`,
  `deploy/postgres/p0-5b-grants.sql:448-461`). Поэтому для `app_patient` строка недоступна независимо от её ключа.

Следствие: `apps/webapp/src/app/api/patient/programs/items/[itemId]/discussion/summary/route.ts:40-43` читает
`patient_program_discussion_ui_enabled` через общий repository под patient principal и получает ошибку доступа.
Симптом намеренно сохранён после отката точечного accessor
(`docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md:6`; `SEQUENCE.md:79-85`).

Не все недоступные чтения дают заметный 500: `configAdapter` поглощает DB exception и подставляет fallback
(`apps/webapp/src/modules/system-settings/configAdapter.ts:34-47,69-103`). Это скрытая деградация, а не доступ к
настройке: patient request может молча получить default вместо сохранённого значения.

### 2.2. Три независимые оси, которых сейчас нет в модели

Их нельзя сводить в одно поле `scope`:

1. **Владение:** platform-global или override конкретной клиники.
2. **Чувствительность:** secret, security-sensitive internal или ordinary config.
3. **Аудитория чтения:** только operator/staff; server-side patient request; authenticated patient client; public
   pre-session.

Например, `booking_payment_providers` — per-org, но содержит секреты; `web_push_vapid` — global, но в одном JSON
лежат публичный и приватный ключи; `patient_program_discussion_ui_enabled` — global rollout, но нужен patient request.
Значит, `global/per_org` не отвечает на вопрос «можно ли читать пациенту».

## 3. Инвентарь ключей

### 3.1. Владение по фактической классификации кода

**32 per-org:**

`patient_label`, `doctor_patient_support_comments_without_support_default_enabled`,
`doctor_patient_support_media_without_support_default_enabled`, `doctor_specialist_task_reminder_channels`,
`doctor_appointment_reminder_enabled`, `doctor_appointment_reminder_offsets_minutes`,
`patient_home_daily_practice_target`, `patient_default_promo_treatment_program_template_id`,
`patient_home_morning_ping_enabled`, `patient_home_morning_ping_local_time`,
`patient_home_daily_warmup_rotation_enabled`, `patient_home_daily_warmup_rotation_times`, `patient_booking_url`,
`booking_calendar_show_working_hours`, `booking_calendar_default_window`, `booking_calendar_default_branch_id`,
`booking_calendar_default_service_id`, `booking_payment_enabled`, `booking_payment_providers`,
`booking_lifecycle_notifications`, `booking_allow_doctor_unlink_past_package_sessions`, `booking_min_notice_hours`,
`patient_home_daily_warmup_repeat_cooldown_minutes`,
`patient_treatment_plan_item_done_repeat_cooldown_minutes`, `patient_home_mood_icons`, `notifications_topics` и шесть
`notif_template:{created|cancelled|rescheduled}:{patient|doctor}`.

Источник: `apps/webapp/src/modules/system-settings/orgScopedKeys.ts:32-43,66-72,93-122,133-139`.

**64 global:**

`platform_user_merge_v2_enabled`, `integrator_linked_phone_source`, `sms_fallback_enabled`,
`debug_forward_to_admin`, `max_debug_page_enabled`, `dev_mode`, `important_fallback_delay_minutes`,
`integration_test_ids`, `test_account_identifiers`, `app_base_url`, `support_contact_url`,
`telegram_login_bot_username`, `max_login_bot_nickname`, `max_bot_api_key`, `vk_web_login_url`,
`app_display_timezone`, `patient_app_maintenance_enabled`, `patient_app_maintenance_message`,
`specialist_signup_enabled`, `patient_program_discussion_doctor_reply_from_log_enabled`,
`patient_program_discussion_ui_enabled`, `patient_program_discussion_media_submission_enabled`,
`video_hls_pipeline_enabled`, `video_hls_new_uploads_auto_transcode`, `video_hls_reconcile_enabled`,
`video_playback_api_enabled`, `video_default_delivery`, `video_presign_ttl_seconds`, `video_watermark_enabled`,
`booking_default_organization_id`, `booking_rubitime_bridge_enabled`, `booking_doctor_appointments_read_source`,
`booking_slots_read_source`, `patient_home_warmup_skip_to_next_available_enabled`, `smtp_outbound`, `web_push_vapid`,
`admin_incident_alert_config`, `operator_health_alert_config`, `operator_health_projection_thresholds`,
`yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_redirect_uri`, `google_client_id`,
`google_client_secret`, `google_redirect_uri`, `google_refresh_token`, `google_calendar_id`,
`google_calendar_enabled`, `google_connected_email`, `google_oauth_login_redirect_uri`, `apple_oauth_client_id`,
`apple_oauth_team_id`, `apple_oauth_key_id`, `apple_oauth_private_key`, `apple_oauth_redirect_uri`,
`allowed_telegram_ids`, `allowed_max_ids`, `admin_telegram_ids`, `doctor_telegram_ids`, `admin_max_ids`,
`doctor_max_ids`, `admin_phones`, `doctor_phones`, `allowed_phones`.

Источник полного исчерпывающего mapping — `apps/webapp/src/modules/system-settings/orgScopedKeys.ts:27-172`;
TypeScript требует запись для каждого из 96 ключей (`orgScopedKeys.ts:12-15`).

### 3.2. Секреты и чувствительные данные

По структурам, комментариям и masking-коду найдено **8 явно secret-bearing ключей**:

| Ключ | Что чувствительно | Доказательство |
|---|---|---|
| `max_bot_api_key` | API key | `apps/webapp/src/modules/system-settings/types.ts:43-44` |
| `booking_payment_providers` | `apiKey`, `webhookSecret` | `types.ts:113-123` |
| `smtp_outbound` | password | `types.ts:139-140` |
| `web_push_vapid` | private key | `types.ts:141-145` |
| `yandex_oauth_client_secret` | OAuth secret | `types.ts:159-162` |
| `google_client_secret` | OAuth secret | `types.ts:163-167` |
| `google_refresh_token` | refresh token | `types.ts:163-170` |
| `apple_oauth_private_key` | private key | `types.ts:173-178` |

Три строки — **смешанные JSON-конверты**: `booking_payment_providers`, `smtp_outbound`, `web_push_vapid` одновременно
содержат несекретные поля и секрет. Маркер видимости на строке не способен безопасно открыть только часть JSON.

Ещё как минимум **11 security-sensitive, хотя не cryptographic-secret, ключей** содержат тестовые аккаунты,
allowlists и идентификаторы ролей: `integration_test_ids`, `test_account_identifiers`, `allowed_telegram_ids`,
`allowed_max_ids`, `admin_telegram_ids`, `doctor_telegram_ids`, `admin_max_ids`, `doctor_max_ids`, `admin_phones`,
`doctor_phones`, `allowed_phones` (`types.ts:30-33,179-188`). Их нельзя автоматически объявлять client-readable.

Это инженерная классификация по статическому коду. Фактические формы и заполненность `value_json` не проверялись,
потому что этап запрещает доступ к БД.

### 3.3. Кто читает и под каким principal

| Контур | Фактический объём | Principal / роль | Основные точки |
|---|---:|---|---|
| Admin/doctor webapp | bulk-read способен прочитать все **96**; статический поиск прямых literal `get*` signatures находит минимум **28 различных ключей**, плюс wrappers/constants/bulk | organization/staff → `app_staff` | `apps/webapp/src/app/api/admin/settings/route.ts:250-264`; `apps/webapp/src/app/app/settings/adminSettingsData.ts:207-213`; `packages/db-principal/src/index.ts:582-591` |
| Patient webapp requests | **22** ключа в подтверждённых patient request chains; не все безопасны для выдачи клиенту | patient → `app_patient` | `packages/db-principal/src/index.ts:592-605`; список ниже |
| Integrator | **25** runtime keys: 19 литеральных + 6 динамических templates | вызов зависит от job: bootstrap, organization или integrator; organization → `app_staff`, integrator → `app_patient` | `apps/integrator/src/infra/db/publicSystemSettings.ts:64-102`; `packages/db-principal/src/index.ts:582-605` |
| Media worker | **2** ключа | узкий infra `app_worker`; его текущий overlay не включает `system_settings` | `apps/media-worker/src/pipelineEnabled.ts:5-12`; `apps/media-worker/src/watermarkEnabled.ts:5-13`; `deploy/postgres/phase4-app-worker-narrow-rls.sql:12-17,53-63` |

Число 28 — нижняя граница воспроизводимого статического поиска литерального ключа непосредственно в accessor call,
а не число всех runtime запросов: обёртки, constants, динамические templates и bulk-read туда не входят. Полный admin
bulk-read означает, что staff-контур всё равно обязан поддерживать все 96.

Integrator читает, в частности, `app_base_url`, `app_display_timezone`, SMTP, staff channel IDs, linked-phone mode,
operator alert config, шесть Google Calendar ключей, два morning-ping ключа и шесть notification templates
(`apps/integrator/src/config/appBaseUrl.ts:10,32-53`, `appTimezone.ts:20,46-89`,
`smtpOutbound.ts:15,100-115`, `messengerStaffIds.ts:32-70`, `linkedPhoneSource.ts:13,43-60`,
`operationalVerboseLog.ts:13,20-33`, `apps/integrator/src/integrations/google-calendar/runtimeConfig.ts:32-50`,
`apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.ts:23-24,84-100`,
`apps/integrator/src/infra/db/repos/notifTemplatePort.ts:43-56`). Точный principal каждого job надо проверить при
исполнении: общий accessor его не задаёт.

Полный статический набор integrator: 19 литеральных ключей — `admin_incident_alert_config`, `admin_max_ids`,
`admin_telegram_ids`, `app_base_url`, `app_display_timezone`, `debug_forward_to_admin`, `doctor_max_ids`,
`doctor_telegram_ids`, `google_calendar_enabled`, `google_calendar_id`, `google_client_id`, `google_client_secret`,
`google_redirect_uri`, `google_refresh_token`, `integrator_linked_phone_source`, `operator_health_alert_config`,
`patient_home_morning_ping_enabled`, `patient_home_morning_ping_local_time`, `smtp_outbound` — плюс шесть динамических
`notif_template:{created|cancelled|rescheduled}:{patient|doctor}`.

Есть два уже существующих исключения без table grant, но они не масштабируются на десятки флагов:

- `app.get_public_config_bool` сейчас допускает только `specialist_signup_enabled`
  (`deploy/postgres/specialist-signup-public-bootstrap-rls.sql:136-160`);
- отдельный accessor выдаёт только VAPID `publicKey`, оставляя base table закрытой
  (`deploy/postgres/patient-web-push-vapid-public-key-accessor.sql:1-22,72-99`).

Они полезны как доказательство нужного default-deny и field projection, но не являются предлагаемым корнем.

### 3.4. 22 ключа в patient request chains

| Группа | Ключи | Текущее использование | Предварительная аудитория |
|---|---|---|---|
| Явно меняют patient UI | `app_display_timezone`, `support_contact_url`, `patient_app_maintenance_enabled`, `patient_app_maintenance_message`, `patient_booking_url`, `patient_default_promo_treatment_program_template_id`, `patient_home_daily_practice_target`, `patient_home_mood_icons`, два cooldown-флага, два discussion-флага, `notifications_topics`, `video_playback_api_enabled`, `video_default_delivery`, `booking_payment_enabled` | layout, home, treatment program, notifications, playback, booking | **16 кандидатов** в client-runtime; окончательный список требует решения/ревью |
| Server-side поведение patient route | `video_presign_ttl_seconds`, `booking_lifecycle_notifications`, `booking_min_notice_hours` | presign, booking validation/notifications | patient principal должен уметь применить значение, но raw JSON браузеру не нужен |
| Нельзя открывать patient-role | `test_account_identifiers`, `booking_payment_providers` | bypass/maintenance logic; payment resolver | restricted; второй содержит secrets |
| Смешанный ключ | `web_push_vapid` | patient получает только `publicKey` через узкую функцию | privateKey restricted; нужна декомпозиция или безопасная проекция |

Точки доказательства:

- maintenance: `apps/webapp/src/modules/system-settings/patientMaintenance.ts:52-74`,
  `apps/webapp/src/app/app/patient/layout.tsx:53-79`;
- patient home/program: `apps/webapp/src/modules/patient-home/todayConfig.ts:211-217`,
  `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx:128-156`,
  `apps/webapp/src/app/app/patient/treatment/loadPatientProgramInteractionBundle.ts:22-25`;
- notifications/VAPID: `apps/webapp/src/app/api/patient/web-push/subscribe/route.ts:82`,
  `apps/webapp/src/app/api/patient/web-push/status/route.ts:9-23`;
- media: `apps/webapp/src/app-layer/media/resolveMediaPlaybackPayload.ts:48-56`,
  `apps/webapp/src/app-layer/media/videoPresignTtl.ts:12-16`;
- booking: `apps/webapp/src/app-layer/di/buildAppDeps.ts:1037-1042`,
  `apps/webapp/src/modules/booking-notifications/settings.ts:58-62`,
  `apps/webapp/src/modules/booking-scheduling/service.ts:394`,
  `apps/webapp/src/modules/payments/service.ts:561-574`.

Вывод: «ключ читается во время patient request» и «ключ можно выдать браузеру» — разные свойства. Корневое решение
должно поддержать минимум две patient-аудитории: server-side request и сериализуемый client config.

## 4. Общие инварианты для любого варианта

1. **Default deny.** Новый или неклассифицированный ключ остаётся restricted; сборка должна падать без явной
   классификации ownership + sensitivity + audience.
2. **Никаких secret-bearing значений у `app_patient`.** Проверяется и grants/RLS, и API serialization tests.
3. **Mixed JSON не открывается строкой целиком.** `web_push_vapid`, `booking_payment_providers`, `smtp_outbound`
   разделяются либо проецируются безопасным типизированным DTO.
4. **Одна effective-config семантика:** org override → global fallback, если такая ownership-модель разрешена для
   ключа. Visibility не должна менять ownership.
5. **Один write chokepoint и аудит.** Admin UI не пишет таблицы напрямую и не создаёт рассинхрон с integrator.
6. **Patient UI config не является авторизацией.** Скрыв кнопку, нельзя считать mechanic защищённой; server-side
   entitlement guard остаётся обязательным.
7. **Один контракт интерфейса:** клиент получает совместный effective runtime config, включающий ordinary settings и
   resolved mechanics, но источники истины остаются разными.
8. **Не повторять отвергнутую заплатку:** ни функция/route на каждый флаг, ни растущий ручной whitelist в SQL.

## 5. Варианты корневого разделения

### Вариант A — маркер аудитории в `system_settings` + RLS

Суть: оставить одну таблицу, добавить исчерпывающий столбец, например
`read_audience = restricted | patient_runtime | client | public`. `app_patient` получает `SELECT` только строк с
разрешённой аудиторией и только в допустимом org/global контексте.

Что меняется:

- schema/migration: новый NOT NULL marker с default `restricted`; такой же marker в integrator mirror;
- code: registry каждого ключа получает audience/sensitivity; effective reader фильтрует audience;
- grants/RLS: table-level `SELECT` для `app_patient`, а RLS одновременно проверяет patient wall, org/global scope и
  marker;
- mixed rows: публичные части VAPID/payment/SMTP всё равно надо вынести в отдельные ключи или скрыть за общей
  безопасной проекцией;
- admin UI/write service: запрещает выставить client/public для secret-bearing key.

Цена и риск:

- минимальная перестройка repository и admin UI;
- одна ошибочная классификация или UPDATE marker может открыть секретную строку — максимальный blast radius;
- table grant расширяется на таблицу, в которой физически лежат секреты; безопасность держится на RLS и registry;
- integrator mirror schema усложняется, а существующий lag/failure sync не исчезает.

Что ломается: существующие raw/bulk readers, которые предполагают одинаковую форму строк, потребуют обновления;
mixed JSON нельзя безопасно открыть без изменения контрактов. Обратимость высокая: marker по умолчанию restricted,
patient grant/policy можно отозвать; старые значения остаются на месте.

### Вариант B — отдельная таблица client runtime config

Суть: `system_settings` остаётся закрытым operator/server secret-контуром. Создаётся отдельная таблица, условно
`client_runtime_settings`, только для значений, которые разрешено использовать в patient/client runtime. В ней нет
secret-bearing JSON по конструкции.

Что меняется:

- schema/migration: отдельная org-aware таблица с `key`, `scope`, `organization_id`, typed `value_json`, audit fields
  и partial unique indexes для global/org rows;
- code: единый typed registry маршрутизирует ключ в restricted или client store; сервис effective-config объединяет
  client settings и resolved entitlements;
- grants/RLS: `app_patient` читает только новую таблицу; `system_settings` остаётся без patient grants;
- migrations: client-safe rows копируются, но исходные строки не удаляются до завершения dual-read/cutover;
- mixed rows: VAPID public key получает отдельный client key/record; payment/SMTP secrets остаются в
  `system_settings`; если клиенту нужны несекретные части, для них создаётся отдельный typed client DTO/record;
- integrator/media: restricted operational reads остаются в старом контуре; client-facing notification/UI config
  переводится на новый порт только там, где это действительно нужно.

Цена и риск:

- больше schema/code/migration работы и второй audit/write path;
- требуется запретить двойной источник истины и определить маршрутизацию ключа compile-time;
- физическая граница делает ошибку RLS на client-таблице неспособной открыть старые secrets;
- проще объяснить и проверить: patient role не имеет grants на таблицу секретов вообще.

Что ломается: callsites переносимых ключей должны перейти на effective client-config port; admin bulk settings UI должен
уметь редактировать два store через один service. Обратимость высокая при additive migration: оставить старые строки,
вести dual-read с телеметрией, затем переключить; rollback возвращает read source без потери данных.

### Вариант C — безопасная read-only view/projection

Суть: записи остаются в `system_settings`, но `app_patient` получает доступ только к security-barrier view, например
`client_runtime_config_v`, которая выдаёт безопасные ключи/поля и применяет org/global fallback. Base table остаётся
без patient grants.

Что меняется:

- schema/migration: view + registry/metadata, откуда view определяет аудиторию; для mixed JSON — явная безопасная
  проекция полей либо предварительный split ключа;
- code: общий client-config repository читает view, admin write path остаётся прежним;
- grants: `SELECT` на view, ноль grants на base table; проверить owner, `security_invoker`/`security_barrier`,
  `search_path`, FORCE RLS и отсутствие обхода политик;
- integrator: остаётся на прежнем store, если ему не нужен client contract.

Цена и риск:

- наименьшая перестройка write-path и физического хранения;
- view SQL может превратиться в новый центральный whitelist/CASE по ключам, то есть в ту же отвергнутую заплатку в
  другом месте;
- корректность PostgreSQL view/RLS semantics сложнее доказать, особенно с global fallback;
- секреты физически остаются рядом, но patient role не получает base-table grant.

Что ломается: patient readers переходят на новый view port; смешанные ключи требуют новых DTO. Обратимость самая
простая: revoke grant и drop view; base data не меняется. Вариант годится как переходный слой, но как постоянный
корень требует schema-driven registry, а не ручного SQL списка.

## 6. Стыковка с тарифными mechanics

Текущий entitlement-контур уже имеет **14 mechanics**:
`booking`, `exercise_catalog`, `exercise_packages`, `courses`, `cms_pages`, `files`, `patient_card`, `subscriptions`,
`payments`, `mailings`, `patient_app`, `patient_app_paid_subscription`, `branding`, `custom_domain`
(`apps/webapp/src/modules/org-entitlements/types.ts:6-23`). Resolver применяет приоритет
`override → tariff → default true` (`apps/webapp/src/modules/org-entitlements/service.ts:10-36`), а server authorization
выполняет отдельный guard (`apps/webapp/src/app-layer/guards/requireEntitlement.ts:7-20`).

Предложение, общее для A/B/C:

```text
system/client settings source ─┐
                               ├─ resolveEffectiveClientConfig(org, patient) ─► один DTO/API ─► UI
tariff + org overrides ─────────┘
                                      │
                                      └─ mechanics используются UI только для видимости/доступности

server route ─► auth/org context ─► requireEntitlement(mechanic) ─► операция
```

- Не копировать mechanics в settings и не заводить второй флаг `payments_enabled_v2`: источник истины остаётся в
  entitlement tables.
- Effective client DTO имеет разные namespaces, например `{ settings: {...}, mechanics: {...} }`, но доставляется
  одним контрактом, потому что и те и другие меняют интерфейс.
- Обычная настройка отвечает «как выглядит/ведёт себя функция»; entitlement отвечает «включена ли приобретённая
  механика для клиники». Если оба участвуют, итог UI — логическое пересечение, а server guard проверяет entitlement
  независимо от UI.
- `booking_payment_enabled` — существующий дублирующий участок смысла. На этапе исполнения нужно явно выбрать его
  роль: operational rollout внутри включённой mechanic `payments` либо мигрировать значение в entitlement. Это
  **ТРЕБУЕТ РЕШЕНИЯ ВЛАДЕЛЬЦА**, потому что меняет продуктовую семантику; до решения нельзя молча удалить один gate.

Для patient config требуется однозначный текущий org. Сейчас patient session principal создаётся только с patient ID
(`apps/webapp/src/app-layer/principal/sessionPrincipal.ts:44-48`), а resolver при нескольких активных клиниках возвращает
`organization_selection_required` (`apps/webapp/src/modules/patient-organization/service.ts:3-21`). Зафиксировано лишь,
что разделение клиник для пациента является app-level filter
(`OWNER_DECISIONS_FOR_REVIEW.md:75-80`). Конкретный UX/источник выбранной клиники не зафиксирован.

**ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА:** должен ли effective client config строиться по явно выбранной клинике в сессии,
по клинике текущего ресурса/маршрута или иным способом. Инженер не должен выбирать это скрыто внутри repository.

## 7. Сравнение и рекомендация

| Критерий | A: marker + RLS | B: отдельная таблица | C: safe view |
|---|---|---|---|
| Физическая изоляция secrets | Нет | **Да** | Base table закрыта, но хранение общее |
| Объём миграции | Низкий/средний | Высокий | Средний |
| Ошибка классификации | Может открыть secret row | Ограничена client table | Может открыть projected row/field |
| Mixed JSON | Нужен split/projection | Естественный split | Нужна projection/split |
| Риск повторить per-key whitelist | Средний | Низкий при typed registry | Высокий |
| Обратимость | Высокая | Высокая при additive dual-read | Очень высокая |
| Долговечность при десятках флагов | Средняя | **Высокая** | Средняя |

**Инженерная рекомендация, требует решения владельца: вариант B.** Причина — единственная схема, где ошибка RLS или
audience policy на client-таблице не открывает закрытую таблицу с OAuth/payment/VAPID secrets. Ошибочное помещение
секрета в client store всё ещё опасно, поэтому compile-time registry и serialization tests обязательны. Схема дороже
при внедрении, но стоимость локализована в одном typed registry, одном effective-config service и additive migration.
Вариант C разумен как переходный адаптер. Вариант A быстрее, но оставляет главный риск задачи — секреты и клиентские
флаги под одним table grant — внутри одной RLS-ошибки.

Неизвестно до исполнения/решения:

- какие из 96 ключей реально имеют строки и каковы фактические JSON shapes;
- полный список значений, которые владелец хочет отдавать именно браузеру, а не применять server-side;
- точный org-selection contract для пациента;
- должен ли public/pre-session config быть отдельной аудиторией от authenticated patient config;
- какие integrator jobs работают под каким principal в каждом call chain;
- выдерживает ли зеркало integrator новую модель или его нужно заменить прямым чтением общей schema;
- продуктовая семантика пересечения `booking_payment_enabled` и mechanic `payments`.

## 8. Чек-лист исполнения — вариант A

- [ ] Зафиксировать исчерпывающий registry всех 96 ключей в
  `apps/webapp/src/modules/system-settings/types.ts:2-202` и `orgScopedKeys.ts:27-172`: ownership, sensitivity,
  audience. **Доказательство:** TypeScript compile-time exhaustiveness и unit test с ровно 96 entries; новый key без
  трёх классификаций не собирается.
- [ ] Добавить additive migration рядом с `apps/webapp/db/drizzle-migrations/0163_p0_8_6_bootstrap_hybrid_rls.sql:1-52`:
  `read_audience NOT NULL DEFAULT 'restricted'` в public и integrator mirror. **Доказательство:** schema snapshot и
  migration test подтверждают default deny и совпадение обеих schemas.
- [ ] Разделить три mixed JSON keys из раздела 3.2 до выдачи patient grant.
  **Доказательство:** regression test сериализует все client/public rows и не находит private key/password/apiKey/
  webhookSecret/refresh token.
- [ ] Обновить `apps/webapp/src/infra/repos/pgSystemSettings.ts:44-75,201-253` и
  `apps/webapp/src/modules/system-settings/service.ts:95-184`: effective read учитывает audience, write запрещает
  повышение secret-bearing key до client/public. **Доказательство:** repository/service tests на global fallback,
  org override, downgrade/upgrade audience и forbidden secret exposure.
- [ ] Добавить patient RLS/grant отдельным canonical SQL artifact рядом с
  `deploy/postgres/phase4-locked-helper-rls-policies.sql:1325-1331` и обновить inventory
  `deploy/postgres/p0-5b-grants.sql:448-461`. **Доказательство:** live test на тестовой БД после реализации: patient A
  читает только разрешённый global/org-A config, не читает org-B/restricted; staff behaviour unchanged.
- [ ] Перевести summary route и остальные 22 patient chains на audience-aware port, начиная с
  `.../discussion/summary/route.ts:40-43`. **Доказательство:** route tests под locked principal дают 200 для UI flag,
  а запрос restricted key — 403/typed unavailable, не 500.
- [ ] Аудировать 25 integrator и 2 media-worker reads против новых policy/grants.
  **Доказательство:** таблица callsite → principal → required audience и integration tests каждого principal class.
- [ ] Собрать единый `resolveEffectiveClientConfig` из settings + entitlements без копирования mechanics.
  **Доказательство:** org A/B получают разные mechanics/settings, disabled mechanic скрыта UI и остаётся 403 на
  server write route.
- [ ] Добавить rollback artifact: revoke patient grant/policy и вернуть все markers в restricted без удаления rows.
  **Доказательство:** rehearsal на disposable test schema восстанавливает прежнее staff чтение и закрывает patient.

## 9. Чек-лист исполнения — вариант B

- [ ] Утвердить имя таблицы и исчерпывающий typed registry, разделяющий restricted/client stores, в
  `apps/webapp/src/modules/system-settings/types.ts:2-202`. **Доказательство:** все 96 текущих ключей распределены;
  compile-time test запрещает ключ одновременно в двух stores и secret-bearing key в client store.
- [ ] Добавить additive migration новой org-aware `client_runtime_settings` + audit table/fields и partial unique
  indexes по образцу `apps/webapp/db/schema/schema.ts:2642-2658`. Старую таблицу и строки не удалять.
  **Доказательство:** migration/schema tests, uniqueness global/org и FK/ownership checks проходят.
- [ ] Добавить port/repository в существующих architecture boundaries; module не импортирует DB напрямую.
  **Доказательство:** lint architecture rules и unit tests effective org override → global fallback.
- [ ] Расширить единый admin write service `apps/webapp/src/modules/system-settings/service.ts:95-184`, чтобы registry
  маршрутизировал write и сохранял единый аудит, не позволяя двойной записи как двум источникам истины.
  **Доказательство:** admin API contract остаётся backward-compatible; service tests проверяют store routing.
- [ ] Подготовить idempotent data migration только для утверждённого client-safe набора; оставить shadow copy в старой
  таблице на период dual-read и записывать mismatch telemetry без значений. **Доказательство:** dry-run counts по key,
  zero secret-bearing rows in destination, повторный запуск не меняет результат.
- [ ] Разложить mixed JSON: VAPID public key — отдельный typed client record; payment/SMTP secrets — только restricted.
  **Доказательство:** client table constraint/validation и serialization test не допускают секретные поля.
- [ ] Дать `app_patient` SELECT только на новую таблицу и применить org/global RLS; старые
  `public.system_settings`/audit остаются вне patient grants. **Доказательство:** privilege snapshot показывает zero
  patient grants на secret tables; live A/B isolation test проходит.
- [ ] Перевести 22 patient chains на client-config port, оставив два restricted и server-only ключи за закрытым
  service boundary. **Доказательство:** discussion-summary перестаёт падать; payment providers и test identifiers
  недоступны patient role; все patient route tests зелёные.
- [ ] Решить для 25 integrator keys, какие остаются restricted и какие читают client store; для двух media-worker keys
  подтвердить узкий infra access. **Доказательство:** callsite/principal matrix и focused integration tests, без broad
  grants.
- [ ] Реализовать один effective DTO `{ settings, mechanics }`, сохранив `requireEntitlement` на server routes.
  **Доказательство:** UI contract test + authorization test показывают, что подмена DTO не обходит entitlement.
- [ ] После периода dual-read удалить только старые client copies отдельной обратимой фазой; до этого rollback меняет
  reader обратно без schema/data loss. **Доказательство:** зафиксированный zero-mismatch window и rehearsal rollback.

## 10. Чек-лист исполнения — вариант C

- [ ] Создать исчерпывающий schema-driven audience registry для всех 96 keys; не кодировать список флагов вручную в
  десятках SQL functions. **Доказательство:** новый client key требует одну registry entry и автоматически попадает в
  view tests.
- [ ] Спроектировать `client_runtime_config_v` с явной семантикой org override/global fallback и безопасной
  проекцией mixed JSON. **Доказательство:** SQL tests покрывают duplicate/global/org cases и VAPID выдаёт publicKey без
  privateKey.
- [ ] Зафиксировать PostgreSQL security properties view: owner без опасного bypass, `security_barrier`, корректный
  invoker mode, pinned `search_path`, FORCE RLS на base table. **Доказательство:** privilege/RLS inspection script и
  adversarial tests под `app_patient`.
- [ ] Выдать `app_patient` SELECT только на view, не на `public.system_settings` или audit.
  **Доказательство:** privilege snapshot + прямой SELECT base table запрещён, view возвращает только разрешённые rows.
- [ ] Добавить client-config port поверх view и перевести 22 patient chains, начиная с summary route.
  **Доказательство:** route regression tests под locked roles; restricted reads не превращаются в silent defaults.
- [ ] Оставить admin writes через `createSystemSettingsService().updateSetting`, не добавлять второй sync call в routes.
  **Доказательство:** service tests и mirror contract остаются зелёными.
- [ ] Аудировать integrator/media principals отдельно; view grant не расширять на infra роли без фактической нужды.
  **Доказательство:** callsite/principal matrix и отсутствие новых broad grants.
- [ ] Объединить projected settings и resolved entitlements в одном effective client DTO, сохранив server guards.
  **Доказательство:** те же A/B UI + authorization tests, что в вариантах A/B.
- [ ] Подготовить rollback `REVOKE SELECT` + drop view без изменения base rows.
  **Доказательство:** rehearsal возвращает исходный privilege graph.

## 11. Общий acceptance gate после выбора

- [ ] У каждого текущего и нового config key есть три явные характеристики: ownership, sensitivity, audience;
  доказательство — exhaustive compile-time registry.
- [ ] `app_patient` не имеет пути к OAuth, payment, SMTP, VAPID private key, allowlists и test identifiers;
  доказательство — privilege snapshot + adversarial SQL/API tests на тестовой БД.
- [ ] `patient.program.item.discussion-summary` под locked patient principal возвращает штатный ответ, а не 500;
  доказательство — focused route test и живой тест на тестовом сервере.
- [ ] Клиники A/B получают только свой effective client config; global fallback работает только для разрешённых ключей;
  доказательство — cross-org test matrix.
- [ ] Один UI config contract включает ordinary settings и resolved mechanics, но server entitlement checks не удалены;
  доказательство — UI contract + 403 server authorization tests.
- [ ] Staff/admin settings flow, integrator и media worker не получили broad bypass и не потеряли нужные reads;
  доказательство — principal/callsite matrix и focused regressions.
- [ ] Миграция и rollback отрепетированы на тесте; старый прод не затрагивался.

## 12. Карточка выбора владельцу

**ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА:**

1. Корневая схема: **A — marker+RLS**, **B — отдельная client table**, **C — safe view**.
2. Аудитории: достаточно ли `restricted / authenticated patient`, или нужен отдельный public pre-session config.
3. Откуда patient request берёт выбранную клинику при нескольких клинических контекстах.
4. `booking_payment_enabled`: rollout-настройка поверх mechanic `payments` или устаревающий дубль entitlement.

До этих четырёх ответов корректно выполнить только статическую классификацию и тестовый дизайн; переносить данные,
выдавать grants или закреплять UX нельзя.
