/**
 * Загрузчик непрочитанных комментариев для таба «Коммуникации → Комментарии».
 *
 * В отличие от `loadDoctorExerciseCommentAttention` (фан-аут по пациентам, используется «Сегодня»),
 * этот загрузчик делает ОДИН doctor-wide запрос через новый метод порта.
 * On-support список резолвится здесь же; порт получает готовый массив patient_user_id.
 *
 * См. TODO#3 Block 2 в communications.md и .cursor/plans/doctor_communications_client_shell.plan.md.
 */
import type { DoctorClientsFilters } from "@/modules/doctor-clients/ports";
import type {
  DoctorExerciseCommentCursor,
  DoctorExerciseCommentRow,
  ListDoctorExerciseCommentsInput,
} from "@/modules/program-item-discussion/types";
import type { TodayExerciseCommentAttentionItem } from "../loadDoctorExerciseCommentAttention";
import { formatDateTimeRu } from "../doctorTodayFormat";
import { doctorClientTreatmentProgramInstanceHref } from "../clients/doctorClientInstanceHref";

export const DOCTOR_EXERCISE_COMMENTS_TAB_PAGE_SIZE = 50;

export type LoadDoctorExerciseCommentsForTabDeps = {
  doctorClientsPort: {
    listClients(
      filters: Pick<DoctorClientsFilters, "supportStatus">,
      audience?: { excludedUserIds?: string[] },
    ): Promise<Array<{ userId: string; displayName: string }>>;
  };
  programItemDiscussion: {
    listUnreadExerciseCommentsForDoctor(
      input: ListDoctorExerciseCommentsInput,
    ): Promise<DoctorExerciseCommentRow[]>;
  };
};

export async function loadDoctorExerciseCommentsForTab(
  deps: LoadDoctorExerciseCommentsForTabDeps,
  context: { viewerUserId: string; excludedUserIds?: string[] },
  options?: { limit?: number; cursor?: DoctorExerciseCommentCursor | null },
): Promise<{
  items: TodayExerciseCommentAttentionItem[];
  nextCursor: DoctorExerciseCommentCursor | null;
  hasMore: boolean;
}> {
  const limit = options?.limit ?? DOCTOR_EXERCISE_COMMENTS_TAB_PAGE_SIZE;
  const audience =
    context.excludedUserIds?.length
      ? { excludedUserIds: context.excludedUserIds }
      : undefined;

  const onSupport = await deps.doctorClientsPort.listClients({ supportStatus: "on" }, audience);
  if (onSupport.length === 0) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  const nameById = new Map<string, string>(
    onSupport.map((c) => [c.userId.trim(), c.displayName.trim() || "—"]),
  );
  const patientUserIds = [...nameById.keys()];

  const rows = await deps.programItemDiscussion.listUnreadExerciseCommentsForDoctor({
    patientUserIds,
    viewerUserId: context.viewerUserId,
    limit: limit + 1,
    cursor: options?.cursor ?? null,
  });

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);

  const items: TodayExerciseCommentAttentionItem[] = pageRows.map((row) => ({
    patientUserId: row.patientUserId,
    patientDisplayName: nameById.get(row.patientUserId) ?? "—",
    instanceId: row.instanceId,
    stageItemId: row.stageItemId,
    stageItemTitle: row.stageItemTitle || "Упражнение",
    latestMessage: row.latestMessage,
    latestMessageAtLabel: formatDateTimeRu(row.latestMessage.createdAt),
    href: doctorClientTreatmentProgramInstanceHref(row.patientUserId, row.instanceId, {
      profileListScope: "appointments",
      discussionItemId: row.stageItemId,
    }),
  }));

  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor: DoctorExerciseCommentCursor | null =
    hasMore && lastRow
      ? { createdAt: lastRow.createdAt, id: lastRow.latestMessage.id }
      : null;

  return { items, nextCursor, hasMore };
}
