import { sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  applyDbPrincipalToTransaction,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromTransaction,
  getCurrentDbPrincipal,
  runWithDbPrincipalSnapshot,
  type DbPrincipal,
  type DbPrincipalApplyOptions,
} from '@bersoncare/db-principal';
import { hashPortTypedArgs } from '@bersoncare/db-principal';
import * as schema from '../../../db/schema';
import { getPool } from './client';
import {
  reportDbCleanupFailure,
  reportDbQueryFailure,
  reportPrincipalSetupFailure,
} from '@/infra/db/saasIsolationDbFailureReporting';
import {
  createWebappPortContextRuntimeConfig,
  webappPortContextPrincipal,
} from '@/infra/db/portContextRuntime';

export type DrizzleDb = NodePgDatabase<typeof schema>;
type DrizzleTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];
type DrizzlePrincipalResult = { rows?: readonly Record<string, unknown>[] };

let db: DrizzleDb | null = null;

function drizzlePrincipalSql(queryText: string, values: readonly unknown[] = []): SQL {
  switch (queryText) {
    case 'SELECT pg_backend_pid() AS backend_pid':
      return sql`SELECT pg_backend_pid() AS backend_pid`;
    case 'RESET ROLE':
      return sql.raw('RESET ROLE');
    case 'SET ROLE app_staff':
      return sql.raw('SET ROLE app_staff');
    case 'SET ROLE app_patient':
      return sql.raw('SET ROLE app_patient');
    case 'SET ROLE app_platform_settings':
      return sql.raw('SET ROLE app_platform_settings');
    case 'SET ROLE app_clinic_billing':
      return sql.raw('SET ROLE app_clinic_billing');
    case 'SELECT app.release_principal_context()':
      return sql`SELECT app.release_principal_context()`;
    case 'SELECT app.clear_port_context()':
      return sql`SELECT app.clear_port_context()`;
    case "SELECT set_config('app.org', $1, true)":
      return sql`SELECT set_config('app.org', ${values[0]}, true)`;
    case "SELECT set_config('app.patient_user_id', $1, true)":
      return sql`SELECT set_config('app.patient_user_id', ${values[0]}, true)`;
    case "SELECT set_config('app.integrator_user_id', $1, true)":
      return sql`SELECT set_config('app.integrator_user_id', ${values[0]}, true)`;
    case "SELECT set_config('app.org', $1, false)":
      return sql`SELECT set_config('app.org', ${values[0]}, false)`;
    case "SELECT set_config('app.patient_user_id', $1, false)":
      return sql`SELECT set_config('app.patient_user_id', ${values[0]}, false)`;
    case "SELECT set_config('app.integrator_user_id', $1, false)":
      return sql`SELECT set_config('app.integrator_user_id', ${values[0]}, false)`;
    default:
      break;
  }

  if (queryText.includes('app.install_signed_context') && values.length === 7) {
    return sql`
      SELECT app.install_signed_context(
        ${values[0]}::text,
        ${values[1]}::integer,
        ${values[2]}::bigint,
        ${values[3]}::uuid,
        ${values[4]}::uuid,
        ${values[5]}::bigint,
        ${values[6]}::text
      )
    `;
  }

  if (queryText.includes('app.install_port_context') && values.length === 11) {
    return sql`
      SELECT app.install_port_context(
        ${values[0]}::uuid,
        ROW(1, ${values[1]}::app.port_context_class, ${values[2]}::name, ${values[3]}::text,
          ${values[4]}::regprocedure, ${values[5]}::bytea, ${values[6]}::uuid, ${values[7]}::uuid,
          ${values[8]}::uuid, ${values[9]}::bigint, ${values[10]}::uuid)::app.port_context_claims
      )
    `;
  }

  if (/^SET LOCAL ROLE [a-z_][a-z0-9_]{0,62}$/.test(queryText)) return sql.raw(queryText);

  throw new Error(`Unsupported DB principal Drizzle statement: ${queryText}`);
}

