import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

import { declaration } from './declaration.ts';
import {
  collectExpectedObjects,
  findForeignLedgerRows,
  findMigrationNameViolations,
  findMigrationStaticViolations,
  findRenamedAppliedMigrations,
  readLegacyJournalEntries,
  readMigrationFolder,
  renderLedgerBootstrapSql,
  renderObjectPresenceSql,
  selectPendingMigrations,
  splitStatements,
} from './migration-order.mjs';

const REAL_MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../apps/webapp/db/drizzle-migrations', import.meta.url),
);

function folderWith(files, journalEntries = null) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migration-order-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
  if (journalEntries) {
    mkdirSync(join(root, 'meta'), { recursive: true });
    writeFileSync(join(root, 'meta/_journal.json'), JSON.stringify({ entries: journalEntries }));
  }
  return root;
}

function migration(tag, sql) {
  return { tag, source: `-- BCB-MIGRATION-OWNER: app_probe_owner\n${sql}\n` };
}

test('the folder listing is the order, and meta/ is not part of it', () => {
  const folder = folderWith(
    {
      '0002_second.sql': 'SELECT 2;',
      '0001_first.sql': 'SELECT 1;',
      '0001a_between.sql': 'SELECT 1.5;',
      'notes.txt': 'ignored',
    },
    [{ idx: 0, when: 1, tag: '0001_first' }],
  );

  assert.deepEqual(
    readMigrationFolder(folder).map((entry) => entry.tag),
    ['0001_first', '0001a_between', '0002_second'],
  );
});

// This is the whole point of the change: under the previous `when > max(created_at)` rule a
// migration arriving from a branch with a lower name was never pending again, and every run kept
// reporting "already current" over a schema that did not have it.
test('a migration named below everything applied is ordinary pending work', () => {
  const migrations = [migration('0001_first'), migration('0001a_late_arrival'), migration('0002_second')];

  const pending = selectPendingMigrations(migrations, [{ tag: '0001_first' }, { tag: '0002_second' }]);

  assert.deepEqual(pending.map((entry) => entry.tag), ['0001a_late_arrival']);
});

test('an applied migration is never selected again, whatever its name', () => {
  const migrations = [migration('0001_first'), migration('0002_second')];

  assert.equal(selectPendingMigrations(migrations, [{ tag: '0002_second' }, { tag: '0001_first' }]).length, 0);
});

test('a ledger row this checkout cannot name is counted, not silently ignored', () => {
  const rows = [{ tag: '0001_first' }, { tag: '0009_from_another_branch' }, { tag: null }];

  assert.deepEqual(
    findForeignLedgerRows([migration('0001_first')], rows).map((row) => row.tag),
    ['0009_from_another_branch', null],
  );
});

test('the ledger bootstrap asks the catalog before every DDL step', () => {
  const sql = renderLedgerBootstrapSql([{ when: 17, tag: '0001_first' }]);

  assert.match(sql, /IF to_regnamespace\('drizzle'\) IS NULL THEN\n\s+CREATE SCHEMA drizzle;/u);
  assert.match(sql, /ADD COLUMN tag text;/u);
  assert.match(sql, /VALUES \(17::bigint, '0001_first'\)/u);
  assert.match(sql, /CREATE UNIQUE INDEX drizzle_migrations_tag_key/u);
  // A no-op `ADD COLUMN IF NOT EXISTS` still demands ownership of the table, so it must not appear.
  assert.doesNotMatch(sql, /(?:ADD COLUMN|CREATE (?:SCHEMA|TABLE|UNIQUE INDEX))[^\n]*IF NOT EXISTS/iu);
});

test('a folder without the historical journal still bootstraps', () => {
  const folder = folderWith({ '0001_first.sql': 'SELECT 1;' });

  assert.deepEqual(readLegacyJournalEntries(folder), []);
  assert.doesNotMatch(renderLedgerBootstrapSql(readLegacyJournalEntries(folder)), /UPDATE/u);
});

test('statements split on the Drizzle breakpoint', () => {
  assert.deepEqual(splitStatements('SELECT 1;\n--> statement-breakpoint\nSELECT 2;\n'), ['SELECT 1;', 'SELECT 2;']);
});

