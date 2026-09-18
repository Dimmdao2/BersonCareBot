# Worker — S11 automatic appointment-payment reconciliation

Прочитай `AGENTS.md`: карту, §1/§1b migrations, §2–§5, §10a–§10b, §21/§21a и §24 целиком, а также
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`. Authority: PAY-REL-04 в
`docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner rule §24.1 в
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и уже принятый на момент запуска integration SHA с atomic payment
settlement/outbox. Не переписывай settlement, общий outbox, resident scheduler или YooKassa adapter параллельной
реализацией.

Источник оракула: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, PAY-REL-04 — «Найденный
пропущенный успех проводится через тот же идемпотентный settlement/outbox-корень, а не прямой правкой статуса».

## Цель

Добавить автоматический low-priority recovery-контур для appointment payments, сохранив webhook быстрым главным
путём. Нужны две независимые, но использующие одну существующую очередь линии:

1. Периодическая проверка локальных appointment intents в nonterminal состояниях через point lookup у провайдера.
2. Периодический success sweep по каждой organization/provider-конфигурации с durable checkpoint, overlap и safe
   upper bound; окно также обязано охватывать самый старый ещё не разрешённый локальный intent.

Каждый подтверждённый provider success проходит ровно через существующий `settleProviderWebhookEvent` и его
transactional outbox. Не делай прямых UPDATE статуса, второго settlement, второго provider client, второй очереди
или отдельного scheduler process.

## Обязательное поведение

- Минимально расширь существующий `PaymentProviderPort` нормализованным point-read и, если нужно, identity полями
  существующего `listPayments`; реализация остаётся внутри `yookassaPaymentProvider` и переиспользует его
  аутентифицированный transport.
- До settlement сверяй provider payment/ref, локальный intent ref/idempotency binding, payer, purpose, appointment
  subject, amount и currency. Организацию бери только из локальной authority; provider metadata не является
  tenant authority.
- Provider pending планирует следующее наблюдение. Временный transport/provider отказ использует retry/backoff
  существующей очереди. Provider canceled/expired может менять только всё ещё nonterminal intent через общий
  compare-and-set root и не трогает уже captured money.
- Success после локального expiry — всё равно деньги: провести канонически, не воскрешать отменённую/просроченную
  запись и открыть стабильный operator incident `success_after_local_expiry`.
- Sweep checkpoint продвигается только после полного неусечённого прохода, когда каждый appointment-looking item
  разрешён. Усечённый список, binding/amount/currency mismatch, неизвестный intent и terminal retry exhaustion
  оставляют диагностируемый низкокардинальный operator incident без PII, raw payload, checkout URL или secret.
- Повтор point lookup, перекрывающегося sweep, webhook и worker не создаёт второго платежа, lifecycle fact или
  уведомления. Reconciliation rows имеют приоритет ниже пользовательской доставки.
- Используй существующие `runFixedCadenceWake`, `createSchedulerLockedTickCoordinator`, `outgoing_delivery_queue`,
  signed `WebappEventsPort` и operator-health namespaces; добавь отдельный appointment-reconciliation cadence,
  чтобы чужой health tick не закрывал его incidents.
- Новые checkpoint/lease таблицы и hot-query колонки получают Drizzle schema, forward migration, нужные индексы,
  named roots и декларативные/generated privileges по канону. Секреты и URL не переводятся в env и не попадают в
  очередь.

## Границы и проверки

Сначала параметризуй существующую provider/scheduler/worker точку; новая обёртка допустима только если текущая
граница реально не может нести point/sweep поведение. Никакого UI, ручной admin-route или SaaS billing journal.

Новых тестов не писать: worker реализует product code; blind acceptance добавит независимый auditor. Запусти
существующие payment/provider/webhook/outbox/scheduler/operator-health suites, оба typecheck/lint, migration order,
privilege generation/static gates и owner-aware rollback-only DEV preflight. Execute/full CI/live/deploy/push
запрещены.

В `docs/_TODO/runs/s11-payment-reconciliation-evidence.md` назови точные cadence jobs, queue kinds/event keys,
checkpoint/window semantics, provider binding checks, canonical settlement вызов, incident families и результаты
проверок. Закоммить явные paths, дерево чистое. PAY-REL-04 пока не закрывай — это делает лид после аудита и живой
приёмки.
