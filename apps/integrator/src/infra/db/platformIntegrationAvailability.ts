import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runWithInfraPrincipal } from '../principal/organizationPrincipal.js';
import { extractSystemSettingInnerValue } from './publicSystemSettings.js';
import { runIntegratorSql } from './runIntegratorSql.js';

export const PLATFORM_INTEGRATION_IDS = [
  'telegram',
  'max',
  'email',
  'smsc',
  'web_push',
  'google_calendar',
  'yandex_calendar',
] as const;

export type PlatformIntegrationId = (typeof PLATFORM_INTEGRATION_IDS)[number];

type PlatformIntegrationAvailability = {
  version: 1;
  integrations: Record<PlatformIntegrationId, boolean>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parsePlatformIntegrationAvailability(
  valueJson: unknown,
): PlatformIntegrationAvailability | null {
  const inner = extractSystemSettingInnerValue(valueJson);
  if (!isRecord(inner) || inner.version !== 1 || !isRecord(inner.integrations)) {
    return null;
  }

  const integrations = {} as Record<PlatformIntegrationId, boolean>;
  for (const id of PLATFORM_INTEGRATION_IDS) {
    const enabled = inner.integrations[id];
    if (typeof enabled !== 'boolean') return null;
    integrations[id] = enabled;
  }
  if (
    Object.keys(inner.integrations).some(
      (id) => !PLATFORM_INTEGRATION_IDS.includes(id as PlatformIntegrationId),
    )
  ) {
    return null;
  }

  return { version: 1, integrations };
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
    // A missing or unreadable registry row is a real failure (the migration seeds it
    // unconditionally), not "not configured yet" — it must refuse delivery, not fall back to
    // a compiled-in default that could contradict a persisted `false`.
    throw new Error('PLATFORM_INTEGRATION_AVAILABILITY_UNREADABLE');
  }
  return parsed;
}

export async function isPlatformIntegrationAvailable(
  db: DbPort,
  integrationId: PlatformIntegrationId,
): Promise<boolean> {
  const availability = await readPlatformIntegrationAvailability(db);
  return availability.integrations[integrationId];
}
