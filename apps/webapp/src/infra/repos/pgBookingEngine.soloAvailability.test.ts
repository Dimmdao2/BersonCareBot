import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappTransactionMock } = vi.hoisted(() => ({ runWebappTransactionMock: vi.fn() }));

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: vi.fn() }));
vi.mock("@/infra/db/runWebappSql", () => ({ runWebappTransaction: runWebappTransactionMock }));
vi.mock("@/infra/repos/pgSystemSettings", () => ({ readAdminSystemSettingString: vi.fn() }));

import { createPgBookingEnginePort } from "./pgBookingEngine";

const input = {
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  specialistId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  branchId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  isActive: false,
};

function exactRow(id: string, isActive: boolean, createdAt: string) {
  return {
    id,
    organizationId: input.organizationId,
    specialistId: input.specialistId,
    serviceId: input.serviceId,
    branchId: input.branchId,
    roomId: null,
    cityCode: null,
    priceMinorOverride: null,
    isActive,
    sortOrder: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

function transactionHarness(options: { failPreferredUpdate?: boolean } = {}) {
  const preferred = exactRow("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", true, "2026-07-19T00:00:00.000Z");
  const duplicate = exactRow("ffffffff-ffff-4fff-8fff-ffffffffffff", true, "2026-07-20T00:00:00.000Z");
  const selectResults = [
    [{ id: input.serviceId }],
    [{ id: input.branchId }],
    [{ id: input.specialistId }],
    [preferred, duplicate],
    [],
  ];
  const updateSets: unknown[] = [];
  let updateIndex = 0;
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = selectResults.shift() ?? [];
          return {
            limit: vi.fn(async () => rows),
            then: <TResult1 = unknown, TResult2 = never>(
              onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) => Promise.resolve(rows).then(onfulfilled, onrejected),
          };
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(async () => [
            { id: "location", organizationId: input.organizationId, serviceId: input.serviceId, branchId: input.branchId, isActive: input.isActive },
          ]),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => {
        updateSets.push(value);
        const current = updateIndex++;
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (options.failPreferredUpdate && current === 1) throw new Error("preferred_update_failed");
              return [{ ...preferred, isActive: input.isActive }];
            }),
            then: <TResult1 = unknown, TResult2 = never>(
              onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) => Promise.resolve(undefined).then(onfulfilled, onrejected),
          })),
        };
      }),
    })),
  };
  let committed = false;
  let rolledBack = false;
  runWebappTransactionMock.mockImplementationOnce(async (callback: (executor: typeof tx) => Promise<unknown>) => {
    try {
      const result = await callback(tx);
      committed = true;
      return result;
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  });
  return { updateSets, state: () => ({ committed, rolledBack }) };
}

describe("pgBookingEngine solo location availability transaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deactivates every exact duplicate before applying the preferred row state", async () => {
    const harness = transactionHarness();

    const result = await createPgBookingEnginePort().setSoloServiceLocationAvailability(input);

    expect(harness.updateSets).toEqual([
      expect.objectContaining({ isActive: false }),
      expect.objectContaining({ isActive: false, priceMinorOverride: null }),
    ]);
    expect(result.specialistAvailability.id).toBe("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    expect(harness.state()).toEqual({ committed: true, rolledBack: false });
  });

  it("propagates a preferred-row failure so the transaction rolls back the location and duplicate writes", async () => {
    const harness = transactionHarness({ failPreferredUpdate: true });

    await expect(createPgBookingEnginePort().setSoloServiceLocationAvailability(input)).rejects.toThrow(
      "preferred_update_failed",
    );
    expect(harness.state()).toEqual({ committed: false, rolledBack: true });
  });
});
