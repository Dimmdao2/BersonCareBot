import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyClientContactBreakdown } from "./clientContactSegments";
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
    channelBindingDates: {},
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
          activeTreatmentProgram: false,
          activeTreatmentProgramInstanceId: null,
          cancellationCount30d: 0,
        },
      ];
    },
    async getPatientCardHeader() {
      return null;
    },
    async getPatientClientIdentity(userId: string) {
      return this.getClientIdentity(userId);
    },
    async getClientIdentity(userId: string) {
      return userId === "user-1" ? stubIdentity : null;
    },
    async getDashboardPatientMetrics() {
      return { totalClients: 0, onSupportCount: 0, visitedThisCalendarMonthCount: 0, withProgramCount: 0, membershipsCount: 0, subscriberCount: 0, newCount: 0, formerCount: 0, cancellationsCount: 0 };
    },
    async getClientContactBreakdown() {
      return emptyClientContactBreakdown();
    },
    async isClientMessagingBlocked() {
      return false;
    },
    async setClientBlocked() {},
    async setUserArchived() {},
    async getClientSupport() {
      return null;
    },
    async updateClientSupport(params) {
      return {
        patientUserId: params.patientUserId,
        onSupport: params.onSupport ?? false,
        commentsEnabled: params.commentsEnabled ?? null,
        mediaEnabled: params.mediaEnabled ?? null,
        updatedAt: new Date().toISOString(),
        updatedBy: params.actorId,
      };
    },
    async listPatientAppointments() {
      return [];
    },
    async setPatientBirthDate() {},
  };

  const service = createDoctorClientsService({
    clientsPort: mockPort,
    getDoctorSupportDefault: async () => false,
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
    listSupplementaryContacts: async (_userId, _identity) => [],
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

  it("getPatientProgramInteractionPolicy uses port profile and doctor defaults", async () => {
    const portWithSupport: DoctorClientsPort = {
      ...mockPort,
      async getClientSupport() {
        return {
          patientUserId: "user-1",
          onSupport: false,
          commentsEnabled: true,
          mediaEnabled: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
          updatedBy: "doc-1",
        };
      },
    };
    const policyService = createDoctorClientsService({
      clientsPort: portWithSupport,
      getDoctorSupportDefault: async (key) =>
        key === "doctor_patient_support_media_without_support_default_enabled",
      getUpcomingAppointments: () => [],
      listAppointmentHistoryForPhone: async () => [],
      listSymptomTrackings: async () => [],
      listSymptomEntries: async () => [],
      listLfkComplexes: async () => [],
      listLfkSessions: async () => [],
      getChannelCards: async () => [],
      listSupplementaryContacts: async () => [],
    });
    const policy = await policyService.getPatientProgramInteractionPolicy("user-1");
    expect(policy.onSupport).toBe(false);
    expect(policy.commentsAllowed).toBe(true);
    expect(policy.mediaAllowed).toBe(true);
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
    expect(profile!.supplementaryContacts).toEqual([]);
  });

  it("getClientProfile passes verified email into channel delivery context", async () => {
    const getChannelCards = vi.fn(async () => []);
    const verifiedService = createDoctorClientsService({
      clientsPort: {
        ...mockPort,
        async getClientIdentity(userId: string) {
          if (userId !== "user-1") return null;
          return {
            ...stubIdentity,
            email: "patient@example.com",
            emailVerifiedAt: "2026-05-19T00:00:00.000Z",
          };
        },
      },
      getDoctorSupportDefault: async () => false,
      getUpcomingAppointments: () => [],
      listAppointmentHistoryForPhone: async () => [],
      listSymptomTrackings: async () => [],
      listSymptomEntries: async () => [],
      listLfkComplexes: async () => [],
      listLfkSessions: async () => [],
      getChannelCards,
      listSupplementaryContacts: async () => [],
    });

    await verifiedService.getClientProfile("user-1");

    expect(getChannelCards).toHaveBeenCalledWith(
      "user-1",
      stubIdentity.bindings,
      { phone: "+79001234567", emailVerified: true },
    );
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
    channelBindingDates: {},
  };

  const mockPort: DoctorClientsPort = {
    async listClients() {
      return [];
    },
    async getPatientCardHeader() {
      return null;
    },
    async getPatientClientIdentity(userId: string) {
      return this.getClientIdentity(userId);
    },
    async getClientIdentity(userId: string) {
      return userId === "user-1" ? stubIdentity : null;
    },
    async getDashboardPatientMetrics() {
      return { totalClients: 0, onSupportCount: 0, visitedThisCalendarMonthCount: 0, withProgramCount: 0, membershipsCount: 0, subscriberCount: 0, newCount: 0, formerCount: 0, cancellationsCount: 0 };
    },
    async getClientContactBreakdown() {
      return emptyClientContactBreakdown();
    },
    async isClientMessagingBlocked() {
      return false;
    },
    async setClientBlocked() {},
    async setUserArchived() {},
    async getClientSupport() {
      return null;
    },
    async updateClientSupport(params) {
      return {
        patientUserId: params.patientUserId,
        onSupport: params.onSupport ?? false,
        commentsEnabled: params.commentsEnabled ?? null,
        mediaEnabled: params.mediaEnabled ?? null,
        updatedAt: new Date().toISOString(),
        updatedBy: params.actorId,
      };
    },
    async listPatientAppointments() {
      return [];
    },
    async setPatientBirthDate() {},
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes cancellations30d and lastVisitLabel from appointment history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-03-25T12:00:00.000Z"));

    const service = createDoctorClientsService({
      clientsPort: mockPort,
      getDoctorSupportDefault: async () => false,
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
      listSupplementaryContacts: async (_userId, _identity) => [],
    });

    const profile = await service.getClientProfile("user-1");
    expect(profile).not.toBeNull();
    expect(profile!.appointmentStats.cancellations30d).toBe(1);
    expect(profile!.appointmentStats.lastVisitLabel).toBe("Отмена");
  });
});
