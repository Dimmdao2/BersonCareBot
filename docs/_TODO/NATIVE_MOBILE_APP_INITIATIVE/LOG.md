# Execution log

Append-only. Планирование не запускает mobile implementation.

## 2026-07-19 — owner direction and repository fit audit

- Владелец выбрал полноценное native-distributed приложение вместо обязательной PWA и уточнил channel policy:
  Telegram/MAX только для login codes; reminders/notifications — push приложения.
- Термин уточнён: рекомендуемый современный runtime — Capacitor, не Cordova.
- Read-only audit подтвердил: текущий `apps/webapp` — Next.js `output: standalone`, использует SSR/RSC/cookies/API;
  готового static `webDir/index.html`, Capacitor/Cordova packages, mobile auth и native push targets нет.
- Официальный production `server.url` отвергнут: Capacitor помечает его как live-reload/non-production; Apple 4.2
  требует больше, чем перепакованный сайт.
- Сформирован отдельный `MOB-00…MOB-06` roadmap. Активные SaaS/S5/Product UX/billing/Doctor DNA планы не менялись.
- Privacy/channel implementation вынесен в `NTF-01`; APNs/FCM добавлены как внешний vendor/transborder gate, а не
  объявлены российским storage.
