import { NextResponse } from "next/server";
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { loadContentEngagementStats, parseReminderStatsWindowHours } from "@/app-layer/stats/loadAdminReminderStats";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const windowHours = parseReminderStatsWindowHours(url.searchParams.get("windowHours"));
  const audience = await loadDoctorAnalyticsAudience();
  const body = await loadContentEngagementStats({
    windowHours,
    excludedUserIds: audience.excludedUserIds,
  });
  return NextResponse.json(body);
}
