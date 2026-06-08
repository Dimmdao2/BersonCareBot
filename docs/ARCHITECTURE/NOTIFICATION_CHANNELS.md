# Каналы уведомлений: Web Push — основной

**Статус:** канон с **2026-06-08**.  
**Код:** `apps/webapp/src/modules/doctor-notifications/`, `apps/webapp/src/modules/patient-notifications/`, `apps/webapp/src/modules/web-push/`.

## Принцип

**Web Push (PWA) — основной канал доставки уведомлений** для пользователей с активной подпиской. Telegram, MAX, email и SMS — **дополнительные** каналы: дублируют или подстраховывают доставку, когда push недоступен (нет подписки, отказ ОС, нет VAPID) или явно включены в матрице настроек.

Не проектировать новые сценарии как «сначала только бот» без push в дефолтах и observability.

## Пациент

| Область | Поведение |
|---------|-----------|
| Inbox | PWA-чат `/app/patient/messages` — единая история; push ведёт в чат — см. [`PATIENT_SUPPORT_CHAT_INBOX.md`](PATIENT_SUPPORT_CHAT_INBOX.md) |
| Расчёт каналов | `resolvePatientNotificationChannels` — порядок проверки **`web_push` → telegram → max → email`** |
| Подписка | `/api/patient/web-push/subscribe` — включает глобальный канал и topic-defaults в `user_notification_topic_channels` |
| Напоминания / запись | Integrator запрашивает targets у webapp; push-copy и M2M `patient-notifications/web-push` — см. [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) |

## Специалист (врач / admin, Staff PWA)

| Тема | Дефолт каналов (без строк в `user_notification_topic_channels`) | Код |
|------|------------------------------------------------------------------|-----|
| `doctor_patient_messages` | **`web_push`, telegram, max** | `defaultDoctorTopicFallbackChannels` |
| `doctor_patient_program_notes` | **`web_push`, telegram, max** | то же |
| `doctor_specialist_task_reminders` | fallback из `doctor_specialist_task_reminder_channels` (doctor scope) + per-topic prefs | `resolveSpecialistTaskReminderChannels` |

**Per-staff доставка** (сообщения и комментарии пациента): `notifyDoctorPatientMessageToStaff` — fan-out по каждому активному staff-user с учётом привязок и матрицы `/app/settings`.

**Подписка staff:** `/api/doctor/web-push/subscribe` → `enableStaffWebPushNotificationDefaults` (явные строки `web_push=true` для doctor-тем, если их ещё не было).

**Env fallback** (`doctor_telegram_ids`, `doctor_max_ids`, …) — только если per-staff **telegram/max** не доставили; push **не** заменяется env-списками.

**Логи (journalctl webapp):** при staff-уведомлениях — `doctor_staff_notify.channels` (выбранные каналы); успех push — `web_push_provider_response` (`verbose` включён на staff-path).

## Настройки и данные

- Матрица тем × каналов: `public.user_notification_topic_channels` (`user_id`, `topic_code`, `channel_code`, `is_enabled`).
- Глобальный выключатель канала: `public.user_channel_preferences` (`is_enabled_for_notifications`).
- Подписки: `public.user_web_push_subscriptions`.
- VAPID: `system_settings.web_push_vapid` (admin) — см. [`CONFIGURATION_ENV_VS_DATABASE.md`](CONFIGURATION_ENV_VS_DATABASE.md).

Явное **отключение** канала в матрице (`is_enabled: false`) перекрывает дефолт. Отсутствие подписки на push — канал пропускается, остальные дефолтные каналы с привязками остаются.

## Связанные документы

- Staff PWA и install: [`DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/STAFF_PWA_ADR.md`](../DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/STAFF_PWA_ADR.md)
- Program note → врачу: [`DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md)
- Support chat M2M: [`INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) §Support chat
- API: [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) — `doctor/web-push/*`, `patient/web-push/*`
