/**
 * Загрузчик «все пациенты с комментариями» — симметричный ALL-вариант для
 * загрузчика `loadDoctorCommentPatients` (который возвращает только пациентов с непрочитанными).
 *
 * Используется в левом пейне режима «Все» вкладки «Комментарии».
 * Возвращает всех пациентов на сопровождении у которых есть хотя бы один комментарий
 * по упражнениям (прочитанные + непрочитанные). unreadCount = 0 означает «всё прочитано».
 *
 * Отличие от `loadDoctorCommentPatients`:
 *   - использует `listExerciseCommentsForDoctor` (unreadOnly:false) вместо unread-варианта;
 *   - НЕ пропускает пациентов с unreadCount=0;
 *   - сортировка: сначала с непрочитанными (по убыванию), затем по displayName.
 *
 * unreadCount считается точно так же: через `listUnreadCountsForViewerByStageItems`,
 * что обеспечивает консистентность бейджей с unread-режимом.
 */
import type { DoctorClientsFilters } from "@/modules/doctor-clients/ports";
import type { ListDoctorExerciseCommentsInput } from "@/modules/program-item-discussion/types";
import type { CommentPatientRow } from "./loadDoctorCommentPatients";

export type LoadDoctorAllCommentPatientsDeps = {
  doctorClientsPort: {
    listClients(
      filters: Pick<DoctorClientsFilters, "supportStatus">,
      audience?: { excludedUserIds?: string[] },
    ): Promise<
      Array<{
        userId: string;
        displayName: string;
        phone: string | null;
        bindings: { telegramId?: string | null; maxId?: string | null };
      }>
    >;
  };
  programItemDiscussion: {
    listExerciseCommentsForDoctor(
      input: ListDoctorExerciseCommentsInput,
    ): Promise<Array<{ patientUserId: string; stageItemId: string }>>;
    listUnreadCountsForViewerByStageItems(input: {
      stageItemIds: string[];
      viewerUserId: string;
    }): Promise<Array<{ stageItemId: string; unread: number }>>;
  };
};

/**
 * Загружает всех пациентов на сопровождении с хотя бы одним комментарием по упражнениям
 * (включая уже прочитанные треды). unreadCount может быть 0.
 */
export async function loadDoctorAllCommentPatients(
  deps: LoadDoctorAllCommentPatientsDeps,
  context: { viewerUserId: string },
  options?: { excludedUserIds?: string[] },
): Promise<CommentPatientRow[]> {
  const audience = options?.excludedUserIds?.length
    ? { excludedUserIds: options.excludedUserIds }
    : undefined;

  const onSupport = await deps.doctorClientsPort.listClients({ supportStatus: "on" }, audience);
  if (onSupport.length === 0) return [];

  const clientById = new Map(
    onSupport.map((c) => [
      c.userId.trim(),
      {
        displayName: c.displayName.trim() || "—",
        phone: c.phone ?? null,
        telegramId: c.bindings?.telegramId ?? null,
        maxId: c.bindings?.maxId ?? null,
      },
    ]),
  );
  const patientUserIds = [...clientById.keys()];

  // Step 1: all exercises with any patient comment (unreadOnly:false).
  // Limit высокий — врач ведёт десятки пациентов, каждый имеет десятки упражнений.
  const allRows = await deps.programItemDiscussion.listExerciseCommentsForDoctor({
    patientUserIds,
    viewerUserId: context.viewerUserId,
    limit: 2000,
  });

  if (allRows.length === 0) return [];

  // Map stageItem → patient, collect unique patients that have any comment.
  const patientByStageItem = new Map<string, string>();
  const patientsWithComments = new Set<string>();
  for (const row of allRows) {
    patientByStageItem.set(row.stageItemId, row.patientUserId);
    patientsWithComments.add(row.patientUserId);
  }
  const allStageItemIds = [...patientByStageItem.keys()];

  // Step 2: exact unread count per stageItem, summed per patient.
  const unreadCountById = new Map<string, number>();
  if (allStageItemIds.length > 0) {
    const counts = await deps.programItemDiscussion.listUnreadCountsForViewerByStageItems({
      stageItemIds: allStageItemIds,
      viewerUserId: context.viewerUserId,
    });
    for (const c of counts) {
      const uid = patientByStageItem.get(c.stageItemId);
      if (!uid) continue;
      unreadCountById.set(uid, (unreadCountById.get(uid) ?? 0) + c.unread);
    }
  }

  // Include ALL patients with at least one comment (unreadCount may be 0).
  const result: CommentPatientRow[] = [];
  for (const [patientUserId, fields] of clientById.entries()) {
    if (!patientsWithComments.has(patientUserId)) continue;
    result.push({
      patientUserId,
      isOnSupport: true,
      unreadCount: unreadCountById.get(patientUserId) ?? 0,
      displayName: fields.displayName,
      phone: fields.phone,
      telegramId: fields.telegramId,
      maxId: fields.maxId,
    });
  }

  // Sort: unread > 0 first (DESC), then by displayName ASC.
  result.sort(
    (a, b) =>
      b.unreadCount - a.unreadCount ||
      a.displayName.localeCompare(b.displayName, "ru", { sensitivity: "base" }),
  );

  return result;
}
