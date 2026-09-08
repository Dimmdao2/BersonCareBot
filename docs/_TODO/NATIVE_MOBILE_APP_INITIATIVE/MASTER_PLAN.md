# Therapy Go + Therapysto thin Capacitor apps — execution plan

Дата owner-решения: **2026-09-09**. Taskdb: **#915**. Статус: **doing**.
Интеграционная ветка: `feat/doctor-ui-rebuild`. PROD, store submission и release signing вне автономного scope.

## 1. Owner authority and immutable outcome

1. Выпустить два отдельных Android-приложения для RuStore:
   - **Therapy Go** — пациент;
   - **Therapysto** — специалист.
2. Это тонкие Capacitor-обёртки над действующим Next.js. Webapp, SSR/RSC, серверная авторизация, страницы и
   бизнес-правила не копируются и не переносятся в отдельный mobile frontend.
3. На iOS остаётся устанавливаемая PWA. На Android PWA тоже остаётся доступной пользователям без RuStore.
4. Нативные возможности: Universal Push от RuStore, Jitsi Android SDK, камера с выбором фото/видео внутри одного
   экрана, общая галерея фото/видео и отдельный выбор документов.
5. Новые app/PWA иконки:
   - Therapy Go — `apps/webapp/public/brand/therapygo-app-icon-source.png`, знак с шариком;
   - Therapysto — `apps/webapp/public/brand/therapysto-app-icon-source.png`, знак без шарика.
   Старые admin/clinic-brand assets не удалять; platform-admin не подменять пациентским приложением.
6. Сторонние URL открываются только внешним браузером. Привилегированный WebView загружает только собственные
   разрешённые origin; каждый native plugin повторно проверяет origin и принимает узкий typed input.
7. Worker продуктового этапа тесты не пишет. Первый независимый `auditor-live` составляет blind kill-set до чтения
   тестов, добавляет только оправданные поведенческие acceptance-тесты и проводит fault injection по `AGENTS.md`
   §10a/§10b/§24.4–§24.5.

## 2. Superseded direction

Отменены владельцем и не исполняются: отдельный `apps/mobile` SPA с копиями экранов, local production web bundle,
отдельная mobile auth/session только ради оболочки, iOS native binary, APNs/Google-first release и запрет remote
Next.js WebView. Исторические документы перенесены в
`docs/archive/2026-09-native-mobile-local-bundle-retirement/`; открытых исполняемых чекбоксов там нет.

Причина смены: remote WebView имеет origin реального сайта, поэтому существующие cookie, CSRF, SSR/RSC и API
работают как в браузере; стены spike относились к local-origin mobile SPA и не применимы к выбранной оболочке.

## 3. Target architecture

```text
                        existing Next.js webapp
                therapygo.ru             therapysto.ru
                     |                         |
          PWA Therapy Go (iOS/Android)  PWA Therapysto (iOS/Android)
                     |                         |
              Android WebView           Android WebView
                 patient flavor         specialist flavor
                       \                   /
                    one shared apps/mobile-shell
                  typed JS bridge + Kotlin plugins
                    | Universal Push / Jitsi / CameraX
```

- Один native source tree, две product flavors и отдельные application IDs/resources/store artifacts.
- `test` и `production` — отдельная build dimension; TEST использует только TEST domains и `.test` application-id
  suffix. Production config не содержит секретов.
- Webapp использует один `NativeRuntime` adapter. Browser/PWA получает web fallback; Capacitor вызывает тот же
  публичный контракт через native bridge. Параллельных upload/video/push business paths не создавать.
- Candidate application IDs до внешней регистрации: `ru.therapygo.app` и `ru.therapysto.app`. Их нельзя считать
  закреплёнными в RuStore до owner-controlled создания карточек.
- Release start URLs: `https://therapygo.ru/app/patient` и `https://therapysto.ru/app/doctor`; TEST — соответствующие
  `test.*` hosts. Redirect внутри того же first-party surface разрешён, другой origin — внешний браузер.

