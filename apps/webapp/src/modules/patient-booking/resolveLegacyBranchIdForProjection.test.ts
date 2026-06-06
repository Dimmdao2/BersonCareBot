import { describe, expect, it, vi } from "vitest";
import { resolveLegacyBranchIdForProjection } from "./resolveLegacyBranchIdForProjection";

describe("resolveLegacyBranchIdForProjection", () => {
  it("returns legacy branch id from branches port", async () => {
    const branches = {
      upsertFromProjection: vi.fn().mockResolvedValue({ branchId: "legacy-br-1" }),
    };
    await expect(
      resolveLegacyBranchIdForProjection(branches, "17356", "Филиал"),
    ).resolves.toBe("legacy-br-1");
    expect(branches.upsertFromProjection).toHaveBeenCalledWith({
      integratorBranchId: 17356,
      name: "Филиал",
    });
  });

  it("returns null when branches port missing or snapshot invalid", async () => {
    await expect(resolveLegacyBranchIdForProjection(null, "173", "X")).resolves.toBeNull();
    await expect(resolveLegacyBranchIdForProjection(undefined, "", "X")).resolves.toBeNull();
    await expect(resolveLegacyBranchIdForProjection(undefined, "not-a-number", "X")).resolves.toBeNull();
  });
});