// The expectation set is what the applied migrations promise the catalog still holds.
test('created objects are collected and later removals take them back out', () => {
  const objects = collectExpectedObjects([
    migration('0001_create', [
      'CREATE OR REPLACE FUNCTION app.door(arg text) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;',
      '--> statement-breakpoint',
      '-- BCB-MIGRATION-OWNER: app_probe_owner',
      'CREATE TABLE public.kept (id integer);',
      '--> statement-breakpoint',
      '-- BCB-MIGRATION-OWNER: app_probe_owner',
      'CREATE TABLE public.doomed (id integer);',
      '--> statement-breakpoint',
      '-- BCB-MIGRATION-OWNER: app_probe_owner',
      'CREATE UNIQUE INDEX doomed_id_key ON public.doomed (id);',
      '--> statement-breakpoint',
      '-- BCB-MIGRATION-OWNER: app_probe_owner',
      'ALTER TABLE public.kept ADD COLUMN note text, ADD CONSTRAINT kept_note_check CHECK (note <> \'\');',
    ].join('\n')),
    migration('0002_remove', [
      'DROP TABLE public.doomed;',
      '--> statement-breakpoint',
      '-- BCB-MIGRATION-OWNER: app_probe_owner',
      'ALTER TABLE public.kept DROP CONSTRAINT kept_note_check;',
    ].join('\n')),
  ]);

  assert.deepEqual(
    objects.map((object) => `${object.kind}:${object.schema ?? ''}.${object.name}`).sort(),
    ['column:.note', 'function:app.door', 'table:public.kept'],
  );
});

// A function body routinely contains the words CREATE, DROP and TABLE. Statements are already split
// on the breakpoint, so only the head of each is read — never the body.
test('the body of a function is not read as a declaration', () => {
  const objects = collectExpectedObjects([
    migration('0001_body', [
      'CREATE OR REPLACE FUNCTION app.door() RETURNS void LANGUAGE plpgsql AS $$',
      'BEGIN',
      '  CREATE TEMP TABLE scratch (id integer);',
      '  DROP TABLE scratch;',
      'END;',
      '$$;',
    ].join('\n')),
  ]);

  assert.deepEqual(objects.map((object) => object.name), ['door']);
});

test('a rename retires every expectation for the relation it touches', () => {
  const objects = collectExpectedObjects([
    migration('0001_create', 'ALTER TABLE public.thing ADD COLUMN note text;'),
    migration('0002_rename', 'ALTER TABLE public.thing RENAME COLUMN note TO remark;'),
  ]);

  assert.deepEqual(objects, []);
});

