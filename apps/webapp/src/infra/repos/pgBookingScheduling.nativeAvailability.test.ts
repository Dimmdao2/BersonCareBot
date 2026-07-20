import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDrizzleMock } = vi.hoisted(() => ({ getDrizzleMock: vi.fn() }));

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));
vi.mock("@/modules/booking-scheduling/service", () => ({ buildSlotsForContext: vi.fn() }));

import { createPgBookingSchedulingPort } from "./pgBookingScheduling";

function dbWithSelectResults(results: ReadonlyArray<ReadonlyArray<unknown>>) {
  const queue = [...results];
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = [...(queue.shift() ?? [])];
          const query = {
            limit: vi.fn(async () => rows),
            then: <TResult1 = unknown, TResult2 = never>(
              onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) => Promise.resolve(rows).then(onfulfilled, onrejected),
          };
          return query;
        }),
      })),
    })),
  };
}

const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ssaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const legacyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const branchId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const serviceId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const specialistId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ssa = {
  id: ssaId,
  organizationId: orgId,
  specialistId,
  serviceId,
  branchId,
  roomId: null,
  cityCode: null,
  durationMinutesOverride: null,
  priceMinorOverride: null,
  isActive: true,
  sortOrder: 0,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
};
const branch = { id: branchId, organizationId: orgId, timezone: "Europe/Moscow" };
const service = { id: serviceId, organizationId: orgId, durationMinutes: 60, bufferAfterMinutes: 10 };

describe("pgBookingScheduling canonical-native availability compatibility", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a mapped legacy branch-service id as the compatibility projection", async () => {
    getDrizzleMock.mockReturnValue(
      dbWithSelectResults([[{ organizationId: orgId, canonicalId: ssaId }], [ssa], [branch], [service]]),
    );

    await expect(createPgBookingSchedulingPort().resolveCanonicalFromBranchService(legacyId)).resolves.toEqual(
      expect.objectContaining({
        organizationId: orgId,
        branchServiceId: legacyId,
        legacyBranchServiceId: legacyId,
        branchId,
        serviceId,
      }),
    );
  });

  it("accepts an active canonical SSA id without inventing a Rubitime mapping", async () => {
    getDrizzleMock.mockReturnValue(
      dbWithSelectResults([[], [{ organizationId: orgId, id: ssaId }], [ssa], [branch], [service]]),
    );

    await expect(createPgBookingSchedulingPort().resolveCanonicalFromBranchService(ssaId)).resolves.toEqual(
      expect.objectContaining({
        organizationId: orgId,
        branchServiceId: ssaId,
        legacyBranchServiceId: null,
        branchId,
        serviceId,
      }),
    );
  });

  it("returns the canonical SSA key when the preferred availability has no legacy mapping", async () => {
    getDrizzleMock.mockReturnValue(
      dbWithSelectResults([[{ id: ssaId, createdAt: ssa.createdAt }], []]),
    );

    await expect(
      createPgBookingSchedulingPort().resolveLegacyBranchServiceId({ organizationId: orgId, branchId, serviceId }),
    ).resolves.toBe(ssaId);
  });
});
