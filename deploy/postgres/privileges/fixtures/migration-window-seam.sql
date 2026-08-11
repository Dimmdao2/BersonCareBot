CREATE FUNCTION public.migration_window_seam() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $$ SELECT 'seam'::text $$;
