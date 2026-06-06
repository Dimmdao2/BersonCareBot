import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";

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

/** Unique SQL markers per metric — parity guard after runWebappPgText migration. */
const METRIC_SQL_MARKERS: Record<DoctorAnalyticsMetricKey, string[]> = {
  appointments_past_visits: ["be_appointments", "Визит", "a.start_at < now()"],
  appointments_cancelled_visits: ["be_appointments", "Отменённый визит", "a.status = ANY"],
  appointments_bookings_created: ["be_appointments", "Запись создана", "a.created_at >="],
  appointments_cancellation_actions: ["be_appointment_cancellations", "Отмена"],
  appointments_reschedule_actions: ["be_appointment_reschedules", "Перенос"],
  clients_total: ["pu.role = 'client'", "pu.merged_into_id IS NULL"],
  clients_phone_only: ["pu.email_verified_at IS NULL", "channel_code IN ('telegram', 'max')"],
  clients_app_guests: ["pu.phone_normalized IS NULL", "channel_code IN ('telegram', 'max')"],
  clients_segment_telegram_only: ["channel_code = 'telegram'", "channel_code = 'max'"],
  clients_segment_max_only: ["channel_code = 'max'", "channel_code = 'telegram'"],
  clients_segment_email_only: ["pu.email_verified_at IS NOT NULL"],
  clients_segment_telegram_email: ["pu.email_verified_at IS NOT NULL", "channel_code = 'telegram'"],
  clients_segment_max_email: ["pu.email_verified_at IS NOT NULL", "channel_code = 'max'"],
  clients_segment_phone_email_no_messenger: [
    "pu.email_verified_at IS NOT NULL",
    "pu.phone_normalized IS NOT NULL",
    "channel_code IN ('telegram', 'max')",
  ],
  registrations: ["Регистрация", "pu.created_at >="],
  registrations_merges: ["Слияние", "pu.merged_at >="],
  registrations_combined: ["UNION ALL", "Регистрация", "Слияние"],
  subscribers_total: ["user_channel_bindings", "Первая привязка канала", "s.first_at <"],
  subscribers_delta: ["user_channel_bindings", "Первая привязка канала", "s.first_at >="],
  today_appointments_today: ["Запись сегодня", "be_appointments"],
  today_appointments_week: ["Запись на неделе", "be_appointments"],
  today_cancellations_30d: ["interval '30 days'", "be_appointments"],
  today_new_clients_no_channels_7d: ["Новый без каналов", "channel_code IN ('telegram', 'max')"],
  notif_reminders_sent: ["reminder_occurrence_history", "Отправлено", "roh.status = $2"],
  notif_reminders_failed: ["reminder_occurrence_history", "Ошибка", "roh.status = $2"],
  notif_push_opened: ["product_analytics_events_recent", "push_open"],
};

const ALL_METRICS = Object.keys(METRIC_SQL_MARKERS) as DoctorAnalyticsMetricKey[];

describe("pgDoctorAnalyticsMetricAccounts SQL parity", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
  });

  it.each(ALL_METRICS)("metric %s dispatches expected SQL via runWebappPgText", async (metric) => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    await port.listMetricAccounts({
      metric,
      period: { preset: "week" },
      limit: 20,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: [],
      windowHours: metric.startsWith("notif_") ? 168 : undefined,
    });

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    for (const marker of METRIC_SQL_MARKERS[metric]) {
      expect(sql).toContain(marker);
    }
  });

  it("uses legacy appointment_records SQL when read source is rubitime_legacy", async () => {
    const port = createPgDoctorAnalyticsMetricAccountsPort(
      async () => ORG_ID,
      async () => "rubitime_legacy",
    );

    await port.listMetricAccounts({
      metric: "appointments_past_visits",
      period: { preset: "week" },
      limit: 20,
      offset: 0,
      iana: "Europe/Moscow",
      excludedUserIds: [],
    });

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("FROM appointment_records ar");
    expect(sql).toContain("ar.status <> 'canceled'");
  });

  it("paginates with hasMore when row count exceeds limit", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      user_id: `user-${i}`,
      display_name: `Client ${i}`,
      phone_normalized: null,
      event_at: null,
      event_label: null,
    }));
    runWebappPgTextMock.mockResolvedValueOnce({ rows });

    const port = createPgDoctorAnalyticsMetricAccountsPort(async () => ORG_ID);
    const result = await port.listMetricAccounts({
      metric: "clients_total",
      period: { preset: "week" },
      limit: 20,
      offset: 0,
      iana: "Europe/Moscow",
    });

    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(20);
  });
});
