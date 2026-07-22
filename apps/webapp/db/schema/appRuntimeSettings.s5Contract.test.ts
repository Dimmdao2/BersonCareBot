import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_SYSTEM_SETTING_KEYS,
  SYSTEM_SETTING_REGISTRY,
} from "../../src/modules/system-settings/registry";

const schema = readFileSync(new URL("./appRuntimeSettings.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../drizzle-migrations/0209_s5_runtime_settings_audit_contract.sql", import.meta.url),
  "utf8",
);
const dualWriteMigration = readFileSync(
  new URL("../drizzle-migrations/0210_s5_runtime_dual_write_trigger_bypass.sql", import.meta.url),
  "utf8",
);
const authChannelPolicyMigration = readFileSync(
  new URL("../drizzle-migrations/0223_n1a_auth_channel_policy.sql", import.meta.url),
  "utf8",
);
const unsupportedClientFallbackMigration = readFileSync(
  new URL("../drizzle-migrations/0224_unsupported_client_fallback_flag.sql", import.meta.url),
  "utf8",
);
const bookingLocationPaletteMigration = readFileSync(
  new URL("../drizzle-migrations/0227_booking_location_default_palette.sql", import.meta.url),
  "utf8",
);
const doctorTodayPreferencesMigration = readFileSync(
  new URL("../drizzle-migrations/0228_doctor_today_preferences.sql", import.meta.url),
  "utf8",
);

