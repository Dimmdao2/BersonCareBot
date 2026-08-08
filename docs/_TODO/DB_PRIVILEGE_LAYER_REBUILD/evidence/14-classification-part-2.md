# 14 — Классификация таблиц, срез 2 (61 таблица), 2026-08-08

**Срез:** `slice-01` — 61 таблица схемы `public`, от `be_schedule_templates` до `media_playback_stats_hourly`
(алфавитно). База — `bersoncarebot_test`. Работа READ-ONLY: ни DDL, ни DML, ни чтения строк
пациентских таблиц (смотрел колонки, ACL, политики, гранты — не содержимое).

**Метод (каждое утверждение воспроизводимо):**

1. **Колонки** — `pg_attribute` × `format_type`, все 61 таблица одним запросом.
2. **Флаги стен** — `pg_class.relrowsecurity / relforcerowsecurity`, наличие `organization_id`,
   `count(*) FROM pg_policy` — одним запросом (вывод сверен со слайсом, расхождений нет).
3. **Тексты политик** — `pg_policies` (`polname`, `roles`, `cmd`, `qual`, `with_check`) — 64 строки.
4. **Гранты** — `pg_class.relacl` + `pg_get_userbyid(relowner)`.
5. **Кто пользуется** — `node /home/dev/brain/tools/code-search.mjs "<таблица>" --repo bcb`
   для незакрытых случаев + точный `rg` по `apps/ tools/ scripts/ packages/ deploy/`
   (имя таблицы — точная строка, поэтому точный поиск уместен) + второй проход по
   **имени экспорта Drizzle** (`pgTable('be_working_days')` → `beWorkingDays`), иначе таблица,
   которую приложение трогает через ORM, выглядит мёртвой.
6. Для таблиц, у которых прямых обращений нет, — проверка **SECURITY DEFINER**-шва:
   `pg_proc WHERE nspname='app' AND prosrc LIKE '%<таблица>%'`.

**Правило владельца, против которого классифицирую:**
> «Все таблицы с любыми данными клиник/докторов и пациентов должны быть обязательно закрыты стенами
> и клиники и пациента, с правильным доступом глобал админа. Как и системные таблицы платформы
> должны нести стену своей роли.»

**Как читать «Сейчас»:** `RLS=on/force` — `relrowsecurity`/`relforcerowsecurity`; `pol=N` — число
политик; `org` — есть ли колонка `organization_id`. Роли: `app_staff` (область ORG),
`app_patient` (OWN), `app_platform_settings` (GLOBAL), `app_owner` (владелец definer-шва, NONE),
`app_worker`/`app_operational_*` (инфра, NONE) — по `evidence/13-f2-census.md` §4.

**Сокращения грантов** (буквы `relacl`): `r`=SELECT, `a`=INSERT, `w`=UPDATE, `d`=DELETE.

---

