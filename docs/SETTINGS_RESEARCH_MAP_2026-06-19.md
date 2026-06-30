# Settings Research Map — BersonCareBot
**CR-9 Stage 1** | Date: 2026-06-19 | Branch: feat/doctor-ui-rebuild

This document maps ALL configurable settings in the application, grouped by area of use and access role.
It also proposes a better navigation structure for the settings UI.

---

## Table of Contents

1. [Current Structure Overview](#1-current-structure-overview)
2. [All Settings — Master List](#2-all-settings--master-list)
   - 2.1 [Specialist / Doctor settings (scope: doctor)](#21-specialist--doctor-settings-scope-doctor)
   - 2.2 [Booking engine — catalog & schedule](#22-booking-engine--catalog--schedule)
   - 2.3 [Booking engine — policies & payments](#23-booking-engine--policies--payments)
   - 2.4 [Booking engine — public form & widget](#24-booking-engine--public-form--widget)
   - 2.5 [Patient app — home screen & content](#25-patient-app--home-screen--content)
   - 2.6 [Patient app — communications & maintenance](#26-patient-app--communications--maintenance)
   - 2.7 [Integrations — calendar, SMTP, push](#27-integrations--calendar-smtp-push)
   - 2.8 [Auth providers](#28-auth-providers)
   - 2.9 [Access lists — role routing by ID](#29-access-lists--role-routing-by-id)
   - 2.10 [Video delivery system](#210-video-delivery-system)
   - 2.11 [System app parameters](#211-system-app-parameters)
   - 2.12 [Operator health & alerting](#212-operator-health--alerting)
   - 2.13 [Technical / debug modes](#213-technical--debug-modes)
   - 2.14 [Patient-facing settings (patient self-service)](#214-patient-facing-settings-patient-self-service)
3. [Settings NOT on the Settings Page](#3-settings-not-on-the-settings-page)
4. [Settings Key Index (system_settings table)](#4-settings-key-index-system_settings-table)
5. [Proposed New Structure](#5-proposed-new-structure)
6. [Surprising / Undocumented Findings](#6-surprising--undocumented-findings)

---

## 1. Current Structure Overview

**Route:** `/app/settings?tab=<tab>` (`apps/webapp/src/app/app/settings/`)

The settings page has 6 tabs, but most admin content was migrated to separate pages under `/app/doctor/admin/*`. The settings page now mainly serves as:
- A landing for the specialist's own preferences (Специалист tab — always visible)
- Redirect links to the real admin pages (other 5 tabs are thin link pages)

### Current tabs (as defined in `SettingsTabsNav.tsx`):

| Tab ID | Label | Who sees it | What it contains |
|--------|-------|------------|------------------|
| `specialist` | Специалист | All doctors/admins | Email, notifications, cabinet settings, timezone, appointment reminders |
| `integrations` | Интеграции | All doctors/admins | Link to `/app/doctor/admin/integrations` |
| `schedule` | Запись и расписание | All / admin-more | Link to schedule + link to booking admin |
| `app` | Приложение | All / admin-more | Link to PWA install + link to app settings |
| `admin` | Администрирование | Admin only | Links to auth, integrations, technical, patient merge |
| `technical` | Техническое | Admin only | Links to system health, failure archive, audit log, technical modes |

### Real admin content lives at:

| URL | Content |
|-----|---------|
| `/app/doctor/admin/app-settings` | AppParametersSection + EmailSmtpSection + VideoSystemSettingsSection + WebPushVapidSection + NotificationsTopicsSection |
| `/app/doctor/admin/auth` | AuthProvidersSection (Telegram/MAX/VK/Yandex/Google/Apple OAuth) |
| `/app/doctor/admin/integrations` | GoogleCalendarSection |
| `/app/doctor/admin/technical` | AdminSettingsSection + OperatorHealthAlertsSection + OperatorHealthProjectionThresholdsSection |
| `/app/doctor/admin/booking` | Main booking page: locations, services, availability, rules |
| `/app/doctor/admin/booking/payments` | BookingPaymentsSection + BookingPrepaymentSection |
| `/app/doctor/admin/booking/form-public` | BookingSoloFormFieldsSection + BookingPublicWidgetSection + BookingPublicAttributionSection |
| `/app/doctor/admin/booking/integrations` | BookingRubitimeMappingSection + RubitimeSection + BookingEngineSection (integrations mode) |
| `/app/doctor/patient-home` | Patient home blocks + morning ping + daily warmup rotation + mood icons + practice target + repeat cooldowns |

---

## 2. All Settings — Master List

### 2.1 Specialist / Doctor settings (scope: doctor)

**Location:** `/app/settings?tab=specialist`
**Components:** `DoctorAccountEmailSection`, `SettingsForm`, `DoctorNotificationChannelsSection`, `DoctorNotificationsTopicMatrix`, `DoctorWebPushControls`, `DoctorTimezoneSection`, `AppointmentReminderSettingsSection`
**API endpoints:** `PATCH /api/doctor/settings`, `PATCH /api/doctor/account/timezone`, `DELETE /api/doctor/account/email`

| Setting key | UI Label | Type | Who configures | Description |
|-------------|----------|------|----------------|-------------|
| *(account email)* | Email аккаунта | string (OTP-verified) | Doctor/self | Email for login and email notifications; managed via OTP flow at `/api/auth/email/*` |
| `patient_label` | Как называть пациента | enum (пациент/клиент) | Doctor | Term used in cabinet UI for the person being treated |
| `sms_fallback_enabled` | SMS fallback | bool | Doctor | Allow SMS for OTP and appointment booking; off = only Telegram/MAX/email |
| `doctor_patient_support_comments_without_support_default_enabled` | Комментарии без сопровождения | bool | Doctor | Default: unsupported patient can write comments on program items |
| `doctor_patient_support_media_without_support_default_enabled` | Медиа без сопровождения | bool | Doctor | Default: unsupported patient can submit media in program discussion |
| `doctor_specialist_task_reminder_channels` | Каналы напоминаний о задачах | array (telegram/max/web_push/email) | Doctor | Which channels to use for specialist task reminders |
| `doctor_appointment_reminder_enabled` | Напоминания о записях | bool | Doctor | Send appointment reminders to patients |
| `doctor_appointment_reminder_offsets_minutes` | Время напоминаний | array of int | Doctor | Minutes before appointment to send reminder (e.g. [1440, 120]) |
| *(calendar timezone)* | Часовой пояс | IANA timezone string | Doctor | Stored in `platform_users.calendar_timezone`, not system_settings; affects calendar display |
| *(notification topics matrix)* | Уведомления (матрица) | per-topic per-channel bool | Doctor | Which notification topics come through which channels (Telegram/MAX/Email/Push); stored in `topic_channel_prefs` table per user |
| *(web push subscription)* | Push-уведомления | bool | Doctor | Browser push subscription state; managed via Web Push API (`/api/doctor/web-push/*`) |
| *(channel global web push enabled)* | Push включён глобально | bool | Doctor | Global on/off for web push channel; stored in `channel_preferences` table |

**Notification topic codes available for doctors:**
- `doctor_specialist_task_reminders` — Напоминания о задачах
- `doctor_patient_messages` — Сообщения от пациентов
- `doctor_patient_program_notes` — Комментарии к упражнениям

---

### 2.2 Booking engine — catalog & schedule

**Location:** `/app/doctor/admin/booking` (main page)
**Components:** `BookingSoloLocationsSection`, `BookingSoloServicesSection`, `BookingSoloAvailabilitySection`, `BookingSoloScheduleSection`, `BookingScheduleBlocksSection`, `BookingWorkingHoursSection`
**API:** `/api/admin/booking-engine/branches`, `/api/admin/booking-engine/services`, `/api/admin/booking-engine/working-hours`, `/api/admin/booking-engine/schedule-blocks`, `/api/admin/booking-engine/scheduling-settings`

| Setting | Storage | Who configures | Description |
|---------|---------|----------------|-------------|
| Locations (branches) | DB `be_branches` | Admin | Clinics/offices with city code, address, timezone, sort order |
| Services | DB `be_services` | Admin | Service title, duration, price, visibility in public widget, package eligibility, prepayment/online-payment flags |
| Specialist availability matrix | DB `be_specialist_service_availabilities` | Admin | Which specialist provides which services at which branch |
| Working hours | DB `be_working_hours` | Admin | Weekday schedule per specialist/branch/room (start/end minutes) |
| Schedule blocks | DB `be_schedule_blocks` | Admin | One-off blocks: absences, vacations, occupied slots |
| Buffer minutes | DB (booking-scheduling port) | Admin | Per-specialist buffer time between appointments |
| `booking_min_notice_hours` | system_settings (admin) | Admin | Minimum hours before an appointment that patients can book (0–168h) |
| `booking_calendar_show_working_hours` | system_settings (admin) | Admin | Show working hours background in doctor calendar view |
| `booking_doctor_appointments_read_source` | system_settings (admin) | Admin | Source for doctor's appointment list: `rubitime_legacy` or `canonical` |
| `booking_slots_read_source` | system_settings (admin) | Admin | Source for patient-facing slots: `rubitime` or `canonical` |
| `booking_rubitime_bridge_enabled` | system_settings (admin) | Admin | Enable/disable Rubitime ↔ canonical sync bridge |
| `booking_default_organization_id` | system_settings (admin) | Admin | UUID of the default organization for canonical booking model |

**Packages catalog:**
| Setting | Storage | Who configures | Description |
|---------|---------|----------------|-------------|
| Packages | DB `be_packages` | Admin | Package bundles: title, price, items (service × quantity) |
| Products | DB `be_products` | Admin | Products of various types (single visit, membership, gift cert, course, subscription, content access, individual offer); pay-by-link enabled flag |

---

### 2.3 Booking engine — policies & payments

**Location:** `/app/doctor/admin/booking/payments` and booking rules tabs
**Components:** `BookingPaymentsSection`, `BookingPrepaymentSection`, `BookingPoliciesSection`, `BookingPackagePastUnlinkSetting`, `BookingEventNotificationsSection`
**API:** `/api/admin/booking-engine/policies`, `/api/admin/booking-engine/prepayment-policies`

| Setting key | UI Label | Type | Who configures | Description |
|-------------|----------|------|----------------|-------------|
| `booking_payment_enabled` | Оплата записи | bool | Admin | Enable payment layer for booking |
| `booking_payment_providers` | Платёжные провайдеры | JSON object | Admin | Payment providers config: enabled flag, defaultProviderId, per-provider credentials (Yookassa/Tinkoff/CloudPayments/Alfa-Bank); secrets merge on partial update |
| `booking_allow_doctor_unlink_past_package_sessions` | Отвязать прошедшие от абонемента | bool | Admin | Allow doctor to unlink past appointments from a package (double-confirm UI) |
| `booking_lifecycle_notifications` | Уведомления о событиях | JSON | Admin | Per-event notification flags for: booking.created, booking.cancelled, booking.rescheduled, booking.payment_captured |
| *(cancellation policies)* | Политика отмены | DB records | Admin | Per-scope (organization/specialist/service/product) cancellation rules: behavior on late cancel (penalty/charge_package/retain_prepayment/refund/manual) |
| *(reschedule policies)* | Политика переноса | DB records | Admin | Per-scope reschedule limits: behavior on limit exceeded (deny/manual_request) |
| *(prepayment policies)* | Предоплата | DB records | Admin | Per-service or per-online-category prepayment mode: disabled/fixed/percent/full_price |

---

### 2.4 Booking engine — public form & widget

**Location:** `/app/doctor/admin/booking/form-public`
**Components:** `BookingSoloFormFieldsSection`, `BookingPublicWidgetSection`, `BookingPublicAttributionSection`
**API:** `/api/admin/booking-engine/form-fields`

| Setting | Storage | Who configures | Description |
|---------|---------|----------------|-------------|
| Form fields | DB `be_form_fields` | Admin | Custom fields in booking form: type (name/phone/email/comment/text), label, placeholder, required flag, visible to patient/staff, sort order |
| Public widget URL builder | UI tool (no persistent setting) | Admin | Generates embed URL with UTM params, branch/service preselection |
| `patient_booking_url` | system_settings (admin) | Admin | Public booking URL (Rubitime etc.) shown to patients in app |
| *(public attribution log)* | DB `be_public_appointments` | Read-only | Admin | Last 20 public appointment submissions with attribution metadata (UTM, traffic source) |

---

### 2.5 Patient app — home screen & content

**Location:** `/app/doctor/patient-home`
**Components:** `PatientHomePracticeTargetPanel`, `PatientHomeDailyWarmupRotationPanel`, `PatientHomeMorningPingPanel`, `PatientHomeRepeatCooldownPanel`, `PatientHomeMoodIconsPanel`, `PatientHomeBlocksSettingsPageClient`

| Setting key | UI Label | Type | Who configures | Description |
|-------------|----------|------|----------------|-------------|
| `patient_home_daily_practice_target` | Цель практик в день | int (1–10), default 3 | Doctor | Daily practice goal shown on patient home |
| `patient_home_morning_ping_enabled` | Утренняя рассылка | bool | Admin only | Enable daily morning message to all patients via messenger |
| `patient_home_morning_ping_local_time` | Время утренней рассылки | HH:MM string | Admin only | Local time for daily patient ping (in app display timezone) |
| `patient_home_daily_warmup_rotation_enabled` | Автосмена разминки | bool | Admin only | Auto-rotate warmup on patient home on schedule |
| `patient_home_daily_warmup_rotation_times` | Время автосмены (1–3) | array of HH:MM | Admin only | Times to auto-rotate warmup |
| `patient_home_daily_warmup_repeat_cooldown_minutes` | Пауза повтора разминки | int (5–180), default 60 | Admin only | Minimum minutes before patient can re-mark the same warmup |
| `patient_treatment_plan_item_done_repeat_cooldown_minutes` | Пауза повтора пункта плана | int (5–180), default 60 | Admin only | Minimum minutes before patient can re-mark a plan item done |
| `patient_home_mood_icons` | Иконки настроения | array of 5 mood rows | Doctor | Score 1-5 mood check-in icons with label + image URL |
| `patient_home_warmup_skip_to_next_available_enabled` | *(deprecated)* | bool | Admin | Legacy: warmup skip to next — no longer read by picker |
| *(patient home blocks)* | Блоки главной | DB `patient_home_blocks` + items | Doctor | Content blocks displayed on patient home: pages, content sections, course links; order, visibility |
| `patient_default_promo_treatment_program_template_id` | Промо-программа по умолчанию | UUID | Admin | Published program template shown to patients without an active plan |

---

### 2.6 Patient app — communications & maintenance

**Location:** `/app/doctor/admin/technical` (maintenance) and `/app/doctor/admin/app-settings` (notifications topics)

| Setting key | UI Label | Type | Who configures | Description |
|-------------|----------|------|----------------|-------------|
| `patient_app_maintenance_enabled` | Режим техработ | bool | Admin | Show maintenance screen to patients (no navigation) |
| `patient_app_maintenance_message` | Текст техработ | string (max 500) | Admin | Message shown on patient maintenance screen |
| `patient_program_discussion_doctor_reply_from_log_enabled` | Ответ врача из журнала | bool | Admin | Rollout phase 1: interim doctor reply from program log (doctor UI + API) |
| `patient_program_discussion_ui_enabled` | UI обсуждений программы | bool | Admin | Rollout phase 3+: patient-facing discussion UI for program items |
| `patient_program_discussion_media_submission_enabled` | Медиа в обсуждении | bool | Admin | Rollout phase 6+: allow patient to submit media in program discussion |
| `notifications_topics` | Темы рассылок | array of {id, title} | Admin | Defines notification subscription topics shown to patients at `/notifications` |

---

### 2.7 Integrations — calendar, SMTP, push

**Location:** `/app/doctor/admin/integrations` (Google Calendar), `/app/doctor/admin/app-settings` (SMTP, Web Push)

**Google Calendar** (`GoogleCalendarSection`):

| Setting key | UI Label | Who configures | Description |
|-------------|----------|----------------|-------------|
| `google_client_id` | Google Client ID | Admin | OAuth 2.0 client ID for Calendar AND login |
| `google_client_secret` | Google Client Secret | Admin | OAuth 2.0 client secret |
| `google_redirect_uri` | Calendar OAuth redirect URI | Admin | Callback URI for Calendar OAuth flow |
| `google_refresh_token` | Refresh Token | Admin | Stored after OAuth; used for Calendar sync |
| `google_calendar_id` | Calendar ID | Admin | Target calendar for appointment sync |
| `google_calendar_enabled` | Синхронизация включена | bool | Admin | Master switch for Google Calendar sync |
| `google_connected_email` | Connected Google account | string (read-only display) | Admin | Email of the connected Google account |

**Email SMTP** (`EmailSmtpSection`):

| Setting key | UI Label | Who configures | Description |
|-------------|----------|----------------|-------------|
| `smtp_outbound` | SMTP исходящий | JSON object | Admin | Full SMTP config: host, port, secure, user, password (not shown), from; mirrors to integrator |

**Web Push VAPID** (`WebPushVapidSection`):

| Setting key | UI Label | Who configures | Description |
|-------------|----------|----------------|-------------|
| `web_push_vapid` | VAPID ключи | JSON {publicKey, privateKey} | Admin | Web Push VAPID key pair (base64url); privateKey redacted in UI if already stored |

---

### 2.8 Auth providers

**Location:** `/app/doctor/admin/auth`
**Component:** `AuthProvidersSection`

| Setting key | UI Label | Who configures | Description |
|-------------|----------|----------------|-------------|
| `telegram_login_bot_username` | Telegram бот (без @) | Admin | Bot username for Telegram Login Widget |
| `max_login_bot_nickname` | MAX бот ник | Admin | MAX bot nickname for deep link (max.ru/<nick>) |
| `max_bot_api_key` | MAX Bot API Key | Admin | MAX Bot API key for Mini App initData validation |
| `vk_web_login_url` | Ссылка «Вход с VK ID» | Admin | Public URL for VK ID login button |
| `yandex_oauth_client_id` | Yandex OAuth Client ID | Admin | Backend-only; not shown in public login UI |
| `yandex_oauth_client_secret` | Yandex OAuth Secret | Admin | Yandex OAuth client secret |
| `yandex_oauth_redirect_uri` | Yandex redirect URI | Admin | Redirect URI for Yandex OAuth |
| `google_oauth_login_redirect_uri` | Google login redirect URI | Admin | Redirect URI for Google web login (separate from Calendar callback) |
| `apple_oauth_client_id` | Apple Services ID | Admin | Sign in with Apple — Services ID |
| `apple_oauth_team_id` | Apple Team ID | Admin | Apple Developer Team ID |
| `apple_oauth_key_id` | Apple Key ID | Admin | Apple private key ID |
| `apple_oauth_private_key` | Apple .p8 PEM | Admin | Apple OAuth private key (PEM) |
| `apple_oauth_redirect_uri` | Apple redirect URI | Admin | Redirect URI for Sign in with Apple |

---

### 2.9 Access lists — role routing by ID

**Location:** Previously in settings (AccessListsSection — appears to have been removed from main nav, but keys are still in ALLOWED_KEYS)

| Setting key | UI Label | Who configures | Description |
|-------------|----------|----------------|-------------|
| `allowed_telegram_ids` | Разрешённые Telegram ID (клиенты) | Admin | Telegram user IDs allowed as clients |
| `allowed_max_ids` | Разрешённые Max ID (клиенты) | Admin | MAX user IDs allowed as clients |
| `allowed_phones` | Разрешённые телефоны | Admin | Phone numbers allowed in whitelist mode |
| `admin_telegram_ids` | Telegram ID → admin | Admin | Telegram IDs mapped to admin role |
| `admin_max_ids` | Max ID → admin | Admin | MAX IDs mapped to admin role |
| `admin_phones` | Телефон администратора | Admin | Admin phone number (first slot displayed in UI) |
| `doctor_telegram_ids` | Telegram ID → doctor | Admin | Telegram IDs mapped to doctor role |
| `doctor_max_ids` | Max ID → doctor | Admin | MAX IDs mapped to doctor role |
| `doctor_phones` | *(doctor phones)* | Admin | Doctor phone numbers |

---

### 2.10 Video delivery system

**Location:** `/app/doctor/admin/app-settings`
**Component:** `VideoSystemSettingsSection`

| Setting key | UI Label | Type | Who configures | Description |
|-------------|----------|------|----------------|-------------|
| `video_hls_pipeline_enabled` | HLS конвертация | bool | Admin | Enable HLS transcode queue and media worker |
| `video_hls_new_uploads_auto_transcode` | Автоперекодировка новых | bool | Admin | Auto-enqueue HLS job on new video upload |
| `video_hls_reconcile_enabled` | HLS reconcile | bool | Admin | Periodic cron to re-enqueue videos without HLS |
| `video_playback_api_enabled` | Playback API | bool | Admin | Enable `GET /api/media/[id]/playback` JSON+HLS endpoint |
| `video_default_delivery` | Стратегия доставки видео | enum (mp4/hls/auto) | Admin | Global video delivery strategy |
| `video_presign_ttl_seconds` | TTL presign URL | int (60–604800) | Admin | Expiry time for S3 presigned video URLs |
| `video_watermark_enabled` | Водяной знак | bool | Admin | Burn-in media ID watermark in HLS/poster on transcode |

---

### 2.11 System app parameters

**Location:** `/app/doctor/admin/app-settings`
**Component:** `AppParametersSection`

| Setting key | UI Label | Type | Who configures | Description |
|-------------|----------|------|----------------|-------------|
| `app_base_url` | Публичный URL | string (https://…) | Admin | Public origin for web app; overrides env APP_BASE_URL |
| `support_contact_url` | Ссылка поддержки | string (URL or /path) | Admin | Support contact shown to users |
| `app_display_timezone` | Часовой пояс (глобальный) | IANA timezone | Admin | Global timezone for displaying appointment times and slots |

---

### 2.12 Operator health & alerting

**Location:** `/app/doctor/admin/technical`
**Components:** `OperatorHealthAlertsSection`, `OperatorHealthProjectionThresholdsSection`

| Setting key | UI Label | Type | Who configures | Description |
|-------------|----------|------|----------------|-------------|
| `operator_health_alert_config` | Алерты оператора | JSON object | Admin | Alert config: per-block (critical/digest/account_conflicts) enabled flag, channels (Telegram/MAX), digest time |
| `admin_incident_alert_config` | *(legacy)* | JSON | Admin | Legacy identity alert config; merged into `operator_health_alert_config` on read |
| `operator_health_projection_thresholds` | Projection thresholds | JSON object | Admin | Debounce thresholds for projection outbox: retriesDebounceMinutes, stalePendingDebounceMinutes |

---

### 2.13 Technical / debug modes

**Location:** `/app/doctor/admin/technical`
**Component:** `AdminSettingsSection`

| Setting key | UI Label | Type | Who configures | Description |
|-------------|----------|------|----------------|-------------|
| `dev_mode` | Dev Mode | bool | Admin | Enables test account relay guard + includes test accounts in analytics |
| `debug_forward_to_admin` | Подробные логи | bool | Admin | Verbose operational logs in journalctl (webapp + integrator) |
| `max_debug_page_enabled` | Verbose Mini App auth log | bool | Admin | Log full initData in journalctl on Mini App open (Telegram + MAX) |
| `important_fallback_delay_minutes` | Fallback delay (min) | int | Admin | Minutes delay for important message fallback channel |
| `platform_user_merge_v2_enabled` | Merge V2 | bool | Admin | Enable v2 user merge (requires canonical match) |
| `integrator_linked_phone_source` | Источник телефона | enum | Admin | How integrator builds linkedPhone: `public_then_contacts` / `public_only` / `contacts_only` |
| `test_account_identifiers` | Тестовые аккаунты | JSON object | Admin | Test account phones/telegramIds/maxIds for dev_mode relay + analytics bypass |
| `integration_test_ids` | *(legacy)* | list | Admin | Legacy whitelist; no longer used in main UI; kept for compatibility |

---

### 2.14 Patient-facing settings (patient self-service)

**Location:** Patient app at `/app/patient/profile` and `/app/patient/notifications`

| Setting | Storage | Description |
|---------|---------|-------------|
| Email (patient account) | `platform_users` / email verification | Patient's email for login and notifications (OTP-verified via `/api/auth/email/*`) |
| Preferred OTP channel | `platform_users.preferred_otp_channel` or similar | How OTP codes are delivered: auto / Telegram / MAX / email |
| PIN | `user_pins` or similar table | 4-digit PIN for faster login |
| Calendar timezone | `platform_users.calendar_timezone` | Patient's own timezone for appointment display |
| Notification topic subscriptions | `topic_channel_prefs` + `patient_notification_topics` | Which notification topics enabled per channel |
| Web push subscription | `web_push_subscriptions` | Browser push subscription state |
| Messenger connections | `platform_user_bindings` | Telegram / MAX binding (connect/disconnect) |

---

## 3. Settings NOT on the Settings Page

These are settings that affect the system but do NOT appear in the main settings UI:

### 3.1 Rubitime catalog (booking integration)
**Location:** `/app/doctor/admin/booking/integrations`
- Rubitime branch/service/specialist catalog (`RubitimeSection`): cities, branches, services, specialists, branch-service mappings with Rubitime IDs
- Rubitime mapping (`BookingRubitimeMappingSection`): maps canonical entities to Rubitime counterparts; shows duplicates

### 3.2 Booking engine bridge controls
**Location:** `/app/doctor/admin/booking/integrations` → `BookingEngineSection mode="integrations"`
- Bridge enable/disable (`booking_rubitime_bridge_enabled`)
- Read sources (`booking_doctor_appointments_read_source`, `booking_slots_read_source`)
- Organization ID (`booking_default_organization_id`)

### 3.3 Specialist working day templates
**API:** `/api/admin/booking-engine/working-schedule-templates`
- Working schedule templates (not yet in UI; endpoint exists)

### 3.4 Per-patient settings (in patient card)
**Location:** Patient card in doctor cabinet
- Patient label override: the global `patient_label` setting is read-only per patient; no per-patient override exists
- Patient archive status: `archived` flag on the patient record (in patient card UI)
- Commenting/media defaults: the `doctor_patient_support_comments_without_support_default_enabled` and `doctor_patient_support_media_without_support_default_enabled` are global defaults; per-patient override may not be implemented

### 3.5 Patient home blocks (not in main settings)
**Location:** `/app/doctor/patient-home`
- Patient home blocks/items are managed via a dedicated page at `/app/doctor/patient-home`, completely separate from `/app/settings`

### 3.6 Analytics and health monitoring
**Location:** `/app/doctor/analytics`, `/app/doctor/system-health`, `/app/doctor/health-archive`, `/app/doctor/audit-log`
- These are read-only monitoring pages, not settings; but they were previously in the settings tabs under "Техническое"

### 3.7 Patient merge
**Location:** `/app/doctor/booking-merge`
- Merge candidates view and actions; referenced from admin tab but lives at a separate URL

---

## 4. Settings Key Index (system_settings table)

All keys from `ALLOWED_KEYS` in `apps/webapp/src/modules/system-settings/types.ts`:

**Scope: doctor** (7 keys):
```
patient_label
sms_fallback_enabled
doctor_patient_support_comments_without_support_default_enabled
doctor_patient_support_media_without_support_default_enabled
doctor_specialist_task_reminder_channels
doctor_appointment_reminder_enabled
doctor_appointment_reminder_offsets_minutes
```

**Scope: admin** (all other keys — 80+ keys):
```
# Operational flags
platform_user_merge_v2_enabled
integrator_linked_phone_source
debug_forward_to_admin
max_debug_page_enabled
dev_mode
important_fallback_delay_minutes
integration_test_ids
test_account_identifiers

# App parameters
app_base_url
support_contact_url
telegram_login_bot_username
max_login_bot_nickname
max_bot_api_key
vk_web_login_url
app_display_timezone

# Patient home
patient_home_daily_practice_target
patient_default_promo_treatment_program_template_id
patient_home_morning_ping_enabled
patient_home_morning_ping_local_time
patient_home_daily_warmup_rotation_enabled
patient_home_daily_warmup_rotation_times
patient_app_maintenance_enabled
patient_app_maintenance_message
patient_program_discussion_doctor_reply_from_log_enabled
patient_program_discussion_ui_enabled
patient_program_discussion_media_submission_enabled
patient_booking_url
patient_home_daily_warmup_repeat_cooldown_minutes
patient_treatment_plan_item_done_repeat_cooldown_minutes
patient_home_warmup_skip_to_next_available_enabled  # deprecated
patient_home_mood_icons

# Booking engine
booking_default_organization_id
booking_rubitime_bridge_enabled
booking_doctor_appointments_read_source
booking_calendar_show_working_hours
booking_slots_read_source
booking_payment_enabled
booking_payment_providers
booking_lifecycle_notifications
booking_allow_doctor_unlink_past_package_sessions
booking_min_notice_hours

# Video system
video_hls_pipeline_enabled
video_hls_new_uploads_auto_transcode
video_hls_reconcile_enabled
video_playback_api_enabled
video_default_delivery
video_presign_ttl_seconds
video_watermark_enabled

# Notifications
notifications_topics
smtp_outbound
web_push_vapid
admin_incident_alert_config
operator_health_alert_config
operator_health_projection_thresholds

# OAuth / Auth providers
yandex_oauth_client_id
yandex_oauth_client_secret
yandex_oauth_redirect_uri
google_client_id
google_client_secret
google_redirect_uri
google_refresh_token
google_calendar_id
google_calendar_enabled
google_connected_email
google_oauth_login_redirect_uri
apple_oauth_client_id
apple_oauth_team_id
apple_oauth_key_id
apple_oauth_private_key
apple_oauth_redirect_uri

# Access lists
allowed_telegram_ids
allowed_max_ids
admin_telegram_ids
doctor_telegram_ids
admin_max_ids
doctor_max_ids
admin_phones
doctor_phones
allowed_phones
```

**Non-system_settings storage** (important settings NOT in system_settings):
- `platform_users.calendar_timezone` — Doctor's calendar timezone (per-user in DB)
- `be_working_hours` — Working hour rows (DB table, booking engine)
- `be_schedule_blocks` — Schedule blocks (DB table)
- `be_branches`, `be_rooms`, `be_specialists`, `be_services` — Booking catalog (DB tables)
- `be_specialist_service_availabilities` — Availability matrix (DB table)
- `booking_scheduling.buffer_minutes` — Buffer between appointments (booking-scheduling port)
- `topic_channel_prefs` — Per-user per-topic per-channel notification preferences (DB table)
- `channel_preferences` — Global channel preferences per user (DB table)
- `web_push_subscriptions` — Browser push subscriptions (DB table)
- `patient_home_blocks` + items — Patient home layout (DB table)
- Booking policies — `be_cancellation_policies`, `be_reschedule_policies` (DB tables)
- Prepayment policies — `be_prepayment_policies` (DB table)
- Form fields — `be_form_fields` (DB table)
- Packages — `be_packages` (DB table)
- Products — `be_products` (DB table)

---

## 5. Proposed New Structure

### Design principles:
1. **Role-first**: doctor sees only their own settings; admin sees everything
2. **Use-case grouped**: settings grouped by what they control, not by technical category
3. **Discoverable**: the most-used settings are at the top of each group
4. **SaaS-ready**: assumes future multi-tenant model (organization admin + specialist + operator)
5. **Layout target**: 2-column card layout (owner spec CR-9) — wide main column + narrow sidebar for secondary/dangerous settings

---

### Proposed structure for `/app/settings` (doctor role):

```
Настройки
├── [MAIN COLUMN]
│   ├── 👤 МОЙ ПРОФИЛЬ
│   │   ├── Email аккаунта  (add/change/verify/delete)
│   │   ├── Часовой пояс  (calendar_timezone per user)
│   │   └── Как называть пациентов  (patient_label)
│   │
│   ├── 🔔 УВЕДОМЛЕНИЯ
│   │   ├── Push-уведомления браузера  (web push subscription + global toggle)
│   │   ├── Матрица тем × каналов  (topic_channel_prefs)
│   │   │   (Задачи / Сообщения пациентов / Комментарии к программе)
│   │   │   (× Telegram / MAX / Email / Push)
│   │   ├── Каналы напоминаний о задачах  (doctor_specialist_task_reminder_channels)
│   │   └── Напоминания о записях  (doctor_appointment_reminder_enabled + offsets)
│   │
│   └── ⚙️ ПАРАМЕТРЫ КАБИНЕТА
│       ├── SMS fallback  (sms_fallback_enabled)
│       ├── Комментарии без сопровождения  (support_comments_without_support_default)
│       └── Медиа без сопровождения  (support_media_without_support_default)
│
└── [SIDEBAR / SECONDARY]
    └── Подключить каналы (Telegram, MAX)  → link
```

---

### Proposed structure for admin settings (role: admin):

**Option A: Single-page sidebar navigation** (recommended for CR-9)
```
Настройки администратора
├── [LEFT SIDEBAR nav]
│   ├── Моя организация
│   │   ├── Параметры приложения
│   │   ├── Поддержка и ссылки
│   │   └── Часовой пояс
│   ├── Запись
│   │   ├── Каталог (локации, услуги, доступность)
│   │   ├── Расписание (рабочие часы, блоки)
│   │   ├── Правила (отмена, перенос, абонементы)
│   │   ├── Оплата (провайдеры, предоплата)
│   │   └── Публичная форма (поля, виджет, UTM)
│   ├── Приложение пациентов
│   │   ├── Главная (блоки, разминки, цель практик, настроение)
│   │   ├── Рассылки (утренний пинг, темы рассылок)
│   │   ├── Программы обсуждений (rollout flags)
│   │   └── Техработы (maintenance mode)
│   ├── Интеграции
│   │   ├── Google Календарь
│   │   ├── SMTP (исходящий email)
│   │   ├── Web Push (VAPID ключи)
│   │   └── Rubitime (маппинг, мост)
│   ├── Авторизация
│   │   ├── Telegram / MAX боты
│   │   ├── VK / Яндекс OAuth
│   │   ├── Google OAuth (вход)
│   │   └── Apple Sign In
│   ├── Доступ и роли
│   │   ├── Телефоны/ID администраторов
│   │   ├── Телефоны/ID врачей
│   │   └── Список допуска (клиенты)
│   ├── Видео система
│   │   ├── HLS конвертация
│   │   ├── Стратегия доставки
│   │   └── Presign TTL / Водяной знак
│   └── Технические режимы ⚠️
│       ├── Dev mode / Test accounts
│       ├── Логи и диагностика
│       ├── Источники данных (rubitime vs canonical)
│       ├── Мердж пользователей
│       └── Операторские алерты
│
└── [MAIN CONTENT AREA]
    └── (selected section panels render here)
```

---

### Concrete tab/page mapping recommendation:

| Current location | Proposed location | Notes |
|-----------------|-------------------|-------|
| `/app/settings?tab=specialist` | `/app/settings` (no tabs) | Make it the single doctor settings page |
| Notifications section | `/app/settings` unified | Keep alongside profile |
| `/app/doctor/admin/app-settings` → AppParameters | Моя организация → Параметры | |
| `/app/doctor/admin/app-settings` → SMTP | Интеграции → SMTP | |
| `/app/doctor/admin/app-settings` → Video | Видео система → subsection | |
| `/app/doctor/admin/app-settings` → WebPush VAPID | Интеграции → Web Push | |
| `/app/doctor/admin/app-settings` → NotificationsTopics | Приложение пациентов → Рассылки | |
| `/app/doctor/admin/auth` | Авторизация | Keep as own section |
| `/app/doctor/admin/integrations` | Интеграции → Google Календарь | |
| `/app/doctor/admin/technical` → AdminSettingsSection | Технические режимы | Keep red/warning styling |
| `/app/doctor/admin/technical` → OperatorHealthAlerts | Технические режимы → Алерты | |
| `/app/doctor/admin/booking` | Запись → Каталог | Already separate; keep URL |
| `/app/doctor/patient-home` | Приложение пациентов → Главная | Already separate; keep URL |
| AccessListsSection | Доступ и роли | Resurface in admin settings |

---

### 2-column layout for CR-9 (owner spec):

```
+------------------------------------------+--------------------+
|  [Wide main column]                       | [Narrow sidebar]   |
|                                           |                    |
|  Section card (primary settings)          | Quick links /      |
|  ─────────────────────────────────────    | Secondary info /   |
|  Section card                             | Danger zone        |
|                                           |                    |
+------------------------------------------+--------------------+
```

**Doctor settings page layout:**
- Left (wide): Profile, Notifications matrix, Cabinet parameters
- Right (narrow): Connected channels status (Telegram/MAX connected?), links to app install

**Admin settings layout:**
- Left: Sidebar nav (as above)
- Right: Selected panel content

---

## 6. Surprising / Undocumented Findings

### 6.1 Settings page is largely a "redirect hub"
The current `/app/settings` page has 6 tabs but only the "Специалист" tab has real inline content. All other tabs are thin pages with links pointing to actual admin pages under `/app/doctor/admin/*`. This creates a confusing UX where the "settings" page doesn't actually contain most settings.

### 6.2 Doctor's calendar timezone is stored differently
`doctor_appointment_reminder_*` keys are in `system_settings` with scope `doctor`, but the calendar timezone (`calendar_timezone`) is stored directly in `platform_users` table — NOT in `system_settings`. This inconsistency means there's no audit trail for timezone changes.

### 6.3 `patient_home_daily_practice_target` is accessible to ALL doctors (not admin-only)
Looking at `patientHomeDoctorSettingsActions.ts`, `savePatientHomePracticeTargetAction` calls `requireDoctorOrThrow()` not `requireAdminOrThrow()`. This means any doctor can change the global practice target, but other "patient home" settings (morning ping, warmup rotation, repeat cooldowns) are admin-only. This asymmetry is likely intentional but undocumented.

### 6.4 `AccessListsSection` component exists but its location in the nav is unclear
`AccessListsSection.tsx` exists with a full UI for editing `allowed_telegram_ids`, `doctor_telegram_ids`, `admin_telegram_ids` etc., but it's not imported in any of the current admin pages scanned. The admin phone/ID fields are managed via `AdminSettingsSection` (only first slot), and the access lists section seems to have been orphaned during the admin settings refactor.

### 6.5 The `integration_test_ids` key is deprecated
The `ALLOWED_KEYS` array has a comment saying `integration_test_ids` is "legacy: раньше whitelist для dev_mode по internal id; в текущем webapp не в основном UI, relay-guard не использует". It remains in the whitelist for backward compatibility but has no UI.

### 6.6 `patient_home_warmup_skip_to_next_available_enabled` is deprecated but still in whitelist
Marked as `@deprecated` in `types.ts` — "Legacy: pick разминки дня не читает". Parser only kept for compatibility/PATCH admin.

### 6.7 Booking engine has API-only settings not exposed in UI
`/api/admin/booking-engine/scheduling-settings` exposes `bufferMinutes` per specialist AND `minNoticeHours`, but only `BookingSoloScheduleSection` (the simpler UI) reads both. The more complex `BookingWorkingHoursSection` doesn't show buffer or notice hours settings. The `booking_calendar_show_working_hours` flag exists in `ALLOWED_KEYS` but doesn't appear in any settings section file — it seems to be read somewhere but has no UI for changing it.

### 6.8 No per-specialist settings page
Despite having `doctor_phones`, `doctor_telegram_ids`, `doctor_max_ids` keys that can route multiple users to doctor role, there's no per-specialist profile settings page. All specialist configuration is done at the admin level. In SaaS mode, each specialist would need their own profile page.

### 6.9 `notifications_topics` is a global setting but patient-facing
The `notifications_topics` key (configured by admin in app-settings) defines what subscription topics appear to ALL patients at `/app/patient/notifications`. Patient-visible content is controlled by an admin-only setting — there's no way to customize per-specialist or per-patient.

### 6.10 `patient_home_mood_icons` is saved by doctor (not just admin)
The `savePatientHomeMoodIconsAction` calls `requireDoctorOrThrow()`, meaning any doctor can change the global mood icons. This shares the same pattern as `practice_target` — low-risk content settings open to doctors, high-risk operational settings admin-only.
