# D38 — перепись переключателей админки: у каждого один потребитель?

План: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт D38.
Метод: `SYSTEM_SETTING_REGISTRY` (`apps/webapp/src/modules/system-settings/registry.ts`) —
отобраны все ключи со `scope: 'admin'` и `valueContract: 'boolean'` (35 штук — это и есть
булевы переключатели админки; строковые/структурные/секретные ключи и ключи со `scope: 'doctor'`
в перепись не включены, это не «переключатели» в смысле формулировки заказчика). Для каждого —
`grep -rn "'<key>'"` по `apps/webapp/src` (и по остальному репо там, где нашёлся 0 или спорный
результат), затем чтение найденных мест. Список файлов: `/tmp/d38/census.txt` (сессионный, не
коммитится).

## Таблица переписи

| Ключ | UI-переключатель есть? | Потребителей | Кто читает | Вывод |
|---|---|---|---|---|
| `error_tracking_enabled` | да (ErrorTrackingSettingsSection) | 1 | `app-layer/observability/errorTracking.ts` | ок |
| `platform_user_merge_v2_enabled` | да (AdminSettingsSection «Режимы») | 3 | `infra/manualMergeIntegratorGate.ts`, `api/doctor/clients/integrator-merge/route.ts`, `infra/platformUserMergePreview.ts` | ок — все 3 читают один и тот же `getConfigBool` с одинаковой логикой, не расходятся |
| `material_ratings_enabled` | нет (нет своей секции; PATCH только через `/api/admin/settings`) | 2 | `api/patient/material-ratings/route.ts`, `api/patient/material-ratings/feedback/route.ts` | ок — оба эндпоинта гейтят одинаково |
| `smsc_enabled` | **нет** | 1 | `apps/integrator/src/integrations/smsc/runtimeConfig.ts` | см. §3(а) — реальный потребитель есть, но в вебапп-админке нет ни одной формы/свитча, который его показывает |
| `debug_forward_to_admin` | да (AdminSettingsSection «Режимы») | 3 | `modules/observability/operationalVerboseLog.ts`, `modules/auth/authRouteObservability.ts`, `api/auth/exchange/route.ts` (инлайн) | ок по смыслу (все три — «включить verbose-лог»), но 3 независимые реализации чтения одного флага вместо одной точки — см. §3(б)-наблюдение |
| `max_debug_page_enabled` | да | 1 | `modules/auth/miniappAuthVerboseServerLog.ts` | ок |
| `dev_mode` | да | 2 | `modules/analytics/analyticsAudience.ts` (аналитика: включать тестовые аккаунты), `modules/system-settings/service.ts:readRelayDevContext` (relay dev-контекст) | ок — два разных предназначения одного «dev-режима», не конфликтуют |
| `patient_home_daily_warmup_rotation_enabled` | да (PatientHomeDailyWarmupRotationPanel) | 1 | `modules/patient-home/syncDailyWarmupScheduledRotation.ts` | ок |
| `patient_app_maintenance_enabled` | да | 1 | `modules/system-settings/patientMaintenance.ts` | ок |
| `specialist_signup_enabled` | да (platform/settings) | 1 | `modules/auth/specialistSignupRollout.ts` | ок |
| `patient_unsupported_client_fallback_enabled` | да (PlatformAuthChannelPolicySection, «Совместимость устройств») | 1 | `modules/auth/unsupportedClientFallback.ts` | ок |
| `auth_email_enabled` | да (PlatformAuthChannelPolicySection) | 1 (модуль) | `modules/auth/authChannelPolicy.ts` — единая точка, от неё зависят ~30 серверных роутов | ок |
| `auth_sms_enabled` | да | 1 (модуль) | то же, `authChannelPolicy.ts` | ок |
| `auth_telegram_enabled` | да | 1 (модуль) | то же | ок |
| `auth_max_enabled` | да | 1 (модуль) | то же | ок |
| `auth_oauth_google_enabled` | да | 1 (модуль) | `authChannelPolicy.ts` → `isOAuthProviderEnabled('google')` | ок, см. §3(в) — производный признак `oauth_google_enabled` уже не второй свитч |
| `auth_oauth_yandex_enabled` | да | 1 (модуль) | то же, provider `'yandex'` | ок, см. §3(в) |
| `auth_oauth_apple_enabled` | да | 1 (модуль) | то же, provider `'apple'` | ок, см. §3(в) |
| `auth_passkey_enabled` | да | 1 (модуль) | `authChannelPolicy.ts` → `isIndependentAuthMethodEnabled('passkey')` | ок |
| `auth_pin_enabled` | да | 1 (модуль) | то же, `'pin'` | ок |
| `auth_2fa_enabled` | да (PlatformAuthChannelPolicySection, «2FA») | 1 | `modules/staff-security/platformPolicy.ts` → `app-layer/guards/requireRole.ts` | ок — уже закрыто соседней сессией (`9863f5b5b`), не трогаю |
| `patient_program_discussion_doctor_reply_from_log_enabled` | да | 1 | `api/doctor/.../program-note-reply/route.ts` (прямое чтение, не через `discussionFeatureGates.ts`) | ок, но не унифицировано с соседними двумя — не критично, отдельный ключ |
| `patient_program_discussion_ui_enabled` | да | 1 (модуль) | `modules/program-item-discussion/discussionFeatureGates.ts` → 3 вызывающих места (`loadPatientProgramInteractionBundle.ts`, `messages/read/route.ts`, `discussion/summary/route.ts`) | ок — все через одну функцию |
| `patient_program_discussion_media_submission_enabled` | да | 1 (модуль) | то же, `discussionFeatureGates.ts` | ок |
| `video_hls_pipeline_enabled` | да (VideoSystemSettingsSection) | 5 (по числу call-sites) | `media-transcode/enqueue/route.ts`, `media-transcode/reconcile/route.ts`, `collectCriticalHealthSignals.ts` (только отчёт статуса), `videoHlsLegacyBackfill.ts`, `mediaTranscodeAutoEnqueue.ts` — все читают тем же `getConfigBool('video_hls_pipeline_enabled', false)` | ок — согласовано, не расходится |
| `video_hls_new_uploads_auto_transcode` | да | 1 | `app-layer/media/mediaTranscodeAutoEnqueue.ts` | ок |
| `video_hls_reconcile_enabled` | да | 2 | `media-transcode/reconcile/route.ts` (включает механику), `collectCriticalHealthSignals.ts` (только читает для статуса в дашборде здоровья, не гейтит) | ок — второй читатель не управляющий, а наблюдающий |
| `video_playback_api_enabled` | да | 3 | `PatientContentSlugArticle.tsx`, `api/media/[id]/hls/.../route.ts`, `app-layer/media/resolveMediaPlaybackPayload.ts` — все через `getPatientRuntimeBool('video_playback_api_enabled')` | ок |
| `video_watermark_enabled` | да | 1 | `apps/media-worker/src/watermarkEnabled.ts` (соседний процесс, не вебапп) | ок — реальный потребитель есть, просто не в `apps/webapp` |
| `booking_calendar_show_working_hours` | нет отдельного свитча (общая booking-форма) | 1 | `app-layer/di/buildAppDeps.ts:resolveShowWorkingHours` | ок |
| `booking_payment_enabled` | да (BookingPaymentsSection) | 1 | `modules/payments/service.ts` | ок |
| `booking_lifecycle_notifications` | да (BookingEventNotificationsSection) | 1 | `modules/booking-notifications/settings.ts` | ок |
| `booking_allow_doctor_unlink_past_package_sessions` | да (BookingPackagePastUnlinkSetting) | 1 (общий) | `api/booking-engine/packageDetachShared.ts` — общий модуль для admin- и doctor-роута отвязки | ок |
| `patient_home_warmup_skip_to_next_available_enabled` | **нет** | **0** | — | см. §3(а) — мёртвый ключ |
| `google_calendar_enabled` | да (GoogleCalendarSection) | 1 | `modules/system-settings/integrationRuntime.ts` | ок |

