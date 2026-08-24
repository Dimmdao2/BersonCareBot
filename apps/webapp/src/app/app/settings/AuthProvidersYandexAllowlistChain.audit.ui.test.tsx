import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round-2 audit of `C1`/`C2` (THERAPYSTO_PATIENT_BRANDING_INITIATIVE). Round 1 proved the resolver
 * and the lead's fix proved the form; neither crosses the seam between them. The kill-set here is
 * the join: an allowlist written by the admin form has to survive the real persistence serializer
 * and arrive at the resolver whole, in both the new list shape and the single value older
 * installations still carry. If it does not, Yandex login answers `oauth_disabled` on every
 * branded patient domain and nothing in the product says why.
 */
const fakes = vi.hoisted(() => ({
  enabled: vi.fn(),
  config: vi.fn(),
  patch: vi.fn(),
  listSettingsByScope: vi.fn(),
}));

vi.mock('@/modules/auth/authChannelPolicy', () => ({ isOAuthProviderEnabled: fakes.enabled }));
vi.mock('@/modules/system-settings/configAdapter', () => ({ getConfigValue: fakes.config }));
vi.mock('./patchAdminSetting', () => ({
  patchAdminSetting: (...args: unknown[]) => fakes.patch(...args),
  patchAdminSettingWithResult: (...args: unknown[]) =>
    fakes.patch(...args).then(() => ({ ok: true })),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ systemSettings: { listSettingsByScope: fakes.listSettingsByScope } }),
}));

import { AuthProvidersSection } from './AuthProvidersSection';
import { loadAuthProvidersConfig } from './adminSettingsData';
import { systemSettingInnerValueToString } from '@/infra/repos/pgSystemSettings';
import { resolveYandexOAuthConfig } from '@/modules/auth/yandexOAuthConfig';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  type ResolvedSurface,
} from '@/shared/lib/surface/requestSurface';

const ORG = 'd8f7d3b1-84ba-4afc-b11f-cabf5b414ccd';
const BRANDED_ORIGIN = 'https://clinic.example.test';
const DEFAULT_ORIGIN = 'https://app.example.test';
const CALLBACK_PATH = '/api/auth/oauth/callback/yandex';

const branded: ResolvedSurface = {
  surface: 'patient_branded',
  publicOrigin: BRANDED_ORIGIN,
  organizationId: ORG,
  clinicSlug: 'clinic',
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
};
const patientDefault: ResolvedSurface = {
  surface: 'patient_default',
  publicOrigin: DEFAULT_ORIGIN,
  authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
};

const baseProps = {
  telegramLoginBotUsername: '',
  maxLoginBotNickname: '',
  maxBotApiKey: '',
  vkIdApplicationId: '',
  vkIdHasStoredClientSecret: false,
  vkIdRedirectUri: '',
  yandexOauthClientId: 'client-id',
  yandexOauthClientSecret: 'client-secret',
  googleClientId: '',
  googleClientSecret: '',
  googleOauthLoginRedirectUri: '',
  googleCalendarRedirectUri: '',
  appleOauthClientId: '',
  appleOauthTeamId: '',
  appleOauthKeyId: '',
  appleOauthPrivateKey: '',
  appleOauthRedirectUri: '',
};

/** Whatever the admin form hands the settings write service, verbatim. */
async function saveAllowlistField(value: string, initial = ''): Promise<unknown> {
  render(<AuthProvidersSection {...baseProps} yandexOauthRedirectUri={initial} />);
  const field = screen.getByPlaceholderText(`https://example.com${CALLBACK_PATH}`);
  fireEvent.change(field, { target: { value } });
  fireEvent.click(screen.getAllByRole('button', { name: /Сохранить/i })[0]!);
  await waitFor(() => expect(fakes.patch).toHaveBeenCalled());
  return fakes.patch.mock.calls.find((call) => call[0] === 'yandex_oauth_redirect_uri')?.[1];
}

/** A save the form must refuse outright: the user sees the error and nothing is written. */
async function expectRefusedSave(value: string): Promise<void> {
  render(<AuthProvidersSection {...baseProps} yandexOauthRedirectUri="" />);
  const field = screen.getByPlaceholderText(`https://example.com${CALLBACK_PATH}`);
  fireEvent.change(field, { target: { value } });
  fireEvent.click(screen.getAllByRole('button', { name: /Сохранить/i })[0]!);
  await waitFor(() => expect(screen.getByText(/Yandex redirect URI/)).toBeTruthy());
  expect(
    fakes.patch.mock.calls.some((call) => call[0] === 'yandex_oauth_redirect_uri'),
  ).toBe(false);
}

/** The real read hop: `system_settings.value_json` inner value → the string the resolver sees. */
function storeAsPersisted(innerValue: unknown): void {
  const persisted = systemSettingInnerValueToString(innerValue);
  fakes.config.mockImplementation(async (key: string) => {
    if (key === 'yandex_oauth_client_id') return 'client';
    if (key === 'yandex_oauth_client_secret') return 'secret';
    if (key === 'yandex_oauth_redirect_uri') return persisted ?? '';
    return '';
  });
}

/** The admin page read hop: stored inner value → what the form field shows. */
async function displayedAllowlistField(innerValue: unknown): Promise<string> {
  fakes.listSettingsByScope.mockResolvedValue([
    { key: 'yandex_oauth_redirect_uri', scope: 'admin', valueJson: { value: innerValue } },
  ]);
  return (await loadAuthProvidersConfig()).yandexOauthRedirectUri;
}

