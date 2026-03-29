import { afterEach, describe, expect, it, vi } from "vitest";
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
      {
        id: "apt-1",
        dateLabel: "15.03.2026",
        timeLabel: "14:30",
        label: "15.03.2026 14:30",
        link: null,
        status: "confirmed" as const,
      },
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
    expect(profile!.upcomingAppointments[0].label).toBe("15.03.2026 14:30");
    expect(profile!.upcomingAppointments[0].dateLabel).toBe("15.03.2026");
    expect(profile!.upcomingAppointments[0].timeLabel).toBe("14:30");
    expect(profile!.appointmentStats.total).toBe(1);
    expect(profile!.appointmentStats.cancellations30d).toBe(0);
    expect(profile!.symptomTrackings).toEqual([]);
    expect(profile!.recentSymptomEntries).toEqual([]);
    expect(profile!.lfkComplexes).toEqual([]);
    expect(profile!.recentLfkSessions).toEqual([]);
    expect(profile!.appointmentHistory).toEqual([]);
  });
});

describe("getClientProfile appointmentStats from history (ARCH-03)", () => {
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
      return [];
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes cancellations30d and lastVisitLabel from appointment history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-25T12:00:00.000Z"));

    const service = createDoctorClientsService({
      clientsPort: mockPort,
      getUpcomingAppointments: () => [],
      listAppointmentHistoryForPhone: async () => [
        {
          id: "h1",
          recordAt: "2025-03-01T12:00:00.000Z",
          status: "updated",
          label: "Визит ранний",
          lastEvent: "evt",
          updatedAt: "2025-03-01T12:00:00.000Z",
        },
        {
          id: "h2",
          recordAt: "2025-03-22T15:00:00.000Z",
          status: "updated",
          label: "Визит поздний",
          lastEvent: "evt",
          updatedAt: "2025-03-22T15:00:00.000Z",
        },
        {
          id: "h3",
          recordAt: "2025-03-24T10:00:00.000Z",
          status: "canceled",
          label: "Отмена",
          lastEvent: "event-cancel",
          updatedAt: "2025-03-24T11:00:00.000Z",
        },
      ],
      listSymptomTrackings: async () => [],
      listSymptomEntries: async () => [],
      listLfkComplexes: async () => [],
      listLfkSessions: async () => [],
      getChannelCards: async () => [],
    });

    const profile = await service.getClientProfile("user-1");
    expect(profile).not.toBeNull();
    expect(profile!.appointmentStats.cancellations30d).toBe(1);
    expect(profile!.appointmentStats.lastVisitLabel).toBe("Отмена");
  });
});
