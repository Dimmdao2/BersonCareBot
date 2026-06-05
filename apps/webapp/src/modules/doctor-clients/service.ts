import type { AppointmentSummary } from "@/modules/appointments/service";
import type { ChannelCard } from "@/modules/channel-preferences/types";
import type { LfkComplex, LfkSession, SymptomEntry, SymptomTracking } from "@/modules/diaries/types";
import type { DoctorSupplementaryContact } from "@/modules/platform-user-contacts/bookingContactUpsert";
import type { DoctorClientsFilters, DoctorClientsPort } from "./ports";
import type { ClientIdentity, ClientListItem, PatientProgramInteractionPolicy } from "./ports";
import type { ClientSupportProfile } from "./supportPolicy";
import {
  parseDoctorSupportDefaultEnabled,
  resolvePatientProgramInteractionPolicy,
} from "./supportPolicy";
import { countCancellations30d, lastVisitLabelFromHistory } from "./appointmentStatsFromHistory";

/** Строка истории записей на приём (этап 9, `appointment_records`). */
export type ClientAppointmentHistoryItem = {
  id: string;
  recordAt: string | null;
  status: string;
  label: string;
  lastEvent: string;
  updatedAt: string;
  /** F-04: маркер происхождения для строк из `appointment_records`. */
  scheduleProvenancePrefix?: string;
};

export type ClientProfile = {
  identity: ClientIdentity;
  supplementaryContacts: DoctorSupplementaryContact[];
  channelCards: ChannelCard[];
  upcomingAppointments: AppointmentSummary[];
  /** История по телефону клиента (не удалённые записи). */
  appointmentHistory: ClientAppointmentHistoryItem[];
  appointmentStats: {
    total: number;
    cancellations30d: number;
    lastVisitLabel: string | null;
    nextVisitLabel: string | null;
  };
  symptomTrackings: SymptomTracking[];
  recentSymptomEntries: SymptomEntry[];
  lfkComplexes: LfkComplex[];
  recentLfkSessions: LfkSession[];
};

export type DoctorClientsServiceDeps = {
  clientsPort: DoctorClientsPort;
  getUpcomingAppointments: (userId: string) => AppointmentSummary[] | Promise<AppointmentSummary[]>;
  /** История `appointment_records` по нормализованному телефону (MVP этап 9). */
  listAppointmentHistoryForPhone: (phoneNormalized: string | null) => Promise<ClientAppointmentHistoryItem[]>;
  listSymptomTrackings: (userId: string, activeOnly?: boolean) => Promise<SymptomTracking[]>;
  listSymptomEntries: (userId: string, limit?: number) => Promise<SymptomEntry[]>;
  listLfkComplexes: (userId: string, activeOnly?: boolean) => Promise<LfkComplex[]>;
  listLfkSessions: (userId: string, limit?: number) => Promise<LfkSession[]>;
  getChannelCards: (
    userId: string,
    bindings: ClientIdentity["bindings"],
    delivery?: { phone?: string | null; emailVerified?: boolean }
  ) => Promise<ChannelCard[]>;
  listSupplementaryContacts: (
    userId: string,
    identity: ClientIdentity,
  ) => Promise<DoctorSupplementaryContact[]>;
  getDoctorSupportDefault: (
    key:
      | "doctor_patient_support_comments_without_support_default_enabled"
      | "doctor_patient_support_media_without_support_default_enabled",
  ) => Promise<boolean>;
};

export function createDoctorClientsService(deps: DoctorClientsServiceDeps) {
  return {
    async listClients(
      filters: DoctorClientsFilters,
      audience?: { excludedUserIds?: string[] },
    ): Promise<ClientListItem[]> {
      return deps.clientsPort.listClients(filters, audience);
    },

    async getClientProfile(userId: string): Promise<ClientProfile | null> {
      const identity = await deps.clientsPort.getClientIdentity(userId);
      if (!identity) return null;

      const [
        channelCards,
        supplementaryContacts,
        upcomingAppointments,
        appointmentHistory,
        symptomTrackings,
        recentSymptomEntries,
        lfkComplexes,
        recentLfkSessions,
      ] = await Promise.all([
        deps.getChannelCards(userId, identity.bindings, {
          phone: identity.phone,
          emailVerified: false,
        }),
        deps.listSupplementaryContacts(userId, identity),
        Promise.resolve(deps.getUpcomingAppointments(userId)),
        deps.listAppointmentHistoryForPhone(identity.phone),
        deps.listSymptomTrackings(userId, true),
        deps.listSymptomEntries(userId, 20),
        deps.listLfkComplexes(userId, true),
        deps.listLfkSessions(userId, 20),
      ]);

      const appointments = Array.isArray(upcomingAppointments) ? upcomingAppointments : [];
      const nextLabel = appointments.length > 0 ? appointments[0].label : null;
      const nowMs = Date.now();

      return {
        identity,
        supplementaryContacts,
        channelCards,
        upcomingAppointments: appointments,
        appointmentHistory,
        appointmentStats: {
          total: appointments.length,
          cancellations30d: countCancellations30d(appointmentHistory, nowMs),
          lastVisitLabel: lastVisitLabelFromHistory(appointmentHistory, nowMs),
          nextVisitLabel: nextLabel,
        },
        symptomTrackings,
        recentSymptomEntries,
        lfkComplexes,
        recentLfkSessions,
      };
    },

    async getClientSupport(patientUserId: string): Promise<ClientSupportProfile | null> {
      return deps.clientsPort.getClientSupport(patientUserId);
    },

    async updateClientSupport(params: {
      patientUserId: string;
      onSupport?: boolean;
      commentsEnabled?: boolean | null;
      mediaEnabled?: boolean | null;
      actorId: string;
    }): Promise<ClientSupportProfile> {
      return deps.clientsPort.updateClientSupport(params);
    },

    async getPatientProgramInteractionPolicy(
      patientUserId: string,
    ): Promise<PatientProgramInteractionPolicy> {
      const [profile, commentsDefault, mediaDefault] = await Promise.all([
        deps.clientsPort.getClientSupport(patientUserId),
        deps.getDoctorSupportDefault("doctor_patient_support_comments_without_support_default_enabled"),
        deps.getDoctorSupportDefault("doctor_patient_support_media_without_support_default_enabled"),
      ]);
      return resolvePatientProgramInteractionPolicy({
        profile,
        defaultsWithoutSupport: {
          commentsEnabled: commentsDefault,
          mediaEnabled: mediaDefault,
        },
      });
    },
  };
}
