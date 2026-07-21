import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  emptySaasIsolationTrend,
  type SaasIsolationHealthPayload,
} from "./saasIsolationDiagnostics";
import {
  observeTenantIsolationCanary,
  observeTenantIsolationDiagnostics,
  observeTenantIsolationRuntimeCounters,
  resetTenantIsolationCriticalHealthForTest,
} from "./tenantIsolationCriticalHealth";
import { TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS } from "./ports";

function diagnostics(status: SaasIsolationHealthPayload["status"]): SaasIsolationHealthPayload {
  return {
    schemaVersion: 3,
    status,
    statusReasons: status === "critical" ? ["active_unexplained_event"] : [],
    active: { unexplained: status === "critical" ? 1 : 0, explained: 0, occurrences: status === "critical" ? 1 : 0 },
    resolved: { unexplained: 0, explained: 0, occurrences: 0 },
    byClass: status === "critical" ? { missing_principal: 1 } : {},
    events: [],
    lastEventAt: null,
    lastCoverage: null,
    coverageFresh: status === "okay",
    coverageComplete: status === "okay",
    missingServices: [],
    trend: emptySaasIsolationTrend(0),
  };
}

function canary(
  organizations: Array<{
    organizationId: string;
    isActive: boolean;
    memberRowCount: number;
  }>,
) {
  return { organizations, truncated: false };
}

