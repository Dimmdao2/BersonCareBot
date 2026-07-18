import { describe, expect, it, vi } from "vitest";
import { isStaffRubitimeOutboundEnabled } from "./staffRubitimeBridgePolicy";

describe("isStaffRubitimeOutboundEnabled", () => {
  it("keeps outbound staff mirroring disabled despite a migrated enabled setting", async () => {
    const isBridgeEnabled = vi.fn().mockResolvedValue(true);

    await expect(
      isStaffRubitimeOutboundEnabled({ rubitimeCanonicalProjection: { isBridgeEnabled } } as never),
    ).resolves.toBe(false);

    expect(isBridgeEnabled).not.toHaveBeenCalled();
  });
});
