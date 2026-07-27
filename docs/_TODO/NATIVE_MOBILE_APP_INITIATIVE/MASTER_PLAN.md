# Native mobile app — master plan

> ## ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ — 2026-07-27
>
> Владелец, 2026-07-27, на вопрос, не выдумана ли эта инициатива: «инициатива нативного мобильного приложения
> не выдумана - просто не сейчас. Пока pwa». Тем же днём, подтверждая статус: «Мобильное - отложено».
>
> Это ОТЛОЖЕНО, НЕ отменено: скоуп реальный и когда-нибудь будет сделан, но не сейчас.
> **Не исполнять. Не заводить задачи под эти пункты. Не удалять и не архивировать этот файл.**
> PWA остаётся текущим решением до его команды. Все чекбоксы ниже размечены `- [-]` (отложено), см. канон
> разметки в `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §6.3 — вернуть в работу только по команде владельца.

Статус: было `planned`, taskdb `#915` — **сейчас ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27** (см. блок выше); implementation
task получает `doing` только после exact file scope, закрытия собственных gates, и явной команды владельца снять
отложенность.

## 1. Целевой результат

Один подписанный BersonCare app для Android/iOS:

- локально собранная native оболочка, не production WebView на `server.url`;
- серверные данные и бизнес-правила остаются на российском BersonCare backend;
- отдельная от браузерной безопасная mobile session;
- Universal Links / App Links и безопасные deep links;
- provider-neutral `app_push` с APNs/FCM и in-app source of truth;
- Telegram/MAX используются только для login/bind code flow;
- PWA/Web Push не блокируют выпуск native app и не смешиваются с native device tokens.

## 2. Рекомендуемая архитектурная гипотеза

Создать отдельный `apps/mobile` с React + Capacitor и локальным web bundle. Он использует стабильные JSON API
текущего российского backend и переиспользует shared TypeScript contracts/UI primitives там, где они не завязаны
на Next RSC. `apps/webapp` остаётся Next.js web surface и backend; бизнес-правила не копируются в mobile.

Это гипотеза до `MOB-00`, не разрешение немедленно создавать второй frontend. Текущие server components, cookie-
redirects и DB reads нельзя механически импортировать в local mobile bundle.

Отклонённый production baseline: APK/IPA, который открывает `https://...` через Capacitor `server.url`. Причины:
официально dev-only режим, слабая offline/error semantics, session/origin fragility и риск Apple 4.2.

## 3. Этапы и порядок

| Этап | Когда | Результат | AI / владелец | Оценка |
|---|---|---|---|---:|
| `MOB-00` ADR + device spike | после фиксации owner gates, без пересечения active UI | доказан shell/auth/API/push/deep-link путь; выбран первый persona/platform | AI + owner | 3–7 дней |
| `MOB-01` Shell/build/signing | после PASS `MOB-00` | воспроизводимые Android/iOS projects, local bundle, CI artifacts | AI + owner accounts | 1–2 недели |
| `MOB-02` Mobile auth/session | после auth threat review | rotating mobile session, Keychain/Keystore, revoke/device list, safe deep links | AI + security audit | 1–2 недели |
| `MOB-03` App push | вместе с privacy `NTF-01` | APNs/FCM targets, provider adapters, topic policy, tap routing | AI + provider/legal gates | 2–3 недели |
| `MOB-04` Product surfaces | после stable API contracts | согласованный patient/staff набор экранов работает из local bundle | AI + owner UX acceptance | 2–6 недель |
| `MOB-05` Device privacy/security | параллельно `MOB-03/04` | cache/screenshot/log/backup/privacy manifest controls | AI + external review | 1–2 недели |
| `MOB-06` Device/store release | после full feature gate | real-device matrix, store metadata, signed release и rollback | AI + owner/store review | 1–3 недели + review |

