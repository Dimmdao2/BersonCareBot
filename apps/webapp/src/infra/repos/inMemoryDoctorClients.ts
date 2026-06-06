import type { ChannelBindings } from "@/shared/types/session";
import type {
  ClientIdentity,
  ClientListItem,
  DoctorClientsFilters,
  DoctorClientsPort,
  DoctorDashboardPatientMetrics,
} from "@/modules/doctor-clients/ports";
import type { ClientSupportProfile } from "@/modules/doctor-clients/supportPolicy";
import { emptyClientContactBreakdown } from "@/modules/doctor-clients/clientContactSegments";
import { matchesDoctorClientSearch } from "@/modules/doctor-clients/clientSearchMatch";

const STUB_CLIENTS: ClientListItem[] = [];
const supportProfiles = new Map<string, ClientSupportProfile>();

/** @internal Vitest: seed list rows and reset support profiles. */
export function __resetInMemoryDoctorClientsForTest(stub: ClientListItem[] = []) {
  STUB_CLIENTS.length = 0;
  STUB_CLIENTS.push(...stub);
  supportProfiles.clear();
}

function matchesSearch(item: ClientListItem, search: string): boolean {
  return matchesDoctorClientSearch(item, search);
}

export const inMemoryDoctorClientsPort: DoctorClientsPort = {
  async listClients(
    filters: DoctorClientsFilters,
    _audience?: { excludedUserIds?: string[] },
  ): Promise<ClientListItem[]> {
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
      list = list.filter((item) => (item.activeAppointmentsCount ?? 0) > 0 || Boolean(item.nextAppointmentLabel));
    }
    if (filters.hasActiveTreatmentProgram === true) {
      list = list.filter((item) => item.activeTreatmentProgram);
    }
    if (filters.onlyWithAppointmentRecords === true) {
      list = list.filter((item) => item.hasAppointmentHistory === true);
    }
    if (filters.visitedThisCalendarMonth === true) {
      list = [];
    }
    if (filters.archivedOnly === true) {
      list = [];
    }
    if (filters.supportStatus === "on") {
      list = list.filter((item) => supportProfiles.get(item.userId)?.onSupport === true);
    }
    if (filters.supportStatus === "programWithoutSupport") {
      list = list.filter(
        (item) => item.activeTreatmentProgram && supportProfiles.get(item.userId)?.onSupport !== true,
      );
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

  async getClientContactBreakdown() {
    return emptyClientContactBreakdown();
  },

  async getPatientClientIdentity(userId: string): Promise<ClientIdentity | null> {
    return this.getClientIdentity(userId);
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

  async getClientSupport(patientUserId: string) {
    return supportProfiles.get(patientUserId) ?? null;
  },

  async updateClientSupport(params) {
    const existing = supportProfiles.get(params.patientUserId);
    const profile: ClientSupportProfile = {
      patientUserId: params.patientUserId,
      onSupport: params.onSupport ?? existing?.onSupport ?? false,
      commentsEnabled:
        params.commentsEnabled !== undefined ? params.commentsEnabled : (existing?.commentsEnabled ?? null),
      mediaEnabled: params.mediaEnabled !== undefined ? params.mediaEnabled : (existing?.mediaEnabled ?? null),
      updatedAt: new Date().toISOString(),
      updatedBy: params.actorId,
    };
    supportProfiles.set(params.patientUserId, profile);
    return profile;
  },
};
