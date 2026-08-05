-- 0379: D15b/6 slice 1 — public.user_contacts (assembled contact index, dual-write phase).
-- TEMPORARY LOCAL MIGRATION NUMBER 0379 (AGENTS.md "Миграции") — lead renumbers at land.
--
-- Authority: WORK_ORDER.md D15b/6. Assembled from four sources (not a column move):
-- platform_users phone/email, user_oauth_bindings.email, user_phone_history, user_channel_bindings.
-- Unique indexes on user_contacts mirror "one contact = one account"; source-table indexes remain
-- during dual-write. Equal-rights email login reads this table via find_platform_user_ids_by_any_confirmed_email.

CREATE TABLE IF NOT EXISTS public.user_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL
    REFERENCES public.platform_users (id) ON DELETE CASCADE,
  contact_kind text NOT NULL,
  channel_code text,
  value_normalized text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  source_origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_contacts_kind_check
    CHECK (contact_kind = ANY (ARRAY['phone'::text, 'email'::text, 'channel'::text])),
  CONSTRAINT user_contacts_source_origin_check
    CHECK (source_origin = ANY (
      ARRAY['platform_users'::text, 'oauth_binding'::text, 'phone_history'::text, 'channel_binding'::text]
    )),
  CONSTRAINT user_contacts_channel_shape_check
    CHECK (
      (contact_kind = 'channel' AND channel_code IS NOT NULL)
      OR (contact_kind <> 'channel' AND channel_code IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_contacts_phone
  ON public.user_contacts (value_normalized)
  WHERE contact_kind = 'phone';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_contacts_email
  ON public.user_contacts (value_normalized)
  WHERE contact_kind = 'email';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_contacts_channel
  ON public.user_contacts (channel_code, value_normalized)
  WHERE contact_kind = 'channel';

CREATE INDEX IF NOT EXISTS idx_user_contacts_user
  ON public.user_contacts (platform_user_id);

CREATE INDEX IF NOT EXISTS idx_user_contacts_lookup_phone
  ON public.user_contacts (value_normalized)
  WHERE contact_kind = 'phone';

CREATE INDEX IF NOT EXISTS idx_user_contacts_lookup_email
  ON public.user_contacts (value_normalized)
  WHERE contact_kind = 'email';

-- Backfill from four sources (canonical users only).
INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, channel_code, value_normalized, is_primary, confirmed_at, source_origin
)
SELECT pu.id, 'phone', NULL, pu.phone_normalized, true, pu.patient_phone_trust_at, 'platform_users'
FROM public.platform_users pu
WHERE pu.merged_into_id IS NULL AND pu.phone_normalized IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, channel_code, value_normalized, is_primary, confirmed_at, source_origin
)
SELECT pu.id, 'email', NULL, pu.email_normalized, true, pu.email_verified_at, 'platform_users'
FROM public.platform_users pu
WHERE pu.merged_into_id IS NULL AND pu.email_normalized IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, channel_code, value_normalized, is_primary, confirmed_at, source_origin
)
SELECT ob.user_id, 'email', ob.provider, lower(btrim(ob.email)), false, ob.created_at, 'oauth_binding'
FROM public.user_oauth_bindings ob
INNER JOIN public.platform_users pu ON pu.id = ob.user_id
WHERE pu.merged_into_id IS NULL
  AND ob.email IS NOT NULL
  AND btrim(ob.email) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, channel_code, value_normalized, is_primary, confirmed_at, source_origin
)
SELECT uph.platform_user_id, 'phone', NULL, uph.phone_normalized, false, uph.valid_from, 'phone_history'
FROM public.user_phone_history uph
INNER JOIN public.platform_users pu ON pu.id = uph.platform_user_id
WHERE uph.valid_to IS NULL AND pu.merged_into_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.user_contacts (
  platform_user_id, contact_kind, channel_code, value_normalized, is_primary, confirmed_at, source_origin
)
SELECT ucb.user_id, 'channel', ucb.channel_code, ucb.external_id, false, ucb.created_at, 'channel_binding'
FROM public.user_channel_bindings ucb
INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
WHERE pu.merged_into_id IS NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_contacts_self_select ON public.user_contacts;
CREATE POLICY user_contacts_self_select ON public.user_contacts
  FOR SELECT TO app_patient
  USING (
    app.current_patient_user_id() IS NOT NULL
    AND platform_user_id = app.current_patient_user_id()
  );

