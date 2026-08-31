import type {
  AppointmentRow,
  DoctorAppointmentsAudience,
  DoctorAppointmentsListFilter,
} from '@/modules/doctor-appointments/ports';
import type { BookingCalendarService } from '@/modules/booking-calendar/ports';
import type { CalendarAppointmentEvent } from '@/modules/booking-calendar/types';
import { isCancelledAppointmentStatus } from '@/modules/booking-calendar/appointmentStatusLabels';
import type { ClientHistoryService } from '@/modules/client-history/service';
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
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';
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
import { patientCardHref } from './patients/patientCardHref';
import { communicationsChatHref } from './communications/doctorCommunicationsTabs';
import { formatDateTimeRu, truncateText } from './doctorTodayFormat';
import {
  loadDoctorExerciseCommentAttention,
  type TodayExerciseCommentAttentionItem,
} from './loadDoctorExerciseCommentAttention';
import { loadDoctorOpenTasks } from './loadDoctorOpenTasks';

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
  bookingCalendar?: Pick<BookingCalendarService, 'listAppointmentsInRange'>;
  clientHistory?: Pick<ClientHistoryService, 'listAppointmentComments'>;
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
  visibilityActor: PatientVisibilityActor;
  treatmentProgramProgress?: TreatmentProgramProgressService;
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
        visibilityActor: PatientVisibilityActor;
      }): Promise<TodayConversationSourceRow[]>;
      unreadFromUsers(params: {
        organizationId?: string;
        visibilityActor: PatientVisibilityActor;
      }): Promise<number>;
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

