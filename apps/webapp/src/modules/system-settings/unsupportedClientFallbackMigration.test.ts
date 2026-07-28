import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0224_unsupported_client_fallback_flag.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('unsupported-client fallback flag migration', () => {
  it('seeds one fail-closed global public identity in all compatibility stores', () => {
    expect(migration).toContain("'patient_unsupported_client_fallback_enabled'");
    expect(migration).toContain('\'{"value":false}\'::jsonb');
    expect(migration).toContain('INSERT INTO public.system_settings');
    expect(migration).toContain('INSERT INTO public.app_runtime_settings');
    expect(migration).toContain('INSERT INTO integrator.system_settings');
    expect(migration).toContain('idx_auth_rate_limit_events_scope_time');
    expect(migration).toContain('ON public.auth_rate_limit_events (scope, occurred_at)');
    expect(migration).toContain("'public'");
    expect(migration.match(/organization_id IS NULL/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
  });
});
