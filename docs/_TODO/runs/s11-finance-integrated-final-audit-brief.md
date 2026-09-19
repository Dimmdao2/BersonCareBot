# S11 — итоговый интеграционный аудит финансового контура

## Роль и authority

Ты независимый `auditor-live`. Единственный канон работы — `AGENTS.md`; до действий прочитай карту заголовков,
§1 (миграции и разбор прав), §5, §10a, §10b и §24. Authority результата —
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner-решения в
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §24 и уже составленные kill-set/отчёты:
`docs/_TODO/runs/s11-finance-core-final-audit.md` и
`docs/_TODO/runs/s11-finance-lifecycle-final-audit.md`.

Кандидат: точный committed SHA в ветке `wt/finance-core-fix` после слияния принятого lifecycle-fix.

## Тест или взгляд

- Повторяемое денежное и retry-поведение проверяй существующими слепыми acceptance-тестами и только при реально
  недостающем независимом oracle добавь один поведенческий acceptance-тест. UI/DOM/copy/static-source тесты запрещены.
- Миграции, trigger/outbox wiring, DB-права, архитектурные границы и отсутствие request-local окна потери проверяй
  взглядом по итоговому diff и штатными privilege/migration gates. Тесты на текст SQL не писать.
- Прежний fault-injection kill-set не повторяй механически: переиспользуй его доказательства. Новый fault injection
  нужен только для действительно новой поверхности post-cancel refund reconciliation.

## Обязательный scope

1. Повторно принять либо отклонить все F1–F6 из core-аудита на интегрированном SHA:
   invoice `in-*` преобразуется в настоящий YooKassa payment id; `pending/canceled/unknown` refund не считается
   успехом; удерживается только требуемая предоплата и возвращается остаток; partial refund меняет канонический
   статус; fiscal receipt соответствует контракту YooKassa (для частичного возврата обязателен, для полного не
   отправляется, если провайдер использует исходный чек); после committed cancellation refund не теряется.
2. Для нового retry-пути доказать главный owner-инвариант: canonical cancellation и durable refund job появляются
   атомарно в одной DB-транзакции. Достигнутая ошибка/падение процесса между commit cancellation и application-level
   enqueue не должна оставлять отменённую оплаченную запись без retry. Request-local catch после commit этого не
   доказывает и является FAIL.
3. Проверить идемпотентность конкурентного immediate refund и worker replay, terminal incident/reclaimability,
   tenant isolation, точность суммы одного appointment в multi-slot payment и отсутствие двойного refund/history.
4. Проверить интеграционный merge с lifecycle fix: terminal incident persistence failure оставляет row
   `failed_retryable`; payment feed не дублируется на multi-slot.
5. Выполнить письменный разбор прав обеих новых миграций `20260919T090000_*` и `20260919T130000_*`: owner/caller,
   relation/column surface, FK/trigger runtime needs, RLS, generated declaration; прогнать штатные migration-order,
   generated privileges и rollback-only/preflight команды, разрешённые каноном. Не применять миграции и не трогать
   PROD/TEST.

## Результат

Вердикт бинарный PASS/FAIL с конкретным достижимым сценарием и impact каждого MUST FIX. Запиши отчёт в
`docs/_TODO/runs/s11-finance-integrated-final-audit.md`. Production-код не исправляй. Можно оставить только
намеренные acceptance-тесты и audit-artifact; временные поломки откати. Все оставленные файлы закоммить до конца
хода. Full CI, push и deploy не запускать; долгие команды не уводить в фон.