describe("tenant isolation critical health runtime", () => {
  beforeEach(() => resetTenantIsolationCriticalHealthForTest());

  it("alerts on monotonic routing-counter deltas and recovers only after two clean ticks", () => {
    expect(
      observeTenantIsolationRuntimeCounters({ missingPrincipalSelections: 1, poolRoleMismatches: 0 }, 0),
    ).toEqual({ critical: true, missingPrincipalDelta: 1, poolRoleMismatchDelta: 0 });
    expect(
      observeTenantIsolationRuntimeCounters({ missingPrincipalSelections: 1, poolRoleMismatches: 0 }, 300_000).critical,
    ).toBe(true);
    expect(
      observeTenantIsolationRuntimeCounters({ missingPrincipalSelections: 1, poolRoleMismatches: 0 }, 600_000).critical,
    ).toBe(false);
  });

  it("treats a counter reset as a new process baseline without negative deltas", () => {
    observeTenantIsolationRuntimeCounters({ missingPrincipalSelections: 5, poolRoleMismatches: 2 }, 0);
    const reset = observeTenantIsolationRuntimeCounters(
      { missingPrincipalSelections: 0, poolRoleMismatches: 1 },
      300_000,
    );
    expect(reset).toMatchObject({ missingPrincipalDelta: 0, poolRoleMismatchDelta: 1, critical: true });
  });

  it("debounces diagnostics-read failure and clears it on a healthy read", () => {
    expect(observeTenantIsolationDiagnostics(null, 0).status).toBe("degraded");
    expect(observeTenantIsolationDiagnostics(null, 300_000).status).toBe("unavailable");
    expect(observeTenantIsolationDiagnostics(diagnostics("okay"), 600_000)).toEqual({
      status: "okay",
      activeUnexplainedEvents: 0,
    });
    expect(observeTenantIsolationDiagnostics(diagnostics("critical"), 900_000)).toEqual({
      status: "critical",
      activeUnexplainedEvents: 1,
    });
  });

  it("primes an empty or zero-row fresh installation without a restart false positive", () => {
    expect(observeTenantIsolationCanary(canary([]), 0)).toEqual({ status: "priming", affectedOrganizations: 0 });
    expect(observeTenantIsolationCanary(canary([]), 300_000)).toEqual({ status: "ok", affectedOrganizations: 0 });

    resetTenantIsolationCriticalHealthForTest();
    const zeroRowOrg = [{ organizationId: "org-a", isActive: true, memberRowCount: 0 }];
    expect(observeTenantIsolationCanary(canary(zeroRowOrg), 0).status).toBe("priming");
    expect(observeTenantIsolationCanary(canary(zeroRowOrg), 300_000).status).toBe("ok");
  });

  it("requires two zero-row samples, reports aggregate count only, and recovers when rows return", () => {
    const healthy = [{ organizationId: "org-a", isActive: true, memberRowCount: 1 }];
    const dark = [{ organizationId: "org-a", isActive: true, memberRowCount: 0 }];
    expect(observeTenantIsolationCanary(canary(healthy), 0).status).toBe("priming");
    expect(observeTenantIsolationCanary(canary(dark), 300_000).status).toBe("ok");
    expect(observeTenantIsolationCanary(canary(dark), 600_000)).toEqual({
      status: "critical",
      affectedOrganizations: 1,
    });
    expect(observeTenantIsolationCanary(canary(healthy), 900_000)).toEqual({ status: "ok", affectedOrganizations: 0 });
  });

  it("detects a previously active organization disappearing but evicts an explicitly inactive one", () => {
    const healthy = [{ organizationId: "org-a", isActive: true, memberRowCount: 1 }];
    observeTenantIsolationCanary(canary(healthy), 0);
    expect(observeTenantIsolationCanary(canary([]), 300_000).status).toBe("ok");
    expect(observeTenantIsolationCanary(canary([]), 600_000)).toEqual({ status: "critical", affectedOrganizations: 1 });

    resetTenantIsolationCriticalHealthForTest();
    observeTenantIsolationCanary(canary(healthy), 0);
    const inactive = [{ organizationId: "org-a", isActive: false, memberRowCount: 1 }];
    expect(observeTenantIsolationCanary(canary(inactive), 300_000).status).toBe("ok");
    expect(observeTenantIsolationCanary(canary(inactive), 600_000).status).toBe("ok");
  });

  it("debounces a failed or truncated bounded read", () => {
    expect(observeTenantIsolationCanary(null, 0).status).toBe("degraded");
    expect(observeTenantIsolationCanary(null, 300_000).status).toBe("unavailable");
    resetTenantIsolationCriticalHealthForTest();
    const truncated = { organizations: [], truncated: true };
    expect(observeTenantIsolationCanary(truncated, 0).status).toBe("degraded");
    expect(observeTenantIsolationCanary(truncated, 300_000).status).toBe("unavailable");

    resetTenantIsolationCriticalHealthForTest();
    const oversized = canary(Array.from(
      { length: TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS + 1 },
      (_, index) => ({ organizationId: `org-${index}`, isActive: true, memberRowCount: 1 }),
    ));
    expect(observeTenantIsolationCanary(oversized, 0).status).toBe("degraded");
    expect(observeTenantIsolationCanary(oversized, 300_000).status).toBe("unavailable");
  });

  it("does not count concurrent duplicate observations as separate five-minute samples", () => {
    const healthy = [{ organizationId: "org-a", isActive: true, memberRowCount: 1 }];
    const dark = [{ organizationId: "org-a", isActive: true, memberRowCount: 0 }];
    observeTenantIsolationCanary(canary(healthy), 0);
    expect(observeTenantIsolationCanary(canary(dark), 300_000).status).toBe("ok");
    expect(observeTenantIsolationCanary(canary(dark), 300_001).status).toBe("ok");
    expect(observeTenantIsolationCanary(canary(dark), 600_000).status).toBe("critical");
  });

  it("keeps unsupported-client telemetry outside the tenant-isolation health path", () => {
    const sources = [
      readFileSync(new URL("./tenantIsolationCriticalHealth.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../app-layer/health/collectCriticalHealthSignals.ts", import.meta.url), "utf8"),
      readFileSync(new URL("./criticalHealthSignals.ts", import.meta.url), "utf8"),
    ].join("\n");
    expect(sources).not.toMatch(/unsupported[_-]?client/i);
  });
});
