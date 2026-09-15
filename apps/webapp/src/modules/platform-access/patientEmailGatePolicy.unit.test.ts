import { describe, expect, it } from 'vitest';
import { resolvePatientEmailGateDecision } from './patientRouteApiPolicy';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

describe('patient email gate policy', () => {
  it.each([
    {
      name: 'confirmed email',
      emailVerified: true,
      emailFirstRequestedAt: null,
      pathname: '/app/patient/messages',
      expected: 'none',
    },
    {
      name: 'first request',
      emailVerified: false,
      emailFirstRequestedAt: null,
      pathname: '/app/patient/messages',
      expected: 'request',
    },
    {
      name: 'day 3',
      emailVerified: false,
      emailFirstRequestedAt: daysAgo(3),
      pathname: '/app/patient/messages',
      expected: 'request',
    },
    {
      name: 'day 14',
      emailVerified: false,
      emailFirstRequestedAt: daysAgo(14),
      pathname: '/app/patient/messages',
      expected: 'requirement',
    },
    {
      name: 'day 40',
      emailVerified: false,
      emailFirstRequestedAt: daysAgo(40),
      pathname: '/app/patient/messages',
      expected: 'requirement',
    },
  ] as const)(
    '$name -> $expected',
    ({ emailVerified, emailFirstRequestedAt, pathname, expected }) => {
      expect(
        resolvePatientEmailGateDecision({
          emailVerified,
          emailFirstRequestedAt,
          now: NOW,
          pathname,
        }),
      ).toBe(expected);
    },
  );

  it.each([
    '/app/patient/bind-email',
    '/api/auth/logout',
    '/app/patient/profile',
    '/app/patient/support',
    '/app/patient/help/article',
    '/app/patient/install',
    '/legal/terms',
    '/legal/privacy',
  ])('never blocks the escape path %s', (pathname) => {
    expect(
      resolvePatientEmailGateDecision({
        emailVerified: false,
        emailFirstRequestedAt: daysAgo(40),
        now: NOW,
        pathname,
      }),
    ).toBe('none');
  });
});
