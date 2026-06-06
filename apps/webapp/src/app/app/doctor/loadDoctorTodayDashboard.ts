import type {
  AppointmentRow,
  DoctorAppointmentsAudience,
  DoctorAppointmentsListFilter,
} from "@/modules/doctor-appointments/ports";
import type {
  ClientListItem,
  DoctorClientsFilters,
  DoctorDashboardPatientMetrics,
} from "@/modules/doctor-clients/ports";
import type { SpecialistTaskRow } from "@/modules/specialist-tasks/types";
import type { SpecialistTasksService } from "@/modules/specialist-tasks/service";
import type { TreatmentProgramProgressService } from "@/modules/treatment-program/progress-service";
import { pickActivePlanInstance } from "@/modules/treatment-program/pickActivePlanInstance";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceSummary,
} from "@/modules/treatment-program/types";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import type { OnlineIntakeService } from "@/modules/online-intake/ports";
import type { IntakeRequestWithPatientIdentity, IntakeType } from "@/modules/online-intake/types";
import type { DoctorProactiveInsightsPort } from "@/modules/doctor-proactive-insights/ports";
import { DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT } from "@/modules/doctor-proactive-insights/constants";
import { DateTime } from "luxon";
import {
  DOCTOR_TODAY_PENDING_TESTS_PREVIEW_LIMIT,
  mapPendingProgramTestsForToday,
  type TodayPendingProgramTestItem,
} from "./mapPendingProgramTestsForToday";
import {
  mapProactiveInsightsForToday,
  type TodayProactiveInsightItem,
} from "./mapProactiveInsightsForToday";
import {
  DOCTOR_CLIENT_PROGRAM_SECTION_ANCHOR,
  doctorClientProfileHref,
} from "./clients/doctorClientProfileHref";
import { doctorClientTreatmentProgramInstanceHref } from "./clients/doctorClientInstanceHref";

/** Сколько карточек клиентов показывать на «Сегодня»; полный список — `/app/doctor/clients?scope=all&support=on`. */
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
      direction: "backward" | "forward";
      cursor: null;
    }): Promise<ProgramItemDiscussionMessage[]>;
    getLastReadAtForViewer(input: { viewerUserId: string; stageItemId: string }): Promise<string | null>;
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
      }): Promise<TodayConversationSourceRow[]>;
      unreadFromUsers(): Promise<number>;
      unreadFromPatient?: (platformUserId: string) => Promise<number>;
    };
  };
};

