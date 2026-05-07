import type {
  TreatmentProgramEventsPort,
  TreatmentProgramInstancePort,
  TreatmentProgramItemRefValidationPort,
  TreatmentProgramItemSnapshotPort,
  TreatmentProgramTestAttemptsPort,
} from "./ports";
import { buildAppendEventInput } from "./event-recording";
import type { TreatmentProgramService } from "./service";
import { assertUuid } from "./service";
import type { TreatmentProgramInstanceStageStatus } from "./types";
import {
  effectiveInstanceStageItemComment,
  type CreateTreatmentProgramInstanceStageGroupInput,
  type TreatmentProgramInstanceStageItemRow,
  type TreatmentProgramIntegratorLfkBlock,
  type TreatmentProgramItemType,
  type UpdateTreatmentProgramInstanceStageGroupInput,
  type UpdateTreatmentProgramInstanceStageMetadataInput,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
} from "./types";
import { isStageZero, assertTreatmentProgramStageItemFitsSystemGroup } from "./stage-semantics";

/** Второй экземпляр со `status: active` для того же пациента запрещён (POST назначения). */
export const SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE =
  "У пациента уже есть активная программа. Завершите текущую программу или дождитесь её завершения перед назначением новой.";

export function createTreatmentProgramInstanceService(deps: {
  instances: TreatmentProgramInstancePort;
  templates: TreatmentProgramService;
  snapshots: TreatmentProgramItemSnapshotPort;
  itemRefs: TreatmentProgramItemRefValidationPort;
  events?: TreatmentProgramEventsPort;
  /** §8–9: проверка попыток тестов перед удалением/заменой элемента. */
  testAttempts?: TreatmentProgramTestAttemptsPort;
}) {
  const { instances, templates, snapshots, itemRefs, testAttempts } = deps;
  const events = deps.events;

  async function appendEvent(
    input: Parameters<typeof buildAppendEventInput>[0],
  ): Promise<void> {
    if (!events) return;
    await events.appendEvent(buildAppendEventInput(input));
  }

  async function assertStageItemAllowsStructuralChange(item: TreatmentProgramInstanceStageItemRow): Promise<void> {
    if (item.completedAt) {
      throw new Error("Нельзя удалить или заменить элемент с отметкой выполнения или историей теста");
    }
    if (testAttempts && (await testAttempts.hasAnyAttemptForStageItem(item.id))) {
      throw new Error("Нельзя удалить или заменить элемент с отметкой выполнения или историей теста");
    }
  }

  return {
    async assignTemplateToPatient(input: {
      templateId: string;
      patientUserId: string;
      assignedBy: string | null;
    }) {
      assertUuid(input.templateId);
      assertUuid(input.patientUserId);
      if (input.assignedBy) assertUuid(input.assignedBy);

      const existing = await instances.listInstancesForPatient(input.patientUserId.trim());
      if (existing.some((i) => i.status === "active")) {
        throw new Error(SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE);
      }

      const tpl = await templates.getTemplate(input.templateId);
      if (tpl.status !== "published") {
        throw new Error("Назначать можно только опубликованный шаблон");
      }

      const stagesSorted = [...tpl.stages].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      );

      const stageInputs = [];
      const sorted = stagesSorted;
      const hasFsmStage = sorted.some((s) => s.sortOrder > 0);
      const firstFsmStage = hasFsmStage ? sorted.find((s) => s.sortOrder > 0) ?? null : null;

      for (let i = 0; i < sorted.length; i++) {
        const st = sorted[i]!;
        const isZero = isStageZero(st);
        let status: TreatmentProgramInstanceStageStatus;
        if (isZero) {
          status = "available";
        } else if (firstFsmStage) {
          status = st.id === firstFsmStage.id ? "available" : "locked";
        } else {
          status = i === 0 ? "available" : "locked";
        }
        const itemRows = [...st.items].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
        );
        const groupRows = [...(st.groups ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
        );
        const userTplGroups = groupRows.filter((g) => !g.systemKind);
        const tplSysRec = groupRows.find((g) => g.systemKind === "recommendations");
        const tplSysTests = groupRows.find((g) => g.systemKind === "tests");

        const syntheticRec = {
          sourceGroupId: null as string | null,
          title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
          description: null as string | null,
          scheduleText: null as string | null,
          sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
          systemKind: "recommendations" as const,
        };
        const syntheticTests = {
          sourceGroupId: null as string | null,
          title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
          description: null as string | null,
          scheduleText: null as string | null,
          sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
          systemKind: "tests" as const,
        };

        const userGroupInputs = userTplGroups.map((g) => ({
          sourceGroupId: g.id,
          title: g.title,
          description: g.description,
          scheduleText: g.scheduleText,
          sortOrder: g.sortOrder,
        }));

        let groupInputs: Array<{
          sourceGroupId: string | null;
          title: string;
          description: string | null;
          scheduleText: string | null;
          sortOrder: number;
          systemKind?: "recommendations" | "tests" | null;
        }>;

        if (isZero) {
          groupInputs = [...userGroupInputs];
        } else {
          const head: typeof groupInputs = [];
          if (tplSysRec) {
            head.push({
              sourceGroupId: tplSysRec.id,
              title: tplSysRec.title,
              description: tplSysRec.description,
              scheduleText: tplSysRec.scheduleText,
              sortOrder: tplSysRec.sortOrder,
              systemKind: "recommendations",
            });
          } else if (itemRows.some((it) => it.itemType === "recommendation" && it.groupId == null)) {
            head.push(syntheticRec);
          }
          if (tplSysTests) {
            head.push({
              sourceGroupId: tplSysTests.id,
              title: tplSysTests.title,
              description: tplSysTests.description,
              scheduleText: tplSysTests.scheduleText,
              sortOrder: tplSysTests.sortOrder,
              systemKind: "tests",
            });
          } else if (itemRows.some((it) => it.itemType === "test_set" && it.groupId == null)) {
            head.push(syntheticTests);
          }
          groupInputs = [...head, ...userGroupInputs];
        }
        const itemInputs = [];
        for (const it of itemRows) {
          await itemRefs.assertItemRefExists(it.itemType, it.itemRefId);
          const snapshot = await snapshots.buildSnapshot(it.itemType, it.itemRefId);
          itemInputs.push({
            itemType: it.itemType,
            itemRefId: it.itemRefId,
            sortOrder: it.sortOrder,
            comment: it.comment,
            settings: it.settings,
            snapshot,
            isActionable: it.itemType === "recommendation" ? true : null,
            status: "active" as const,
            templateGroupId: it.groupId,
          });
        }
        stageInputs.push({
          sourceStageId: st.id,
          title: st.title,
          description: st.description,
          sortOrder: st.sortOrder,
          status,
          goals: st.goals,
          objectives: st.objectives,
          expectedDurationDays: st.expectedDurationDays,
          expectedDurationText: st.expectedDurationText,
          items: itemInputs,
          groups: groupInputs,
        });
      }

      return instances.createInstanceTree({
        templateId: tpl.id,
        patientUserId: input.patientUserId.trim(),
        assignedBy: input.assignedBy,
        title: tpl.title,
        stages: stageInputs,
      });
    },

    async getInstanceForPatient(patientUserId: string, instanceId: string) {
      assertUuid(patientUserId);
      assertUuid(instanceId);
      const row = await instances.getInstanceForPatient(patientUserId.trim(), instanceId);
      if (!row) throw new Error("Программа не найдена");
      return row;
    },

    async getInstanceById(instanceId: string) {
      assertUuid(instanceId);
      const row = await instances.getInstanceById(instanceId);
      if (!row) throw new Error("Программа не найдена");
      return row;
    },

    async listForPatient(patientUserId: string) {
      assertUuid(patientUserId);
      return instances.listInstancesForPatient(patientUserId.trim());
    },

    async listProgramEvents(instanceId: string) {
      assertUuid(instanceId);
      if (!events) return [];
      return events.listEventsForInstance(instanceId);
    },

    /**
     * §6: сохранение индивидуального комментария элемента.
     * `localComment === null` — сбросить override (снова показывается comment из шаблона).
     */
    async updateStageItemLocalComment(input: {
      instanceId: string;
      stageItemId: string;
      localComment: string | null;
      actorId: string | null;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      if (input.actorId) assertUuid(input.actorId);

      const beforeDetail = await instances.getInstanceById(input.instanceId);
      const beforeItem = beforeDetail?.stages.flatMap((s) => s.items).find((i) => i.id === input.stageItemId);
      const beforeEffective = beforeItem ? effectiveInstanceStageItemComment(beforeItem) : null;

      const row = await instances.updateStageItemLocalComment(
        input.instanceId,
        input.stageItemId,
        input.localComment,
      );
      if (!row) throw new Error("Элемент программы не найден");
      const afterEffective = effectiveInstanceStageItemComment(row);
      if (beforeEffective !== afterEffective) {
        await appendEvent({
          instanceId: input.instanceId,
          actorId: input.actorId,
          eventType: "comment_changed",
          targetType: "stage_item",
          targetId: input.stageItemId,
          payload: { before: beforeEffective, after: afterEffective },
        });
      }
      return row;
    },

    async doctorUpdateInstanceStageMetadata(input: {
      instanceId: string;
      stageId: string;
      actorId: string | null;
      patch: UpdateTreatmentProgramInstanceStageMetadataInput;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.stageId);
      if (input.actorId) assertUuid(input.actorId);

      const detail = await instances.getInstanceById(input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      if (!detail.stages.some((s) => s.id === input.stageId)) throw new Error("Этап не найден");

      const norm: UpdateTreatmentProgramInstanceStageMetadataInput = {};
      if (input.patch.title !== undefined) {
        const t = input.patch.title.trim();
        if (!t) throw new Error("Название этапа не может быть пустым");
        norm.title = t;
      }
      if (input.patch.description !== undefined) {
        norm.description =
          input.patch.description === null ? null : input.patch.description.trim() || null;
      }
      if (input.patch.goals !== undefined) {
        norm.goals = input.patch.goals === null ? null : input.patch.goals.trim() || null;
      }
      if (input.patch.objectives !== undefined) {
        norm.objectives =
          input.patch.objectives === null ? null : input.patch.objectives.trim() || null;
      }
      if (input.patch.expectedDurationText !== undefined) {
        norm.expectedDurationText =
          input.patch.expectedDurationText === null
            ? null
            : input.patch.expectedDurationText.trim() || null;
      }
      if (input.patch.expectedDurationDays !== undefined) {
        const d = input.patch.expectedDurationDays;
        if (d !== null && (!Number.isInteger(d) || d < 0)) {
          throw new Error("Ожидаемый срок в днях должен быть неотрицательным целым числом");
        }
        norm.expectedDurationDays = d;
      }

      if (Object.keys(norm).length === 0) {
        const unchanged = await instances.getInstanceById(input.instanceId);
        if (!unchanged) throw new Error("Программа не найдена");
        return unchanged;
      }

      const updated = await instances.updateInstanceStageMetadata(input.instanceId, input.stageId, norm);
      if (!updated) throw new Error("Этап не найден");
      const out = await instances.getInstanceById(input.instanceId);
      if (!out) throw new Error("Программа не найдена");
      return out;
    },

    async updateInstance(input: {
      instanceId: string;
      title?: string;
      status?: "active" | "completed";
      actorId: string | null;
    }) {
      assertUuid(input.instanceId);
      if (input.actorId) assertUuid(input.actorId);
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название не может быть пустым");
      }
      const prev = await instances.getInstanceById(input.instanceId);
      if (!prev) throw new Error("Программа не найдена");
      const beforeStatus = prev.status;

      const row = await instances.updateInstanceMeta(input.instanceId, {
        title: input.title?.trim(),
        status: input.status,
      });
      if (!row) throw new Error("Программа не найдена");

      if (input.status !== undefined && input.status !== beforeStatus) {
        await appendEvent({
          instanceId: input.instanceId,
          actorId: input.actorId,
          eventType: "status_changed",
          targetType: "program",
          targetId: input.instanceId,
          payload: { scope: "program", from: beforeStatus, to: input.status },
        });
      }
      return row;
    },

    async doctorAddStage(input: {
      instanceId: string;
      actorId: string | null;
      title: string;
      description?: string | null;
      sortOrder?: number;
      status?: TreatmentProgramInstanceStageStatus;
    }) {
      assertUuid(input.instanceId);
      if (input.actorId) assertUuid(input.actorId);
      const t = input.title.trim();
      if (!t) throw new Error("Название этапа не может быть пустым");
      const detail = await instances.getInstanceById(input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      const maxOrder = detail.stages.reduce((m, s) => Math.max(m, s.sortOrder), -1);
      const sortOrder = input.sortOrder ?? maxOrder + 1;
      const stage = await instances.addInstanceStage(input.instanceId, {
        title: t,
        description: input.description ?? null,
        sortOrder,
        status: input.status ?? "locked",
        sourceStageId: null,
      });
      if (!stage) throw new Error("Не удалось добавить этап");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "stage_added",
        targetType: "stage",
        targetId: stage.id,
        payload: { title: stage.title, sortOrder: stage.sortOrder, status: stage.status },
      });
      return stage;
    },

    async doctorRemoveStage(input: { instanceId: string; stageId: string; actorId: string | null }) {
      assertUuid(input.instanceId);
      assertUuid(input.stageId);
      if (input.actorId) assertUuid(input.actorId);
      const st = (await instances.getInstanceById(input.instanceId))?.stages.find((s) => s.id === input.stageId);
      if (!st) throw new Error("Этап не найден");
      for (const it of st.items) {
        await assertStageItemAllowsStructuralChange(it);
      }
      const ok = await instances.removeInstanceStage(input.instanceId, input.stageId);
      if (!ok) throw new Error("Этап не найден");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "stage_removed",
        targetType: "stage",
        targetId: input.stageId,
        payload: { title: st.title, sortOrder: st.sortOrder },
      });
    },

    async doctorAddStageItem(input: {
      instanceId: string;
      stageId: string;
      actorId: string | null;
      itemType: TreatmentProgramItemType;
      itemRefId: string;
      sortOrder?: number;
      comment?: string | null;
      settings?: Record<string, unknown> | null;
      groupId?: string | null;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.stageId);
      assertUuid(input.itemRefId);
      if (input.actorId) assertUuid(input.actorId);
      if (input.groupId) assertUuid(input.groupId);
      await itemRefs.assertItemRefExists(input.itemType, input.itemRefId);
      const snapshot = await snapshots.buildSnapshot(input.itemType, input.itemRefId);
      const detail = await instances.getInstanceById(input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      const stage = detail.stages.find((s) => s.id === input.stageId);
      if (!stage) throw new Error("Этап не найден");
      let resolvedGroupId = input.groupId ?? null;
      if (isStageZero(stage)) {
        if (input.itemType !== "recommendation") {
          throw new Error("На этапе «Общие рекомендации» разрешены только рекомендации");
        }
        if (resolvedGroupId) {
          throw new Error("На этапе «Общие рекомендации» элементы не привязываются к группам");
        }
      } else if (!resolvedGroupId) {
        if (input.itemType === "recommendation" || input.itemType === "test_set") {
          const want = input.itemType === "recommendation" ? "recommendations" : "tests";
          const sg = stage.groups.find((g) => g.systemKind === want);
          if (!sg) throw new Error("Системная группа этапа не найдена");
          resolvedGroupId = sg.id;
        } else {
          throw new Error("Выберите группу для этого типа элемента");
        }
      } else {
        const g = stage.groups.find((gr) => gr.id === resolvedGroupId);
        assertTreatmentProgramStageItemFitsSystemGroup(g, input.itemType);
      }
      const maxOrder = stage.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
      const sortOrder = input.sortOrder ?? maxOrder + 1;
      const row = await instances.addInstanceStageItem(input.instanceId, input.stageId, {
        itemType: input.itemType,
        itemRefId: input.itemRefId,
        sortOrder,
        comment: input.comment ?? null,
        settings: input.settings ?? null,
        snapshot,
        isActionable: input.itemType === "recommendation" ? true : null,
        status: "active",
        groupId: resolvedGroupId,
      });
      if (!row) throw new Error("Не удалось добавить элемент");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "item_added",
        targetType: "stage_item",
        targetId: row.id,
        payload: {
          stageId: input.stageId,
          itemType: row.itemType,
          itemRefId: row.itemRefId,
          sortOrder: row.sortOrder,
        },
      });
      return row;
    },

    async doctorDisableInstanceStageItem(input: {
      instanceId: string;
      itemId: string;
      actorId: string | null;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.itemId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      const item = detail?.stages.flatMap((s) => s.items).find((i) => i.id === input.itemId);
      if (!item) throw new Error("Элемент не найден");
      if (item.status === "disabled") return item;
      if (events) {
        const row = await instances.patchInstanceStageItemWithEvent(
          input.instanceId,
          input.itemId,
          { status: "disabled" },
          buildAppendEventInput({
            instanceId: input.instanceId,
            actorId: input.actorId,
            eventType: "item_disabled",
            targetType: "stage_item",
            targetId: input.itemId,
            payload: { stageId: item.stageId, itemType: item.itemType, itemRefId: item.itemRefId },
          }),
        );
        if (!row) throw new Error("Элемент не найден");
        return row;
      }
      const row = await instances.patchInstanceStageItem(input.instanceId, input.itemId, {
        status: "disabled",
      });
      if (!row) throw new Error("Элемент не найден");
      return row;
    },

    async doctorEnableInstanceStageItem(input: {
      instanceId: string;
      itemId: string;
      actorId: string | null;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.itemId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      const item = detail?.stages.flatMap((s) => s.items).find((i) => i.id === input.itemId);
      if (!item) throw new Error("Элемент не найден");
      if (item.status === "active") return item;
      if (events) {
        const row = await instances.patchInstanceStageItemWithEvent(
          input.instanceId,
          input.itemId,
          { status: "active" },
          buildAppendEventInput({
            instanceId: input.instanceId,
            actorId: input.actorId,
            eventType: "item_enabled",
            targetType: "stage_item",
            targetId: input.itemId,
            payload: { stageId: item.stageId, itemType: item.itemType, itemRefId: item.itemRefId },
          }),
        );
        if (!row) throw new Error("Элемент не найден");
        return row;
      }
      const row = await instances.patchInstanceStageItem(input.instanceId, input.itemId, {
        status: "active",
      });
      if (!row) throw new Error("Элемент не найден");
      return row;
    },

    async doctorSetInstanceStageItemIsActionable(input: {
      instanceId: string;
      itemId: string;
      actorId: string | null;
      isActionable: boolean;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.itemId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      const item = detail?.stages.flatMap((s) => s.items).find((i) => i.id === input.itemId);
      if (!item) throw new Error("Элемент не найден");
      if (item.itemType !== "recommendation") {
        throw new Error("Режим выполнения задаётся только для рекомендаций");
      }
      const row = await instances.patchInstanceStageItem(input.instanceId, input.itemId, {
        isActionable: input.isActionable,
      });
      if (!row) throw new Error("Элемент не найден");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "status_changed",
        targetType: "stage_item",
        targetId: input.itemId,
        payload: {
          scope: "stage_item",
          field: "isActionable",
          value: input.isActionable,
          stageId: item.stageId,
        },
      });
      return row;
    },

    async doctorReplaceStageItem(input: {
      instanceId: string;
      itemId: string;
      actorId: string | null;
      itemType: TreatmentProgramItemType;
      itemRefId: string;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.itemId);
      assertUuid(input.itemRefId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      const prev = detail?.stages.flatMap((s) => s.items).find((i) => i.id === input.itemId) as
        | TreatmentProgramInstanceStageItemRow
        | undefined;
      if (!prev) throw new Error("Элемент не найден");
      await assertStageItemAllowsStructuralChange(prev);
      await itemRefs.assertItemRefExists(input.itemType, input.itemRefId);
      const snapshot = await snapshots.buildSnapshot(input.itemType, input.itemRefId);
      const row = await instances.replaceInstanceStageItem(input.instanceId, input.itemId, {
        itemType: input.itemType,
        itemRefId: input.itemRefId,
        snapshot,
      });
      if (!row) throw new Error("Не удалось заменить элемент");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "item_replaced",
        targetType: "stage_item",
        targetId: row.id,
        payload: {
          stageId: prev.stageId,
          before: { itemType: prev.itemType, itemRefId: prev.itemRefId },
          after: { itemType: row.itemType, itemRefId: row.itemRefId },
        },
      });
      return row;
    },

    async doctorReorderStages(input: {
      instanceId: string;
      actorId: string | null;
      orderedStageIds: string[];
    }) {
      assertUuid(input.instanceId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      for (const id of input.orderedStageIds) assertUuid(id);
      const ok = await instances.reorderInstanceStages(input.instanceId, input.orderedStageIds);
      if (!ok) throw new Error("Некорректный порядок этапов");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "status_changed",
        targetType: "program",
        targetId: input.instanceId,
        payload: { scope: "stages_reordered", orderedStageIds: input.orderedStageIds },
      });
    },

    async doctorReorderStageItems(input: {
      instanceId: string;
      stageId: string;
      actorId: string | null;
      orderedItemIds: string[];
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.stageId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      if (!detail.stages.some((s) => s.id === input.stageId)) throw new Error("Этап не найден");
      for (const id of input.orderedItemIds) assertUuid(id);
      const ok = await instances.reorderInstanceStageItems(
        input.instanceId,
        input.stageId,
        input.orderedItemIds,
      );
      if (!ok) throw new Error("Некорректный порядок элементов этапа");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "status_changed",
        targetType: "stage",
        targetId: input.stageId,
        payload: { scope: "stage_items_reordered", orderedItemIds: input.orderedItemIds },
      });
    },

    async doctorCreateInstanceStageGroup(input: {
      instanceId: string;
      stageId: string;
      actorId: string | null;
      title: string;
      description?: string | null;
      scheduleText?: string | null;
      sortOrder?: number;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.stageId);
      if (input.actorId) assertUuid(input.actorId);
      const title = input.title.trim();
      if (!title) throw new Error("Название группы не может быть пустым");
      const detail = await instances.getInstanceById(input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      if (!detail.stages.some((s) => s.id === input.stageId)) throw new Error("Этап не найден");
      const payload: CreateTreatmentProgramInstanceStageGroupInput = {
        title,
        description: input.description === undefined ? undefined : input.description?.trim() ?? null,
        scheduleText: input.scheduleText === undefined ? undefined : input.scheduleText?.trim() ?? null,
        sortOrder: input.sortOrder,
      };
      const row = await instances.createInstanceStageGroup(input.instanceId, input.stageId, payload);
      if (!row) throw new Error("Не удалось добавить группу");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "status_changed",
        targetType: "stage",
        targetId: input.stageId,
        payload: { scope: "stage_group_added", groupId: row.id, title: row.title },
      });
      return row;
    },

    async doctorUpdateInstanceStageGroup(input: {
      instanceId: string;
      groupId: string;
      actorId: string | null;
      patch: UpdateTreatmentProgramInstanceStageGroupInput;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.groupId);
      if (input.actorId) assertUuid(input.actorId);
      const detailGuard = await instances.getInstanceById(input.instanceId);
      const grpGuard = detailGuard?.stages.flatMap((s) => s.groups).find((gr) => gr.id === input.groupId);
      const isSystemGroup =
        grpGuard?.systemKind === "recommendations" || grpGuard?.systemKind === "tests";
      if (isSystemGroup && input.patch.title !== undefined) {
        throw new Error("Нельзя менять название системной группы");
      }
      if (isSystemGroup && input.patch.sortOrder !== undefined) {
        throw new Error("Нельзя менять порядок системной группы");
      }
      const norm: UpdateTreatmentProgramInstanceStageGroupInput = {};
      if (input.patch.title !== undefined && !isSystemGroup) {
        const t = input.patch.title.trim();
        if (!t) throw new Error("Название группы не может быть пустым");
        norm.title = t;
      }
      if (input.patch.description !== undefined && !isSystemGroup) {
        norm.description = input.patch.description === null ? null : input.patch.description.trim() || null;
      }
      if (input.patch.scheduleText !== undefined && !isSystemGroup) {
        norm.scheduleText =
          input.patch.scheduleText === null ? null : input.patch.scheduleText.trim() || null;
      }
      if (input.patch.sortOrder !== undefined && !isSystemGroup) norm.sortOrder = input.patch.sortOrder;
      if (Object.keys(norm).length === 0) {
        const d = await instances.getInstanceById(input.instanceId);
        const g = d?.stages.flatMap((s) => s.groups).find((gr) => gr.id === input.groupId);
        if (!g) throw new Error("Группа не найдена");
        return g;
      }
      const row = await instances.updateInstanceStageGroup(input.instanceId, input.groupId, norm);
      if (!row) throw new Error("Группа не найдена");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "status_changed",
        targetType: "stage",
        targetId: row.stageId,
        payload: { scope: "stage_group_updated", groupId: row.id },
      });
      return row;
    },

    async doctorDeleteInstanceStageGroup(input: {
      instanceId: string;
      groupId: string;
      actorId: string | null;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.groupId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      const gr = detail?.stages.flatMap((s) => s.groups).find((g) => g.id === input.groupId);
      if (!gr) throw new Error("Группа не найдена");
      if (gr.systemKind === "recommendations" || gr.systemKind === "tests") {
        throw new Error("Системную группу нельзя удалить");
      }
      const ok = await instances.deleteInstanceStageGroup(input.instanceId, input.groupId);
      if (!ok) throw new Error("Группа не найдена");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "status_changed",
        targetType: "stage",
        targetId: gr.stageId,
        payload: { scope: "stage_group_removed", groupId: input.groupId, title: gr.title },
      });
    },

    async doctorHideInstanceStageGroup(
      this: {
        doctorDisableInstanceStageItem: (input: {
          instanceId: string;
          itemId: string;
          actorId: string | null;
        }) => Promise<TreatmentProgramInstanceStageItemRow>;
        doctorDeleteInstanceStageGroup: (input: {
          instanceId: string;
          groupId: string;
          actorId: string | null;
        }) => Promise<void>;
      },
      input: { instanceId: string; groupId: string; actorId: string | null },
    ) {
      assertUuid(input.instanceId);
      assertUuid(input.groupId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      const gr = detail?.stages.flatMap((s) => s.groups).find((g) => g.id === input.groupId);
      if (!gr) throw new Error("Группа не найдена");
      if (gr.systemKind === "recommendations" || gr.systemKind === "tests") {
        throw new Error("Системную группу нельзя скрыть");
      }
      const itemsInGroup = detail!.stages.flatMap((s) => s.items).filter((it) => it.groupId === input.groupId);
      for (const it of itemsInGroup) {
        if (it.status === "active") {
          await this.doctorDisableInstanceStageItem({
            instanceId: input.instanceId,
            itemId: it.id,
            actorId: input.actorId,
          });
        }
      }
      await this.doctorDeleteInstanceStageGroup({
        instanceId: input.instanceId,
        groupId: input.groupId,
        actorId: input.actorId,
      });
    },

    async doctorReorderInstanceStageGroups(input: {
      instanceId: string;
      stageId: string;
      actorId: string | null;
      orderedGroupIds: string[];
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.stageId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      if (!detail.stages.some((s) => s.id === input.stageId)) throw new Error("Этап не найден");
      for (const id of input.orderedGroupIds) assertUuid(id);
      const ok = await instances.reorderInstanceStageGroups(
        input.instanceId,
        input.stageId,
        input.orderedGroupIds,
      );
      if (!ok) throw new Error("Некорректный порядок групп этапа");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "status_changed",
        targetType: "stage",
        targetId: input.stageId,
        payload: { scope: "stage_groups_reordered", orderedGroupIds: input.orderedGroupIds },
      });
    },

    async doctorSetInstanceStageItemGroup(input: {
      instanceId: string;
      itemId: string;
      groupId: string | null;
      actorId: string | null;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.itemId);
      if (input.actorId) assertUuid(input.actorId);
      if (input.groupId) assertUuid(input.groupId);
      const detail = await instances.getInstanceById(input.instanceId);
      const item = detail?.stages.flatMap((s) => s.items).find((i) => i.id === input.itemId);
      if (!item) throw new Error("Элемент не найден");
      const stage = detail!.stages.find((s) => s.id === item.stageId);
      if (!stage) throw new Error("Этап не найден");
      let nextGroupId: string | null = input.groupId ?? null;
      if (isStageZero(stage)) {
        if (item.itemType !== "recommendation") {
          throw new Error("На этапе «Общие рекомендации» разрешены только рекомендации");
        }
        if (input.groupId != null) {
          throw new Error("На этапе «Общие рекомендации» элементы не привязываются к группам");
        }
        nextGroupId = null;
      } else if (!nextGroupId) {
        if (item.itemType === "recommendation" || item.itemType === "test_set") {
          const want = item.itemType === "recommendation" ? "recommendations" : "tests";
          const sg = stage.groups.find((g) => g.systemKind === want);
          if (!sg) throw new Error("Системная группа этапа не найдена");
          nextGroupId = sg.id;
        } else {
          throw new Error("Выберите группу для этого типа элемента");
        }
      } else {
        const g = stage.groups.find((gr) => gr.id === nextGroupId);
        assertTreatmentProgramStageItemFitsSystemGroup(g, item.itemType);
      }
      const row = await instances.patchInstanceStageItem(input.instanceId, input.itemId, {
        groupId: nextGroupId,
      });
      if (!row) throw new Error("Элемент не найден");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "status_changed",
        targetType: "stage_item",
        targetId: input.itemId,
        payload: {
          scope: "stage_item_group_changed",
          stageId: item.stageId,
          groupId: nextGroupId,
        },
      });
      return row;
    },

    async patientRecordPlanOpened(input: {
      patientUserId: string;
      instanceId: string;
    }): Promise<{ recorded: boolean }> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      const d = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!d) throw new Error("Программа не найдена");
      if (d.status !== "active") return { recorded: false };
      await instances.touchPatientPlanLastOpenedAt(input.patientUserId, input.instanceId);
      return { recorded: true };
    },

    async patientMarkStageItemViewedIfNever(input: {
      patientUserId: string;
      instanceId: string;
      stageItemId: string;
    }): Promise<{ updated: boolean }> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      assertUuid(input.stageItemId);
      const d = await instances.getInstanceForPatient(input.patientUserId, input.instanceId);
      if (!d) throw new Error("Программа не найдена");
      const hit = d.stages.flatMap((s) => s.items).find((i) => i.id === input.stageItemId);
      if (!hit) throw new Error("Элемент не найден");
      if (hit.status !== "active") return { updated: false };
      return instances.markStageItemViewedIfNever(input.patientUserId, input.instanceId, input.stageItemId);
    },

    async patientPlanUpdatedBadgeForInstance(input: {
      patientUserId: string;
      instanceId: string;
    }): Promise<{ show: boolean; eventIso: string | null }> {
      assertUuid(input.patientUserId);
      assertUuid(input.instanceId);
      if (!events) return { show: false, eventIso: null };
      const sums = await instances.listInstancesForPatient(input.patientUserId);
      const inst = sums.find((s) => s.id === input.instanceId && s.status === "active");
      if (!inst) return { show: false, eventIso: null };
      const maxAt = await events.getMaxPlanMutationEventCreatedAt(input.instanceId);
      if (!maxAt) return { show: false, eventIso: null };
      const baseline = inst.patientPlanLastOpenedAt ?? inst.createdAt;
      if (maxAt <= baseline) return { show: false, eventIso: null };
      return { show: true, eventIso: maxAt };
    },

    async listTreatmentProgramLfkBlocksForIntegratorPatient(
      patientUserId: string,
    ): Promise<TreatmentProgramIntegratorLfkBlock[]> {
      assertUuid(patientUserId);
      const summaries = await instances.listInstancesForPatient(patientUserId.trim());
      const blocks: TreatmentProgramIntegratorLfkBlock[] = [];
      for (const summ of summaries) {
        if (summ.status !== "active") continue;
        const detail = await instances.getInstanceById(summ.id);
        if (!detail) continue;
        for (const st of detail.stages) {
          for (const it of st.items) {
            if (it.status === "disabled") continue;
            if (it.itemType !== "lfk_complex") continue;
            const snap = it.snapshot;
            const title =
              typeof snap.title === "string" && snap.title.trim() ? snap.title.trim() : null;
            blocks.push({
              instanceId: detail.id,
              instanceStatus: detail.status,
              stageId: st.id,
              stageTitle: st.title,
              stageItemId: it.id,
              lfkComplexId: it.itemRefId,
              lfkComplexTitle: title,
            });
          }
        }
      }
      return blocks;
    },
  };
}

export type TreatmentProgramInstanceAppService = ReturnType<typeof createTreatmentProgramInstanceService>;
