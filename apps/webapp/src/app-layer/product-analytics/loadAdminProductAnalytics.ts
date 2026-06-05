import { loadProductAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ProductAnalyticsAdminDashboard } from "@/modules/product-analytics/types";

export async function loadAdminProductAnalytics(params: {
  windowHours: number;
}): Promise<ProductAnalyticsAdminDashboard> {
  const deps = buildAppDeps();
  const audience = await loadProductAnalyticsAudience();
  return deps.productAnalytics.getAdminDashboard({
    windowHours: params.windowHours,
    includeTestAccounts: audience.includeTestAccounts,
  });
}
