import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@/shared/types/session';

/**
 * H-4 (#818): the five `payments/mock-complete` routes let a caller mark a payment intent as
 * captured with no provider verification at all. Every one of them gates on the shared
 * `isMockPaymentConfirmEnabled` predicate (env.NODE_ENV / isTestEnv) BEFORE touching auth, DI, or
 * the DB. These tests call the real exported `POST` handlers (not the guard/predicate in
 * isolation) so a route wired around the predicate — or a weakened predicate — turns red here.
 */

type AppDeps = ReturnType<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>;

const envState = vi.hoisted(() => ({
  nodeEnv: 'production' as 'development' | 'test' | 'production',
  isTestEnvValue: false,
}));

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>(),
  requirePatientBookingTrustedPhoneAccess:
    vi.fn<typeof import('@/app-layer/guards/requireRole').requirePatientBookingTrustedPhoneAccess>(),
  requirePatientApiBusinessAccess:
    vi.fn<typeof import('@/app-layer/guards/requireRole').requirePatientApiBusinessAccess>(),
  stampBootstrapPrincipal:
    vi.fn<typeof import('@/app-layer/principal/bootstrapPrincipal').stampBootstrapPrincipal>(),
}));

vi.mock('@/config/env', () => ({
  get env() {
    return { NODE_ENV: envState.nodeEnv };
  },
  get isTestEnv() {
    return envState.isTestEnvValue;
  },
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: fakes.buildAppDeps,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientBookingTrustedPhoneAccess: fakes.requirePatientBookingTrustedPhoneAccess,
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));

import { POST as bookingPay } from '@/app/api/booking/payments/mock-complete/route';
import { POST as membershipPay } from '@/app/api/booking/memberships/payments/mock-complete/route';
import { POST as productPay } from '@/app/api/booking/products/payments/mock-complete/route';
import { POST as publicBookingPay } from '@/app/api/booking/public/payments/mock-complete/route';
import { POST as publicProductPay } from '@/app/api/booking/public/products/payments/mock-complete/route';

const INTENT_ID = '00000000-0000-4000-8000-000000000b01';
const BOOKING_ID = '00000000-0000-4000-8000-000000000b02';
const PURCHASE_ID = '00000000-0000-4000-8000-000000000b03';

const fakeSession: AppSession = {
  user: {
    userId: '00000000-0000-4000-8000-000000000b04',
    role: 'client',
    displayName: 'B0.1 patient',
    bindings: {},
  },
  issuedAt: 1_790_000_000,
  expiresAt: 1_790_043_200,
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const routes = [
  {
    name: 'booking payment (authenticated)',
    handler: bookingPay,
    request: () =>
      jsonRequest('https://app.example.test/api/booking/payments/mock-complete', {
        intentId: INTENT_ID,
      }),
    unavailableError: 'payments_unavailable',
    authenticated: true,
  },
  {
    name: 'membership payment (authenticated)',
    handler: membershipPay,
    request: () =>
      jsonRequest('https://app.example.test/api/booking/memberships/payments/mock-complete', {
        intentId: INTENT_ID,
      }),
    unavailableError: 'memberships_unavailable',
    authenticated: true,
  },
  {
    name: 'product payment (authenticated)',
    handler: productPay,
    request: () =>
      jsonRequest('https://app.example.test/api/booking/products/payments/mock-complete', {
        intentId: INTENT_ID,
      }),
    unavailableError: 'products_unavailable',
    authenticated: true,
  },
  {
    name: 'public booking payment (unauthenticated)',
    handler: publicBookingPay,
    request: () =>
      jsonRequest('https://app.example.test/api/booking/public/payments/mock-complete', {
        intentId: INTENT_ID,
        bookingId: BOOKING_ID,
        contactPhone: '+79990000000',
      }),
    unavailableError: 'payments_unavailable',
    authenticated: false,
  },
  {
    name: 'public product payment (unauthenticated)',
    handler: publicProductPay,
    request: () =>
      jsonRequest('https://app.example.test/api/booking/public/products/payments/mock-complete', {
        intentId: INTENT_ID,
        purchaseId: PURCHASE_ID,
        contactPhone: '+79990000000',
      }),
    unavailableError: 'products_unavailable',
    authenticated: false,
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  envState.nodeEnv = 'production';
  envState.isTestEnvValue = false;
  fakes.buildAppDeps.mockReturnValue({} as AppDeps);
  fakes.requirePatientBookingTrustedPhoneAccess.mockResolvedValue({
    ok: true,
    session: fakeSession,
  });
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({ ok: true, session: fakeSession });
  fakes.stampBootstrapPrincipal.mockReturnValue(undefined);
});

describe.each(routes)('$name — mock-complete gate', ({ handler, request, unavailableError, authenticated }) => {
  it('responds 404 not_found outside development and test, without touching auth or DI', async () => {
    envState.nodeEnv = 'production';
    envState.isTestEnvValue = false;

    const response = await handler(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_found' });
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    if (authenticated) {
      expect(fakes.requirePatientBookingTrustedPhoneAccess).not.toHaveBeenCalled();
      expect(fakes.requirePatientApiBusinessAccess).not.toHaveBeenCalled();
    } else {
      expect(fakes.stampBootstrapPrincipal).not.toHaveBeenCalled();
    }
  });

  it('responds 404 not_found when NODE_ENV=test but the app is not the automated-test runtime', async () => {
    envState.nodeEnv = 'test';
    envState.isTestEnvValue = false;

    const response = await handler(request());

    expect(response.status).toBe(404);
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
  });

  it('passes the gate in development and reaches DI wiring (proves the route calls the predicate, not a hardcoded 404)', async () => {
    envState.nodeEnv = 'development';
    envState.isTestEnvValue = false;

    const response = await handler(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: unavailableError });
    expect(fakes.buildAppDeps).toHaveBeenCalledTimes(1);
  });

  it('passes the gate when isTestEnv is true even though NODE_ENV says production', async () => {
    envState.nodeEnv = 'production';
    envState.isTestEnvValue = true;

    const response = await handler(request());

    expect(response.status).toBe(503);
    expect(fakes.buildAppDeps).toHaveBeenCalledTimes(1);
  });
});
