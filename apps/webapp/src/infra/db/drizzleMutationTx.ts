import { AsyncLocalStorage } from "node:async_hooks";
import { getDrizzle, type DrizzleDb } from "@/app-layer/db/drizzle";

const mutationTxStore = new AsyncLocalStorage<DrizzleDb>();

/** Drizzle executor: active batch mutation tx or default pool connection. */
export function getDrizzleOrMutationTx(): DrizzleDb {
  return mutationTxStore.getStore() ?? getDrizzle();
}

/** PG: one outer transaction for editor batch apply (AsyncLocalStorage-scoped tx). */
export async function runInDrizzleMutationTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = getDrizzle();
  return db.transaction(async (tx) => mutationTxStore.run(tx as DrizzleDb, fn));
}
