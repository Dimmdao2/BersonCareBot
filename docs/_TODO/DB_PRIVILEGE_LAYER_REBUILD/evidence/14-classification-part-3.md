# 14 — Классификация таблиц, срез 3 (slice-02), 2026-08-08

**Срез:** 58 таблиц схемы `public` базы `bersoncarebot_test`, от `media_playback_user_video_first_resolve`
до `reminder_occurrence_history` (алфавитный диапазон `m…r`).

**Правило, против которого классифицируем (слова владельца):**
> «Все таблицы с любыми данными клиник/докторов и пациентов должны быть обязательно закрыты стенами и
> клиники и пациента, с правильным доступом глобал админа. Как и системные таблицы платформы должны нести
> стену своей роли.»

Читаем как три требования: **(a)** таблица с данными клиники/доктора/пациента несёт И стену арендатора
(`organization_id = app.current_org_id()`), И стену пациента (`… = app.current_patient_user_id()` или
явное отсутствие доступа у `app_patient`), плюс корректный путь глобал-админа; **(b)** системная таблица
платформы несёт стену СВОЕЙ роли (не тенантной); **(c)** всё остальное закрыто по умолчанию.

**Метод (всё воспроизводимо):**
- каталог — `sudo -u postgres psql -d bersoncarebot_test -Atc "…"` по `pg_class`/`pg_policy`/
  `pg_attribute`/`information_schema.role_table_grants`/`information_schema.column_privileges`/`pg_auth_members`.
  Ни одного DDL/DML/GRANT/REVOKE. `bcb_webapp_prod` не открывалась.
- поведение — `SET ROLE <роль>; SELECT count(*) …` (только счётчики, ни одной строки ПДн не прочитано).
- код — `node /home/dev/brain/tools/code-search.mjs "<таблица>" --repo bcb` + точный `rg` по имени таблицы
  и по имени drizzle-экспорта (`pgTable('<snake>')` → `export const <camel>`), исключая `db/schema/**` и
  `drizzle-migrations/**`, чтобы остались только потребители.
- «Сейчас» — живой каталог на 08.08, он авторитетнее чисел в срезе-задании (данные двигаются).

**Сокращения в колонке «Сейчас»:** `rls/force` — `relrowsecurity`/`relforcerowsecurity`; `pol=N` — число
политик; `org` — есть ли колонка `organization_id` (в скобках — nullable/not-null).
`p0_8_3`/`p0_8_4` — сгенерированные политики вида
`(app.is_staff() AND organization_id = app.current_org_id()) [OR (<пациентская колонка> = app.current_patient_user_id())]`;
их точный текст — в `policies` (см. §Приложение-команда внизу).

---

## Сводка

| Класс | Кол-во | НАРУШЕНИЕ (TEST) | ВОПРОС |
|---|---:|---:|---:|
| P — пациент | 33 | 3 (+1 только на dev) | 4 |
| C — клиника | 13 | 1 | 3 |
| S — система платформы | 9 | 7 | 2 |
| R — глобальный справочник | 1 | 0 | 0 |
| T — техническое | 2 | 1 | 1 |
| **Итого** | **58** | **12** (+1 dev-only) | **10 таблиц → 9 вопросов** |

Одна таблица (`reference_catalog_snapshot_receipts`) несёт и НАРУШЕНИЕ, и ВОПРОС и посчитана в обеих колонках.

---

