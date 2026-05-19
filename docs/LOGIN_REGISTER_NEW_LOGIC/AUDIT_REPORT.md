# Отчёт аудита (фаза 0)

**Дата:** 2026-05-19 (baseline); **обновление статуса:** 2026-05-20  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md)  
**Статус инициативы:** §1–11 — **исторический снимок кода до реализации** (фаза 0). **Волна 1 (PHASE_01–06) закрыта** по коду; post-MVP hardening — [`LOG.md`](LOG.md) 2026-05-20. Актуальные вердикты: [`PHASE_01_AUDIT.md`](PHASE_01_AUDIT.md) … [`PHASE_06_AUDIT.md`](PHASE_06_AUDIT.md).

> Не использовать этот файл как описание **текущего** prod без §12.

---

## 1. Резюме для продукта

| Проблема (из постановки) | Подтверждено кодом | Корневая причина |
|--------------------------|-------------------|------------------|
| Запись из Rubitime есть, карточка пациента не всегда | **Да** | Горячий путь Rubitime → `booking.upsert` **не** шлёт `appointment.record.upserted` в webapp → `ensureClientFromAppointmentProjection` часто **не вызывается** |
| Врач добавил email, регистрация — «email занят» | **Да** | Email на существующем `platform_users`; регистрация всегда `INSERT` нового client → `23505` |
| Forgot — «отправили», письма нет | **Да** | `forgot` требует `user_password_credentials` + `email_verified_at`; contact-only → **нет** `startEmailChallenge`; UI всё равно success |
| Вход PWA по email+паролю | **Нет пути** | Нет «claim / setup access» на существующую карточку (планируется фазы 3–5) |

**Сценарий пользователя (бот + email от врача):** полностью воспроизводится текущим кодом. SMTP/integrator при этом могут быть исправны (отдельная проверка `send-email` 200 не отменяет тупик forgot для contact-only).

---

## 2. Rubitime → `platform_user` (MAIN PLAN §1)

### 2.1 Фактический поток сегодня

```text
Rubitime webhook / post-create
  → integrator: eventGateway + scripts (rubitime.record.*)
  → writePort: booking.upsert
       → public.appointment_records (без platform_user_id в upsert integrator)
       → patient_bookings compat (userId = resolvePlatformUserIdForRubitimeBooking, lookup-only)
  → опционально: webappEventsPort.emit(user.email.autobind)  [только create + phone+email]

НЕ вызывается на этом пути:
  → appointment.record.upserted
  → ensureClientFromAppointmentProjection
  → pgAppointmentProjection SQL для platform_user_id
```

**Источники:**  
`apps/integrator/src/infra/db/writePort.ts` (`booking.upsert`, ~191–313)  
`apps/integrator/src/integrations/rubitime/postCreateProjection.ts` (только `booking.upsert` + autobind)  
`apps/integrator/src/infra/db/writePort.appointments.test.ts` — в SQL `booking.upsert` **нет** `projection_outbox`

**Расхождение с документацией:**  
`docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md` (§ Native booking) утверждает `enqueueProjectionEvent('appointment.record.upserted')` после `booking.upsert` — **в коде post-create этого нет**. Канон для аудита: **код**.

### 2.2 Когда `appointment_records.platform_user_id` заполняется

| Путь | Поведение |
|------|-----------|
| Integrator `booking.upsert` | Колонка **не пишется** (`publicAppointmentRecordSync.ts`) |
| Webapp `upsertRecordFromProjection` | Только при HTTP-событии `appointment.record.upserted`: подзапрос по `user_phone_history` / lone `platform_users.phone_normalized` |
| `ensureClient` + projection | Если phone есть и событие дошло — `userId` в compat; SQL может проставить `platform_user_id` |

**Остаётся NULL:** только integrator-path; ambiguous phone; merge conflict; нет телефона.

**UI врача:** `pgDoctorClients.ts` — join по `platform_user_id` **или** phone/history при NULL (карточка может «находиться» без заполненной колонки).

### 2.3 Find/create — порядок vs MAIN PLAN

