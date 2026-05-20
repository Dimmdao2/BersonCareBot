# Login / Register — журнал

Хронология по этапам [`ROADMAP.md`](ROADMAP.md). Факты prod (без секретов) — кратко.

## 2026-05-20 — Phone messenger bind: код только для `login` (PWA)

**Контекст:** при `profile_bind` (bind-phone с уже существующей сессией) после контакта в боте integrator сразу выставлял `patient_phone_trust_at`, но бот всё равно слал «Аккаунт создан… код», а PWA показывал форму OTP без необходимости.

**Сделано:**

- **`purpose` в complete API** (`POST /api/integrator/phone-messenger-bind/complete`) → integrator ветвит сообщения после контакта.
- **`login`:** OTP + `phoneAuthAccountCreated` / `phoneAuthLoginCode`; PWA — poll `otp_ready` → `phone/confirm`.
- **`profile_bind`:** без OTP, secret → `consumed`; бот — `phoneAuthPhoneLinked` + главное меню (TG); PWA — poll `consumed` → `onProfileComplete`.
- Шаблоны: `phoneAuthLoginCode`, `phoneAuthPhoneLinked` (TG/Max).

**Доки:** `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`, `apps/webapp/src/modules/auth/auth.md`, `apps/webapp/INTEGRATOR_CONTRACT.md`.

**Проверки:** `phoneMessengerBind.test.ts`, `PhoneMessengerAuthFlow.test.tsx`, integrator `executeAction` (phoneMessengerBind), complete route tests.

## 2026-05-20 — Сессия: sliding TTL 90 суток и маркер «свежий вход» (все server-login пути)

**Контекст:** после любого успешного входа (не только `AuthFlowV2`) PWA должен один раз предложить включить уведомления в **настройках ОС**, если permission уже `denied`; при этом logout→login с отключённым только в приложении push **не** должен показывать onboarding. Параллельно — продление сессии от активности без конфликта Next 16 middleware/proxy.

**Сделано:**

- **`sessionCookie.ts`:** encode/decode, `shouldRenewSession` / `renewSessionIfActive`, `applySessionRenewalToResponse` для proxy; константы имён cookie вынесены в `sessionCookieNames.ts` (клиент `freshLoginStorage` не импортирует `node:crypto`).
- **`service.ts`:** единый codec сессии (`encodeSessionCookie` / `decodeSessionCookie`); `persistNewAuthSession` — session cookie + `writeFreshLoginMarkerCookie` на **всех** путях новой сессии (`setSessionFromUser`, `exchangeIntegratorToken`, Telegram/MAX init, widget login); `clearSession` сбрасывает маркер fresh login.
- **Клиент:** `freshLoginStorage.consumeFreshLoginFlag` читает sessionStorage **или** короткоживущий cookie; `markFreshLoginAfterAuth` в `AuthFlowV2.redirectOk` — для client-only redirect после OAuth/email без server roundtrip.
- **Proxy:** `apps/webapp/src/proxy.ts` — продление сессии + прежний platform context; matcher `/app`, `/app/*`, `/api/me`, `/api/patient/*`; удалён `src/middleware.ts`.
- **`/api/me`:** `renewSessionCookieFromRequest()`; документ `apps/webapp/src/modules/auth/auth.md` — proxy вместо middleware.

**Связь с PWA:** диалог и onboarding — [`docs/PWA_INITIATIVE/LOG.md`](../PWA_INITIATIVE/LOG.md) (2026-05-20); здесь только transport сессии и маркера входа.

**Проверки:** `sessionCookie.test.ts`, `proxy.test.ts` (renew Set-Cookie на `/api/me`).

**Не делали:** изменение срока TTL для врача отдельно от 90 суток (как и раньше — одинаковый sliding TTL); browser E2E всех провайдеров OAuth.

## 2026-05-19 — Старт инициативы

