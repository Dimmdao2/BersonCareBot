# 14 — Классификация таблиц, срез 1 из 4 (61 таблица), 2026-08-08

**Срез:** `app.*` (3), `drizzle.*` (1), `integrator.*` (20), `public.*` от `admin_audit_log` до
`be_schedule_blocks` (37) — файл среза `scratchpad/slice-00`, 61 строка.

**Норма, против которой классифицирую (слова владельца):**
> «Все таблицы с любыми данными клиник/докторов и пациентов должны быть обязательно закрыты стенами и
> клиники и пациента, с правильным доступом глобал админа. Как и системные таблицы платформы должны нести
> стену своей роли.»

Читается как три требования: (а) данные клиник/врачей/пациентов — стена клиники **И** стена пациента +
объявленный путь глобал-админа; (б) системные таблицы платформы — стена своей роли; (в) остальное закрыто
по умолчанию.

**Метод (всё воспроизводимо, READ-ONLY, ни одного DDL/DML):**

1. Колонки — `pg_attribute` по 61 таблице:
   `sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT … FROM pg_class c JOIN pg_attribute a …"`.
   **Содержимое строк пациентских таблиц не читалось** — класс данных выведен из имён колонок и из кода,
   который в них пишет.
2. Гранты — `pg_class.relacl`; политики — `pg_policy` (`polname/polcmd/polroles/polqual/polwithcheck`).
3. RLS/FORCE/`organization_id`/число политик — из среза (перепись Ф2, `evidence/13-f2-census.md`),
   сверено с каталогом на той же базе.
4. «Кто пользуется» — `node /home/dev/brain/tools/code-search.mjs … --repo bcb`, далее точный `rg` по имени
   таблицы **и** по имени drizzle-экспорта (`pgTable('be_rooms')` → `beRooms`), потому что половина кода
   ходит через camelCase-символ, а не через строку с именем таблицы. Приведены `файл:строка`.
5. Роли и их области (ORG/OWN/GLOBAL/NONE) — `FACTS.md §1.5` и `13-f2-census.md §4`.

**Ключ ролей в колонке «Сейчас»:** `app_staff` — терминал персонала (область ORG), `app_patient` — терминал
пациента (область OWN), `app_platform_settings` — платформенная роль (GLOBAL), `app_owner` — NOLOGIN-владелец
definer-шва (BYPASSRLS), `bersoncarebot_test` — мигратор/`datdba`. `app.is_staff()` (не definer,
`current_user = 'app_staff' OR pg_has_role(...)`), `app.current_org_id()`/`app.current_patient_user_id()` —
STABLE SECURITY DEFINER, читают `app.principal_context` по `pg_backend_pid()`.

**R (глобальный справочник) в этом срезе — ноль таблиц.** Секция приведена пустой намеренно, а не пропущена.

---

## P — данные пациента (19 таблиц `public` + 14 `integrator`)

