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

  it("filters useful_post page candidates to published article sections", () => {
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
});
