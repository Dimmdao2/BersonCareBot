import { describe, expect, it, vi } from "vitest";
import type { ContentSectionRow } from "./pgContentSections";
import { resolvePatientContentSectionSlug } from "./resolvePatientContentSectionSlug";

function row(slug: string, visible = true): ContentSectionRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug,
    title: "T",
    description: "",
    sortOrder: 0,
    isVisible: visible,
    requiresAuth: false,
    coverImageUrl: null,
    iconImageUrl: null,
    kind: "article",
    systemParentCode: null,
  };
}

describe("resolvePatientContentSectionSlug", () => {
  it("returns section when slug matches directly", async () => {
    const deps = {
      getBySlug: vi.fn(async (s: string) => (s === "x" ? row("x") : null)),
      getRedirectNewSlugForOldSlug: vi.fn(async () => null),
    };
    const r = await resolvePatientContentSectionSlug(deps, "x");
    expect(r?.canonicalSlug).toBe("x");
    expect(r?.section.slug).toBe("x");
    expect(deps.getRedirectNewSlugForOldSlug).not.toHaveBeenCalled();
  });

  it("follows one redirect hop", async () => {
    const deps = {
      getBySlug: vi.fn(async (s: string) => (s === "new" ? row("new") : null)),
      getRedirectNewSlugForOldSlug: vi.fn(async (old: string) => (old === "old" ? "new" : null)),
    };
    const r = await resolvePatientContentSectionSlug(deps, "old");
    expect(r?.canonicalSlug).toBe("new");
    expect(deps.getRedirectNewSlugForOldSlug).toHaveBeenCalledWith("old");
  });

  it("chains multiple hops", async () => {
    const deps = {
      getBySlug: vi.fn(async (s: string) => (s === "c" ? row("c") : null)),
      getRedirectNewSlugForOldSlug: vi.fn(async (old: string) => {
        if (old === "a") return "b";
        if (old === "b") return "c";
        return null;
      }),
    };
    const r = await resolvePatientContentSectionSlug(deps, "a");
    expect(r?.canonicalSlug).toBe("c");
  });

  it("returns null when hidden", async () => {
    const deps = {
      getBySlug: vi.fn(async () => row("x", false)),
      getRedirectNewSlugForOldSlug: vi.fn(async () => null),
    };
    expect(await resolvePatientContentSectionSlug(deps, "x")).toBeNull();
  });

  it("returns null when unknown and no history", async () => {
    const deps = {
      getBySlug: vi.fn(async () => null),
      getRedirectNewSlugForOldSlug: vi.fn(async () => null),
    };
    expect(await resolvePatientContentSectionSlug(deps, "nope")).toBeNull();
  });
});
