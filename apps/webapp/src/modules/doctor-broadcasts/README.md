# doctor-broadcasts

Рассылки кабинета специалиста (`/app/doctor/broadcasts`).

Версия модуля: **V2** (COMMUNICATIONS_MD_V2_INITIATIVE, 2026-06-13). 5-канальная модель.

## Каналы доставки

| Канал    | `BroadcastChannel` | Механизм                                                                  | Счётчик (БД)                                          |
| -------- | ------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| Telegram | `telegram`         | `outgoing_delivery_queue` → integrator worker (telegramId биндинг)        | `user_channel_bindings WHERE channel_code='telegram'` |
| MAX      | `max`              | `outgoing_delivery_queue` → integrator worker (maxId биндинг)             | `user_channel_bindings WHERE channel_code='max'`      |
| Push     | `push`             | `fanOutBroadcastWebPush` → `runPatientWebPushNotify` (`intentType: news`) | `user_web_push_subscriptions` (активные подписки)     |
| SMS      | `sms`              | `outgoing_delivery_queue` (smsc)                                          | `platform_users.phone_normalized IS NOT NULL`         |
| Email    | `email`            | `outgoing_delivery_queue` → integrator worker (verified primary email)    | confirmed primary email contact                       |

Для каждого внешнего канала рассылки обязателен отдельный tariff entitlement и exact-org credential:
`clinic_telegram_bot`, `clinic_max_bot`, `clinic_sms`, `clinic_smtp`. Перед постановкой в очередь action
отказывает без разрешённого и сохранённого канала; queue/relay несут `senderScope='clinic_required'`, поэтому
integrator не подменяет его платформенным sender. Push может дополнять выбранный собственный канал, но не является
самостоятельным обходом этого gate.

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
- `emailDelivery.ts` — confirmed-email port и HTML-представление письма; `deliveryJobs.ts` кладёт email в ту
  же durable-очередь, что Telegram/MAX/SMS, а integrator использует exact-org SMTP без platform fallback.
- `broadcastEligible.ts` — `filterEligibleBroadcastClients` + `deriveBroadcastDeliveryPolicy`.

Поверх channel eligibility один общий send-time gate читает master-тему из `user_notification_topics`:
`service` / `organizational` / `important_notice` → `important_broadcasts`, остальные категории →
`patient_news`. Отписанный пользователь исключается до постановки Telegram/MAX/SMS jobs и до fan-out
Push/email, поэтому preview и execute видят одно множество получателей.

Telegram/MAX и email получают кнопку **«Отписаться от темы»**. Ссылка создаётся
`patient-notifications/topicUnsubscribe.ts`: HMAC-SHA256 подписывает адресата, topic code и уникальный `auditId`,
а публичный `GET /api/public/notifications/unsubscribe` без сессии идемпотентно выключает только эту master-тему.
Ответ маршрута одинаков для валидного, повторного, неизвестного и испорченного маркера и не раскрывает наличие
адресата. Служебные сообщения вне `doctor-broadcasts` такую кнопку не получают.

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
- `emailDelivery.ts` — verified-email port и HTML письма
- `broadcastEligible.ts` — eligibility + policy
- `service.ts` — `DoctorBroadcastsService`

## Follow-up (TODO)

- **Live-проверка email-рассылки:** выполнить TEST-рассылку на allowlisted owner-account и проверить queue →
  provider → signed unsubscribe целиком.
- **Preview «получат push»:** отдельное число в confirm-step; см. `docs/TODO.md` §«Web Push / PWA».
- **Новые сегменты аудитории §5.1:** На сопровождении, С программой, Приём в месяце, С абонементами и др. — требуют новых фильтров в `broadcastEligible.ts`.
- **«Выбрать вручную»:** диалог с чекбоксами пациентов + хранение `userId[]` вместо enum-фильтра.

Планируемые каналы (не активны): `home_banner`, `notification_bell` — см. `broadcastChannels.ts`.
