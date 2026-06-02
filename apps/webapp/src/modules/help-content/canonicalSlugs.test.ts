import { describe, expect, it } from "vitest";
import { routePaths } from "@/app-layer/routes/paths";
import {
  HELP_CANONICAL_ARTICLE_IA,
  HELP_CANONICAL_ARTICLE_SLUG_PREPARATION,
  HELP_CANONICAL_ARTICLE_SLUGS,
  HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES,
  HELP_CANONICAL_ARTICLE_SLUG_SERVICES_PRICING,
  isHelpCanonicalArticleSlug,
  resolvePublishedServicesPricingSlug,
} from "./canonicalSlugs";

describe("canonicalSlugs", () => {
  it("lists all IA slugs with metadata", () => {
    expect(HELP_CANONICAL_ARTICLE_SLUGS).toEqual([
      "preparation",
      "after-visit",
      "services-pricing",
      "app-guide",
      "address-spb",
      "address-msk",
      "about",
    ]);
    for (const slug of HELP_CANONICAL_ARTICLE_SLUGS) {
      expect(HELP_CANONICAL_ARTICLE_IA[slug].title.length).toBeGreaterThan(0);
      expect(HELP_CANONICAL_ARTICLE_IA[slug].purpose.length).toBeGreaterThan(0);
    }
  });

  it("recognizes canonical slugs and rejects legacy cost as canonical", () => {
    expect(isHelpCanonicalArticleSlug("preparation")).toBe(true);
    expect(isHelpCanonicalArticleSlug("services-pricing")).toBe(true);
    expect(isHelpCanonicalArticleSlug("cost")).toBe(false);
  });

  it("prefers services-pricing over legacy cost for tiles", () => {
    expect(
      resolvePublishedServicesPricingSlug(new Set(["cost", "services-pricing"])),
    ).toBe(HELP_CANONICAL_ARTICLE_SLUG_SERVICES_PRICING);
    expect(resolvePublishedServicesPricingSlug(new Set(["cost"]))).toBe("cost");
    expect(resolvePublishedServicesPricingSlug(new Set())).toBeNull();
  });

  it("exposes preparation as the only cabinet tile deep-link slug in phase 1", () => {
    expect(HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES).toEqual([HELP_CANONICAL_ARTICLE_SLUG_PREPARATION]);
  });

  it("maps every canonical slug to a patient help article path", () => {
    for (const slug of HELP_CANONICAL_ARTICLE_SLUGS) {
      expect(routePaths.patientHelpArticle(slug)).toBe(`/app/patient/help/${slug}`);
    }
  });
});
