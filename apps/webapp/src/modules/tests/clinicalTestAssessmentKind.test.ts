import { describe, expect, it } from "vitest";
import type { ReferenceItem } from "@/modules/references/types";
import {
  assessmentKindDisplayTitle,
  assessmentKindWriteAllowSet,
  buildClinicalAssessmentKindSelectOptions,
  referenceItemsToAssessmentKindFilterDto,
} from "./clinicalTestAssessmentKind";

const cat = "rc-ak";

function item(p: Partial<ReferenceItem> & Pick<ReferenceItem, "code" | "title" | "sortOrder">): ReferenceItem {
  return {
    id: p.id ?? `id-${p.code}`,
    categoryId: p.categoryId ?? cat,
    code: p.code,
    title: p.title,
    sortOrder: p.sortOrder,
    isActive: p.isActive ?? true,
    deletedAt: p.deletedAt ?? null,
    metaJson: p.metaJson ?? {},
  };
}

describe("clinicalTestAssessmentKind", () => {
  it("assessmentKindWriteAllowSet uses DB codes when non-empty", () => {
    const allow = assessmentKindWriteAllowSet([item({ code: "mobility", title: "Подвижность", sortOrder: 1 })]);
    expect(allow.has("mobility")).toBe(true);
    expect(allow.has("pain")).toBe(false);
  });

  it("assessmentKindWriteAllowSet falls back to seed when DB empty", () => {
    const allow = assessmentKindWriteAllowSet([]);
    expect(allow.has("mobility")).toBe(true);
    expect(allow.has("endurance")).toBe(true);
  });

  it("buildClinicalAssessmentKindSelectOptions adds legacy row for unknown current", () => {
    const opts = buildClinicalAssessmentKindSelectOptions(
      [item({ code: "mobility", title: "Подвижность", sortOrder: 1 })],
      "legacy_x",
    );
    expect(opts[0]).toEqual({ code: "legacy_x", title: "legacy_x (не в справочнике)" });
    expect(opts.some((o) => o.code === "mobility")).toBe(true);
  });

  it("assessmentKindDisplayTitle tolerates unknown code", () => {
    expect(assessmentKindDisplayTitle("legacy_x", [])).toBe("legacy_x");
    expect(assessmentKindDisplayTitle("mobility", [item({ code: "mobility", title: "M", sortOrder: 1 })])).toBe("M");
  });

  it("referenceItemsToAssessmentKindFilterDto maps DTO shape", () => {
    const dto = referenceItemsToAssessmentKindFilterDto([
      item({ id: "u1", code: "pain", title: "Боль", sortOrder: 2 }),
    ]);
    expect(dto).toEqual([{ id: "u1", code: "pain", title: "Боль", sortOrder: 2 }]);
  });
});
