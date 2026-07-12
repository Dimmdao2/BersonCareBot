CREATE TABLE IF NOT EXISTS specialist_signup_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  email_normalized text NOT NULL,
  organization_title text NOT NULL,
  specialist_full_name text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  provisioned_organization_id uuid,
  provisioned_specialist_id uuid,
  provisioned_membership_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  provisioned_at timestamptz,
  CONSTRAINT specialist_signup_intents_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  CONSTRAINT specialist_signup_intents_org_fkey
    FOREIGN KEY (provisioned_organization_id) REFERENCES be_organizations(id) ON DELETE SET NULL,
  CONSTRAINT specialist_signup_intents_specialist_fkey
    FOREIGN KEY (provisioned_specialist_id) REFERENCES be_specialists(id) ON DELETE SET NULL,
  CONSTRAINT specialist_signup_intents_membership_fkey
    FOREIGN KEY (provisioned_membership_id) REFERENCES be_organization_members(id) ON DELETE SET NULL,
  CONSTRAINT specialist_signup_intents_challenge_id_key UNIQUE (challenge_id),
  CONSTRAINT specialist_signup_intents_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'provisioned'::text]))
);

CREATE INDEX IF NOT EXISTS idx_specialist_signup_intents_user_pending
  ON specialist_signup_intents USING btree (user_id, status);
