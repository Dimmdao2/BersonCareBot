DO $$
BEGIN
  IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'public.migration_window_probe'::regclass)
       <> 'app_proof_owner' THEN
    RAISE EXCEPTION 'migration-window object owner is wrong';
  END IF;
  IF (SELECT value FROM public.migration_window_probe WHERE id = 1) <> 'backfilled' THEN
    RAISE EXCEPTION 'migration-window backfill did not run';
  END IF;
END $$;
