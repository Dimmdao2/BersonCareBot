import { describe, expect, it } from "vitest";
import type { AppointmentRow } from "@/modules/doctor-appointments/ports";
import type { IntakeRequestWithPatientIdentity } from "@/modules/online-intake/types";
import {
  formatDateTimeRu,
  getUpcomingAppointments,
  mapAppointmentToTodayItem,
  mapConversationToTodayItem,
  mapIntakeToTodayItem,
  mapOnSupportClientToTodayItem,
  truncateText,
  type TodayConversationSourceRow,
} from "./loadDoctorTodayDashboard";

function appt(partial: Partial<AppointmentRow> & Pick<AppointmentRow, "id">): AppointmentRow {
  return {
    clientUserId: "",
    clientLabel: "",
    rubitimeNameIfDifferent: null,
    time: "",
    recordAtIso: null,
    dateKey: "",
    type: "",
    status: "",
    link: null,
    cancellationCountForClient: 0,
    branchName: null,
    packageUsageRef: null,
    packageTitle: null,
    packageDisplayNumber: null,
    ...partial,
  };
}

describe("loadDoctorTodayDashboard helpers", () => {
  it("mapAppointmentToTodayItem links to client when clientUserId non-empty", () => {
    const row = appt({
      id: "a1",
      clientUserId: "  uuid-1  ",
      clientLabel: "Иван",
      time: "10:00",
      type: "Приём",
      status: "created",
    });
    const item = mapAppointmentToTodayItem(row);
    expect(item.href).toBe("/app/doctor/patients/uuid-1");
    expect(item.ctaLabel).toBe("Открыть карточку");
    expect(item.clientUserId).toBe("uuid-1");
  });

  it("mapAppointmentToTodayItem passes rubitimeNameIfDifferent", () => {
    const row = appt({
      id: "a3",
      clientUserId: "u1",
      clientLabel: "Иван",
      rubitimeNameIfDifferent: "Иванов Иван Иванович",
      time: "12:00",
      type: "Приём",
      status: "created",
    });
    expect(mapAppointmentToTodayItem(row).rubitimeNameIfDifferent).toBe("Иванов Иван Иванович");
  });

  it("mapAppointmentToTodayItem falls back to appointments when clientUserId empty", () => {
    const row = appt({
      id: "a2",
      clientUserId: "   ",
      clientLabel: "Гость",
      time: "11:00",
      type: "Приём",
      status: "created",
    });
    const item = mapAppointmentToTodayItem(row);
    expect(item.href).toBe("/app/doctor/appointments");
    expect(item.ctaLabel).toBe("Открыть записи");
    expect(item.clientUserId).toBeNull();
  });

  it("mapIntakeToTodayItem builds deep link and type label", () => {
    const row = {
      id: "req-1",
      userId: "u1",
      type: "lfk",
      status: "new",
      summary: "Нужна консультация",
      createdAt: "2026-05-02T10:00:00.000Z",
      updatedAt: "2026-05-02T10:00:00.000Z",
      patientName: "Петр",
      patientPhone: "+79990001122",
      lastName: "",
      firstName: "",
    } satisfies IntakeRequestWithPatientIdentity;
    const item = mapIntakeToTodayItem(row);
    expect(item.typeLabel).toBe("ЛФК");
    expect(item.href).toBe("/app/doctor/online-intake/req-1");
    expect(item.summaryPreview).toContain("Нужна");
  });

  it("mapConversationToTodayItem handles null lastMessageText", () => {
    const row: TodayConversationSourceRow = {
      conversationId: "c1",
      displayName: "Мария",
      phoneNormalized: null,
      lastMessageAt: "2026-05-02T12:00:00.000Z",
      lastMessageText: null,
      unreadFromUserCount: 3,
    };
    const item = mapConversationToTodayItem(row);
    expect(item.lastMessagePreview).toBeNull();
    expect(item.href).toBe("/app/doctor/messages");
    expect(item.unreadFromUserCount).toBe(3);
  });

  it("getUpcomingAppointments dedupes by id and sorts by recordAtIso", () => {
    const today = [
      appt({ id: "1", recordAtIso: "2026-05-02T08:00:00.000Z", clientLabel: "T1", time: "08:00" }),
    ];
    const week = [
      appt({ id: "1", recordAtIso: "2026-05-02T08:00:00.000Z", clientLabel: "dup", time: "08:00" }),
      appt({
        id: "2",
        recordAtIso: "2026-05-03T10:00:00.000Z",
        clientLabel: "Later",
        time: "10:00",
      }),
      appt({
        id: "3",
        recordAtIso: "2026-05-03T09:00:00.000Z",
        clientLabel: "Earlier next day",
        time: "09:00",
      }),
    ];
    const upcoming = getUpcomingAppointments(today, week, 5);
    expect(upcoming.map((x) => x.id)).toEqual(["3", "2"]);
  });

  it("truncateText returns null for empty and truncates long strings", () => {
    expect(truncateText(null)).toBeNull();
    expect(truncateText("")).toBeNull();
    const long = "a".repeat(200);
    const out = truncateText(long, 10);
    expect(out!.length).toBeLessThanOrEqual(10);
    expect(out!.endsWith("…")).toBe(true);
  });

  it("formatDateTimeRu returns iso string when invalid date", () => {
    expect(formatDateTimeRu("not-a-date")).toBe("not-a-date");
  });

  it("mapOnSupportClientToTodayItem links to the new patient card when instance id present", () => {
    const item = mapOnSupportClientToTodayItem({
      userId: "  uuid-1  ",
      displayName: "  Иван  ",
      phone: null,
      bindings: {},
      nextAppointmentLabel: "Есть запись",
      activeTreatmentProgram: true,
      activeTreatmentProgramInstanceId: "inst-1",
      cancellationCount30d: 0,
    });
    expect(item.href).toBe("/app/doctor/patients/uuid-1");
    expect(item.displayName).toBe("Иван");
    expect(item.userId).toBe("uuid-1");
  });

  it("mapOnSupportClientToTodayItem links to the new patient card without instance id", () => {
    const item = mapOnSupportClientToTodayItem({
      userId: "uuid-2",
      displayName: "Пётр",
      phone: null,
      bindings: {},
      nextAppointmentLabel: null,
      activeTreatmentProgram: false,
      activeTreatmentProgramInstanceId: null,
      cancellationCount30d: 0,
    });
    expect(item.href).toBe("/app/doctor/patients/uuid-2");
  });
});

