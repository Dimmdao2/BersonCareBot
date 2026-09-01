/**
 * Shared app-layer загрузчик «новых комментариев пациентов по упражнениям».
 *
 * Считает по списку клиентов на сопровождении активные exercise-элементы их программ и
 * отбирает те, где последний комментарий — непрочитанный текст от пациента. Используется на
 * экране «Сегодня» (диалог `kind="exerciseComments"`) и на вкладке «Коммуникации → Комментарии»
 * (`/app/doctor/comments`).
 *
 * Извлечён из `loadDoctorTodayDashboard.ts` без изменения алгоритма (см. communications.md TODO#1).
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
    listAttentionSummaryForStageItems(
      stageItemIds: string[],
    ): Promise<Array<{ stageItemId: string; comments: number; media: number }>>;
    listMessagesPage(input: {
      stageItemId: string;
      limit: number;
      direction: 'backward' | 'forward';
      cursor: null;
    }): Promise<ProgramItemDiscussionMessage[]>;
    getLastReadAtForViewer(input: {
      viewerUserId: string;
      stageItemId: string;
    }): Promise<string | null>;
  };
};

export type ExerciseCommentAttentionPatientGroup = {
  patientUserId: string;
  patientDisplayName: string;
  items: TodayExerciseCommentAttentionItem[];
};

function stageItemSnapshotTitle(snapshot: Record<string, unknown>): string {
  const raw = snapshot.title;
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  return 'Упражнение';
}

/** Группирует строки по пациенту: внутри — по убыванию даты, группы — по имени пациента. */
export function groupExerciseCommentAttentionByPatient(
  items: TodayExerciseCommentAttentionItem[],
): ExerciseCommentAttentionPatientGroup[] {
  const groups = new Map<string, ExerciseCommentAttentionPatientGroup>();
  for (const row of items) {
    const current = groups.get(row.patientUserId);
    if (current) {
      current.items.push(row);
    } else {
      groups.set(row.patientUserId, {
        patientUserId: row.patientUserId,
        patientDisplayName: row.patientDisplayName,
        items: [row],
      });
    }
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => b.latestMessage.createdAt.localeCompare(a.latestMessage.createdAt));
  }
  return [...groups.values()].sort((a, b) =>
    a.patientDisplayName.localeCompare(b.patientDisplayName, 'ru', { sensitivity: 'base' }),
  );
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

        const summary = await deps.programItemDiscussion!.listAttentionSummaryForStageItems(
          activeExerciseItems.map((item) => item.id),
        );
        const attentionStageItemIds = summary
          .filter((row) => row.comments > 0)
          .map((row) => row.stageItemId);
        if (attentionStageItemIds.length === 0) return [] as TodayExerciseCommentAttentionItem[];

        const itemById = new Map(activeExerciseItems.map((item) => [item.id, item]));
        const rows: Array<TodayExerciseCommentAttentionItem | null> = await Promise.all(
          attentionStageItemIds.map(async (stageItemId) => {
            const [latestList, lastReadAt] = await Promise.all([
              deps.programItemDiscussion!.listMessagesPage({
                stageItemId,
                limit: 1,
                direction: 'backward',
                cursor: null,
              }),
              deps.programItemDiscussion!.getLastReadAtForViewer({
                viewerUserId: deps.doctorUserId!,
                stageItemId,
              }),
            ]);
            const latest = latestList[latestList.length - 1] ?? null;
            if (!latest || latest.senderRole !== 'patient' || latest.mediaFileId) return null;
            if (lastReadAt && latest.createdAt <= lastReadAt) return null;
            const item = itemById.get(stageItemId);
            if (!item) return null;
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
  const total = allRows.length;
  const items = allRows.slice(0, DOCTOR_TODAY_EXERCISE_COMMENTS_PREVIEW_LIMIT);
  return {
    items,
    total,
    truncated: total > items.length,
  };
}
