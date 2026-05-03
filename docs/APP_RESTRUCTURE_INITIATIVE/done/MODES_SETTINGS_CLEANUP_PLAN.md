---
name: modes settings cleanup
status: completed
closed_at: 2026-05-02
execution_audit: MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md
log_entry: LOG.md (2026-05-02 — режимы, тестовые аккаунты, dev_mode relay)
todos:
  - id: settings-contract
    content: Add explicit test_account_identifiers contract, parser, validation, and admin PATCH coverage.
    status: completed
  - id: test-helper
    content: Implement tested test-account matching by phone, Telegram ID, or Max ID, with no internal userId support.
    status: completed
  - id: relay-dev-mode
    content: Move dev-mode dispatch filtering from internal userId to channel/recipient test-account identifiers.
    status: completed
  - id: settings-ui
    content: "Reorganize Settings UI: rename tab to Режимы, hide access tab, add admin, test account, and maintenance blocks."
    status: completed
  - id: maintenance-bypass
    content: Apply fail-closed test-account bypass in patient maintenance layout gate.
    status: completed
  - id: docs-tests
    content: Update initiative docs and run targeted tests, typecheck, and lint.
    status: completed
---

# План: Режимы и тестовые аккаунты (зеркало)

Каноническое описание целей, scope и шагов — в Cursor-плане инициативы; **факт закрытия и чек-листы** — в [`MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md`](MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md).

## Кратко

- Один экран **«Режимы»**: админ (`admin_*` первый слот), тестовые аккаунты (`test_account_identifiers`), техработы patient app, dev/debug/merge/fallback.
- **Сохранение «Режимы»:** один HTTP `PATCH` с `{ items }` (см. [`MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md`](MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md)).
- Вкладка **«Доступ и роли»** снята с `/app/settings`; `AccessListsSection` остаётся в репозитории как legacy (не монтируется).
- **Dev_mode relay:** только `channel` + `recipient` против `telegramIds` / `maxIds` в `test_account_identifiers`.
- **Техработы:** тестовые аккаунты видят полный patient UI; fail-closed при ошибке чтения настроек.
