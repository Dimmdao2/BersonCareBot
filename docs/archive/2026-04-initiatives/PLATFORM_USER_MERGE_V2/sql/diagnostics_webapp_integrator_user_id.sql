-- Диагностика webapp: наличие конкретного integrator_user_id (loser) в projection-таблицах
-- Использование: webapp DB (webapp.prod DATABASE_URL).
-- Перед запуском: \set loser_id '123456789'  (как текст для :'loser_id')
-- Для preview/realign рядом нужен \set winner_id '…' — см. README.md
--
-- Источник SELECT: buildWebappLoserIntegratorUserIdGateUnionSql("psql") в
-- apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts (CI: тест совпадения с файлом).
--
-- Gate после realignment: все запросы должны вернуть 0.

SELECT 'reminder_rules' AS tbl, COUNT(*)::bigint AS cnt
FROM reminder_rules WHERE integrator_user_id::text = :'loser_id'
UNION ALL
SELECT 'reminder_occurrence_history' AS tbl, COUNT(*)::bigint AS cnt
FROM reminder_occurrence_history WHERE integrator_user_id::text = :'loser_id'
UNION ALL
SELECT 'reminder_delivery_events' AS tbl, COUNT(*)::bigint AS cnt
FROM reminder_delivery_events WHERE integrator_user_id::text = :'loser_id'
UNION ALL
SELECT 'content_access_grants_webapp' AS tbl, COUNT(*)::bigint AS cnt
FROM content_access_grants_webapp WHERE integrator_user_id::text = :'loser_id'
UNION ALL
SELECT 'support_conversations' AS tbl, COUNT(*)::bigint AS cnt
FROM support_conversations WHERE integrator_user_id IS NOT NULL AND integrator_user_id::text = :'loser_id'
UNION ALL
SELECT 'user_subscriptions_webapp' AS tbl, COUNT(*)::bigint AS cnt
FROM user_subscriptions_webapp WHERE integrator_user_id::text = :'loser_id'
UNION ALL
SELECT 'mailing_logs_webapp' AS tbl, COUNT(*)::bigint AS cnt
FROM mailing_logs_webapp WHERE integrator_user_id::text = :'loser_id'
ORDER BY tbl;

-- platform_users: канонические строки с этим integrator_user_id (после webapp merge loser обычно становится alias по UUID, integrator_user_id на canonical переносится политикой merge)
-- SELECT id, merged_into_id, integrator_user_id::text FROM platform_users WHERE integrator_user_id::text = :'loser_id' AND merged_into_id IS NULL;
