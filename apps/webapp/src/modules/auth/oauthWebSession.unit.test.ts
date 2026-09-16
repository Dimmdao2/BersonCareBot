import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/shared/types/session';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';

const fakes = vi.hoisted(() => ({
  setSessionFromUser: vi.fn(),
  recordAuthLogin: vi.fn(),
  getPostAuthRedirectTarget: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: {
    APP_BASE_URL: 'https://app.example.test',
    SESSION_COOKIE_SECRET: 'oauth-door-test-secret',
  },
}));
vi.mock('@/modules/auth/service', () => ({ setSessionFromUser: fakes.setSessionFromUser }));
vi.mock('@/app-layer/product-analytics/recordAuthLogin', () => ({
  recordAuthLogin: fakes.recordAuthLogin,
}));
vi.mock('@/modules/auth/redirectPolicy', () => ({
  getPostAuthRedirectTarget: fakes.getPostAuthRedirectTarget,
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/shared/platform-user/isPlatformUserUuid', () => ({
  isPlatformUserUuid: () => false,
}));

import {
  createSignedOAuthState,
  parseVerifiedSignedOAuthState,
  roleLoginPortalFromOAuthState,
} from '@/modules/auth/oauthSignedState';
import { completeOAuthWebLoginRedirectUrls } from '@/modules/auth/oauthWebSession';

const clientUser: SessionUser = {
  userId: 'client-user',
  role: 'client',
  displayName: 'Пациент',
  bindings: {},
};

function userPort(user: SessionUser): UserByPhonePort {
  return {
    findByUserId: vi.fn().mockResolvedValue(user),
  } as unknown as UserByPhonePort;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getPostAuthRedirectTarget.mockReturnValue('/app/patient');
  fakes.setSessionFromUser.mockResolvedValue(undefined);
  fakes.recordAuthLogin.mockResolvedValue(undefined);
});

describe('OAuth named-door session boundary', () => {
  it('keeps the named door in signed state even when there is no next path', () => {
    const state = createSignedOAuthState('google_login', 600, {
      roleLoginPortal: 'patient',
    });

    expect(parseVerifiedSignedOAuthState(state, 'google_login')).toMatchObject({
      roleLoginPortal: 'patient',
    });
  });

  it('does not mint a doctor session through the patient door', async () => {
    const doctorUser: SessionUser = {
      ...clientUser,
      userId: 'doctor-user',
      role: 'doctor',
      displayName: 'Врач',
    };

    await expect(
      completeOAuthWebLoginRedirectUrls({
        userId: doctorUser.userId,
        displayNameHint: doctorUser.displayName,
        authMethod: 'google_oauth',
        userByPhone: userPort(doctorUser),
        roleLoginPortal: 'patient',
      }),
    ).resolves.toEqual({ ok: false, reason: 'oauth_role_not_allowed' });

    expect(fakes.setSessionFromUser).not.toHaveBeenCalled();
    expect(fakes.recordAuthLogin).not.toHaveBeenCalled();
  });

  it('keeps patient OAuth working for a legacy state without a named door', async () => {
    const roleLoginPortal = roleLoginPortalFromOAuthState({ attemptId: 'legacy-attempt' });

    await expect(
      completeOAuthWebLoginRedirectUrls({
        userId: clientUser.userId,
        displayNameHint: clientUser.displayName,
        authMethod: 'google_oauth',
        userByPhone: userPort(clientUser),
        roleLoginPortal,
      }),
    ).resolves.toEqual({
      ok: true,
      redirectUrl: 'https://app.example.test/app/patient',
    });

    expect(fakes.setSessionFromUser).toHaveBeenCalledOnce();
  });
});
