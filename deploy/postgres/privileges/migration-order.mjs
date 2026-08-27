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
 * `meta/_journal.json` is no longer read for order or for migration-name exceptions.  The historical
 * chain and its exception list were retired by owner decision on 20.08.2026; every active migration
 * must therefore be named `YYYYMMDDTHHMMSS_slug`, without grandfathered names.
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

/**
 * Every migration's name is a timestamp, not a hand-picked number: `YYYYMMDDTHHMMSS_slug`, UTC,
 * second precision.  Two agents cannot land the same instant, so the name alone rules out the
 * collision that hand-picked sequential numbers hit twice on 19.08 (`0050` claimed by two branches
 * the same evening).  It also makes "insert between two migrations" ordinary: pick a timestamp
 * between them, no letter suffix, no renumbering neighbours.
 */
export const TIMESTAMP_MIGRATION_NAME = /^\d{8}T\d{6}_[a-z0-9]+(?:_[a-z0-9]+)*$/u;

/**
 * The timestamp rule is unconditional.  Historical numbered files and the allowlist that once
 * grandfathered them are retired; neither a journal entry nor any caller-supplied value can exempt a
 * tag.  Returns the offending tags so every caller can name all failures in one pass.
 */
export function findMigrationNameViolations(migrations) {
  return migrations
    .filter((migration) => !TIMESTAMP_MIGRATION_NAME.test(migration.tag))
    .map((migration) => migration.tag);
}

/**
 * Applied collisions that predate this gate.  Four historical timestamps carry more than one
 * migration; every one of them is already applied, and `AGENTS.md` forbids renaming an applied
 * migration, because the name IS its ledger identity.  So they are frozen here EXACTLY as they
 * landed — not as an allowlist a future branch may extend, but as a closed baseline: the group is
 * accepted only when its membership is exactly this set.  Add one more file to any of these four
 * timestamps and the gate reddens on that group, same as on a brand-new collision.
 *
 * Nothing may be added here.  A new migration picks a free UTC second; there are 86400 of them a
 * day, and "insert between two migrations" already means "pick a timestamp between them".
 */
export const APPLIED_MIGRATION_TIMESTAMP_COLLISION_BASELINE = Object.freeze({
  '20260822T110000': Object.freeze([
    '20260822T110000_the_email_verify_root_demotes_the_previous_primary',
    '20260822T110000_the_reminder_rule_upsert_gets_a_named_root',
  ]),
  '20260822T130000': Object.freeze([
    '20260822T130000_the_integrator_roots_name_the_integrator_role',
    '20260822T130000_the_registration_resend_door_finds_the_unconfirmed_draft',
  ]),
  '20260822T200000': Object.freeze([
    '20260822T200000_patient_demographics_leave_the_actor_root',
    '20260822T200000_remove_legacy_identity_resolver_signatures',
    '20260822T200000_tenant_definer_roots_validate_their_organization',
  ]),
  '20260823T010000': Object.freeze([
    '20260823T010000_mail_profile_reaches_auth_delivery',
    '20260823T010000_patient_subdomain_slug_and_custom_domain_uniqueness',
  ]),
});

/**
 * Order is the file name and there is no second place (`AGENTS.md` §1).  Two migrations sharing one
 * timestamp therefore have NO defined order between them: whichever the directory listing returns
 * first wins, and the two checkouts that produced them never agreed on which that is.  The name rule
 * already promised uniqueness — `findMigrationNameViolations` only checked the SHAPE of the name, so
 * the promise was documentation, not a gate (A5 of the 27.08 systemic audit).
 *
 * Returns one entry per offending timestamp so a caller can name every collision in one pass.
 */
export function findMigrationTimestampCollisions(migrations) {
  const byTimestamp = new Map();
  for (const migration of migrations) {
    const separator = migration.tag.indexOf('_');
    if (separator === -1) continue;
    const timestamp = migration.tag.slice(0, separator);
    if (!/^\d{8}T\d{6}$/u.test(timestamp)) continue;
    byTimestamp.set(timestamp, [...(byTimestamp.get(timestamp) ?? []), migration.tag]);
  }
  const collisions = [];
  for (const [timestamp, tags] of [...byTimestamp.entries()].sort()) {
    if (tags.length < 2) continue;
    const baseline = APPLIED_MIGRATION_TIMESTAMP_COLLISION_BASELINE[timestamp];
    const sorted = [...tags].sort();
    if (baseline && baseline.length === sorted.length && baseline.every((tag, index) => tag === sorted[index])) continue;
    collisions.push({ timestamp, tags: sorted, baseline: baseline ? [...baseline] : null });
  }
  return collisions;
}

