import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("unsupported-client F0 integration guards", () => {
  it("keeps all three public entry routes on the single AppEntryRsc chokepoint", () => {
    for (const path of [
      "../../app/app/page.tsx",
      "../../app/app/tg/page.tsx",
      "../../app/app/max/page.tsx",
    ]) {
      expect(read(path)).toContain("AppEntryRsc");
    }
    const rsc = read("../../app/app/AppEntryRsc.tsx");
    expect(rsc).toContain("PatientUnsupportedClientFallback");
    expect(rsc).toContain("getUnsupportedClientFallbackEnabled");
  });

  it("acknowledges module execution before the AuthBootstrap mount and leaves messenger timeouts separate", () => {
    const bootstrap = read("../../shared/ui/patient/AuthBootstrap.tsx");
    expect(bootstrap).toContain("markClientBootModuleExecuted();");
    expect(bootstrap).toContain("markClientBootReactMounted();");
    expect(bootstrap).toContain("MESSENGER_SOFT_TIMEOUT_MS");
    expect(bootstrap).not.toContain("client_boot_report");
  });

  it("does not wire client compatibility into system health, registration failures or error audit", () => {
    const protectedSources = [
      "../../app/app/admin/system-health/SystemHealthSection.tsx",
      "../../app-layer/product-analytics/loadAdminRegistrationFailureAttention.ts",
      "../../modules/operator-health/adminHealthThresholds.ts",
    ].map(read).join("\n");
    expect(protectedSources).not.toMatch(/unsupported_client_boot|client_boot_unsupported|client-boot-report/);

    const route = read("../../app/api/patient-app/client-boot-report/route.ts");
    expect(route).not.toMatch(/recordAuthRegistrationFailure|writeAuditLog|loadAdminRegistrationFailureAttention/);
    expect(route).not.toMatch(/logger\.error/);
  });

  it("keeps F0 rate-limit persistence pseudonymous and scope-retained", () => {
    const limiter = read("./clientBootReportRateLimit.ts");
    const limiterRegistry = read("./authRateLimits.ts");
    expect(limiter).toContain("createHmac");
    expect(limiter).toContain("patient-client-boot-rate-limit:v1");
    expect(limiterRegistry).toContain('scope: "patient.client_boot_report"');
    expect(limiterRegistry).toContain("retentionMs: 60 * 60 * 1000");
    expect(limiterRegistry).toContain("intervalMs: 5 * 60 * 1000");
    expect(limiterRegistry).toContain("batchSize: 500");
  });
});
