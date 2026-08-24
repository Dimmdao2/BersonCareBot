/**
 * Independent audit F2/F2b (2026-08-24). Blind kill-set, own values — the author's fixtures are
 * not reused. Named failures this must catch:
 *  - staff/admin surface reaches OAuth start or callback while the surface matrix cell is off;
 *  - a passkey entrance answers on the staff surface while the staff passkey cell is off;
 *  - flipping the surface setting no longer restores the path (settings become decorative);
 *  - the gate reads a global toggle instead of the per-surface key (patient value leaks to staff);
 *  - a request without a resolved surface is treated as allowed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, boolean>();
const surfaceHeader = { value: null as string | null };
const askedKeys: string[] = [];

const fakes = vi.hoisted(() => ({
  beginPatientPasskeyAuthentication: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(surfaceHeader.value ? { 'x-bc-resolved-surface': surfaceHeader.value } : {}),
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: async (key: string) => {
    askedKeys.push(key);
    if (!store.has(key)) throw new Error(`unseeded setting ${key}`);
    return store.get(key) as boolean;
  },
  getPublicAuthChannelConfigured: async () => true,
  getPublicRuntimeValue: async () => '',
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  newRegistrationAttemptId: () => 'audit-attempt-1',
  recordAuthRegistrationAttempt: vi.fn(),
  recordAuthRegistrationFailure: vi.fn(),
  registrationAttemptIdFromOAuthState: vi.fn(),
}));
vi.mock('@/modules/auth/authRouteObservability', () => ({ logAuthRouteTiming: vi.fn() }));
vi.mock('@/modules/auth/oauthStartRateLimit', () => ({
  resolveOAuthStartRateLimitClientKey: () => ({ ok: true, key: 'audit-key' }),
  isOAuthStartRateLimitedByKey: async () => false,
}));
vi.mock('@/modules/auth/oauthSignedState', () => ({
  createSignedOAuthState: () => 'audit-state',
  createAppleSignedOAuthState: () => 'audit-state',
  parseVerifiedSignedOAuthState: vi.fn(),
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getYandexOauthClientId: async () => 'audit-yandex-client',
  getYandexOauthClientSecret: async () => 'audit-yandex-secret',
  getYandexOauthRedirectUri: async () => 'https://audit.example.test/yandex-callback',
  getGoogleClientId: async () => 'audit-google-client',
  getGoogleClientSecret: async () => 'audit-google-secret',
  getGoogleOauthLoginRedirectUri: async () => 'https://audit.example.test/google-callback',
  getAppleOauthClientId: async () => 'audit-apple-client',
  getAppleOauthRedirectUri: async () => 'https://audit.example.test/apple-callback',
  getAppleOauthTeamId: async () => 'audit-team',
  getAppleOauthKeyId: async () => 'audit-key-id',
  getAppleOauthPrivateKey: async () => 'audit-private-key',
  getVkIdApplicationId: async () => 'audit-vk-app',
  getVkIdClientSecret: async () => 'audit-vk-secret',
  getVkIdRedirectUri: async () => 'https://audit.example.test/vk-callback',
}));
vi.mock('@/app-layer/auth/passkeyRuntime', () => ({
  beginPatientPasskeyAuthentication: fakes.beginPatientPasskeyAuthentication,
}));

import { POST as oauthStart } from '@/app/api/auth/oauth/start/route';
import { POST as appleCallback } from '@/app/api/auth/oauth/callback/apple/route';
import { POST as passkeyLoginOptions } from '@/app/api/auth/passkey/login/options/route';
import { SURFACE_AUTH_CONTROLS, surfaceAuthSettingKey } from './surfaceAuthSettings';
import { SYSTEM_SETTING_REGISTRY } from '@/modules/system-settings/registry';

const SURFACES = {
  staff: { surface: 'staff', publicOrigin: 'https://staff.audit.test' },
  platform_admin: { surface: 'platform_admin', publicOrigin: 'https://admin.audit.test' },
  patient: { surface: 'patient_default', publicOrigin: 'https://patient.audit.test' },
} as const;

const ALL_METHODS = ['password', 'email_code', 'phone_bot', 'totp', 'oauth', 'passkey'];

function onSurface(name: keyof typeof SURFACES): void {
  const s = SURFACES[name];
  surfaceHeader.value = encodeURIComponent(
    JSON.stringify({
      surface: s.surface,
      publicOrigin: s.publicOrigin,
      // Deliberately permissive header policy: if the gate trusted this instead of the settings
      // key, every "disabled" assertion below would flip to allowed.
      authPolicy: { availableMethods: ALL_METHODS, enabledMethods: ALL_METHODS },
    }),
  );
}

function seed(values: Record<string, boolean>): void {
  store.clear();
  for (const policy of ['staff', 'platform_admin', 'patient'] as const) {
    for (const control of SURFACE_AUTH_CONTROLS) {
      store.set(surfaceAuthSettingKey(policy, control), false);
    }
  }
  // Credential-derived "configured" projections: on, so nothing but the matrix can be the refusal.
  for (const key of ['oauth_google_enabled', 'oauth_yandex_enabled', 'oauth_apple_enabled', 'oauth_vk_enabled']) {
    store.set(key, true);
  }
  for (const [key, value] of Object.entries(values)) store.set(key, value);
}

function startRequest(provider: string): Request {
  return new Request('https://audit.test/api/auth/oauth/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body: JSON.stringify({ provider }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  askedKeys.length = 0;
  surfaceHeader.value = null;
  fakes.beginPatientPasskeyAuthentication.mockResolvedValue({
    ok: true,
    options: { challenge: 'audit-challenge' },
  });
});

describe('F2 — OAuth is refused on staff/admin by the resolved surface, not by hiding in the UI', () => {
  it('refuses staff OAuth start while the very same setting enables it for patients', async () => {
    seed({ 'auth_surface_patient_oauth_yandex_enabled': true });
    onSurface('staff');

    const denied = await oauthStart(startRequest('yandex'));
    expect(denied.status).toBe(501);
    expect(await denied.json()).toMatchObject({ error: 'oauth_disabled' });
    expect(askedKeys).toContain('auth_surface_staff_oauth_yandex_enabled');

    onSurface('patient');
    const allowed = await oauthStart(startRequest('yandex'));
    expect(allowed.status).toBe(200);
    expect(JSON.stringify(await allowed.json())).toContain('oauth.yandex.ru');
  });

  it('refuses platform_admin OAuth start the same way', async () => {
    seed({ 'auth_surface_patient_oauth_google_enabled': true });
    onSurface('platform_admin');

    const denied = await oauthStart(startRequest('google'));
    expect(denied.status).toBe(501);
    expect(askedKeys).toContain('auth_surface_platform_admin_oauth_google_enabled');
  });

  it('refuses the Apple callback on staff before it consumes callback input', async () => {
    seed({ 'auth_surface_patient_oauth_apple_enabled': true });
    onSurface('staff');

    const response = await appleCallback(
      new Request('https://staff.audit.test/api/auth/oauth/callback/apple', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'code=audit-code&state=audit-state',
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('oauth_disabled');
  });

  it('returns the staff path to service by the setting alone, with no code change', async () => {
    seed({ 'auth_surface_staff_oauth_yandex_enabled': true });
    onSurface('staff');

    const response = await oauthStart(startRequest('yandex'));
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain('oauth.yandex.ru');
  });

  it('fails closed when no surface was resolved for the request', async () => {
    seed({
      'auth_surface_staff_oauth_yandex_enabled': true,
      'auth_surface_patient_oauth_yandex_enabled': true,
    });
    surfaceHeader.value = null;

    const response = await oauthStart(startRequest('yandex'));
    expect(response.status).toBe(501);
  });
});

describe('F2b — passkey is a matrix mechanic, off for doctors by default', () => {
  it('refuses the passkey login ceremony on staff and allows it on patient with the same code', async () => {
    seed({ 'auth_surface_patient_passkey_enabled': true });
    onSurface('staff');

    const denied = await passkeyLoginOptions(
      new Request('https://staff.audit.test/api/auth/passkey/login/options', { method: 'POST' }),
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: 'auth_method_disabled' });
    expect(fakes.beginPatientPasskeyAuthentication).not.toHaveBeenCalled();
    expect(askedKeys).toContain('auth_surface_staff_passkey_enabled');

    onSurface('patient');
    const allowed = await passkeyLoginOptions(
      new Request('https://patient.audit.test/api/auth/passkey/login/options', { method: 'POST' }),
    );
    expect(allowed.status).toBe(200);
    expect(fakes.beginPatientPasskeyAuthentication).toHaveBeenCalledOnce();
  });

  it('turns the doctor passkey back on by the staff setting alone', async () => {
    seed({ 'auth_surface_staff_passkey_enabled': true });
    onSurface('staff');

    const response = await passkeyLoginOptions(
      new Request('https://staff.audit.test/api/auth/passkey/login/options', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
  });

  it('ships staff passkey and staff/admin OAuth off by default, and changes nobody else', () => {
    const def = (key: string) => SYSTEM_SETTING_REGISTRY[key as never] as { defaultValue: string };
    expect(def('auth_surface_staff_passkey_enabled').defaultValue).toBe('false');
    for (const provider of ['google', 'yandex', 'apple', 'vk']) {
      expect(def(`auth_surface_staff_oauth_${provider}_enabled`).defaultValue).toBe('false');
      expect(def(`auth_surface_platform_admin_oauth_${provider}_enabled`).defaultValue).toBe('false');
    }
    // Untouched rows of the same matrix: doctor email/password entry, admin passkey, patient entry.
    expect(def('auth_surface_staff_email_enabled').defaultValue).toBe('true');
    expect(def('auth_surface_platform_admin_passkey_enabled').defaultValue).toBe('true');
    expect(def('auth_surface_patient_email_enabled').defaultValue).toBe('true');
    expect(def('auth_surface_patient_passkey_enabled').defaultValue).toBe('true');
  });
});