## 3. Три вида находок

### (а) Потребителей ноль или UI-переключателя нет — 2 находки

1. **`patient_home_warmup_skip_to_next_available_enabled` — истинно мёртвый ключ.**
   Присутствует в реестре (`registry.ts:344`) и в allow-list `/api/admin/settings` (4 упоминания
   в `route.ts`, строки 79/128/237/245 — валидируется, принимается PATCH). Есть даже парсер
   `parsePatientHomeWarmupSkipToNextAvailableEnabled()` в
   `modules/patient-home/patientHomeRepeatCooldownSettings.ts:53` — но у него **0 вызывающих мест**
   (grep по имени функции даёт только её собственное определение). Ключ нигде не читается для
   решения о поведении, и никакая форма в `apps/webapp/src/app/app/settings/**` его не отображает
   как свитч — сейчас его физически негде включить/выключить глазами, только сырым PATCH-запросом.
   Двойная мертвечина: ни UI, ни потребителя. Решение (удалить или подключить) — за владельцем, не
   меняю в этом прогоне.

2. **`smsc_enabled` — обратный случай: потребитель есть, UI нет.**
   Реально читается в `apps/integrator/src/integrations/smsc/runtimeConfig.ts:14`
   (`fetchPublicSystemSettingValueJson(db, 'smsc_enabled', 'admin')`) — гейтит интегратор. Но в
   `apps/webapp` нет ни одной формы, которая рисует для него `LabeledSwitch`; единственный путь
   его сохранить — прямой PATCH `/api/admin/settings`. Формально не «переключатель, который
   никто не слушает», а обратное: работающий рубильник, невидимый в интерфейсе. Не входит в
   формулировку work order буквально («переключателя без потребителя»), но стоит того же
   внимания владельца — фиксирую отдельно, не чиню (границы прогона не просили новых форм).

