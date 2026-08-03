\set ON_ERROR_STOP on

-- D30 Ш1/B2 one-time online step. Drizzle applies migration 0328 in a transaction, so the
-- hot-table index belongs in this standalone autocommit psql artifact immediately afterward.
SELECT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_class index_class
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid = index_class.oid
    JOIN pg_catalog.pg_class table_class ON table_class.oid = index_state.indrelid
    JOIN pg_catalog.pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
   WHERE table_namespace.nspname = 'public'
     AND table_class.relname = 'outgoing_delivery_queue'
     AND index_class.relname = 'idx_outgoing_delivery_queue_organization_status_due'
     AND (index_state.indisvalid = false OR index_state.indisready = false)
) AS d30_invalid_queue_organization_status_due_index
\gset

\if :d30_invalid_queue_organization_status_due_index
DROP INDEX CONCURRENTLY IF EXISTS public.idx_outgoing_delivery_queue_organization_status_due;
\endif

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outgoing_delivery_queue_organization_status_due
  ON public.outgoing_delivery_queue (organization_id, status, next_retry_at);

SELECT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_class index_class
    JOIN pg_catalog.pg_index index_state ON index_state.indexrelid = index_class.oid
    JOIN pg_catalog.pg_class table_class ON table_class.oid = index_state.indrelid
    JOIN pg_catalog.pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_catalog.pg_am index_method ON index_method.oid = index_class.relam
   WHERE table_namespace.nspname = 'public'
     AND table_class.relname = 'outgoing_delivery_queue'
     AND index_class.relname = 'idx_outgoing_delivery_queue_organization_status_due'
     AND index_method.amname = 'btree'
     AND index_state.indisvalid = true
     AND index_state.indisready = true
     AND index_state.indisunique = false
     AND index_state.indnkeyatts = 3
     AND index_state.indnatts = 3
     AND index_state.indexprs IS NULL
     AND index_state.indpred IS NULL
     AND (
       SELECT array_agg(attribute.attname::text ORDER BY key_column.ordinality)
         FROM unnest(index_state.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
         JOIN pg_catalog.pg_attribute attribute
           ON attribute.attrelid = table_class.oid
          AND attribute.attnum = key_column.attnum
     ) = ARRAY['organization_id', 'status', 'next_retry_at']::text[]
     AND (
       SELECT array_agg((option_value & 1) = 1 ORDER BY index_option.ordinality)
         FROM unnest(index_state.indoption) WITH ORDINALITY AS index_option(option_value, ordinality)
     ) = ARRAY[false, false, false]::boolean[]
) AS d30_queue_organization_status_due_index_ready
\gset

\if :d30_queue_organization_status_due_index_ready
\else
\echo 'FATAL: D30 outgoing delivery queue online index is missing, invalid, or has an incompatible definition'
\quit 1
\endif
