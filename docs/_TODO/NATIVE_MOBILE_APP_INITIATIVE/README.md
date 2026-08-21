# Native mobile app initiative

Статус: `MOB-00 in progress` (разморожено владельцем 2026-08-21, дословно: «разведочного этапа MOB-00 - запусти агента»), taskdb `#915`; код и store-публикация не начаты. Заморозка 27.07 и её снятие — в шапке [`MASTER_PLAN.md`](MASTER_PLAN.md). Разморожен ТОЛЬКО `MOB-00`; `MOB-01`+ по-прежнему закрыты.

Owner direction 2026-07-19: целевой мобильный продукт — единое полноценное приложение BersonCare для iOS и
Android, а не обязательная PWA. Telegram и MAX остаются только auth-каналами для login/bind codes; продуктовые
уведомления и напоминания доставляются через push приложения.

Техническая гипотеза: **Capacitor** как native runtime. Она подтверждается только этапом `MOB-00`, потому что
текущий `apps/webapp` собирается как Next.js `standalone` с SSR/RSC/API и не имеет статического `webDir/index.html`.
Production `server.url` не принимается как архитектура: Capacitor документирует его как live-reload механизм,
не предназначенный для production.

## Канон

- owner requirements: [`REQUIREMENTS.md`](REQUIREMENTS.md);
- подробный план: [`MASTER_PLAN.md`](MASTER_PLAN.md);
- действия владельца: [`OWNER_ACTIONS.md`](OWNER_ACTIONS.md);
- финальная приёмка: [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md);
- append-only журнал: [`LOG.md`](LOG.md);
- notification/privacy boundary:
  [`../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md).

## Scope boundary

- Это отдельная будущая инициатива. Она не меняет порядок активных D3/D4, S5, Product UX, billing и Doctor DNA.
- Первая архитектура — один platform app для всех организаций. Отдельные white-label binaries организаций сюда
  не входят.
- Web/PWA остаётся поддерживаемой поверхностью, пока отдельное owner decision не отменит её.
- До перевода `MOB-00` в `doing` не добавлять Capacitor packages, `ios/`, `android/`, mobile auth schema или provider
  keys. Внутри `MOB-00` разрешён только изолированный disposable spike; production package/native projects и
  schema начинаются после его PASS в `MOB-01/MOB-02`.

## Проверенные внешние ограничения

- Capacitor требует директорию собранных web assets с корневым `index.html`:
  [официальная установка](https://capacitorjs.com/docs/getting-started).
- `server.url` и `allowNavigation` помечены как не предназначенные для production:
  [официальная конфигурация](https://capacitorjs.com/docs/config).
- Native push: APNs на iOS и FCM SDK на Android:
  [официальный Push Notifications plugin](https://capacitorjs.com/docs/apis/push-notifications).
- Apple требует функциональность выше уровня перепакованного сайта:
  [App Review Guideline 4.2](https://developer.apple.com/app-store/review/guidelines/).
