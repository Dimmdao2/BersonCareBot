import { describe, expect, it } from "vitest";
import { isCheckPhoneRateLimited } from "./checkPhoneRateLimit";

describe("isCheckPhoneRateLimited", () => {
  it("allows first calls for a phone", () => {
    expect(isCheckPhoneRateLimited("+79991110001")).toBe(false);
  });
});
