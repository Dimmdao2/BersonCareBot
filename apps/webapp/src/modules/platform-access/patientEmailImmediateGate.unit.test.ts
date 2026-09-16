import { describe, expect, it } from 'vitest';
import { resolvePatientEmailGatePolicy } from './patientRouteApiPolicy';

describe('E5 owner oracle: clinical data stays closed until email confirmation', () => {
  it.each([
    '/app/patient/diary',
    '/app/patient/treatment/instance-1',
    '/app/patient/messages',
    '/app/patient/files',
  ])('blocks a new unverified patient at %s', (pathname) => {
    expect(
      resolvePatientEmailGatePolicy({
        sessionRole: 'client',
        emailVerified: false,
        emailFirstRequestedAt: null,
        now: new Date('2026-09-16T00:00:00.000Z'),
        pathname,
      }).blocksProtectedData,
    ).toBe(true);
  });
});
