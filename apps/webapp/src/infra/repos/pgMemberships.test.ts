import { readFileSync } from "node:fs";
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

function makePackageSelectRows(rows: unknown[]) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from, where, limit };
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

  it("resolves appointment statuses from canonical appointments, not appointment_records", () => {
    const src = readFileSync(new URL("./pgMemberships.ts", import.meta.url), "utf8");

    expect(src).toContain("LEFT JOIN be_appointments bea");
    expect(src).not.toContain("FROM appointment_records");
    expect(src).not.toContain("JOIN appointment_records");
  });

  it("upserts catalog packages in a transaction and reads the result on the transaction executor", async () => {
    const packageId = "pkg-1";
    const orgId = "org-1";
    const packageRows = makePackageSelectRows([
      {
        id: packageId,
        organizationId: orgId,
        title: "Package",
        description: null,
        priceMinor: 15000,
        currency: "RUB",
        validityDays: 30,
        deductionMode: "manual",
        isActive: true,
      },
    ]);
    const itemOrderBy = vi.fn(async () => [
      {
        id: "item-1",
        packageId,
        serviceId: "service-1",
        quantity: 3,
        sortOrder: 0,
      },
    ]);
    const itemWhere = vi.fn(() => ({ orderBy: itemOrderBy }));
    const itemFrom = vi.fn(() => ({ where: itemWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: packageRows.from })
      .mockReturnValueOnce({ from: itemFrom });
    const packageReturning = vi.fn(async () => [{ id: packageId }]);
    const packageValues = vi.fn(() => ({ returning: packageReturning }));
    const itemValues = vi.fn(async () => undefined);
    const insert = vi
      .fn()
      .mockReturnValueOnce({ values: packageValues })
      .mockReturnValueOnce({ values: itemValues });
    const tx = { insert, select };
    const db = {
      insert: vi.fn(() => {
        throw new Error("db insert should not run outside transaction");
      }),
      select: vi.fn(() => {
        throw new Error("db select should not run outside transaction");
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgMembershipsPort();
    const result = await port.upsertCatalogPackage({
      organizationId: orgId,
      title: "Package",
      description: null,
      priceMinor: 15000,
      currency: "RUB",
      validityDays: 30,
      deductionMode: "manual",
      isActive: true,
      items: [{ serviceId: "service-1", quantity: 3 }],
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: packageId,
        organizationId: orgId,
        title: "Package",
        items: [expect.objectContaining({ serviceId: "service-1", quantity: 3 })],
      }),
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("updates catalog packages in a transaction and reads the updated result on the transaction executor", async () => {
    const packageId = "pkg-2";
    const orgId = "org-1";
    const packageRows = makePackageSelectRows([
      {
        id: packageId,
        organizationId: orgId,
        title: "Updated package",
        description: "Updated",
        priceMinor: 25000,
        currency: "RUB",
        validityDays: 45,
        deductionMode: "auto_on_visit_confirmed",
        isActive: false,
      },
    ]);
    const itemOrderBy = vi.fn(async () => [
      {
        id: "item-2",
        packageId,
        serviceId: "service-2",
        quantity: 5,
        sortOrder: 0,
      },
    ]);
    const itemWhere = vi.fn(() => ({ orderBy: itemOrderBy }));
    const itemFrom = vi.fn(() => ({ where: itemWhere }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: packageRows.from })
      .mockReturnValueOnce({ from: itemFrom });
    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const update = vi.fn(() => ({ set: updateSet }));
    const deleteWhere = vi.fn(async () => undefined);
    const deleteFrom = vi.fn(() => ({ where: deleteWhere }));
    const itemValues = vi.fn(async () => undefined);
    const insert = vi.fn(() => ({ values: itemValues }));
    const tx = { update, delete: deleteFrom, insert, select };
    const db = {
      update: vi.fn(() => {
        throw new Error("db update should not run outside transaction");
      }),
      delete: vi.fn(() => {
        throw new Error("db delete should not run outside transaction");
      }),
      insert: vi.fn(() => {
        throw new Error("db insert should not run outside transaction");
      }),
      select: vi.fn(() => {
        throw new Error("db select should not run outside transaction");
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgMembershipsPort();
    const result = await port.upsertCatalogPackage({
      id: packageId,
      organizationId: orgId,
      title: "Updated package",
      description: "Updated",
      priceMinor: 25000,
      currency: "RUB",
      validityDays: 45,
      deductionMode: "auto_on_visit_confirmed",
      isActive: false,
      items: [{ serviceId: "service-2", quantity: 5 }],
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: packageId,
        organizationId: orgId,
        title: "Updated package",
        items: [expect.objectContaining({ serviceId: "service-2", quantity: 5 })],
      }),
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(deleteFrom).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(2);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});
