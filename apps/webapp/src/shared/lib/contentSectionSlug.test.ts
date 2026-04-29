import { describe, expect, it } from "vitest";
import { validateContentSectionSlug } from "./contentSectionSlug";

describe("validateContentSectionSlug", () => {
  it("accepts valid slug", () => {
    expect(validateContentSectionSlug("warmups")).toEqual({ ok: true, slug: "warmups" });
    expect(validateContentSectionSlug("  a-b-1  ")).toEqual({ ok: true, slug: "a-b-1" });
  });

  it("rejects empty and invalid", () => {
    expect(validateContentSectionSlug("").ok).toBe(false);
    expect(validateContentSectionSlug("Bad").ok).toBe(false);
    expect(validateContentSectionSlug("---").ok).toBe(false);
  });
});
