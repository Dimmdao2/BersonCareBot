import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  applyDbPrincipalToTransaction,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromTransaction,
  getCurrentDbPrincipal,
  type DbPrincipalApplyOptions,
} from "@bersoncare/db-principal";
import * as schema from "../../../db/schema";
import { getPool } from "./client";
import {
  reportDbCleanupFailure,
  reportDbQueryFailure,
  reportPrincipalSetupFailure,
} from "@/infra/db/saasIsolationDbFailureReporting";

export type DrizzleDb = NodePgDatabase<typeof schema>;
type DrizzleTransaction = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];
type DrizzlePrincipalResult = { rows?: readonly Record<string, unknown>[] };

let db: DrizzleDb | null = null;

function drizzlePrincipalSql(queryText: string, values: readonly unknown[] = []): SQL {
  switch (queryText) {
    case "SELECT pg_backend_pid() AS backend_pid":
      return sql`SELECT pg_backend_pid() AS backend_pid`;
    case "RESET ROLE":
      return sql.raw("RESET ROLE");
    case "SET ROLE app_staff":
      return sql.raw("SET ROLE app_staff");
    case "SET ROLE app_patient":
      return sql.raw("SET ROLE app_patient");
    case "SELECT app.release_principal_context()":
      return sql`SELECT app.release_principal_context()`;
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

  if (queryText.includes("app.install_signed_context") && values.length === 7) {
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
  return typeof value === "object" && value !== null;
}

function drizzlePrincipalQueryable(tx: DrizzleTransaction) {
  return {
    query: async (queryText: string, values?: readonly unknown[]): Promise<DrizzlePrincipalResult> => {
      const result = await tx.execute(drizzlePrincipalSql(queryText, values));
      return normalizeDrizzlePrincipalResult(result);
    },
  };
}

function withPrincipalAwareTransactions(rawDb: DrizzleDb): DrizzleDb {
  const rawTransaction = rawDb.transaction.bind(rawDb);
  const wrappedTransaction: DrizzleDb["transaction"] = ((callback, config) => {
    // Drizzle may await pool checkout before entering this callback; preserve the caller identity.
    const principalSnapshot = getCurrentDbPrincipal();
    const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);
    return rawTransaction(async (tx) => {
      const queryable = drizzlePrincipalQueryable(tx);
      let applied = false;
      try {
        applied =
          principalSnapshot?.kind === "infra"
            ? false
            : await applyDbPrincipalToTransaction(queryable, principalSnapshot, principalApplyOptions);
      } catch (error) {
        await reportPrincipalSetupFailure(error);
        throw error;
      }
      try {
        try {
          return await callback(tx);
        } catch (error) {
          await reportDbQueryFailure(error);
          throw error;
        }
      } finally {
        if (applied) {
          try {
            await clearCurrentDbPrincipalFromDrizzleTransaction(queryable, principalApplyOptions);
          } catch (error) {
            await reportDbCleanupFailure();
            throw error;
          }
        }
      }
    }, config);
  }) as DrizzleDb["transaction"];

  rawDb.transaction = wrappedTransaction;
  return rawDb;
}

async function clearCurrentDbPrincipalFromDrizzleTransaction(
  queryable: ReturnType<typeof drizzlePrincipalQueryable>,
  principalApplyOptions: DbPrincipalApplyOptions,
): Promise<void> {
  await clearDbPrincipalFromTransaction(queryable, principalApplyOptions);
}

/** Drizzle instance sharing the same `pg.Pool` as legacy `getPool()`. */
export function getDrizzle(): DrizzleDb {
  db ??= withPrincipalAwareTransactions(drizzle(getPool(), { schema }));
  return db;
}
