import { describe, expect, it } from "vitest";
import { bookingMerchantIdentity, dormantSaasMerchantIdentity } from "./merchantIdentityContracts";

describe("merchant identities", () => {
  it("keeps per-org booking and dormant global SaaS identities disjoint without fallback", () => {
    const booking = bookingMerchantIdentity("org-a");
    const saas = dormantSaasMerchantIdentity();
    expect(booking.kind).not.toBe(saas.kind);
    expect(booking.settingsKey).not.toBe(saas.settingsKey);
    expect("organizationId" in saas).toBe(false);
    expect(saas.activation).toBe("dormant_until_s4_4");
  });
});