| MAIN PLAN | Код сегодня |
|-----------|-------------|
| Сначала phone, затем email | **Phone → integrator_user_id** в `ensureAppointmentClientTx`; **email search/create нет** |
| Email при create — unverified | При INSERT в ensure — email в поле, **без** `email_verified_at` (NULL) |
| Trusted phone из Rubitime | INSERT ensure **без** `patient_phone_trust_at`; autobind **не** ставит trust |
| Не переименовывать существующего | **Нарушение:** UPDATE в `ensureAppointmentClientTx` перезаписывает `display_name` / first / last при непустом payload (комментарий в коде: «overwrite», строки 329–355 `pgUserProjection.ts`) |

### 2.4 `applyRubitimeEmailAutobind`

- Событие: `user.email.autobind` (integrator `buildUserEmailAutobindWebappEvent` — только **create-record** + phone + email).
- Поиск user: **только** `phone_normalized`.
- Исходы: `skipped_no_user` | `skipped_verified` | `skipped_conflict` | `applied`.
- При apply: `email`, `email_normalized`, **`email_verified_at = NULL`**.

**Не покрыто:** email-only Rubitime client; user ещё не создан по phone → autobind noop.

### 2.5 Gaps (список для фазы 1)

1. Подключить identity/projection к **всем** Rubitime upsert (outbox/sync emit `appointment.record.upserted` **или** ensure+link внутри integrator tx).
2. Find by **email** перед create (MAIN PLAN §1.3).
3. Не затирать `display_name` существующего user (расхождение с PHASE_01).
4. Trusted phone при Rubitime create/match (`patient_phone_trust_at`).
5. Синхронизировать `RUBITIME_BOOKING_PIPELINE.md` с кодом.

---

## 3. Email contact / врач / Rubitime (MAIN PLAN §2)

### 3.1 `patchAdminClientProfile` (врач/admin)

Файл: `apps/webapp/src/infra/repos/pgUserProjection.ts` (582–599).

- При смене email (distinct) → **`email_verified_at = NULL`**.
- При очистке email → NULL.
- При том же email (re-save) → verified сохраняется.
- **`user_password_credentials` не создаётся.**

**Нет сегодня:** выпуск setup-token, письмо «подтвердите и задайте пароль».

### 3.2 Регистрация / forgot / reset

| Endpoint | Условие отправки почты | Ответ при contact-only |
|----------|------------------------|-------------------------|
| `POST .../register` | Новый user + `startEmailChallenge` (await) | `duplicate_email` → `tryResend` только если есть password row + unverified |
| `POST .../forgot` | `findVerifiedUserIdWithPassword` | **200 ok**, send **не** вызывается |
| `POST .../reset` | verified + password + valid challenge | `invalid_code` (dummy user если нет verified) |
| `POST .../email/start` (сессия) | `startEmailChallenge` | Ошибки видны (503 `email_send_failed`) |

**Forgot** (`forgot/route.ts`): `void startEmailChallenge(...).catch(() => undefined)` — ошибки SMTP **не** влияют на HTTP.

**Код OTP** (`emailAuth.ts`): 6 цифр, TTL 10 мин, pepper HMAC, integrator `POST /api/bersoncare/send-email` с `{ to, code }` — **не** setup-link.

### 3.3 Integrator mail

- `apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts`
- SMTP: `resolveSmtpOutboundConfig` → `integrator.system_settings` `smtp_outbound` (admin), иначе env `SMTP_*` / `MAIL_*`
- Успешная отправка **не логируется** (только warn при missing secret / DB read fail)

### 3.4 Тупик «бот + email врача» (таблица состояний)

| Поле / таблица | Типично |
|----------------|---------|
| `platform_users` | Есть (Telegram/phone), `email` после врача |
| `email_verified_at` | **NULL** |
| `user_password_credentials` | **Нет** |
| Register | 409 `duplicate_email` |
| Forgot | 200, письмо **нет** |
| Login email+password | 401 |
| PWA по Telegram | **Работает** (отдельный канал) |

---

## 4. Email setup access (MAIN PLAN §3–4) — отсутствует

| Артефакт | Статус |
|----------|--------|
| Таблица `user_email_setup_tokens` | **Нет** в schema/migrations |
| URL `/app/auth/email-setup` | **Нет** |
| API validate / complete / resend | **Нет** |
| Письмо со ссылкой (не OTP) | **Нет** — только код в `send-email` |