const GUARDED_RELATION_SCHEMAS = new Set(['public', 'app', 'integrator', 'app_ext']);

function withoutSqlCommentsAndLiterals(sql) {
  return sql
    .replace(/--[^\n]*/gu, ' ')
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/gu, ' ')
    .replace(/'(?:''|[^'])*'/gu, ' ')
    .replace(/"(?:""|[^"])*"/gu, (identifier) => identifier);
}

const privilegeWord = (...parts) => parts.join('');
const forbiddenMigrationPatterns = [
  {
    label: privilegeWord('GRA', 'NT'),
    pattern: new RegExp(`\\b${privilegeWord('GRA', 'NT')}\\b`, 'iu'),
  },
  {
    label: privilegeWord('REV', 'OKE'),
    pattern: new RegExp(`\\b${privilegeWord('REV', 'OKE')}\\b`, 'iu'),
  },
  {
    label: privilegeWord('CREATE', ' ROLE'),
    pattern: new RegExp(`\\b${privilegeWord('CREATE', '\\s+ROLE')}\\b`, 'iu'),
  },
  {
    label: privilegeWord('ALTER', ' ROLE'),
    pattern: new RegExp(`\\b${privilegeWord('ALTER', '\\s+ROLE')}\\b`, 'iu'),
  },
  {
    label: privilegeWord('ALTER DEFAULT', ' PRIVILEGES'),
    pattern: new RegExp(`\\b${privilegeWord('ALTER', '\\s+DEFAULT\\s+PRIVILEGES')}\\b`, 'iu'),
  },
  {
    label: privilegeWord('CREATE', ' POLICY'),
    pattern: new RegExp(`\\b${privilegeWord('CREATE', '\\s+POLICY')}\\b`, 'iu'),
  },
  {
    label: privilegeWord('ALTER', ' POLICY'),
    pattern: new RegExp(`\\b${privilegeWord('ALTER', '\\s+POLICY')}\\b`, 'iu'),
  },
];

/**
 * Database-free acceptance gate for active webapp migrations.  The declaration set is supplied by
 * the lint caller so this module stays usable by both migration runners without importing TS.
 */
export function findMigrationStaticViolations(migrations, declaredRelations) {
  const violations = [];
  for (const tag of findMigrationNameViolations(migrations)) {
    const migration = migrations.find((candidate) => candidate.tag === tag);
    violations.push({
      file: migration?.path ?? `${tag}.sql`,
      statementIndex: 0,
      reason: 'file name is not YYYYMMDDTHHMMSS_lower_snake_case',
      action: 'rename the unapplied file to a UTC timestamp name; applied files must not be renamed',
    });
  }

  for (const collision of findMigrationTimestampCollisions(migrations)) {
    const newcomers = collision.baseline
      ? collision.tags.filter((tag) => !collision.baseline.includes(tag))
      : collision.tags;
    for (const tag of newcomers) {
      const migration = migrations.find((candidate) => candidate.tag === tag);
      violations.push({
        file: migration?.path ?? `${tag}.sql`,
        statementIndex: 0,
        reason: `migration timestamp ${collision.timestamp} is already taken by ${
          collision.tags.filter((other) => other !== tag).join(', ')}`,
        action: collision.baseline
          ? 'the applied collision baseline is closed; give this migration a free UTC second'
          : 'give this migration a free UTC second — the file name is the only order there is',
      });
    }
  }

  for (const migration of migrations) {
    const statements = migration.source.split('--> statement-breakpoint');
    for (let index = 0; index < statements.length; index += 1) {
      const raw = statements[index];
      const statementIndex = index + 1;
      let parsed;
      try {
        [parsed] = parseOwnerStatements(raw, migration.tag);
      } catch (error) {
        const postgresOwner = error instanceof Error && /cannot use postgres/u.test(error.message);
        violations.push({
          file: migration.path ?? `${migration.tag}.sql`,
          statementIndex,
          reason: postgresOwner
            ? 'BCB-MIGRATION-OWNER postgres is forbidden'
            : 'statement has no valid BCB-MIGRATION-OWNER or BCB-MIGRATION-BACKFILL header',
          action: postgresOwner
            ? 'use app_object_owner for ordinary objects or the declared seam owner for seam-owned objects'
            : 'put the required header at the start of this statement',
        });
        continue;
      }

      const executable = withoutSqlCommentsAndLiterals(parsed.sql);
      for (const forbidden of forbiddenMigrationPatterns) {
        if (!forbidden.pattern.test(executable)) continue;
        violations.push({
          file: migration.path ?? `${migration.tag}.sql`,
          statementIndex,
          reason: `${forbidden.label} is forbidden in an active migration`,
          action: 'declare access in deploy/postgres/privileges/declaration.ts; reconcile applies it',
        });
      }

      for (const effect of classifyStatement(parsed.sql)) {
        if (effect.effect !== 'create' || effect.kind !== 'table') continue;
        const schema = effect.schema ?? 'public';
        const identity = `${schema}.${effect.name}`;
        if (!GUARDED_RELATION_SCHEMAS.has(schema) || declaredRelations.has(identity)) continue;
        violations.push({
          file: migration.path ?? `${migration.tag}.sql`,
          statementIndex,
          reason: `guarded table ${identity} is absent from the privilege declaration`,
          action: 'declare the table in deploy/postgres/privileges/declaration.ts before the migration',
        });
      }
    }
  }
  return violations;
}

