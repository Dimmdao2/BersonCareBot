import { describe, expect, it } from "vitest";
import {
  computeOrderedItemIdsAfterGroupItemAdjacentSwap,
  computeOrderedStageIdsAfterPipelineMove,
  computeStageItemReorderAfterDnd,
  planStageItemDndReorder,
} from "./treatmentProgramReorderHelpers";

describe("treatmentProgramReorderHelpers", () => {
  it("computeOrderedStageIdsAfterPipelineMove keeps stage 0 first", () => {
    const stages = [
      { id: "z0", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ];
    const ordered = computeOrderedStageIdsAfterPipelineMove(stages, "b", "a");
    expect(ordered).toEqual(["z0", "b", "a"]);
  });

  it("computeStageItemReorderAfterDnd moves across custom groups", () => {
    const items = [
      { id: "sys", sortOrder: 0, groupId: "g-sys" },
      { id: "a", sortOrder: 1, groupId: "g1" },
      { id: "b", sortOrder: 2, groupId: "g2" },
    ];
    const canParticipate = (it: (typeof items)[number]) => it.id !== "sys";
    const result = computeStageItemReorderAfterDnd(items, "b", "a", canParticipate);
    expect(result).toEqual({
      orderedItemIds: ["sys", "b", "a"],
      nextGroupId: "g1",
    });
  });

  it("planStageItemDndReorder flags cross-group patch and rejects invalid ungrouped type", () => {
    const items = [
      { id: "a", sortOrder: 0, groupId: "g1", itemType: "exercise" },
      { id: "b", sortOrder: 1, groupId: "g2", itemType: "recommendation" },
    ];
    const canParticipate = () => true;
    const plan = planStageItemDndReorder(items, "b", "a", canParticipate);
    expect(plan).toEqual({
      ok: true,
      orderedItemIds: ["b", "a"],
      nextGroupId: "g1",
      needsGroupPatch: true,
    });
    const bad = planStageItemDndReorder(
      [
        { id: "x", sortOrder: 0, groupId: "g1", itemType: "recommendation" },
        { id: "y", sortOrder: 1, groupId: "g1", itemType: "recommendation" },
      ],
      "x",
      "missing",
      () => true,
    );
    expect(bad).toEqual({ ok: false, error: "invalid_reorder" });
  });

  it("planStageItemDndReorder same group skips group patch", () => {
    const items = [
      { id: "a", sortOrder: 0, groupId: "g1", itemType: "recommendation" },
      { id: "b", sortOrder: 1, groupId: "g1", itemType: "recommendation" },
    ];
    const plan = planStageItemDndReorder(items, "a", "b", () => true);
    expect(plan).toMatchObject({
      ok: true,
      nextGroupId: "g1",
      needsGroupPatch: false,
      orderedItemIds: ["b", "a"],
    });
  });

  it("planStageItemDndReorder rejects exercise dropped to ungrouped band", () => {
    const items = [
      { id: "u", sortOrder: 0, groupId: null, itemType: "recommendation" },
      { id: "e", sortOrder: 1, groupId: "g1", itemType: "exercise" },
    ];
    const plan = planStageItemDndReorder(items, "e", "u", () => true);
    expect(plan).toEqual({ ok: false, error: "ungrouped_type" });
  });

  it("computeOrderedItemIdsAfterGroupItemAdjacentSwap within group", () => {
    const items = [
      { id: "x", sortOrder: 0, groupId: "g1" },
      { id: "y", sortOrder: 1, groupId: "g1" },
      { id: "z", sortOrder: 2, groupId: null },
    ];
    const ordered = computeOrderedItemIdsAfterGroupItemAdjacentSwap(items, "g1", "x", 1);
    expect(ordered).toEqual(["y", "x", "z"]);
  });
});