### (б) Потребителей больше одного, и они расходятся — 0 находок этого класса

Ни один из 35 булевых admin-ключей не показал реального расхождения поведения между
потребителями (в духе `auth_2fa_enabled` до фикса, где страж читал флаг, а маршрут входа — нет).
Все многопотребительские ключи (`platform_user_merge_v2_enabled`, `material_ratings_enabled`,
`video_hls_pipeline_enabled`, `video_playback_api_enabled`, `dev_mode`, ...) либо идут через один
модуль/функцию, либо несколько мест читают один и тот же `getConfigBool`/`getPublicRuntimeBool`
с одинаковым дефолтом и одинаковой трактовкой.

Единственное, что стоит на грани и заслуживает упоминания (не чиню — не входит в границы, не
поведенческий баг, а структурный долг):

- **`debug_forward_to_admin`** читается тремя независимыми реализациями: кэширующий геттер в
  `modules/observability/operationalVerboseLog.ts` (свой TTL-кэш, принимает `deps.systemSettings`),
  `modules/auth/authRouteObservability.ts` (через `getServerRuntimeBool`, отдельно) и инлайн-вызов
  в `api/auth/exchange/route.ts`. Семантика везде одна («писать verbose info-лог или нет»), значения
  не расходятся — но нет единой функции-точки, три места могут разъехаться при будущей правке.
  Не переключатель-обманка сейчас, но кандидат на будущий рефакторинг (не в этом прогоне).

### (в) Рядом с переключателем висит производный признак, который путают со вторым переключателем

**Уже исправлено — до начала этой сессии.** Работа над классом (в) для OAuth (Google/Яндекс/Apple),
которую называет work order, полностью сделана: `apps/webapp/src/app/app/admin/auth/
PlatformAuthChannelPolicySection.tsx` рисует ровно один `LabeledSwitch` на провайдера
(`auth_oauth_{google,yandex,apple}_enabled`), а производный признак `oauth_{google,yandex,apple}_enabled`
(DB-триггер, миграции 0193/0209/0210) не выведен на экран ни как второй свитч, ни как état вообще —
вместо него компонент показывает текстовое предупреждение `NotConfiguredWarning` («Включено, но
параметры не настроены — скрыто от клиента»), которое берётся из `getOAuthProviderPolicyDetail()`
(`modules/auth/authChannelPolicy.ts`) — она сверяется напрямую с геттерами credentials
(`integrationRuntime.ts`), а не с устаревшей DB-проекцией. Комментарий в `authChannelPolicy.ts:158-163`
прямо документирует это решение: «pre-existing `oauth_google_enabled` / `oauth_yandex_enabled` public
projection... is left untouched for compatibility but is no longer the source of truth for this gate».

