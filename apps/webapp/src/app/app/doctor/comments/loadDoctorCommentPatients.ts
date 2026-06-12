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
 * Используется `listUnreadExerciseCommentsForDoctor` — тот же что в текущем табе.
 * «unreadCount» = число отдельных stageItem'ов с непрочитанным последним сообщением пациента.
 * Это приближение: несколько сообщений в одном треде считаются за один «непрочитанный».
 * Более точный подсчёт (реальное число сообщений) — через `listUnreadCountsForViewerByStageItems`,
 * но требует fanout по программам, что дорого. Семантику можно уточнить в будущем (зафиксировано
 * как развилка в LOG.md).
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
  /** Число stageItem'ов с непрочитанным последним сообщением пациента (приближение). */
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
    ): Promise<Array<{ patientUserId: string }>>;
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

  // Fetch all unread stageItems for all on-support patients (large limit = get all)
  const unreadRows = await deps.programItemDiscussion.listUnreadExerciseCommentsForDoctor({
    patientUserIds,
    viewerUserId: context.viewerUserId,
    limit: 2000, // effectively unlimited; doctor supports at most dozens of patients
  });

  // Count unread stageItems per patient
  const unreadCountById = new Map<string, number>();
  for (const row of unreadRows) {
    const uid = row.patientUserId;
    unreadCountById.set(uid, (unreadCountById.get(uid) ?? 0) + 1);
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
