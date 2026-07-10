import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line no-secrets/no-secrets -- migration filename, not a secret
const migrationFile = '20260710_0001_r2_integrator_scoped_org_not_null.sql';
const migrationPath = join(__dirname, 'migrations', 'core', migrationFile);

const scopedTables = [
  'integrator.contacts',
  'integrator.content_access_grants',
  'integrator.user_reminder_rules',
  'integrator.user_subscriptions',
  'integrator.conversations',
  'integrator.message_drafts',
  'integrator.user_questions',
  'integrator.mailings',
  'integrator.mailing_logs',
  'integrator.conversation_messages',
  'integrator.question_messages',
  'integrator.user_reminder_occurrences',
  'integrator.user_reminder_delivery_logs',
] as const;

const denormChildren = [
  'integrator.conversation_messages',
  'integrator.question_messages',
  'integrator.user_reminder_occurrences',
  'integrator.user_reminder_delivery_logs',
] as const;

function migrationSql(): string {
  return readFileSync(migrationPath, 'utf8');
}

describe('R2 integrator SCOPED organization_id NOT NULL migration', () => {
  it('documents the first-contact and historical default-org policy plus rollback', () => {
    const sql = migrationSql();

    expect(sql).toContain('POLICY:');
    expect(sql).toContain('Pre-enrollment / first-contact rows resolve to the organization of the inbound channel');
    expect(sql).toContain('Historically unresolvable rows fall back only when exactly one organization exists today');
    expect(sql).toContain('DOWN / manual rollback');
    expect(sql).toContain(`core:${migrationFile}`);
  });

  it('sets and can roll back NOT NULL for all 13 SCOPED integrator tables', () => {
    const sql = migrationSql();

    for (const table of scopedTables) {
      expect(sql).toContain(`ALTER TABLE ${table} ALTER COLUMN organization_id SET NOT NULL;`);
      expect(sql).toContain(`ALTER TABLE ${table} ALTER COLUMN organization_id DROP NOT NULL;`);
      expect(sql).toMatch(
        new RegExp(
          `count\\(\\*\\)\\s+FILTER\\s*\\(WHERE organization_id IS NULL\\)[\\s\\S]{0,80}?FROM\\s+${table.replace('.', '\\.')}`,
        ),
      );
    }
  });

  it('backfills denormalized children from parents before enforcing NOT NULL', () => {
    const sql = migrationSql();

    expect(sql).toContain('SET organization_id = parent.organization_id');
    expect(sql).toContain('expected no child/parent organization mismatches before NOT NULL');

    const firstChildAlterIndex = Math.min(
      ...denormChildren.map((table) => sql.indexOf(`ALTER TABLE ${table} ALTER COLUMN organization_id SET NOT NULL;`)),
    );

    const denormChildrenSet: ReadonlySet<string> = new Set(denormChildren);
    for (const parentTable of scopedTables.filter((table) => !denormChildrenSet.has(table))) {
      const parentAlterIndex = sql.indexOf(`ALTER TABLE ${parentTable} ALTER COLUMN organization_id SET NOT NULL;`);
      expect(parentAlterIndex).toBeGreaterThanOrEqual(0);
      expect(parentAlterIndex).toBeLessThan(firstChildAlterIndex);
    }
  });

  it('keeps the stage13 bypass for frozen legacy subscription writes', () => {
    const sql = migrationSql();

    expect(sql).toContain("SET LOCAL app.stage13_bypass = 'true';");
    expect(sql).toContain('UPDATE integrator.user_subscriptions target');
  });
});
