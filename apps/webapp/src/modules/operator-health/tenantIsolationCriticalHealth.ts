import type {
  SaasIsolationHealthPayload,
  SaasIsolationHealthStatus,
} from "./saasIsolationDiagnostics";
import {
  TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS,
  type TenantIsolationCanarySnapshot,
} from "./ports";

const REQUIRED_CONSECUTIVE_SAMPLES = 2;
const MIN_SAMPLE_INTERVAL_MS = 4 * 60_000;

type IsolationRoutingCounters = {
  missingPrincipalSelections: number;
  poolRoleMismatches: number;
};

export type TenantIsolationRuntimeSignal = {
  critical: boolean;
  missingPrincipalDelta: number;
  poolRoleMismatchDelta: number;
};

export type TenantIsolationDiagnosticsSignal = {
  status: SaasIsolationHealthStatus | "degraded" | "unavailable";
  activeUnexplainedEvents: number;
};

export type TenantIsolationWentDarkSignal = {
  status: "priming" | "ok" | "critical" | "degraded" | "unavailable";
  affectedOrganizations: number;
};

export type TenantIsolationCriticalHealthSignal = {
  runtime: TenantIsolationRuntimeSignal;
  diagnostics: TenantIsolationDiagnosticsSignal;
  wentDark: TenantIsolationWentDarkSignal;
};

type TrackedOrganization = {
  active: boolean;
  hasHadMemberRows: boolean;
};

let previousRoutingCounters: IsolationRoutingCounters | null = null;
let runtimeCritical = false;
let runtimeCleanSamples = 0;
let lastRuntimeObservedAt: number | null = null;
let lastRuntimeSignal: TenantIsolationRuntimeSignal = {
  critical: false,
  missingPrincipalDelta: 0,
  poolRoleMismatchDelta: 0,
};
let diagnosticsFailureSamples = 0;
let lastDiagnosticsObservedAt: number | null = null;
let lastDiagnosticsSignal: TenantIsolationDiagnosticsSignal = {
  status: "degraded",
  activeUnexplainedEvents: 0,
};
let canaryFailureSamples = 0;
let lastCanaryObservedAt: number | null = null;
let lastCanarySignal: TenantIsolationWentDarkSignal = {
  status: "degraded",
  affectedOrganizations: 0,
};
let canaryPrimed = false;
let hadActiveOrganizations = false;
let activeOrganizationsZeroSamples = 0;
let lastPositiveActiveOrganizationCount = 0;
const trackedOrganizations = new Map<string, TrackedOrganization>();
const organizationZeroSamples = new Map<string, number>();

function nonNegativeDelta(current: number, previous: number | undefined): number {
  if (previous === undefined || current < previous) return current;
  return current - previous;
}

function isDuplicateSample(lastObservedAt: number | null, nowMs: number): boolean {
  return lastObservedAt !== null && nowMs - lastObservedAt < MIN_SAMPLE_INTERVAL_MS;
}

export function observeTenantIsolationRuntimeCounters(
  metrics: IsolationRoutingCounters | undefined,
  nowMs = Date.now(),
): TenantIsolationRuntimeSignal {
  if (isDuplicateSample(lastRuntimeObservedAt, nowMs)) return lastRuntimeSignal;
  lastRuntimeObservedAt = nowMs;
  if (!metrics) {
    lastRuntimeSignal = {
      critical: runtimeCritical,
      missingPrincipalDelta: 0,
      poolRoleMismatchDelta: 0,
    };
    return lastRuntimeSignal;
  }

  const missingPrincipalDelta = nonNegativeDelta(
    metrics.missingPrincipalSelections,
    previousRoutingCounters?.missingPrincipalSelections,
  );
  const poolRoleMismatchDelta = nonNegativeDelta(
    metrics.poolRoleMismatches,
    previousRoutingCounters?.poolRoleMismatches,
  );
  previousRoutingCounters = {
    missingPrincipalSelections: metrics.missingPrincipalSelections,
    poolRoleMismatches: metrics.poolRoleMismatches,
  };

  if (missingPrincipalDelta > 0 || poolRoleMismatchDelta > 0) {
    runtimeCritical = true;
    runtimeCleanSamples = 0;
  } else if (runtimeCritical) {
    runtimeCleanSamples += 1;
    if (runtimeCleanSamples >= REQUIRED_CONSECUTIVE_SAMPLES) {
      runtimeCritical = false;
      runtimeCleanSamples = 0;
    }
  }

  lastRuntimeSignal = { critical: runtimeCritical, missingPrincipalDelta, poolRoleMismatchDelta };
  return lastRuntimeSignal;
}

export function observeTenantIsolationDiagnostics(
  health: SaasIsolationHealthPayload | null,
  nowMs = Date.now(),
): TenantIsolationDiagnosticsSignal {
  if (isDuplicateSample(lastDiagnosticsObservedAt, nowMs)) return lastDiagnosticsSignal;
  lastDiagnosticsObservedAt = nowMs;
  if (health) {
    diagnosticsFailureSamples = 0;
    lastDiagnosticsSignal = {
      status: health.status,
      activeUnexplainedEvents: health.active.unexplained,
    };
    return lastDiagnosticsSignal;
  }

  diagnosticsFailureSamples += 1;
  lastDiagnosticsSignal = {
    status: diagnosticsFailureSamples >= REQUIRED_CONSECUTIVE_SAMPLES ? "unavailable" : "degraded",
    activeUnexplainedEvents: 0,
  };
  return lastDiagnosticsSignal;
}

