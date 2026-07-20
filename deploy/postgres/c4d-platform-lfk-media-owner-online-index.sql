\set ON_ERROR_STOP on

-- C4D one-time online step. Run only as a standalone psql file after migration 0217 has
-- committed; CREATE/DROP INDEX CONCURRENTLY are intentionally outside Drizzle transactions.
SELECT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_class index_class
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid = index_class.oid
    JOIN pg_catalog.pg_class table_class ON table_class.oid = index_state.indrelid
    JOIN pg_catalog.pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
   WHERE table_namespace.nspname = 'public'
     AND table_class.relname = 'media_files'
     AND index_class.relname = 'idx_media_files_owner'
     AND (index_state.indisvalid = false OR index_state.indisready = false)
) AS c4d_invalid_owner_index
\gset

\if :c4d_invalid_owner_index
DROP INDEX CONCURRENTLY IF EXISTS public.idx_media_files_owner;
\endif

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_files_owner
  ON public.media_files (owner_kind, organization_id, status, created_at DESC);

SELECT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_class index_class
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid = index_class.oid
    JOIN pg_catalog.pg_class table_class ON table_class.oid = index_state.indrelid
    JOIN pg_catalog.pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_catalog.pg_am index_method ON index_method.oid = index_class.relam
   WHERE table_namespace.nspname = 'public'
     AND table_class.relname = 'media_files'
     AND index_class.relname = 'idx_media_files_owner'
     AND index_method.amname = 'btree'
     AND index_state.indisvalid = true
     AND index_state.indisready = true
     AND index_state.indisunique = false
     AND index_state.indnkeyatts = 4
     AND index_state.indnatts = 4
     AND index_state.indexprs IS NULL
     AND index_state.indpred IS NULL
     AND (
       SELECT array_agg(attribute.attname::text ORDER BY key_column.ordinality)
         FROM unnest(index_state.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
         JOIN pg_catalog.pg_attribute attribute
           ON attribute.attrelid = table_class.oid
          AND attribute.attnum = key_column.attnum
     ) = ARRAY['owner_kind', 'organization_id', 'status', 'created_at']::text[]
     AND (
       SELECT array_agg((option_value & 1) = 1 ORDER BY index_option.ordinality)
         FROM unnest(index_state.indoption) WITH ORDINALITY AS index_option(option_value, ordinality)
     ) = ARRAY[false, false, false, true]::boolean[]
) AS c4d_owner_index_ready
\gset

\if :c4d_owner_index_ready
\else
\echo 'FATAL: C4D media owner online index is missing, invalid, or has an incompatible definition'
\quit 1
\endif
