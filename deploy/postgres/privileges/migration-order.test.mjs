import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  collectExpectedObjects,
  collectMigrationProofs,
  findForeignLedgerRows,
  findUnprovedMigrations,
  interpretProofAnswers,
  journalDigest,
  readLegacyJournalEntries,
  readMigrationFolder,
  readVerifyProbes,
  renderLedgerBootstrapSql,
  renderObjectPresenceSql,
  renderProofSql,
  selectPendingMigrations,
  splitStatements,
} from './migration-order.mjs';

function folderWith(files, journalEntries = null, pin = undefined) {
  const root = mkdtempSync(join(tmpdir(), 'bcb-migration-order-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
  if (journalEntries) {
    mkdirSync(join(root, 'meta'), { recursive: true });
    writeFileSync(join(root, 'meta/_journal.json'), JSON.stringify({ entries: journalEntries }));
    if (pin !== null) {
      writeFileSync(join(root, 'meta/_journal.frozen'), `${pin ?? journalDigest(journalEntries)}\n`);
    }
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

// ── Rule 3: every migration owes the database a proof it ran ───────────────────────────────────

test('a VERIFY probe is read from the leading comment block and nowhere else', () => {
  const source = [
    '-- BCB-MIGRATION-OWNER: app_probe_owner',
    '-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM app.doors)',
    '',
    'CREATE FUNCTION app.door() RETURNS text LANGUAGE sql AS $$',
    "  SELECT '-- BCB-MIGRATION-VERIFY: SELECT false'",
    '$$;',
  ].join('\n');

  assert.deepEqual(readVerifyProbes(source), ['SELECT EXISTS (SELECT 1 FROM app.doors)']);
});

test('a VERIFY probe that is not one plain SELECT is refused', () => {
  for (const bad of [
    'DELETE FROM app.doors',
    'SELECT 1; DROP TABLE app.doors',
    'SELECT 1) -- and the rest of the statement',
  ]) {
    assert.throws(
      () => readVerifyProbes(`-- BCB-MIGRATION-VERIFY: ${bad}\n`),
      /BCB-MIGRATION-VERIFY/u,
      `accepted: ${bad}`,
    );
  }
});

test('a migration that leaves no nameable object and no VERIFY proves nothing', () => {
  const backfill = { tag: '0001_backfill', source: '-- BCB-MIGRATION-BACKFILL\nUPDATE app.doors SET code = 1;\n' };
  assert.deepEqual(findUnprovedMigrations([backfill]), ['0001_backfill']);

  const proved = {
    tag: '0001_backfill',
    source: [
      '-- BCB-MIGRATION-BACKFILL',
      '-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM app.doors WHERE code = 1)',
      'UPDATE app.doors SET code = 1;',
      '',
    ].join('\n'),
  };
  assert.deepEqual(findUnprovedMigrations([proved]), []);
  assert.deepEqual(collectMigrationProofs([proved]).map((proof) => proof.kind), ['verify']);
});

test('a migration whose only object a later one replaces still owes its own proof', () => {
  // This is the real eight: the object is credited to whichever migration touched it last, so the
  // earlier one is left promising nothing at all.
  const first = migration('0001_first', 'CREATE OR REPLACE FUNCTION app.door() RETURNS void LANGUAGE sql AS $$ SELECT $$;');
  const second = migration('0002_second', 'CREATE OR REPLACE FUNCTION app.door() RETURNS void LANGUAGE sql AS $$ SELECT $$;');

  assert.deepEqual(findUnprovedMigrations([first, second]), ['0001_first']);
});

test('every proof gets its own indexed probe row, objects and VERIFY alike', () => {
  const proofs = collectMigrationProofs([
    migration('0001_create', 'CREATE OR REPLACE FUNCTION app.door() RETURNS void LANGUAGE sql AS $$ SELECT $$;'),
    {
      tag: '0002_backfill',
      source: '-- BCB-MIGRATION-BACKFILL\n-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM app.doors)\nUPDATE app.doors SET code = 1;\n',
    },
  ]);

  const sql = renderProofSql(proofs);
  assert.match(sql, /SELECT 0 AS at, \(SELECT EXISTS \(SELECT 1 FROM pg_catalog\.pg_proc/u);
  assert.match(sql, /SELECT 1 AS at, \(SELECT EXISTS \(SELECT 1 FROM app\.doors\)\) AS present/u);
  assert.equal(renderProofSql([]), null);
});

test('probe answers are matched by the index they carry, never by arrival order', () => {
  const proofs = [
    { kind: 'verify', tag: '0001_a', probe: 'SELECT true' },
    { kind: 'verify', tag: '0002_b', probe: 'SELECT true' },
    { kind: 'verify', tag: '0003_c', probe: 'SELECT true' },
  ];

  const unmet = interpretProofAnswers(proofs, [
    { at: 2, present: true },
    { at: 0, present: false },
    { at: 1, present: true },
  ]);

  assert.deepEqual(unmet.map((proof) => proof.tag), ['0001_a']);
});

test('a short, doubled or unknown probe answer is a refusal, not a default', () => {
  const proofs = [
    { kind: 'verify', tag: '0001_a', probe: 'SELECT true' },
    { kind: 'verify', tag: '0002_b', probe: 'SELECT true' },
  ];

  assert.throws(() => interpretProofAnswers(proofs, [{ at: 0, present: true }]), /answered for 1 of 2 proofs/u);
  assert.throws(
    () => interpretProofAnswers(proofs, [{ at: 0, present: true }, { at: 0, present: true }]),
    /answered twice for index 0/u,
  );
  assert.throws(
    () => interpretProofAnswers(proofs, [{ at: 0, present: true }, { at: 7, present: true }]),
    /unknown index 7/u,
  );
});

// ── The historical map is frozen, and the pin is what freezes it ───────────────────────────────

test('the historical map is read only when it digests to its pin', () => {
  const entries = [{ idx: 0, when: 1800000000100, tag: '0001_first' }];
  const folder = folderWith({ '0001_first.sql': 'SELECT 1;' }, entries);

  assert.deepEqual(readLegacyJournalEntries(folder), entries);
});

test('one appended historical entry is refused, so it cannot rename a foreign ledger row', () => {
  const entries = [{ idx: 0, when: 1800000000100, tag: '0001_first' }];
  const folder = folderWith({ '0001_first.sql': 'SELECT 1;' }, entries);
  writeFileSync(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({ entries: [...entries, { idx: 1, when: 1800000000200, tag: '0002_never_executed' }] }),
  );

  assert.throws(() => readLegacyJournalEntries(folder), /is not the frozen one/u);
});

test('a historical map with no pin is refused rather than trusted', () => {
  const folder = folderWith(
    { '0001_first.sql': 'SELECT 1;' },
    [{ idx: 0, when: 1800000000100, tag: '0001_first' }],
    null,
  );

  assert.throws(() => readLegacyJournalEntries(folder), /has no freeze pin next to it/u);
});

test('a folder that no longer carries a historical map needs no pin', () => {
  assert.deepEqual(readLegacyJournalEntries(folderWith({ '0001_first.sql': 'SELECT 1;' })), []);
});
