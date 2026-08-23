# Docs sync pass 2 — 2026-08-23

Сверка выполнена только по текущему HEAD и декларативным source-of-truth. Код, миграции, declaration,
DEV/TEST/PROD и push не затрагивались.

- `NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md` → 2 пометки.
- `ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` → 3 пометки.
- `ROLE_LOGIN_CONSOLIDATION_AUDIT_2026-08-02.md` → 5 пометок.
- `SINGLE_ENTRY_CLEANUP_2026-08-01.md` → 1 пометка.
- `B1_B2_IDENTITY_SPLIT_RUNBOOK.md` → 1 пометка.
- `BUGFIX_54_OAUTH_REMINDERS_TELEGRAM.md` → 3 пометки.
- `WEB_PUSH_REMINDER_TICK_809.md` → 2 пометки.
- `C4_ADMIN_ALLOWLISTS_2026-07-26.md` → 4 пометки.

Подсчёт: `for f in <8 files>; do printf '%s → ' "$f"; rg -c '✅ \\*\\*СДЕЛАНО 2026-|⚠️ \\*\\*ФАКТ УСТАРЕЛ 2026-08-23' "$f"; done`.

Главные supersession-факты: отдельный integrator login с
`app_integrator_tenant_service`; права/RLS исключительно из
`deploy/postgres/privileges/declaration.ts` и генератора; pre-session двери до человеческой сессии;
отдельные точки регистрации персонала и пациента. Исторические утверждения сохранены рядом с пометками.