**Вывод:** весь блок §3–5 MAIN PLAN — **greenfield** поверх существующего OTP.

---

## 5. Register / login states (MAIN PLAN §5–6)

### 5.1 Сегодня

- Register: бинарный `duplicate_email` (409), без `existing_account_needs_email_setup`.
- AuthFlowV2: toast «email занят или неверный пароль» — **не различает** contact-only vs чужой аккаунт vs неверный пароль resend.
- Forgot UI: всегда переход к вводу кода после neutral success.

### 5.2 Целевые состояния (из MAIN PLAN) — gap

| # | Состояние | Реализовано |
|---|-----------|-------------|
| 1 | Email свободен → register | Да |
| 2 | Contact-only → setup link | **Нет** |
| 3 | Verified + password → login/forgot | Да |
| 4 | Verified, нет password → setup | **Нет** |
| 5 | Конфликт / несколько кандидатов → support | Частично (merge/conflict в других потоках) |

---

## 6. Merge (MAIN PLAN §7)

### 6.1 Ручной merge

- UI: `AdminMergeAccountsPanel`, API `doctor/clients/merge*`, `integrator-merge` (v2).
- Движок: `packages/platform-merge/src/pgPlatformUserMerge.ts` — appointments, symptom_*, reminders, LFK, bindings, OAuth, passwords, email challenges.

**Gap для инициативы:** нет регрессионного теста «appointments + diary на одном canonical» (MAIN PLAN §11).

### 6.2 v1 / v2

- Флаг: `platform_user_merge_v2_enabled` (`system_settings` admin).
- v2: два `integrator_user_id` → сначала integrator M2M merge, потом webapp.

Auto-merge по phone (`projection`, `phone_bind`) **не** зависит от v2.

### 6.3 vs Rubitime/email initiative

| Сценарий MAIN PLAN | Код |
|---------------------|-----|
| Предотвратить дубль phone/email при Rubitime | **Слабо:** нет email-find; hot path без ensure |
| Email user + Rubitime phone → trusted на том же user | **Нет** |
| Bot + тот же phone | Phone match / merge если оба canonical; иначе conflict |
| Не затирать имя | **Нарушено** в ensure UPDATE |

**Вывод:** merge как **страховка** зрелый; приоритет — **фаза 1 + 3–5**, не новый merge engine.

---

## 7. Миграции и backfill (MAIN PLAN §9–10)

### 7.1 Поля — достаточно для MVP

- `platform_users.email`, `email_normalized`, `email_verified_at` — **есть**
- `user_password_credentials` — **есть**
- `email_challenges`, `email_send_cooldowns` — **есть** (OTP, не setup)

### 7.2 Нужно добавить (фаза 3)

Таблица `user_email_setup_tokens` — по спецификации MAIN PLAN §9 (hash token, TTL 24h, source enum, revoke).

### 7.3 Backfill

- Скрипты: `apps/webapp/scripts/backfill-rubitime-*.ts`, `apps/integrator/.../resync-rubitime-records.ts` (resync **без** fan-out).
- **Dry-run отчёта** под MAIN PLAN §10 — **нет** готового; нужен новый ops-скрипт после фазы 1.

---

## 8. Тестовое покрытие (MAIN PLAN §11)

| Группа | Есть | Нет |
|--------|------|-----|
| Rubitime projection events | `events.test.ts` (appointment.record.upserted) | E2E «webhook → platform_user_id filled» |
| Email auth forgot neutral | `forgot/route.test.ts` | contact-only → setup |
| Register duplicate | частично | `existing_account_needs_email_setup` |
| Setup token | — | весь блок |
| Merge appointments+diary | merge unit tests | сценарий §7 из MAIN PLAN |

---

## 9. Предлагаемый план файлов (для согласования)

### Фаза 1 (Rubitime)

- `apps/integrator/src/infra/db/writePort.ts`, `publicAppointmentRecordSync.ts`
- `apps/integrator/src/integrations/rubitime/*` (webhook, postCreate, connector)
- `apps/integrator/src/infra/db/repos/projectionFanout.ts` — emit после booking
- `apps/webapp/src/modules/integrator/events.ts`
- `apps/webapp/src/infra/repos/pgUserProjection.ts`, `pgAppointmentProjection.ts`
- `docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`

