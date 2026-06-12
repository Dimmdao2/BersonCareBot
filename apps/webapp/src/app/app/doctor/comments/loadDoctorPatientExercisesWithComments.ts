/**
 * Загрузчик «упражнения пациента с комментариями, сгруппированные по этапам».
 *
 * Используется в правом пейне state-B drill-down вкладки «Комментарии» (пациент выбран).
 * Возвращает упражнения с комментариями из активной программы пациента,
 * сгруппированные по этапам (активный сверху, закрытые — отдельные группы).
 *
 * ——— Покрытие этапов ———
 * В отличие от `loadDoctorExerciseCommentAttention` (берёт только active items),
 * этот загрузчик обходит ВСЕ этапы (любой status) и ВСЕ items (active + disabled),
 * потому что в state B нужно показывать историю комментариев к любому упражнению.
 *
 * ——— Прошлые программы ———
 * Параметр `includePastPrograms` (по умолчанию false) — только активная программа.
 * Семантика: активная = `status === "active"`. Если активных нет — загрузчик вернёт
 * пустой результат. Загрузка прошлых программ — опциональный вторичный путь
 * (зафиксировано как развилка в LOG.md, не реализован в основном потоке).
 *
 * ——— Бейдж «всего / новых» ———
 * - `total`  = все сообщения пациента по упражнению.
 * - `unread` = сообщения после lastReadAt врача (или все, если не читал).
 * Вычисляется через `listUnreadCountsForViewerByStageItems` (batch).
 *
 * ——— Сортировка упражнений ———
 * Внутри каждого этапа — по дате последнего комментария DESC (новые сверху).
 * Упражнения без комментариев НЕ включаются в результат.
 *
 * ——— Порядок групп этапов ———
 * Активные этапы (status `in_progress` | `available`) — сверху.
 * Завершённые и пропущенные этапы (`completed` | `skipped` | `locked`) — ниже, свёрнуты.
 */
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceSummary,
  TreatmentProgramInstanceStageStatus,
} from "@/modules/treatment-program/types";
import type { StageItemViewerUnreadCount } from "@/modules/program-item-discussion/types";

/** Превью-миниатюра упражнения (из snapshot). */
export type ExerciseCommentThumb = {
  mediaFileId: string | null;
  /** URL превью (если есть в snapshot). */
  snapshotPreviewUrl: string | null;
};

/** Строка упражнения в drill-down правом пейне. */
export type ExerciseCommentItem = {
  stageItemId: string;
  stageId: string;
  /** Заголовок упражнения из snapshot. */
  title: string;
  /** Данные миниатюры. */
  thumb: ExerciseCommentThumb;
  /** Всего сообщений пациента. */
  totalComments: number;
  /** Непрочитанных врачом. */
  unreadComments: number;
  /** ISO дата последнего комментария (для сортировки). */
  latestCommentAt: string | null;
};

/** Группа по этапу. */
export type ExerciseCommentStageGroup = {
  stageId: string;
  stageTitle: string;
  stageStatus: TreatmentProgramInstanceStageStatus;
  /** Этап «активный» (in_progress или available) — показывать раскрытым сверху. */
  isActive: boolean;
  /** Упражнения, отсортированные по latestCommentAt DESC. */
  exercises: ExerciseCommentItem[];
};

/** Результат загрузчика. */
export type PatientExercisesWithCommentsResult = {
  patientUserId: string;
  instanceId: string;
  instanceTitle: string;
  groups: ExerciseCommentStageGroup[];
  /** Итого упражнений с комментариями. */
  totalExercisesWithComments: number;
  /** Итого непрочитанных сообщений (суммарно по всем упражнениям). */
  totalUnreadComments: number;
};

const ACTIVE_STAGE_STATUSES = new Set<TreatmentProgramInstanceStageStatus>([
  "in_progress",
  "available",
]);

function stageItemTitle(snapshot: Record<string, unknown>): string {
  const raw = snapshot.title;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "Упражнение";
}

function stageItemThumb(
  snapshot: Record<string, unknown>,
  mediaFileId: string | null,
): ExerciseCommentThumb {
  const previewUrl =
    typeof snapshot.previewSmUrl === "string" ? snapshot.previewSmUrl :
    typeof snapshot.mediaUrl === "string" ? snapshot.mediaUrl : null;
  return { mediaFileId, snapshotPreviewUrl: previewUrl };
}

export type LoadDoctorPatientExercisesWithCommentsDeps = {
  treatmentProgramInstance: {
    listForPatientClinicalView(patientUserId: string): Promise<TreatmentProgramInstanceSummary[]>;
    getInstanceById(instanceId: string): Promise<TreatmentProgramInstanceDetail>;
  };
  programItemDiscussion: {
    listUnreadCountsForViewerByStageItems(input: {
      stageItemIds: string[];
      viewerUserId: string;
    }): Promise<StageItemViewerUnreadCount[]>;
  };
};

/**
 * Загружает упражнения пациента с комментариями, сгруппированные по этапам.
 *
 * @param deps - зависимости (ports)
 * @param context - patientUserId, viewerUserId = userId врача
 * @param options - includePastPrograms (default false)
 */
