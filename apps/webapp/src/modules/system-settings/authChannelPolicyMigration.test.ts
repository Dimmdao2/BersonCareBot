import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../db/drizzle-migrations/0223_n1a_auth_channel_policy.sql', import.meta.url),
  'utf8',
);

const AUTH_CHANNEL_KEYS = [
  'auth_email_enabled',
  'auth_sms_enabled',
  'auth_telegram_enabled',
  'auth_max_enabled',
] as const;

describe('N1A auth-channel policy migration', () => {
  it('registers all four keys as global public admin settings', () => {
    for (const key of AUTH_CHANNEL_KEYS) expect(migration).toContain(`'${key}'`);
    expect(migration).toContain("SELECT key, 'admin', NULL, value_json, now(), NULL");
    expect(migration).toContain("SELECT key, scope, NULL, 'public', value_json");
    expect(migration).toContain('organization_id IS NULL');
  });

  it('preserves current channel behavior and seeds SMS from the effective public policy', () => {
    expect(migration).toContain("('auth_email_enabled', '{\"value\":true}'::jsonb)");
    expect(migration).toContain("('auth_telegram_enabled', '{\"value\":true}'::jsonb)");
    expect(migration).toContain("('auth_max_enabled', '{\"value\":true}'::jsonb)");
    expect(migration).toContain("key = 'public_sms_fallback_enabled'");
    expect(migration).toContain("audience = 'public'");
    expect(migration).toContain('COALESCE((SELECT enabled FROM sms_policy), false)');
  });

  it('aligns system settings, public runtime and the integrator mirror', () => {
    expect(migration).toContain('INSERT INTO public.system_settings');
    expect(migration).toContain('INSERT INTO public.app_runtime_settings');
    expect(migration).toContain('INSERT INTO integrator.system_settings');
    expect(
      migration.match(/ON CONFLICT \(key, scope\) WHERE organization_id IS NULL/g),
    ).toHaveLength(3);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });
});
