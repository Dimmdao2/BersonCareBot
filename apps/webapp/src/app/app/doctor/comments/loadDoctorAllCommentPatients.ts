/**
 * Загрузчик «все пациенты с комментариями по упражнениям».
 *
 * Используется в левом пейне режима «Все» вкладки «Комментарии».
 * Отличия от `loadDoctorCommentPatients` (unread-режим):
 *   - Убран on-support гейт: показывает ВСЕХ пациентов врача с хоть одним комментарием.
 *   - isOnSupport берётся из ClientListItem.isOnSupport (поле уже есть в listClients).
 *   - Использует listExerciseCommentsForDoctor с assignedByUserId — без фан-аута по patient_user_id.
 *   - unreadCount может быть 0 (все прочитаны).
 *   - Сортировка: сначала с непрочитанными (по убыванию), затем по displayName.
 *
 * Безопасность: только пациенты этого врача (listClients скоупирован на doctor-сессию).
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
        isOnSupport?: boolean;
      }>
    >;
  };
  programItemDiscussion: {
    listExerciseCommentsForDoctor(
      input: ListDoctorExerciseCommentsInput,
    ): Promise<Array<{ patientUserId: string; stageItemId: string }>>;
    listAllExerciseCommentsForDoctor(
      input: { viewerUserId: string; limit: number },
    ): Promise<Array<{ patientUserId: string; stageItemId: string }>>;
    listUnreadCountsForViewerByStageItems(input: {
      stageItemIds: string[];
      viewerUserId: string;
    }): Promise<Array<{ stageItemId: string; unread: number }>>;
  };
};

/**
 * Загружает ВСЕХ пациентов врача с хотя бы одним комментарием по упражнениям
 * (без on-support гейта). isOnSupport — визуальный маркер ★, не фильтр.
 */
export async function loadDoctorAllCommentPatients(
  deps: LoadDoctorAllCommentPatientsDeps,
  context: { viewerUserId: string },
  options?: { excludedUserIds?: string[] },
): Promise<CommentPatientRow[]> {
  const audience = options?.excludedUserIds?.length
    ? { excludedUserIds: options.excludedUserIds }
    : undefined;

  // Step 1: doctor-wide query — all exercises with any patient comment, no patient-ID fanout.
  // assignedByUserId scopes to this doctor's instances directly.
  const allRows = await deps.programItemDiscussion.listAllExerciseCommentsForDoctor({
    viewerUserId: context.viewerUserId,
    limit: 2000,
  });

  if (allRows.length === 0) return [];

  // Collect unique patient IDs that have any comment.
  const patientByStageItem = new Map<string, string>();
  const patientsWithComments = new Set<string>();
  for (const row of allRows) {
    patientByStageItem.set(row.stageItemId, row.patientUserId);
    patientsWithComments.add(row.patientUserId);
  }
  const allStageItemIds = [...patientByStageItem.keys()];

  // Step 2: unread counts per stageItem, summed per patient.
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

  // Step 3: resolve patient display info — fetch ALL clients (no supportStatus filter)
  // so we include patients not on support. isOnSupport used as visual ★ marker only.
  const allClients = await deps.doctorClientsPort.listClients({}, audience);
  const clientById = new Map(
    allClients.map((c) => [
      c.userId.trim(),
      {
        displayName: c.displayName.trim() || "—",
        phone: c.phone ?? null,
        telegramId: c.bindings?.telegramId ?? null,
        maxId: c.bindings?.maxId ?? null,
        isOnSupport: c.isOnSupport ?? false,
      },
    ]),
  );

  // Include only patients with at least one comment (unreadCount may be 0).
  const result: CommentPatientRow[] = [];
  for (const patientUserId of patientsWithComments) {
    const fields = clientById.get(patientUserId);
    if (!fields) continue; // patient not in this doctor's client list (safety)
    result.push({
      patientUserId,
      isOnSupport: fields.isOnSupport,
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