| Таблица | Что внутри | Кто пользуется (файл:строка) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `public.be_appointments` | записи на приём: `organization_id`, `branch_id`, `specialist_id`, `service_id`, `platform_user_id`, `start_at/end_at`, `status`, `phone_normalized` | webapp доктор+пациент, R/W: `pgBookingEngine.ts`, `pgBookingCalendar.ts`, `pgBookingAppointmentLifecycle.ts`, `pgPatientClinical.ts`, `pgClientHistory.ts`, `pgPayments.ts` | нет записи на приём — нет ни расписания врача, ни визита пациента | клиника + пациент + путь глобал-админа | RLS on/FORCE, `org=true`, 1 политика `saas_org_dormant_p0_8_3`: `is_staff() AND organization_id=current_org_id()` **OR** `platform_user_id=current_patient_user_id()`; ACL: staff `arwd`, patient `r`, `app_owner r` | OK |
| `public.be_appointment_events` | системные события записи: `appointment_id`, `event_type`, `actor_id`, `payload` | webapp, W: `pgBookingAppointmentLifecycle.ts`, `pgBookingEngine.ts` | пропадает машинная история изменения брони | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org-ветка + пациентская через `EXISTS(be_appointments … platform_user_id=current_patient_user_id())` | OK |
| `public.be_appointment_history_events` | человекочитаемая история записи: `event_type`, `actor_id`, `payload`, `occurred_at` | webapp, W: `pgBookingAppointmentLifecycle.ts`, `pgBookingEngine.ts` | врач перестаёт видеть «кто и когда менял запись» | клиника + пациент | то же (org + EXISTS по `be_appointments`) | OK |
| `public.be_appointment_cancellations` | отмены визитов: `cancellation_type`, `was_penalized`, `prepayment_refunded`, `staff_comment`, `applied_policy_snapshot` | webapp, R/W: `pgBookingAppointmentLifecycle.ts`, `pgClientHistory.ts`, `pgDoctorCanonicalAppointments.ts` | ломается политика отмен и возвратов предоплаты | клиника + пациент | RLS on/FORCE, 1 пол. (org + EXISTS по `be_appointments`); ACL patient `ar` | OK |
| `public.be_appointment_no_shows` | неявки: `actor_type`, `reason`, `staff_comment`, `notifications_sent` | webapp, W: `pgBookingAppointmentLifecycle.ts` | не считается счётчик неявок пациента | клиника + пациент | RLS on/FORCE, 1 пол. (org + EXISTS); ACL patient `r`; 0 строк | OK |
| `public.be_appointment_reschedules` | переносы: `from_*`/`to_*`, `was_in_free_reschedule_window`, `applied_policy_snapshot` | webapp, R/W: `pgBookingAppointmentLifecycle.ts`, `pgDoctorClients.ts`, `pgClientHistory.ts`, `pgDoctorCanonicalAppointments.ts` | ломается бесплатный/платный перенос и лимит переносов | клиника + пациент | RLS on/FORCE, 1 пол. (org + EXISTS) | OK |
| `public.be_appointment_staff_comments` | **внутренние комментарии персонала о пациенте**: `platform_user_id`, `author_id`, `body` | webapp доктор, R/W: `pgClientHistory.ts`; читает интегратор для описания в календаре: `calendarDescription.ts` | врач теряет заметки по визиту | клиника + пациент | RLS on/FORCE, 1 пол.: org-ветка **OR** `platform_user_id=current_patient_user_id()`; ACL patient `r` | **ВОПРОС** (см. В-2: пациент по этой политике читает внутренние комментарии персонала о себе) |
| `public.be_booking_form_submissions` | ответы пациента в форме записи: `appointment_id`, `field_id`, `value_text` | webapp, R/W: `pgBookingForm.ts`, `pgBookingCalendar.ts` | теряются данные, введённые пациентом при записи | клиника + пациент | RLS on/FORCE, 1 пол. (org + EXISTS по `be_appointments`); ACL patient `ar` | OK |
| `public.be_patient_booking_profiles` | профиль пациента у клиники: `is_problematic`, `booking_blocked`, `problematic_note`, `no_show_count` | webapp доктор, R/W: `pgClientHistory.ts`, `pgBookingAppointmentLifecycle.ts`, `pgDoctorClients.ts` | нельзя заблокировать самозапись проблемному пациенту | клиника + пациент | RLS on/FORCE, 1 пол.: org **OR** `platform_user_id=current_patient_user_id()`; ACL patient `r` | **ВОПРОС** (В-3: пациент читает собственную пометку «проблемный» и текст заметки) |
| `public.be_patient_timeline_events` | лента событий пациента: `domain`, `event_type`, `linked_object_*`, `payload` | webapp, W: `pgBookingAppointmentLifecycle.ts`, `pgBookingEngine.ts`; R: `pgClientHistory.ts` | пропадает единая хронология по клиенту | клиника + пациент | RLS on/FORCE, 1 пол.: org **OR** `platform_user_id=…`; ACL patient `ar` | OK |
| `public.be_patient_packages` | купленные пациентом абонементы: `platform_user_id`, `status`, `price_minor`, `valid_from/until`, `paid_amount_minor` | webapp, R/W: `pgMemberships.ts`, `pgDoctorClients.ts`, `pgClientHistory.ts`, `pgBookingCalendar.ts`; интегратор R: `resolvePackageCalendarContext.ts` | абонементы перестают списываться и показываться | клиника + пациент | RLS on/FORCE, 1 пол.: org **OR** `platform_user_id=…`; ACL patient `r`; 0 строк | OK |
| `public.be_patient_package_items` | состав купленного абонемента: `patient_package_id`, `service_id`, `quantity_initial` | webapp, R/W: `pgMemberships.ts`, `pgClientHistory.ts` | не известно, сколько сеансов какой услуги куплено | клиника (через родителя) + пациент | RLS on/FORCE, `org=false` — стена через родителя: `EXISTS(be_patient_packages … organization_id=current_org_id())` **AND** `EXISTS(be_clinic_services … org)` **OR** пациентская ветка по родителю | OK (колонки `organization_id` нет намеренно — стена родительская) |
| `public.be_package_usages` | списания сеансов абонемента: `patient_package_id`, `appointment_id`, `usage_kind`, `quantity` | webapp, R/W: `pgMemberships.ts`, `pgClientHistory.ts`, `pgBookingCalendar.ts`, `pgDoctorCanonicalAppointments.ts` | сеансы не списываются с абонемента | клиника + пациент | RLS on/FORCE, 1 пол.: org **OR** `EXISTS(be_patient_packages … platform_user_id=…)`; 0 строк | OK |
| `public.be_package_history_events` | история абонемента пациента: `patient_package_id`, `event_type`, `payload_json` | webapp, R/W: `pgMemberships.ts`, `pgClientHistory.ts` | не видно, кто продлил/заморозил абонемент | клиника + пациент | RLS on/FORCE, 1 пол. (org + EXISTS по `be_patient_packages`); 0 строк | OK |
| `public.be_payments` | платежи пациента: `platform_user_id`, `amount_minor`, `status`, `purpose`, `captured_at` | webapp, R/W: `pgPayments.ts` | нет учёта оплат визитов | клиника + пациент | RLS on/FORCE, 1 пол.: org **OR** `platform_user_id=…`; 0 строк | OK |
| `public.be_payment_intents` | намерения оплаты: `provider_id`, `amount_minor`, `status`, `checkout_url`, `idempotency_key` | webapp, R/W: `pgPayments.ts`, `pgBookingCalendar.ts` | не создаётся ссылка на оплату/предоплату | клиника + пациент | RLS on/FORCE, 1 пол.: org **OR** `platform_user_id=…`; 0 строк | OK |
| `public.be_payment_history_events` | история платежей пациента: `payment_id`, `refund_id`, `amount_minor`, `event_type` | webapp, R: маршрут `api/doctor/patients/[userId]/payment-timeline/route.ts`; W: `pgPayments.ts`, `pgClientHistory.ts` | пропадает платёжная хронология в карточке пациента | клиника + пациент | RLS on/FORCE, 1 пол.: org **OR** `platform_user_id=…`; 0 строк | OK |
| `public.be_refunds` | возвраты: `payment_id`, `amount_minor`, `reason`, `provider_refund_ref` | webapp, R/W: `pgPayments.ts` | нельзя вернуть предоплату | клиника + пациент | RLS on/FORCE, 1 пол.: org **OR** `EXISTS(be_payments … platform_user_id=…)`; 0 строк | OK |
| `public.appointment_records` | **легаси-проекция записей на приём из Rubitime**: `integrator_record_id`, `phone_normalized`, `record_at`, `status`, `payload_json`, `platform_user_id`, `organization_id` | webapp W: `pgAppointmentProjection.ts:171`; интегратор R: `adminStats.ts:26`; purge: `platformUserFullPurge.ts:144` | ломается статистика и сверка со старым источником записей | клиника + пациент | **RLS off / FORCE off, `org=true`, 0 политик**; ACL: `app_staff arwd` | **НАРУШЕНИЕ** — нет ни стены клиники, ни стены пациента (FACTS §1.3) |
| `integrator.contacts` | контакты пользователя мессенджера: `user_id`, `type`, `value_normalized`, `is_primary` | интегратор R/W: `writePort.ts:446`, `linkedPhoneSource.ts`, `mergeIntegratorUsers.ts`; webapp R | нельзя связать чат с телефоном пациента | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол. `saas_org_dormant_p0_8_5`: org-ветка **OR** `user_id=current_integrator_user_id()`; ACL patient `r` | OK |
| `integrator.identities` | **связка «человек ↔ внешний аккаунт»**: `user_id`, `resource` (telegram/max), `external_id` | интегратор R/W: `channelUsers.ts:278`, `resolveDirectPublicActor.ts`, `maxRecipient.ts`; webapp R | никто не узнаёт, чей это чат — весь вход в бота ломается | клиника + пациент | **RLS off / FORCE off, `org=false`, 0 политик**; ACL: `app_staff arwd`, `bcb_test_integrator_login r` | **НАРУШЕНИЕ** — нет обеих стен; вдобавок пациентские политики `conversations`/`message_drafts`/`user_questions` **опираются на EXISTS по этой самой незакрытой таблице** |
| `integrator.users` | реестр пользователей интегратора: `id`, `created_at`, `merged_into_user_id` | интегратор R/W: `channelUsers.ts:266`, `mergeIntegratorUsers.ts`, `userMergeM2mRoute.ts` | нет якоря, к которому цепляются идентичности, контакты и напоминания | клиника + пациент | **RLS off / FORCE off, `org=false`, 0 политик**; ACL: `app_staff arwd` | **НАРУШЕНИЕ** — нет обеих стен |
| `integrator.telegram_state` | состояние Telegram-диалога: `username`, `first_name`, `last_name`, `state`, `notify_*`, `is_active` | интегратор R/W: `channelUsers.ts:180,293`, `mergeIntegratorUsers.ts:332`, `dispatchRequestContact.ts` | бот теряет шаг диалога и настройки уведомлений | клиника + пациент | **RLS off / FORCE off, `org=false`, 0 политик**; ACL: `app_staff arwd` | **НАРУШЕНИЕ** — ПДн (имя/ник) без обеих стен |
| `integrator.telegram_users` | **легаси-хранилище Telegram-аккаунтов**: `telegram_id`, `username`, `first_name`, `last_name`, `phone` | код рантайма НЕ пишет и НЕ читает — прямая запись в доке: `apps/integrator/src/infra/db/schema.md:41` «сохраняется только как legacy/deprecated storage, активный runtime в неё не пишет»; попадания только в миграциях и `scripts/check-telegram-users.ts` | ничего не ломается — таблица мёртвая | закрыта по умолчанию либо удалена | **RLS off / FORCE off, 0 политик**, 2 строки; ACL: `app_staff arwd` | **НАРУШЕНИЕ** — телефон и имена доступны `app_staff` любой клиники без стен; кандидат на удаление (В-6) |
| `integrator.conversations` | диалоги поддержки: `source`, `user_identity_id`, `admin_scope`, `status`, `close_reason` | интегратор R/W: `messageThreads.ts`, `handleIncomingEvent.ts`, `auto-close-stale-conversations.ts`, `mergeIntegratorConversationToPlatform.ts` | ломается переписка «пациент ↔ поддержка» | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** `EXISTS(identities … user_id=current_integrator_user_id())` | OK |
| `integrator.conversation_messages` | сообщения диалога: `sender_role`, `text`, `external_chat_id`, `external_message_id` | интегратор R/W: `messageThreads.ts:269,380,445,515` | пропадает текст переписки с пациентом | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** EXISTS через `conversations`+`identities` | OK |
| `integrator.message_drafts` | черновик сообщения пациента в боте: `identity_id`, `draft_text_current`, `state` | интегратор R/W: `messageThreads.ts:135,178`, `handleIncomingEvent.ts` | пациент теряет набранный, но не отправленный текст | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** EXISTS через `identities` | OK |
| `integrator.user_questions` | вопросы пациента врачу/поддержке: `text`, `answered`, `answered_at` | интегратор R/W: `messageThreads.ts:572`, `mergeIntegratorUsers.ts:385` | вопрос пациента не доходит до персонала | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** EXISTS через `identities` | OK |
| `integrator.question_messages` | сообщения внутри вопроса: `sender_type`, `message_text` | интегратор W: `messageThreads.ts:601`; webapp — in-memory-заглушка `inMemorySupportCommunication.ts` | обрывается нитка ответа на вопрос | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** EXISTS через `user_questions`+`identities` | OK |
| `integrator.user_reminder_rules` | правила напоминаний пациента: `category`, `schedule_type`, `timezone`, `quiet_hours_*`, `deep_link`, `custom_text` | интегратор R/W: `repos/reminders.ts`, `writeReminderRulesDirect.ts`; webapp backfill-скрипты | пациент перестаёт получать напоминания | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** `user_id=current_integrator_user_id()`; ACL patient `r` | OK |
| `integrator.user_reminder_occurrences` | конкретные срабатывания напоминаний: `planned_at`, `status`, `delivery_channel`, `platform_user_id` | интегратор R/W: `repos/reminders.ts`, `outgoingDeliveryWorker.ts:342`; webapp R: `pgPatientReminderMaterialization.ts` | напоминания не ставятся в очередь и дублируются | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** EXISTS через `reminder_rules` | OK |
| `integrator.user_reminder_delivery_logs` | журнал доставки напоминаний: `occurrence_id`, `channel`, `status`, `error_code`, `payload_json` | интегратор W: `repos/reminders.ts` | не видно, почему напоминание не дошло | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** EXISTS через `user_reminder_occurrences`+`reminder_rules` | OK |
| `integrator.content_access_grants` | временные ссылки-доступы к контенту пациента: `content_id`, `purpose`, `token_hash`, `expires_at`, `revoked_at` | интегратор R/W: `repos/reminders.ts`, `mergeIntegratorUsers.ts:433` | по ссылке из напоминания не открывается материал | клиника + пациент | RLS on/FORCE, `org=true`, 1 пол.: org **OR** `user_id=current_integrator_user_id()`; 0 строк | OK |

