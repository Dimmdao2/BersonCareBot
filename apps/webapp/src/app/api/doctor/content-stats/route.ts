import { NextResponse } from 'next/server';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import {
  loadContentEngagementStats,
  parseReminderStatsWindowHours,
} from '@/app-layer/stats/loadAdminReminderStats';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

export async function GET(req: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const windowHours = parseReminderStatsWindowHours(url.searchParams.get('windowHours'));
  const audience = await loadDoctorAnalyticsAudience();
  const body = await loadContentEngagementStats({
    windowHours,
    excludedUserIds: audience.excludedUserIds,
  });
  return NextResponse.json(body);
}
