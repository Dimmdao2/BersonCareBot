import { describe, expect, it } from "vitest";
import { createDoctorClientsService } from "./service";
import type { DoctorClientsPort } from "./ports";

describe("doctor-clients service", () => {
  const stubIdentity = {
    userId: "user-1",
    displayName: "Иван",
    phone: "+79001234567",
    bindings: { telegramId: "tg1", maxId: undefined, vkId: undefined },
    createdAt: "2024-01-01T00:00:00Z",
    isBlocked: false,
    blockedReason: null,
    isArchived: false,
  };

  const mockPort: DoctorClientsPort = {
    async listClients() {
      return [
        {
          userId: "user-1",
          displayName: "Иван",
          phone: "+79001234567",
          bindings: { telegramId: "tg1" },
          nextAppointmentLabel: null,
          cancellationCount30d: 0,
        },
      ];
    },
    async getClientIdentity(userId: string) {
      return userId === "user-1" ? stubIdentity : null;
    },
    async getDashboardPatientMetrics() {
      return { totalClients: 0, onSupportCount: 0, visitedThisCalendarMonthCount: 0 };
    },
    async isClientMessagingBlocked() {
      return false;
    },
    async setClientBlocked() {},
    async setUserArchived() {},
  };

  const service = createDoctorClientsService({
    clientsPort: mockPort,
    getUpcomingAppointments: () => [
      { id: "apt-1", label: "Консультация", link: null, status: "confirmed" as const },
    ],
    listAppointmentHistoryForPhone: async () => [],
    listSymptomTrackings: async () => [],
    listSymptomEntries: async () => [],
    listLfkComplexes: async () => [],
    listLfkSessions: async () => [],
    getChannelCards: async () => [
      {
        code: "telegram",
        title: "Telegram",
        openUrl: "",
        isLinked: true,
        isImplemented: true,
        isEnabledForMessages: true,
        isEnabledForNotifications: true,
      },
    ],
  });

  it("listClients returns port result", async () => {
    const list = await service.listClients({});
    expect(list).toHaveLength(1);
    expect(list[0].displayName).toBe("Иван");
    expect(list[0].bindings.telegramId).toBe("tg1");
  });

  it("getClientProfile returns null for unknown userId", async () => {
    const profile = await service.getClientProfile("unknown");
    expect(profile).toBeNull();
  });

  it("getClientProfile returns full profile for known client", async () => {
    const profile = await service.getClientProfile("user-1");
    expect(profile).not.toBeNull();
    expect(profile!.identity.displayName).toBe("Иван");
    expect(profile!.identity.phone).toBe("+79001234567");
    expect(profile!.channelCards).toHaveLength(1);
    expect(profile!.upcomingAppointments).toHaveLength(1);
    expect(profile!.upcomingAppointments[0].label).toBe("Консультация");
    expect(profile!.appointmentStats.total).toBe(1);
    expect(profile!.appointmentStats.cancellations30d).toBe(0);
    expect(profile!.symptomTrackings).toEqual([]);
    expect(profile!.recentSymptomEntries).toEqual([]);
    expect(profile!.lfkComplexes).toEqual([]);
    expect(profile!.recentLfkSessions).toEqual([]);
    expect(profile!.appointmentHistory).toEqual([]);
  });
});