## Класс P — данные пациента (20 таблиц)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `clinical_anamnesis_illness` | Анамнез: перенесённые болезни и стрессы — `patient_user_id`, `period`, `what`, `comment`, `created_by` | webapp доктор R/W — `apps/webapp/src/infra/repos/pgPatientClinical.ts:909`; схема `db/schema/patientClinicalAnamnesis.ts:63` | Без неё врач теряет историю болезней пациента в карточке | клиника + пациент + путь глобал-админа | RLS=on/force, pol=1, org=да; политика `saas_org_dormant_p0_8_3`: staff→`organization_id=current_org_id()`, пациент→`patient_user_id=current_patient_user_id()`; гранты `app_staff=arwd`, `app_patient=r` | **OK** |
| `clinical_anamnesis_lifestyle` | Анамнез: образ жизни — `patient_user_id`, `record_date`, `text`, `created_by` | webapp доктор R/W — `pgPatientClinical.ts:929`; `patientClinicalAnamnesis.ts:103` | То же — блок «Образ жизни» в анамнезе | клиника + пациент | RLS=on/force, pol=1, org=да; тот же `p0_8_3` (обе ветки); `app_staff=arwd`, `app_patient=r` | **OK** |
| `clinical_anamnesis_trauma` | Анамнез: травмы и операции — `year`, `what`, `type`, `immobilization`, `patient_user_id` | webapp доктор R/W — `pgPatientClinical.ts:882`; `patientClinicalAnamnesis.ts:21` | Блок «Травмы и операции» | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3` обе ветки; `app_staff=arwd`, `app_patient=r` | **OK** |
| `clinical_complaint` | Жалобы пациента — `patient_user_id`, `text`, `priority`, `status`, `source_visit_id`, `resolved_at` | webapp доктор R/W — `pgPatientClinical.ts:497`; `db/schema/patientClinical.ts:141` | Без неё нет списка жалоб и их закрытия | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3` обе ветки; `app_staff=arwd`, `app_patient=r` | **OK** |
| `clinical_complaint_update` | Динамика жалобы по визитам — `complaint_id`, `visit_id`, `note`, `severity`, `resolved` | webapp доктор R/W через Drizzle `clinicalComplaintUpdate` — `pgPatientClinical.ts:37,160-162,265-267,285` | Без неё жалоба статична, нет истории «стало лучше/хуже» | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_4` — пациент через `EXISTS(clinical_complaint … patient_user_id=…)`; `app_staff=arwd`, `app_patient=r` | **OK** |
| `clinical_diagnosis` | Диагнозы пациента — `patient_user_id`, `catalog_id`, `text`, `status`, `clinical_status`, `comment` | webapp доктор R/W — `db/schema/patientClinical.ts:221`; `src/modules/patient-clinical/ports.ts:324` | Основной клинический артефакт карточки | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3` обе ветки; `app_staff=arwd`, `app_patient=r` | **OK** |
| `clinical_diagnosis_status_history` | Журнал смены статуса диагноза — `diagnosis_id`, `old_status`, `new_status`, `changed_by`, `note` | webapp доктор W — `src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status/route.ts:5`; схема `patientClinical.ts:280` | Аудит: кто и когда снял/поставил диагноз | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_4` — пациент через `EXISTS(clinical_diagnosis …)`; `app_staff=arwd`, `app_patient=r` | **OK** |
| `clinical_diagnosis_update` | Уточнения диагноза по визитам — `diagnosis_id`, `visit_id`, `refinement`, `status`, `removed` | webapp доктор R/W — `pgPatientClinical.ts:41,184-186,577` | Без неё диагноз не уточняется от визита к визиту | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_4` через `EXISTS(clinical_diagnosis …)`; `app_staff=arwd`, `app_patient=r` | **OK** |
| `clinical_visit` | Клинический визит — `patient_user_id`, `visit_type`, `visited_at`, `exam`, `manipulations`, `recommendations`, `anamnesis_text` | webapp доктор R/W — `pgPatientClinical.ts:480`; чтение в `src/modules/doctor-clients/ports.ts:166-171`; эталон изоляции в `src/infra/repos/tenantIsolationMatrix.postgres.integration.test.ts:33` | Приём как таковой: осмотр, манипуляции, рекомендации | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3` обе ветки; `app_staff=arwd`, `app_patient=r` | **OK** |
| `doctor_notes` | Заметки врача о пациенте — `user_id`, `author_id`, `text` | webapp доктор R/W — `db/schema/schema.ts:1548`; чистка `src/infra/platformUserFullPurge.ts:93,252,262`; счётчик `platformUserMergePreview.ts:618` | Личные пометки врача по клиенту | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3`, пациентская ветка по `user_id`; `app_staff=arwd`, `app_patient=r` | **OK** |
| `doctor_patient_support` | Флаги сопровождения пациента — `patient_user_id`, `on_support`, `comments_enabled`, `media_enabled`, `support_started_at` | webapp доктор R/W — `src/infra/repos/pgDoctorPatientSupport.ts:77,109`, `pgDoctorClients.ts:1040`; integrator R — `apps/integrator/src/integrations/google-calendar/calendarDescription.ts:90` | Определяет, ведёт ли врач клиента и открыты ли ему чат/медиа | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3` обе ветки; `app_staff=arwd`, `app_patient=r` | **OK** |
| `lfk_complexes` | Назначенные пациенту комплексы ЛФК — `platform_user_id`, `user_id`(legacy text), `title`, `diagnosis_text`, `region_ref_id`, `side` | webapp доктор/пациент R/W — `src/infra/repos/pgLfkDiary.ts`, `pgLfkAssignments.ts`; merge/purge — `platformUserMergePreview.ts:621` | Без неё пациент не получает назначенных упражнений | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3`, пациентская ветка **только по `platform_user_id`**; `app_staff=arwd`, `app_patient=r`, `app_owner=r` | **ВОПРОС** (см. В4) |
| `lfk_complex_exercises` | Строки комплекса пациента — `complex_id`, `exercise_id`, `reps`, `sets`, `max_pain_0_10`, `comment` | webapp R/W — `pgLfkDiary.ts:137,367,402`, `pgLfkAssignments.ts:115`, `pgLfkExercises.ts:304,473` | Сам состав назначения (что и сколько делать) | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_4` — пациент через `EXISTS(lfk_complexes … platform_user_id=…)`; `app_staff=arwd`, `app_patient=r`, `app_owner=r` | **OK** |
| `lfk_sessions` | Дневник выполнения ЛФК — `user_id`, `complex_id`, `completed_at`, `pain_0_10`, `difficulty_0_10`, `comment` | webapp пациент W, доктор R — `db/schema/schema.ts:1244`; merge/purge `scripts/user-phone-admin.ts:294` | Без неё нет дневника и статистики выполнения | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3`, пациентская ветка по `user_id`; `app_staff=arwd`, **`app_patient=arw`** (пациент пишет свои записи) | **OK** |
| `material_ratings` | Оценки материалов пациентом — `user_id`, `target_kind`, `target_id`, `stars` | webapp R/W — `src/infra/repos/pgMaterialRating.ts:235,270`; `src/modules/material-rating/types.ts:29` | Обратная связь по материалам, отчёты врачу | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3` по `user_id`; `app_staff=arwd`, `app_patient=arw` | **OK** |
| `content_access_grants_webapp` | Выданные пациенту доступы к контенту — `platform_user_id`, `content_id`, `token_hash`, `expires_at`, `revoked_at` | webapp скрипты бэкфилла/сверки — `scripts/backfill-reminders-domain.mjs:272`, `scripts/reconcile-reminders-domain.mjs:111`, purge `scripts/user-phone-admin.ts:459` | Пациент теряет доступ к выданным ему материалам | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3`, пациент по `platform_user_id`; `app_staff=arwd`, `app_patient=r` | **OK** |
| `broadcast_audit_recipients` | Кому ушла рассылка — `audit_id`, `platform_user_id`, `organization_id` | webapp пациент R — `src/infra/repos/pgPatientBroadcasts.ts:28`; доктор R — `pgDoctorBroadcastDelivery…` | Пациент видит адресованные ему рассылки; врач — охват | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_4`, пациент по `platform_user_id`; `app_staff=arwd`, `app_patient=r` | **OK** |
| `comments` | Комментарии к сущностям — `author_id`, `target_type`, `target_id`, `comment_type`, `body` | webapp доктор+пациент R/W — `db/schema/entityComments.ts:8`, UI `src/components/comments/CommentBlock.tsx:45`, API `/api/doctor/comments` | Диалог врач↔пациент вокруг упражнений, тестов, программ | клиника + пациент | RLS=on/force, pol=1, org=да; политика `p0_8_4` содержит **безусловный** дизъюнкт `target_type = ANY(ARRAY['exercise','test','test_set','recommendation','lesson'])`; `app_staff=arwd`, `app_patient=r` | **НАРУШЕНИЕ** (Н1) |
| `media_folders` | Папки медиатеки, в т.ч. личные папки пациентов — `parent_id`, `name`, `kind`, `patient_user_id`, `created_by` | webapp R/W — `src/infra/repos/pgClientMediaFolders.ts:28,54-68` (Drizzle `mediaFolders`) | Файлы клиента и библиотека клиники раскладываются по папкам | клиника + пациент | RLS=on/force, pol=1, org=да; политика `p0_8_3` содержит **безусловный** дизъюнкт `(patient_user_id IS NULL)`; `app_staff=arwd`, `app_patient=r` | **НАРУШЕНИЕ** (Н2) |
| `manual_patient_commands` | Идемпотентность ручных команд по пациенту — `command_id`, `command_kind`, `request_fingerprint`, `platform_user_id` | webapp R/W — `db/schema/manualPatientCommands.ts:14`; стенд `apps/webapp/scripts/patient-invites-disposable-proof.mjs:910,934,1023` | Защита от двойного выполнения ручной команды (приглашение и т.п.) | клиника + пациент | RLS=on/force, pol=1, org=да; `manual_patient_commands_exact_staff_org` (только staff, `is_staff() AND org=…`); `app_staff=ar`, у `app_patient` гранта НЕТ | **OK** (пациентская стена не нужна: поверхности у пациента нет; проверяется стендом `…proof.mjs:1023`) |

---

## Класс C — данные клиники / доктора (25 таблиц)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `be_schedule_templates` | Шаблоны рабочего дня клиники — `branch_id`, `name`, `start_minute`, `end_minute`, `breaks`, `is_active` | webapp доктор R/W через Drizzle `beScheduleTemplates` — `src/infra/repos/pgBookingScheduling.ts:19` | Без неё нельзя быстро назначить типовой график | клиника (пациентских данных нет) | RLS=on/force, pol=1, org=да; `p0_8_3` staff-only; `app_staff=arwd` | **OK** |
| `be_service_location_availability` | Где оказывается услуга — `service_id`, `branch_id`, `is_active` | webapp R/W — `src/infra/repos/pgBookingEngine.ts:30,1074,1139`; сид `scripts/seed-saas-test-walkthrough-fixtures.ts:1158` | Без неё запись не знает, в каком филиале доступна услуга | клиника | RLS=on/force, pol=2, org=да; `p0_8_3` staff-only + `…_platform_operations_select` (`app_platform_settings`, `USING true` — GLOBAL по §4 переписи); `app_staff=arwd`, `app_platform_settings=r` | **OK** |
| `be_specialist_locations` | Специалист ↔ филиал — `specialist_id`, `branch_id`, `is_active` | webapp R/W — `pgBookingEngine.ts:31,848,856` | Без неё специалист не привязан к филиалу — слоты не строятся | клиника | RLS=on/force, pol=1, org=да; `p0_8_3` staff-only; `app_staff=arwd` | **OK** |
| `be_specialist_rooms` | Специалист ↔ кабинет — `specialist_id`, `room_id`, `is_active` | webapp R/W — `pgBookingEngine.ts:32,865,873,1892-1897` | Распределение по кабинетам при записи | клиника | RLS=on/force, pol=1, org=да; `p0_8_3` staff-only; `app_staff=arwd` | **OK** |
| `be_specialist_service_availability` | Какой специалист какую услугу оказывает — `specialist_id`, `service_id`, `branch_id`, `room_id`, `city_code`, `price_minor_override` | webapp R (публичная запись) — комментарий шва `src/infra/repos/pgPatientBookings.ts:90-93`; сиды `scripts/seed-saas-test-walkthrough-fixtures.ts:1922` | Ядро подбора слота: без неё публичная запись пуста | клиника | RLS=on/force, pol=2, org=да; `p0_8_3` staff-only + platform-select; гранты `app_staff=arwd`, `app_owner=r`, `app_platform_settings=r`, **`bcb_test_nonstaff_login=r`** | **ВОПРОС** (В5 — прямой грант LOGIN-роли) |
| `be_specialists` | Карточка специалиста клиники — `full_name`, `description`, `is_active`, `appointment_reminder_default_preset_id` | webapp R/W — `db/schema/bookingEngine.ts:186`; деплой-гейты `scripts/deploy-saas-667.sh:290,442`; baseline `scripts/verify-a0-greenfield-baseline.mjs:362` | Витрина записи и расписание без специалистов не существуют | клиника | RLS=on/force, pol=2, org=да; `p0_8_3` staff-only + platform-select; `app_staff=arwd`, `app_owner=ar`, `app_platform_settings=r`, **`bcb_test_nonstaff_login=r`** | **ВОПРОС** (В5) |
| `be_subscription_packages` | Абонементы клиники — `title`, `price_minor`, `currency`, `validity_days`, `deduction_mode` | webapp R — `src/infra/repos/pgMemberships.ts:11,164-171`; сид `seed-saas-test-walkthrough-fixtures.ts:1303` | Без неё нельзя продать/списать абонемент | клиника | RLS=on/force, pol=1, org=да; `p0_8_3` staff-only; `app_staff=arwd` | **OK** |
| `be_working_days` | График на конкретную дату (перекрывает недельный) — `specialist_id`, `work_date`, `start_minute`, `end_minute`, `is_closed`, `breaks` | webapp R/W — `src/infra/repos/pgBookingScheduling.ts:682,719`; UI `src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx:1066`; логика `src/modules/booking-calendar/service.ts:154` | Разовые изменения графика (отпуск, дополнительный день) | клиника | RLS=on/force, pol=1, org=да; `p0_8_3` staff-only; `app_staff=arwd` | **OK** |
| `be_working_hours` | Недельный график — `specialist_id`, `branch_id`, `room_id`, `weekday`, `start_minute`, `end_minute` | webapp R/W — `db/schema/bookingScheduling.ts:119`; UI `ScheduleWorkTab.tsx:210,984`; интеграционный тест `pgBookingScheduling.deactivateWorkingHours.postgres.integration.test.ts:51` | Базовое расписание — без него нет ни одного слота | клиника | RLS=on/force, pol=2, org=да; `p0_8_3` staff-only + platform-select; `app_staff=arwd`, `app_platform_settings=r` | **OK** |
| `broadcast_audit` | Журнал рассылок клиники — `actor_id`, `category`, `audience_filter`, `message_title`, `sent_count`, `error_count`, `channels`, `message_body` | webapp W — `src/modules/doctor-broadcasts/ports.ts:132`; integrator W — `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:261,277,923`; R — `apps/integrator/src/infra/db/repos/broadcastAudit.ts:13` | Без неё нет истории рассылок и счётчиков доставки | клиника | RLS=on/force, pol=1, org=да; `p0_8_3` staff-only; `app_staff=arwd`, **`app_owner=r` без политики** | **ВОПРОС** (В2 — мёртвый грант) |
| `broadcast_drafts` | Черновики рассылок — `doctor_user_id`, `category`, `audience`, `channels`, `title`, `body`, `media_url` | webapp R/W — `src/infra/repos/pgBroadcastDrafts.ts:26,45` | Врач теряет несохранённый текст рассылки | клиника | RLS=on/force, pol=1, org=да; `p0_8_3` staff-only; `app_staff=arwd` | **OK** |
| `clinic_dedicated_bot_bindings` | Привязка собственного бота клиники — `channel`, `organization_id`, `credential_fingerprint`, `is_active` | integrator R **только через definer** `app.resolve_clinic_dedicated_bot_organization` — `apps/integrator/src/infra/db/clinicDedicatedBotBindings.ts:12-27`, вызов `apps/integrator/src/app/routes.ts:20` | Без неё вебхук собственного бота клиники не маршрутизируется | клиника + путь глобал-админа | RLS=on/force, pol=1, org=да; **единственная политика `clinic_dedicated_bot_bindings_owner_manage` для `app_owner` с `USING true`**; гранты `app_owner=arwd`, **`app_staff=arwd` — без политики** | **ВОПРОС** (В1) |
| `clinic_public_directory_entries` | Публичная витрина клиники — `slug`, `display_name`, `is_published`, `published_at` | webapp R через шов `src/infra/repos/pgClinicDirectory.ts:51`, единственный порт `src/modules/clinic-directory/ports.ts:5`; фикстуры `scripts/update-saas-product-smoke-fixture-canonical-slots.ts:300` | Без неё клиника не находится по публичной ссылке записи | клиника | RLS=on/force, pol=2, org=да; `…_exact_org_staff` (`organization_id = app.current_org_id()`) + `p0_8_3`; `app_staff=arwd`, `app_owner=ar` | **OK** |
| `clinical_diagnosis_catalog` | Справочник диагнозов клиники — `label`, `note`, `created_by` | webapp R/W — `src/infra/repos/pgPatientClinical.ts:434`; схема `db/schema/patientClinical.ts:23,47` («собственный, общеклиничный») | Врач выбирает диагноз из своего справочника | клиника | RLS=on/force, pol=1, org=да; `p0_8_3` staff-only; `app_staff=arwd` | **OK** |
| `clinical_test_regions` | Связка «клинический тест ↔ регион тела» — `clinical_test_id`, `body_region_id` | webapp R/W — `src/infra/repos/pgClinicalTests.ts:377` | Фильтр тестов по региону тела | клиника (+пациент, если пациент видит свои тесты) | RLS=on/force, pol=1, org=да; `p0_8_3` **staff-only**; `app_staff=arwd`, у `app_patient` гранта нет | **ВОПРОС** (В3) |
| `content_pages` | Страницы CMS — `section`, `slug`, `title`, `body_html`/`body_md`, `is_published`, `requires_auth`, `linked_course_id` | webapp доктор R/W, пациент R — `scripts/seed-content-pages.mjs:64`; гонка квот `scripts/check-cms-pages-quota-race.mjs:334`; web-push R | Контент, который читает пациент | клиника + пациент | RLS=on/force, pol=3, org=да; `p0_8_3` staff-only + `patient_visible_current_org_select` (org + `is_published` + активный `org_enrollments`) + `c4_web_push_reminder_catalog` (`org IS NULL OR org = current_setting('app.org')`); `app_staff=arwd`, `app_patient=r`, `app_owner=r`, `app_operational_web_push_reminder=r` | **ВОПРОС** (В6 — разный аксессор организации) |
| `content_sections` | Разделы CMS — `slug`, `title`, `is_visible`, `requires_auth`, `kind`, `system_parent_code`, `cover_image_url` | webapp R — `src/infra/repos/pgWarmupsSectionSlugs.ts:9`, `pgMediaUsageSummary.ts:48`; типы `src/modules/content-sections/types.ts:8` | Навигация пациентского контента | клиника + пациент | RLS=on/force, pol=3, org=да; тот же набор из трёх политик, что у `content_pages`; `app_staff=arwd`, `app_patient=r`, `app_operational_web_push_reminder=r` | **ВОПРОС** (В6) |
| `content_section_slug_history` | История переименований разделов — `old_slug`, `new_slug`, `changed_by_user_id` | webapp R/W — `src/infra/repos/pgContentSections.ts:25,308-314,381`; резолв `src/modules/content-sections/resolvePatientContentSectionSlug.ts:9` | Старые ссылки пациента не ломаются после переименования | клиника + пациент | RLS=on/force, pol=2, org=да; `p0_8_4` staff-only + `patient_current_org_select` (роль `public`, не `app_patient`); `app_staff=arwd`, `app_patient=r` | **ВОПРОС** (В7) |
| `courses` | Курсы клиники — `title`, `program_template_id`, `intro_lesson_page_id`, `access_settings`, `status`, `price_minor` | webapp R/W — `db/schema/courses.ts:21`; лестница доступа `scripts/check-access-ladder-transitions.mjs:407,442` | Платный/бесплатный курс как продукт клиники | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3`: staff по org, пациент через `EXISTS(treatment_program_instances … patient_user_id=…)`; `app_staff=arwd`, `app_patient=r`, `app_owner=r` | **OK** |
| `lfk_complex_templates` | Шаблоны комплексов — `title`, `description`, `status`, `created_by`, `owner_kind` | webapp R/W — `src/infra/repos/pgLfkTemplates.ts:321,440,611,650`; org-предикат `pgLfkTemplates.ts:36` | Библиотека готовых комплексов клиники и платформы | клиника | RLS=on/force, pol=2, org=да; `p0_8_3` staff-org + `c4d_platform_library_read` (`owner_kind='platform' AND organization_id IS NULL`, только SELECT) | **OK** (глобальная библиотека объявлена явно и только на чтение) |
| `lfk_complex_template_exercises` | Строки шаблона — `template_id`, `exercise_id`, `reps`, `sets`, `side`, `owner_kind` | webapp R/W — `pgLfkTemplates.ts:443,479,557,623,696`; `pgLfkExercises.ts:285-370` | Состав шаблонного комплекса | клиника | RLS=on/force, pol=2, org=да; `p0_8_4` staff-org + `c4d_platform_library_read` | **OK** |
| `lfk_exercises` | Каталог упражнений — `title`, `region_ref_id`, `load_type`, `difficulty_1_10`, `contraindications`, `owner_kind`, `catalog_scope` | webapp R/W — `src/infra/repos/pgLfkExercises.ts:52` (org-предикат) и далее; purge `platformUserFullPurge.ts:242` | Без каталога упражнений нет назначений | клиника | RLS=on/force, pol=2, org=да; `p0_8_3` staff-org + `c4d_platform_library_read` | **OK** |
| `lfk_exercise_media` | Видео/картинки упражнения — `exercise_id`, `media_url`, `media_type`, `owner_kind` | webapp R/W — `pgLfkExercises.ts:122,209,614,744,813,822`; `pgTreatmentProgram.ts:206,230` | Пациент не видит показ упражнения | клиника | RLS=on/force, pol=2, org=да; `p0_8_4` staff-org + `c4d_platform_library_read` | **OK** |
| `lfk_exercise_regions` | Упражнение ↔ регион тела — `exercise_id`, `region_ref_id`, `owner_kind` | webapp R/W — `pgLfkExercises.ts:183,193,561,598,693,839`; типы `src/modules/lfk-exercises/types.ts:34` | Фильтр упражнений по региону | клиника | RLS=on/force, pol=2, org=да; `p0_8_3` staff-org + `c4d_platform_library_read` | **OK** |
| `media_files` | Файлы медиатеки — `original_name`, `s3_key`, `mime_type`, `uploaded_by`, `usage_purpose`, `hls_master_playlist_s3_key`, `owner_kind` | webapp R/W; **media-worker** R/W — `apps/media-worker/src/processTranscodeJob.ts:88,131,298,496`, `processProgramSubmissionTranscode.ts:45,148`; ветка воркера в политике | Хранилище всех медиа: видео упражнений, логотипы, файлы пациента | клиника + пациент | RLS=on/force, pol=2, org=да; `p0_8_3` — **в пациентской ветке нет проверки организации**; `c4d_platform_library_read`; гранты `app_staff=arwd`, `app_patient=r`, `app_owner=r`, `app_operational_media_worker=rw`, `saas_system_health_owner=r` | **НАРУШЕНИЕ** (Н3) |

