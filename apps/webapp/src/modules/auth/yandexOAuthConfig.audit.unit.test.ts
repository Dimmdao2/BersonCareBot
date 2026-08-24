import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Independent audit of plan items C1/C2 (THERAPYSTO_PATIENT_BRANDING_INITIATIVE). The kill-set was
 * written against the plan text before reading the author's tests; it covers the cases the author's
 * `yandexOAuthConfig.unit.test.ts` leaves open: near-miss allowlist entries, the empty allowlist,
 * the claimed backwards compatibility with the former single `yandex_oauth_redirect_uri` value, a
 * patient surface that does not offer OAuth at all, and a pre-deploy state that carries no surface.
 */
const fakes = vi.hoisted(() => ({ enabled: vi.fn(), config: vi.fn() }));
vi.mock('@/modules/auth/authChannelPolicy', () => ({ isOAuthProviderEnabled: fakes.enabled }));
vi.mock('@/modules/system-settings/configAdapter', () => ({ getConfigValue: fakes.config }));

import { resolveYandexOAuthConfig, yandexOAuthStateMatchesSurface } from './yandexOAuthConfig';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';
import type { VerifiedOAuthState } from './oauthSignedState';

const ORG = 'd8f7d3b1-84ba-4afc-b11f-cabf5b414ccd';
const CALLBACK = 'https://clinic.example.test/api/auth/oauth/callback/yandex';

const branded: ResolvedSurface = {
  surface: 'patient_branded',
  publicOrigin: 'https://clinic.example.test',
  organizationId: ORG,
  clinicSlug: 'clinic',
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
};

function storeAllowlist(raw: string) {
  fakes.config.mockImplementation(async (key: string) => {
    if (key === 'yandex_oauth_client_id') return 'client';
    if (key === 'yandex_oauth_client_secret') return 'secret';
    return raw;
  });
}

beforeEach(() => {
  fakes.enabled.mockResolvedValue(true);
  storeAllowlist(JSON.stringify([CALLBACK]));
});

describe('C2: exact callback allowlist', () => {
  it('refuses every near miss and the empty allowlist', async () => {
    // Registry default for an unconfigured install.
    storeAllowlist('[]');
    await expect(resolveYandexOAuthConfig(branded)).resolves.toBeNull();
    storeAllowlist(JSON.stringify([`${CALLBACK}/`]));
    await expect(resolveYandexOAuthConfig(branded)).resolves.toBeNull();
    storeAllowlist(
      JSON.stringify(['https://clinic.example.test:443/api/auth/oauth/callback/yandex']),
    );
    await expect(resolveYandexOAuthConfig(branded)).resolves.toBeNull();
    storeAllowlist(JSON.stringify(['https://clinic.example.test/api/auth/oauth/callback/yandex?']));
    await expect(resolveYandexOAuthConfig(branded)).resolves.toBeNull();
    // A malformed stored value must fail closed, not throw.
    storeAllowlist('{"redirect":"' + CALLBACK + '"}');
    await expect(resolveYandexOAuthConfig(branded)).resolves.toBeNull();
  });

  it('C2-5: keeps reading the former single redirect-uri value in both stored shapes', async () => {
    storeAllowlist(CALLBACK);
    await expect(resolveYandexOAuthConfig(branded)).resolves.toMatchObject({
      redirectUri: CALLBACK,
    });
    storeAllowlist(JSON.stringify(CALLBACK));
    await expect(resolveYandexOAuthConfig(branded)).resolves.toMatchObject({
      redirectUri: CALLBACK,
    });
  });
});

describe('C2-1: only enabled patient surfaces', () => {
  it('refuses a patient surface whose auth policy does not offer oauth', async () => {
    await expect(
      resolveYandexOAuthConfig({
        ...branded,
        authPolicy: { availableMethods: ['email_code', 'passkey'], enabledMethods: ['email_code'] },
      }),
    ).resolves.toBeNull();
  });

  it('refuses platform_admin the same way it refuses staff', async () => {
    for (const surface of ['staff', 'platform_admin'] as const) {
      await expect(
        resolveYandexOAuthConfig({
          ...branded,
          surface,
          authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG[surface],
        }),
      ).resolves.toBeNull();
    }
  });
});

describe('C2-2: state binding', () => {
  it('refuses a state minted before the surface fields existed', () => {
    const legacyState: VerifiedOAuthState = {} as VerifiedOAuthState;
    expect(yandexOAuthStateMatchesSurface(legacyState, branded)).toBe(false);
    expect(
      yandexOAuthStateMatchesSurface(legacyState, {
        ...branded,
        surface: 'patient_default',
        organizationId: undefined,
        clinicSlug: undefined,
      }),
    ).toBe(false);
  });

  it('refuses a branded state replayed on the common patient surface', () => {
    const state: VerifiedOAuthState = {
      surface: 'patient_branded',
      publicOrigin: branded.publicOrigin,
      organizationId: ORG,
    };
    expect(
      yandexOAuthStateMatchesSurface(state, {
        surface: 'patient_default',
        publicOrigin: 'https://app.example.test',
        authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
      }),
    ).toBe(false);
    // Same origin, tenant swapped underneath it.
    expect(
      yandexOAuthStateMatchesSurface(state, {
        ...branded,
        organizationId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toBe(false);
  });
});