export type TodayAppointmentItem = {
  id: string;
  time: string;
  clientLabel: string;
  /** Имя из Rubitime при расхождении с профилем; иначе `null`. */
  rubitimeNameIfDifferent: string | null;
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

export type TodayOnSupportClientItem = {
  userId: string;
  displayName: string;
  href: string;
  unreadMessagesCount: number;
  exerciseDoneTodayCount: number;
  newExerciseCommentsCount: number;
};

export type TodayExerciseCommentAttentionItem = {
  patientUserId: string;
  patientDisplayName: string;
  instanceId: string;
  stageItemId: string;
  stageItemTitle: string;
  latestMessage: ProgramItemDiscussionMessage;
  latestMessageAtLabel: string;
  href: string;
};

export type TodayDashboardData = {
  todayAppointments: TodayAppointmentItem[];
  newIntakeRequests: TodayIntakeItem[];
  unreadConversations: TodayUnreadConversationItem[];
  unreadTotal: number;
  upcomingAppointments: TodayAppointmentItem[];
  /** Семантика: `doctor_patient_support.on_support = true`. */
  onSupportCount: number;
  onSupportClients: TodayOnSupportClientItem[];
  onSupportListTruncated: boolean;
  globalOpenTasks: SpecialistTaskRow[];
  pendingProgramTests: TodayPendingProgramTestItem[];
  pendingProgramTestsTotal: number;
  pendingProgramTestsTruncated: boolean;
  proactiveInsights: TodayProactiveInsightItem[];
  proactiveInsightsTotal: number;
  proactiveInsightsTruncated: boolean;
  exerciseCommentAttentionItems: TodayExerciseCommentAttentionItem[];
  exerciseCommentAttentionTotal: number;
  exerciseCommentAttentionTruncated: boolean;
};

const INTAKE_TYPE_LABELS: Record<IntakeType, string> = {
  lfk: "ЛФК",
  nutrition: "Нутрициология",
};

const MESSAGES_HREF = "/app/doctor/messages";

export const ON_SUPPORT_LIST_HREF = "/app/doctor/clients?scope=all&support=on";

export const PROGRAM_WITHOUT_SUPPORT_LIST_HREF =
  "/app/doctor/clients?scope=all&support=programWithoutSupport";

const TEXT_PREVIEW_MAX = 160;
export const DOCTOR_TODAY_EXERCISE_COMMENTS_PREVIEW_LIMIT = 30;

export function truncateText(text: string | null | undefined, max = TEXT_PREVIEW_MAX): string | null {
  if (text == null || text === "") return null;
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function formatDateTimeRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

export function mapAppointmentToTodayItem(row: AppointmentRow): TodayAppointmentItem {
  const uid = row.clientUserId?.trim() ?? "";
  const hasClient = uid.length > 0;
  return {
    id: row.id,
    time: row.time,
    clientLabel: row.clientLabel,
    rubitimeNameIfDifferent: row.rubitimeNameIfDifferent,
    clientUserId: hasClient ? uid : null,
    type: row.type,
    status: row.status,
    branchName: row.branchName,
    scheduleProvenancePrefix: row.scheduleProvenancePrefix ?? null,
    href: hasClient
      ? doctorClientProfileHref(uid, { profileListScope: "appointments" })
      : "/app/doctor/appointments",
    ctaLabel: hasClient ? "Открыть карточку" : "Открыть записи",
  };
}

export function mapIntakeToTodayItem(row: IntakeRequestWithPatientIdentity): TodayIntakeItem {
  const label = INTAKE_TYPE_LABELS[row.type] ?? row.type;
  const summaryPreview = truncateText(row.summary);
  return {
    id: row.id,
    patientName: row.patientName.trim() || "—",
    patientPhone: row.patientPhone.trim() || "—",
    typeLabel: label,
    summary: row.summary,
    summaryPreview,
    createdAtLabel: formatDateTimeRu(row.createdAt),
    href: `/app/doctor/online-intake/${encodeURIComponent(row.id)}`,
  };
}

export function mapOnSupportClientToTodayItem(row: ClientListItem): TodayOnSupportClientItem {
  const uid = row.userId.trim();
  return {
    userId: uid,
    displayName: row.displayName.trim() || "—",
    href: doctorClientProfileHref(uid, {
      profileListScope: "appointments",
      hash: DOCTOR_CLIENT_PROGRAM_SECTION_ANCHOR,
    }),
    unreadMessagesCount: 0,
    exerciseDoneTodayCount: 0,
    newExerciseCommentsCount: 0,
  };
}

export function mapConversationToTodayItem(row: TodayConversationSourceRow): TodayUnreadConversationItem {
  return {
    conversationId: row.conversationId,
    displayName: row.displayName.trim() || "—",
    phoneNormalized: row.phoneNormalized,
    lastMessageAtLabel: formatDateTimeRu(row.lastMessageAt),
    lastMessageText: row.lastMessageText,
    lastMessagePreview: truncateText(row.lastMessageText),
    unreadFromUserCount: row.unreadFromUserCount,
    href: MESSAGES_HREF,
  };
}

function stageItemSnapshotTitle(snapshot: Record<string, unknown>): string {
  const raw = snapshot.title;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "Упражнение";
}

async function loadTodayExerciseCommentAttention(
  deps: DoctorTodayDashboardDeps,
  onSupportListRaw: ClientListItem[],
): Promise<{
  items: TodayExerciseCommentAttentionItem[];
  total: number;
  truncated: boolean;
}> {
  if (
    !deps.programItemDiscussion ||
    !deps.treatmentProgramInstance ||
    !deps.doctorUserId ||
    onSupportListRaw.length === 0
  ) {
    return { items: [], total: 0, truncated: false };
  }

  const patientDisplayNameById = new Map<string, string>();
  for (const row of onSupportListRaw) {
    const uid = row.userId.trim();
    if (!uid) continue;
    patientDisplayNameById.set(uid, row.displayName.trim() || "—");
  }

  const perPatientRows = await Promise.all(
    [...patientDisplayNameById.keys()].map(async (patientUserId) => {
      try {
        const instances = await deps.treatmentProgramInstance!.listForPatientClinicalView(patientUserId);
        const active = pickActivePlanInstance(instances);
        if (!active) return [] as TodayExerciseCommentAttentionItem[];
        const detail = await deps.treatmentProgramInstance!.getInstanceById(active.id);
        const activeExerciseItems = detail.stages.flatMap((stage) =>
          stage.items.filter((item) => item.status === "active" && item.itemType === "exercise"),
        );
        if (activeExerciseItems.length === 0) return [] as TodayExerciseCommentAttentionItem[];

        const summary = await deps.programItemDiscussion!.listAttentionSummaryForStageItems(
          activeExerciseItems.map((item) => item.id),
        );
        const attentionStageItemIds = summary.filter((row) => row.comments > 0).map((row) => row.stageItemId);
        if (attentionStageItemIds.length === 0) return [] as TodayExerciseCommentAttentionItem[];

        const itemById = new Map(activeExerciseItems.map((item) => [item.id, item]));
        const rows = await Promise.all(
          attentionStageItemIds.map(async (stageItemId) => {
            const [latestList, lastReadAt] = await Promise.all([
              deps.programItemDiscussion!.listMessagesPage({
                stageItemId,
                limit: 1,
                direction: "backward",
                cursor: null,
              }),
              deps.programItemDiscussion!.getLastReadAtForViewer({
                viewerUserId: deps.doctorUserId!,
                stageItemId,
              }),
            ]);
            const latest = latestList[latestList.length - 1] ?? null;
            if (!latest || latest.senderRole !== "patient" || latest.mediaFileId) return null;
            if (lastReadAt && latest.createdAt <= lastReadAt) return null;
            const item = itemById.get(stageItemId);
            if (!item) return null;
            return {
              patientUserId,
              patientDisplayName: patientDisplayNameById.get(patientUserId) ?? "—",
              instanceId: active.id,
              stageItemId,
              stageItemTitle: stageItemSnapshotTitle(item.snapshot),
              latestMessage: latest,
              latestMessageAtLabel: formatDateTimeRu(latest.createdAt),
              href: doctorClientTreatmentProgramInstanceHref(patientUserId, active.id, {
                profileListScope: "appointments",
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

async function loadOnSupportRealtimeStats(
  deps: DoctorTodayDashboardDeps,
  onSupportListRaw: ClientListItem[],
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

  if (onSupportListRaw.length === 0) return out;

  const dayStartLocal = DateTime.now().setZone(deps.displayIana).startOf("day");
  const windowStartIso = dayStartLocal.toUTC().toISO()!;
  const windowEndIso = dayStartLocal.plus({ days: 1 }).toUTC().toISO()!;

  await Promise.all(
    onSupportListRaw.map(async (row) => {
      const patientUserId = row.userId.trim();
      if (!patientUserId) return;

      let unreadMessagesCount = 0;
      let exerciseDoneTodayCount = 0;
      const newExerciseCommentsCount = unreadExerciseCommentsByPatientId.get(patientUserId) ?? 0;

      try {
        unreadMessagesCount = deps.messaging.doctorSupport.unreadFromPatient
          ? await deps.messaging.doctorSupport.unreadFromPatient(patientUserId)
          : 0;
      } catch {
        unreadMessagesCount = 0;
      }

      if (deps.treatmentProgramInstance && deps.programActionLog) {
        try {
          const instances = await deps.treatmentProgramInstance.listForPatientClinicalView(patientUserId);
          const active = pickActivePlanInstance(instances);
          if (active) {
            const detail = await deps.treatmentProgramInstance.getInstanceById(active.id);
            const activeExerciseItemIds = detail.stages.flatMap((stage) =>
              stage.items
                .filter((item) => item.status === "active" && item.itemType === "exercise")
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
  audience?: DoctorAppointmentsAudience,
): Promise<TodayDashboardData> {
  const clientAudience = audience?.excludedUserIds?.length
    ? { excludedUserIds: audience.excludedUserIds }
    : undefined;
  const [
    todayRaw,
    weekRaw,
    newIntake,
    unreadConversations,
    unreadTotal,
    patientMetrics,
    onSupportListRaw,
  ] = await Promise.all([
    deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "today" }, audience),
    deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "range", range: "week" }, audience),
    intakeService.listForDoctor({ status: "new", limit: 3, offset: 0 }),
    deps.messaging.doctorSupport.listOpenConversations({ unreadOnly: true, limit: 3 }),
    deps.messaging.doctorSupport.unreadFromUsers(),
    deps.doctorClients.getDashboardPatientMetrics(clientAudience),
    deps.doctorClients.listClients({ supportStatus: "on" }, clientAudience),
  ]);

  const onSupportSorted = [...onSupportListRaw].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ru", { sensitivity: "base" }),
  );
  const onSupportClients = onSupportSorted
    .slice(0, DOCTOR_TODAY_ON_SUPPORT_PREVIEW_LIMIT)
    .map(mapOnSupportClientToTodayItem);
  const onSupportCount = patientMetrics.onSupportCount;
  const onSupportListTruncated = onSupportCount > onSupportClients.length;

  const [
    globalOpenTasks,
    pendingTestsResult,
    proactiveResult,
    exerciseCommentAttention,
  ] = await Promise.all([
    deps.specialistTasks && deps.specialistOwnerUserId
      ? deps.specialistTasks.listGlobalOpen(deps.specialistOwnerUserId, 8)
      : Promise.resolve([] as SpecialistTaskRow[]),
    deps.treatmentProgramProgress
      ? Promise.all([
          deps.treatmentProgramProgress.countPendingTestEvaluationAttemptsGlobal(),
          deps.treatmentProgramProgress.listPendingTestEvaluationsGlobal(DOCTOR_TODAY_PENDING_TESTS_PREVIEW_LIMIT),
        ])
      : Promise.resolve([0, []] as const),
    deps.doctorProactiveInsights
      ? deps.doctorProactiveInsights.queryInsights({
          limit: DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT,
          displayIana: deps.displayIana,
        })
      : Promise.resolve({ items: [], totalCount: 0 }),
    loadTodayExerciseCommentAttention(deps, onSupportListRaw),
  ]);

  const unreadExerciseCommentsByPatientId = new Map<string, number>();
  for (const row of exerciseCommentAttention.items) {
    const prev = unreadExerciseCommentsByPatientId.get(row.patientUserId) ?? 0;
    unreadExerciseCommentsByPatientId.set(row.patientUserId, prev + 1);
  }
  const onSupportRealtimeStats = await loadOnSupportRealtimeStats(
    deps,
    onSupportListRaw,
    unreadExerciseCommentsByPatientId,
  );
  const onSupportClientsWithStats = onSupportClients.map((client) => {
    const stats = onSupportRealtimeStats.get(client.userId);
    if (!stats) return client;
    return {
      ...client,
      unreadMessagesCount: stats.unreadMessagesCount,
      exerciseDoneTodayCount: stats.exerciseDoneTodayCount,
      newExerciseCommentsCount: stats.newExerciseCommentsCount,
    };
  });

  const [pendingProgramTestsTotal, pendingRows] = pendingTestsResult;
  const pendingProgramTests = mapPendingProgramTestsForToday(pendingRows);
  const pendingProgramTestsTruncated = pendingProgramTestsTotal > DOCTOR_TODAY_PENDING_TESTS_PREVIEW_LIMIT;
  const proactiveInsights = mapProactiveInsightsForToday(proactiveResult.items);
  const proactiveInsightsTotal = proactiveResult.totalCount;
  const proactiveInsightsTruncated =
    proactiveInsightsTotal > DOCTOR_TODAY_PROACTIVE_INSIGHTS_PREVIEW_LIMIT;

  return {
    todayAppointments: todayRaw.map(mapAppointmentToTodayItem),
    newIntakeRequests: newIntake.items.map(mapIntakeToTodayItem),
    unreadConversations: unreadConversations.map(mapConversationToTodayItem),
    unreadTotal,
    upcomingAppointments: getUpcomingAppointments(todayRaw, weekRaw, 5),
    onSupportCount,
    onSupportClients: onSupportClientsWithStats,
    onSupportListTruncated,
    globalOpenTasks,
    pendingProgramTests,
    pendingProgramTestsTotal,
    pendingProgramTestsTruncated,
    proactiveInsights,
    proactiveInsightsTotal,
    proactiveInsightsTruncated,
    exerciseCommentAttentionItems: exerciseCommentAttention.items,
    exerciseCommentAttentionTotal: exerciseCommentAttention.total,
    exerciseCommentAttentionTruncated: exerciseCommentAttention.truncated,
  };
}
