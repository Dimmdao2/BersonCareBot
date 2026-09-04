-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'specialist_tasks' AND column_name = 'due_has_time' AND is_nullable = 'NO'
--
-- A task deadline may be a calendar day without an explicitly selected time. `due_at` remains the
-- absolute end-of-day instant used by overdue queries; this flag preserves the doctor's choice so
-- the UI can hide the synthetic time and reopen the editor in date-only mode. Existing deadlines
-- keep their current meaning through the TRUE default.
ALTER TABLE public.specialist_tasks
  ADD COLUMN due_has_time boolean NOT NULL DEFAULT true;
