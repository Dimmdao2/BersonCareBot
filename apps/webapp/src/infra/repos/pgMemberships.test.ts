import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPgMembershipsPort } from "./pgMemberships";

const { getDrizzleMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

function makeSelectChain(rows: unknown[]) {
  const orderBy = vi.fn(async () => rows);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, orderBy };
}

describe("createPgMembershipsPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps runWithPackageLock work on the advisory-locked transaction executor", async () => {
    const txSelect = makeSelectChain([
      {
        id: "usage-1",
        patientPackageId: "pkg-1",
        patientPackageItemId: "item-1",
        appointmentId: "appt-1",
        usageKind: "consume",
        quantity: 1,
        comment: null,
        occurredAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const dbSelect = makeSelectChain([]);
    const tx = {
      execute: vi.fn(async () => ({ rows: [] })),
      select: txSelect.select,
    };
    const db = {
      execute: vi.fn(async () => ({ rows: [] })),
      select: dbSelect.select,
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgMembershipsPort();
    const usages = await port.runWithPackageLock("pkg-1", "org-1", () =>
      port.listUsagesForPackage("pkg-1", "org-1"),
    );

    expect(usages).toEqual([
      expect.objectContaining({
        id: "usage-1",
        patientPackageId: "pkg-1",
        usageKind: "consume",
      }),
    ]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(db.execute).not.toHaveBeenCalled();
    expect(txSelect.select).toHaveBeenCalledTimes(1);
    expect(dbSelect.select).not.toHaveBeenCalled();
  });
});