---

## C — операционные данные клиники и врача (14 таблиц)

| Таблица | Что внутри | Кто пользуется (файл:строка) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `public.be_organizations` | сама клиника: `title`, `is_active`, `tariff_id`, `cabinet_first_entered_at` | webapp: `pgClinicDirectory.ts`, `pgOrgEntitlements.ts`, `pgSaasBilling.ts`, `pgOrganizationProvisioning.ts` | без неё нет арендатора вообще | клиника (сама себе) + путь глобал-админа | RLS on/FORCE, `org=false` (`id` и есть организация), **5 политик**: staff read/update по `id=current_org_id()`, `app_platform_settings` select/update `USING true` (путь глобал-админа), `app_clinic_billing` read своей орг | OK |
| `public.be_organization_members` | членство человека в клинике: `platform_user_id`, `role` (owner/admin/doctor/assistant), `specialist_id`, `status`, `doctor_screens_disabled` | webapp: `pgOrganizationMembership.ts`, `pgStaffUsers.ts`, `pgOrganizationInvites.ts`, `pgOperatorHealthRead.ts`, `transactionQuotaPort.ts`; интегратор: `integratorUserOrganizationSql.ts` | никто не определяется как врач/админ клиники — падает вся авторизация кабинета | клиника + стена роли + путь глобал-админа | **RLS off / FORCE off, `org=true`, 0 политик**; ACL: `app_staff arwd`, `app_platform_settings r`, `bcb_test_nonstaff_login r`, `bcb_test_integrator_login r` | **НАРУШЕНИЕ** — живая межарендная утечка (FACTS §1.2: `app_staff` читает строку владельца чужой клиники) |
| `public.be_branches` | филиалы клиники: `title`, `city_code`, `address`, `timezone`, `color` | webapp: `pgBookingEngine.ts`, `pgBookingCalendar.ts`, `pgBookingScheduling.ts`, `pgOrgEntitlements.ts`, `pgClientHistory.ts` | расписание некуда привязать, ломаются часовые пояса | клиника + путь глобал-админа | RLS on/FORCE, `org=true`, **2 политики**: org-ветка + `be_branches_platform_operations_select USING true` для `app_platform_settings` | OK |
| `public.be_rooms` | кабинеты филиала: `branch_id`, `title`, `is_active` | webapp: `pgBookingEngine.ts`, `pgBookingCalendar.ts`, `pgClientHistory.ts` | нельзя развести приёмы по кабинетам | клиника | RLS on/FORCE, `org=true`, 1 пол. (только org-ветка `is_staff()`); 0 строк | OK (пациентских строк нет — пациентская ветка не требуется) |
| `public.be_clinic_services` | услуги клиники: `title`, `duration_minutes`, `price_minor`, `public_widget_visible`, `prepayment_applicable` | webapp: `pgBookingEngine.ts`, `pgBookingCalendar.ts`, `pgBookingScheduling.ts`, `pgMemberships.ts`, `pgClientHistory.ts` | не на что записываться и нечего считать в прайсе | клиника + путь глобал-админа | RLS on/FORCE, `org=true`, **2 политики**: org-ветка + `…platform_operations_select USING true` | OK |
| `public.be_availability_rules` | правила доступности специалиста: `specialist_id`, `rule_type`, `config` | webapp: `pgBookingScheduling.ts` | не считаются свободные слоты | клиника | RLS on/FORCE, `org=true`, 1 пол. (org-ветка); 0 строк | OK |
| `public.be_schedule_blocks` | блокировки времени (отпуск, перерыв): `specialist_id`, `start_at/end_at`, `block_type` | webapp: `pgBookingScheduling.ts` | врача записывают в занятое/нерабочее время | клиника | RLS on/FORCE, `org=true`, 1 пол. (org-ветка); 0 строк | OK |
| `public.be_booking_form_fields` | конструктор полей формы записи: `field_key`, `field_type`, `visible_to_patient/staff`, `is_required` | webapp: `pgBookingForm.ts`, `pgBookingCalendar.ts` | форма записи теряет настраиваемые поля | клиника | RLS on/FORCE, `org=true`, 1 пол. (org-ветка) | OK (это настройка клиники, не данные пациента) |
| `public.be_cancellation_policies` | политика отмен: `free_cancel_hours_before`, `late_cancellation_behavior`, `refund_prepayment_on_late` | webapp: `pgBookingPolicies.ts` | отмены перестают штрафоваться по правилам клиники | клиника | RLS on/FORCE, `org=true`, 1 пол. (org-ветка) | OK |
| `public.be_reschedule_policies` | политика переносов: `self_reschedule_hours_before`, `max_self_reschedules`, `allow_different_*` | webapp: `pgBookingPolicies.ts` | пациент переносит визит без ограничений | клиника | RLS on/FORCE, `org=true`, 1 пол. (org-ветка) | OK |
| `public.be_prepayment_policies` | политика предоплаты по услуге: `mode`, `amount_minor`, `percent_bps`, `online_category` | webapp: `pgPayments.ts` | не берётся предоплата | клиника | RLS on/FORCE, `org=true`, 1 пол. (org-ветка); 0 строк | OK |
| `public.be_payment_provider_events` | сырые вебхуки платёжного провайдера: `provider_id`, `event_type`, `payload_json`, `intent_ref` | webapp: `pgPayments.ts` | платёж не подтверждается автоматически | клиника | RLS on/FORCE, `org=true`, 1 пол. (org-ветка); пациенту грантов нет; 0 строк | OK |
| `public.be_package_items` | состав абонемента-шаблона: `package_id`, `service_id`, `quantity` | webapp: `pgMemberships.ts` | нельзя описать, что входит в абонемент | клиника (через родителя) | RLS on/FORCE, `org=false`, 1 пол. `saas_org_dormant_p0_8_4`: `EXISTS(be_subscription_packages … org)` **AND** `EXISTS(be_clinic_services … org)`; 0 строк | OK (колонки `organization_id` нет намеренно) |
| `public.be_external_entity_mappings` | сопоставление «наш id ↔ id внешней системы»: `entity_type`, `canonical_id`, `external_system`, `external_id` | webapp: `pgBookingEngine.ts`, скрипты сверки и `purge-placeholder-bookings.ts` | рвётся связь с Rubitime/внешними системами, начинаются дубли | клиника | RLS on/FORCE, `org=true`, 1 пол. (org-ветка) | OK |

