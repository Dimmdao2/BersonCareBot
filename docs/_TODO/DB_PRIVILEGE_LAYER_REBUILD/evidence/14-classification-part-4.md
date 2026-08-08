# 14 — Классификация таблиц, часть 4 (срез slice-03, 59 таблиц)

Дата: **2026-08-08**. База: `bersoncarebot_test` (PG16, `:5432`). Режим: **READ-ONLY** — только
`SELECT` из каталога и из не-ПДн колонок (`system_settings.key`); ни одного `DDL/DML/GRANT/REVOKE`.
`bcb_webapp_prod` не открывалась.

**Норма владельца, против которой идёт разбор:** «Все таблицы с любыми данными клиник/докторов и
пациентов должны быть обязательно закрыты стенами и клиники и пациента, с правильным доступом глобал
админа. Как и системные таблицы платформы должны нести стену своей роли.»

## Метод (что именно выполнено)

1. **Каталог**, четыре запроса на весь срез:
   - колонки — `pg_attribute` + `format_type`;
   - RLS/ACL — `pg_class.relrowsecurity/relforcerowsecurity/relacl/relowner`;
   - политики — `pg_policies` (имя, permissive, cmd, roles, USING, WITH CHECK);
   - колоночные гранты — `pg_attribute.attacl` (**не** `information_schema.column_privileges`: та
     разворачивает и табличные гранты и врёт про «колоночный»).
2. **Роли и членства** — `pg_auth_members` с `inherit_option` (PG16), `pg_has_role(...,'MEMBER'/'USAGE')`.
3. **Принципал** — прочитаны определения `app.current_org_id()`, `app.current_patient_user_id()`,
   `app.is_staff()` (`pg_get_functiondef`). Живой обход `SET ROLE` **не выполнялся**: принципал ставится
   строкой в `app.principal_context`, это DML — запрещено брифом. Все выводы ниже — из предикатов и ACL.
4. **Код** — `node /home/dev/brain/tools/code-search.mjs "<table>" --repo bcb -k 8` по всем 59 таблицам
   (индекс 2026-08-08T17:45Z, 24615 чанков) + прямой поиск drizzle-символа таблицы по
   `apps/webapp/src`, `apps/integrator/src`, `packages/*/src`. Таблица→символ снята из
   `apps/webapp/db/schema/*` и `apps/integrator/src/infra/db/schema/*`.

## Итог среза одной таблицей

| Класс | Таблиц | OK | НАРУШЕНИЕ | ВОПРОС |
|---|---:|---:|---:|---:|
| `P` пациент | 24 | 16 | **8** | 0 |
| `C` клиника | 14 | 13 | **1** | 0 |
| `S` система платформы | 17 | 10 | **6** | 1 |
| `R` глобальный справочник | 2 | 1 | 0 | 1 |
| `T` техническое | 2 | 2 | 0 | 0 |
| **Итого** | **59** | **42** | **15** | **2** |

15 таблиц с вердиктом НАРУШЕНИЕ сводятся к **9 различным дефектам** (Н-1…Н-9 ниже) — часть дефектов
покрывает группу таблиц одной формы. Вопросов сформулировано **5** (В-1…В-5); два из них привязаны к
конкретной таблице (вердикт ВОПРОС), три — сквозные и не меняют вердикт отдельной строки.

## Три факта об устройстве ролей, без которых вердикты не читаются

| Факт | Проверка |
|---|---|
| `app.is_staff()` = `current_user='app_staff' OR pg_has_role(current_user,'app_staff','member')`. **`member`, не `usage`** → истинно даже при `INHERIT FALSE`, до всякого `SET ROLE`. | `pg_get_functiondef`; `pg_has_role('bcb_test_integrator_login','app_staff','MEMBER')=true`, `USAGE=false` |
| `is_staff()` истинно ровно для 5 ролей: `app_staff`, `bcb_test_staff_login`, `bcb_test_integrator_login`, `bcb_dev_runtime_staff_login`, `postgres`. | `SELECT rolname … WHERE pg_has_role(rolname,'app_staff','member')` |
| `app_staff` — **MEMBER** `app_platform_settings` и `app_clinic_billing` (`inherit_option=false`) → привилегий не наследует, но `SET ROLE` в глобальную роль ему разрешён. | `pg_has_role('app_staff','app_platform_settings','MEMBER')=true`, `'USAGE'=false`; `pg_auth_members.inherit_option=false` |

Роли/области берутся из `evidence/13-f2-census.md` §4: `app_staff`=ORG, `app_patient`=OWN,
`app_platform_settings`=GLOBAL, `app_clinic_billing`=ORG, `app_owner`=NONE (**`rolbypassrls=t`**, 0 членов —
шов SECURITY DEFINER), `saas_telemetry_operator`=GLOBAL.

---

## Класс P — данные пациента (24 таблицы)

