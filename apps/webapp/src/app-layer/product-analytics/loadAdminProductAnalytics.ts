import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ProductAnalyticsAdminDashboard } from "@/modules/product-analytics/types";

export async function loadAdminProductAnalytics(params: {
  windowHours: number;
}): Promise<ProductAnalyticsAdminDashboard> {
  const deps = buildAppDeps();
  return deps.productAnalytics.getAdminDashboard({ windowHours: params.windowHours });
}
