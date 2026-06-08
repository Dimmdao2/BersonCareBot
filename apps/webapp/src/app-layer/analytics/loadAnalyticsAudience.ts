import { loadAnalyticsAudienceContext } from "@/modules/analytics/analyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/** Doctor-facing analytics: exclude test users unless dev_mode; do not exclude staff as clients. */
export async function loadDoctorAnalyticsAudience() {
  const deps = buildAppDeps();
  return loadAnalyticsAudienceContext({
    systemSettings: deps.systemSettings,
    excludeStaffRoles: false,
  });
}

/** Product usage analytics: exclude staff + test users (unless dev_mode). */
export async function loadProductAnalyticsAudience() {
  const deps = buildAppDeps();
  return loadAnalyticsAudienceContext({
    systemSettings: deps.systemSettings,
    excludeStaffRoles: true,
  });
}