| Таблица | Что внутри | Кто пользуется (R/W) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `reminder_rules` | правила напоминаний пациенту: `platform_user_id`, `category`, `schedule_type`, `days_mask`, `quiet_hours_start_minute`, `custom_text` | integrator W (`apps/integrator/src/infra/db/repos/reminders.ts`, колоночный `aw` у `bcb_test_integrator_login`), webapp doctor R (`src/app-layer/stats/loadAdminReminderStats.ts`), patient R/W, воркер web-push R через definer | без неё пациент перестаёт получать напоминания | клиника + пациент | RLS on/**forced**, 3 политики, `organization_id` есть; `saas_org_dormant_p0_8_3` = `is_staff() AND org=current_org` **OR** `platform_user_id=current_patient` | **OK** |
| `specialist_tasks` | задачи врача по пациенту: `owner_user_id`, `patient_user_id`, `title`, `due_at`, `remind_at`, `completed_at` | doctor R/W (`src/app/api/doctor/tasks/route.ts`, `.../clients/[userId]/tasks/route.ts`), тик напоминаний (`api/internal/specialist-task-reminders/tick`), `app_owner` — колоночный `r`+`w` на `reminder_sent_at` | пропадёт список задач врача и напоминания по ним | клиника + пациент | RLS on/forced, 4 политики, org есть; dormant-политика несёт обе ветки; грант только `app_staff=arwd` | **OK** |
| `support_conversations` | диалоги поддержки: `platform_user_id`, `source`, `channel_code`, `status`, `last_message_at`, `close_reason` | doctor R/W (`src/infra/repos/pgSupportCommunication.ts`), patient R, integrator R + колоночные `a/w` | без неё нет переписки врач↔пациент | клиника + пациент | RLS on/forced, 1 политика, org есть; обе ветки (`platform_user_id=current_patient`) | **OK** |
| `support_conversation_messages` | сообщения диалога: `text`, `sender_role`, `media_url`, `delivery_status`, `read_at` | doctor R/W, patient R + колоночный `w` на `read_at`, integrator W | тело переписки | клиника + пациент | RLS on/forced, 1 политика; ветка пациента через JOIN на `support_conversations.platform_user_id` | **OK** |
| `support_questions` | вопросы пациента из бота: `integrator_question_id`, `conversation_id`, `status`, `answered_at` | integrator W (`apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts`), doctor R/W, patient R | очередь «вопрос из мессенджера → врач» | клиника + пациент | RLS on/forced, 1 политика; ветка пациента через JOIN | **OK** |
| `support_question_messages` | реплики внутри вопроса: `sender_role`, `text` | те же | тело вопроса | клиника + пациент | RLS on/forced, 1 политика, JOIN-ветка пациента | **OK** |
| `support_delivery_events` | журнал доставки сообщений: `channel_code`, `status`, `attempt`, `reason`, `payload_json` | integrator W (`writeSupportQuestionsDirect.ts`, `writePort.ts`), doctor R | без него не видно, дошло ли сообщение | клиника + пациент | RLS on/forced, 1 политика, JOIN-ветка пациента; 6101 строка | **OK** |
| `symptom_trackings` | что пациент отслеживает: `symptom_key`, `symptom_title`, `diagnosis_text`, `region_ref_id`, `side`, `platform_user_id` | doctor R (`src/modules/doctor-clients/service.ts`, `DoctorClientRecordsTab.tsx`), patient R/W (`pgSymptomDiary.ts`) | дневник симптомов | клиника + пациент | RLS on/forced, 1 политика, обе ветки | **OK** |
| `symptom_entries` | замеры: `value_0_10`, `entry_type`, `recorded_at`, `notes`, `platform_user_id` | patient W, doctor R (`pgSymptomDiary.ts`, `pgWarmupFeelingCompletion.ts`) | динамика самочувствия | клиника + пациент | RLS on/forced, 1 политика, обе ветки | **OK** |
| `test_attempts` | попытки прохождения теста: `patient_user_id`, `started_at`, `submitted_at`, `accepted_by` | doctor R/W (`pgTreatmentProgramTestAttempts.ts`), patient — колоночный `a` на 3 колонки + `w` на `submitted_at` | пациент не сможет сдать тест | клиника + пациент | RLS on/forced, 1 политика, обе ветки | **OK** |
| `test_results` | результат попытки: `raw_value`, `normalized_decision`, `decided_by` | doctor R/W (`pgClinicalTests.ts`), patient R | оценка теста | клиника + пациент | RLS on/forced, 1 политика; ветка пациента через `test_attempts.patient_user_id` | **OK** |
| `treatment_program_instances` | назначенная пациенту программа: `patient_user_id`, `template_id`, `assigned_by`, `status`, `assignment_source` | doctor R/W (`pgTreatmentProgramInstance.ts`), patient R (`api/patient/courses/route.ts`) + `w` на `updated_at`, `app_owner` `rw` | ядро лечения — без неё нет программы | клиника + пациент | RLS on/forced, 1 политика, обе ветки | **OK** |
| `treatment_program_instance_stages` | этапы программы: `title`, `goals`, `objectives`, `status`, `skip_reason`, `started_at` | doctor R/W, patient R + колоночные `w` на `status`/`started_at`/`skip_reason` | шаги лечения | клиника + пациент | RLS on/forced, 1 политика; ветка пациента через JOIN на instances | **OK** |
| `treatment_program_instance_stage_groups` | группы внутри этапа: `title`, `schedule_text`, `system_kind` | doctor R/W (`pgTreatmentProgramInstance.ts`) | группировка заданий | клиника + пациент | RLS on/forced, 1 политика, JOIN-ветка пациента | **OK** |
| `treatment_program_instance_stage_items` | сами задания: `item_type`, `snapshot`, `settings`, `completed_at`, `last_viewed_at`, `status` | doctor R/W (10 репозиториев, вкл. `pgDoctorClients.ts`, `pgProgramItemDiscussion.ts`), patient R + `w` на `completed_at` | что пациент делает каждый день | клиника + пациент | RLS on/forced, 1 политика, JOIN-ветка пациента | **OK** |
| `treatment_program_events` | журнал изменений программы: `actor_id`, `event_type`, `target_type`, `payload`, `reason` | doctor W (`pgTreatmentProgramEvents.ts`), patient — колоночный `a` на 7 колонок | аудит «кто что менял в лечении» | клиника + пациент | RLS on/forced, 1 политика, JOIN-ветка пациента | **OK** |
| `user_contacts` | сводный индекс контактов: `platform_user_id`, `contact_kind`, `value_normalized`, `is_primary`, `confirmed_at`, `source_origin`; **444 строки телефонов/почт** | webapp `userContactsSql.ts`, `pgCanonicalPlatformUser.ts`, `pgDoctorClientCreate.ts`, `platformUserFullPurge.ts`, merge-пакет | вход по почте/телефону и поиск пациента | клиника + пациент | RLS on/forced, 9 политик, org-колонки **нет**; SELECT org-скоуплен, но **UPDATE/DELETE/INSERT у `app_staff` = `app.is_staff()` без org**; политики `*_identity_bootstrap_*` = `pg_has_role(current_user,'app_identity_bootstrap','member')` без единого фильтра | **НАРУШЕНИЕ** (Н-1, Н-2) |
| `user_identity` | ФИО и дата рождения: `first_name`, `last_name`, `patronymic`, `display_name`, `birth_date`; **237 строк** | 13 репозиториев webapp (`pgBookingEngine.ts`, `pgDoctorCanonicalAppointments.ts`, `pgOrganizationMembership.ts`, `userIdentityFioSql.ts`, …) | имя пациента во всех экранах | клиника + пациент | RLS on/forced, 9 политик, org-колонки нет; SELECT/UPDATE/DELETE у staff org-скоуплены, **INSERT = `app.is_staff()` без org**; `*_identity_bootstrap_*` — без фильтра | **НАРУШЕНИЕ** (Н-2, Н-3) |
| `user_phone_history` | история телефонов: `phone_normalized`, `valid_from`, `valid_to`, `source`, `confirming_channel`; 92 строки | `pgPhoneHistory.ts`, `pgDoctorClients.ts`, `pgChannelPreferences.ts`, `modules/auth/userByPhonePort.ts` | смена номера и поиск по старому номеру | клиника + пациент | RLS on/forced, 1 политика `saas_bootstrap_hybrid_p0_8_6` = **только org**; `app_patient` имеет табличный `r`, ветки «свой пациент» в предикате НЕТ | **НАРУШЕНИЕ** (Н-4: нет стены пациента) |
| `user_channel_bindings` | привязка мессенджера: `user_id`, `channel_code`, `external_id`, `bot_blocked_at`; 131 строка | integrator R/W (`platformUserByChannel.ts`, `userChannelBotBlocked.ts`), webapp `loadPlatformUserChannelBindings.ts`, `pgAnalyticsAudience.ts`, `modules/auth/channelLink.ts` | вход через Telegram/MAX и рассылки | клиника + пациент | **RLS off/off, 0 политик**, org-колонки нет; `app_staff=arwd`, **`app_patient=r`**, `bcb_test_nonstaff_login=r`, `app_owner=arw` | **НАРУШЕНИЕ** (Н-5) |
| `user_channel_preferences` | согласия по каналам: `channel_code`, `is_enabled_for_messages`, `is_enabled_for_notifications`, `is_preferred_for_auth`; 122 строки | `modules/patient-notifications/profileTopicChannelsModel.ts`, `reminderNotificationPeopleStats.ts`, integrator W | по какому каналу писать пациенту | клиника + пациент | **RLS off/off**, 1 политика `c4_web_push_reminder_user` — **инертна** (RLS выключен); `app_patient=r` + колоночные `aw`; `app_staff=arwd` | **НАРУШЕНИЕ** (Н-5) |
| `user_notification_topics` | подписки на темы: `user_id`, `topic_code`, `is_enabled`; 349 строк | `pgPatientNotificationTopics.ts`, `pgReminderWebappNotifyGate.ts`, integrator W (`writeIdentityAndPreferencesDirect.ts`) | пациент перестанет управлять уведомлениями | клиника + пациент | **RLS off/off, 0 политик**; `app_patient=arw`, `app_staff=arwd` | **НАРУШЕНИЕ** (Н-5) |
| `user_notification_topic_channels` | тема × канал: `topic_code`, `channel_code`, `is_enabled`; 290 строк | `pgTopicChannelPrefs.ts`, `modules/reminders/disableReminderMessengerTopic.ts`, `api/patient/web-push/unsubscribe` | тонкая настройка уведомлений | клиника + пациент | **RLS off/off**, 1 инертная политика; `app_patient=arw` | **НАРУШЕНИЕ** (Н-5) |
| `user_web_push_subscriptions` | push-подписки браузера: `endpoint`, `p256dh`, `auth`, `user_agent`; 34 строки | `pgWebPushSubscriptions.ts`, `app-layer/principal/sessionPrincipal.ts`, `adminWebPushHealthMetrics.ts`, воркер напоминаний R | без неё нет web-push | клиника + пациент | **RLS off/off**, 1 инертная политика; **`app_patient=arwd`** (в т.ч. DELETE), `app_staff=arwd`, `saas_system_health_owner=r` | **НАРУШЕНИЕ** (Н-5) |

---

## Класс C — данные клиники (14 таблиц)

| Таблица | Что внутри | Кто пользуется (R/W) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `saas_billing_accounts` | платёжный профиль клиники: `billing_email`, `legal_name`, `tax_identifier`, `billing_requisites` | `src/infra/repos/pgSaasBilling.ts` (R/W) | без неё клиника не выставит счёт | клиника + глобал-админ | RLS on/forced, 7 политик, org есть; `app_clinic_billing`/`app_staff` — org-скоуп, `app_platform_settings` — `USING=true` (GLOBAL) | **OK** (см. Н-9) |
| `saas_billing_invoices` | счета: `amount_minor`, `currency`, `status`, `provider_checkout_url`, `paid_at`, `tariff_snapshot` | `pgSaasBilling.ts`, `api/admin/saas-billing/payments/route.ts`, `PlatformPaymentsSection.tsx` | оплата подписки | клиника + глобал-админ | RLS on/forced, 8 политик, org есть; staff-capture org-скоуплен | **OK** (см. Н-9) |
| `saas_billing_subscriptions` | подписка клиники: `status`, `lifecycle_state`, `current_period_ends_at`, `grace_ends_at`, `autopay_consented_at`, `paid_additional_seats` | `pgSaasBilling.ts`, `pgOrgEntitlements.ts`, `transactionQuotaPort.ts` | доступ клиники к продукту | клиника + глобал-админ | RLS on/forced, 8 политик, org есть | **OK** (см. Н-9) |
| `saas_billing_provider_events` | вебхуки провайдера: `provider_event_id`, `event_type`, `raw_payload`, `processed_at` | `pgSaasBilling.ts` (W из вебхука) | идемпотентность оплаты | клиника + глобал-админ | RLS on/forced, 7 политик, org есть; staff-capture org-скоуплен | **OK** (см. Н-9) |
| `saas_billing_refunds` | возвраты: `amount_minor`, `status`, `provider_refund_ref`, `confirmed_at` | `pgSaasBilling.ts`, `api/payments/saas-webhook/[provider]/route.ts` | возврат денег клинике | клиника + глобал-админ | RLS on/forced, **3 политики — все `app_platform_settings` с `USING=true`**; ни `app_clinic_billing`, ни `app_staff` не имеют ни гранта, ни политики (в отличие от invoices/subscriptions); 0 строк | **НАРУШЕНИЕ** (Н-6) |
| `saas_org_entitlement_overrides` | ручные включения механик клинике: `mechanic`, `enabled`, `seat_limit_override`, `quota`, `expires_at` | `pgOrgEntitlements.ts`, `pgPlatformEntitlements.ts`, `transactionQuotaPort.ts` | точечная выдача функций клинике | клиника + глобал-админ | RLS on/forced, 5 политик, org есть; staff/clinic_billing — org-скоуп | **OK** (см. Н-9) |
| `saas_organization_trials` | триал клиники: `started_at`, `ends_at`, `post_trial_behavior`, `discount_ends_at`, `created_by` | `pgOrgEntitlements.ts`, `pgSaasBilling.ts` | бесплатный период | клиника + глобал-админ | RLS on/forced, 5 политик, org есть | **OK** (см. Н-9) |
| `tests` | каталог клинических тестов клиники: `title`, `test_type`, `scoring`, `assessment_kind`, `body_region_id`, `media` | doctor R/W (`app/app/doctor/clinical-tests/actions.ts`, `pgClinicalTests.ts`); пациент видит только снимок в задании | без него врач не назначит тест | клиника (пациентских строк нет) | RLS on/forced, 1 политика — только org-ветка; `app_patient` гранта нет | **OK** |
| `test_sets` | наборы тестов: `title`, `publication_status`, `is_archived`, `created_by` | doctor R/W (`pgTestSets.ts`, `doctor/test-sets/actions.ts`) | пакетное назначение тестов | клиника | RLS on/forced, 1 политика (org), без гранта пациенту | **OK** |
| `test_set_items` | состав набора: `test_set_id`, `test_id`, `sort_order`, `comment` | `pgTestSets.ts`, `api/doctor/test-sets/[id]/items/route.ts` | наполнение набора | клиника | RLS on/forced, 1 политика (org) | **OK** |
| `treatment_program_templates` | шаблоны программ лечения: `title`, `status`, `created_by` | doctor R/W (`pgTreatmentProgram.ts`, `pgCourses.ts`, `pgLfkTemplates.ts`) | без них нечего назначать пациенту | клиника | RLS on/forced, 1 политика (org) | **OK** |
| `treatment_program_template_stages` | этапы шаблона: `title`, `goals`, `objectives`, `expected_duration_days` | `pgTreatmentProgram.ts`, `pgClinicalTests.ts`, `pgRecommendations.ts` | структура шаблона | клиника | RLS on/forced, 1 политика (org) | **OK** |
| `treatment_program_template_stage_groups` | группы в этапе шаблона: `title`, `schedule_text`, `system_kind` | `pgTreatmentProgram.ts` | группировка в шаблоне | клиника | RLS on/forced, 1 политика (org) | **OK** |
| `treatment_program_template_stage_items` | задания шаблона: `item_type`, `item_ref_id`, `settings`, `comment` | `pgTreatmentProgram.ts`, `pgLfkTemplates.ts`, `pgTestSets.ts`, `pgClinicalTests.ts` | содержимое шаблона | клиника | RLS on/forced, 1 политика (org) | **OK** |

---

## Класс S — системные таблицы платформы (17 таблиц)

| Таблица | Что внутри | Кто пользуется (R/W) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `system_settings` | настройки платформы и клиники: `key`, `scope`, `value_json`, `updated_by`; **121 из 125 строк с `organization_id IS NULL`**, среди ключей `telegram_bot_token`, `smsc_api_key`, `google_client_secret`, `max_bot_api_key`, `rubitime_api_key`, `vk_id_client_secret`, `auth_altcha_hmac_secret`, `integrator_webhook_secret` (17 секретных ключей) | почти весь webapp (`pgSystemSettings.ts`, `api/admin/settings/route.ts`, десятки экранов) | без неё не работает ни один внешний канал | **стена роли платформы** | RLS on/forced, 2 политики; `saas_bootstrap_hybrid_p0_8_6` **TO public**: `USING (organization_id IS NULL OR org=current_org)` — ветка NULL **безусловна**; гранты `app_staff=arwd`, `app_platform_settings=arwd`, `app_owner=r`, `saas_system_health_owner=r` | **НАРУШЕНИЕ** (Н-7) |
| `system_settings_audit` | история изменений настроек: `key`, `old_value_json`, `new_value_json`, `changed_by`, `source`; 52 строки | `pgSystemSettings.ts:311` (raw INSERT), `modules/system-settings/auditRedaction.ts`; в схеме drizzle таблицы НЕТ — только сырой SQL | доказательство «кто менял секрет» | стена роли платформы | RLS on/forced, 2 политики; тот же безусловный `organization_id IS NULL`; `app_staff=arwd` (полный SELECT/UPDATE/DELETE журнала) | **НАРУШЕНИЕ** (Н-7) |
| `user_password_credentials` | хэши паролей: `password_hash`, `algo`, `failed_attempts`, `locked_until`, `verification_lease_token`; 26 строк | штатный путь — 12 SECURITY DEFINER аксессоров `app.password_login_*`, `app.password_credentials_*_self` (владелец `app_owner`); сырой SQL остался в `src/infra/repos/pgEmailSetupFlowPort.ts:63` и `pgEmailPasswordLookup.ts:88` | вход по паролю | стена роли (только definer-шов) | **RLS off/off, 0 политик**; `app_staff=arwd`, `app_owner=rw` | **НАРУШЕНИЕ** (Н-8) |
| `user_pins` | ПИН-коды: `pin_hash`, `attempts_failed`, `locked_until` | аксессоры `app.auth_user_pin_read/upsert/reset_attempts` + `_self` для `app_patient`; `platformUserFullPurge.ts` | быстрый вход по ПИН | стена роли (definer) | **RLS off/off, 0 политик**; `app_staff=arwd`, `app_owner=arw` | **НАРУШЕНИЕ** (Н-8) |
| `user_email_setup_tokens` | одноразовые токены установки пароля: `token_hash`, `email_normalized`, `expires_at`, `used_at`, `revoked_at`; 29 строк | аксессоры `app.auth_email_setup_read/insert/mark_used/revoke_active/delete`; `platformUserFullPurge.ts` | приглашение «задайте пароль» | стена роли (definer) | **RLS off/off, 0 политик**; `app_staff=arwd`, `app_owner=arwd` | **НАРУШЕНИЕ** (Н-8) |
| `user_oauth_bindings` | привязки соцвходов: `provider`, `provider_user_id`, `email`; 14 строк | аксессоры `app.auth_oauth_find_user/upsert_binding/list_user_providers`; `pgOAuthUserResolve.ts`, `modules/auth/oauthUserResolvePort.ts` | вход через Google/VK/Яндекс | стена роли (definer) | **RLS off/off, 0 политик**; `app_staff=arwd`, `app_owner=ar` | **НАРУШЕНИЕ** (Н-8) |
| `staff_security_profiles` | второй фактор персонала: `totp_secret_ciphertext`, `recovery_code_hashes`, `session_version`, `login_challenge_hash`, `locked_until` | `pgStaffSecurity.ts`, `app-layer/guards/requireRole.ts`, `api/account/security/totp/start` — через `app.set_staff_security_self_password_hash` и др. | 2FA сотрудников | стена роли (definer) | RLS off/off, но **гранты только владельцу** `bersoncarebot_test` — никакая рантайм-роль таблицу не видит; 0 строк | **OK** (шов definer замкнут) |
| `user_passkey_accounts` | `user_handle` для WebAuthn | `modules/auth/passkeyStore.ts`, `app-layer/auth/passkeyRuntime.ts` через `app.passkey_*` | вход по passkey | стена роли (definer) | RLS off/off; грант **только** `app_owner=ar`; 0 строк | **OK** |
| `user_passkey_challenges` | вызовы WebAuthn: `challenge`, `expected_origin`, `rp_id`, `expires_at`, `consumed_at` | там же | защита от повтора | стена роли (definer) | RLS off/off; только `app_owner=arwd`; 0 строк | **OK** |
| `user_passkey_credentials` | ключи: `credential_id`, `public_key`, `counter`, `transports`, `backed_up` | там же | сам вход по passkey | стена роли (definer) | RLS off/off; только `app_owner=arwd`; 0 строк | **OK** |
| `specialist_signup_intents` | заявка на создание клиники: `email_normalized`, `specialist_full_name`, `organization_title`, `organization_slug`, `provisioned_organization_id` | `src/infra/repos/pgOrganizationProvisioning.ts`; SQL-шов `deploy/postgres/specialist-signup-public-bootstrap-rls.sql` | самостоятельная регистрация специалиста | стена роли (definer) | RLS off/off, 0 политик; грант только `app_owner=rw`; 0 строк | **OK**, но см. В-3 |
| `saas_isolation_events` | события нарушения изоляции: `fingerprint`, `event_class`, `source_service`, `source_operation`, `lifecycle_status`, `occurrence_count`; 7 строк | `src/infra/repos/pgSaasIsolationDiagnostics.ts`, `src/infra/db/saasIsolationTelemetry.ts` — **только** через `app.report_saas_isolation_event` / `app.read_saas_isolation_events` | без неё платформа не видит собственные утечки | стена роли (владелец `saas_telemetry_owner`) | RLS off/off; ACL — **только владелец** `saas_telemetry_owner`; EXECUTE на definer-функции выдан `saas_telemetry_operator` (чтение) и `app_staff`/`app_patient`/`app_worker` (только запись события) | **OK** |
| `saas_isolation_event_hourly` | почасовая агрегация: `event_id`, `bucket_start`, `occurrence_count`; 39 строк | `app.read_saas_isolation_trend` | тренд изоляции на экране здоровья | стена роли | RLS off/off; ACL только `saas_telemetry_owner` | **OK** |
| `saas_isolation_coverage_runs` | прогоны покрытия: `status`, `services_checked`, `checks_count`, `unexpected_errors_count`; 14 строк | `app.record_saas_isolation_coverage` / `app.read_last_saas_isolation_coverage`, `modules/operator-health/saasIsolationPostRuntimeGate.ts` | гейт деплоя TEST | стена роли | RLS off/off; ACL только `saas_telemetry_owner` | **OK** |
| `saas_trial_policy` | глобальная политика триала: `duration_days`, `start_event`, `post_trial_behavior`, `discount_window_days` | `pgPlatformEntitlements.ts`, `pgSaasBilling.ts` | правило «сколько длится триал» | стена роли платформы | RLS on/forced, 1 политика `TO app_platform_settings`; гранты `app_platform_settings=arw`, `app_owner=r`; 0 строк | **OK** |
| `saas_registration_tariff_policy` | тариф по умолчанию при регистрации: `key`, `tariff_id`, `updated_by` | `pgPlatformEntitlements.ts` | на каком тарифе стартует новая клиника | стена роли платформы | RLS on/forced, 1 политика `TO app_platform_settings`; грант только ей; 0 строк | **OK** |
| `saas_paid_period_policy` | поведение после окончания оплаченного периода: `post_paid_period_behavior`, `post_paid_period_tariff_id`, `is_active` | `pgOrgEntitlements.ts`, `pgPlatformEntitlements.ts` | что происходит с клиникой после неоплаты | стена роли платформы | **RLS off/off, 0 политик** (в отличие от двух сестринских политик выше); гранты `app_platform_settings=arw`, `app_owner=r`; 0 строк. FACTS §1.1: **720 строк `permission denied` от `bcb_test_staff_login` именно по этой таблице** | **ВОПРОС** (В-1) |

---

## Класс R — глобальный справочник (2 таблицы)

| Таблица | Что внутри | Кто пользуется (R/W) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `saas_tariffs` | тарифы платформы: `name`, `price_minor`, `mechanics`, `quotas`, `included_seats`, `system_access_policy`, `downgrade_policies`, `mailing_templates` | `pgPlatformEntitlements.ts` (W), `pgOrgEntitlements.ts`/`pgSaasBilling.ts` (R), экран `api/admin/commercial/tariff-policy-history` | без него клиника не понимает, что ей доступно | справочник читаем всем принципалам, писать — только платформе | RLS on/forced, 4 политики: `_platform_operations` (ALL, GLOBAL), `_staff_read` (`USING app.is_staff()`), `_clinic_billing_read`, `_current_patient_capability_read` (только тариф своей орг через `org_enrollments`); 0 строк | **OK** |
| `saas_billing_periods` | справочник периодов оплаты: `code`, `label`, `months`, `is_selectable`, `sort_order` | `billingPeriodCatalog.ts`, `paidPeriod.ts`, `pgSaasBilling.ts`, `pgPlatformEntitlements.ts` | выбор «месяц/год» при оплате | справочник; запись — платформа | **RLS off/off, 0 политик**; грант только `app_platform_settings=arw` — остальным закрыт грантом; 0 строк | **ВОПРОС** (В-2) |

---

## Класс T — техническое (2 таблицы)

| Таблица | Что внутри | Кто пользуется (R/W) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `schema_migrations` | журнал миграций integrator: `filename`, `applied_at`; 73 строки | `apps/integrator/src/infra/db/migrate.ts` (мигратор под ролью-владельцем) | без него мигратор перезальёт схему | закрыто по умолчанию | RLS off/off, 0 политик, **ACL пустой** (только владелец `bersoncarebot_test`) | **OK** |
| `webapp_schema_migrations` | журнал миграций webapp: `filename`, `applied_at`; 89 строк | `apps/webapp/scripts/run-migrations.mjs` | то же для webapp | закрыто по умолчанию | RLS off/off, 0 политик, ACL пустой | **OK** |

---

# НАРУШЕНИЯ

## Н-1. `user_contacts` — стена клиники есть на чтение и отсутствует на запись

`user_contacts_staff_update` и `user_contacts_staff_delete` (`TO app_staff`) имеют предикат ровно
`app.is_staff()` — без `organization_id`, без `org_enrollments`, без чего бы то ни было. `user_contacts_staff_insert`
— `WITH CHECK (app.is_staff())`. Соседняя `user_contacts_staff_org_select` при этом полностью org-скоуплена
(`EXISTS org_enrollments … OR EXISTS be_organization_members`). Исходник — не догадка:
`apps/webapp/db/drizzle-migrations/0379_user_contacts_d15b6_local.sql:155-172`.

Политики PERMISSIVE → объединяются по OR. Следствие: **сотрудник любой клиники может изменить или
удалить телефон/почту любого из 444 контактов, включая пациентов и владельцев чужих клиник.** Так как
таблица — точка входа по почте (`app.find_platform_user_ids_by_any_confirmed_email`, там же строка 178),
подмена `value_normalized` = перенаправление входа на чужой аккаунт.

Чего не хватает: `USING`/`WITH CHECK` того же org-предиката, что уже написан в `_staff_org_select`.

## Н-2. `user_contacts` и `user_identity` — capability-роль `app_identity_bootstrap` читает всё без единого фильтра

Четыре политики на `user_contacts` и три на `user_identity` имеют предикат
`pg_has_role(CURRENT_USER, 'app_identity_bootstrap', 'member')` — то есть **проверяют только, кто ты, и
ничего про строку**. Гранты: `user_contacts` → `app_identity_bootstrap=arwd`, `user_identity` →
`app_identity_bootstrap=arw`. Членами являются `bcb_test_nonstaff_login`, `bcb_test_integrator_login`,
`bcb_dev_runtime_nonstaff_login`, `bcb_webapp_dev_user` (`pg_auth_members`).

Следствие: после `SET ROLE app_identity_bootstrap` пациентский (nonstaff) логин и логин интегратора
получают **сплошное чтение и запись всех 444 контактов и всех 237 ФИО/дат рождения по всем клиникам** —
ни стены клиники, ни стены пациента. `evidence/13-f2-census.md` §4 присвоил этой роли область `OWN` со
знаком `?ВОПРОС`; по факту область **GLOBAL**.

## Н-3. `user_identity` — INSERT без стены клиники

`user_identity_staff_insert`: `WITH CHECK (app.is_staff())`. DELETE/UPDATE/SELECT у той же роли
org-скоуплены, INSERT — нет. Сотрудник любой клиники может завести строку идентичности на произвольный
`platform_user_id`.

## Н-4. `user_phone_history` — нет стены пациента

Единственная политика `saas_bootstrap_hybrid_p0_8_6`:
`(org = app.current_org_id()) OR (organization_id IS NULL AND current_org_id() IS NULL AND
current_patient_user_id() IS NULL AND current_integrator_user_id() IS NULL AND NOT app.is_staff())`.
Ветки «свой пациент» нет вообще, а грант `app_patient=r` есть. Пациент с принципалом своей организации
видит историю телефонов **всех 92 записей этой организации**, а не свою. Норма владельца для пациента —
только свои данные (FACTS §1.5, `evidence/13-f2-census.md` §4: `app_patient` = OWN).

Отдельно: `bcb_test_nonstaff_login=arw` — табличный грант выдан **логин-роли напрямую**, минуя
рантайм-роль; это же ломает модель «грант живёт на рантайм-роли».

## Н-5. Пять таблиц пациентских уведомлений и каналов — RLS выключен, стен нет ни одной

| Таблица | Строк | RLS | Политики | Опасный грант |
|---|---:|---|---|---|
| `user_channel_bindings` | 131 | **off/off** | 0 | `app_patient=r`, `app_staff=arwd`, `bcb_test_nonstaff_login=r` |
| `user_channel_preferences` | 122 | **off/off** | 1 — **инертна** | `app_patient=r` + колоночные `aw`, `app_staff=arwd` |
| `user_notification_topics` | 349 | **off/off** | 0 | `app_patient=arw`, `app_staff=arwd` |
| `user_notification_topic_channels` | 290 | **off/off** | 1 — **инертна** | `app_patient=arw`, `app_staff=arwd` |
| `user_web_push_subscriptions` | 34 | **off/off** | 1 — **инертна** | `app_patient=arwd` (**в т.ч. DELETE**), `app_staff=arwd` |

Ни у одной нет `organization_id`. «Инертна» означает: политика `c4_web_push_reminder_user` в каталоге
есть, но `relrowsecurity=false` → PostgreSQL её не применяет. Это опаснее отсутствия политики: перепись
по `pol=N` показывает «стена есть», а её нет.

Следствие: любой пациент читает `external_id` мессенджеров всех 131 привязки платформы (в
`user_channel_bindings` это прямой идентификатор человека в Telegram/MAX), правит чужие подписки на
уведомления и **удаляет чужие push-подписки**. Сотрудник любой клиники — то же по всем клиникам.

## Н-6. `saas_billing_refunds` — у клиники нет своей стены, потому что у клиники нет доступа вовсе

Три политики, все `TO app_platform_settings`, `USING/WITH CHECK = true`. Ни `app_clinic_billing`, ни
`app_staff` не имеют ни политики, ни гранта — в отличие от `saas_billing_invoices` и
`saas_billing_subscriptions`, где ровно для этих ролей есть `*_clinic_billing_*` и `*_staff_capture_*`
с org-предикатом. Единственный доступ к возвратам — глобальная роль без org-фильтра, то есть
«стена клиники» на возвратах не существует как объект. Таблица пуста (0 строк), но
`api/payments/saas-webhook/[provider]/route.ts` в неё пишет.

## Н-7. `system_settings` и `system_settings_audit` — секреты платформы открыты любой клинике

Политика `saas_bootstrap_hybrid_p0_8_6`, `FOR ALL TO public`:
`USING (organization_id IS NULL OR (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()))`.
Первая ветка **не проверяет ничего** — ни роль, ни принципал.

Замер по живой базе (только колонка `key`, значения не читались):
```
system_settings org_null = 121 ;  org_set = 4 ;  exact_total = 125
(в slice-03 стоит rows=123 — это оценка reltuples, не точный счёт)
ключи с organization_id IS NULL и секретным именем:
apple_oauth_private_key, auth_altcha_hmac_secret, google_client_secret, google_refresh_token,
integrator_webapp_entry_secret, integrator_webhook_secret, max_api_key, max_bot_api_key,
max_webhook_secret, rubitime_api_key, rubitime_webhook_token, smsc_api_key, telegram_bot_token,
vk_id_client_secret, yandex_oauth_client_secret, apple_oauth_key_id, auth_passkey_enabled
```
Грант `app_staff=arwd`. Значит **сотрудник любой клиники-арендатора читает, изменяет и удаляет токен
Telegram-бота платформы, ключ SMSC, OAuth-секреты и вебхук-секреты** — и то же самое в журнале
`system_settings_audit`, где эти значения лежат в `old_value_json`/`new_value_json`
(`src/app/api/admin/settings/route.ts:230` прямо фиксирует, что независимый аудит 28.07 нашёл там
`vk_id_client_secret` в открытом виде).

Норма владельца — «системные таблицы платформы должны нести стену своей роли». Стены роли нет:
глобальные строки открыты арендной роли.

## Н-8. Четыре таблицы аутентификации — сырой грант `app_staff` в обход definer-шва

| Таблица | Строк | RLS | Грант | Штатный путь |
|---|---:|---|---|---|
| `user_password_credentials` | 26 | off/off | `app_staff=arwd` | 12 SECURITY DEFINER `app.password_login_*`, `app.password_credentials_*_self` (владелец `app_owner`) |
| `user_pins` | 2 | off/off | `app_staff=arwd` | `app.auth_user_pin_read/upsert/reset_attempts` + `_self` |
| `user_email_setup_tokens` | 29 | off/off | `app_staff=arwd` | `app.auth_email_setup_read/insert/mark_used/revoke_active/delete` |
| `user_oauth_bindings` | 14 | off/off | `app_staff=arwd` | `app.auth_oauth_find_user/upsert_binding/list_user_providers` |

Сравнение с соседями делает вывод однозначным: `staff_security_profiles` и все три `user_passkey_*`
лежат в том же шве и **не имеют ни одного гранта рантайм-ролям** — только владелец/`app_owner`. То есть
правильная форма в базе уже есть, а на этих четырёх остался прямой доступ.

Следствие: сотрудник любой клиники читает и перезаписывает хэши паролей, ПИН-коды, хэши токенов
установки пароля и привязки соцвходов **всех пользователей платформы, включая владельцев чужих клиник** —
это полный захват учётной записи, а не утечка чтения. Сырой SQL по этому пути в продукте ещё есть:
`src/infra/repos/pgEmailSetupFlowPort.ts:63` (`INSERT INTO user_password_credentials …`) и
`src/infra/repos/pgEmailPasswordLookup.ts:88`.

## Н-9. `app_staff` может встать глобальной ролью — стена клиники на всём биллинге обходится одним `SET ROLE`

```
pg_has_role('app_staff','app_platform_settings','MEMBER') = true
pg_has_role('app_staff','app_platform_settings','USAGE')  = false
pg_auth_members: app_platform_settings <- app_staff, inherit_option = false
```
Наследования привилегий нет (поэтому обычный запрос арендной роли честно org-фильтруется), но
**`SET ROLE app_platform_settings` арендной роли разрешён**. После него действуют политики
`*_platform_select/insert/update` с `USING/WITH CHECK = true`, а гранты `app_platform_settings=arw`
покрывают: `saas_billing_accounts`, `saas_billing_invoices`, `saas_billing_subscriptions`,
`saas_billing_provider_events`, `saas_billing_refunds`, `saas_org_entitlement_overrides`,
`saas_organization_trials`, `saas_tariffs`, `saas_trial_policy`, `saas_registration_tariff_policy`,
`saas_paid_period_policy`, `saas_billing_periods`, `system_settings`, `system_settings_audit`.

То же самое с `app_clinic_billing` (`MEMBER=true`, `USAGE=false`).

Это не «утечка данных» в смысле FACTS §1.2 (там мерили саму глобальную роль), а **отсутствие границы
между областями ORG и GLOBAL**: роль области ORG умеет по собственной воле стать ролью области GLOBAL.
Пока такой переход возможен, любая org-политика на перечисленных таблицах — рекомендация, а не стена.

---

# ВОПРОСЫ

## В-1. `saas_paid_period_policy` — стена роли платформы или грант арендной роли?

Таблица одного класса с `saas_trial_policy` и `saas_registration_tariff_policy`, но **без RLS**
(`relrowsecurity=false`, 0 политик), тогда как у обеих сестёр RLS+FORCE и политика
`TO app_platform_settings`. Одновременно FACTS §1.1 фиксирует **720 строк `permission denied` от
`bcb_test_staff_login` именно по `saas_paid_period_policy`** — то есть staff-код (`pgOrgEntitlements.ts`)
её читает, а гранта не имеет.

Вопрос: `saas_paid_period_policy` — глобальная политика платформы, которую арендная роль обязана уметь
ЧИТАТЬ (тогда нужен `GRANT SELECT TO app_staff` + RLS+FORCE + read-политика, как у `saas_tariffs`),
или её чтение из staff-пути — ошибка кода, и правильный ответ — убрать чтение? Сейчас поведение
«ни то ни сё»: код ходит, база отказывает 720 раз, ошибка глотается.

## В-2. `saas_billing_periods` — считать ли грант достаточной стеной для справочника

`relrowsecurity=false`, 0 политик, единственный грант `app_platform_settings=arw`. Формально доступ
закрыт («всё остальное закрыто по умолчанию» выполнено грантом), но механизм отличается от
`saas_tariffs` — справочника ровно того же назначения, у которого RLS+FORCE и четыре read-политики
(включая `_staff_read` и `_current_patient_capability_read`).

Вопрос: справочник, который клиника обязана видеть при выборе периода оплаты, должен получить
read-политику по образцу `saas_tariffs` — или экран оплаты обязан читать его только через платформенную
роль? Ответ определяет, появляется ли здесь дефект «тихого нуля», когда клиника выберет период.

## В-3. `specialist_signup_intents` — шов definer без RLS: закрепить или закрыть RLS-ом

Таблица содержит ПДн регистрирующегося специалиста (`email_normalized`, `specialist_full_name`) и ссылки
на созданную организацию. Сейчас закрыта корректно — грант только `app_owner=rw`, доступ через
`deploy/postgres/specialist-signup-public-bootstrap-rls.sql`. Но `relrowsecurity=false`: любой будущий
`GRANT` этой таблице мгновенно откроет её целиком, без предикатов. Соседние таблицы того же шва
(`user_passkey_*`, `staff_security_profiles`) находятся в точно таком же состоянии.

Вопрос лиду: считаем ли «шов definer + нулевой грант» самостоятельным классом стены (тогда это надо
записать в декларацию как явный `scope=NONE, mechanism=definer`), или каждая такая таблица обязана
дополнительно нести RLS+FORCE как backstop (memory «force rls backstops definer seam»)? От ответа
зависит вердикт по 5 таблицам среза, сейчас помеченным OK.

## В-4. Путь глобального админа к клиническим данным отсутствует

Норма владельца требует «правильный доступ глобал админа». По ACL всего среза: `app_platform_settings`
(единственная роль области GLOBAL) имеет гранты **только** на `saas_*` и `system_settings*`. На всём
клиническом и пациентском блоке — `treatment_program_*` (9 таблиц), `support_*` (5), `tests`/`test_sets`/
`test_set_items`/`test_attempts`/`test_results`, `symptom_*`, `specialist_tasks`, `reminder_rules` — у
глобальной роли **нет ни одного гранта и ни одной политики**.

Вопрос: это осознанное решение (глобальный админ принципиально не видит медицинских данных — тогда так
и записать в декларацию, и норму владельца читать как «глобал-админ по коммерции, не по медицине»), или
пробел? Сейчас платформа не может ни продиагностировать, ни восстановить программу лечения клиники
иначе как под ролью-владельцем базы.

## В-5. `app.is_staff()` истинно для логина интегратора

`app.is_staff()` проверяет `pg_has_role(current_user,'app_staff','member')`, а `member` игнорирует
`INHERIT FALSE`. Проверено: `pg_has_role('bcb_test_integrator_login','app_staff','MEMBER')=true` при
`USAGE=false`. Значит соединение интегратора, обслуживающее пациентские каналы, для RLS является
персоналом **до всякого `SET ROLE`** — а у него есть табличный `SELECT` на `support_conversations` и
`support_questions` и колоночные `INSERT/UPDATE` на `reminder_rules`, `support_*`,
`user_channel_bindings`, `user_notification_topics`, `user_channel_preferences`.

Вопрос: `is_staff()` должна проверять `'usage'` вместо `'member'` (тогда членство без наследования
перестанет считаться персоналом), или логин интегратора обязан быть исключён из членов `app_staff`?
Сейчас «персонал» определяется списком членств, а не тем, под какой ролью реально идёт запрос.

---

## Приложение — воспроизводимость

Все каталожные значения получены одним из четырёх запросов (подставить список таблиц среза):
```sql
-- RLS + ACL
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner), c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (…);
-- политики
SELECT tablename, policyname, permissive, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN (…);
-- ТОЛЬКО колоночные гранты (information_schema.column_privileges разворачивает и табличные — не использовать)
SELECT c.relname, a.attname, a.attacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE n.nspname='public' AND a.attacl IS NOT NULL AND c.relname IN (…);
-- членства с флагом наследования (PG16)
SELECT r.rolname, m.rolname, am.inherit_option, am.admin_option FROM pg_auth_members am
JOIN pg_roles r ON r.oid=am.roleid JOIN pg_roles m ON m.oid=am.member;
```
Комментариев `COMMENT ON TABLE` ни у одной из 59 таблиц нет (`obj_description` = NULL везде) — назначение
таблиц выведено из имён колонок и кода-потребителя, не из документации схемы.
