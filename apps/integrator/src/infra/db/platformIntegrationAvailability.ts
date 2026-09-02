import { sql } from 'drizzle-orm';
import {
  hasPlatformIntegrationAvailabilityValue,
  isPlatformIntegrationAvailable as isPlatformIntegrationAvailableInContract,
  normalizePlatformIntegrationAvailability,
  type PlatformIntegrationAvailability,
  type PlatformIntegrationId,
} from '@bersoncare/shared-contracts';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runWithInfraPrincipal } from '../principal/organizationPrincipal.js';
import { extractSystemSettingInnerValue } from './publicSystemSettings.js';
import { runIntegratorSql } from './runIntegratorSql.js';

export { PLATFORM_INTEGRATION_IDS } from '@bersoncare/shared-contracts';
export type { PlatformIntegrationId } from '@bersoncare/shared-contracts';

export function parsePlatformIntegrationAvailability(
  valueJson: unknown,
): PlatformIntegrationAvailability | null {
  return normalizePlatformIntegrationAvailability(extractSystemSettingInnerValue(valueJson));
}

/**
 * Fixed single-key capability for the global platform-integration availability registry. The
 * integrator runtime login receives EXECUTE on the function, never table SELECT.
 */
async function fetchPlatformIntegrationAvailabilityValueJson(db: DbPort): Promise<unknown | null> {
  const result = await runIntegratorSql<{ value_json: unknown }>(
    db,
    sql`SELECT app.read_integrator_platform_integration_availability() AS value_json`,
  );
  return result.rows[0]?.value_json ?? null;
}

/**
 * The registry is global platform configuration (`organization_id IS NULL`) used by every
 * delivery path. Read it through the delivery capability even when the caller currently has an
 * organization principal: a tenant-service transaction cannot execute this operational seam,
 * and the global read must not inherit tenant access merely from its caller.
 */
function readAvailabilityValueJson(db: DbPort): Promise<unknown> {
  const fetch = () => fetchPlatformIntegrationAvailabilityValueJson(db);
  return runWithInfraPrincipal({ source: 'delivery-handler' }, fetch);
}

async function readPlatformIntegrationAvailability(
  db: DbPort,
): Promise<PlatformIntegrationAvailability> {
  const valueJson = await readAvailabilityValueJson(db);
  const parsed = parsePlatformIntegrationAvailability(valueJson);
  if (!parsed) {
    // A missing envelope or an unsupported version/shape is a real failure (the migration seeds
    // it unconditionally), not "not configured yet" — it must refuse delivery for every channel,
    // not fall back to a compiled-in default that could contradict a persisted `false`.
    throw new Error('PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE');
  }
  return parsed;
}

export async function isPlatformIntegrationAvailable(
  db: DbPort,
  integrationId: PlatformIntegrationId,
): Promise<boolean> {
  const availability = await readPlatformIntegrationAvailability(db);
  if (!hasPlatformIntegrationAvailabilityValue(availability, integrationId)) {
    // A missing/malformed *unrelated* id must not block this request; only the requested id's
    // own value being absent or non-boolean fails closed here.
    throw new Error('PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE');
  }
  return isPlatformIntegrationAvailableInContract(availability, integrationId);
}
