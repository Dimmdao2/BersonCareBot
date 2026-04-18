import type {
  TreatmentProgramEventsPort,
  TreatmentProgramInstancePort,
  TreatmentProgramItemRefValidationPort,
  TreatmentProgramItemSnapshotPort,
  TreatmentProgramTestAttemptsPort,
} from "./ports";
import { buildAppendEventInput, normalizeEventReason } from "./event-recording";
import type { TreatmentProgramService } from "./service";
import { assertUuid } from "./service";
import type { TreatmentProgramInstanceStageStatus } from "./types";
import {
  effectiveInstanceStageItemComment,
  type TreatmentProgramInstanceStageItemRow,
  type TreatmentProgramIntegratorLfkBlock,
  type TreatmentProgramItemType,
} from "./types";

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

      const tpl = await templates.getTemplate(input.templateId);
      if (tpl.status !== "published") {
        throw new Error("Назначать можно только опубликованный шаблон");
      }

      const stagesSorted = [...tpl.stages].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      );

      const stageInputs = [];
      for (let i = 0; i < stagesSorted.length; i++) {
        const st = stagesSorted[i]!;
        const status = i === 0 ? ("available" as const) : ("locked" as const);
        const itemRows = [...st.items].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
        );
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
          });
        }
        stageInputs.push({
          sourceStageId: st.id,
          title: st.title,
          description: st.description,
          sortOrder: st.sortOrder,
          status,
          items: itemInputs,
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
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.stageId);
      assertUuid(input.itemRefId);
      if (input.actorId) assertUuid(input.actorId);
      await itemRefs.assertItemRefExists(input.itemType, input.itemRefId);
      const snapshot = await snapshots.buildSnapshot(input.itemType, input.itemRefId);
      const detail = await instances.getInstanceById(input.instanceId);
      if (!detail) throw new Error("Программа не найдена");
      const stage = detail.stages.find((s) => s.id === input.stageId);
      if (!stage) throw new Error("Этап не найден");
      const maxOrder = stage.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
      const sortOrder = input.sortOrder ?? maxOrder + 1;
      const row = await instances.addInstanceStageItem(input.instanceId, input.stageId, {
        itemType: input.itemType,
        itemRefId: input.itemRefId,
        sortOrder,
        comment: input.comment ?? null,
        settings: input.settings ?? null,
        snapshot,
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

    async doctorRemoveStageItem(input: {
      instanceId: string;
      itemId: string;
      actorId: string | null;
      reason: string;
    }) {
      assertUuid(input.instanceId);
      assertUuid(input.itemId);
      if (input.actorId) assertUuid(input.actorId);
      const detail = await instances.getInstanceById(input.instanceId);
      const item = detail?.stages.flatMap((s) => s.items).find((i) => i.id === input.itemId);
      if (!item) throw new Error("Элемент не найден");
      await assertStageItemAllowsStructuralChange(item);
      const reason = normalizeEventReason("item_removed", input.reason);
      const ok = await instances.removeInstanceStageItem(input.instanceId, input.itemId);
      if (!ok) throw new Error("Элемент не найден");
      await appendEvent({
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: "item_removed",
        targetType: "stage_item",
        targetId: input.itemId,
        reason,
        payload: {
          stageId: item.stageId,
          itemType: item.itemType,
          itemRefId: item.itemRefId,
        },
      });
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
