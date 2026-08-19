/**
 * The order of webapp migrations, and the proof that an applied one is really in the database.
 *
 * Three rules live here, and only here, so every runner (`migrate-local.mjs` for DEV/TEST/PROD,
 * `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` for the local/template path) reads the same
 * copy:
 *
 *   1. ORDER IS THE FILE NAME.  `db/drizzle-migrations/*.sql` sorted by name, nothing else.  There is
 *      no second place that says which migration comes first, so a merge cannot make two places
 *      disagree.
 *   2. APPLIED IS "THE LEDGER NAMES IT".  Pending is every file whose tag has no ledger row — never
 *      "every file above the highest applied timestamp".  A watermark makes a skip permanent and
 *      silent: a migration that lands below it is never pending again and the runner keeps printing
 *      "already current" over a hole in the schema.
 *   3. EVERY MIGRATION OWES A PROOF.  Before anything is applied, every applied migration has to
 *      answer for itself: with an object it still owns in the catalog, or — when it creates no
 *      object the classifier can name — with an explicit `-- BCB-MIGRATION-VERIFY: SELECT …` probe
 *      in its header.  Rule 2 alone made "applied" a claim anybody could type into the ledger for
 *      the migrations that promise nothing; rule 3 is what makes the claim answerable for all of
 *      them, not only for the ones that happen to create a function.
 *
 * `meta/_journal.json` is no longer read for order.  It survives as the frozen historical
 * `when -> tag` map used once per database to label ledger rows written before the tag column
 * existed, and "frozen" is enforced, not asked for: `meta/_journal.frozen` pins its digest, because
 * one appended line hands another branch's ledger row the name of a migration nobody ran.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseOwnerStatements } from './migrate-local-parse.mjs';

/** Reads the folder in file-name order. The journal is deliberately not consulted. */
export function readMigrationFolder(folder) {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name.slice(0, -'.sql'.length))
    .sort()
    .map((tag) => {
      const path = resolve(folder, `${tag}.sql`);
      const source = readFileSync(path, 'utf8');
      return { tag, path, source, hash: createHash('sha256').update(source).digest('hex') };
    });
}

/**
 * Pending = no ledger row carries this tag.  Order = file name.  A migration that arrives from a
 * branch with a name BELOW everything already applied is therefore ordinary pending work, not a
 * permanent hole.
 */
export function selectPendingMigrations(migrations, ledgerRows) {
  const applied = new Set(ledgerRows.map((row) => row.tag).filter(Boolean));
  return migrations.filter((migration) => !applied.has(migration.tag));
}

/**
 * Ledger rows this checkout cannot account for: applied under a name it does not carry, or written
 * before names existed and never matched by the legacy journal map.  They are another branch's
 * work, not a hole — but they are counted out loud, because a row nobody can name is how the
 * previous scheme hid its holes.
 */
export function findForeignLedgerRows(migrations, ledgerRows) {
  const known = new Set(migrations.map((migration) => migration.tag));
  return ledgerRows.filter((row) => !row.tag || !known.has(row.tag));
}

/** Statements as the folder writes them: one chunk per Drizzle breakpoint, comments kept. */
export function splitStatements(source) {
  return source.split('--> statement-breakpoint').map((chunk) => chunk.trim()).filter(Boolean);
}

/**
 * Everything the ledger needs before it can answer by name, idempotent on every database.
 *
 * `tag` carries the identity; `created_at` stays only as the order of application.  Legacy rows are
 * labelled once from the frozen historical `when -> tag` map, which is the last job
 * `meta/_journal.json` has.  The partial unique index makes a second row for one migration
 * impossible to store, so "applied twice" cannot be represented, only refused.
 */
