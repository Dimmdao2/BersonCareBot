-- #1069 T10/T13 — the paid-period singleton decides the direct non-payment outcome before a
-- tariff's historical system ladder. This is a forward function-body migration only: no access is
-- granted or revoked by the migration itself.
-- BCB-MIGRATION-VERIFY: SELECT pg_get_functiondef('app.resolve_organization_cabinet_access(uuid)'::regprocedure) LIKE '%global_paid_period%'
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
DO $migration$
DECLARE
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef('app.resolve_organization_cabinet_access(uuid)'::regprocedure)
    INTO v_definition;
  v_rewritten := replace(
    v_definition,
    E'WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at\n          THEN \'full_access\'\n',
    E'WHEN degradation_started_at IS NOT NULL AND v_now < degradation_started_at\n          THEN \'full_access\'\n'
      || E'        -- T10/T13: a paid-period outcome is global and cannot be replaced by the tariff ladder.\n'
      || E'        WHEN period_source = \'paid_period\' AND lifecycle = \'read_only\' THEN \'read_only\'\n'
      || E'        WHEN period_source = \'paid_period\' AND lifecycle = \'blocked\' THEN \'disabled\'\n'
  );
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'paid_period_global_cabinet_anchor_not_found';
  END IF;
  v_rewritten := replace(
    v_rewritten,
    E'CASE WHEN policy IS NULL THEN \'unconfigured\' ELSE \'system\' END,',
    E'CASE\n'
      || E'      WHEN period_source = \'paid_period\' AND lifecycle = ANY (ARRAY[\'read_only\', \'blocked\']) THEN \'global_paid_period\'\n'
      || E'      WHEN policy IS NULL THEN \'unconfigured\'\n'
      || E'      ELSE \'system\'\n'
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
    E'CASE\n        WHEN p_mechanic = ANY (ARRAY[\'patient_card\', \'patient_app\', \'patient_diaries\']) THEN \'full_access\'',
    E'CASE\n'
      || E'        -- T10/T13: paid-period read-only/blocked is one cabinet-wide result. It wins\n'
      || E'        -- before mechanic inclusion, compat policy JSON, or the tariff system ladder.\n'
      || E'        WHEN period_source = \'paid_period\' AND lifecycle = \'read_only\' THEN \'read_only\'\n'
      || E'        WHEN period_source = \'paid_period\' AND lifecycle = \'blocked\' THEN \'disabled\'\n'
      || E'        WHEN p_mechanic = ANY (ARRAY[\'patient_card\', \'patient_app\', \'patient_diaries\']) THEN \'full_access\''
  );
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'paid_period_global_mechanic_anchor_not_found';
  END IF;
  v_rewritten := replace(
    v_rewritten,
    E'CASE\n      WHEN p_mechanic = ANY (ARRAY[\'patient_card\', \'patient_app\', \'patient_diaries\']) THEN \'critical\'',
    E'CASE\n'
      || E'      WHEN period_source = \'paid_period\' AND lifecycle = ANY (ARRAY[\'read_only\', \'blocked\']) THEN \'global_paid_period\'\n'
      || E'      WHEN p_mechanic = ANY (ARRAY[\'patient_card\', \'patient_app\', \'patient_diaries\']) THEN \'critical\''
  );
  IF position('global_paid_period' IN v_rewritten) = 0 THEN
    RAISE EXCEPTION 'paid_period_global_mechanic_source_not_written';
  END IF;
  EXECUTE v_rewritten;
END
$migration$;
