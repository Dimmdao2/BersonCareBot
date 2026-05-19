# Login / Register — дорожная карта

Канон требований: [`MAIN PLAN.md`](MAIN%20PLAN.md). Детальные чеклисты — в файлах `PHASE_*`.

## Зависимости

```text
PHASE_00 (audit)
    ├── PHASE_01 Rubitime ──────────────────────────┐
    ├── PHASE_02 contact email ──► PHASE_03 tokens ──► PHASE_04 setup UI
    │                                                      │
    └──────────────────────────────────────────────────► PHASE_05 auth UX
                                                              │
PHASE_01 + PHASE_05 ──► PHASE_06 merge                      │
PHASE_01 ─────────────► PHASE_07 backfill                   │
PHASE_04 + PHASE_07 ──► PHASE_08 mass email (optional)      ▼
                                                         [MVP: 0→2→3→4→5]
```

**MVP без merge/backfill:** 0 → 2 → 3 → 4 → 5 (фаза 1 может идти параллельно с 2 после 0).

## Статус этапов

| Этап | Файл | Статус | Зависит от |
|------|------|--------|------------|
| 0 | [PHASE_00_AUDIT_AND_AGREEMENT.md](PHASE_00_AUDIT_AND_AGREEMENT.md) | pending | — |
| 1 | [PHASE_01_RUBITIME_PLATFORM_USER.md](PHASE_01_RUBITIME_PLATFORM_USER.md) | pending | 0 |
| 2 | [PHASE_02_CONTACT_EMAIL_POLICY.md](PHASE_02_CONTACT_EMAIL_POLICY.md) | pending | 0 |
| 3 | [PHASE_03_EMAIL_SETUP_TOKENS.md](PHASE_03_EMAIL_SETUP_TOKENS.md) | pending | 2 |
| 4 | [PHASE_04_EMAIL_SETUP_FLOW.md](PHASE_04_EMAIL_SETUP_FLOW.md) | pending | 3 |
| 5 | [PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md](PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md) | pending | 4 |
| 6 | [PHASE_06_MERGE_IDENTITY.md](PHASE_06_MERGE_IDENTITY.md) | pending | 1, 5 |
| 7 | [PHASE_07_BACKFILL_APPOINTMENTS.md](PHASE_07_BACKFILL_APPOINTMENTS.md) | pending | 1 |
| 8 | [PHASE_08_MASS_SETUP_EMAIL.md](PHASE_08_MASS_SETUP_EMAIL.md) | cancelled | 4, 7 + продуктовое OK |

Обновлять колонку **Статус** при закрытии этапа (`pending` → `in_progress` → `done` / `cancelled`).
