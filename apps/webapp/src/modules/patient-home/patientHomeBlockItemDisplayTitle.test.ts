/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import type { PatientHomeBlockItem } from "./ports";
import {
  buildPatientHomeRefDisplayTitles,
  emptyPatientHomeRefDisplayTitles,
  patientHomeBlockItemDisplayTitle,
  patientHomeBlockItemTargetTypeLabelRu,
} from "./patientHomeBlockItemDisplayTitle";

function item(p: Partial<PatientHomeBlockItem> & Pick<PatientHomeBlockItem, "targetType" | "targetRef">): PatientHomeBlockItem {
  return {
    id: "test-id",
    blockCode: "situations",
    titleOverride: null,
    subtitleOverride: null,
    imageUrlOverride: null,
    badgeLabel: null,
    isVisible: true,
    sortOrder: 0,
    ...p,
  };
}

describe("patientHomeBlockItemDisplayTitle", () => {
  it("prefers titleOverride", () => {
    const titles = buildPatientHomeRefDisplayTitles({
      pages: [{ slug: "a", title: "Page A" }],
      sections: [],
      courses: [],
    });
    expect(patientHomeBlockItemDisplayTitle(item({ targetType: "content_page", targetRef: "a", titleOverride: "  X  " }), titles)).toBe("X");
  });

  it("resolves content_page slug to page title", () => {
    const titles = buildPatientHomeRefDisplayTitles({
      pages: [{ slug: "warm", title: "Разминка утром" }],
      sections: [],
      courses: [],
    });
    expect(patientHomeBlockItemDisplayTitle(item({ targetType: "content_page", targetRef: "warm", titleOverride: null }), titles)).toBe(
      "Разминка утром",
    );
  });

  it("resolves content_section slug to section title", () => {
    const titles = buildPatientHomeRefDisplayTitles({
      pages: [],
      sections: [{ slug: "pain", title: "Боль в спине" }],
      courses: [],
    });
    expect(patientHomeBlockItemDisplayTitle(item({ targetType: "content_section", targetRef: "pain", titleOverride: null }), titles)).toBe(
      "Боль в спине",
    );
  });

  it("resolves course id to title", () => {
    const titles = buildPatientHomeRefDisplayTitles({
      pages: [],
      sections: [],
      courses: [{ id: "c1", title: "Курс ЛФК" }],
    });
    expect(patientHomeBlockItemDisplayTitle(item({ targetType: "course", targetRef: "c1", titleOverride: null }), titles)).toBe("Курс ЛФК");
  });

  it("falls back to ref when missing in maps", () => {
    expect(patientHomeBlockItemDisplayTitle(item({ targetType: "content_page", targetRef: "ghost", titleOverride: null }), emptyPatientHomeRefDisplayTitles)).toBe(
      "ghost",
    );
  });

  it("labels known target types in Russian", () => {
    expect(patientHomeBlockItemTargetTypeLabelRu("content_page")).toBe("Материал");
    expect(patientHomeBlockItemTargetTypeLabelRu("content_section")).toBe("Раздел");
    expect(patientHomeBlockItemTargetTypeLabelRu("unknown")).toBe("unknown");
  });
});
