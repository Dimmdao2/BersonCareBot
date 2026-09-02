export const PLATFORM_INTEGRATION_IDS = [
  'telegram',
  'max',
  'vk',
  'email',
  'smsc',
  'web_push',
  'google_calendar',
  'yandex_calendar',
] as const;

export type PlatformIntegrationId = (typeof PLATFORM_INTEGRATION_IDS)[number];

export type PlatformIntegrationAvailability = Readonly<{
  version: 1;
  /** A missing or malformed id is absent and must fail closed only for that requested id. */
  integrations: Readonly<Partial<Record<PlatformIntegrationId, boolean>>>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Parses the versioned persisted value; unknown ids invalidate the complete envelope. */
export function normalizePlatformIntegrationAvailability(
  value: unknown,
): PlatformIntegrationAvailability | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.integrations)) {
    return null;
  }
  if (
    Object.keys(value.integrations).some(
      (id) => !PLATFORM_INTEGRATION_IDS.includes(id as PlatformIntegrationId),
    )
  ) {
    return null;
  }

  const integrations: Partial<Record<PlatformIntegrationId, boolean>> = {};
  for (const id of PLATFORM_INTEGRATION_IDS) {
    const enabled = value.integrations[id];
    if (typeof enabled === 'boolean') integrations[id] = enabled;
  }
  return { version: 1, integrations };
}

/** Fail closed for a requested id; an absent or malformed per-id value is never enabled. */
export function isPlatformIntegrationAvailable(
  availability: PlatformIntegrationAvailability,
  integrationId: PlatformIntegrationId,
): boolean {
  return availability.integrations[integrationId] === true;
}

/** Distinguishes a persisted boolean from a per-id absence for adapters that surface it as an error. */
export function hasPlatformIntegrationAvailabilityValue(
  availability: PlatformIntegrationAvailability,
  integrationId: PlatformIntegrationId,
): boolean {
  return typeof availability.integrations[integrationId] === 'boolean';
}
