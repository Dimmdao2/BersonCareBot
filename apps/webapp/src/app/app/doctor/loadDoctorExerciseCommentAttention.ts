/**
 * Shared app-layer загрузчик «новых комментариев пациентов по упражнениям».
 *
 * Считает по списку доступных врачу клиентов активные exercise-элементы всех назначенных
 * программ и отбирает те, где у врача есть НЕПРОЧИТАННЫЕ сообщения пациента. Используется на
 * экране «Сегодня» (диалог `kind="exerciseComments"`) и на вкладке «Коммуникации → Комментарии»
 * (`/app/doctor/comments`).
 *
 * ——— Семантика unread (одна на весь кабинет) ———
 * «Непрочитано» = сообщения пациента после read-курсора врача (`programItemDiscussionReads`),
 * ровно как в doctor-wide SQL `listUnreadExerciseCommentsForDoctor` и в per-patient агрегации
 * `loadDoctorCommentPatients`. Отвеченные врачом треды и медиа-комментарии из списка НЕ выпадают:
 * порог — курсор чтения, а не роль автора последнего сообщения. `total` — сумма непрочитанных
 * СООБЩЕНИЙ, поэтому KPI, бейдж пациента и бейджи упражнений сходятся между собой.
 * Read-on-view сохраняется: открытие треда ставит курсор, и упражнение уходит из списка.
 *
 * Извлечён из `loadDoctorTodayDashboard.ts` (см. communications.md TODO#1).
 */
import type { ClientListItem } from '@/modules/doctor-clients/ports';
import type {
  DoctorExerciseCommentRow,
  ListDoctorExerciseCommentsInput,
  ProgramItemDiscussionMessage,
} from '@/modules/program-item-discussion/types';
import type { TreatmentProgramInstanceDetail } from '@/modules/treatment-program/types';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { formatCommentDateRu } from './doctorTodayFormat';
import { formatDoctorFio } from '@/shared/lib/fio';
import { patientProgramInstanceHref } from './patients/patientProgramInstanceHref';
import {
  firstSnapshotMedia,
  type ExerciseCommentThumbMedia,
} from './comments/exerciseCommentThumb';
export {
  groupExerciseCommentAttentionByPatient,
  type ExerciseCommentAttentionPatientGroup,
} from './comments/exerciseCommentAttentionGrouping';

export const DOCTOR_TODAY_EXERCISE_COMMENTS_PREVIEW_LIMIT = 30;

export type TodayExerciseCommentAttentionItem = {
  patientUserId: string;
  patientDisplayName: string;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  instanceId: string;
  stageItemId: string;
  stageItemTitle: string;
  /** First exercise media from item snapshot for compact list preview. */
  thumb?: ExerciseCommentThumbMedia | null;
  latestMessage: ProgramItemDiscussionMessage;
  latestMessageAtLabel: string;
  /** Exact number of unread patient comments in this exercise thread. */
  unreadCount?: number;
  href: string;
};

/** Минимальный срез зависимостей, нужных загрузчику (подмножество `DoctorTodayDashboardDeps`). */
export type DoctorExerciseCommentAttentionDeps = {
  doctorUserId?: string;
  organizationId?: string;
  treatmentProgramInstance?: {
    getInstanceById(instanceId: string): Promise<TreatmentProgramInstanceDetail>;
  };
  programItemDiscussion?: {
    listUnreadExerciseCommentsForDoctor(
      input: ListDoctorExerciseCommentsInput,
    ): Promise<DoctorExerciseCommentRow[]>;
    listUnreadCountsForViewerByStageItems(input: {
      stageItemIds: string[];
      viewerUserId: string;
    }): Promise<Array<{ stageItemId: string; unread: number }>>;
  };
};

