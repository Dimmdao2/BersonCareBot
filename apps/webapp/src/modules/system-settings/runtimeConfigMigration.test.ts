import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runtimeRoot = readFileSync(
  new URL('../../../db/drizzle-migrations/0186_app_runtime_settings.sql', import.meta.url),
  'utf8',
);
const supportDefaults = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0187_patient_support_runtime_defaults.sql',
    import.meta.url,
  ),
  'utf8',
);
const mediaWorkerRuntime = readFileSync(
  new URL('../../../db/drizzle-migrations/0188_media_worker_runtime_flags.sql', import.meta.url),
  'utf8',
);
const patientCooldownPlaybackRuntime = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0189_patient_runtime_cooldown_playback_accessors.sql',
    import.meta.url,
  ),
  'utf8',
);
const curatedPlaybackPatientRuntime = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0192_curated_playback_and_patient_program_runtime.sql',
    import.meta.url,
  ),
  'utf8',
);
const authRoleRuntime = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0201_e1_webapp_auth_role_runtime_config.sql',
    import.meta.url,
  ),
  'utf8',
);
const adminEmailRoleRuntime = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0231_admin_email_role_runtime_config.sql',
    import.meta.url,
  ),
  'utf8',
);
const patientPlaybackAccessors = readFileSync(
  new URL(
    '../../../../../deploy/postgres/patient-media-playback-telemetry-accessors.sql',
    import.meta.url,
  ),
  'utf8',
);
const patientTreatmentPage = readFileSync(
  new URL('../../app/app/patient/treatment/[instanceId]/page.tsx', import.meta.url),
  'utf8',
);
const patientTreatmentItemPage = readFileSync(
  new URL('../../app/app/patient/treatment/[instanceId]/item/[itemId]/page.tsx', import.meta.url),
  'utf8',
);
const patientPlaybackScratch = readFileSync(
  new URL(
    '../../../../../docs/_TODO/SAAS_FOUNDATION/scripts/smoke-patient-playback-telemetry-accessors.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('patient-safe support default runtime migration', () => {
  it('projects role allowlists through the closed server accessor', () => {
    for (const key of [
      'admin_telegram_ids',
      'admin_max_ids',
      'admin_phones',
      'admin_emails',
      'doctor_telegram_ids',
      'doctor_max_ids',
      'doctor_phones',
    ]) {
      expect(`${authRoleRuntime}\n${adminEmailRoleRuntime}`).toContain(`'${key}'`);
    }
    expect(authRoleRuntime).toContain("'server'");
    expect(authRoleRuntime).toContain("('webapp','auth_role_config')");
    expect(authRoleRuntime).toContain(
      'CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting',
    );
    expect(authRoleRuntime).not.toContain(
      'GRANT SELECT ON TABLE public.system_settings TO app_patient',
    );
    expect(authRoleRuntime).not.toContain('GRANT EXECUTE');
    expect(adminEmailRoleRuntime).toContain('\'admin_emails\', \'{"value":""}\'::jsonb');
    expect(adminEmailRoleRuntime).toContain("'admin_emails'");
  });

  it('registers global and organization backfill for both doctor defaults', () => {
    for (const key of [
      'doctor_patient_support_comments_without_support_default_enabled',
      'doctor_patient_support_media_without_support_default_enabled',
    ]) {
      expect(supportDefaults.split(`'${key}'`).length - 1).toBe(2);
    }
    expect(supportDefaults).toContain('COALESCE(setting.value_json, definition.default_value)');
    expect(supportDefaults).toContain('setting.organization_id IS NULL');
    expect(supportDefaults).toContain('setting.organization_id IS NOT NULL');
    expect(supportDefaults).toContain(
      'ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL',
    );
    expect(supportDefaults).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
  });

  it('uses the generic sync trigger and patient-readable org-scoped RLS root', () => {
    expect(runtimeRoot).toContain('CREATE TRIGGER system_settings_sync_registered_runtime');
    expect(runtimeRoot).toContain('WHERE key = NEW.key');
    expect(runtimeRoot).toContain('AND scope = NEW.scope');
    expect(runtimeRoot).toContain("audience IN ('public', 'authenticated_client')");
    expect(runtimeRoot).toContain(
      "organization_id = NULLIF(current_setting('app.org', true), '')::uuid",
    );
    expect(runtimeRoot).toContain(
      'GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;',
    );
  });

  it('registers media worker flags as global server runtime without exposing restricted settings', () => {
    expect(mediaWorkerRuntime).toContain(
      "'video_hls_pipeline_enabled', 'admin', 'server', '{\"value\":false}'::jsonb",
    );
    expect(mediaWorkerRuntime).toContain(
      "'video_watermark_enabled', 'admin', 'server', '{\"value\":false}'::jsonb",
    );
    expect(mediaWorkerRuntime).toContain("audience = 'server'");
    expect(mediaWorkerRuntime).toContain('organization_id IS NULL');
    expect(mediaWorkerRuntime).toContain("pg_has_role(current_user, 'app_worker', 'member')");
    expect(mediaWorkerRuntime).toContain(
      "AND NOT pg_has_role(current_user, 'app_worker', 'member')",
    );
    expect(mediaWorkerRuntime).toContain(
      "NULLIF(current_setting('app.patient_user_id', true), '') IS NULL",
    );
    expect(mediaWorkerRuntime).toContain(
      'GRANT SELECT ON TABLE public.app_runtime_settings TO app_worker;',
    );
    expect(mediaWorkerRuntime).not.toContain('GRANT SELECT ON TABLE public.system_settings');
    expect(mediaWorkerRuntime).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
  });

  it('registers the bounded patient cooldown in the authenticated runtime store', () => {
    expect(patientCooldownPlaybackRuntime).toContain(
      "'patient_treatment_plan_item_done_repeat_cooldown_minutes'",
    );
    expect(patientCooldownPlaybackRuntime).toContain("'authenticated_client'");
    expect(patientCooldownPlaybackRuntime).toContain('\'{"value":60}\'::jsonb');
    expect(patientCooldownPlaybackRuntime).toContain('setting.organization_id IS NULL');
    expect(patientCooldownPlaybackRuntime).toContain('setting.organization_id IS NOT NULL');
    expect(patientCooldownPlaybackRuntime).not.toContain(
      'GRANT SELECT ON TABLE public.system_settings TO app_patient',
    );
    for (const source of [patientTreatmentPage, patientTreatmentItemPage]) {
      expect(source).toContain('deps.runtimeConfig.getInteger(');
      expect(source).toContain('detail.organizationId?.trim()');
      expect(source).not.toContain('deps.systemSettings.getSetting(');
    }
  });

  it('keeps playback writes behind actor, organization and media-bound accessors', () => {
    for (const fragment of [
      'app.current_org_id()',
      'app.current_patient_user_id()',
      'v_patient_user_id IS NULL OR v_patient_user_id <> p_user_id',
      'media.organization_id = v_organization_id',
      "p_delivery NOT IN ('hls', 'mp4', 'file')",
      '(v_organization_id, p_user_id, p_media_id, p_delivery, p_fallback_used)',
    ]) {
      expect(patientCooldownPlaybackRuntime).toContain(fragment);
    }
    expect(patientPlaybackAccessors).toContain(
      'ALTER FUNCTION app.increment_media_playback_resolution_stat(uuid, uuid, text, boolean)\n  OWNER TO app_owner',
    );
    expect(patientPlaybackAccessors).toContain(
      'ALTER FUNCTION app.record_media_playback_resolution_event(uuid, uuid, text, boolean)\n  OWNER TO app_owner',
    );
    expect(patientPlaybackAccessors).toContain('FROM app_staff');
    expect(patientPlaybackAccessors).toContain('TO app_patient');
    expect(patientPlaybackAccessors).toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.media_playback_stats_hourly TO app_owner;',
    );
    expect(patientPlaybackAccessors).not.toContain('TO app_staff');
    expect(patientPlaybackAccessors).not.toContain('public.be_organization_members');
    expect(patientPlaybackAccessors).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE)[^;]*\bTO\s+app_(?:staff|patient)\b/i,
    );
    expect(patientPlaybackScratch).toContain('SET LOCAL ROLE app_patient');
    expect(patientPlaybackScratch).toContain('scratch_cross_org_media_unexpectedly_allowed');
    expect(patientPlaybackScratch).toContain('scratch_cross_org_stat_unexpectedly_allowed');
    expect(patientPlaybackScratch).toContain('scratch_org_only_actor_unexpectedly_allowed');
    expect(patientPlaybackScratch).toContain('scratch_integrator_actor_unexpectedly_allowed');
    expect(patientPlaybackScratch).toContain('scratch_staff_forged_actor_unexpectedly_allowed');
    expect(patientPlaybackScratch).toContain('cross_org_event_denied');
    expect(patientPlaybackScratch).toContain('denied_contexts_created_no_extra_events');
    expect(patientPlaybackScratch).toContain('ROLLBACK;');
    expect(patientPlaybackScratch).not.toContain('COMMIT;');
  });

  it('projects patient discussion media config and keeps playback health curated', () => {
    expect(curatedPlaybackPatientRuntime).toContain(
      "'patient_program_discussion_media_submission_enabled'",
    );
    expect(curatedPlaybackPatientRuntime).toContain("'authenticated_client'");
    expect(curatedPlaybackPatientRuntime).toContain('setting.organization_id IS NOT NULL');
    expect(curatedPlaybackPatientRuntime).toContain(
      'CREATE OR REPLACE FUNCTION app.read_curated_playback_health()',
    );
    expect(curatedPlaybackPatientRuntime).toContain('SECURITY DEFINER');
    expect(curatedPlaybackPatientRuntime).toContain('SET search_path = pg_catalog');
    expect(curatedPlaybackPatientRuntime).not.toContain(
      'GRANT SELECT ON TABLE public.system_settings TO app_patient',
    );
  });
});
