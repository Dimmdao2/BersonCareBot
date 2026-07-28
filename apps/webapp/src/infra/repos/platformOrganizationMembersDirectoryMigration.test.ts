import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../db/drizzle-migrations/0267_platform_organization_members_directory.sql',
    import.meta.url,
  ),
  'utf8',
);
const overlay = readFileSync(
  new URL('../../../../../deploy/postgres/c5a-platform-operations-runtime.sql', import.meta.url),
  'utf8',
);
const deployGate = readFileSync(
  new URL('../../../../../deploy/host/deploy-test-saas.sh', import.meta.url),
  'utf8',
);
const journal = readFileSync(
  new URL('../../../db/drizzle-migrations/meta/_journal.json', import.meta.url),
  'utf8',
);

describe('platform organization-members directory boundary', () => {
  it('projects only staff name and membership metadata for one exact organization', () => {
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION app.list_platform_organization_members(',
    );
    expect(migration).toContain('WHERE membership.organization_id = p_organization_id');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = pg_catalog');
    expect(migration).toContain(
      'ALTER FUNCTION app.list_platform_organization_members(uuid) OWNER TO app_owner;',
    );
    expect(migration).not.toMatch(
      /phone_normalized|email_normalized|user_channel_bindings|org_enrollments/u,
    );
  });

  it('rehydrates exactly SELECT plus the narrow function and asserts both after deploy', () => {
    expect(overlay).toContain(
      'GRANT SELECT ON TABLE public.be_organization_members TO app_platform_settings;',
    );
    expect(overlay).toContain(
      'GRANT EXECUTE ON FUNCTION app.list_platform_organization_members(uuid)',
    );
    expect(overlay).toContain('c5a_platform_organization_members_directory_exact_wall');
    expect(overlay).toContain(
      "NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'INSERT')",
    );
    expect(overlay).toContain(
      "NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'UPDATE')",
    );
    expect(overlay).toContain(
      "NOT has_table_privilege('app_platform_settings', 'public.be_organization_members', 'DELETE')",
    );
    expect(overlay).toContain(
      "NOT has_table_privilege('app_platform_settings', 'public.platform_users', 'SELECT')",
    );
    expect(deployGate).toContain('assert_c5a_platform_organization_members_closure');
    // 106 -> 107: 0267 adds this staff-name directory accessor, 0268 adds the delivery-audit
    // writer, and 0269 removes the superseded signup-slug reservation function.
    expect(deployGate).toContain('local expected_secdef_count=107');
  });

  it('registers the renumbered migration 0267 exactly', () => {
    const entries = (
      JSON.parse(journal) as {
        entries: Array<Record<string, unknown>>;
      }
    ).entries;
    // 268 -> 267: the reserved 0267 work needed no migration, so the directory migration closes
    // that gap while preserving its SQL and timestamp.
    expect(entries.find((entry) => entry.idx === 267)).toEqual({
      idx: 267,
      version: '7',
      when: 1793539200065,
      tag: '0267_platform_organization_members_directory',
      breakpoints: true,
    });
  });
});
