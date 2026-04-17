import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../../db/schema";
import { getPool } from "./client";

export type DrizzleDb = NodePgDatabase<typeof schema>;

let db: DrizzleDb | null = null;

/** Drizzle instance sharing the same `pg.Pool` as legacy `getPool()`. */
export function getDrizzle(): DrizzleDb {
  db ??= drizzle(getPool(), { schema });
  return db;
}
