-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.native_push_targets') IS NOT NULL
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE TABLE native_push_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  app_id text NOT NULL CHECK (app_id IN ('therapygo', 'therapysto')),
  provider text NOT NULL CHECK (provider IN ('rustore', 'fcm', 'hms')),
  installation_id_hash text NOT NULL,
  token_hash text NOT NULL,
  token_ciphertext text NOT NULL,
  token_key_id text NOT NULL,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_native_push_targets_installation UNIQUE (app_id, provider, installation_id_hash),
  CONSTRAINT uq_native_push_targets_user_token UNIQUE (user_id, app_id, provider, token_hash)
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_native_push_targets_active_user ON native_push_targets (user_id, app_id, provider, deactivated_at);
