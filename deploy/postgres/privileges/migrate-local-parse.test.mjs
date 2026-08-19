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

function requireDerivedDdlMetadata(source, tag) {
  const rawStatements = source.split('--> statement-breakpoint');
  const parsedStatements = parseOwnerStatements(source, tag);
  assert.equal(parsedStatements.length, rawStatements.length);

  rawStatements.forEach((statement, index) => {
    const createdSchemas = [...statement.matchAll(
      /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z_][A-Za-z0-9_]*)\./gimu,
    )].map((match) => match[1]);
    const languages = [...statement.matchAll(
      /^\s*LANGUAGE\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/gimu,
    )].map((match) => match[1].toLowerCase());
    assert.ok(createdSchemas.length <= 1, `statement ${index + 1} creates multiple function schemas`);
    assert.ok(languages.length <= 1, `statement ${index + 1} uses multiple function languages`);
    assert.deepEqual(
      {
        schemaCreate: parsedStatements[index].schemaCreate,
        languageUsage: parsedStatements[index].languageUsage,
      },
      {
        schemaCreate: createdSchemas[0] ?? null,
        languageUsage: languages[0] ?? null,
      },
      `statement ${index + 1} DDL metadata must match its executable SQL`,
    );
  });
}

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
  assert.deepEqual(
    migrationShape('0019_patient_reminder_materialization_runtime_capabilities'),
    [
      {
        owner: 'app_seam_reminder_materialization_owner',
        backfill: false,
        schemaCreate: 'app',
        languageUsage: 'plpgsql',
      },
      {
        owner: 'app_seam_reminder_materialization_owner',
        backfill: false,
        schemaCreate: 'app',
        languageUsage: 'plpgsql',
      },
      {
        owner: 'app_seam_reminder_materialization_owner',
        backfill: false,
        schemaCreate: 'app',
        languageUsage: 'sql',
      },
      {
        owner: 'app_seam_reminder_materialization_owner',
        backfill: false,
        schemaCreate: 'app',
        languageUsage: 'plpgsql',
      },
    ],
  );
});

test('every statement in reminder materialization migration keeps its owner marker first', () => {
  const tag = '0019_patient_reminder_materialization_runtime_capabilities';
  const migrationPath = path.join(repoRoot, 'apps/webapp/db/drizzle-migrations', `${tag}.sql`);
  const source = fs.readFileSync(migrationPath, 'utf8');
  const statements = source.split('--> statement-breakpoint');

  assert.equal(statements.length, 4);
  assert.equal(parseOwnerStatements(source, tag).length, 4);
  requireDerivedDdlMetadata(source, tag);

  statements.forEach((statement, index) => {
    const displaced = statement.replace(
      /^(\s*)(-- BCB-MIGRATION-OWNER:[^\n]+\n)/u,
      '$1-- marker displaced before owner\n$2',
    );
    assert.notEqual(displaced, statement, `owner marker mutation did not apply to statement ${index + 1}`);
    const mutated = statements.with(index, displaced).join('--> statement-breakpoint');
    assert.throws(
      () => parseOwnerStatements(mutated, tag),
      new RegExp(`statement ${index + 1} has neither BCB-MIGRATION-OWNER nor BCB-MIGRATION-BACKFILL`, 'u'),
    );
  });
});

test('every reminder function statement declares its exact executable language', () => {
  const tag = '0019_patient_reminder_materialization_runtime_capabilities';
  const migrationPath = path.join(repoRoot, 'apps/webapp/db/drizzle-migrations', `${tag}.sql`);
  const source = fs.readFileSync(migrationPath, 'utf8');
  const statements = source.split('--> statement-breakpoint');
  const functionStatementIndexes = statements
    .map((statement, index) => (/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+/imu.test(statement) ? index : -1))
    .filter((index) => index >= 0);

  assert.deepEqual(functionStatementIndexes, [0, 1, 2, 3]);
  functionStatementIndexes.forEach((index) => {
    const expectedLanguage = /^\s*LANGUAGE\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/imu.exec(statements[index])?.[1];
    assert.ok(expectedLanguage, `statement ${index + 1} has no executable language`);

    const withoutLanguage = statements[index].replace(
      /^\s*-- BCB-MIGRATION-LANGUAGE-USAGE:[^\n]+\n/mu,
      '',
    );
    assert.notEqual(withoutLanguage, statements[index], `language removal did not apply to statement ${index + 1}`);
    assert.throws(
      () => requireDerivedDdlMetadata(
        statements.with(index, withoutLanguage).join('--> statement-breakpoint'),
        tag,
      ),
      /DDL metadata must match its executable SQL/u,
    );

    const wrongLanguage = expectedLanguage === 'sql' ? 'plpgsql' : 'sql';
    const withWrongLanguage = statements[index].replace(
      /(-- BCB-MIGRATION-LANGUAGE-USAGE:)\s*[A-Za-z_][A-Za-z0-9_]*/u,
      `$1 ${wrongLanguage}`,
    );
    assert.notEqual(withWrongLanguage, statements[index], `language rewrite did not apply to statement ${index + 1}`);
    assert.throws(
      () => requireDerivedDdlMetadata(
        statements.with(index, withWrongLanguage).join('--> statement-breakpoint'),
        tag,
      ),
      /DDL metadata must match its executable SQL/u,
    );
  });
});
