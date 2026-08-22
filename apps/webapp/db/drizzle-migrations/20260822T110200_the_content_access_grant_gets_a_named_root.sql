-- BCB-MIGRATION-OWNER: app_seam_delivery_scope_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_upsert_content_access_grant(uuid,text,text,bigint,text,text,text,timestamp with time zone,timestamp with time zone,text,timestamp with time zone)') IS NOT NULL
--
-- D17 шаг 1 (3/6). `upsertContentAccessGrantDirect` писал `public.content_access_grants_webapp`
-- реляционно. Та же связка, что у напоминаний (2/6): единственная роль логина интегратора с полным
-- грантом — `app_operational_delivery_worker`, а её политика `rev10_delivery_replay_worker_84`
-- пускает запись только под взятую в работу строку `integrator.direct_public_write_retries`,
-- называющую ту же организацию и тот же `integrator_grant_id`.
--
-- Тело исполняется владельцем шва и обходит RLS, поэтому та же стена повторена здесь ДОСЛОВНО.
-- Гранты и политики остаются исключительно за deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.integrator_upsert_content_access_grant(
  p_organization_id uuid,
  p_integrator_grant_id text,
  p_platform_user_id text,
  p_integrator_user_id bigint,
  p_content_id text,
  p_purpose text,
  p_token_hash text,
  p_expires_at timestamp with time zone,
  p_revoked_at timestamp with time zone,
  p_meta_json text,
  p_created_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_delivery_scope_owner'::name,
    'app_operational_delivery_worker'::name,
    'service'::app.port_context_class,
    'integrator.content-access-grant.upsert',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send($4))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($8))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($9))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($10))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($11))::app.port_typed_arg
    ]),
    'app.integrator_upsert_content_access_grant(uuid,text,text,bigint,text,text,text,timestamp with time zone,timestamp with time zone,text,timestamp with time zone)'::regprocedure
  );

  -- rev10_delivery_replay_worker_84, дословно.
  IF NOT EXISTS (
    SELECT 1
    FROM integrator.direct_public_write_retries AS claimed_retry
    WHERE claimed_retry.status = 'processing'
      AND claimed_retry.operation = 'content_access_grant_upsert'
      AND claimed_retry.organization_id = p_organization_id
      AND claimed_retry.payload ->> 'organizationId' = p_organization_id::text
      AND claimed_retry.payload ->> 'integratorGrantId' = p_integrator_grant_id
  ) THEN
    RAISE EXCEPTION 'integrator_content_access_grant_upsert_without_claimed_retry'
      USING ERRCODE = '42501';
  END IF;

  -- USING-половина `rev10_delivery_replay_worker_84`: строка чужой организации невидима повтору,
  -- и `ON CONFLICT DO UPDATE` по ней отказывает. Тот же отказ — здесь.
  IF EXISTS (
    SELECT 1 FROM public.content_access_grants_webapp AS existing_grant
    WHERE existing_grant.integrator_grant_id = p_integrator_grant_id
      AND existing_grant.organization_id IS DISTINCT FROM p_organization_id
  ) THEN
    RAISE EXCEPTION 'integrator_content_access_grant_upsert_row_outside_organization'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.content_access_grants_webapp (
    organization_id, integrator_grant_id, platform_user_id, integrator_user_id, content_id, purpose,
    token_hash, expires_at, revoked_at, meta_json, created_at
  ) VALUES (
    p_organization_id, p_integrator_grant_id, p_platform_user_id::uuid,
    p_integrator_user_id, p_content_id, p_purpose, p_token_hash,
    p_expires_at, p_revoked_at, p_meta_json::jsonb, p_created_at
  )
  ON CONFLICT (integrator_grant_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    platform_user_id = COALESCE(EXCLUDED.platform_user_id, content_access_grants_webapp.platform_user_id),
    integrator_user_id = EXCLUDED.integrator_user_id,
    content_id = EXCLUDED.content_id,
    purpose = EXCLUDED.purpose,
    token_hash = EXCLUDED.token_hash,
    expires_at = EXCLUDED.expires_at,
    revoked_at = EXCLUDED.revoked_at,
    meta_json = EXCLUDED.meta_json;
END
$function$;
