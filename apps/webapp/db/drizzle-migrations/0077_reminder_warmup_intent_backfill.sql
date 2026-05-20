-- Backfill reminder_intent for warmups section rules (legacy generic → warmup).
UPDATE reminder_rules
SET reminder_intent = 'warmup',
    updated_at = now()
WHERE linked_object_type = 'content_section'
  AND linked_object_id IN (
    SELECT slug FROM content_sections WHERE system_parent_code = 'warmups'
  )
  AND COALESCE(reminder_intent, 'generic') <> 'warmup';
