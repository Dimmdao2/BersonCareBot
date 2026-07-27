import { describe, expect, it } from "vitest";
import { bookingMerchantIdentity, saasMerchantIdentity } from "./merchantIdentityContracts";

describe("merchant identities", () => {
  it("keeps per-org booking and active global SaaS identities disjoint without fallback", () => {
    const booking = bookingMerchantIdentity("org-a");
    const saas = saasMerchantIdentity();
    expect(booking.kind).not.toBe(saas.kind);
    expect(booking.settingsKey).not.toBe(saas.settingsKey);
    expect("organizationId" in saas).toBe(false);
    expect(saas.activation).toBe("active");
  });
});
