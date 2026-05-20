# doctor-broadcasts

Рассылки кабинета специалиста (`/app/doctor/broadcasts`).

## Каналы доставки

| Канал UI | Очередь / механизм |
|----------|-------------------|
| `bot_message` | `outgoing_delivery_queue` → integrator worker (Telegram / MAX) |
| `sms` | та же очередь (smsc) |
| `push` | webapp `fanOutBroadcastWebPush` → `runPatientWebPushNotify` (`intentType: news`, тема `news`) |

Push отправляется только если канал выбран в форме и у пациента есть активная подписка + включён `web_push` для темы «Новости и обновления».

Планируемые каналы: `home_banner`, `notification_bell` — см. `broadcastChannels.ts`.

## Follow-up (TODO)

- **Preview «получат push»:** отдельное число в confirm-step; см. `docs/TODO.md` §«Web Push / PWA».
