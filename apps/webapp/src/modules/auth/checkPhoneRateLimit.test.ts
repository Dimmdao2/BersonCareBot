import { describe, expect, it } from "vitest";
import { isCheckPhoneRateLimited } from "./checkPhoneRateLimit";

describe("isCheckPhoneRateLimited", () => {
  it("allows first calls for a phone", async () => {
    await expect(isCheckPhoneRateLimited("+79991110001")).resolves.toBe(false);
  });
});
