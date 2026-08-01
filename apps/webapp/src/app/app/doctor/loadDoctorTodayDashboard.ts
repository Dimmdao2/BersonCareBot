import type {
  AppointmentRow,
  DoctorAppointmentsAudience,
  DoctorAppointmentsListFilter,
} from '@/modules/doctor-appointments/ports';
import type {
  ClientListItem,
  DoctorClientsFilters,
  DoctorDashboardPatientMetrics,
} from '@/modules/doctor-clients/ports';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import type { SpecialistTasksService } from '@/modules/specialist-tasks/service';
import type { TreatmentProgramProgressService } from '@/modules/treatment-program/progress-service';
import { pickActivePlanInstance } from '@/modules/treatment-program/pickActivePlanInstance';
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceSummary,
} from '@/modules/treatment-program/types';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import type { OnlineIntakeService } from '@/modules/online-intake/ports';
import type { IntakeRequestWithPatientIdentity, IntakeType } from '@/modules/online-intake/types';
import type { DoctorProactiveInsightsPort } from '@/modules/doctor-proactive-insights/ports';
import type { ProactiveInsightKind } from '@/modules/doctor-proactive-insights/types';
import { DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT } from '@/modules/doctor-proactive-insights/constants';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import {
  type DoctorTodayPeopleListMode,
  type DoctorTodayPreferences,
} from '@/modules/system-settings/doctorTodayPreferences';
import { DateTime } from 'luxon';
import {
  DOCTOR_TODAY_PENDING_TESTS_PREVIEW_LIMIT,
  mapPendingProgramTestsForToday,
  type TodayPendingProgramTestItem,
} from './mapPendingProgramTestsForToday';
import {
  mapProactiveInsightsForToday,
  type TodayProactiveInsightItem,
} from './mapProactiveInsightsForToday';
import { patientCardHref } from './patients/patientCardHref';
import { communicationsChatHref } from './communications/doctorCommunicationsTabs';
import { formatDateTimeRu, truncateText } from './doctorTodayFormat';
import {
  loadDoctorExerciseCommentAttention,
  type TodayExerciseCommentAttentionItem,
} from './loadDoctorExerciseCommentAttention';

export { formatDateTimeRu, truncateText } from './doctorTodayFormat';
export type { TodayExerciseCommentAttentionItem } from './loadDoctorExerciseCommentAttention';

/** Preview limit for either proven people-list mode on Today. */
export const DOCTOR_TODAY_ON_SUPPORT_PREVIEW_LIMIT = 10;

/** Minimal conversation row shape for «Сегодня» (matches doctorSupport.listOpenConversations output). */
export type TodayConversationSourceRow = {
  conversationId: string;
  displayName: string;
  phoneNormalized: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
  unreadFromUserCount: number;
};

export type DoctorTodayDashboardDeps = {
  doctorAppointments: {
    listAppointmentsForSpecialist(
      filter: DoctorAppointmentsListFilter,
      audience?: DoctorAppointmentsAudience,
    ): Promise<AppointmentRow[]>;
  };
  /** Optional loader for calendar-month appointments (deferred to avoid extra audience-filtered call). */
  loadMonthAppointments?: () => Promise<AppointmentRow[]>;
  doctorClients: {
    getDashboardPatientMetrics(audience?: {
      excludedUserIds?: string[];
    }): Promise<DoctorDashboardPatientMetrics>;
    listClients(
      filters: DoctorClientsFilters,
      audience?: { excludedUserIds?: string[] },
    ): Promise<ClientListItem[]>;
  };
  specialistTasks?: SpecialistTasksService;
  specialistOwnerUserId?: string;
  doctorUserId?: string;
  organizationId: string;
  treatmentProgramProgress?: TreatmentProgramProgressService;
  doctorProactiveInsights?: DoctorProactiveInsightsPort;
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
  programActionLog?: {
    countDoneByItemInWindow(params: {
      instanceId: string;
      patientUserId: string;
      windowStartIso: string;
      windowEndIso: string;
    }): Promise<Record<string, number>>;
  };
  displayIana: string;
  messaging: {
    doctorSupport: {
      listOpenConversations(params: {
        limit?: number;
        unreadOnly?: boolean;
        organizationId?: string;
      }): Promise<TodayConversationSourceRow[]>;
      unreadFromUsers(params?: { organizationId?: string }): Promise<number>;
      unreadFromPatient?: (platformUserId: string, organizationId?: string) => Promise<number>;
    };
  };
};

