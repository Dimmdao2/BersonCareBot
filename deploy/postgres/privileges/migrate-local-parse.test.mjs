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

function requireDerivedLanguageMetadata(source, tag) {
  const rawStatements = source.split('--> statement-breakpoint');
  const parsedStatements = parseOwnerStatements(source, tag);
  assert.equal(parsedStatements.length, rawStatements.length);

  rawStatements.forEach((statement, index) => {
    const languages = [...statement.matchAll(
      /^\s*LANGUAGE\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/gimu,
    )].map((match) => match[1].toLowerCase());
    assert.ok(languages.length <= 1, `statement ${index + 1} uses multiple function languages`);
    assert.equal(
      parsedStatements[index].languageUsage,
      languages[0] ?? null,
      `statement ${index + 1} language metadata must match its executable SQL`,
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

test('every function statement in active migrations declares its exact executable language', () => {
  let functionStatements = 0;
  for (const { tag, source } of activeMigrations) {
    const statements = source.split('--> statement-breakpoint');
    const functionStatementIndexes = statements
      .map((statement, index) => (/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+/imu.test(statement) ? index : -1))
      .filter((index) => index >= 0);
    functionStatements += functionStatementIndexes.length;

    functionStatementIndexes.forEach((index) => {
      const expectedLanguage = /^\s*LANGUAGE\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/imu.exec(statements[index])?.[1];
      assert.ok(expectedLanguage, `${tag}: statement ${index + 1} has no executable language`);
      requireDerivedLanguageMetadata(statements[index], tag);

      const withoutLanguage = statements[index].replace(
        /^\s*-- BCB-MIGRATION-LANGUAGE-USAGE:[^\n]+\n/mu,
        '',
      );
      assert.notEqual(withoutLanguage, statements[index], `${tag}: language removal did not apply to statement ${index + 1}`);
      assert.throws(
        () => requireDerivedLanguageMetadata(
          statements.with(index, withoutLanguage).join('--> statement-breakpoint'),
          tag,
        ),
        /language metadata must match its executable SQL/u,
      );

      const wrongLanguage = expectedLanguage === 'sql' ? 'plpgsql' : 'sql';
      const withWrongLanguage = statements[index].replace(
        /(-- BCB-MIGRATION-LANGUAGE-USAGE:)\s*[A-Za-z_][A-Za-z0-9_]*/u,
        `$1 ${wrongLanguage}`,
      );
      assert.notEqual(withWrongLanguage, statements[index], `${tag}: language rewrite did not apply to statement ${index + 1}`);
      assert.throws(
        () => requireDerivedLanguageMetadata(
          statements.with(index, withWrongLanguage).join('--> statement-breakpoint'),
          tag,
        ),
        /language metadata must match its executable SQL/u,
      );
    });
  }
  assert.ok(functionStatements > 0, 'active migrations must include function statements for this proof');
});
