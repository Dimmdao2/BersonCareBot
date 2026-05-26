# doctor-broadcasts

Рассылки кабинета специалиста (`/app/doctor/broadcasts`).

## Каналы доставки

| Канал UI | Очередь / механизм |
|----------|-------------------|
| `bot_message` | `outgoing_delivery_queue` → integrator worker (Telegram / MAX) |
| `sms` | та же очередь (smsc) |
| `push` | webapp `fanOutBroadcastWebPush` → `runPatientWebPushNotify` (`intentType: news`, тема `news`) |

Push отправляется только если канал выбран в форме и у пациента есть активная подписка + включён `web_push` для темы «Новости и обновления». Клик по push открывает **`/app/patient/broadcasts/{auditId}`** (полный текст рассылки).

Текст в Telegram/MAX и SMS укладывается в общий лимит **3500** символов combined plain; в боте заголовок жирный (`parse_mode: HTML`).

Получатели фиксируются в **`broadcast_audit_recipients`** при `execute` (все eligible, в т.ч. только push). См. `docs/ARCHITECTURE/DOCTOR_BROADCASTS.md`.

Планируемые каналы: `home_banner`, `notification_bell` — см. `broadcastChannels.ts`.

## Follow-up (TODO)

- **Preview «получат push»:** отдельное число в confirm-step; см. `docs/TODO.md` §«Web Push / PWA».
