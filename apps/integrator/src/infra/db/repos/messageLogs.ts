import type { DbPort, DbWriteMutation } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { getOperationalVerboseLogEnabled } from './operationalVerboseLog.js';

/** Logs non-delivery diagnostic events; delivery attempts use operatorDeliveryAttempts.ts. */
export async function appendMessageLog(db: DbPort, mutation: DbWriteMutation): Promise<void> {
  // Non-delivery logs are diagnostic-only until dedicated audit tables exist; gate behind verbose flag and drop raw params.
  if (await getOperationalVerboseLogEnabled(db)) {
    logger.info({ mutationType: mutation.type }, 'append message log');
  }
}