export function renderLedgerBootstrapSql(legacyEntries) {
  const legacy = (legacyEntries ?? []).filter(
    (entry) => Number.isSafeInteger(entry?.when) && typeof entry?.tag === 'string',
  );
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const legacyValues = legacy.map((entry) => `(${entry.when}::bigint, ${quote(entry.tag)})`).join(', ');
  // Every step asks the catalog first, so a caller that is not the table's owner runs no DDL at all
  // on an already-prepared database instead of failing on a no-op `ADD COLUMN IF NOT EXISTS`.
  return `DO $bcb_ledger$
BEGIN
  IF to_regnamespace('drizzle') IS NULL THEN
    CREATE SCHEMA drizzle;
  END IF;
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
     WHERE attrelid = 'drizzle.__drizzle_migrations'::regclass AND attname = 'tag' AND NOT attisdropped
  ) THEN
    ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN tag text;
  END IF;
${legacy.length === 0 ? '' : `  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations AS ledger
     WHERE ledger.tag IS NULL
       AND ledger.created_at IN (${legacy.map((entry) => `${entry.when}::bigint`).join(', ')})
  ) THEN
    UPDATE drizzle.__drizzle_migrations AS ledger SET tag = legacy.tag
      FROM (VALUES ${legacyValues}) AS legacy (created_at, tag)
     WHERE ledger.tag IS NULL AND ledger.created_at = legacy.created_at;
  END IF;
`}  IF to_regclass('drizzle.drizzle_migrations_tag_key') IS NULL THEN
    CREATE UNIQUE INDEX drizzle_migrations_tag_key
      ON drizzle.__drizzle_migrations (tag) WHERE tag IS NOT NULL;
  END IF;
END
$bcb_ledger$;`;
}

/**
 * The digest `meta/_journal.frozen` pins.  Only `when` and `tag` go into it: those two fields are the
 * whole of the map's remaining job, and the rest of the file (idx, version, breakpoints) is Drizzle
 * bookkeeping nobody reads any more.
 */
