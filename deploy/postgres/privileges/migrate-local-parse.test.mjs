import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { declaration } from './declaration.ts';
import {
  parseOwnerStatements,
  renderTemporaryMembershipAssertion,
} from './migrate-local-parse.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationRoot = path.join(repoRoot, 'apps/webapp/db/drizzle-migrations');
const activeMigrations = fs.readdirSync(migrationRoot)
  .filter((file) => /^\d{8}T\d{6}_.+\.sql$/u.test(file))
  .sort()
  .map((file) => ({
    tag: file.slice(0, -'.sql'.length),
    source: fs.readFileSync(path.join(migrationRoot, file), 'utf8'),
  }));

test('parses owner DDL and a reusable local-postgres backfill without duplicating the migration path', () => {
  const steps = parseOwnerStatements(`
-- BCB-MIGRATION-OWNER: app_probe_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.probe()
CREATE OR REPLACE FUNCTION app.probe() RETURNS integer LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
INSERT INTO public.probe(id) VALUES (1);
`, 'probe');

  assert.deepEqual(steps, [
    {
      owner: 'app_probe_owner',
      schemaCreate: 'app',
      languageUsage: 'plpgsql',
      functionRehome: 'app.probe()',
      sql: 'CREATE OR REPLACE FUNCTION app.probe() RETURNS integer LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;',
      backfill: false,
    },
    {
      owner: null,
      schemaCreate: null,
      languageUsage: null,
      functionRehome: null,
      sql: 'INSERT INTO public.probe(id) VALUES (1);',
      backfill: true,
    },
  ]);
});

test('function rehome is exact, safe, and only accompanies replacement of that function', () => {
  assert.throws(
    () => parseOwnerStatements(`
-- BCB-MIGRATION-OWNER: app_probe_owner
-- BCB-MIGRATION-REHOME-FUNCTION: app.probe(); DROP TABLE public.users
CREATE OR REPLACE FUNCTION app.probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
`, 'unsafe-rehome'),
    /unsafe function rehome identity/u,
  );
  assert.throws(
    () => parseOwnerStatements(`
-- BCB-MIGRATION-OWNER: app_probe_owner
-- BCB-MIGRATION-REHOME-FUNCTION: app.other()
CREATE OR REPLACE FUNCTION app.probe() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
`, 'wrong-rehome'),
    /does not replace that function/u,
  );
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

test('every active timestamp migration parses and names a declared owner role', () => {
  assert.ok(activeMigrations.length > 0, 'the active migration folder must not be empty');
  // Сам разбор и есть гейт: `parseOwnerStatements` бросает на любой статье без владельца и
  // BACKFILL-метки, поэтому непрошедшая миграция роняет тест прямо здесь, называя тег и номер статьи.
  const parsedByTag = new Map(
    activeMigrations.map(({ tag, source }) => [tag, parseOwnerStatements(source, tag)]),
  );

  // Здесь раньше лежала пофайловая опись статей четырёх конкретных миграций. Она замораживала ФОРМУ
  // этих файлов и покраснела 19.08, когда из миграций законно вычистили выдачу прав, — при этом не
  // проверяя ничего сверх разбора выше. Вместо неё — именная проверка, которая не двигается от
  // законной работы: владелец, назначенный миграцией, обязан быть ролью, объявленной в кластере.
  // Иначе тело приезжает в живую базу на роль, которой там нет, и узнаётся это только на деплое.
  assert.deepEqual(
    [...parsedByTag].flatMap(([tag, statements]) => statements
      .filter((statement) => statement.owner && !declaration.cluster.roles[statement.owner])
      .map((statement) => `${tag}: ${statement.owner}`)),
    [],
    'migration owners that the cluster declaration never declares as a role',
  );
});

test('every active migration statement keeps its owner or backfill marker first', () => {
  for (const { tag, source } of activeMigrations) {
    const statements = source.split('--> statement-breakpoint');

    // Разбор обязан увидеть КАЖДУЮ статью файла: проглоченная статья уезжает в базу без владельца.
    assert.equal(parseOwnerStatements(source, tag).length, statements.length, tag);
    statements.forEach((statement, index) => {
      const displaced = statement.replace(
        /^(\s*)(-- BCB-MIGRATION-(?:OWNER:[^\n]+|BACKFILL)\n)/u,
        '$1-- marker displaced before owner/backfill\n$2',
      );
      assert.notEqual(displaced, statement, `${tag}: marker mutation did not apply to statement ${index + 1}`);
      const mutated = statements.with(index, displaced).join('--> statement-breakpoint');
      assert.throws(
        () => parseOwnerStatements(mutated, tag),
        new RegExp(`statement ${index + 1} has neither BCB-MIGRATION-OWNER nor BCB-MIGRATION-BACKFILL`, 'u'),
      );
    });
  }
});
