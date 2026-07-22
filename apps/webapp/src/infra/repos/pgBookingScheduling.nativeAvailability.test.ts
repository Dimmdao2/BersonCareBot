import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDrizzleMock } = vi.hoisted(() => ({ getDrizzleMock: vi.fn() }));

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));
vi.mock("@/modules/booking-scheduling/service", () => ({ buildSlotsForContext: vi.fn() }));

import { createPgBookingSchedulingPort } from "./pgBookingScheduling";

function dbWithSelectResults(results: ReadonlyArray<ReadonlyArray<unknown>>) {
  const queue = [...results];
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const chain = {
          innerJoin: vi.fn(() => chain),
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
        };
        return chain;
      }),
    })),
  };
}

const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ssaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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

describe("pgBookingScheduling canonical availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a canonical branchId+serviceId pair without a legacy catalog key", async () => {
    getDrizzleMock.mockReturnValue(
      dbWithSelectResults([
        [{ organizationId: orgId, id: ssaId, createdAt: ssa.createdAt }],
        [ssa],
        [{ id: specialistId }],
        [branch],
        [service],
      ]),
    );

    await expect(
      createPgBookingSchedulingPort().resolveCanonicalInPersonContext({ organizationId: orgId, branchId, serviceId }),
    ).resolves.toEqual(
      expect.objectContaining({
        organizationId: orgId,
        branchId,
        serviceId,
      }),
    );
  });

  it("rejects an ambiguous canonical pair before selecting an availability", async () => {
    getDrizzleMock.mockReturnValue(
      dbWithSelectResults([
        [
          { organizationId: orgId, id: ssaId, createdAt: ssa.createdAt },
          { organizationId: "11111111-1111-4111-8111-111111111111", id: "22222222-2222-4222-8222-222222222222", createdAt: ssa.createdAt },
        ],
      ]),
    );

    await expect(
      createPgBookingSchedulingPort().resolveCanonicalInPersonContext({ branchId, serviceId }),
    ).rejects.toThrow("ambiguous_booking_tenant");
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