DROP POLICY IF EXISTS user_contacts_staff_org_select ON public.user_contacts;
CREATE POLICY user_contacts_staff_org_select ON public.user_contacts
  FOR SELECT TO app_staff
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.org_enrollments oe
        WHERE oe.platform_user_id = user_contacts.platform_user_id
          AND oe.organization_id = app.current_org_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.be_organization_members bom
        WHERE bom.platform_user_id = user_contacts.platform_user_id
          AND bom.organization_id = app.current_org_id()
      )
    )
  );

DROP POLICY IF EXISTS user_contacts_identity_bootstrap_select ON public.user_contacts;
CREATE POLICY user_contacts_identity_bootstrap_select ON public.user_contacts
  FOR SELECT
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

DROP POLICY IF EXISTS user_contacts_identity_bootstrap_insert ON public.user_contacts;
CREATE POLICY user_contacts_identity_bootstrap_insert ON public.user_contacts
  FOR INSERT
  WITH CHECK (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

DROP POLICY IF EXISTS user_contacts_identity_bootstrap_update ON public.user_contacts;
CREATE POLICY user_contacts_identity_bootstrap_update ON public.user_contacts
  FOR UPDATE
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'))
  WITH CHECK (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

DROP POLICY IF EXISTS user_contacts_identity_bootstrap_delete ON public.user_contacts;
CREATE POLICY user_contacts_identity_bootstrap_delete ON public.user_contacts
  FOR DELETE
  USING (pg_has_role(current_user, 'app_identity_bootstrap', 'member'));

DROP POLICY IF EXISTS user_contacts_staff_insert ON public.user_contacts;
CREATE POLICY user_contacts_staff_insert ON public.user_contacts
  FOR INSERT TO app_staff
  WITH CHECK (app.is_staff());

DROP POLICY IF EXISTS user_contacts_staff_update ON public.user_contacts;
CREATE POLICY user_contacts_staff_update ON public.user_contacts
  FOR UPDATE TO app_staff
  USING (app.is_staff())
  WITH CHECK (app.is_staff());

DROP POLICY IF EXISTS user_contacts_staff_delete ON public.user_contacts;
CREATE POLICY user_contacts_staff_delete ON public.user_contacts
  FOR DELETE TO app_staff
  USING (app.is_staff());

GRANT SELECT ON TABLE public.user_contacts TO app_patient;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_contacts TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_contacts TO app_identity_bootstrap;

-- Equal-rights login (§2a item 7): resolve confirmed emails through user_contacts assembly.
CREATE OR REPLACE FUNCTION app.find_platform_user_ids_by_any_confirmed_email(p_email_norm text)
RETURNS TABLE(user_id uuid, matched_primary boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
  SELECT uc.platform_user_id AS user_id, bool_or(uc.is_primary) AS matched_primary
  FROM public.user_contacts uc
  INNER JOIN public.platform_users pu ON pu.id = uc.platform_user_id
  WHERE uc.contact_kind = 'email'
    AND uc.value_normalized = lower(btrim(p_email_norm))
    AND uc.confirmed_at IS NOT NULL
    AND pu.merged_into_id IS NULL
  GROUP BY uc.platform_user_id
$$;

COMMENT ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) IS
  'D15b/6: owner(s) of a confirmed email via user_contacts (primary platform_users email or oauth_binding secondary). matched_primary distinguishes primary vs secondary.';
