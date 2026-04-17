-- Preview: строки loser, которые будут удалены перед rekey из-за UNIQUE(integrator_user_id, topic|mailing)
-- (дубликаты темы/рассылки у winner уже есть — оставляем winner, loser-row выбрасываем).
--
-- БД: webapp (DATABASE_URL из webapp.prod / dev).
-- Параметры (как в diagnostics_webapp_integrator_user_id.sql):
--   \set loser_id '123456789'
--   \set winner_id '987654321'

SELECT
  'user_subscriptions_webapp_collision' AS kind,
  loser.integrator_topic_id::text AS dedup_key,
  loser.id::text AS loser_row_id
FROM user_subscriptions_webapp loser
INNER JOIN user_subscriptions_webapp w
  ON w.integrator_user_id::text = :'winner_id'
 AND loser.integrator_user_id::text = :'loser_id'
 AND loser.integrator_topic_id = w.integrator_topic_id
ORDER BY loser.integrator_topic_id, loser.id;

SELECT
  'mailing_logs_webapp_collision' AS kind,
  loser.integrator_mailing_id::text AS dedup_key,
  loser.id::text AS loser_row_id
FROM mailing_logs_webapp loser
INNER JOIN mailing_logs_webapp w
  ON w.integrator_user_id::text = :'winner_id'
 AND loser.integrator_user_id::text = :'loser_id'
 AND loser.integrator_mailing_id = w.integrator_mailing_id
ORDER BY loser.integrator_mailing_id, loser.id;
