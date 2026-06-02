import { describe, expect, it } from "vitest";
import { planStageItemDndReorder } from "./treatmentProgramReorderHelpers";

/** Сценарии DnD элементов инстанса — та же логика, что `handleItemDnd` в InstanceStageGroupsPanel. */
describe("treatmentProgramInstanceItemDnd (planStageItemDndReorder)", () => {
  const stageItems = [
    { id: "sys", sortOrder: 0, groupId: "g-sys", itemType: "clinical_test" as const },
    { id: "custom-a", sortOrder: 1, groupId: "g-custom", itemType: "exercise" as const },
    { id: "custom-b", sortOrder: 2, groupId: null, itemType: "recommendation" as const },
  ];

  const canParticipate = (it: (typeof stageItems)[number]) => it.id !== "sys";

  it("cross-group move into custom group sets needsGroupPatch and ordered ids", () => {
    const plan = planStageItemDndReorder(stageItems, "custom-b", "custom-a", canParticipate);
    expect(plan).toMatchObject({
      ok: true,
      nextGroupId: "g-custom",
      needsGroupPatch: true,
      orderedItemIds: ["sys", "custom-b", "custom-a"],
    });
  });

  it("rejects moving exercise into ungrouped via recommendation anchor", () => {
    const items = [
      { id: "u", sortOrder: 0, groupId: null, itemType: "recommendation" as const },
      { id: "e", sortOrder: 1, groupId: "g1", itemType: "exercise" as const },
    ];
    const plan = planStageItemDndReorder(items, "e", "u", () => true);
    expect(plan).toEqual({ ok: false, error: "ungrouped_type" });
  });
});
