import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ enabled: vi.fn(), config: vi.fn() }));
vi.mock('@/modules/auth/authChannelPolicy', () => ({ isOAuthProviderEnabled: fakes.enabled }));
vi.mock('@/modules/system-settings/configAdapter', () => ({ getConfigValue: fakes.config }));

import {
  resolveYandexOAuthConfig,
  yandexOAuthStateMatchesSurface,
} from './yandexOAuthConfig';
import { DEFAULT_SURFACE_AUTH_POLICY_CONFIG, type ResolvedSurface } from '@/shared/lib/surface/requestSurface';
import type { VerifiedOAuthState } from './oauthSignedState';

const patientSurface: ResolvedSurface = {
  surface: 'patient_branded',
  publicOrigin: 'https://clinic.example.test',
  organizationId: 'd8f7d3b1-84ba-4afc-b11f-cabf5b414ccd',
  clinicSlug: 'clinic',
  effectivePatientBrand: { effectiveDisplayName: 'Clinic', patientAppName: 'Clinic', accentToken: '#000000' },
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
};

beforeEach(() => {
  fakes.enabled.mockResolvedValue(true);
  fakes.config.mockImplementation(async (key: string) => {
    if (key === 'yandex_oauth_client_id') return 'client';
    if (key === 'yandex_oauth_client_secret') return 'secret';
    return JSON.stringify(['https://clinic.example.test/api/auth/oauth/callback/yandex']);
  });
});

describe('resolveYandexOAuthConfig', () => {
  it('admits exactly a configured enabled patient callback', async () => {
    await expect(resolveYandexOAuthConfig(patientSurface)).resolves.toEqual({
      clientId: 'client', clientSecret: 'secret', redirectUri: 'https://clinic.example.test/api/auth/oauth/callback/yandex',
    });
  });

  it('fault injection: rejects a substituted host, organization-bearing staff surface, and disabled provider', async () => {
    await expect(resolveYandexOAuthConfig({ ...patientSurface, publicOrigin: 'https://attacker.example.test' })).resolves.toBeNull();
    await expect(resolveYandexOAuthConfig({ ...patientSurface, surface: 'staff', organizationId: undefined, clinicSlug: undefined, effectivePatientBrand: undefined, authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff })).resolves.toBeNull();
    fakes.enabled.mockResolvedValue(false);
    await expect(resolveYandexOAuthConfig(patientSurface)).resolves.toBeNull();
  });

  it('fault injection: callback state cannot move to another host or organization', () => {
    const state: VerifiedOAuthState = {
      surface: 'patient_branded',
      publicOrigin: patientSurface.publicOrigin,
      organizationId: patientSurface.organizationId,
    };

    expect(yandexOAuthStateMatchesSurface(state, patientSurface)).toBe(true);
    expect(
      yandexOAuthStateMatchesSurface(
        state,
        { ...patientSurface, publicOrigin: 'https://attacker.example.test' },
      ),
    ).toBe(false);
    expect(
      yandexOAuthStateMatchesSurface(
        state,
        { ...patientSurface, organizationId: '23e4567-e89b-12d3-a456-426614174000' },
      ),
    ).toBe(false);
  });
});