Триггер и саму проекцию не трогал (граница work order: снос — отдельное решение). Проверил, что
`oauth_google_enabled` / `oauth_yandex_enabled` / `oauth_apple_enabled` не зарегистрированы как
самостоятельные ключи в `SYSTEM_SETTING_REGISTRY` (только фигурируют как строковое значение поля
`safeProjection` у `yandex_oauth_client_id` и т.п. — это просто имя DB-колонки для документации,
не код) — то есть их физически невозможно вывести на экран через существующий generic settings
UI, даже случайно.

Никакого второго свитча для OAuth сейчас на экране нет — задача владельца по этой части уже закрыта.
Действий в рамках этого прогона по (в) не потребовалось.

## Что видно на экране (dev, `/app/admin/auth`)

Живую проверку глазами на dev:5200 попробовал (`GET /api/auth/dev-bypass?token=dev%3Aadmin`,
затем `GET /app/admin/auth` и `GET /api/platform/settings` с сессионной cookie) — оба запроса
вернули 500. Причина по логу `apps/webapp/.next/dev/logs/next-development.log`: у shared dev-сервера
сейчас падает сам запрос `SELECT ... FROM system_settings WHERE scope = $1 AND organization_id IS
NULL` для ЛЮБОГО admin-scope чтения (не только auth-страницы — то же самое ловит `/app/settings`
на других вкладках, например `saas_organization_trials`: `permission denied for table
saas_organization_trials`, 42501). Это preexisting поломка общего dev-инстанса (несколько
параллельных воркеров сейчас правят DB grants — `worker-dev-table-grants.log` в этом же runs/
каталоге), никак не связана с кодом этой сессии: в файлах я в этом прогоне ничего не менял (вид
(в) уже был закрыт раньше), так что живую картинку экрана подтвердить не смог — фиксирую это как
факт среды, не прячу. Дальше — то, что даёт чтение кода (не через живой dev-запуск в этой сессии,
но код не менялся правкой этой сессии, так что поведение экрана — то, что зафиксировано в коде):

- Секция «Доступные способы входа» — 4 свитча (email/sms/telegram/max), под каждым — текстовое
  предупреждение, если включено, но не настроено.
- Секция «Вход через OAuth» — 3 свитча (Google/Яндекс/Apple), по одному на провайдера. Рядом с
  каждым — то же текстовое предупреждение о нехватке credentials, без второго свитча. Для Apple
  своего входного администраторского свитча по-прежнему нет ни производного, ни настоящего —
  решение владельца от 24.07 не менялось: Apple управляется только наличием credentials.
- Секции «Другие способы входа» (passkey/PIN), «2FA», «Совместимость устройств» — без изменений,
  каждая с одним свитчем на функцию.

## Итог

- Переписано 35 булевых admin-переключателей.
- Вид (а) — 2 находки (`patient_home_warmup_skip_to_next_available_enabled` — 0 потребителей и
  0 UI; `smsc_enabled` — потребитель есть, UI нет). Не чинил — решение за владельцем.
- Вид (б) — 0 находок с реальным расхождением поведения; 1 структурная заметка (`debug_forward_to_admin`,
  3 независимые реализации одного смысла) — не чинил, не поведенческий баг.
- Вид (в) — для OAuth уже сделано соседней/предыдущей сессией: второй свитч убран, показан статус
  «не настроено» текстом. Ничего дополнительно чинить не потребовалось.
- Тестов на «есть ли потребитель» не писал (это свойство исходника, не тестируется) и реестров-сторожей
  не заводил — согласно прямому запрету work order.
