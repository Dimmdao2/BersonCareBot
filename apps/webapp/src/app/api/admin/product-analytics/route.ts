import { NextResponse } from 'next/server';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { loadAdminProductAnalytics } from '@/app-layer/product-analytics/loadAdminProductAnalytics';
import { requireAdminModeSession } from '@/modules/auth/requireAdminMode';
import { parseProductAnalyticsWindowHours } from '@/modules/product-analytics/timeRange';

export async function GET(req: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;
  const platformGate = await requirePlatformOperationsApiContext();
  if (!platformGate.ok) return platformGate.response;

  const url = new URL(req.url);
  const windowHours = parseProductAnalyticsWindowHours(url.searchParams.get('windowHours'));
  const body = await loadAdminProductAnalytics({ windowHours });
  return NextResponse.json(body);
}
