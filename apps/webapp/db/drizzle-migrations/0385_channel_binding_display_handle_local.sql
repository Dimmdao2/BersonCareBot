-- 0385: canonical channel binding display handle.
-- Channel-specific public handle belongs to the canonical channel binding, not to the retired
-- integrator.telegram_state table. The offline legacy-drop migration copies existing values only
-- after proving that every non-empty legacy handle has an exact binding target.

ALTER TABLE public.user_channel_bindings
  ADD COLUMN IF NOT EXISTS display_handle text;
