# Worker — S11 money/reminders audit correction

Прочитай `AGENTS.md`: карту, §1/§1b migrations, §5, §10a–§10b, §21/§21a и §24 целиком. Authority:
S11/PAY-APPT-30 в `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, worker brief
`docs/_TODO/runs/s11-money-reminders-brief.md` и независимый audit
`docs/_TODO/runs/s11-money-reminders-audit.md` (`83b7da2b9`). Это correction того же exact-candidate scope:
новый blind-pass и новый kill-set не нужны.

## Исправить F1–F5 одним coherent проходом

1. **Отозванный reminder lease:** signed replay обязан fail-closed перепроверить, что immutable reminder occurrence
   всё ещё принадлежит текущей generation и due остаётся активным. Отмена записи, no-show, перенос/замена
   generation и удаление offset не должны доставить уже leased stale row. Параметризуй существующий reminder
   materialization/read root; не добавляй вторую таблицу или route-local память.
2. **Повтор cash pay/refund:** публичный HTTP request должен иметь стабильную request identity, которая проходит до
   существующего cash ledger idempotency key. Идентичный retry не меняет деньги и не создаёт второй lifecycle fact;
   новый осознанный платёж той же суммы остаётся возможен с новой identity. Не выводи identity из текущего ledger
   state. Сохрани backward compatibility только там, где это не превращает повтор сети в новый платёж.
3. **Повтор retained prepayment:** один business cancellation occurrence создаёт максимум один
   `prepayment_retained` history fact. Используй существующую immutable cancellation/payment identity или добавь
   узкую business uniqueness в канонический transaction root; случайный history UUID не является дедупликацией.
4. **Повтор completed/visit_confirmed:** idempotent same-status transition не должен писать новый
   `status_changed`/`visit_completed` occurrence. Исправь общий transition root/FSM boundary без новой FSM,
   статуса или visit journal; первый честный transition продолжает писать history и outbox атомарно.
5. **Safe-error lint:** сохрани разные fallback для provider-backed и cash actions, но передавай в `jsonError`
   literal fallback object в форме, которую принимает существующий safe-error gate. Gate не отключать и не
   ослаблять.

## Границы и проверки

Новых тестов не писать. Используй сохранённые красные acceptance tests аудитора как oracle; не переписывай их под
реализацию. Проверь каждый изменённый тест по §10a и оставь только наблюдаемое поведение. Запусти тот же webapp
acceptance-набор из audit, применимые integrator suites, оба typecheck/lint, migration order/privilege gates и
owner-aware rollback-only DEV preflight. Execute/full CI/live/deploy/push запрещены.

Обнови `docs/_TODO/runs/s11-money-reminders-audit.md` коротким correction evidence: точные roots/keys, результаты
красного набора после fix и подтверждение F1–F5. Product fix + evidence закоммить явными paths; дерево чистое.
