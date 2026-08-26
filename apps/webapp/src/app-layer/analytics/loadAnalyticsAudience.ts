import {
  loadAnalyticsAudienceContext,
  loadAnalyticsTestAccountSpec,
} from '@/modules/analytics/analyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { resolveAnalyticsExcludedUserIds } from '@/infra/repos/pgAnalyticsAudience';

/**
 * Doctor-facing analytics: production excludes env-declared test users; DEV/TEST include them.
 *
 * Второго загрузчика здесь больше нет. `loadProductAnalyticsAudience()` (он резолвил ещё и
 * сотрудников) обслуживал только экран «Приложение», а тот перешёл на именованный корень и
 * получает спецификацию через `loadPlatformAnalyticsAudienceSpec()`: под платформенным принципалом
 * резолв id по `platform_users` — это 42501.
 */
export async function loadDoctorAnalyticsAudience() {
  const deps = buildAppDeps();
  return loadAnalyticsAudienceContext({
    loadExcludedUserIds: (input) => resolveAnalyticsExcludedUserIds(getDrizzle(), input),
  });
}

/**
 * Платформенная аналитика: те же тестовые учётки, что и у остальных поверхностей, но списком
 * идентификаторов — принципал глобального админа не может резолвить их в id сам.
 */
export async function loadPlatformAnalyticsAudienceSpec() {
  buildAppDeps();
  return loadAnalyticsTestAccountSpec();
}
