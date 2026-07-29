import { describe, expect, it } from 'vitest';
import { applyBeforeDateBound, extractMigrationDate, type MigrationFile } from './migrate.js';

// taskdb #667 — cross-app migration-ordering fix. These are pure-function unit tests for the
// optional INTEGRATOR_MIGRATIONS_BEFORE_DATE phase bound used by scripts/migrate-all.sh; no DB.

function migration(scope: string, fileName: string): MigrationFile {
  return {
    scope,
    fileName,
    filePath: `/fake/${scope}/${fileName}`,
    version: `${scope}:${fileName}`,
  };
}

describe('extractMigrationDate', () => {
  it('parses the leading YYYYMMDD date from the filename', () => {
    expect(
      extractMigrationDate(
        migration('core', '20260708_0001_p0_4_i1_integrator_direct_user_org.sql'),
      ),
    ).toBe(20260708);
  });

  it('falls back to the version string if fileName has no parseable date', () => {
    expect(extractMigrationDate(migration('core', 'no-date-here.sql'))).toBeNull();
  });
});

describe('applyBeforeDateBound', () => {
  const base = migration('core', '20260515_0001_admin_incident_alert_config.sql');
  const saas1 = migration('core', '20260708_0001_p0_4_i1_integrator_direct_user_org.sql');
  const saas2 = migration('core', '20260710_0001_r2_integrator_scoped_org_not_null.sql');
  const all = [base, saas1, saas2];

  it('unset bound: no bound at all — everything eligible, nothing deferred (default path)', () => {
    const { eligible, deferred } = applyBeforeDateBound(all, undefined);
    expect(eligible).toEqual(all);
    expect(deferred).toEqual([]);
  });

  it('empty-string bound behaves the same as unset', () => {
    const { eligible, deferred } = applyBeforeDateBound(all, '');
    expect(eligible).toEqual(all);
    expect(deferred).toEqual([]);
  });

  it('bound=20260708 defers migrations with date >= bound, keeps earlier ones eligible', () => {
    const { eligible, deferred } = applyBeforeDateBound(all, '20260708');
    expect(eligible).toEqual([base]);
    expect(deferred).toEqual([saas1, saas2]);
  });

  it('the 20260707 I0 org-column pre-declare sorts into phase 1 (< 20260708 bound)', () => {
    const i0 = migration('core', '20260707_0001_p0_4_i0_integrator_org_columns_predeclare.sql');
    expect(extractMigrationDate(i0)).toBe(20260707);
    const { eligible, deferred } = applyBeforeDateBound([i0, saas1], '20260708');
    expect(eligible).toEqual([i0]);
    expect(deferred).toEqual([saas1]);
  });

  it('a migration with no parseable date is always treated as eligible (base)', () => {
    const undated = migration('core', 'legacy-no-date.sql');
    const { eligible, deferred } = applyBeforeDateBound([undated, saas1], '20260708');
    expect(eligible).toEqual([undated]);
    expect(deferred).toEqual([saas1]);
  });

  it('rejects a malformed bound value', () => {
    expect(() => applyBeforeDateBound(all, 'not-a-date')).toThrow();
  });
});