/**
 * A pending migration byte-identical to a ledger row this checkout cannot name is not new work — it
 * is an applied migration wearing a new file name.  `AGENTS.md` forbids renaming an applied
 * migration (the name is its ledger identity); this is what makes that refusal real instead of
 * aspirational for every migration created after the historical journal froze, where there is no
 * journal entry left to catch the old name going missing.
 *
 * Content, not name, is what proves the rename: the hash is computed the same way on both sides
 * (`readMigrationFolder`, `INSERT ... hash`), so a plain `git mv` — the only legitimate way to
 * reorder an unapplied migration — cannot trigger this, because an unapplied migration owns no
 * foreign ledger row to collide with.
 */
export function findRenamedAppliedMigrations(pendingMigrations, foreignLedgerRows) {
  const foreignByHash = new Map(foreignLedgerRows.filter((row) => row.hash).map((row) => [row.hash, row]));
  return pendingMigrations
    .filter((migration) => foreignByHash.has(migration.hash))
    .map((migration) => ({ migration, row: foreignByHash.get(migration.hash) }));
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

/** The frozen historical `when -> tag` map, or an empty one when the folder no longer carries it. */
export function readLegacyJournalEntries(folder) {
  const path = resolve(folder, 'meta', '_journal.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')).entries ?? [];
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
  if (object.kind === 'function') return `function ${object.identity}`;
  const relation = object.relation ? `${object.relation.schema ?? '*'}.${object.relation.name}` : null;
  return [object.kind, relation, `${object.schema ?? '*'}.${object.name}`].filter(Boolean).join(' ');
}

const MULTI_WORD_TYPE_HEADS = new Set([
  'timestamp',
  'time',
  'double',
  'character',
  'bit',
  'interval',
]);

const FUNCTION_TYPE_ALIASES = new Map([
  ['bool', 'boolean'],
  ['char', 'character'],
  ['decimal', 'numeric'],
  ['float4', 'real'],
  ['float8', 'double precision'],
  ['int', 'integer'],
  ['int2', 'smallint'],
  ['int4', 'integer'],
  ['int8', 'bigint'],
  ['time', 'time without time zone'],
  ['timetz', 'time with time zone'],
  ['timestamp', 'timestamp without time zone'],
  ['timestamptz', 'timestamp with time zone'],
  ['varbit', 'bit varying'],
  ['varchar', 'character varying'],
]);

function canonicalFunctionType(rawType) {
  const type = rawType.toLowerCase().replaceAll(/\s+/gu, ' ').replace(/^pg_catalog\./u, '').trim();
  const array = /(?:\[\])+$/u.exec(type)?.[0] ?? '';
  const base = array ? type.slice(0, -array.length) : type;
  return `${FUNCTION_TYPE_ALIASES.get(base) ?? base}${array}`;
}