describe("loadDoctorTodayDashboard audience", () => {
  it("forwards excludedUserIds to appointments and clients loaders", async () => {
    const { loadDoctorTodayDashboard } = await import("./loadDoctorTodayDashboard");
    const audience = { excludedUserIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] };
    const listCalls: Array<{ filter: unknown; audience?: unknown }> = [];
    const deps = {
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      doctorAppointments: {
        listAppointmentsForSpecialist: async (
          filter: unknown,
          aud?: { excludedUserIds?: string[] },
        ) => {
          listCalls.push({ filter, audience: aud });
          return [];
        },
      },
      doctorClients: {
        getDashboardPatientMetrics: async (aud?: { excludedUserIds?: string[] }) => {
          expect(aud).toEqual({ ...audience, organizationId: deps.organizationId });
          return { onSupportCount: 0, totalClients: 0, visitedThisCalendarMonthCount: 0, withProgramCount: 0, membershipsCount: 0, subscriberCount: 0, newCount: 0, formerCount: 0, cancellationsCount: 0 };
        },
        listClients: async (_filters: unknown, aud?: { excludedUserIds?: string[] }) => {
          expect(aud).toEqual({ ...audience, organizationId: deps.organizationId });
          return [];
        },
      },
      displayIana: "Europe/Moscow",
      messaging: {
        doctorSupport: {
          listOpenConversations: async () => [],
          unreadFromUsers: async () => 0,
        },
      },
    };
    await loadDoctorTodayDashboard(deps, {
      listForDoctor: async () => ({ items: [], total: 0 }),
    } as unknown as import("@/modules/online-intake/ports").OnlineIntakeService, audience);
    expect(listCalls).toHaveLength(2);
    expect(listCalls.every((c) => (c.audience as typeof audience).excludedUserIds === audience.excludedUserIds)).toBe(true);
  });

  it("passes selected organization to on-support client list", async () => {
    const { loadDoctorTodayDashboard } = await import("./loadDoctorTodayDashboard");
    const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    let capturedFilters: unknown;
    const appointmentAudiences: unknown[] = [];
    let capturedMetricsAudience: unknown;
    let capturedConversationsParams: unknown;
    let capturedUnreadParams: unknown;
    const deps = {
      organizationId,
      doctorAppointments: {
        listAppointmentsForSpecialist: async (_filter: unknown, audienceArg?: unknown) => {
          appointmentAudiences.push(audienceArg);
          return [];
        },
      },
      doctorClients: {
        getDashboardPatientMetrics: async (audienceArg?: unknown) => {
          capturedMetricsAudience = audienceArg;
          return {
          onSupportCount: 0,
          totalClients: 0,
          visitedThisCalendarMonthCount: 0,
          withProgramCount: 0,
          membershipsCount: 0,
          subscriberCount: 0,
          newCount: 0,
          formerCount: 0,
          cancellationsCount: 0,
          };
        },
        listClients: async (filters: unknown) => {
          capturedFilters = filters;
          return [];
        },
      },
      displayIana: "Europe/Moscow",
      messaging: {
        doctorSupport: {
          listOpenConversations: async (params: unknown) => {
            capturedConversationsParams = params;
            return [];
          },
          unreadFromUsers: async (params?: unknown) => {
            capturedUnreadParams = params;
            return 0;
          },
        },
      },
    };

    await loadDoctorTodayDashboard(deps, {
      listForDoctor: async () => ({ items: [], total: 0 }),
    } as unknown as import("@/modules/online-intake/ports").OnlineIntakeService);

    expect(capturedFilters).toEqual({ supportStatus: "on", organizationId });
    expect(appointmentAudiences).toEqual([
      expect.objectContaining({ organizationId }),
      expect.objectContaining({ organizationId }),
    ]);
    expect(capturedMetricsAudience).toEqual(expect.objectContaining({ organizationId }));
    expect(capturedConversationsParams).toEqual(expect.objectContaining({ organizationId }));
    expect(capturedUnreadParams).toEqual({ organizationId });
  });
});

