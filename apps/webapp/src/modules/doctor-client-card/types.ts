import type { SpecialistTaskPatientSummary } from "@/modules/specialist-tasks/types";

export type { SpecialistTaskPatientSummary as DoctorClientTaskSummary };

/** Счётчики Action Strip и plan-not-opened для карточки клиента врача (фаза 2B). */
export type DoctorClientProgramCardAggregates = {
  newCommentsCount: number;
  patientMediaCount: number;
  planNotOpened: boolean;
  lastPlanMutationEventAt: string | null;
};

/** Элемент текущего этапа на «Обзоре» (снимок для static-превью на клиенте). */
export type DoctorClientOverviewCarePlanItem = {
  id: string;
  title: string;
  isNew: boolean;
  itemType: string;
  itemRefId: string;
  snapshot: Record<string, unknown>;
};

/** Care Plan summary на табе «Обзор» (активный инстанс + текущий этап). */
export type DoctorClientOverviewCarePlanModel = {
  instanceId: string;
  instanceTitle: string;
  stageId: string;
  stageTitle: string;
  goals: string | null;
  objectives: string | null;
  expectedDurationText: string | null;
  completedStages: number;
  totalStages: number;
  items: DoctorClientOverviewCarePlanItem[];
};

/** Строка program inbox на табе «Программа» (комментарий/медиа без ответа врача). */
export type DoctorClientProgramInboxRow = {
  stageItemId: string;
  instanceId: string;
  title: string;
  kind: "comment" | "media";
};

export type DoctorClientRecentProgramChangeRow = {
  id: string;
  createdAt: string;
  summary: string;
};

export type DoctorClientProgramCardData = {
  aggregates: DoctorClientProgramCardAggregates;
  carePlan: DoctorClientOverviewCarePlanModel | null;
  programInbox: DoctorClientProgramInboxRow[];
  recentProgramChanges: DoctorClientRecentProgramChangeRow[];
};

export const DOCTOR_CLIENT_TAB_IDS = [
  "overview",
  "program",
  "communications",
  "records",
  "account",
] as const;

export type DoctorClientTabId = (typeof DOCTOR_CLIENT_TAB_IDS)[number];

/** Якорь секции → активный таб (§8 CARD_REDESIGN_PLAN). */
export const DOCTOR_CLIENT_ANCHOR_TO_TAB: Record<string, DoctorClientTabId> = {
  "doctor-client-section-notes": "overview",
  "doctor-client-section-tasks": "overview",
  "doctor-client-section-wellbeing": "overview",
  "doctor-client-section-proactive-signals": "overview",
  "doctor-client-section-support": "overview",
  "doctor-client-section-treatment-programs": "program",
  "doctor-client-section-program-inbox": "program",
  "doctor-client-section-pending-program-tests": "program",
  "doctor-client-section-lfk": "account",
  "doctor-client-section-symptoms": "records",
  "doctor-client-section-appointments": "records",
  "doctor-client-section-appointment-history": "records",
  "doctor-client-section-booking-history": "records",
  "doctor-client-section-communications": "communications",
  "doctor-client-section-contacts": "account",
  "doctor-client-section-lifecycle": "account",
  "doctor-client-section-subscriber": "account",
};
