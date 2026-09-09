/**
 * #915 auditor-live oracle for the missing-keyring degrade
 * (`.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/00-blind-killset.md` K19).
 *
 * Failure caught: with `NATIVE_PUSH_TOKEN_KEYRING_JSON` absent, `buildAppDeps().nativePushTargets`
 * is `undefined` (`fd3f6a3b5`, `buildAppDeps.ts`). Before that fix the equivalent dependency
 * construction threw at module scope, taking down unrelated Next/PWA bootstrap; the risk this test
 * targets is the two API routes' own handling of that `undefined` dependency — an unhandled
 * exception or a raw internal error message reaching the client instead of the typed
 * `native_push_unavailable` skip these routes are meant to return.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireAccountWebPushSelfApiSession: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireAccountWebPushSelfApiSession: fakes.requireAccountWebPushSelfApiSession,
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/modules/web-push/nativePush', () => ({
  isNativePushProvider: (value: unknown) => value === 'rustore' || value === 'fcm' || value === 'hms',
}));

import { GET as patientGet, POST as patientPost, DELETE as patientDelete } from '@/app/api/patient/native-push/route';
import { GET as accountGet, POST as accountPost, DELETE as accountDelete } from '@/app/api/account/native-push/route';

const userId = '3c91f0cf-ff9a-48f3-88e6-6bd773056fd3';

function installDepsWithoutKeyring() {
  fakes.buildAppDeps.mockReturnValue({ nativePushTargets: undefined, systemSettings: {} });
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: { user: { userId } } });
  fakes.requireAccountWebPushSelfApiSession.mockResolvedValue({ ok: true, session: { user: { userId } } });
}

function registrationBody() {
  return new Request('https://therapygo.example.test/api/patient/native-push', {
    method: 'POST',
    body: JSON.stringify({ installationId: 'installation-1', token: 'a-real-looking-token', provider: 'rustore' }),
  });
}

function revokeBody() {
  return new Request('https://therapygo.example.test/api/patient/native-push', {
    method: 'DELETE',
    body: JSON.stringify({ installationId: 'installation-1', provider: 'rustore' }),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ['patient', patientGet, patientPost, patientDelete],
  ['account', accountGet, accountPost, accountDelete],
])('%s native-push route with no configured keyring — M6-01/M6-11', (_surface, get, post, del) => {
  it('GET returns a typed unavailable outcome instead of throwing', async () => {
    installDepsWithoutKeyring();

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      active: false,
      providers: [],
      projectId: null,
      runtime: 'unavailable',
    });
  });

  it('POST (register) returns typed 503 native_push_unavailable instead of throwing or 500ing', async () => {
    installDepsWithoutKeyring();

    const response = await post(registrationBody());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'native_push_unavailable' });
  });

  it('DELETE (revoke) returns typed 503 native_push_unavailable instead of throwing or 500ing', async () => {
    installDepsWithoutKeyring();

    const response = await del(revokeBody());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'native_push_unavailable' });
  });
});
