import type { WebappSqlExecutor } from '@/infra/db/runWebappSql';
import {
  StockQuotaReachedError,
  type StockQuotaMechanic,
  transactionQuotaPort,
} from '@/infra/repos/transactionQuotaPort';

export { StockQuotaReachedError, type StockQuotaMechanic };

/**
 * Compatibility entrypoint for retained callers and the paid-period proof. The capacity decision
 * lives only in transactionQuotaPort; stock and clinic-team writers share that resolver.
 */
export async function assertStockQuotaAvailable(
  tx: WebappSqlExecutor,
  organizationId: string,
  mechanic: StockQuotaMechanic,
  countUsage: () => Promise<number>,
  increment = 1,
): Promise<void> {
  return transactionQuotaPort.withinLock(tx, { organizationId, mechanic }, (quota) =>
    quota.assertStockAvailable(countUsage, increment),
  );
}
