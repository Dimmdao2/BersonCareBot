/**
 * Per-patient «активность по программе» для виджета «Программа и комментарии» на вкладке
 * «Обзор» карточки пациента: сколько непрочитанных отметок пациента и когда была последняя
 * отметка (комментарий-наблюдение пациента к упражнению).
 *
 * Переиспользует индексированные doctor-wide запросы program-item-discussion, сужая их до
 * ОДНОГО пациента (передаём `patientUserIds: [patientUserId]`):
 *   - listUnreadExerciseCommentsForDoctor    → упражнения с непрочитанными отметками;
 *   - listUnreadCountsForViewerByStageItems  → точное число непрочитанных СООБЩЕНИЙ в каждом;
 *   - listExerciseCommentsForDoctor          → последняя отметка (прочитанная или нет).
 *
 * ——— Единица `unreadCount` ———
 * Это число непрочитанных СООБЩЕНИЙ, а не упражнений — та же семантика, что у KPI «Комментарии»
 * на «Сегодня» (`loadDoctorExerciseCommentAttention`), у бейджа пациента в «Коммуникации →
 * Комментарии» (`loadDoctorCommentPatients`) и у бейджей упражнений
 * (`loadDoctorPatientExercisesWithComments`). Раньше здесь считались упражнения, а UI карточки
 * вычитал из этого числа прочитанные СООБЩЕНИЯ — величины разных единиц не сходились.
 *
 * «Отметка» = сообщение пациента (`senderRole: "patient"`) к элементу программы.
 */
import type { ProgramItemDiscussionPort } from '@/modules/program-item-discussion/ports';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { formatDateTimeRu } from '../doctorTodayFormat';

export type DoctorPatientProgramActivity = {
  /** Кол-во непрочитанных врачом сообщений пациента по упражнениям программы (вся программа). */
  unreadCount: number;
  /**
   * Разбивка того же числа по элементам этапа: `stageItemId → непрочитанные СООБЩЕНИЯ`.
   * Нужна виджету «Программа», чтобы точка/счётчик на плашке текущего этапа считались ПО ЭТОМУ
   * ЭТАПУ, а бейджи упражнений в модалке «Упражнения этапа N» брались из того же источника и
   * сходились с ним. Program-wide остаётся `unreadCount` и KPI «Комментарии» на «Сегодня».
   */
  unreadByStageItemId: Record<string, number>;
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
    | 'listUnreadExerciseCommentsForDoctor'
    | 'listExerciseCommentsForDoctor'
    | 'listUnreadCountsForViewerByStageItems'
  >;
};

/** Сколько максимум непрочитанных упражнений сканируем (выше этого порога точность бейджу не нужна). */
const UNREAD_SCAN_LIMIT = 50;

export async function loadDoctorPatientProgramActivity(
  deps: DoctorPatientProgramActivityDeps,
  params: { patientUserId: string; viewerUserId: string; organizationId?: string },
): Promise<DoctorPatientProgramActivity> {
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  const patientUserIds = [params.patientUserId];

  const [unreadRows, latestRows] = await Promise.all([
    deps.programItemDiscussion.listUnreadExerciseCommentsForDoctor({
      patientUserIds,
      viewerUserId: params.viewerUserId,
      organizationId: params.organizationId,
      limit: UNREAD_SCAN_LIMIT,
    }),
    deps.programItemDiscussion.listExerciseCommentsForDoctor({
      patientUserIds,
      viewerUserId: params.viewerUserId,
      organizationId: params.organizationId,
      limit: 1,
    }),
  ]);

  const attentionStageItemIds = [...new Set(unreadRows.map((row) => row.stageItemId))];
  const unreadCounts =
    attentionStageItemIds.length > 0
      ? await deps.programItemDiscussion.listUnreadCountsForViewerByStageItems({
          stageItemIds: attentionStageItemIds,
          viewerUserId: params.viewerUserId,
        })
      : [];
  const unreadCount = unreadCounts.reduce((sum, row) => sum + row.unread, 0);
  const unreadByStageItemId: Record<string, number> = {};
  for (const row of unreadCounts) {
    if (row.unread > 0) unreadByStageItemId[row.stageItemId] = row.unread;
  }

  const latest = latestRows[0] ?? null;
  const lastMark = latest
    ? {
        atIso: latest.latestMessage.createdAt,
        atLabel: formatDateTimeRu(latest.latestMessage.createdAt, appDisplayTimeZone),
        stageItemTitle: latest.stageItemTitle || 'Упражнение',
        body: latest.latestMessage.body,
      }
    : null;

  return { unreadCount, unreadByStageItemId, lastMark };
}