describe("loadDoctorTodayDashboard proactive", () => {
  it("uses single organization-scoped queryInsights call for proactive section", async () => {
    const { loadDoctorTodayDashboard } = await import("./loadDoctorTodayDashboard");
    const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const queryCalls: unknown[] = [];
    const deps = {
      organizationId,
      doctorAppointments: {
        listAppointmentsForSpecialist: async () => [],
      },
      doctorClients: {
        getDashboardPatientMetrics: async () => ({
          onSupportCount: 0,
          totalClients: 0,
          visitedThisCalendarMonthCount: 0,
          withProgramCount: 0,
          membershipsCount: 0,
          subscriberCount: 0,
          newCount: 0,
          formerCount: 0,
          cancellationsCount: 0,
        }),
        listClients: async () => [],
      },
      displayIana: "Europe/Moscow",
      messaging: {
        doctorSupport: {
          listOpenConversations: async () => [],
          unreadFromUsers: async () => 0,
        },
      },
      doctorProactiveInsights: {
        queryInsights: async (params: unknown) => {
          queryCalls.push(params);
          return {
            items: [
              {
                kind: "wellbeing_low_streak" as const,
                patientUserId: "p1",
                patientDisplayName: "A",
                summary: "low",
                sortAt: "2026-06-02T00:00:00.000Z",
              },
            ],
            totalCount: 3,
          };
        },
        listForPatient: async () => [],
      },
    };
    const data = await loadDoctorTodayDashboard(deps, {
      listForDoctor: async () => ({ items: [], total: 0 }),
    } as unknown as import("@/modules/online-intake/ports").OnlineIntakeService);
    expect(queryCalls).toEqual([
      {
        limit: 10,
        displayIana: "Europe/Moscow",
        organizationId,
      },
    ]);
    expect(data.proactiveInsightsTotal).toBe(3);
    expect(data.proactiveInsights).toHaveLength(1);
    expect(data.proactiveInsights[0]?.href).toBe("/app/doctor/patients/p1");
  });
});
