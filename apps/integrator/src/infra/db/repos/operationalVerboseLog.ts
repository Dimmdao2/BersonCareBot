/**
 * DEV and TEST automatically enable detailed operational logs; PROD keeps only significant events.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { parseTestFlag } from '../../../shared/testDeliverySafety.js';

export async function getOperationalVerboseLogEnabled(_db: DbPort): Promise<boolean> {
  return process.env.NODE_ENV === 'development' || parseTestFlag(process.env.TEST);
}
