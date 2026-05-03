import { describe, expect, it, vi, beforeEach } from "vitest";
import { createTreatmentProgramService } from "./service";
import { createTreatmentProgramInstanceService } from "./instance-service";
import { createInMemoryTreatmentProgramPort } from "@/app-layer/testing/treatmentProgramInMemory";
import {
  createInMemoryTreatmentProgramInstancePort,
  createInMemoryTreatmentProgramItemSnapshotPort,
} from "@/app-layer/testing/treatmentProgramInstanceInMemory";
import type { TreatmentProgramItemRefValidationPort } from "./ports";
import { effectiveInstanceStageItemComment } from "./types";

const refA = "11111111-1111-4111-8111-111111111111";
const refB = "22222222-2222-4222-8222-222222222222";

describe("treatment-program instance service", () => {
  let tplPort: ReturnType<typeof createInMemoryTreatmentProgramPort>;
  let instPort: ReturnType<typeof createInMemoryTreatmentProgramInstancePort>;
  let itemRefs: TreatmentProgramItemRefValidationPort;
  let tplSvc: ReturnType<typeof createTreatmentProgramService>;
  let instSvc: ReturnType<typeof createTreatmentProgramInstanceService>;

  beforeEach(() => {
    tplPort = createInMemoryTreatmentProgramPort();
    instPort = createInMemoryTreatmentProgramInstancePort();
    itemRefs = { assertItemRefExists: vi.fn(async () => {}) };
    tplSvc = createTreatmentProgramService(tplPort, itemRefs);
    instSvc = createTreatmentProgramInstanceService({
      instances: instPort,
      templates: tplSvc,
      snapshots: createInMemoryTreatmentProgramItemSnapshotPort(),
      itemRefs,
    });
  });

  it("deep copy: stages order, first available rest locked, comment and snapshot, local_comment null", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const s2 = await tplSvc.createStage(tpl.id, { title: "Этап 2" });
    await tplSvc.addStageItem(s1.id, {
      itemType: "recommendation",
      itemRefId: refA,
      comment: "Из шаблона",
    });
    await tplSvc.addStageItem(s2.id, {
      itemType: "exercise",
      itemRefId: refB,
      comment: null,
    });

    const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });

    expect(inst.stages).toHaveLength(2);
    expect(inst.stages[0]!.status).toBe("available");
    expect(inst.stages[1]!.status).toBe("available");
    expect(inst.stages[0]!.sourceStageId).toBe(s1.id);
    expect(inst.stages[0]!.items).toHaveLength(1);
    const it0 = inst.stages[0]!.items[0]!;
    expect(it0.comment).toBe("Из шаблона");
    expect(it0.localComment).toBeNull();
    expect(it0.snapshot).toMatchObject({ itemType: "recommendation", id: refA, stub: true });
    expect(it0.effectiveComment).toBe("Из шаблона");
    expect(it0.isActionable).toBe(true);
    expect(it0.status).toBe("active");
  });

  it("deep copy: goals, objectives, expected duration from template stages (A1)", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, {
      title: "Этап 1",
      goals: "Снять боль",
      objectives: "- 3 раза в неделю\n- без отёка",
      expectedDurationDays: 14,
      expectedDurationText: "2 недели",
    });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const s2 = await tplSvc.createStage(tpl.id, {
      title: "Этап 2",
      goals: null,
      objectives: null,
      expectedDurationDays: null,
      expectedDurationText: null,
    });
    await tplSvc.addStageItem(s2.id, { itemType: "exercise", itemRefId: refB });

    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: null,
    });

    expect(inst.stages[0]!.goals).toBe("Снять боль");
    expect(inst.stages[0]!.objectives).toBe("- 3 раза в неделю\n- без отёка");
    expect(inst.stages[0]!.expectedDurationDays).toBe(14);
    expect(inst.stages[0]!.expectedDurationText).toBe("2 недели");

    expect(inst.stages[1]!.goals).toBeNull();
    expect(inst.stages[1]!.objectives).toBeNull();
    expect(inst.stages[1]!.expectedDurationDays).toBeNull();
    expect(inst.stages[1]!.expectedDurationText).toBeNull();
  });

  it("deep copy preserves settings from template stage item (§5)", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const settings = { nested: { k: "v" }, n: 42 };
    await tplSvc.addStageItem(s1.id, {
      itemType: "recommendation",
      itemRefId: refA,
      comment: "c",
      settings,
    });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      assignedBy: null,
    });
    expect(inst.stages[0]!.items[0]!.settings).toEqual(settings);
  });

  it("instance item comment and snapshot are independent of template edits after assign (§5)", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const tItem = await tplSvc.addStageItem(s1.id, {
      itemType: "lesson",
      itemRefId: refA,
      comment: "original",
    });
    const patient = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const snapBefore = { ...inst.stages[0]!.items[0]!.snapshot };

    await tplSvc.updateStageItem(tItem.id, { comment: "mutated-in-template" });

    const after = await instSvc.getInstanceForPatient(patient, inst.id);
    const row = after.stages[0]!.items[0]!;
    expect(row.comment).toBe("original");
    expect(row.snapshot).toEqual(snapBefore);
  });

  it("rejects draft template assignment", async () => {
    const tpl = await tplSvc.createTemplate({ title: "Черновик", status: "draft" }, null);
    await tplSvc.createStage(tpl.id, { title: "S" });
    await expect(
      instSvc.assignTemplateToPatient({
        templateId: tpl.id,
        patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        assignedBy: null,
      }),
    ).rejects.toThrow(/опубликован/);
  });

  it("§6 effectiveComment: local overrides template copy", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    await tplSvc.addStageItem(s1.id, {
      itemType: "lesson",
      itemRefId: refA,
      comment: "Шаблонный текст",
    });
    const patient = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;

    expect(effectiveInstanceStageItemComment(inst.stages[0]!.items[0]!)).toBe("Шаблонный текст");

    await instSvc.updateStageItemLocalComment({
      instanceId: inst.id,
      stageItemId: itemId,
      localComment: "Для Иванова",
      actorId: null,
    });
    const after = await instSvc.getInstanceForPatient(patient, inst.id);
    const row = after.stages[0]!.items[0]!;
    expect(row.localComment).toBe("Для Иванова");
    expect(row.comment).toBe("Шаблонный текст");
    expect(row.effectiveComment).toBe("Для Иванова");
    expect(effectiveInstanceStageItemComment(row)).toBe("Для Иванова");
  });

  it("§6 reset localComment shows template comment again", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    await tplSvc.addStageItem(s1.id, {
      itemType: "test_set",
      itemRefId: refA,
      comment: "Оригинал",
    });
    const patient = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await instSvc.updateStageItemLocalComment({
      instanceId: inst.id,
      stageItemId: itemId,
      localComment: "Временно",
      actorId: null,
    });
    await instSvc.updateStageItemLocalComment({
      instanceId: inst.id,
      stageItemId: itemId,
      localComment: null,
      actorId: null,
    });
    const after = await instSvc.getInstanceForPatient(patient, inst.id);
    const row = after.stages[0]!.items[0]!;
    expect(row.localComment).toBeNull();
    expect(row.effectiveComment).toBe("Оригинал");
  });

  it("assign copies template stage groups and maps item groupId to instance group", async () => {
    const tpl = await tplSvc.createTemplate({ title: "С группами", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const g = await tplSvc.createTemplateStageGroup(s1.id, { title: "Неделя 1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA, groupId: g.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      assignedBy: null,
    });
    const stage = inst.stages[0]!;
    expect(stage.groups).toHaveLength(1);
    expect(stage.groups[0]!.title).toBe("Неделя 1");
    expect(stage.groups[0]!.sourceGroupId).toBe(g.id);
    const it0 = stage.items[0]!;
    expect(it0.groupId).toBe(stage.groups[0]!.id);
  });
});
