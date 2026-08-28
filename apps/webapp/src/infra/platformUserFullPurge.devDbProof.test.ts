/**
 * WHAT BREAKS WITHOUT THIS: the whole database core of a full account purge has never executed
 * against a real PostgreSQL. Every existing check is a mock (`platformUserFullPurge.retired
 * IntegratorProjections.unit.test.ts` asserts the SQL text issued to a `vi.fn()`), the public
 * destructive route is deliberately disabled (`account_purge_disabled`), and the lifecycle registry
 * is a declaration nobody compares to the live constraint graph. So a table can be dropped from
 * `CONTENT_TABLES`, a cascading FK can be re-created as `ON DELETE SET NULL`, or the registry can
 * claim `anonymised` where the database will actually REFUSE the delete — and every test stays
 * green while a purged person keeps living in the database.
 *
 * ORACLE — three artifacts, none of which is the purge implementation:
 *   1. `pg_constraint` of the live TEST database: which relations reference `platform_users` and
 *      what the database itself does to them on delete (`confdeltype`);
 *   2. `JOURNAL_LIFECYCLE_REGISTRY` (`deploy/postgres/privileges/journal-lifecycle-registry.ts`) —
 *      the written lifecycle decision per store, stage 3 of the systemic audit 2026-08-27;
 *   3. the before-counts measured in the same transaction, before anything is deleted.
 * The proof never re-implements the deletion order: it calls `runWebappPurgeCoreInTransaction`.
 *
 * WHAT IS PROVEN, per §10b «DB/RLS — актуальный механизм проверки»:
 *   - explicit-delete: a relation named by `CONTENT_TABLES` loses its rows even when its FK would
 *     merely have nulled them (`be_appointments`, `reminder_rules`, `support_conversations`,
 *     `online_intake_requests`) or when it has no FK at all (`reminder_occurrence_history`, audit §C1);
 *   - cascade: relations the database itself empties;
 *   - anonymised: `ON DELETE SET NULL` relations stop referencing the person, and — where no
 *     cascading parent also empties them — keep exactly the same number of rows;
 *   - via-parent: rows reachable only through a parent that the purge empties disappear with it;
 *   - phone-keyed: OTP stores are cleared by the phone digits, not by the user id;
 *   - no relation of the live FK graph still references the purged id — the property the final
 *     `DELETE FROM platform_users` depends on;
 *   - the declared lifecycle of the registry agrees with what the database actually does.
 *
 * BOUNDARIES. This proves the DATABASE CORE ONLY, in ONE transaction that is ALWAYS rolled back:
 * no S3 object cleanup, no post-commit `media_files` row deletion, no audit write, no HTTP route.
 * The destructive product route stays disabled; nothing here enables it. External-artifact
 * collection runs (the product requires it before the deletes that hide its inputs) but is NOT
 * proven — see the case that says so. `message_log` is empty on TEST, so its recorded policy
 * conflict (registry says anonymised, the core deletes) has no live fact here either.
 *
 * Connection: the canonical local admin socket of AGENTS.md §6 (`sudo -n -u postgres psql -h
 * /var/run/postgresql`), the same transport every other `*.devDbProof.test.*` in this repository
 * uses, wrapped so that the product's own `PoolClient` consumer (Drizzle) drives it unchanged —
 * product SQL text and its bind parameters are handed to PostgreSQL verbatim through the extended
 * query protocol (`\bind`). The four TEST runtime logins are mTLS-only with keys readable solely by
 * `bcb-web-test`, and peer auth on the socket needs uid `postgres`, which cannot read this
 * repository; the admin socket is therefore the only real-database transport available to a proof
 * running as the developer user.
 *
 * Run (owner / lead, on the box):
 *   RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run \
 *     src/infra/platformUserFullPurge.devDbProof.test.ts
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  ANONYMISE_ON_PURGE_COLUMNS,
  CONTENT_TABLES,
  DIARY_TABLES,
  IDENTITY_ROOT_TABLES,
  IDENTITY_TABLES,
  PURGED_USER_JSON_TOKEN,
  PurgeIdentityRootConflictError,
  collectPurgeArtifactKeys,
  phoneDigits,
  runWebappPurgeCoreInTransaction,
  type PurgeArtifactKeys,
  type PurgePlatformUserRow,
} from './platformUserFullPurge';
import { pgAdvisoryXactLock } from '@/infra/db/pgAdvisoryLock';
import {
  JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS,
  JOURNAL_LIFECYCLE_REGISTRY,
  type JournalLifecycleOrgPurge,
  type JournalLifecycleUserPurge,
} from '../../../../deploy/postgres/privileges/journal-lifecycle-registry';

const ENABLED = process.env.RUN_PLATFORM_USER_PURGE_DB === '1';

/**
 * A NAMED managed database, never a disposable one (AGENTS.md §1b) and never PROD.
 *
 * Default is named DEV. The proof rolls every transaction back, but it still executes the real
 * destructive core, and DEV is the environment whose data may be disturbed; TEST is the shared
 * acceptance database and stays read-only unless a run explicitly names it.
 */
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');

const DEV_DATABASE = 'bcb_webapp_dev';
const TEST_DATABASE = 'bersoncarebot_test';
const ALLOWED_DATABASES = [DEV_DATABASE, TEST_DATABASE];
const DATABASE = process.env.PLATFORM_USER_PURGE_DB ?? DEV_DATABASE;

if (ENABLED && !ALLOWED_DATABASES.includes(DATABASE)) {
  throw new Error(
    `refusing to run the account purge proof against '${DATABASE}': only ${ALLOWED_DATABASES.join(
      ' or ',
    )} is allowed`,
  );
}

/* ────────────────────────────── psql-backed client ────────────────────────────── */

const SENTINEL = '@@bcb-purge-proof@@';
const SAFE_BIND_PARAM = /^[A-Za-z0-9_+@.:-]*$/u;

type QueryResult = { rows: Record<string, string | null>[]; rowCount: number };

