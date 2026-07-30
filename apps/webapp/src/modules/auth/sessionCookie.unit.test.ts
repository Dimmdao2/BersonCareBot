import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession, SessionUser } from '@/shared/types/session';
import {
  applySessionRenewalToResponse,
  decodeSessionCookie,
  encodeSessionCookie,
  renewSessionIfActive,
  SESSION_COOKIE_NAME,
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
    displayName: `Unit test user ${sequence}`,
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

describe('session cookie unit behavior', () => {
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

  it('rejects representative malformed, incomplete, expired, and visual-exemption payloads', () => {
    const valid = sessionFactory.build();
    const { issuedAt: _issuedAt, ...incomplete } = valid;

    const invalidCookies = [
      'not-a-cookie',
      encodeSessionCookie(incomplete as AppSession),
      encodeSessionCookie({ ...valid, expiresAt: nowSeconds }),
      encodeSessionCookie({
        ...valid,
        operatorSession: {
          purpose: 'not_the_visual_exemption',
          expiresAt: valid.expiresAt,
        },
      } as unknown as AppSession),
    ];

    for (const raw of invalidCookies) {
      expect(decodeSessionCookie(raw)).toBeNull();
    }
    expect(
      decodeSessionCookie(encodeSessionCookie({ ...valid, expiresAt: nowSeconds + 1 })),
    ).toEqual({ ...valid, expiresAt: nowSeconds + 1 });
  });

  it.each(roles)('uses both renewal boundaries for %s sessions', (role) => {
    const ttl = sessionTtlSecondsForRole(role);
    const maxAge = sessionAbsoluteMaxAgeSecondsForRole(role);
    const nearRenewalThreshold = sessionFactory.build({
      user: { ...sessionFactory.build().user, role },
      issuedAt: nowSeconds - 1,
      expiresAt: nowSeconds + ttl / 2,
    });
    const justInsideAbsoluteAge = sessionFactory.build({
      user: { ...sessionFactory.build().user, role },
      issuedAt: nowSeconds - maxAge + 1,
      expiresAt: nowSeconds + ttl,
    });

    expect(shouldRenewSession(nearRenewalThreshold, nowSeconds)).toBe(false);
    expect(
      shouldRenewSession(
        { ...nearRenewalThreshold, expiresAt: nearRenewalThreshold.expiresAt - 1 },
        nowSeconds,
      ),
    ).toBe(true);
    expect(shouldRenewSession(justInsideAbsoluteAge, nowSeconds)).toBe(true);
    expect(
      shouldRenewSession({ ...justInsideAbsoluteAge, issuedAt: nowSeconds - maxAge }, nowSeconds),
    ).toBe(false);
  });

  it('renews only an eligible cookie on the public response boundary', () => {
    const renewable = sessionFactory.build({
      issuedAt: nowSeconds - 1,
      expiresAt: nowSeconds + sessionTtlSecondsForRole('client') / 2 - 1,
    });
    const renewableRequest = new NextRequest('https://app.example.test', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeSessionCookie(renewable)}` },
    });
    const renewedResponse = applySessionRenewalToResponse(renewableRequest, NextResponse.next());
    const renewedRaw = renewedResponse.cookies.get(SESSION_COOKIE_NAME)?.value;

    expect(renewedRaw).toBeDefined();
    expect(decodeSessionCookie(renewedRaw ?? '')?.expiresAt).toBe(
      nowSeconds + sessionTtlSecondsForRole('client'),
    );

    const atAbsoluteAge = {
      ...renewable,
      issuedAt: nowSeconds - sessionAbsoluteMaxAgeSecondsForRole('client'),
    };
    const expiredRequest = new NextRequest('https://app.example.test', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeSessionCookie(atAbsoluteAge)}` },
    });
    const unchangedResponse = applySessionRenewalToResponse(expiredRequest, NextResponse.next());

    expect(unchangedResponse.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});
