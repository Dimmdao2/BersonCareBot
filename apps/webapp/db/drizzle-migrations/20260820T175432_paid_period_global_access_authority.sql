-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef('app.resolve_organization_cabinet_access(uuid)'::regprocedure) LIKE '%global_paid_period%'
-- #1069 T10/T13: one global policy decides the post-paid-period outcome. Historical global
-- choices made after an organization's period ended can only extend that organization's earned
-- access; they cannot shorten it retroactively.
DO $migration$
DECLARE
  v_definition text;
  v_rewritten text;
  v_global_history_ctes text := E'    LIMIT 1\n'
    || E'  ), global_paid_policy_history AS (\n'
    || E'    SELECT\n'
    || E'      audit.created_at,\n'
    || E'      audit.details -> ''before'' ->> ''postPaidPeriodBehavior'' AS previous_behavior,\n'
    || E'      audit.details -> ''before'' ->> ''postPaidPeriodTariffId'' AS previous_tariff_id,\n'
    || E'      audit.details -> ''before'' ->> ''isActive'' AS previous_is_active,\n'
    || E'      audit.details -> ''after'' ->> ''postPaidPeriodBehavior'' AS next_behavior\n'
    || E'    FROM public.admin_audit_log AS audit\n'
    || E'    WHERE audit.action = ''saas_paid_period_policy_update''\n'
    || E'      AND audit.target_id = ''global''\n'
    || E'      AND audit.created_at > (SELECT period_ends_at FROM paid_period)\n'
    || E'  ), effective_global_paid_policy AS (\n'
    || E'    SELECT\n'
    || E'      candidate.post_paid_period_behavior,\n'
    || E'      candidate.post_paid_period_tariff_id,\n'
    || E'      EXISTS (\n'
    || E'        SELECT 1\n'
    || E'        FROM global_paid_policy_history AS history\n'
    || E'        WHERE CASE history.previous_behavior WHEN ''tariff'' THEN 3 WHEN ''read_only'' THEN 2 WHEN ''blocked'' THEN 1 ELSE 0 END\n'
    || E'            > CASE history.next_behavior WHEN ''tariff'' THEN 3 WHEN ''read_only'' THEN 2 WHEN ''blocked'' THEN 1 ELSE 0 END\n'
    || E'      ) AS was_tightened\n'
    || E'    FROM (\n'
    || E'      SELECT\n'
    || E'        current_policy.post_paid_period_behavior,\n'
    || E'        current_policy.post_paid_period_tariff_id,\n'
    || E'        ''infinity''::timestamptz AS recorded_at,\n'
    || E'        CASE current_policy.post_paid_period_behavior WHEN ''tariff'' THEN 3 WHEN ''read_only'' THEN 2 WHEN ''blocked'' THEN 1 ELSE 0 END AS access_rank\n'
    || E'      FROM global_paid_policy AS current_policy\n'
    || E'      UNION ALL\n'
    || E'      SELECT\n'
    || E'        history.previous_behavior,\n'
    || E'        NULLIF(history.previous_tariff_id, '''')::uuid,\n'
    || E'        history.created_at,\n'
    || E'        CASE history.previous_behavior WHEN ''tariff'' THEN 3 WHEN ''read_only'' THEN 2 WHEN ''blocked'' THEN 1 ELSE 0 END\n'
    || E'      FROM global_paid_policy_history AS history\n'
    || E'      WHERE history.previous_is_active = ''true''\n'
    || E'    ) AS candidate\n'
    || E'    ORDER BY candidate.access_rank DESC, candidate.recorded_at DESC\n'
    || E'    LIMIT 1\n'
    || E'  ), effective AS (';
BEGIN
  SELECT pg_get_functiondef('app.resolve_organization_cabinet_access(uuid)'::regprocedure)
    INTO v_definition;
  v_rewritten := replace(
    v_definition,
    E'    LIMIT 1\n  ), effective AS (',
    v_global_history_ctes
  );
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'paid_period_global_cabinet_history_anchor_not_found';
  END IF;
  v_rewritten := replace(v_rewritten, 'global_paid_policy.', 'effective_global_paid_policy.');
  v_rewritten := replace(
    v_rewritten,
    E'    LEFT JOIN global_paid_policy ON true\n',
    E'    LEFT JOIN effective_global_paid_policy ON true\n'
  );
  v_rewritten := replace(
    v_rewritten,
    E'      END AS period_source\n    FROM public.be_organizations',
    E'      END AS period_source,\n'
      || E'      COALESCE(effective_global_paid_policy.was_tightened, false) AS global_policy_was_tightened\n'
      || E'    FROM public.be_organizations'
  );
  v_rewritten := replace(
    v_rewritten,
    E'WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at\n          THEN ''full_access''\n',
    E'WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at\n          THEN ''full_access''\n'
      || E'        WHEN period_source = ''paid_period'' AND access_source = ''post_paid_period_tariff'' AND lifecycle = ''active''\n'
      || E'          THEN ''full_access''\n'
      || E'        WHEN period_source = ''paid_period'' AND global_policy_was_tightened\n'
      || E'          AND degradation_started_at IS NOT NULL AND v_now < policy_schedule.grace_ends_at THEN ''grace''\n'
      || E'        WHEN period_source = ''paid_period'' AND global_policy_was_tightened\n'
      || E'          AND degradation_started_at IS NOT NULL AND v_now < policy_schedule.read_only_ends_at THEN ''read_only''\n'
      || E'        WHEN period_source = ''paid_period'' AND lifecycle = ''read_only'' THEN ''read_only''\n'
      || E'        WHEN period_source = ''paid_period'' AND lifecycle = ''blocked'' THEN ''disabled''\n'
  );
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'paid_period_global_cabinet_outcome_anchor_not_found';
  END IF;
  v_rewritten := replace(
    v_rewritten,
    E'CASE WHEN policy IS NULL THEN ''unconfigured'' ELSE ''system'' END,',
    E'CASE\n'
      || E'      WHEN period_source = ''paid_period'' AND (access_source = ''post_paid_period_tariff'' OR lifecycle = ANY (ARRAY[''read_only'', ''blocked''])) THEN ''global_paid_period''\n'
      || E'      WHEN policy IS NULL THEN ''unconfigured''\n'
      || E'      ELSE ''system''\n'
      || E'    END,'
  );
  IF position('global_paid_period' IN v_rewritten) = 0 THEN
    RAISE EXCEPTION 'paid_period_global_cabinet_source_not_written';
  END IF;
  EXECUTE v_rewritten;

  SELECT pg_get_functiondef('app.resolve_organization_mechanic_access(uuid,text)'::regprocedure)
    INTO v_definition;
  v_rewritten := replace(
    v_definition,
    E'    LIMIT 1\n  ), effective AS (',
    v_global_history_ctes
  );
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'paid_period_global_mechanic_history_anchor_not_found';
  END IF;
  v_rewritten := replace(v_rewritten, 'global_paid_policy.', 'effective_global_paid_policy.');
  v_rewritten := replace(
    v_rewritten,
    E'    LEFT JOIN global_paid_policy ON true\n',
    E'    LEFT JOIN effective_global_paid_policy ON true\n'
  );
  v_rewritten := replace(
    v_rewritten,
    E'      END AS period_source\n    FROM public.be_organizations',
    E'      END AS period_source,\n'
      || E'      COALESCE(effective_global_paid_policy.was_tightened, false) AS global_policy_was_tightened\n'
      || E'    FROM public.be_organizations'
  );
  v_rewritten := replace(
    v_rewritten,
    E'CASE\n        WHEN p_mechanic = ANY (ARRAY[''patient_card'', ''patient_app'', ''patient_diaries'']) THEN ''full_access''',
    E'CASE\n'
      || E'        WHEN period_source = ''paid_period'' AND global_policy_was_tightened\n'
      || E'          AND degradation_started_at IS NOT NULL AND v_now < included.grace_ends_at THEN ''grace''\n'
      || E'        WHEN period_source = ''paid_period'' AND global_policy_was_tightened\n'
      || E'          AND degradation_started_at IS NOT NULL AND v_now < included.read_only_ends_at THEN ''read_only''\n'
      || E'        WHEN period_source = ''paid_period'' AND lifecycle = ''read_only'' THEN ''read_only''\n'
      || E'        WHEN period_source = ''paid_period'' AND lifecycle = ''blocked'' THEN ''disabled''\n'
      || E'        WHEN p_mechanic = ANY (ARRAY[''patient_card'', ''patient_app'', ''patient_diaries'']) THEN ''full_access'''
  );
  v_rewritten := replace(
    v_rewritten,
    E'WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at\n          THEN ''full_access''\n',
    E'WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at\n          THEN ''full_access''\n'
      || E'        WHEN period_source = ''paid_period'' AND access_source = ''post_paid_period_tariff'' AND lifecycle = ''active''\n'
      || E'          THEN ''full_access''\n'
  );
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'paid_period_global_mechanic_outcome_anchor_not_found';
  END IF;
  v_rewritten := replace(
    v_rewritten,
    E'CASE\n      WHEN p_mechanic = ANY (ARRAY[''patient_card'', ''patient_app'', ''patient_diaries'']) THEN ''critical''',
    E'CASE\n'
      || E'      WHEN period_source = ''paid_period'' AND (access_source = ''post_paid_period_tariff'' OR lifecycle = ANY (ARRAY[''read_only'', ''blocked''])) THEN ''global_paid_period''\n'
      || E'      WHEN p_mechanic = ANY (ARRAY[''patient_card'', ''patient_app'', ''patient_diaries'']) THEN ''critical'''
  );
  IF position('global_paid_period' IN v_rewritten) = 0 THEN
    RAISE EXCEPTION 'paid_period_global_mechanic_source_not_written';
  END IF;
  EXECUTE v_rewritten;
END
$migration$;
