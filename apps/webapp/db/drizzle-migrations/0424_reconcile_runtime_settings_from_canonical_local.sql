-- TEMPORARY LOCAL MIGRATION NUMBER 0424
-- Reconcile the safe runtime projection from canonical system_settings values.
-- Only already-registered same-key rows are updated; this never copies an unregistered secret key.

UPDATE public.app_runtime_settings AS runtime
SET value_json = canonical.value_json,
    updated_at = canonical.updated_at,
    updated_by = canonical.updated_by
FROM public.system_settings AS canonical
WHERE canonical.key = runtime.key
  AND canonical.scope = runtime.scope
  AND canonical.organization_id IS NOT DISTINCT FROM runtime.organization_id
  AND runtime.value_json IS DISTINCT FROM canonical.value_json;
