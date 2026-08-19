import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

import {
  collectExpectedObjects,
  findForeignLedgerRows,
  findJournalGrowth,
  findMigrationNameViolations,
  findRenamedAppliedMigrations,
  readFrozenLegacyMigrationNames,
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

function folderWith(files, journalEntries = null, frozenEntries = null) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migration-order-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
  if (journalEntries) {
    mkdirSync(join(root, 'meta'), { recursive: true });
    writeFileSync(join(root, 'meta/_journal.json'), JSON.stringify({ entries: journalEntries }));
  }
  if (frozenEntries) {
    mkdirSync(join(root, 'meta'), { recursive: true });
    writeFileSync(join(root, 'meta/_journal.frozen.json'), JSON.stringify({ entries: frozenEntries }));
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

// A new migration's name is a timestamp; only tags the frozen journal already knows keep the old
// sequential shape, and that set can never grow, so this tightens on its own as work adds files.
test('a timestamp name passes, a fresh sequential number does not, a legacy one does', () => {
  const legacy = [{ tag: '0001_first' }];
  const migrations = [
    migration('0001_first'), // legacy, in the journal
    migration('20260820T014233_new_work'), // new, timestamp-shaped
    migration('0050_hand_picked'), // new, but still the old shape -> collision-prone
  ];

  assert.deepEqual(findMigrationNameViolations(migrations, legacy), ['0050_hand_picked']);
});

test('a frozen snapshot missing entirely grandfathers nothing, unlike a missing live journal', () => {
  const folder = folderWith({ '0001_first.sql': 'SELECT 1;' });
  assert.deepEqual(readFrozenLegacyMigrationNames(folder), []);
});

test('the frozen snapshot is read, not the live journal, for the legacy-name allowlist', () => {
  const folder = folderWith(
    { '0001_first.sql': 'SELECT 1;' },
    [{ idx: 0, when: 1, tag: '0001_first' }], // live journal grew this entry
    [], // frozen snapshot never heard of it
  );
  assert.deepEqual(
    findMigrationNameViolations(readMigrationFolder(folder), readFrozenLegacyMigrationNames(folder)),
    ['0001_first'],
  );
});

// F2 (MIGRATION_TIMESTAMP_NAMES_AUDIT_2026-08-20.md §5): on 19/20.08 a branch added a 51st entry to
// the live journal to relabel its own hand-numbered migration as legacy, and `pnpm run lint` — which
// checked the live journal against itself — passed. `findJournalGrowth` names the grown tag directly,
// independent of whether any .sql file currently claims it.
test('a tag the live journal knows and the frozen snapshot does not is journal growth', () => {
  const frozen = [{ idx: 0, when: 1, tag: '0001_first' }];
  const grown = [...frozen, { idx: 1, when: 2, tag: '0054_snuck_in_as_legacy' }];

  assert.deepEqual(findJournalGrowth(grown, frozen), ['0054_snuck_in_as_legacy']);
});

test('a live journal identical to the frozen snapshot is not growth', () => {
  const entries = [{ idx: 0, when: 1, tag: '0001_first' }, { idx: 1, when: 2, tag: '0002_second' }];
  assert.deepEqual(findJournalGrowth(entries, entries), []);
});

test('a bare number, a missing slug or an out-of-range clock field is not a timestamp name', () => {
  for (const tag of ['20260820_missing_time', '2026082T014233_short_date', '20260820T014233', '20260820T0142_short_time']) {
    assert.deepEqual(findMigrationNameViolations([migration(tag)], []), [tag], tag);
  }
});

// This is the fact the naming change rests on: legacy '0001'.. sorts before every timestamp name,
// because '0' < '2' — checked here against the sort the runners actually use, on the real folder,
// not assumed from reading the regex.
test('every real legacy migration name sorts before a 2026 timestamp name, by the sort runners use', () => {
  const legacy = readMigrationFolder(REAL_MIGRATIONS_FOLDER).map((entry) => entry.tag);
  assert.ok(legacy.length > 0, 'the real migrations folder must not be empty for this to prove anything');
  const sorted = [...legacy, '20260820T014233_after_everything_legacy'].sort();
  assert.deepEqual(sorted.slice(-1), ['20260820T014233_after_everything_legacy']);
  assert.deepEqual(sorted.slice(0, legacy.length), [...legacy].sort());
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
