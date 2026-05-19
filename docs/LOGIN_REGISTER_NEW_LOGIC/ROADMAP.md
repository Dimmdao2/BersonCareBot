# Login / Register — дорожная карта

Канон: [`MAIN PLAN.md`](MAIN%20PLAN.md). **Согласованный scope:** [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md). Чеклисты — `PHASE_*`.

## MVP (текущая волна)

```text
PHASE_00 ✓ audit + scope
    │
    ├── PHASE_01 Rubitime live (phone → email, platform_user_id)
    │
    └── PHASE_02 contact email triggers
            └── PHASE_03 tokens + mail
                    └── PHASE_04 setup UI/API
                            └── PHASE_05 register/login/forgot
```

**Отложено (волна 2+):** PHASE_07, PHASE_08 — см. [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md). PHASE_06 закрыта (страховка, без нового merge engine).

## Статус этапов

| Этап | Файл | Статус | Зависит от |
|------|------|--------|------------|
| 0 | [PHASE_00_AUDIT_AND_AGREEMENT.md](PHASE_00_AUDIT_AND_AGREEMENT.md) | done | — |
| 1 | [PHASE_01_RUBITIME_PLATFORM_USER.md](PHASE_01_RUBITIME_PLATFORM_USER.md) | done | 0 |
| 2 | [PHASE_02_CONTACT_EMAIL_POLICY.md](PHASE_02_CONTACT_EMAIL_POLICY.md) | done | 0 |
| 3 | [PHASE_03_EMAIL_SETUP_TOKENS.md](PHASE_03_EMAIL_SETUP_TOKENS.md) | done | 2 |
| 4 | [PHASE_04_EMAIL_SETUP_FLOW.md](PHASE_04_EMAIL_SETUP_FLOW.md) | done | 3 |
| 5 | [PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md](PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md) | done | 4 |
| 6 | [PHASE_06_MERGE_IDENTITY.md](PHASE_06_MERGE_IDENTITY.md) | done | 1, 5 |
| 7 | [PHASE_07_BACKFILL_APPOINTMENTS.md](PHASE_07_BACKFILL_APPOINTMENTS.md) | **deferred** | 1 (после MVP) |
| 8 | [PHASE_08_MASS_SETUP_EMAIL.md](PHASE_08_MASS_SETUP_EMAIL.md) | **deferred** | 4, 7 |

Обновлять **Статус** при закрытии этапа.
