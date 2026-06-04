import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  isProjectionHealthDegraded,
  readProjectionHealthSnapshot,
  type ProjectionHealthSnapshot,
} from './projectionHealthCore.js';

export { isProjectionHealthDegraded };
export type { ProjectionHealthSnapshot } from './projectionHealthCore.js';

/**
 * Reads projection_outbox health for release gate and monitoring.
 * Summary covers all domains (single outbox). Reusable by health endpoint and CLI script.
 * Includes **`cancelledCount`** (e.g. merge dedup) separately from **`deadCount`** (DLQ).
 */
export async function getProjectionHealth(
  db: DbPort,
  options?: { retryThreshold?: number },
): Promise<ProjectionHealthSnapshot> {
  return readProjectionHealthSnapshot(db, options);
}
