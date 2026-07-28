import { beforeEach, describe, expect, it, vi } from 'vitest';

// C-1 (2026-07-26, docs/_TODO/NIGHT_PLAN_2026-07-26.md): the ONE session-revocation chokepoint in
// getCurrentSessionWithPrincipalMode() — `platform_users.session_epoch` compared for EQUALITY —
// plus the absolute session-age ceiling. Uses the REAL sessionCookie module (not mocked) so the
// real encode/decode, shape validation and absolute-age arithmetic all run.

const mocks = vi.hoisted(() => ({
  findByUserId: vi.fn(),
  getVerifiedEmailForUser: vi.fn(),
  isVerifiedEmailGlobalAdminAsync: vi.fn(),
  resolveRoleAsync: vi.fn(),
  stampDbPrincipalFromSession: vi.fn(),
  updateRole: vi.fn(),
  invalidateSessionsForSelf: vi.fn(),
  cookieSet: vi.fn(),
  cookieValue: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'bersoncare_webapp_session' && mocks.cookieValue
        ? { value: mocks.cookieValue }
        : undefined,
    set: (...args: unknown[]) => mocks.cookieSet(...args),
  }),
  headers: async () => new Headers(),
}));

vi.mock('@/config/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://unit-test.invalid/bcb',
    NODE_ENV: 'test',
    ALLOW_DEV_AUTH_BYPASS: false,
    SESSION_COOKIE_SECRET: 'test-session-secret-min-16-chars',
  },
  isProduction: false,
}));

vi.mock('./envRole', () => ({
  isVerifiedEmailGlobalAdminAsync: (...args: unknown[]) =>
    mocks.isVerifiedEmailGlobalAdminAsync(...args),
  resolveRoleAsync: (...args: unknown[]) => mocks.resolveRoleAsync(...args),
  isWhitelistedAsync: vi.fn(),
}));

vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorWebappEntrySecret: async () => '',
  getTelegramBotToken: async () => '',
  getMaxBotApiKey: async () => '',
}));

vi.mock('@/app-layer/principal/sessionPrincipal', () => ({
  stampDbPrincipalFromSession: (...args: unknown[]) => mocks.stampDbPrincipalFromSession(...args),
}));

vi.mock('@/infra/repos/pgUserByPhone', () => ({
  pgUserByPhonePort: {
    findByUserId: (...args: unknown[]) => mocks.findByUserId(...args),
    getVerifiedEmailForUser: (...args: unknown[]) => mocks.getVerifiedEmailForUser(...args),
    invalidateSessionsForSelf: (...args: unknown[]) => mocks.invalidateSessionsForSelf(...args),
  },
}));

vi.mock('@/infra/repos/pgUserProjection', () => ({
  pgUserProjectionPort: {
    updateRole: (...args: unknown[]) => mocks.updateRole(...args),
  },
}));

import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import type { SessionUser, UserRole } from '@/shared/types/session';
import {
  encodeSessionCookie,
  SESSION_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS,
} from './sessionCookie';
import { clearSession, getCurrentSession } from './service';

const USER_ID = '33333333-3333-4333-8333-333333333333';
/** A legacy messenger onboarding id: no `platform_users` row, so no epoch can ever apply to it. */
const NON_DB_USER_ID = 'tg:222222222';

function user(role: UserRole, sessionEpoch?: number, userId = USER_ID): SessionUser {
  return {
    userId,
    role,
    displayName: 'Test',
    bindings: {},
    ...(sessionEpoch === undefined ? {} : { sessionEpoch }),
  };
}

/**
 * The shape the REAL `pgUserByPhonePort.findByUserId` returns: `sessionEpoch` is ALWAYS a number,
 * because `platform_users.session_epoch` is `NOT NULL DEFAULT 1 CHECK (session_epoch >= 1)`. Its
 * absence from a DB row is a drift/failure state, covered by its own fail-closed case below, so it
 * must never be the accidental default of a fixture.
 */
function dbUser(role: UserRole, sessionEpoch = 1): SessionUser {
  return user(role, sessionEpoch);
}

function setCookie(
  issuedAt: number,
  role: UserRole,
  sessionEpoch: number | undefined = 1,
  expiresAt = 9_999_999_999,
): void {
  mocks.cookieValue = encodeSessionCookie({ user: user(role, sessionEpoch), issuedAt, expiresAt });
}

function resetMocks(): void {
  for (const m of [
    mocks.findByUserId,
    mocks.getVerifiedEmailForUser,
    mocks.isVerifiedEmailGlobalAdminAsync,
    mocks.resolveRoleAsync,
    mocks.stampDbPrincipalFromSession,
    mocks.updateRole,
    mocks.invalidateSessionsForSelf,
    mocks.cookieSet,
  ]) {
    m.mockReset();
  }
  mocks.invalidateSessionsForSelf.mockResolvedValue(undefined);
  mocks.cookieValue = undefined;
  mocks.getVerifiedEmailForUser.mockResolvedValue(null);
  mocks.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);
}

