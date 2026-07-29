-- The mirror table was removed by 20260729_0001. Remove the remaining enqueue
-- capability and any stale jobs now that settings propagation relies on direct
-- public.system_settings reads with bounded in-memory TTL.

DROP FUNCTION IF EXISTS app.enqueue_platform_system_settings_sync(text);
DROP FUNCTION IF EXISTS app.enqueue_platform_system_settings_sync(text, jsonb, text);

DELETE FROM public.integrator_push_outbox
WHERE kind = 'system_settings_sync';
