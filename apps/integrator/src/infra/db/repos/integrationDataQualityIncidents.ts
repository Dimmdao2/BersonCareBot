import { sql } from 'drizzle-orm';
import type { DbPort } from "../../../kernel/contracts/index.js";
import type {
  IntegrationDataQualityIncidentInput,
  UpsertIntegrationDataQualityIncidentResult,
} from "../../../shared/integrationDataQuality/types.js";
import { logger } from "../../observability/logger.js";
import { runIntegratorSql } from "../runIntegratorSql.js";

/**
 * Upsert by (integration, entity, external_id, field, error_reason).
 * Returns occurrences after the operation (1 = first insert — use for alert dedup).
 */
export async function upsertIntegrationDataQualityIncident(
  db: DbPort,
  input: IntegrationDataQualityIncidentInput,
): Promise<UpsertIntegrationDataQualityIncidentResult> {
  try {
    const res = await runIntegratorSql<{ occurrences: number }>(
      db,
      sql`INSERT INTO integration_data_quality_incidents (
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
          VALUES (
            ${input.integration},
            ${input.entity},
            ${input.externalId},
            ${input.field},
            ${input.rawValue},
            ${input.timezoneUsed},
            ${input.errorReason},
            'open',
            NOW(),
            NOW(),
            1
          )
          ON CONFLICT (integration, entity, external_id, field, error_reason)
          DO UPDATE SET
            last_seen_at = NOW(),
            occurrences = integration_data_quality_incidents.occurrences + 1,
            raw_value = COALESCE(EXCLUDED.raw_value, integration_data_quality_incidents.raw_value),
            timezone_used = COALESCE(EXCLUDED.timezone_used, integration_data_quality_incidents.timezone_used)
          RETURNING occurrences`,
    );
    const occurrences = res.rows[0]?.occurrences ?? 1;
    return { occurrences };
  } catch (err) {
    logger.error({ err, input }, "upsert integration_data_quality_incidents failed");
    return { occurrences: 0 };
  }
}