export type TodayAppointmentItem = {
  id: string;
  /** Форматированная метка времени «ЧЧ:мм ДД.ММ» (для отображения в списках). */
  time: string;
  /** UTC ISO-момент записи (`record_at`); используется для точного позиционирования в FullCalendar. */
  recordAtIso: string | null;
  clientLabel: string;
  clientUserId: string | null;
  type: string;
  status: string;
  branchName: string | null;
  scheduleProvenancePrefix: string | null;
  href: string;
  ctaLabel: string;
};

export type TodayIntakeItem = {
  id: string;
  patientName: string;
  patientPhone: string;
  typeLabel: string;
  summary: string | null;
  summaryPreview: string | null;
  createdAtLabel: string;
  href: string;
};

export type TodayUnreadConversationItem = {
  conversationId: string;
  displayName: string;
  phoneNormalized: string | null;
  lastMessageAtLabel: string;
  lastMessageText: string | null;
  lastMessagePreview: string | null;
  unreadFromUserCount: number;
  href: string;
};

export type TodayPeopleItem = {
  userId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  patronymic?: string | null;
  href: string;
  unreadMessagesCount: number;
  exerciseDoneTodayCount: number;
  newExerciseCommentsCount: number;
  lastAppointmentAt: string | null;
};

export type TodayDashboardData = {
  todayAppointments: TodayAppointmentItem[];
  /** All appointments this week (incl. today) for SEG-04 week modal. */
  weekAppointments: TodayAppointmentItem[];
  /** All appointments in calendar month for SEG-04 month modal. */
  monthAppointments: TodayAppointmentItem[];
  newIntakeRequests: TodayIntakeItem[];
  unreadConversations: TodayUnreadConversationItem[];
  unreadTotal: number;
  upcomingAppointments: TodayAppointmentItem[];
  peopleListMode: DoctorTodayPeopleListMode;
  peopleCount: number;
  people: TodayPeopleItem[];
  peopleListTruncated: boolean;
  globalOpenTasks: SpecialistTaskRow[];
  /** Общее количество открытых задач (§1.3). */
  globalOpenTasksTotal: number;
  pendingProgramTests: TodayPendingProgramTestItem[];
  pendingProgramTestsTotal: number;
  pendingProgramTestsTruncated: boolean;
  proactiveInsights: TodayProactiveInsightItem[];
  proactiveInsightsTotal: number;
  proactiveInsightsTruncated: boolean;
  visibleProactiveInsightKinds: readonly ProactiveInsightKind[];
  exerciseCommentAttentionItems: TodayExerciseCommentAttentionItem[];
  exerciseCommentAttentionTotal: number;
  exerciseCommentAttentionTruncated: boolean;
};

const INTAKE_TYPE_LABELS: Record<IntakeType, string> = {
  lfk: 'ЛФК',
  nutrition: 'Нутрициология',
};

export {
  ON_SUPPORT_LIST_HREF,
  PROGRAM_WITHOUT_SUPPORT_LIST_HREF,
  RECENT_VISITS_LIST_HREF,
} from './doctorTodayLinks';

export function mapAppointmentToTodayItem(row: AppointmentRow): TodayAppointmentItem {
  const uid = row.clientUserId?.trim() ?? '';
  const hasClient = uid.length > 0;
  return {
    id: row.id,
    time: row.time,
    recordAtIso: row.recordAtIso,
    clientLabel: row.clientLabel,
    clientUserId: hasClient ? uid : null,
    type: row.type,
    status: row.status,
    branchName: row.branchName,
    scheduleProvenancePrefix: row.scheduleProvenancePrefix ?? null,
    href: hasClient ? patientCardHref(uid) : '/app/doctor/appointments',
    ctaLabel: hasClient ? 'Открыть карточку' : 'Открыть записи',
  };
}

export function mapIntakeToTodayItem(
  row: IntakeRequestWithPatientIdentity,
  timeZone?: string,
): TodayIntakeItem {
  const label = INTAKE_TYPE_LABELS[row.type] ?? row.type;
  const summaryPreview = truncateText(row.summary);
  return {
    id: row.id,
    patientName: row.patientName.trim() || '—',
    patientPhone: row.patientPhone.trim() || '—',
    typeLabel: label,
    summary: row.summary,
    summaryPreview,
    createdAtLabel: formatDateTimeRu(row.createdAt, timeZone),
    href: `/app/doctor/online-intake/${encodeURIComponent(row.id)}`,
  };
}