async function resolve() {
  return runWithDbBootstrapPrincipal({ source: 'service.sessionRevocation.test' }, () =>
    getCurrentSession(),
  );
}

describe('getCurrentSession — session_epoch equality chokepoint (C-1, 2026-07-26)', () => {
  beforeEach(resetMocks);

  it("accepts a session whose cookie epoch EQUALS the row's", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 100, 'doctor', 7);
    mocks.findByUserId.mockResolvedValue(dbUser('doctor', 7));
    mocks.resolveRoleAsync.mockResolvedValue('doctor');

    expect((await resolve())?.user.role).toBe('doctor');
  });

  it("rejects a session whose cookie epoch is BEHIND the row's (something revoked it)", async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 100, 'doctor', 7);
    mocks.findByUserId.mockResolvedValue(dbUser('doctor', 8));
    mocks.resolveRoleAsync.mockResolvedValue('doctor');

    expect(await resolve()).toBeNull();
  });

  it("rejects a cookie epoch AHEAD of the row's too — this is equality, not an ordering test", async () => {
    // The distinction from the predecessor mechanism, and the whole reason for D3: a comparison with
    // a direction can be defeated by moving one side. `<` would have accepted this; `!==` does not,
    // so a rolled-back row or a hand-edited value cannot buy a session either.
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 100, 'client', 99);
    mocks.findByUserId.mockResolvedValue(dbUser('client', 4));

    expect(await resolve()).toBeNull();
  });

  it('age is irrelevant to the epoch check: a very old cookie at the current epoch still resolves', async () => {
    // No clock takes part in the revocation decision (D3). Only the absolute ceiling, further down,
    // may reject a session for being old — and that compares two APP-clock values.
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 1_000_000, 'client', 3);
    mocks.findByUserId.mockResolvedValue(dbUser('client', 3));

    expect((await resolve())?.user.role).toBe('client');
  });

  // ---- the one-time forced global sign-out at cutover -----------------------------------------

  it('CUTOVER: a DB-backed cookie carrying NO epoch is rejected (every pre-deploy session dies once)', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Minted inline rather than via setCookie(): passing `undefined` to a defaulted parameter would
    // silently re-apply the default and the test would assert nothing. This cookie genuinely has no
    // `sessionEpoch` key — the shape every cookie minted before this deploy has.
    mocks.cookieValue = encodeSessionCookie({
      user: user('client'),
      issuedAt: now - 10,
      expiresAt: 9_999_999_999,
    });
    expect(JSON.parse(atob(mocks.cookieValue.split('.')[0]!)).user.sessionEpoch).toBeUndefined();
    mocks.findByUserId.mockResolvedValue(dbUser('client', 1));

    expect(await resolve()).toBeNull();
  });

  it('a non-DB-backed identity has no epoch and is NOT rejected for lacking one', async () => {
    // Legacy `tg:…` onboarding transport: there is no platform_users row, so there is no counter
    // that could ever be compared. The invariant must not degrade into "everyone without a row is
    // logged out".
    const now = Math.floor(Date.now() / 1000);
    mocks.cookieValue = encodeSessionCookie({
      user: user('client', undefined, NON_DB_USER_ID),
      issuedAt: now - 10,
      expiresAt: 9_999_999_999,
    });

    expect((await resolve())?.user.userId).toBe(NON_DB_USER_ID);
    expect(mocks.findByUserId).not.toHaveBeenCalled();
  });

  // ---- fail closed -----------------------------------------------------------------------------

  it('FAIL CLOSED: a DB row that comes back WITHOUT session_epoch is rejected', async () => {
    // The shape a drifted SELECT produces. The predecessor treated the analogous case as "no cutoff"
    // and accepted it.
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, 'client', 1);
    mocks.findByUserId.mockResolvedValue(user('client')); // no sessionEpoch key at all

    expect(await resolve()).toBeNull();
  });

  it('FAIL CLOSED: a PATIENT whose identity read throws is rejected (it used to fall back to the cookie user)', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, 'client', 1);
    mocks.findByUserId.mockRejectedValue(new Error('identity_read_failed'));

    expect(await resolve()).toBeNull();
  });

  it('FAIL CLOSED: a STAFF member whose identity read throws is rejected', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, 'doctor', 1);
    mocks.findByUserId.mockRejectedValue(new Error('identity_read_failed'));
    mocks.resolveRoleAsync.mockResolvedValue('doctor');

    expect(await resolve()).toBeNull();
  });

  it('D2: an ARCHIVED identity is rejected on every request (findByUserId yields null for one)', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, 'client', 1);
    // pgUserByPhone.findByUserId returns null for an archived row — same signal as a deleted row.
    mocks.findByUserId.mockResolvedValue(null);

    expect(await resolve()).toBeNull();
  });

  it('D2: archiving kills a cookie minted BEFORE it, even though the cookie is otherwise perfect', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, 'client', 4);
    mocks.findByUserId.mockResolvedValue(dbUser('client', 4));
    expect((await resolve())?.user.role).toBe('client'); // before archiving

    mocks.findByUserId.mockResolvedValue(null); // archived
    expect(await resolve()).toBeNull();
  });

  // ---- absolute ceiling (unchanged behaviour, re-proven so it is not regressed) -----------------

  it('staff absolute max age: accepted just inside the 7-day boundary', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS - 5), 'doctor', 2);
    mocks.findByUserId.mockResolvedValue(dbUser('doctor', 2));
    mocks.resolveRoleAsync.mockResolvedValue('doctor');

    expect((await resolve())?.user.role).toBe('doctor');
  });

  it('staff absolute max age: rejected just outside the 7-day boundary, even at a matching epoch', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS + 5), 'doctor', 2);
    mocks.findByUserId.mockResolvedValue(dbUser('doctor', 2));
    mocks.resolveRoleAsync.mockResolvedValue('doctor');

    expect(await resolve()).toBeNull();
  });

  it('patient absolute max age: accepted just inside the 90-day boundary', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS - 5), 'client', 1);
    mocks.findByUserId.mockResolvedValue(dbUser('client', 1));

    expect((await resolve())?.user.role).toBe('client');
  });

  it('patient absolute max age: rejected just outside the 90-day boundary', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - (SESSION_ABSOLUTE_MAX_AGE_SECONDS + 5), 'client', 1);
    mocks.findByUserId.mockResolvedValue(dbUser('client', 1));

    expect(await resolve()).toBeNull();
  });

  it("the absolute-age cap uses the fresh DB role, not the cookie's stale role", async () => {
    const now = Math.floor(Date.now() / 1000);
    const age = SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS + 5;
    expect(age).toBeLessThan(SESSION_ABSOLUTE_MAX_AGE_SECONDS);
    setCookie(now - age, 'client', 1);
    mocks.findByUserId.mockResolvedValue(dbUser('doctor', 1));
    mocks.resolveRoleAsync.mockResolvedValue('doctor');

    expect(await resolve()).toBeNull();
  });
});

