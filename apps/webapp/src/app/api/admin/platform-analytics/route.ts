import { NextResponse } from 'next/server';
import { loadPlatformAnalyticsAudienceSpec } from '@/app-layer/analytics/loadAnalyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { parseAdminStatsTimePreset } from '@/modules/admin-platform-stats/parseAdminStatsTimePreset';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

export async function GET(req: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const preset = parseAdminStatsTimePreset(url.searchParams.get('preset'));
  const customFrom = url.searchParams.get('from') ?? undefined;
  const customTo = url.searchParams.get('to') ?? undefined;
  const iana = await getAppDisplayTimeZone();
  const audience = await loadPlatformAnalyticsAudienceSpec();
  const deps = buildAppDeps();
  try {
    const dashboard = await deps.platformAnalytics.getDashboard({
      iana,
      preset,
      customFrom,
      customTo,
      audience,
    });
    return NextResponse.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_range';
    if (message === 'invalid_date' || message === 'range_inverted' || message === 'range_too_short') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw error;
  }
}
