import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  TreatmentProgramTemplateUsageConfirmationRequiredError,
  TreatmentProgramTemplateGroupDescriptionConflictError,
  TreatmentProgramExpandNotFoundError,
  TreatmentProgramTemplateAlreadyArchivedError,
} from "./errors";
import { createTreatmentProgramService } from "./service";
import {
  clearInMemoryTreatmentProgramTemplateUsageSnapshots,
  createInMemoryTreatmentProgramPort,
  seedInMemoryTreatmentProgramTemplateUsageSnapshot,
} from "@/app-layer/testing/treatmentProgramInMemory";
import type { TreatmentProgramItemRefValidationPort } from "./ports";
import { EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT } from "./types";

const validRef = "11111111-1111-4111-8111-111111111111";

function sortByOrderThenId<T extends { sortOrder: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

describe("treatment-program service", () => {
  let port: ReturnType<typeof createInMemoryTreatmentProgramPort>;
  let itemRefs: TreatmentProgramItemRefValidationPort;

  beforeEach(() => {
    clearInMemoryTreatmentProgramTemplateUsageSnapshots();
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
    const grp = await svc.createTemplateStageGroup(stage.id, { title: "G" });
    await svc.addStageItem(stage.id, {
      itemType: "exercise",
      itemRefId: validRef,
      groupId: grp.id,
    });
    expect(itemRefs.assertItemRefExists).toHaveBeenCalledWith("exercise", validRef);
  });

  it("addStageItem rejects exercise without group", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "P" }, null);
    const stage = await svc.createStage(tpl.id, { title: "S1" });
    await expect(
      svc.addStageItem(stage.id, {
        itemType: "exercise",
        itemRefId: validRef,
      }),
    ).rejects.toThrow(/рекомендацию|набор тестов/i);
    expect(itemRefs.assertItemRefExists).not.toHaveBeenCalled();
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
    const grp = await svc.createTemplateStageGroup(stage.id, { title: "G" });
    const item = await svc.addStageItem(stage.id, {
      itemType: "lesson",
      itemRefId: validRef,
      groupId: grp.id,
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

  it("deleteTemplate requires acknowledgement when active instances exist", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "T" }, null);
    seedInMemoryTreatmentProgramTemplateUsageSnapshot(tpl.id, {
      ...EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
      activeTreatmentProgramInstanceCount: 1,
      activeTreatmentProgramInstanceRefs: [
        {
          kind: "treatment_program_instance",
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Программа",
          patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      ],
    });
    await expect(svc.deleteTemplate(tpl.id)).rejects.toBeInstanceOf(TreatmentProgramTemplateUsageConfirmationRequiredError);
    await svc.deleteTemplate(tpl.id, { acknowledgeUsageWarning: true });
    const archived = await svc.getTemplate(tpl.id);
    expect(archived.status).toBe("archived");
  });

  it("deleteTemplate archives without acknowledgement when only draft courses reference template", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "T" }, null);
    seedInMemoryTreatmentProgramTemplateUsageSnapshot(tpl.id, {
      ...EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
      draftCourseCount: 2,
      draftCourseRefs: [],
    });
    await svc.deleteTemplate(tpl.id);
    const archived = await svc.getTemplate(tpl.id);
    expect(archived.status).toBe("archived");
  });

  it("updateTemplate to archived requires acknowledgement like deleteTemplate", async () => {
    const svc = createTreatmentProgramService(port, itemRefs);
    const tpl = await svc.createTemplate({ title: "T", status: "published" }, null);
    seedInMemoryTreatmentProgramTemplateUsageSnapshot(tpl.id, {
      ...EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
      publishedCourseCount: 1,
      publishedCourseRefs: [
        { kind: "course", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Курс" },
      ],
    });
    await expect(svc.updateTemplate(tpl.id, { status: "archived" })).rejects.toBeInstanceOf(
      TreatmentProgramTemplateUsageConfirmationRequiredError,
    );
    await svc.updateTemplate(tpl.id, { status: "archived" }, { acknowledgeUsageWarning: true });
    const archived = await svc.getTemplate(tpl.id);
    expect(archived.status).toBe("archived");
  });

  describe("expandLfkComplexIntoTemplateStageItems", () => {
    const complexId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const ex1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const ex2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    it("inserts exercise rows ungrouped", async () => {
      port = createInMemoryTreatmentProgramPort({
        lfkComplexExpandPreview: {
          [complexId]: { exerciseIds: [ex1, ex2], complexDescription: "D1" },
        },
      });
      const svc = createTreatmentProgramService(port, itemRefs);
      const tpl = await svc.createTemplate({ title: "P" }, null);
      const stage = await svc.createStage(tpl.id, { title: "S1" });
      const out = await svc.expandLfkComplexIntoTemplateStageItems(tpl.id, stage.id, {
        templateId: tpl.id,
        complexTemplateId: complexId,
        copyComplexDescriptionToGroup: false,
        mode: "ungrouped",
      });
      expect(out.items).toHaveLength(2);
      expect(out.items.every((i) => i.itemType === "exercise" && i.groupId == null)).toBe(true);
      expect(out.items.map((i) => i.itemRefId)).toEqual([ex1, ex2]);
      expect(out.createdGroup).toBeUndefined();
    });

    it("rejects empty complex", async () => {
      port = createInMemoryTreatmentProgramPort({
        lfkComplexExpandPreview: {
          [complexId]: { exerciseIds: [], complexDescription: null },
        },
      });
      const svc = createTreatmentProgramService(port, itemRefs);
      const tpl = await svc.createTemplate({ title: "P" }, null);
      const stage = await svc.createStage(tpl.id, { title: "S1" });
      await expect(
        svc.expandLfkComplexIntoTemplateStageItems(tpl.id, stage.id, {
          templateId: tpl.id,
          complexTemplateId: complexId,
          copyComplexDescriptionToGroup: false,
          mode: "ungrouped",
        }),
      ).rejects.toThrow(/нет упражнений/);
    });

    it("rejects wrong stage for template", async () => {
      port = createInMemoryTreatmentProgramPort({
        lfkComplexExpandPreview: {
          [complexId]: { exerciseIds: [ex1], complexDescription: null },
        },
      });
      const svc = createTreatmentProgramService(port, itemRefs);
      const tpl = await svc.createTemplate({ title: "P" }, null);
      const tpl2 = await svc.createTemplate({ title: "Q" }, null);
      const stage = await svc.createStage(tpl2.id, { title: "Other" });
      await expect(
        svc.expandLfkComplexIntoTemplateStageItems(tpl.id, stage.id, {
          templateId: tpl.id,
          complexTemplateId: complexId,
          copyComplexDescriptionToGroup: false,
          mode: "ungrouped",
        }),
      ).rejects.toBeInstanceOf(TreatmentProgramExpandNotFoundError);
    });

    it("rejects existing_group when group belongs to another stage of the same template", async () => {
      port = createInMemoryTreatmentProgramPort({
        lfkComplexExpandPreview: {
          [complexId]: { exerciseIds: [ex1], complexDescription: null },
        },
      });
      const svc = createTreatmentProgramService(port, itemRefs);
      const tpl = await svc.createTemplate({ title: "P" }, null);
      const stage1 = await svc.createStage(tpl.id, { title: "S1" });
      const stage2 = await svc.createStage(tpl.id, { title: "S2" });
      const g = await svc.createTemplateStageGroup(stage1.id, { title: "G1" });
      await expect(
        svc.expandLfkComplexIntoTemplateStageItems(tpl.id, stage2.id, {
          templateId: tpl.id,
          complexTemplateId: complexId,
          copyComplexDescriptionToGroup: false,
          mode: "existing_group",
          existingGroupId: g.id,
        }),
      ).rejects.toBeInstanceOf(TreatmentProgramExpandNotFoundError);
      expect(itemRefs.assertItemRefExists).not.toHaveBeenCalled();
    });

    it("rejects expand when template is archived", async () => {
      port = createInMemoryTreatmentProgramPort({
        lfkComplexExpandPreview: {
          [complexId]: { exerciseIds: [ex1], complexDescription: null },
        },
      });
      const svc = createTreatmentProgramService(port, itemRefs);
      const tpl = await svc.createTemplate({ title: "P" }, null);
      const stage = await svc.createStage(tpl.id, { title: "S1" });
      await svc.updateTemplate(tpl.id, { status: "archived" });
      await expect(
        svc.expandLfkComplexIntoTemplateStageItems(tpl.id, stage.id, {
          templateId: tpl.id,
          complexTemplateId: complexId,
          copyComplexDescriptionToGroup: false,
          mode: "ungrouped",
        }),
      ).rejects.toBeInstanceOf(TreatmentProgramTemplateAlreadyArchivedError);
    });

    it("port rejects when expectedExerciseIds diverge from catalog order (TOCTOU guard)", async () => {
      port = createInMemoryTreatmentProgramPort({
        lfkComplexExpandPreview: {
          [complexId]: { exerciseIds: [ex1, ex2], complexDescription: null },
        },
      });
      const svc = createTreatmentProgramService(port, itemRefs);
      const tpl = await svc.createTemplate({ title: "P" }, null);
      const stage = await svc.createStage(tpl.id, { title: "S1" });
      await expect(
        port.expandLfkComplexIntoStageItems({
          templateId: tpl.id,
          stageId: stage.id,
          complexTemplateId: complexId,
          mode: "ungrouped",
          copyComplexDescriptionToGroup: false,
          expectedExerciseIds: [ex2, ex1],
        }),
      ).rejects.toThrow(/Комплекс ЛФК был изменён/);
    });

    it("409 path: existing group with description and copy requested", async () => {
      port = createInMemoryTreatmentProgramPort({
        lfkComplexExpandPreview: {
          [complexId]: { exerciseIds: [ex1], complexDescription: "From complex" },
        },
      });
      const svc = createTreatmentProgramService(port, itemRefs);
      const tpl = await svc.createTemplate({ title: "P" }, null);
      const stage = await svc.createStage(tpl.id, { title: "S1" });
      const g = await svc.createTemplateStageGroup(stage.id, {
        title: "G1",
        description: "Already here",
      });
      await expect(
        svc.expandLfkComplexIntoTemplateStageItems(tpl.id, stage.id, {
          templateId: tpl.id,
          complexTemplateId: complexId,
          copyComplexDescriptionToGroup: true,
          mode: "existing_group",
          existingGroupId: g.id,
        }),
      ).rejects.toBeInstanceOf(TreatmentProgramTemplateGroupDescriptionConflictError);
      expect(itemRefs.assertItemRefExists).not.toHaveBeenCalled();
    });

    it("new_group copies complex description when checkbox true", async () => {
      port = createInMemoryTreatmentProgramPort({
        lfkComplexExpandPreview: {
          [complexId]: { exerciseIds: [ex1], complexDescription: "Catalog text" },
        },
      });
      const svc = createTreatmentProgramService(port, itemRefs);
      const tpl = await svc.createTemplate({ title: "P" }, null);
      const stage = await svc.createStage(tpl.id, { title: "S1" });
      const out = await svc.expandLfkComplexIntoTemplateStageItems(tpl.id, stage.id, {
        templateId: tpl.id,
        complexTemplateId: complexId,
        copyComplexDescriptionToGroup: true,
        mode: "new_group",
        newGroupTitle: "My group",
      });
      expect(out.createdGroup?.description).toBe("Catalog text");
    });
  });
});
