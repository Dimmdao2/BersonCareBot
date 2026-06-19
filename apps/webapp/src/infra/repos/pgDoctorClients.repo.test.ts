import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const resolveCanonicalUserIdMock = vi.hoisted(() => vi.fn());
const listOnSupportPatientUserIdsMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
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
      .mockResolvedValueOnce({ rows: [] }); // no_show_count query

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
      .mockResolvedValueOnce({ rows: [] }); // no_show_count query

    const port = createPgDoctorClientsPort();
    const list = await port.listClients({});

    const appointmentAggSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
    expect(appointmentAggSql).toContain("COUNT(ar.id) FILTER");
    expect(appointmentAggSql).toContain("ar.status IN ('created', 'updated')");
    expect(list.find((item) => item.userId === "u1")?.hasAppointmentHistory).toBe(false);
    expect(list.find((item) => item.userId === "u2")?.hasAppointmentHistory).toBe(true);
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
      .mockResolvedValueOnce({ rows: [] }); // no_show_count query

    const port = createPgDoctorClientsPort();
    const list = await port.listClients({ supportStatus: "on" });

    expect(list).toHaveLength(1);
    expect(list[0]?.userId).toBe("u2");
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
