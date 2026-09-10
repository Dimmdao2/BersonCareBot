-- BCB-MIGRATION-OWNER: app_seam_custom_domain_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.save_custom_domain_binding_intent(text,uuid,text,text)') IS NOT NULL
--
-- #787: a quarantined hostname remains globally unavailable to every other organization, but its
-- immutable original owner may reclaim that exact derived hostname through the existing staff door.
CREATE OR REPLACE FUNCTION app.save_custom_domain_binding_intent(
  p_action text,
  p_organization_id uuid,
  p_base_domain text,
  p_placement text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid;
  v_base_domain text;
  v_placement text;
  v_subdomain_label text;
  v_hostname text;
  v_existing public.org_custom_domain_bindings%ROWTYPE;
  v_reclaim public.org_custom_domain_bindings%ROWTYPE;
  v_result public.org_custom_domain_bindings%ROWTYPE;
  v_has_existing boolean := false;
  v_has_reclaim boolean := false;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_custom_domain_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'branding.custom-domain.intent.save',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg
    ]),
    'app.save_custom_domain_binding_intent(text,uuid,text,text)'::regprocedure
  );

  v_organization_id := app.current_org_id();
  IF p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM v_organization_id THEN
    RAISE EXCEPTION 'custom_domain_binding_organization_mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('org_custom_domain_bindings:' || v_organization_id::text, 0)
  );

  SELECT * INTO v_existing
  FROM public.org_custom_domain_bindings AS binding
  WHERE binding.organization_id = v_organization_id
    AND binding.status <> 'quarantine'
  FOR UPDATE;
  v_has_existing := FOUND;

  IF p_action = 'clear' THEN
    IF NOT v_has_existing THEN
      RETURN jsonb_build_object('ok', false, 'code', 'nothing_to_clear');
    END IF;

    UPDATE public.org_custom_domain_bindings
       SET status = 'quarantine', updated_at = pg_catalog.now()
     WHERE id = v_existing.id;
    RETURN jsonb_build_object('ok', true, 'state', NULL);
  END IF;

  IF p_action <> 'set' THEN
    RAISE EXCEPTION 'custom_domain_binding_unknown_action' USING ERRCODE = '22023';
  END IF;

  v_base_domain := lower(btrim(p_base_domain));
  v_placement := lower(btrim(p_placement));
  IF v_base_domain IS NULL
    OR v_placement IS NULL
    OR v_base_domain !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    OR length(v_base_domain) > 253
    OR v_placement NOT IN ('apex', 'subdomain') THEN
    RAISE EXCEPTION 'custom_domain_binding_invalid_intent' USING ERRCODE = '22023';
  END IF;

  -- `app.` is a product placement, not caller-controlled state. The exact hostname is derived
  -- here from normalized input; neither a hostname nor lifecycle fields enter this door.
  v_subdomain_label := CASE WHEN v_placement = 'subdomain' THEN 'app' ELSE NULL END;
  v_hostname := CASE WHEN v_placement = 'apex' THEN v_base_domain
    ELSE v_subdomain_label || '.' || v_base_domain END;

  IF v_has_existing AND v_existing.hostname = v_hostname THEN
    IF v_existing.status = 'failed' THEN
      UPDATE public.org_custom_domain_bindings
         SET status = 'pending', status_reason = NULL, updated_at = pg_catalog.now()
       WHERE id = v_existing.id
      RETURNING * INTO v_result;
    ELSE
      v_result := v_existing;
    END IF;
  ELSE
    -- Lock the globally unique target before touching the current live binding. A foreign or
    -- deleted-owner tombstone remains unavailable; only the immutable original owner can revive
    -- its own quarantined row. The per-organization advisory lock serializes two supersedes by
    -- this organization, and the unique hostname index arbitrates concurrent organizations.
    SELECT * INTO v_reclaim
    FROM public.org_custom_domain_bindings AS binding
    WHERE lower(binding.hostname) = v_hostname
    FOR UPDATE;
    v_has_reclaim := FOUND;

    IF v_has_reclaim AND (
      v_reclaim.organization_id IS DISTINCT FROM v_organization_id
      OR v_reclaim.status <> 'quarantine'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'hostname_taken');
    END IF;

    -- Superseding back to an owned tombstone is one transaction: retire the current live row,
    -- then make the immutable owned row the sole live pending binding and discard stale readiness.
    IF v_has_existing THEN
      UPDATE public.org_custom_domain_bindings
         SET status = 'quarantine', updated_at = pg_catalog.now()
       WHERE id = v_existing.id;
    END IF;

    IF v_has_reclaim THEN
      UPDATE public.org_custom_domain_bindings
         SET base_domain = v_base_domain,
             placement = v_placement,
             subdomain_label = v_subdomain_label,
             hostname = v_hostname,
             status = 'pending',
             status_reason = NULL,
             activated_at = NULL,
             updated_at = pg_catalog.now()
       WHERE id = v_reclaim.id
      RETURNING * INTO v_result;
    ELSE
      INSERT INTO public.org_custom_domain_bindings (
        organization_id, base_domain, placement, subdomain_label, hostname, status,
        created_by_platform_user_id
      ) VALUES (
        v_organization_id, v_base_domain, v_placement, v_subdomain_label, v_hostname, 'pending',
        app.current_actor_user_id()
      )
      RETURNING * INTO v_result;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'state', jsonb_build_object(
      'organizationId', v_result.organization_id,
      'baseDomain', v_result.base_domain,
      'placement', v_result.placement,
      'subdomainLabel', v_result.subdomain_label,
      'hostname', v_result.hostname,
      'status', v_result.status,
      'statusReason', v_result.status_reason,
      'activatedAt', v_result.activated_at
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'hostname_taken');
END
$function$;

COMMENT ON FUNCTION app.save_custom_domain_binding_intent(text,uuid,text,text) IS
  'Staff-only set/retry/supersede/clear intent door. It derives hostname, lets only the immutable owner reclaim its quarantined row, and preserves server-owned lifecycle state (B2/B8/C5a/#787).';
