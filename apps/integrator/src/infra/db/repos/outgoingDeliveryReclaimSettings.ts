import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { parseSystemSettingInnerWithSchema } from '../publicSystemSettings.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

/**
 * D10b (docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md): the queue reclaim/retention/
 * dead-letter thresholds must be settings, not hardcoded constants — this is the DB-backed source.
 */
export const OUTGOING_DELIVERY_RECLAIM_CONFIG_KEY = 'outgoing_delivery_reclaim_config';

export type OutgoingDeliveryReclaimConfig = {
  /** "processing" older than this and not finished is stuck — reclaimed back to "pending". */
  processingTimeoutMinutes: number;
  /** "sent" rows older than this are deleted from the queue (journal entry stays). */
  doneRetentionDays: number;
  /** After this many reclaims a row goes to the dead letter instead of being reclaimed again. */
  maxReclaimCount: number;
};

export const DEFAULT_OUTGOING_DELIVERY_RECLAIM_CONFIG: OutgoingDeliveryReclaimConfig = {
  processingTimeoutMinutes: 10,
  doneRetentionDays: 30,
  maxReclaimCount: 5,
};

const configSchema = z.object({
  processingTimeoutMinutes: z.number().int().min(1).max(1440),
  doneRetentionDays: z.number().int().min(1).max(365),
  maxReclaimCount: z.number().int().min(1).max(100),
});

/**
 * Argless capability owned by the C4 delivery-worker overlay: the worker role receives EXECUTE
 * on this single-purpose function, never table SELECT and never the provider/SMTP settings
 * capability granted to the API base login.
 */
async function fetchOutgoingDeliveryReclaimConfigValueJson(db: DbPort): Promise<unknown | null> {
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_outgoing_delivery_reclaim_config() AS value_json`,
  );
  return result.rows[0]?.value_json ?? null;
}

/** DB-backed config with fail-safe defaults after a reset/delete/parse failure. */
export async function getOutgoingDeliveryReclaimConfig(
  db: DbPort,
): Promise<OutgoingDeliveryReclaimConfig> {
  try {
    const valueJson = await fetchOutgoingDeliveryReclaimConfigValueJson(db);
    const parsed =
      valueJson === null ? null : parseSystemSettingInnerWithSchema(valueJson, configSchema);
    return parsed ?? DEFAULT_OUTGOING_DELIVERY_RECLAIM_CONFIG;
  } catch (err) {
    logger.warn(
      { err, key: OUTGOING_DELIVERY_RECLAIM_CONFIG_KEY },
      'outgoing_delivery_reclaim_config_defaulted',
    );
    return DEFAULT_OUTGOING_DELIVERY_RECLAIM_CONFIG;
  }
}
