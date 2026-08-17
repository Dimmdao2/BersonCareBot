import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseOwnerStatements,
  renderTemporaryMembershipAssertion,
} from './migrate-local-parse.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('parses owner DDL and a reusable local-postgres backfill without duplicating the migration path', () => {
  const steps = parseOwnerStatements(`
-- BCB-MIGRATION-OWNER: app_probe_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.probe() RETURNS integer LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
INSERT INTO public.probe(id) VALUES (1);
`, 'probe');

  assert.deepEqual(steps, [
    {
      owner: 'app_probe_owner',
      schemaCreate: 'app',
      languageUsage: 'plpgsql',
      sql: 'CREATE FUNCTION app.probe() RETURNS integer LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;',
      backfill: false,
    },
    {
      owner: null,
      schemaCreate: null,
      languageUsage: null,
      sql: 'INSERT INTO public.probe(id) VALUES (1);',
      backfill: true,
    },
  ]);
});

test('rejects unowned, postgres-owned, and empty backfill statements', () => {
  assert.throws(
    () => parseOwnerStatements('SELECT 1;', 'missing'),
    /neither BCB-MIGRATION-OWNER nor BCB-MIGRATION-BACKFILL/u,
  );
  assert.throws(
    () => parseOwnerStatements('-- BCB-MIGRATION-OWNER: postgres\nSELECT 1;', 'postgres'),
    /cannot use postgres as a schema owner/u,
  );
  assert.throws(
    () => parseOwnerStatements('-- BCB-MIGRATION-BACKFILL\n', 'empty'),
    /has an empty backfill/u,
  );
});

test('a pure backfill emits no untyped empty owner-membership array', () => {
  assert.equal(renderTemporaryMembershipAssertion('bcb_migrator', []), null);
  const assertion = renderTemporaryMembershipAssertion('bcb_migrator', [
    'app_one_owner',
    'app_two_owner',
  ]);
  assert.match(assertion ?? '', /m\.roleid = ANY \(ARRAY\['app_one_owner'::regrole, 'app_two_owner'::regrole\]\)/u);
  assert.doesNotMatch(assertion ?? '', /ARRAY\[\]/u);
});

test('the active B0-forward journal is executable through the owner-ordered migration parser', () => {
  const migrationRoot = path.join(repoRoot, 'apps/webapp/db/drizzle-migrations');
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationRoot, 'meta/_journal.json'), 'utf8'),
  );
  const parsedByTag = new Map(
    journal.entries.slice(1).map(({ tag }) => {
      const source = fs.readFileSync(path.join(migrationRoot, `${tag}.sql`), 'utf8');
      return [tag, parseOwnerStatements(source, tag)];
    }),
  );

  const migrationShape = (tag) =>
    parsedByTag.get(tag).map(({ owner, backfill, schemaCreate, languageUsage }) => ({
      owner,
      backfill,
      schemaCreate,
      languageUsage,
    }));

  const patientOwnerStep = {
    owner: 'app_seam_patient_self_actions_owner',
    backfill: false,
    schemaCreate: 'app',
    languageUsage: 'plpgsql',
  };
  assert.deepEqual(migrationShape('0016_patient_self_action_capabilities'), [patientOwnerStep]);
  assert.deepEqual(migrationShape('0017_patient_shared_core_capabilities'), [patientOwnerStep]);
  assert.deepEqual(
    migrationShape('0018_clinic_owner_tariff_branch_quotas'),
    [
      {
        owner: null,
        backfill: true,
        schemaCreate: null,
        languageUsage: null,
      },
      {
        owner: 'app_seam_payment_webhook_owner',
        backfill: false,
        schemaCreate: 'app',
        languageUsage: 'plpgsql',
      },
      {
        owner: 'app_seam_payment_webhook_owner',
        backfill: false,
        schemaCreate: 'app',
        languageUsage: 'plpgsql',
      },
    ],
  );
});
