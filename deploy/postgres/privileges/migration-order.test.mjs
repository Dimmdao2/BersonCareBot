import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  collectExpectedObjects,
  findForeignLedgerRows,
  readLegacyJournalEntries,
  readMigrationFolder,
  renderLedgerBootstrapSql,
  renderObjectPresenceSql,
  selectPendingMigrations,
  splitStatements,
} from './migration-order.mjs';

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
