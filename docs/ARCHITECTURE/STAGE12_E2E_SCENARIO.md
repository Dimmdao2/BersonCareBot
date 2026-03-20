# Stage 12: E2E-сценарий стабилизации subscription/mailing

Сценарий проверки, что интегратор читает topics и subscriptions только из webapp, а reconciliation выполняется.

## Предусловия

- Webapp и integrator запущены.
- В окружении заданы `APP_BASE_URL` (для integrator) и webhook secret (для подписи запросов к webapp).
- В webapp есть хотя бы один topic (через backfill или ingest из integrator).

## Шаги

1. **Integrator: mailing.topics.list**  
   Integrator вызывает `readPort.readDb({ type: 'mailing.topics.list', params: {} })`.  
   Ожидание: результат приходит из webapp через `subscriptionMailingReadsPort`, не из локальной БД integrator.

2. **Integrator: subscriptions.byUser**  
   Integrator вызывает `readPort.readDb({ type: 'subscriptions.byUser', params: { integratorUserId: '...' } })`.  
   Ожидание: результат приходит из webapp.

3. **Reconciliation**  
   Запуск `reconcile-subscription-mailing-domain` при настроенных `DATABASE_URL` и `INTEGRATOR_DATABASE_URL`.  
   Ожидание: завершение с кодом 0 при совпадении счётчиков в пределах порога.

## Альтернатива

E2E можно свести к запуску `stage12-gate` при настроенных БД: проверка projection-health и reconcile-subscription-mailing-domain.
