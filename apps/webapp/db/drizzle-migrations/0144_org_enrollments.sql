CREATE TABLE IF NOT EXISTS org_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT org_enrollments_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT org_enrollments_platform_user_id_fkey
    FOREIGN KEY (platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  CONSTRAINT uq_org_enrollments_org_user
    UNIQUE (organization_id, platform_user_id),
  CONSTRAINT org_enrollments_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'invited'::text, 'discharged'::text, 'archived'::text]))
);

CREATE INDEX IF NOT EXISTS idx_org_enrollments_org
  ON org_enrollments USING btree (organization_id);

CREATE INDEX IF NOT EXISTS idx_org_enrollments_user
  ON org_enrollments USING btree (platform_user_id);
