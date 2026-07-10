import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import * as schema from "../../../db/schema";
import { getPool } from "./client";

export type DrizzleDb = NodePgDatabase<typeof schema>;
type DrizzleTransaction = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];

let db: DrizzleDb | null = null;

async function applyCurrentDbPrincipalToDrizzleTransaction(tx: DrizzleTransaction): Promise<void> {
  const organizationId = getCurrentDbPrincipalOrganizationId();
  if (!organizationId) return;
  await tx.execute(sql`SELECT set_config('app.org', ${organizationId}, true)`);
}

function withPrincipalAwareTransactions(rawDb: DrizzleDb): DrizzleDb {
  const rawTransaction = rawDb.transaction.bind(rawDb);
  const wrappedTransaction: DrizzleDb["transaction"] = ((callback, config) =>
    rawTransaction(
      async (tx) => {
        await applyCurrentDbPrincipalToDrizzleTransaction(tx);
        return callback(tx);
      },
      config,
    )) as DrizzleDb["transaction"];

  rawDb.transaction = wrappedTransaction;
  return rawDb;
}

/** Drizzle instance sharing the same `pg.Pool` as legacy `getPool()`. */
export function getDrizzle(): DrizzleDb {
  db ??= withPrincipalAwareTransactions(drizzle(getPool(), { schema }));
  return db;
}
