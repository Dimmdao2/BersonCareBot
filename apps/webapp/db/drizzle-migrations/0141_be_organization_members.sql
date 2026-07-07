CREATE TABLE IF NOT EXISTS be_organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL,
  role text NOT NULL,
  specialist_id uuid,
  status text DEFAULT 'active' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT be_organization_members_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE,
  CONSTRAINT be_organization_members_platform_user_id_fkey
    FOREIGN KEY (platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  CONSTRAINT be_organization_members_specialist_id_fkey
    FOREIGN KEY (specialist_id) REFERENCES be_specialists(id) ON DELETE SET NULL,
  CONSTRAINT uq_be_organization_members_org_user
    UNIQUE (organization_id, platform_user_id),
  CONSTRAINT be_organization_members_role_check
    CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'doctor'::text, 'assistant'::text])),
  CONSTRAINT be_organization_members_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'invited'::text, 'disabled'::text]))
);

CREATE INDEX IF NOT EXISTS idx_be_organization_members_org
  ON be_organization_members USING btree (organization_id);

CREATE INDEX IF NOT EXISTS idx_be_organization_members_user
  ON be_organization_members USING btree (platform_user_id);

CREATE INDEX IF NOT EXISTS idx_be_organization_members_specialist
  ON be_organization_members USING btree (specialist_id);
