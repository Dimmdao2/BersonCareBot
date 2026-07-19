import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const resolveCanonicalUserIdMock = vi.hoisted(() => vi.fn());
const listOnSupportPatientUserIdsMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: (fn: (tx: unknown) => unknown) => fn({}),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(() => ({})),
}));

vi.mock("@/infra/repos/pgCanonicalPlatformUser", () => ({
  resolveCanonicalUserId: resolveCanonicalUserIdMock,
}));

vi.mock("@/infra/repos/pgDoctorPatientSupport", () => ({
  getClientSupportProfile: vi.fn(),
  listOnSupportPatientUserIds: listOnSupportPatientUserIdsMock,
  upsertClientSupportProfile: vi.fn(),
}));

import { createPgDoctorClientsPort } from "./pgDoctorClients";

describe("pgDoctorClients repo", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    resolveCanonicalUserIdMock.mockReset();
    listOnSupportPatientUserIdsMock.mockReset();
    listOnSupportPatientUserIdsMock.mockResolvedValue(new Set());
  });

  it("listClients returns empty when no platform_users rows", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgDoctorClientsPort();
    const list = await port.listClients({});
    expect(list).toEqual([]);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("platform_users");
  });

  it("listClients can scope base patients to selected organization enrollment", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgDoctorClientsPort();
    const list = await port.listClients({ organizationId: "org-1" });
    expect(list).toEqual([]);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("org_enrollments");
    expect(sql).toContain("oe.organization_id = $1::uuid");
    expect(sql).toContain("oe.status = 'active'");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["org-1"]);
  });

  it("getClientContactBreakdown classifies patients from canonical appointments", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          has_telegram: true,
          has_max: false,
          telegram_bot_blocked: false,
          max_bot_blocked: false,
          has_verified_email: true,
          has_phone: true,
          has_appointment: true,
        },
        {
          has_telegram: false,
          has_max: false,
          telegram_bot_blocked: false,
          max_bot_blocked: false,
          has_verified_email: false,
          has_phone: true,
          has_appointment: false,
        },
      ],
    });
    const port = createPgDoctorClientsPort();

    const result = await port.getClientContactBreakdown({ organizationId: "org-1" });

    expect(result.patientsCount).toBe(1);
    expect(result.subscribersOnlyCount).toBe(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("FROM be_appointments bea");
    expect(sql).toContain("bea.organization_id = 'org-1'::uuid");
    expect(sql).not.toContain("FROM appointment_records ar WHERE ar.platform_user_id = pu.id");
  });

  it("listClients filters hasUpcomingAppointment in memory", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          { id: "u1", display_name: "A", phone_normalized: "+71", created_at: "2026-01-01" },
          { id: "u2", display_name: "B", phone_normalized: "+72", created_at: "2026-01-02" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "u1",
            history_count: 1,
            active_count: 1,
            cancellation_count_30d: 0,
            reschedule_count_30d: 0,
            visited_month_count: 0,
          },
          {
            user_id: "u2",
            history_count: 0,
            active_count: 0,
            cancellation_count_30d: 0,
            reschedule_count_30d: 0,
            visited_month_count: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // no_show_count query
      .mockResolvedValueOnce({ rows: [] }) // pwa activity query
      .mockResolvedValueOnce({ rows: [] }); // web push query

    const port = createPgDoctorClientsPort();
    const list = await port.listClients({ hasUpcomingAppointment: true });

    expect(list).toHaveLength(1);
    expect(list[0]?.userId).toBe("u1");
    expect(list[0]?.nextAppointmentLabel).toBe("Есть запись");
  });

  it("listClients does not count empty left join rows or cancellations as appointment history", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          { id: "u1", display_name: "No records", phone_normalized: "+71", created_at: "2026-01-01" },
          { id: "u2", display_name: "Real record", phone_normalized: "+72", created_at: "2026-01-02" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "u1",
            history_count: 0,
            active_count: 0,
            cancellation_count_30d: 1,
            reschedule_count_30d: 0,
            visited_month_count: 0,
          },
          {
            user_id: "u2",
            history_count: 1,
            active_count: 0,
            cancellation_count_30d: 0,
            reschedule_count_30d: 0,
            visited_month_count: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // no_show_count query
      .mockResolvedValueOnce({ rows: [] }) // pwa activity query
      .mockResolvedValueOnce({ rows: [] }); // web push query

    const port = createPgDoctorClientsPort();
    const list = await port.listClients({});

    const appointmentAggSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
    expect(appointmentAggSql).toContain("LEFT JOIN be_appointments bea ON bea.platform_user_id = pu.id");
    expect(appointmentAggSql).toContain("LEFT JOIN be_appointment_reschedules r");
    expect(appointmentAggSql).toContain("COUNT(DISTINCT bea.id) FILTER");
    expect(appointmentAggSql).toContain("bea.status NOT IN");
    expect(appointmentAggSql).not.toContain("LEFT JOIN appointment_records");
    expect(list.find((item) => item.userId === "u1")?.hasAppointmentHistory).toBe(false);
    expect(list.find((item) => item.userId === "u2")?.hasAppointmentHistory).toBe(true);
  });

  it("maps the latest occurred canonical appointment with deleted, cancelled, and organization predicates", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: "u1", display_name: "Recent", phone_normalized: null, created_at: "2026-01-01" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          user_id: "u1",
          history_count: 2,
          last_appointment_at: "2026-07-02T09:00:00.000Z",
          active_count: 1,
          cancellation_count_30d: 0,
          reschedule_count_30d: 0,
          visited_month_count: 1,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgDoctorClientsPort();
    const list = await port.listClients({ organizationId: "org-1" });

    const appointmentAggSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
    expect(appointmentAggSql).toContain("MAX(bea.start_at) FILTER");
    expect(appointmentAggSql).toContain("bea.deleted_at IS NULL");
    expect(appointmentAggSql).toContain("bea.status NOT IN");
    expect(appointmentAggSql).toContain("bea.start_at <= NOW()");
    expect(appointmentAggSql).toContain("bea.organization_id = $2::uuid");
    expect(list[0]?.lastAppointmentAt).toBe("2026-07-02T09:00:00.000Z");
  });

  it("listPatientAppointments reads patient rows from canonical appointments", async () => {
    resolveCanonicalUserIdMock.mockResolvedValue("canonical-1");
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          internal_id: "appt-1",
          id: "appt-1",
          record_at: "2030-01-01T10:00:00.000Z",
          status: "confirmed",
          service_title: "Консультация",
          duration_minutes: 60,
          branch_name: "Москва",
          is_package: true,
          patient_package_id: "pkg-1",
          package_title: "Абонемент",
          package_display_number: 12,
        },
      ],
    });

    const port = createPgDoctorClientsPort();
    const list = await port.listPatientAppointments("alias-id", "org-1");

    expect(list).toEqual([
      {
        id: "appt-1",
        internalId: "appt-1",
        dateTime: "2030-01-01T10:00:00.000Z",
        status: "upcoming",
        serviceName: "Консультация",
        location: "Москва",
        durationMin: 60,
        isPackage: true,
        patientPackageId: "pkg-1",
        packageTitle: "Абонемент",
        packageDisplayNumber: 12,
      },
    ]);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("FROM be_appointments bea");
    expect(sql).toContain("LEFT JOIN be_package_usages u ON u.id::text = bea.package_usage_ref");
    expect(sql).not.toContain("appointment_records");
  });

  it("listClients supportStatus on filters by on-support ids", async () => {
    listOnSupportPatientUserIdsMock.mockResolvedValue(new Set(["u2"]));
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          { id: "u1", display_name: "A", phone_normalized: null, created_at: "2026-01-01" },
          { id: "u2", display_name: "B", phone_normalized: null, created_at: "2026-01-02" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // no_show_count query
      .mockResolvedValueOnce({ rows: [] }) // pwa activity query
      .mockResolvedValueOnce({ rows: [] }); // web push query

    const port = createPgDoctorClientsPort();
    const list = await port.listClients({ supportStatus: "on" });

    expect(list).toHaveLength(1);
    expect(list[0]?.userId).toBe("u2");
  });

  it("listClients derives hasApp from pwa activity and hasWebPush from active enabled subscriptions", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          { id: "u1", display_name: "App user", phone_normalized: null, created_at: "2026-01-01" },
          { id: "u2", display_name: "Push user", phone_normalized: null, created_at: "2026-01-02" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u1" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u2" }] });

    const port = createPgDoctorClientsPort();
    const list = await port.listClients({});

    expect(list.find((item) => item.userId === "u1")?.hasApp).toBe(true);
    expect(list.find((item) => item.userId === "u1")?.hasWebPush).toBe(false);
    expect(list.find((item) => item.userId === "u2")?.hasApp).toBe(false);
    expect(list.find((item) => item.userId === "u2")?.hasWebPush).toBe(true);
    const webPushSql = String(runWebappPgTextMock.mock.calls[8]?.[0] ?? "");
    expect(webPushSql).toContain("p.platform_user_id = s.user_id");
  });

  it("listClients filters by hasApp and hasWebPush", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          { id: "u1", display_name: "App user", phone_normalized: null, created_at: "2026-01-01" },
          { id: "u2", display_name: "Push user", phone_normalized: null, created_at: "2026-01-02" },
          { id: "u3", display_name: "Both user", phone_normalized: null, created_at: "2026-01-03" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u1" }, { user_id: "u3" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u2" }, { user_id: "u3" }] });

    const port = createPgDoctorClientsPort();

    const appList = await port.listClients({ hasApp: true });
    expect(appList.map((item) => item.userId)).toEqual(["u1", "u3"]);

    runWebappPgTextMock.mockClear();
    listOnSupportPatientUserIdsMock.mockResolvedValue(new Set());
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          { id: "u1", display_name: "App user", phone_normalized: null, created_at: "2026-01-01" },
          { id: "u2", display_name: "Push user", phone_normalized: null, created_at: "2026-01-02" },
          { id: "u3", display_name: "Both user", phone_normalized: null, created_at: "2026-01-03" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u1" }, { user_id: "u3" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "u2" }, { user_id: "u3" }] });

    const pushList = await port.listClients({ hasWebPush: true });
    expect(pushList.map((item) => item.userId)).toEqual(["u2", "u3"]);
  });

  it("listClients returns [] immediately when userIds is empty array (EXTRA-02 short-circuit)", async () => {
    const port = createPgDoctorClientsPort();
    const list = await port.listClients({ userIds: [] });
    expect(list).toEqual([]);
    // No DB query should be issued.
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("listClients adds AND pu.id = ANY(...) clause when userIds provided (EXTRA-02)", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const port = createPgDoctorClientsPort();
    await port.listClients({ userIds: ["uid-1", "uid-2"] });

    // First call is the platform_users SELECT — its SQL must include the uuid[] filter.
    const firstSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(firstSql).toContain("ANY");
    expect(firstSql).toContain("uuid[]");
    // The params must include the userIds array.
    const firstParams = runWebappPgTextMock.mock.calls[0]?.[1] as unknown[][];
    const allParams = firstParams?.flat() ?? [];
    expect(allParams).toContain("uid-1");
    expect(allParams).toContain("uid-2");
  });

  it("getDashboardPatientMetrics runs six count queries in parallel", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ c: "3" }] });
    const port = createPgDoctorClientsPort();
    const metrics = await port.getDashboardPatientMetrics();

    // The five scalar COUNT(*) queries resolve to 3; the aggregate query gets the
    // same mocked row (no past/future/cancel fields) → one «subscriber» bucket.
    expect(metrics).toEqual({
      totalClients: 3,
      onSupportCount: 3,
      visitedThisCalendarMonthCount: 3,
      withProgramCount: 3,
      membershipsCount: 3,
      newCount: 0,
      formerCount: 0,
      subscriberCount: 1,
      cancellationsCount: 0,
    });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(6);
    const visitedSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
    const aggregateSql = String(runWebappPgTextMock.mock.calls[5]?.[0] ?? "");
    expect(visitedSql).toContain("INNER JOIN be_appointments bea ON bea.platform_user_id = pu.id");
    expect(aggregateSql).toContain("LEFT JOIN be_appointments bea ON bea.platform_user_id = pu.id");
    expect(visitedSql).not.toContain("appointment_records");
    expect(aggregateSql).not.toContain("appointment_records");
  });

  it("getPatientCardHeader reads appointment stats from canonical appointments", async () => {
    resolveCanonicalUserIdMock.mockResolvedValue("canonical-1");
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "canonical-1",
            display_name: "Client",
            first_name: "A",
            last_name: "B",
            patronymic: null,
            phone_normalized: "+79991234567",
            email: "c@example.com",
            email_verified_at: null,
            is_blocked: false,
            is_archived: false,
            role: "client",
            birth_date: null,
            gender: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ has_conversation: false }] })
      .mockResolvedValueOnce({ rows: [{ no_show_count: "0" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            total_visits: "2",
            cancellations_count: "1",
            reschedules_count: "1",
            last_visit_at: "2026-06-01T09:00:00.000Z",
            next_appt_at: "2026-07-20T10:30:00.000Z",
            first_visit_at: "2026-05-01T09:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgDoctorClientsPort();
    const header = await port.getPatientCardHeader("alias-id");

    expect(header?.totalVisits).toBe(2);
    expect(header?.cancellationsCount).toBe(1);
    expect(header?.reschedulesCount).toBe(1);
    expect(header?.lastVisit?.date).toBe("2026-06-01T09:00:00.000Z");
    expect(header?.nextAppointment?.date).toBe("2026-07-20T10:30:00.000Z");
    expect(header?.firstVisitDate).toBe("2026-05-01T09:00:00.000Z");
    const appointmentStatsSql = String(runWebappPgTextMock.mock.calls[4]?.[0] ?? "");
    expect(appointmentStatsSql).toContain("FROM be_appointments bea");
    expect(appointmentStatsSql).toContain("LEFT JOIN be_appointment_reschedules r");
    expect(appointmentStatsSql).not.toContain("appointment_records");
  });

  it("getClientIdentity resolves canonical id and maps bindings", async () => {
    resolveCanonicalUserIdMock.mockResolvedValue("canonical-1");
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "canonical-1",
            display_name: "Client",
            phone_normalized: "+79991234567",
            created_at: "2026-01-01T00:00:00.000Z",
            first_name: "A",
            last_name: "B",
            email: "c@example.com",
            email_verified_at: null,
            is_blocked: false,
            blocked_reason: null,
            is_archived: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ channel_code: "telegram", external_id: "tg-1", created_at: new Date("2026-02-01") }],
      });

    const port = createPgDoctorClientsPort();
    const identity = await port.getClientIdentity("alias-id");

    expect(resolveCanonicalUserIdMock).toHaveBeenCalled();
    expect(identity).toMatchObject({
      userId: "canonical-1",
      displayName: "Client",
      bindings: { telegramId: "tg-1" },
      isBlocked: false,
    });
  });

  it("setPatientNames derives the compatibility label from the supplied structured fields", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgDoctorClientsPort();

    await port.setPatientNames("u1", {
      lastName: "Petrov",
      firstName: "Ivan",
      patronymic: null,
    });

    const [sql, params] = runWebappPgTextMock.mock.calls[0] ?? [];
    expect(String(sql)).toContain("display_name = COALESCE(NULLIF(concat_ws");
    expect(String(sql)).toContain("$2::text,");
    expect(String(sql)).toContain("$3::text,");
    expect(String(sql)).toContain("$4::text");
    expect(String(sql)).not.toContain("COALESCE($2::text, last_name)");
    expect(params).toEqual(["u1", "Ivan", "Petrov", null]);
  });

  it("setClientBlocked block true updates blocked columns", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgDoctorClientsPort();
    await port.setClientBlocked({
      userId: "u1",
      blocked: true,
      reason: "spam",
      actorId: "doc-1",
    });

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_blocked = true");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["u1", "spam", "doc-1"]);
  });

  it("setClientBlocked block false clears blocked columns", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgDoctorClientsPort();
    await port.setClientBlocked({
      userId: "u1",
      blocked: false,
      reason: null,
      actorId: "doc-1",
    });

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_blocked = false");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["u1"]);
  });
});