Инженерная оценка для **Android-first patient MVP**: примерно 4–7 недель после `MOB-00`. Для Android+iOS с
patient+staff parity: ориентир 8–14 недель. Главная неопределённость — объём RSC/SSR UI, который придётся отделить
от Next runtime; `MOB-00` обязан пересчитать оценку по реальному прототипу.

## 4. MOB-00 — ADR и вертикальный spike

### Owner gates

- [-] ~~Первый release: `patient` / `staff` / оба. Рекомендация: patient-first, staff продолжает работать в web.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Первый store: RuStore/direct Android / Google Play / App Store и порядок. Рекомендация: Android device
      prototype первым; iOS architecture проверяется одновременно, публикация — после Apple account/build gate.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Один platform binary подтверждён; per-organization white-label native apps остаются вне scope.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Billing/store policy: покупать SaaS внутри app, только управлять уже купленной подпиской или скрыть checkout до
      отдельной IAP/store-policy реализации.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

### AI work

- [-] ~~Зафиксировать current dependency map: RSC/cookies/redirects/API/PWA gates/file upload/media/auth.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~В изолированном worktree/temporary proof собрать disposable Capacitor shell с локальным `index.html`;
      production `server.url` запрещён тестом/config checker. Spike packages/platform projects не считаются
      production package: после evidence они удаляются либо явно архивируются как prototype; канонический package
      создаётся только в `MOB-01`.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Доказать на Android device/emulator и iOS simulator: API call, session exchange prototype, authenticated
      screen, app link, push token registration stub, logout/revoke.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Выбрать reuse boundary: shared contracts/primitives versus mobile-only adapters; дублирование domain logic
      запрещено.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Составить exact API gap list. Mobile не получает прямой DB access и не вводит параллельный backend.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Измерить bundle/startup/network/error UX и пересчитать `MOB-04` по экранным группам.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

### PASS

- local bundle работает без remote `server.url`;
- proof не требует ослабить cookie/CSRF/CORS для всего интернета;
- есть один typed session/push/deep-link boundary;
- owner принимает persona/platform/order и новую оценку.

## 5. MOB-01 — shell, build и release foundation

- [-] ~~Создать exact-scoped mobile package только после ADR: Capacitor core/CLI/platforms, locked versions, no
      unreviewed community plugins.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Bundle ID/application ID, environment mapping DEV/TEST/PROD и allowed origins не содержат tenant identity.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Native projects являются воспроизводимыми source artifacts; signing credentials не коммитятся.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Android build на Linux; iOS build только на owner-approved macOS/Xcode runner.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Реализовать startup, maintenance/update-required, offline/server-unavailable и safe external-link screens.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~CI собирает unsigned/test artifacts и проверяет dependency/security/privacy manifests; release signing —
      защищённый manual gate.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

Checks: clean install, reproducible build, dependency audit, no-secret scan, network allowlist negative test.

## 6. MOB-02 — mobile identity, session и deep links

- [-] ~~Короткоживущий access token + rotating refresh token; refresh хранится Keychain/Keystore и может быть отозван
      по device session. Web HttpOnly cookie flow сохраняется отдельно.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Login через email/OAuth и Telegram/MAX code не передаёт access/refresh tokens в URL или messenger.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Bind/login code одноразовый, rate-limited, purpose-bound; старые mini-app init-login paths выводятся по
      `NTF-01`, а не поддерживаются как второй mobile auth.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Universal Links/App Links имеют allowlist; custom scheme не принимает session/token и не открывает внешний URL
      внутри privileged WebView.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Logout, password/account security event и offboarding отзывают mobile sessions и push targets.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Device list показывает пользователю активные sessions без сырых push tokens/device identifiers.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

Checks: replay/rotation/race/wrong-user/wrong-org/deep-link injection, lost-device revoke, tenant-negative matrix.

## 7. MOB-03 — provider-neutral app push

