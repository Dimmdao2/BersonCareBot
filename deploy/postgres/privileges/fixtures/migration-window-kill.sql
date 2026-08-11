CREATE TABLE public.migration_window_killed (id integer PRIMARY KEY);
CREATE TABLE public.migration_window_kill_marker (id integer PRIMARY KEY);
INSERT INTO public.migration_window_kill_marker VALUES (1);
-- The proof waits for this backend query in pg_stat_activity; the marker is reached only after
-- representative table DDL and the first temporary owner switch have executed.
SELECT pg_sleep(30) /* migration_window_kill_marker */;
