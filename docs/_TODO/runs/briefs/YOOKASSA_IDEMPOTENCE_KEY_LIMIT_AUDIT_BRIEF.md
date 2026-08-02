# YooKassa Idempotence-Key limit — independent audit

**Тест или взгляд:** поведение wire adapter — тест; scope и отсутствие изменения внутренней identity — взгляд.
Authority: `AGENTS.md` §5/§10b/§24, `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` Phase 4 verification,
worker brief `docs/_TODO/runs/briefs/YOOKASSA_IDEMPOTENCE_KEY_LIMIT_BRIEF.md`, candidate `adac865f6`, official
contract <https://yookassa.ru/developers/using-api/interaction-format>.

До чтения новых тестов составить blind kill-set. Источник оракула: Phase 4 «Проверка» — «state-machine +
idempotency тесты».

## Guarantees

1. Valid non-empty key of length `<=64` reaches YooKassa unchanged.
2. Long key becomes a deterministic 64-char SHA-256 header on payment, invoice and refund POST.
3. Same original produces the same header and body; a changed original produces a different header.
4. Internal DB/provider metadata identity remains the original key, preserving retries across deployment and other
   providers. No schema/service/repository change and no extra HTTP call.
5. No credential/body logging and no normalization omission in one of the three request branches.

Temporarily inject at least: bypass long-key normalization in ordinary payment; invoice; refund; hash all keys
including a valid short key. Every class must be killed by saved/new acceptance assertions. Restore every product
fault. Auditor may commit only intentional acceptance tests and
`docs/_TODO/runs/billing/YOOKASSA_IDEMPOTENCE_KEY_LIMIT_INDEPENDENT_AUDIT_2026-08-02.md`; no product fix.

Run exact focused provider tests, scoped ESLint/typecheck if required, raw-SQL gate and `git diff --check`. No DB,
migration, setting, DEV/TEST/PROD or deploy. Report killed/missed count, exact commands, SHA and limits; do not push.

