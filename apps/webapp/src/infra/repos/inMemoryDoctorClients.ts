import type { ChannelBindings } from "@/shared/types/session";
import type {
  ClientIdentity,
  ClientListItem,
  DoctorClientsFilters,
  DoctorClientsPort,
  DoctorDashboardPatientMetrics,
} from "@/modules/doctor-clients/ports";
import { matchesDoctorClientSearch } from "@/modules/doctor-clients/clientSearchMatch";

const STUB_CLIENTS: ClientListItem[] = [];

function matchesSearch(item: ClientListItem, search: string): boolean {
  return matchesDoctorClientSearch(item, search);
}

export const inMemoryDoctorClientsPort: DoctorClientsPort = {
  async listClients(filters: DoctorClientsFilters): Promise<ClientListItem[]> {
    let list = [...STUB_CLIENTS];
    if (filters.search?.trim()) {
      list = list.filter((item) => matchesSearch(item, filters.search!));
    }
    if (filters.hasTelegram === true) {
      list = list.filter((item) => Boolean(item.bindings.telegramId?.trim()));
    }
    if (filters.hasMax === true) {
      list = list.filter((item) => Boolean(item.bindings.maxId?.trim()));
    }
    if (filters.hasUpcomingAppointment === true) {
      list = list.filter((item) => Boolean(item.nextAppointmentLabel));
    }
    if (filters.hasActiveTreatmentProgram === true) {
      list = list.filter((item) => item.activeTreatmentProgram);
    }
    if (filters.onlyWithAppointmentRecords === true) {
      list = [];
    }
    if (filters.visitedThisCalendarMonth === true) {
      list = [];
    }
    if (filters.archivedOnly === true) {
      list = [];
    }
    return list;
  },

  async getDashboardPatientMetrics(): Promise<DoctorDashboardPatientMetrics> {
    return {
      totalClients: 0,
      onSupportCount: 0,
      visitedThisCalendarMonthCount: 0,
    };
  },

  async countRecentClientsWithoutMessagingChannels(_days: number): Promise<number> {
    return 0;
  },

  async getClientIdentity(userId: string): Promise<ClientIdentity | null> {
    const found = STUB_CLIENTS.find((c) => c.userId === userId);
    if (!found) return null;
    return {
      userId: found.userId,
      displayName: found.displayName,
      phone: found.phone,
      bindings: found.bindings,
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
      channelBindingDates: {},
      firstName: null,
      lastName: null,
      email: null,
      emailVerifiedAt: null,
    };
  },

  async isClientMessagingBlocked(_userId: string): Promise<boolean> {
    return false;
  },

  async setClientBlocked(_params: {
    userId: string;
    blocked: boolean;
    reason: string | null;
    actorId: string;
  }): Promise<void> {
    /* no-op in memory stub */
  },

  async setUserArchived(_userId: string, _archived: boolean): Promise<void> {
    /* no-op in memory stub */
  },
};
