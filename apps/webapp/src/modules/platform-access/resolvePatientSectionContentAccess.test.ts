import { describe, expect, it, vi } from "vitest";
import {
  canViewPatientAuthOnlySection,
  filterPatientSectionPages,
} from "./resolvePatientSectionContentAccess";

vi.mock("./resolvePatientCanViewAuthOnlyContent", () => ({
  resolvePatientCanViewAuthOnlyContent: vi.fn(async () => false),
}));

describe("resolvePatientSectionContentAccess", () => {
  it("canViewPatientAuthOnlySection allows section when grant exists for a page", async () => {
    const entitlements = {
      hasActiveContentGrant: vi.fn(async (_uid: string, slug: string) => slug === "paid-lesson"),
    };
    const ok = await canViewPatientAuthOnlySection(
      { user: { userId: "u1", role: "client" } } as never,
      true,
      [
        { slug: "free", requiresAuth: false },
        { slug: "paid-lesson", requiresAuth: true },
      ],
      entitlements as never,
    );
    expect(ok).toBe(true);
  });

  it("filterPatientSectionPages keeps only granted auth pages without tier", async () => {
    const pages = [
      { slug: "free", requiresAuth: false, title: "F" },
      { slug: "paid", requiresAuth: true, title: "P" },
    ];
    const filtered = await filterPatientSectionPages(
      { user: { userId: "u1", role: "client" } } as never,
      pages,
      {
        hasActiveContentGrant: vi.fn(async (_uid: string, slug: string) => slug === "paid"),
      } as never,
    );
    expect(filtered.map((p) => p.slug)).toEqual(["free", "paid"]);
  });
});
