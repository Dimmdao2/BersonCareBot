-- Deduplicate existing delivery events before adding constraint.
-- Keep the earliest row per integrator_intent_event_id.
DELETE FROM support_delivery_events a
USING support_delivery_events b
WHERE a.integrator_intent_event_id IS NOT NULL
  AND a.integrator_intent_event_id = b.integrator_intent_event_id
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_delivery_events_integrator_intent_uniq
  ON support_delivery_events (integrator_intent_event_id)
  WHERE integrator_intent_event_id IS NOT NULL;
