# D15b/1 — живой замер идентичности перед переносом (03.08.2026)

Полномочие: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D15b/1, схема —
`docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §2b/§2c. Только измерение: ни одна
команда ниже не писала, не мигрировала и не меняла схему. Все SQL — `sudo -u postgres psql` на DEV
(`bcb_webapp_dev`) и TEST (`bersoncarebot_test`) на текущем хосте `151.241.228.122`; PROD (`135.106.162.170`)
не трогался.

Каждое число ниже — с командой, которая его получила. Где живой замер расходится с текстом плана —
названо явно, старый текст не правится молча.

---

## 1. RLS на `platform_users` — правда ли выключена

### 1.1 Сам факт RLS

```sql
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname='platform_users';
```

DEV (`bcb_webapp_dev`):

```
 nspname |    relname     | relrowsecurity | relforcerowsecurity
---------+----------------+----------------+---------------------
 public  | platform_users | f              | f
```

TEST (`bersoncarebot_test`) — идентично: `relrowsecurity=f`, `relforcerowsecurity=f`.

**Подтверждено буквально: RLS выключена на `platform_users` и на DEV, и на TEST.** Старая заметка («это
единственная PII-таблица без RLS») — верна на сегодня, не протухла.

### 1.2 Политики существуют, но неактивны

```sql
SELECT polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
FROM pg_policy WHERE polrelid = 'public.platform_users'::regclass;
```

На обеих базах две политики: `c4_web_push_reminder_discovery` (SECURITY DEFINER discovery, `USING true`) и
`c4_web_push_reminder_user` (доступ по `reminder_rules` + `app.org`). Обе определены, но **не действуют**,
пока `relrowsecurity=f` — политика без включённого RLS не фильтрует ни одной строки. Это не защита, а
заготовка на будущее включение (D15b/4).

### 1.3 Кто может SELECT сегодня и по какому пути

```sql
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='platform_users';
```

TEST — прямые GRANT на таблицу:

| grantee | привилегии |
|---|---|
| `app_owner` | SELECT, UPDATE |
| `app_staff` | SELECT, INSERT, UPDATE, DELETE |
| `app_patient` | **SELECT** |
| `app_operational_web_push_reminder` | SELECT |
| `bersoncarebot_test` (owner) | всё |

DEV — то же самое плюс прямой grant SELECT ещё и `bcb_dev_runtime_nonstaff_login`; владелец таблицы —
`bcb_webapp_dev_user` (полный CRUD).

Цепочка членства (`pg_auth_members`) до логин-ролей:

```sql
SELECT r.rolname, r.rolbypassrls,
       ARRAY(SELECT b.rolname FROM pg_auth_members m JOIN pg_roles b ON b.oid=m.roleid WHERE m.member=r.oid)