export function mapClientToTodayItem(row: ClientListItem): TodayPeopleItem {
  const uid = row.userId.trim();
  return {
    userId: uid,
    displayName: row.displayName.trim() || '—',
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    patronymic: row.patronymic ?? null,
    href: patientCardHref(uid),
    unreadMessagesCount: row.unreadMessagesCount ?? 0,
    exerciseDoneTodayCount: 0,
    newExerciseCommentsCount: row.unreadExerciseCommentsCount ?? 0,
    lastAppointmentAt: row.lastAppointmentAt ?? null,
  };
}

export function mapConversationToTodayItem(
  row: TodayConversationSourceRow,
  timeZone?: string,
): TodayUnreadConversationItem {
  return {
    conversationId: row.conversationId,
    displayName: row.displayName.trim() || '—',
    phoneNormalized: row.phoneNormalized,
    lastMessageAtLabel: formatDateTimeRu(row.lastMessageAt, timeZone),
    lastMessageText: row.lastMessageText,
    lastMessagePreview: truncateText(row.lastMessageText),
    unreadFromUserCount: row.unreadFromUserCount,
    // #812: deep-link to the exact dialog (not just the chats tab) — Today KPI
    // «открыть переписку» must select this conversation, not land on an empty list.
    href: communicationsChatHref(row.conversationId),
  };
}

async function loadPeopleRealtimeStats(
  deps: DoctorTodayDashboardDeps,
  peopleRaw: ClientListItem[],
  unreadExerciseCommentsByPatientId: Map<string, number>,
): Promise<
  Map<
    string,
    {
      unreadMessagesCount: number;
      exerciseDoneTodayCount: number;
      newExerciseCommentsCount: number;
    }
  >
> {
  const out = new Map<
    string,
    {
      unreadMessagesCount: number;
      exerciseDoneTodayCount: number;
      newExerciseCommentsCount: number;
    }
  >();

  if (peopleRaw.length === 0) return out;

  const dayStartLocal = DateTime.now().setZone(deps.displayIana).startOf('day');
  const windowStartIso = dayStartLocal.toUTC().toISO()!;
  const windowEndIso = dayStartLocal.plus({ days: 1 }).toUTC().toISO()!;

  await Promise.all(
    peopleRaw.map(async (row) => {
      const patientUserId = row.userId.trim();
      if (!patientUserId) return;

      let unreadMessagesCount = 0;
      let exerciseDoneTodayCount = 0;
      const newExerciseCommentsCount =
        unreadExerciseCommentsByPatientId.get(patientUserId) ??
        row.unreadExerciseCommentsCount ??
        0;

      try {
        unreadMessagesCount = deps.messaging.doctorSupport.unreadFromPatient
          ? await deps.messaging.doctorSupport.unreadFromPatient(patientUserId, deps.organizationId)
          : 0;
      } catch {
        unreadMessagesCount = 0;
      }

      if (deps.treatmentProgramInstance && deps.programActionLog) {
        try {
          const allInstances =
            await deps.treatmentProgramInstance.listForPatientClinicalView(patientUserId);
          const instances = deps.organizationId
            ? allInstances.filter((instance) => instance.organizationId === deps.organizationId)
            : allInstances;
          const active = pickActivePlanInstance(instances);
          if (active) {
            const detail = await deps.treatmentProgramInstance.getInstanceById(active.id);
            if (deps.organizationId && detail.organizationId !== deps.organizationId) return;
            const activeExerciseItemIds = detail.stages.flatMap((stage) =>
              stage.items
                .filter((item) => item.status === 'active' && item.itemType === 'exercise')
                .map((item) => item.id),
            );
            if (activeExerciseItemIds.length > 0) {
              const counts = await deps.programActionLog.countDoneByItemInWindow({
                instanceId: active.id,
                patientUserId,
                windowStartIso,
                windowEndIso,
              });
              exerciseDoneTodayCount = activeExerciseItemIds.reduce(
                (sum, itemId) => sum + (counts[itemId] ?? 0),
                0,
              );
            }
          }
        } catch {
          exerciseDoneTodayCount = 0;
        }
      }

      out.set(patientUserId, {
        unreadMessagesCount,
        exerciseDoneTodayCount,
        newExerciseCommentsCount,
      });
    }),
  );

  return out;
}