## 4. Execution stages and atomic acceptance

Галочку закрывает только lead после committed candidate, независимого audit evidence и собственной проверки.
Worker `done` и audit `PASS` сами по себе чекбокс не закрывают.

### M0 — authority, archive and measured baseline

- [ ] **M0-01.** Старый local-bundle план перемещён в архив, снабжён forward-link, все его открытые чекбоксы явно
      отменены owner-решением 2026-09-09; `CURRENT_AUTHORITY_MAP`, `docs/README.md` и taskdb `#915` указывают только
      на этот план.
- [ ] **M0-02.** Зафиксирован baseline: текущий SHA, существующие PWA manifests/icons, три production-входа
      `VideoMeetingStage`, все публичные file/media entrypoints, notification intent/delivery chokepoint, доступный
      Android toolchain и внешние provider gates. Числа сопровождаются точными командами.
- [ ] **M0-03.** Независимый Opus review проверил полноту плана, отсутствие копии webapp/domain logic, границы
      workstreams и реальные owner blockers; принятые усиления внесены до запуска product workers.

### M1 — two PWA identities and install surfaces

Scope: PWA metadata/manifests/setup pages and derived icon assets; no unrelated patient/doctor UI redesign.

- [ ] **M1-01.** Default patient PWA называется Therapy Go, использует mark с шариком, `start_url=/app/patient`,
      корректные 192/512/maskable/apple-touch assets и устанавливается на iOS Safari и Android browser.
- [ ] **M1-02.** Staff PWA называется Therapysto, использует mark без шарика, `start_url=/app/doctor` и отдельные
      192/512/maskable/apple-touch assets. Patient/staff manifests не наследуют иконки друг друга.
- [ ] **M1-03.** Platform-admin surface не получает patient/staff install prompt; существующий чёрный admin asset
      сохраняется. Clinic-specific blue/tenant assets не удаляются и не подменяются глобальным Therapy Go mark.
- [ ] **M1-04.** `/setup` даёт краткую корректную инструкцию установки для текущей surface: iOS Safari и Android
      browser. Внутри Capacitor install UI и service-worker/PWA prompts скрыты единым native detector.

### M2 — reproducible shared Android/Capacitor shell

Scope: `apps/mobile-shell/**`, root workspace/package wiring and build documentation. No product page copies.

- [ ] **M2-01.** Создан один workspace package на pin-compatible Capacitor 8 с Android source artifacts, двумя
      product flavors `therapygo`/`therapysto` и environment dimension `test`/`production`; четыре unsigned build
      variants воспроизводимы на Linux.
- [ ] **M2-02.** Flavors имеют отдельные application IDs, names, supplied icons/adaptive icons, splash resources,
      theme colors, start URLs and allowed origins. Signing credentials/service tokens отсутствуют в git и bundle.
- [ ] **M2-03.** Shell показывает startup/loading/offline/server-unavailable state, корректно обрабатывает Android
      back/navigation и не обещает offline business data. HTTP/WebView cache используется штатно, video cache не
      добавляется.
- [ ] **M2-04.** Один navigation policy является chokepoint: first-party surface остаётся в WebView; `http(s)` на
      другой origin, `mailto`, `tel` и custom external schemes уходят в системный browser/app; intent/file schemes
      без явного allowlist отклоняются.
- [ ] **M2-05.** Bridge и каждый plugin fail closed для недоверенного origin. Cleartext traffic запрещён release-
      конфигурацией; logs не содержат cookies, fragment secrets, Jitsi JWT, push tokens или media presigned URLs.
- [ ] **M2-06.** README содержит точные команды sync/build, расположение APK, требования JDK/Android SDK и процесс
      создания RuStore signing artifact без приватного ключа в repository.

### M3 — one typed NativeRuntime boundary in webapp

Scope: shared browser/native adapters and narrow integration points. Apply `AGENTS.md` §5 “one common path”.

