import { NextResponse } from "next/server";
import { z } from "zod";

import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { parseReminderStatsWindowHours } from "@/app-layer/stats/loadAdminReminderStats";
import { parseAdminStatsTimePreset } from "@/modules/admin-platform-stats/parseAdminStatsTimePreset";
import type { AdminStatsTimePreset } from "@/modules/admin-platform-stats/types";
import type { DoctorAnalyticsMetricKey } from "@/modules/doctor-analytics-metric-accounts/ports";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

const metricEnum = z.enum([
  "appointments_past_visits",
  "appointments_cancelled_visits",
  "appointments_bookings_created",
  "appointments_cancellation_actions",
  "appointments_reschedule_actions",
  "clients_total",
  "clients_phone_only",
  "clients_app_guests",
  "clients_segment_telegram_only",
  "clients_segment_max_only",
  "clients_segment_email_only",
  "clients_segment_telegram_email",
  "clients_segment_max_email",
  "clients_segment_phone_email_no_messenger",
  "clients_messenger_bot_blocked_telegram",
  "clients_messenger_bot_blocked_max",
  "registrations",
  "registrations_merges",
  "registrations_combined",
  "subscribers_total",
  "subscribers_delta",
  "today_appointments_today",
  "today_appointments_week",
  "today_cancellations_30d",
  "today_new_clients_no_channels_7d",
  "notif_reminders_sent",
  "notif_reminders_failed",
  "notif_push_opened",
]);

const dayParam = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

function parsePreset(raw: string | null): AdminStatsTimePreset {
  return parseAdminStatsTimePreset(raw);
}

export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const metricParsed = metricEnum.safeParse(url.searchParams.get("metric"));
  if (!metricParsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_metric" }, { status: 400 });
  }
  const metric = metricParsed.data as DoctorAnalyticsMetricKey;
  const preset = parsePreset(url.searchParams.get("preset"));
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);

  if (preset === "custom") {
    const fp = dayParam.safeParse(fromRaw ?? "");
    const tp = dayParam.safeParse(toRaw ?? "");
    if (!fp.success || !tp.success) {
      return NextResponse.json({ ok: false, error: "custom_range_required" }, { status: 400 });
    }
  } else if (fromRaw || toRaw) {
    return NextResponse.json({ ok: false, error: "unexpected_from_to" }, { status: 400 });
  }

  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ ok: false, error: "invalid_limit" }, { status: 400 });
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ ok: false, error: "invalid_offset" }, { status: 400 });
  }

  const windowHours = parseReminderStatsWindowHours(url.searchParams.get("windowHours"));

  try {
    const iana = await getAppDisplayTimeZone();
    const audience = await loadDoctorAnalyticsAudience();
    const deps = buildAppDeps();
    const result = await deps.doctorAnalyticsMetricAccounts.listMetricAccounts({
      metric,
      period: { preset, customFrom: fromRaw ?? undefined, customTo: toRaw ?? undefined },
      limit,
      offset,
      iana,
      excludedUserIds: audience.excludedUserIds,
      windowHours,
    });
    return NextResponse.json({ ok: true as const, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (
      msg === "custom_range_required" ||
      msg === "range_inverted" ||
      msg === "range_too_long" ||
      msg === "range_too_short" ||
      msg === "invalid_date"
    ) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "metric_list_failed" }, { status: 500 });
  }
}
