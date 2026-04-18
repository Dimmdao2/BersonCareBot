import { describe, expect, it, vi, beforeEach } from "vitest";
import { createTreatmentProgramService } from "./service";
import { createInMemoryTreatmentProgramPort } from "@/app-layer/testing/treatmentProgramInMemory";
import type { TreatmentProgramItemRefValidationPort } from "./ports";

const validRef = "11111111-1111-4111-8111-111111111111";

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

describe("treatment-program service", () => {
  let port: ReturnType<typeof createInMemoryTreatmentProgramPort>;
  let itemRefs: TreatmentProgramItemRefValidationPort;

  beforeEach(() => {
    port = createInMemoryTreatmentProgramPort();
    itemRefs = {
      assertItemRefExists: vi.fn(async () => {}),
    };
  });

  it("createTemplate trims title", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const row = await svc.createTemplate({ title: "  Hello  ", description: null }, null);
    expect(row.title).toBe("Hello");
  });

  it("addStageItem invokes item ref validation", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "P" }, null);
    const stage = await svc.createStage(tpl.id, { title: "S1" });
    await svc.addStageItem(stage.id, {
      itemType: "exercise",
      itemRefId: validRef,
    });
    expect(itemRefs.assertItemRefExists).toHaveBeenCalledWith("exercise", validRef);
  });

  it("addStageItem rejects invalid UUID for ref", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "P" }, null);
    const stage = await svc.createStage(tpl.id, { title: "S1" });
    await expect(
      svc.addStageItem(stage.id, {
        itemType: "recommendation",
        itemRefId: "not-a-uuid",
      }),
    ).rejects.toThrow(/UUID/);
    expect(itemRefs.assertItemRefExists).not.toHaveBeenCalled();
  });

  it("updateStageItem revalidates when itemRefId changes", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "P" }, null);
    const stage = await svc.createStage(tpl.id, { title: "S1" });
    const item = await svc.addStageItem(stage.id, {
      itemType: "lesson",
      itemRefId: validRef,
    });
    const nextRef = "22222222-2222-4222-8222-222222222222";
    await svc.updateStageItem(item.id, { itemRefId: nextRef });
    expect(itemRefs.assertItemRefExists).toHaveBeenLastCalledWith("lesson", nextRef);
  });

  it("allows the same library ref on multiple stages (no unique constraint)", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "T" }, null);
    const s1 = await svc.createStage(tpl.id, { title: "E1" });
    const s2 = await svc.createStage(tpl.id, { title: "E2" });
    await svc.addStageItem(s1.id, { itemType: "test_set", itemRefId: validRef });
    await svc.addStageItem(s2.id, { itemType: "test_set", itemRefId: validRef });
    const full = await svc.getTemplate(tpl.id);
    const refs = full.stages.flatMap((st) => st.items.map((i) => i.itemRefId));
    expect(refs.filter((r) => r === validRef).length).toBe(2);
  });

  it("swap stage sortOrder reverses display order", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "T" }, null);
    await svc.createStage(tpl.id, { title: "A" });
    await svc.createStage(tpl.id, { title: "B" });
    const before = await svc.getTemplate(tpl.id);
    const [first, second] = sortByOrderThenId(before.stages);
    expect(first?.title).toBe("A");
    expect(second?.title).toBe("B");
    await svc.updateStage(first!.id, { sortOrder: second!.sortOrder });
    await svc.updateStage(second!.id, { sortOrder: first!.sortOrder });
    const after = await svc.getTemplate(tpl.id);
    const titles = sortByOrderThenId(after.stages).map((s) => s.title);
    expect(titles).toEqual(["B", "A"]);
  });
});
