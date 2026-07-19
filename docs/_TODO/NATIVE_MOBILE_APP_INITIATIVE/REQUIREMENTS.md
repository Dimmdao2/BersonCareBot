# Native mobile app — owner requirements and boundaries

## Owner requirements, 2026-07-19

- Сделать полноценное распространяемое мобильное приложение, а не строить product future вокруг обязательной PWA.
- Использовать modern web-to-native runtime; рабочая гипотеза — Capacitor (современная альтернатива Cordova).
- Telegram/MAX оставить только для login/bind codes; не использовать их для product reminders/notifications.
- Все product reminders/notifications доставлять через push приложения.
- Не превращать push в бесполезное обезличенное сообщение: применять разумный подход и не скрывать всё подряд.
  Exact event/field matrix готовят агенты после census и владелец принимает/корректирует одним пакетом.
- Учесть существующую реализацию и планы; не менять уже исполняемые SaaS/S5/Product UX/billing/Doctor DNA stages.
- Разделить работу, которую выполняют AI-агенты, и действия владельца по accounts, agreements, devices, signing,
  store review и legal/provider decisions.

## Engineering invariants

- Current Next.js SSR/RSC backend/web surface не переписывается целиком без доказанного `MOB-00` решения.
- Production remote `server.url` WebView не является допустимым baseline; native app имеет local bundle.
- Mobile client не имеет DB access и не дублирует tenant/domain authorization; использует versioned backend APIs.
- Mobile session, native push tokens и device lifecycle проектируются отдельно от browser cookie/Web Push storage.
- APNs/FCM — внешние providers; exact token/metadata/payload flow проходит `G-04B` до production.
- Engineering safe default до field-level acceptance: routine dates/statuses/details допустимы; arbitrary clinical/
  chat/intake/task/file/secret payload остаётся внутри authenticated app.
- Signing/provider secrets не попадают в app bundle, git, обычные logs или taskdb; repo integration secrets остаются
  DB-backed restricted settings по действующим правилам.
- Store billing rules проверяются до появления purchase/checkout UI в binary.

## Out of scope until a new owner decision

- отдельный native binary/white-label app для каждой организации;
- медицинская диагностика, медицинская лицензия или emergency notification guarantee;
- выключение web/PWA surface сразу после первого mobile release;
- production provider credentials, submission или rollout внутри обычного DEV worker scope;
- in-place перенос всех Next server components в mobile до screen/API decomposition `MOB-00`.
