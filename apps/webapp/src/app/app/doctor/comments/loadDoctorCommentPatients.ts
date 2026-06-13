/**
 * Загрузчик «пациенты с непрочитанными комментариями по упражнениям».
 *
 * Используется в левом пейне state-B drill-down вкладки «Комментарии».
 * Возвращает список пациентов на сопровождении с непрочитанными комментариями,
 * снабжённых счётчиком unreadCount и полями для многополевого поиска.
 *
 * Переиспользует существующий doctor-wide порт `listUnreadExerciseCommentsForDoctor`
 * (не ломает «Сегодня» / текущий таб).
 *
 * ——— Семантика «непрочитанных» ———
 * `unreadCount` = **точное число непрочитанных сообщений** пациента (а не число упражнений).
 * Считается в два шага существующими методами порта (без нового SQL):
 *   1) `listUnreadExerciseCommentsForDoctor` — упражнения, требующие внимания (последнее сообщение —
 *      непрочитанный комментарий пациента), даёт пары `{stageItemId, patientUserId}`;
 *   2) `listUnreadCountsForViewerByStageItems` — точное число непрочитанных сообщений на каждый stageItem;
 *   3) суммируем по пациенту.
 * Семантика совпадает с шапкой состояния B (`totalUnreadComments` там считается тем же методом),
 * поэтому бейдж слева и счётчик «новых» в шапке консистентны.
 *
 * ——— Email в поиске ———
 * `ClientListItem` не содержит email (только `hasEmail: boolean`). Для поиска по email необходим
 * дополнительный вызов `getClientIdentity` по каждому пациенту — это дорого на больших списках.
 * Решение: email в многополевой поиск НЕ включается (см. развилку в LOG.md).
 * Поиск работает по: displayName, phone, telegramId, maxId.
 *
 * ——— ★ На сопровождении ———
 * Все пациенты в списке уже фильтруются `supportStatus: "on"` — флаг `isOnSupport` всегда true.
 */
import type { DoctorClientsFilters } from "@/modules/doctor-clients/ports";
import type { ListDoctorExerciseCommentsInput } from "@/modules/program-item-discussion/types";

/** Поля пациента для многополевого поиска в левом пейне. */
export type CommentPatientSearchFields = {
  displayName: string;
  phone: string | null;
  telegramId: string | null;
  maxId: string | null;
};

/** Строка пациента в левом пейне drill-down комментариев. */
export type CommentPatientRow = CommentPatientSearchFields & {
  patientUserId: string;
  /** Всегда true: список фильтруется по `supportStatus: "on"`. */
  isOnSupport: true;
  /** Точное число непрочитанных сообщений пациента (по всем упражнениям, требующим внимания). */
  unreadCount: number;
};

export type LoadDoctorCommentPatientsDeps = {
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
    listUnreadExerciseCommentsForDoctor(
      input: ListDoctorExerciseCommentsInput,
    ): Promise<Array<{ patientUserId: string; stageItemId: string }>>;
    listUnreadCountsForViewerByStageItems(input: {
      stageItemIds: string[];
      viewerUserId: string;
    }): Promise<Array<{ stageItemId: string; unread: number }>>;
  };
};

/**
 * Загружает пациентов на сопровождении у которых есть непрочитанные комментарии по упражнениям.
 *
 * @param deps - зависимости (ports)
 * @param context - viewerUserId = userId врача
 * @param options - excludedUserIds = audience exclusions из analytics
 */
export async function loadDoctorCommentPatients(
  deps: LoadDoctorCommentPatientsDeps,
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

  // Step 1: exercises needing attention (latest message = unread patient comment), one row per stageItem.
  const unreadRows = await deps.programItemDiscussion.listUnreadExerciseCommentsForDoctor({
    patientUserIds,
    viewerUserId: context.viewerUserId,
    limit: 2000, // effectively unlimited; doctor supports at most dozens of patients
  });

  // Map each attention stageItem → its patient (one stageItem belongs to one patient).
  const patientByStageItem = new Map<string, string>();
  for (const row of unreadRows) patientByStageItem.set(row.stageItemId, row.patientUserId);
  const attentionStageItemIds = [...patientByStageItem.keys()];

  // Step 2+3: exact unread MESSAGE count per stageItem, summed per patient.
  const unreadCountById = new Map<string, number>();
  if (attentionStageItemIds.length > 0) {
    const counts = await deps.programItemDiscussion.listUnreadCountsForViewerByStageItems({
      stageItemIds: attentionStageItemIds,
      viewerUserId: context.viewerUserId,
    });
    for (const c of counts) {
      const uid = patientByStageItem.get(c.stageItemId);
      if (!uid) continue;
      unreadCountById.set(uid, (unreadCountById.get(uid) ?? 0) + c.unread);
    }
  }

  // Only return patients with at least one unread
  const result: CommentPatientRow[] = [];
  for (const [patientUserId, fields] of clientById.entries()) {
    const unreadCount = unreadCountById.get(patientUserId) ?? 0;
    if (unreadCount === 0) continue;
    result.push({
      patientUserId,
      isOnSupport: true,
      unreadCount,
      displayName: fields.displayName,
      phone: fields.phone,
      telegramId: fields.telegramId,
      maxId: fields.maxId,
    });
  }

  // Sort by unread count DESC, then by displayName ASC
  result.sort(
    (a, b) =>
      b.unreadCount - a.unreadCount ||
      a.displayName.localeCompare(b.displayName, "ru", { sensitivity: "base" }),
  );

  return result;
}
