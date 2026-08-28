# Stage 12: E2E-сценарий стабилизации subscription/mailing

Сценарий проверки, что интегратор читает topics и subscriptions только из webapp, а reconciliation выполняется.

## Предусловия

- Webapp и integrator запущены.
- Для reconcile: `DATABASE_URL` и `INTEGRATOR_DATABASE_URL` в cutover env; при **unified** PostgreSQL оба могут совпадать — см. [`DATABASE_UNIFIED_POSTGRES.md`](./DATABASE_UNIFIED_POSTGRES.md).
- В окружении заданы `APP_BASE_URL` (для integrator) и webhook secret (для подписи запросов к webapp).
- В webapp есть хотя бы один topic (через backfill или ingest из integrator).

## Шаги

1. **Integrator: mailing.topics.list**  
   Integrator вызывает `readPort.readDb({ type: 'mailing.topics.list', params: {} })`.  
   Ожидание: результат приходит из webapp через `subscriptionMailingReadsPort`, не из локальной БД integrator.

2. **Integrator: subscriptions.byUser**  
   Track D (#987): числовой селектор человека вытеснен, и такой параметр в контракте невозможен —
   подписки читаются по каноническому `platformUserId`. Сама пара read-типов (`mailing.topics.list`,
   `subscriptions.byUser`) в текущем рантайме отсутствует; шаг сохранён как описание проверяемого
   свойства «интегратор читает подписки из webapp, а не из своей БД».

3. **Reconciliation**  
   Запуск `reconcile-subscription-mailing-domain` при настроенных `DATABASE_URL` и `INTEGRATOR_DATABASE_URL`.  
   Ожидание: завершение с кодом 0 при совпадении счётчиков в пределах порога.

## Альтернатива

E2E можно свести к запуску `stage12-gate` при настроенных БД: проверка projection-health и reconcile-subscription-mailing-domain.