### Фазы 2–5 (email setup)

- `apps/webapp/db/schema/*` + migration `user_email_setup_tokens`
- `apps/webapp/src/modules/auth/emailSetup*` (service, ports)
- `apps/webapp/src/app/api/auth/email-setup/**`
- `apps/webapp/src/app/auth/email-setup/page.tsx`
- `apps/webapp/src/app/api/auth/email-password/register|forgot/route.ts`
- `apps/webapp/src/shared/ui/auth/AuthFlowV2.tsx`
- integrator: расширить `sendEmailRoute` (link body) **или** отдельный M2M template
- `apps/webapp/src/modules/auth/auth.md`, `api.md`

### Фаза 7

- `apps/webapp/scripts/rubitime-appointment-platform-user-dry-run.ts` (новый)

---

## 10. Рекомендуемый порядок реализации (после gate)

1. **PHASE_01** — Rubitime identity (разблокирует врача и backfill).
2. **PHASE_03 → 04 → 05** — tokens, setup UI, auth states (разблокирует сценарий бот+email).
3. **PHASE_02** — можно параллельно с 3 (триггеры письма после patch/autobind).
4. **PHASE_06** — тесты merge + правка overwrite name (может войти в 1).
5. **PHASE_07** — dry-run → apply.
6. **PHASE_08** — только по отдельному OK.

---

## 11. Gate фазы 0

| Критерий PHASE_00 | Статус |
|-------------------|--------|
| Аудит CODE_AUDIT_MAP | **Выполнен** (этот отчёт) |
| Список файлов / миграций | **§9** |
| Подтверждение `user_email_setup_tokens` | Рекомендация: **да** |
| Продуктовое согласование MVP | **Ожидает** (вопросы в README / чат) |
| Старт кода | **Запрещён** до ответов на блокеры (на момент 2026-05-19) |

---

## 12. Состояние после фаз 1–6 + hardening (2026-05-20)

| Блок PHASE_00 (§) | Было (2026-05-19) | Сейчас |
|-------------------|-------------------|--------|
| §2 Rubitime hot path | Нет fan-out → нет ensure | **PHASE_01:** `appointment.record.upserted` после `booking.upsert`; ensure + `platform_user_id` на live-path |
| §2.3 overwrite имени | ensure UPDATE затирал ФИО | **Исправлено** в `ensureAppointmentClientTx`; messenger `upsertFromProjectionTx` — отдельный legacy-path |
| §2.3 trusted phone | Нет `patient_phone_trust_at` | **Исправлено** в ensure INSERT/UPDATE |
| §2 email find | Нет | **Исправлено:** phone → integrator_id → email |
| §3 contact email + setup | Нет токенов/писем | **PHASE_02–03:** политика + tokens + mail; **hardening:** enqueue на `appointment.record.upserted` при новом/изменённом email |
| §3 forgot/register тупик | duplicate / silent forgot | **PHASE_05:** `existing_account_needs_email_setup`, forgot → setup |
| §4 setup UI | Нет | **PHASE_04:** `/app/auth/email-setup`, validate/complete/resend; **hardening:** consume token в одной tx с verify+password |
| §5 auth states | Нет | **PHASE_05:** `resolveAuthState`, `AuthFlowV2`, lookup/setup-access |
| §6 merge тест §7.3 | Нет | **PHASE_06:** unit-тест appointments + diary/warmup при manual merge |
| §7 migrations | Нет `user_email_setup_tokens` | **0076** + journal (PHASE_03–04) |

**Post-MVP hardening (2026-05-20):** structured logging enqueue (`enqueueContactEmailSetup.ts`); autobind skip reporter (`skipped_verified` / conflict); UI `already_has_login`; см. [`LOG.md`](LOG.md).

**По-прежнему deferred:** PHASE_07 backfill, PHASE_08 mass setup; ручной smoke / browser E2E setup; перенос setup-токенов при merge; часть unit-тестов из рекомендаций phase-аудитов.

**Детали по этапам:** [`PHASE_01_AUDIT.md`](PHASE_01_AUDIT.md) … [`PHASE_06_AUDIT.md`](PHASE_06_AUDIT.md).
