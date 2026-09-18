# Auditor — S11 atomic booking lifecycle producers

Прочитай `AGENTS.md`: карту, §1/§1b migrations, §5, §10a–§10b, §21/§21a и §24 целиком.
Authority: S11 в `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner rules §21/§24.1,
worker brief `docs/_TODO/runs/s11-booking-producers-brief.md`, previous audit evidence
`docs/_TODO/runs/s11-lifecycle-outbox-audit1.md` и `s11-lifecycle-outbox-audit2.md`.

Проверь точный committed candidate `567ca1cda` от его зафиксированной базы. Не вливай свежий `feat`, не меняй
product code и не расширяй scope на money/reminders/reconciliation. Сначала, ДО чтения тестов, составь blind
kill-set по каждому требованию ниже. Для каждого пункта отдельно реши «тест или взгляд» по §10a/§24.4.

## Проверяемая поверхность

- confirmed и awaiting-payment creation из patient browser/widget/app;
- staff manual booking и manual patient visit;
- patient и staff reschedule;
- patient и staff cancel;
- существующий no-show transition;
- один общий durable passage через `outgoing_delivery_queue`, resident worker и signed webapp lifecycle endpoint.

Для каждого источника докажи конечное наблюдаемое поведение: canonical transition и enqueue атомарны; crash после
commit не теряет событие; повтор того же immutable transition не создаёт дубль; два разных честных перехода одного
appointment не схлопываются; transient M2M/consumer failure оставляет retryable row; terminal failure создаёт
operator incident; tenant/payment/appointment/patient binding fail-closed; persistent patient Notifications append
не зависит от внешних channel settings; suppression относится только к внешним каналам. Убедись, что прежние
post-commit `after()`/best-effort/direct-dispatch обходы реально отключены для этих фактов и не дают двойной доставки.

Отдельно взглядом проверь migration privileges/owners, отсутствие GRANT/REVOKE в migration, generated privilege
artifacts, immutable stable key, корректность multi-slot semantics и отсутствие самовольно добавленных
`completed`/`visit_confirmed` producers.

## Проверки и результат

Новых UI/DOM/copy/source-text тестов не писать. Недостающий поведенческий acceptance-test допустим только при
независимом oracle, дорогом молчаливом отказе и проверке через самый дешёвый публичный слой. Для каждого сохранённого
нового теста выполни один fault injection и запиши «поломка → какое утверждение покраснело»; временную product
поломку откати. Падающий на candidate тест оставь красным как handoff, продукт не исправляй.

Запусти применимые targeted booking/payment/lifecycle suites, оба typecheck/lint, migration order/privilege gates и
owner-aware rollback-only preflight на именованной DEV; execute/full CI/live UI/deploy/push запрещены.

Сохрани отчёт `docs/_TODO/runs/s11-booking-producers-audit.md`, verdict PASS или FAIL с точными findings и evidence.
Закоммить только audit artifact и созданные acceptance-тесты явными paths. Дерево в конце чистое.
