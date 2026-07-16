import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeRoot = readFileSync(
  new URL("../../../db/drizzle-migrations/0186_app_runtime_settings.sql", import.meta.url),
  "utf8",
);
const supportDefaults = readFileSync(
  new URL(
    "../../../db/drizzle-migrations/0187_patient_support_runtime_defaults.sql",
    import.meta.url,
  ),
  "utf8",
);
const mediaWorkerRuntime = readFileSync(
  new URL("../../../db/drizzle-migrations/0188_media_worker_runtime_flags.sql", import.meta.url),
  "utf8",
);

describe("patient-safe support default runtime migration", () => {
  it("registers global and organization backfill for both doctor defaults", () => {
    for (const key of [
      "doctor_patient_support_comments_without_support_default_enabled",
      "doctor_patient_support_media_without_support_default_enabled",
    ]) {
      expect(supportDefaults.split(`'${key}'`).length - 1).toBe(2);
    }
    expect(supportDefaults).toContain("COALESCE(setting.value_json, definition.default_value)");
    expect(supportDefaults).toContain("setting.organization_id IS NULL");
    expect(supportDefaults).toContain("setting.organization_id IS NOT NULL");
    expect(supportDefaults).toContain(
      "ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL",
    );
    expect(supportDefaults).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
  });

  it("uses the generic sync trigger and patient-readable org-scoped RLS root", () => {
    expect(runtimeRoot).toContain("CREATE TRIGGER system_settings_sync_registered_runtime");
    expect(runtimeRoot).toContain("WHERE key = NEW.key");
    expect(runtimeRoot).toContain("AND scope = NEW.scope");
    expect(runtimeRoot).toContain("audience IN ('public', 'authenticated_client')");
    expect(runtimeRoot).toContain(
      "organization_id = NULLIF(current_setting('app.org', true), '')::uuid",
    );
    expect(runtimeRoot).toContain(
      "GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;",
    );
  });

  it("registers media worker flags as global server runtime without exposing restricted settings", () => {
    expect(mediaWorkerRuntime).toContain(
      "'video_hls_pipeline_enabled', 'admin', 'server', '{\"value\":false}'::jsonb",
    );
    expect(mediaWorkerRuntime).toContain(
      "'video_watermark_enabled', 'admin', 'server', '{\"value\":false}'::jsonb",
    );
    expect(mediaWorkerRuntime).toContain("audience = 'server'");
    expect(mediaWorkerRuntime).toContain("organization_id IS NULL");
    expect(mediaWorkerRuntime).toContain("pg_has_role(current_user, 'app_worker', 'member')");
    expect(mediaWorkerRuntime).toContain(
      "AND NOT pg_has_role(current_user, 'app_worker', 'member')",
    );
    expect(mediaWorkerRuntime).toContain(
      "NULLIF(current_setting('app.patient_user_id', true), '') IS NULL",
    );
    expect(mediaWorkerRuntime).toContain(
      "GRANT SELECT ON TABLE public.app_runtime_settings TO app_worker;",
    );
    expect(mediaWorkerRuntime).not.toContain("GRANT SELECT ON TABLE public.system_settings");
    expect(mediaWorkerRuntime).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
  });
});
