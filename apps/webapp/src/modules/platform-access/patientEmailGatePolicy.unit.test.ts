import { describe, expect, it } from 'vitest';
import {
  evaluatePatientEmailGateForCabinetEntry,
  evaluatePatientEmailGateForProtectedData,
  resolvePatientEmailGateDecision,
  resolvePatientEmailGatePolicy,
} from './patientRouteApiPolicy';

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

  it('closes the install screen after the same deadline as its protected push APIs', () => {
    const decisionFor = (pathname: string) =>
      resolvePatientEmailGateDecision({
        emailVerified: false,
        emailFirstRequestedAt: daysAgo(14),
        now: NOW,
        pathname,
      });

    expect(decisionFor('/app/patient/install')).toBe('requirement');
    expect(decisionFor('/app/patient')).toBe('requirement');
  });

  it('records the first cabinet request and asks the patient once', async () => {
    let firstRequestedAt: string | null = null;
    const marks: boolean[] = [];
    const loadState = async (markFirstRequest: boolean) => {
      marks.push(markFirstRequest);
      if (markFirstRequest && firstRequestedAt === null) firstRequestedAt = NOW.toISOString();
      return { emailVerified: false, emailFirstRequestedAt: firstRequestedAt };
    };

    const outcome = await evaluatePatientEmailGateForCabinetEntry(
      { sessionRole: 'client', now: NOW, pathname: '/app/patient/messages' },
      loadState,
    );

    expect(outcome).toMatchObject({
      decision: 'request',
      shouldMarkFirstRequest: true,
      blocksProtectedData: false,
      shouldPromptNow: true,
    });
    expect(marks).toEqual([false, true]);
    expect(firstRequestedAt).toBe(NOW.toISOString());
  });

  it('keeps protected data open during the fourteen-day request period without moving the clock', async () => {
    const marks: boolean[] = [];
    const outcome = await evaluatePatientEmailGateForProtectedData(
      { sessionRole: 'client', now: NOW, pathname: '/app/patient/messages' },
      async (markFirstRequest) => {
        marks.push(markFirstRequest);
        return { emailVerified: false, emailFirstRequestedAt: daysAgo(3) };
      },
    );

    expect(outcome.blocksProtectedData).toBe(false);
    expect(marks).toEqual([false]);
  });

  it('blocks protected data when the fourteen-day requirement has started', async () => {
    const outcome = await evaluatePatientEmailGateForProtectedData(
      { sessionRole: 'client', now: NOW, pathname: '/app/patient/messages' },
      async () => ({ emailVerified: false, emailFirstRequestedAt: daysAgo(14) }),
    );

    expect(outcome.blocksProtectedData).toBe(true);
  });

  it('never applies the patient email requirement to staff roles', () => {
    expect(
      resolvePatientEmailGatePolicy({
        sessionRole: 'doctor',
        emailVerified: false,
        emailFirstRequestedAt: daysAgo(40),
        now: NOW,
        pathname: '/app/patient/messages',
      }),
    ).toEqual({
      decision: 'none',
      shouldMarkFirstRequest: false,
      blocksProtectedData: false,
    });
  });
});
