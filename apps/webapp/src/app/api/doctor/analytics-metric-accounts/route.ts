import { NextResponse } from "next/server";
import { z } from "zod";

import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import {
  DOCTOR_TODAY_METRIC_KEYS,
  NOTIFICATION_METRIC_KEYS,
  type DoctorAnalyticsMetricKey,
} from "@/modules/doctor-analytics-metric-accounts/ports";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { parseReminderStatsWindowHours } from "@/app-layer/stats/loadAdminReminderStats";

const doctorMetricEnum = z.enum([
  ...DOCTOR_TODAY_METRIC_KEYS,
  ...NOTIFICATION_METRIC_KEYS,
] as [DoctorAnalyticsMetricKey, ...DoctorAnalyticsMetricKey[]]);

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const metricParsed = doctorMetricEnum.safeParse(url.searchParams.get("metric"));
  if (!metricParsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_metric" }, { status: 400 });
  }
  const metric = metricParsed.data;
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const windowHours = parseReminderStatsWindowHours(url.searchParams.get("windowHours"));

  if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ ok: false, error: "invalid_limit" }, { status: 400 });
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ ok: false, error: "invalid_offset" }, { status: 400 });
  }

  try {
    const iana = await getAppDisplayTimeZone();
    const audience = await loadDoctorAnalyticsAudience();
    const deps = buildAppDeps();
    const isToday = (DOCTOR_TODAY_METRIC_KEYS as readonly string[]).includes(metric);
    const result = await deps.doctorAnalyticsMetricAccounts.listMetricAccounts({
      metric,
      period: { preset: "week" },
      limit,
      offset,
      iana,
      excludedUserIds: audience.excludedUserIds,
      windowHours: isToday ? undefined : windowHours,
    });
    return NextResponse.json({ ok: true as const, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "metric_list_failed" }, { status: 500 });
  }
}
