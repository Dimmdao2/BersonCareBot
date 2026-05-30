# Login / Register — Rubitime, email setup access, merge

Инициатива: корректный identity-flow для пациентов из Rubitime, вход по email на **существующую** карточку (без дублей), setup access вместо «тупика» duplicate_email / silent forgot.

- **Согласованный scope (волна 1):** [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md) — **live-flow** + фаза 6 (merge-страховка); фазы 7–8 **отложены** (backfill / mass setup).
- **Мастер-постановка (канон требований):** [`MAIN PLAN.md`](MAIN%20PLAN.md)
- **Дорожная карта (индекс этапов):** [`ROADMAP.md`](ROADMAP.md) (волна 2+: [`docs/TODO_NOT_NOW/`](../TODO_NOT_NOW/README.md))
- **Журнал исполнения:** [`LOG.md`](LOG.md) (в т.ч. post-MVP hardening 2026-05-20; **phone messenger bind A+B** 2026-05-27; **registration funnel logging** 2026-05-28)
- **Отчёт аудита (фаза 0):** [`AUDIT_REPORT.md`](AUDIT_REPORT.md)
- **Карта кода для аудита (фаза 0):** [`CODE_AUDIT_MAP.md`](CODE_AUDIT_MAP.md)
- **Аудиты этапов 1–6:** [`PHASE_01_AUDIT.md`](PHASE_01_AUDIT.md) … [`PHASE_06_AUDIT.md`](PHASE_06_AUDIT.md)

## Этапы

| № | Файл | Кратко |
|---|------|--------|
| 0 | [PHASE_00_AUDIT_AND_AGREEMENT.md](PHASE_00_AUDIT_AND_AGREEMENT.md) | Аудит, согласование, без большой реализации |
| 1 | [PHASE_01_RUBITIME_PLATFORM_USER.md](PHASE_01_RUBITIME_PLATFORM_USER.md) | Rubitime → find/create/link `platform_user` |
| 2 | [PHASE_02_CONTACT_EMAIL_POLICY.md](PHASE_02_CONTACT_EMAIL_POLICY.md) | Contact/unverified email, триггеры setup-доступа |
| 3 | [PHASE_03_EMAIL_SETUP_TOKENS.md](PHASE_03_EMAIL_SETUP_TOKENS.md) | Legacy token-link и текущая отправка setup-кода |
| 4 | [PHASE_04_EMAIL_SETUP_FLOW.md](PHASE_04_EMAIL_SETUP_FLOW.md) | UI/API setup; legacy `/app/auth/email-setup`, текущий кодовый flow |
| 5 | [PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md](PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md) | Состояния email в AuthFlow + API |
| 6 | [PHASE_06_MERGE_IDENTITY.md](PHASE_06_MERGE_IDENTITY.md) | Merge — страховка, тесты + docs |
| 7 | [login-register-backfill-appointments.md](../TODO_NOT_NOW/login-register-backfill-appointments.md) | Backfill старой базы — **отложено** → `docs/TODO_NOT_NOW/` |
| 8 | [login-register-mass-setup-email.md](../TODO_NOT_NOW/login-register-mass-setup-email.md) | Mass setup mail — **отложено** → `docs/TODO_NOT_NOW/` |

## Связанная архитектура

- [`../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md)
- [`../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md)
- [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md)
- [`../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)
- [`../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md) — `smtp_outbound`
- Auth (email+password): `apps/webapp/src/modules/auth/auth.md`

## Phone messenger bind (PWA + бот, 2026-05-27)

Автовход в PWA после контакта в Telegram/Max + UX бота (меню, cancel без `confirmQuestion`).

| Документ | Назначение |
|----------|------------|
| [`.cursor/plans/phone_messenger_bind_pwa_autologin.plan.md`](../../.cursor/plans/phone_messenger_bind_pwa_autologin.plan.md) | План A — `messenger-bind/finish`, `PhoneMessengerAuthFlow` |
| [`.cursor/plans/phone_messenger_bind_bot_ux.plan.md`](../../.cursor/plans/phone_messenger_bind_bot_ux.plan.md) | План B — integrator writes-first, меню, cancel |
| [`../OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`](../OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md) | Операционный runbook + deploy checklist |
| [`LOG.md`](LOG.md) §«Приёмка A+B» | Ручной smoke (5 кейсов, ☐ до деплоя) |

Код и CI закрыты; **`manual-e2e-smoke`** в frontmatter планов — `pending`.

## Журнал воронки регистрации (2026-05-28)

Серверный отлов ошибок регистрации (без уведомлений пользователю): attempt → success/failure в product analytics; system-сбои — также в `admin_audit_log`.

| Документ | Назначение |
|----------|------------|
| [`LOG.md`](LOG.md) §2026-05-28 | Журнал исполнения, smoke SQL |
| [`../PRODUCT_ANALYTICS_INITIATIVE/LOG.md`](../PRODUCT_ANALYTICS_INITIATIVE/LOG.md) §2026-05-28 | Контекст PA event types |
| [`../../apps/webapp/src/modules/auth/auth.md`](../../apps/webapp/src/modules/auth/auth.md) | Контракт metadata, `attemptId`, маршруты |
| [`../../apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) | `GET /api/admin/auth-registration-events` |
| UI | `/app/doctor/audit-log` — секция «Ошибки регистрации» |

Код: `recordAuthRegistration.ts`, `maskContactHint.ts`, `registrationErrorClass.ts`, `AdminAuthRegistrationEventsSection.tsx`.

## Email setup by code + merge hardening (2026-05-30)

Актуальный пользовательский flow для contact-only email — **код подтверждения в текущей форме**, не activation-link. `register`, `forgot` и `setup-access` отправляют `email_challenges` код; `setup-code/complete` подтверждает email, создаёт пароль и ставит сессию. Legacy `/app/auth/email-setup?token=...` оставлен для уже отправленных старых ссылок.

Merge hardening этой же волны:

- phone messenger bind login/profile-bind пробует auto-merge через общий merge-engine до блокировки;
- channel-link пробует full merge для real owner перед `channel_link_ownership_conflict`;
- duplicate email lookup пробует безопасный auto-merge, но не сливает два password-login аккаунта; blocker пишет `email_auth_conflict`.

## Правила исполнения для агентов

- Один **логический этап** за batch; gate предыдущего этапа — DoD закрыт, запись в [`LOG.md`](LOG.md).
- Полный `pnpm run ci` — только по явному запросу или в конце крупного блока (см. `.cursor/rules/plan-authoring-execution-standard.mdc`).
- Backfill и массовые setup-письма — **не в волне 1** (см. `SCOPE_DECISIONS.md`); фазы 7–8 **отложены**, не удалять из инициативы.
