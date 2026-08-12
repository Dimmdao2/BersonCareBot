import type { Pool } from 'pg';
import type { MessengerPhoneBindDb } from '@bersoncare/platform-merge';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappPgText,
  type WebappSqlExecutor,
} from '@/infra/db/runWebappSql';
import { startPoolTransaction } from '@/infra/db/withClient';

export type MessengerPhoneBindTransaction = {
  /** Порт вебаппа: наши собственные запросы идут только через него. */
  db: WebappSqlExecutor;
  /** Тот же порт, обёрнутый под интерфейс пакета `platform-merge` (он транспортно-независим). */
  mergeDb: MessengerPhoneBindDb;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
};

/**
 * Единственный переходник между портом вебаппа и `.query`-формой пакета `platform-merge`.
 * Пакет общий с интегратором и поэтому не может зависеть от drizzle-порта вебаппа; всё, что
 * выполняется, всё равно проходит через `runWebappPgText`.
 */
export function asMessengerPhoneBindDb(db: WebappSqlExecutor): MessengerPhoneBindDb {
  return {
    query: async (sql, values = []) => runWebappPgText(sql, values, db),
  };
}

export function poolAsMessengerPhoneBindDb(): MessengerPhoneBindDb {
  return asMessengerPhoneBindDb(getWebappSqlDb());
}

export async function startMessengerPhoneBindTransaction(
  pool: Pool,
): Promise<MessengerPhoneBindTransaction> {
  const tx = await startPoolTransaction(pool);
  const db = getWebappSqlFromPgClient(tx.client);
  return {
    db,
    mergeDb: asMessengerPhoneBindDb(db),
    commit: () => tx.commit(),
    rollback: () => tx.rollback(),
    release: () => tx.release(),
  };
}