## Класс P — данные пациента (33)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `public.media_playback_user_video_first_resolve` | отметка «этот человек впервые досмотрел это видео»: `user_id`, `media_id`, `first_resolved_at`, `organization_id` | webapp: `app-layer/media/playbackUserVideoFirstResolve.ts:16-27` (WRITE, insert-on-conflict), `playbackHourlyRetention.ts`, `adminPlaybackHealthMetrics.ts`, `api/internal/media-playback-stats/retention/route.ts` (READ, админ) | без неё нет метрики «первый просмотр» и админской панели здоровья плеера | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`: staff-org OR `user_id=current_patient`), org=true (nullable) | **ВОПРОС** — стены на месте, но у `app_patient` НЕТ табличного гранта (только `app_staff`, `saas_system_health_owner`), а пишет запись пациентская сессия; ошибка глотается (`catch → logger.error; return false`, строки 29-35). Это шаблон «тихого нуля»: под кем реально исполняется вставка и не 42501 ли она молча? |
| `public.media_upload_sessions` | сессия многочастной загрузки файла: `owner_user_id`, `s3_key`, `upload_id`, `status`, `expected_size_bytes`, `expires_at` | webapp: `infra/repos/mediaUploadSessionsRepo.ts`, `infra/repos/s3MediaStorage.ts` (READ+WRITE); `packages/platform-merge/src/pgPlatformUserMerge.ts` (WRITE при слиянии аккаунтов) | без неё нельзя загрузить файл/видео кусками (обрывы, докачка) | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`: staff-org OR `owner_user_id=current_patient`), org=true (nullable); у `app_patient` — `INSERT,SELECT` + колоночный `UPDATE` на `status/completed_at/last_error/updated_at` | OK |
| `public.message_log` | журнал отправленных человеку сообщений: `user_id`, `text`, `category`, `channel_bindings_used`, `outcome`, `error_message`, `platform_user_id` | webapp: `infra/repos/pgMessageLog.ts` (READ+WRITE), `modules/doctor-cabinet/service.ts` (READ), `infra/platformUserFullPurge.ts` / `platformUserMergePreview.ts` (WRITE/READ при purge/merge) | без неё врач не видит историю переписки с пациентом и не доказать факт отправки | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`: staff-org OR `platform_user_id=current_patient`), org=true (nullable) | OK |
| `public.notification_delivery_attempts` | попытки доставки уведомления: `user_id`, `topic_code`, `channel`, `status`, `reason`, `endpoint_hash`, `recipient_ref`, `error_message` | integrator: `infra/db/repos/notificationDeliveryAttempts.ts`, `outgoingDeliveryQueue.ts`, `integrations/bersoncare/relayOutboundRoute.ts` (WRITE); webapp: `infra/repos/pgNotificationDeliveryAttempts.ts`, `app-layer/health/adminWebPushHealthMetrics.ts`, `collectAdminSystemHealthData.ts` (READ) | без неё не видно, дошло ли напоминание, и не работает диагностика доставки | клиника + пациент | rls=true/force=true, pol=2 (`p0_8_4` staff-org OR `user_id=current_patient`; + `c4_web_push_reminder_org` для `app_operational_web_push_reminder` по `current_setting('app.org')`), org=true (nullable, 8 строк с NULL из 12 626) | OK |
| `public.online_intake_answers` | ответы на анкету первичного обращения: `request_id`, `question_id`, `ordinal`, `value` | webapp: только через `online_intake_requests` (собственного репозитория нет; определение — `db/schema/schema.ts`, миграция `apps/webapp/migrations/048_online_intake.sql`) | без неё теряется содержимое онлайн-заявки пациента | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`: staff-org OR EXISTS по `online_intake_requests.user_id=current_patient`), org=true (nullable); `app_patient` — `INSERT,SELECT` | **ВОПРОС (В3)** — стены корректны, но в коде приложения нет ни одного читателя/писателя: только миграции. Мёртвая таблица или недостроенная функция |
| `public.online_intake_attachments` | файлы к анкете: `request_id`, `attachment_type`, `s3_key`, `url`, `mime_type`, `original_name` | webapp: `infra/platformUserFullPurge.ts` (READ ключей S3 при удалении) + `platformUserFullPurge.collectPurgeArtifactKeys.test.ts` | без неё не удалить файлы пациента из S3 при purge; без неё не приложить документы к заявке | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`, тот же EXISTS), org=true (nullable) | OK |
| `public.online_intake_requests` | сама заявка: `user_id`, `type`, `status`, `summary` | webapp: `infra/repos/pgChannelLinkClaim.ts`, `infra/platformUserMergePreview.ts`, `platformUserFullPurge.ts`, `app/app/doctor/clients/adminMergeAccountsLogic.ts`, `scripts/user-phone-admin.ts`; `packages/platform-merge/src/pgPlatformUserMerge.ts` (WRITE при слиянии) | без неё нет входящего потока онлайн-обращений | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`: staff-org OR `user_id=current_patient`), org=true (nullable); `app_patient` — `SELECT` + колоночный `INSERT` на `id/organization_id/summary/type/user_id` | OK |
| `public.online_intake_status_history` | смена статуса заявки: `from_status`, `to_status`, `changed_by`, `note` | webapp: `scripts/consolidate-owner-identity.sql`; определение — `migrations/048_online_intake.sql` | без неё нет аудита «кто перевёл заявку в отказ» | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`, EXISTS по заявке), org=true (nullable) | **ВОПРОС (В3)** — стены корректны; читателей в коде приложения нет (только миграция + разовый скрипт) |
| `public.org_enrollments` | прикрепление человека к клинике: `organization_id`, `platform_user_id`, `status`, `portal_activated_at`, `portal_activated_via` | webapp: `infra/repos/pgPatientOrganizationEnrollment.ts`, `pgPatientInvites.ts`, `pgBookingEngine.ts` (READ+WRITE); integrator: `infra/db/directPublic/resolveDirectPublicActor.ts`, `repos/integratorUserOrganizationSql.ts`, `reminders.ts`, `channelUsers.ts` (READ) | это и есть «пациент принадлежит клинике»; без неё рушится вся стена арендатора (на неё ссылаются политики `platform_users`, `reference_*`, `patient_home_*`) | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`: staff-org OR `platform_user_id=current_patient`), org=true (NOT NULL) | OK |
| `public.patient_bookings` | старые записи на приём: `platform_user_id`, `slot_start/end`, `status`, **`contact_phone`, `contact_email`, `contact_name`**, `city`, `category`, снапшоты цены/услуги | webapp: `infra/repos/pgPatientBookings.ts:124-168` (READ+WRITE, сырой SQL), `infra/platformUserFullPurge.ts`, `platformUserMergePreview.ts`, `scripts/purge-placeholder-bookings.ts`; integrator: `infra/db/repos/bookingCalendarMap.ts` | легаси-таблица записей; без неё теряется история бронирований до перехода на `be_appointments` | клиника + пациент | **rls=false/force=false, pol=0**, org=true (nullable) — **219 строк из 263 несут `organization_id IS NULL`** | **НАРУШЕНИЕ** — нет НИ клиники, НИ пациента. `SET ROLE app_staff` без принципала читает все 263 строки с телефонами/почтами |
| `public.patient_comorbidity` | сопутствующие заболевания: `patient_user_id`, `text`, `since`, `status`, `created_by`, `removed_at` | webapp: `infra/repos/pgPatientComorbidities.ts` (READ+WRITE) через `api/doctor/patients/[userId]/comorbidities/route.ts` | без неё врач не видит фон пациента | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`: staff-org OR `patient_user_id=current_patient`), org=true (nullable) | OK |
| `public.patient_content_rating_feedback` | оценка материала пациентом: `user_id`, `content_page_id`, `rating_value`, `reason_codes`, `comment` | webapp: `infra/repos/pgMaterialRatingFeedback.ts` (READ+WRITE), `app/app/doctor/clients/adminMergeAccountsLogic.ts`; `packages/platform-merge` (WRITE при слиянии) | без неё нет обратной связи по контенту | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`: staff-org OR `user_id=current_patient`), org=true (nullable) | OK |
| `public.patient_daily_warmup_presentations` | какая «разминка дня» показана пациенту: `user_id`, `content_page_id`, `last_rotation_at`, `skip_next_scheduled_rotation` | webapp: `infra/repos/pgPatientDailyWarmupPresentation.ts` (READ+WRITE) | без неё не ротируется ежедневный контент — пациент видит одно и то же | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`, `user_id`), org=true (nullable); `app_patient` — `INSERT,SELECT` + колоночный `UPDATE` | OK |
| `public.patient_daily_warmup_video_views` | просмотры видео-разминки: `user_id`, `content_page_id`, `viewed_at` | webapp: `modules/patient-home/recordDailyWarmupVideoView.ts`, `infra/repos/pgPatientDailyWarmupVideoView.ts` (WRITE), `api/patient/daily-warmup/video-viewed/route.ts`, `app-layer/stats/loadAdminReminderStats.ts` (READ) | без неё нет отметки «сделал разминку» и админ-статистики | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`, `user_id`), org=true (nullable; 1 строка NULL из 250) | OK |
| `public.patient_diary_day_snapshots` | слепок дня пациента: `platform_user_id`, `local_date`, `iana`, `warmup_done_count`, `plan_item_ids`, `plan_done_mask` | webapp: `infra/repos/pgPatientDiarySnapshots.ts` (READ+WRITE), `modules/patient-diary/captureDiaryDaySnapshot.ts`, `api/doctor/clients/[userId]/program-day-activity/route.ts` (READ врачом) | без неё дневник и «активность по дням» в карточке пациента пусты | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`, `platform_user_id`), org=true (nullable; **22 NULL из 582**) | OK по стенам; 22 строки с NULL-org недостижимы ни одной клиникой (см. В6) |
| `public.patient_files` | файлы в карте пациента: `patient_user_id`, `category`, `file_name`, `s3_key`, `mime_type`, `size_bytes`, `visit_id`, `uploaded_by_user_id` | webapp: `infra/repos/pgPatientFiles.ts`, `pgPatientClinical.ts` (READ+WRITE); маршруты `api/doctor/patients/[userId]/files/**`; `infra/strictPlatformUserPurge.ts`, `platformUserFullPurge.ts`; `scripts/check-storage-quota-race.mjs` (квота хранилища) | без неё нет медицинских документов в карте и не считается квота хранилища клиники | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`, `patient_user_id`), org=true (nullable) | OK |
| `public.patient_invites` | приглашение пациента в портал: `token_hash`, `invited_email_normalized`, `proof_code_hash`, `continuation_hash`, `expires_at`, `recipient_binding` | webapp: `infra/repos/pgPatientInvites.ts` (READ+WRITE); маршруты `api/join/email/start`, `api/join/email/confirm`, `api/join/exchange`, `api/doctor/patients/[userId]/portal-invite`; `app/join/[continuation]/page.tsx` | без неё врач не может пригласить пациента в личный кабинет | клиника + пациент (пациент — только через обмен токена, прямого чтения быть не должно) | rls=true/force=true, pol=1 (`p0_8_3`: **только** `app.is_staff() AND org`), org=true (NOT NULL); у `app_patient` гранта нет | OK — стена пациента реализована отсутствием доступа, что верно для таблицы секретов |
| `public.patient_lfk_assignments` | назначенные пациенту комплексы ЛФК: `patient_user_id`, `template_id`, `complex_id`, `assigned_by`, `is_active` | webapp: `infra/repos/pgLfkAssignments.ts`, `pgLfkTemplates.ts`, `pgLfkExercises.ts`, `pgDiaryPurge.ts` (READ+WRITE); `packages/platform-merge` (WRITE) | без неё пациент не видит назначенных упражнений | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`, `patient_user_id`), org=true (nullable) | OK |
| `public.patient_merge_candidates` | кандидаты на слияние дублей пациента: `anchor_user_id`, `candidate_user_id`, `reason`, `status`, `trigger_appointment_id`, `payload` | webapp: `infra/repos/pgPatientMergeCandidate.ts` (READ+WRITE); `scripts/patient-invites-disposable-proof.mjs` | без неё дубли пациентов не всплывают админу клиники | клиника + пациент (пациенту видеть нельзя) | rls=true/force=true, pol=1 (`p0_8_3`: только staff-org), org=true (NOT NULL); у `app_patient` гранта нет | OK |
| `public.patient_payment` | платежи пациента: `amount_minor`, `currency`, `kind`, `status`, `service`, `visit_id`, `provider`, `provider_payment_id` | webapp: `infra/repos/pgPatientPayments.ts`, `modules/patient-payments/service.ts` (READ+WRITE); маршруты `api/doctor/patients/[userId]/payment-timeline`, `.../acquiring-charge` | без неё нет финансовой истории по пациенту | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`, `patient_user_id`), org=true (nullable) | OK |
| `public.patient_practice_completions` | выполненные практики и самочувствие: `user_id`, `content_page_id`, `completed_at`, `feeling`, `notes` | webapp: `infra/repos/pgPatientPracticeCompletions.ts`, `pgWarmupFeelingCompletion.ts` (READ+WRITE), `api/doctor/patients/[userId]/exercise-calendar/route.ts` (READ врачом), `app-layer/stats/loadAdminReminderStats.ts` | без неё нет календаря упражнений и трекинга самочувствия | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`, `user_id`), org=true (nullable; 4 NULL из 242); `app_patient` — `INSERT,SELECT` + колоночный `UPDATE feeling` | OK |
| `public.patient_specialist_links` | **связь «пациент ↔ специалист»**: `organization_id`, `patient_user_id`, `specialist_id`, `status`, `created_via`, `ended_reason` | webapp: `infra/repos/pgPatientVisibilityLinks.ts:11-28` (READ+WRITE), `infra/repos/patientVisibilityPredicateSql.ts` (предикат видимости), `modules/patient-visibility/service.test.ts`, `scripts/backfill-patient-specialist-links.ts`; миграция `0365_visibility_stage_a_patient_links_screens_toggle_local.sql` | это та самая «недоделка» из модели видимости владельца — без неё «свой пациент» невыразим (см. `docs/_TODO/VISIBILITY_MODEL_GAP_2026-08-04.md` §1) | клиника + пациент (пациенту видеть чужие связи нельзя) | rls=true/force=true, pol=1 (`p0_8_3`: только staff-org), org=true (NOT NULL); у `app_patient` гранта нет. **На `bcb_webapp_dev` — `rls=t, force=f`** (evidence/13 §2.3) | **НАРУШЕНИЕ (только dev)** — на dev отсутствует FORCE, т.е. владелец таблицы обходит политику. На TEST — OK |
| `public.platform_user_contacts` | дополнительные контакты человека: `platform_user_id`, `contact_type`, **`value`, `value_normalized`**, `source` | webapp: `infra/repos/pgPlatformUserContacts.ts:33-35` (READ), маршруты `api/doctor/clients/[userId]/supplementary-contacts/**` (READ+WRITE), `modules/patient-booking/canonicalCreate.ts`, `service.ts`; `packages/platform-merge/src/mergeContactFallback.ts` | без неё нет запасных телефонов/почт пациента для связи и дедупликации | клиника + **пациент (обязателен: это чужие телефоны)** | rls=true/force=true, pol=1 — `saas_bootstrap_hybrid_p0_8_6`: `((current_org_id() IS NOT NULL AND organization_id = current_org_id()) OR (organization_id IS NULL AND нет принципала вовсе))`. org=true (nullable). `app_patient` держит `SELECT` | **НАРУШЕНИЕ — нет стены пациента.** В предикате НЕТ `current_patient_user_id()`: любая сессия с установленным `app.org` видит ВСЕ контакты организации. `app_patient` имеет SELECT, а пациентский принципал по построению может нести организацию (`packages/db-principal/src/index.ts:543-546`: «A patient identity may … carry the application-selected organization»). Второй хвост политики открывает все строки с `organization_id IS NULL` сессии БЕЗ принципала |
| `public.platform_users` | **единственная таблица ПДн**: `phone_normalized`, `display_name`, `first_name`, `last_name`, `email`, `birth_date`, `gender`, `patronymic`, `height_cm`, `weight_kg`, `is_blocked`, `merged_into_id` | весь продукт: `packages/db-principal/src/index.ts`, `packages/platform-merge/**` (9 файлов, READ+WRITE), integrator `shared/phoneLinkUserMessages.ts`, `devDeliveryRedirect.ts`, webapp — сотни мест | без неё нет ни одного человека в системе | клиника + пациент + корректный путь глобал-админа | rls=true/force=true, **pol=9**, org=false (стена — через `org_enrollments`/`be_organization_members`), 278 строк | **НАРУШЕНИЕ** — три политики `platform_users_identity_bootstrap_{select,insert,update}` выданы `PUBLIC` с предикатом `pg_has_role(CURRENT_USER,'app_identity_bootstrap','member')` без какого-либо org/own-фильтра. Членами `app_identity_bootstrap` являются логин-роли `bcb_test_nonstaff_login`, `bcb_test_integrator_login`, `bcb_dev_runtime_nonstaff_login`, `bcb_webapp_dev_user`, и у первых двух есть табличный `SELECT`. **Доказано исполнением:** `SET ROLE bcb_test_nonstaff_login; SELECT count(*) FROM platform_users` → **278**; то же под `bcb_test_integrator_login` → **278**; под `app_patient` → **0**. Т.е. пациентская/анонимная рантайм-роль читает ПДн ВСЕХ клиник без принципала |
| `public.product_analytics_events_recent` | сырые события продукта: `event_type`, `entry_channel`, `page_key`, `user_id`, `client_session_id`, `push_tracking_id`, `metadata` | webapp: `infra/repos/pgProductAnalytics.ts` (READ+WRITE), `pgDoctorAnalyticsMetricAccounts.ts`, `modules/product-analytics/productAnalyticsRetention.ts` (удаление по TTL), `app-layer/stats/loadAdminReminderStats.ts` | без неё нет продуктовой аналитики и воронки регистрации | клиника + пациент | rls=true/force=true, pol=2 (`p0_8_3` staff-org OR `user_id=current_patient`; **+ `product_analytics_registration_platform_operations_select` для `app_platform_settings`, `USING (event_type IN ('auth_register_attempt','auth_register_success','auth_register_failure'))` — без org-фильтра**), org=true (nullable) | **ВОПРОС** — вторая политика даёт `app_platform_settings` кросс-аренду по событиям регистрации вместе с `user_id`. Это осознанный «глобальный» путь (перепись §4 даёт роли scope GLOBAL) или дыра? |
| `public.product_analytics_user_hourly` | почасовая активность человека: `user_id`, `app_opens`, `page_views`, `push_opens`, `active_minutes`, `last_seen_at` | webapp: `infra/repos/pgProductAnalytics.ts`, `pgDoctorClients.ts` (READ — «активность пациента» в кабинете), `productAnalyticsRetention.ts` (WRITE/DELETE) | без неё врач не видит, заходит ли пациент в приложение | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`, `user_id`), org=true (nullable) | OK |
| `public.product_push_notifications` | отправленные push’и: `user_id`, `topic_code`, `push_kind`, `warmup_slogan_text`, `title`, `open_url` | webapp: `app-layer/product-analytics/createTrackedWebPushPayload.ts` (WRITE), `infra/repos/pgProductAnalytics.ts` (READ), `productAnalyticsRetention.ts` | без неё нельзя связать открытие приложения с конкретным push’ем | клиника + пациент | rls=true/force=true, pol=2 (`p0_8_3` `user_id` + `c4_web_push_reminder_org` по `current_setting('app.org')`), org=true (nullable) | OK |
| `public.program_action_log` | действия пациента по программе лечения: `instance_id`, `instance_stage_item_id`, `patient_user_id`, `action_type`, `payload`, `note` | webapp: `infra/repos/pgProgramActionLog.ts` (READ+WRITE), `modules/treatment-program/patient-program-actions.ts`, `modules/patient-diary/**`, `api/doctor/patients/[userId]/exercise-calendar/route.ts`, `app/app/doctor/patients/[userId]/programs/[instanceId]/page.tsx` | без неё врач не видит, что пациент делал по программе | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`, `patient_user_id`), org=true (nullable) | OK |
| `public.program_item_discussion_messages` | переписка врач↔пациент по пункту программы: `patient_user_id`, `sender_role`, `origin`, `body`, `media_file_id` | webapp: `infra/repos/pgProgramItemDiscussion.ts` (READ+WRITE), `pgDoctorClients.ts`, `s3MediaStorage.ts`, `api/patient/treatment-program-instances/**/discussion/route.ts` | без неё нет комментариев к упражнению — ключевой канал общения | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`, `patient_user_id`), org=true (nullable) | OK |
| `public.program_item_discussion_reads` | отметки прочтения обсуждения: `patient_user_id`, `instance_stage_item_id`, `last_read_at` | webapp: `infra/repos/pgProgramItemDiscussion.ts`, `pgDoctorClients.ts` (READ+WRITE) | без неё счётчики непрочитанного врут | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`, `patient_user_id`), org=true (nullable) | OK |
| `public.reminder_delivery_events` | события доставки напоминаний из интегратора: `integrator_delivery_log_id`, `integrator_user_id`, `channel`, `status`, `error_code`, `payload_json` | webapp: `infra/repos/pgReminderProjection.ts` (READ+WRITE), `app-layer/health/adminReminderPipelineMetrics.ts`, `infra/ops/webappIntegratorUserProjectionRealignment.ts`, `scripts/backfill-reminders-domain.mjs` | без неё не видно, дошло ли напоминание, и не считается здоровье конвейера | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`: staff-org OR `integrator_user_id = app.current_integrator_user_id()`), org=true (nullable) | OK |
| `public.reminder_journal` | действия пациента с напоминанием: `rule_id`, `occurrence_id`, `action`, `snooze_until`, `skip_reason` | webapp: `infra/repos/pgReminderJournal.ts` (READ+WRITE), `app/app/patient/reminders/journal/[ruleId]/page.tsx`, `RemindersPageBody.tsx` | без неё пациент не видит истории «отложил/пропустил» | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_3`: staff-org OR EXISTS по `reminder_rules.platform_user_id=current_patient`), org=true (nullable; **5 NULL из 9**) | OK по форме стены; но 5 из 9 строк с NULL-org — практически вся таблица вне аренды (В6) |
| `public.reminder_occurrence_history` | история срабатываний напоминаний: `integrator_occurrence_id`, `integrator_user_id`, `category`, `status`, `delivery_channel`, `seen_at`, `snoozed_until`, `skip_reason` | webapp: `infra/repos/pgReminderJournal.ts`, `pgReminderProjection.ts`, `pgReminderRules.ts`, `pgReminderMessengerTopicDisable.ts` (READ+WRITE), `app-layer/stats/loadAdminReminderStats.ts`, `adminReminderPipelineMetrics.ts` | без неё нет истории напоминаний и статистики соблюдения режима | клиника + пациент | rls=true/force=true, pol=1 (`p0_8_4`: staff-org OR EXISTS по `platform_users.integrator_user_id`), org=true (nullable) | OK |

---

## Класс C — данные клиники (13)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `public.motivational_quotes` | мотивационные цитаты клиники: `body_text`, `author`, `is_active`, `archived_at`, `sort_order` | webapp: `infra/repos/pgDoctorMotivationQuotesEditor.ts` (READ+WRITE, кабинет врача), `infra/repos/pgPatientHomeLegacyContent.ts:20-36` (READ **для главной пациента**), `modules/doctor-motivation-quotes/ports.ts` | без неё пропадает блок цитаты на главной пациента | клиника + пациент (пациент должен ЧИТАТЬ активные цитаты своей клиники) | rls=true/force=true, pol=1 (`p0_8_3`: **только** `app.is_staff() AND org`), org=true (nullable); у `app_patient` **нет ни гранта, ни политики** | **ВОПРОС** — контент явно пациентский (читается репозиторием главной пациента), но пациентского пути к нему в БД нет: под `app_patient` это `42501`. Либо страница рендерится не под пациентской ролью (тогда где стена?), либо блок цитат де-факто мёртв |
| `public.operator_health_failure_archive` | архив разобранных отказов здоровья: `health_probe`, `source_kind`, `severity_at_archive`, **`doctor_user_id`**, `archived_by_user_id`, `summary_json`, `raw_error_truncated` | webapp: `infra/repos/pgHealthFailureArchive.ts` (READ+WRITE), `api/admin/health-failure-archive/route.ts`, `modules/operator-health/healthFailureArchivePort.ts` | без неё админ не может «закрыть» разобранный инцидент и он висит вечно | клиника + корректный путь глобал-админа | rls=true/force=true, pol=2 (`p0_8_3` staff-org **+ `operator_health_failure_archive_platform_operations_select` для `app_platform_settings` с `USING true`**), org=true (nullable) | **ВОПРОС** — `USING true` даёт `app_platform_settings` чтение архива отказов ВСЕХ клиник вместе с `doctor_user_id`. Это и есть «путь глобал-админа» или он должен быть сужен? Роль `app_platform_settings` при этом выдана `app_staff` (членство), т.е. достижима из тенантного рантайма |
| `public.org_brand_revisions` | ревизии брендинга клиники: `status`, `display_name`, `logo_media_id`, `created_by/published_by/archived_by_platform_user_id`, `published_at` | webapp: `infra/repos/pgOrgBranding.ts` (READ+WRITE), `orgBrandRevisionGuard.postgres.integration.test.ts` | без неё клиника не может менять логотип/название с версионированием | клиника + пациент (пациент читает только опубликованное) | rls=true/force=true, pol=2 (`org_brand_revisions_exact_org_staff` — staff-org; `org_brand_revisions_enrolled_patient_published_read` — SELECT, `status='published' AND app.current_patient_has_active_org_enrollment(organization_id)`), org=true (NOT NULL) | OK — эталон правильной пары стен |
| `public.organization_member_invites` | приглашения сотрудников: `invited_email`, `invited_role`, `token_hash`, `status`, `expires_at`, `accepted_membership_id` | webapp: `infra/repos/pgOrganizationInvites.ts` (READ+WRITE), `infra/repos/seatUsageSql.ts`, `transactionQuotaPort.ts` (учёт мест по тарифу), `scripts/smoke-c2-identity-invite.mjs` | без неё нельзя завести второго врача в клинику | клиника; пациенту доступа быть не должно | rls=true/force=true, pol=1 (`p0_8_3`: только staff-org), org=true (NOT NULL); у `app_patient` гранта нет | OK |
| `public.organization_slug_claims` | занятые адреса клиник: `slug`, `kind`, `organization_id`, `created_by_platform_user_id` | webapp: `infra/repos/pgClinicDirectory.ts` (READ+WRITE) | без неё две клиники займут один публичный адрес | клиника; но по природе — реестр УНИКАЛЬНОСТИ через все клиники | rls=true/force=true, pol=1 (`organization_slug_claims_exact_org_staff` для `app_staff`: `organization_id = app.current_org_id()`), org=true (NOT NULL) | **ВОПРОС** — стена корректна, но реестр уникальности, где каждый видит только свою строку, не может ответить «свободен ли slug». Проверка занятости, видимо, идёт через SECURITY DEFINER — надо зафиксировать этот путь в декларации, иначе стена и функция противоречат друг другу |
| `public.organization_slug_rename_events` | журнал переименований: `actor_platform_user_id`, `previous_slug`, `next_slug` | webapp: `infra/repos/pgClinicDirectory.ts` (WRITE+READ) | без неё нет аудита смены публичного адреса | клиника | rls=true/force=true, pol=2 (`…_select_org_staff` SELECT + `…_insert_org_staff` INSERT, обе `organization_id = app.current_org_id()` для `app_staff`), org=true (NOT NULL) | OK |
| `public.patient_home_blocks` | блоки главной пациента (настройка клиники): `code`, `title`, `description`, `is_visible`, `sort_order`, `icon_image_url` | webapp: `infra/repos/pgPatientHomeBlocks.ts` (READ+WRITE), `app/app/settings/patient-home/actions.ts` (WRITE, настройки), `app/app/patient/page.tsx`, `modules/patient-home/todayConfig.ts`, `modules/web-push/createLoadWarmupPushContext.ts` (READ) | без неё главная пациента пустая | клиника + пациент (пациент читает блоки своей клиники) | rls=true/force=true, pol=2 (`p0_8_3` staff-org + `patient_current_org_select` SELECT: пациент с активным `org_enrollments` в текущей орг), org=true (nullable) | OK |
| `public.patient_home_block_items` | элементы блоков: `block_code`, `target_type`, `target_ref`, `title_override`, `badge_label`, `is_visible`, `sort_order` | webapp: `infra/repos/pgPatientHomeBlocks.ts`, `pgContentSections.ts` (READ+WRITE), `app/app/settings/patient-home/actions.ts`, `modules/patient-home/usefulPostPresentation.ts` | без неё блоки пустые | клиника + пациент | rls=true/force=true, pol=2 (`p0_8_4` staff-org + `patient_current_org_select`), org=true (nullable) | OK |
| `public.product_analytics_hourly` | агрегат событий по часам (без человека): `bucket_hour`, `event_type`, `entry_channel`, `page_key`, `topic_code`, `event_count` | webapp: `infra/repos/pgProductAnalytics.ts:515-521` (READ+WRITE/DELETE), `modules/product-analytics/productAnalyticsRetention.ts`; роль `app_operational_web_push_reminder` — `INSERT,SELECT,UPDATE` | без неё нет агрегированных графиков продукта | клиника (агрегат без пациента — стена пациента не нужна) | **rls=false/force=false**, при этом pol=1 (`c4_web_push_reminder_org`) — **политика есть, RLS выключен, значит политика недействующая**; org=true (nullable, **5300 NULL из 5421**) | **НАРУШЕНИЕ** — нет стены клиники. `SET ROLE app_staff` без принципала читает все 5421 строк. Отдельно: политика уже написана и молча не работает — это худший вид «зелёного» состояния |
| `public.recommendations` | справочник рекомендаций клиники: `title`, `body_md`, `media`, `tags`, `body_region_id`, `quantity_text`, `frequency_text`, `domain` | webapp: `infra/repos/pgRecommendations.ts` (READ+WRITE), `modules/recommendations/recommendationCatalogSsrQuery.ts`, `recommendationDomain.ts`, `modules/patient-clinical/service.ts` | без неё врачу нечего назначать | клиника; пациент видит только копию внутри программы | rls=true/force=true, pol=1 (`p0_8_3`: только staff-org), org=true (nullable); у `app_patient` гранта нет | OK |
| `public.recommendation_regions` | связь рекомендация↔область тела: `recommendation_id`, `body_region_id` | webapp: `infra/repos/pgRecommendations.ts` (READ+WRITE) | без неё не работают фильтры каталога по области тела | клиника | rls=true/force=true, pol=1 (`p0_8_3`: только staff-org), org=true (nullable) | OK |
| `public.reference_categories` | категории справочников клиники: `code`, `title`, `is_user_extensible`, `owner_id`, `tenant_id` | webapp: `infra/repos/pgReferences.ts` (READ+WRITE), `modules/lfk-exercises/exerciseLoadTypeReference.ts`, `modules/tests/clinicalTestAssessmentKind.ts`, `modules/recommendations/recommendationDomain.ts` | без неё пусты все выпадающие списки каталогов | клиника + пациент (пациент читает справочник своей клиники) | rls=true/force=true, pol=3 (`p0_8_3` staff-org; `reference_catalog_patient_select` для `app_patient` — org + активный `org_enrollments`; `reference_catalog_seed_owner` для `app_owner` — только пока нет receipt), org=true (NOT NULL) | OK — эталон: обе стены + явный засевочный шов |
| `public.reference_items` | элементы справочников: `category_id`, `code`, `title`, `sort_order`, `is_active`, `meta_json`, `deleted_at` | webapp: `infra/repos/pgReferences.ts`, `shared/ui/doctor/ReferenceMultiSelect.tsx`, `DoctorCatalogFiltersForm.tsx`, `api/doctor/clinical-tests/route.ts`, `modules/tests/**`, `modules/recommendations/**` | то же | клиника + пациент | rls=true/force=true, pol=3 (те же три), org=true (NOT NULL) | OK |

---

## Класс S — системные таблицы платформы (9)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `public.operator_health_alert_sent` | отметки «алерт с таким ключом уже отправлен»: `dedup_key`, `severity`, `sent_at` | webapp: `infra/repos/pgOperatorHealthAlertSent.ts:12-26` (READ+WRITE), `app-layer/health/collectAdminSystemHealthData.ts`; схема — `packages/operator-db-schema/src/operatorHealthAlertSent.ts` | без неё оператор получает один и тот же алерт бесконечно | стена своей роли (платформенный оператор), тенантным ролям доступа быть не должно | **rls=false/force=false, pol=0**, org=false; ACL: `app_staff` — `SELECT,INSERT,UPDATE,DELETE`, `saas_system_health_owner` — SELECT | **НАРУШЕНИЕ** — стены нет вообще, а полный CRUD у ТЕНАНТНОЙ роли `app_staff`. Доказано: `SET ROLE app_staff` без принципала → 56 строк |
| `public.operator_incidents` | реестр инцидентов интеграций: `dedup_key`, `direction`, `integration`, `error_class`, `error_detail`, `occurrence_count`, `alert_claim_token` | integrator: `infra/db/repos/operatorHealthDrizzle.ts:69-80` (READ+WRITE); webapp: `infra/repos/pgOperatorHealthWrite.ts`, `pgOperatorHealthRead.ts`, `pgCuratedSystemHealthDiagnostics.ts`, `app-layer/health/**` (READ), `api/admin/operator-incidents/{resolve-all,acknowledge-all}/route.ts` (WRITE) | без неё платформа не знает, что интеграция сломалась; на ней стоит вся панель здоровья | стена своей роли | **rls=false/force=false, pol=0**, org=false; ACL: `app_staff` — полный CRUD, `app_owner` — `INSERT,SELECT` + колоночный UPDATE, `saas_system_health_owner` — SELECT | **НАРУШЕНИЕ** — тенантная роль `app_staff` читает И ПИШЕТ платформенный реестр инцидентов (в т.ч. `alert_claim_token`). Доказано: `SET ROLE app_staff` → 9 строк |
| `public.operator_job_status` | состояние фоновых задач: `job_key`, `job_family`, `last_status`, `last_started_at`, `last_error`, `meta_json` | webapp: `app-layer/operator-health/recordOperatorCronJobTick.ts:29` (WRITE, «best-effort upsert»), `pingOperatorHeartbeat.ts`, `infra/repos/pgOperatorHealthWrite.ts`/`pgOperatorHealthRead.ts`, `modules/operator-health/**` (10+ файлов), `api/internal/media-transcode/reconcile/route.ts`; integrator: `infra/db/repos/operatorHealthDrizzle.ts` | без неё не видно, живы ли крон-задачи; это корень 61 050 отказов из FACTS §1.1 | стена своей роли | rls=true/force=true, pol=3 — но одна из них `saas_enforce_default_deny_p0_9_1` для `PUBLIC` с **`USING true` / `CHECK true`**; две другие (`c4_web_push_reminder_status`, `…_restrictive`) сужают только `app_operational_web_push_reminder`. org=false; `app_staff` — полный CRUD | **НАРУШЕНИЕ** — «default_deny» по имени, `USING true` по факту: для всех, кроме web-push-роли, стены нет. `SET ROLE app_staff` → 20 строк, и у неё же INSERT/UPDATE/DELETE на состояние планировщика платформы |
| `public.outgoing_delivery_queue` | очередь исходящих сообщений: `event_id`, `kind`, `channel`, **`payload_json` (тело сообщения человеку)**, `status`, `attempt_count`, `next_retry_at`, `last_error`, `priority` | integrator: `infra/db/repos/outgoingDeliveryQueue.ts:69-210` (READ+WRITE, сырой SQL), `infra/runtime/worker/outgoingDeliveryWorker.ts`, `kernel/domain/usecases/processAcceptedIncomingEvent.ts`, `infra/delivery/deliveryContract.ts`; роль `app_operational_delivery_worker` — `SELECT,UPDATE` | без неё не уходит ни одно сообщение пациенту | стена клиники (несёт `organization_id`) + стена своей роли; в payload — тексты пациенту | **rls=false/force=false, pol=0**, org=true (nullable) — **812 строк из 812 несут `organization_id IS NULL`** | **НАРУШЕНИЕ** — известный дефект FACTS §1.3, не починен. Хуже, чем «нет RLS»: сам дискриминатор аренды не заполняется НИ РАЗУ, поэтому включение RLS в лоб отрежет всю доставку. `SET ROLE app_staff` → 812 строк с телами сообщений |
| `public.password_altcha_challenges` | одноразовые задачи-«капчи» при входе по паролю: `identifier_key`, `purpose`, `challenge_digest`, `expires_at`, `consumed_at` | webapp — **только через SECURITY DEFINER**: `infra/repos/pgPasswordLoginProtection.ts:43` (`app.password_login_acquire`), `modules/auth/passwordAltcha.ts`, `app/api/auth/email-password/login/challenge/route.ts` | без неё вход по паролю открыт для перебора | стена своей роли | rls=false/force=false, pol=0, org=false; ACL: **только** `app_owner` (владелец definer-функций) и мигратор — ни одной тенантной роли | **ВОПРОС** — достижимости из рантайма нет (стена = GRANT + definer-шов, это строже RLS), но буква правила владельца требует «стену своей роли». Признать grant-стену достаточной для definer-only таблиц и записать это в декларацию — или включать RLS? |
| `public.password_login_identifier_protection` | защита от перебора по идентификатору: `identifier_key`, `failed_attempts`, `next_allowed_at`, `locked_until`, `verification_lease_token`, `leased_user_id` | там же: `pgPasswordLoginProtection.ts:43,83` (`app.password_login_acquire` / `app.password_login_complete`), `modules/auth/passwordLoginProtection.ts` | без неё пароль подбирается без ограничений | стена своей роли | rls=false/force=false, pol=0, org=false; ACL: только `app_owner` + мигратор | **ВОПРОС** — тот же, что выше |
| `public.phone_challenges` | SMS-челленджи входа: `phone`, **`code` (ОТП в открытом виде)**, `expires_at`, `channel_context`, `verify_attempts` | webapp — задумано только через definer: `infra/repos/pgPublicBookingOtp.ts:30,44` (`app.phone_otp_public_booking_*`); прямой путь — `modules/auth/phoneChallengeStore.ts:5-13` (комментарий: «code хранится для проверки введённого кода в вебапп»), `infra/platformUserFullPurge.ts` | без неё нет входа по телефону и публичной записи на приём | клиника + пациент (это телефон человека и его код входа) | **rls=false/force=false, pol=0**, org=false; ACL: `app_staff` — полный CRUD, `app_owner` — полный CRUD | **НАРУШЕНИЕ** — ни клиники, ни пациента. `SET ROLE app_staff` без принципала → 4 строки (живые коды входа + телефоны). Комментарий самого репозитория (`pgPublicBookingOtp.ts:6-8`) говорит: «вызывающей рантайм-роли нужен EXECUTE на функцию и **НИЧЕГО** на `public.phone_challenges`» — фактический грант противоречит собственному контракту |
| `public.phone_messenger_bind_secrets` | секреты привязки мессенджера к телефону: `token_hash`, `phone_normalized`, `channel_code`, `purpose`, `user_id`, `status`, `expires_at` | webapp: `infra/repos/pgPhoneMessengerBind.ts:407-451` (READ+WRITE, сырой SQL) | без неё нельзя привязать Telegram/MAX к аккаунту | клиника + пациент | **rls=false/force=false, pol=0**, org=false; ACL: `app_staff` — полный CRUD | **НАРУШЕНИЕ** — `SET ROLE app_staff` без принципала → 26 строк с `token_hash`/телефонами/`user_id`. Ни одной стены |
| `public.phone_otp_locks` | блокировки по телефону после неудачных ОТП: `phone_normalized`, `locked_until`, `lockout_cycle` | webapp: `infra/repos/pgPhoneOtpLimits.ts`, `pgPublicBookingOtp.ts`, `modules/public-booking/publicBookingRateLimit.ts` | без неё ОТП перебирается | клиника + пациент (телефон) | **rls=false/force=false, pol=0**, org=false; ACL: `app_staff` — полный CRUD, `app_owner` — полный CRUD | **НАРУШЕНИЕ** — стены нет; `app_staff` может СНЯТЬ блокировку перебора любому телефону (есть UPDATE/DELETE). Тот же контракт `pgPublicBookingOtp.ts:6-8` требует «НИЧЕГО на `public.phone_otp_locks`» |

---

## Класс R — глобальный справочник (1)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `public.reference_catalog_baselines` | версионированные глобальные шаблоны справочников: `version`, `definition_json`, `created_at`. Комментарий таблицы дословно: *«Versioned global templates copied once into a new organization. Existing organization catalogs are never synchronized from this table.»* | НЕ приложение: `deploy/postgres/reference-catalog-rls.sql`, `deploy/postgres/smoke-reference-catalog-force-rls.sql`, `scripts/a0-greenfield-baseline-lib.mjs`, миграция `0182_reference_catalog_snapshots.sql`; чтение — из `app.seed_reference_catalog_snapshot(uuid)` (SECURITY DEFINER) | без неё новая клиника создаётся с пустыми справочниками | глобальный справочник — арендной стены НЕ нужно; нужен запрет записи из рантайма | rls=false/force=false, pol=0, org=false; ACL: только `app_owner` — `SELECT` (и мигратор) | OK — единственный грант рантайму это `SELECT` у `app_owner`, который и владеет засевочной definer-функцией. Записи из рантайма нет |

---

## Класс T — техническое (2)

| Таблица | Что внутри | Кто пользуется (READ/WRITE) | Зачем | Нужные стены | Сейчас | Вердикт |
|---|---|---|---|---|---|---|
| `public.media_transcode_jobs` | очередь перекодирования видео: `media_id`, `status`, `attempts`, `locked_at/by`, `last_error`, `next_attempt_at` | media-worker: `apps/media-worker/src/jobs/claim.ts`, `processTranscodeJob.ts`, `processProgramSubmissionTranscode.ts`, `main.ts` (READ+WRITE); webapp: `infra/repos/pgMediaTranscodeJobs.ts`, `app-layer/media/mediaTranscodeAutoEnqueue.ts`, `programSubmissionTranscodeEnqueue.ts` (WRITE), `pgAdminTranscodeHealthMetrics.ts` (READ) | без неё загруженное видео не превращается в проигрываемое | клиника + пациент (задание привязано к медиа пациента) | rls=true/force=true, pol=1 (`p0_8_4`, расширенная: `pg_has_role(CURRENT_USER,'app_worker')` **OR** `pg_has_role(…,'app_operational_media_worker')` OR staff-org OR пациент через EXISTS по `media_files.uploaded_by`), org=true (nullable) | OK — воркер-роли намеренно проходят мимо арендной стены (модель владельца: фильтр воркера на ENQUEUE, не в RLS). Зафиксировать это исключение в декларации явно |
| `public.reference_catalog_snapshot_receipts` | расписка «этой клинике справочник уже засеян»: `organization_id`, `baseline_version`, `seeded_at`. Комментарий: *«One immutable baseline-version receipt per organization…»* | НЕ приложение: `deploy/postgres/reference-catalog-rls.sql`, `deploy/postgres/privileges/declaration.ts:797,931`, миграции `0183`/`0184_reference_catalog_org_insert_hook.sql`, `deploy/host/deploy-test-saas.sh`; читается ИЗ политик `reference_catalog_seed_owner` на `reference_categories`/`reference_items` | без неё справочник клиники будет пересеян поверх правок врача | несёт `organization_id` → по правилу владельца обязана нести стену клиники | **rls=false/force=false, pol=0**, org=true (NOT NULL); ACL: только `app_owner` — `INSERT,SELECT` (+ мигратор); `SET ROLE app_staff` → `permission denied` | **НАРУШЕНИЕ (формальное) + ВОПРОС** — это новый дефект переписи (evidence/13 §2.3, GAP G7 в `deploy/postgres/privileges/declaration.ts:50-52`): org-таблица без RLS+FORCE. Фактической достижимости из тенантных ролей нет (грант только `app_owner`), но её читают ПОЛИТИКИ других таблиц через `EXISTS` — включение RLS здесь изменит поведение засева, поэтому это не механическая правка |

---

## НАРУШЕНИЯ — точный список отсутствующих стен (12)

Порядок — по тяжести.

**Н1. `public.platform_users` — стена ПДн пробита логин-ролями (стена клиники + стена пациента).**
Отсутствует: org/own-фильтр в трёх политиках `platform_users_identity_bootstrap_{select,insert,update}`
(предикат — только `pg_has_role(CURRENT_USER,'app_identity_bootstrap','member')`, `polroles = PUBLIC`).
Доказано исполнением:
```
SET ROLE bcb_test_nonstaff_login;   SELECT count(*) FROM public.platform_users;  -- 278
SET ROLE bcb_test_integrator_login; SELECT count(*) FROM public.platform_users;  -- 278
SET ROLE app_patient;               SELECT count(*) FROM public.platform_users;  -- 0
```
Членство (`pg_auth_members`): `bcb_test_nonstaff_login`, `bcb_test_integrator_login`,
`bcb_dev_runtime_nonstaff_login`, `bcb_webapp_dev_user` → `app_identity_bootstrap`. У первых двух есть и
табличный `SELECT` на `platform_users`. `pg_has_role(…,'member')` истинно независимо от `NOINHERIT`.
⚠ FACTS §1.4 фиксирует «`app_patient` под SET ROLE видит 0» — это верно и вводит в заблуждение: дыра не в
терминальной роли, а в ЛОГИН-ролях, которых замер §1.4 не касался.

**Н2. `public.phone_challenges` — нет стены клиники и нет стены пациента.**
Отсутствует: RLS (`relrowsecurity=f`), политики (0), и снят грант, который контракт кода запрещает.
`SET ROLE app_staff` (без принципала) → 4 строки, включая `code` (ОТП открытым текстом) и `phone`.
Контракт нарушен явно: `apps/webapp/src/infra/repos/pgPublicBookingOtp.ts:6-8`.

**Н3. `public.phone_otp_locks` — нет стены клиники и нет стены пациента.**
Отсутствует: RLS, политики. `app_staff` имеет `SELECT,INSERT,UPDATE,DELETE` → тенантная роль может снять
антиперебор любому телефону. Тот же нарушенный контракт `pgPublicBookingOtp.ts:6-8`.

**Н4. `public.phone_messenger_bind_secrets` — нет стены клиники и нет стены пациента.**
Отсутствует: RLS, политики. `SET ROLE app_staff` → 26 строк (`token_hash`, `phone_normalized`, `user_id`).

**Н5. `public.patient_bookings` — нет стены клиники и нет стены пациента.**
Отсутствует: RLS, политики. `SET ROLE app_staff` → 263 строки с `contact_phone`/`contact_email`/`contact_name`.
Дополнительно: 219 из 263 строк несут `organization_id IS NULL` — дискриминатор аренды не заполнен, поэтому
одним `ENABLE ROW LEVEL SECURITY` дефект не закрыть (стена отрежет 83% данных). Известен как FACTS §1.3.

**Н6. `public.outgoing_delivery_queue` — нет стены клиники и нет стены роли.**
Отсутствует: RLS, политики. `SET ROLE app_staff` → 812 строк с `payload_json` (тексты сообщений людям).
**812 из 812 строк имеют `organization_id IS NULL`** — колонка есть, не пишется никогда. Известен как FACTS §1.3.

**Н7. `public.product_analytics_hourly` — нет стены клиники; политика написана и НЕ РАБОТАЕТ.**
Отсутствует: `ENABLE ROW LEVEL SECURITY` (`relrowsecurity=f`) при `pol=1` (`c4_web_push_reminder_org`).
`SET ROLE app_staff` → 5421 строка. 5300 из 5421 — `organization_id IS NULL`. Известен как FACTS §1.3.

**Н8. `public.operator_job_status` — платформенная таблица без стены своей роли.**
Отсутствует: реальный предикат в политике `saas_enforce_default_deny_p0_9_1` (`polroles=PUBLIC`,
`USING=true`, `CHECK=true`). RLS+FORCE включены, поэтому проверка «rls=t» её пропускает.
`SET ROLE app_staff` → 20 строк; у `app_staff` полный CRUD на состояние планировщика платформы.

**Н9. `public.operator_incidents` — платформенная таблица без стены своей роли.**
Отсутствует: RLS, политики. `SET ROLE app_staff` → 9 строк; полный CRUD у тенантной роли,
включая `alert_claim_token`/`acknowledged_at`.

**Н10. `public.operator_health_alert_sent` — платформенная таблица без стены своей роли.**
Отсутствует: RLS, политики. `SET ROLE app_staff` → 56 строк; полный CRUD у тенантной роли.

**Н11. `public.platform_user_contacts` — нет стены пациента.**
Отсутствует: пациентский предикат. Политика `saas_bootstrap_hybrid_p0_8_6` целиком:
```
((app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
 OR (organization_id IS NULL AND app.current_org_id() IS NULL
     AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL
     AND NOT app.is_staff()))
```
Первый дизъюнкт НЕ требует `app.is_staff()`. `app_patient` держит `SELECT`, а пациентский принципал
по построению может нести организацию (`packages/db-principal/src/index.ts:543-546`). Итог: пациент,
открывший экран конкретной клиники, читает телефоны/почты ВСЕХ людей этой клиники.
Второй дизъюнкт отдельно открывает все строки с `organization_id IS NULL` сессии вообще без принципала
(сейчас таких строк 0 — дыра дремлет, не закрыта).

**Н12. `public.reference_catalog_snapshot_receipts` — org-таблица без RLS+FORCE (формально).**
Отсутствует: RLS, политики при `organization_id NOT NULL`. Фактической достижимости из тенантных ролей
нет (`SET ROLE app_staff` → `permission denied`), но правило владельца и §A.9 требуют RLS на org-таблице.
Уже помечено как GAP G7 в `deploy/postgres/privileges/declaration.ts:50-52,797`.

**Н13 (только `bcb_webapp_dev`). `public.patient_specialist_links` — RLS без FORCE.**
На dev `relrowsecurity=t, relforcerowsecurity=f` (evidence/13 §2.3) → владелец таблицы обходит политику.
На TEST — `t/t`, чисто. Управляемые базы расходятся, декларация обязана иметь per-базовый раздел.

*(Счёт «12» в сводке — по TEST; Н13 — тринадцатый дефект, живущий только на dev.)*

---

## ВОПРОСЫ (9)

**В1. `platform_users` / bootstrap-политики — что именно должна была разрешать `app_identity_bootstrap`?**
Регистрация нового человека требует INSERT до появления org-контекста — это понятно. Но текущая форма даёт
той же роли и **SELECT по всем 278 строкам**, и **UPDATE по всем**. Должен ли bootstrap-путь быть
(а) только INSERT, (б) SELECT, суженный до строки, которую сессия сейчас создаёт (по
`phone_normalized`/`email_normalized` из аргумента), (в) целиком перенесён в SECURITY DEFINER-аксессор?
Выбор — владельца/лида, потому что меняет форму регистрации, а не только SQL.

**В2. `app_platform_settings` с `USING true` — это и есть «правильный доступ глобал админа»?**
Два места в срезе: `operator_health_failure_archive_platform_operations_select` (`USING true`, содержит
`doctor_user_id` всех клиник) и `product_analytics_registration_platform_operations_select`
(`USING (event_type IN (…register…))`, содержит `user_id` всех клиник). Перепись §4 присваивает роли
scope GLOBAL. Но `app_platform_settings` **выдана `app_staff`** (`pg_auth_members`: `app_staff → app_platform_settings`),
т.е. достижима из тенантного рантайма. Вопрос: глобальный путь должен идти через эту роль или через
отдельную админскую роль, недостижимую из staff-сессии?

**В3. `online_intake_*` — четыре таблицы без единого потребителя в коде приложения.**
`online_intake_answers` (4 строки) и `online_intake_status_history` (8 строк) не читает и не пишет ни один
файл в `apps/**/src` — только миграции `048_online_intake.sql`, `0150_p0_4_p5_online_intake_org.sql` и
`scripts/consolidate-owner-identity.sql`. У `online_intake_requests`/`_attachments` потребители есть, но
только по слиянию/удалению аккаунтов (`platformUserFullPurge.ts`, `pgPlatformUserMerge.ts`), не по
продуктовому пути. Это функция, которую не достроили, или мёртвая ветка под удаление? Стены на них
корректные — вопрос не про стены, а про то, надо ли их вообще держать.

**В4. `motivational_quotes` — пациентский контент без пациентского пути к нему.**
`infra/repos/pgPatientHomeLegacyContent.ts:20-36` читает активные цитаты для главной пациента, но у
`app_patient` нет ни гранта, ни политики (единственная политика — `app.is_staff() AND org`). Значит либо
блок цитат на главной пациента не работает (тихий `42501`), либо страница рендерится под НЕ пациентской
ролью — и тогда надо назвать, под какой, потому что это обход стены пациента на пациентском экране.

**В5. `password_altcha_challenges` / `password_login_identifier_protection` — достаточно ли GRANT-стены?**
Обе `rls=f, pol=0`, но грант только у `app_owner` (владелец definer-функций) и мигратора; ни одна тенантная
роль их не достаёт. Это строже RLS. Записать в декларацию как признанный класс «definer-only, стена = GRANT»
или всё равно включать RLS ради единообразия проверки «org=false → своя роль»?

**В6. Дискриминатор аренды пуст на живых таблицах — чинить данные или менять стену?**
Замер `count(*) FILTER (WHERE organization_id IS NULL)` по срезу:
`outgoing_delivery_queue` 812/812 · `product_analytics_hourly` 5300/5421 · `patient_bookings` 219/263 ·
`patient_diary_day_snapshots` 22/582 · `reminder_journal` 5/9 · `notification_delivery_attempts` 8/12626 ·
`patient_practice_completions` 4/242 · `patient_daily_warmup_video_views` 1/250.
На таблицах со включённым RLS эти строки уже сегодня невидимы никому (стена fail-closed) — то есть данные
де-факто потеряны для продукта. Порядок работ: сперва backfill `organization_id`, потом включение стены —
или включаем стену и списываем NULL-строки? Это решение владельца, оно про данные, а не про SQL.

**В7. `organization_slug_claims` — реестр уникальности под арендной стеной.**
Политика `organization_slug_claims_exact_org_staff` показывает клинике только её собственные строки. Проверка
«свободен ли slug» через такую стену невозможна в принципе (чужая занятая строка невидима → выглядит как
свободная, а `UNIQUE` даст ошибку на вставке). Через какой definer/шов реально идёт проверка занятости и
надо ли объявить его в декларации как исключение?

**В8. `media_playback_user_video_first_resolve` — кто пишет и почему у `app_patient` нет гранта?**
Вставку делает `app-layer/media/playbackUserVideoFirstResolve.ts:16-27` на пациентском действии, ошибки
глотаются (`catch → logger.error; return false`, строки 29-35), `organization_id` при вставке не задаётся,
табличного гранта у `app_patient` нет. Либо путь исполняется под staff-ролью (тогда назвать её), либо
563 строки писались до включения стен и сейчас метрика молча не пишется.

**В9. `media_transcode_jobs` — обход арендной стены воркер-ролями зафиксировать явно.**
Политика начинается с `pg_has_role(CURRENT_USER,'app_worker') OR pg_has_role(CURRENT_USER,'app_operational_media_worker')`
— это полный обход org-фильтра. Соответствует модели «фильтр воркера на ENQUEUE, не в RLS», но в декларации
такой обход должен стоять как ИМЕНОВАННОЕ исключение с обоснованием, иначе следующий аудит прочитает его
как дефект. Подтвердить формулировку.

---

## Приложение — команды, которыми получены значения

```bash
L="'media_playback_user_video_first_resolve',…,'reminder_occurrence_history'"   # 58 имён среза

