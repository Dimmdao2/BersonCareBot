import type { AppointmentSummary } from "@/modules/appointments/service";
import type { ChannelCard } from "@/modules/channel-preferences/types";
import type { LfkComplex, LfkSession, SymptomEntry, SymptomTracking } from "@/modules/diaries/types";
import type { DoctorClientsFilters, DoctorClientsPort } from "./ports";
import type { ClientIdentity, ClientListItem } from "./ports";
import { countCancellations30d, lastVisitLabelFromHistory } from "./appointmentStatsFromHistory";

/** Строка истории записей на приём (этап 9, `appointment_records`). */
export type ClientAppointmentHistoryItem = {
  id: string;
  recordAt: string | null;
  status: string;
  label: string;
  lastEvent: string;
  updatedAt: string;
};

export type ClientProfile = {
  identity: ClientIdentity;
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
};

export function createDoctorClientsService(deps: DoctorClientsServiceDeps) {
  return {
    async listClients(filters: DoctorClientsFilters): Promise<ClientListItem[]> {
      return deps.clientsPort.listClients(filters);
    },

    async getClientProfile(userId: string): Promise<ClientProfile | null> {
      const identity = await deps.clientsPort.getClientIdentity(userId);
      if (!identity) return null;

      const [
        channelCards,
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
  };
}
