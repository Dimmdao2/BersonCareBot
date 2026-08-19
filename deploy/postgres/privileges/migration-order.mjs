/**
 * The order of webapp migrations, and the proof that an applied one is really in the database.
 *
 * Two rules live here, and only here, so every runner (`migrate-local.mjs` for DEV/TEST/PROD,
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
 *
 * `meta/_journal.json` is no longer read for order.  It survives as the frozen historical
 * `when -> tag` map used once per database to label ledger rows written before the tag column
 * existed (`backfillLedgerTagsSql`).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
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

/** One catalog probe per object; a false row is a hole the ledger claims is filled. */
export function renderObjectPresenceSql(objects) {
  const probes = objects.map((object, index) => {
    const schema = object.schema ? `n.nspname = ${literal(object.schema)}` : 'true';
    const relation = object.relation
      ? `c.relname = ${literal(object.relation.name)}${object.relation.schema ? ` AND rn.nspname = ${literal(object.relation.schema)}` : ''}`
      : 'true';
    const query = {
      function: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = ${literal(object.name)} AND ${schema})`,
      table: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ${literal(object.name)} AND c.relkind IN ('r','p','f') AND ${schema})`,
      view: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ${literal(object.name)} AND c.relkind IN ('v','m') AND ${schema})`,
      index: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = ${literal(object.name)} AND c.relkind IN ('i','I'))`,
      type: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = ${literal(object.name)} AND ${schema})`,
      column: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace rn ON rn.oid = c.relnamespace WHERE a.attname = ${literal(object.name)} AND NOT a.attisdropped AND a.attnum > 0 AND ${relation})`,
      constraint: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid = k.conrelid JOIN pg_catalog.pg_namespace rn ON rn.oid = c.relnamespace WHERE k.conname = ${literal(object.name)} AND ${relation})`,
      trigger: `SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger g JOIN pg_catalog.pg_class c ON c.oid = g.tgrelid JOIN pg_catalog.pg_namespace rn ON rn.oid = c.relnamespace WHERE g.tgname = ${literal(object.name)} AND NOT g.tgisinternal AND ${relation})`,
    }[object.kind];
    return `SELECT ${index} AS at, (${query}) AS present`;
  });
  return probes.length === 0 ? null : probes.join('\nUNION ALL\n');
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function describeObject(object) {
  const where = object.relation ? ` on ${object.relation.schema ? `${object.relation.schema}.` : ''}${object.relation.name}` : '';
  return `${object.kind} ${object.schema ? `${object.schema}.` : ''}${object.name}${where} (from ${object.tag})`;
}