---

## S — системные таблицы платформы (9 таблиц)

| Таблица | Что внутри | Кто пользуется (файл:строка) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `public.admin_audit_log` | журнал административных действий: `actor_id`, `action`, `target_id`, `details`, `status`, `repeat_count` | webapp: `infra/adminAuditLog.ts`, `app-layer/admin/auditLog.ts`, `integratorPlatformUserMerge.ts`, `policyHistoryDiff.ts`; интегратор: `messengerPhoneBindAudit.ts` | пропадает разбор «кто что сделал» и авто-мерджи конфликтов | стена роли + клиника + путь глобал-админа | RLS on/FORCE, `org=true`, **4 политики**: org-ветка `is_staff()`; `app_platform_settings` select `USING true` + insert (путь глобал-админа); `app_owner` select только по `action='saas_tariff_update'` | OK |
| `public.app_runtime_settings` | настройки рантайма: `key`, `scope`, `organization_id`, `audience`, `value_json` | webapp: `pgAppRuntimeSettings.ts:70,112`, `pgSystemSettings.ts:503,543`, `requireRole.ts` | сервис теряет управляемые из кабинета настройки | стена роли + клиника | RLS on/FORCE, `org=true`, **2 политики**: `s5_runtime_settings_isolation` (staff — своя орг; patient — только `audience in (public, authenticated_client)`; worker — только `audience='server'` и глобальные) + `u9a_platform_runtime_global_only` (`app_platform_settings` только `organization_id IS NULL`) | OK — образцовая стена роли |
| `public.app_runtime_settings_audit` | кто и когда менял настройку: `old_value_json`, `new_value_json`, `updated_by`, `source` | webapp: `pgAppRuntimeSettings.ts`, smoke `smoke-s5-1-runtime-settings-contract.mjs` | нельзя восстановить, кто сломал настройку | стена роли + клиника | RLS on/FORCE, `org=true`, 2 политики (staff — своя орг; `app_platform_settings` — только insert глобальных) | OK |
| `public.auth_rate_limit_events` | счётчик попыток входа/отправки кода: `scope`, `key` (IP либо `userId`), `occurred_at` | webapp через SECURITY DEFINER: `pgAuthRateLimitEvents.ts:47,59` (`app.auth_rate_limit_prune_scope/prune_key`); правила — `modules/auth/*RateLimit.ts` | снимается защита от перебора OTP и OAuth-стартов | стена роли (таблица платформенная, арендному терминалу не нужна) | **RLS off / FORCE off, `org=false`, 0 политик**; ACL: `app_staff arwd`, `app_owner ard` | **НАРУШЕНИЕ** — `app_staff` (терминал персонала ЛЮБОЙ клиники) имеет прямой `SELECT/DELETE` на все строки, хотя код ходит только через definer-функции; стены роли нет |
| `integrator.idempotency_keys` | ключи идемпотентности API: `key`, `request_hash`, `status`, `response_body` (**полное тело ответа**), `expires_at` | webapp: `infra/idempotency/pgStore.ts:37,65`; интегратор: `repos/idempotencyKeys.ts`, маршруты `relayOutboundRoute.ts`, `requestContactRoute.ts` | повтор вебхука начинает дублировать записи и отправки | стена роли; при хранении ответов с ПДн — ещё и стена клиники/пациента | **RLS off / FORCE off, `org=false`, 0 политик**, 221 476 строк; ACL: `app_staff arwd`, `app_operational_scheduler arwd`, `bcb_test_integrator_login rd` | **НАРУШЕНИЕ** — стены нет ни одной, а `response_body` хранит тела ответов API (в т.ч. по бронированиям); содержимое строк я не читал — вывод из `pgStore.ts:65` |
| `integrator.projection_outbox` | очередь проекций событий в webapp: `event_type`, `idempotency_key`, `payload`, `status`, `attempts_done`, `last_error` | интегратор: `projectionWorker.ts`, `repos/projectionOutbox.ts`, `projectionFanout.ts`, `operationalPoolReadiness.ts:23`; webapp: `pgHealthFailureArchive.ts`, скрипт `requeue-projection-outbox-dead.ts` | события интегратора перестают доезжать в webapp | стена роли (+ клиника, если `payload` арендный) | **RLS off / FORCE off, `org=false`, 0 политик**, 3 768 строк; ACL: `app_staff arwd`, `app_operational_delivery_worker rw`, `app_operational_diagnostic r` | **НАРУШЕНИЕ** — нет ни стены роли, ни клиники; `payload` несёт события по конкретным пациентам/записям |
| `integrator.message_retry_jobs` | очередь повторной отправки сообщений: **`phone_normalized`, `message_text`**, `next_try_at`, `attempts_done`, `last_error`, `payload_json` | интегратор: `repos/jobQueue.ts`, `integratorDrizzleSchema.ts`; проверка гонок `check-d30-legacy-message-retry-drain-concurrency.ts` | недоставленные SMS/сообщения не досылаются | клиника + пациент (в таблице лежит телефон и текст сообщения) | **RLS off / FORCE off, `org=false`, 0 политик**; ACL: `app_staff arwd`, `app_operational_delivery_worker rw` | **НАРУШЕНИЕ** — телефон и текст сообщения пациента без обеих стен |
| `integrator.delivery_attempt_logs` | журнал попыток отправки: `intent_type`, `channel`, `status`, `attempt`, `reason`, `payload_json` (**полезная нагрузка сообщения**, кроме OTP) | интегратор: `repos/messageLogs.ts:83,98`, `adapters/dispatchPort.ts:85-93` (`sanitizePayloadForLogs`), `sendEmailRoute.ts` | нельзя разобрать, почему письмо/СМС не ушло | клиника + пациент (payload = содержимое сообщения) | **RLS off / FORCE off, `org=false`, 0 политик**, 6 223 строки; ACL: `app_staff arwd`, `app_owner a` | **НАРУШЕНИЕ** — редактируется только OTP (`dispatchPort.ts:90`), всё остальное содержимое лежит открытым для `app_staff` любой клиники |
| `integrator.integration_data_quality_incidents` | инциденты качества данных внешней интеграции: `integration`, `entity`, `external_id`, `field`, `raw_value`, `timezone_used`, `error_reason` | интегратор: `repos/integrationDataQualityIncidents.ts:21`, алерт `dataQualityIncidentAlert.ts` | не видно, что внешняя система прислала мусор (например, кривой TZ филиала) | клиника (инцидент относится к интеграции конкретной клиники) | **RLS off / FORCE off, `org=false`, 0 политик**, 3 строки; ACL: `app_staff arwd` | **НАРУШЕНИЕ** — стены клиники нет; `raw_value` может содержать исходное значение поля пациента/филиала |