/** `--csv` output of one result set: header line, then rows; NULL is unquoted-empty, '' is `""`. */
function parseCsvBlock(block: string): Record<string, string | null>[] {
  const records: (string | null)[][] = [];
  let record: (string | null)[] = [];
  let field = '';
  let quoted = false;
  let sawQuote = false;
  let i = 0;

  const endField = () => {
    record.push(sawQuote ? field : field === '' ? null : field);
    field = '';
    sawQuote = false;
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < block.length) {
    const ch = block[i]!;
    if (quoted) {
      if (ch === '"') {
        if (block[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      sawQuote = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || sawQuote || record.length > 0) endRecord();

  const header = records.shift();
  if (!header) return [];
  const columns = header.map((c) => c ?? '');
  return records.map((row) => {
    const out: Record<string, string | null> = {};
    columns.forEach((name, idx) => {
      out[name] = row[idx] ?? null;
    });
    return out;
  });
}

/**
 * One `psql` session on the admin socket, driven so that the product's SQL text and its bind
 * parameters reach PostgreSQL unchanged. Exposes the single method Drizzle calls on a `PoolClient`.
 */
class AdminSocketClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdout = '';
  private stderr = '';
  private pending: ((chunk: string) => void) | null = null;
  /** Set once the session dies, so a query reports the real cause instead of a bare timeout. */
  private dead: string | null = null;

  start(): void {
    const child = spawn(
      'sudo',
      [
        '-n',
        '-u',
        'postgres',
        'psql',
        '-X',
        '-q',
        '--csv',
        '-h',
        '/var/run/postgresql',
        '-p',
        '5432',
        '-d',
        DATABASE,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.stdout += chunk;
      this.pending?.(this.stdout);
    });
    child.stderr.on('data', (chunk: string) => {
      this.stderr += chunk;
    });
    child.on('error', (error) => {
      this.dead = `could not start the admin socket session: ${error.message}`;
    });
    child.on('close', (code, signal) => {
      this.dead ??= `psql session ended (code=${code}, signal=${signal}): ${this.stderr.trim()}`;
    });
    child.stdin.on('error', () => {
      /* the close handler above carries the real cause */
    });
    this.child = child;
    child.stdin.write('\\set ON_ERROR_STOP off\n');
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin.end('\\q\n');
      await new Promise<void>((resolve) => child.once('close', () => resolve()));
    }
  }

  /**
   * The `PoolClient` surface Drizzle calls on behalf of the product. The proof's own measurements go
   * through `probe`, so this file adds no `.query(...)` call site of its own.
   */
  async query(
    configOrText: string | { text: string },
    params: readonly unknown[] = [],
  ): Promise<QueryResult> {
    return this.probe(typeof configOrText === 'string' ? configOrText : configOrText.text, params);
  }

  async probe(text: string, params: readonly unknown[] = []): Promise<QueryResult> {
    const child = this.child;
    if (!child) throw new Error('admin socket session is not running');
    if (this.dead) throw new Error(this.dead);

    const bound = params.map((value) => {
      const asText = value === null || value === undefined ? '' : String(value);
      if (!SAFE_BIND_PARAM.test(asText)) {
        throw new Error(`refusing to bind a parameter outside the safe charset: ${asText}`);
      }
      return `'${asText}'`;
    });

    this.stdout = '';
    this.stderr = '';
    const script =
      `${text}\n\\bind ${bound.join(' ')} \\g\n` +
      `\\if :ERROR\n\\echo ${SENTINEL}ERR :SQLSTATE\n\\else\n\\echo ${SENTINEL}OK\n\\endif\n`;

    child.stdin.write(script);

    const raw = await new Promise<string>((resolve, reject) => {
      const settle = () => {
        clearTimeout(timer);
        clearInterval(watchdog);
        this.pending = null;
      };
      const timer = setTimeout(() => {
        settle();
        reject(new Error(`admin socket query timed out after 60s: ${text.slice(0, 200)}`));
      }, 60_000);
      const watchdog = setInterval(() => {
        if (this.dead) {
          settle();
          reject(new Error(`${this.dead}\n--- query ---\n${text.slice(0, 200)}`));
        }
      }, 50);
      this.pending = (buffer) => {
        const at = buffer.indexOf(SENTINEL);
        if (at === -1) return;
        const end = buffer.indexOf('\n', at);
        if (end === -1) return;
        settle();
        resolve(buffer.slice(0, end + 1));
      };
      this.pending(this.stdout);
    });

    const at = raw.indexOf(SENTINEL);
    const status = raw.slice(at + SENTINEL.length).trim();
    if (status.startsWith('ERR')) {
      throw new Error(`${status}\n${this.stderr.trim()}\n--- query ---\n${text}`);
    }
    const rows = parseCsvBlock(raw.slice(0, at));
    return { rows, rowCount: rows.length };
  }
}

/* ────────────────────────────── derived surfaces ────────────────────────────── */

/** What the purge must leave behind for one (relation, column) pair. */
type Expectation = 'gone' | 'anonymised' | 'unreferenced';

type Surface = {
  relation: string;
  column: string;
  /** `pg_constraint.confdeltype`, or null when no FK to `platform_users` exists at all. */
  onDelete: string | null;
  expectation: Expectation;
};

type Counts = { referencing: number; total: number };

type ArtifactCounts = {
  mediaOwnerRefs: number;
  patientFiles: number;
  intakeAttachments: number;
};

/** A relation name that came out of `pg_catalog`, re-checked before it goes back into SQL text. */
function catalogLiteral(qualified: string): string {
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/u.test(qualified)) {
    throw new Error(`unexpected relation name from the catalog: ${qualified}`);
  }
  return `'${qualified}'`;
}

function quoteIdent(qualified: string): string {
  return qualified
    .split('.')
    .map((part) => `"${part.replace(/"/gu, '""')}"`)
    .join('.');
}

function asInt(value: string | null): number {
  return Number.parseInt(value ?? '0', 10);
}

/**
 * Every relation the purge core empties BY NAME inside its transaction, unqualified in the product
 * and `public`-qualified here. Three lists, one meaning: `CONTENT_TABLES`, the diary pair whose FK
 * order forces its own sequence, and the identity/login rows. Reading only the first of the three
 * made five true `explicit-delete` declarations look false.
 */
const EXPLICIT_DELETE_KEYS = new Set(
  [...CONTENT_TABLES, ...DIARY_TABLES, ...IDENTITY_TABLES].map(
    (entry) => `public.${entry.table}.${entry.column}`,
  ),
);
/**
 * Same convention for the columns the purge nulls instead of deleting — INCLUDING the further
 * identity columns of the same row (`alsoNullColumns`). Audit 2026-08-28, F5: these carry no FK at
 * all, so the FK-derived surface list could not see them and `specialist_tasks`, `be_payments`,
 * `be_payment_history_events` and the whole delivery journal were never physically measured.
 */
const EXPLICIT_ANONYMISE_KEYS = new Set(
  ANONYMISE_ON_PURGE_COLUMNS.flatMap((entry) =>
    [entry.column, ...(entry.alsoNullColumns ?? [])].map(
      (column) => `public.${entry.table}.${column}`,
    ),
  ),
);
/** `jsonb` columns the purge scrubs of the raw uuid, same convention. */
const SCRUB_JSON_KEYS = new Set(
  ANONYMISE_ON_PURGE_COLUMNS.flatMap((entry) =>
    (entry.scrubJsonColumns ?? []).map((column) => `public.${entry.table}.${column}`),
  ),
);

function expectationFor(relation: string, column: string, onDelete: string | null): Expectation {
  if (EXPLICIT_DELETE_KEYS.has(`${relation}.${column}`)) return 'gone';
  if (onDelete === 'c') return 'gone';
  if (EXPLICIT_ANONYMISE_KEYS.has(`${relation}.${column}`)) return 'anonymised';
  if (onDelete === 'n') return 'anonymised';
  return 'unreferenced';
}

/* ────────────────────────────── the proof ────────────────────────────── */

type ViaParent = { child: string; parent: string; join: string };

type Report = {
  database: string;
  user: PurgePlatformUserRow;
  advisoryLockHeld: boolean;
  phoneDigits: string;
  artifact: PurgeArtifactKeys;
  /** Independently measured, in the same transaction, before the purge. */
  artifactExpected: { mediaFileIds: string[]; patientFileKeys: number; intakeKeys: number };
  artifactBefore: ArtifactCounts;
  artifactAfter: ArtifactCounts;
  artifactRestored: ArtifactCounts;
  surfaces: Surface[];
  before: Map<string, Counts>;
  after: Map<string, Counts>;
  restored: Map<string, Counts>;
  phoneKeyed: {
    relation: string;
    column: string;
    before: number;
    after: number;
    restored: number;
  }[];
  viaParent: { child: string; parent: string; before: number; after: number; restored: number }[];
  /** Relations that also lose rows through a cascading parent the purge empties. */
  cascadeChildrenOfPurged: string[];
  registryDivergences: string[];
  /**
   * Divergences whose ONLY cause is that this database has not yet been given a forward migration
   * this branch already carries — each is named together with that pending migration, and each is
   * proven pending against the live `drizzle.__drizzle_migrations` ledger.
   */
  pendingSchemaDivergences: string[];
  /** How many of the 164 structured non-journal decisions carried a checkable claim. */
  structuredDecisionsChecked: number;
  /** `jsonb` columns whose document still embedded the raw uuid after the purge. */
  jsonScrubLeftovers: string[];
  /** FK-free explicit-anonymise surfaces that had live rows and were therefore really exercised. */
  provenExplicitAnonymise: string[];
};

const client = new AdminSocketClient();
let report: Report;
let setupError: unknown = null;

function key(relation: string, column: string): string {
  return `${relation}.${column}`;
}

function viaKey(child: string, parent: string): string {
  return `${child}->${parent}`;
}

async function countsFor(surfaces: Surface[], userId: string): Promise<Map<string, Counts>> {
  const out = new Map<string, Counts>();
  for (const surface of surfaces) {
    const rel = quoteIdent(surface.relation);
    const col = quoteIdent(surface.column);
    const res = await client.probe(
      `SELECT count(*) FILTER (WHERE ${col}::text = $1) AS referencing, count(*) AS total FROM ${rel}`,
      [userId],
    );
    out.set(key(surface.relation, surface.column), {
      referencing: asInt(res.rows[0]?.referencing ?? null),
      total: asInt(res.rows[0]?.total ?? null),
    });
  }
  return out;
}

/**
 * SQL that excludes the accounts the purge refuses outright. Derived from the product's own
 * `IDENTITY_ROOT_TABLES`, so a new identity root is excluded here the moment it is declared there —
 * this proof measures what the purge DOES to a purgeable account; the refusal itself is proven in
 * its own case.
 */
const NOT_AN_IDENTITY_ROOT_SQL = IDENTITY_ROOT_TABLES.map(
  ({ table, column }) =>
    `NOT EXISTS (SELECT 1 FROM ${quoteIdent(`public.${table}`)} ir ` +
    `WHERE ir.${quoteIdent(column)} = pu.id)`,
).join(' AND ');

async function loadPurgeUser(userId: string): Promise<PurgePlatformUserRow> {
  const userRow = await client.probe(
    `SELECT pu.id::text AS id,
            (SELECT uc.value_normalized FROM public.user_contacts uc
              WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary
              LIMIT 1) AS phone_normalized,
            pu.role AS role
       FROM public.platform_users pu
      WHERE pu.id::text = $1`,
    [userId],
  );
  return {
    id: userRow.rows[0]?.id ?? '',
    phone_normalized: userRow.rows[0]?.phone_normalized ?? null,
    role: userRow.rows[0]?.role ?? '',
  };
}

async function measureArtifactCounts(userId: string): Promise<ArtifactCounts> {
  const measured = await client.probe(
    `SELECT
       (SELECT count(*) FROM public.media_files m WHERE m.uploaded_by::text = $1) AS media_owner_refs,
       (SELECT count(*) FROM public.patient_files p WHERE p.patient_user_id::text = $1) AS patient_files,
       (SELECT count(*) FROM public.online_intake_attachments a
          JOIN public.online_intake_requests r ON r.id = a.request_id
         WHERE r.user_id::text = $1) AS intake_attachments`,
    [userId],
  );
  return {
    mediaOwnerRefs: asInt(measured.rows[0]?.media_owner_refs ?? null),
    patientFiles: asInt(measured.rows[0]?.patient_files ?? null),
    intakeAttachments: asInt(measured.rows[0]?.intake_attachments ?? null),
  };
}

async function measureExpectedArtifacts(
  userId: string,
): Promise<{ mediaFileIds: string[]; patientFileKeys: number; intakeKeys: number }> {
  const expectedMedia = await client.probe(
    `SELECT m.id::text AS id FROM public.media_files m WHERE m.uploaded_by::text = $1
     UNION
     SELECT p.media_file_id::text FROM public.patient_files p
      WHERE p.patient_user_id::text = $1 AND p.media_file_id IS NOT NULL`,
    [userId],
  );
  const expectedPatientFiles = await client.probe(
    `SELECT count(*) AS n FROM public.patient_files
      WHERE patient_user_id::text = $1 AND s3_key IS NOT NULL AND s3_key <> ''`,
    [userId],
  );
  const expectedIntake = await client.probe(
    `SELECT count(*) AS n FROM public.online_intake_attachments a
       JOIN public.online_intake_requests r ON r.id = a.request_id
      WHERE r.user_id::text = $1 AND a.s3_key IS NOT NULL AND a.s3_key <> ''`,
    [userId],
  );
  return {
    mediaFileIds: expectedMedia.rows.map((row) => row.id ?? '').sort(),
    patientFileKeys: asInt(expectedPatientFiles.rows[0]?.n ?? null),
    intakeKeys: asInt(expectedIntake.rows[0]?.n ?? null),
  };
}

describe.skipIf(!ENABLED)(
  'account purge core against the live named database (rollback-only)',
  () => {
    beforeAll(async () => {
      client.start();
      try {
        const current = await client.probe('SELECT current_database() AS name');
        const live = current.rows[0]?.name ?? '';
        if (live !== DATABASE) {
          throw new Error(`refusing: current_database='${live}', expected '${DATABASE}'`);
        }

        /* ORACLE 1 — the live FK graph around `platform_users`. */
        const fkRows = await client.probe(`
        SELECT n.nspname || '.' || c.relname AS relation,
               a.attname                     AS column,
               con.confdeltype               AS on_delete
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
         WHERE con.contype = 'f'
           AND con.confrelid = 'public.platform_users'::regclass`);

        const surfaces: Surface[] = fkRows.rows.map((row) => {
          const relation = row.relation ?? '';
          const column = row.column ?? '';
          const onDelete = row.on_delete;
          return {
            relation,
            column,
            onDelete,
            expectation: expectationFor(relation, column, onDelete),
          };
        });
        /* A relation the purge names explicitly but the FK graph does not know — the audit §C1 shape
         (`reminder_occurrence_history` has no FK, so nothing cascades it away). */
        for (const entry of CONTENT_TABLES) {
          const relation = `public.${entry.table}`;
          if (surfaces.some((s) => s.relation === relation && s.column === entry.column)) continue;
          surfaces.push({
            relation,
            column: entry.column,
            onDelete: null,
            expectation: 'gone',
          });
        }
        /* The same shape for the columns the purge NULLS with no FK behind them (audit 2026-08-28,
         F5): `specialist_tasks.patient_user_id`, both accounting columns, and the delivery
         journal's `user_id` / `integrator_user_id`. Without this the FK-derived list cannot see
         them, so the promised de-identification was never measured on a real row. */
        for (const target of ANONYMISE_ON_PURGE_COLUMNS) {
          const relation = `public.${target.table}`;
          for (const column of [target.column, ...(target.alsoNullColumns ?? [])]) {
            if (surfaces.some((s) => s.relation === relation && s.column === column)) continue;
            surfaces.push({ relation, column, onDelete: null, expectation: 'anonymised' });
          }
        }
        surfaces.sort((a, b) => key(a.relation, a.column).localeCompare(key(b.relation, b.column)));

        /* ORACLE 1b — the same graph around the organizations table, for the org-purge half. */
        const orgFkRows = await client.probe(`
        SELECT n.nspname || '.' || c.relname AS relation,
               a.attname                     AS column,
               con.confdeltype               AS on_delete
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
         WHERE con.contype = 'f'
           AND con.confrelid = 'public.be_organizations'::regclass`);
        /* Which relations physically carry an `organization_id` at all — a written organization
           purge over a column that does not exist is the emptiest claim of the set. */
        const orgColumnRows = await client.probe(`
        SELECT n.nspname || '.' || c.relname AS relation
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE a.attname = 'organization_id'
           AND a.attnum > 0
           AND NOT a.attisdropped
           AND c.relkind IN ('r', 'p')`);

        /* ORACLE 2 — the registry's written decision must agree with what the database does. */
        const liveFk = new Map(
          surfaces.filter((s) => s.onDelete).map((s) => [key(s.relation, s.column), s.onDelete!]),
        );
        /**
         * ONE rule set, applied to BOTH written surfaces (audit 2026-08-28, F5: the proof used to
         * read only `JOURNAL_LIFECYCLE_REGISTRY`, so the 164 structured non-journal decisions — the
         * exact surface the exhaustive census had just created — were checked by nothing at all,
         * and three of them were false about live identifiers).
         */
        const describeLive = (live: string | null) =>
          live === null
            ? 'no FK'
            : live === 'a'
              ? 'NO ACTION'
              : live === 'r'
                ? 'RESTRICT'
                : live;

        function userPurgeDivergences(table: string, purge: JournalLifecycleUserPurge): string[] {
          const out: string[] = [];
          const fkKeysOfTable = [...liveFk.keys()].filter((k) => k.startsWith(`${table}.`));
          if (purge.kind === 'not-user-scoped' || purge.kind === 'via-parent') {
            if (fkKeysOfTable.length > 0) {
              out.push(`${table}: declared ${purge.kind}, live FK on ${fkKeysOfTable.join(', ')}`);
            }
            return out;
          }
          if (
            purge.kind === 'staff-authored' ||
            purge.kind === 'self-expiring' ||
            purge.kind === 'purge-blocked' ||
            purge.kind === 'owner-question' ||
            purge.kind === 'absent-retired'
          ) {
            // None of these claim an FK behaviour: they claim the purge deliberately does not reach
            // the column (staff never purged / the row expires on its own / the account is refused
            // outright / the decision is still owed / the relation does not exist). Only a live
            // CASCADING or NULLING FK contradicts that — a NO ACTION/RESTRICT one is exactly what
            // "the purge never targets this" looks like, and treating it as a contradiction was the
            // reason three staff-authored columns could never be declared truthfully at all.
            const contradicting = fkKeysOfTable.filter((k) => {
              const action = liveFk.get(k);
              return action === 'c' || action === 'n';
            });
            if (contradicting.length > 0) {
              out.push(
                `${table}: declared ${purge.kind}, live purge FK on ${contradicting.join(', ')}`,
              );
            }
            return out;
          }
          const k = key(table, purge.column);
          const live = liveFk.get(k) ?? null;
          if (purge.kind === 'phone-keyed') {
            if (live) out.push(`${k}: declared phone-keyed, live FK ${live}`);
            return out;
          }
          if (purge.kind === 'explicit-delete') {
            if (!EXPLICIT_DELETE_KEYS.has(k)) {
              out.push(`${k}: declared explicit-delete, absent from CONTENT_TABLES`);
            }
            return out;
          }
          if (purge.kind === 'deferred-delete') {
            // The honest half-way house: the row IS deleted, but after commit and only once its
            // external object is gone, so it must NOT be in `CONTENT_TABLES` — the physical proof of
            // this kind is the artifact-collection case below, not a row count inside the tx.
            if (EXPLICIT_DELETE_KEYS.has(k)) {
              out.push(
                `${k}: declared deferred-delete, but CONTENT_TABLES deletes it inside the transaction`,
              );
            }
            return out;
          }
          if (purge.kind === 'explicit-anonymise') {
            // Mirror of explicit-delete: the declaration is only true if the purge really names the
            // table+column it promises to null.
            if (!EXPLICIT_ANONYMISE_KEYS.has(k)) {
              out.push(`${k}: declared explicit-anonymise, absent from ANONYMISE_ON_PURGE_COLUMNS`);
            }
            return out;
          }
          const expected = purge.kind === 'cascade' ? 'c' : 'n';
          if (live !== expected) {
            out.push(`${k}: declared ${purge.kind}, live ${describeLive(live)}`);
          }
          return out;
        }

        /* Organization purge, same treatment: a written `organization_id` claim must be something
         the database will really perform (audit F3 — four of them were refusals or no-ops). */
        const orgFk = new Map(
          orgFkRows.rows.map((row) => [key(row.relation ?? '', row.column ?? ''), row.on_delete]),
        );
        const orgColumns = new Set(orgColumnRows.rows.map((row) => row.relation ?? ''));
        function orgPurgeDivergences(table: string, purge: JournalLifecycleOrgPurge): string[] {
          const out: string[] = [];
          if (purge.kind === 'organization_id') {
            if (!orgColumns.has(table)) {
              out.push(`${table}: declared orgPurge organization_id, no such column`);
              return out;
            }
            const live = orgFk.get(key(table, 'organization_id')) ?? null;
            if (live !== 'c') {
              out.push(
                `${table}.organization_id: declared org cascade, live ${describeLive(live)}`,
              );
            }
            return out;
          }
          if (purge.kind === 'org-anonymised') {
            const live = orgFk.get(key(table, purge.column)) ?? null;
            if (live !== 'n') {
              out.push(
                `${table}.${purge.column}: declared org tombstone, live ${describeLive(live)}`,
              );
            }
            return out;
          }
          if (purge.kind === 'not-org-scoped') {
            const hits = [...orgFk.keys()].filter((k) => k.startsWith(`${table}.`));
            if (hits.length > 0) {
              out.push(`${table}: declared not-org-scoped, live organization FK on ${hits.join(', ')}`);
            }
          }
          return out;
        }

        const divergences: string[] = [];
        let structuredDecisionsChecked = 0;
        for (const entry of JOURNAL_LIFECYCLE_REGISTRY) {
          divergences.push(...userPurgeDivergences(entry.table, entry.userPurge));
          divergences.push(...orgPurgeDivergences(entry.table, entry.orgPurge));
        }
        for (const [table, decision] of Object.entries(JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS)) {
          structuredDecisionsChecked += 1;
          divergences.push(...userPurgeDivergences(table, decision.userPurge));
          divergences.push(...orgPurgeDivergences(table, decision.orgPurge));
        }

        /* Phone-keyed stores come from the registry, not from a hand list. */
        const phoneKeyedEntries = JOURNAL_LIFECYCLE_REGISTRY.filter(
          (entry) => entry.userPurge.kind === 'phone-keyed',
        ).map((entry) => ({
          relation: entry.table,
          column: (entry.userPurge as { column: string }).column,
        }));

        /* Children reachable only through a relation the purge empties. */
        const goneRelations = [
          ...new Set(surfaces.filter((s) => s.expectation === 'gone').map((s) => s.relation)),
        ];
        const viaParentRows = await client.probe(`
        SELECT nc.nspname || '.' || cc.relname AS child,
               np.nspname || '.' || pc.relname AS parent,
               ca.attname                      AS child_column,
               pa.attname                      AS parent_column
          FROM pg_constraint con
          JOIN pg_class cc ON cc.oid = con.conrelid
          JOIN pg_namespace nc ON nc.oid = cc.relnamespace
          JOIN pg_class pc ON pc.oid = con.confrelid
          JOIN pg_namespace np ON np.oid = pc.relnamespace
          JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
          JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = k.ord
          JOIN pg_attribute ca ON ca.attrelid = cc.oid AND ca.attnum = k.attnum
          JOIN pg_attribute pa ON pa.attrelid = pc.oid AND pa.attnum = fk.attnum
         WHERE con.contype = 'f'
           AND con.confdeltype = 'c'
           AND np.nspname || '.' || pc.relname IN (${goneRelations.map(catalogLiteral).join(', ')})
           AND nc.nspname || '.' || cc.relname <> np.nspname || '.' || pc.relname`);
        /* A chain is a chain at ANY depth: `treatment_program_instance_stage_items` reaches the
           person through `…_stages` through `…_instances`, and a one-level check called that true
           declaration false. Every cascading edge in the database, closed over the relations the
           purge empties. */
        const cascadeEdgeRows = await client.probe(`
        SELECT nc.nspname || '.' || cc.relname AS child,
               np.nspname || '.' || pc.relname AS parent
          FROM pg_constraint con
          JOIN pg_class cc ON cc.oid = con.conrelid
          JOIN pg_namespace nc ON nc.oid = cc.relnamespace
          JOIN pg_class pc ON pc.oid = con.confrelid
          JOIN pg_namespace np ON np.oid = pc.relnamespace
         WHERE con.contype = 'f'
           AND con.confdeltype = 'c'
           AND nc.nspname || '.' || cc.relname <> np.nspname || '.' || pc.relname`);
        const cascadeParentsOf = new Map<string, Set<string>>();
        const cascadeChildrenOf = new Map<string, string[]>();
        for (const row of cascadeEdgeRows.rows) {
          const child = row.child ?? '';
          const parent = row.parent ?? '';
          cascadeParentsOf.set(child, (cascadeParentsOf.get(child) ?? new Set()).add(parent));
          cascadeChildrenOf.set(parent, [...(cascadeChildrenOf.get(parent) ?? []), child]);
        }
        const goneWithTheUser = new Set(goneRelations);
        const frontier = [...goneRelations];
        while (frontier.length > 0) {
          const parent = frontier.pop()!;
          for (const child of cascadeChildrenOf.get(parent) ?? []) {
            if (goneWithTheUser.has(child)) continue;
            goneWithTheUser.add(child);
            frontier.push(child);
          }
        }
        const declaredViaParent: { table: string; parent: string }[] = [
          ...JOURNAL_LIFECYCLE_REGISTRY.filter((e) => e.userPurge.kind === 'via-parent').map((e) => ({
            table: e.table,
            parent: (e.userPurge as { parent: string }).parent,
          })),
          // Audit F5 again: the 164 structured decisions lean on `via-parent` far more heavily than
          // the registry does (every schedule and configuration row), and none of those chains was
          // ever walked.
          ...Object.entries(JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS)
            .filter(([, d]) => d.userPurge.kind === 'via-parent')
            .map(([table, d]) => ({ table, parent: (d.userPurge as { parent: string }).parent })),
        ];
        for (const declared of declaredViaParent) {
          if (!goneWithTheUser.has(declared.parent)) {
            divergences.push(
              `${declared.table}: declared via-parent ${declared.parent}, parent is not purge-gone`,
            );
          } else if (!(cascadeParentsOf.get(declared.table)?.has(declared.parent) ?? false)) {
            divergences.push(
              `${declared.table}: declared via-parent ${declared.parent}, live cascading path absent`,
            );
          }
        }
        const cascadeChildrenOfPurged = [
          ...new Set(viaParentRows.rows.map((row) => row.child ?? '')),
        ].sort();
        const parentUserColumn = new Map(
          surfaces.filter((s) => s.expectation === 'gone').map((s) => [s.relation, s.column]),
        );
        const viaParents: ViaParent[] = viaParentRows.rows
          .map((row) => {
            const child = row.child ?? '';
            const parent = row.parent ?? '';
            const userColumn = parentUserColumn.get(parent);
            if (!userColumn) return null;
            return {
              child,
              parent,
              join:
                `FROM ${quoteIdent(child)} ch JOIN ${quoteIdent(parent)} p ` +
                `ON p.${quoteIdent(row.parent_column ?? '')} = ch.${quoteIdent(row.child_column ?? '')} ` +
                `WHERE p.${quoteIdent(userColumn)}::text = $1`,
            };
          })
          .filter((v): v is ViaParent => v !== null);

        /* ── choose a real client with real facts; absence is a red fixture, never a skip ── */
        const cascadeSurfaces = surfaces.filter(
          (s) => s.onDelete === 'c' && s.expectation === 'gone',
        );
        const explicitSurfaces = surfaces.filter(
          (s) => s.expectation === 'gone' && s.onDelete !== 'c',
        );
        const anonymisedSurfaces = surfaces.filter((s) => s.expectation === 'anonymised');
        const classUnion = (list: Surface[], label: string) =>
          list
            .map(
              (s) =>
                `SELECT '${label}' AS cls, ${quoteIdent(s.column)}::text AS uid, count(*) AS n ` +
                `FROM ${quoteIdent(s.relation)} WHERE ${quoteIdent(s.column)} IS NOT NULL GROUP BY 2`,
            )
            .join('\nUNION ALL\n');

        const ranked = await client.probe(`
        WITH f AS (
${classUnion(cascadeSurfaces, 'cascade')}
UNION ALL
${classUnion(explicitSurfaces, 'explicit')}
UNION ALL
${classUnion(anonymisedSurfaces, 'anonymised')}
        )
        SELECT f.uid AS uid,
               count(DISTINCT f.cls) AS classes,
               sum(f.n) AS rows_total
          FROM f
          JOIN public.platform_users pu ON pu.id::text = f.uid
         WHERE pu.role = 'client'
           AND ${NOT_AN_IDENTITY_ROOT_SQL}
         GROUP BY 1
        HAVING count(DISTINCT f.cls) = 3
         ORDER BY sum(f.n) DESC, f.uid ASC
         LIMIT 40`);

        let chosen: string | null = null;
        let chosenPhone: { relation: string; column: string; before: number }[] = [];
        let chosenViaParent: { child: string; parent: string; before: number }[] = [];
        const shortfalls: string[] = [];
        for (const row of ranked.rows) {
          const uid = row.uid ?? '';
          const phoneRow = await client.probe(
            `SELECT regexp_replace(uc.value_normalized, '\\D', '', 'g') AS digits
             FROM public.user_contacts uc
            WHERE uc.platform_user_id::text = $1 AND uc.contact_kind = 'phone' AND uc.is_primary
            LIMIT 1`,
            [uid],
          );
          const digits = phoneRow.rows[0]?.digits ?? '';
          const phoneCounts: { relation: string; column: string; before: number }[] = [];
          if (digits) {
            for (const store of phoneKeyedEntries) {
              const res = await client.probe(
                `SELECT count(*) AS n FROM ${quoteIdent(store.relation)} ` +
                  `WHERE regexp_replace(${quoteIdent(store.column)}, '\\D', '', 'g') = $1`,
                [digits],
              );
              phoneCounts.push({ ...store, before: asInt(res.rows[0]?.n ?? null) });
            }
          }
          const viaCounts: { child: string; parent: string; before: number }[] = [];
          for (const via of viaParents) {
            const res = await client.probe(`SELECT count(*) AS n ${via.join}`, [uid]);
            viaCounts.push({
              child: via.child,
              parent: via.parent,
              before: asInt(res.rows[0]?.n ?? null),
            });
          }
          const missing: string[] = [];
          if (!phoneCounts.some((p) => p.before > 0)) missing.push('phone-keyed');
          if (!viaCounts.some((v) => v.before > 0)) missing.push('via-parent');
          if (missing.length === 0) {
            chosen = uid;
            chosenPhone = phoneCounts;
            chosenViaParent = viaCounts;
            break;
          }
          shortfalls.push(`${uid}: no live ${missing.join(' / ')} fact`);
        }

        if (!chosen) {
          throw new Error(
            `fixture missing: no 'client' on ${DATABASE} carries a live fact of every purge class ` +
              `(cascade, explicit-delete, anonymised, phone-keyed, via-parent). Checked ` +
              `${ranked.rows.length} candidates:\n${shortfalls.join('\n')}`,
          );
        }

        /* Same row shape the product loads before purging (`loadUserRow` in strictPlatformUserPurge). */
        const user = await loadPurgeUser(chosen);
        if (user.role !== 'client') {
          throw new Error(
            `fixture missing: chosen row is role='${user.role}', purge accepts 'client' only`,
          );
        }

        /* ── one transaction, always rolled back ── */
        const before = new Map<string, Counts>();
        const after = new Map<string, Counts>();
        const restored = new Map<string, Counts>();
        const phoneAfter = new Map<string, number>();
        const phoneRestored = new Map<string, number>();
        const viaAfter = new Map<string, number>();
        const viaRestored = new Map<string, number>();
        const digits = user.phone_normalized ? phoneDigits(user.phone_normalized) : '';
        const jsonScrubLeftovers: string[] = [];
        let advisoryLockHeld = false;

        await client.probe('BEGIN ISOLATION LEVEL REPEATABLE READ');
        try {
          for (const [k, v] of await countsFor(surfaces, user.id)) before.set(k, v);

          const asPoolClient = client as unknown as PoolClient;
          await pgAdvisoryXactLock(asPoolClient, user.id);
          const advisoryLock = await client.probe(
            `SELECT count(*) AS n FROM pg_locks
            WHERE pid = pg_backend_pid()
              AND locktype = 'advisory'
              AND mode = 'ExclusiveLock'
              AND granted`,
          );
          advisoryLockHeld = asInt(advisoryLock.rows[0]?.n ?? null) > 0;
          await collectPurgeArtifactKeys(asPoolClient, user.id);
          await runWebappPurgeCoreInTransaction(asPoolClient, user);

          for (const [k, v] of await countsFor(surfaces, user.id)) after.set(k, v);
          /* The delivery journal keeps its row and its outcome; what it must NOT keep is the raw
             uuid embedded anywhere in the retained document (audit 2026-08-28, F1). Measured on the
             whole jsonb text, the same way the audit measured the defect. */
          for (const scrubKey of SCRUB_JSON_KEYS) {
            const dot = scrubKey.lastIndexOf('.');
            const relation = scrubKey.slice(0, dot);
            const column = scrubKey.slice(dot + 1);
            const res = await client.probe(
              `SELECT count(*) AS n FROM ${quoteIdent(relation)} ` +
                `WHERE position($1 in ${quoteIdent(column)}::text) > 0`,
              [user.id],
            );
            const left = asInt(res.rows[0]?.n ?? null);
            if (left > 0) jsonScrubLeftovers.push(`${scrubKey}: ${left} documents still embed the id`);
          }
          for (const store of chosenPhone) {
            const res = await client.probe(
              `SELECT count(*) AS n FROM ${quoteIdent(store.relation)} ` +
                `WHERE regexp_replace(${quoteIdent(store.column)}, '\\D', '', 'g') = $1`,
              [digits],
            );
            phoneAfter.set(key(store.relation, store.column), asInt(res.rows[0]?.n ?? null));
          }
          for (const via of viaParents) {
            const res = await client.probe(`SELECT count(*) AS n ${via.join}`, [user.id]);
            viaAfter.set(viaKey(via.child, via.parent), asInt(res.rows[0]?.n ?? null));
          }
        } finally {
          await client.probe('ROLLBACK');
        }

        for (const [k, v] of await countsFor(surfaces, user.id)) restored.set(k, v);
        for (const store of chosenPhone) {
          const res = await client.probe(
            `SELECT count(*) AS n FROM ${quoteIdent(store.relation)} ` +
              `WHERE regexp_replace(${quoteIdent(store.column)}, '\\D', '', 'g') = $1`,
            [digits],
          );
          phoneRestored.set(key(store.relation, store.column), asInt(res.rows[0]?.n ?? null));
        }
        for (const via of viaParents) {
          const res = await client.probe(`SELECT count(*) AS n ${via.join}`, [user.id]);
          viaRestored.set(viaKey(via.child, via.parent), asInt(res.rows[0]?.n ?? null));
        }

        /* A second existing client proves non-empty artifact capture. It is selected dynamically and
         purged in its own rollback-only transaction; no fixture row or disposable database exists. */
        const artifactCandidate = await client.probe(`
        SELECT pu.id::text AS uid,
               (SELECT count(*) FROM public.media_files m WHERE m.uploaded_by = pu.id)
             + (SELECT count(*) FROM public.patient_files p WHERE p.patient_user_id = pu.id)
             + (SELECT count(*) FROM public.online_intake_attachments a
                  JOIN public.online_intake_requests r ON r.id = a.request_id
                 WHERE r.user_id = pu.id) AS artifact_count
          FROM public.platform_users pu
         WHERE pu.role = 'client'
           AND ${NOT_AN_IDENTITY_ROOT_SQL}
         ORDER BY artifact_count DESC, pu.id
         LIMIT 1`);
        const artifactUserId = artifactCandidate.rows[0]?.uid ?? '';
        if (asInt(artifactCandidate.rows[0]?.artifact_count ?? null) === 0) {
          throw new Error(
            `fixture missing: no 'client' on ${DATABASE} owns an external artifact`,
          );
        }
        const artifactUser = await loadPurgeUser(artifactUserId);
        if (artifactUser.role !== 'client') {
          throw new Error(
            `fixture missing: artifact row is role='${artifactUser.role}', purge accepts 'client' only`,
          );
        }

        let artifact: PurgeArtifactKeys = {
          intakeS3Keys: [],
          mediaFiles: [],
          patientFileS3Keys: [],
        };
        let artifactExpected = { mediaFileIds: [] as string[], patientFileKeys: 0, intakeKeys: 0 };
        let artifactBefore: ArtifactCounts = {
          mediaOwnerRefs: 0,
          patientFiles: 0,
          intakeAttachments: 0,
        };
        let artifactAfter: ArtifactCounts = {
          mediaOwnerRefs: 0,
          patientFiles: 0,
          intakeAttachments: 0,
        };

        await client.probe('BEGIN ISOLATION LEVEL REPEATABLE READ');
        try {
          artifactBefore = await measureArtifactCounts(artifactUser.id);
          artifactExpected = await measureExpectedArtifacts(artifactUser.id);
          const asPoolClient = client as unknown as PoolClient;
          await pgAdvisoryXactLock(asPoolClient, artifactUser.id);
          artifact = await collectPurgeArtifactKeys(asPoolClient, artifactUser.id);
          await runWebappPurgeCoreInTransaction(asPoolClient, artifactUser);
          artifactAfter = await measureArtifactCounts(artifactUser.id);
        } finally {
          await client.probe('ROLLBACK');
        }
        const artifactRestored = await measureArtifactCounts(artifactUser.id);

        /* ── a divergence caused by an unapplied forward migration is named, not swallowed ──
         This managed database is not always at the branch's head: the ledger below is the live
         `drizzle.__drizzle_migrations`, and a migration file this branch carries but the database
         has never seen genuinely explains a constraint that does not match its declaration yet. The
         excuse is mechanical and expires by itself — once the migration lands, it is no longer
         pending, and the divergence becomes unexplained and red. */
        const ledger = await client.probe('SELECT tag FROM drizzle.__drizzle_migrations');
        const appliedTags = new Set(ledger.rows.map((row) => row.tag ?? ''));
        const migrationsDir = path.join(REPO_ROOT, 'apps/webapp/db/drizzle-migrations');
        const pendingMigrations = (await readdir(migrationsDir))
          .filter((name) => name.endsWith('.sql'))
          .filter((name) => !appliedTags.has(name.replace(/\.sql$/u, '')))
          .sort();
        const pendingSql = new Map<string, string>();
        for (const name of pendingMigrations) {
          pendingSql.set(name, await readFile(path.join(migrationsDir, name), 'utf8'));
        }
        /** The declared `ON DELETE` a divergence line asked for, and the relation it asked it of. */
        function explainingMigration(divergence: string): string | null {
          const match = /^([a-z_]+\.[a-z_]+)\.([a-z_]+): declared (cascade|anonymised|org cascade|org tombstone),/u.exec(
            divergence,
          );
          if (!match) return null;
          const [, relation, column, kind] = match;
          const wanted = kind === 'cascade' || kind === 'org cascade' ? 'CASCADE' : 'SET NULL';
          const table = (relation ?? '').replace(/^public\./u, '');
          for (const [name, sqlText] of pendingSql) {
            const normalized = sqlText.replace(/\s+/gu, ' ');
            const installs = new RegExp(
              `ALTER TABLE (?:public\\.)?${table}[^;]*FOREIGN KEY \\([^)]*\\b${column}\\b[^)]*\\)[^;]*ON DELETE ${wanted}`,
              'iu',
            );
            if (installs.test(normalized)) return name;
          }
          return null;
        }
        const unexplainedDivergences: string[] = [];
        const pendingSchemaDivergences: string[] = [];
        for (const divergence of divergences) {
          const migration = explainingMigration(divergence);
          if (migration) pendingSchemaDivergences.push(`${divergence} — pending ${migration}`);
          else unexplainedDivergences.push(divergence);
        }

        /* ── the FK-free anonymise classes actually exercised on real rows ── */
        const provenExplicitAnonymise = [...EXPLICIT_ANONYMISE_KEYS]
          .filter((k) => (before.get(k)?.referencing ?? 0) > 0)
          .sort();

        report = {
          database: live,
          user,
          advisoryLockHeld,
          phoneDigits: user.phone_normalized ? phoneDigits(user.phone_normalized) : '',
          artifact,
          artifactExpected,
          artifactBefore,
          artifactAfter,
          artifactRestored,
          surfaces,
          before,
          after,
          restored,
          phoneKeyed: chosenPhone.map((p) => ({
            ...p,
            after: phoneAfter.get(key(p.relation, p.column)) ?? -1,
            restored: phoneRestored.get(key(p.relation, p.column)) ?? -1,
          })),
          viaParent: chosenViaParent.map((v) => ({
            ...v,
            after: viaAfter.get(viaKey(v.child, v.parent)) ?? -1,
            restored: viaRestored.get(viaKey(v.child, v.parent)) ?? -1,
          })),
          cascadeChildrenOfPurged,
          registryDivergences: unexplainedDivergences.sort(),
          pendingSchemaDivergences: pendingSchemaDivergences.sort(),
          structuredDecisionsChecked,
          jsonScrubLeftovers,
          provenExplicitAnonymise,
        };
      } catch (error) {
        setupError = error;
      }
    }, 600_000);

    afterAll(async () => {
      await client.stop();
    });

    it('ran the purge core on the named database against a real client with real facts', () => {
      expect(
        setupError,
        String(setupError instanceof Error ? setupError.stack : setupError),
      ).toBeNull();
      expect(report.database).toBe(DATABASE);
      expect(report.user.role).toBe('client');
      expect(report.user.id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(
        report.advisoryLockHeld,
        'the production advisory lock is not held by this transaction',
      ).toBe(true);
      const touched = [...report.before.values()].filter((c) => c.referencing > 0).length;
      expect(
        touched,
        'fixture missing: the chosen client has no related facts at all',
      ).toBeGreaterThan(10);
    });

    it('leaves no relation of the live FK graph referencing the purged person', () => {
      expect(setupError).toBeNull();
      const leftovers = report.surfaces
        .map((s) => ({ s, after: report.after.get(key(s.relation, s.column))! }))
        .filter((x) => x.after.referencing > 0)
        .map(
          (x) =>
            `${key(x.s.relation, x.s.column)}: ${x.after.referencing} rows still reference the user`,
        );
      expect(leftovers).toEqual([]);
    });

    it('deletes the rows of every relation the purge names or the database cascades', () => {
      expect(setupError).toBeNull();
      const proven: string[] = [];
      const wrong: string[] = [];
      for (const surface of report.surfaces) {
        if (surface.expectation !== 'gone') continue;
        const k = key(surface.relation, surface.column);
        const b = report.before.get(k)!;
        const a = report.after.get(k)!;
        if (b.referencing === 0) continue;
        proven.push(k);
        if (a.total !== b.total - b.referencing) {
          wrong.push(`${k}: ${b.referencing} referencing rows, total ${b.total} → ${a.total}`);
        }
      }
      expect(wrong).toEqual([]);
      // The audit §C1 relation has no FK at all: only the explicit DELETE can empty it.
      expect(proven).toContain('public.reminder_occurrence_history.platform_user_id');
      // A relation whose FK would merely have nulled the column must still lose its rows.
      expect(
        report.surfaces.some(
          (s) =>
            s.expectation === 'gone' &&
            s.onDelete === 'n' &&
            (report.before.get(key(s.relation, s.column))?.referencing ?? 0) > 0,
        ),
        'fixture missing: no live fact proves explicit delete beating ON DELETE SET NULL',
      ).toBe(true);
    });

    it('keeps ON DELETE SET NULL rows alive and de-identified', () => {
      expect(setupError).toBeNull();
      /* A relation can be an anonymised surface by one column and still lose rows through a cascading
       parent the purge empties — `treatment_program_events` is de-identified by `actor_id` while the
       person's own program events die with `treatment_program_instances`. The row-survival half of
       the claim is therefore asserted only where no such parent exists; de-identification is
       asserted everywhere. */
      const alsoDiesWithParent = new Set(report.cascadeChildrenOfPurged);
      const provenSurvival: string[] = [];
      const wrong: string[] = [];
      for (const surface of report.surfaces) {
        if (surface.expectation !== 'anonymised') continue;
        const k = key(surface.relation, surface.column);
        const b = report.before.get(k)!;
        const a = report.after.get(k)!;
        if (b.referencing === 0) continue;
        if (a.referencing !== 0) wrong.push(`${k}: still references the user`);
        if (alsoDiesWithParent.has(surface.relation)) {
          if (a.total > b.total) wrong.push(`${k}: rows appeared, total ${b.total} → ${a.total}`);
          continue;
        }
        provenSurvival.push(k);
        // `platform_users` is the ONE relation on this list whose own row is the purge target, so
        // its total is expected to fall by exactly that one row — the self-referencing
        // `merged_into_id` surface. Audit 2026-08-28, F5: the proof asserted `total` unchanged and
        // went red on `304 → 303`, i.e. it reported the purge working as a defect.
        const expectedTotal = surface.relation === 'public.platform_users' ? b.total - 1 : b.total;
        if (a.total !== expectedTotal)
          wrong.push(`${k}: rows disappeared, total ${b.total} → ${a.total}`);
      }
      expect(wrong).toEqual([]);
      expect(
        provenSurvival.length,
        'fixture missing: no live anonymised fact outside a cascading parent',
      ).toBeGreaterThan(0);
    });

    /**
     * WHAT BREAKS WITHOUT THIS: the columns the purge promises to NULL carry no FK, so the live
     * constraint graph cannot see them and every earlier run silently proved nothing about them —
     * audit 2026-08-28, F5. `specialist_tasks.patient_user_id`, both accounting columns and the
     * delivery journal's two identity columns are exactly the surfaces the last two audits found
     * false, and they are the ones a purely FK-derived proof will always miss.
     */
    it('really de-identifies the FK-free columns the purge promises to null', () => {
      expect(setupError).toBeNull();
      const wrong: string[] = [];
      for (const k of EXPLICIT_ANONYMISE_KEYS) {
        const b = report.before.get(k);
        const a = report.after.get(k);
        if (!b || !a) {
          wrong.push(`${k}: declared explicit-anonymise but never measured`);
          continue;
        }
        if (b.referencing === 0) continue;
        if (a.referencing !== 0) wrong.push(`${k}: still references the purged person`);
        if (a.total !== b.total) wrong.push(`${k}: rows disappeared, ${b.total} → ${a.total}`);
      }
      expect(wrong).toEqual([]);

      // A class with no live row proves nothing, and "nothing" must not read as "passed": the run
      // reports which FK-free classes carried real rows, and refuses to be vacuous.
      expect(
        report.provenExplicitAnonymise,
        `no live row exercised any FK-free anonymise class on ${DATABASE}; the promise is unproven`,
      ).not.toEqual([]);
    });

    /** The retained delivery journal must keep its outcome and lose the person, everywhere. */
    it('scrubs the raw person id out of the retained delivery documents', () => {
      expect(setupError).toBeNull();
      expect(SCRUB_JSON_KEYS.size, 'no json column is declared for scrubbing').toBeGreaterThan(0);
      expect(
        report.jsonScrubLeftovers,
        'A retained document that still embeds the purged uuid is the same defect as a column that ' +
          'still holds it — audit 2026-08-28, F1, where metadata carried the id of 41 clients.',
      ).toEqual([]);
      expect(PURGED_USER_JSON_TOKEN).not.toMatch(/^[0-9a-f-]{36}$/u);
    });

    /**
     * WHAT BREAKS WITHOUT THIS: the exhaustive census wrote 164 structured decisions and nothing
     * compared a single one of them to the database — audit 2026-08-28, F5. Three were false about
     * live identifiers on the day they were written.
     */
    it('checks every structured non-journal decision, not just the registry', () => {
      expect(setupError).toBeNull();
      expect(
        report.structuredDecisionsChecked,
        'the structured decision surface was not read at all',
      ).toBeGreaterThan(100);
    });

    it('clears the phone-keyed stores by phone digits', () => {
      expect(setupError).toBeNull();
      expect(report.phoneDigits).toMatch(/^\d+$/u);
      const live = report.phoneKeyed.filter((p) => p.before > 0);
      expect(live.length, 'fixture missing: no live phone-keyed fact').toBeGreaterThan(0);
      expect(live.filter((p) => p.after !== 0)).toEqual([]);
    });

    it('removes rows reachable only through a parent the purge empties', () => {
      expect(setupError).toBeNull();
      const live = report.viaParent.filter((v) => v.before > 0);
      expect(live.length, 'fixture missing: no live via-parent fact').toBeGreaterThan(0);
      expect(live.filter((v) => v.after !== 0)).toEqual([]);
    });

    /** This proves capture before the DB core hides the inputs, not post-commit S3/provider cleanup. */
    it('collects a real client external artifact before the DB core hides its source rows', () => {
      expect(setupError).toBeNull();
      const liveArtifactCount =
        report.artifactBefore.mediaOwnerRefs +
        report.artifactBefore.patientFiles +
        report.artifactBefore.intakeAttachments;
      expect(liveArtifactCount, 'fixture missing: artifact proof is vacuous').toBeGreaterThan(0);
      expect(report.artifact.mediaFiles.map((m) => m.id).sort()).toEqual(
        report.artifactExpected.mediaFileIds,
      );
      expect(report.artifact.patientFileS3Keys.length).toBe(
        report.artifactExpected.patientFileKeys,
      );
      expect(report.artifact.intakeS3Keys.length).toBe(report.artifactExpected.intakeKeys);
      expect(report.artifactAfter).toEqual({
        mediaOwnerRefs: 0,
        patientFiles: 0,
        intakeAttachments: 0,
      });
      expect(report.artifactRestored).toEqual(report.artifactBefore);
    });

    it('restores every measured count after the rollback', () => {
      expect(setupError).toBeNull();
      const drift = report.surfaces
        .map((s) => {
          const k = key(s.relation, s.column);
          const b = report.before.get(k)!;
          const r = report.restored.get(k)!;
          return b.referencing === r.referencing && b.total === r.total
            ? null
            : `${k}: ${b.referencing}/${b.total} → ${r.referencing}/${r.total}`;
        })
        .filter((x): x is string => x !== null);
      drift.push(
        ...report.phoneKeyed
          .filter((p) => p.before !== p.restored)
          .map((p) => `${key(p.relation, p.column)} phone-keyed: ${p.before} → ${p.restored}`),
        ...report.viaParent
          .filter((v) => v.before !== v.restored)
          .map((v) => `${viaKey(v.child, v.parent)} via-parent: ${v.before} → ${v.restored}`),
      );
      expect(drift, 'the proof must leave the named database exactly as it found it').toEqual([]);
    });

    it('keeps the written lifecycle registry in step with the live constraint graph', () => {
      expect(setupError).toBeNull();
      // Printed, never hidden: each of these is a constraint this branch already carries as a
      // forward migration the measured database has not been given yet. The line names the exact
      // pending file, and the classification is derived from the live ledger, so it cannot outlive
      // the migration landing.
      if (report.pendingSchemaDivergences.length > 0) {
        console.info(
          `[purge-proof] divergences explained by pending forward migrations on ${report.database}:\n  ` +
            report.pendingSchemaDivergences.join('\n  '),
        );
      }
      expect(
        report.registryDivergences,
        'A registry entry that declares a purge behaviour the database will not perform is a false ' +
          'lifecycle record — audit 2026-08-27 stage 3. Recorded divergences are unresolved defects ' +
          'reported to the owner, not accepted policy; a NEW one must not appear silently.',
      ).toEqual([]);
    });
  },
);

/* ────────────────── delete blockers behind a cascading parent (stage 3 acceptance) ────────────────── */

/**
 * WHAT BREAKS WITHOUT THIS: the account purge is REFUSED by the database for a whole class of real
 * clients, and nothing notices. `platform_users` cascades into a parent row (`org_enrollments`), a
 * third table references THAT parent with `NO ACTION`, and no step of the purge clears it — so the
 * final `DELETE FROM platform_users` raises `23503` and the whole transaction rolls back. The caller
 * gets `transaction_failed`; the person's data stays. The existing proof above cannot see this: it
 * deliberately picks the ONE client that maximises class coverage, and that client happens to have no
 * such row.
 *
 * ORACLE: stage 3 acceptance of `SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` — «живой account
 * purge не оставляет ни одного связанного пользовательского факта вне явно сохранённых по закону».
 * A purge the database refuses leaves ALL of them.
 *
 * The candidate set is derived from the LIVE constraint graph, never from a list written here: every
 * relation that cascades away with `platform_users`, then every `NO ACTION`/`RESTRICT` dependent of
 * such a relation that actually holds rows for a live `role = 'client'` user. Each candidate is then
 * proven BEHAVIOURALLY by running the real production purge core, inside a transaction that is
 * unconditionally rolled back.
 */
describe.skipIf(!ENABLED)('account purge is not refused by a blocking dependent (rollback-only)', () => {
  const blockerClient = new AdminSocketClient();
  let blockedUsers: string[] = [];
  let candidates: { dependent: string; parent: string; constraint: string }[] = [];
  let blockerSetupError: unknown = null;

  beforeAll(async () => {
    blockerClient.start();
    try {
      const current = await blockerClient.probe('SELECT current_database() AS name');
      const live = current.rows[0]?.name ?? '';
      if (live !== DATABASE) {
        throw new Error(`refusing: current_database='${live}', expected '${DATABASE}'`);
      }

      /* Relations the database itself empties when a platform_users row goes away, and the
         dependents of those relations that REFUSE the parent delete instead of following it. */
      const blockers = await blockerClient.probe(`
        WITH cascade_parents AS (
          SELECT DISTINCT con.conrelid AS oid
            FROM pg_constraint con
           WHERE con.contype = 'f'
             AND con.confdeltype = 'c'
             AND con.confrelid = 'public.platform_users'::regclass
        )
        SELECT con.conrelid::regclass::text AS dependent,
               con.confrelid::regclass::text AS parent,
               con.conname                   AS constraint_name
          FROM pg_constraint con
          JOIN cascade_parents cp ON cp.oid = con.confrelid
         WHERE con.contype = 'f'
           AND con.confdeltype IN ('a', 'r')
         ORDER BY 1, 3`);

      candidates = blockers.rows.map((r) => ({
        dependent: r.dependent ?? '',
        parent: r.parent ?? '',
        constraint: r.constraint_name ?? '',
      }));

      const failures: string[] = [];
      for (const candidate of candidates) {
        /* One affected client per blocking dependent — the graph names the table, the data names
           the person; neither is written down in this file. BOUND: a dependent that reaches the
           person through a differently named column is skipped, so this probe under-reports rather
           than invents. */
        const affected = await blockerClient.probe(
          `SELECT pu.id::text AS id
             FROM ${quoteIdent(candidate.dependent)} d
             JOIN public.platform_users pu ON pu.id = d.platform_user_id
            WHERE pu.role = 'client'
            LIMIT 1`,
        ).catch(() => ({ rows: [] as Record<string, string | null>[], rowCount: 0 }));
        const userId = affected.rows[0]?.id ?? '';
        if (!userId) continue;

        const user = await loadPurgeUserForBlockerProbe(blockerClient, userId);
        await blockerClient.probe('BEGIN ISOLATION LEVEL REPEATABLE READ');
        try {
          const asPoolClient = blockerClient as unknown as PoolClient;
          await pgAdvisoryXactLock(asPoolClient, user.id);
          await runWebappPurgeCoreInTransaction(asPoolClient, user);
        } catch (error) {
          // A refusal by the identity guard is the CORRECT answer for that person, not a blocking
          // dependent: the account is not purgeable at all while it is also a specialist root, and
          // the guard runs before anything is touched. Proven in its own case below.
          if (!(error instanceof PurgeIdentityRootConflictError)) {
            failures.push(
              `${candidate.dependent} (${candidate.constraint} → ${candidate.parent}): ` +
                `${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
            );
          }
        } finally {
          await blockerClient.probe('ROLLBACK');
        }
      }
      blockedUsers = failures;
    } catch (error) {
      blockerSetupError = error;
    }
  }, 600_000);

  afterAll(async () => {
    await blockerClient.stop();
  });

  it('ran against the named database and found the blocking dependents to probe', () => {
    expect(
      blockerSetupError,
      String(blockerSetupError instanceof Error ? blockerSetupError.stack : blockerSetupError),
    ).toBeNull();
    expect(
      candidates.length,
      'no NO ACTION/RESTRICT dependent of a cascading parent was found — the probe would prove nothing',
    ).toBeGreaterThan(0);
  });

  it('completes the purge core for every client a blocking dependent can reach', () => {
    expect(blockerSetupError).toBeNull();
    expect(
      blockedUsers,
      'The database REFUSED the account purge for a real client: a table references a row that ' +
        'cascades away with platform_users, with ON DELETE NO ACTION, and no purge step clears it. ' +
        'Nothing is deleted at all — stage 3 acceptance of the systemic residual audit 2026-08-27.',
    ).toEqual([]);
  });
});

/** Same shape the purge core needs; read through the same session, no second mechanism. */
async function loadPurgeUserForBlockerProbe(
  session: AdminSocketClient,
  userId: string,
): Promise<PurgePlatformUserRow> {
  const row = await session.probe(
    `SELECT pu.id::text AS id,
            (SELECT uc.value_normalized FROM public.user_contacts uc
              WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary
              LIMIT 1) AS phone_normalized,
            pu.role AS role
       FROM public.platform_users pu
      WHERE pu.id::text = $1`,
    [userId],
  );
  return {
    id: row.rows[0]?.id ?? '',
    phone_normalized: row.rows[0]?.phone_normalized ?? null,
    role: row.rows[0]?.role ?? '',
  };
}

/* ────────────────── a client that is also a specialist root is refused, whole ────────────────── */

/**
 * WHAT BREAKS WITHOUT THIS: `be_specialists.id` IS a `platform_users.id` and carries no FK, so one
 * person can hold both a client account and an active specialist card. Strict purge accepts any
 * `role = 'client'` row, so it deleted the platform identity and left the SAME raw uuid owning an
 * active specialist card, its working hours and its appointments — a half-purged person and a
 * clinic directory pointing at an account that no longer exists. Exhaustive lifecycle census audit
 * 2026-08-28, F2, measured live: 1 active specialist on bcb_webapp_dev whose id belongs to a
 * `role='client'` platform user, with 8 working-hours, 1 service-availability and 12 appointment
 * rows.
 *
 * ORACLE: the live data, not a fixture — the candidate is found by joining `be_specialists` to
 * `platform_users` on the id. If no such person exists on the measured database the case says so
 * and is skipped as vacuous rather than passing quietly.
 *
 * WHAT IS PROVEN: the production core REFUSES before any destructive statement (the doctor's rows
 * are all still there inside the same transaction), and it refuses with a reason a caller can act
 * on rather than a raw constraint violation. As everywhere else here, the transaction is rolled
 * back unconditionally.
 */
describe.skipIf(!ENABLED)('a client that is also a specialist root is refused (rollback-only)', () => {
  const guardClient = new AdminSocketClient();
  let collidingUserId = '';
  let refusal: unknown = null;
  let specialistRowsDuringAttempt = -1;
  let scheduleRowsDuringAttempt = -1;
  let appointmentRowsDuringAttempt = -1;
  let guardSetupError: unknown = null;

  beforeAll(async () => {
    guardClient.start();
    try {
      const current = await guardClient.probe('SELECT current_database() AS name');
      const live = current.rows[0]?.name ?? '';
      if (live !== DATABASE) {
        throw new Error(`refusing: current_database='${live}', expected '${DATABASE}'`);
      }

      const collision = await guardClient.probe(`
        SELECT pu.id::text AS id
          FROM public.be_specialists s
          JOIN public.platform_users pu ON pu.id = s.id
         WHERE pu.role = 'client'
         ORDER BY s.is_active DESC, pu.id
         LIMIT 1`);
      collidingUserId = collision.rows[0]?.id ?? '';
      if (!collidingUserId) return;

      const user = await loadPurgeUserForBlockerProbe(guardClient, collidingUserId);
      await guardClient.probe('BEGIN ISOLATION LEVEL REPEATABLE READ');
      try {
        const asPoolClient = guardClient as unknown as PoolClient;
        await pgAdvisoryXactLock(asPoolClient, user.id);
        await runWebappPurgeCoreInTransaction(asPoolClient, user);
      } catch (error) {
        refusal = error;
      }
      /* Inside the SAME transaction the attempt ran in: nothing of the doctor may have moved. */
      const intact = await guardClient.probe(
        `SELECT (SELECT count(*) FROM public.be_specialists WHERE id::text = $1) AS specialists,
                (SELECT count(*) FROM public.be_working_hours WHERE specialist_id::text = $1) AS schedule,
                (SELECT count(*) FROM public.be_appointments WHERE specialist_id::text = $1) AS appointments`,
        [collidingUserId],
      );
      specialistRowsDuringAttempt = asInt(intact.rows[0]?.specialists ?? null);
      scheduleRowsDuringAttempt = asInt(intact.rows[0]?.schedule ?? null);
      appointmentRowsDuringAttempt = asInt(intact.rows[0]?.appointments ?? null);
      await guardClient.probe('ROLLBACK');
    } catch (error) {
      guardSetupError = error;
      try {
        await guardClient.probe('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
  }, 600_000);

  afterAll(async () => {
    await guardClient.stop();
  });

  it('found a live person who is both a client account and a specialist root', () => {
    expect(
      guardSetupError,
      String(guardSetupError instanceof Error ? guardSetupError.stack : guardSetupError),
    ).toBeNull();
    expect(
      collidingUserId,
      `no client account on ${DATABASE} also owns a specialist root — this case proved nothing`,
    ).not.toBe('');
  });

  it('fails the purge closed with a reason, and leaves specialist, schedule and appointments intact', () => {
    expect(guardSetupError).toBeNull();
    if (!collidingUserId) return;
    expect(
      refusal,
      'the purge core accepted an account that is also an active specialist identity root',
    ).toBeInstanceOf(PurgeIdentityRootConflictError);
    const conflicts = (refusal as PurgeIdentityRootConflictError).conflicts;
    expect(conflicts.join(' ')).toContain('be_specialists.id');
    expect(specialistRowsDuringAttempt).toBe(1);
    // The doctor's own clinic data is not the client's to delete, and the guard runs before the
    // first destructive statement — so these are the counts the refusal left behind, in the same
    // transaction, not counts restored by the rollback.
    expect(scheduleRowsDuringAttempt).toBeGreaterThan(0);
    expect(appointmentRowsDuringAttempt).toBeGreaterThan(0);
  });
});