FROM pg_roles r WHERE r.rolname LIKE 'app_%' OR r.rolname LIKE 'bcb_%';
```

- `bcb_test_staff_login` → член `app_staff` → полный CRUD на `platform_users`.
- `bcb_test_nonstaff_login` → член `app_patient` → SELECT.
- **`bcb_test_integrator_login` → член сразу `app_staff` + `app_worker` + `app_patient`** — интеграторский
  DB-логин уже сегодня держит staff-уровень привилегий на `platform_users`, а не «только транспорт». Это
  расходится с целевой ролью интегратора из §2b («интегратор — только транспорт») на уровне грантов, а не
  только кода: даже после D15b/2 (код перестанет писать) логин-роль интегратора будет физически способна на
  полный CRUD, пока грант не сужен отдельно.
- Ни у одной из этих ролей нет `rolbypassrls` (`app_owner` — единственная роль с `rolbypassrls=t`, но она не
  задействована в обычном runtime-пути пользователей).

**Вывод, важный для D15b/4:** т.к. RLS выключена, `app_patient` (роль пациентской сессии) видит **любую**
строку `platform_users`, не только свою — это не только «одна PII-таблица без стены», это ещё и разрыв
границы между клиниками: пациент клиники A теоретически способен через ту же роль прочитать строку пациента
клиники B, если запрос не отфильтрован в коде приложения вручную. Сегодня единственная защита — то, что все
известные repo-читатели фильтруют по `id`/сессии в коде; SQL-уровня стены нет вообще.

---

## 2. Поколоночная перепись читателей

Канонический файл схемы — `apps/webapp/db/schema/schema.ts` (не отдельный `platformUsers.ts` — такого файла
нет), таблица объявлена как `platformUsers = pgTable('platform_users', …)`. Колонки из брифа подтверждены 1:1
(`firstName→first_name`, …), а из «timezone» единственная реальная колонка — `calendarTimezone→calendar_timezone`.

Метод: `code-search.mjs` + `grep -rn` по каждому имени колонки в `apps/webapp/**` и `apps/integrator/**`,
исключая `*.test.ts`; отдельно проверено, что многие реальные читатели идут raw SQL по имени таблицы, а не
через Drizzle-объект — их пропустил бы только импорт-сёрч.

### 2.1 Внутри `apps/webapp/src/infra` (порт-слой, ожидаемо и безопасно)

ФИО: `pgDoctorClients.ts`, `pgUserByPhone.ts`, `pgUserProjection.ts`, `pgCanonicalPlatformUser.ts`,
`pgDoctorClientCreate.ts`, `pgPatientOrganization.ts`, `pgSupportCommunication.ts`, `pgProductAnalytics.ts`,
`pgDoctorCanonicalAppointments.ts`, `pgBookingCalendar.ts`, `pgBookingEngine.ts`, `pgClientMediaFolders.ts`,
`pgHealthFailureArchive.ts`, `pgMaterialRatingFeedback.ts`, `pgLfkExercises.ts`, `pgLfkTemplates.ts`,
`pgMaterialRating.ts`, `s3MediaStorage.ts`, `platformUserMergePreview.ts`, `platformUserNameMatchHints.ts`,
`mergeAuditLabels.ts`, `adminAuditLog.ts`, `identityPhoneRowSchemas.ts`, `pgOAuthUserResolve.ts`,
`pgIdentityResolution.ts`, `pgPhoneMessengerBind.ts`, `pgChannelLinkClaim.ts`, `pgDoctorAnalyticsMetricAccounts.ts`,
`pgPublicBookingMergeCandidates.ts`.

Контакты: `pgUserByPhone.ts`, `pgUserProjection.ts`, `pgEmailAuth.ts`, `pgEmailPasswordLookup.ts`,
`pgEmailSetupFlowPort.ts`, `pgOAuthUserResolve.ts`, `pgChannelPreferences.ts`, `pgPhoneHistory.ts`,
`pgAdminNotificationTargets.ts`, `pgBroadcastEmailRecipients.ts`, `broadcastChannelCounts.ts`,
`pgDoctorClients.ts`, `pgDoctorClientCreate.ts`, `pgPatientOrganization.ts`, `pgAdminClientProfileConflicts.ts`,
`pgDoctorAnalyticsMetricAccounts.ts`, `pgPublicBookingMergeCandidates.ts`, `pgPatientCalendarTimezone.ts`,
`pgPhoneMessengerBind.ts`, `pgChannelLinkStart.ts`, `pgChannelLinkClaim.ts`, `pgPlatformAccess.ts`,
`pgIdentityResolution.ts`, `identityPhoneRowSchemas.ts`, `platformUserMergePreview.ts`,
`platformUserNameMatchHints.ts`, `platformUserFullPurge.ts`, `strictPlatformUserPurge.ts`.

Аккаунт/состояние: `pgDoctorClients.ts`, `pgUserByPhone.ts`, `pgUserProjection.ts`, `pgCanonicalPlatformUser.ts`,
`pgAdminPlatformUserStats.ts`, `pgAdminNotificationTargets.ts`, `pgDoctorClientCreate.ts`,
`pgDoctorAnalyticsMetricAccounts.ts`, `pgPatientOrganization.ts`, `pgOrganizationInvites.ts`,
`pgGlobalAdminWebPushRecipients.ts`, `pgStaffUsers.ts`, `pgPlatformAccess.ts`, `pgChannelLinkClaim.ts`,
`pgOAuthUserResolve.ts`, `pgEmailAuth.ts`, `pgPublicBookingUserResolve.ts`, `pgPublicBookingMergeCandidates.ts`,
`platformUserMergePreview.ts`, `platformUserNameMatchHints.ts`, `platformUserFullPurge.ts`,
`strictPlatformUserPurge.ts`, `integratorPlatformUserMerge.ts`, `ops/webappIntegratorUserProjectionRealignment.ts`,
`pgDoctorCalendarTimezone.ts`, `pgPatientCalendarTimezone.ts`, `pgPlatformUserCalendarTimezone.ts`.

### 2.2 СНАРУЖИ `apps/webapp/src/infra` — риск-список (ломается любым переносом)

```
apps/webapp/src/app-layer/di/buildAppDeps.ts                          ФИО, контакты, аккаунт
apps/webapp/src/app-layer/guards/requireRole.ts                       аккаунт (role) — самый крупный non-infra потребитель role
apps/webapp/src/app/app/doctor/clients/AdminClientProfileEditPanel.tsx ФИО, контакты
apps/webapp/src/app/app/doctor/clients/DoctorClientPrimaryContacts.tsx контакты
apps/webapp/src/app/api/doctor/booking-engine/appointments/manual-patient-visit/route.ts  ФИО, контакты
apps/webapp/src/app/api/doctor/patients/[userId]/physical/route.ts    аккаунт (role)
apps/webapp/src/app/api/auth/email-password/reset/route.ts            контакты
apps/webapp/src/modules/auth/service.ts                               ФИО, аккаунт
apps/webapp/src/modules/auth/sessionCookie.ts                         аккаунт
apps/webapp/src/modules/auth/envRole.ts                                аккаунт
apps/webapp/src/modules/auth/identityResolutionPort.ts                ФИО, аккаунт
apps/webapp/src/modules/auth/oauthUserResolvePort.ts                  контакты
apps/webapp/src/modules/auth/oauthWebLoginResolve.ts                  ФИО, контакты
apps/webapp/src/modules/auth/passwordChange.ts                        контакты
apps/webapp/src/modules/auth/userByPhonePort.ts                       контакты
apps/webapp/src/modules/doctor-clients/clientSearchMatch.ts           ФИО
apps/webapp/src/modules/doctor-clients/clientArchiveChange.ts         аккаунт (сегодня мёртвый стаб, комментарий уже ссылается на is_archived)
apps/webapp/src/modules/doctor-clients/ports.ts                       ФИО, контакты, аккаунт — ТОЛЬКО типы-контракт
apps/webapp/src/modules/channel-preferences/ports.ts                  контакты — ТОЛЬКО типы-контракт
apps/webapp/src/modules/messaging/patientMessagingService.ts          аккаунт (is_blocked)
apps/webapp/src/modules/operator-alerts/dispatchOperatorAlert.ts      контакты, аккаунт
apps/webapp/src/modules/platform-access/trustedPhonePolicy.ts         контакты
apps/webapp/src/modules/platform-user-contacts/bookingContactUpsert.ts  контакты
apps/webapp/src/modules/platform-user-contacts/identityContactMatch.ts контакты
apps/webapp/src/modules/patient-home/patientGreetingPersonalizedName.ts ФИО
apps/webapp/src/modules/integrator/events.ts                          ФИО, контакты, аккаунт
apps/webapp/src/shared/types/session.ts                               ФИО, аккаунт — ЦЕНТРАЛЬНЫЙ тип-контракт
apps/webapp/scripts/fio-backfill/*.ts (3 файла)                       ФИО — сырой SQL мимо порта
apps/webapp/scripts/migrate-fio-dev.ts                                ФИО, аккаунт — сырой SQL мимо порта
apps/webapp/scripts/purge-placeholder-bookings.ts                     ФИО, контакты, аккаунт — сырой SQL мимо порта
apps/webapp/scripts/user-phone-admin.ts                               ФИО, контакты, аккаунт — сырой SQL мимо порта
apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts            ФИО, контакты, аккаунт — сырой SQL мимо порта
apps/webapp/scripts/integrator-schema-cleanup/01_audit.ts             контакты — сырой SQL мимо порта
apps/webapp/scripts/postgres-integration/harness-lib.ts               аккаунт
packages/platform-merge/pgPlatformUserMerge.ts                        ФИО, контакты, аккаунт — отдельный пакет, ВНЕ apps/webapp
packages/platform-merge/mergeContactFallback.ts                       контакты
packages/platform-merge/messengerBindAuditEnrichment.ts               ФИО, контакты, аккаунт
packages/platform-merge/messengerPhonePublicBind.ts                   контакты, аккаунт
```

**Главный вывод раздела:** фан-аут вне `infra` большой (67 файлов напрямую деструктурируют
`session.user.*`, ещё ~100+ используют `ClientIdentity`/`ClientListItem`/`PatientCardHeader`), но он **не**
результат независимого доступа к БД — он весь стекается через два типовых контракта:
`apps/webapp/src/shared/types/session.ts` (`SessionUser`) и `apps/webapp/src/modules/doctor-clients/ports.ts`
(`ClientIdentity`/`ClientListItem`/`PatientCardHeader`). Порт идентичности из §2b нужно проектировать вокруг
ИМЕННО ЭТИХ ДВУХ файлов — это единственный шов, который реально держит форму. Отдельная категория риска —
6 dev/ops-скриптов под `apps/webapp/scripts/**`, которые ходят raw SQL мимо порта: их нельзя перенаправить
переписыванием одной реализации порта, их нужно чинить по отдельности.

### 2.3 Интегратор — свои читатели (отдельное приложение, отдельный вопрос)

Да, есть — интегратор (`apps/integrator/`) не импортирует Drizzle-схему вебаппа, ходит raw SQL/pg по
буквальному имени `platform_users` в общей базе. Свой инфра-эквивалент:
`db/directPublic/writeIdentityAndPreferencesDirect.ts`, `db/directPublic/mergeCandidatesDirect.ts`,
`db/directPublic/resolveDirectPublicActor.ts`, `db/directPublic/writeReminderRulesDirect.ts`,
`db/repos/channelUsers.ts`, `db/repos/messageThreads.ts`, `db/repos/platformUserByChannel.ts`,
`db/repos/platformUserDeliveryPhone.ts`, `db/writePort.ts`, `operatorIncident/operatorHealthAlertConfigIntegrator.ts`,
`runtime/worker/doctorBroadcastIntentMenu.ts`, `scripts/check-d30-outgoing-delivery-claim-concurrency.ts`.

Снаружи интеграторского инфра-слоя (`integrations/`, `shared/`): `integrations/google-calendar/calendarDescription.ts`,
`integrations/webappEntryToken.ts`, `shared/devDeliveryRedirect.ts`.

### 2.4 Метод — исключённые ложные срабатывания

Отсеяны как не относящиеся к `platform_users` (проверено чтением файла, не именем): `db-principal`/`bootProbe.ts`
хиты на «role» — это Postgres `SET ROLE`, а не колонка; `is_archived`/`display_name` в `lfk_exercises`/`lfk_templates`/
`clinical_tests`/media/org-branding модулях — те же имена у ДРУГИХ сущностей; `env.ts` — док-комментарии про env-переменные,
не чтения колонок. Не досчитаны до конца (осознанно): каждый лист-компонент, деструктурирующий `session.user.*`
или `ClientIdentity`, — фан-аут подтверждённо большой, но упирается в те же два контракта из §2.2, не в
независимый доступ к БД.

---

## 3. Классификация внешних ключей на `platform_users.id`

### 3.1 Реальное число — не 46

План (`WORK_ORDER.md` D15b, трижды) утверждает «46 внешних ключей». Живой замер:

```sql
SELECT count(*) FROM pg_constraint
WHERE contype='f' AND confrelid='public.platform_users'::regclass;
```

DEV и TEST — **одинаково: 130** FK-constraint'ов, от **104** различных таблиц (проверено также на partition-
артефакты — `conparentid=0` у всех 130, дублирования нет). Полный список (таблица · колонка · on_delete)
получен через `pg_constraint`+`unnest(conkey/confkey)`; проверка по количеству партиций и по «конкретно `regclass`-имени
таблицы» исключает артефакт подсчёта.

**Источник цифры «46» не найден.** Проверено: ни `D15A_IDENTITY_RESEARCH.md`, ни
`IDENTITY_DB_SPLIT_RESEARCH_2026-08-03.md` не содержат этого числа ни в каком контексте про FK — оно попало в
`WORK_ORDER.md` без прослеживаемого источника. Не поправляю сам текст плана — называю здесь: **«46» —
непроверяемая (не найдена в исследованиях) и опровергнутая живым замером цифра; правильное число — 130
constraint'ов / 104 таблицы.**

Отдельно и другое число из той же схемы, §2b: «интегратор пишет `platform_users` в 20 файлах». Это не то же
число, что «11 файлов» из D15b/2 (см. §4) — оба должны быть сверены с живым замером §4, который нашёл 3
реальных сайта записи + до 5 файлов-диспетчеров, всего не больше 8.

### 3.2 Классификация 130 FK по трём группам

Не силой в два ведра — использую три: логин/аккаунт, клиника, ни то ни другое (эту третью группу план не
называл явно, но она реальна и в неё попадает больше четверти FK).

**Группа 1 — логин/аккаунт-обвязка (31):** `channel_link_secrets.user_id`, `email_challenges.user_id`,
`email_send_cooldowns.user_id`, `login_tokens.user_id`, `patient_merge_candidates.{anchor_user_id,resolved_by,
candidate_user_id}`, `phone_messenger_bind_secrets.user_id`, `platform_user_contacts.platform_user_id`,
`platform_users.{merged_into_id,blocked_by}` (само-ссылки), `user_channel_bindings.user_id`,
`user_channel_preferences.platform_user_id`, `user_email_setup_tokens.{user_id,created_by_user_id}`,
`user_notification_topic_channels.user_id`, `user_notification_topics.user_id`, `user_oauth_bindings.user_id`,
`user_password_credentials.user_id`, `user_phone_history.platform_user_id`, `user_pins.user_id`,
`user_web_push_subscriptions.user_id`, `specialist_signup_intents.user_id`, `staff_security_profiles.user_id`,
`patient_invites.{revoked_by_platform_user_id,patient_user_id,accepted_by_platform_user_id,created_by_platform_user_id}`,
`user_passkey_accounts.user_id`, `user_passkey_credentials.user_id`, `user_passkey_challenges.user_id`.

**Группа 2 — клинические/пациентские данные (63):** `appointment_records.platform_user_id`, вся
`be_appointment_*` (actor_id/platform_user_id/author_id), `be_package_usages.created_by_platform_user_id`,
`be_patient_booking_profiles.*`, `be_patient_packages.*`, `be_patient_timeline_events.platform_user_id`,
`be_payment_intents.platform_user_id`, вся `clinical_anamnesis_*`, `clinical_complaint.patient_user_id`,
`clinical_diagnosis.patient_user_id`, `clinical_diagnosis_catalog.created_by`,
`clinical_diagnosis_status_history.changed_by`, `clinical_visit.*`, `doctor_notes.*`,
`doctor_patient_support.*`, `lfk_complex_templates.created_by`, `lfk_complexes.platform_user_id`,
`lfk_exercises.created_by`, `lfk_sessions.user_id`, `media_folders.patient_user_id`,
`online_intake_requests.user_id`, `online_intake_status_history.changed_by`, `patient_bookings.platform_user_id`,
`patient_comorbidity.*`, `patient_files.*`, `patient_lfk_assignments.*`, `patient_payment.*`,
`program_action_log.patient_user_id`, `program_item_discussion_{messages,reads}.patient_user_id`,
`recommendations.created_by`, `symptom_entries.platform_user_id`, `symptom_trackings.platform_user_id`,
`test_attempts.*`, `test_results.decided_by`, `test_sets.created_by`, `tests.created_by`,
`treatment_program_events.actor_id`, `treatment_program_instances.*`, `treatment_program_templates.created_by`.

**Группа 3 — ни то ни другое (36):** `integrator.user_reminder_occurrences.platform_user_id`,
`admin_audit_log.actor_id`, `broadcast_audit_recipients.platform_user_id`, `comments.author_id`,
`content_access_grants_webapp.platform_user_id`, `material_ratings.user_id`,
`patient_content_rating_feedback.user_id`, `media_files.uploaded_by`, `media_folders.created_by`,
`media_upload_sessions.owner_user_id`, весь `media_hls_proxy_error_events`/`media_playback_*` телеметрия,
`message_log.platform_user_id`, `patient_daily_warmup_{presentations,video_views}.user_id`,
`product_analytics_*`, `product_push_notifications.user_id`, `reminder_rules.platform_user_id`,
`specialist_tasks.owner_user_id`, `support_conversations.platform_user_id`, `system_settings*`,
`app_runtime_settings*`, `be_organization_members.platform_user_id`, `org_enrollments.platform_user_id`,
`organization_member_invites.*`, `organization_slug_claims.*`, `organization_slug_rename_events.*`,
`org_brand_revisions.*`.

**Не досчитано до автоматизма — 7 спорных случаев названы явно, не спрятаны в одну из групп:**
1. Каталожные/шаблонные таблицы клинического модуля (`clinical_diagnosis_catalog`, `lfk_complex_templates`,
   `lfk_exercises`, `test_sets`, `tests`, `treatment_program_templates`, `recommendations`.`created_by`) —
   это авторство орг-уровневого справочника, не запись о конкретном пациенте; отнесены в группу 2 по
   близости домена, но кандидат на отдельную 4-ю группу «клинический справочник».
2. `media_folders.patient_user_id` — папка это организационная конструкция (`kind='client_patient'`), не
   само клиническое содержимое.
3. `online_intake_requests`/`online_intake_status_history` — заявка на приём ближе к букингу, чем к
   клинической записи.
4. `program_item_discussion_reads.patient_user_id` — это read-receipt телеметрия, а не содержание.
5. `support_conversations.platform_user_id` — тех.поддержка через бота, не клиническая запись; можно
   спорить, что пациентская переписка ближе к клинике.
6. `org_enrollments.platform_user_id` — активация портала для конкретной организации; не логин
   (нет credential-семантики) и не клиника — нужен явный ответ владельца, куда её относить.
7. `doctor_patient_support.updated_by` — «кто из персонала переключил флаг» логически ближе к группе 3, чем
   к группе 2, куда попала для консистентности с `patient_user_id` той же таблицы.

### 3.3 Необъявленные ссылки — колонки без FK-constraint

```sql
WITH declared AS ( … объявленные FK на platform_users … )
SELECT table_name, column_name, data_type FROM candidate_cols cc
LEFT JOIN declared d ON …
WHERE d.attname IS NULL;
```

Кандидатов (по имени `%platform_user_id%`, `%patient_user_id%`, `user_id`, `%_user_id`) — **34**. Разложены
проверкой данных (`EXISTS (SELECT 1 FROM platform_users pu WHERE pu.id = t.col)` / `pu.id::text = t.col`),
не по одному имени/типу:

- **Легаси-интеграторские (НЕ platform_users, bigint-ключ в собственной схеме интегратора)** — 15 колонок:
  `contacts.user_id`, `identities.user_id`, `conversations.user_identity_id`, `content_access_grants.user_id`,
  `platform_users.integrator_user_id` (обратная ссылка, не входящая), `reminder_*`/`support_conversations`/
  `notification_delivery_attempts.integrator_user_id`, `user_reminder_rules.user_id`, `users.merged_into_user_id`,
  `content_access_grants_webapp.integrator_user_id`, `user_oauth_bindings.provider_user_id`,
  `broadcast_drafts.doctor_user_id` (см. ниже — на самом деле это UUID, см. отдельный пункт),
  `lfk_complexes.user_id`, `message_log.user_id`, `user_channel_preferences.user_id`, `symptom_entries.user_id`,
  `symptom_trackings.user_id` — из этих последних пяти **4 оказались настоящими UUID-ссылками на
  platform_users.id, хранимыми как `text` без FK** (следующий пункт), а не легаси-интегратором; я ошибочно
  сгруппировал бы их с интегратором по одному имени `user_id`, если бы не проверил данные.
- **Настоящие необъявленные ссылки на `platform_users.id`, подтверждённые данными (0 orphans):**
  `lfk_complexes.user_id` (text, 1/1 совпадение), `symptom_entries.user_id` (text, 622/622),
  `symptom_trackings.user_id` (text, 258/258), `user_channel_preferences.user_id` (text, 120/120) —
  **у всех четырёх таблиц уже ЕСТЬ параллельная, правильно объявленная FK-колонка `platform_user_id`
  (см. группу 2/3 в §3.2) — это дубликат-легаси-колонка того же смысла, не второй читатель.** Кандидат на
  снос заодно с переносом, а не на перенос.
  Плюс UUID-типизированные без данных на TEST, но подтверждённые по коду/DDL как реальные:
  `be_payments.platform_user_id` (DDL: `uuid`, без FK — сверено по `bookingPayments.ts:164`, единственная
  колонка таблицы без `foreignKey()` среди соседних `organization_id`/`payment_intent_id`/`appointment_id`,
  которые все FK'нуты — выглядит забытой, а не намеренной), `be_payment_history_events.platform_user_id`
  (3/3 совпадения на DEV), `broadcast_drafts.doctor_user_id` (UUID NOT NULL UNIQUE, DDL подтверждает join
  против `platform_user_id` в `user_org` в миграции `0165_p0_4_p8b_broadcast_drafts_org.sql:54` — это ссылка
  на доктора-платформенного-юзера), `content_section_slug_history.changed_by_user_id`,
  `manual_patient_commands.platform_user_id`, `operator_health_failure_archive.{archived_by_user_id,
  doctor_user_id}` (44/44 и 43/43 совпадений на TEST), `patient_diary_day_snapshots.platform_user_id`
  (**577/582 совпадений — 5 строк-сирот, не матчатся ни на одну существующую `platform_users.id`; это
  живой дефект целостности данных, не гипотетический — не в объёме D15b, но стоит завести отдельно**),
  `patient_practice_completions.user_id` (242/242), `reminder_occurrence_history.platform_user_id` (2592/2592),
  `specialist_tasks.patient_user_id` (3/3).
- **Намеренно без FK, не дефект:** `password_login_identifier_protection.leased_user_id` — по
  док-комментарию файла («Global pseudonymous state … including nonexistent identifiers») отсутствие FK
  здесь осознанное: механизм анти-перебора обязан работать и против идентификаторов, которым не
  соответствует ни один реальный пользователь. Не заносить в список «нужно связать FK».
  Аналогично `email_otp_locks.user_id UUID PRIMARY KEY` — таблица создана в
  `0248_otp_decaying_lockout.sql` вообще без FK-декларации; в Drizzle-схеме (`schema.ts`) не представлена
  никак — живёт только как raw-SQL-таблица; нет данных, чтобы отличить «забыли» от «намеренно», отдельный
  вопрос владельцу, а не факт.

---

## 4. Интеграторские писатели `platform_users` — не 11, а 3 реальных места записи

План (`WORK_ORDER.md` D15b/2) называет «11 файлов, включая сырые `directPublic/writeIdentityAndPreferencesDirect`,
`mergeCandidatesDirect`, `channelUsers`, `mergeIntegratorUsers`». Живой замер (грep каждого `.ts` под
`apps/integrator/src`, исключая тесты/миграции, на буквальный `INSERT INTO`/`UPDATE ... platform_users`, плюс
трассировка каждого вызывающего):

### 4.1 Реальные писатели (буквальный INSERT/UPDATE, достижимый рантаймом) — 3

**`apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts`**
- Пишет: `insertPlatformUser` (INSERT) — `integrator_user_id, phone_normalized, display_name, first_name,
  last_name, patient_phone_trust_at`; `enrichPlatformUser` (UPDATE) — те же плюс `updated_at`.
- Триггер: мутация `user.upsert` в `writePort.ts:322` — на КАЖДОМ входящем сообщении Telegram/MAX от
  канального пользователя (новом или существующем).
- Эквивалент в вебаппе: **да** — `apps/webapp/src/infra/repos/pgUserProjection.ts` (INSERT:254, UPDATE:276)
  — это буквально тот же код, который заголовок файла сам называет источником параллели.
- Второй экспорт этого файла, `writeNotificationTopicsDirect` (для мутации `notifications.update`) — **мёртв**:
  в `writePort.ts` такого `case` больше нет вообще. Ссылка на него в `D15A_IDENTITY_RESEARCH.md`
  (`writePort.ts:1121`) — протухшая.

**`packages/platform-merge/src/pgPlatformUserMerge.ts`** (общий пакет, НЕ под `apps/integrator`)
- Пишет 13 колонок: `phone_normalized, patient_phone_trust_at, integrator_user_id, display_name, first_name,
  last_name, patronymic, email, email_normalized, email_verified_at, merged_into_id, merged_at, updated_at`.
- Триггер: слияние идентичности при ≥2 кандидатах `platform_users` на одну персону — вызывается из
  интегратора через `mergeCandidatesDirect.ts` и из `applyMessengerPhonePublicBind`, плюс ручное слияние
  админом.
- Эквивалент в вебаппе: **тривиально да** — это ОБЩИЙ пакет `@bersoncare/platform-merge`, вебапп зовёт его
  напрямую (`pgPhoneMessengerBind.ts`, `pgUserProjection.ts`, `manualPlatformUserMerge.ts`,
  `manualMergeIntegratorGate.ts`, `platformUserMergePreview.ts`) — это не дублирующаяся логика, это одна
  реализация на оба приложения.

**`packages/platform-merge/src/messengerPhonePublicBind.ts`** (общий пакет)
- Пишет: `phone_normalized, patient_phone_trust_at, integrator_user_id, updated_at` (основной UPDATE) плюс
  `integrator_user_id, updated_at` (realign-UPDATE).
- Триггер: мутация `user.phone.link` в `writePort.ts:426` — подтверждение/привязка телефона каналом.
- Эквивалент в вебаппе: **да** — тот же общий пакет, вебапп вызывает через
  `apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts` и `pgPhoneMessengerBind.ts`.

### 4.2 Диспетчеры (своего SQL нет, но решают, когда сработает запись выше)

`apps/integrator/src/infra/db/writePort.ts` (центральный роутер мутаций вебхука), `mergeCandidatesDirect.ts`
(обёртка над `mergePlatformUsersInTransaction`), `db/repos/messengerPhonePublicBind.ts` (чистый ре-экспорт),
`resolveDirectPublicActor.ts` (резолвит canonical id, вызывает merge при коллизии).

### 4.3 Расхождение с текстом плана — важно для скоупа D15b/2

- **`apps/integrator/src/infra/db/repos/channelUsers.ts` НЕ пишет `platform_users`.** Полное чтение файла:
  `upsertUser` пишет только легаси-таблицы интегратора `users`/`identities`/`telegram_state`; `setUserPhone`
  пишет только `contacts` (собственный комментарий файла: «Canonical patient phone for webapp remains
  `public.platform_users`»). Все обращения к `platform_users` в файле — SELECT/JOIN.
- **`apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts` тоже НЕ пишет `platform_users`.** Сливает
  легаси bigint-схему интегратора (`users`, `identities`, `contacts`, `reminder_rules.integrator_user_id`,
  `content_access_grants`, `message_drafts`, `conversations`, `user_questions`, `telegram_state`,
  `projection_outbox`) — отдельный, более старый механизм слияния integrator-id, не имеющий отношения к
  UUID-слиянию `platform_users` из `pgPlatformUserMerge.ts`. Только SELECT `platform_users` ради
  `organization_id`.
- Не названный в плане, но реально пишущий: `apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts`
  (строки 445, 631) — INSERT синтетических строк `platform_users` (`id`, `id/email/email_verified_at`). Это
  CLI concurrency-check/deploy-gate харнесс, не рантайм-путь вебхука — вероятно, вне скоупа D15b/2, но
  технически выполняет raw INSERT и должен быть явно принят/отвергнут владельцем плана, а не тихо забыт.

**Итого: 3 реальных места записи + 4 диспетчера + 1 CLI-скрипт вне рантайма = 7–8 файлов, не 11.** Два из
четырёх явно названных в плане файлов (`channelUsers.ts`, `mergeIntegratorUsers.ts`) при живом чтении кода
записи `platform_users` не делают вообще — если D15b/2 стартует буквально по списку из `WORK_ORDER.md`,
часть работы будет нацелена на файлы, которые менять не нужно, а два реальных места записи в общем пакете
`packages/platform-merge` рискуют остаться не в фокусе, потому что план называет их другими именами.
Отдельно: цифра «20 файлов» из §2b («интегратор пишет `platform_users` в 20 файлах») — третье, отличное от
«11», число на ту же тему; ни одно из двух не подтверждено живым замером, реальных писателей — 3.

**Различия в столбцах между писателями:** объединение всех подтверждённых записей — 14 различных колонок:
`id` (только при INSERT), `integrator_user_id, phone_normalized, patient_phone_trust_at, display_name,
first_name, last_name, patronymic, email, email_normalized, email_verified_at, merged_into_id, merged_at,
updated_at`. Для всех трёх реальных писателей в вебаппе уже есть тот же или разделяемый код — то есть выбор
D15b/2 «перенести или снести» для всех трёх реальных мест склоняется к **снести вызов на стороне интегратора**
(логика уже живёт в вебаппе/общем пакете), а не портировать новую.

---

## 5. Путь первого вебхука — что происходит с новым человеком сегодня

Трассировка кода (Telegram-хендлер, MAX зеркалит тот же конвейер): `webhook.ts` → `mapBodyToIncoming` →
`eventGateway.handleIncomingEvent` → `incomingEventPipeline.run` → **`ensureResolvedActor`** (первая
бизнес-операция, до сценарного движка) → `actorResolutionPort.ensureActor` → `writePort.writeDb({type:'user.upsert'})`
→ `writeIdentityAndPreferencesDirect.ts`: `collectPlatformUserCandidates` (по `integrator_user_id`, по
`phone_normalized`, по `user_channel_bindings` — все три пустые для нового человека) → `insertPlatformUser`
(создание персоны, `phone_normalized=NULL`, `patient_phone_trust_at=NULL` — на этом вебхуке телефона ещё нет)
→ `upsertChannelBinding` (привязка канала, ПОСЛЕ создания персоны, в той же транзакции).

### 5.1 Вердикт по утверждению D15a

**Частично верно, и верная часть разбита на ДВА разных вебхука, а не на один:**

- «Интегратор создаёт человека» — **верно**, ровно на первом вебхуке, до привязки канала.
- «Привязывает канал» — **верно**, тот же вебхук, та же транзакция, сразу после создания персоны.
- «Решает слияние» — верно только в тривиальном смысле: механизм слияния действительно вызывается на первом
  вебхуке, но для реально нового человека кандидатов ноль — ничего не «решается», это прямая вставка.
  Реальное слияние (сравнение и объединение разных строк `platform_users`) происходит **позже**, на
  вебхуке с подтверждением телефона, где есть с чем сравнивать по номеру.
- «Ставит доверие к телефону» — **неверно для первого вебхука буквально.** У `ActorResolutionRequest`/
  `user.upsert` вообще нет поля телефона; `patient_phone_trust_at` пишется `NULL` при создании персоны.
  Доверие ставится безусловно (без OTP) — но только на **втором, отдельном** вебхуке (ответ на запрос
  «поделиться контактом»), через другой путь записи (`user.phone.link` → `applyMessengerPhonePublicBind`),
  который структурно зависит от того, что первый вебхук уже создал канальную привязку (иначе бросает
  `no_channel_binding`).

Итог: формулировка «на первом же вебхуке» из плана — конкретное расхождение; создание персоны и привязка
канала — да, на первом; решение о слиянии по существу и простановка доверия к телефону — нет, только начиная
со второго вебхука. Сама претензия по существу («доверие ставится без проверки, потому что канал уже
поручился за номер») — подтверждена кодом, только не в тот момент, что написано.

### 5.2 Что нашлось неожиданного (факт, без рекомендации)

- **Протухший комментарий-заглушка.** Заголовок `writeIdentityAndPreferencesDirect.ts:1-2` всё ещё гласит
  «D1 SCAFFOLD (NOT wired into the live write path yet)», хотя `apps/integrator/src/app/di.ts:269,272,282`
  реально подключает этот модуль в боевой DI-граф, вызываемый на каждом вебхуке; файл правился 01.08
  (`018043646`) без обновления заголовка. Любой, кто читает файл впервые, ошибочно решит, что это мёртвый код.
- Пункт 8 из «закрыто 03.08» (снос `setphone_` deep-link, `normalizePhoneFromSetphoneStartPayload`) —
  подтверждено кодом: функция отсутствует, `grep` по `setphone_` пуст.
- Доверие к телефону, once set, безусловно и не документируется по источнику — тот же `UPDATE`, что решает
  конфликт слияния, ставит `patient_phone_trust_at=now()` без отдельной колонки «источник доверия» — совпадает
  с претензией §1 схемы дословно.

---

## Что меняет форму D15b/2–6

1. **D15b/2 нужно перенацелить на реальный список писателей.** Не 11 файлов, а 3 реальных места записи
   (`writeIdentityAndPreferencesDirect.ts` в интеграторе + `pgPlatformUserMerge.ts` и
   `messengerPhonePublicBind.ts` в общем пакете `packages/platform-merge`) + до 4 диспетчеров. Файлы
   `channelUsers.ts` и `mergeIntegratorUsers.ts`, названные в плане, идентичность не пишут — включать их в
   scope не нужно, а `packages/platform-merge/*` (общий пакет, не «интегратор» и не «вебапп») нужно явно
   вписать в scope, потому что план его вообще не называет отдельной строкой.
2. **Живая проверка D15b/2 («первый вебхук нового пользователя») должна включать ВТОРОЙ вебхук.** Создание
   персоны видно на первом; решение о слиянии по существу и простановка доверия к телефону наблюдаемы только
   после того, как человек ответил на запрос контакта — если приёмка ограничится одним первым сообщением,
   она не увидит поведение, которое как раз и нужно доказать перед D15b/2.
3. **130 FK, не 46.** Классификация (§3.2) даёт готовый вход для дизайна cutover'а D15b/2–6: 31
   логин/аккаунт, 63 клинических, 36 прочих, 7 спорных случаев для явного решения владельца перед тем, как
   их к чему-то приписывать.
4. **Легаси-дублирующие колонки без FK** (`lfk_complexes.user_id`, `symptom_entries.user_id`,
   `symptom_trackings.user_id`, `user_channel_preferences.user_id` — text-копии уже существующей FK'нутой
   `platform_user_id`) — не были в плане вообще; естественный кандидат на снос в рамках того же переноса,
   а не отдельная работа.
5. **`SessionUser` (`shared/types/session.ts`) и `ClientIdentity`/`ClientListItem`/`PatientCardHeader`
   (`modules/doctor-clients/ports.ts`) — реальный архитектурный шов** для порта идентичности из §2b, а не
   перечисление каждого потребителя. D15b/3 стоит проектировать вокруг этих двух контрактов в первую очередь.

## Что оказалось рискованнее, чем предполагает план

- **RLS-разрыв шире одной таблицы без стены.** Раз RLS выключена, роль `app_patient` (пациентская сессия)
  структурно способна прочитать ЛЮБУЮ строку `platform_users`, включая пациентов чужой клиники — это не
  только «PII без строчной защиты», это ещё и обход тенантной границы на уровне SQL-грантов; единственная
  защита сегодня — фильтрация в коде приложения. Стоит явно поднять владельцу как более широкий риск, чем
  просто «одна таблица без RLS».
- **Интеграторский DB-логин уже сегодня — не «транспорт».** `bcb_test_integrator_login` состоит сразу в
  `app_staff`+`app_worker`+`app_patient` — целевая роль «интегратор только транспорт» (§2b) после D15b/2 не
  будет подкреплена грантами: код перестанет писать, но логин физически сохранит полный CRUD на
  `platform_users`, пока грант не сузят отдельно.
- **`patient_diary_day_snapshots`: 5 из 582 строк на TEST не матчатся ни на одну существующую
  `platform_users.id`** — живой дефект целостности данных, обнаруженный этим замером, не гипотетический;
  вне объёма D15b, но нуждается в отдельной заявке.
- **Число «46» не находится ни в одном исследовательском документе**, на который ссылается план (проверено
  прямым grep по `D15A_IDENTITY_RESEARCH.md` и `IDENTITY_DB_SPLIT_RESEARCH_2026-08-03.md`) — источник цифры
  не прослеживается; вместе с «20 файлов» из §2b и «11 файлов» из D15b/2 это уже третье внутренне
  противоречивое число по одной и той же теме в одном и том же плановом документе.
