import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0264_platform_integration_availability.sql',
    import.meta.url,
  ),
  'utf8',
);
const journal = readFileSync(
  new URL('../../../db/drizzle-migrations/meta/_journal.json', import.meta.url),
  'utf8',
);
const platformRoleOverlay = readFileSync(
  new URL('../../../../../deploy/postgres/u9a-platform-settings-role.sql', import.meta.url),
  'utf8',
);
const deployGate = readFileSync(
  new URL('../../../../../deploy/host/deploy-test-saas.sh', import.meta.url),
  'utf8',
);

describe('platform integration availability migration', () => {
  it('seeds the canonical row and both mirrors with compatibility-preserving defaults', () => {
    expect(migration).toContain('INSERT INTO public.system_settings');
    expect(migration).toContain('INSERT INTO public.app_runtime_settings');
    expect(migration).toContain('INSERT INTO integrator.system_settings');
    expect(migration).toContain('"google_calendar":true');
    expect(migration).toContain('"yandex_calendar":false');
    expect(migration).toContain('organization_id IS NULL');
    expect(journal).toContain('"tag": "0264_platform_integration_availability"');
  });

  it('extends the exact platform sync allowlist without changing privilege or SECDEF counts', () => {
    expect(platformRoleOverlay).toContain("'platform_integration_availability'");
    expect(migration).not.toMatch(/^\s*(?:CREATE|ALTER)\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/im);
    expect(migration).not.toMatch(/^\s*GRANT\b/im);
    expect(deployGate).toContain('local expected_secdef_count=107');
  });
});
