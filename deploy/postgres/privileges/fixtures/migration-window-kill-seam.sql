CREATE FUNCTION public.migration_window_killed_seam() RETURNS integer
LANGUAGE sql AS $$ SELECT 1 $$;
-- The proof waits only here: table DDL, function DDL and both temporary owner switches have
-- already run. A killed run therefore proves rollback of every materialized pre-marker object.
INSERT INTO public.migration_window_kill_marker VALUES (1);
SELECT pg_sleep(30) /* migration_window_kill_marker */;