---

## Класс S — системные таблицы платформы (10 таблиц)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `email_challenges` | Коды подтверждения почты — `user_id`, `email`, `code_hash`, `expires_at`, `attempts`, `purpose`, **`pending_delivery_code`**, `delivery_token` | Приложение ходит **через 15 SECURITY DEFINER `app.email_auth_*`/`app.email_otp_public_*`**; порт `src/infra/repos/pgAuthEmailOtpDeliveryQueue.ts:7`, `src/modules/messaging/outgoingDeliveryQueuePort.ts:77` | Вход и подтверждение почты | стена своей роли (только definer-шов) | **RLS=off/off, pol=0, org=нет**; гранты `app_staff=arwd`, `app_owner=rwd` | **НАРУШЕНИЕ** (Н4) |
| `email_otp_locks` | Блокировка после неудачных попыток — `user_id`, `locked_until`, `lockout_cycle` | Через definer `app.email_auth_find_email_otp_lock` / `…register_email_otp_lockout` / `…reset_email_otp_lockout`; в коде явно «no direct grant on `email_otp_locks`» — `src/infra/repos/pgEmailAuth.ts:282` | Защита входа от перебора кода | стена своей роли | **RLS=off/off, pol=0, org=нет**; гранты `app_owner=arwd`, **`app_staff=arwd`** | **НАРУШЕНИЕ** (Н5) |
| `email_send_cooldowns` | Антиспам отправки писем — `user_id`, **`email_normalized`**, `last_sent_at` | Через definer `app.email_auth_*_email_send_cooldown`, `app.email_otp_public_find_email_send_cooldown_by_email`; порт `src/infra/repos/pgReminderTransactionalEmailCooldown.ts:6` | Без неё письма уходят пачками | стена своей роли (в колонке — ПДн: адрес) | **RLS=off/off, pol=0, org=нет**; `app_staff=arwd`, `app_owner=arw` | **НАРУШЕНИЕ** (Н6) |
| `login_tokens` | Одноразовые токены входа — `token_hash`, `user_id`, `method`, `status`, `expires_at`, `session_issued_at` | Только через definer `app.auth_login_token_create/read/confirm/mark_session_issued/expire_past` (`db/drizzle-migrations/0258_bootstrap_auth_table_accessors.sql:479-563`, владелец `app_owner`); purge `src/infra/platformUserFullPurge.ts:117` | Вход по ссылке/коду | стена своей роли | **RLS=off/off, pol=0, org=нет**; `app_owner=arw`, **`app_staff=arwd`** | **НАРУШЕНИЕ** (Н7) |
| `channel_link_secrets` | Одноразовые секреты привязки мессенджера — `user_id`, `channel_code`, `token_hash`, `expires_at`, `used_at` | Только через definer `app.auth_channel_link_*` (`0258_…sql:140-221`, владелец `app_owner`); merge `packages/platform-merge/src/pgPlatformUserMerge.ts:406` | Привязка Telegram/MAX к аккаунту | стена своей роли | **RLS=off/off, pol=0, org=нет**; `app_owner=arwd`, **`app_staff=arwd`** | **НАРУШЕНИЕ** (Н8) |
| `idempotency_keys` | Кэш ответов межсервисного API — `key`, `request_hash`, `status`, **`response_body` (jsonb)**, `expires_at`. **1 251 959 строк** | webapp R/W — `src/infra/idempotency/pgStore.ts:36,65`; вызовы: `/api/integrator/support/question`, `/api/integrator/support/admin-reply:73`, `/api/integrator/messenger-phone/bind:93`, `/api/integrator/program-note/reply-begin:62,73`, `/api/integrator/reminders/dispatch:79` | Повторный вебхук не выполняет операцию дважды | стена своей роли (в `response_body` — тела ответов о пациентах и привязках телефонов) | **RLS=off/off, pol=0, org=нет**; **`app_staff=arwd`**, `saas_system_health_owner=r` | **НАРУШЕНИЕ** (Н9) |
| `integrator_push_outbox` | Очередь исходящих push к integrator — `kind`, `idempotency_key`, **`payload` (jsonb)**, `status`, `attempts_done`, `last_error` | webapp R/W — `src/infra/integrator-push/integratorPushOutbox.ts:119,125`, тик `runIntegratorPushWorkerTick.ts:15`, cron `scripts/integrator-push-outbox-tick.ts` | Без неё webapp не дотолкает событие до integrator при сбое | стена своей роли | **RLS=off/off, pol=0, org=нет**; **`app_staff=arwd`**, `app_owner=arw`, `saas_system_health_owner=r` | **НАРУШЕНИЕ** (Н10) |
| `integration_webhook_error_events` | Ошибки входящих вебхуков — `source`, `error_class`, `occurred_at` | webapp — порт `src/modules/operator-health/ports.ts:180`, чистка `src/app-layer/health/runIntegratorPushOutboxHealthGuardTick.ts:15` | Диагностика молчащего вебхука | стена своей роли (операторская) | **RLS=off/off, pol=0, org=нет**; **`app_staff=arwd`** | **НАРУШЕНИЕ** (Н11) |
| `integration_webhook_last_status` | Последний статус вебхука — `source`, `received_at`, `processed_ok`, `error_class`, `http_status_returned`, `detail` | webapp — порт `src/modules/operator-health/ports.ts:117` | Панель здоровья интеграций | стена своей роли | **RLS=off/off, pol=0, org=нет**; **`app_staff=arwd`**, `saas_system_health_owner=r` | **НАРУШЕНИЕ** (Н12) |
| `booking_calendar_map` | Связь записи с событием Google Calendar — `appointment_key`, `gcal_event_id` | integrator R/W — `apps/integrator/src/infra/db/repos/bookingCalendarMap.ts:13-26`, синхронизация `src/integrations/google-calendar/sync.ts:14`; схема `src/infra/db/schema/integratorPublicProduct.ts:25` | Без неё запись пациента не отражается/не удаляется в календаре врача | клиника (запись принадлежит клинике) | **RLS=off/off, pol=0, org=нет**; в `relacl` только владелец базы — прикладных грантов нет | **НАРУШЕНИЕ** (Н13 — структурное: нет `organization_id`) |