- [ ] **M3-01.** Есть один строго типизированный `NativeRuntime` boundary с browser fallback и Capacitor adapter;
      product pages не читают `window.Capacitor` и не импортируют Kotlin/plugin details напрямую.
- [ ] **M3-02.** Runtime сообщает `browser|therapygo_android|therapysto_android`, app version и capability flags;
      server authorization не доверяет этим значениям как роли/org identity.
- [ ] **M3-03.** App lifecycle resume обновляет session-dependent push registration safely; logout/offboarding
      вызывает единый revoke path. Отсутствующий plugin деградирует в web behavior без белого экрана.

### M4 — native Jitsi without a second video page

Scope: native Jitsi plugin plus existing `VideoMeetingStage` seam. Current `#1100` owner requirements remain
authority for the browser path; do not overlap an active `#1100` worker before its landing.

- [ ] **M4-01.** `VideoMeetingStage` retains one provider-neutral render contract. Browser uses the existing iframe
      renderer; trusted Android runtime opens Jitsi Android SDK with the same endpoint, room reference and JWT.
- [ ] **M4-02.** Jitsi runs in a native full-screen Activity, returns joined/terminated/error events, honors explicit
      user start, microphone/camera permissions, hangup and retry, and never prints room/JWT/guest secret in logs.
- [ ] **M4-03.** Therapy Go and Therapysto both reach the same self-hosted `meet.therapysto.ru`/TEST counterpart;
      `meet.jit.si`, JaaS and other external media/telemetry endpoints are absent.
- [ ] **M4-04.** Specialist can return from native call to the unchanged notes/encounter page; no separate mobile
      notes implementation is created. Browser/PWA video behavior remains operational.

### M5 — camera, gallery, documents and streaming upload

Scope: one media-source adapter, Android CameraX/pickers, and existing upload services. Do not create a second media
library or bypass presign/confirm authorization.

- [ ] **M5-01.** One `DeviceMedia` contract exposes `captureMedia`, `pickMedia`, `pickDocument`, `upload`; all
      existing in-scope upload UI parameterizes this seam instead of owning duplicate native detection.
- [ ] **M5-02.** Android camera screen uses CameraX and lets the user switch Photo/Video in the camera itself;
      front/back camera and runtime permissions work, cancellation returns without a fake error.
- [ ] **M5-03.** Gallery accepts images/videos together through the system picker; document action is separate and
      uses the system document picker with narrow MIME filters.
- [ ] **M5-04.** Large media remains a native content URI and streams to the existing authorized presigned URL;
      no base64 bridge or whole-video JS heap copy. Existing confirm/failure semantics and media metadata are reused.
- [ ] **M5-05.** Browser/PWA retains standards-based file inputs with distinct camera/media/document actions where
      the browser exposes them. Native-only capability never makes browser upload worse.

### M6 — RuStore Universal Push end to end

Scope: provider-neutral native target model, server delivery adapter, Kotlin Universal Push bridge and tap routing.
Configuration obeys `AGENTS.md` §2–§5 and extends NTF-01/N2 rather than inventing a parallel notification system.

- [ ] **M6-01.** Native targets are stored separately from `user_web_push_subscriptions`; target belongs to a
      platform user/device/app/provider, preserves organization context where required, encrypts recoverable token
      material and uses a non-secret hash for idempotent uniqueness.
- [ ] **M6-02.** Authenticated register/rotate/revoke endpoints are thin and call one service/port. Logout,
      offboarding and provider invalid-token responses deactivate targets idempotently; raw tokens never enter logs,
      taskdb or delivery-attempt payloads.
- [ ] **M6-03.** Kotlin plugin integrates RuStore Universal Push SDK 7.4.1 directly (no temporary direct-RuStore
      implementation), initially enables RuStore provider and reports availability/new token/message/errors through
      the typed bridge. FCM/HMS remain addable providers without JS/schema redesign.
