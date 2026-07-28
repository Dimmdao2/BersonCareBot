import { beforeEach, describe, expect, it, vi } from 'vitest';

// H-4 (#818): proves the refusal path for all five `mock-complete` no-bank routes. Simulating
// production here (NODE_ENV="production", isTestEnv=false) is the only way to exercise the
// disabled branch — the real config/env singleton is parsed once at import time as "test" for
// every other spec in this suite, so the gate must be forced via a module mock instead.
vi.mock('@/config/env', () => ({
  env: { NODE_ENV: 'production' },
  isTestEnv: false,
}));

const {
  buildAppDepsMock,
  requirePatientBookingTrustedPhoneAccessMock,
  requirePatientApiBusinessAccessMock,
} = vi.hoisted(() => ({
  buildAppDepsMock: vi.fn(() => {
    throw new Error('buildAppDeps must not run: the mock-payment gate should refuse first');
  }),
  requirePatientBookingTrustedPhoneAccessMock: vi.fn(() => {
    throw new Error('auth guard must not run: the mock-payment gate should refuse first');
  }),
  requirePatientApiBusinessAccessMock: vi.fn(() => {
    throw new Error('auth guard must not run: the mock-payment gate should refuse first');
  }),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock('@/app-layer/guards/requireRole', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app-layer/guards/requireRole')>();
  return {
    ...actual,
    requirePatientBookingTrustedPhoneAccess: requirePatientBookingTrustedPhoneAccessMock,
    requirePatientApiBusinessAccess: requirePatientApiBusinessAccessMock,
  };
});

import { POST as postMockComplete } from './payments/mock-complete/route';
import { POST as postMembershipsMockComplete } from './memberships/payments/mock-complete/route';
import { POST as postProductsMockComplete } from './products/payments/mock-complete/route';
import { POST as postPublicMockComplete } from './public/payments/mock-complete/route';
import { POST as postPublicProductsMockComplete } from './public/products/payments/mock-complete/route';

const INTENT_ID = '00000000-0000-4000-8000-000000000001';
const BOOKING_ID = '00000000-0000-4000-8000-000000000002';
const PURCHASE_ID = '00000000-0000-4000-8000-000000000003';

const routes = [
  {
    path: '/api/booking/payments/mock-complete',
    handler: postMockComplete,
    body: { intentId: INTENT_ID },
  },
  {
    path: '/api/booking/memberships/payments/mock-complete',
    handler: postMembershipsMockComplete,
    body: { intentId: INTENT_ID },
  },
  {
    path: '/api/booking/products/payments/mock-complete',
    handler: postProductsMockComplete,
    body: { intentId: INTENT_ID },
  },
  {
    path: '/api/booking/public/payments/mock-complete',
    handler: postPublicMockComplete,
    body: { intentId: INTENT_ID, bookingId: BOOKING_ID, contactPhone: '+79990001122' },
  },
  {
    path: '/api/booking/public/products/payments/mock-complete',
    handler: postPublicProductsMockComplete,
    body: { intentId: INTENT_ID, purchaseId: PURCHASE_ID, contactPhone: '+79990001122' },
  },
] as const;

describe('H-4 (#818): mock-complete no-bank payment routes are refused outside dev/test', () => {
  beforeEach(() => {
    buildAppDepsMock.mockClear();
    requirePatientBookingTrustedPhoneAccessMock.mockClear();
    requirePatientApiBusinessAccessMock.mockClear();
  });

  for (const { path, handler, body } of routes) {
    it(`POST ${path} returns 404 in production and touches no dependency or auth guard`, async () => {
      const res = await handler(
        new Request(`http://localhost${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      expect(res.status).toBe(404);
      const json = (await res.json()) as { ok?: boolean; error?: string };
      expect(json.ok).toBe(false);
      expect(json.error).toBe('not_found');
      expect(buildAppDepsMock).not.toHaveBeenCalled();
      expect(requirePatientBookingTrustedPhoneAccessMock).not.toHaveBeenCalled();
      expect(requirePatientApiBusinessAccessMock).not.toHaveBeenCalled();
    });
  }
});
