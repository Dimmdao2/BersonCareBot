import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseOwnerStatements,
  renderTemporaryMembershipAssertion,
} from './migrate-local-parse.mjs';

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