beforeEach(() => {
  fakes.enabled.mockResolvedValue(true);
  fakes.patch.mockResolvedValue(true);
  fakes.listSettingsByScope.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('R2-1: a two-origin allowlist survives the write path end to end', () => {
  it('lets both branded and common patient surfaces resolve their own callback', async () => {
    const saved = await saveAllowlistField(
      `${BRANDED_ORIGIN}${CALLBACK_PATH}\n${DEFAULT_ORIGIN}${CALLBACK_PATH}`,
    );
    storeAsPersisted(saved);

    await expect(resolveYandexOAuthConfig(branded)).resolves.toEqual({
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: `${BRANDED_ORIGIN}${CALLBACK_PATH}`,
    });
    await expect(resolveYandexOAuthConfig(patientDefault)).resolves.toMatchObject({
      redirectUri: `${DEFAULT_ORIGIN}${CALLBACK_PATH}`,
    });
  });

  it('still refuses an origin the operator never listed', async () => {
    storeAsPersisted(await saveAllowlistField(`${BRANDED_ORIGIN}${CALLBACK_PATH}`));
    await expect(resolveYandexOAuthConfig(patientDefault)).resolves.toBeNull();
    await expect(
      resolveYandexOAuthConfig({ ...branded, publicOrigin: 'https://evil.example.test' }),
    ).resolves.toBeNull();
  });

  it('round-trips: what the page shows is what saving it back stores', async () => {
    const stored = [`${BRANDED_ORIGIN}${CALLBACK_PATH}`, `${DEFAULT_ORIGIN}${CALLBACK_PATH}`];
    const shown = await displayedAllowlistField(stored);
    expect(shown).toBe(stored.join('\n'));

    const resaved = await saveAllowlistField(shown, shown);
    expect(resaved).toEqual(stored);
    storeAsPersisted(resaved);
    await expect(resolveYandexOAuthConfig(branded)).resolves.toMatchObject({
      redirectUri: `${BRANDED_ORIGIN}${CALLBACK_PATH}`,
    });
  });
});

describe('R2-2: an installation that stored a single string keeps working', () => {
  it('shows the old value instead of an empty field', async () => {
    expect(await displayedAllowlistField(`  ${BRANDED_ORIGIN}${CALLBACK_PATH}  `)).toBe(
      `${BRANDED_ORIGIN}${CALLBACK_PATH}`,
    );
  });

  it('resolves for the listed surface before anyone reopens the form', async () => {
    storeAsPersisted(`${BRANDED_ORIGIN}${CALLBACK_PATH}`);
    await expect(resolveYandexOAuthConfig(branded)).resolves.toMatchObject({
      redirectUri: `${BRANDED_ORIGIN}${CALLBACK_PATH}`,
    });
  });

  it('upgrades in place: the old value plus a new one saves as a two-entry list', async () => {
    const shown = await displayedAllowlistField(`${BRANDED_ORIGIN}${CALLBACK_PATH}`);
    const saved = await saveAllowlistField(`${shown}\n${DEFAULT_ORIGIN}${CALLBACK_PATH}`, shown);
    expect(saved).toEqual([
      `${BRANDED_ORIGIN}${CALLBACK_PATH}`,
      `${DEFAULT_ORIGIN}${CALLBACK_PATH}`,
    ]);
    storeAsPersisted(saved);
    await expect(resolveYandexOAuthConfig(branded)).resolves.not.toBeNull();
    await expect(resolveYandexOAuthConfig(patientDefault)).resolves.not.toBeNull();
  });
});

describe('R2-3: a bad line is refused without touching what already works', () => {
  it.each([
    ['javascript:alert(1)', 'javascript scheme'],
    ['clinic.example.test/api/auth/oauth/callback/yandex', 'origin without scheme'],
    ['не-адрес', 'free text'],
  ])('refuses %s (%s) and writes nothing', async (bad) => {
    await expectRefusedSave(`${BRANDED_ORIGIN}${CALLBACK_PATH}\n${bad}`);
  });

  it('keeps the previously stored allowlist alive after the refused save', async () => {
    storeAsPersisted([`${BRANDED_ORIGIN}${CALLBACK_PATH}`]);
    await expectRefusedSave(`${BRANDED_ORIGIN}${CALLBACK_PATH}\njavascript:alert(1)`);
    await expect(resolveYandexOAuthConfig(branded)).resolves.not.toBeNull();
  });

  it('drops blank lines instead of storing empty allowlist entries', async () => {
    const saved = await saveAllowlistField(
      `\n  \n${BRANDED_ORIGIN}${CALLBACK_PATH}\n\n${DEFAULT_ORIGIN}${CALLBACK_PATH}\n`,
    );
    expect(saved).toEqual([
      `${BRANDED_ORIGIN}${CALLBACK_PATH}`,
      `${DEFAULT_ORIGIN}${CALLBACK_PATH}`,
    ]);
  });
});

describe('R2-5: staff and platform_admin gain nothing from the list', () => {
  it.each(['staff', 'platform_admin'] as const)(
    'refuses %s even when its exact callback is listed',
    async (surface) => {
      const staffOrigin = 'https://staff.example.test';
      storeAsPersisted(await saveAllowlistField(`${staffOrigin}${CALLBACK_PATH}`));
      await expect(
        resolveYandexOAuthConfig({
          surface,
          publicOrigin: staffOrigin,
          authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG[surface],
        }),
      ).resolves.toBeNull();
    },
  );

  it('refuses a patient surface whose oauth method is switched off', async () => {
    storeAsPersisted(await saveAllowlistField(`${BRANDED_ORIGIN}${CALLBACK_PATH}`));
    fakes.enabled.mockResolvedValue(false);
    await expect(resolveYandexOAuthConfig(branded)).resolves.toBeNull();
  });
});