describe('clearSession — logout revokes server-side, not just client-side (C-1, 2026-07-26)', () => {
  beforeEach(resetMocks);

  async function logout() {
    return runWithDbBootstrapPrincipal({ source: 'service.sessionRevocation.test:logout' }, () =>
      clearSession(),
    );
  }

  // Both /api/auth/logout GET and POST are thin wrappers over deps.auth.clearSession() (see
  // app/api/auth/logout/route.ts and its own route.test.ts), so proving the increment here proves it
  // for both verbs — that is the single-chokepoint shape, not a per-handler check.
  it('increments session_epoch for the signed-out user, and still clears the cookie', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, 'doctor', 3);

    await logout();

    expect(mocks.invalidateSessionsForSelf).toHaveBeenCalledTimes(1);
    expect(mocks.cookieSet).toHaveBeenCalled();
  });

  it('a cookie copied before logout is rejected afterwards (end to end through the chokepoint)', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 60, 'doctor', 3);
    const copiedCookie = mocks.cookieValue;

    await logout();
    expect(mocks.invalidateSessionsForSelf).toHaveBeenCalledTimes(1);

    // Model the increment that logout performed: the row is now at 4, the copied cookie still says 3.
    mocks.cookieValue = copiedCookie;
    mocks.findByUserId.mockResolvedValue(dbUser('doctor', 4));
    mocks.resolveRoleAsync.mockResolvedValue('doctor');

    expect(
      await runWithDbBootstrapPrincipal({ source: 'service.sessionRevocation.test:replay' }, () =>
        getCurrentSession(),
      ),
    ).toBeNull();
  });

  it('still clears the cookie when the DB increment fails (logout must never leave the user signed in locally)', async () => {
    const now = Math.floor(Date.now() / 1000);
    setCookie(now - 10, 'client', 1);
    mocks.invalidateSessionsForSelf.mockRejectedValue(new Error('db down'));

    await expect(logout()).resolves.toBeUndefined();
    expect(mocks.cookieSet).toHaveBeenCalled();
  });
});
