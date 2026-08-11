CREATE TABLE public.migration_window_killed (id integer PRIMARY KEY);
CREATE TABLE public.migration_window_kill_marker (id integer PRIMARY KEY);
GRANT INSERT ON public.migration_window_kill_marker TO app_proof_seam_owner;
