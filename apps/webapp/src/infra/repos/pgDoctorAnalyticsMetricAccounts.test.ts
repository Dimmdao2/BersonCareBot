import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn(async () => ({ rows: [] as unknown[] })));
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgDoctorAnalyticsMetricAccountsPort } from "./pgDoctorAnalyticsMetricAccounts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const EXCLUDED = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];

describe("pgDoctorAnalyticsMetricAccounts", () => {
  beforeEach(() => {
    queryMock.mockClear();
    getPoolMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it("today_appointments_today applies excludedUserIds in SQL", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    await port.listMetricAccounts({
      metric: "today_appointments_today",
      period: { preset: "week" },
      limit: 20,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: EXCLUDED,
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("Запись сегодня");
    expect(sql).toContain("<> ALL(");
    expect(params).toContain(EXCLUDED);
  });

  it("today_appointments_week uses week range bounds", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    await port.listMetricAccounts({
      metric: "today_appointments_week",
      period: { preset: "week" },
      limit: 10,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: [],
    });

    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toContain("Запись на неделе");
    expect(sql).toContain("a.start_at >= $2::timestamptz");
    expect(sql).toContain("a.start_at < $3::timestamptz");
  });

  it("notif_reminders_sent passes windowHours into SQL params", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    await port.listMetricAccounts({
      metric: "notif_reminders_sent",
      period: { preset: "week" },
      limit: 20,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: EXCLUDED,
      windowHours: 48,
    });

    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("reminder_occurrence_history");
    expect(sql).toContain("Отправлено");
    expect(params[0]).toBe(48);
    expect(params[1]).toBe("sent");
    expect(params).toContain(EXCLUDED);
  });

  it("notif_push_opened queries product_analytics_events_recent with windowHours", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    await port.listMetricAccounts({
      metric: "notif_push_opened",
      period: { preset: "week" },
      limit: 5,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: [],
      windowHours: 24,
    });

    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("product_analytics_events_recent");
    expect(sql).toContain("push_open");
    expect(params[0]).toBe(24);
  });
});