export function journalDigest(entries) {
  const canonical = (entries ?? [])
    .map((entry) => `${entry?.when}\t${entry?.tag}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * The frozen historical `when -> tag` map, or an empty one when the folder no longer carries it.
 *
 * The map hands a name to a ledger row that has none, so appending one line to it is enough to make
 * a row somebody else's migration wrote answer to the name of a migration that never ran — the
 * whole forgery costs one line and leaves no other trace.  So the map is pinned: `meta/_journal.frozen`
 * carries its digest, both runners refuse a mismatch, and a merge that genuinely has to extend the
 * map must move the pin in the same commit, where a reviewer sees it.
 */
export function readLegacyJournalEntries(folder) {
  const path = resolve(folder, 'meta', '_journal.json');
  if (!existsSync(path)) return [];
  const entries = JSON.parse(readFileSync(path, 'utf8')).entries ?? [];
  const pinPath = resolve(folder, 'meta', '_journal.frozen');
  const digest = journalDigest(entries);
  if (!existsSync(pinPath)) {
    throw new Error(
      `the historical migration map ${path} has no freeze pin next to it; write its digest ${digest} `
        + 'to meta/_journal.frozen in the same commit, or delete the map — an unpinned map can be '
        + "extended by one line to give another branch's ledger row the name of a migration nobody ran",
    );
  }
  const pinned = readFileSync(pinPath, 'utf8').trim();
  if (pinned !== digest) {
    throw new Error(
      `the historical migration map ${path} is not the frozen one: it digests to ${digest}, `
        + `meta/_journal.frozen pins ${pinned || '(empty)'}. The map does not order anything and is not `
        + 'hand-edited; if a merge really has to extend it, move the pin in the same commit.',
    );
  }
  return entries;
}

const QUALIFIED = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))?`;
const NAME = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const IF_NOT_EXISTS = String.raw`(?:IF\s+NOT\s+EXISTS\s+)?`;
const IF_EXISTS = String.raw`(?:IF\s+EXISTS\s+)?`;

function unquote(part) {
  return part.startsWith('"') ? part.slice(1, -1) : part.toLowerCase();
}

/** `schema.name` -> {schema, name}; a bare name means the migration relied on search_path. */
function splitQualified(raw) {
  const parts = raw.match(/"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*/gu) ?? [];
  if (parts.length === 2) return { schema: unquote(parts[0]), name: unquote(parts[1]) };
  return { schema: null, name: unquote(parts[0] ?? '') };
}

function objectKey(object) {
  const relation = object.relation ? `${object.relation.schema ?? '*'}.${object.relation.name}` : null;
  return [object.kind, relation, `${object.schema ?? '*'}.${object.name}`].filter(Boolean).join(' ');
}

/**
 * Objects a statement declares or removes.  Only the HEAD of each statement is matched: statements
 * are already split on `--> statement-breakpoint`, so a `CREATE FUNCTION` body — which routinely
 * contains the words CREATE, DROP and TABLE — is never read as a declaration of its own.
 */
function classifyStatement(sql) {
  const head = sql.replace(/^(?:\s|--[^\n]*\n)+/u, '');
  const rules = [
    // created
    [new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${IF_NOT_EXISTS}(${QUALIFIED})\\s*\\(`, 'iu'),
      (m) => [{ effect: 'create', kind: 'function', ...splitQualified(m[1]) }]],
    [new RegExp(`^CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+${IF_NOT_EXISTS}(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'create', kind: 'table', ...splitQualified(m[1]) }]],
    [new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+${IF_NOT_EXISTS}(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'create', kind: 'view', ...splitQualified(m[1]) }]],
    [new RegExp(`^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?${IF_NOT_EXISTS}(${NAME})\\s+ON\\s+(?:ONLY\\s+)?(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'create', kind: 'index', ...splitQualified(m[1]), relation: splitQualified(m[2]) }]],
    [new RegExp(`^CREATE\\s+TYPE\\s+(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'create', kind: 'type', ...splitQualified(m[1]) }]],
    [new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+(${NAME})[\\s\\S]*?\\sON\\s+(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'create', kind: 'trigger', ...splitQualified(m[1]), relation: splitQualified(m[2]) }]],
    // dropped
    [new RegExp(`^DROP\\s+FUNCTION\\s+${IF_EXISTS}(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'drop', kind: 'function', ...splitQualified(m[1]) }]],
    [new RegExp(`^DROP\\s+TABLE\\s+${IF_EXISTS}(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'drop-relation', kind: 'table', ...splitQualified(m[1]) }]],
    [new RegExp(`^DROP\\s+(?:MATERIALIZED\\s+)?VIEW\\s+${IF_EXISTS}(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'drop-relation', kind: 'view', ...splitQualified(m[1]) }]],
    [new RegExp(`^DROP\\s+INDEX\\s+(?:CONCURRENTLY\\s+)?${IF_EXISTS}(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'drop-named', kind: 'index', ...splitQualified(m[1]) }]],
    [new RegExp(`^DROP\\s+TYPE\\s+${IF_EXISTS}(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'drop', kind: 'type', ...splitQualified(m[1]) }]],
    [new RegExp(`^DROP\\s+TRIGGER\\s+${IF_EXISTS}(${NAME})\\s+ON\\s+(${QUALIFIED})`, 'iu'),
      (m) => [{ effect: 'drop', kind: 'trigger', ...splitQualified(m[1]), relation: splitQualified(m[2]) }]],
  ];
  for (const [pattern, build] of rules) {
    const match = pattern.exec(head);
    if (match) return build(match);
  }
  const alter = new RegExp(`^ALTER\\s+TABLE\\s+${IF_EXISTS}(?:ONLY\\s+)?(${QUALIFIED})\\s+([\\s\\S]*)$`, 'iu').exec(head);
  if (!alter) return [];
  const relation = splitQualified(alter[1]);
  // A rename makes every earlier name for this relation unverifiable; forget the whole relation
  // rather than demand an object under a name the migration itself retired.
  if (/(?:^|\s)RENAME\s/iu.test(alter[2])) return [{ effect: 'forget-relation', relation }];
  const effects = [];
  for (const clause of alter[2].split(',')) {
    const added = new RegExp(`^\\s*ADD\\s+COLUMN\\s+${IF_NOT_EXISTS}(${NAME})`, 'iu').exec(clause);
    if (added) effects.push({ effect: 'create', kind: 'column', ...splitQualified(added[1]), relation });
    const dropped = new RegExp(`^\\s*DROP\\s+COLUMN\\s+${IF_EXISTS}(${NAME})`, 'iu').exec(clause);
    if (dropped) effects.push({ effect: 'drop', kind: 'column', ...splitQualified(dropped[1]), relation });
    const addedConstraint = new RegExp(`^\\s*ADD\\s+CONSTRAINT\\s+(${NAME})`, 'iu').exec(clause);
    if (addedConstraint) effects.push({ effect: 'create', kind: 'constraint', ...splitQualified(addedConstraint[1]), relation });
    const droppedConstraint = new RegExp(`^\\s*DROP\\s+CONSTRAINT\\s+${IF_EXISTS}(${NAME})`, 'iu').exec(clause);
    if (droppedConstraint) effects.push({ effect: 'drop', kind: 'constraint', ...splitQualified(droppedConstraint[1]), relation });
  }
  return effects;
}

function sameRelation(a, b) {
  if (!a || !b) return false;
  return a.name === b.name && (a.schema === null || b.schema === null || a.schema === b.schema);
}

/**
 * Net objects the applied migrations promise the database still holds: created by one of them and
 * not removed by any later one (a table drop takes its columns, constraints, triggers and indexes
 * with it, exactly as PostgreSQL does).
 */
export function collectExpectedObjects(migrations) {
  const expected = new Map();
  for (const migration of migrations) {
    for (const statement of parseOwnerStatements(migration.source, migration.tag)) {
      for (const effect of classifyStatement(statement.sql)) {
        if (effect.effect === 'create') {
          const object = { kind: effect.kind, schema: effect.schema, name: effect.name, relation: effect.relation ?? null };
          expected.set(objectKey(object), { ...object, tag: migration.tag });
          continue;
        }
        for (const [key, object] of [...expected]) {
          const target = { kind: effect.kind, schema: effect.schema, name: effect.name, relation: effect.relation ?? null };
          const hitsSelf = effect.effect !== 'forget-relation'
            && object.kind === effect.kind
            && object.name === effect.name
            && (object.schema === null || effect.schema === null || object.schema === effect.schema)
            && (effect.kind !== 'column' && effect.kind !== 'constraint' && effect.kind !== 'trigger'
              ? true
              : sameRelation(object.relation, effect.relation));
          const relationGone = (effect.effect === 'drop-relation' || effect.effect === 'forget-relation')
            && (sameRelation(object.relation, effect.relation ?? target)
              || (object.kind === effect.kind && sameRelation({ schema: object.schema, name: object.name }, effect.relation ?? target)));
          const namedGone = effect.effect === 'drop-named' && object.kind === effect.kind && object.name === effect.name;
          if (hitsSelf || relationGone || namedGone) expected.delete(key);
        }
      }
    }
  }
  return [...expected.values()];
}

/** The catalog question for one object: does it exist, by name and kind? */
function objectPresenceQuery(object) {
  const schema = object.schema ? `n.nspname = ${literal(object.schema)}` : 'true';
  const relation = object.relation
    ? `c.relname = ${literal(object.relation.name)}${object.relation.schema ? ` AND rn.nspname = ${literal(object.relation.schema)}` : ''}`
    : 'true';
  return {
    function: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = ${literal(object.name)} AND ${schema})`,
    table: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ${literal(object.name)} AND c.relkind IN ('r','p','f') AND ${schema})`,
    view: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ${literal(object.name)} AND c.relkind IN ('v','m') AND ${schema})`,
    index: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ${literal(object.name)} AND c.relkind IN ('i','I'))`,
    type: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = ${literal(object.name)} AND ${schema})`,
    column: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace rn ON rn.oid = c.relnamespace WHERE a.attname = ${literal(object.name)} AND NOT a.attisdropped AND a.attnum > 0 AND ${relation})`,
    constraint: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid = k.conrelid JOIN pg_catalog.pg_namespace rn ON rn.oid = c.relnamespace WHERE k.conname = ${literal(object.name)} AND ${relation})`,
    trigger: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger g JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid JOIN pg_catalog.pg_namespace rn ON rn.oid = c.relnamespace WHERE g.tgname = ${literal(object.name)} AND NOT g.tgisinternal AND ${relation})`,
  }[object.kind];
}

/** One catalog probe per object; a false row is a hole the ledger claims is filled. */
export function renderObjectPresenceSql(objects) {
  return renderProofSql(objects.map((object) => ({ kind: 'object', tag: object.tag, object })));
}

const VERIFY_HEADER = /^--\s*BCB-MIGRATION-VERIFY:\s*(.+?)\s*$/u;

/**
 * The `-- BCB-MIGRATION-VERIFY:` probes a migration carries, read from its LEADING comment block —
 * the run of blank and `--` lines the file opens with.
 *
 * Only the leading block, because everything after it can be the body of a `CREATE FUNCTION`, and a
 * migration must not be able to declare its own proof from inside a string literal it wrote.
 *
 * A probe is one `SELECT` returning one boolean, run read-only before any DDL, by the same identity
 * that writes the ledger.  Semicolons and comment starters are refused: the probe is embedded as a
 * scalar subquery, and either of those would let it end the surrounding statement.
 */
export function readVerifyProbes(source) {
  const probes = [];
  for (const line of String(source ?? '').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('--')) break;
    const match = VERIFY_HEADER.exec(trimmed);
    if (!match) continue;
    const probe = match[1].trim();
    if (!/^SELECT\s/iu.test(probe)) {
      throw new Error(`BCB-MIGRATION-VERIFY must be a single SELECT, got: ${probe}`);
    }
    if (/;|--|\/\*/u.test(probe)) {
      throw new Error(`BCB-MIGRATION-VERIFY must not carry a statement terminator or a comment: ${probe}`);
    }
    probes.push(probe);
  }
  return probes;
}

/**
 * Everything the applied migrations owe the database, in one list: the objects they still hold, and
 * the explicit probes of the ones that hold no object a classifier can name.
 */
export function collectMigrationProofs(migrations) {
  const proofs = collectExpectedObjects(migrations).map((object) => ({
    kind: 'object',
    tag: object.tag,
    object,
  }));
  for (const migration of migrations) {
    for (const probe of readVerifyProbes(migration.source)) {
      proofs.push({ kind: 'verify', tag: migration.tag, probe });
    }
  }
  return proofs;
}

/**
 * Migrations that owe nothing and therefore prove nothing: no surviving object of their own, no
 * VERIFY probe.  A hand-written ledger row for one of these is indistinguishable from a real one,
 * which is exactly the hole the lint gate refuses to let a new migration open.
 */
export function findUnprovedMigrations(migrations) {
  const proved = new Set(collectMigrationProofs(migrations).map((proof) => proof.tag));
  return migrations.filter((migration) => !proved.has(migration.tag)).map((migration) => migration.tag);
}

/** One row per proof, each carrying its own index, so an answer can never be read by position. */
export function renderProofSql(proofs) {
  if (proofs.length === 0) return null;
  return proofs
    .map((proof, index) => {
      const query = proof.kind === 'verify' ? proof.probe : objectPresenceQuery(proof.object);
      return `SELECT ${index} AS at, (${query}) AS present`;
    })
    .join('\nUNION ALL\n');
}

/**
 * The proofs the database did not answer for.
 *
 * Answers are matched by the `at` each row carries, never by arrival order: the probe is a
 * `UNION ALL`, which promises no order at all, and reading it by position turns a missing row into a
 * silent "present".  A short or duplicated answer set is a refusal, not a default.
 */
export function interpretProofAnswers(proofs, answers) {
  const byIndex = new Map();
  for (const answer of answers) {
    const at = Number(answer.at);
    if (!Number.isInteger(at) || at < 0 || at >= proofs.length) {
      throw new Error(`migration proof probe answered for an unknown index ${answer.at}`);
    }
    if (byIndex.has(at)) throw new Error(`migration proof probe answered twice for index ${at}`);
    byIndex.set(at, answer.present === true);
  }
  if (byIndex.size !== proofs.length) {
    throw new Error(`migration proof probe answered for ${byIndex.size} of ${proofs.length} proofs`);
  }
  return proofs.filter((_, index) => byIndex.get(index) === false);
}

export function describeObject(object) {
  const where = object.relation ? ` on ${object.relation.schema ? `${object.relation.schema}.` : ''}${object.relation.name}` : '';
  return `${object.kind} ${object.schema ? `${object.schema}.` : ''}${object.name}${where} (from ${object.tag})`;
}

export function describeProof(proof) {
  return proof.kind === 'verify'
    ? `verified state of ${proof.tag}: ${proof.probe}`
    : describeObject(proof.object);
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
