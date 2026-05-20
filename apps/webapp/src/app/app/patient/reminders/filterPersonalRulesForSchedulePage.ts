import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import type { ReminderRule } from "@/modules/reminders/types";

type Ctx = {
  rehabProgramForBlock: { id: string } | null;
  warmupsSectionAvailable: boolean;
  warmupsSectionSlug: string;
};

/** Правила, которые настраиваются в блоках «Программа реабилитации» / «Разминки», не дублируем в «Мои напоминания». */
export function filterPersonalRulesForSchedulePage(rules: ReminderRule[], ctx: Ctx): ReminderRule[] {
  return rules.filter((r) => {
    if (r.linkedObjectType == null) return false;

    const lot = r.linkedObjectType;
    if (lot === "lfk_complex") return false;

    if (lot === "custom") return false;

    if (ctx.rehabProgramForBlock) {
      if (lot === "rehab_program" || lot === "treatment_program_item") return false;
    }

    if (ctx.warmupsSectionAvailable && lot === "content_section") {
      const id = (r.linkedObjectId ?? "").trim();
      if (id === ctx.warmupsSectionSlug || id === DEFAULT_WARMUPS_SECTION_SLUG) return false;
    }

    return true;
  });
}
