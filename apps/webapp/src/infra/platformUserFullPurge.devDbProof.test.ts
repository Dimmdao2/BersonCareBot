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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  CONTENT_TABLES,
  collectPurgeArtifactKeys,
  phoneDigits,
  runWebappPurgeCoreInTransaction,
  type PurgeArtifactKeys,
  type PurgePlatformUserRow,
} from './platformUserFullPurge';
import { pgAdvisoryXactLock } from '@/infra/db/pgAdvisoryLock';
import { JOURNAL_LIFECYCLE_REGISTRY } from '../../../../deploy/postgres/privileges/journal-lifecycle-registry';

const ENABLED = process.env.RUN_PLATFORM_USER_PURGE_DB === '1';

/** Only the named TEST database. AGENTS.md §1b: no disposable database, no DEV, no PROD. */
const TEST_DATABASE = 'bersoncarebot_test';
const DATABASE = process.env.PLATFORM_USER_PURGE_DB ?? TEST_DATABASE;

if (ENABLED && DATABASE !== TEST_DATABASE) {
  throw new Error(
    `refusing to run the account purge proof against '${DATABASE}': only '${TEST_DATABASE}' is allowed`,
  );
}

/**
 * Registry entries whose declared user-purge behaviour contradicts the live FK graph. RECORDED, NOT
 * ACCEPTED: each one declares `anonymised` — "FK with ON DELETE SET NULL, the row survives
 * de-identified on purpose" — while the live constraint is `NO ACTION`, so the database would
 * REFUSE the account delete instead of de-identifying anything. All three are staff-authored stores,
 * so a `role = 'client'` purge does not reach them today; the declaration is still false. Reported
 * to the owner as part of stage 3; the set is asserted so a NEW divergence cannot appear silently.
 */
const RECORDED_REGISTRY_FK_DIVERGENCES = [
  'public.online_intake_status_history.changed_by: declared anonymised, live NO ACTION',
  'public.organization_slug_rename_events.actor_platform_user_id: declared anonymised, live NO ACTION',
  'public.system_settings_audit.changed_by: declared anonymised, live NO ACTION',
];

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

/** `CONTENT_TABLES` names are unqualified; every one of them lives in `public`. */
const EXPLICIT_DELETE_KEYS = new Set(
  CONTENT_TABLES.map((entry) => `public.${entry.table}.${entry.column}`),
);

