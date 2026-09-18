# Worker — S11 automatic appointment-payment reconciliation

Прочитай `AGENTS.md`: карту, §1/§1b migrations, §2–§5, §10a–§10b, §24 и adjacent module docs.
Authority: S11/PAY-REL-04 в `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner decision
18.09.2026 о промышленной webhook/outbox/reconciliation схеме и уже принятый atomic settlement/outbox core.
Сначала измерь существующий SaaS reconciliation (`PaymentProviderPort.listPayments`, YooKassa adapter,
`reconcilePlatformPaymentsWithProvider`) и resident scheduler; расширяй/параметризуй существующие двери, не
создавай второй provider client, scheduler, payment journal или ручной-only путь.

## Цель bounded-этапа

Построить автоматический backstop для платежей ЗАПИСЕЙ:

- webhook остаётся основным быстрым путём;
- resident reconciliation с фиксированной cadence выбирает незавершённые appointment payment intents и сверяет
  их с provider authority;
- отдельный перекрывающийся sweep успешных provider operations находит успехи, которых нет в нашем journal;
- найденный provider success проходит через ТОТ ЖЕ `settleProviderWebhookEvent`/atomic settlement+outbox path,
  а не прямой UPDATE статуса или второй алгоритм проведения денег;
- provider canceled/expired обновляет только допустимое незавершённое намерение через канонический идемпотентный
  корень; он не отменяет уже captured money и не создаёт patient payment-captured fact;
- повтор tick, overlap и повтор provider response не создают второй payment/history/outbox/Notification fact.

## Надёжность

Watermark/checkpoint хранится durable и всегда читает окно с overlap. Process crash до checkpoint повторяет
безопасную работу; crash после settlement не теряет downstream благодаря принятому outbox. Provider timeout/5xx
повторяется с bounded backoff. Усечённая выдача, amount/currency mismatch, неизвестная organization/intent,
неразрешимая metadata binding и исчерпание попыток создают диагностируемый operator incident, а не молчаливый
skip. Один сбой организации не останавливает остальные. Секреты/credentials берутся только через существующий
provider config path; никакого нового env/system setting.

Для YooKassa переиспользуй authenticated API read. Если `listPayments` не даёт честно сверить nonterminal status,
добавь в существующий `PaymentProviderPort` минимальную provider-status capability и реализуй её тем же adapter,
не вызывай приватный HTTP из scheduler. Нормализованный reconciliation fact обязан пройти ту же валидацию
provider ref, intent, organization, payer, amount и currency, что webhook settlement.

Не смешивай этот этап с SaaS billing reconciliation: общий provider adapter допустим и желателен, но appointment
payment journal и SaaS invoices имеют разные canonical roots. Не добавляй UI или ручную кнопку как замену
автоматическому тикающему пути.

## Проверки

Новых тестов не писать: product worker реализует код; независимый auditor добавит только необходимые blind
behavioral acceptance tests. Запусти существующие provider adapter/webhook/settlement, scheduler isolation/lock,
outbox/payment regression suites, оба typecheck/lint, migration order/privilege gates. Для миграций — owner-aware
rollback-only DEV preflight; execute/full CI/live UI/deploy/push запрещены.

В evidence назови cadence, overlap, durable checkpoint, выбор nonterminal intents, общий settlement root,
idempotency key и каждый operator incident path. Закоммить явные paths, дерево чистое. S11 plan закрывает lead
только после независимого аудита и live acceptance.