---

## Класс R — глобальные справочники (2 таблицы)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `booking_cities` | Города каталога записи — `code`, `title`, `is_active`, `sort_order` (2 строки) | **Прикладного читателя не нашёл.** Есть definer-шов `app.list_active_booking_cities()` (`0306_v9b_capability_seams_local.sql:11,169,186-189`, владелец `app_owner`, EXECUTE у `app_patient`/`app_staff`) — **у него ноль вызовов** в `apps/**` (`rg "list_active_booking_cities\|listActiveBookingCities" apps/webapp/src` → пусто). В коде остались только `code`-строки (`src/modules/help-content/patientHelpAddressLink.ts:7`, `cityCode` в `/book`), FK из `046_booking_catalog_v2.sql:24`, гранты в `deploy/postgres/p0-5b-grants.sql:121` | Глобальный список городов для публичной записи — **сейчас функцию выполняет свободный `cityCode`, не таблица** | глобальный справочник: чтение всем, **запись только платформе** | **RLS=off/off, pol=0, org=нет**; **`app_staff=arwd`**, `app_owner=r` | **НАРУШЕНИЕ** (Н14) + находка «мёртвая таблица и мёртвый шов» |
| `clinical_test_measure_kinds` | Виды измерений для клинических тестов — `code`, `label`, `sort_order` (0 строк) | webapp R/W — `src/infra/repos/pgClinicalTestMeasureKinds.ts:45,58,67,86`; UI `src/app/app/doctor/references/measure-kinds/page.tsx:11`; API описан в `src/app/api/api.md:100`; код нормализации — «**глобальный пул** measure_kinds» (`src/modules/tests/measureKindCode.ts:1`) | Единые подписи измерений в тестах | глобальный справочник: чтение всем, запись только платформе | **RLS=off/off, pol=0, org=нет**; **`app_staff=ar` (SELECT+INSERT)**, `app_platform_settings=rw`, `app_owner=arw` | **НАРУШЕНИЕ** (Н15) |

