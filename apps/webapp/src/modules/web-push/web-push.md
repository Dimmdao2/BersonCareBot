# web-push

Extension point для полного Web Push (подписка пациента, хранение endpoint/keys, отправка через VAPID из `system_settings`). Сейчас только контракт [`ports.ts`](./ports.ts); реализация — backlog PWA. Заглушка API: `GET /api/patient/web-push/status`.