- Создана папка `docs/LOGIN_REGISTER_NEW_LOGIC/`: мастер-постановка [`MAIN PLAN.md`](MAIN%20PLAN.md), `README`, `ROADMAP`, `PHASE_00`…`PHASE_08`, [`CODE_AUDIT_MAP.md`](CODE_AUDIT_MAP.md).
- Зафиксирован продуктовый тупик (чат): бот-аккаунт + email от врача → `duplicate_email` при регистрации, forgot без `user_password_credentials` / `email_verified_at`, UI forgot всегда «успех».
- На prod: `POST /api/bersoncare/send-email` **200** при отдельной попытке — SMTP/integrator живы; forgot для contact-only в journal не виден (ожидаемо).

## 2026-05-19 — PHASE_00 аудит (закрыт по коду, gate — согласование)

**Сделано:**

- Полный отчёт: [`AUDIT_REPORT.md`](AUDIT_REPORT.md).
- Подтверждён разрыв Rubitime hot path: `booking.upsert` **без** `appointment.record.upserted` → `ensureClient` / `platform_user_id` часто не выполняются.
- Подтверждён тупик contact-only: register 409, forgot silent 200, нет setup tokens / UI.
- Зафиксировано расхождение MAIN PLAN §1 (не затирать имя) с `ensureAppointmentClientTx` UPDATE (перезапись `display_name`).
- Зафиксировано расхождение `RUBITIME_BOOKING_PIPELINE.md` (post-create outbox) с `postCreateProjection.ts` + `writePort.appointments.test.ts`.
- Рекомендована миграция `user_email_setup_tokens`; черновик затронутых файлов — AUDIT §9.

**Проверки:**

- Чтение кода: `writePort.ts`, `pgUserProjection.ts`, `emailAuth.ts`, `forgot/register` routes, `sendEmailRoute.ts`, `pgPlatformUserMerge.ts`.
- `rg` appointment.record.upserted, booking.upsert, fanoutProjectionsAfterTx.

**Решения (технические, до согласования с продуктом):**

- MVP реализации: фазы **1 + 3 + 4 + 5** (см. ROADMAP); фаза 2 параллельно с 3.
- Расширить integrator `send-email` или добавить sibling route для **link** (не только OTP `code`).

**Не делали:**

- Изменения продуктового кода.
- Prod SQL / dry-run backfill.

**Gate:** закрыт.

## 2026-05-19 — Scope волны 1 (согласовано)