Канон policy/content/cutover:
[`../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md).

- [-] ~~Event producers создают notification intent, не вызывают APNs/FCM/Web Push напрямую.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Provider-neutral delivery target различает `web_vapid`, `fcm`, `apns`; native token не записывается в
      `user_web_push_subscriptions`.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Target принадлежит platform user/device; tenant authorization повторно проверяется по event/resource context.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Token registration/rotation/logout/invalid-token/offboarding идемпотентны и имеют retention policy.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Integrator delivery chokepoint получает adapters APNs/FCM; server credentials — restricted DB-backed settings
      после S5/crypto gate, не env и не app bundle.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~App tap открывает только внутренний allowlisted route; payload не содержит presigned URL, secret или raw
      clinical/free-text content.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Web Push остаётся compatibility transport для browser users до отдельного retirement decision.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

Checks: foreground/background/killed state, multiple devices, token rotation, denied permission, retry/dedup,
wrong-tenant target, expired session, provider outage and no hidden messenger fallback.

## 8. MOB-04 — product surfaces

Декомпозиция создаётся после `MOB-00` по экранным группам и стабильным API contracts. Минимальные правила:

- native platform detector отключает PWA install/SW UI внутри app, не притворяясь standalone PWA;
- SSR/RSC данные получают явный API/bootstrap adapter; client не импортирует DB/server-only modules;
- auth, chat/inbox, reminders, booking, files/media и выбранный first-persona navigation работают end-to-end;
- upload/download используют native-safe file handling без plaintext temp files дольше операции;
- каждый пакет экранов получает real-device owner acceptance; active Doctor DNA не переписывается параллельно.

## 9. MOB-05 — privacy/security

- [-] ~~Модель данных на устройстве: что кешируется, TTL, logout/offboarding wipe, OS backup inclusion/exclusion.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Refresh tokens и keys — Keychain/Keystore; clinical data не хранится в Preferences/localStorage по умолчанию.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~App switcher/privacy screen и screenshot policy для чувствительных экранов определены threat model, не
      blanket-запретом без UX оценки.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Crash/analytics logs не содержат payload, токены, ФИО, телефоны, сообщения, файлы или diagnoses.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Apple Privacy Manifest, App Privacy и Google Data Safety совпадают с фактическими SDK/data flows.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~APNs/FCM/Apple/Google внесены в processing/vendor/transborder register и закрыты `G-04B` до production.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Rooted/jailbroken device policy, TLS pinning decision и app integrity controls имеют явный verdict; отсутствие
      pinning не маскируется словом «невозможно».~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

## 10. MOB-06 — store/release

- [-] ~~Real-device matrix: supported OS, clean install/update, permission denied/re-enabled, background/killed push,
      deep links, offline, slow network, expired/revoked session, multi-device and accessibility.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Apple 4.2 evidence показывает app-like value: native push/deep links/secure session плюс минимум один реально
      полезный native capability (например biometric app lock или safe file share/upload), а не пустой wrapper.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Billing UI прошёл store-policy review. SaaS/feature unlock не ведёт на CloudPayments WebView вопреки правилам
      store; решение зафиксировано до submission.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Demo/reviewer access не раскрывает production ПДн; privacy/support/delete-account links доступны.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде
- [-] ~~Signed artifact привязан к source SHA, SBOM/dependency report и release notes; rollback = предыдущий binary +
      backward-compatible backend, а не отключение security checks.~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ 2026-07-27: «Мобильное - отложено»; вернуть в работу только по его команде

## 11. Оркестрация и scope

- Каждый MOB-stage получает отдельный taskdb item, exact files, stable dependency SHA и risk-based audit.
- Независимые Android build, backend push adapter и legal/store packets могут идти параллельно с непересекающимся
  file scope; auth/schema/security stages сериализуются по contracts.
- После каждого пользовательски видимого пакета — owner real-device acceptance. Audit PASS не заменяет приёмку.
- Production provider credentials, store submission, signing и PROD rollout требуют отдельных owner windows.
- Один полный `pnpm run ci` выполняется на integration/release checkpoint; mobile native builds/tests добавляются к
  gate после появления package.
