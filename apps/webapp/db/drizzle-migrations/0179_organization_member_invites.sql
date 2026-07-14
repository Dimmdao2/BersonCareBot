CREATE TABLE IF NOT EXISTS organization_member_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  invited_email text NOT NULL,
  invited_role text NOT NULL,
  token_hash text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by_platform_user_id uuid NOT NULL,
  accepted_by_platform_user_id uuid,
  accepted_membership_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  accepted_at timestamptz,
  CONSTRAINT organization_member_invites_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT organization_member_invites_created_by_fkey
    FOREIGN KEY (created_by_platform_user_id) REFERENCES platform_users(id),
  CONSTRAINT organization_member_invites_accepted_by_fkey
    FOREIGN KEY (accepted_by_platform_user_id) REFERENCES platform_users(id),
  CONSTRAINT organization_member_invites_accepted_membership_fkey
    FOREIGN KEY (accepted_membership_id) REFERENCES be_organization_members(id) ON DELETE SET NULL,
  CONSTRAINT organization_member_invites_role_check
    CHECK (invited_role = ANY (ARRAY['admin'::text, 'doctor'::text])),
  CONSTRAINT organization_member_invites_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_member_invites_token_hash_key
  ON organization_member_invites USING btree (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_member_invites_org_email_pending
  ON organization_member_invites USING btree (organization_id, invited_email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_organization_member_invites_org_status
  ON organization_member_invites USING btree (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_organization_member_invites_expires_at
  ON organization_member_invites USING btree (expires_at);

-- Dormant baseline wall for fresh-dump SaaS rehearsals. The future strict/FORCE
-- cutover replaces this with the locked-helper policy artifact.
ALTER TABLE "public"."organization_member_invites" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites" FOR ALL USING ((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid)) WITH CHECK ((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid));

-- Rollback, if this migration has not been used by application code yet:
--   DROP TABLE IF EXISTS organization_member_invites;