function expectationFor(relation: string, column: string, onDelete: string | null): Expectation {
  if (EXPLICIT_DELETE_KEYS.has(`${relation}.${column}`)) return 'gone';
  if (onDelete === 'c') return 'gone';
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
  surfaces: Surface[];
  before: Map<string, Counts>;
  after: Map<string, Counts>;
  restored: Map<string, Counts>;
  phoneKeyed: { relation: string; column: string; before: number; after: number; restored: number }[];
  viaParent: { child: string; parent: string; before: number; after: number; restored: number }[];
  /** Relations that also lose rows through a cascading parent the purge empties. */
  cascadeChildrenOfPurged: string[];
  registryDivergences: string[];
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

describe.skipIf(!ENABLED)('account purge core against the live TEST database (rollback-only)', () => {
  beforeAll(async () => {
    client.start();
    try {
      const current = await client.probe('SELECT current_database() AS name');
      const live = current.rows[0]?.name ?? '';
      if (live !== TEST_DATABASE) {
        throw new Error(`refusing: current_database='${live}', expected '${TEST_DATABASE}'`);
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
        return { relation, column, onDelete, expectation: expectationFor(relation, column, onDelete) };
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
      surfaces.sort((a, b) => key(a.relation, a.column).localeCompare(key(b.relation, b.column)));

      /* ORACLE 2 — the registry's written decision must agree with what the database does. */
      const liveFk = new Map(surfaces.filter((s) => s.onDelete).map((s) => [key(s.relation, s.column), s.onDelete!]));
      const divergences: string[] = [];
      for (const entry of JOURNAL_LIFECYCLE_REGISTRY) {
        const purge = entry.userPurge;
        if (purge.kind === 'not-user-scoped' || purge.kind === 'via-parent') {
          const hits = [...liveFk.keys()].filter((k) => k.startsWith(`${entry.table}.`));
          if (hits.length > 0) {
            divergences.push(`${entry.table}: declared ${purge.kind}, live FK on ${hits.join(', ')}`);
          }
          continue;
        }
        const k = key(entry.table, purge.column);
        const live = liveFk.get(k) ?? null;
        if (purge.kind === 'phone-keyed') {
          if (live) divergences.push(`${k}: declared phone-keyed, live FK ${live}`);
          continue;
        }
        if (purge.kind === 'explicit-delete') {
          if (!EXPLICIT_DELETE_KEYS.has(k)) {
            divergences.push(`${k}: declared explicit-delete, absent from CONTENT_TABLES`);
          }
          continue;
        }
        const expected = purge.kind === 'cascade' ? 'c' : 'n';
        if (live !== expected) {
          divergences.push(
            `${k}: declared ${purge.kind}, live ${live === null ? 'no FK' : live === 'a' ? 'NO ACTION' : live === 'r' ? 'RESTRICT' : live}`,
          );
        }
      }

      /* Phone-keyed stores come from the registry, not from a hand list. */
      const phoneKeyedEntries = JOURNAL_LIFECYCLE_REGISTRY.filter(
        (entry) => entry.userPurge.kind === 'phone-keyed',
      ).map((entry) => ({
        relation: entry.table,
        column: (entry.userPurge as { column: string }).column,
      }));

      /* Children reachable only through a relation the purge empties. */
      const goneRelations = [...new Set(surfaces.filter((s) => s.expectation === 'gone').map((s) => s.relation))];
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
      const liveViaParents = new Set(
        viaParentRows.rows.map((row) => viaKey(row.child ?? '', row.parent ?? '')),
      );
      for (const entry of JOURNAL_LIFECYCLE_REGISTRY) {
        const purge = entry.userPurge;
        if (purge.kind !== 'via-parent') continue;
        if (!goneRelations.includes(purge.parent)) {
          divergences.push(
            `${entry.table}: declared via-parent ${purge.parent}, parent is not purge-gone`,
          );
        } else if (!liveViaParents.has(viaKey(entry.table, purge.parent))) {
          divergences.push(
            `${entry.table}: declared via-parent ${purge.parent}, live cascading path absent`,
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
      const cascadeSurfaces = surfaces.filter((s) => s.onDelete === 'c' && s.expectation === 'gone');
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
          viaCounts.push({ child: via.child, parent: via.parent, before: asInt(res.rows[0]?.n ?? null) });
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
          `fixture missing: no 'client' on ${TEST_DATABASE} carries a live fact of every purge class ` +
            `(cascade, explicit-delete, anonymised, phone-keyed, via-parent). Checked ` +
            `${ranked.rows.length} candidates:\n${shortfalls.join('\n')}`,
        );
      }

      /* Same row shape the product loads before purging (`loadUserRow` in strictPlatformUserPurge). */
      const userRow = await client.probe(
        `SELECT pu.id::text AS id,
                (SELECT uc.value_normalized FROM public.user_contacts uc
                  WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary
                  LIMIT 1) AS phone_normalized,
                pu.integrator_user_id::text AS integrator_user_id,
                pu.role AS role
           FROM public.platform_users pu
          WHERE pu.id::text = $1`,
        [chosen],
      );
      const user: PurgePlatformUserRow = {
        id: userRow.rows[0]?.id ?? '',
        phone_normalized: userRow.rows[0]?.phone_normalized ?? null,
        integrator_user_id: userRow.rows[0]?.integrator_user_id ?? null,
        role: userRow.rows[0]?.role ?? '',
      };
      if (user.role !== 'client') {
        throw new Error(`fixture missing: chosen row is role='${user.role}', purge accepts 'client' only`);
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
      let advisoryLockHeld = false;
      let artifact: PurgeArtifactKeys = { intakeS3Keys: [], mediaFiles: [], patientFileS3Keys: [] };
      let artifactExpected = { mediaFileIds: [] as string[], patientFileKeys: 0, intakeKeys: 0 };

      await client.probe('BEGIN ISOLATION LEVEL REPEATABLE READ');
      try {
        for (const [k, v] of await countsFor(surfaces, user.id)) before.set(k, v);

        const expectedMedia = await client.probe(
          `SELECT m.id::text AS id FROM public.media_files m WHERE m.uploaded_by::text = $1
           UNION
           SELECT p.media_file_id::text FROM public.patient_files p
            WHERE p.patient_user_id::text = $1 AND p.media_file_id IS NOT NULL`,
          [user.id],
        );
        const expectedPatientFiles = await client.probe(
          `SELECT count(*) AS n FROM public.patient_files
            WHERE patient_user_id::text = $1 AND s3_key IS NOT NULL AND s3_key <> ''`,
          [user.id],
        );
        const expectedIntake = await client.probe(
          `SELECT count(*) AS n FROM public.online_intake_attachments a
             JOIN public.online_intake_requests r ON r.id = a.request_id
            WHERE r.user_id::text = $1 AND a.s3_key IS NOT NULL AND a.s3_key <> ''`,
          [user.id],
        );
        artifactExpected = {
          mediaFileIds: expectedMedia.rows.map((row) => row.id ?? '').sort(),
          patientFileKeys: asInt(expectedPatientFiles.rows[0]?.n ?? null),
          intakeKeys: asInt(expectedIntake.rows[0]?.n ?? null),
        };

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
        artifact = await collectPurgeArtifactKeys(asPoolClient, user.id);
        await runWebappPurgeCoreInTransaction(asPoolClient, user);

        for (const [k, v] of await countsFor(surfaces, user.id)) after.set(k, v);
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

      report = {
        database: live,
        user,
        advisoryLockHeld,
        phoneDigits: user.phone_normalized ? phoneDigits(user.phone_normalized) : '',
        artifact,
        artifactExpected,
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
        registryDivergences: divergences.sort(),
      };
    } catch (error) {
      setupError = error;
    }
  }, 600_000);

  afterAll(async () => {
    await client.stop();
  });

  it('ran the purge core on the named TEST database against a real client with real facts', () => {
    expect(setupError, String(setupError instanceof Error ? setupError.stack : setupError)).toBeNull();
    expect(report.database).toBe(TEST_DATABASE);
    expect(report.user.role).toBe('client');
    expect(report.user.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(report.advisoryLockHeld, 'the production advisory lock is not held by this transaction').toBe(
      true,
    );
    const touched = [...report.before.values()].filter((c) => c.referencing > 0).length;
    expect(touched, 'fixture missing: the chosen client has no related facts at all').toBeGreaterThan(10);
  });

  it('leaves no relation of the live FK graph referencing the purged person', () => {
    expect(setupError).toBeNull();
    const leftovers = report.surfaces
      .map((s) => ({ s, after: report.after.get(key(s.relation, s.column))! }))
      .filter((x) => x.after.referencing > 0)
      .map((x) => `${key(x.s.relation, x.s.column)}: ${x.after.referencing} rows still reference the user`);
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
      if (a.total !== b.total) wrong.push(`${k}: rows disappeared, total ${b.total} → ${a.total}`);
    }
    expect(wrong).toEqual([]);
    expect(
      provenSurvival.length,
      'fixture missing: no live anonymised fact outside a cascading parent',
    ).toBeGreaterThan(0);
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

  /**
   * NOT A PROOF OF MEDIA CLEANUP. `collectPurgeArtifactKeys` runs here because the product requires
   * it inside the transaction, before the deletes that hide its inputs — this case only asserts that
   * what it collected agrees exactly with an independent count taken in the same transaction. On the
   * current TEST data no `client` that carries a live fact of every purge class owns any media,
   * `patient_files` or intake attachment (measured: 187 `media_files`, 4 `patient_files`, 0 intake
   * attachments in the whole database, none of them belonging to such a user), so the agreement is
   * over empty sets and proves nothing about media. External-artifact cleanup is post-commit work
   * and lies outside this transaction anyway.
   */
  it('collects exactly the external artifacts the same transaction can see', () => {
    expect(setupError).toBeNull();
    expect(report.artifact.mediaFiles.map((m) => m.id).sort()).toEqual(
      report.artifactExpected.mediaFileIds,
    );
    expect(report.artifact.patientFileS3Keys.length).toBe(report.artifactExpected.patientFileKeys);
    expect(report.artifact.intakeS3Keys.length).toBe(report.artifactExpected.intakeKeys);
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
    expect(drift, 'the proof must leave the TEST database exactly as it found it').toEqual([]);
  });

  it('keeps the written lifecycle registry in step with the live constraint graph', () => {
    expect(setupError).toBeNull();
    expect(
      report.registryDivergences,
      'A registry entry that declares a purge behaviour the database will not perform is a false ' +
        'lifecycle record — audit 2026-08-27 stage 3. Recorded divergences are unresolved defects ' +
        'reported to the owner, not accepted policy; a NEW one must not appear silently.',
    ).toEqual(RECORDED_REGISTRY_FK_DIVERGENCES);
  });
});
