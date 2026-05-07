import { describe, expect, it, vi, beforeEach } from "vitest";
import { createTreatmentProgramService } from "./service";
import {
  createTreatmentProgramInstanceService,
  SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE,
} from "./instance-service";
import { createInMemoryTreatmentProgramPort } from "@/app-layer/testing/treatmentProgramInMemory";
import {
  createInMemoryTreatmentProgramInstancePort,
  createInMemoryTreatmentProgramItemSnapshotPort,
} from "@/app-layer/testing/treatmentProgramInstanceInMemory";
import type { TreatmentProgramItemRefValidationPort } from "./ports";
import { effectiveInstanceStageItemComment, type TreatmentProgramInstanceDetail } from "./types";

const refA = "11111111-1111-4111-8111-111111111111";
const refB = "22222222-2222-4222-8222-222222222222";

function instStageForTpl(inst: TreatmentProgramInstanceDetail, templateStageId: string) {
  const s = inst.stages.find((x) => x.sourceStageId === templateStageId);
  if (!s) throw new Error("instance stage not found for template stage");
  return s;
}

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
    const g2 = await tplSvc.createTemplateStageGroup(s2.id, { title: "Г" });
    await tplSvc.addStageItem(s2.id, {
      itemType: "exercise",
      itemRefId: refB,
      comment: null,
      groupId: g2.id,
    });

    const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });

    expect(inst.stages).toHaveLength(3);
    const stS1 = instStageForTpl(inst, s1.id);
    const stS2 = instStageForTpl(inst, s2.id);
    expect(stS1.status).toBe("available");
    expect(stS2.status).toBe("locked");
    expect(stS1.sourceStageId).toBe(s1.id);
    expect(stS1.items).toHaveLength(1);
    const it0 = stS1.items[0]!;
    expect(it0.comment).toBe("Из шаблона");
    expect(it0.localComment).toBeNull();
    expect(it0.snapshot).toMatchObject({ itemType: "recommendation", id: refA, stub: true });
    expect(it0.effectiveComment).toBe("Из шаблона");
    expect(it0.isActionable).toBe(true);
    expect(it0.status).toBe("active");
  });

  it("assign creates system groups and maps ungrouped recommendation and test_set", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const grp = await tplSvc.createTemplateStageGroup(s1.id, { title: "Упр" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    await tplSvc.addStageItem(s1.id, { itemType: "test_set", itemRefId: refB });
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: refB, groupId: grp.id });

    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: null,
    });
    const stage = instStageForTpl(inst, s1.id);
    const sysRec = stage.groups.find((x) => x.systemKind === "recommendations");
    const sysTests = stage.groups.find((x) => x.systemKind === "tests");
    expect(sysRec).toBeDefined();
    expect(sysTests).toBeDefined();
    expect(stage.groups.filter((x) => !x.systemKind)).toHaveLength(1);

    const recItem = stage.items.find((i) => i.itemType === "recommendation");
    const testItem = stage.items.find((i) => i.itemType === "test_set");
    const exItem = stage.items.find((i) => i.itemType === "exercise");
    expect(recItem?.groupId).toBe(sysRec?.id);
    expect(testItem?.groupId).toBe(sysTests?.id);
    expect(exItem?.groupId).toBe(stage.groups.find((gr) => gr.title === "Упр")?.id);
  });

  it("doctorAddStageItem on instance stage zero stores recommendation without group", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const d = await tplSvc.getTemplate(tpl.id);
    const s0Tpl = d.stages.find((s) => s.sortOrder === 0)!;
    await tplSvc.addStageItem(s0Tpl.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      assignedBy: null,
    });
    const s0Inst = inst.stages.find((s) => s.sortOrder === 0)!;
    const added = await instSvc.doctorAddStageItem({
      instanceId: inst.id,
      stageId: s0Inst.id,
      actorId: null,
      itemType: "recommendation",
      itemRefId: refB,
    });
    expect(added.groupId).toBeNull();
  });

  it("doctorAddStageItem rejects test_set on instance stage zero", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assignedBy: null,
    });
    const s0Inst = inst.stages.find((s) => s.sortOrder === 0)!;
    await expect(
      instSvc.doctorAddStageItem({
        instanceId: inst.id,
        stageId: s0Inst.id,
        actorId: null,
        itemType: "test_set",
        itemRefId: refA,
      }),
    ).rejects.toThrow(/Общие рекомендации|только рекомендации/);
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
    const g2 = await tplSvc.createTemplateStageGroup(s2.id, { title: "Г2" });
    await tplSvc.addStageItem(s2.id, { itemType: "exercise", itemRefId: refB, groupId: g2.id });

    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: null,
    });

    expect(instStageForTpl(inst, s1.id).goals).toBe("Снять боль");
    expect(instStageForTpl(inst, s1.id).objectives).toBe("- 3 раза в неделю\n- без отёка");
    expect(instStageForTpl(inst, s1.id).expectedDurationDays).toBe(14);
    expect(instStageForTpl(inst, s1.id).expectedDurationText).toBe("2 недели");

    expect(instStageForTpl(inst, s2.id).goals).toBeNull();
    expect(instStageForTpl(inst, s2.id).objectives).toBeNull();
    expect(instStageForTpl(inst, s2.id).expectedDurationDays).toBeNull();
    expect(instStageForTpl(inst, s2.id).expectedDurationText).toBeNull();
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
    expect(instStageForTpl(inst, s1.id).items[0]!.settings).toEqual(settings);
  });

  it("instance item comment and snapshot are independent of template edits after assign (§5)", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Этап 1" });
    const grp = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    const tItem = await tplSvc.addStageItem(s1.id, {
      itemType: "lesson",
      itemRefId: refA,
      comment: "original",
      groupId: grp.id,
    });
    const patient = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const snapBefore = { ...instStageForTpl(inst, s1.id).items[0]!.snapshot };

    await tplSvc.updateStageItem(tItem.id, { comment: "mutated-in-template" });

    const after = await instSvc.getInstanceForPatient(patient, inst.id);
    const row = instStageForTpl(after, s1.id).items[0]!;
    expect(row.comment).toBe("original");
    expect(row.snapshot).toEqual(snapBefore);
  });

  it("rejects second assign while another instance is active", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "S" });
    await tplSvc.addStageItem(s1.id, {
      itemType: "recommendation",
      itemRefId: refA,
    });
    const patient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    await expect(
      instSvc.assignTemplateToPatient({
        templateId: tpl.id,
        patientUserId: patient,
        assignedBy: null,
      }),
    ).rejects.toThrow(SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE);
  });

  it("allows assign after previous instance is completed", async () => {
    const tpl = await tplSvc.createTemplate({ title: "План", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "S" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const patient = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const first = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    await instPort.updateInstanceMeta(first.id, { status: "completed" });
    const second = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe("active");
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
    const grp = await tplSvc.createTemplateStageGroup(s1.id, { title: "G" });
    await tplSvc.addStageItem(s1.id, {
      itemType: "lesson",
      itemRefId: refA,
      comment: "Шаблонный текст",
      groupId: grp.id,
    });
    const patient = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: patient,
      assignedBy: null,
    });
    const itemId = instStageForTpl(inst, s1.id).items[0]!.id;

    expect(effectiveInstanceStageItemComment(instStageForTpl(inst, s1.id).items[0]!)).toBe("Шаблонный текст");

    await instSvc.updateStageItemLocalComment({
      instanceId: inst.id,
      stageItemId: itemId,
      localComment: "Для Иванова",
      actorId: null,
    });
    const after = await instSvc.getInstanceForPatient(patient, inst.id);
    const row = instStageForTpl(after, s1.id).items[0]!;
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
    const itemId = instStageForTpl(inst, s1.id).items[0]!.id;
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
    const row = instStageForTpl(after, s1.id).items[0]!;
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
    const stage = instStageForTpl(inst, s1.id);
    expect(stage.groups).toHaveLength(3);
    const userGroup = stage.groups.find((gr) => gr.sourceGroupId === g.id);
    expect(userGroup?.title).toBe("Неделя 1");
    const it0 = stage.items[0]!;
    expect(it0.groupId).toBe(userGroup?.id);
  });
});
