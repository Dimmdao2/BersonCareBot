/**
 * Per-patient «активность по программе» для виджета «Программа и комментарии» на вкладке
 * «Обзор» карточки пациента: сколько упражнений с непрочитанными отметками пациента и
 * когда была последняя отметка (комментарий-наблюдение пациента к упражнению).
 *
 * Переиспользует индексированные doctor-wide запросы program-item-discussion, сужая их до
 * ОДНОГО пациента (передаём `patientUserIds: [patientUserId]`):
 *   - listUnreadExerciseCommentsForDoctor → по строке на упражнение с непрочитанной отметкой;
 *   - listExerciseCommentsForDoctor      → последняя отметка (прочитанная или нет).
 *
 * «Отметка» = сообщение пациента (`senderRole: "patient"`) к элементу программы; здесь нас
 * интересует именно последнее по упражнению (что и возвращают эти запросы).
 */
import type { ProgramItemDiscussionPort } from "@/modules/program-item-discussion/ports";
import { formatDateTimeRu } from "../doctorTodayFormat";

export type DoctorPatientProgramActivity = {
  /** Кол-во упражнений с непрочитанной врачом отметкой пациента. */
  unreadCount: number;
  /** Последняя отметка пациента по любому упражнению (или null, если их нет). */
  lastMark: {
    atIso: string;
    atLabel: string;
    stageItemTitle: string;
    body: string | null;
  } | null;
};

export type DoctorPatientProgramActivityDeps = {
  programItemDiscussion: Pick<
    ProgramItemDiscussionPort,
    "listUnreadExerciseCommentsForDoctor" | "listExerciseCommentsForDoctor"
  >;
};

/** Сколько максимум непрочитанных упражнений считаем (точное число выше этого порога не нужно для бейджа). */
const UNREAD_SCAN_LIMIT = 50;

export async function loadDoctorPatientProgramActivity(
  deps: DoctorPatientProgramActivityDeps,
  params: { patientUserId: string; viewerUserId: string },
): Promise<DoctorPatientProgramActivity> {
  const patientUserIds = [params.patientUserId];

  const [unreadRows, latestRows] = await Promise.all([
    deps.programItemDiscussion.listUnreadExerciseCommentsForDoctor({
      patientUserIds,
      viewerUserId: params.viewerUserId,
      limit: UNREAD_SCAN_LIMIT,
    }),
    deps.programItemDiscussion.listExerciseCommentsForDoctor({
      patientUserIds,
      viewerUserId: params.viewerUserId,
      limit: 1,
    }),
  ]);

  const latest = latestRows[0] ?? null;
  const lastMark = latest
    ? {
        atIso: latest.latestMessage.createdAt,
        atLabel: formatDateTimeRu(latest.latestMessage.createdAt),
        stageItemTitle: latest.stageItemTitle || "Упражнение",
        body: latest.latestMessage.body,
      }
    : null;

  return { unreadCount: unreadRows.length, lastMark };
}
