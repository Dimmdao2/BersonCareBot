import { describe, expect, it } from "vitest";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import type { ReminderRule } from "@/modules/reminders/types";
import { filterPersonalRulesForSchedulePage } from "./filterPersonalRulesForSchedulePage";

const rule = (patch: Partial<ReminderRule>): ReminderRule =>
  ({
    id: "r1",
    category: "lfk",
    enabled: true,
    linkedObjectType: null,
    linkedObjectId: null,
    ...patch,
  }) as ReminderRule;

const ctx = {
  rehabProgramForBlock: { id: "plan-1" },
  warmupsSectionAvailable: true,
  warmupsSectionSlug: DEFAULT_WARMUPS_SECTION_SLUG,
};

describe("filterPersonalRulesForSchedulePage", () => {
  it("drops lfk_complex and rehab_program when program block is shown", () => {
    const rules = [
      rule({ id: "1", linkedObjectType: "lfk_complex", linkedObjectId: "c1" }),
      rule({
        id: "2",
        linkedObjectType: "rehab_program",
        linkedObjectId: "plan-1",
        displayTitle: "ЛФК программа",
      }),
      rule({ id: "3", linkedObjectType: "custom", customTitle: "Вода" }),
    ];
    const out = filterPersonalRulesForSchedulePage(rules, ctx);
    expect(out.map((r) => r.id)).toEqual(["3"]);
  });

  it("drops warmups content_section", () => {
    const rules = [
      rule({
        id: "w",
        linkedObjectType: "content_section",
        linkedObjectId: DEFAULT_WARMUPS_SECTION_SLUG,
      }),
    ];
    expect(filterPersonalRulesForSchedulePage(rules, ctx)).toHaveLength(0);
  });
});
