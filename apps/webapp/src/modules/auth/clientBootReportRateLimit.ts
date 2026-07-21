import { resolveRealIpRateLimitClientKey } from "@/modules/auth/realIpRateLimitClientKey";

const SCOPE = "patient_client_env";
export const CLIENT_BOOT_REPORT_FALLBACK_CLIENT_KEY = "client_boot_report:missing_x_real_ip";

export function resolveClientBootReportRateLimitClientKey(request: Request) {
  return resolveRealIpRateLimitClientKey(request, {
    scope: SCOPE,
    logPrefix: "unsupported_client_boot",
    fallbackKey: CLIENT_BOOT_REPORT_FALLBACK_CLIENT_KEY,
    productionMissingLogLevel: "warn",
    event: "unsupported_client_boot",
  });
}

export { isClientBootReportRateLimitedByKey } from "@/modules/auth/authRateLimits";
