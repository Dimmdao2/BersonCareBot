import type { DbPort } from "../../../kernel/contracts/index.js";
import type {
  IntegrationDataQualityIncidentInput,
  UpsertIntegrationDataQualityIncidentResult,
} from "../../../shared/integrationDataQuality/types.js";
import { logger } from "../../observability/logger.js";

/**
 * Upsert by (integration, entity, external_id, field, error_reason).
 * Returns occurrences after the operation (1 = first insert — use for alert dedup).
 */
export async function upsertIntegrationDataQualityIncident(
  db: DbPort,
  input: IntegrationDataQualityIncidentInput,
): Promise<UpsertIntegrationDataQualityIncidentResult> {
  const sql = `
    INSERT INTO integration_data_quality_incidents (
      integration,
      entity,
      external_id,
      field,
      raw_value,
      timezone_used,
      error_reason,
      status,
      first_seen_at,
      last_seen_at,
      occurrences
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW(), 1)
    ON CONFLICT (integration, entity, external_id, field, error_reason)
    DO UPDATE SET
      last_seen_at = NOW(),
      occurrences = integration_data_quality_incidents.occurrences + 1,
      raw_value = COALESCE(EXCLUDED.raw_value, integration_data_quality_incidents.raw_value),
      timezone_used = COALESCE(EXCLUDED.timezone_used, integration_data_quality_incidents.timezone_used)
    RETURNING occurrences
  `;
  try {
    const res = await db.query<{ occurrences: number }>(sql, [
      input.integration,
      input.entity,
      input.externalId,
      input.field,
      input.rawValue,
      input.timezoneUsed,
      input.errorReason,
    ]);
    const occurrences = res.rows[0]?.occurrences ?? 1;
    return { occurrences };
  } catch (err) {
    logger.error({ err, input }, "upsert integration_data_quality_incidents failed");
    return { occurrences: 0 };
  }
}
