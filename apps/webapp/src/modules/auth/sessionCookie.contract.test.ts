import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession, SessionUser } from '@/shared/types/session';
import {
  decodeSessionCookie,
  encodeSessionCookie,
  renewSessionIfActive,
  sessionAbsoluteMaxAgeSecondsForRole,
  shouldRenewSession,
  sessionTtlSecondsForRole,
} from '@/modules/auth/sessionCookie';
import { Factory, fc, fixedClock } from '@/app-layer/testing';

const clock = fixedClock(Date.UTC(2026, 6, 30, 12));
const nowSeconds = clock.nowSeconds();
const propertySettings = { seed: 10_074, numRuns: 80, endOnFailure: true } as const;
const roles = ['client', 'doctor', 'admin'] as const satisfies readonly SessionUser['role'][];

const sessionFactory = Factory.define<AppSession>(({ sequence }) => ({
  user: {
    userId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    role: 'client',
    displayName: `Contract user ${sequence}`,
    bindings: {},
    sessionEpoch: 1,
  },
  issuedAt: nowSeconds - 60,
  expiresAt: nowSeconds + 3_600,
}));

const activeSessionArbitrary = fc
  .record({
    role: fc.constantFrom(...roles),
    issuedAt: fc.integer({ min: nowSeconds - 86_400, max: nowSeconds }),
    expiresAt: fc.integer({ min: nowSeconds + 1, max: nowSeconds + 86_400 }),
  })
  .map(({ role, issuedAt, expiresAt }) =>
    sessionFactory.build({
      user: {
        userId: `pbt:${role}:${issuedAt}`,
        role,
        displayName: 'Property user',
        bindings: {},
        sessionEpoch: 1,
      },
      issuedAt,
      expiresAt,
    }),
  );

describe('session cookie contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(clock.now());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips every well-formed, active session', () => {
    fc.assert(
      fc.property(activeSessionArbitrary, (session) => {
        expect(decodeSessionCookie(encodeSessionCookie(session))).toEqual(session);
      }),
      propertySettings,
    );
  });

  it('never renews an active session at its role-specific absolute-age boundary', () => {
    fc.assert(
      fc.property(fc.constantFrom(...roles), (role) => {
        const session = sessionFactory.build({
          user: {
            userId: `pbt:absolute-age:${role}`,
            role,
            displayName: 'Absolute-age boundary',
            bindings: {},
            sessionEpoch: 1,
          },
          issuedAt: nowSeconds - sessionAbsoluteMaxAgeSecondsForRole(role),
          expiresAt: nowSeconds + sessionTtlSecondsForRole(role),
        });

        expect(shouldRenewSession(session, nowSeconds)).toBe(false);
        expect(renewSessionIfActive(session)).toEqual(session);
      }),
      propertySettings,
    );
  });

  it('uses the shorter staff windows and rejects a tampered cookie', () => {
    expect(sessionTtlSecondsForRole('doctor')).toBeLessThan(sessionTtlSecondsForRole('client'));
    expect(sessionAbsoluteMaxAgeSecondsForRole('admin')).toBeLessThan(
      sessionAbsoluteMaxAgeSecondsForRole('client'),
    );

    const signed = encodeSessionCookie(sessionFactory.build());
    expect(decodeSessionCookie(`${signed}tampered`)).toBeNull();
  });
});
