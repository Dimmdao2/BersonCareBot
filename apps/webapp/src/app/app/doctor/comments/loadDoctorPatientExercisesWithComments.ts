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
import { pickActivePlanInstance } from '@/modules/treatment-program/pickActivePlanInstance';
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceSummary,
  TreatmentProgramInstanceStageStatus,
} from '@/modules/treatment-program/types';
import type {
  ProgramItemDiscussionMessage,
  StageItemViewerUnreadCount,
} from '@/modules/program-item-discussion/types';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { formatCommentDateRu } from '../doctorTodayFormat';
import {
  DISCUSSION_LATEST_MESSAGE_SCAN_LIMIT,
  pickLatestPatientFacingMessage,
} from '../pickLatestPatientFacingMessage';
import { firstSnapshotMedia, type ExerciseCommentThumbMedia } from './exerciseCommentThumb';

/** Строка упражнения в drill-down правом пейне. */
export type ExerciseCommentItem = {
  stageItemId: string;
  stageId: string;
  /** Заголовок упражнения из snapshot. */
  title: string;
  /** Первый медиа-элемент снимка для миниатюры (или null). */
  thumb: ExerciseCommentThumbMedia | null;
  /** Всего сообщений пациента. */
  totalComments: number;
  /** Непрочитанных врачом. */
  unreadComments: number;
  /** ISO дата последнего комментария (для сортировки). */
  latestCommentAt: string | null;
  /**
   * Последнее сообщение треда, показываемое в строке списка: комментарий пациента, если он
   * есть в просмотренном окне, иначе последнее сообщение треда. Тот же выбор, что в KPI
   * «Сегодня», — строка комментариев у обоих входов одна.
   */
  latestMessage: ProgramItemDiscussionMessage | null;
  /** Локализованная подпись даты последнего сообщения для строки списка. */
  latestMessageAtLabel: string;
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
  'in_progress',
  'available',
]);

function stageItemTitle(snapshot: Record<string, unknown>): string {
  const raw = snapshot.title;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'Упражнение';
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
    listMessagesPage(input: {
      stageItemId: string;
      limit: number;
      direction: 'backward' | 'forward';
      cursor: null;
    }): Promise<ProgramItemDiscussionMessage[]>;
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
  context: { patientUserId: string; viewerUserId: string; organizationId?: string },
  options?: { includePastPrograms?: boolean },
): Promise<PatientExercisesWithCommentsResult | null> {
  const { patientUserId, viewerUserId } = context;
  const includePast = options?.includePastPrograms ?? false;

  const allInstances =
    await deps.treatmentProgramInstance.listForPatientClinicalView(patientUserId);
  const instances = context.organizationId
    ? allInstances.filter((instance) => instance.organizationId === context.organizationId)
    : allInstances;
  if (instances.length === 0) return null;

  // Select which instance(s) to aggregate
  let targetInstance = pickActivePlanInstance(instances);
  if (!targetInstance) {
    if (!includePast) return null;
    // Use most recently updated as fallback
    targetInstance =
      [...instances].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }
  if (!targetInstance) return null;

  const detail = await deps.treatmentProgramInstance.getInstanceById(targetInstance.id);
  if (context.organizationId && detail.organizationId !== context.organizationId) return null;

  // Collect all exercise stageItems (all stages, all statuses)
  const allExerciseItems = detail.stages.flatMap((stage) =>
    stage.items.filter((item) => item.itemType === 'exercise').map((item) => ({ ...item, stage })),
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

  // Превью строки — последнее сообщение треда, тем же правилом, что и в KPI «Сегодня».
  // Окно берём только по упражнениям, которые реально попадут в список.
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  const latestMessageEntries = await Promise.all(
    itemsWithComments.map(async (item) => {
      const page = await deps.programItemDiscussion.listMessagesPage({
        stageItemId: item.id,
        limit: DISCUSSION_LATEST_MESSAGE_SCAN_LIMIT,
        direction: 'backward',
        cursor: null,
      });
      return [item.id, pickLatestPatientFacingMessage(page)] as const;
    }),
  );
  const latestMessageByStageItemId = new Map(latestMessageEntries);

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
    const latestMessage = latestMessageByStageItemId.get(item.id) ?? null;
    const latestMessageAt = latestMessage?.createdAt ?? counts.latestMessageAt;
    const exerciseItem: ExerciseCommentItem = {
      stageItemId: item.id,
      stageId: item.stage.id,
      title: stageItemTitle(item.snapshot),
      thumb: firstSnapshotMedia(item.snapshot),
      totalComments: counts.total,
      unreadComments: counts.unread,
      latestCommentAt: counts.latestMessageAt,
      latestMessage,
      latestMessageAtLabel: latestMessageAt
        ? formatCommentDateRu(latestMessageAt, appDisplayTimeZone)
        : '',
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
  const stageSortOrderById = new Map<string, number>(detail.stages.map((s) => [s.id, s.sortOrder]));

  const activeGroups = rawGroups
    .filter((g) => ACTIVE_STAGE_STATUSES.has(g.stageStatus))
    .sort(
      (a, b) => (stageSortOrderById.get(a.stageId) ?? 0) - (stageSortOrderById.get(b.stageId) ?? 0),
    );

  const closedGroups = rawGroups
    .filter((g) => !ACTIVE_STAGE_STATUSES.has(g.stageStatus))
    .sort(
      (a, b) => (stageSortOrderById.get(a.stageId) ?? 0) - (stageSortOrderById.get(b.stageId) ?? 0),
    );

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
