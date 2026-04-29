import { describe, expect, it } from "vitest";
import {
  partitionUnresolvedPatientHomeItemsByVisibility,
  suggestedSlugForNewContentSection,
} from "./patientHomeUnresolvedRefs";
import type { PatientHomeBlockItem } from "./ports";

describe("patientHomeUnresolvedRefs", () => {
  it("partitionUnresolvedPatientHomeItemsByVisibility splits by isVisible", () => {
    const unresolved: PatientHomeBlockItem[] = [
      {
        id: "a",
        blockCode: "situations",
        targetType: "content_section",
        targetRef: "x",
        titleOverride: null,
        subtitleOverride: null,
        imageUrlOverride: null,
        badgeLabel: null,
        isVisible: true,
        sortOrder: 1,
      },
      {
        id: "b",
        blockCode: "situations",
        targetType: "content_section",
        targetRef: "y",
        titleOverride: null,
        subtitleOverride: null,
        imageUrlOverride: null,
        badgeLabel: null,
        isVisible: false,
        sortOrder: 2,
      },
    ];
    const { visible, hidden } = partitionUnresolvedPatientHomeItemsByVisibility(unresolved);
    expect(visible.map((i) => i.id)).toEqual(["a"]);
    expect(hidden.map((i) => i.id)).toEqual(["b"]);
  });

  it("suggestedSlugForNewContentSection accepts valid slugs", () => {
    expect(suggestedSlugForNewContentSection("  Warmups ")).toBe("warmups");
    expect(suggestedSlugForNewContentSection("office-work")).toBe("office-work");
  });

  it("suggestedSlugForNewContentSection rejects invalid", () => {
    expect(suggestedSlugForNewContentSection("")).toBeNull();
    expect(suggestedSlugForNewContentSection("Bad_Slug")).toBeNull();
    expect(suggestedSlugForNewContentSection("---")).toBeNull();
  });
});
