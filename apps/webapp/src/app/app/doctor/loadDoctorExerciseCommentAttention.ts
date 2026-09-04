/**
 * Shared app-layer загрузчик «новых комментариев пациентов по упражнениям».
 *
 * Считает по списку клиентов на сопровождении активные exercise-элементы их программ и
 * отбирает те, где у врача есть НЕПРОЧИТАННЫЕ сообщения пациента. Используется на
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
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceSummary,
} from '@/modules/treatment-program/types';
import { pickActivePlanInstance } from '@/modules/treatment-program/pickActivePlanInstance';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { formatCommentDateRu } from './doctorTodayFormat';
import { formatDoctorFio } from '@/shared/lib/fio';
import { patientProgramInstanceHref } from './patients/patientProgramInstanceHref';
import {
  firstSnapshotMedia,
  type ExerciseCommentThumbMedia,
} from './comments/exerciseCommentThumb';
import {
  DISCUSSION_LATEST_MESSAGE_SCAN_LIMIT,
  pickLatestPatientFacingMessage,
} from './pickLatestPatientFacingMessage';
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
    listForPatientClinicalView(patientUserId: string): Promise<TreatmentProgramInstanceSummary[]>;
    getInstanceById(instanceId: string): Promise<TreatmentProgramInstanceDetail>;
  };
  programItemDiscussion?: {
    listMessagesPage(input: {
      stageItemId: string;
      limit: number;
      direction: 'backward' | 'forward';
      cursor: null;
    }): Promise<ProgramItemDiscussionMessage[]>;
    listUnreadCountsForViewerByStageItems(input: {
      stageItemIds: string[];
      viewerUserId: string;
    }): Promise<Array<{ stageItemId: string; unread: number }>>;
  };
};

function stageItemSnapshotTitle(snapshot: Record<string, unknown>): string {
  const raw = snapshot.title;
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim().normalize('NFC');
  return 'Упражнение';
}

export async function loadDoctorExerciseCommentAttention(
  deps: DoctorExerciseCommentAttentionDeps,
  onSupportListRaw: ClientListItem[],
): Promise<{
  items: TodayExerciseCommentAttentionItem[];
  total: number;
  truncated: boolean;
}> {
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  if (
    !deps.programItemDiscussion ||
    !deps.treatmentProgramInstance ||
    !deps.doctorUserId ||
    onSupportListRaw.length === 0
  ) {
    return { items: [], total: 0, truncated: false };
  }

  const patientNameById = new Map<
    string,
    { displayName: string; firstName: string | null; lastName: string | null }
  >();
  for (const row of onSupportListRaw) {
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

  const perPatientRows = await Promise.all(
    [...patientNameById.keys()].map(async (patientUserId) => {
      try {
        const allInstances =
          await deps.treatmentProgramInstance!.listForPatientClinicalView(patientUserId);
        const instances = deps.organizationId
          ? allInstances.filter((instance) => instance.organizationId === deps.organizationId)
          : allInstances;
        const active = pickActivePlanInstance(instances);
        if (!active) return [] as TodayExerciseCommentAttentionItem[];
        const detail = await deps.treatmentProgramInstance!.getInstanceById(active.id);
        if (deps.organizationId && detail.organizationId !== deps.organizationId) {
          return [] as TodayExerciseCommentAttentionItem[];
        }
        const activeExerciseItems = detail.stages.flatMap((stage) =>
          stage.items.filter((item) => item.status === 'active' && item.itemType === 'exercise'),
        );
        if (activeExerciseItems.length === 0) return [] as TodayExerciseCommentAttentionItem[];

        // Курсорный подсчёт идёт ПЕРВЫМ и по ВСЕМ активным упражнениям этапов программы.
        // Прежде здесь стоял предфильтр `listAttentionSummaryForStageItems` («последнее сообщение
        // треда — текст от пациента»): он вырезал отвеченные и медиа-only треды ДО подсчёта, и
        // пациент с 7 непрочитанными в трёх упражнениях доходил до KPI как 2 в одном (UNREAD-05/06).
        const unreadCounts =
          await deps.programItemDiscussion!.listUnreadCountsForViewerByStageItems({
            stageItemIds: activeExerciseItems.map((item) => item.id),
            viewerUserId: deps.doctorUserId!,
          });
        const attentionStageItemIds = unreadCounts
          .filter((row) => row.unread > 0)
          .map((row) => row.stageItemId);
        if (attentionStageItemIds.length === 0) return [] as TodayExerciseCommentAttentionItem[];
        const unreadCountByStageItemId = new Map(
          unreadCounts.map((row) => [row.stageItemId, row.unread]),
        );

        const itemById = new Map(activeExerciseItems.map((item) => [item.id, item]));
        const rows: Array<TodayExerciseCommentAttentionItem | null> = await Promise.all(
          attentionStageItemIds.map(async (stageItemId) => {
            // Единственный критерий попадания в список — есть непрочитанные врачом сообщения
            // пациента (`listUnreadCountsForViewerByStageItems` = read-cursor семантика, ровно та же,
            // что у doctor-wide SQL `listUnreadExerciseCommentsForDoctor` и у per-patient агрегации
            // в «Коммуникации → Комментарии»). Прежний фильтр «последнее сообщение треда — текст от
            // пациента» терял упражнения двух видов: отвеченные врачом (последнее сообщение — его)
            // и медиа-комментарии. Из-за этого у пациента с 7 непрочитанными в нескольких
            // упражнениях KPI и список показывали лишь часть, расходясь с вкладкой «Комментарии».
            const unread = unreadCountByStageItemId.get(stageItemId) ?? 0;
            if (unread <= 0) return null;
            const item = itemById.get(stageItemId);
            if (!item) return null;
            // Превью — последний комментарий ПАЦИЕНТА в треде (ответы врача после него не заменяют
            // его в списке). Окно совпадает со страницей самого треда. Это ТОЛЬКО выбор текста для
            // строки: попадание в список уже решено курсором выше, поэтому упражнение с unread > 0,
            // у которого в окне оказались одни ответы врача, показывает последнее сообщение треда,
            // а не выпадает из списка (иначе «последний отправитель» вернулся бы как unread-гейт).
            const page = await deps.programItemDiscussion!.listMessagesPage({
              stageItemId,
              limit: DISCUSSION_LATEST_MESSAGE_SCAN_LIMIT,
              direction: 'backward',
              cursor: null,
            });
            const latest = pickLatestPatientFacingMessage(page);
            if (!latest) return null;
            return {
              patientUserId,
              patientDisplayName: patientNameById.get(patientUserId)?.displayName ?? '—',
              patientFirstName: patientNameById.get(patientUserId)?.firstName ?? null,
              patientLastName: patientNameById.get(patientUserId)?.lastName ?? null,
              instanceId: active.id,
              stageItemId,
              stageItemTitle: stageItemSnapshotTitle(item.snapshot),
              thumb: firstSnapshotMedia(item.snapshot),
              latestMessage: latest,
              latestMessageAtLabel: formatCommentDateRu(latest.createdAt, appDisplayTimeZone),
              unreadCount: unread,
              href: patientProgramInstanceHref(patientUserId, active.id, {
                discussionItemId: stageItemId,
              }),
            } satisfies TodayExerciseCommentAttentionItem;
          }),
        );
        return rows.filter((row): row is TodayExerciseCommentAttentionItem => row !== null);
      } catch {
        return [] as TodayExerciseCommentAttentionItem[];
      }
    }),
  );

  const allRows = perPatientRows
    .flat()
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
