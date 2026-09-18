# Worker — S11 durable reminders and money lifecycle producers

Прочитай `AGENTS.md`: карту, §1/§1b migrations, §5, §10a–§10b, §21/§21a, §24 и adjacent module docs.
Authority: S11 в `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`,
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §24.1, принятый payment/outbox core до `4c12f16cf` и booking
producer candidate `567ca1cda` после его отдельной приёмки. Не переписывай общий outbox, existing
`patientNotifications` store или уже принятые booking/payment-captured producers.

## Цель bounded-этапа

Закрыть оставшиеся УЖЕ СУЩЕСТВУЮЩИЕ patient-visible producer families через тот же durable
lifecycle→Notifications passage:

1. Напоминание о записи: при наступлении каждого настроенного due-факта одна запись появляется в постоянной
   ленте пациента независимо от Telegram/MAX/email/web-push и их подписок. Не создавать feed-факт при настройке
   напоминания и не создавать его отдельно на каждый внешний transport. Переиспользуй текущую reminder
   materialization/`outgoing_delivery_queue`; internal feed job должен существовать даже при нуле внешних каналов.
2. Наличный платёж по записи, включая предоплату, частичную и полную оплату: успешный immutable ledger fact и
   durable lifecycle job фиксируются атомарно.
3. Успешный возврат по записи — provider/automatic и cash: возврат и durable lifecycle job атомарны; запрос
   возврата или provider failure не являются успешным patient fact.
4. Удержание предоплаты: immutable `prepayment_retained` history fact и durable lifecycle job атомарны.
5. Состоявшийся визит: существующий переход канонической записи в `completed` или `visit_confirmed` через
   `transitionAppointmentStatus`/`status_changed` создаёт один durable patient-visible fact. Это не новый статус и
   не новая бизнес-механика — пациент уже видит состоявшийся визит в истории; здесь закрывается только разрыв
   доставки этого существующего факта в «Уведомления».

Один доменный факт даёт одну запись `patientNotifications` со стабильным ключом от immutable occurrence/ledger/
history id. Повтор route, worker, webhook или provider callback не создаёт дубль. Transient consumer failure
оставляет retryable row с backoff; terminal failure оставляет dead row и operator incident. Persistent feed append
не зависит от внешних channel settings; suppression разрешено применять только к соответствующим внешним
доставкам. Push, если разрешён, открывает существующий подходящий экран.

## Архитектурная граница

Сначала найди общий transaction root каждого факта (`replace_appointment_reminder_generation`, cash ledger roots,
payment history/refund roots) и расширь его либо ближайший immutable journal trigger. Не добавляй route-local
best-effort/`after()`/прямую отправку и не заводи вторую очередь, inbox или money ledger. Предпочти параметризацию
существующего signed lifecycle replay endpoint/handler и текущего `booking_lifecycle` internal kind вместо новой
параллельной схемы. Payload несёт идентификаторы факта; отображаемые данные replay читает из канонических таблиц
после commit и fail-closed связывает organization, patient, appointment и money/reminder fact.

Для визита переиспользуй общий immutable `be_appointment_history_events` факт и существующую терминологию статуса;
не добавляй второй visit journal и не меняй правила переходов/FSM.

## Проверки

Новых тестов не писать: worker реализует product code; blind acceptance добавит независимый auditor. Запусти
существующие reminder materialization/worker, cash payment/refund/retention, lifecycle/payment regression suites,
оба typecheck/lint, migration order/privilege generation/static gates. Для миграций — owner-aware rollback-only
DEV preflight по документированному пути; execute/full CI/live UI/deploy/push запрещены.

В evidence для каждого producer назови точный atomic root, immutable stable key, replay endpoint/handler и
удалённый best-effort обход. Закоммить явные paths, дерево чистое. S11 plan пока не закрывай.
