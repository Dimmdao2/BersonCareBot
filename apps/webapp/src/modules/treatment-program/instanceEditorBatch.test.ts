import { describe, expect, it, vi, beforeEach } from "vitest";
import { createTreatmentProgramService } from "./service";
import { createTreatmentProgramInstanceService } from "./instance-service";
import { createInMemoryTreatmentProgramPort } from "@/app-layer/testing/treatmentProgramInMemory";
import {
  createInMemoryTreatmentProgramPersistence,
  createInMemoryTreatmentProgramItemSnapshotPort,
} from "@/app-layer/testing/treatmentProgramInstanceInMemory";
import type { TreatmentProgramItemRefValidationPort } from "./ports";
import type { InstanceEditorBatchDraft } from "./instanceEditorBatchSchema";

const refA = "11111111-1111-4111-8111-111111111111";
const doctor = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function emptyBatchDraft(): InstanceEditorBatchDraft {
  return {
    stageMetadata: {},
    groupPatches: {},
    itemPatches: {},
    stageOrder: null,
    stageCreates: [],
    groupCreates: [],
    itemCreates: [],
    itemDeletes: {},
    itemReorders: {},
    groupReorders: {},
    groupHides: {},
    itemStructuralPatches: {},
  };
}

describe("doctorApplyInstanceEditorBatch", () => {
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

  it("writes single program_changed event for metadata batch", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const item = stage.items[0]!;

    const eventsBefore = await persistence.eventsPort.listEventsForInstance(inst.id);

    await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        stageMetadata: { [stage.id]: { title: "Этап переименован" } },
        itemPatches: { [item.id]: { localComment: "Коммент" } },
      },
    });

    const eventsAfter = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(eventsAfter.length).toBe(eventsBefore.length + 1);
    const event = eventsAfter[0];
    expect(event?.eventType).toBe("program_changed");
    expect(event?.payload?.scope).toBe("editor_batch");
    expect(event?.payload?.diff).toMatchObject({
      stagesMetadataUpdated: 1,
      itemsMetadataUpdated: 1,
    });
  });

  it("writes single program_changed for combined metadata and structural batch", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const item = stage.items[0]!;

    const eventsBefore = await persistence.eventsPort.listEventsForInstance(inst.id);

    await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        stageMetadata: { [stage.id]: { title: "Этап 2" } },
        itemStructuralPatches: { [item.id]: { status: "disabled" } },
      },
    });

    const eventsAfter = await persistence.eventsPort.listEventsForInstance(inst.id);
    const programChanged = eventsAfter.filter((e) => e.eventType === "program_changed");
    expect(programChanged.length).toBe(eventsBefore.filter((e) => e.eventType === "program_changed").length + 1);
  });

  it("does not append program_changed for empty draft", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assignedBy: doctor,
    });

    const eventsBefore = await persistence.eventsPort.listEventsForInstance(inst.id);

    await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: emptyBatchDraft(),
    });

    const eventsAfter = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(eventsAfter.length).toBe(eventsBefore.length);
  });

  it("rejects stage reorder that moves stage zero without mutating or writing event", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: doctor,
    });
    const stageZero = inst.stages.find((s) => s.sortOrder === 0)!;
    const stageOne = inst.stages.find((s) => s.sortOrder === 1)!;
    const eventsBefore = await persistence.eventsPort.listEventsForInstance(inst.id);

    await expect(
      instSvc.doctorApplyInstanceEditorBatch({
        instanceId: inst.id,
        actorId: doctor,
        draft: {
          ...emptyBatchDraft(),
          stageOrder: [stageOne.id, stageZero.id],
        },
      }),
    ).rejects.toThrow(/Общие рекомендации/);

    const eventsAfter = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(eventsAfter.length).toBe(eventsBefore.length);
    const detail = await instSvc.getInstanceById(inst.id);
    expect(detail!.stages.find((s) => s.id === stageZero.id)?.sortOrder).toBe(0);
  });

  it("does not create stage when batch fails validation before apply", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      assignedBy: doctor,
    });
    const stageZero = inst.stages.find((s) => s.sortOrder === 0)!;
    const clientStageId = "draft:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await expect(
      instSvc.doctorApplyInstanceEditorBatch({
        instanceId: inst.id,
        actorId: doctor,
        draft: {
          ...emptyBatchDraft(),
          stageCreates: [{ clientId: clientStageId, title: "Новый этап" }],
          stageOrder: [clientStageId, stageZero.id],
        },
      }),
    ).rejects.toThrow(/Общие рекомендации/);

    const detail = await instSvc.getInstanceById(inst.id);
    expect(detail!.stages.some((s) => s.title === "Новый этап")).toBe(false);
  });

  it("rejects delete with test history without program_changed event", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    const testId = "33333333-3333-4333-8333-333333333333";
    await tplSvc.addStageItem(s1.id, { itemType: "clinical_test", itemRefId: testId });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "40404040-4040-4040-8040-404040404040",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const item = stage.items[0]!;
    await persistence.testAttemptsPort.createAttempt({
      stageItemId: item.id,
      patientUserId: inst.patientUserId,
    });
    const eventsBefore = await persistence.eventsPort.listEventsForInstance(inst.id);

    await expect(
      instSvc.doctorApplyInstanceEditorBatch({
        instanceId: inst.id,
        actorId: doctor,
        draft: {
          ...emptyBatchDraft(),
          itemDeletes: { [item.id]: true },
        },
      }),
    ).rejects.toThrow(/историей теста/);

    const eventsAfter = await persistence.eventsPort.listEventsForInstance(inst.id);
    expect(eventsAfter.length).toBe(eventsBefore.length);
    const detail = await instSvc.getInstanceById(inst.id);
    expect(detail!.stages.flatMap((s) => s.items).some((i) => i.id === item.id)).toBe(true);
  });

  it("adds stage via batch draft", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignedBy: doctor,
    });

    const clientStageId = "draft:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const next = await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        stageCreates: [{ clientId: clientStageId, title: "Новый этап" }],
      },
    });

    expect(next.stages.some((s) => s.title === "Новый этап")).toBe(true);
  });

  it("adds group via batch draft", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "55555555-5555-4555-8555-555555555555",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const clientGroupId = "draft:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const next = await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        groupCreates: [
          {
            clientId: clientGroupId,
            stageId: stage.id,
            title: "Новая группа",
          },
        ],
      },
    });

    const stageAfter = next.stages.find((s) => s.id === stage.id)!;
    expect(stageAfter.groups.some((g) => g.title === "Новая группа")).toBe(true);
  });

  it("rejects invalid loadSettings before mutation", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    const grp = await tplSvc.createTemplateStageGroup(s1.id, { title: "ЛФК" });
    const exRef = "66666666-6666-4666-8666-666666666666";
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: exRef, groupId: grp.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "66666666-6666-4666-8666-666666666666",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const item = stage.items[0]!;

    await expect(
      instSvc.doctorApplyInstanceEditorBatch({
        instanceId: inst.id,
        actorId: doctor,
        draft: {
          ...emptyBatchDraft(),
          itemPatches: { [item.id]: { loadSettings: { reps: 0, sets: null, maxPain: null } } },
        },
      }),
    ).rejects.toThrow(/Повторы/);
  });

  it("rolls back mutations when apply throws mid-batch", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "77777777-7777-4777-8777-777777777777",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const originalTitle = stage.title;
    const itemIds = stage.items.map((i) => i.id);
    const reorderSpy = vi
      .spyOn(persistence.instancePort, "reorderInstanceStageItems")
      .mockRejectedValueOnce(new Error("simulated apply failure"));

    await expect(
      instSvc.doctorApplyInstanceEditorBatch({
        instanceId: inst.id,
        actorId: doctor,
        draft: {
          ...emptyBatchDraft(),
          stageMetadata: { [stage.id]: { title: "Не должно сохраниться" } },
          itemReorders: { [stage.id]: itemIds },
        },
      }),
    ).rejects.toThrow("simulated apply failure");

    reorderSpy.mockRestore();
    const detail = await instSvc.getInstanceById(inst.id);
    expect(detail!.stages.find((s) => s.id === stage.id)?.title).toBe(originalTitle);
  });

  it("itemCreates library_item persists catalog buildSnapshot, not draft preview snapshot", async () => {
    const exRef = "66666666-6666-4666-8666-666666666666";
    const buildSnapshot = vi.fn(async (type: string, id: string) => ({
      itemType: type,
      id,
      title: "Каталог",
      media: [{ url: `/api/media/${id}`, type: "video", sortOrder: 0 }],
    }));
    const snapshots = { buildSnapshot };
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
    const grp = await tplSvc.createTemplateStageGroup(s1.id, { title: "ЛФК" });
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: exRef, groupId: grp.id });
    const inst = await localInstSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "77777777-7777-4777-8777-777777777777",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const instanceGroup = stage.groups.find((g) => !g.systemKind)!;

    await localInstSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        itemCreates: [
          {
            kind: "library_item",
            clientId: "draft:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            stageId: stage.id,
            itemType: "exercise",
            itemRefId: exRef,
            groupId: instanceGroup.id,
            snapshot: {
              title: "Черновик",
              media: [{ mediaUrl: `/api/media/${exRef}/preview/sm`, mediaType: "image", sortOrder: 0 }],
            },
          },
        ],
      },
    });

    expect(buildSnapshot).toHaveBeenCalledWith("exercise", exRef);
    const detail = await localInstSvc.getInstanceById(inst.id);
    const created = detail!.stages
      .flatMap((s) => s.items)
      .find((i) => i.itemRefId === exRef && i.sortOrder > 0);
    expect(created?.snapshot).toMatchObject({
      media: [{ url: `/api/media/${exRef}`, type: "video", sortOrder: 0 }],
    });
  });

  it("creates library exercise with loadSettings and localComment from itemCreates", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    const grp = await tplSvc.createTemplateStageGroup(s1.id, { title: "ЛФК" });
    const exRef = "66666666-6666-4666-8666-666666666666";
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: exRef, groupId: grp.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "99999999-9999-4999-8999-999999999999",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const instanceGroup = stage.groups.find((g) => !g.systemKind)!;
    const clientItemId = "draft:cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    const next = await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        itemCreates: [
          {
            kind: "library_item",
            clientId: clientItemId,
            stageId: stage.id,
            itemType: "exercise",
            itemRefId: exRef,
            groupId: instanceGroup.id,
            snapshot: { title: "Новое упр" },
            localComment: "Коммент при создании",
            loadSettings: { reps: 10, sets: 2, maxPain: 3 },
          },
        ],
      },
    });

    const created = next.stages
      .flatMap((s) => s.items)
      .find((i) => i.localComment === "Коммент при создании");
    expect(created).toBeDefined();
    expect(created?.settings).toMatchObject({ reps: 10, sets: 2, maxPain: 3 });
  });

  it("creates freeform stage-0 recommendation with localComment and isActionable from itemCreates", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "abababab-abab-4aba-8bab-abababababab",
      assignedBy: doctor,
    });
    const stageZero = inst.stages.find((s) => s.sortOrder === 0)!;
    const clientItemId = "draft:dddddddd-dddd-4ddd-8ddd-dddddddddddd";

    const next = await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        itemCreates: [
          {
            kind: "freeform_recommendation",
            clientId: clientItemId,
            stageId: stageZero.id,
            title: "Общая рекомендация",
            bodyMd: "Текст рекомендации",
            snapshot: { title: "Общая рекомендация", bodyMd: "Текст рекомендации" },
            localComment: "Индивидуальный комментарий",
            isActionable: true,
          },
        ],
      },
    });

    const created = next.stages
      .flatMap((s) => s.items)
      .find((i) => i.localComment === "Индивидуальный комментарий");
    expect(created).toBeDefined();
    expect(created?.isActionable).toBe(true);
    expect(created?.snapshot).toMatchObject({ title: "Общая рекомендация" });
  });

  it("ignores legacy itemPatches keyed by draft client id", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    const grp = await tplSvc.createTemplateStageGroup(s1.id, { title: "ЛФК" });
    const exRef = "66666666-6666-4666-8666-666666666666";
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: exRef, groupId: grp.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const instanceGroup = stage.groups.find((g) => !g.systemKind)!;
    const draftItemId = "draft:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

    const next = await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        itemCreates: [
          {
            kind: "library_item",
            clientId: draftItemId,
            stageId: stage.id,
            itemType: "exercise",
            itemRefId: exRef,
            groupId: instanceGroup.id,
            snapshot: { title: "Новое" },
            localComment: "из create",
          },
        ],
        itemPatches: {
          [draftItemId]: { localComment: "из orphan patch" },
        },
      },
    });

    const created = next.stages
      .flatMap((s) => s.items)
      .find((i) => i.localComment === "из create");
    expect(created).toBeDefined();
    expect(
      next.stages.flatMap((s) => s.items).some((i) => i.localComment === "из orphan patch"),
    ).toBe(false);
  });

  it("creates lfk_complex_expand lines with loadSettings and per-line groupId", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    const grpA = await tplSvc.createTemplateStageGroup(s1.id, { title: "ЛФК A" });
    const grpB = await tplSvc.createTemplateStageGroup(s1.id, { title: "ЛФК B" });
    const exRef1 = "77777777-7777-4777-8777-777777777771";
    const exRef2 = "77777777-7777-4777-8777-777777777772";
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const instanceGroupA = stage.groups.find((g) => g.title === "ЛФК A")!;
    const instanceGroupB = stage.groups.find((g) => g.title === "ЛФК B")!;
    const line1 = "draft:11111111-1111-4111-8111-111111111111";
    const line2 = "draft:22222222-2222-4222-8222-222222222222";

    const next = await instSvc.doctorApplyInstanceEditorBatch({
      instanceId: inst.id,
      actorId: doctor,
      draft: {
        ...emptyBatchDraft(),
        itemCreates: [
          {
            kind: "lfk_complex_expand",
            stageId: stage.id,
            groupId: instanceGroupA.id,
            complexTemplateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            items: [
              {
                clientId: line1,
                itemRefId: exRef1,
                snapshot: { title: "Упр 1" },
                loadSettings: { reps: 8, sets: 2, maxPain: 1 },
              },
              {
                clientId: line2,
                itemRefId: exRef2,
                snapshot: { title: "Упр 2" },
                groupId: instanceGroupB.id,
                loadSettings: { reps: 5, sets: 1, maxPain: 2 },
              },
            ],
          },
        ],
      },
    });

    const items = next.stages.flatMap((s) => s.items).filter((i) => i.itemRefId === exRef1 || i.itemRefId === exRef2);
    expect(items).toHaveLength(2);
    const moved = items.find((i) => i.itemRefId === exRef2);
    expect(moved?.groupId).toBe(instanceGroupB.id);
    expect(moved?.settings).toMatchObject({ reps: 5, sets: 1, maxPain: 2 });
  });

  it("rejects invalid loadSettings on itemCreates before mutation", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    const grp = await tplSvc.createTemplateStageGroup(s1.id, { title: "ЛФК" });
    const exRef = "66666666-6666-4666-8666-666666666666";
    await tplSvc.addStageItem(s1.id, { itemType: "exercise", itemRefId: exRef, groupId: grp.id });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "dededede-dede-4ded-8ded-edededededed",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const instanceGroup = stage.groups.find((g) => !g.systemKind)!;

    await expect(
      instSvc.doctorApplyInstanceEditorBatch({
        instanceId: inst.id,
        actorId: doctor,
        draft: {
          ...emptyBatchDraft(),
          itemCreates: [
            {
              kind: "library_item",
              clientId: "draft:ffffffff-ffff-4fff-8fff-ffffffffffff",
              stageId: stage.id,
              itemType: "exercise",
              itemRefId: exRef,
              groupId: instanceGroup.id,
              snapshot: { title: "X" },
              loadSettings: { reps: 0, sets: null, maxPain: null },
            },
          ],
        },
      }),
    ).rejects.toThrow(/Повторы/);
  });

  it("rejects invalid item reorder before mutation", async () => {
    const tpl = await tplSvc.createTemplate({ title: "П", status: "published" }, null);
    const s1 = await tplSvc.createStage(tpl.id, { title: "Э1" });
    await tplSvc.addStageItem(s1.id, { itemType: "recommendation", itemRefId: refA });
    const inst = await instSvc.assignTemplateToPatient({
      templateId: tpl.id,
      patientUserId: "88888888-8888-4888-8888-888888888888",
      assignedBy: doctor,
    });
    const stage = inst.stages.find((s) => s.sortOrder === 1)!;
    const item = stage.items[0]!;
    const originalTitle = stage.title;

    await expect(
      instSvc.doctorApplyInstanceEditorBatch({
        instanceId: inst.id,
        actorId: doctor,
        draft: {
          ...emptyBatchDraft(),
          stageMetadata: { [stage.id]: { title: "Не должно сохраниться" } },
          itemReorders: { [stage.id]: [item.id, "00000000-0000-4000-8000-000000000001"] },
        },
      }),
    ).rejects.toThrow(/элементов этапа/);

    const detail = await instSvc.getInstanceById(inst.id);
    expect(detail!.stages.find((s) => s.id === stage.id)?.title).toBe(originalTitle);
  });
});
