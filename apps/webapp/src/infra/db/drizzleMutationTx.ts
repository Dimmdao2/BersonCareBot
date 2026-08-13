import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle, type DrizzleDb } from '@/app-layer/db/drizzle';

const mutationTxStore = new AsyncLocalStorage<DrizzleDb>();

/** Drizzle executor: active batch mutation tx or default pool connection. */
export function getDrizzleOrMutationTx(): DrizzleDb {
  return mutationTxStore.getStore() ?? getDrizzle();
}

/** PG: one outer transaction for editor batch apply (AsyncLocalStorage-scoped tx). */
export async function runInDrizzleMutationTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (mutationTxStore.getStore()) return fn();
  const db = getDrizzle();
  return db.transaction(async (tx) => {
    await applyCurrentDrizzlePrincipalToTransaction(tx as Pick<DrizzleDb, 'execute'>);
    return mutationTxStore.run(tx as DrizzleDb, fn);
  });
}

export async function runDrizzleMutationTransaction<T>(
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  const activeTransaction = mutationTxStore.getStore();
  if (activeTransaction) return fn(activeTransaction);
  const db = getDrizzle();
  return db.transaction(async (tx) => {
    const mutationTx = tx as DrizzleDb;
    await applyCurrentDrizzlePrincipalToTransaction(mutationTx);
    return mutationTxStore.run(mutationTx, () => fn(mutationTx));
  });
}

async function applyCurrentDrizzlePrincipalToTransaction(
  tx: Pick<DrizzleDb, 'execute'>,
): Promise<void> {
  const organizationId = getCurrentDbPrincipalOrganizationId();
  if (!organizationId) return;
  await tx.execute(sql`SELECT set_config('app.org', ${organizationId}, true)`);
}
