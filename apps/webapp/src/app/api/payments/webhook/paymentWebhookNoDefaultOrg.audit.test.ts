import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("payments webhook tenant resolution", () => {
  it("does not use booking default organization fallback", () => {
    const src = readFileSync("src/app/api/payments/webhook/[provider]/route.ts", "utf8");

    expect(src).not.toContain("getDefaultOrganizationId");
    expect(src).toContain("resolveProviderWebhookOrganizationId");
    expect(src).toContain("runWithDbOrganizationPrincipal(organizationId");
  });
});
