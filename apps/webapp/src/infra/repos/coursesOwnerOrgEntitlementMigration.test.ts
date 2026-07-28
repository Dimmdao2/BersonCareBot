import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * C4C: phase-A flips `courses` to fail-closed in MECHANIC_DEFAULT_ENABLED
 * (src/modules/org-entitlements/types.ts), so migration 0214 must plant an explicit
 * `courses = true` override for the canonical owner organization from migration 0086
 * (`a0000000-0000-4000-8000-000000000001`) — otherwise the owner organization itself would lose
 * access. See OWNER_REVIEW_2026-07-18.md §13.
 */
const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  repoDir,
  '../../../db/drizzle-migrations/0214_courses_owner_org_entitlement.sql',
);
const journalPath = join(repoDir, '../../../db/drizzle-migrations/meta/_journal.json');

const OWNER_ORG_ID = 'a0000000-0000-4000-8000-000000000001';

describe('0214 courses owner-org entitlement migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('records the actual 0086 provenance for the canonical owner organization', () => {
    expect(sql).toContain('migration 0086');
    expect(sql).not.toContain('migration 0148');
  });

  it('fails clearly when the canonical owner organization is absent', () => {
    expect(sql).toContain(`v_owner_org_id constant uuid := '${OWNER_ORG_ID}'`);
    expect(sql).toContain('SELECT count(*)::integer');
    expect(sql).toContain('FROM be_organizations');
    expect(sql).toMatch(/RAISE EXCEPTION 'C4C\.0214 expected canonical owner organization/);
  });

  it('upserts an explicit courses=true override for the owner organization only', () => {
    expect(sql).toContain(
      'INSERT INTO saas_org_entitlement_overrides (organization_id, mechanic, enabled)',
    );
    expect(sql).toContain(`VALUES (v_owner_org_id, 'courses', true)`);
    expect(sql).toContain(
      'ON CONFLICT ON CONSTRAINT saas_org_entitlement_overrides_org_mechanic_uidx',
    );
    expect(sql).toContain('DO UPDATE SET enabled = true, updated_at = now()');
    // Only the canonical owner org id appears — no second organization is granted `courses`.
    const orgIdOccurrences = sql.split(OWNER_ORG_ID).length - 1;
    const otherUuidLiterals = [
      ...sql.matchAll(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi),
    ];
    expect(orgIdOccurrences).toBeGreaterThan(0);
    for (const [literal] of otherUuidLiterals) {
      expect(literal).toBe(`'${OWNER_ORG_ID}'`);
    }
  });

  it('proves the post-migration outcome instead of only attempting the write', () => {
    expect(sql).toContain('Prove the outcome');
    expect(sql).toContain("WHERE organization_id = v_owner_org_id AND mechanic = 'courses'");
    expect(sql).toMatch(/IF v_enabled IS DISTINCT FROM true THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION 'C4C\.0214 expected courses override enabled=true/);
  });

  it('documents an additive rollback that does not touch other organizations', () => {
    expect(sql).toContain('DELETE FROM saas_org_entitlement_overrides');
    expect(sql).toContain(`WHERE organization_id = '${OWNER_ORG_ID}' AND mechanic = 'courses'`);
  });

  it('is registered in the drizzle journal', () => {
    const journal = readFileSync(journalPath, 'utf8');
    expect(journal).toContain('"tag": "0214_courses_owner_org_entitlement"');
    expect(journal).toContain('"idx": 214');
  });
});