export type TodayNextAppointmentItem = {
  id: string;
  startAt: string;
  endAt: string;
  visitDate: string;
  dateTimeLabel: string;
  relativeLabel: string;
  isCurrent: boolean;
  clientLabel: string;
  clientUserId: string | null;
  comment: string | null;
  wasRescheduled: boolean;
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

export type TodayWeeklyTimelinePoint = {
  weekStart: string;
  label: string;
  firstAppointments: number;
  appointments: number;
  isCurrent: boolean;
  period: 'past' | 'current' | 'future';
};

export type TodayDashboardData = {
  todayAppointments: TodayAppointmentItem[];
  nextAppointment: TodayNextAppointmentItem | null;
  /** All appointments this week (incl. today) for SEG-04 week modal. */
  weekAppointments: TodayAppointmentItem[];
  /** All appointments in calendar month for SEG-04 month modal. */
  monthAppointments: TodayAppointmentItem[];
  unreadConversations: TodayUnreadConversationItem[];
  unreadTotal: number;
  upcomingAppointments: TodayAppointmentItem[];
  peopleListMode: DoctorTodayPeopleListMode;
  peopleCount: number;
  people: TodayPeopleItem[];
  peopleListTruncated: boolean;
  onSupportPeopleCount: number;
  onSupportPeople: TodayPeopleItem[];
  onSupportPeopleListTruncated: boolean;
  globalOpenTasks: SpecialistTaskRow[];
  /** Patient FIO for task rows, resolved through the scoped doctor-clients read path. */
  globalTaskPatientNames: Record<string, string>;
  /** Общее количество открытых задач (§1.3). */
  globalOpenTasksTotal: number;
  pendingProgramTests: TodayPendingProgramTestItem[];
  pendingProgramTestsTotal: number;
  pendingProgramTestsTruncated: boolean;
  exerciseCommentAttentionItems: TodayExerciseCommentAttentionItem[];
  exerciseCommentAttentionTotal: number;
  exerciseCommentAttentionTruncated: boolean;
  weeklyTimeline: TodayWeeklyTimelinePoint[];
  currentWeekAppointments: TodayAppointmentItem[];
  currentWeekFirstAppointments: TodayAppointmentItem[];
};

const NEXT_APPOINTMENT_ACTIVE_STATUSES = new Set([
  'created',
  'awaiting_payment',
  'paid',
  'confirmed',
  'rescheduled',
  'manual_review_required',
]);

function pluralRu(value: number, one: string, few: string, many: string): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function parseAppointmentDateTime(value: string): DateTime {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? DateTime.invalid('Invalid appointment date')
    : DateTime.fromMillis(timestamp);
}

function timelineClientKey(row: AppointmentRow): string | null {
  const userId = row.clientUserId.trim();
  if (userId) return `user:${userId}`;
  const label = row.clientLabel.trim().toLocaleLowerCase('ru');
  return label && label !== 'неизвестный клиент' ? `label:${label}` : null;
}

function formatTimelineWeekLabel(week: DateTime): string {
  const weekEnd = week.plus({ weeks: 1 });
  return week.hasSame(weekEnd, 'month')
    ? `${week.toFormat('dd')}–${weekEnd.toFormat('dd.LL')}`
    : `${week.toFormat('dd.LL')}–${weekEnd.toFormat('dd.LL')}`;
}

export function buildTodayWeeklyTimeline(
  rows: AppointmentRow[],
  displayIana: string,
  now = DateTime.now(),
): TodayWeeklyTimelinePoint[] {
  const currentWeek = now.setZone(displayIana).startOf('week');
  const eligible = rows
    .flatMap((row) => {
      if (!row.recordAtIso || isCancelledAppointmentStatus(row.rawStatus ?? row.status)) {
        return [];
      }
      const recordAt = parseAppointmentDateTime(row.recordAtIso).setZone(displayIana);
      if (!recordAt.isValid) return [];
      return [{ row, week: recordAt.startOf('week') }];
    })
    .sort((left, right) => left.week.toMillis() - right.week.toMillis());

  const appointmentsByWeek = new Map<string, number>();
  const firstWeekByClient = new Map<string, string>();

  for (const { row, week } of eligible) {
    const weekKey = week.toISODate();
    if (!weekKey) continue;
    appointmentsByWeek.set(weekKey, (appointmentsByWeek.get(weekKey) ?? 0) + 1);
    const clientKey = timelineClientKey(row);
    if (!clientKey || firstWeekByClient.has(clientKey)) continue;
    firstWeekByClient.set(clientKey, weekKey);
  }

  const clientsStartingByWeek = new Map<string, number>();
  for (const weekKey of firstWeekByClient.values()) {
    clientsStartingByWeek.set(weekKey, (clientsStartingByWeek.get(weekKey) ?? 0) + 1);
  }

  const points = Array.from(appointmentsByWeek.keys())
    .sort()
    .flatMap((weekStart) => {
      const week = DateTime.fromISO(weekStart, { zone: displayIana });
      if (!week.isValid) return [];
      const isCurrent = week.hasSame(currentWeek, 'day');
      return [
        {
          weekStart,
          label: formatTimelineWeekLabel(week),
          firstAppointments: clientsStartingByWeek.get(weekStart) ?? 0,
          appointments: appointmentsByWeek.get(weekStart) ?? 0,
          isCurrent,
          period: isCurrent ? 'current' : week < currentWeek ? 'past' : 'future',
        } satisfies TodayWeeklyTimelinePoint,
      ];
    });

  if (!points.some((point) => point.period === 'future')) {
    const nextWeek = currentWeek.plus({ weeks: 1 });
    const weekStart = nextWeek.toISODate();
    if (weekStart) {
      points.push({
        weekStart,
        label: formatTimelineWeekLabel(nextWeek),
        firstAppointments: 0,
        appointments: 0,
        isCurrent: false,
        period: 'future',
      });
      points.sort((left, right) => left.weekStart.localeCompare(right.weekStart));
    }
  }

  return points;
}

function buildCurrentWeekAppointmentLists(
  rows: AppointmentRow[],
  displayIana: string,
  now = DateTime.now(),
): {
  appointments: TodayAppointmentItem[];
  firstAppointments: TodayAppointmentItem[];
} {
  const currentWeekKey = now.setZone(displayIana).startOf('week').toISODate();
  const eligible = rows
    .flatMap((row) => {
      if (!row.recordAtIso || isCancelledAppointmentStatus(row.rawStatus ?? row.status)) return [];
      const recordAt = parseAppointmentDateTime(row.recordAtIso).setZone(displayIana);
      const weekKey = recordAt.isValid ? recordAt.startOf('week').toISODate() : null;
      return weekKey ? [{ row, weekKey }] : [];
    })
    .sort((left, right) => (left.row.recordAtIso ?? '').localeCompare(right.row.recordAtIso ?? ''));
  const firstWeekByClient = new Map<string, string>();
  for (const { row, weekKey } of eligible) {
    const clientKey = timelineClientKey(row);
    if (clientKey && !firstWeekByClient.has(clientKey)) firstWeekByClient.set(clientKey, weekKey);
  }
  const current = eligible.filter(({ weekKey }) => weekKey === currentWeekKey);
  return {
    appointments: current.map(({ row }) => mapAppointmentToTodayItem(row)),
    firstAppointments: current
      .filter(({ row, weekKey }) => {
        const clientKey = timelineClientKey(row);
        return clientKey != null && firstWeekByClient.get(clientKey) === weekKey;
      })
      .map(({ row }) => mapAppointmentToTodayItem(row)),
  };
}

export function formatNextAppointmentRelative(startAt: string, nowIso: string): string {
  const start = parseAppointmentDateTime(startAt);
  const now = parseAppointmentDateTime(nowIso);
  if (!start.isValid || !now.isValid) return '';
  const diffHours = Math.max(0, start.diff(now, 'hours').hours);
  if (diffHours < 24) {
    const hours = Math.max(1, Math.ceil(diffHours));
    return `через ${hours} ${pluralRu(hours, 'час', 'часа', 'часов')}`;
  }
  const days = Math.max(1, Math.ceil(diffHours / 24));
  return `через ${days} ${pluralRu(days, 'день', 'дня', 'дней')}`;
}

function mapNextAppointment(
  event: CalendarAppointmentEvent,
  comment: string | null,
  now: DateTime,
  displayIana: string,
): TodayNextAppointmentItem {
  const start = parseAppointmentDateTime(event.startAt);
  const end = parseAppointmentDateTime(event.endAt);
  const isCurrent =
    start.isValid &&
    end.isValid &&
    start.toMillis() <= now.toMillis() &&
    now.toMillis() < end.toMillis();
  const fallbackComment = event.formComments
    .map((item) => `${item.label}: ${item.value}`)
    .join(' · ')
    .trim();
  return {
    id: event.id,
    startAt: event.startAt,
    endAt: event.endAt,
    visitDate: start.isValid
      ? (start.setZone(displayIana).toISODate() ?? event.startAt.slice(0, 10))
      : event.startAt.slice(0, 10),
    dateTimeLabel: start.isValid
      ? start.setZone(displayIana).setLocale('ru').toFormat('d MMMM, HH:mm')
      : '—',
    relativeLabel: isCurrent ? '' : formatNextAppointmentRelative(event.startAt, now.toISO()!),
    isCurrent,
    clientLabel: event.patientName?.trim() || event.patientPhone?.trim() || 'Клиент не указан',
    clientUserId: event.platformUserId,
    comment: comment?.trim() || fallbackComment || null,
    wasRescheduled: event.rescheduleCount > 0,
  };
}

async function loadCurrentOrNextAppointment(
  deps: DoctorTodayDashboardDeps,
  futureRows: AppointmentRow[],
  excludedUserIds: readonly string[],
): Promise<TodayNextAppointmentItem | null> {
  if (!deps.bookingCalendar) return null;

  const now = DateTime.now().toUTC();
  const nowIso = now.toISO();
  if (!nowIso) return null;
  const specialistId = deps.visibilityActor.canManageAllSpecialists
    ? null
    : deps.visibilityActor.specialistId;

  const readEvents = (rangeStart: string, rangeEnd: string) =>
    deps.bookingCalendar!.listAppointmentsInRange({
      organizationId: deps.organizationId,
      rangeStart,
      rangeEnd,
      timeZone: deps.displayIana,
      specialistId,
    });

  const excludedUsers = new Set(excludedUserIds);
  const activeEvents = await readEvents(nowIso, nowIso);
  let selected = activeEvents.find(
    (event) =>
      (!event.platformUserId || !excludedUsers.has(event.platformUserId)) &&
      NEXT_APPOINTMENT_ACTIVE_STATUSES.has(event.status) &&
      Date.parse(event.startAt) <= now.toMillis() &&
      now.toMillis() < Date.parse(event.endAt),
  );

  if (!selected) {
    const nextRow = futureRows.find((row) => row.recordAtIso != null);
    if (!nextRow?.recordAtIso) return null;
    const events = await readEvents(nextRow.recordAtIso, nextRow.recordAtIso);
    selected = events.find(
      (event) => event.id === nextRow.id && NEXT_APPOINTMENT_ACTIVE_STATUSES.has(event.status),
    );
  }

  if (!selected) return null;
  const comments = deps.clientHistory
    ? await deps.clientHistory.listAppointmentComments(deps.organizationId, selected.id)
    : [];
  return mapNextAppointment(selected, comments[0]?.body ?? null, now, deps.displayIana);
}

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
  audience: DoctorAppointmentsAudience | undefined,
  preferences: DoctorTodayPreferences,
): Promise<TodayDashboardData> {
  const scopedAudience: DoctorAppointmentsAudience = {
    excludedUserIds: audience?.excludedUserIds ?? [],
    organizationId: deps.organizationId,
    visibilityActor: deps.visibilityActor,
  };
  const clientAudience = scopedAudience;
  const [todayRaw, futureRaw, timelineRaw, unreadConversations, unreadTotal, onSupportListRaw] =
    await Promise.all([
      // The stats range contains cancellations; the dashboard filters them below so every
      // Today surface (KPI, list and compact calendar) uses the same active-only collection.
      deps.doctorAppointments.listAppointmentsForSpecialist(
        { kind: 'statsRange', range: 'today' },
        scopedAudience,
      ),
      deps.doctorAppointments.listAppointmentsForSpecialist(
        { kind: 'futureActive' },
        scopedAudience,
      ),
      deps.doctorAppointments.listAppointmentsForSpecialist({ kind: 'timeline' }, scopedAudience),
      deps.messaging.doctorSupport.listOpenConversations({
        unreadOnly: true,
        limit: 3,
        organizationId: deps.organizationId,
        visibilityActor: deps.visibilityActor,
      }),
      deps.messaging.doctorSupport.unreadFromUsers({
        organizationId: deps.organizationId,
        visibilityActor: deps.visibilityActor,
      }),
      deps.doctorClients.listClients(
        {
          supportStatus: 'on',
          organizationId: deps.organizationId,
          visibilityActor: deps.visibilityActor,
          ...(deps.doctorUserId ? { viewerUserId: deps.doctorUserId } : {}),
        },
        clientAudience,
      ),
    ]);

  const activeTodayRaw = todayRaw.filter(
    (row) => !isCancelledAppointmentStatus(row.rawStatus ?? row.status),
  );

  // Week/month lists are only needed for the owner-deferred right KPI row.
  // Keep empty arrays on the first-screen path to avoid extra appointment scans.
  const weekRaw: AppointmentRow[] = [];
  const monthRaw: AppointmentRow[] = [];

  const peopleListRaw =
    preferences.peopleListMode === 'recent_visits'
      ? await deps.doctorClients.listClients(
          {
            organizationId: deps.organizationId,
            visibilityActor: deps.visibilityActor,
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
  const onSupportSorted = [...onSupportListRaw].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'ru', { sensitivity: 'base' }),
  );
  const onSupportPreviewRaw = onSupportSorted.slice(0, DOCTOR_TODAY_ON_SUPPORT_PREVIEW_LIMIT);
  const onSupportPeople = onSupportPreviewRaw.map(mapClientToTodayItem);
  const onSupportPeopleCount = onSupportSorted.length;
  const onSupportPeopleListTruncated = onSupportPeopleCount > onSupportPeople.length;

  const [openTasksData, pendingTestsResult, exerciseCommentAttention, nextAppointment] =
    await Promise.all([
      // §1.3: грузим ВСЕ открытые задачи владельца (без лимита, без фильтра по patientUserId —
      // owner punch-list 2026-07-25 item 1: раньше `patientUserId: null` скрывал задачи,
      // привязанные к пациенту, отсюда полностью).
      loadDoctorOpenTasks({
        specialistTasks: deps.specialistTasks,
        ownerUserId: deps.specialistOwnerUserId,
        doctorClients: deps.doctorClients,
        doctorUserId: deps.doctorUserId,
        organizationId: deps.organizationId,
        visibilityActor: deps.visibilityActor,
        audience,
      }),
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
      loadDoctorExerciseCommentAttention(deps, onSupportListRaw),
      loadCurrentOrNextAppointment(deps, futureRaw, scopedAudience.excludedUserIds ?? []),
    ]);

  const unreadExerciseCommentsByPatientId = new Map<string, number>();
  for (const row of exerciseCommentAttention.items) {
    const prev = unreadExerciseCommentsByPatientId.get(row.patientUserId) ?? 0;
    unreadExerciseCommentsByPatientId.set(row.patientUserId, prev + 1);
  }
  const realtimePreviewRows = Array.from(
    new Map([...peoplePreviewRaw, ...onSupportPreviewRaw].map((row) => [row.userId, row])).values(),
  );
  const peopleRealtimeStats = await loadPeopleRealtimeStats(
    deps,
    realtimePreviewRows,
    unreadExerciseCommentsByPatientId,
  );
  const attachRealtimeStats = (client: TodayPeopleItem): TodayPeopleItem => {
    const stats = peopleRealtimeStats.get(client.userId);
    if (!stats) return client;
    return {
      ...client,
      unreadMessagesCount: stats.unreadMessagesCount,
      exerciseDoneTodayCount: stats.exerciseDoneTodayCount,
      newExerciseCommentsCount: stats.newExerciseCommentsCount,
    };
  };
  const peopleWithStats = people.map(attachRealtimeStats);
  const onSupportPeopleWithStats = onSupportPeople.map(attachRealtimeStats);

  const globalOpenTasks = openTasksData.tasks;
  const globalTaskPatientNames = openTasksData.patientNames;

  const [pendingProgramTestsTotal, pendingRows] = pendingTestsResult;
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  const pendingProgramTests = mapPendingProgramTestsForToday(pendingRows, appDisplayTimeZone);
  const pendingProgramTestsTruncated =
    pendingProgramTestsTotal > DOCTOR_TODAY_PENDING_TESTS_PREVIEW_LIMIT;
  const currentWeekLists = buildCurrentWeekAppointmentLists(timelineRaw, deps.displayIana);

  return {
    todayAppointments: activeTodayRaw.map(mapAppointmentToTodayItem),
    nextAppointment,
    weekAppointments: weekRaw.map(mapAppointmentToTodayItem),
    monthAppointments: monthRaw.map(mapAppointmentToTodayItem),
    unreadConversations: unreadConversations.map((row) =>
      mapConversationToTodayItem(row, appDisplayTimeZone),
    ),
    unreadTotal,
    upcomingAppointments: getUpcomingAppointments(activeTodayRaw, weekRaw, 5),
    peopleListMode: preferences.peopleListMode,
    peopleCount,
    people: peopleWithStats,
    peopleListTruncated,
    onSupportPeopleCount,
    onSupportPeople: onSupportPeopleWithStats,
    onSupportPeopleListTruncated,
    globalOpenTasks,
    globalTaskPatientNames,
    globalOpenTasksTotal: globalOpenTasks.length,
    pendingProgramTests,
    pendingProgramTestsTotal,
    pendingProgramTestsTruncated,
    exerciseCommentAttentionItems: exerciseCommentAttention.items,
    exerciseCommentAttentionTotal: exerciseCommentAttention.total,
    exerciseCommentAttentionTruncated: exerciseCommentAttention.truncated,
    weeklyTimeline: buildTodayWeeklyTimeline(timelineRaw, deps.displayIana),
    currentWeekAppointments: currentWeekLists.appointments,
    currentWeekFirstAppointments: currentWeekLists.firstAppointments,
  };
}