- [ ] **M6-04.** Existing notification intent/delivery chokepoint gets a `rustore_universal_push` adapter using
      RuStore Universal Push API; event producers do not call the provider. Project ID/auth token/endpoint live only
      in restricted DB-backed `system_settings`, not env/app bundle.
- [ ] **M6-05.** Payload carries minimal title/body plus allowlisted internal route; no raw clinical/chat/free-text,
      file name, presigned URL, cookie, token or organization secret. Tap routes inside the correct app surface;
      external/deceptive routes are rejected.
- [ ] **M6-06.** Android notification permission and stable channels are implemented. Routine reminders, calls and
      messages may use separately configured bundled sounds; Android user channel settings remain authoritative.
- [ ] **M6-07.** Denied permission/no provider/no active target preserves the canonical in-app state and records a
      non-secret observable outcome; it does not silently fall back to an unauthorized messenger channel.

### M7 — independent audits and integration gate

- [ ] **M7-01.** Each new surface receives one independent `auditor-live` pass: shell/navigation security,
      web/native bridge+PWA, Jitsi/media, native-target lifecycle/provider delivery. Auditor starts with `test or
      view`, builds blind kill-set before reading tests and records fault-injection evidence.
- [ ] **M7-02.** Workers wrote no tests. Auditor-added tests protect only stable behavior/security contracts;
      source-text, UI wording/count/layout and implementation-call tests are absent or removed when encountered in
      touched scope, except incident-backed tests with a named observable failure.
- [ ] **M7-03.** Both TEST APK variants assemble on Linux. Browser/PWA live acceptance covers install metadata,
      file fallback and iframe Jitsi; Android emulator/device acceptance covers origins/external links, camera,
      documents, native Jitsi, permission states and notification tap.
- [ ] **M7-04.** Targeted/phase checks are green on candidate SHAs. Because this changes root dependencies,
      lockfile, webapp, integrator and Android package, one full CI runs under the host lock only at final integration.
- [ ] **M7-05.** Integrated `feat/doctor-ui-rebuild` contains plan evidence per checkbox, taskdb `#915` matches fact,
      commits are pushed through the checked wrapper and no worker clone/process is left active.

## 5. Parallel workstreams

Work begins only after M0-03 plan review.

1. **Shell/native foundation** — `apps/mobile-shell/**`, root workspace wiring. First and sequential because other
   native work depends on its Gradle/Capacitor contract.
2. After foundation, three non-overlapping candidates may run in parallel:
   - **Native capabilities:** only `apps/mobile-shell/**` — Universal Push client bridge, Jitsi Activity, CameraX,
     system pickers and native streaming uploader.
   - **Web/PWA adapters:** PWA assets/manifests/setup, `NativeRuntime`, `VideoMeetingStage` adapter and existing
     media UI/services; excludes DB/integrator/native project.
   - **Push backend:** native target schema/service/repository/routes, DB-backed settings and provider delivery;
     excludes UI, current `#1100` files and native project.
3. Lead lands audited branches one at a time, resolves integration seams, then runs final app-level/full gates.

Every worker brief quotes the exact M-IDs and text, points to relevant `AGENTS.md` sections and asks whether an
existing chokepoint can be parameterized instead of adding a parallel function.

## 6. External/owner gates — not reasons to stop repository work

- RuStore application cards, final immutable package IDs, Universal Push project IDs/service tokens.
- Release keystore/signing, signed AAB/APK and store submission.
- Physical Android real-device acceptance and final notification delivery through RuStore infrastructure.
- PROD credentials/configuration/deploy and any Google Play/App Store work.

Repository code, unsigned TEST APKs, mocks/fakes against published protocols, PWA behavior, documentation and
security/audit gates proceed without those inputs. Missing external inputs are recorded as blockers only for the
specific release/runtime checkbox, never as a reason to abandon the whole plan.

## 7. Evidence ledger

| ID | Status | Evidence |
|---|---|---|
| M0-01…M7-05 | open | Filled by lead only after committed implementation + independent acceptance. |
