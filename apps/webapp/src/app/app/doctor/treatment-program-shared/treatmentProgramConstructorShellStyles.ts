import type { CSSProperties } from "react";
import type { TreatmentProgramInstanceStageGroup } from "@/modules/treatment-program/types";

/** Совпадает с конструктором шаблона — общие рекомендации и системная группа «Рекомендации». */
export const TPL_HEADER_BG_RECOMMENDATIONS =
  "color-mix(in oklab, oklch(0.79 0.2 113.21) 25%, transparent)";
/** Шапка лечебных этапов (`sort_order > 0`). */
export const INSTANCE_HEADER_BG_STAGE_EDITABLE =
  "color-mix(in oklab, hsl(0deg 0% 95.9%) 50%, transparent)";
/** Пользовательская группа инстанса. */
export const INSTANCE_HEADER_BG_GROUP_CUSTOM =
  "color-mix(in oklab, oklch(0.53 0.18 247.27) 9%, transparent)";
/** Системная группа «Тестирование». */
export const INSTANCE_HEADER_BG_GROUP_TESTS =
  "color-mix(in oklab, oklch(0.71 0.19 58.95 / 0.47) 55%, transparent)";

export const INSTANCE_CONSTRUCTOR_GLOBAL_RECOMMENDATIONS_CARD_CLASS =
  "w-full min-w-0 overflow-hidden rounded-md border border-border/50 bg-muted/10 shadow-sm";

export const INSTANCE_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS =
  "w-full min-w-0 overflow-hidden rounded-md border border-border/60 bg-card/20 shadow-sm";

/** Алиасы имён из конструктора шаблона — один источник строк с `INSTANCE_*`. */
export const TPL_HEADER_BG_STAGE_EDITABLE = INSTANCE_HEADER_BG_STAGE_EDITABLE;
export const TPL_HEADER_BG_GROUP_CUSTOM = INSTANCE_HEADER_BG_GROUP_CUSTOM;
export const TPL_HEADER_BG_GROUP_TESTS = INSTANCE_HEADER_BG_GROUP_TESTS;
export const TPL_CONSTRUCTOR_GLOBAL_RECOMMENDATIONS_CARD_CLASS =
  INSTANCE_CONSTRUCTOR_GLOBAL_RECOMMENDATIONS_CARD_CLASS;
export const TPL_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS = INSTANCE_CONSTRUCTOR_LEARNING_STAGE_CARD_CLASS;

export const tplToolbarTextBtnClass = "h-7 min-h-7 px-2 text-xs";

export function instanceGroupHeaderSurfaceStyle(g: TreatmentProgramInstanceStageGroup): CSSProperties {
  if (g.systemKind === "recommendations") {
    return { background: TPL_HEADER_BG_RECOMMENDATIONS };
  }
  if (g.systemKind === "tests") {
    return { background: INSTANCE_HEADER_BG_GROUP_TESTS };
  }
  return { background: INSTANCE_HEADER_BG_GROUP_CUSTOM };
}