function splitTopLevelArguments(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    current += character;
    if (quote) {
      if (character !== quote) continue;
      if (text[index + 1] === quote) {
        current += text[index + 1];
        index += 1;
      } else {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current.slice(0, -1));
      current = '';
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function closingParenthesis(source, openIndex) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character !== quote) continue;
      if (source[index + 1] === quote) index += 1;
      else quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('migration has an unbalanced function argument list');
}

function declaredArgumentType(declaration) {
  let rest = declaration.replaceAll(/\s+/gu, ' ').trim();
  const mode = /^(?:IN|OUT|INOUT|VARIADIC)\s+/iu.exec(rest);
  const out = /^OUT\s+/iu.test(rest);
  if (mode) rest = rest.slice(mode[0].length);
  rest = rest.replace(/\s+DEFAULT\b[\s\S]*$/iu, '').replace(/\s*=\s*[\s\S]*$/u, '').trim();
  const head = rest.split(' ')[0];
  const tail = rest.slice(head.length).trim();
  const named = tail.length > 0 && !MULTI_WORD_TYPE_HEADS.has(head.toLowerCase().replace(/[[(].*$/u, ''));
  return { out, type: canonicalFunctionType(named ? tail : rest) };
}

function classifyFunctionStatement(head) {
  const pattern = new RegExp(
    `^(CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION|DROP\\s+FUNCTION(?:\\s+IF\\s+EXISTS)?)\\s+(${QUALIFIED})\\s*\\(`,
    'iu',
  );
  const match = pattern.exec(head);
  if (!match) return null;
  const open = match[0].length - 1;
  const close = closingParenthesis(head, open);
  const argumentTypes = splitTopLevelArguments(head.slice(open + 1, close))
    .map(declaredArgumentType)
    .filter((argument) => !argument.out)
    .map((argument) => argument.type);
  const qualified = splitQualified(match[2]);
  const identity = `${qualified.schema ? `${qualified.schema}.` : ''}${qualified.name}(${argumentTypes.join(',')})`;
  return {
    effect: /^CREATE/iu.test(match[1]) ? 'create' : 'drop',
    kind: 'function',
    ...qualified,
    identity,
  };
}

/**
 * Objects a statement declares or removes.  Only the HEAD of each statement is matched: statements
 * are already split on `--> statement-breakpoint`, so a `CREATE FUNCTION` body — which routinely
 * contains the words CREATE, DROP and TABLE — is never read as a declaration of its own.
 */
function classifyStatement(sql) {
  const head = sql.replace(/^(?:\s|--[^\n]*\n)+/u, '');
  const functionEffect = classifyFunctionStatement(head);
  if (functionEffect) return [functionEffect];
  const rules = [
    // created
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
 * with it, exactly as PostgreSQL does). When `catalogMigrationTags` is supplied, later migrations
 * are planned work for this run: their CREATE restores the object after the guard, so neither that
 * object nor an earlier version of it is expected in the catalog before the transaction begins.
 */
export function collectExpectedObjects(migrations, { catalogMigrationTags = null } = {}) {
  const expected = new Map();
  for (const migration of migrations) {
    for (const statement of parseOwnerStatements(migration.source, migration.tag)) {
      for (const effect of classifyStatement(statement.sql)) {
        if (effect.effect === 'create') {
          const object = {
            kind: effect.kind,
            schema: effect.schema,
            name: effect.name,
            identity: effect.identity ?? null,
            relation: effect.relation ?? null,
          };
          if (catalogMigrationTags === null || catalogMigrationTags.has(migration.tag)) {
            expected.set(objectKey(object), { ...object, tag: migration.tag });
          } else {
            expected.delete(objectKey(object));
          }
          continue;
        }
        for (const [key, object] of [...expected]) {
          const target = {
            kind: effect.kind,
            schema: effect.schema,
            name: effect.name,
            identity: effect.identity ?? null,
            relation: effect.relation ?? null,
          };
          const hitsSelf = effect.effect !== 'forget-relation'
            && object.kind === effect.kind
            && object.name === effect.name
            && (object.schema === null || effect.schema === null || object.schema === effect.schema)
            && (effect.kind !== 'function' || object.identity === effect.identity)
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
      function: `SELECT to_regprocedure(${literal(object.identity)}) IS NOT NULL`,
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
  const name = object.kind === 'function'
    ? object.identity
    : `${object.schema ? `${object.schema}.` : ''}${object.name}`;
  return `${object.kind} ${name}${where} (from ${object.tag})`;
}
