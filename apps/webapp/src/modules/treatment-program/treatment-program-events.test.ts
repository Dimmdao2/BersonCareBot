import { describe, expect, it, vi, beforeEach } from "vitest";
import { createTreatmentProgramService } from "./service";
import { createTreatmentProgramInstanceService } from "./instance-service";
import { createInMemoryTreatmentProgramPort } from "@/app-layer/testing/treatmentProgramInMemory";
import {
  createInMemoryTreatmentProgramPersistence,
  createInMemoryTreatmentProgramItemSnapshotPort,
} from "@/app-layer/testing/treatmentProgramInstanceInMemory";
import type { TreatmentProgramItemRefValidationPort } from "./ports";
import type { TreatmentProgramItemType } from "./types";

const refA = "11111111-1111-4111-8111-111111111111";
const refB = "22222222-2222-4222-8222-222222222222";
const doctor = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("treatment-program events (§8)", () => {
  let tplPort: ReturnType<typeof createInMemoryTreatmentProgramPort>;
  let persistence: ReturnType<typeof createInMemoryTreatmentProgramPersistence>;
  let itemRefs: TreatmentProgramItemRefValidationPort;
  let tplSvc: ReturnType<typeof createTreatmentProgramService>;
  let instSvc: ReturnType<typeof createTreatmentProgramInstanceService>;

  beforeEach(() => {
    tplPort = createInMemoryTreatmentProgramPort();
    persistence = createInMemoryTreatmentProgramPersistence();
    itemRefs = { assertItemRefExists: vi.fn(async () => {}) };
    tplSvc = createTreatmentProgramService(tplPort, itemRefs);
    instSvc = createTreatmentProgramInstanceService({
      instances: persistence.instancePort,
      templates: tplSvc,
      snapshots: createInMemoryTreatmentProgramItemSnapshotPort(),
      itemRefs,
      events: persistence.eventsPort,
      testAttempts: persistence.testAttemptsPort,
    });
  });

  it("item_removed: без reason — ошибка", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await expect(
      instSvc.doctorRemoveStageItem({
        instanceId: inst.id,
        itemId,
        actorId: doctor,
        reason: "   ",
      }),
    ).rejects.toThrow(/удаления элемента/);
  });

  it("item_removed и item_added записываются с reason / payload", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await instSvc.doctorRemoveStageItem({
      instanceId: inst.id,
      itemId,
      actorId: doctor,
      reason: "Дубль в программе",
    });
    const stId = inst.stages[0]!.id;
    await instSvc.doctorAddStageItem({
      instanceId: inst.id,
      stageId: stId,
      actorId: doctor,
      itemType: "recommendation",
      itemRefId: refB,
    });
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(ev.some((e) => e.eventType === "item_removed" && e.reason === "Дубль в программе")).toBe(true);
    expect(ev.some((e) => e.eventType === "item_added")).toBe(true);
  });

  it("comment_changed при смене localComment", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "lesson", itemRefId: refA, comment: "Шаблон" });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await instSvc.updateStageItemLocalComment({
      instanceId: inst.id,
      stageItemId: itemId,
      localComment: "Индивидуально",
      actorId: doctor,
    });
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(ev.some((e) => e.eventType === "comment_changed")).toBe(true);
  });

  it("stage_added при doctorAddStage", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      assignedBy: null,
    });
    await instSvc.doctorAddStage({
      instanceId: inst.id,
      actorId: doctor,
      title: "Доп. этап",
    });
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(ev.some((e) => e.eventType === "stage_added")).toBe(true);
  });

  it("AUDIT_PHASE_7: item_replaced и payload before/after", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await instSvc.doctorReplaceStageItem({
      instanceId: inst.id,
      itemId,
      actorId: doctor,
      itemType: "recommendation",
      itemRefId: refB,
    });
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    const rep = ev.find((e) => e.eventType === "item_replaced");
    expect(rep).toBeDefined();
    expect(rep?.payload).toMatchObject({
      before: { itemType: "recommendation", itemRefId: refA },
      after: { itemType: "recommendation", itemRefId: refB },
    });
  });

  it("AUDIT_PHASE_7: stage_removed при doctorRemoveStage", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "99999999-9999-4999-8999-999999999999",
      assignedBy: null,
    });
    const stageId = inst.stages[0]!.id;
    await instSvc.doctorRemoveStage({ instanceId: inst.id, stageId, actorId: doctor });
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(ev.some((e) => e.eventType === "stage_removed" && e.targetId === stageId)).toBe(true);
  });

  it("AUDIT_PHASE_7: status_changed program при завершении экземпляра", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "88888888-8888-4888-8888-888888888888",
      assignedBy: null,
    });
    await instSvc.updateInstance({
      instanceId: inst.id,
      status: "completed",
      actorId: doctor,
    });
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    const st = ev.find(
      (e) => e.eventType === "status_changed" && e.targetType === "program" && e.targetId === inst.id,
    );
    expect(st?.payload).toMatchObject({ scope: "program", from: "active", to: "completed" });
  });

  it("AUDIT_PHASE_7: listEventsForInstance — хронологический порядок (старые раньше новых)", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "77777777-7777-4777-8777-777777777777",
      assignedBy: null,
    });
    await instSvc.doctorAddStage({ instanceId: inst.id, actorId: doctor, title: "Второй этап" });
    await instSvc.doctorAddStage({ instanceId: inst.id, actorId: doctor, title: "Третий этап" });
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(ev.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ev.length; i++) {
      const a = ev[i - 1]!.createdAt;
      const b = ev[i]!.createdAt;
      expect(a <= b).toBe(true);
    }
  });

  it("фаза 9: reorder этапов — status_changed stages_reordered и порядок id", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    const s2 = await tplSvc.createStage(tpl.id, { title: "Э2" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    await tplSvc.addStageItem(s2.id, { itemType: "recommendation", itemRefId: refB });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "10101010-1010-4010-8010-101010101010",
      assignedBy: null,
    });
    const first = inst.stages[0]!.id;
    const second = inst.stages[1]!.id;
    await instSvc.doctorReorderStages({
      instanceId: inst.id,
      actorId: doctor,
      orderedStageIds: [second, first],
    });
    const detail = await instSvc.getInstanceById(inst.id);
    expect(detail.stages.map((s) => s.id)).toEqual([second, first]);
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    const r = ev.find(
      (e) =>
        e.eventType === "status_changed" &&
        (e.payload as { scope?: string }).scope === "stages_reordered",
    );
    expect(r?.payload).toMatchObject({ scope: "stages_reordered", orderedStageIds: [second, first] });
  });

  it("фаза 9: reorder элементов этапа — stage_items_reordered", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refB });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "20202020-2020-4020-8020-202020202020",
      assignedBy: null,
    });
    const stId = inst.stages[0]!.id;
    const i0 = inst.stages[0]!.items[0]!.id;
    const i1 = inst.stages[0]!.items[1]!.id;
    await instSvc.doctorReorderStageItems({
      instanceId: inst.id,
      stageId: stId,
      actorId: doctor,
      orderedItemIds: [i1, i0],
    });
    const detail = await instSvc.getInstanceById(inst.id);
    expect(detail.stages[0]!.items.map((i) => i.id)).toEqual([i1, i0]);
    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(
      ev.some(
        (e) =>
          e.eventType === "status_changed" &&
          (e.payload as { scope?: string }).scope === "stage_items_reordered",
      ),
    ).toBe(true);
  });

  it("фаза 9: удаление/замена запрещены при completed_at", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "30303030-3030-4030-8030-303030303030",
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await persistence.instancePort.setStageItemCompletedAt(inst.id, itemId, new Date().toISOString());
    await expect(
      instSvc.doctorRemoveStageItem({
        instanceId: inst.id,
        itemId,
        actorId: doctor,
        reason: "тест",
      }),
    ).rejects.toThrow(/отметкой выполнения/);
    await expect(
      instSvc.doctorReplaceStageItem({
        instanceId: inst.id,
        itemId,
        actorId: doctor,
        itemType: "recommendation",
        itemRefId: refB,
      }),
    ).rejects.toThrow(/отметкой выполнения/);
  });

  it("фаза 9: удаление запрещено при наличии попытки теста", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "40404040-4040-4040-8040-404040404040",
      assignedBy: null,
    });
    const itemId = inst.stages[0]!.items[0]!.id;
    await persistence.testAttemptsPort.createAttempt({
      stageItemId: itemId,
      patientUserId: inst.patientUserId,
    });
    await expect(
      instSvc.doctorRemoveStageItem({
        instanceId: inst.id,
        itemId,
        actorId: doctor,
        reason: "тест",
      }),
    ).rejects.toThrow(/историей теста/);
  });

  it("фаза 9: удаление этапа запрещено, если элемент с историей", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "50505050-5050-4050-8050-505050505050",
      assignedBy: null,
    });
    const stageId = inst.stages[0]!.id;
    const itemId = inst.stages[0]!.items[0]!.id;
    await persistence.testAttemptsPort.createAttempt({
      stageItemId: itemId,
      patientUserId: inst.patientUserId,
    });
    await expect(
      instSvc.doctorRemoveStage({ instanceId: inst.id, stageId, actorId: doctor }),
    ).rejects.toThrow(/историей теста/);
  });

  it("фаза 9–11: проекция ЛФК из активных программ для интегратора", async () => {
    const snapshots = {
      buildSnapshot: vi.fn(async (type: TreatmentProgramItemType, id: string) => ({
        itemType: type,
        id,
        title: "Снимок комплекса",
      })),
    };
    const localInstSvc = createTreatmentProgramInstanceService({
      instances: persistence.instancePort,
      templates: tplSvc,
      snapshots,
      itemRefs,
      events: persistence.eventsPort,
      testAttempts: persistence.testAttemptsPort,
    });
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "lfk_complex", itemRefId: refA });
    const inst = await localInstSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "60606060-6060-4060-8060-606060606060",
      assignedBy: null,
    });
    const blocks = await localInstSvc.listTreatmentProgramLfkBlocksForIntegratorPatient(inst.patientUserId);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      instanceId: inst.id,
      instanceStatus: "active",
      lfkComplexId: refA,
      lfkComplexTitle: "Снимок комплекса",
    });
    await localInstSvc.updateInstance({ instanceId: inst.id, status: "completed", actorId: doctor });
    const after = await localInstSvc.listTreatmentProgramLfkBlocksForIntegratorPatient(inst.patientUserId);
    expect(after).toHaveLength(0);
  });

  it("AUDIT_PHASE_9 FIX 9-M-2: цепочка add → replace → reorder сохраняет id и обновляет snapshot", async () => {
    const refC = "33333333-3333-4333-8333-333333333333";
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "81818181-8181-4181-8181-818181818181",
      assignedBy: null,
    });
    const stId = inst.stages[0]!.id;
    const itemFirstId = inst.stages[0]!.items[0]!.id;
    await instSvc.doctorAddStageItem({
      instanceId: inst.id,
      stageId: stId,
      actorId: doctor,
      itemType: "recommendation",
      itemRefId: refB,
    });
    let detail = await instSvc.getInstanceById(inst.id);
    const itemSecondId = detail.stages[0]!.items.find((i) => i.id !== itemFirstId)!.id;

    await instSvc.doctorReplaceStageItem({
      instanceId: inst.id,
      itemId: itemFirstId,
      actorId: doctor,
      itemType: "recommendation",
      itemRefId: refC,
    });
    detail = await instSvc.getInstanceById(inst.id);
    const replaced = detail.stages[0]!.items.find((i) => i.id === itemFirstId)!;
    expect(replaced.itemRefId).toBe(refC);
    expect(replaced.snapshot).toMatchObject({ itemType: "recommendation", id: refC, stub: true });

    await instSvc.doctorReorderStageItems({
      instanceId: inst.id,
      stageId: stId,
      actorId: doctor,
      orderedItemIds: [itemSecondId, itemFirstId],
    });
    detail = await instSvc.getInstanceById(inst.id);
    expect(detail.stages[0]!.items.map((i) => i.id)).toEqual([itemSecondId, itemFirstId]);

    const ev = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(ev.some((e) => e.eventType === "item_added")).toBe(true);
    expect(ev.some((e) => e.eventType === "item_replaced")).toBe(true);
    expect(
      ev.some(
        (e) =>
          e.eventType === "status_changed" &&
          (e.payload as { scope?: string }).scope === "stage_items_reordered",
      ),
    ).toBe(true);
  });
});
