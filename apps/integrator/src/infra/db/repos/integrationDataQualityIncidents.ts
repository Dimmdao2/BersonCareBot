import { sql } from 'drizzle-orm';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import type { DbPort } from '../../../kernel/contracts/index.js';
import type {
  IntegrationDataQualityIncidentInput,
  UpsertIntegrationDataQualityIncidentResult,
} from '../../../shared/integrationDataQuality/types.js';
import { logger } from '../../observability/logger.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/**
 * Upsert by (integration, entity, external_id, field, error_reason).
 * Returns occurrences after the operation (1 = first insert — use for alert dedup).
 */
export async function upsertIntegrationDataQualityIncident(
  db: DbPort,
  input: IntegrationDataQualityIncidentInput,
): Promise<UpsertIntegrationDataQualityIncidentResult> {
  try {
    const res = await runWithDbInfraPrincipal({ source: 'integrator-data-quality' }, () =>
      runIntegratorNamedRoot<{ occurrences: number }>(
        db,
        'app.upsert_integration_data_quality_incident(text,text,text,text,text,text,text)',
        [input.integration, input.entity, input.externalId, input.field, input.rawValue,
          input.timezoneUsed, input.errorReason],
        sql`SELECT app.upsert_integration_data_quality_incident(
          ${input.integration}, ${input.entity}, ${input.externalId}, ${input.field}, ${input.rawValue},
          ${input.timezoneUsed}, ${input.errorReason}
        ) AS occurrences`,
      ));
    const occurrences = res.rows[0]?.occurrences ?? 1;
    return { occurrences };
  } catch (err) {
    logger.error({ err, input }, 'upsert integration_data_quality_incidents failed');
    return { occurrences: 0 };
  }
}
