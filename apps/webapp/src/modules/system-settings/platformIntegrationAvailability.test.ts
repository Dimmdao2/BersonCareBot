import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY,
  PLATFORM_INTEGRATION_CATALOG,
  PLATFORM_INTEGRATION_IDS,
  normalizePlatformIntegrationAvailability,
  parsePlatformIntegrationAvailabilityEnvelope,
} from './platformIntegrationAvailability';

describe('platform integration availability', () => {
  it('has one catalog row for every stored switch', () => {
    expect(PLATFORM_INTEGRATION_CATALOG.map((entry) => entry.id)).toEqual(PLATFORM_INTEGRATION_IDS);
    expect(new Set(PLATFORM_INTEGRATION_IDS).size).toBe(PLATFORM_INTEGRATION_IDS.length);
  });

  it('preserves existing integrations and leaves declared-only Yandex Calendar unavailable', () => {
    expect(DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY.integrations.google_calendar).toBe(true);
    expect(DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY.integrations.yandex_calendar).toBe(false);
    for (const entry of PLATFORM_INTEGRATION_CATALOG) {
      if (entry.implementation === 'available') {
        expect(DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY.integrations[entry.id]).toBe(true);
      }
    }
  });

  it('accepts only the complete versioned boolean shape', () => {
    const normalized = normalizePlatformIntegrationAvailability({
      version: 1,
      integrations: {
        ...DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY.integrations,
        yandex_calendar: true,
      },
    });
    expect(normalized?.integrations.yandex_calendar).toBe(true);
    expect(
      normalizePlatformIntegrationAvailability({
        version: 1,
        integrations: { ...DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY.integrations, unknown: true },
      }),
    ).toBeNull();
    expect(
      normalizePlatformIntegrationAvailability({
        version: 1,
        integrations: {
          ...DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY.integrations,
          telegram: 'yes',
        },
      }),
    ).toBeNull();
  });

  it('fails closed to the compatibility default for malformed envelopes', () => {
    expect(parsePlatformIntegrationAvailabilityEnvelope({ value: { version: 2 } })).toBe(
      DEFAULT_PLATFORM_INTEGRATION_AVAILABILITY,
    );
  });
});