---

## R — глобальные справочники

**В этом срезе ноль таблиц.** Ни одна из 61 не является справочником, одинаковым для всех арендаторов:
все `be_*` в срезе несут `organization_id` (либо привязаны к организации через родителя),
все `integrator.*` — данные конкретных людей или операционные очереди.

---

## T — техническое (5 таблиц)

| Таблица | Что внутри | Кто пользуется (файл:строка) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `app.principal_context` | «кто сейчас в этой сессии»: `backend_pid`, `org_id`, `patient_user_id`, `integrator_user_id`, `nonce`, `expires_epoch` | пишется только definer-функцией `app.install_signed_context(...)` (`deploy/postgres/p2-b-protected-principal-context.sql`), читается `app.current_org_id()`/`current_patient_user_id()`; из Node — лишь `SELECT app.release_principal_context()` (`app-layer/db/drizzle.ts:41`) | **несущая деталь: без неё все RLS-предикаты видят NULL и вся база становится пустой** | закрыто по умолчанию (никому, кроме definer-шва) | RLS off, но ACL — только `app_owner=arwdDxt`; в деплое явный `REVOKE ALL … FROM PUBLIC` и от staff/patient-ролей (`p2-b-…sql:356-359`); 0 строк | OK — стена сделана грантами, а не RLS, и это здесь верно |
| `app.context_signing_secrets` | HMAC-секрет подписи контекста: `id`, `secret` | читается в definer-функции проверки подписи; в смоуках `deploy/postgres/test-owner-ready-locked-matrix.sql:45` | утечка = подделка принципала, т.е. обход всех стен разом | закрыто по умолчанию | RLS off, ACL — только `app_owner`; 1 строка | OK |
| `app.context_nonce_ledger` | защита от повтора подписи: `nonce` (PK), `backend_pid`, `accepted_at`, `expires_epoch` | вставка внутри `install_signed_context` (`p2-b-…sql:238`); в коде приложения не упоминается нигде | без неё подписанный контекст можно проиграть повторно | закрыто по умолчанию | RLS off, ACL — только `app_owner`; **7 538 213 строк, 1341 МБ, 8 228 863 строки уже просрочены** (`SELECT count(*) … WHERE expires_epoch < extract(epoch from now())`); прунера нет ни в одном файле репозитория (`rg -l "context_nonce_ledger"` → 6 файлов, ни одного DELETE/prune/cron) | OK по стенам; **см. В-5 — таблица растёт неограниченно** |
| `drizzle.__drizzle_migrations` | журнал применённых миграций webapp: `hash`, `created_at` | `run-webapp-drizzle-migrate.mjs`, `a0-greenfield-baseline-lib.mjs`, `verify-a1-rls-conformance.mjs` | миграции применяются повторно или не применяются | закрыто по умолчанию (только мигратор) | RLS off, ACL — только `bersoncarebot_test` (мигратор); 312 строк | OK |
| `integrator.schema_migrations` | журнал миграций интегратора: `version`, `applied_at` | `apps/integrator/src/infra/db/migrate.ts` | то же для интегратора | закрыто по умолчанию | RLS off, ACL: мигратор + `bcb_test_integrator_login r`; 68 строк | OK (чтение версии схемы интегратор-логином — осмысленно; данных нет) |