export async function loadDoctorPatientExercisesWithComments(
  deps: LoadDoctorPatientExercisesWithCommentsDeps,
  context: { patientUserId: string; viewerUserId: string },
  options?: { includePastPrograms?: boolean },
): Promise<PatientExercisesWithCommentsResult | null> {
  const { patientUserId, viewerUserId } = context;
  const includePast = options?.includePastPrograms ?? false;

  const instances = await deps.treatmentProgramInstance.listForPatientClinicalView(patientUserId);
  if (instances.length === 0) return null;

  // Select which instance(s) to aggregate
  let targetInstance = pickActivePlanInstance(instances);
  if (!targetInstance) {
    if (!includePast) return null;
    // Use most recently updated as fallback
    targetInstance = [...instances].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }
  if (!targetInstance) return null;

  const detail = await deps.treatmentProgramInstance.getInstanceById(targetInstance.id);

  // Collect all exercise stageItems (all stages, all statuses)
  const allExerciseItems = detail.stages.flatMap((stage) =>
    stage.items
      .filter((item) => item.itemType === "exercise")
      .map((item) => ({ ...item, stage })),
  );

  if (allExerciseItems.length === 0) {
    return {
      patientUserId,
      instanceId: detail.id,
      instanceTitle: detail.title,
      groups: [],
      totalExercisesWithComments: 0,
      totalUnreadComments: 0,
    };
  }

  // Batch fetch total/unread counts
  const stageItemIds = allExerciseItems.map((i) => i.id);
  const unreadCounts = await deps.programItemDiscussion.listUnreadCountsForViewerByStageItems({
    stageItemIds,
    viewerUserId,
  });

  const unreadMap = new Map<string, StageItemViewerUnreadCount>(
    unreadCounts.map((r) => [r.stageItemId, r]),
  );

  // Filter to only exercises with at least 1 comment
  const itemsWithComments = allExerciseItems.filter((item) => {
    const counts = unreadMap.get(item.id);
    return counts !== undefined && counts.total > 0;
  });

  // Group by stage
  const stageGroupMap = new Map<
    string,
    {
      stageId: string;
      stageTitle: string;
      stageStatus: TreatmentProgramInstanceStageStatus;
      exercises: ExerciseCommentItem[];
    }
  >();

  for (const item of itemsWithComments) {
    const counts = unreadMap.get(item.id)!;
    const exerciseItem: ExerciseCommentItem = {
      stageItemId: item.id,
      stageId: item.stage.id,
      title: stageItemTitle(item.snapshot),
      thumb: stageItemThumb(item.snapshot, null), // mediaFileId not in stageItem row directly
      totalComments: counts.total,
      unreadComments: counts.unread,
      latestCommentAt: counts.latestMessageAt,
    };

    const stageId = item.stage.id;
    if (!stageGroupMap.has(stageId)) {
      stageGroupMap.set(stageId, {
        stageId,
        stageTitle: item.stage.title,
        stageStatus: item.stage.status,
        exercises: [],
      });
    }
    stageGroupMap.get(stageId)!.exercises.push(exerciseItem);
  }

  // Sort exercises within each group by latestCommentAt DESC (nulls last)
  for (const group of stageGroupMap.values()) {
    group.exercises.sort((a, b) => {
      if (!a.latestCommentAt && !b.latestCommentAt) return 0;
      if (!a.latestCommentAt) return 1;
      if (!b.latestCommentAt) return -1;
      return b.latestCommentAt.localeCompare(a.latestCommentAt);
    });
  }

  // Build stage groups, sort: active stages first (by sortOrder), then closed
  const rawGroups = [...stageGroupMap.values()];

  // Map stage sortOrder from detail
  const stageSortOrderById = new Map<string, number>(
    detail.stages.map((s) => [s.id, s.sortOrder]),
  );

  const activeGroups = rawGroups
    .filter((g) => ACTIVE_STAGE_STATUSES.has(g.stageStatus))
    .sort((a, b) => (stageSortOrderById.get(a.stageId) ?? 0) - (stageSortOrderById.get(b.stageId) ?? 0));

  const closedGroups = rawGroups
    .filter((g) => !ACTIVE_STAGE_STATUSES.has(g.stageStatus))
    .sort((a, b) => (stageSortOrderById.get(a.stageId) ?? 0) - (stageSortOrderById.get(b.stageId) ?? 0));

  const groups: ExerciseCommentStageGroup[] = [
    ...activeGroups.map((g) => ({ ...g, isActive: true })),
    ...closedGroups.map((g) => ({ ...g, isActive: false })),
  ];

  const totalExercisesWithComments = itemsWithComments.length;
  const totalUnreadComments = [...unreadMap.values()].reduce((sum, r) => sum + r.unread, 0);

  return {
    patientUserId,
    instanceId: detail.id,
    instanceTitle: detail.title,
    groups,
    totalExercisesWithComments,
    totalUnreadComments,
  };
}
