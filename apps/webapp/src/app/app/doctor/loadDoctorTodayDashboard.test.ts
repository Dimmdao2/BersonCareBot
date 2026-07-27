import { describe, expect, it } from "vitest";
import type { AppointmentRow } from "@/modules/doctor-appointments/ports";
import type { IntakeRequestWithPatientIdentity } from "@/modules/online-intake/types";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import {
  formatDateTimeRu,
  getUpcomingAppointments,
  mapAppointmentToTodayItem,
  mapConversationToTodayItem,
  mapIntakeToTodayItem,
  mapClientToTodayItem,
  truncateText,
  type TodayConversationSourceRow,
  type DoctorTodayDashboardDeps,
} from "./loadDoctorTodayDashboard";

function appt(partial: Partial<AppointmentRow> & Pick<AppointmentRow, "id">): AppointmentRow {
  return {
    clientUserId: "",
    clientLabel: "",
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

function client(userId: string, displayName: string, lastAppointmentAt: string | null): ClientListItem {
  return {
    userId,
    displayName,
    phone: null,
    bindings: {},
    nextAppointmentLabel: null,
    lastAppointmentAt,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationsCount: 0,
    reschedulesCount: 0,
  };
}

function minimalDashboardDeps(
  listClients: DoctorTodayDashboardDeps["doctorClients"]["listClients"],
): DoctorTodayDashboardDeps {
  return {
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    doctorUserId: "doctor-1",
    doctorAppointments: { listAppointmentsForSpecialist: async () => [] },
    doctorClients: {
      getDashboardPatientMetrics: async () => ({
        onSupportCount: 0,
        totalClients: 0,
        visitedThisCalendarMonthCount: 0,
        withProgramCount: 0,
        membershipsCount: 0,
        expiredMembershipsCount: 0,
        subscriberCount: 0,
        newCount: 0,
        formerCount: 0,
        cancellationsCount: 0,
        reschedulesCount: 0,
      }),
      listClients,
    },
    displayIana: "Europe/Moscow",
    messaging: {
      doctorSupport: {
        listOpenConversations: async () => [],
        unreadFromUsers: async () => 0,
      },
    },
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
    expect(item.unreadFromUserCount).toBe(3);
  });

  it("mapConversationToTodayItem builds a deep link to the exact conversation (#812)", () => {
    const row: TodayConversationSourceRow = {
      conversationId: "c1",
      displayName: "Мария",
      phoneNormalized: null,
      lastMessageAt: "2026-05-02T12:00:00.000Z",
      lastMessageText: null,
      unreadFromUserCount: 3,
    };
    const item = mapConversationToTodayItem(row);
    expect(item.href).toBe("/app/doctor/communications?tab=chats&chatId=c1");
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

  it("mapClientToTodayItem links to the new patient card when instance id present", () => {
    const item = mapClientToTodayItem({
      userId: "  uuid-1  ",
      displayName: "  Иван  ",
      firstName: "Иван",
      lastName: "Иванов",
      patronymic: "Иванович",
      phone: null,
      bindings: {},
      nextAppointmentLabel: "Есть запись",
      activeTreatmentProgram: true,
      activeTreatmentProgramInstanceId: "inst-1",
      cancellationsCount: 0,
      reschedulesCount: 0,
    });
    expect(item.href).toBe("/app/doctor/patients/uuid-1");
    expect(item.displayName).toBe("Иван");
    expect(item.firstName).toBe("Иван");
    expect(item.lastName).toBe("Иванов");
    expect(item.patronymic).toBe("Иванович");
    expect(item.userId).toBe("uuid-1");
  });

  it("mapClientToTodayItem links to the new patient card without instance id", () => {
    const item = mapClientToTodayItem({
      userId: "uuid-2",
      displayName: "Пётр",
      phone: null,
      bindings: {},
      nextAppointmentLabel: null,
      activeTreatmentProgram: false,
      activeTreatmentProgramInstanceId: null,
      cancellationsCount: 0,
      reschedulesCount: 0,
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
        getDashboardPatientMetrics: async () => {
          return {
            onSupportCount: 0,
            totalClients: 0,
            visitedThisCalendarMonthCount: 0,
            withProgramCount: 0,
            membershipsCount: 0,
            expiredMembershipsCount: 0,
            subscriberCount: 0,
            newCount: 0,
            formerCount: 0,
            cancellationsCount: 0,
            reschedulesCount: 0,
          };
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
    let capturedConversationsParams: unknown;
    let capturedUnreadParams: unknown;
    const pendingTestCountOrganizationIds: string[] = [];
    const pendingTestListCalls: Array<{ organizationId: string; maxAttempts: number }> = [];
    const deps = {
      organizationId,
      doctorAppointments: {
        listAppointmentsForSpecialist: async (_filter: unknown, audienceArg?: unknown) => {
          appointmentAudiences.push(audienceArg);
          return [];
        },
      },
      doctorClients: {
        getDashboardPatientMetrics: async () => {
          return {
          onSupportCount: 0,
          totalClients: 0,
          visitedThisCalendarMonthCount: 0,
          withProgramCount: 0,
          membershipsCount: 0,
          expiredMembershipsCount: 0,
          subscriberCount: 0,
          newCount: 0,
          formerCount: 0,
          cancellationsCount: 0,
          reschedulesCount: 0,
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
      treatmentProgramProgress: {
        countPendingTestEvaluationAttemptsGlobal: async (organizationIdArg: string) => {
          pendingTestCountOrganizationIds.push(organizationIdArg);
          return 0;
        },
        listPendingTestEvaluationsGlobal: async (organizationIdArg: string, maxAttempts: number) => {
          pendingTestListCalls.push({ organizationId: organizationIdArg, maxAttempts });
          return [];
        },
      } as unknown as import("@/modules/treatment-program/progress-service").TreatmentProgramProgressService,
    };

    await loadDoctorTodayDashboard(deps, {
      listForDoctor: async () => ({ items: [], total: 0 }),
    } as unknown as import("@/modules/online-intake/ports").OnlineIntakeService);

    expect(capturedFilters).toEqual({ supportStatus: "on", organizationId });
    expect(appointmentAudiences).toEqual([
      expect.objectContaining({ organizationId }),
      expect.objectContaining({ organizationId }),
    ]);
    expect(capturedConversationsParams).toEqual(expect.objectContaining({ organizationId }));
    expect(capturedUnreadParams).toEqual({ organizationId });
    expect(pendingTestCountOrganizationIds).toEqual([organizationId]);
    expect(pendingTestListCalls).toEqual([{ organizationId, maxAttempts: 10 }]);
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
          expiredMembershipsCount: 0,
          subscriberCount: 0,
          newCount: 0,
          formerCount: 0,
          cancellationsCount: 0,
          reschedulesCount: 0,
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
        kinds: ["wellbeing_low_streak", "program_inactivity"],
      },
    ]);
    expect(data.proactiveInsightsTotal).toBe(3);
    expect(data.proactiveInsights).toHaveLength(1);
    expect(data.proactiveInsights[0]?.href).toBe("/app/doctor/patients/p1");
  });

  it("skips the proactive query when both proven signal kinds are hidden", async () => {
    const { loadDoctorTodayDashboard } = await import("./loadDoctorTodayDashboard");
    let queryCount = 0;
    const deps = minimalDashboardDeps(async () => []);
    deps.doctorProactiveInsights = {
      queryInsights: async () => {
        queryCount += 1;
        return { items: [], totalCount: 0 };
      },
      listForPatient: async () => [],
    };

    const data = await loadDoctorTodayDashboard(
      deps,
      { listForDoctor: async () => ({ items: [], total: 0 }) } as unknown as import("@/modules/online-intake/ports").OnlineIntakeService,
      undefined,
      { visibleProactiveInsightKinds: [], peopleListMode: "on_support" },
    );

    expect(queryCount).toBe(0);
    expect(data.visibleProactiveInsightKinds).toEqual([]);
  });
});

describe("loadDoctorTodayDashboard people-list preference", () => {
  it("counts and returns an invited on-support client from the same exact fetched result", async () => {
    const { loadDoctorTodayDashboard } = await import("./loadDoctorTodayDashboard");
    const invited = client("invited-on-support", "Приглашённый", null);
    const deps = minimalDashboardDeps(async (filters) =>
      filters.supportStatus === "on" ? [invited] : [],
    );

    const data = await loadDoctorTodayDashboard(
      deps,
      { listForDoctor: async () => ({ items: [], total: 0 }) } as unknown as import("@/modules/online-intake/ports").OnlineIntakeService,
    );

    expect(data.peopleListMode).toBe("on_support");
    expect(data.peopleCount).toBe(1);
    expect(data.people.map((row) => row.userId)).toEqual(["invited-on-support"]);
    expect(data.peopleListTruncated).toBe(false);
  });

  it("loads org-scoped clients with visits and orders the preview by latest visit", async () => {
    const { loadDoctorTodayDashboard } = await import("./loadDoctorTodayDashboard");
    const calls: unknown[] = [];
    const deps = minimalDashboardDeps(async (filters) => {
      calls.push(filters);
      if (filters.supportStatus === "on") return [];
      return [
        client("old", "Старый", "2026-01-01T10:00:00.000Z"),
        client("none", "Без даты", null),
        client("new", "Новый", "2026-07-20T10:00:00.000Z"),
      ];
    });

    const data = await loadDoctorTodayDashboard(
      deps,
      { listForDoctor: async () => ({ items: [], total: 0 }) } as unknown as import("@/modules/online-intake/ports").OnlineIntakeService,
      undefined,
      {
        visibleProactiveInsightKinds: ["wellbeing_low_streak"],
        peopleListMode: "recent_visits",
      },
    );

    expect(calls).toEqual([
      { supportStatus: "on", organizationId: deps.organizationId, viewerUserId: "doctor-1" },
      { organizationId: deps.organizationId, onlyWithAppointmentRecords: true, viewerUserId: "doctor-1" },
    ]);
    expect(data.peopleListMode).toBe("recent_visits");
    expect(data.peopleCount).toBe(2);
    expect(data.people.map((row) => row.userId)).toEqual(["new", "old"]);
  });
});