---

## НАРУШЕНИЯ — 13

Каждое: какой именно стены нет и чем это доказано.

| # | Таблица | Класс | Чего не хватает по правилу владельца | Доказательство |
|---|---|---|---|---|
| 1 | `public.appointment_records` | P | стена клиники **и** стена пациента: `organization_id` есть, RLS/FORCE выключены, политик 0 | срез + `pg_class.relrowsecurity=f`; совпадает с FACTS §1.3 и `13-f2-census.md §2.3` |
| 2 | `public.be_organization_members` | C | стена клиники (RLS выключен при `organization_id` в таблице) | FACTS §1.2 — живая утечка: `app_staff` и `app_platform_settings` читают членства чужих организаций; ACL `app_staff=arwd` |
| 3 | `public.auth_rate_limit_events` | S | стена своей роли: прямой `arwd` у `app_staff` при нулевой RLS | ACL из `pg_class.relacl`; код обращается только через definer (`pgAuthRateLimitEvents.ts:47,59`), т.е. табличный грант арендной роли — лишний |
| 4 | `integrator.identities` | P | обе стены (RLS off, `organization_id` нет) | ACL `app_staff=arwd`; **усугубляет**: пациентские ветки политик `conversations`, `message_drafts`, `user_questions`, `question_messages` построены на `EXISTS … FROM integrator.identities` — стена пациента опирается на незакрытую таблицу |
| 5 | `integrator.users` | P | обе стены | `relrowsecurity=f`, политик 0, ACL `app_staff=arwd` |
| 6 | `integrator.telegram_state` | P | обе стены; хранит имя/фамилию/ник | колонки `first_name,last_name,username`; RLS off |
| 7 | `integrator.telegram_users` | P | обе стены; хранит **телефон** и имена | колонки `phone,first_name,last_name`; RLS off; при этом сама таблица объявлена мёртвой — `apps/integrator/src/infra/db/schema.md:41` |
| 8 | `integrator.delivery_attempt_logs` | S (содержимое P/C) | обе стены; `payload_json` = тело отправленного сообщения | `dispatchPort.ts:85-93` — редактируется ТОЛЬКО OTP, остальной payload пишется как есть; `messageLogs.ts:83` |
| 9 | `integrator.message_retry_jobs` | S (содержимое P) | обе стены; `phone_normalized` + `message_text` в открытом виде | список колонок; RLS off, политик 0 |
| 10 | `integrator.projection_outbox` | S | стена роли и стена клиники; `payload` несёт события по конкретным записям/пациентам | RLS off, политик 0; ACL `app_staff=arwd` |
| 11 | `integrator.idempotency_keys` | S | стена роли (и, если `response_body` несёт ПДн, — стены клиники/пациента) | `pgStore.ts:65` пишет `response_body` целиком; 221 476 строк, RLS off |
| 12 | `integrator.integration_data_quality_incidents` | S/C | стена клиники: инцидент принадлежит интеграции конкретной клиники, `organization_id` нет | `integrationDataQualityIncidents.ts:21`; RLS off |
| 13 | `public.be_appointment_staff_comments` / `public.be_patient_booking_profiles` | P | **не отсутствие стены, а её направление** — вынесено в ВОПРОСЫ В-2/В-3, здесь не считается нарушением | — |

