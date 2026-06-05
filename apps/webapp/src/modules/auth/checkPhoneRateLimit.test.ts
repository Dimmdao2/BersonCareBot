import { describe, expect, it, vi, beforeEach } from "vitest";
import { createSlidingWindowRateLimit } from "@/modules/auth/createSlidingWindowRateLimit";

describe("isCheckPhoneRateLimited", () => {
  const dbMock = vi.fn();
  const isLimited = createSlidingWindowRateLimit({
    scope: "auth.check_phone",
    windowMs: 60 * 60 * 1000,
    maxPerWindow: 3,
    db: { checkAndRecord: (...args: unknown[]) => dbMock(...args) },
    pruneBucketThreshold: 10,
  });

  beforeEach(() => {
    dbMock.mockReset();
    vi.stubEnv("DATABASE_URL", "");
  });

  it("allows calls under the in-memory limit", async () => {
    await expect(isLimited("+79991110001")).resolves.toBe(false);
    await expect(isLimited("+79991110001")).resolves.toBe(false);
    await expect(isLimited("+79991110001")).resolves.toBe(false);
  });

  it("blocks when in-memory limit is exceeded for the same key", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect(await isLimited("+79991110002")).toBe(false);
    }
    expect(await isLimited("+79991110002")).toBe(true);
  });

  it("isolates limits per key", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect(await isLimited("key-a")).toBe(false);
    }
    expect(await isLimited("key-a")).toBe(true);
    expect(await isLimited("key-b")).toBe(false);
  });
});
