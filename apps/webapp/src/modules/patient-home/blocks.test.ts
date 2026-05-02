import { describe, expect, it } from "vitest";
import {
  isPatientHomeContentPageCandidateForBlock,
  isPatientHomeContentSectionCandidateForBlock,
} from "./blocks";

const sectionMap = new Map([
  ["warmups", { kind: "system" as const, systemParentCode: "warmups" as const }],
  ["sit-x", { kind: "system" as const, systemParentCode: "situations" as const }],
  ["sos-x", { kind: "system" as const, systemParentCode: "sos" as const }],
  ["articles", { kind: "article" as const, systemParentCode: null }],
]);

describe("patient-home CMS taxonomy helpers", () => {
  it("filters situations section candidates", () => {
    expect(
      isPatientHomeContentSectionCandidateForBlock("situations", { kind: "system", systemParentCode: "situations" }),
    ).toBe(true);
    expect(
      isPatientHomeContentSectionCandidateForBlock("situations", { kind: "system", systemParentCode: "sos" }),
    ).toBe(false);
    expect(isPatientHomeContentSectionCandidateForBlock("situations", { kind: "article", systemParentCode: null })).toBe(
      false,
    );
  });

  it("filters useful_post page candidates: article catalog, system folders except warmups/sos", () => {
    const pageOk = {
      slug: "a",
      section: "articles",
      isPublished: true,
      archivedAt: null,
      deletedAt: null,
    };
    expect(isPatientHomeContentPageCandidateForBlock("useful_post", pageOk, sectionMap)).toBe(true);

    expect(
      isPatientHomeContentPageCandidateForBlock(
        "useful_post",
        { ...pageOk, isPublished: false, section: "articles" },
        sectionMap,
      ),
    ).toBe(false);

    expect(
      isPatientHomeContentPageCandidateForBlock("useful_post", { ...pageOk, section: "warmups" }, sectionMap),
    ).toBe(false);

    expect(
      isPatientHomeContentPageCandidateForBlock("useful_post", { ...pageOk, section: "sos-x" }, sectionMap),
    ).toBe(false);

    expect(
      isPatientHomeContentPageCandidateForBlock("useful_post", { ...pageOk, section: "sit-x" }, sectionMap),
    ).toBe(true);
  });

  it("filters daily_warmup pages to warmups cluster", () => {
    const pageOk = {
      slug: "w",
      section: "warmups",
      isPublished: true,
      archivedAt: null,
      deletedAt: null,
    };
    expect(isPatientHomeContentPageCandidateForBlock("daily_warmup", pageOk, sectionMap)).toBe(true);
    expect(
      isPatientHomeContentPageCandidateForBlock("daily_warmup", { ...pageOk, section: "articles" }, sectionMap),
    ).toBe(false);
  });

  it("filters subscription_carousel section and page candidates to article taxonomy", () => {
    expect(
      isPatientHomeContentSectionCandidateForBlock("subscription_carousel", {
        kind: "article",
        systemParentCode: null,
      }),
    ).toBe(true);
    expect(
      isPatientHomeContentSectionCandidateForBlock("subscription_carousel", {
        kind: "system",
        systemParentCode: "situations",
      }),
    ).toBe(false);

    const pageOk = {
      slug: "p",
      section: "articles",
      isPublished: true,
      archivedAt: null,
      deletedAt: null,
    };
    const articleOnlyMap = new Map([["articles", { kind: "article" as const, systemParentCode: null }]]);
    expect(isPatientHomeContentPageCandidateForBlock("subscription_carousel", pageOk, articleOnlyMap)).toBe(true);
    expect(
      isPatientHomeContentPageCandidateForBlock(
        "subscription_carousel",
        { ...pageOk, section: "warmups" },
        sectionMap,
      ),
    ).toBe(false);
  });
});
