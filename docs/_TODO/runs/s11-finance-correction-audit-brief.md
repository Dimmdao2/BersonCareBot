# S11 — независимая приёмка correction MF1–MF3

Ты независимый `auditor-live`. Единственный канон — `AGENTS.md`; прочитай карту, §1, §5, §10a/§10b и §24.
Проверь точный HEAD ветки `wt/finance-core-fix` после commit `b613a8efb`. Authority —
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §24 и
исходный FAIL `docs/_TODO/runs/s11-finance-integrated-final-audit.md`.

## Тест или взгляд

- Денежное поведение и provider payload проверяй сохранёнными слепыми acceptance-тестами исходного аудита; новых
  тестов не пиши, если сохранённый oracle уже ловит поломку.
- Атомарность trigger/outbox, полное тело trigger-функции, owners/callers, relation surfaces и отсутствие
  request-local enqueue проверяй взглядом и штатными migration/privilege gates. Тест на текст SQL запрещён.
- Не повторяй прежний blind kill-set. Это re-audit только новой trigger/privilege поверхности correction.

Обязательно проверь:

1. Trigger на `be_appointment_cancellations` ставит `appointment_payment_reconciliation_refund` в той же DB
   транзакции только для refund/retention, возвращает корректное trigger-значение и не зависит от HTTP/catch.
2. Immediate attempt и worker replay остаются идемпотентны; event identity/payload достаточны для обеих веток.
3. Full provider refund не содержит receipt, partial/multi-slot содержит; прежние F1–F4 остаются зелёными.
4. Callable enqueue root/capabilities удалены целиком, trigger доступен только владельцу таблицы, declaration
   отражает фактические SELECT/UPDATE/INSERT поверхности обеих миграций без ручных GRANT/REVOKE.
5. Миграции ещё не применены: migration-order, function-surface/privilege suites, generated check и canonical
   rollback-only DEV preflight проходят. PROD/TEST не трогай.

Вердикт бинарный PASS/FAIL. Обнови существующий audit-artifact только отдельным re-audit разделом либо создай
`docs/_TODO/runs/s11-finance-correction-audit.md`; production-код не исправляй. Можно оставить только оправданный
audit artifact; все оставленные файлы закоммить явными путями. Full CI, push, deploy и migration execute запрещены.
