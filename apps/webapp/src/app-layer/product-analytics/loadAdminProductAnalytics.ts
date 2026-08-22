import { loadPlatformAnalyticsAudienceSpec } from '@/app-layer/analytics/loadAnalyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { ProductAnalyticsAdminDashboard } from '@/modules/product-analytics/types';

export async function loadAdminProductAnalytics(params: {
  windowHours: number;
}): Promise<ProductAnalyticsAdminDashboard> {
  const deps = buildAppDeps();
  // Прежде здесь звался `loadProductAnalyticsAudience()`, который резолвил служебные учётки в id
  // ЗАПРОСОМ по `platform_users` и `user_channel_bindings`. Под платформенным принципалом это
  // 42501: у роли нет прав ни на ту таблицу, ни на другую. Наружу уезжает спецификация, отсев
  // делает тело именованного корня.
  const audience = await loadPlatformAnalyticsAudienceSpec();
  return deps.productAnalytics.getAdminDashboard({
    windowHours: params.windowHours,
    audience,
  });
}
