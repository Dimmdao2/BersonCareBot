-- Stage 4 — webapp projection realignment: integrator_user_id loser → winner
--
-- Стратегия:
--   - user_subscriptions_webapp / mailing_logs_webapp: сначала DELETE loser-строк, дублирующих
--     (winner, integrator_topic_id) / (winner, integrator_mailing_id) из-за UNIQUE; затем UPDATE.
--   - Остальные таблицы: rekey (UPDATE), уникальность на integrator_* id, коллизий по user нет.
--   - Replay/backfill: не требуется при нормальном порядке (integrator merge уже выполнен);
--     повторный прогон идемпотентен (0 строк для уже перенесённого loser).
--
-- БД: webapp только.
-- Перед psql:
--   \set loser_id '123456789'
--   \set winner_id '987654321'
--
-- Проверка: preview_webapp_realignment_collisions.sql + diagnostics_webapp_integrator_user_id.sql (loser counts = 0).

BEGIN;

-- 1) Dedup subscription rows (same topic already у winner)
DELETE FROM user_subscriptions_webapp loser
USING user_subscriptions_webapp w
WHERE loser.integrator_user_id::text = :'loser_id'
  AND w.integrator_user_id::text = :'winner_id'
  AND loser.integrator_topic_id = w.integrator_topic_id;

-- 2) Dedup mailing log rows (same mailing уже у winner)
DELETE FROM mailing_logs_webapp loser
USING mailing_logs_webapp w
WHERE loser.integrator_user_id::text = :'loser_id'
  AND w.integrator_user_id::text = :'winner_id'
  AND loser.integrator_mailing_id = w.integrator_mailing_id;

-- 3) Rekey (порядок ниже произволен после dedup; subscriptions/mailing первыми логически)
UPDATE user_subscriptions_webapp
SET integrator_user_id = :'winner_id'::bigint,
    updated_at = now()
WHERE integrator_user_id::text = :'loser_id';

UPDATE mailing_logs_webapp
SET integrator_user_id = :'winner_id'::bigint
WHERE integrator_user_id::text = :'loser_id';

UPDATE reminder_rules
SET integrator_user_id = :'winner_id'::bigint,
    updated_at = now()
WHERE integrator_user_id::text = :'loser_id';

UPDATE reminder_occurrence_history
SET integrator_user_id = :'winner_id'::bigint
WHERE integrator_user_id::text = :'loser_id';

UPDATE reminder_delivery_events
SET integrator_user_id = :'winner_id'::bigint
WHERE integrator_user_id::text = :'loser_id';

UPDATE content_access_grants_webapp
SET integrator_user_id = :'winner_id'::bigint
WHERE integrator_user_id::text = :'loser_id';

UPDATE support_conversations
SET integrator_user_id = :'winner_id'::bigint,
    updated_at = now()
WHERE integrator_user_id IS NOT NULL
  AND integrator_user_id::text = :'loser_id';

COMMIT;
