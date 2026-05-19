# Login / Register — журнал

Хронология по этапам [`ROADMAP.md`](ROADMAP.md). Факты prod (без секретов) — кратко.

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

---

## Шаблон записи при закрытии этапа

```markdown
## YYYY-MM-DD — PHASE_N …

- Сделано: …
- Проверки: …
- Решения: …
- Не делали: …
```
