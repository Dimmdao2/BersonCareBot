-- TEMPORARY LOCAL MIGRATION NUMBER 0316
-- #1071 §12.6: a dedicated bot's credential belongs to exactly one organization. The
-- binding is derived atomically from the canonical org-scoped system_settings row; it is not
-- a second credential store. Its non-reversible fingerprint is also the opaque webhook route key.

CREATE TABLE IF NOT EXISTS public.clinic_dedicated_bot_bindings (
  channel text NOT NULL CHECK (channel IN ('telegram', 'max')),
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  credential_fingerprint text NOT NULL CHECK (credential_fingerprint ~ '^[0-9a-f]{64}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, organization_id),
  UNIQUE (channel, credential_fingerprint)
);
--> statement-breakpoint

ALTER TABLE public.clinic_dedicated_bot_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_dedicated_bot_bindings FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clinic_dedicated_bot_bindings TO app_owner;

CREATE POLICY clinic_dedicated_bot_bindings_owner_manage
  ON public.clinic_dedicated_bot_bindings
  FOR ALL TO app_owner
  USING (true)
  WITH CHECK (true);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.sync_clinic_dedicated_bot_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_channel text;
  v_credential text;
  v_fingerprint text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.scope = 'admin' AND OLD.organization_id IS NOT NULL THEN
      v_channel := CASE OLD.key
        WHEN 'clinic_telegram_bot_token' THEN 'telegram'
        WHEN 'clinic_max_bot_api_key' THEN 'max'
        ELSE NULL
      END;
      IF v_channel IS NOT NULL THEN
        DELETE FROM public.clinic_dedicated_bot_bindings
        WHERE channel = v_channel AND organization_id = OLD.organization_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.scope <> 'admin' OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_channel := CASE NEW.key
    WHEN 'clinic_telegram_bot_token' THEN 'telegram'
    WHEN 'clinic_max_bot_api_key' THEN 'max'
    ELSE NULL
  END;
  IF v_channel IS NULL THEN
    RETURN NEW;
  END IF;

  v_credential := NULLIF(btrim(NEW.value_json #>> '{value}'), '');
  DELETE FROM public.clinic_dedicated_bot_bindings
  WHERE channel = v_channel AND organization_id = NEW.organization_id;
  IF v_credential IS NULL THEN
    RETURN NEW;
  END IF;

  v_fingerprint := encode(app_ext.digest(v_credential, 'sha256'), 'hex');
  INSERT INTO public.clinic_dedicated_bot_bindings (
    channel, organization_id, credential_fingerprint, is_active, updated_at
  ) VALUES (v_channel, NEW.organization_id, v_fingerprint, true, now());
  RETURN NEW;
END
$function$;
--> statement-breakpoint

ALTER FUNCTION app.sync_clinic_dedicated_bot_binding() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.sync_clinic_dedicated_bot_binding() FROM PUBLIC;

CREATE TRIGGER system_settings_sync_clinic_dedicated_bot_binding
AFTER INSERT OR UPDATE OR DELETE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION app.sync_clinic_dedicated_bot_binding();
--> statement-breakpoint

-- Existing exact-org credentials receive bindings during migration. A duplicate actual bot token
-- raises the table's unique constraint and rolls the migration back rather than guessing an owner.
INSERT INTO public.clinic_dedicated_bot_bindings (
  channel, organization_id, credential_fingerprint, is_active, updated_at
)
SELECT
  CASE setting.key
    WHEN 'clinic_telegram_bot_token' THEN 'telegram'
    WHEN 'clinic_max_bot_api_key' THEN 'max'
  END,
  setting.organization_id,
  encode(app_ext.digest(btrim(setting.value_json #>> '{value}'), 'sha256'), 'hex'),
  true,
  setting.updated_at
FROM public.system_settings AS setting
WHERE setting.scope = 'admin'
  AND setting.organization_id IS NOT NULL
  AND setting.key IN ('clinic_telegram_bot_token', 'clinic_max_bot_api_key')
  AND NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.resolve_clinic_dedicated_bot_organization(
  p_channel text,
  p_credential_fingerprint text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT binding.organization_id
  FROM public.clinic_dedicated_bot_bindings AS binding
  WHERE binding.channel = p_channel
    AND binding.credential_fingerprint = p_credential_fingerprint
    AND binding.is_active = true
  LIMIT 1
$function$;
--> statement-breakpoint

ALTER FUNCTION app.resolve_clinic_dedicated_bot_organization(text, text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_clinic_dedicated_bot_organization(text, text) FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_config_reader') THEN
    GRANT EXECUTE ON FUNCTION app.resolve_clinic_dedicated_bot_organization(text, text)
      TO app_config_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_integrator') THEN
    GRANT EXECUTE ON FUNCTION app.resolve_clinic_dedicated_bot_organization(text, text)
      TO app_integrator;
  END IF;
END
$grants$;
