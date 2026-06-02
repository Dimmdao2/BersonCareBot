/** Счётчики Action Strip и plan-not-opened для карточки клиента врача (фаза 2B). */
export type DoctorClientProgramCardAggregates = {
  newCommentsCount: number;
  patientMediaCount: number;
  planNotOpened: boolean;
  lastPlanMutationEventAt: string | null;
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
  "doctor-client-section-support": "overview",
  "doctor-client-section-treatment-programs": "program",
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
