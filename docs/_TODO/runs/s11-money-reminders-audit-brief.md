# Auditor — S11 reminders and money lifecycle producers

Сначала для каждого пункта реши: **тест или взгляд**. Прочитай `AGENTS.md`: карту, §1/§1b migrations,
§5, §10a–§10b, §21/§21a и §24 целиком. Authority: S11 и PAY-APPT-30 в
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner rule §24.1 в
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`, worker brief
`docs/_TODO/runs/s11-money-reminders-brief.md` и evidence
`docs/_TODO/runs/s11-money-reminders-evidence.md`.

Проверь точный committed candidate, названный launcher-ом, от его зафиксированной базы. Не вливай свежий
`feat`, не меняй product code и не расширяй scope на reconciliation или новый booking workflow. До чтения
существующих тестов составь blind kill-set по каждому требованию ниже.

## Проверяемая поверхность

- каждое настроенное напоминание создаёт ровно один persistent Notifications fact в момент due, даже при нуле
  Telegram/MAX/web-push каналов; замена или отмена generation не оставляет старый due-факт живым;
- наличная предоплата, частичная и полная оплата создают durable lifecycle job атомарно с immutable cash ledger;
- успешный cash/provider refund создаёт один fact, а запрос/ошибка возврата — ни одного;
- удержание предоплаты создаёт один fact из immutable history;
- существующий completed/visit_confirmed transition создаёт один patient-visible fact без новой FSM/журнала;
- для каждой семьи повтор route/worker/provider callback безопасен, transient consumer failure оставляет retry,
  terminal failure — dead row и operator incident, а tenant/patient/appointment/money binding fail-closed;
- persistent Notifications append не зависит от внешних channel settings и suppression; необязательный push
  открывает существующий подходящий экран;
- нет второго outbox/inbox/ledger, route-local `after()` или прямой доставки в обход общего
  `outgoing_delivery_queue` → resident worker → signed lifecycle endpoint.

Отдельно проверь PAY-APPT-30: наличный платёж вообще не требует настроенного онлайн-провайдера; историческая
запись с единственным согласованным `patient_bookings.price_minor_snapshot` и пустым canonical price становится
пригодной для cash settlement после forward-backfill; неоднозначные либо уже канонические цены не
перезаписываются. Ошибка неверной суммы не превращается в сообщение про YooKassa, а настоящий link/auto-refund
provider failure сохраняет provider-specific ответ.

Взглядом проверь migration owners/privileges, отсутствие GRANT/REVOKE, generated privilege artifacts, стабильные
immutable event IDs, hot-path индексы при необходимости и то, что миграции не ослабляют tenant boundary.

## Проверки и результат

UI/DOM/copy/source-text тесты запрещены. Недостающий поведенческий acceptance-test допустим только при независимом
oracle, дорогом молчаливом отказе и самом дешёвом публичном слое. Для каждого сохранённого нового/изменённого
теста выполни один fault injection и запиши «поломка → какое утверждение покраснело»; временный product defect
обязательно откати. Падающий на candidate тест оставь красным как handoff, продукт не исправляй.

Запусти применимые targeted reminder/lifecycle/payment/worker suites, оба typecheck/lint, migration order,
privilege generation/static gates и owner-aware rollback-only preflight на именованной DEV. Execute/full CI/live
UI/deploy/push запрещены.

Сохрани отчёт `docs/_TODO/runs/s11-money-reminders-audit.md`, verdict PASS или FAIL с точными findings и evidence.
Закоммить только audit artifact и допустимые acceptance-тесты явными paths. Дерево в конце чистое.
