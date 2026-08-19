import {
  loadAnalyticsAudienceContext,
  loadAnalyticsTestAccountSpec,
} from '@/modules/analytics/analyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { resolveAnalyticsExcludedUserIds } from '@/infra/repos/pgAnalyticsAudience';

/** Doctor-facing analytics: exclude test users unless dev_mode; do not exclude staff as clients. */
export async function loadDoctorAnalyticsAudience() {
  const deps = buildAppDeps();
  return loadAnalyticsAudienceContext({
    systemSettings: deps.systemSettings,
    loadExcludedUserIds: (input) => resolveAnalyticsExcludedUserIds(getDrizzle(), input),
    excludeStaffRoles: false,
  });
}

/** Product usage analytics: exclude staff + test users (unless dev_mode). */
export async function loadProductAnalyticsAudience() {
  const deps = buildAppDeps();
  return loadAnalyticsAudienceContext({
    systemSettings: deps.systemSettings,
    loadExcludedUserIds: (input) => resolveAnalyticsExcludedUserIds(getDrizzle(), input),
    excludeStaffRoles: true,
  });
}

/**
 * Платформенная аналитика: те же тестовые учётки, что и у остальных поверхностей, но списком
 * идентификаторов — принципал глобального админа не может резолвить их в id сам.
 */
export async function loadPlatformAnalyticsAudienceSpec() {
  const deps = buildAppDeps();
  return loadAnalyticsTestAccountSpec({ systemSettings: deps.systemSettings });
}