export function getUpcomingAppointments(
  todayRows: AppointmentRow[],
  weekRows: AppointmentRow[],
  limit = 5,
): TodayAppointmentItem[] {
  const todayIds = new Set(todayRows.map((r) => r.id));
  const filtered = weekRows.filter((r) => !todayIds.has(r.id));

  const sorted = [...filtered].sort((a, b) => {
    const ta = a.recordAtIso ? Date.parse(a.recordAtIso) : Number.POSITIVE_INFINITY;
    const tb = b.recordAtIso ? Date.parse(b.recordAtIso) : Number.POSITIVE_INFINITY;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });

  return sorted.slice(0, limit).map(mapAppointmentToTodayItem);
}

export async function loadDoctorTodayDashboard(
  deps: DoctorTodayDashboardDeps,
  intakeService: OnlineIntakeService,
  audience: DoctorAppointmentsAudience | undefined,
  preferences: DoctorTodayPreferences,
): Promise<TodayDashboardData> {
  const scopedAudience: DoctorAppointmentsAudience = {
    excludedUserIds: audience?.excludedUserIds ?? [],
    organizationId: deps.organizationId,
  };
  const clientAudience = scopedAudience;
  const [
    todayRaw,
    weekRaw,
    monthRaw,
    newIntake,
    unreadConversations,
    unreadTotal,
    onSupportListRaw,
  ] = await Promise.all([
    // #9: use statsRange so cancelled appointments are included in today/week lists
    // (statsRange = same date window as range, but no status filter → includes cancelled)
    deps.doctorAppointments.listAppointmentsForSpecialist(
      { kind: 'statsRange', range: 'today' },
      scopedAudience,
    ),
    deps.doctorAppointments.listAppointmentsForSpecialist(
      { kind: 'statsRange', range: 'week' },
      scopedAudience,
    ),
    deps.loadMonthAppointments
      ? deps.loadMonthAppointments()
      : Promise.resolve([] as AppointmentRow[]),
    intakeService.listForDoctor({ status: 'new', limit: 3, offset: 0 }),
    deps.messaging.doctorSupport.listOpenConversations({
      unreadOnly: true,
      limit: 3,
      organizationId: deps.organizationId,
    }),
    deps.messaging.doctorSupport.unreadFromUsers({ organizationId: deps.organizationId }),
    deps.doctorClients.listClients(
      {
        supportStatus: 'on',
        organizationId: deps.organizationId,
        ...(deps.doctorUserId ? { viewerUserId: deps.doctorUserId } : {}),
      },
      clientAudience,
    ),
  ]);

  const peopleListRaw =
    preferences.peopleListMode === 'recent_visits'
      ? await deps.doctorClients.listClients(
          {
            organizationId: deps.organizationId,
            onlyWithAppointmentRecords: true,
            ...(deps.doctorUserId ? { viewerUserId: deps.doctorUserId } : {}),
          },
          clientAudience,
        )
      : onSupportListRaw;
  const peopleSorted = [...peopleListRaw]
    .filter(
      (row) => preferences.peopleListMode !== 'recent_visits' || row.lastAppointmentAt != null,
    )
    .sort((a, b) => {
      if (preferences.peopleListMode === 'recent_visits') {
        const byVisit =
          Date.parse(b.lastAppointmentAt ?? '') - Date.parse(a.lastAppointmentAt ?? '');
        if (byVisit !== 0 && !Number.isNaN(byVisit)) return byVisit;
      }
      return a.displayName.localeCompare(b.displayName, 'ru', { sensitivity: 'base' });
    });
  const peoplePreviewRaw = peopleSorted.slice(0, DOCTOR_TODAY_ON_SUPPORT_PREVIEW_LIMIT);
  const people = peoplePreviewRaw.map(mapClientToTodayItem);
  const peopleCount = peopleSorted.length;
  const peopleListTruncated = peopleCount > people.length;

  const [globalOpenTasks, pendingTestsResult, proactiveResult, exerciseCommentAttention] =
    await Promise.all([
      // §1.3: грузим ВСЕ открытые задачи владельца (без лимита, без фильтра по patientUserId —
      // owner punch-list 2026-07-25 item 1: раньше `patientUserId: null` скрывал задачи,
      // привязанные к пациенту, отсюда полностью).
      deps.specialistTasks && deps.specialistOwnerUserId
        ? deps.specialistTasks.listForOwner({
            ownerUserId: deps.specialistOwnerUserId,
            includeCompleted: false,
          })
        : Promise.resolve([] as SpecialistTaskRow[]),
      deps.treatmentProgramProgress
        ? Promise.all([
            deps.treatmentProgramProgress.countPendingTestEvaluationAttemptsGlobal(
              deps.organizationId,
            ),
            deps.treatmentProgramProgress.listPendingTestEvaluationsGlobal(
              deps.organizationId,
              DOCTOR_TODAY_PENDING_TESTS_PREVIEW_LIMIT,
            ),
          ])
        : Promise.resolve([0, []] as const),
      deps.doctorProactiveInsights && preferences.visibleProactiveInsightKinds.length > 0
        ? deps.doctorProactiveInsights.queryInsights({
            limit: DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT,
            displayIana: deps.displayIana,
            organizationId: deps.organizationId,
            kinds: preferences.visibleProactiveInsightKinds,
          })
        : Promise.resolve({ items: [], totalCount: 0 }),
      loadDoctorExerciseCommentAttention(deps, onSupportListRaw),
    ]);

  const unreadExerciseCommentsByPatientId = new Map<string, number>();
  for (const row of exerciseCommentAttention.items) {
    const prev = unreadExerciseCommentsByPatientId.get(row.patientUserId) ?? 0;
    unreadExerciseCommentsByPatientId.set(row.patientUserId, prev + 1);
  }
  const peopleRealtimeStats = await loadPeopleRealtimeStats(
    deps,
    peoplePreviewRaw,
    unreadExerciseCommentsByPatientId,
  );
  const peopleWithStats = people.map((client) => {
    const stats = peopleRealtimeStats.get(client.userId);
    if (!stats) return client;
    return {
      ...client,
      unreadMessagesCount: stats.unreadMessagesCount,
      exerciseDoneTodayCount: stats.exerciseDoneTodayCount,
      newExerciseCommentsCount: stats.newExerciseCommentsCount,
    };
  });

  const [pendingProgramTestsTotal, pendingRows] = pendingTestsResult;
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  const pendingProgramTests = mapPendingProgramTestsForToday(pendingRows, appDisplayTimeZone);
  const pendingProgramTestsTruncated =
    pendingProgramTestsTotal > DOCTOR_TODAY_PENDING_TESTS_PREVIEW_LIMIT;
  const proactiveInsights = mapProactiveInsightsForToday(proactiveResult.items);
  const proactiveInsightsTotal = proactiveResult.totalCount;
  const proactiveInsightsTruncated =
    proactiveInsightsTotal > DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT;

  return {
    todayAppointments: todayRaw.map(mapAppointmentToTodayItem),
    weekAppointments: weekRaw.map(mapAppointmentToTodayItem),
    monthAppointments: monthRaw.map(mapAppointmentToTodayItem),
    newIntakeRequests: newIntake.items.map((row) => mapIntakeToTodayItem(row, appDisplayTimeZone)),
    unreadConversations: unreadConversations.map((row) =>
      mapConversationToTodayItem(row, appDisplayTimeZone),
    ),
    unreadTotal,
    upcomingAppointments: getUpcomingAppointments(todayRaw, weekRaw, 5),
    peopleListMode: preferences.peopleListMode,
    peopleCount,
    people: peopleWithStats,
    peopleListTruncated,
    globalOpenTasks,
    globalOpenTasksTotal: globalOpenTasks.length,
    pendingProgramTests,
    pendingProgramTestsTotal,
    pendingProgramTestsTruncated,
    proactiveInsights,
    proactiveInsightsTotal,
    proactiveInsightsTruncated,
    visibleProactiveInsightKinds: preferences.visibleProactiveInsightKinds,
    exerciseCommentAttentionItems: exerciseCommentAttention.items,
    exerciseCommentAttentionTotal: exerciseCommentAttention.total,
    exerciseCommentAttentionTruncated: exerciseCommentAttention.truncated,
  };
}
