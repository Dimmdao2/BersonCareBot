import type { DbPort } from '../../kernel/contracts/index.js';
import {
  extractSystemSettingInnerValue,
  fetchPublicSystemSettingValueJson,
} from './publicSystemSettings.js';

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

const DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY: PlatformIntegrationAvailability = {
  version: 1,
  integrations: {
    telegram: true,
    max: true,
    email: true,
    smsc: true,
    web_push: true,
    google_calendar: true,
    yandex_calendar: false,
  },
};

const TTL_MS = 60_000;
let cached:
  | {
      value: PlatformIntegrationAvailability;
      expiresAt: number;
    }
  | undefined;

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

export function invalidatePlatformIntegrationAvailabilityCache(): void {
  cached = undefined;
}

async function readPlatformIntegrationAvailability(
  db: DbPort,
): Promise<PlatformIntegrationAvailability> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  let value = DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY;
  try {
    const valueJson = await fetchPublicSystemSettingValueJson(
      db,
      'platform_integration_availability',
      'admin',
    );
    value = parsePlatformIntegrationAvailability(valueJson) ?? value;
  } catch {
    // Compatibility is fail-open for already wired adapters. A missing/unreadable additive
    // registry must not silently stop delivery; explicit persisted false values still gate it.
  }
  cached = { value, expiresAt: now + TTL_MS };
  return value;
}

export async function isPlatformIntegrationAvailable(
  db: DbPort,
  integrationId: PlatformIntegrationId,
): Promise<boolean> {
  const availability = await readPlatformIntegrationAvailability(db);
  return availability.integrations[integrationId];
}