test('every expected object gets one positional catalog probe', () => {
  const objects = collectExpectedObjects([
    migration('0001_create', 'CREATE OR REPLACE FUNCTION app.door() RETURNS void LANGUAGE sql AS $$ SELECT $$;'),
  ]);

  const sql = renderObjectPresenceSql(objects);
  assert.match(sql, /SELECT 0 AS at, \(SELECT EXISTS \(SELECT 1 FROM pg_catalog\.pg_proc/u);
  assert.match(sql, /p\.proname = 'door'/u);
  assert.match(sql, /n\.nspname = 'app'/u);
  assert.equal(renderObjectPresenceSql([]), null);
});

// Every migration name is a timestamp. The retired journal and allowlist cannot create exceptions.
test('a timestamp name passes and every sequential name fails', () => {
  const migrations = [
    migration('0001_first'),
    migration('20260820T014233_new_work'), // new, timestamp-shaped
    migration('0050_hand_picked'),
  ];

  assert.deepEqual(findMigrationNameViolations(migrations), ['0001_first', '0050_hand_picked']);
});

test('a matching live journal entry does not exempt a sequential migration name', () => {
  const folder = folderWith(
    { '0001_first.sql': 'SELECT 1;' },
    [{ idx: 0, when: 1, tag: '0001_first' }],
  );
  assert.deepEqual(findMigrationNameViolations(readMigrationFolder(folder)), ['0001_first']);
});

test('a bare number, a missing slug or an out-of-range clock field is not a timestamp name', () => {
  for (const tag of ['20260820_missing_time', '2026082T014233_short_date', '20260820T014233', '20260820T0142_short_time']) {
    assert.deepEqual(findMigrationNameViolations([migration(tag)]), [tag], tag);
  }
});

// The historical files and their allowlist are retired. The real folder therefore has no
// grandfathered names: every active file must satisfy the timestamp rule on its own.
test('every real migration has a timestamp name without a legacy allowlist', () => {
  const migrations = readMigrationFolder(REAL_MIGRATIONS_FOLDER);
  assert.ok(migrations.length > 0, 'the real migrations folder must not be empty for this to prove anything');
  assert.deepEqual(findMigrationNameViolations(migrations), []);
});

test('static gate names missing headers and the forbidden postgres owner by statement', () => {
  const source = [
    'SELECT 1;',
    '--> statement-breakpoint',
    '-- BCB-MIGRATION-OWNER: postgres',
    'SELECT 2;',
  ].join('\n');
  const violations = findMigrationStaticViolations(
    [{ tag: '20260820T014233_bad_headers', source, path: '/repo/bad_headers.sql' }],
    new Set(),
  );

  assert.deepEqual(violations.map(({ statementIndex, reason }) => ({ statementIndex, reason })), [
    {
      statementIndex: 1,
      reason: 'statement has no valid BCB-MIGRATION-OWNER or BCB-MIGRATION-BACKFILL header',
    },
    { statementIndex: 2, reason: 'BCB-MIGRATION-OWNER postgres is forbidden' },
  ]);
});

test('static gate rejects every forbidden access statement family by file and statement', () => {
  const forbidden = [
    ['GRA', 'NT SELECT ON public.sample TO app_staff'],
    ['REV', 'OKE SELECT ON public.sample FROM app_staff'],
    ['CREATE', ' ROLE sample_owner'],
    ['ALTER', ' ROLE sample_owner NOLOGIN'],
    ['ALTER DEFAULT', ' PRIVILEGES FOR ROLE sample_owner'],
    ['CREATE', ' POLICY sample_policy ON public.sample USING (true)'],
    ['ALTER', ' POLICY sample_policy ON public.sample USING (false)'],
  ];
  const source = forbidden.map((parts) => [
    '-- BCB-MIGRATION-OWNER: app_object_owner',
    `${parts.join('')};`,
  ].join('\n')).join('\n--> statement-breakpoint\n');
  const violations = findMigrationStaticViolations(
    [{ tag: '20260820T014233_bad_access', source, path: '/repo/bad_access.sql' }],
    new Set(['public.sample']),
  );

  assert.equal(violations.length, forbidden.length);
  assert.deepEqual(violations.map((violation) => violation.statementIndex), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(violations.every((violation) => violation.file === '/repo/bad_access.sql'));
});

test('static gate rejects a guarded CREATE TABLE absent from the declaration', () => {
  const violations = findMigrationStaticViolations([
    migration('20260820T014233_undeclared', 'CREATE TABLE integrator.not_declared (id integer);'),
  ], new Set(['integrator.declared']));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].statementIndex, 1);
  assert.match(violations[0].reason, /integrator\.not_declared.*absent/u);
});

test('static gate keeps the existing timestamp-name check in the same result', () => {
  const violations = findMigrationStaticViolations([
    migration('0050_bad_name', 'SELECT 1;'),
  ], new Set());

  assert.equal(violations.length, 1);
  assert.equal(violations[0].statementIndex, 0);
  assert.match(violations[0].reason, /file name/u);
});

test('all 16 real migrations pass the declaration-derived static acceptance gate', () => {
  const migrations = readMigrationFolder(REAL_MIGRATIONS_FOLDER);
  const declaredRelations = new Set([
    ...Object.keys(declaration.databases.bcb_webapp_dev.tables),
    ...Object.keys(declaration.portContext?.privateRelations ?? {}),
  ]);

  assert.equal(migrations.length, 16);
  assert.deepEqual(findMigrationStaticViolations(migrations, declaredRelations), []);
});

test('a pending file byte-identical to a foreign ledger row is a rename of an applied migration', () => {
  const pending = [{ tag: '20260820T014233_renamed', hash: 'same-content-hash' }];
  const foreign = findForeignLedgerRows(
    [],
    [{ tag: '0009_old_name', hash: 'same-content-hash', createdAt: 1800000009000 }],
  );

  const renamed = findRenamedAppliedMigrations(pending, foreign);

  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].migration.tag, '20260820T014233_renamed');
  assert.equal(renamed[0].row.tag, '0009_old_name');
});

test('a pending file with genuinely new content is not flagged as a rename', () => {
  const pending = [{ tag: '20260820T014233_new_work', hash: 'brand-new-hash' }];
  const foreign = findForeignLedgerRows([], [{ tag: '0009_old_name', hash: 'unrelated-hash' }]);

  assert.deepEqual(findRenamedAppliedMigrations(pending, foreign), []);
});