# состояние стен
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT c.relname||'|rls='||c.relrowsecurity
  ||'|force='||c.relforcerowsecurity||'|pol='||(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  WHERE c.relname IN ($L) ORDER BY 1;"

# тексты политик
sudo -u postgres psql -d bersoncarebot_test -Atc "SELECT c.relname||' | '||p.polname||' | '||p.polcmd::text
  ||' | '||CASE WHEN p.polpermissive THEN 'PERM' ELSE 'RESTR' END
  ||' | roles='||coalesce((SELECT string_agg(r.rolname,'+') FROM pg_roles r WHERE r.oid = ANY(p.polroles)),'PUBLIC')
  ||' | USING='||coalesce(pg_get_expr(p.polqual,p.polrelid),'-')
  ||' | CHECK='||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'-')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
  JOIN pg_policy p ON p.polrelid=c.oid WHERE c.relname IN ($L) ORDER BY 1,2;"

# гранты (табличные и колоночные)
… information_schema.role_table_grants / information_schema.column_privileges …

# пустой дискриминатор аренды
… count(*) FILTER (WHERE organization_id IS NULL) по каждой org-таблице среза …

# доказательства исполнением (только счётчики, ни одной строки ПДн не прочитано)
sudo -u postgres psql -d bersoncarebot_test -Atc "SET ROLE bcb_test_nonstaff_login;
  SELECT count(*) FROM public.platform_users;"     # 278
sudo -u postgres psql -d bersoncarebot_test -Atc "SET ROLE app_staff;
  SELECT count(*) FROM public.patient_bookings;"   # 263   (и т.д. по Н2…Н10)
```

Код: `node /home/dev/brain/tools/code-search.mjs "<таблица>" --repo bcb -k 6` + точный
`rg -l --glob '!**/node_modules/**' --glob '!**/db/schema/**' --glob '!**/drizzle-migrations/**' -e "<camelCase>" -e "<snake_case>" apps packages`.
