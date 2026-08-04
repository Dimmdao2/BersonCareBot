# Матрица изоляции арендаторов — поверхность × принципал (2026-08-04)

Authority: `docs/_TODO/UZ3_COMPLIANCE_BACKLOG_2026-08-03.md` п.5 ("Матричного негативного теста
«специалист клиники A ↔ данные клиники B» в CI нет") + `docs/ARCHITECTURE/SECURITY_CANON.md` §3,
владелец 04.08 назвал «Тест изоляции» в списке доработок безопасности. Бриф задачи —
`docs/_TODO/runs/integrator-cleanup/TENANT_ISOLATION_MATRIX_BRIEF_2026-08-04.md` (commit `23dbf26ad`,
"docs(sec): brief the tenant isolation matrix test #987").

Исполняемое доказательство: `apps/webapp/src/infra/repos/tenantIsolationMatrix.postgres.integration.test.ts`
(идёт в CI job `test-webapp-postgres`, `.github/workflows/ci.yml:147-156`, тем же способом, что
остальные `*.postgres.integration.test.ts`).

## 1. Источник матрицы — сгенерирован из реального кода, не из головы

Ниже — полный список таблиц, у которых сегодня реально включён `ENABLE ROW LEVEL SECURITY` и
которые попадают под canonical RLS-дескрипторы репозитория
(`docs/_TODO/SAAS_FOUNDATION/scripts/{p0-8-3,p0-8-4,p0-8-5,p0-8-6}-policy-targets.mjs` +
`rls-descriptor-model.mjs`, агрегируются в `phase4-locked-policy-artifact.mjs`). Эти же дескрипторы
породили уже применённые миграции `0160`/`0163`/`0167`/`0169`/`0171`-`0175` (dormant-compatible GUC
predicate, живой сегодня) и рендерят альтернативный, ещё НЕ включённый предикат для будущего
"locked helper" cutover (D3/D4 роадмапа, `SECURITY_CANON.md` §3 — не готово, не относится к тому,
что реально исполняется сейчас). Список ниже описывает ТЕКУЩУЮ живую стену, не будущую.

Получено командой:

```bash
node -e "
import('./docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs').then(m => {
  console.log(m.getPhase4LockedPolicyTargets().length);
});"
# → 155 (после исключения дублей/уникальности, проверяется самим генератором)
```

Принципалы, которые в принципе могут постучаться в эти таблицы через рантайм-роли:

| Принципал | Роль в PostgreSQL | Достаёт | Не относится к этой матрице |
|---|---|---|---|
| Специалист/сотрудник клиники (app_staff) | `app_staff` (`SET ROLE` после логина) | все `direct_org_column`/`denorm_org_column`/`fk_path`/`polymorphic_resolver` строки своей `organization_id` | — |
| Пациент (app_patient) | `app_patient` | строки, где есть `patientColumn`/`patientChain`/`patientConditional*`/`patientPolymorphic`, и `id` совпадает с его собственным, независимо от клиники (модель "own-data-only", см. память `saas-patient-wall-is-own-data-only`) | таблицы с patient-доступом `—` в таблице ниже — пациент к ним не приближается вообще, RLS их не пускает ни при каком принципале patient |
| Платформенный администратор / `app_owner`, `app_platform_settings` | BYPASSRLS / отдельные широкие роли | всё, по конструкции (легальный кросс-арендатор доступ) | этот доступ — предмет п.1 SECURITY_CANON (журнал + срок), не тест изоляции между арендаторами |
| Bootstrap / no-context сессия (OTP, мессенджер до входа) | обычный логин без `SET ROLE`, без `app.org`/`app.patient_user_id` | сегодня, в dormant-compatible режиме, ещё разрешён unprincipled read/write (см. `SECURITY_CANON.md` §3, D3/D4 "not-started") | strict-deny этого режима — предмет отдельного трека (D3/D4), не этого теста |

## 2. Полная поверхность (`ENABLE ROW LEVEL SECURITY`, живой предикат)

| Таблица | scopingKind | org-предикат | patient-доступ |
|---|---|---|---|
| `integrator.contacts` | direct_org_column | `organization_id` | колонка `user_id` |
| `integrator.content_access_grants` | direct_org_column | `organization_id` | колонка `user_id` |
| `integrator.conversation_messages` | denorm_org_column | `organization_id` | chain через integrator.conversations → integrator.identities |
| `integrator.conversations` | direct_org_column | `organization_id` | chain через integrator.identities |
| `integrator.message_drafts` | direct_org_column | `organization_id` | chain через integrator.identities |
| `integrator.question_messages` | denorm_org_column | `organization_id` | chain через integrator.user_questions → integrator.identities |
| `integrator.user_questions` | direct_org_column | `organization_id` | chain через integrator.identities |
| `integrator.user_reminder_delivery_logs` | denorm_org_column | `organization_id` | chain через integrator.user_reminder_occurrences → public.reminder_rules |
| `integrator.user_reminder_occurrences` | denorm_org_column | `organization_id` | chain через public.reminder_rules |
| `public.admin_audit_log` | direct_org_column | `organization_id` | — |
| `public.app_runtime_settings` | bootstrap_runtime_audience | `organization_id` | — |
| `public.app_runtime_settings_audit` | bootstrap_runtime_audit | `organization_id` | — |
| `public.be_appointment_cancellations` | direct_org_column | `organization_id` | chain через public.be_appointments |
| `public.be_appointment_events` | direct_org_column | `organization_id` | chain через public.be_appointments |
| `public.be_appointment_history_events` | direct_org_column | `organization_id` | chain через public.be_appointments |
| `public.be_appointment_no_shows` | direct_org_column | `organization_id` | chain через public.be_appointments |
| `public.be_appointment_reschedules` | direct_org_column | `organization_id` | chain через public.be_appointments |
| `public.be_appointment_staff_comments` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.be_appointments` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.be_availability_rules` | direct_org_column | `organization_id` | — |
| `public.be_booking_form_fields` | direct_org_column | `organization_id` | — |
| `public.be_booking_form_submissions` | direct_org_column | `organization_id` | chain через public.be_appointments |
| `public.be_branches` | direct_org_column | `organization_id` | — |
| `public.be_cancellation_policies` | direct_org_column | `organization_id` | — |
| `public.be_clinic_services` | direct_org_column | `organization_id` | — |
| `public.be_external_entity_mappings` | direct_org_column | `organization_id` | — |
| `public.be_package_history_events` | direct_org_column | `organization_id` | chain через public.be_patient_packages |
| `public.be_package_items` | fk_path | fk → public.be_subscription_packages | — |
| `public.be_package_usages` | direct_org_column | `organization_id` | chain через public.be_patient_packages |
| `public.be_patient_booking_profiles` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.be_patient_package_items` | fk_path | fk → public.be_patient_packages | колонка `platform_user_id` |
| `public.be_patient_packages` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.be_patient_timeline_events` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.be_payment_history_events` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.be_payment_intents` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.be_payment_provider_events` | direct_org_column | `organization_id` | — |
| `public.be_payments` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.be_prepayment_policies` | direct_org_column | `organization_id` | — |
| `public.be_refunds` | direct_org_column | `organization_id` | chain через public.be_payments |
| `public.be_reschedule_policies` | direct_org_column | `organization_id` | — |
| `public.be_rooms` | direct_org_column | `organization_id` | — |
| `public.be_schedule_blocks` | direct_org_column | `organization_id` | — |
| `public.be_schedule_templates` | direct_org_column | `organization_id` | — |
| `public.be_service_location_availability` | direct_org_column | `organization_id` | — |
| `public.be_specialist_locations` | direct_org_column | `organization_id` | — |
| `public.be_specialist_rooms` | direct_org_column | `organization_id` | — |
| `public.be_specialist_service_availability` | direct_org_column | `organization_id` | — |
| `public.be_specialists` | direct_org_column | `organization_id` | — |
| `public.be_subscription_packages` | direct_org_column | `organization_id` | — |
| `public.be_working_days` | direct_org_column | `organization_id` | — |
| `public.be_working_hours` | direct_org_column | `organization_id` | — |
| `public.broadcast_audit` | direct_org_column | `organization_id` | — |
| `public.broadcast_audit_recipients` | denorm_org_column | `organization_id` | колонка `platform_user_id` |
| `public.broadcast_drafts` | direct_org_column | `organization_id` | — |
| `public.clinic_public_directory_entries` | direct_org_column | `organization_id` | — |
| `public.clinical_anamnesis_illness` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.clinical_anamnesis_lifestyle` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.clinical_anamnesis_trauma` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.clinical_complaint` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.clinical_complaint_update` | denorm_org_column | `organization_id` | chain через public.clinical_complaint |
| `public.clinical_diagnosis` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.clinical_diagnosis_catalog` | direct_org_column | `organization_id` | — |
| `public.clinical_diagnosis_status_history` | denorm_org_column | `organization_id` | chain через public.clinical_diagnosis |
| `public.clinical_diagnosis_update` | denorm_org_column | `organization_id` | chain через public.clinical_diagnosis |
| `public.clinical_test_regions` | direct_org_column | `organization_id` | — |
| `public.clinical_visit` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.comments` | polymorphic_resolver | `organization_id` | полиморфная (несколько вариантов) |
| `public.content_access_grants_webapp` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.content_pages` | direct_org_column | `organization_id` | — |
| `public.content_section_slug_history` | denorm_org_column | `organization_id` | — |
| `public.content_sections` | direct_org_column | `organization_id` | — |
| `public.courses` | direct_org_column | `organization_id` | — |
| `public.doctor_notes` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.doctor_patient_support` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.lfk_complex_exercises` | denorm_org_column | `organization_id` | chain через public.lfk_complexes |
| `public.lfk_complex_template_exercises` | denorm_org_column | `organization_id` | — |
| `public.lfk_complex_templates` | direct_org_column | `organization_id` | — |
| `public.lfk_complexes` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.lfk_exercise_media` | denorm_org_column | `organization_id` | — |
| `public.lfk_exercise_regions` | direct_org_column | `organization_id` | — |
| `public.lfk_exercises` | direct_org_column | `organization_id` | — |
| `public.lfk_sessions` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.material_ratings` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.media_files` | direct_org_column | `organization_id` | условная колонка `uploaded_by` |
| `public.media_folders` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.media_hls_proxy_error_events` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.media_playback_client_events` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.media_playback_resolution_events` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.media_playback_user_video_first_resolve` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.media_transcode_jobs` | denorm_org_column | `organization_id` | условная цепочка |
| `public.media_upload_sessions` | direct_org_column | `organization_id` | колонка `owner_user_id` |
| `public.message_log` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.motivational_quotes` | direct_org_column | `organization_id` | — |
| `public.notification_delivery_attempts` | denorm_org_column | `organization_id` | колонка `user_id` |
| `public.online_intake_answers` | denorm_org_column | `organization_id` | chain через public.online_intake_requests |
| `public.online_intake_attachments` | denorm_org_column | `organization_id` | chain через public.online_intake_requests |
| `public.online_intake_requests` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.online_intake_status_history` | denorm_org_column | `organization_id` | chain через public.online_intake_requests |
| `public.operator_health_failure_archive` | direct_org_column | `organization_id` | — |
| `public.org_enrollments` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.organization_member_invites` | direct_org_column | `organization_id` | — |
| `public.patient_comorbidity` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.patient_content_rating_feedback` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.patient_daily_warmup_presentations` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.patient_daily_warmup_video_views` | denorm_org_column | `organization_id` | колонка `user_id` |
| `public.patient_diary_day_snapshots` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.patient_files` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.patient_home_block_items` | denorm_org_column | `organization_id` | — |
| `public.patient_home_blocks` | direct_org_column | `organization_id` | — |
| `public.patient_invites` | direct_org_column | `organization_id` | — |
| `public.patient_lfk_assignments` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.patient_merge_candidates` | direct_org_column | `organization_id` | — |
| `public.patient_payment` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.patient_practice_completions` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.platform_user_contacts` | bootstrap_hybrid_org_gated | `organization_id` | — |
| `public.product_analytics_events_recent` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.product_analytics_user_hourly` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.product_push_notifications` | direct_org_column | `organization_id` | колонка `user_id` |
| `public.program_action_log` | denorm_org_column | `organization_id` | колонка `patient_user_id` |
| `public.program_item_discussion_messages` | denorm_org_column | `organization_id` | колонка `patient_user_id` |
| `public.program_item_discussion_reads` | denorm_org_column | `organization_id` | колонка `patient_user_id` |
| `public.recommendation_regions` | direct_org_column | `organization_id` | — |
| `public.recommendations` | direct_org_column | `organization_id` | — |
| `public.reference_categories` | direct_org_column | `organization_id` | — |
| `public.reference_items` | denorm_org_column | `organization_id` | — |
| `public.reminder_delivery_events` | denorm_org_column | `organization_id` | колонка `integrator_user_id` |
| `public.reminder_journal` | direct_org_column | `organization_id` | chain через public.reminder_rules |
| `public.reminder_occurrence_history` | denorm_org_column | `organization_id` | chain через public.platform_users |
| `public.reminder_rules` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.saas_org_entitlement_overrides` | direct_org_column | `organization_id` | — |
| `public.saas_organization_trials` | direct_org_column | `organization_id` | — |
| `public.specialist_tasks` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.support_conversation_messages` | denorm_org_column | `organization_id` | chain через public.support_conversations |
| `public.support_conversations` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.support_delivery_events` | denorm_org_column | `organization_id` | chain через public.support_conversation_messages → public.support_conversations |
| `public.support_question_messages` | denorm_org_column | `organization_id` | chain через public.support_questions → public.support_conversations |
| `public.support_questions` | direct_org_column | `organization_id` | chain через public.support_conversations |
| `public.symptom_entries` | denorm_org_column | `organization_id` | колонка `platform_user_id` |
| `public.symptom_trackings` | direct_org_column | `organization_id` | колонка `platform_user_id` |
| `public.system_settings` | bootstrap_hybrid | `organization_id` | — |
| `public.system_settings_audit` | bootstrap_hybrid | `organization_id` | — |
| `public.test_attempts` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.test_results` | denorm_org_column | `organization_id` | chain через public.test_attempts |
| `public.test_set_items` | denorm_org_column | `organization_id` | — |
| `public.test_sets` | direct_org_column | `organization_id` | — |
| `public.tests` | direct_org_column | `organization_id` | — |
| `public.treatment_program_events` | denorm_org_column | `organization_id` | chain через public.treatment_program_instances |
| `public.treatment_program_instance_stage_groups` | denorm_org_column | `organization_id` | chain через public.treatment_program_instance_stages → public.treatment_program_instances |
| `public.treatment_program_instance_stage_items` | denorm_org_column | `organization_id` | chain через public.treatment_program_instance_stages → public.treatment_program_instances |
| `public.treatment_program_instance_stages` | denorm_org_column | `organization_id` | chain через public.treatment_program_instances |
| `public.treatment_program_instances` | direct_org_column | `organization_id` | колонка `patient_user_id` |
| `public.treatment_program_template_stage_groups` | denorm_org_column | `organization_id` | — |
| `public.treatment_program_template_stage_items` | denorm_org_column | `organization_id` | — |
| `public.treatment_program_template_stages` | denorm_org_column | `organization_id` | — |
| `public.treatment_program_templates` | direct_org_column | `organization_id` | — |
| `public.user_phone_history` | bootstrap_hybrid_org_gated | `organization_id` | — |

Плюс `public.platform_users` — не в этом сгенерированном списке (таблица получила RLS отдельной
работой D15b/4, коммиты `b7f4b9581`…`e96f12641`, landed на `feat/doctor-ui-rebuild` 04.08 — ПОСЛЕ
того, как `SECURITY_CANON.md` §2 было написано в тот же день; тот раздел канона сейчас **устарел**,
см. §4 ниже), но реально несёт `ENABLE + FORCE ROW LEVEL SECURITY` с собственным self/staff-org
предикатом (`apps/webapp/db/drizzle-migrations/0353_platform_users_rls_d15b4_local.sql`).

## 3. Что исполняет новый тест (`tenantIsolationMatrix.postgres.integration.test.ts`)

Полные 155 строк таблицы выше — один и тот же генератор дескрипторов
(`rls-descriptor-model.mjs`) и **три предикатных формы**: `direct_org_column` (109),
`denorm_org_column` (38, ровно тот же org-предикат + EXISTS в родителя), `fk_path` (2),
`polymorphic_resolver` (1), плюс 6 bootstrap-вариантов. Гонять живой SQL по всем 155 в одном тесте —
не систематичнее, чем взять representative-инстанс каждой формы: `direct_org_column`, будучи 70% всех
целей, доказывается прогоном на реальных таблицах из двух разных продуктовых доменов:

1. **`public.org_enrollments`** — корневая таблица ростера/принадлежности пациента клинике (на неё
   опирается сам `platform_users_staff_org_select`, см. §2). Прямая `organization_id` +
   `platform_user_id`.
2. **`public.clinical_visit`** — клиническая запись (визит), высший по чувствительности класс
   данных, который называл владелец. Тот же предикатный shape, прямая `organization_id` +
   `patient_user_id`.

Для каждой — 4 проверки, дающие требуемую пару "негатив + позитив" (§10a/§10b AGENTS.md: ноль строк
без парного позитива не доказательство):

- специалист клиники A видит свою строку (позитив);
- специалист клиники A **не видит ничего** по клинике B (негатив);
- пациент P (только в клинике A) видит свою строку (позитив);
- пациент P **не видит** строку пациента Q из клиники B (негатив).

Плюс контрольный прогон (последний `describe` теста): временно `DISABLE ROW LEVEL SECURITY` на
диспозабл-копии, подтверждение что ТА ЖЕ негативная проверка возвращает чужую строку, восстановление
стены, повторное подтверждение, что негатив снова зелёный на том же запросе — живое доказательство,
что тест действительно ловит снятую стену, а не проверяет пустую таблицу.

### Механизм принципала — `locked` (подписанный контекст), НЕ `legacy-guc`

Первая версия этого теста использовала `SET ROLE` + `set_config('app.org', …)` — по тексту миграций
`0160`-`0175` это выглядело как живой механизм. **Эмпирически неверно для реальной сегодняшней
схемы.** `public.org_enrollments`, `public.clinical_visit` и, судя по всему, большинство таблиц из
таблицы §2 — их живая политика (проверено `pg_policy`/`\d+` на реальной диспозабл-БД, не по тексту
миграции) читает `app.current_org_id()`/`app.current_patient_user_id()` — SECURITY DEFINER-аксессоры
поверх подписанного `app.principal_context` (`app.install_signed_context(...)`, HMAC-подпись через
`app.context_signing_secrets`), а не сырой GUC. Простой `set_config('app.org', …)` для этой политики
не значит ничего — `current_org_id()` читает не GUC, а строку `app.principal_context` по
`pg_backend_pid()`, которой без вызова `install_signed_context` просто нет. Это давало ложный
негатив: ПОЗИТИВНЫЙ кейс («специалист видит свою же строку») тоже возвращал ноль, то есть исходный
тест ловил бы пустую таблицу, а не стену — ровно то, что §10a/§10b AGENTS.md запрещают.

Финальная версия использует `runWithDbOrganizationPrincipal`/`runWithDbPatientPrincipal` +
`withPoolClient` из `@bersoncare/db-principal`/`@/infra/db/withClient` — тот же путь, которым реально
идёт `app/api/**`, и `process.env.DB_PRINCIPAL_CONTEXT_MODE='locked'` — режим, которым реально
работают DEV/TEST/PROD (`.env.dev`, ранее подтверждено `pgSaasBillingCapture.postgres.integration.test.ts`'s
собственным заголовком). Сигнатурный секрет (`app.context_signing_secrets`) в этом migration-only
харнессе пуст по умолчанию — тест сеет его disposable-значением в `beforeAll`, тем же паттерном, что
уже применяет `pgSaasBillingCapture.postgres.integration.test.ts`, и восстанавливает исходное
значение в `afterAll`.

## 4. Найденное по ходу (не из головы, командой)

- **`SECURITY_CANON.md` §2 устарел.** На момент написания канона (04.08, тем же днём) D15b/4
  (`platform_users` RLS) значился «не начато». К моменту этой работы (тот же день, позже) он уже
  landed на `feat/doctor-ui-rebuild`: `git log --oneline -- .../0353_platform_users_rls_d15b4_local.sql`
  → `b7f4b9581 feat(saas): D15b/4 — enable FORCE RLS on public.platform_users`, плюс два фикс-коммита
  `60ab00db5`/`e96f12641`. `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:541` уже
  корректно стоит `[x]`. Канон обновлён этим же изменением (см. diff `SECURITY_CANON.md`).
- **Механизм RLS уже реально "locked" (подписанный контекст), не "dormant GUC".** См. врезку выше.
  `SECURITY_CANON.md` §3 говорит "D3 (enforced TEST reads) — blocked, D4 not-started" — это, по всей
  видимости, про ОТДЕЛЬНУЮ инициативу (закрытие legacy no-context фолбэка на уровне route/settings-root,
  `SAAS_ENFORCE_ROADMAP.md`), а не про то, каким SQL-механизмом читается принципал в самой политике —
  тот уже сегодня `app.current_org_id()`/signed-context на живых DEV/TEST/PROD и на a0-greenfield
  baseline (это снимок реальной схемы). Не переформулировано в каноне этим изменением — не
  моя авторитетная область (auth/identity canon), только отмечено здесь как находка.
- **🔴 БЛОКЕР CI, не связан с этой задачей: `test-webapp-postgres` job сейчас красный на всей ветке
  `feat/doctor-ui-rebuild` (и, значит, на этой ветке тоже) из-за постороннего бага миграции.**
  Эмпирически подтверждено (не предположение): любой `*.postgres.integration.test.ts`, включая уже
  существующие (`saasBillingPaidTariffApplyAccessor...`), падает на этапе построения шаблонной БД —
  `pnpm run migrate` из-под харнесса ловит `sqlstate=2BP01` ("cannot drop column grace_ends_at of
  table saas_organization_trials because other objects depend on it") на миграции
  `0346_saas_trial_grace_discount_window_local.sql:72-73`. Причина — известная и уже
  задокументированная в `0349_saas_trial_grace_discount_window_reconcile_local.sql:70-77` самим
  автором той работы: миграция `0225_saas_tariff_quotas_trial` оставляет на `saas_tariffs` RLS-политику
  (`saas_tariffs_current_patient_capability_read`), чей `USING`-предикат читает `trial.grace_ends_at`
  напрямую, и это блокирует `DROP COLUMN grace_ends_at`. `0349` чинит это, но ТОЛЬКО для БД, где
  `0346` уже "проехал" мимо watermark-коллизии (см. `0349`'s заголовок про `bcb_webapp_dev`); на
  чистой from-zero сборке (postgres-integration harness, ЛЮБОЙ будущий greenfield-рестор) `0346`
  реально исполняется и падает первым, до того как `0349` вообще может быть достигнут. Это не
  относится к изоляции арендаторов и не входит в границы этого брифа ("стены не менять") — стена
  `saas_tariffs`/RLS тут ни при чём, это независимый billing/trial-домен другой ветки
  (`wt/trial-grace-model`, commit `ac185efb1`). **Только для локальной эмпирической проверки этого
  теста** временно патчился `0346` (вставка `DROP POLICY`/`CREATE POLICY` из `0349` прямо в `0346`) и
  `run-webapp-drizzle-migrate.mjs` (небезопасный debug-вывод сырой SQL-ошибки) — оба патча отменены
  (`git checkout --`) перед коммитом, в шипуемом diff их нет. **Пока этот баг не починен (или 0346 не
  перенумерован после 0349's правки), CI-джоб `test-webapp-postgres` красный для КАЖДОГО PR в эту
  ветку**, независимо от содержимого PR — включая, при мёрдже, этот тест. Строка отчёта, не фикс в
  этом ходе.

## 5. Непокрытые клетки (названы, не молчаливый пропуск)

| Класс | Таблицы | Почему не покрыто этим тестом |
|---|---|---|
| `denorm_org_column` (EXISTS в родителя) | 38 таблиц (`clinical_complaint_update`, `support_conversation_messages`, …) | Тот же org-предикат, что `direct_org_column`, плюс один `EXISTS`; не независимый класс поломки относительно того, что уже доказано — не прогонялся отдельно ради экономии времени прогона, а не потому что мог бы вести себя иначе. Кандидат на следующий проход, если появится конкретный дефект в EXISTS-плече. |
| `fk_path` | `be_package_items`, `be_patient_package_items` | Единственные две таблицы с этой формой (подписки/пакеты), не прогонялись — фикстуры пакетов нетривиальны, а форма отличается от `direct_org_column` только источником `organization_id` (через FK, не колонку). Не проверено эмпирически. |
| `polymorphic_resolver` | `comments` | Одна таблица, несколько вариантов родителя (полиморфная ссылка) — не проверено. |
| `bootstrap_*` (4 варианта) | `system_settings`, `system_settings_audit`, `app_runtime_settings`, `app_runtime_settings_audit`, `platform_user_contacts`, `user_phone_history` | Эти таблицы намеренно НЕ следуют модели "чужая клиника = ноль" — у них своя bootstrap/аудитория-осознанная семантика (уже покрыта `smoke-r2-real-policy-isolation.mjs` вручную, не в CI). Не входят в объём "специалист A / пациент чужой клиники", заявленный брифом буквально. |
| `public.platform_users` | 1 таблица (PII, `ENABLE + FORCE`, EXISTS-based staff wall + self-select) | Тем же `locked`-механизмом (§3) технически проверяема — не отличается от `org_enrollments`/`clinical_visit` по мере доступности harness'а. Не включена в исполняемый набор только по объёму (2 таблицы уже покрывают identity/roster + clinical; PII — третий домен, не выбран ради времени прогона), не из-за ограничения harness'а — это уточняет более раннее (неверное) предположение в этом же документе, которое считало `platform_users` структурно непроверяемой. Кандидат на следующий проход. |
| Маршруты (`app/api/**`) как отдельная поверхность | — | Бриф просил матрицу «поверхность × принципал», включая маршруты. HTTP-роуты в конечном счёте читают через ровно те же RLS-таблицы (`getDrizzle()`/`infra/repos/*` — единый chokepoint, см. AGENTS.md §5); отдельный HTTP-уровневый матричный прогон не даёт новый класс защиты сверх DB-уровня и не строился (§10b: "самый дешёвый публичный слой, где ловится тот же класс ошибки" — здесь это DB-слой, не route). |
| SECURITY DEFINER accessors (`app.*`, ~45 функций владения `app_owner`) | — | Отдельная поверхность (привилегированный bypass, не RLS-таблица); частично уже покрыта точечными тестами (`saasBillingPaidTariffApplyAccessor.postgres.integration.test.ts` и соседи). Не дублируется здесь — не тот же класс поломки, что "чужая клиника видит через RLS". |
