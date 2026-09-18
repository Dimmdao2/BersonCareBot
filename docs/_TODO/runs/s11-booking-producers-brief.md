# Worker — S11 atomic booking lifecycle producers

Прочитай `AGENTS.md`: карту, §1/§1b migrations, §5, §10a–§10b, §21/§21a, §24 и adjacent module docs.
Authority: S11 в `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner rules §21/§24.1,
producer inventory в `docs/_TODO/runs/s11-lifecycle-outbox-audit2.md`. Используй уже построенный/исправленный
common outbox/payment replay candidate до `4c12f16cf`; payment core не переписывать.

## Цель bounded-этапа

Перевести ВСЕ уже существующие booking lifecycle facts на атомарный durable common passage:

- confirmed booking creation и awaiting-payment creation из patient browser/widget/app;
- staff manual booking;
- patient и staff reschedule;
- patient и staff cancel;
- существующий no-show fact (не придумывать новый продуктовый статус; сохранить текущую семантику).

Business transaction обязана атомарно сохранить canonical факт и stable internal row в существующей
`outgoing_delivery_queue`. После commit resident worker вызывает общий lifecycle/Notifications путь; process crash,
request cancellation и transient HTTP failure не теряют событие. Browser/widget/app/staff сходятся к одному
producer root. Удали/отключи прежние post-commit `Next after()`/best-effort HTTP/direct dispatch пути для этих
фактов, иначе появятся гонка и дубли.

## Архитектурная граница

Сначала ищи общий atomic root/history/timeline write, из которого можно вывести фактический transition для всех
источников. Предпочти один forward migration trigger/function над канонической appointment/history сущностью и
один payment-like signed webapp replay endpoint, который после commit читает канонические данные и вызывает
существующий `handleBookingLifecycleEvent`; не размножай SQL по каждому route/service и не сериализуй весь display
payload внутри business transaction.

Stable queue key должен опираться на immutable transition/history id, а не только appointment id: разные честные
reschedule/cancel события не схлопываются, повтор того же transition не дублируется. Internal row tenant-owned,
reclaimable `processing`, retry/backoff/dead/operator incident, без `dispatching`. Persistent Notifications append
не зависит от внешних channel settings; suppression гасит только Telegram/MAX/email/push. Existing step/inbox
dedupe сохраняется.

Awaiting-payment — уже существующий факт, не новый booking mode. В Notifications должен появиться корректный
existing lifecycle/payment-waiting fact через тот же путь. `completed`/`visit_confirmed` не добавлять: audit2
классифицировал как owner question из-за отсутствия producer/event registry.

## Проверки

Новых тестов не писать: этот bounded worker реализует product code; blind acceptance добавит финальный auditor.
Запусти существующие booking lifecycle route/service tests, audit1 oracle, payment core regression, webapp/integrator
typecheck/lint, migration order/privilege generation/static gates. Для миграции — owner-aware rollback-only DEV
preflight по документированному пути; execute не делать. Не full CI/live UI/deploy/push.

В evidence назови для каждого из семи producer paths точный atomic root, stable key и удалённый best-effort обход.
Закоммить явные paths, дерево чистое. Plan S11 пока не закрывай: money/reminder inventory будет следующим этапом.