function normalizeDrizzlePrincipalResult(result: unknown): DrizzlePrincipalResult {
  if (isRecord(result) && Array.isArray(result.rows)) {
    return result as DrizzlePrincipalResult;
  }
  if (Array.isArray(result)) {
    return { rows: result as readonly Record<string, unknown>[] };
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function drizzlePrincipalQueryable(tx: DrizzleTransaction) {
  return {
    query: async (
      queryText: string,
      values?: readonly unknown[],
    ): Promise<DrizzlePrincipalResult> => {
      const result = await tx.execute(drizzlePrincipalSql(queryText, values));
      return normalizeDrizzlePrincipalResult(result);
    },
  };
}

function withPrincipalAwareTransactions(rawDb: DrizzleDb): DrizzleDb {
  const rawTransaction = rawDb.transaction.bind(rawDb);
  const wrappedTransaction: DrizzleDb['transaction'] = ((callback, config) => {
    // Drizzle may await pool checkout before entering this callback; preserve the caller identity.
    const principalSnapshot = getCurrentDbPrincipal();
    if (process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context') {
      return rawTransaction(async (tx) => {
        const queryable = drizzlePrincipalQueryable(tx);
        const runtime = createWebappPortContextRuntimeConfig(process.env);
        const selected = webappPortContextPrincipal(principalSnapshot, runtime.capabilities).principal;
        const typedArgsHash = hashPortTypedArgs(selected.typedArgs ?? []);
        let callbackError: unknown;
        try {
          await queryable.query('RESET ROLE');
          await queryable.query('SELECT app.clear_port_context()');
          await queryable.query(
            'SELECT app.install_port_context($1::uuid, ROW(1, $2::app.port_context_class, $3::name, $4::text, $5::regprocedure, $6::bytea, $7::uuid, $8::uuid, $9::uuid, $10::bigint, $11::uuid)::app.port_context_claims)',
            [
              selected.capabilityId,
              selected.contextClass,
              selected.targetRole,
              selected.purpose,
              selected.functionIdentity ?? null,
              typedArgsHash,
              selected.actorRef ?? null,
              selected.subjectRef ?? null,
              selected.organizationId ?? null,
              selected.integratorUserId === undefined ? null : String(selected.integratorUserId),
              selected.requestId ?? null,
            ],
          );
          await queryable.query(`SET LOCAL ROLE ${selected.targetRole}`);
          return await callback(tx);
        } catch (error) {
          callbackError = error;
          throw error;
        } finally {
          try {
            await queryable.query('RESET ROLE');
            await queryable.query('SELECT app.clear_port_context()');
          } catch (error) {
            if (callbackError === undefined) throw error;
          }
        }
      }, config);
    }
    const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);
    return rawTransaction(async (tx) => {
      const queryable = drizzlePrincipalQueryable(tx);
      let applied = false;
      try {
        applied =
          principalSnapshot?.kind === 'infra'
            ? false
            : await applyDbPrincipalToTransaction(
                queryable,
                principalSnapshot,
                principalApplyOptions,
              );
      } catch (error) {
        await reportPrincipalSetupFailure(error);
        if (principalSnapshot?.kind === 'platform') {
          try {
            await clearCurrentDbPrincipalFromDrizzleTransaction(
              queryable,
              principalApplyOptions,
              principalSnapshot,
            );
          } catch {
            await reportDbCleanupFailure();
          }
        }
        throw error;
      }
      let callbackError: unknown;
      try {
        try {
          return await callback(tx);
        } catch (error) {
          callbackError = error;
          await reportDbQueryFailure(error);
          throw error;
        }
      } finally {
        if (applied) {
          try {
            await clearCurrentDbPrincipalFromDrizzleTransaction(
              queryable,
              principalApplyOptions,
              principalSnapshot,
            );
          } catch (error) {
            await reportDbCleanupFailure();
            // A PostgreSQL statement error aborts the transaction, so cleanup inside this callback
            // can itself fail with 25P02. Preserve the original query error and let Drizzle's outer
            // transaction handler ROLLBACK before releasing the checked-out connection. Transaction-
            // scoped role/config/context changes are reverted by that rollback.
            if (callbackError === undefined) {
              throw error;
            }
          }
        }
      }
    }, config);
  }) as DrizzleDb['transaction'];

  rawDb.transaction = wrappedTransaction;
  return rawDb;
}

async function clearCurrentDbPrincipalFromDrizzleTransaction(
  queryable: ReturnType<typeof drizzlePrincipalQueryable>,
  principalApplyOptions: DbPrincipalApplyOptions,
  principalSnapshot: DbPrincipal | undefined,
): Promise<void> {
  await clearDbPrincipalFromTransaction(queryable, principalApplyOptions, principalSnapshot);
}

// ---------------------------------------------------------------------------
// Phase 1 chokepoint (taskdb #821, Option (a)) — plain (non-`.transaction()`) reads.
//
// `db.select()`/`db.execute()`/`db.query.<table>.find*()` all ultimately produce a
// drizzle-orm `QueryPromise` (or `PgRaw`) — a LAZY THENABLE, not a native `Promise`
// (see node_modules/drizzle-orm/query-promise.js: `then(onFulfilled, onRejected) { return
// this.execute().then(...); }`). The real work — including which `pg.Pool.query()` call
// actually hits the wire, which is where `installPrincipalAwarePoolQuery`
// (infra/db/webappPoolProvider.ts) reads `getCurrentDbPrincipal()` — does not happen when the
// query is built, it happens whenever something later calls `.then()` on it.
//
// That is fine as long as whoever built the query also awaits it directly inside the same
// synchronous/async continuation (the common, `enterWith`-persistent-principal case — reading
// `getCurrentDbPrincipal()` late is harmless because nothing changes it in between). It is NOT
// fine for the `.run()`-scoped organization-principal helpers (packages/db-principal's
// run-with-db-organization-principal family, wrapped by `withDoctorWorkspacePrincipal`) pattern:
// that principal is only guaranteed live for the synchronous extent of its own callback.
// A repo function is free to `return db.select()...` (or, generically, `() => T` never requires
// the caller to await inside the callback — see e.g.
// `withDoctorWorkspacePrincipal(gate.ctx, () => deps.patientPayments.listPayments(...))` in
// app/api/doctor/patients/[userId]/payment-timeline/route.ts, whose un-awaited-inside-the-callback
// return value is awaited later via `Promise.all([...])`). If ANYTHING re-points the ambient DB
// principal before that deferred `.then()` finally fires — a sibling `Promise.all` entry, a later
// `enterWithDbStaffPrincipal` call in the same request, another concurrent request's continuation —
// a naive read of `getCurrentDbPrincipal()` at `.then()`/execute time silently applies the WRONG
// (or no) principal instead of the one active when the query was issued. Confirmed empirically
// (see taskdb #821 verification notes): this is a real, deterministic gap, not a theoretical one —
// it reproduces with plain sequential code, no timing race required, whenever a principal is
// re-entered between issuing a lazy query and awaiting it.
//
// FIX: capture `getCurrentDbPrincipal()` SYNCHRONOUSLY at the moment the query is ISSUED — i.e. the
// very first call in the chain (`db.select()`, `db.execute()`, `db.query.<table>.find*()`), which
// always runs synchronously inside the caller's own principal scope — and close over that snapshot.
// Whenever the query's deferred `.then()` eventually fires (however later, under whatever ambient
// principal happens to be around by then), replay EXACTLY the captured snapshot via
// `runWithDbPrincipalSnapshot` so `installPrincipalAwarePoolQuery`'s synchronous
// `getCurrentDbPrincipal()` read (which happens inside the same synchronous call chain as `.then()`,
// before `client.query()`'s own internal await) sees the issuer's principal, never a stale/foreign
// one. `runWithDbPrincipalSnapshot` accepts `undefined` verbatim (unlike `runWithDbPrincipal`), so a
// query issued with NO principal at all stays fail-closed (empty/denied) at execute time too, rather
// than accidentally picking up whatever became ambient later.
//
// Only `.select()`/`.selectDistinct()`/`.selectDistinctOn()` (session -> builder -> `.from()` ->
// terminal query) need a two-hop wrap; `.execute()` and `db.query.<table>.find*()` already return the
// terminal thenable directly (single hop). Mutations (`insert`/`update`/`delete`) are out of scope
// here: this repo's convention is that every mutation runs inside `db.transaction()`, which
// `withPrincipalAwareTransactions` above already makes issue-time-safe.
// ---------------------------------------------------------------------------

type DrizzleThenable = { then: (onFulfilled?: unknown, onRejected?: unknown) => unknown };

/**
 * Overrides `terminal.then` with an OWN property (shadowing whatever prototype method drizzle-orm
 * gave it, whether via real inheritance or `applyMixins`'s copied descriptor) so the eventual real
 * execution — however later `.then()` is actually invoked — runs with `principalSnapshot` applied,
 * regardless of what's ambient at that moment. Only ever touches this one specific instance; other
 * concurrent queries and drizzle-orm's own prototypes are untouched.
 */
function wrapTerminalReadWithIssueTimePrincipal<T extends DrizzleThenable>(
  terminal: T,
  principalSnapshot: DbPrincipal | undefined,
): T {
  const originalThen = terminal.then.bind(terminal);
  (terminal as DrizzleThenable).then = (onFulfilled?: unknown, onRejected?: unknown) =>
    runWithDbPrincipalSnapshot(principalSnapshot, () => originalThen(onFulfilled, onRejected));
  return terminal;
}

type DrizzleSelectBuilderLike = { from: (...args: never[]) => DrizzleThenable };

/** Wraps a `db.select`/`db.selectDistinct`/`db.selectDistinctOn`-shaped entry point. */
function wrapSelectEntryPoint<F extends (...args: never[]) => DrizzleSelectBuilderLike>(
  originalEntry: F,
): F {
  return ((...args: Parameters<F>) => {
    // Synchronous, issue-time snapshot — `db.select()` itself never awaits anything.
    const principalSnapshot = getCurrentDbPrincipal();
    const builder = originalEntry(...args);
    const originalFrom = builder.from.bind(builder);
    builder.from = ((...fromArgs: Parameters<DrizzleSelectBuilderLike['from']>) =>
      wrapTerminalReadWithIssueTimePrincipal(
        originalFrom(...fromArgs),
        principalSnapshot,
      )) as DrizzleSelectBuilderLike['from'];
    return builder;
  }) as F;
}

type DrizzleRelationalTableQuery = {
  findMany: (...args: never[]) => DrizzleThenable;
  findFirst: (...args: never[]) => DrizzleThenable;
};

/** Wraps every `db.query.<table>.findMany`/`.findFirst` entry point in place. Defensive against a
 * partial/mocked `db` (e.g. drizzle.test.ts's `.transaction()`-only mock) — production `getDrizzle()`
 * always builds a real, complete drizzle instance where `.query` is populated per schema table. */
function withIssueTimePrincipalRelationalReads(rawDb: DrizzleDb): void {
  const query = rawDb.query as unknown as Record<string, DrizzleRelationalTableQuery> | undefined;
  if (!query) return;
  for (const tableQuery of Object.values(query)) {
    for (const method of ['findMany', 'findFirst'] as const) {
      if (typeof tableQuery[method] !== 'function') continue;
      const original = tableQuery[method].bind(tableQuery);
      tableQuery[method] = ((...args: Parameters<DrizzleRelationalTableQuery[typeof method]>) => {
        const principalSnapshot = getCurrentDbPrincipal();
        return wrapTerminalReadWithIssueTimePrincipal(original(...args), principalSnapshot);
      }) as DrizzleRelationalTableQuery[typeof method];
    }
  }
}

/** Wraps a single `db.<selectEntryPoint>` method in place (each has its own overload set, so these
 * are unrolled individually rather than looped over a union key — assigning back through a union
 * key turns the target type into an unhelpful intersection of all three overload sets). Defensive
 * against a partial/mocked `db` (e.g. drizzle.test.ts's `.transaction()`-only mock) — production
 * `getDrizzle()` always builds a real, complete drizzle instance with all three methods present. */
function wrapSelectEntryPointInPlace<K extends 'select' | 'selectDistinct' | 'selectDistinctOn'>(
  rawDb: DrizzleDb,
  key: K,
): void {
  if (typeof rawDb[key] !== 'function') return;
  const original = rawDb[key].bind(rawDb) as unknown as (
    ...args: never[]
  ) => DrizzleSelectBuilderLike;
  rawDb[key] = wrapSelectEntryPoint(original) as unknown as DrizzleDb[K];
}

function withIssueTimePrincipalReads(rawDb: DrizzleDb): DrizzleDb {
  wrapSelectEntryPointInPlace(rawDb, 'select');
  wrapSelectEntryPointInPlace(rawDb, 'selectDistinct');
  wrapSelectEntryPointInPlace(rawDb, 'selectDistinctOn');

  if (typeof rawDb.execute === 'function') {
    const originalExecute = rawDb.execute.bind(rawDb) as (...args: never[]) => DrizzleThenable;
    rawDb.execute = ((...args: Parameters<typeof originalExecute>) => {
      const principalSnapshot = getCurrentDbPrincipal();
      return wrapTerminalReadWithIssueTimePrincipal(originalExecute(...args), principalSnapshot);
    }) as DrizzleDb['execute'];
  }

  withIssueTimePrincipalRelationalReads(rawDb);

  return rawDb;
}

/** Drizzle instance sharing the same `pg.Pool` as legacy `getPool()`. */
export function getDrizzle(): DrizzleDb {
  db ??= withIssueTimePrincipalReads(
    withPrincipalAwareTransactions(drizzle(getPool(), { schema })),
  );
  return db;
}
