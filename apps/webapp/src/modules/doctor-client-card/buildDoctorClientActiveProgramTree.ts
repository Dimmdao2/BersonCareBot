import {
  isStageZero,
  selectCurrentWorkingStageForPatientDetail,
  sortDoctorInstanceStageGroupsForDisplay,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import type { DoctorClientActiveProgramTreeModel } from "./types";

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t.trim();
  return itemType;
}

function activeItemsForStage(stage: TreatmentProgramInstanceDetail["stages"][number]) {
  return [...stage.items]
    .filter((i) => i.status === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Read-only дерево активной программы для таба «Программа» в карточке клиента. */
export function buildDoctorClientActiveProgramTree(
  detail: TreatmentProgramInstanceDetail,
): DoctorClientActiveProgramTreeModel | null {
  if (detail.status !== "active") return null;

  const { stageZero, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
  const working = selectCurrentWorkingStageForPatientDetail(pipeline);
  const defaultExpandedStageId =
    working?.id ??
    stageZero.find((s) => activeItemsForStage(s).length > 0)?.id ??
    pipeline.find((s) => activeItemsForStage(s).length > 0)?.id ??
    null;

  const mapStage = (stage: TreatmentProgramInstanceDetail["stages"][number]) => {
    const activeItems = activeItemsForStage(stage);
    if (activeItems.length === 0) return null;

    const groupsById = new Map(stage.groups.map((g) => [g.id, g]));
    const sortedGroups = sortDoctorInstanceStageGroupsForDisplay(stage.groups);

    const groups = sortedGroups
      .map((g) => {
        const items = activeItems
          .filter((it) => it.groupId === g.id)
          .map((it) => ({
            id: it.id,
            title: snapshotTitle(it.snapshot, it.itemType),
            itemType: it.itemType,
            isNew: it.lastViewedAt == null,
          }));
        if (items.length === 0) return null;
        const title = g.title?.trim();
        return {
          id: g.id,
          title: title !== undefined && title !== "" ? title : null,
          items,
        };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);

    const ungrouped = activeItems
      .filter((it) => !it.groupId || !groupsById.has(it.groupId))
      .map((it) => ({
        id: it.id,
        title: snapshotTitle(it.snapshot, it.itemType),
        itemType: it.itemType,
        isNew: it.lastViewedAt == null,
      }));

    const stageTitle = stage.title?.trim();
    return {
      id: stage.id,
      title:
        isStageZero(stage)
          ? stageTitle !== undefined && stageTitle !== ""
            ? stageTitle
            : "Общие рекомендации"
          : stageTitle !== undefined && stageTitle !== ""
            ? stageTitle
            : "Этап",
      status: stage.status,
      groups,
      ungroupedItems: ungrouped,
    };
  };

  const stageZeroBlocks = stageZero.map(mapStage).filter((s): s is NonNullable<typeof s> => s !== null);
  const pipelineBlocks = pipeline.map(mapStage).filter((s): s is NonNullable<typeof s> => s !== null);
  const stages = [...stageZeroBlocks, ...pipelineBlocks];

  if (stages.length === 0) return null;

  return {
    instanceId: detail.id,
    instanceTitle: detail.title,
    defaultExpandedStageId,
    stages,
  };
}