**Решения** ([`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md)):

- Только **live-flow**: новые Rubitime events, актуальный email врача/Rubitime, register/forgot/setup по запросу.
- **Отложено (не в волне 1):** backfill, mass setup старой базе — PHASE_07/08 **deferred**; PHASE_06 **deferred**. Планы фаз не удаляются.
- Rubitime live: phone→email find/create, `platform_user_id`, имя не трогать на existing, trusted phone, unverified email.
- Register: contact-only → setup-required, не duplicate_email.
- Forgot: reset только verified+password; contact-only → setup.

**Обновлено:** `ROADMAP.md`, `README.md`, `MAIN PLAN.md` (шапка), PHASE_00/01/05–08.

## 2026-05-19 — PHASE_01 Rubitime → platform_user

**Сделано:**

- Integrator: после каждого `booking.upsert` fan-out `appointment.record.upserted` (`buildAppointmentRecordUpsertedFanout` + `writePort.ts`) — webapp получает `ensureClientFromAppointmentProjection`.
- Webapp: `ensureAppointmentClientTx` — поиск phone → integrator_id → email; новый user с `patient_phone_trust_at` и `email_normalized`; существующий user — без перезаписи ФИО, trusted phone + contact email.
- Док: `RUBITIME_BOOKING_PIPELINE.md` (post-create path), `PHASE_01` → completed.

**Проверки:**

- `pnpm --filter @bersoncare/integrator test` (в т.ч. `buildAppointmentRecordUpsertedFanout.test.ts`, `writePort.appointments.test.ts`)
- `pnpm --filter @bersoncare/webapp exec vitest run` — `pgUserProjection.ensureAppointmentClient.test.ts`, `events.test.ts` (appointment.record.upserted)

**Не делали:**

- Backfill / PHASE_07, email setup (фазы 3–5).

## 2026-05-19 — PHASE_02 Contact email policy

**Сделано:**

- Подтверждена политика contact email: `patchAdminClientProfile` и `applyRubitimeEmailAutobind` / `ensureAppointmentClientTx` сбрасывают `email_verified_at` при новом адресе; пароль не создаётся.
- Модуль `modules/auth/emailSetupAccess` (port + noop stub до PHASE_03); хуки: `PATCH /api/admin/users/.../profile` (смена email), integrator `user.email.autobind` (`outcome: applied`).
- Forgot: комментарий — reset только при `email_verified_at` + `user_password_credentials` (`findVerifiedUserIdWithPassword`).
- Тесты: `pgUserProjection.patchAdminClientProfile.test.ts`, расширены admin profile route и `events.test` (autobind + setup enqueue).

**Проверки:**

- `pnpm --filter @bersoncare/webapp exec vitest run` — `emailSetupAccess/service.test.ts`, `pgUserProjection.patchAdminClientProfile.test.ts`, `profile/route.test.ts`, `events.test.ts` (autobind).

**Не делали:**

- Таблица `user_email_setup_tokens`, реальная отправка письма (PHASE_03).

## 2026-05-19 — PHASE_03 Email setup tokens + письмо

**Сделано:**

- Миграция `0076_user_email_setup_tokens.sql`, Drizzle schema `userEmailSetupTokens.ts`.
- Модуль `emailSetupTokens` (issue / validate / consume, TTL 24h, hash в БД, revoke active для user+email).
- `createPgEmailSetupAccessPort` вместо noop: письмо со ссылкой `{app_base_url}/app/auth/email-setup?token=…` через integrator `send-email` (`text` + `subject`, OTP `code` не обязателен).
- DI: `buildAppDeps` подключает pg-port при реальной БД; хуки PHASE_02 (doctor patch, Rubitime autobind) получают `status: enqueued`.

**Проверки:**

- `pnpm --filter @bersoncare/webapp exec drizzle-kit check` — ok.
- `pnpm --filter @bersoncare/webapp migrate` — 0076 применена локально.
- `vitest` — `emailSetupTokens/*`, `pgEmailSetupAccessPort.test.ts`, integrator `sendEmailRoute.test.ts`.

**Не делали:**

- UI `/app/auth/email-setup` и API complete/resend (PHASE_04).

---

## 2026-05-20 — PHASE_04 Email setup flow (UI + API)

**Сделано:**

- API: `POST /api/auth/email-setup/validate`, `complete`, `resend`.
- Модуль `emailSetupFlow` + `pgEmailSetupFlowPort` (contact email check, verify + upsert password в tx).
- Страница `/app/auth/email-setup` (readonly email `autoComplete=username`, password `new-password`, expired → resend).
- `emailSetupTokens.lookupEmailSetupToken` для expired/resend.
- `user_password_credentials.upsertPasswordHash`; запись `0076` в drizzle `_journal.json`.

**Проверки:**

- `pnpm --filter @bersoncare/webapp exec vitest run emailSetupFlow email-setup EmailSetupPageClient emailSetupTokens`

**Не делали:**

- Register/login state machine (PHASE_05).

---

## 2026-05-20 — PHASE_05 Register / login / forgot

**Сделано:**

- `emailPasswordLookup`: `resolveAuthState` (free / pending_registration / verified_with_password / needs_email_setup / email_conflict).
- Register: при duplicate + contact-only → `existing_account_needs_email_setup` + setup-link (`registration_claim`), не голый `duplicate_email`.
- Forgot: verified+password → reset OTP; `needs_email_setup` → setup-link (`manual_resend`), нейтральный 200.
- API: `POST …/lookup`, `POST …/setup-access`.
- `AuthFlowV2`: экран «подтвердите email и задайте пароль», ветки register/login/forgot.

**Проверки:**

- `pnpm --filter @bersoncare/webapp exec vitest run src/app/api/auth/email-password src/shared/ui/auth/AuthFlowV2.test.tsx`

**Не делали:**

- Merge (PHASE_06).

---

## 2026-05-20 — PHASE_06 Merge и identity (страховка)

**Сделано:**

- Ревью merge vs login/register: секция в [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) (identity vs merge, ограничения auto-merge, `email_conflict` → support).
- Регрессионный тест MAIN PLAN §7: manual merge переносит `appointment_records`, `patient_bookings`, `reminder_rules`, `symptom_trackings` / `symptom_entries` (dedupe singleton до bulk UPDATE).
- [`PHASE_06_MERGE_IDENTITY.md`](PHASE_06_MERGE_IDENTITY.md) — чеклист сценариев закрыт.

**Проверки:**

- `pnpm --filter @bersoncare/webapp exec vitest run src/infra/repos/pgPlatformUserMerge.test.ts`

**Не делали:**

- Изменения merge engine / manual merge API; integrator `mergeIntegratorUsers` (пути не затронуты).

**Аудит:** [`PHASE_06_AUDIT.md`](PHASE_06_AUDIT.md) (2026-05-20).

---

## 2026-05-20 — Post-MVP hardening (audit follow-up)

**Сделано:**

- **Enqueue setup-link:** общий helper `enqueueContactEmailSetup.ts` — structured log `[emailSetupAccess:enqueue_failed|enqueue_error]` вместо `.catch(() => undefined)`; подключён в admin profile patch, `user.email.autobind`, `appointment.record.upserted`, forgot (`needs_email_setup`).
- **Gap PHASE_02/MAIN PLAN §2.4:** `ensureClientFromAppointmentProjection` возвращает `contactEmailSetup` при новом/изменённом email; handler `appointment.record.upserted` вызывает `requestContactEmailSetup` (`source: rubitime`).
- **Rubitime autobind ops:** `[user.email.autobind:skipped]` для `skipped_verified` (`verified_email_unchanged` + `platformUserId`) и `skipped_conflict` (`email_taken_by_other_user`); `setEmailAutobindSkipReporter`.
- **Email setup complete:** verify + password + consume token — **одна транзакция** (`pgEmailSetupFlowPort.applyEmailSetupCompletion` + `setupTokenId`).
- **UI `already_has_login`:** единое сообщение + ссылка «Перейти ко входу» на форме setup.
- **Док:** `PLATFORM_IDENTITY_OPS.md` — `patient_phone_trust_at` в `ensureClientFromAppointmentProjection`.

**Проверки:**

- `pnpm --filter @bersoncare/webapp exec vitest run enqueueContactEmailSetup emailSetupFlow EmailSetupPageClient pgUserProjection.ensureAppointmentClient events.test.ts` — 110 passed
- `pnpm --filter @bersoncare/webapp exec tsc --noEmit` — ok

**Не делали:**

- PHASE_07 backfill, PHASE_08 mass setup; browser E2E setup; перенос `user_email_setup_tokens` при merge; unit-тесты bot/phone-only (PHASE_01 backlog); ручной smoke PHASE_04.

**Документация:** обновлены [`AUDIT_REPORT.md`](AUDIT_REPORT.md) §12, [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md), follow-up секции в [`PHASE_01_AUDIT.md`](PHASE_01_AUDIT.md) … [`PHASE_05_AUDIT.md`](PHASE_05_AUDIT.md).

---

## Шаблон записи при закрытии этапа

```markdown
## YYYY-MM-DD — PHASE_N …

- Сделано: …
- Проверки: …
- Решения: …
- Не делали: …
```
