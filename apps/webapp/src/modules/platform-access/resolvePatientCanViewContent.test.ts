import { describe, expect, it, vi } from "vitest";
import { resolvePatientCanViewContent } from "./resolvePatientCanViewContent";

vi.mock("./resolvePatientCanViewAuthOnlyContent", () => ({
  resolvePatientCanViewAuthOnlyContent: vi.fn(async () => false),
}));

describe("resolvePatientCanViewContent", () => {
  it("returns true when entitlements grant matches slug", async () => {
    const entitlements = {
      hasActiveContentGrant: vi.fn(async (_uid: string, slug: string) => slug === "lesson-a"),
    };
    const ok = await resolvePatientCanViewContent(
      { user: { userId: "u1", role: "client", phone: "+79991234567" } } as never,
      "lesson-a",
      entitlements as never,
    );
    expect(ok).toBe(true);
  });

  it("returns false for guest without grant", async () => {
    const ok = await resolvePatientCanViewContent(null, "lesson-a", {
      hasActiveContentGrant: vi.fn(async () => false),
    } as never);
    expect(ok).toBe(false);
  });
});
