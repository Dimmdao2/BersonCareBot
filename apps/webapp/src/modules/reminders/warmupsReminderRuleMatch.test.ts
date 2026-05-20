import { describe, expect, it } from "vitest";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { isWarmupsContentSectionReminderRule } from "./warmupsReminderRuleMatch";

describe("isWarmupsContentSectionReminderRule", () => {
  it("matches canonical slug from CMS", () => {
    expect(
      isWarmupsContentSectionReminderRule(
        { linkedObjectType: "content_section", linkedObjectId: "razminki" },
        "razminki",
      ),
    ).toBe(true);
  });

  it("matches legacy DEFAULT_WARMUPS_SECTION_SLUG", () => {
    expect(
      isWarmupsContentSectionReminderRule(
        { linkedObjectType: "content_section", linkedObjectId: DEFAULT_WARMUPS_SECTION_SLUG },
        "razminki",
      ),
    ).toBe(true);
  });

  it("rejects other sections", () => {
    expect(
      isWarmupsContentSectionReminderRule(
        { linkedObjectType: "content_section", linkedObjectId: "lessons" },
        "razminki",
      ),
    ).toBe(false);
  });
});
