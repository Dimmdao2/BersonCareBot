# B1.3 — независимый аудит раннего prepayment gate (#1057)

## Тест или взгляд

Повторяемое API/UI поведение — blind kill-set + существующие route/service/UI tests; архитектурный scope и отсутствие
второй credentials-проверки — взглядом. Новый тяжёлый harness не создавать.

Прочитать `AGENTS.md`, особенно §5, §10a/§10b, §21 и §24. Authority:
`docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, B1.3; candidate `3e6e536b0`.

До чтения новых тестов зафиксировать kill-set:

1. GET availability=false, если mutation-доступ `booking_prepayment` недоступен, payments выключены либо default
   provider выключен/без credential pair; секреты в ответ не уходят.
2. PUT active/non-disabled policy отказывает до write при любой из этих причин; `disabled` остаётся сохраняемым.
3. Available clinic сохраняет active policy и service ownership guard не ослаблен.
4. UI показывает понятную причину, не даёт включить/сохранить active policy, но позволяет выключить ранее активную.
5. Booking-time `payment_provider_unavailable` остаётся последним рубежом.
6. Entitlement/credentials решаются существующими дверями, без второго endpoint/table/config parser.

Проверить product diff, затем существующие tests. Для каждого независимого поведения — либо одна fault mutation,
убитая oracle, либо конкретный красный acceptance test; не множить мутации по каждому `it`. Временный product diff
полностью откатить. Допустимы только постоянный audit-report и действительно недостающий acceptance test.

Запустить три targeted suite, scoped lint, webapp typecheck, `git diff --check`. Не трогать DB/DEV/TEST/PROD, migration,
taskdb или plan checkbox. Product fix аудитор не делает. Коммитить только разрешённый audit scope, не пушить.

