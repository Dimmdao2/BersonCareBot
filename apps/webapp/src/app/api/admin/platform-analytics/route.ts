import { NextResponse } from 'next/server';
import { mapApiError, type ApiErrorLiteralRules } from '@/shared/http/apiResponse';
import { loadPlatformAnalyticsAudienceSpec } from '@/app-layer/analytics/loadAnalyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { parseAdminStatsTimePreset } from '@/modules/admin-platform-stats/parseAdminStatsTimePreset';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

const RANGE_ERROR_RULES: ApiErrorLiteralRules = {
  invalid_date: { code: 'invalid_date', status: 400 },
  range_inverted: { code: 'range_inverted', status: 400 },
  range_too_short: { code: 'range_too_short', status: 400 },
};

/** Distinct object identity: `mapApiError` returns this exact value when nothing matched. */
const RANGE_UNKNOWN = { code: 'platform_analytics_failed', status: 500 } as const;

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
    // Known range codes stay distinct; anything else keeps re-throwing to `onRequestError`.
    const mapped = mapApiError(error, RANGE_ERROR_RULES, RANGE_UNKNOWN);
    if (mapped === RANGE_UNKNOWN) throw error;
    return NextResponse.json({ error: mapped.code }, { status: mapped.status });
  }
}
