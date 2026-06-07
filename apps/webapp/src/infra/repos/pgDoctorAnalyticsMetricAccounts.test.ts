import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() =>
  vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>(
    async () => ({ rows: [] }),
  ),
);

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgDoctorAnalyticsMetricAccountsPort } from "./pgDoctorAnalyticsMetricAccounts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const EXCLUDED = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"];

describe("pgDoctorAnalyticsMetricAccounts", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
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

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const firstCall = runWebappPgTextMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sql = String(firstCall![0]);
    const params = firstCall![1] as unknown[];
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

    const firstCall = runWebappPgTextMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sql = String(firstCall![0]);
    expect(sql).toContain("Запись на неделе");
    expect(sql).toContain("a.start_at >= $2::timestamptz");
    expect(sql).toContain("a.start_at < $3::timestamptz");
    expect(sql).toContain("a.status <> ALL($4::text[])");
    expect((firstCall![1] as unknown[])[3]).toEqual([
      "cancelled_by_patient",
      "cancelled_by_specialist",
      "late_cancellation",
      "no_show",
    ]);
  });

  it("today_appointments_today excludes canceled booking engine statuses", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    await port.listMetricAccounts({
      metric: "today_appointments_today",
      period: { preset: "week" },
      limit: 10,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: [],
    });

    const firstCall = runWebappPgTextMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sql = String(firstCall![0]);
    expect(sql).toContain("a.status <> ALL($4::text[])");
    expect((firstCall![1] as unknown[])[3]).toEqual([
      "cancelled_by_patient",
      "cancelled_by_specialist",
      "late_cancellation",
      "no_show",
    ]);
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

    const firstCall = runWebappPgTextMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sql = String(firstCall![0]);
    const params = firstCall![1] as unknown[];
    expect(sql).toContain("reminder_occurrence_history");
    expect(sql).toContain("Отправлено");
    expect(params[0]).toBe(48);
    expect(params[1]).toBe("sent");
    expect(params).toContain(EXCLUDED);
  });

  it("today_appointments_week uses legacy appointment_records when read source is rubitime_legacy", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(
      async () => ORG_ID,
      async () => "rubitime_legacy",
    );
    await port.listMetricAccounts({
      metric: "today_appointments_week",
      period: { preset: "week" },
      limit: 10,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: [],
    });

    const firstCall = runWebappPgTextMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sql = String(firstCall![0]);
    expect(sql).toContain("appointment_records");
    expect(sql).toContain("Запись на неделе");
    expect(sql).toContain("ar.status <> 'canceled'");
    expect(sql).not.toContain("be_appointments");
  });

  it("appointments_cancellation_actions excludes staff-purged canonical rows", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    await port.listMetricAccounts({
      metric: "appointments_cancellation_actions",
      period: { preset: "week" },
      limit: 10,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: [],
    });

    const firstCall = runWebappPgTextMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sql = String(firstCall![0]);
    expect(sql).toContain("be_appointment_cancellations");
    expect(sql).toContain("appointment_records");
    expect(sql).toContain("deleted_at IS NOT NULL");
  });

  it("appointments_cancelled_visits excludes staff-purged canonical rows", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    await port.listMetricAccounts({
      metric: "appointments_cancelled_visits",
      period: { preset: "week" },
      limit: 10,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: [],
    });

    const firstCall = runWebappPgTextMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sql = String(firstCall![0]);
    expect(sql).toContain("be_appointments");
    expect(sql).toContain("appointment_records");
    expect(sql).toContain("deleted_at IS NOT NULL");
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

    const firstCall = runWebappPgTextMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sql = String(firstCall![0]);
    const params = firstCall![1] as unknown[];
    expect(sql).toContain("product_analytics_events_recent");
    expect(sql).toContain("push_open");
    expect(params[0]).toBe(24);
  });
});
