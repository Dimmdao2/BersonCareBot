# Login / Register — Rubitime, email setup access, merge

Инициатива: корректный identity-flow для пациентов из Rubitime, вход по email на **существующую** карточку (без дублей), setup access вместо «тупика» duplicate_email / silent forgot.

- **Согласованный scope (волна 1):** [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md) — **live-flow** + фаза 6 (merge-страховка); фазы 7–8 **отложены** (backfill / mass setup).
- **Мастер-постановка (канон требований):** [`MAIN PLAN.md`](MAIN%20PLAN.md)
- **Дорожная карта (индекс этапов):** [`ROADMAP.md`](ROADMAP.md)
- **Журнал исполнения:** [`LOG.md`](LOG.md)
- **Отчёт аудита (фаза 0):** [`AUDIT_REPORT.md`](AUDIT_REPORT.md)
- **Карта кода для аудита (фаза 0):** [`CODE_AUDIT_MAP.md`](CODE_AUDIT_MAP.md)
- **Аудиты этапов 1–6:** [`PHASE_01_AUDIT.md`](PHASE_01_AUDIT.md) … [`PHASE_06_AUDIT.md`](PHASE_06_AUDIT.md)

## Этапы

| № | Файл | Кратко |
|---|------|--------|
| 0 | [PHASE_00_AUDIT_AND_AGREEMENT.md](PHASE_00_AUDIT_AND_AGREEMENT.md) | Аудит, согласование, без большой реализации |
| 1 | [PHASE_01_RUBITIME_PLATFORM_USER.md](PHASE_01_RUBITIME_PLATFORM_USER.md) | Rubitime → find/create/link `platform_user` |
| 2 | [PHASE_02_CONTACT_EMAIL_POLICY.md](PHASE_02_CONTACT_EMAIL_POLICY.md) | Contact/unverified email, триггеры ссылки |
| 3 | [PHASE_03_EMAIL_SETUP_TOKENS.md](PHASE_03_EMAIL_SETUP_TOKENS.md) | Таблица токенов, сервис, письмо |
| 4 | [PHASE_04_EMAIL_SETUP_FLOW.md](PHASE_04_EMAIL_SETUP_FLOW.md) | UI/API `/app/auth/email-setup` |
| 5 | [PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md](PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md) | Состояния email в AuthFlow + API |
| 6 | [PHASE_06_MERGE_IDENTITY.md](PHASE_06_MERGE_IDENTITY.md) | Merge — страховка, тесты + docs |
| 7 | [PHASE_07_BACKFILL_APPOINTMENTS.md](PHASE_07_BACKFILL_APPOINTMENTS.md) | Backfill старой базы — **отложено** |
| 8 | [PHASE_08_MASS_SETUP_EMAIL.md](PHASE_08_MASS_SETUP_EMAIL.md) | Mass setup mail — **отложено** |

## Связанная архитектура

- [`../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md)
- [`../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md)
- [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md)
- [`../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)
- [`../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md) — `smtp_outbound`
- Auth (email+password): `apps/webapp/src/modules/auth/auth.md`

## Правила исполнения для агентов

- Один **логический этап** за batch; gate предыдущего этапа — DoD закрыт, запись в [`LOG.md`](LOG.md).
- Полный `pnpm run ci` — только по явному запросу или в конце крупного блока (см. `.cursor/rules/plan-authoring-execution-standard.mdc`).
- Backfill и массовые setup-письма — **не в волне 1** (см. `SCOPE_DECISIONS.md`); фазы 7–8 **отложены**, не удалять из инициативы.
