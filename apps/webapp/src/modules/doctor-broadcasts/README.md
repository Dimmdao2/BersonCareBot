# doctor-broadcasts

Рассылки кабинета специалиста (`/app/doctor/broadcasts`).

Версия модуля: **V2** (COMMUNICATIONS_MD_V2_INITIATIVE, 2026-06-13). 5-канальная модель.

## Каналы доставки

| Канал | `BroadcastChannel` | Механизм | Счётчик (БД) |
|-------|-------------------|---------|--------------|
| Telegram | `telegram` | `outgoing_delivery_queue` → integrator worker (telegramId биндинг) | `user_channel_bindings WHERE channel_code='telegram'` |
| MAX | `max` | `outgoing_delivery_queue` → integrator worker (maxId биндинг) | `user_channel_bindings WHERE channel_code='max'` |
| Push | `push` | `fanOutBroadcastWebPush` → `runPatientWebPushNotify` (`intentType: news`) | `user_web_push_subscriptions` (активные подписки) |
| SMS | `sms` | `outgoing_delivery_queue` (smsc) | `platform_users.phone_normalized IS NOT NULL` |
| Email | `email` | `fanOutBroadcastEmail` → `sendTransactionalSmtpEmail` (guarded) | `platform_users.email_verified_at IS NOT NULL` |

**Legacy:** `bot_message` — старое значение, сохранено в `BroadcastChannel` для исторического аудита.
`normalizeBroadcastChannels` раскрывает `bot_message` → `["telegram", "max"]` (backward compat).
Как новый активный канал не предлагается.

`BROADCAST_ACTIVE_CHANNELS = ["telegram", "max", "push", "sms", "email"]`

`BROADCAST_DEFAULT_CHANNELS = ["telegram", "max", "push"]` — дефолт в форме и при пустом вводе.

## Доставка

- `deliveryJobs.ts` — гейтинг по каналам: `wantsTelegram`, `wantsMax`, `wantsSms`, `wantsPush`,
  `wantsEmail`. Legacy-флаг `legacyBotMessage`: если в `channels` встретился `bot_message` —
  трактуется как `telegram+max`.
- `fanOutBroadcastWebPush.ts` — push-рассылка (eligibility = активная web_push-подписка + тема `news`).
- `fanOutBroadcastEmail.ts` — email-рассылка (eligibility = верифицированный email). **Guarded:**
  если `fanOutBroadcastEmailDeps` не задан в DI (`buildAppDeps.ts`) — канал виден с реальным
  счётчиком, но отправка не происходит. Требует SMTP-конфигурации (`getSmtpValueJson` lazy getter).
- `broadcastEligible.ts` — `filterEligibleBroadcastClients` + `deriveBroadcastDeliveryPolicy`.

PWA-чат (все eligible): `appendPatientInboundAdminMessage` после `execute` (полный текст в тред).
Клик по push-уведомлению открывает `/app/patient/messages`. Legacy `/app/patient/broadcasts/{auditId}` → редирект в чат.

Текст в Telegram/MAX и SMS укладывается в общий лимит **3500** символов combined plain; в боте заголовок жирный (`parse_mode: HTML`).

Получатели фиксируются в **`broadcast_audit_recipients`** при `execute` (все eligible, в т.ч. только push).
См. `docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`.

## Реальные счётчики (`broadcastChannelCounts`)

`getChannelConnectionCounts` (pg, Drizzle — `infra/repos/broadcastChannelCounts.ts`):

```
telegram: COUNT(DISTINCT user_id) FROM user_channel_bindings WHERE channel_code = 'telegram'
max:      COUNT(DISTINCT user_id) FROM user_channel_bindings WHERE channel_code = 'max'
push:     COUNT(DISTINCT user_id) FROM user_web_push_subscriptions
sms:      COUNT(*) FROM platform_users WHERE phone_normalized IS NOT NULL AND merged_into_id IS NULL
email:    COUNT(*) FROM platform_users WHERE email_verified_at IS NOT NULL
           AND email_normalized IS NOT NULL AND merged_into_id IS NULL
```

Push был хардкодом `0` — исправлено в A4a.

Тип: `BroadcastChannelCounts` = `{ telegram, max, push, sms, email, bot_message? }` (bot_message = alias telegram, legacy).

In-memory паритет: `infra/repos/inMemoryBroadcastChannelCounts.ts`.

## Email-получатели (`pgBroadcastEmailRecipients`)

`infra/repos/pgBroadcastEmailRecipients.ts` — Drizzle реализация порта `BroadcastEmailRecipientsPort`:
запрос `getVerifiedEmailsForUserIds({ userIds })` → `platform_users WHERE user_id = ANY(::uuid[])
AND email_verified_at IS NOT NULL AND merged_into_id IS NULL`.

In-memory stub: `infra/repos/inMemoryBroadcastEmailRecipients.ts`.

## Ключевые файлы модуля

- `broadcastChannels.ts` — `BroadcastChannel`, `BROADCAST_ACTIVE_CHANNELS`, `BROADCAST_DEFAULT_CHANNELS`, `normalizeBroadcastChannels`
- `ports.ts` — `DoctorBroadcastsPort`, `BroadcastAudienceResolveResult` (+ `emailEligibleUserIds`)
- `draftPort.ts` — `BroadcastDraftPort`, `BroadcastChannelCounts`
- `deliveryJobs.ts` — создание delivery-jobs по каналам
- `fanOutBroadcastEmail.ts` — email fan-out
- `broadcastEligible.ts` — eligibility + policy
- `service.ts` — `DoctorBroadcastsService`

## Follow-up (TODO)

- **Live-проверка email-рассылки:** `fanOutBroadcastEmail` реализован guarded. Требует SMTP-конфигурации в dev-среде и ручного прогона рассылки.
- **Preview «получат push»:** отдельное число в confirm-step; см. `docs/TODO.md` §«Web Push / PWA».
- **Новые сегменты аудитории §5.1:** На сопровождении, С программой, Приём в месяце, С абонементами и др. — требуют новых фильтров в `broadcastEligible.ts`.
- **«Выбрать вручную»:** диалог с чекбоксами пациентов + хранение `userId[]` вместо enum-фильтра.

Планируемые каналы (не активны): `home_banner`, `notification_bell` — см. `broadcastChannels.ts`.
