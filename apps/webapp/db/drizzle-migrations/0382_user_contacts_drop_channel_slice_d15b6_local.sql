-- 0382: D15b/6 slice 5 — remove the `contact_kind='channel'` slice from `user_contacts`.
-- TEMPORARY LOCAL MIGRATION NUMBER 0382 (AGENTS.md "Миграции") — lead renumbers at land.
--
-- Authority: `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/18-duplication-sweep.md` §2а,
-- verdict "ДУБЛЬ — СНОСИТЬ" (the only unambiguous cut in that document — no owner gate on it).
--
-- Why. The channel slice carries no fact of its own: it is rebuilt row-for-row from
-- `public.user_channel_bindings` by `syncUserContactsMirror`, and it duplicates that table's
-- uniqueness as well (`uq_user_contacts_channel(channel_code, value_normalized)` against
-- `user_channel_bindings_channel_code_external_id_key(channel_code, external_id)`).
-- Measured 131/131 identical on dev and test. `user_channel_bindings` — not the mirror — is the
-- table the integrator hot path reads (`apps/integrator/src/infra/db/repos/platformUserByChannel.ts`),
-- so the mirror is the copy and the copy goes.
--
-- The single reader of the slice (`findCanonicalUserIdByChannelBinding` in
-- `pgCanonicalPlatformUser.ts`) already fell through to `user_channel_bindings` in every case;
-- this slice makes that fallthrough the only path.
--
-- Forward-only and idempotent.

DELETE FROM public.user_contacts WHERE contact_kind = 'channel';

DROP INDEX IF EXISTS public.uq_user_contacts_channel;

ALTER TABLE public.user_contacts
  DROP CONSTRAINT IF EXISTS user_contacts_channel_shape_check;

ALTER TABLE public.user_contacts
  DROP COLUMN IF EXISTS channel_code;

ALTER TABLE public.user_contacts
  DROP CONSTRAINT IF EXISTS user_contacts_kind_check;

ALTER TABLE public.user_contacts
  ADD CONSTRAINT user_contacts_kind_check
  CHECK (contact_kind = ANY (ARRAY['phone'::text, 'email'::text]));

ALTER TABLE public.user_contacts
  DROP CONSTRAINT IF EXISTS user_contacts_source_origin_check;

ALTER TABLE public.user_contacts
  ADD CONSTRAINT user_contacts_source_origin_check
  CHECK (source_origin = ANY (
    ARRAY['platform_users'::text, 'oauth_binding'::text, 'phone_history'::text]
  ));

DO $$
DECLARE
  leftover bigint;
BEGIN
  SELECT count(*) INTO leftover FROM public.user_contacts WHERE contact_kind NOT IN ('phone', 'email');
  IF leftover > 0 THEN
    RAISE EXCEPTION '0382 failed: % user_contacts row(s) outside phone/email remain', leftover;
  END IF;
END $$;

COMMENT ON TABLE public.user_contacts IS
  'D15b/6: contacts a person can be reached by and log in with — phone and e-mail only, one row per contact (a person may have several). Messenger links live in public.user_channel_bindings and are NOT mirrored here. Canonical rows only: merge tombstones carry no contacts, uniqueness forbids it.';