---

## Класс T — техническое / телеметрия (4 таблицы)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `media_hls_proxy_error_events` | Отказы HLS-прокси — `media_id`, `user_id`, `reason_code`, `http_status`, `artifact_kind` | webapp W — `src/modules/media/hlsProxyTelemetry.ts:1`; ретенция `src/app/api/internal/media-hls-proxy-errors/retention/route.ts:24` | Диагностика «видео не играет» у конкретного пациента | клиника + пациент (есть `user_id`) | RLS=on/force, pol=1, org=да; `p0_8_3` обе ветки (staff по org, пациент по `user_id`); гранты **`app_staff=awd` — без SELECT**, `saas_system_health_owner=r` | **ВОПРОС** (В8) |
| `media_playback_client_events` | Клиентские события плеера — `media_id`, `user_id`, `event_class`, `delivery`, `error_detail`, `user_agent` | webapp W/R — `src/app-layer/media/playbackClientEvents.ts:53,113-127` (Drizzle `mediaPlaybackClientEvents`) | Понять, почему у пациента не грузится видео | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3` обе ветки; **`app_staff=awd` — без SELECT**, `saas_system_health_owner=r` | **ВОПРОС** (В8) |
| `media_playback_resolution_events` | Как отдавалось видео — `media_id`, `user_id`, `delivery`, `fallback_used`, `resolved_at` (2100 строк) | webapp R — `src/app-layer/stats/loadAdminReminderStats.ts:130,506` | Оценка минут просмотра в отчётах | клиника + пациент | RLS=on/force, pol=1, org=да; `p0_8_3` обе ветки; `app_staff=arwd`, `app_owner=a`, `saas_system_health_owner=r` | **OK** |
| `media_playback_stats_hourly` | Почасовой агрегат воспроизведений — `bucket_hour`, `delivery`, `resolved_count`, `fallback_count` (529 строк) | webapp — ретенция `src/app-layer/media/playbackHourlyRetention.ts:17`, `src/app/api/internal/media-playback-stats/retention/route.ts:24` | Дешёвый график вместо скана событий | агрегат **по всем арендаторам сразу** → стена своей (платформенной) роли | **RLS=off/off, pol=0, org=нет**; **`app_staff=arwd`**, `app_owner=arw`, `saas_system_health_owner=r` | **НАРУШЕНИЕ** (Н16) |

---

## НАРУШЕНИЯ — 16, с точным указанием отсутствующей стены

### Н1. `comments` — клиническая стена отключена для пяти типов целей
Политика `saas_org_dormant_p0_8_4` (`pg_policies.qual`) содержит дизъюнкт **без единого условия**:
```
OR (target_type = ANY (ARRAY['exercise','test','test_set','recommendation','lesson']))
```
Он не проверяет ни `app.is_staff()`, ни `app.current_org_id()`, ни `app.current_patient_user_id()`, и
стоит одинаково в `USING` и в `WITH CHECK`. Гранты: `app_staff=arwd`, `app_patient=r`.
**Отсутствует:** стена клиники (и требование принципала) для строк с этими `target_type`.
**Следствие:** сотрудник клиники A читает, правит и удаляет комментарии клиники B ко всем
упражнениям/тестам/рекомендациям/урокам; пациент читает чужие.

### Н2. `media_folders` — клиническая стена отключена для всех непациентских папок
`saas_org_dormant_p0_8_3`, дизъюнкт **без условий**: `OR ((patient_user_id IS NULL) OR (…))`.
Любая строка с `patient_user_id IS NULL` (а это вся библиотека клиники: `kind='standard'`,
`kind='client_files_root'` — `src/infra/repos/pgClientMediaFolders.ts:56`) проходит `USING` и
`WITH CHECK` для любой сессии с грантом. `app_staff=arwd`, `app_patient=r`.
**Отсутствует:** стена клиники на непациентских папках. **Следствие:** staff клиники A видит и
может изменить/удалить дерево папок клиники B.

### Н3. `media_files` — в пациентской ветке нет стены клиники
`saas_org_dormant_p0_8_3`, пациентская ветка:
```
OR ((app.current_patient_user_id() IS NOT NULL)
    AND ((usage_purpose IS DISTINCT FROM 'program_item_submission') OR (uploaded_by = app.current_patient_user_id())))
