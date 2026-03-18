import type { AppointmentSummary } from "@/modules/appointments/service";
import type { ChannelCard } from "@/modules/channel-preferences/types";
import type { LfkComplex, LfkSession, SymptomEntry, SymptomTracking } from "@/modules/diaries/types";
import type { DoctorClientsFilters, DoctorClientsPort } from "./ports";
import type { ClientIdentity, ClientListItem } from "./ports";

export type ClientProfile = {
  identity: ClientIdentity;
  channelCards: ChannelCard[];
  upcomingAppointments: AppointmentSummary[];
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
  listSymptomTrackings: (userId: string, activeOnly?: boolean) => Promise<SymptomTracking[]>;
  listSymptomEntries: (userId: string, limit?: number) => Promise<SymptomEntry[]>;
  listLfkComplexes: (userId: string, activeOnly?: boolean) => Promise<LfkComplex[]>;
  listLfkSessions: (userId: string, limit?: number) => Promise<LfkSession[]>;
  getChannelCards: (userId: string, bindings: ClientIdentity["bindings"]) => Promise<ChannelCard[]>;
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
        symptomTrackings,
        recentSymptomEntries,
        lfkComplexes,
        recentLfkSessions,
      ] = await Promise.all([
        deps.getChannelCards(userId, identity.bindings),
        Promise.resolve(deps.getUpcomingAppointments(userId)),
        deps.listSymptomTrackings(userId, true),
        deps.listSymptomEntries(userId, 20),
        deps.listLfkComplexes(userId, true),
        deps.listLfkSessions(userId, 20),
      ]);

      const appointments = Array.isArray(upcomingAppointments) ? upcomingAppointments : [];
      const nextLabel = appointments.length > 0 ? appointments[0].label : null;

      return {
        identity,
        channelCards,
        upcomingAppointments: appointments,
        appointmentStats: {
          total: appointments.length,
          cancellations30d: 0,
          lastVisitLabel: null,
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