function normalRuntimeDefinitionKeys(sql: string): string[] {
  const definitionBlock = sql.match(
    /WITH runtime_definitions\(key, scope, audience, default_value_json\) AS \(\n  VALUES([\s\S]*?)\n\)\n,\nsource_rows AS/,
  )?.[1];
  if (!definitionBlock) throw new Error("S5-1 runtime definition block is missing");
  return [...definitionBlock.matchAll(/\('([^']+)'/g)].map((match) => match[1]!);
}

describe("S5-1 app runtime settings schema/data contract", () => {
  it("declares the additive audit model with structural checks, FKs and history indexes", () => {
    for (const fragment of [
      'pgTable(\n  "app_runtime_settings_audit"',
      "oldValueJson: jsonb(\"old_value_json\")",
      "newValueJson: jsonb(\"new_value_json\").notNull()",
      "updatedBy: uuid(\"updated_by\")",
      "source: text().default(\"runtime_store_write\").notNull()",
      "app_runtime_settings_audit_organization_id_fkey",
      "app_runtime_settings_audit_updated_by_fkey",
      "app_runtime_settings_audit_global_key_history_idx",
      "app_runtime_settings_audit_org_key_history_idx",
      "table.key, table.scope, table.changedAt.desc()",
      "table.organizationId, table.key, table.scope, table.changedAt.desc()",
      "app_runtime_settings_audit_scope_check",
      "app_runtime_settings_audit_audience_check",
    ]) {
      expect(schema).toContain(fragment);
    }
  });

  it("creates the audit table and exactly one same-transaction INSERT/UPDATE trigger owner", () => {
    for (const fragment of [
      "CREATE TABLE IF NOT EXISTS public.app_runtime_settings_audit",
      "FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE",
      "FOREIGN KEY (updated_by) REFERENCES public.platform_users(id) ON DELETE SET NULL",
      "CREATE INDEX IF NOT EXISTS app_runtime_settings_audit_global_key_history_idx",
      "CREATE INDEX IF NOT EXISTS app_runtime_settings_audit_org_key_history_idx",
      "CREATE OR REPLACE FUNCTION public.audit_app_runtime_settings_change()",
      "CASE WHEN TG_OP = 'UPDATE' THEN OLD.value_json ELSE NULL END",
      "AFTER INSERT OR UPDATE ON public.app_runtime_settings",
      "FOR EACH ROW EXECUTE FUNCTION public.audit_app_runtime_settings_change()",
      "current_setting('app.runtime_settings_audit_source', true)",
    ]) {
      expect(migration).toContain(fragment);
    }
    expect(migration).not.toContain("GRANT SELECT ON TABLE public.app_runtime_settings_audit");
    expect(migration).not.toContain("ALTER TABLE public.app_runtime_settings_audit ENABLE ROW LEVEL SECURITY");
    expect((migration.match(/CREATE TRIGGER app_runtime_settings_audit_change/g) ?? [])).toHaveLength(1);
    expect((migration.match(/INSERT INTO public\.app_runtime_settings_audit/g) ?? [])).toHaveLength(1);
  });

  it("keeps the normal migration list exactly aligned with the S5-0 runtime registry", () => {
    const authChannelKeys = [
      "auth_email_enabled",
      "auth_sms_enabled",
      "auth_telegram_enabled",
      "auth_max_enabled",
    ];
    for (const key of authChannelKeys) expect(authChannelPolicyMigration).toContain(`'${key}'`);
    expect(unsupportedClientFallbackMigration).toContain("'patient_unsupported_client_fallback_enabled'");
    expect(bookingLocationPaletteMigration).toContain("'booking_location_default_palette'");
    expect(doctorTodayPreferencesMigration).toContain("'doctor_today_preferences'");
    expect(doctorTodayPreferencesMigration).toContain("organization_id IS NOT NULL");
    expect(doctorTodayPreferencesMigration).toContain(
      "public.app_runtime_settings.updated_at <= EXCLUDED.updated_at",
    );
    const migrationKeys = [
      ...normalRuntimeDefinitionKeys(migration),
      ...authChannelKeys,
      "patient_unsupported_client_fallback_enabled",
      "booking_location_default_palette",
      "doctor_today_preferences",
    ];
    expect(new Set(migrationKeys).size).toBe(migrationKeys.length);
    expect([...migrationKeys].sort()).toEqual([...RUNTIME_SYSTEM_SETTING_KEYS].sort());
  });

  it("uses only registry-approved safe derived projection names and never materializes credential fields", () => {
    const safeProjectionNames = Object.values(SYSTEM_SETTING_REGISTRY)
      .map((definition) => ("safeProjection" in definition ? definition.safeProjection : undefined))
      .filter((name): name is string => typeof name === "string");
    for (const name of safeProjectionNames) expect(migration).toContain(`'${name}'`);
    for (const secretField of ["privateKey", "password", "apiKey", "webhookSecret", "refreshToken"]) {
      expect(migration).not.toContain(secretField);
    }
    expect(migration).toContain("'publicKey'");
    expect(migration).toContain("'id', provider.value->>'id'");
    expect(migration).toContain("'label', COALESCE");
    expect(migration).toContain("'enabled', CASE lower");
  });

  it("is additive and preserves a newer destination row during the residual backfill", () => {
    expect(migration).toContain("runtime.updated_at <= source.updated_at");
    expect(migration).toContain("runtime.updated_at <= projection.updated_at");
    expect(migration).toContain("WHERE public.app_runtime_settings.updated_at <= EXCLUDED.updated_at");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).toContain("definition.key <> 'patient_booking_url'");
    expect(migration).toContain("SELECT set_config('app.runtime_settings_audit_source', 's5_1_backfill', false)");
  });

  it("keeps the legacy trigger active while bypassing only an application-owned explicit dual-write", () => {
    expect(dualWriteMigration).toContain("app.runtime_settings_explicit_dual_write");
    expect(dualWriteMigration).toContain("NEW.key = 'web_push_vapid'");
    expect(dualWriteMigration).toContain("'web_push_vapid_public_key'");
    expect(dualWriteMigration).toContain("NEW.key = 'booking_payment_providers'");
    expect(dualWriteMigration).toContain("'booking_payment_public_config'");
    expect(dualWriteMigration).toContain("payment_runtime_value jsonb");
    expect(dualWriteMigration).toContain("IF NEW.key = 'patient_booking_url' AND NEW.scope = 'admin'");
    expect(dualWriteMigration).toContain("'oauth_yandex_enabled'");
    expect(dualWriteMigration).toContain("'public_sms_fallback_enabled'");
    expect(dualWriteMigration).toContain("CREATE TRIGGER system_settings_sync_registered_runtime");
    expect(dualWriteMigration).not.toContain("DROP FUNCTION public.sync_registered_app_runtime_setting");
  });
});