```
Проверки `organization_id` в ней нет вообще. `app_patient=r`.
**Отсутствует:** стена клиники в пациентской ветке. **Следствие:** пациент клиники A читает метаданные
и `s3_key` любого файла клиники B (кроме чужих присланных заданий).
*(Ветки `pg_has_role(… 'app_worker' …)` и `… 'app_operational_media_worker' …` глобальны намеренно —
это инфра-роли области NONE по §4 переписи; их не трогаю.)*

### Н4. `email_challenges` — нет ни одной стены, при этом в колонке лежит открытый код входа
`relrowsecurity=f`, `relforcerowsecurity=f`, политик 0, `organization_id` нет.
Грант **`app_staff=arwd`** — прямой, в обход 15 definer-функций `app.email_auth_*`, которые эту
таблицу и должны обслуживать. Колонка `pending_delivery_code` хранит **открытый** OTP между вставкой и
отправкой — доказано тестом `src/infra/repos/authEmailOtpDeliveryOwnership.postgres.integration.test.ts:210`
(`expect(row.rows[0]?.pending_delivery_code).toBe('222333')`).
**Отсутствует:** RLS/стена роли целиком. **Следствие:** любая staff-сессия любой клиники читает
почтовые адреса и открытые коды входа всех пользователей платформы.

### Н5. `email_otp_locks` — нет стены; прямой грант противоречит собственному коду
RLS off, pol=0, org нет; `app_staff=arwd`, `app_owner=arwd`. При этом `src/infra/repos/pgEmailAuth.ts:282`
прямо пишет: «no direct grant on `email_otp_locks`, same reason every other accessor in this file goes
through …». **Отсутствует:** стена роли (доступ должен быть только через
`app.email_auth_find_email_otp_lock` / `…register_email_otp_lockout` / `…reset_email_otp_lockout`).

### Н6. `email_send_cooldowns` — нет стены, в колонке ПДн
RLS off, pol=0, org нет; `app_staff=arwd`. `email_normalized` — почтовый адрес.
**Отсутствует:** стена роли (шов — `app.email_auth_*_email_send_cooldown`).

### Н7. `login_tokens` — нет стены, прямой грант обходит definer-шов
RLS off, pol=0, org нет; `app_staff=arwd`, `app_owner=arw`. Проектный шов —
`app.auth_login_token_create/read/confirm/mark_session_issued/expire_past`, владелец `app_owner`
(`0258_bootstrap_auth_table_accessors.sql:479-563`). **Отсутствует:** стена роли; `app_staff` не должен
иметь табличного гранта на таблицу токенов входа.

### Н8. `channel_link_secrets` — нет стены, прямой грант обходит definer-шов
RLS off, pol=0, org нет; `app_staff=arwd`, `app_owner=arwd`. Шов —
`app.auth_channel_link_replace_secret/read_secret/lock_unused_secret/mark_secret_used*`
(`0258_…sql:140-221`). **Отсутствует:** стена роли.

### Н9. `idempotency_keys` — нет стен, 1 251 959 строк, в `response_body` тела ответов о людях
RLS off, pol=0, `organization_id` нет; `app_staff=arwd`. Пишется на маршрутах
`/api/integrator/support/question`, `/api/integrator/support/admin-reply` (`route.ts:73`),
`/api/integrator/messenger-phone/bind` (`route.ts:93`), `/api/integrator/program-note/reply-begin`
(`route.ts:62,73`), `/api/integrator/reminders/dispatch` (`route.ts:79`) — то есть в `response_body`
оседают ответы по обращениям пациентов и по привязке телефонов.
**Отсутствует:** и стена клиники (нет колонки — структурно), и стена роли. Самая большая таблица среза.

### Н10. `integrator_push_outbox` — системная очередь без стены роли
RLS off, pol=0, org нет; `app_staff=arwd`. В `payload` — тела межсервисных событий.
**Отсутствует:** стена роли (владеть очередью должен воркер/`app_owner`, не арендная роль).

### Н11. `integration_webhook_error_events` — платформенная телеметрия без стены роли
RLS off, pol=0, org нет; `app_staff=arwd` — арендная роль может писать и **удалять** записи об ошибках
интеграций платформы. **Отсутствует:** стена своей (операторской) роли.

### Н12. `integration_webhook_last_status` — то же
RLS off, pol=0, org нет; `app_staff=arwd`, `saas_system_health_owner=r`.
**Отсутствует:** стена своей роли; арендной роли здесь не место вовсе.

### Н13. `booking_calendar_map` — структурно нечем закрыть
RLS off, pol=0, **колонки `organization_id` нет**. Данные — `appointment_key` ↔ `gcal_event_id`, то есть
связь конкретной записи пациента с событием календаря; читает/пишет integrator
(`apps/integrator/src/infra/db/repos/bookingCalendarMap.ts:13-26`).
**Отсутствует:** стена клиники, и её нельзя наложить без добавления `organization_id`.
Прикладных грантов в `relacl` нет (только владелец базы) — сейчас закрыто фактом отсутствия гранта,
а не объявленной стеной.

### Н14. `booking_cities` — глобальный справочник, который может править любая клиника
RLS off, pol=0, org нет; **`app_staff=arwd`**. Это общий на всю платформу список городов: клиника A
может переименовать/деактивировать/удалить город, который видит клиника B.
**Отсутствует:** запрет записи для арендной роли (чтение — законно, это R).
Отдельно: **читателя у таблицы нет** — см. ВОПРОС В9.

### Н15. `clinical_test_measure_kinds` — то же, на пуле, который сам код называет глобальным
RLS off, pol=0, org нет; **`app_staff=ar`** — арендная роль имеет INSERT в пул, который
`src/modules/tests/measureKindCode.ts:1` называет «глобальный пул measure_kinds», а API
(`src/app/api/api.md:100`) даёт врачу `POST`/`PATCH` по нему.
**Отсутствует:** запрет записи для арендной роли. **Следствие:** врач клиники A добавляет и
переименовывает подписи измерений, которые увидят все клиники.

### Н16. `media_playback_stats_hourly` — межарендный агрегат, доступный арендной роли на запись
RLS off, pol=0, org нет; `app_staff=arwd`. Строка `bucket_hour × delivery` суммирует воспроизведения
**всех** клиник. **Отсутствует:** стена своей (платформенной) роли; у `app_staff` не должно быть ни
записи, ни чтения этого агрегата.

---

## ВОПРОСЫ — 9

**В1. `clinic_dedicated_bot_bindings`: `app_staff=arwd` без единой политики — это мёртвый грант или забытая стена?**
FORCE RLS включён, единственная политика `clinic_dedicated_bot_bindings_owner_manage` выдана роли
`app_owner` с `USING true / WITH CHECK true`. Значит `app_staff` под FORCE RLS видит ноль строк, хотя
имеет полный грант — классический «тихий ноль» (FACTS §1.5). Вопрос: грант `app_staff` отозвать
(доступ только через `app.resolve_clinic_dedicated_bot_organization`), или добавить staff-политику
`organization_id = app.current_org_id()`? И: `USING true` у `app_owner` — объявленный глобальный
definer-шов или недосмотр?

**В2. `broadcast_audit`: грант `app_owner=r` без политики — зачем он?**
Единственная политика — `p0_8_3` (staff по организации). `app_owner` под FORCE RLS прочтёт ноль.
Либо грант лишний, либо не хватает политики. Что верно?

**В3. `clinical_test_regions`: пациенту не положено видеть регионы своих тестов?**
Политика только staff-org, у `app_patient` гранта нет. По правилу владельца пациентские данные несут
и пациентскую стену; здесь пациентской ветки нет вовсе. Вопрос: пациент видит свои клинические тесты
(тогда нужна ветка `EXISTS(clinical_tests … patient_user_id=…)`), или тесты — врачебный артефакт и
«закрыто по умолчанию» — правильное конечное состояние?

**В4. `lfk_complexes`: пациентская ветка смотрит только на `platform_user_id`, а колонок две.**
В таблице есть и legacy `user_id text`, и `platform_user_id uuid`
(бэкфилл — `apps/webapp/migrations/063_platform_user_owned_refs_backfill.sql:26`, счётчик сирот —
`scripts/audit-platform-user-merge.sql:27`). Строка с `platform_user_id IS NULL` пациенту невидима.
Вопрос: `platform_user_id` уже гарантированно NOT NULL (тогда стена корректна), или остаются строки,
где пациент не увидит собственный комплекс?

**В5. `be_specialists` и `be_specialist_service_availability`: прямой грант SELECT LOGIN-роли `bcb_test_nonstaff_login`.**
Остальные роли в `relacl` — терминальные (`app_staff`, `app_patient`, `app_owner`,
`app_platform_settings`). Здесь грант выдан именно логин-роли. Это объявленное исключение под
публичную страницу записи, или отступление от ролевой модели, которое надо перевести на терминал?

**В6. `content_pages` / `content_sections`: политика `c4_web_push_reminder_catalog` берёт организацию иначе, чем все остальные.**
Она читает `(NULLIF(current_setting('app.org', true), ''))::uuid`, тогда как все прочие политики
среза — `app.current_org_id()`. Два разных аксессора одной и той же величины в одной базе. Вопрос:
свести к `app.current_org_id()` или зафиксировать различие как намеренное (роль
`app_operational_web_push_reminder` — область NONE и `current_org_id` ей может быть не выдан)?

**В7. `content_section_slug_history`: политика `patient_current_org_select` выдана роли `public`, а не `app_patient`.**
Аналогичные «пациентские» политики у `content_pages`/`content_sections` выданы именно `app_patient`.
Здесь `roles=public` означает, что предикат применим и к staff-сессии. На безопасность это не влияет
(политика PERMISSIVE и только SELECT, а staff уже покрыт `p0_8_4`), но расходится с шаблоном.
Привести к `app_patient` или оставить?

**В8. `media_hls_proxy_error_events` / `media_playback_client_events`: у `app_staff` есть `awd`, но нет `r`.**
То есть арендная роль может вставлять, изменять и **удалять** записи телеметрии, но не может их
прочитать. `src/app-layer/media/playbackClientEvents.ts:113-127` при этом строит SELECT-агрегаты по
`media_playback_client_events`. Вопрос: чтение идёт под другой ролью (какой?), или это несогласованный
набор привилегий, и код читает под ролью, которой SELECT не выдан?

**В9. `booking_cities`: таблица и её definer-шов не используются приложением — оставляем или выводим?**
Читателя нет: имя экспорта Drizzle `bookingCities` не встречается нигде вне `db/schema/`;
`app.list_active_booking_cities()` (создана `0306_v9b_capability_seams_local.sql:11`, EXECUTE выдан
`app_patient`/`app_staff`) **не вызывается ни разу** в `apps/**`; публичная запись оперирует свободным
`cityCode` (`src/app/book/service/page.tsx:17,35`). В таблице 2 строки. Вопрос владельцу: город —
всё-таки справочник платформы (тогда шов надо подключить и запись у арендной роли отобрать, Н14), или
таблица и шов — остатки старого каталога и подлежат выводу?

---

## Сводка среза

| Класс | Таблиц | НАРУШЕНИЕ | ВОПРОС | OK |
|---|---:|---:|---:|---:|
| P — пациент | 20 | 2 | 1 | 17 |
| C — клиника | 25 | 1 | 8 | 16 |
| S — система платформы | 10 | 10 | 0 | 0 |
| R — глобальный справочник | 2 | 2 | 0 | 0 |
| T — техническое | 4 | 1 | 2 | 1 |
| **Итого** | **61** | **16** | **11** | **34** |

Столбец «ВОПРОС» считает **таблицы** с этим вердиктом (11); самих вопросов **9** — В5 покрывает две
таблицы (`be_specialists`, `be_specialist_service_availability`), В6 тоже две (`content_pages`,
`content_sections`), В8 тоже две (`media_hls_proxy_error_events`, `media_playback_client_events`).

*(В `booking_cities` вердикт `НАРУШЕНИЕ` и вопрос В9 стоят одновременно: стена отсутствует
независимо от того, живая таблица или мёртвая; вопрос — про её судьбу. В сводке она посчитана один
раз, как нарушение.)*

**Форма среза в одну строку:** весь класс S (10 из 10 таблиц) и весь класс R (2 из 2) стоят **без
единой стены** — ни RLS, ни политик, ни `organization_id`, — и при этом почти на каждой из них висит
прямой грант арендной роли `app_staff`. Классы P и C, наоборот, почти сплошь закрыты RLS+FORCE, и
дефекты там точечные: три политики с дизъюнктом, который отменяет стену клиники (`comments`,
`media_folders`, `media_files`).
