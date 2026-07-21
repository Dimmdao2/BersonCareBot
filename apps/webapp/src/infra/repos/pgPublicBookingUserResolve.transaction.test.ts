import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDrizzleOrMutationTxMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/drizzleMutationTx", () => ({
  getDrizzleOrMutationTx: getDrizzleOrMutationTxMock,
}));

import { resolveOrCreateTrustedPatientUserByPhone } from "./pgPublicBookingUserResolve";

describe("public booking user resolution transaction participation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the active canonical Drizzle mutation executor for lookup and insert", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const returning = vi.fn().mockResolvedValue([{ id: "user-1" }]);
    const values = vi.fn(() => ({ returning }));
    const activeCaptureTx = {
      select: vi.fn(() => ({ from })),
      insert: vi.fn(() => ({ values })),
    };
    getDrizzleOrMutationTxMock.mockReturnValue(activeCaptureTx);

    await expect(
      resolveOrCreateTrustedPatientUserByPhone("+70000000000", "Synthetic User"),
    ).resolves.toEqual({ userId: "user-1", created: true });

    expect(getDrizzleOrMutationTxMock).toHaveBeenCalledTimes(1);
    expect(activeCaptureTx.select).toHaveBeenCalledTimes(1);
    expect(activeCaptureTx.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNormalized: "+70000000000",
        displayName: "Synthetic User",
        role: "client",
      }),
    );
  });

  it("contains no independent pool/raw writer escape hatch", () => {
    const source = readFileSync(
      new URL("./pgPublicBookingUserResolve.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("getDrizzleOrMutationTx()");
    expect(source).not.toContain("getPool(");
    expect(source).not.toContain("runPgPoolPgText");
  });
});