**Итого нарушений по стенам: 12** (строка 13 — указатель на вопросы, в счёт не входит).

Общая форма 11 из 12: таблица держит данные людей или арендаторов, но живёт **вне** механизма
`saas_org_dormant_*` — в схеме `integrator` (8 из 12) либо среди легаси-таблиц `public` (2).
Стена клиники в `integrator` включена ровно там, где в 2026-07 был добавлен `organization_id`
(миграции `20260707_0001_p0_4_i0…`, `20260708_000{2,3}…`); всё, что этой волной не тронули, осталось голым.

---

## ВОПРОСЫ — 7

**В-1. Путь глобал-админа к клиническим данным — какой он?**
Из 33 таблиц классов P/C с включённым RLS явный путь `app_platform_settings` есть только у четырёх:
`be_organizations`, `be_branches`, `be_clinic_services`, `admin_audit_log` (политики `…_platform_operations_select USING true`).
У остальных 29 (все `be_appointment*`, `be_patient*`, `be_payment*`, все `integrator.*`) у платформенной
роли нет ни гранта, ни политики. Вопрос: «правильный доступ глобал админа» — это (а) осознанное
**отсутствие** доступа к медданным (платформа видит только каркас клиник и биллинг), или (б) должен быть
объявленный доступ с журналом? Сейчас это не решено, а просто не сделано, и разные таблицы ведут себя
по-разному без записанной причины.

