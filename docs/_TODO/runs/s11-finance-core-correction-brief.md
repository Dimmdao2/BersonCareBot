# S11 — correction итогового финансового аудита

Ты `worker` и исправляешь только три MUST FIX из независимого отчёта
`docs/_TODO/runs/s11-finance-integrated-final-audit.md` на сохранённой ветке `wt/finance-core-fix`.
Единственный канон работы — `AGENTS.md`: сначала прочитай карту заголовков, затем §1 (миграции и права), §5,
§10a, §10b и §24. Authority — `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`,
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §24 и указанный audit-artifact. Не расширяй scope.

## Источник оракула: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §24 — «бизнес-факт и outbox фиксируются одной транзакцией»; `docs/_TODO/runs/s11-finance-integrated-final-audit-brief.md` — «для частичного возврата обязателен, для полного не отправляется, если провайдер использует исходный чек».

## Исправления

1. Убери окно между commit канонической отмены и постановкой durable refund/retention continuation. Запись
   `appointment_payment_reconciliation_refund` должна появляться атомарно в той же PostgreSQL-транзакции, где
   вставляется `be_appointment_cancellations`. Используй существующий trigger/outbox паттерн и существующую очередь;
   не создавай вторую очередь или параллельный путь. Trigger должен использовать immutable `NEW` cancellation row,
   ставить job только когда требуется возврат или удержание предоплаты и сохранять нужные worker-у поля. Удали
   request-local enqueue API/capabilities/вызовы, которые после этого дублируют механизм. Немедленная попытка после
   commit может остаться, если безопасна с worker race за счёт существующей сериализации и idempotency.
2. В `refundAppointmentPaymentOnce` передавай fiscal receipt только для частичного возврата относительно полного
   provider payment. Для полного возврата receipt не передавай. Сохрани существующий обязательный receipt для
   partial/multi-slot refund и пройди красный acceptance-тест аудитора.
3. Исправь relation surfaces обеих новых миграций и declaration по фактическому телу:
   `apply_booking_payment_provider_terminal_observation()` и новый атомарный cancellation trigger. Не добавляй
   runtime/table grants вручную в миграции; declaration + generated artifacts — единственный путь. Удали старые
   capability/function surfaces callable enqueue, если такого callable root больше нет.

Обе миграции ещё не применялись, поэтому правь их вперёд до первого execute, сохраняя timestamp order, owner markers,
VERIFY и отсутствие GRANT/REVOKE. Письменно проверь owner/caller, trigger execution, ON CONFLICT SELECT, FK/RLS и
точные relation/column operations. Не применяй миграции, TEST/PROD не трогай.

## Проверки и результат

Переиспользуй существующие audit acceptance-тесты; не пиши UI/DOM/copy/static-source tests. Новый тест допустим
только для реально недостающего повторяемого поведения и с независимым oracle по §10a/§10b. Обязательно прогони:
красный full-refund acceptance до зелёного, релевантные payment/worker suites, оба typecheck, scoped lint,
function-surface/privilege suites, generated privilege check, migration-order и canonical rollback-only DEV preflight.
Проверь `git diff --check` и чистоту дерева. Обнови audit-artifact разделом correction evidence, не переписывая
исходный FAIL. Закоммить все относящиеся изменения явными путями; `git add -A` запрещён. Full CI, push, deploy и
migration execute не запускай. Не заканчивай ход, пока команды выполняются.