function observeCanaryFailure(): TenantIsolationWentDarkSignal {
  canaryFailureSamples += 1;
  lastCanarySignal = {
    status: canaryFailureSamples >= REQUIRED_CONSECUTIVE_SAMPLES ? "unavailable" : "degraded",
    affectedOrganizations: 0,
  };
  return lastCanarySignal;
}

export function observeTenantIsolationCanary(
  snapshot: TenantIsolationCanarySnapshot | null,
  nowMs = Date.now(),
): TenantIsolationWentDarkSignal {
  if (isDuplicateSample(lastCanaryObservedAt, nowMs)) return lastCanarySignal;
  lastCanaryObservedAt = nowMs;
  if (
    !snapshot
    || snapshot.truncated
    || snapshot.organizations.length > TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS
  ) return observeCanaryFailure();
  canaryFailureSamples = 0;

  const current = new Map(snapshot.organizations.map((row) => [row.organizationId, row]));
  const currentActiveCount = snapshot.organizations.filter((row) => row.isActive).length;

  if (!canaryPrimed) {
    canaryPrimed = true;
    hadActiveOrganizations = currentActiveCount > 0;
    lastPositiveActiveOrganizationCount = currentActiveCount;
    for (const row of snapshot.organizations) {
      if (!row.isActive) continue;
      trackedOrganizations.set(row.organizationId, {
        active: true,
        hasHadMemberRows: row.memberRowCount > 0,
      });
    }
    lastCanarySignal = { status: "priming", affectedOrganizations: 0 };
    return lastCanarySignal;
  }

  const missingPreviouslyActiveOrganizations = [...trackedOrganizations.keys()].filter(
    (organizationId) => !current.has(organizationId),
  ).length;
  if (currentActiveCount > 0) {
    hadActiveOrganizations = true;
    lastPositiveActiveOrganizationCount = currentActiveCount;
    activeOrganizationsZeroSamples = 0;
  } else if (hadActiveOrganizations && missingPreviouslyActiveOrganizations > 0) {
    activeOrganizationsZeroSamples += 1;
  } else {
    activeOrganizationsZeroSamples = 0;
  }

  for (const [organizationId, tracked] of trackedOrganizations) {
    if (!tracked.active) continue;
    const row = current.get(organizationId);
    if (row?.isActive === false) {
      trackedOrganizations.delete(organizationId);
      organizationZeroSamples.delete(organizationId);
      continue;
    }
    const wentDark = !row || (tracked.hasHadMemberRows && row.memberRowCount === 0);
    if (wentDark) {
      organizationZeroSamples.set(organizationId, (organizationZeroSamples.get(organizationId) ?? 0) + 1);
    } else {
      organizationZeroSamples.delete(organizationId);
      if (row && row.memberRowCount > 0) tracked.hasHadMemberRows = true;
    }
  }

  for (const row of snapshot.organizations) {
    if (!row.isActive) {
      trackedOrganizations.delete(row.organizationId);
      organizationZeroSamples.delete(row.organizationId);
      continue;
    }
    const tracked = trackedOrganizations.get(row.organizationId);
    if (!tracked) {
      // Retain the previous bounded cohort until it either recovers or is
      // explicitly inactive. This keeps in-flight went-dark evidence while
      // refusing unbounded growth under organization churn.
      if (trackedOrganizations.size >= TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS) continue;
      trackedOrganizations.set(row.organizationId, {
        active: row.isActive,
        hasHadMemberRows: row.memberRowCount > 0,
      });
      continue;
    }
    tracked.active = row.isActive;
    if (row.memberRowCount > 0) tracked.hasHadMemberRows = true;
  }

  const affectedOrganizations = [...organizationZeroSamples.values()].filter(
    (samples) => samples >= REQUIRED_CONSECUTIVE_SAMPLES,
  ).length;
  const globalWentDark = activeOrganizationsZeroSamples >= REQUIRED_CONSECUTIVE_SAMPLES;
  lastCanarySignal = {
    status: globalWentDark || affectedOrganizations > 0 ? "critical" : "ok",
    affectedOrganizations: globalWentDark
      ? Math.max(affectedOrganizations, lastPositiveActiveOrganizationCount)
      : affectedOrganizations,
  };
  return lastCanarySignal;
}

export function getTenantIsolationCriticalHealthStateForTest(): {
  trackedOrganizations: number;
  organizationZeroSamples: number;
} {
  return {
    trackedOrganizations: trackedOrganizations.size,
    organizationZeroSamples: organizationZeroSamples.size,
  };
}

export function resetTenantIsolationCriticalHealthForTest(): void {
  previousRoutingCounters = null;
  runtimeCritical = false;
  runtimeCleanSamples = 0;
  lastRuntimeObservedAt = null;
  lastRuntimeSignal = { critical: false, missingPrincipalDelta: 0, poolRoleMismatchDelta: 0 };
  diagnosticsFailureSamples = 0;
  lastDiagnosticsObservedAt = null;
  lastDiagnosticsSignal = { status: "degraded", activeUnexplainedEvents: 0 };
  canaryFailureSamples = 0;
  lastCanaryObservedAt = null;
  lastCanarySignal = { status: "degraded", affectedOrganizations: 0 };
  canaryPrimed = false;
  hadActiveOrganizations = false;
  activeOrganizationsZeroSamples = 0;
  lastPositiveActiveOrganizationCount = 0;
  trackedOrganizations.clear();
  organizationZeroSamples.clear();
}