export async function loadDoctorExerciseCommentAttention(
  deps: DoctorExerciseCommentAttentionDeps,
  visibleClients: ClientListItem[],
): Promise<{
  items: TodayExerciseCommentAttentionItem[];
  total: number;
  truncated: boolean;
}> {
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  if (!deps.programItemDiscussion || !deps.doctorUserId || visibleClients.length === 0) {
    return { items: [], total: 0, truncated: false };
  }

  const patientNameById = new Map<
    string,
    { displayName: string; firstName: string | null; lastName: string | null }
  >();
  for (const row of visibleClients) {
    const uid = row.userId.trim();
    if (!uid) continue;
    const firstName = row.firstName?.trim() || null;
    const lastName = row.lastName?.trim() || null;
    patientNameById.set(uid, {
      displayName: formatDoctorFio(
        { lastName, firstName, patronymic: null },
        row.displayName.trim() || '—',
      ),
      firstName,
      lastName,
    });
  }

  const patientUserIds = [...patientNameById.keys()];
  const rows = await deps.programItemDiscussion.listUnreadExerciseCommentsForDoctor({
    patientUserIds,
    viewerUserId: deps.doctorUserId,
    organizationId: deps.organizationId,
    limit: 2000,
  });
  if (rows.length === 0) return { items: [], total: 0, truncated: false };

  const unreadCounts = await deps.programItemDiscussion.listUnreadCountsForViewerByStageItems({
    stageItemIds: rows.map((row) => row.stageItemId),
    viewerUserId: deps.doctorUserId,
  });
  const unreadCountByStageItemId = new Map(
    unreadCounts.map((row) => [row.stageItemId, row.unread]),
  );

  // Миниатюры дополняют doctor-wide выборку, но их сбой не должен скрывать сам комментарий.
  const snapshotByStageItemId = new Map<string, Record<string, unknown>>();
  if (deps.treatmentProgramInstance) {
    const details = await Promise.all(
      [...new Set(rows.map((row) => row.instanceId))].map(async (instanceId) => {
        try {
          return await deps.treatmentProgramInstance!.getInstanceById(instanceId);
        } catch {
          return null;
        }
      }),
    );
    for (const detail of details) {
      if (!detail) continue;
      for (const stage of detail.stages) {
        for (const item of stage.items) snapshotByStageItemId.set(item.id, item.snapshot);
      }
    }
  }

  const mappedRows: Array<TodayExerciseCommentAttentionItem | null> = rows.map((row) => {
    const patient = patientNameById.get(row.patientUserId);
    const unread = unreadCountByStageItemId.get(row.stageItemId) ?? 0;
    if (!patient || unread <= 0) return null;
    const snapshot = snapshotByStageItemId.get(row.stageItemId);
    return {
      patientUserId: row.patientUserId,
      patientDisplayName: patient.displayName,
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      instanceId: row.instanceId,
      stageItemId: row.stageItemId,
      stageItemTitle: row.stageItemTitle || 'Упражнение',
      thumb: snapshot ? firstSnapshotMedia(snapshot) : null,
      latestMessage: row.latestMessage,
      latestMessageAtLabel: formatCommentDateRu(row.latestMessage.createdAt, appDisplayTimeZone),
      unreadCount: unread,
      href: patientProgramInstanceHref(row.patientUserId, row.instanceId, {
        discussionItemId: row.stageItemId,
      }),
    } satisfies TodayExerciseCommentAttentionItem;
  });
  const allRows = mappedRows
    .filter((row): row is TodayExerciseCommentAttentionItem => row !== null)
    .sort((a, b) => b.latestMessage.createdAt.localeCompare(a.latestMessage.createdAt));
  const items = allRows.slice(0, DOCTOR_TODAY_EXERCISE_COMMENTS_PREVIEW_LIMIT);
  // `total` — непрочитанные СООБЩЕНИЯ (KPI), `truncated` — упражнения, не влезшие в превью.
  // Считать их одной величиной нельзя: у одного упражнения бывает несколько непрочитанных.
  const total = allRows.reduce((sum, row) => sum + (row.unreadCount ?? 1), 0);
  return {
    items,
    total,
    truncated: allRows.length > items.length,
  };
}
