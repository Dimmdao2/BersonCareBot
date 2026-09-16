import { describe, expect, it } from 'vitest';
import { resolvePatientEmailGatePolicy } from './patientRouteApiPolicy';

describe.skip(
  'E5 owner oracle: clinical data stays closed until email confirmation (deferred: Э5 in docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md)',
  () => {
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
  },
);
