import { describe, expect, it } from "vitest";
import { isMockPaymentConfirmEnabled } from "./mockPaymentGatePolicy";

describe("isMockPaymentConfirmEnabled", () => {
  it("is enabled in development", () => {
    expect(isMockPaymentConfirmEnabled({ nodeEnv: "development", isTestEnv: false })).toBe(true);
  });

  it("is enabled under the automated-test runtime regardless of NODE_ENV", () => {
    expect(isMockPaymentConfirmEnabled({ nodeEnv: "test", isTestEnv: true })).toBe(true);
    expect(isMockPaymentConfirmEnabled({ nodeEnv: "development", isTestEnv: true })).toBe(true);
  });

  it("fails closed in production", () => {
    expect(isMockPaymentConfirmEnabled({ nodeEnv: "production", isTestEnv: false })).toBe(false);
  });

  it("fails closed for the test NODE_ENV outside the automated-test runtime (isTestEnv false)", () => {
    // NODE_ENV=test alone (e.g. someone hand-setting it outside Vitest) must not be sufficient —
    // only the real automated-test runtime (isTestEnv, driven by VITEST_WORKER_ID) counts.
    expect(isMockPaymentConfirmEnabled({ nodeEnv: "test", isTestEnv: false })).toBe(false);
  });
});