**В-2. `be_appointment_staff_comments` — пациент читает внутренние комментарии персонала о себе.**
`ACL: app_patient=r` + пациентская ветка политики `platform_user_id = app.current_patient_user_id()`.
Колонка `body` заполняется врачом/администратором (`pgClientHistory.ts`), название таблицы — «staff
comments». Вопрос владельцу: это задумано (комментарий виден пациенту) или пациентская ветка тут лишняя?

**В-3. `be_patient_booking_profiles` — пациент читает собственную пометку «проблемный».**
Те же грант и ветка политики; колонки `is_problematic`, `problematic_note`, `booking_blocked`,
`no_show_count`. Вопрос тот же: пациенту это показывать — да или нет? Технически стены на месте, но
«стена пациента = свои данные» здесь открывает служебную оценку клиники.

**В-4. `integrator.*` очереди — доводить до арендной модели или до операционной роли?**
`projection_outbox`, `message_retry_jobs`, `delivery_attempt_logs`, `idempotency_keys` — сквозные очереди
одного экземпляра интегратора. Два взаимоисключающих пути: (а) добавить `organization_id` + RLS, как уже
сделали для `contacts`/`conversations`/`user_reminder_*` волной 07.2026; (б) оставить без `organization_id`,
но **отозвать `app_staff`** и ходить только операционными ролями (`app_operational_delivery_worker` и т.п.),
у которых область NONE. Выбор — инженерно-архитектурный, но он меняет объём миграций, поэтому нужен до
проектирования декларации, а не после.

**В-5. `app.context_nonce_ledger` растёт неограниченно.**
7 538 213 строк, 1341 МБ, из них 8 228 863 записи уже просрочены по `expires_epoch`
(`SELECT pg_size_pretty(pg_total_relation_size('app.context_nonce_ledger'))` и `count(*) WHERE expires_epoch < now()`).
Механизма очистки в репозитории нет: `rg -l "context_nonce_ledger"` даёт 6 файлов (deploy-SQL, deploy-скрипт,
стенд A1, дамп a0, SCHEME.md, smoke) и ни одной операции удаления/крона. Это не дыра в стене, но это
несущая таблица шва принципала, и она уже больше всей остальной базы. Кому это чинить и в каком этапе?

**В-6. `integrator.telegram_users` — удалять или закрывать?**
Документация репозитория прямо объявляет её мёртвой (`apps/integrator/src/infra/db/schema.md:41`,
`integrations/telegram/db/schema.md:8`), в ней 2 строки с телефоном и именами, и на неё стоит `arwd` у
`app_staff`. Закрывать стенами мёртвую таблицу с ПДн или дропнуть (freeze+dump сперва, TEST обратим)?

**В-7. Что считать «стеной роли» для платформенных таблиц без арендного ключа.**
`auth_rate_limit_events` (и в меньшей степени `idempotency_keys`) не имеют ни `organization_id`, ни
владельца-человека. Достаточно ли «стены» из грантов (отозвать `app_staff`, оставить только definer-функции,
как уже написан код), или декларация обязана требовать RLS с предикатом по `CURRENT_USER` и на таких
таблицах тоже? От ответа зависит, попадут ли ~все `S`-таблицы в контур обязательного RLS.

---

## Счётчики среза

| Класс | Таблиц |
|---|---:|
| P — данные пациента | 33 |
| C — операционные данные клиники | 14 |
| S — системные таблицы платформы | 9 |
| R — глобальный справочник | 0 |
| T — техническое | 5 |
| **Всего** | **61** |

| Вердикт | Таблиц |
|---|---:|
| OK | 47 |
| НАРУШЕНИЕ | 12 |
| ВОПРОС | 2 (`be_appointment_staff_comments`, `be_patient_booking_profiles`) |

Мёртвых по коду таблиц — одна: `integrator.telegram_users` (прямое утверждение доки репозитория, ни одного
обращения из рантайма). Все остальные 60 имеют доказанного читателя или писателя, ссылки приведены в таблицах.
