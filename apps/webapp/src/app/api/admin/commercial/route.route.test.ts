import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  getCurrentDbPrincipal: vi.fn(),
  getDrizzle: vi.fn(),
  requirePlatformOperationsApiContext: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: fakes.buildAppDeps,
}));
vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: fakes.getDrizzle,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.requirePlatformOperationsApiContext,
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: fakes.getCurrentDbPrincipal,
}));

import { createPgPlatformEntitlementsPort } from '@/infra/repos/pgPlatformEntitlements';
import { createPlatformEntitlementsService } from '@/modules/org-entitlements/service';
import { PLATFORM_OPERATIONS_DB_SOURCE } from '@/shared/security/platformOperationsPrincipal';
import { saasTariffs } from '../../../../../db/schema/saasEntitlements';
import { GET, POST } from './route';

const tariffId = '95200000-0000-4000-8000-000000000010';
const paymentPolicy = {
  graceDays: 2,
  readOnlyDays: 3,
  notifications: [
    { offsetDays: -3, condition: 'payment_failed', template: 'Оплатите {{тариф}}' },
    { offsetDays: 1, condition: 'payment_succeeded', template: 'Спасибо, {{клиника}}' },
  ],
  terminalState: 'disabled',
} as const;
const brandingPolicy = {
  graceDays: 5,
  readOnlyDays: 6,
  notifications: [],
  terminalState: 'read_only',
} as const;

let storedTariff: Record<string, unknown> | null;

beforeEach(() => {
  vi.clearAllMocks();
  storedTariff = null;
  fakes.requirePlatformOperationsApiContext.mockResolvedValue({
    ok: true,
    session: { user: { userId: '95200000-0000-4000-8000-000000000011' } },
  });
  fakes.getCurrentDbPrincipal.mockReturnValue({
    kind: 'platform',
    source: PLATFORM_OPERATIONS_DB_SOURCE,
  });

  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table !== saasTariffs) throw new Error('unexpected_select_table');
        return {
          orderBy: async () => (storedTariff ? [storedTariff] : []),
        };
      },
    }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(tx),
  };
  const tx = {
    insert: (table: unknown) => {
      if (table !== saasTariffs) {
        return { values: async () => undefined };
      }
      return {
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            storedTariff = {
              id: tariffId,
              mechanicAccessPolicies: {},
              downgradePolicies: {},
              createdAt: '2026-07-30T00:00:00.000Z',
              ...values,
            };
            return [storedTariff];
          },
        }),
      };
    },
  };
  fakes.getDrizzle.mockReturnValue(db);

  const pgPort = createPgPlatformEntitlementsPort();
  const service = createPlatformEntitlementsService({
    ...pgPort,
    listOrganizations: async () => [],
    getTrialPolicy: async () => null,
    getRegistrationTariffPolicy: async () => ({ tariffId: null }),
  });
  fakes.buildAppDeps.mockReturnValue({ platformEntitlements: service });
});

describe('/api/admin/commercial tariff persistence', () => {
  it('writes mechanic policies through route/service/PG mapping and reads them back', async () => {
    const createResponse = await POST(
      new Request('http://127.0.0.1/api/admin/commercial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create_tariff',
          reason: 'round-trip proof',
          tariff: {
            name: 'Lifecycle policy',
            description: '',
            priceMinor: 1000,
            currency: 'rub',
            billingPeriod: 'month',
            mechanics: { payments: true, branding: true },
            quotas: {},
            systemAccessPolicy: null,
            mechanicAccessPolicies: {
              payments: paymentPolicy,
              branding: brandingPolicy,
            },
            downgradePolicies: {},
            includedSeats: 1,
            additionalSeatPriceMinor: null,
            isActive: true,
          },
        }),
      }),
    );

    expect(createResponse.status).toBe(200);

    const readResponse = await GET();
    expect(readResponse.status).toBe(200);
    const readBody = (await readResponse.json()) as {
      tariffs: Array<{ mechanicAccessPolicies: Record<string, unknown> }>;
    };
    expect(readBody.tariffs[0]?.mechanicAccessPolicies).toEqual({
      payments: paymentPolicy,
      branding: brandingPolicy,
    });
  });
});
