import { describe, expect, it, vi } from "vitest";
import {
  emptySaasIsolationTrend,
  type SaasIsolationHealthPayload,
} from "./saasIsolationDiagnostics";
import {
  runSaasIsolationTestScenarios,
  type SaasIsolationTestScenarioState,
} from "./saasIsolationTestScenarioRunner";

function health(state: Exclude<SaasIsolationTestScenarioState, "clean">): SaasIsolationHealthPayload {
  return {
    schemaVersion: 3,
    status: state,
    statusReasons: state === "incomplete"
      ? ["coverage_services_missing"]
      : state === "critical"
        ? ["active_unexplained_event"]
        : [],
    active: state === "critical"
      ? { unexplained: 1, explained: 0, occurrences: 1 }
      : { unexplained: 0, explained: 0, occurrences: 0 },
    resolved: { unexplained: 0, explained: 0, occurrences: 0 },
    byClass: {},
    events: [],
    lastEventAt: null,
    lastCoverage: null,
    coverageFresh: state === "okay",
    coverageComplete: state !== "incomplete",
    missingServices: state === "incomplete" ? ["integrator"] : [],
    trend: emptySaasIsolationTrend(Date.parse("2026-07-16T00:00:00.000Z")),
  };
}

function fixture() {
  let state: SaasIsolationTestScenarioState = "clean";
  const apply = vi.fn(async (next: SaasIsolationTestScenarioState) => { state = next; });
  return {
    apply,
    readHealth: vi.fn(async () => health(state === "clean" ? "okay" : state)),
    readFixtureCounts: vi.fn(async () => ({
      eventRows: state === "critical" ? 1 : 0,
      hourlyRows: state === "critical" ? 1 : 0,
      coverageRows: state === "clean" ? 0 : 1,
    })),
  };
}

describe("E1 reversible TEST scenario runner", () => {
  it("checks okay, incomplete and critical, then cleans reserved rows", async () => {
    const deps = fixture();
    await expect(runSaasIsolationTestScenarios(deps)).resolves.toBeUndefined();
    expect(deps.apply.mock.calls.map(([state]) => state)).toEqual([
      "clean", "okay", "incomplete", "critical", "clean",
    ]);
    expect(await deps.readFixtureCounts()).toEqual({ eventRows: 0, hourlyRows: 0, coverageRows: 0 });
  });

  it("cleans reserved rows in finally after an injected failure", async () => {
    const deps = fixture();
    await expect(runSaasIsolationTestScenarios(deps, { injectFailureAfter: "incomplete" }))
      .rejects.toThrow("saas_isolation_test_scenario_injected_failure:incomplete");
    expect(deps.apply.mock.calls.map(([state]) => state)).toEqual([
      "clean", "okay", "incomplete", "clean",
    ]);
    expect(await deps.readFixtureCounts()).toEqual({ eventRows: 0, hourlyRows: 0, coverageRows: 0 });
  });

  it("fails closed when cleanup leaves any reserved row", async () => {
    const deps = fixture();
    deps.readFixtureCounts.mockResolvedValue({ eventRows: 1, hourlyRows: 0, coverageRows: 0 });
    await expect(runSaasIsolationTestScenarios(deps))
      .rejects.toThrow("saas_isolation_test_scenario_cleanup_failed");
  });
});
