# Worker — S11 automatic appointment-payment reconciliation

Прочитай `AGENTS.md`: карту, §1/§1b migrations, §2–§5, §10a–§10b, §24 и adjacent module docs.
Authority: S11/PAY-REL-04 в `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner decision
18.09.2026 о промышленной webhook/outbox/reconciliation схеме и уже принятый atomic settlement/outbox core.
Этот этап стартует только от принятого интеграционного SHA после booking lifecycle и money/reminder producer
этапов: он пересекается с ними по settlement root, worker, scheduler, composition root и privilege declaration.

Источник оракула: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, `PAY-REL-04` — «resident
reconciliation автоматически и регулярно перечитывает у провайдера незавершённые платежи и перекрывающееся окно
уже успешных операций. Найденный пропущенный успех проводится через тот же идемпотентный settlement/outbox-корень».

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

Реализуй две bounded lane через существующую `outgoing_delivery_queue`, не длинный provider batch внутри общего
worker claim: (1) по одной low-priority row на due nonterminal intent с point lookup; (2) по одной low-priority
row на organization/provider sweep. Resident scheduler только будит/материализует работу через существующий
signed webapp path. Каждая row входит в принятый organization principal до чтения provider config и settlement.

## Надёжность

Watermark/checkpoint хранится durable и всегда читает окно `[watermark - overlap, safe upper bound]`; checkpoint
двигается только после полного, неусечённого прохода, в котором разрешён каждый похожий на appointment элемент.
Окно обязано захватывать oldest unresolved local intent, чтобы долгоживущий invoice не выпал из sweep по времени
создания. Process crash до checkpoint повторяет
безопасную работу; crash после settlement не теряет downstream благодаря принятому outbox. Provider timeout/5xx
повторяется с bounded backoff. Усечённая выдача, amount/currency mismatch, неизвестная organization/intent,
неразрешимая metadata binding и исчерпание попыток создают диагностируемый operator incident, а не молчаливый
skip. Один сбой организации не останавливает остальные. Секреты/credentials берутся только через существующий
provider config path; никакого нового env/system setting.

Для YooKassa переиспользуй authenticated API read. Если `listPayments` не даёт честно сверить nonterminal status,
добавь в существующий `PaymentProviderPort` минимальную provider-status capability и реализуй её тем же adapter,
не вызывай приватный HTTP из scheduler. Нормализованный reconciliation fact обязан пройти ту же валидацию
provider ref, intent, idempotency key, organization, payer, purpose, subject/appointment, amount и currency, что
webhook settlement. Organization берётся только из локальной authority; provider metadata не является tenant
authority. И point lookup, и list result обязаны сохранять provider object ref, локальный invoice/intent ref и
точно тот event idempotency key, который вывел бы `verifyWebhook`, чтобы более поздний webhook дедуплицировался.

Provider success после локального expiry/cancel всё равно является деньгами: проведи его через канонический
settlement/journal root, не воскрешай appointment и открой стабильный `success_after_local_expiry` incident.
Не понижай succeeded intent, не переписывай captured money и не выпускай `payment_captured` для обычного
canceled/expired observation. Усечённый список, appointment-looking unbound item, mismatch и terminal retry
получают отдельные низкокардинальные incident keys; generic/SaaS cadence не должна их закрывать по отсутствию.

Не смешивай этот этап с SaaS billing reconciliation: общий provider adapter допустим и желателен, но appointment
payment journal и SaaS invoices имеют разные canonical roots. Не добавляй UI или ручную кнопку как замену
автоматическому тикающему пути. Не добавляй новую payment journal/queue/scheduler process/env variable и не клади
API key, checkout URL, raw provider payload или patient data в queue error/operator incident.

## Проверки

Новых тестов не писать: product worker реализует код; независимый auditor добавит только необходимые blind
behavioral acceptance tests. Запусти существующие provider adapter/webhook/settlement, scheduler isolation/lock,
outbox/payment regression suites, оба typecheck/lint, migration order/privilege gates. Для миграций — owner-aware
rollback-only DEV preflight; execute/full CI/live UI/deploy/push запрещены.

В evidence назови cadence, overlap, durable checkpoint, выбор nonterminal intents, общий settlement root,
idempotency key и каждый operator incident path. Закоммить явные paths, дерево чистое. S11 plan закрывает lead
только после независимого аудита и live acceptance.
